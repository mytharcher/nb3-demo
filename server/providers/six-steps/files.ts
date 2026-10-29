import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import { payloadSchemas } from './contracts.js';
import { published, reference, audit } from './service.js';
import { fail } from './errors.js';

export interface SecurityScanner {
  readonly name: string;
  scan(input: {
    file: File;
    sha256: string;
  }): Promise<{ verdict: 'clean' | 'rejected'; evidence: string }>;
}
export async function validateUpload(
  tx: DatabaseConnection,
  policyVersionId: string,
  file: File,
) {
  const policy = payloadSchemas.filePolicies.parse(
    (await published(tx, policyVersionId, 'filePolicies')).payload,
  );
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (
    !ext ||
    !(policy.extensions as string[]).includes(ext) ||
    !file.size ||
    file.size > policy.maxBytes
  )
    fail('FILE_POLICY_REJECTED');
  // A scanner must inspect content; extension/MIME are never considered proof of safety.
  return createHash('sha256')
    .update(Buffer.from(await file.arrayBuffer()))
    .digest('hex');
}
export async function storeUpload(
  tx: DatabaseConnection,
  manager: ServerFileRepositoryManager,
  policyVersionId: string,
  file: File,
  ownerId: string,
  sha256: string,
) {
  const repository = manager.repository('sixStepFiles', {
    disk: 'local',
    accessPath: '/sixStepContent',
    transaction: tx,
    policy: {
      read: true,
      create: { scope: true, defaults: { ownerId } },
      update: false,
      delete: false,
    },
  });
  const { record } = await repository.uploadOne({ file });
  const { record: version } = await tx
    .repository('sixStepFileVersions')
    .createOne({
      values: {
        id: randomUUID(),
        fileId: record.id,
        policyVersionId,
        sha256,
        uploadState: 'complete',
        scanState: 'blocked',
        previewState: 'pending',
        parseState: 'notConfigured',
        scanEvidence: null,
        createdAt: new Date(),
      },
    });
  await reference(
    tx,
    policyVersionId,
    'filePolicies',
    'file',
    version.id as string,
  );
  await audit(
    tx,
    version.id as string,
    'fileUploaded',
    ownerId,
    0,
    1,
    'SCAN_SERVICE_NOT_CONFIGURED',
  );
  return {
    id: version.id,
    fileId: record.id,
    filename: record.filename,
    sha256,
    scanState: 'blocked' as const,
    previewState: 'pending' as const,
    parseState: 'notConfigured' as const,
  };
}
/** Trusted task adapter only. No HTTP endpoint accepts a browser verdict. Fetch immutable bytes and verify digest before scanning. */
export async function scanFile(
  connection: DatabaseConnection,
  versionId: string,
  file: File,
  scanner: SecurityScanner,
) {
  const version = await connection
    .repository('sixStepFileVersions')
    .findOne({ filter: { id: versionId } });
  if (
    !version ||
    version.scanState === 'clean' ||
    version.scanState === 'rejected'
  )
    fail('VERSION_IMMUTABLE');
  const sha256 = createHash('sha256')
    .update(Buffer.from(await file.arrayBuffer()))
    .digest('hex');
  if (sha256 !== version.sha256) fail('FILE_DIGEST_MISMATCH');
  let result: Awaited<ReturnType<SecurityScanner['scan']>>;
  try {
    result = await scanner.scan({ file, sha256 });
  } catch {
    await connection.transaction(async (tx) => {
      const changed = await tx.repository('sixStepFileVersions').updateMany({
        filter: (f) =>
          f.and([
            f.string('id').eq(versionId),
            f.or(
              ['blocked', 'pending', 'failed'].map((state) =>
                f.string('scanState').eq(state),
              ),
            ),
          ]),
        values: {
          scanState: 'failed',
          scanEvidence: `${scanner.name}:service-failure`,
        },
      });
      if (changed.updatedCount === 1)
        await audit(
          tx,
          versionId,
          'fileScanFailed',
          `scanner:${scanner.name}`,
          1,
          1,
          'SCAN_FAILED',
        );
    });
    fail('SCAN_FAILED');
  }
  if (!result.evidence) fail('SCAN_EVIDENCE_REQUIRED');
  await connection.transaction(async (tx) => {
    const changed = await tx.repository('sixStepFileVersions').updateMany({
      filter: (f) =>
        f.and([
          f.string('id').eq(versionId),
          f.or(
            ['blocked', 'pending', 'failed'].map((s) =>
              f.string('scanState').eq(s),
            ),
          ),
        ]),
      values: {
        scanState: result.verdict,
        scanEvidence: `${scanner.name}:${result.evidence}`,
      },
    });
    if (changed.updatedCount !== 1) fail('VERSION_CONFLICT', true);
    await audit(
      tx,
      versionId,
      'fileScanned',
      `scanner:${scanner.name}`,
      1,
      2,
      result.verdict,
    );
  });
}
