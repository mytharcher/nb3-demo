import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { Link } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRightIcon, InboxIcon, LayoutDashboardIcon } from 'lucide-react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import { useWorkbenchEntries } from './use-workbench-entries.js';

export default function HomePage() {
  const { t } = useTranslation();
  const { entries, loading, failed, status, retry } = useWorkbenchEntries();
  const { refresh } = useAuthentication();
  return (
    <PageContainer>
      <PageHeader
        title={t('workbench.title')}
        description={t('workbench.description')}
      />
      <Card>
        <CardHeader>
          <InboxIcon className='size-4 text-muted-foreground' aria-hidden />
          <CardTitle>
            <h2>{t('workbench.inbox')}</h2>
          </CardTitle>
          <CardDescription>{t('workbench.inboxDescription')}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link to='/inbox' />}>
            {t('workbench.openInbox')}
            <ArrowRightIcon data-icon='inline-end' />
          </Button>
        </CardFooter>
      </Card>
      <section
        aria-labelledby='workbench-entries'
        className='flex flex-col gap-4'
      >
        <div className='flex flex-col gap-1'>
          <h2 id='workbench-entries' className='text-base font-medium'>
            {t('workbench.entries')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('workbench.entriesDescription')}
          </p>
        </div>
        {loading ? (
          <div
            role='status'
            aria-label={t('status.loading')}
            className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
          >
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className='h-40' />
            ))}
          </div>
        ) : failed ? (
          <Alert variant='destructive'>
            <AlertDescription className='flex flex-col items-start gap-3'>
              {t(
                status === 401
                  ? 'workbench.sessionExpired'
                  : status === 403
                    ? 'workbench.forbidden'
                    : 'workbench.loadFailed',
              )}
              {status === 401 ? (
                <Button variant='outline' onClick={() => void refresh()}>
                  {t('auth.signIn')}
                </Button>
              ) : status !== 403 ? (
                <Button variant='outline' onClick={retry}>
                  {t('status.retry')}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : entries.length ? (
          <ul className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {entries.map(({ key, path, icon: Icon }) => (
              <li key={key} className='flex min-w-0'>
                <Card className='min-w-0 w-full'>
                  <CardHeader>
                    <Icon
                      className='size-4 text-muted-foreground'
                      aria-hidden
                    />
                    <CardTitle>
                      <h3>{t(`sixSteps.${key}`)}</h3>
                    </CardTitle>
                    <CardDescription>
                      {t(`workbench.modules.${key}`)}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className='mt-auto'>
                    <Button
                      variant='outline'
                      nativeButton={false}
                      render={<Link to={path} />}
                      aria-label={t('workbench.openModule', {
                        name: t(`sixSteps.${key}`),
                      })}
                    >
                      {t('workbench.open')}
                      <ArrowRightIcon data-icon='inline-end' />
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Empty className='min-h-48 border border-dashed'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <LayoutDashboardIcon />
              </EmptyMedia>
              <EmptyTitle>{t('workbench.noAccess')}</EmptyTitle>
              <EmptyDescription>
                {t('workbench.noAccessDescription')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </PageContainer>
  );
}
