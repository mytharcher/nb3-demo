import SubmissionProvider from './submission.js';
import SixStepsProvider from './six-steps/provider.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  SixStepsProvider,
];

export default serviceProviders;
