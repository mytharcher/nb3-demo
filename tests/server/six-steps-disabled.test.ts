import { randomUUID } from 'node:crypto';
import { readJSON } from '../helpers/six-steps-response.js';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { FoundationService } from '../../server/providers/six-steps/service.js';
import { sixStepsRuntimeToken } from '../../server/providers/six-steps/lifecycle.js';
import { snapshotParticipants } from '../../server/providers/six-steps/organization.js';
const request = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});
test('M02 native account disable immediately removes access and blocks new snapshots without rewriting history', async ({
  app,
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const created = await admin.fetch(
    '/users',
    request({
      username: 'sixstepsdisabled',
      name: 'Synthetic',
      email: 'disabled@example.test',
      password: 'Synthetic-Test-123!',
      roleScopes: { app: ['sixStepsAdministrator'] },
    }),
  );
  expect(created.status).toBe(201);
  const id = (await readJSON<{ data: { id: string } }>(created)).data.id;
  const actor = await signIn(testApp, {
    username: 'sixstepsdisabled',
    password: 'Synthetic-Test-123!',
  });
  expect((await actor.fetch('/sixSteps/rules')).status).toBe(200);
  const service = new FoundationService(
    connection,
    app.container.resolve(sixStepsRuntimeToken),
  );
  const draft = await connection.transaction((tx) =>
    service.create(
      tx,
      'organizations',
      {
        key: 'disabled-fixture',
        title: 'Synthetic',
        payload: {
          source: 'Test only',
          sourceVersion: 'v1',
          people: [
            {
              userId: id,
              name: 'Historical',
              departmentId: 'test',
              departmentName: 'Historical department',
              managerId: null,
            },
          ],
          evidence: {
            source: 'Test only',
            approvedBy: 'Fixture',
            approvedAt: '2026-01-01T00:00:00Z',
            decisions: ['DEC-01'],
          },
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
        reason: 'Fixture',
      },
      'fixture',
    ),
  );
  await connection.transaction((tx) =>
    snapshotParticipants(tx, String(draft.id), id, id),
  );
  expect((await admin.fetch(`/users/${id}/disable`, request({}))).status).toBe(
    200,
  );
  expect([401, 403]).toContain((await actor.fetch('/sixSteps/rules')).status);
  await expect(
    connection.transaction((tx) =>
      snapshotParticipants(tx, String(draft.id), id, id),
    ),
  ).rejects.toThrow('PARTICIPANT_INACTIVE');
  expect(
    await connection
      .repository('sixStepSnapshots')
      .count({ filter: { authorId: id } }),
  ).toBe(1);
});
