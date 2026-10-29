import { randomUUID } from 'node:crypto';
import { readJSON } from '../helpers/six-steps-response.js';
import type { VersionView } from '../../shared/six-steps/contracts.js';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  apiDocsToken,
  findUndeclaredApiRoutes,
  findApiDocumentSchemaProblems,
} from '@nocobase/app-server/router';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  FoundationService,
  reference,
} from '../../server/providers/six-steps/service.js';
import { sixStepsRuntimeToken } from '../../server/providers/six-steps/lifecycle.js';
import { snapshotParticipants } from '../../server/providers/six-steps/organization.js';
import {
  validateUpload,
  storeUpload,
  scanFile,
} from '../../server/providers/six-steps/files.js';
import { recordNotificationEvent } from '../../server/providers/six-steps/notifications.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});
const operation = () => `${Date.now()}.${randomUUID()}`;
const request = (body: unknown, key = operation()): RequestInit => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': key,
  },
  body: JSON.stringify(body),
});
// All approval evidence and source data in this suite are synthetic; they are never installed as production seeds.
const evidence = {
  source: 'synthetic-test-approval',
  approvedBy: 'fixture-owner',
  approvedAt: '2026-01-01T00:00:00Z',
  decisions: ['DEC-01', 'DEC-03', 'DEC-04', 'DEC-05', 'DEC-11'],
};
const policy = {
  extensions: ['pptx'],
  maxBytes: 1024,
  scanRequired: true,
  evidence,
};

test('M01/M02 API authenticates, documents, protects receipts and supports explicit revocable roles', async ({
  app,
  testApp,
  connection,
}) => {
  expect((await testApp.request('/sixSteps/filePolicies')).status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const account = {
    username: 'sixstepsmember',
    name: 'Synthetic member',
    email: 'sixsteps@example.test',
    password: 'Synthetic-test-123!',
    roleScopes: { app: [] },
  };
  const created = await admin.fetch('/users', request(account));
  expect(created.status).toBe(201);
  const userId = (await readJSON<{ data: { id: string } }>(created)).data.id;
  const member = await signIn(testApp, {
    username: account.username,
    password: account.password,
  });
  expect((await member.fetch('/sixSteps/filePolicies')).status).toBe(403);
  expect((await member.fetch('/sixSteps/files', request({}))).status).toBe(403);
  const authz = app.container.resolve(authorizationToken);
  await authz.permissionSets.create({
    key: 'sixStepsTestManager',
    grants: [
      {
        resource: { type: 'settings', id: 'sixSteps.filePolicies' },
        actions: [
          { action: 'read' },
          { action: 'create' },
          { action: 'publish' },
        ],
      },
    ],
  });
  const assignment = {
    subject: { type: 'user', id: userId },
    managedPermissionSets: ['sixStepsTestManager'],
    permissionSets: ['sixStepsTestManager'],
  };
  await authz.permissionSets.replaceSubjectAssignments(assignment);
  const input = {
    key: 'fixture-policy',
    title: 'Synthetic policy',
    payload: policy,
  };
  const init = request(input);
  const first = await member.fetch('/sixSteps/filePolicies', init);
  expect(first.status).toBe(200);
  const saved = await readJSON<{ data: VersionView }>(first);
  const replay = await member.fetch('/sixSteps/filePolicies', init);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(saved);
  expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
  const changed = await member.fetch(
    '/sixSteps/filePolicies',
    request(
      { ...input, title: 'Changed' },
      (init.headers as Record<string, string>)['Idempotency-Key'],
    ),
  );
  expect(changed.status).toBe(409);
  const view = await readJSON<{ data: { headVersion: number } }>(
    await member.fetch(`/sixSteps/filePolicies/${saved.data.id}`),
  );
  const publish = request({
    expectedVersion: saved.data.version,
    expectedHeadVersion: view.data.headVersion,
    reason: 'Synthetic publication',
  });
  const publication = await member.fetch(
    `/sixSteps/filePolicies/${saved.data.id}/publish`,
    publish,
  );
  expect(publication.status).toBe(200);
  expect((await readJSON<{ data: VersionView }>(publication)).data.state).toBe(
    'published',
  );
  expect(
    (
      await member.fetch(
        `/sixSteps/filePolicies/${saved.data.id}/publish`,
        publish,
      )
    ).status,
  ).toBe(200);
  expect(
    await connection
      .repository('sixStepAudit')
      .count({ filter: { aggregateId: saved.data.id } }),
  ).toBe(2);
  await authz.permissionSets.replaceSubjectAssignments({
    ...assignment,
    permissionSets: [],
  });
  expect((await member.fetch('/sixSteps/filePolicies', init)).status).toBe(403);
  expect(
    (await member.fetch(`/sixSteps/filePolicies/${saved.data.id}`)).status,
  ).toBe(403);
  const unapproved = await admin.fetch(
    '/sixSteps/filePolicies',
    request({
      ...input,
      key: 'no-approval',
      payload: { ...policy, evidence: null },
    }),
  );
  expect(unapproved.status).toBe(200);
  const draft = (await readJSON<{ data: VersionView }>(unapproved)).data;
  const deniedPublish = await admin.fetch(
    `/sixSteps/filePolicies/${draft.id}/publish`,
    request({
      expectedVersion: draft.version,
      expectedHeadVersion: 0,
      reason: 'Cannot approve',
    }),
  );
  expect(deniedPublish.status).toBe(400);
  expect(
    (await readJSON<{ error: { reason: string } }>(deniedPublish)).error.reason,
  ).toBe('DECISION_REQUIRED');
  expect(findUndeclaredApiRoutes(app)).toEqual([]);
  const document = await app.container.resolve(apiDocsToken).getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(
    document.paths?.['/api/sixSteps/{kind}/{id}/publish']?.post?.operationId,
  ).toBe('sixStepsPublishVersion');
});

test('M04 grants consume atomically, roll back, reject stale changes and preserve immutable references', async ({
  app,
  connection,
}) => {
  const runtime = app.container.resolve(sixStepsRuntimeToken);
  const service = new FoundationService(connection, runtime);
  const createPublished = async (
    kind: 'calendars' | 'periods',
    key: string,
    payload: unknown,
  ) =>
    connection.transaction(async (tx) => {
      const draft = await service.create(
        tx,
        kind,
        { key, title: key, payload: payload as never },
        'fixture',
      );
      await service.publish(
        tx,
        kind,
        String(draft.id),
        {
          expectedVersion: Number(draft.version),
          expectedHeadVersion: 0,
          reason: 'Synthetic fixture',
        },
        'fixture',
      );
      return String(draft.id);
    });
  const calendarId = await createPublished('calendars', 'synthetic-calendar', {
    timezone: 'Etc/UTC',
    start: '2026-10-01',
    end: '2026-10-02',
    days: [
      { date: '2026-10-01', working: true, reason: 'fixture' },
      { date: '2026-10-02', working: false, reason: 'fixture holiday' },
    ],
    evidence,
  });
  const periodId = await createPublished('periods', 'synthetic-period', {
    type: 'annual',
    label: '2026',
    timezone: 'Etc/UTC',
    opensAt: '2026-10-01T00:00:00Z',
    closesAt: '2026-10-02T23:59:59Z',
    calendarVersionId: calendarId,
    evidence,
  });
  const admin = (await connection.repository('user').findMany({ limit: 1 }))[0];
  expect(admin).toBeTruthy();
  const grant = await connection.transaction((tx) =>
    service.createGrant(
      tx,
      {
        periodVersionId: periodId,
        userId: String(admin!.id),
        purpose: 'lateSubmission',
        targetId: null,
        validFrom: '2026-10-01T00:00:00Z',
        validUntil: '2026-10-03T00:00:00Z',
        uses: 1,
        reason: 'Synthetic grant',
        evidence,
      },
      'fixture',
    ),
  );
  const command = {
    grantId: String(grant.id),
    periodVersionId: periodId,
    userId: String(admin!.id),
    purpose: 'lateSubmission' as const,
    targetId: null,
    commandId: 'fixture-submission',
  };
  await expect(
    connection.transaction(async (tx) => {
      await service.consume(tx, command, new Date('2026-10-02T12:00:00Z'));
      throw new Error('submission rollback');
    }),
  ).rejects.toThrow('submission rollback');
  expect(await connection.repository('sixStepGrantUses').count()).toBe(0);
  expect(
    (await connection
      .repository('sixStepGrants')
      .findOne({ filter: { id: String(grant.id) } }))!.remaining,
  ).toBe(1);
  const outcomes = await Promise.allSettled(
    [1, 2].map((n) =>
      connection.transaction((tx) =>
        service.consume(
          tx,
          { ...command, commandId: `command-${n}` },
          new Date('2026-10-02T12:00:00Z'),
        ),
      ),
    ),
  );
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await connection.repository('sixStepGrantUses').count()).toBe(1);
  await expect(
    connection.transaction((tx) =>
      service.revokeGrant(tx, String(grant.id), 1, 'stale', 'fixture'),
    ),
  ).rejects.toThrow('VERSION_CONFLICT');
  await expect(
    connection.transaction((tx) =>
      service.requireOpen(tx, periodId, new Date('2026-10-03T00:00:00Z')),
    ),
  ).rejects.toThrow('PERIOD_CLOSED');
  await connection.transaction((tx) =>
    reference(tx, periodId, 'periods', 'synthetic-submission', 's1'),
  );
  await expect(
    connection.transaction((tx) =>
      service.publish(
        tx,
        'periods',
        periodId,
        { expectedVersion: 1, expectedHeadVersion: 1, reason: 'overwrite' },
        'fixture',
      ),
    ),
  ).rejects.toThrow('VERSION_IMMUTABLE');
  expect(
    await connection.repository('sixStepTransitions').count({
      filter: (f) =>
        f.or([
          f.string('recordId').eq(periodId),
          f.string('recordId').eq(calendarId),
        ]),
    }),
  ).toBe(4);
});

test('M03 quarantines uploads, requires scanner evidence, streams only safe files, and rejects digest substitution', async ({
  app,
  testApp,
  connection,
}) => {
  const service = new FoundationService(
    connection,
    app.container.resolve(sixStepsRuntimeToken),
  );
  const draft = await connection.transaction((tx) =>
    service.create(
      tx,
      'filePolicies',
      { key: 'file-fixture', title: 'Fixture', payload: policy },
      'fixture',
    ),
  );
  await connection.transaction((tx) =>
    service.publish(
      tx,
      'filePolicies',
      String(draft.id),
      {
        expectedVersion: Number(draft.version),
        expectedHeadVersion: 0,
        reason: 'fixture',
      },
      'fixture',
    ),
  );
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const file = new File(['synthetic file bytes'], 'fixture.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const sha256 = await validateUpload(connection, String(draft.id), file);
  const saved = await connection.transaction((tx) =>
    storeUpload(
      tx,
      app.container.resolve(serverFileRepositoryManagerToken),
      String(draft.id),
      file,
      'fixture',
      sha256,
    ),
  );
  const path = `http://localhost${testApp.publicBasePath}/sixStepContent/${saved.fileId}.pptx`;
  expect((await testApp.request(path)).status).toBe(401);
  expect((await admin.fetch(path)).status).toBe(400);
  const scanner = {
    name: 'test-double-only',
    scan: async () => ({
      verdict: 'clean' as const,
      evidence: 'synthetic scan result',
    }),
  };
  await expect(
    scanFile(connection, String(saved.id), file, {
      name: 'test-unavailable',
      scan: async () => {
        throw new Error('unavailable');
      },
    }),
  ).rejects.toThrow('SCAN_FAILED');
  expect(
    (await connection
      .repository('sixStepFileVersions')
      .findOne({ filter: { id: String(saved.id) } }))!.scanState,
  ).toBe('failed');
  expect((await admin.fetch(path)).status).toBe(400);
  await expect(
    scanFile(
      connection,
      String(saved.id),
      new File(['different'], 'fixture.pptx'),
      scanner,
    ),
  ).rejects.toThrow('FILE_DIGEST_MISMATCH');
  await scanFile(connection, String(saved.id), file, scanner);
  const content = await admin.fetch(path);
  expect(content.status).toBe(200);
  expect(await content.text()).toBe('synthetic file bytes');
  const template = await connection.transaction(async (tx) => {
    const version = await service.create(
      tx,
      'templates',
      {
        key: 'template-reader',
        title: 'Synthetic only',
        payload: {
          fileVersionId: String(saved.id),
          effectiveFrom: '2026-01-01T00:00:00Z',
          evidence,
        },
      },
      'fixture',
    );
    await service.publish(
      tx,
      'templates',
      String(version.id),
      {
        expectedVersion: Number(version.version),
        expectedHeadVersion: 0,
        reason: 'Fixture',
      },
      'fixture',
    );
    return version;
  });
  const userResponse = await admin.fetch(
    '/users',
    request({
      username: 'templatereader',
      name: 'Synthetic template reader',
      email: 'template@example.test',
      password: 'Synthetic-Test-123!',
      roleScopes: { app: [] },
    }),
  );
  expect(userResponse.status).toBe(201);
  const readerId = (await readJSON<{ data: { id: string } }>(userResponse)).data
    .id;
  const authz = app.container.resolve(authorizationToken);
  await authz.permissionSets.create({
    key: 'templateOnlyFixture',
    grants: [
      {
        resource: { type: 'settings', id: 'sixSteps.templates' },
        actions: [{ action: 'read' }],
      },
    ],
  });
  await authz.permissionSets.replaceSubjectAssignments({
    subject: { type: 'user', id: readerId },
    managedPermissionSets: ['templateOnlyFixture'],
    permissionSets: ['templateOnlyFixture'],
  });
  const reader = await signIn(testApp, {
    username: 'templatereader',
    password: 'Synthetic-Test-123!',
  });
  expect((await reader.fetch('/sixSteps/files')).status).toBe(403);
  expect(
    (await reader.fetch(`/sixSteps/templates/${template.id}/file`)).status,
  ).toBe(200);
  expect((await reader.fetch(path)).status).toBe(200);
  await expect(
    validateUpload(
      connection,
      String(draft.id),
      new File(['x'], 'fixture.exe'),
    ),
  ).rejects.toThrow('FILE_POLICY_REJECTED');
  await expect(
    scanFile(connection, String(saved.id), file, scanner),
  ).rejects.toThrow('VERSION_IMMUTABLE');
});

test('M02 immutable organization snapshots retain source and reviewer missing; M12 deduplicates event recipients', async ({
  app,
  connection,
}) => {
  const service = new FoundationService(
    connection,
    app.container.resolve(sixStepsRuntimeToken),
  );
  const user = (await connection.repository('user').findMany({ limit: 1 }))[0];
  const userId = String(user!.id);
  const draft = await connection.transaction((tx) =>
    service.create(
      tx,
      'organizations',
      {
        key: 'org-fixture',
        title: 'Fixture organization',
        payload: {
          source: 'synthetic',
          sourceVersion: 'v1',
          people: [
            {
              userId,
              name: 'Historical name',
              departmentId: 'test',
              departmentName: 'Historical department',
              managerId: null,
            },
          ],
          evidence,
        },
      },
      'fixture',
    ),
  );
  await connection.transaction((tx) =>
    service.publish(
      tx,
      'organizations',
      String(draft.id),
      {
        expectedVersion: Number(draft.version),
        expectedHeadVersion: 0,
        reason: 'fixture',
      },
      'fixture',
    ),
  );
  const snapshot = await connection.transaction((tx) =>
    snapshotParticipants(tx, String(draft.id), userId, userId),
  );
  expect(snapshot.submitterId).toBe(userId);
  expect(
    (snapshot.snapshot as { reviewerMissing: boolean }).reviewerMissing,
  ).toBe(true);
  const eventId = randomUUID();
  await connection.transaction((tx) =>
    recordNotificationEvent(tx, {
      id: eventId,
      aggregateId: 'fixture',
      action: 'synthetic',
      recipients: [userId, userId],
    }),
  );
  expect(
    (await connection
      .repository('sixStepNotificationEvents')
      .findOne({ filter: { id: eventId } }))!.recipients,
  ).toEqual([userId]);
});
