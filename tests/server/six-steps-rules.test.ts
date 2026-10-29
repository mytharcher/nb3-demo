import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  FoundationService,
  reference,
} from '../../server/providers/six-steps/service.js';
import { sixStepsRuntimeToken } from '../../server/providers/six-steps/lifecycle.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});
test('M06 schedules future rule versions without losing current references and serializes overlapping publications', async ({
  app,
  connection,
}) => {
  const service = new FoundationService(
    connection,
    app.container.resolve(sixStepsRuntimeToken),
  );
  const create = (key: string, from: string, until: string) =>
    connection.transaction((tx) =>
      service.create(
        tx,
        'rules',
        {
          key,
          title: 'Synthetic only',
          payload: {
            scope: 'monthly',
            effectiveFrom: from,
            effectiveUntil: until,
            precision: 2,
            rounding: 'halfUp',
            total: '100',
            aggregation: 'sumIncludedWeights',
            items: [
              {
                id: 'fixture',
                title: 'Synthetic only',
                max: '100',
                basisRequired: true,
              },
            ],
            evidence: {
              source: 'Synthetic test only',
              approvedBy: 'Test fixture',
              approvedAt: '2026-01-01T00:00:00Z',
              decisions: ['DEC-05'],
            },
          },
        },
        'fixture',
      ),
    );
  const publish = (draft: { id: unknown; version?: unknown }) =>
    connection.transaction((tx) =>
      service.publish(
        tx,
        'rules',
        String(draft.id),
        {
          expectedVersion: Number(draft.version),
          expectedHeadVersion: 0,
          reason: 'Fixture only',
        },
        'fixture',
      ),
    );
  const first = await create(
    'fixture-v1',
    '2026-01-01T00:00:00Z',
    '2027-01-01T00:00:00Z',
  );
  await publish(first);
  await connection.transaction((tx) =>
    reference(tx, String(first.id), 'rules', 'round', 'fixture-round'),
  );
  const second = await create(
    'fixture-v2',
    '2027-01-01T00:00:00Z',
    '2028-01-01T00:00:00Z',
  );
  await publish(second);
  expect(
    (
      await service.selectRule(
        connection,
        'monthly',
        new Date('2026-10-29T00:00:00Z'),
      )
    ).id,
  ).toBe(first.id);
  expect(
    (
      await service.selectRule(
        connection,
        'monthly',
        new Date('2027-10-29T00:00:00Z'),
      )
    ).id,
  ).toBe(second.id);
  const overlap = await create(
    'fixture-overlap',
    '2026-12-01T00:00:00Z',
    '2027-02-01T00:00:00Z',
  );
  await expect(publish(overlap)).rejects.toThrow('RULE_WINDOW_OVERLAP');
  expect(
    (await connection
      .repository('sixStepVersions')
      .findOne({ filter: { id: overlap.id as string } }))!.state,
  ).toBe('draft');
  const contenders = [
    await create('fixture-a', '2028-01-01T00:00:00Z', '2029-01-01T00:00:00Z'),
    await create('fixture-b', '2028-01-01T00:00:00Z', '2029-01-01T00:00:00Z'),
  ];
  const outcomes = await Promise.allSettled(contenders.map(publish));
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  expect(
    await connection
      .repository('sixStepReferences')
      .count({ filter: { versionId: first.id as string } }),
  ).toBe(1);
});
