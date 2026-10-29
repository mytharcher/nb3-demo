import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext, useParams } from 'react-router';
import { useApiClient, useSubmission, useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { VersionView } from '../../../shared/six-steps/contracts.js';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { StatusBadge } from '#components/status-badge';
import { Field, FieldGroup, FieldLabel } from '#components/ui/field';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import type { FileRecord } from '@nocobase/app-plugin-file/client';
import RefreshButton from './refresh-button.js';
import { ErrorNotice, ContentSkeleton } from './common.js';
import type { Module } from './fields.js';
export default function VersionDetail() {
  const { kind, load } = useOutletContext<{
    kind: Module;
    load: () => Promise<void>;
  }>();
  const { id } = useParams();
  const api = useApiClient();
  const { t } = useTranslation();
  const { session } = useAuthentication();
  const toaster = useToaster();
  const location = useLocation();
  const [result, setResult] = useState<{
    record: VersionView;
    headVersion: number;
  }>();
  const [error, setError] = useState<unknown>();
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<FileRecord>();
  const { can } = useCan({
    resource: { type: 'settings', id: `sixSteps.${kind}` },
    action: 'publish',
  });
  const { can: canCreate } = useCan({
    resource: { type: 'settings', id: `sixSteps.${kind}` },
    action: 'create',
  });
  const submission = useSubmission({
    scope: `${session?.user.id}:sixSteps:${id}:publish`,
  });
  const refresh = useCallback(async () => {
    setBusy(true);
    setReadFailed(false);
    try {
      const response = await api.request<{
        data: { record: VersionView; headVersion: number };
      }>({ path: `sixSteps/${kind}/${id}` });
      setResult(response.data);
      setError(undefined);
    } catch (e) {
      setReadFailed(true);
      setError(e);
      void load();
    } finally {
      setBusy(false);
    }
  }, [api, kind, id, load]);
  useEffect(() => {
    // This effect starts an external request and tracks its loading/completion state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return (
    <RouteChildPage>
      <PageContainer>
        <PageHeader
          title={result?.record.title ?? t('sixSteps.version')}
          description={t('sixSteps.immutable')}
          actions={<RefreshButton busy={busy} onClick={() => void refresh()} />}
        />
        {error ? (
          <ErrorNotice error={error} retry={() => void refresh()} />
        ) : null}
        {readFailed ? (
          <Link to={`..${location.search}`} className='underline'>
            {t('sixSteps.backToList')}
          </Link>
        ) : !result ? (
          <ContentSkeleton detail />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('sixSteps.version')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 [&_dt]:text-muted-foreground [&_dd]:break-words'>
                  <dt>{t('sixSteps.state')}</dt>
                  <dd>
                    <StatusBadge
                      tone={
                        result.record.state === 'published'
                          ? 'success'
                          : 'neutral'
                      }
                    >
                      {t(`sixSteps.${result.record.state}`)}
                    </StatusBadge>
                  </dd>
                  <dt>{t('sixSteps.key')}</dt>
                  <dd>{result.record.key}</dd>
                  <dt>{t('sixSteps.version')}</dt>
                  <dd>{result.record.version}</dd>
                </dl>
              </CardContent>
            </Card>
            <Card className='min-w-0'>
              <CardHeader>
                <CardTitle>{t(`sixSteps.${kind}`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className='flex min-w-0 flex-col gap-5'>
                  {Object.entries(
                    result.record.payload &&
                      typeof result.record.payload === 'object'
                      ? result.record.payload
                      : {},
                  ).map(([field, value]) => (
                    <div
                      key={field}
                      className='grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
                    >
                      <dt className='text-sm text-muted-foreground'>
                        {t(`sixSteps.fields.${field}`)}
                      </dt>
                      <dd className='min-w-0 whitespace-pre-wrap break-words'>
                        {value == null || value === '' ? (
                          '—'
                        ) : typeof value === 'object' ? (
                          <pre
                            tabIndex={0}
                            aria-label={t(`sixSteps.fields.${field}`)}
                            className='max-h-80 overflow-auto rounded-md bg-muted p-3 text-sm'
                          >
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          String(value)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            {kind === 'templates' && result.record.state === 'published' ? (
              <Button
                variant='outline'
                disabled={previewBusy}
                onClick={() => {
                  setPreviewBusy(true);
                  void api
                    .request<{ data: FileRecord }>({
                      path: `sixSteps/templates/${id}/file`,
                    })
                    .then(
                      (file) => setPreview(file.data),
                      (cause: unknown) => setError(cause),
                    )
                    .finally(() => setPreviewBusy(false));
                }}
              >
                {t(previewBusy ? 'status.loading' : 'sixSteps.preview')}
              </Button>
            ) : null}
            {can && result.record.state === 'draft' ? (
              <form
                className='flex w-full max-w-2xl flex-col gap-4'
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    try {
                      const saved = await submission.run(
                        {
                          expectedVersion: result.record.version,
                          expectedHeadVersion: result.headVersion,
                          reason,
                        },
                        (key, signal, snapshot) =>
                          api.request<{ data: VersionView }>({
                            method: 'POST',
                            path: `sixSteps/${kind}/${id}/publish`,
                            json: snapshot,
                            headers: { 'Idempotency-Key': key },
                            signal,
                          }),
                      );
                      if (!saved) return;
                      setResult({
                        record: saved.data,
                        headVersion: result.headVersion + 1,
                      });
                      toaster.show({
                        type: 'success',
                        title: t('sixSteps.saved'),
                      });
                      void load();
                    } catch (cause) {
                      setError(cause);
                    }
                  })();
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor='publish-reason'>
                      {t('sixSteps.fields.reason')} *
                    </FieldLabel>
                    <Input
                      id='publish-reason'
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <Button
                  className='self-end'
                  type='submit'
                  disabled={submission.submitting || !reason.trim()}
                >
                  {t(
                    submission.submitting
                      ? 'sixSteps.saving'
                      : 'sixSteps.publish',
                  )}
                </Button>
              </form>
            ) : null}
            {canCreate ? (
              <Button
                className='self-start'
                variant='outline'
                nativeButton={false}
                render={<Link to={`../new${location.search}`} />}
              >
                {t('sixSteps.newVersion')}
              </Button>
            ) : null}
          </>
        )}
      </PageContainer>
      <FilePreviewDialog
        open={!!preview}
        files={preview ? [preview] : []}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined);
        }}
      />
    </RouteChildPage>
  );
}
