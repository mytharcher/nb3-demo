import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerApi } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { expect, it } from 'vitest';
import { renderSettingsClient } from '../helpers/settings-client.js';
import HomePage from '../../client/pages/home/index.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import { workbenchEntries } from '../../client/pages/home/entries.js';

function render(
  options: {
    unrestricted?: boolean;
    allowed?: string[];
    fail?: () => boolean;
    failureStatus?: number;
    locale?: 'en-US' | 'zh-CN';
  } = {},
) {
  return renderSettingsClient(<HomePage />, {
    route: '/',
    namespace: 'workbench-test',
    locale: options.locale ?? 'en-US',
    namespaces: {
      'workbench-test': {
        'en-US': async () => ({ default: enUS }),
        'zh-CN': async () => ({ default: zhCN }),
      },
    },
    fetch: answerApi((call) => {
      if (call.path === 'authorization/permissions') {
        if (options.fail?.())
          return Response.json(
            { error: { reason: 'UNAVAILABLE' } },
            { status: options.failureStatus ?? 500 },
          );
        return {
          data: {
            unrestricted: options.unrestricted ?? false,
            permissions: (options.allowed ?? []).map((key) => ({
              resource: { type: 'settings', id: `sixSteps.${key}` },
              actions: ['read'],
            })),
          },
        };
      }
      return new Response(null, { status: 404 });
    }),
    services: (app) => {
      app.container.singleton(
        authorizationClientToken,
        (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
      );
    },
  });
}
it.each(['en-US', 'zh-CN'] as const)(
  'shows translated workbench and all permitted flat links in %s',
  async (locale) => {
    await render({ unrestricted: true, locale });
    const words = locale === 'en-US' ? enUS : zhCN;
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: words.workbench.title,
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
    for (const entry of workbenchEntries)
      expect(
        screen.getByRole('button', {
          name: words.workbench.openModule.replace(
            '{{name}}',
            words.sixSteps[entry.key],
          ),
        }),
      ).toHaveAttribute('href', entry.path);
    expect(
      screen.getByRole('button', { name: words.workbench.openInbox }),
    ).toHaveAttribute('href', '/inbox');
  },
);
it('only shows readable modules and drops stale links after permissions change', async () => {
  const allowed = ['rules'];
  const view = await render({ allowed });
  expect(
    await screen.findByRole('button', { name: 'Open Scoring rules' }),
  ).toHaveAttribute('href', '/rules');
  expect(
    screen.queryByRole('button', { name: 'Open Files' }),
  ).not.toBeInTheDocument();
  allowed.length = 0;
  act(() => view.app.container.resolve(authorizationClientToken).invalidate());
  expect(await screen.findByText(enUS.workbench.noAccess)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Open Scoring rules' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: enUS.workbench.openInbox }),
  ).toBeVisible();
});
it('retries permission failures without rendering protected links', async () => {
  let failure = true;
  await render({ unrestricted: true, fail: () => failure });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    enUS.workbench.loadFailed,
  );
  expect(
    screen.queryByRole('button', { name: 'Open Scoring rules' }),
  ).not.toBeInTheDocument();
  failure = false;
  await userEvent.click(
    screen.getByRole('button', { name: enUS['status.retry'] }),
  );
  expect(
    await screen.findByRole('button', { name: 'Open Scoring rules' }),
  ).toBeVisible();
});

it.each([401, 403])(
  'explains permission endpoint %s without a misleading retry',
  async (failureStatus) => {
    await render({ fail: () => true, failureStatus });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      failureStatus === 401
        ? enUS.workbench.sessionExpired
        : enUS.workbench.forbidden,
    );
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).not.toBeInTheDocument();
    if (failureStatus === 401)
      expect(
        screen.getByRole('button', { name: enUS['auth.signIn'] }),
      ).toBeVisible();
  },
);
