import { ServiceProvider } from '@nocobase/service-provider';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { kinds } from './contracts.js';
import { APP_NS } from '@nocobase/i18n';
import { databaseManagerToken } from '@nocobase/db';
import {
  LifecycleRuntime,
  createRepositoryLifecycleStore,
} from '@nocobase/lifecycle';
import { configurationLifecycle, sixStepsRuntimeToken } from './lifecycle.js';

export default class SixStepsProvider extends ServiceProvider<Application> {
  readonly name = 'app/six-steps';
  override register(): void {
    this.app.container.singleton(sixStepsRuntimeToken, () => {
      const runtime = new LifecycleRuntime({
        store: createRepositoryLifecycleStore(
          this.app.container.resolve(databaseManagerToken),
          {
            collections: {
              transitions: 'sixStepTransitions',
              effectRuns: 'sixStepEffectRuns',
            },
          },
        ),
      });
      runtime.register(configurationLifecycle);
      return runtime;
    });
  }
  override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    authz.ui.sections.add({
      name: 'sixSteps.admin',
      title: { key: 'sixSteps.title', ns: APP_NS },
      parent: 'administration',
    });
    for (const kind of [...kinds, 'grants', 'files', 'processes'] as const) {
      const actions =
        kind === 'processes'
          ? ['read']
          : kind === 'grants'
            ? ['read', 'create', 'revoke']
            : kind === 'files'
              ? ['read', 'upload']
              : ['read', 'create', 'publish'];
      authz.settings.add({
        id: `sixSteps.${kind}`,
        title: { key: `sixSteps.${kind}`, ns: APP_NS },
        actions: actions.map((name) => ({
          name,
          title: { key: `sixSteps.${name}`, ns: APP_NS },
        })),
      });
      authz.ui.place(
        { type: 'settings', id: `sixSteps.${kind}` },
        { section: 'sixSteps.admin' },
      );
    }
  }
  override async start(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    // Create an editable responsibility, without assigning it to any identity or changing existing grants.
    if (!(await authz.permissionSets.get('sixStepsAdministrator')))
      await authz.permissionSets.create({
        key: 'sixStepsAdministrator',
        title: '六步骤管理员 / Six-step administrator',
        grants: [...kinds, 'grants', 'files', 'processes'].map((kind) => ({
          resource: { type: 'settings', id: `sixSteps.${kind}` },
          actions: (kind === 'grants'
            ? ['read', 'create', 'revoke']
            : kind === 'files'
              ? ['read', 'upload']
              : kind === 'processes'
                ? ['read']
                : ['read', 'create', 'publish']
          ).map((action) => ({ action })),
        })),
      });
  }
}
