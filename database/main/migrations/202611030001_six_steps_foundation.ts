import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611030001_six_steps_foundation',
  async up({ builder }) {
    await builder.createCollection('sixStepVersions', (c) => {
      c.uuid('id').primary().notNull();
      c.string('kind').notNull();
      c.string('key').notNull();
      c.string('title').notNull();
      c.json('payload').notNull();
      c.string('state').notNull();
      c.integer('version').notNull().defaultTo(1);
      c.datetimeTz('statusChangedAt').notNull();
      c.string('createdBy').notNull();
      c.datetime('createdAt').notNull();
      c.string('publishedBy');
      c.datetime('publishedAt');
      c.index(['kind', 'key', 'state']);
    });
    await builder.createCollection('sixStepHeads', (c) => {
      c.string('id').primary().notNull();
      c.uuid('versionId');
      c.integer('version').notNull().defaultTo(0);
      c.foreignKey('versionId', { references: { collection: 'sixStepVersions', fields: ['id'] } });
    });
    await builder.createCollection('sixStepReferences', (c) => {
      c.uuid('id').primary().notNull();
      c.uuid('versionId').notNull();
      c.string('targetType').notNull();
      c.string('targetId').notNull();
      c.datetime('createdAt').notNull();
      c.unique(['versionId', 'targetType', 'targetId']);
      c.foreignKey('versionId', { references: { collection: 'sixStepVersions', fields: ['id'] } });
    });
    await builder.createCollection('sixStepAudit', (c) => {
      c.uuid('id').primary().notNull();
      c.string('aggregateId').notNull();
      c.string('action').notNull();
      c.string('actorId').notNull();
      c.integer('fromVersion').notNull();
      c.integer('toVersion').notNull();
      c.text('reason').notNull();
      c.datetime('occurredAt').notNull();
      c.index(['aggregateId', 'occurredAt']);
    });
    await builder.createCollection('sixStepFiles', (c) => {
      c.uuid('id').primary().notNull();
      c.string('disk', { length: 255 }).notNull();
      c.text('key').notNull();
      c.text('filename').notNull();
      c.string('ext', { length: 32 }).notNull();
      c.string('mimeType', { length: 255 }).notNull();
      c.bigInt('size').notNull();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.string('ownerId').notNull();
      c.index('ownerId');
    });
    await builder.createCollection('sixStepFileVersions', (c) => {
      c.uuid('id').primary().notNull();
      c.uuid('fileId').notNull().unique();
      c.uuid('policyVersionId').notNull();
      c.string('sha256', { length: 64 }).notNull();
      c.string('uploadState').notNull();
      c.string('scanState').notNull();
      c.string('previewState').notNull();
      c.string('parseState').notNull();
      c.text('scanEvidence');
      c.datetime('createdAt').notNull();
      c.foreignKey('fileId', { references: { collection: 'sixStepFiles', fields: ['id'] } });
      c.foreignKey('policyVersionId', { references: { collection: 'sixStepVersions', fields: ['id'] } });
    });
    await builder.createCollection('sixStepGrants', (c) => {
      c.uuid('id').primary().notNull();
      c.uuid('periodVersionId').notNull();
      c.string('userId').notNull();
      c.string('purpose').notNull();
      c.string('targetId');
      c.datetime('validFrom').notNull();
      c.datetime('validUntil').notNull();
      c.integer('remaining').notNull();
      c.integer('version').notNull().defaultTo(1);
      c.boolean('revoked').notNull().defaultTo(false);
      c.text('reason').notNull();
      c.string('createdBy').notNull();
      c.datetime('createdAt').notNull();
      c.foreignKey('periodVersionId', { references: { collection: 'sixStepVersions', fields: ['id'] } });
      c.index(['userId', 'periodVersionId']);
    });
    await builder.createCollection('sixStepGrantUses', (c) => {
      c.uuid('id').primary().notNull();
      c.uuid('grantId').notNull();
      c.string('commandId').notNull().unique();
      c.string('userId').notNull();
      c.datetime('acceptedAt').notNull();
      c.foreignKey('grantId', { references: { collection: 'sixStepGrants', fields: ['id'] } });
    });
    await builder.createCollection('sixStepSnapshots', (c) => {
      c.uuid('id').primary().notNull();
      c.uuid('organizationVersionId').notNull();
      c.string('authorId').notNull();
      c.string('submitterId').notNull();
      c.json('snapshot').notNull();
      c.datetime('createdAt').notNull();
      c.foreignKey('organizationVersionId', { references: { collection: 'sixStepVersions', fields: ['id'] } });
    });
    await builder.createCollection('sixStepNotificationEvents', (c) => {
      c.uuid('id').primary().notNull();
      c.string('aggregateId').notNull();
      c.string('action').notNull();
      c.json('recipients').notNull();
      c.string('notificationId');
      c.datetime('createdAt').notNull();
      c.index('aggregateId');
    });
    await builder.createCollection('sixStepTransitions', (c) => {
      c.bigInt('id').primary().autoIncrement().notNull();
      c.string('lifecycle').notNull(); c.string('recordId').notNull();
      c.string('transition').notNull(); c.string('from').nullable(); c.string('to').notNull();
      c.string('actorId').notNull(); c.json('input').notNull(); c.datetimeTz('at').notNull();
      c.integer('version').notNull(); c.string('requestId').nullable(); c.string('requestKey').notNull();
      c.unique(['lifecycle', 'recordId', 'version']); c.unique(['lifecycle', 'recordId', 'requestKey']);
    });
    await builder.createCollection('sixStepEffectRuns', (c) => {
      c.bigInt('id').primary().autoIncrement().notNull(); c.bigInt('transitionId').notNull();
      c.string('lifecycle').notNull(); c.string('recordId').notNull(); c.string('effect').notNull();
      c.boolean('stayBound').notNull(); c.string('status').notNull();
      c.integer('attempts').notNull(); c.integer('maxAttempts').notNull();
      c.json('result').nullable(); c.text('error').nullable();
      c.datetimeTz('createdAt').notNull(); c.datetimeTz('updatedAt').notNull();
      c.datetimeTz('claimedAt').nullable(); c.datetimeTz('runAfter').nullable();
      c.json('continuation').nullable(); c.datetimeTz('continuationDueAt').nullable(); c.datetimeTz('continuationAbandonedAt').nullable();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('sixStepEffectRuns');
    await builder.dropCollection('sixStepTransitions');
    await builder.dropCollection('sixStepNotificationEvents');
    await builder.dropCollection('sixStepSnapshots');
    await builder.dropCollection('sixStepGrantUses');
    await builder.dropCollection('sixStepGrants');
    await builder.dropCollection('sixStepFileVersions');
    await builder.dropCollection('sixStepFiles');
    await builder.dropCollection('sixStepAudit');
    await builder.dropCollection('sixStepReferences');
    await builder.dropCollection('sixStepHeads');
    await builder.dropCollection('sixStepVersions');
  },
});
export default migration;
