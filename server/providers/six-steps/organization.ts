import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { organizationSchema } from './contracts.js';
import { published } from './service.js';
import { fail } from './errors.js';

/** Adapter boundary: a trusted importer publishes the source version; historical snapshots never re-resolve HR. */
export async function snapshotParticipants(
  tx: DatabaseConnection,
  organizationVersionId: string,
  authorId: string,
  authenticatedSubmitterId: string,
) {
  const org = organizationSchema.parse(
    (await published(tx, organizationVersionId, 'organizations')).payload,
  );
  const author = org.people.find((p) => p.userId === authorId);
  if (!author) fail('ORGANIZATION_NOT_READY');
  const ids = [
    ...new Set([
      authorId,
      authenticatedSubmitterId,
      ...(author.managerId ? [author.managerId] : []),
    ]),
  ];
  const users = await tx
    .repository('user')
    .findMany({ filter: (f) => f.or(ids.map((id) => f.string('id').eq(id))) });
  if (
    users.length !== ids.length ||
    users.some((u) => u.disabledAt || u.deletedAt)
  )
    fail('PARTICIPANT_INACTIVE');
  const snapshot = {
    author,
    submitter: users.find((u) => u.id === authenticatedSubmitterId)!.name,
    reviewerId: author.managerId,
    reviewerMissing: author.managerId === null,
    source: org.source,
    sourceVersion: org.sourceVersion,
  };
  const { record } = await tx.repository('sixStepSnapshots').createOne({
    values: {
      id: randomUUID(),
      organizationVersionId,
      authorId,
      submitterId: authenticatedSubmitterId,
      snapshot,
      createdAt: new Date(),
    },
  });
  return record;
}
export function assertNoConflict(
  actorId: string,
  participants: readonly string[],
  priorReviewers: readonly string[] = [],
): void {
  if (participants.includes(actorId) || priorReviewers.includes(actorId))
    fail('CONFLICT_OF_INTEREST');
}
/** Business action grant is checked separately by the caller; this is the immutable record-relationship boundary. */
export function materialVisible(
  userId: string,
  relation: {
    active: boolean;
    participants: readonly string[];
    reviewerId: string | null;
    expertIds: readonly string[];
  },
  admin: boolean,
): boolean {
  return (
    relation.active &&
    (admin ||
      relation.participants.includes(userId) ||
      relation.reviewerId === userId ||
      relation.expertIds.includes(userId))
  );
}
