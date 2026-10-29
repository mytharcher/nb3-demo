import { randomUUID } from 'node:crypto';
import { readJSON } from '../helpers/six-steps-response.js';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  recordNotificationEvent,
  dispatchNotification,
  queryDelivery,
} from '../../server/providers/six-steps/notifications.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    notification: { channels: { fixtureInbox: { type: 'in-app' } } },
  },
});
test('M12 uses real in-app delivery, deduplicates participants, correlates receipts and does not claim reading', async ({
  app,
  testApp,
  connection,
}) => {
  const userId = (
    await connection.repository('user').findMany({ limit: 1 })
  )[0]!.id as string;
  const service = app.container.resolve(notificationServiceToken);
  const id = randomUUID();
  await connection.transaction((tx) =>
    recordNotificationEvent(tx, {
      id,
      aggregateId: 'fixture-only',
      action: 'fixture',
      recipients: [userId, userId],
    }),
  );
  const message = {
    title: 'Synthetic delivery fixture',
    body: 'Synthetic message only',
    path: '/rules',
  };
  await dispatchNotification(connection, service, id, 'fixtureInbox', message);
  await dispatchNotification(connection, service, id, 'fixtureInbox', message);
  await vi.waitFor(
    async () =>
      expect((await queryDelivery(service, id))!.summary.accepted).toBe(1),
    { timeout: 5000 },
  );
  const snapshot = await queryDelivery(service, id);
  expect(snapshot!.deliveries).toHaveLength(1);
  expect(
    (await connection
      .repository('sixStepNotificationEvents')
      .findOne({ filter: { id } }))!.notificationId,
  ).toBe(snapshot!.notificationId);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const inbox = await admin.fetch('/notificationInApp/messages?pageSize=10');
  expect(inbox.status).toBe(200);
  const data = (await readJSON<{ data: { title: string }[] }>(inbox)).data;
  expect(data.filter((item) => item.title === message.title)).toHaveLength(1);
  const unavailableId = randomUUID();
  await connection.transaction((tx) =>
    recordNotificationEvent(tx, {
      id: unavailableId,
      aggregateId: 'fixture-only',
      action: 'unconfigured',
      recipients: [userId],
    }),
  );
  await expect(
    dispatchNotification(
      connection,
      service,
      unavailableId,
      'absentChannel',
      message,
    ),
  ).rejects.toThrow();
  expect(await queryDelivery(service, unavailableId)).toBeUndefined();
});
