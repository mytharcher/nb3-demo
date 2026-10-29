import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import {
  ClipboardList,
  CalendarDays,
  FileText,
  ShieldCheck,
  Network,
  Timer,
  Paperclip,
  ListChecks,
} from 'lucide-react';
const modules = [
  ['rules', 'sixStepsRules', ListChecks],
  ['calendars', 'sixStepsCalendars', CalendarDays],
  ['periods', 'sixStepsPeriods', Timer],
  ['templates', 'sixStepsTemplates', FileText],
  ['filePolicies', 'sixStepsFilePolicies', ShieldCheck],
  ['organizations', 'sixStepsOrganizations', Network],
  ['grants', 'sixStepsGrants', ClipboardList],
  ['files', 'sixStepsFiles', Paperclip],
] as const;
const routes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'sixStepsSettings',
    navigation: { title: 'sixSteps.title', icon: ClipboardList, order: 95 },
    children: [
      ...modules.map(([kind, name, icon]) => ({
        name,
        path: `/${kind}`,
        auth: 'required' as const,
        authz: {
          resource: { type: 'settings', id: `sixSteps.${kind}` },
          action: 'read',
        },
        navigation: { title: `sixSteps.${kind}`, icon },
        breadcrumb: { title: `sixSteps.${kind}` },
        componentLoader: () => import('./index.js'),
        children: [
          {
            name: `${name}Create`,
            path: 'new',
            authz: {
              resource: { type: 'settings', id: `sixSteps.${kind}` },
              action: kind === 'files' ? 'upload' : 'create',
            },
            breadcrumb: { title: 'sixSteps.create' },
            componentLoader: () => import('./form.js'),
          },
          ...(kind === 'files' || kind === 'grants'
            ? []
            : [
                {
                  name: `${name}Detail`,
                  path: ':id',
                  breadcrumb: { title: 'sixSteps.version' },
                  componentLoader: () => import('./detail.js'),
                },
              ]),
        ],
      })),
      {
        name: 'sixStepsProcesses',
        path: '/workflows',
        auth: 'required' as const,
        authz: {
          resource: { type: 'settings', id: 'sixSteps.processes' },
          action: 'read',
        },
        navigation: { title: 'sixSteps.processes', icon: Network },
        breadcrumb: { title: 'sixSteps.processes' },
        componentLoader: () => import('./workflow.js'),
        children: [
          {
            name: 'sixStepsDefinitions',
            path: 'definitions',
            componentLoader: () => import('./outlet.js'),
            children: [
              {
                name: 'sixStepsDefinition',
                path: ':id',
                componentLoader: () => import('./outlet.js'),
              },
            ],
          },
          {
            name: 'sixStepsExecutions',
            path: 'executions',
            componentLoader: () => import('./outlet.js'),
            children: [
              {
                name: 'sixStepsExecution',
                path: ':id',
                componentLoader: () => import('./outlet.js'),
              },
            ],
          },
        ],
      },
    ],
  },
]);
export default routes;
