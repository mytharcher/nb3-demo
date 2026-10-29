import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { z } from 'zod';
import {
  createVersionSchema,
  payloadSchemas,
  publishSchema,
  grantSchema,
  type Kind,
  type VersionView,
} from './contracts.js';
import { validateRule } from './calculation.js';
import { validateCalendar, localDate } from './calendar.js';
import { fail } from './errors.js';
import type { LifecycleRuntime } from '@nocobase/lifecycle';
import { ApiError } from '@nocobase/app-server/router';

function parsePayload(kind: Kind, value: unknown) {
  const parsed = payloadSchemas[kind].safeParse(value);
  if (!parsed.success)
    throw new ApiError({
      domain: 'sixSteps',
      status: 'INVALID_ARGUMENT',
      reason: 'CONFIGURATION_INVALID',
      message: 'The selected configuration does not match its DTO.',
      fieldViolations: parsed.error.issues.map((issue) => ({
        field: `payload.${issue.path.join('.')}`,
        description: 'Check the required field and its format.',
      })),
    });
  return parsed.data;
}

export async function audit(
  tx: DatabaseConnection,
  aggregateId: string,
  action: string,
  actorId: string,
  fromVersion: number,
  toVersion: number,
  reason: string,
): Promise<void> {
  await tx.repository('sixStepAudit').createOne({
    values: {
      id: randomUUID(),
      aggregateId,
      action,
      actorId,
      fromVersion,
      toVersion,
      reason,
      occurredAt: new Date(),
    },
  });
}
export async function published(
  tx: DatabaseConnection,
  id: string,
  kind: Kind,
): Promise<VersionView> {
  const row = await tx
    .repository('sixStepVersions')
    .findOne({ filter: { id, kind, state: 'published' } });
  if (!row) fail('CONFIGURATION_NOT_READY');
  return row as unknown as VersionView;
}
export async function reference(
  tx: DatabaseConnection,
  versionId: string,
  kind: Kind,
  targetType: string,
  targetId: string,
): Promise<void> {
  await published(tx, versionId, kind);
  await tx.repository('sixStepReferences').upsertOne({
    filter: { versionId, targetType, targetId },
    create: {
      id: randomUUID(),
      versionId,
      targetType,
      targetId,
      createdAt: new Date(),
    },
    update: { targetId },
  });
}
export async function compareAndSet(
  tx: DatabaseConnection,
  table: string,
  id: string,
  version: number,
  values: Record<string, unknown>,
): Promise<void> {
  const result = await tx.repository(table).updateMany({
    filter: { id, version },
    values: { ...values, version: version + 1 },
  });
  if (result.updatedCount !== 1) fail('VERSION_CONFLICT', true);
}
export class FoundationService {
  constructor(
    readonly connection: DatabaseConnection,
    readonly runtime: LifecycleRuntime,
  ) {}
  async create(
    tx: DatabaseConnection,
    kind: Kind,
    input: z.infer<typeof createVersionSchema>,
    actorId: string,
  ) {
    const payload = parsePayload(kind, input.payload);
    const headId = `${kind}:${input.key}`;
    if (
      !(await tx.repository('sixStepHeads').findOne({ filter: { id: headId } }))
    )
      await tx
        .repository('sixStepHeads')
        .createOne({ values: { id: headId, version: 0 } });
    const result = await this.runtime.create(
      'sixStepVersions',
      {
        id: randomUUID(),
        kind,
        key: input.key,
        title: input.title,
        payload,
        createdBy: actorId,
        createdAt: new Date(),
      },
      { actor: { id: actorId }, transaction: tx },
    );
    await audit(
      tx,
      String(result.record.id),
      'versionCreated',
      actorId,
      -1,
      Number(result.record.version),
      '',
    );
    return result.record;
  }
  async publish(
    tx: DatabaseConnection,
    kind: Kind,
    id: string,
    input: z.infer<typeof publishSchema>,
    actorId: string,
  ) {
    const row = await tx
      .repository('sixStepVersions')
      .findOne({ filter: { id, kind } });
    if (!row || row.state !== 'draft') fail('VERSION_IMMUTABLE');
    const payload = parsePayload(kind, row.payload);
    if (
      !payload.evidence ||
      Date.parse(payload.evidence.approvedAt) > Date.now()
    )
      fail('DECISION_REQUIRED');
    const required: Record<Kind, string[]> = {
      rules: ['DEC-05'],
      calendars: ['DEC-03', 'DEC-04'],
      periods: ['DEC-04'],
      templates: ['DEC-11'],
      filePolicies: ['DEC-11'],
      organizations: ['DEC-01'],
    };
    if (required[kind].some((d) => !payload.evidence!.decisions.includes(d)))
      fail('DECISION_REQUIRED');
    // One CAS serializes publication of each aggregate; failures roll back the head and audit.
    await compareAndSet(
      tx,
      'sixStepHeads',
      `${kind}:${row.key as string}`,
      input.expectedHeadVersion,
      { versionId: id },
    );
    if (kind === 'rules') {
      const rule = validateRule(payloadSchemas.rules.parse(payload));
      const catalog = await tx
        .repository('sixStepHeads')
        .findOne({ filter: { id: 'rules:$catalog' } });
      await compareAndSet(
        tx,
        'sixStepHeads',
        'rules:$catalog',
        Number(catalog!.version),
        {},
      );
      const applicable = await this.currentRules(tx);
      if (
        applicable.some(
          (candidate) =>
            candidate.id !== id &&
            candidate.rule.scope === rule.scope &&
            Date.parse(rule.effectiveFrom) <
              Date.parse(candidate.rule.effectiveUntil) &&
            Date.parse(rule.effectiveUntil) >
              Date.parse(candidate.rule.effectiveFrom),
        )
      )
        fail('RULE_WINDOW_OVERLAP');
    }
    if (kind === 'calendars')
      validateCalendar(payloadSchemas.calendars.parse(payload));
    if (kind === 'organizations') {
      const org = payloadSchemas.organizations.parse(payload);
      if (new Set(org.people.map((p) => p.userId)).size !== org.people.length)
        fail('ORGANIZATION_INVALID');
      const ids = [
        ...new Set(
          org.people.flatMap((p) => [
            p.userId,
            ...(p.managerId ? [p.managerId] : []),
          ]),
        ),
      ];
      const people = await tx.repository('user').findMany({
        filter: (f) => f.or(ids.map((id) => f.string('id').eq(id))),
      });
      if (
        people.length !== ids.length ||
        people.some((p) => p.disabledAt || p.deletedAt)
      )
        fail('ORGANIZATION_INVALID');
    }
    if (kind === 'periods') {
      const period = payloadSchemas.periods.parse(payload);
      if (
        Date.parse(period.opensAt) >= Date.parse(period.closesAt) ||
        (period.type === 'monthly'
          ? !/^\d{4}-(0[1-9]|1[0-2])$/.test(period.label)
          : !/^\d{4}$/.test(period.label))
      )
        fail('PERIOD_INVALID');
      const calendar = payloadSchemas.calendars.parse(
        (await published(tx, period.calendarVersionId, 'calendars')).payload,
      );
      validateCalendar(calendar);
      if (
        calendar.timezone !== period.timezone ||
        localDate(new Date(period.opensAt), period.timezone) < calendar.start ||
        localDate(new Date(period.closesAt), period.timezone) > calendar.end
      )
        fail('CALENDAR_COVERAGE_MISSING');
      await reference(tx, period.calendarVersionId, 'calendars', 'period', id);
    }
    if (kind === 'templates') {
      const template = payloadSchemas.templates.parse(payload);
      const file = await tx.repository('sixStepFileVersions').findOne({
        filter: {
          id: template.fileVersionId,
          scanState: 'clean',
          uploadState: 'complete',
        },
      });
      if (!file) fail('FILE_NOT_SAFE');
      await tx.repository('sixStepFileReferences').createOne({
        values: {
          id: randomUUID(),
          fileVersionId: template.fileVersionId,
          targetType: 'template',
          targetId: id,
          createdAt: new Date(),
        },
      });
    }
    await this.runtime.fire('sixStepVersions', id, 'publish', {
      actor: { id: actorId },
      expect: { version: input.expectedVersion },
      transaction: tx,
    });
    await tx.repository('sixStepVersions').updateOne({
      filter: { id },
      values: { publishedBy: actorId, publishedAt: new Date() },
    });
    await audit(
      tx,
      id,
      'versionPublished',
      actorId,
      input.expectedVersion,
      input.expectedVersion + 1,
      input.reason,
    );
    return tx.repository('sixStepVersions').findOne({ filter: { id } });
  }
  async createGrant(
    tx: DatabaseConnection,
    input: z.infer<typeof grantSchema>,
    actorId: string,
  ) {
    if (
      !input.evidence.decisions.includes('DEC-04') ||
      Date.parse(input.evidence.approvedAt) > Date.now()
    )
      fail('DECISION_REQUIRED');
    await published(tx, input.periodVersionId, 'periods');
    const user = await tx
      .repository('user')
      .findOne({ filter: { id: input.userId } });
    if (!user || user.disabledAt || user.deletedAt)
      fail('PARTICIPANT_INACTIVE');
    const { uses, evidence: _evidence, ...data } = input;
    const { record } = await tx.repository('sixStepGrants').createOne({
      values: {
        ...data,
        id: randomUUID(),
        remaining: uses,
        version: 1,
        revoked: false,
        createdBy: actorId,
        createdAt: new Date(),
      },
    });
    await reference(
      tx,
      input.periodVersionId,
      'periods',
      'grant',
      record.id as string,
    );
    await audit(
      tx,
      record.id as string,
      'grantCreated',
      actorId,
      0,
      1,
      `${input.reason}\n${JSON.stringify(input.evidence)}`,
    );
    return record;
  }
  async revokeGrant(
    tx: DatabaseConnection,
    id: string,
    version: number,
    reason: string,
    actorId: string,
  ) {
    await compareAndSet(tx, 'sixStepGrants', id, version, { revoked: true });
    await audit(tx, id, 'grantRevoked', actorId, version, version + 1, reason);
    return tx.repository('sixStepGrants').findOne({ filter: { id } });
  }
  /** Called ONLY inside the future submission receipt transaction, never a standalone consume API. */
  async consume(
    tx: DatabaseConnection,
    input: {
      grantId: string;
      periodVersionId: string;
      userId: string;
      purpose: 'lateSubmission' | 'extension';
      targetId: string | null;
      commandId: string;
    },
    acceptedAt = new Date(),
  ) {
    const grant = await tx.repository('sixStepGrants').findOne({
      filter: {
        id: input.grantId,
        periodVersionId: input.periodVersionId,
        userId: input.userId,
        purpose: input.purpose,
        targetId: input.targetId,
      },
    });
    if (
      !grant ||
      grant.revoked ||
      Number(grant.remaining) < 1 ||
      acceptedAt < new Date(grant.validFrom as string) ||
      acceptedAt > new Date(grant.validUntil as string)
    )
      fail('GRANT_UNAVAILABLE');
    await published(tx, input.periodVersionId, 'periods');
    await compareAndSet(
      tx,
      'sixStepGrants',
      input.grantId,
      Number(grant.version),
      { remaining: Number(grant.remaining) - 1 },
    );
    await tx.repository('sixStepGrantUses').createOne({
      values: {
        id: randomUUID(),
        grantId: input.grantId,
        commandId: input.commandId,
        userId: input.userId,
        acceptedAt,
      },
    });
    await audit(
      tx,
      input.grantId,
      'grantConsumed',
      input.userId,
      Number(grant.version),
      Number(grant.version) + 1,
      input.commandId,
    );
  }
  async requireOpen(
    tx: DatabaseConnection,
    periodVersionId: string,
    acceptedAt = new Date(),
  ) {
    const period = payloadSchemas.periods.parse(
      (await published(tx, periodVersionId, 'periods')).payload,
    );
    if (
      acceptedAt < new Date(period.opensAt) ||
      acceptedAt > new Date(period.closesAt)
    )
      fail('PERIOD_CLOSED');
    return period;
  }
  async currentRules(tx: DatabaseConnection) {
    // Keep scheduled and historical intervals selectable; publishing a future version must not deactivate today's rule.
    const versions = await tx
      .repository('sixStepVersions')
      .findMany({ filter: { kind: 'rules', state: 'published' } });
    return versions.map((version) => ({
      id: version.id as string,
      rule: payloadSchemas.rules.parse(version.payload),
    }));
  }
  async selectRule(
    tx: DatabaseConnection,
    scope: 'monthly' | 'annual',
    instant: Date,
  ) {
    const at = instant.getTime();
    const candidates = (await this.currentRules(tx)).filter(
      ({ rule }) =>
        rule.scope === scope &&
        Date.parse(rule.effectiveFrom) <= at &&
        at < Date.parse(rule.effectiveUntil),
    );
    if (candidates.length !== 1) fail('CONFIGURATION_NOT_READY');
    return candidates[0];
  }
}
