import { Hono } from 'hono';
import { z } from 'zod';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  defineApiRoutes,
  apiValidator,
  describeRoute,
  dataResponse,
  apiErrorResponses,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { sixStepsRuntimeToken } from '../../providers/six-steps/lifecycle.js';

export default defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const connection = app.container.resolve(databaseManagerToken).connection();
  const runtime = app.container.resolve(sixStepsRuntimeToken);
  router.use(
    '/sixStepProcesses/*',
    auth.required(),
    authz.middleware(),
    async (c, next) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'sixSteps.processes' },
        action: 'read',
      });
      await next();
    },
  );
  // Runtime description/history are library-owned recursive JSON contracts, with no executable code or user secrets.
  router.get(
    '/sixStepProcesses/definition',
    describeRoute({
      tags: ['SixSteps'],
      operationId: 'sixStepsProcessDefinition',
      summary: 'Read the implemented configuration lifecycle',
      responses: { 200: dataResponse(z.json()), ...apiErrorResponses },
    }),
    (c) => c.json({ data: runtime.describe('sixStepVersions') }),
  );
  router.get(
    '/sixStepProcesses/executions',
    describeRoute({
      tags: ['SixSteps'],
      operationId: 'sixStepsProcessExecutions',
      summary: 'List configuration lifecycle executions',
      responses: {
        200: dataResponse(
          z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              state: z.string(),
              createdAt: z.string(),
            }),
          ),
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator(
      'query',
      z.object({
        page: z.coerce.number().int().positive().default(1),
        order: z.enum(['asc', 'desc']).default('desc'),
      }),
    ),
    async (c) => {
      const { page, order } = c.req.valid('query');
      const repo = connection.repository('sixStepVersions');
      return c.json({
        data: await repo.findMany({
          select: (s) => s.fields('id', 'title', 'state', 'createdAt'),
          sort: (s) => [
            order === 'desc'
              ? s.field('createdAt').desc()
              : s.field('createdAt').asc(),
            s.field('id').asc(),
          ],
          offset: (page - 1) * 10,
          limit: 10,
        }),
        meta: { total: await repo.count(), page, pageSize: 10 },
      });
    },
  );
  router.get(
    '/sixStepProcesses/executions/:id',
    describeRoute({
      tags: ['SixSteps'],
      operationId: 'sixStepsProcessHistory',
      summary: 'Read authoritative transition and effect history',
      responses: { 200: dataResponse(z.json()), ...apiErrorResponses },
    }),
    apiValidator('param', z.object({ id: z.uuid() })),
    async (c) =>
      c.json({
        data: await runtime.history('sixStepVersions', c.req.valid('param').id),
      }),
  );
  return new Hono().route('/', router);
});
