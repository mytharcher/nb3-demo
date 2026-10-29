import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import sixSteps from './six-steps/index.js';
import processes from './six-steps/processes.js';
import { fileApi, fileContent, fileMetadata } from './six-steps/files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  fileApi,
  fileMetadata,
  fileContent,
  processes,
  sixSteps,
];

export default routes;
