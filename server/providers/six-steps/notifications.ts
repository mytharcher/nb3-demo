import type { DatabaseConnection } from '@nocobase/db';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import { fail } from './errors.js';

export async function recordNotificationEvent(
  tx: DatabaseConnection,
  event: {
    id: string;
    aggregateId: string;
    action: string;
    recipients: readonly string[];
  },
): Promise<void> {
  const recipients = [...new Set(event.recipients)].sort();
  if (!recipients.length || recipients.some((id) => !id))
    fail('RECIPIENTS_REQUIRED');
  await tx
    .repository('sixStepNotificationEvents')
    .createOne({ values: { ...event, recipients, createdAt: new Date() } });
}
/** Invoke from a committed durable task. The plugin owns delivery retries and receiver deduplication. */
export async function dispatchNotification(
  connection: DatabaseConnection,
  service: NotificationService,
  eventId: string,
  channel: string,
  message: { title: string; body: string; path: string },
) {
  const event = await connection
    .repository('sixStepNotificationEvents')
    .findOne({ filter: { id: eventId } });
  if (!event) fail('NOTIFICATION_NOT_FOUND');
  const recipients = event.recipients as string[];
  const sent = await service.send({
    idempotencyKey: `sixSteps:${eventId}`,
    source: { type: 'sixSteps', referenceId: eventId },
    messages: {
      [channel]: {
        to: recipients,
        title: message.title,
        body: message.body,
        target: { type: 'route', path: message.path },
      },
    },
  });
  await connection.repository('sixStepNotificationEvents').updateOne({
    filter: { id: eventId },
    values: { notificationId: sent.notificationId },
  });
  const result = await service.getByIdempotencyKey(`sixSteps:${eventId}`);
  if (!result) fail('NOTIFICATION_NOT_READY');
  return result;
}
export async function queryDelivery(
  service: NotificationService,
  eventId: string,
) {
  // Do not infer delivery from queued status. Consumers inspect per-recipient channel outcomes.
  return service.getByIdempotencyKey(`sixSteps:${eventId}`);
}
