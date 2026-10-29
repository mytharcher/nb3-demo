import { ApiClientError } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import { Button } from '#components/ui/button';
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  const status = error instanceof ApiClientError ? error.status : undefined;
  const reason = error instanceof ApiClientError ? error.reason : undefined;
  return (
    <Alert variant='destructive'>
      <AlertDescription className='flex flex-col items-start gap-3'>
        {t(
          status === 401
            ? 'status.sessionExpired'
            : status === 403
              ? 'sixSteps.forbidden'
              : status === 404
                ? 'sixSteps.notFound'
                : [`sixSteps.errors.${reason}`, 'sixSteps.failed'],
        )}
        {status === 401 ? (
          <Button variant='outline' onClick={() => void refresh()}>
            {t('auth.signIn')}
          </Button>
        ) : status !== 403 && status !== 404 && retry ? (
          <Button variant='outline' onClick={retry}>
            {t('status.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function ContentSkeleton({ detail = false }: { detail?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t('status.loading')}
      role='status'
      className='flex flex-col gap-3'
    >
      {Array.from({ length: detail ? 4 : 6 }, (_, index) => (
        <div key={index} className='grid grid-cols-3 gap-4'>
          <Skeleton className={detail ? 'h-5' : 'h-9'} />
          <Skeleton className={detail ? 'col-span-2 h-5' : 'col-span-2 h-9'} />
        </div>
      ))}
    </div>
  );
}
