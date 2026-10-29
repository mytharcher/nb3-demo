import { createServiceToken } from '@nocobase/service-provider';
import {
  defineLifecycle,
  type LifecycleRecord,
  type LifecycleRuntime,
} from '@nocobase/lifecycle';

interface Configuration extends LifecycleRecord {
  state: 'draft' | 'published';
}
export const configurationLifecycle = defineLifecycle<{
  record: Configuration;
  state: Configuration['state'];
  parameters: Record<string, never>;
  services: Record<string, never>;
}>({
  name: 'sixStepVersions',
  stateField: 'state',
  versionField: 'version',
  initial: 'draft',
  states: ['draft', { name: 'published', final: true }],
  transitions: { publish: { from: 'draft', to: 'published' } },
});
export const sixStepsRuntimeToken = createServiceToken<LifecycleRuntime>(
  'app.sixSteps.runtime',
);
