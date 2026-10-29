import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

describeMigration('202611030001_six_steps_foundation', {
  sources: [
    {
      packageName: 'six-steps-test',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    },
  ],
  up: async ({ connection, expectCollection }) => {
    await expectCollection('sixStepVersions').toHaveField('payload', {
      nullable: false,
    });
    await expectCollection('sixStepFiles').toHaveField('ownerId', {
      nullable: false,
    });
    await expectCollection('sixStepTransitions').toExist();
    await connection
      .repository('sixStepHeads')
      .createOne({ values: { id: 'rules:test', version: 0 } });
    await expect(
      connection
        .repository('sixStepHeads')
        .createOne({ values: { id: 'rules:test', version: 0 } }),
    ).rejects.toThrow();
    await expect(
      connection.repository('sixStepReferences').createOne({
        values: {
          id: '00000000-0000-4000-8000-000000000001',
          versionId: '00000000-0000-4000-8000-000000000002',
          targetType: 'test',
          targetId: 'test',
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const table of [
      'sixStepVersions',
      'sixStepHeads',
      'sixStepReferences',
      'sixStepAudit',
      'sixStepFiles',
      'sixStepFileVersions',
      'sixStepGrants',
      'sixStepGrantUses',
      'sixStepSnapshots',
      'sixStepNotificationEvents',
      'sixStepTransitions',
      'sixStepEffectRuns',
    ])
      await expectCollection(table).not.toExist();
  },
});
