import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { answerApi, type ApiCall } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderSettingsClient } from '../helpers/settings-client.js';
import FoundationPage from '../../client/pages/six-steps/index.js';
import Form from '../../client/pages/six-steps/form.js';
import Detail from '../../client/pages/six-steps/detail.js';
import enUS from '../../client/locales/en-US.js';
import {
  moduleFromPath,
  workflowLocation,
} from '../../client/pages/six-steps/fields.js';
import { grantState } from '../../client/pages/six-steps/grant-state.js';

let granted = true;
let failure = false;
let rows: unknown[] = [];
let missing = false;
let listStatus = 403;
const api = vi.fn((call: ApiCall) => {
  if (call.path === 'sixSteps/filePolicies/fixture' && call.method === 'GET')
    return missing
      ? Response.json({ error: { reason: 'NOT_FOUND' } }, { status: 404 })
      : {
          data: {
            record: {
              id: 'fixture',
              title: 'Synthetic detail',
              key: 'fixture',
              state: 'draft',
              version: 1,
              payload: {
                extensions: ['pptx'],
                maxBytes: 1024,
                scanRequired: true,
                evidence: null,
              },
            },
            headVersion: 0,
          },
        };
  if (call.path === 'sixSteps/filePolicies/fixture/publish')
    return Response.json(
      { error: { reason: 'DECISION_REQUIRED', domain: 'sixSteps' } },
      { status: 400 },
    );
  if (call.path === 'authorization/permissions')
    return {
      data: {
        unrestricted: false,
        permissions: granted
          ? [
              {
                resource: { type: 'settings', id: 'sixSteps.filePolicies' },
                actions: ['read', 'create', 'publish'],
              },
            ]
          : [],
      },
    };
  if (call.path === 'sixSteps/filePolicies' && call.method === 'GET')
    return failure
      ? Response.json(
          { error: { reason: 'AUTHORIZATION_DENIED' } },
          { status: listStatus },
        )
      : { data: rows, meta: { total: rows.length } };
  if (call.path === 'sixSteps/filePolicies' && call.method === 'POST') {
    rows = [
      {
        id: 'fixture',
        title: 'Synthetic policy',
        key: 'fixture',
        version: 0,
        state: 'draft',
        createdAt: '2026-10-29T00:00:00Z',
      },
    ];
    return { data: rows[0] };
  }
  return new Response(null, { status: 404 });
});
function render(route = '/filePolicies') {
  return renderSettingsClient(
    <Routes>
      <Route path='/filePolicies' element={<FoundationPage />}>
        <Route path='new' element={<Form />} />
        <Route path=':id' element={<Detail />} />
      </Route>
    </Routes>,
    {
      route,
      namespace: 'nb3-demo',
      namespaces: { 'nb3-demo': enUS },
      fetch: answerApi(api),
      services: (app) => {
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
}
beforeEach(() => {
  granted = true;
  failure = false;
  missing = false;
  listStatus = 403;
  rows = [];
  api.mockClear();
});
it('clears stale details and stops loading after a record disappears', async () => {
  await render('/filePolicies/fixture');
  await screen.findByLabelText(`${enUS.sixSteps.fields.reason} *`);
  missing = true;
  await userEvent.click(
    screen.getAllByRole('button', { name: enUS.sixSteps.refresh }).at(-1)!,
  );
  expect(await screen.findByText(enUS.sixSteps.backToList)).toBeVisible();
  expect(
    screen.queryByLabelText(`${enUS.sixSteps.fields.reason} *`),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText(enUS['status.loading']),
  ).not.toBeInTheDocument();
});
it('retains creation in a filtered empty list and sends controlled sorting', async () => {
  await render('/filePolicies?q=absent&sort=version&direction=asc');
  await screen.findByText(enUS.sixSteps.noResults);
  expect(
    screen.getByRole('button', { name: enUS.sixSteps.create }),
  ).toBeVisible();
  expect(
    api.mock.calls.some(
      ([call]) =>
        call.path === 'sixSteps/filePolicies' &&
        call.query?.sort === 'version' &&
        call.query?.direction === 'asc',
    ),
  ).toBe(true);
});
it('distinguishes revoked, exhausted, future, expired and usable grants', () => {
  const row = {
    id: 'fixture',
    createdAt: '',
    remaining: 1,
    validFrom: '2026-10-01T00:00:00Z',
    validUntil: '2026-11-01T00:00:00Z',
  };
  const now = Date.parse('2026-10-29T00:00:00Z');
  expect(grantState(row, now)).toBe('available');
  expect(grantState({ ...row, revoked: true }, now)).toBe('revoked');
  expect(grantState({ ...row, remaining: 0 }, now)).toBe('exhausted');
  expect(grantState(row, Date.parse('2026-09-01'))).toBe('notStarted');
  expect(grantState(row, Date.parse('2026-11-01T00:00:00.001Z'))).toBe(
    'expired',
  );
});
it('unwraps detail DTOs and preserves the publication reason when approval evidence is missing', async () => {
  await render('/filePolicies/fixture');
  const reason = await screen.findByLabelText(
    `${enUS.sixSteps.fields.reason} *`,
  );
  await userEvent.type(reason, 'Synthetic publication');
  await userEvent.click(
    screen.getByRole('button', { name: enUS.sixSteps.publish }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    enUS.sixSteps.errors.DECISION_REQUIRED,
  );
  expect(reason).toHaveValue('Synthetic publication');
});
it('shows a real empty state and hides the create action without a grant', async () => {
  granted = false;
  const view = await render();
  await act(async () => {
    await view.app.container.resolve(authorizationClientToken).snapshot();
  });
  expect(await screen.findByText(enUS.sixSteps.empty)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: enUS.sixSteps.create }),
  ).not.toBeInTheDocument();
});
it('explains forbidden API results without a misleading retry', async () => {
  failure = true;
  await render();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    enUS.sixSteps.forbidden,
  );
  expect(
    screen.queryByRole('button', { name: enUS['status.retry'] }),
  ).not.toBeInTheDocument();
});
it('offers a working retry for server failures without claiming success', async () => {
  failure = true;
  listStatus = 500;
  await render();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    enUS.sixSteps.failed,
  );
  failure = false;
  await userEvent.click(
    screen.getByRole('button', { name: enUS['status.retry'] }),
  );
  expect(await screen.findByText(enUS.sixSteps.empty)).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('validates fields before writing and creates one draft through the real submission controller', async () => {
  const view = await render('/filePolicies/new');
  const user = userEvent.setup();
  const create = () =>
    screen.getAllByRole('button', { name: enUS.sixSteps.create }).at(-1)!;
  await user.click(create());
  expect(
    api.mock.calls.filter(([call]) => call.method === 'POST'),
  ).toHaveLength(0);
  await user.type(screen.getByLabelText(`${enUS.sixSteps.key} *`), 'fixture');
  await user.type(
    screen.getByLabelText(`${enUS.sixSteps.name} *`),
    'Synthetic policy',
  );
  await user.type(
    screen.getByLabelText(`${enUS.sixSteps.fields.extensions} *`),
    '[["pptx"]',
    { skipClick: false },
  );
  await user.type(
    screen.getByLabelText(`${enUS.sixSteps.fields.maxBytes} *`),
    '1024',
  );
  await user.type(
    screen.getByLabelText(`${enUS.sixSteps.fields.scanRequired} *`),
    'true',
  );
  await user.click(create());
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([call]) => call.method === 'POST'),
    ).toHaveLength(1),
  );
  expect(
    api.mock.calls.find(([call]) => call.method === 'POST')![0].json,
  ).toEqual({
    key: 'fixture',
    title: 'Synthetic policy',
    payload: {
      extensions: ['pptx'],
      maxBytes: 1024,
      scanRequired: true,
      evidence: null,
    },
  });
  await waitFor(() =>
    expect(view.toasts()).toEqual([
      expect.objectContaining({ title: enUS.sixSteps.saved }),
    ]),
  );
});

it('renders immutable payload fields with labels and preserves the list query in standard record links', async () => {
  rows = [
    {
      id: 'fixture',
      title: 'Synthetic policy',
      key: 'fixture',
      state: 'draft',
      version: 1,
      createdAt: '2026-10-29T00:00:00Z',
    },
  ];
  await render('/filePolicies?q=fixture');
  const link = await screen.findByRole('link', { name: 'Synthetic policy' });
  expect(link).toHaveAttribute('data-slot', 'record-link');
  expect(link).toHaveAttribute('href', '/filePolicies/fixture?q=fixture');
  await userEvent.click(link);
  expect(await screen.findByText(enUS.sixSteps.fields.maxBytes)).toBeVisible();
  expect(screen.getByText('1024')).toBeVisible();
  expect(
    screen.getByLabelText(enUS.sixSteps.fields.extensions),
  ).toHaveTextContent('pptx');
});

it('keeps quarantined file preview disabled inside the standard row menu', async () => {
  await renderSettingsClient(<FoundationPage />, {
    route: '/files',
    namespace: 'nb3-demo',
    namespaces: { 'nb3-demo': enUS },
    fetch: answerApi((call) => {
      if (call.path === 'authorization/permissions')
        return { data: { unrestricted: true, permissions: [] } };
      if (call.path === 'sixSteps/files')
        return {
          data: [
            {
              id: 'quarantined',
              filename: 'Pending.pdf',
              scanState: 'pending',
              uploadState: 'complete',
              previewState: 'pending',
              parseState: 'pending',
              createdAt: '2026-10-29T00:00:00Z',
            },
          ],
          meta: { total: 1 },
        };
      return new Response(null, { status: 404 });
    }),
    services: (app) =>
      app.container.singleton(
        authorizationClientToken,
        (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
      ),
  });
  expect(await screen.findByText('Pending.pdf')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: enUS.sixSteps.preview }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for Pending.pdf' }),
  );
  expect(
    await screen.findByRole('menuitem', { name: enUS.sixSteps.preview }),
  ).toHaveAttribute('aria-disabled', 'true');
});

it('resolves flattened module and workflow routes for lists, forms and direct detail loads', () => {
  for (const kind of [
    'rules',
    'calendars',
    'periods',
    'templates',
    'filePolicies',
    'organizations',
    'grants',
    'files',
  ]) {
    expect(moduleFromPath(`/${kind}`)).toBe(kind);
    expect(moduleFromPath(`/${kind}/new`)).toBe(kind);
    expect(moduleFromPath(`/${kind}/record-id`)).toBe(kind);
  }
  expect(() => moduleFromPath('/unknown')).toThrow();
  expect(workflowLocation('/workflows')).toEqual({
    tab: 'definitions',
    id: undefined,
  });
  expect(workflowLocation('/workflows/definitions/process-id')).toEqual({
    tab: 'definitions',
    id: 'process-id',
  });
  expect(workflowLocation('/workflows/executions/record-id')).toEqual({
    tab: 'executions',
    id: 'record-id',
  });
});
