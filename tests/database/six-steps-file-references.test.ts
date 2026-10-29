import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';
describeMigration('202611030002_six_steps_file_references', {
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
    await expectCollection('sixStepFileReferences').toHaveField(
      'fileVersionId',
      { nullable: false },
    );
    expect(
      (await connection
        .repository('sixStepHeads')
        .findOne({ filter: { id: 'rules:$catalog' } }))!.version,
    ).toBe(0);
  },
  down: async ({ connection, expectCollection }) => {
    await expectCollection('sixStepFileReferences').not.toExist();
    expect(
      await connection
        .repository('sixStepHeads')
        .findOne({ filter: { id: 'rules:$catalog' } }),
    ).toBeUndefined();
  },
});
