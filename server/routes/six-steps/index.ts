import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  describeRoute,
  dataResponse,
  apiErrorResponses,
  apiErrorResponse,
  apiValidator,
  executeIdempotentMutation,
  ApiError,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import {
  kindSchema,
  createVersionSchema,
  publishSchema,
  grantSchema,
  versionViewSchema,
} from '../../providers/six-steps/contracts.js';
import { FoundationService } from '../../providers/six-steps/service.js';
import { sixStepsRuntimeToken } from '../../providers/six-steps/lifecycle.js';
import { fail } from '../../providers/six-steps/errors.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().max(255).default(''),
  sort: z
    .enum(['createdAt', 'version', 'remaining', 'validUntil'])
    .default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
const param = z.object({ kind: kindSchema, id: z.uuid() });
const header = z.object({ 'idempotency-key': z.string() });
const grantView = z.object({
  id: z.string(),
  periodVersionId: z.string(),
  userId: z.string(),
  purpose: z.string(),
  targetId: z.string().nullable(),
  validFrom: z.string(),
  validUntil: z.string(),
  remaining: z.number(),
  version: z.number(),
  revoked: z.boolean(),
  reason: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
});
const info = (operationId: string, summary: string, schema: z.ZodType) =>
  describeRoute({
    tags: ['SixSteps'],
    operationId,
    summary,
    responses: {
      200: dataResponse(schema),
      ...apiErrorResponses,
      409: apiErrorResponse(409),
      400: apiErrorResponse(400),
      404: apiErrorResponse(404),
    },
  });

export default defineApiRoutes((app: Application) => {
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const connection = app.container.resolve(databaseManagerToken).connection();
  const service = new FoundationService(
    connection,
    app.container.resolve(sixStepsRuntimeToken),
  );
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  router.use('/sixSteps/*', auth.required(), authorization.middleware());
  const allow =
    (
      kind: string | undefined,
      action: string,
    ): MiddlewareHandler<AuthEnv & AuthorizationEnv> =>
    async (c, next) => {
      const name = kind ?? c.req.param('kind');
      await c.get('authz').require({
        resource: { type: 'settings', id: `sixSteps.${name}` },
        action,
      });
      await next();
    };
  // Explicit static paths precede the configuration kind routes.
  router.get(
    '/sixSteps/grants',
    allow('grants', 'read'),
    info(
      'sixStepsListGrants',
      'List late submission and extension grants',
      z.array(grantView),
    ),
    apiValidator('query', listQuery),
    async (c) => {
      const { page, pageSize, q, sort, direction } = c.req.valid('query');
      if (sort === 'version') fail('INVALID_SORT');
      const repository = connection.repository('sixStepGrants');
      const filter = q ? { userId: q } : undefined;
      return c.json({
        data: await repository.findMany({
          filter,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          sort: (s) => [
            direction === 'asc' ? s.field(sort).asc() : s.field(sort).desc(),
            s.field('id').desc(),
          ],
        }),
        meta: { page, pageSize, total: await repository.count({ filter }) },
      });
    },
  );
  router.post(
    '/sixSteps/grants',
    allow('grants', 'create'),
    info(
      'sixStepsCreateGrant',
      'Grant late submission or extension to an explicit user',
      grantView,
    ),
    apiValidator('header', header),
    apiValidator('json', grantSchema),
    async (c) => {
      const actorId = c.get('auth')!.user.id;
      const result = await executeIdempotentMutation({
        connection,
        principal: `${app.appName}:${actorId}`,
        operation: 'sixSteps/grants/create',
        key: c.req.valid('header')['idempotency-key'],
        input: c.req.valid('json'),
        authorize: async () => {},
        authorizeReplay: async () => {},
        execute: (tx) => service.createGrant(tx, c.req.valid('json'), actorId),
      });
      c.header('Idempotency-Replayed', String(result.replayed));
      return c.json({ data: result.data });
    },
  );
  router.post(
    '/sixSteps/grants/:id/revoke',
    allow('grants', 'revoke'),
    info('sixStepsRevokeGrant', 'Revoke an unused grant balance', grantView),
    apiValidator('param', z.object({ id: z.uuid() })),
    apiValidator('header', header),
    apiValidator('json', publishSchema.omit({ expectedHeadVersion: true })),
    async (c) => {
      const actorId = c.get('auth')!.user.id;
      const input = c.req.valid('json');
      const result = await executeIdempotentMutation({
        connection,
        principal: `${app.appName}:${actorId}`,
        operation: `sixSteps/grants/${c.req.valid('param').id}/revoke`,
        key: c.req.valid('header')['idempotency-key'],
        input,
        authorize: async () => {},
        authorizeReplay: async () => {},
        execute: (tx) =>
          service.revokeGrant(
            tx,
            c.req.valid('param').id,
            input.expectedVersion,
            input.reason,
            actorId,
          ),
      });
      c.header('Idempotency-Replayed', String(result.replayed));
      return c.json({ data: result.data });
    },
  );
  router.get(
    '/sixSteps/:kind',
    allow(undefined, 'read'),
    info(
      'sixStepsListVersions',
      'List configuration versions',
      z.array(versionViewSchema),
    ),
    apiValidator('param', z.object({ kind: kindSchema })),
    apiValidator('query', listQuery),
    async (c) => {
      const { page, pageSize, q, sort, direction } = c.req.valid('query');
      if (sort !== 'createdAt' && sort !== 'version') fail('INVALID_SORT');
      const kind = c.req.valid('param').kind;
      const filter = q ? { kind, key: q } : { kind };
      const repo = connection.repository('sixStepVersions');
      return c.json({
        data: await repo.findMany({
          filter,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          sort: (s) => [
            direction === 'asc' ? s.field(sort).asc() : s.field(sort).desc(),
            s.field('id').desc(),
          ],
        }),
        meta: { page, pageSize, total: await repo.count({ filter }) },
      });
    },
  );
  router.get(
    '/sixSteps/:kind/:id',
    allow(undefined, 'read'),
    info(
      'sixStepsGetVersion',
      'Read an immutable version and its publication cursor',
      z.object({ record: versionViewSchema, headVersion: z.number() }),
    ),
    apiValidator('param', param),
    async (c) => {
      const { id, kind } = c.req.valid('param');
      const record = await connection
        .repository('sixStepVersions')
        .findOne({ filter: { id, kind } });
      if (!record)
        throw new ApiError({
          domain: 'sixSteps',
          status: 'NOT_FOUND',
          reason: 'VERSION_NOT_FOUND',
          message: 'Version not found.',
        });
      const head = await connection
        .repository('sixStepHeads')
        .findOne({ filter: { id: `${kind}:${record.key as string}` } });
      return c.json({
        data: { record, headVersion: Number(head?.version ?? 0) },
      });
    },
  );
  router.post(
    '/sixSteps/:kind',
    allow(undefined, 'create'),
    info(
      'sixStepsCreateVersion',
      'Create a configuration draft without production defaults',
      versionViewSchema,
    ),
    apiValidator('param', z.object({ kind: kindSchema })),
    apiValidator('header', header),
    apiValidator('json', createVersionSchema),
    async (c) => {
      const kind = c.req.valid('param').kind;
      const input = c.req.valid('json');
      const actorId = c.get('auth')!.user.id;
      const result = await executeIdempotentMutation({
        connection,
        principal: `${app.appName}:${actorId}`,
        operation: `sixSteps/${kind}/create`,
        key: c.req.valid('header')['idempotency-key'],
        input,
        authorize: async () => {},
        authorizeReplay: async () => {},
        execute: (tx) => service.create(tx, kind, input, actorId),
      });
      c.header('Idempotency-Replayed', String(result.replayed));
      return c.json({ data: result.data });
    },
  );
  router.post(
    '/sixSteps/:kind/:id/publish',
    allow(undefined, 'publish'),
    info(
      'sixStepsPublishVersion',
      'Publish a validated configuration version with decision evidence',
      versionViewSchema,
    ),
    apiValidator('param', param),
    apiValidator('header', header),
    apiValidator('json', publishSchema),
    async (c) => {
      const { kind, id } = c.req.valid('param');
      const input = c.req.valid('json');
      const actorId = c.get('auth')!.user.id;
      const result = await executeIdempotentMutation({
        connection,
        principal: `${app.appName}:${actorId}`,
        operation: `sixSteps/${kind}/${id}/publish`,
        key: c.req.valid('header')['idempotency-key'],
        input,
        authorize: async () => {},
        authorizeReplay: async () => {},
        execute: (tx) => service.publish(tx, kind, id, input, actorId),
      });
      c.header('Idempotency-Replayed', String(result.replayed));
      return c.json({ data: result.data });
    },
  );
  return new Hono().route('/', router);
});
