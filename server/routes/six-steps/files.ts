import { Hono } from 'hono';
import { z } from 'zod';
import { bodyLimit } from 'hono/body-limit';
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
  defineFileRepositoryApiRoutes,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import {
  defineApiRoutes,
  defineRootRoutes,
  describeRoute,
  dataResponse,
  apiErrorResponses,
  apiErrorResponse,
  apiValidator,
  ApiError,
  apiErrorHandler,
  executeIdempotentMutation,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import {
  validateUpload,
  storeUpload,
} from '../../providers/six-steps/files.js';
import { fail } from '../../providers/six-steps/errors.js';
import { published } from '../../providers/six-steps/service.js';
import { templateSchema } from '../../providers/six-steps/contracts.js';

const fileRoutes = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: 'sixStepAttachments',
      collection: 'sixStepFiles',
      disk: 'local',
      accessPath: '/sixStepContent',
      accessMode: 'stream',
      policy: {
        read: {
          scope: true,
          fields: [
            'id',
            'filename',
            'ext',
            'mimeType',
            'size',
            'createdAt',
            'updatedAt',
          ],
        },
        create: false,
        update: false,
        delete: false,
      },
      actions: { findOne: {} },
    },
  ],
});
export const fileApi = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const connection = app.container.resolve(databaseManagerToken).connection();
  const manager = app.container.resolve(serverFileRepositoryManagerToken);
  router.get(
    '/sixSteps/templates/:id/file',
    auth.required(),
    authz.middleware(),
    async (c, next) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'sixSteps.templates' },
        action: 'read',
      });
      await next();
    },
    describeRoute({
      tags: ['SixSteps'],
      operationId: 'sixStepsTemplateFile',
      summary: 'Read authorized template download metadata',
      responses: {
        200: dataResponse(
          z.object({
            id: z.string(),
            filename: z.string(),
            ext: z.string(),
            mimeType: z.string(),
            size: z.union([z.string(), z.number()]),
            createdAt: z.string(),
            updatedAt: z.string(),
            contentUrl: z.string(),
          }),
        ),
        ...apiErrorResponses,
        400: apiErrorResponse(400),
      },
    }),
    apiValidator('param', z.object({ id: z.uuid() })),
    async (c) => {
      const template = templateSchema.parse(
        (await published(connection, c.req.valid('param').id, 'templates'))
          .payload,
      );
      const version = await connection
        .repository('sixStepFileVersions')
        .findOne({
          filter: { id: template.fileVersionId, scanState: 'clean' },
        });
      if (!version) fail('FILE_NOT_SAFE');
      const file = await connection.repository('sixStepFiles').findOne({
        filter: { id: version.fileId as string },
        select: (s) =>
          s.fields(
            'id',
            'filename',
            'ext',
            'mimeType',
            'size',
            'createdAt',
            'updatedAt',
          ),
      });
      if (!file) fail('FILE_NOT_SAFE');
      return c.json({
        data: {
          ...file,
          contentUrl: `${app.publicBasePath}/sixStepContent/${file.id as string}.${file.ext as string}`,
        },
      });
    },
  );
  router.use('/sixSteps/files', auth.required(), authz.middleware());
  router.use(
    '/sixStepAttachments/*',
    auth.required(),
    authz.middleware(),
    async (c, next) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'sixSteps.files' },
        action: 'read',
      });
      await next();
    },
  );
  router.get(
    '/sixSteps/files',
    async (c, next) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'sixSteps.files' },
        action: 'read',
      });
      await next();
    },
    describeRoute({
      tags: ['SixSteps'],
      operationId: 'sixStepsListFiles',
      summary: 'List quarantined file versions',
      responses: {
        200: dataResponse(
          z.array(
            z.object({
              id: z.string(),
              fileId: z.string(),
              filename: z.string(),
              size: z.number(),
              sha256: z.string(),
              uploadState: z.string(),
              scanState: z.string(),
              previewState: z.string(),
              parseState: z.string(),
              createdAt: z.string(),
            }),
          ),
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator(
      'query',
      z.object({ page: z.coerce.number().int().positive().default(1) }),
    ),
    async (c) => {
      const page = c.req.valid('query').page;
      const repository = connection.repository('sixStepFileVersions');
      const versions = await repository.findMany({
        limit: 10,
        offset: (page - 1) * 10,
        sort: (s) => [s.field('createdAt').desc(), s.field('id').desc()],
      });
      const files = versions.length
        ? await connection.repository('sixStepFiles').findMany({
            filter: (f) =>
              f.or(
                versions.map((version) =>
                  f.string('id').eq(version.fileId as string),
                ),
              ),
          })
        : [];
      return c.json({
        data: versions.map((version) => {
          const file = files.find((record) => record.id === version.fileId)!;
          return {
            ...version,
            filename: file.filename as string,
            size: Number(file.size),
          };
        }),
        meta: { page, pageSize: 10, total: await repository.count() },
      });
    },
  );
  router.post(
    '/sixSteps/files',
    async (c, next) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'sixSteps.files' },
        action: 'upload',
      });
      await next();
    },
    describeRoute({
      tags: ['SixSteps'],
      operationId: 'sixStepsUploadFile',
      summary: 'Upload an immutable file to quarantine',
      description:
        'Multipart file and policyVersionId. Requires an approved file policy; no production scanner is configured by default.',
      responses: {
        200: dataResponse(
          z.object({
            id: z.string(),
            fileId: z.string(),
            filename: z.string(),
            sha256: z.string(),
            scanState: z.literal('blocked'),
            previewState: z.literal('pending'),
            parseState: z.literal('notConfigured'),
          }),
        ),
        ...apiErrorResponses,
        400: apiErrorResponse(400),
        413: apiErrorResponse(413),
        409: apiErrorResponse(409),
      },
    }),
    apiValidator('header', z.object({ 'idempotency-key': z.string() })),
    bodyLimit({
      maxSize: 1024 * 1024 * 1024 + 1024 * 1024,
      onError: (c) =>
        apiErrorHandler(
          new ApiError({
            domain: 'sixSteps',
            status: 'INVALID_ARGUMENT',
            reason: 'BODY_TOO_LARGE',
            message: 'Upload exceeds the technical ceiling.',
            httpStatus: 413,
          }),
          c,
        ),
    }),
    async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      if (
        !(file instanceof File) ||
        typeof body.policyVersionId !== 'string' ||
        !z.uuid().safeParse(body.policyVersionId).success
      )
        fail('FILE_POLICY_REJECTED');
      const policyVersionId = body.policyVersionId;
      const sha256 = await validateUpload(connection, policyVersionId, file);
      const actorId = c.get('auth')!.user.id;
      const result = await executeIdempotentMutation({
        connection,
        principal: `${app.appName}:${actorId}`,
        operation: 'sixSteps/files/upload',
        key: c.req.valid('header')['idempotency-key'],
        input: {
          policyVersionId,
          sha256,
          filename: file.name,
          size: file.size,
          type: file.type,
        },
        authorize: async () => {},
        authorizeReplay: async () => {},
        execute: async (tx) => {
          await validateUpload(tx, policyVersionId, file);
          return storeUpload(
            tx,
            manager,
            policyVersionId,
            file,
            actorId,
            sha256,
          );
        },
      });
      c.header('Idempotency-Replayed', String(result.replayed));
      return c.json({ data: result.data });
    },
  );
  return new Hono().route('/', router);
});
export const fileContent = defineRootRoutes(async (app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  router.onError(apiErrorHandler);
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const connection = app.container.resolve(databaseManagerToken).connection();
  router.use(
    '/sixStepContent/*',
    auth.required(),
    authz.middleware(),
    async (c, next) => {
      const canReadFiles = await c.get('authz').can({
        resource: { type: 'settings', id: 'sixSteps.files' },
        action: 'read',
      });
      const canReadTemplates = await c.get('authz').can({
        resource: { type: 'settings', id: 'sixSteps.templates' },
        action: 'read',
      });
      if (!canReadFiles && !canReadTemplates)
        await c.get('authz').require({
          resource: { type: 'settings', id: 'sixSteps.files' },
          action: 'read',
        });
      const fileId = c.req.path.split('/').pop()!.split('.')[0];
      const file = await connection.repository('sixStepFileVersions').findOne({
        filter: { fileId, scanState: 'clean', uploadState: 'complete' },
      });
      if (!file) fail('FILE_NOT_SAFE');
      if (!canReadFiles) {
        const links = await connection
          .repository('sixStepFileReferences')
          .findMany({
            filter: {
              fileVersionId: file.id as string,
              targetType: 'template',
            },
          });
        if (!links.length) fail('FILE_ACCESS_DENIED');
        const valid = await connection.repository('sixStepVersions').exists({
          filter: (f) =>
            f.and([
              f.string('state').eq('published'),
              f.or(
                links.map((link) => f.string('id').eq(link.targetId as string)),
              ),
            ]),
        });
        if (!valid) fail('FILE_ACCESS_DENIED');
      }
      await next();
    },
  );
  // Retain the plugin's content implementation; add application access and safety checks before it.
  for (const contribution of fileRoutes)
    if (contribution.scope === 'root')
      router.route('/', await contribution.createRouter(app));
  return new Hono().route('/', router);
});
export const fileMetadata = defineApiRoutes(async (app: Application) => {
  const router = new Hono();
  for (const contribution of fileRoutes)
    if (contribution.scope === 'api')
      router.route('/', await contribution.createRouter(app));
  return router;
});
