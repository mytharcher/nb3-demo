import { defineMigration, type MigrationDefinition } from '@nocobase/db';
const migration: MigrationDefinition = defineMigration({
  name: '202611030002_six_steps_file_references',
  async up({ builder, query }) {
    await builder.createCollection('sixStepFileReferences', (c) => {
      c.uuid('id').primary().notNull();
      c.uuid('fileVersionId').notNull();
      c.string('targetType').notNull();
      c.string('targetId').notNull();
      c.datetime('createdAt').notNull();
      c.unique(['fileVersionId', 'targetType', 'targetId']);
      c.foreignKey('fileVersionId', { references: { collection: 'sixStepFileVersions', fields: ['id'] } });
    });
    // Internal serialization cursor, not business configuration or a production scoring rule.
    await query.insertInto('sixStepHeads').values({ id: 'rules:$catalog', version: 0 }).execute();
  },
  async down({ builder, query }) {
    await query.deleteFrom('sixStepHeads').where('id', '=', 'rules:$catalog').execute();
    await builder.dropCollection('sixStepFileReferences');
  },
});
export default migration;
