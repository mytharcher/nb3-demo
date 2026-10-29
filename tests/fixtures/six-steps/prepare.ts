/** Explicitly isolated, synthetic demo. Never import this from application startup or production seeds. */
import { createTestApp } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../../server/standalone.js';
import { FoundationService } from '../../../server/providers/six-steps/service.js';
import { sixStepsRuntimeToken } from '../../../server/providers/six-steps/lifecycle.js';
import {
  storeUpload,
  validateUpload,
  scanFile,
} from '../../../server/providers/six-steps/files.js';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  recordNotificationEvent,
  dispatchNotification,
} from '../../../server/providers/six-steps/notifications.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import type { Kind } from '../../../shared/six-steps/contracts.js';

// The ordinary test runner may clean its provisioned SQLite files between runs. Keep this user-requested demo's
// physical file in a separate owned directory, so running unit tests cannot replace a live demo database.
const demoDirectory = mkdtempSync('/tmp/six-steps-demo-');
const fixture = await createTestApp({
  createServer: createStandaloneServer,
  server: { env: { APP_STORAGE_DIR: path.join(demoDirectory, 'storage') } },
  config: {
    database: {
      connections: {
        main: { filename: path.join(demoDirectory, 'database.sqlite') },
      },
    },
    app: { publicOrigin: 'http://127.0.0.1:13010' },
    auth: { secret: 'isolated-six-steps-test-secret-32-characters' },
    notification: { channels: { fixtureInbox: { type: 'in-app' } } },
    client: { app: { defaultLocale: 'en-US' } },
  },
});
try {
  const admin = await signIn(fixture, DEFAULT_ADMIN_CREDENTIALS);
  const document = (await (await admin.fetch('/swagger')).json()) as {
    paths: Record<string, unknown>;
  };
  if (!document.paths['/api/users']) throw new Error('User API unavailable');
  const users: Record<string, string> = {};
  for (const [username, roles] of [
    ['sixstepsadmin', ['sixStepsAdministrator']],
    ['sixstepsreader', []],
  ] as const) {
    const result = await admin.fetch('/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:13010',
        'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
      },
      body: JSON.stringify({
        username,
        name: `TEST ONLY ${username}`,
        email: `${username}@example.test`,
        password: '12345678',
        roleScopes: { app: roles },
      }),
    });
    if (result.status !== 201)
      throw new Error(`Test user creation failed: ${await result.text()}`);
    users[username] = (
      (await result.json()) as { data: { id: string } }
    ).data.id;
  }
  const connection = fixture.connection;
  const service = new FoundationService(
    connection,
    fixture.application.container.resolve(sixStepsRuntimeToken),
  );
  const evidence = {
    source:
      'TEST ONLY: synthetic approval for an isolated demonstration; not a business decision',
    approvedBy: 'Synthetic fixture owner',
    approvedAt: '2026-01-01T00:00:00Z',
    decisions: ['DEC-01', 'DEC-03', 'DEC-04', 'DEC-05', 'DEC-11'],
  };
  const create = async (
    kind: Kind,
    key: string,
    payload: object,
    publish = true,
  ) =>
    connection.transaction(async (tx) => {
      const draft = await service.create(
        tx,
        kind,
        { key, title: `TEST ONLY ${key}`, payload: payload as never },
        users['sixstepsadmin']!,
      );
      if (publish)
        await service.publish(
          tx,
          kind,
          String(draft.id),
          {
            expectedVersion: Number(draft.version),
            expectedHeadVersion: 0,
            reason: 'Synthetic demonstration only',
          },
          users['sixstepsadmin']!,
        );
      return String(draft.id);
    });
  const days = [];
  for (
    let day = new Date('2026-10-01T12:00:00Z');
    day <= new Date('2026-12-31T12:00:00Z');
    day = new Date(day.getTime() + 86400000)
  )
    days.push({
      date: day.toISOString().slice(0, 10),
      working: day.getUTCDay() !== 0 && day.getUTCDay() !== 6,
      reason: 'Synthetic weekday calendar; not an official holiday source',
    });
  const calendarVersionId = await create('calendars', 'fixture-calendar', {
    timezone: 'Etc/UTC',
    start: '2026-10-01',
    end: '2026-12-31',
    days,
    evidence,
  });
  const periodVersionId = await create('periods', 'fixture-monthly', {
    type: 'monthly',
    label: '2026-10',
    timezone: 'Etc/UTC',
    opensAt: '2026-10-01T00:00:00Z',
    closesAt: '2026-10-31T23:59:59Z',
    calendarVersionId,
    evidence,
  });
  await create('periods', 'fixture-annual', {
    type: 'annual',
    label: '2026',
    timezone: 'Etc/UTC',
    opensAt: '2026-10-01T00:00:00Z',
    closesAt: '2026-12-31T23:59:59Z',
    calendarVersionId,
    evidence,
  });
  await create('rules', 'fixture-rule', {
    scope: 'monthly',
    effectiveFrom: '2026-10-01T00:00:00Z',
    effectiveUntil: '2027-01-01T00:00:00Z',
    precision: 2,
    rounding: 'halfUp',
    total: '100',
    aggregation: 'sumIncludedWeights',
    items: [
      {
        id: 'fixture',
        title: 'Synthetic scoring dimension, not a formal rule',
        max: '100',
        basisRequired: true,
      },
    ],
    evidence,
  });
  await create(
    'rules',
    'fixture-unapproved',
    {
      scope: 'annual',
      effectiveFrom: '2026-10-01T00:00:00Z',
      effectiveUntil: '2027-01-01T00:00:00Z',
      precision: 2,
      rounding: 'halfUp',
      total: '100',
      aggregation: 'sumIncludedWeights',
      items: [
        {
          id: 'fixture',
          title: 'Unapproved test dimension',
          max: '100',
          basisRequired: true,
        },
      ],
      evidence: null,
    },
    false,
  );
  const policyVersionId = await create('filePolicies', 'fixture-policy', {
    extensions: ['pptx'],
    maxBytes: 1048576,
    scanRequired: true,
    evidence,
  });
  await create('organizations', 'fixture-organization', {
    source: 'Isolated synthetic source',
    sourceVersion: 'test-v1',
    people: Object.entries(users).map(([name, userId]) => ({
      userId,
      name: `TEST ONLY ${name}`,
      departmentId: 'fixture-dept',
      departmentName: 'Synthetic department',
      managerId: null,
    })),
    evidence,
  });
  const grant = await connection.transaction((tx) =>
    service.createGrant(
      tx,
      {
        periodVersionId,
        userId: users['sixstepsreader']!,
        purpose: 'lateSubmission',
        targetId: null,
        validFrom: '2026-10-01T00:00:00Z',
        validUntil: '2026-12-31T23:59:59Z',
        uses: 1,
        reason: 'Synthetic grant',
        evidence,
      },
      users['sixstepsadmin']!,
    ),
  );
  const pptxPath = path.join(fixture.config.directory, 'synthetic.pptx');
  execFileSync('zip', ['-q', '-r', pptxPath, '.'], {
    cwd: path.join(import.meta.dirname, 'pptx'),
  });
  const file = new File([await readFile(pptxPath)], 'TEST-ONLY-template.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const sha256 = await validateUpload(connection, policyVersionId, file);
  const uploaded = await connection.transaction((tx) =>
    storeUpload(
      tx,
      fixture.application.container.resolve(serverFileRepositoryManagerToken),
      policyVersionId,
      file,
      users['sixstepsadmin']!,
      sha256,
    ),
  );
  await scanFile(connection, String(uploaded.id), file, {
    name: 'TEST-DOUBLE-NOT-A-REAL-SCANNER',
    scan: async () => ({
      verdict: 'clean',
      evidence: 'Synthetic fixture bytes only; no production safety assertion',
    }),
  });
  await create('templates', 'fixture-template', {
    fileVersionId: uploaded.id,
    effectiveFrom: '2026-10-01T00:00:00Z',
    evidence,
  });
  const eventId = randomUUID();
  await connection.transaction((tx) =>
    recordNotificationEvent(tx, {
      id: eventId,
      aggregateId: 'fixture',
      action: 'fixtureReady',
      recipients: [users['sixstepsadmin']!, users['sixstepsadmin']!],
    }),
  );
  await dispatchNotification(
    connection,
    fixture.application.container.resolve(notificationServiceToken),
    eventId,
    'fixtureInbox',
    {
      title: 'TEST ONLY fixture ready',
      body: 'Synthetic first-phase data are ready.',
      path: '/rules',
    },
  );
  console.log(
    JSON.stringify(
      {
        configPath: fixture.config.path,
        storagePath: path.join(demoDirectory, 'storage'),
        accounts: Object.keys(users),
        password: '12345678',
        users,
        periodVersionId,
        policyVersionId,
        grantId: grant.id,
        note: 'ISOLATED TEST DATA ONLY. No production DEC was approved.',
      },
      null,
      2,
    ),
  );
} finally {
  // Keep the isolated configuration and database so pnpm dev can serve them. A later explicit fixture cleanup can remove this exact temporary directory.
  await fixture.server.close();
}
