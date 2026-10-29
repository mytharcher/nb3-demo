import { ApiError } from '@nocobase/app-server/router';
import type { SixStepErrorReason } from './contracts.js';

export function fail(reason: SixStepErrorReason, conflict = false): never {
  const forbidden =
    reason === 'FILE_ACCESS_DENIED' || reason === 'CONFLICT_OF_INTEREST';
  throw new ApiError({
    domain: 'sixSteps',
    status: forbidden
      ? 'PERMISSION_DENIED'
      : conflict
        ? 'ABORTED'
        : 'FAILED_PRECONDITION',
    reason,
    message: reason,
    httpStatus: forbidden ? 403 : conflict ? 409 : 400,
  });
}
