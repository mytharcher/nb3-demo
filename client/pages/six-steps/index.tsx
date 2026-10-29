import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, MoreHorizontal } from 'lucide-react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '#components/ui/dropdown-menu';
import { Input } from '#components/ui/input';
import { StatusBadge } from '#components/status-badge';
import { RecordLink } from '#components/record-link';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '#components/ui/empty';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import type { FileRecord } from '@nocobase/app-plugin-file/client';
import { moduleFromPath } from './fields.js';
import { ErrorNotice, ContentSkeleton } from './common.js';
import RevokeGrant from './revoke.js';
import { grantState } from './grant-state.js';
import RefreshButton from './refresh-button.js';

export type Row = {
  id: string;
  key?: string;
  title?: string;
  state?: string;
  version?: number;
  userId?: string;
  purpose?: string;
  targetId?: string | null;
  periodVersionId?: string;
  remaining?: number;
  revoked?: boolean;
  validFrom?: string;
  validUntil?: string;
  fileId?: string;
  filename?: string;
  size?: number;
  uploadState?: string;
  scanState?: string;
  previewState?: string;
  parseState?: string;
  createdAt: string;
};
export default function FoundationPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const kind = moduleFromPath(location.pathname);
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'createdAt';
  const direction = params.get('direction') ?? 'desc';
  const [result, setResult] = useState<{
    data: Row[];
    meta: { total: number };
  }>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<FileRecord>();
  const [previewBusy, setPreviewBusy] = useState<string>();
  const { can: canCreate } = useCan({
    resource: { type: 'settings', id: `sixSteps.${kind}` },
    action: kind === 'files' ? 'upload' : 'create',
  });
  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await api.request({
          path: `sixSteps/${kind}`,
          query: { page, ...(kind === 'files' ? {} : { q, sort, direction }) },
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [api, kind, page, q, sort, direction]);
  useEffect(() => {
    // This effect starts an external request and tracks its loading/completion state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const cols: ColumnDef<Row>[] = [
      {
        id: 'title',
        header: t('sixSteps.name'),
        cell: ({ row }) =>
          kind === 'files' || kind === 'grants' ? (
            <span
              className='block max-w-64 truncate'
              title={
                row.original.filename ?? row.original.userId ?? row.original.id
              }
            >
              {row.original.filename ?? row.original.userId ?? row.original.id}
            </span>
          ) : (
            <RecordLink
              className='block max-w-64 truncate'
              title={row.original.title}
              to={`${row.original.id}${location.search}`}
            >
              {row.original.title}
            </RecordLink>
          ),
      },
    ];
    if (kind === 'grants')
      cols.push(
        {
          accessorKey: 'purpose',
          header: t('sixSteps.fields.purpose'),
          cell: ({ row }) => (
            <StatusBadge>
              {t(`sixSteps.values.${row.original.purpose}`)}
            </StatusBadge>
          ),
        },
        {
          accessorKey: 'periodVersionId',
          header: t('sixSteps.fields.periodVersionId'),
        },
        { accessorKey: 'targetId', header: t('sixSteps.fields.targetId') },
        {
          accessorKey: 'validUntil',
          header: t('sixSteps.fields.validUntil'),
          cell: ({ row }) =>
            new Date(row.original.validUntil!).toLocaleString(locale),
        },
        { accessorKey: 'remaining', header: t('sixSteps.remaining') },
        {
          id: 'state',
          header: t('sixSteps.state'),
          cell: ({ row }) => (
            <StatusBadge>
              {t(`sixSteps.${grantState(row.original)}`)}
            </StatusBadge>
          ),
        },
      );
    else if (kind === 'files')
      for (const field of [
        'uploadState',
        'scanState',
        'previewState',
        'parseState',
      ] as const)
        cols.push({
          accessorKey: field,
          header: t(`sixSteps.${field}`),
          cell: ({ row }) => (
            <StatusBadge>
              {t(`sixSteps.values.${row.original[field]}`)}
            </StatusBadge>
          ),
        });
    else
      cols.push(
        { accessorKey: 'key', header: t('sixSteps.key') },
        { accessorKey: 'version', header: t('sixSteps.version') },
        {
          accessorKey: 'state',
          header: t('sixSteps.state'),
          cell: ({ row }) => (
            <StatusBadge
              tone={row.original.state === 'published' ? 'success' : 'neutral'}
            >
              {t(`sixSteps.${row.original.state}`)}
            </StatusBadge>
          ),
        },
      );
    cols.push({
      accessorKey: 'createdAt',
      header: t('sixSteps.createdAt'),
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleString(locale),
    });
    if (kind === 'grants')
      cols.push({
        id: 'actions',
        cell: ({ row }) => <RevokeGrant row={row.original} onSaved={load} />,
      });
    if (kind === 'files')
      cols.push({
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('uiAudit.actionsFor', {
                    name: row.original.filename ?? row.original.id,
                  })}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-auto min-w-40'>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={row.original.scanState !== 'clean' || !!previewBusy}
                  onClick={() => {
                    void (async () => {
                      try {
                        setPreviewBusy(row.original.id);
                        const record = await api
                          .repository('sixStepAttachments')
                          .findOne({ filter: { id: row.original.fileId } });
                        if (record) setPreview(record as unknown as FileRecord);
                      } catch (e) {
                        setError(e);
                      } finally {
                        setPreviewBusy(undefined);
                      }
                    })();
                  }}
                >
                  {t(
                    previewBusy === row.original.id
                      ? 'status.loading'
                      : 'sixSteps.preview',
                  )}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    return cols.map((col): ColumnDef<Row> => {
      const key = 'accessorKey' in col ? String(col.accessorKey) : '';
      const sortable =
        kind !== 'files' &&
        ['createdAt', 'version', 'remaining', 'validUntil'].includes(key);
      const title = col.header as string;
      if (['version', 'remaining'].includes(key)) {
        col.cell = ({ row }) => (
          <span className='block text-right tabular-nums'>
            {typeof row.original[key as 'version' | 'remaining'] === 'number'
              ? row.original[key as 'version' | 'remaining']!.toLocaleString(
                  locale,
                )
              : '—'}
          </span>
        );
      }
      if (['key', 'periodVersionId', 'targetId'].includes(key)) {
        col.cell = ({ row }) => (
          <span
            className='block max-w-64 truncate'
            title={String(
              row.original[key as 'key' | 'targetId' | 'periodVersionId'] ?? '',
            )}
          >
            {row.original[key as 'key' | 'targetId' | 'periodVersionId'] || '—'}
          </span>
        );
      }
      col.enableSorting = sortable;
      col.enableHiding = false;
      if (sortable)
        col.header = ({ column }) => (
          <DataTableColumnHeader column={column} title={title} />
        );
      return col;
    });
  }, [api, kind, load, locale, location.search, t, previewBusy]);
  const create = canCreate ? (
    <Button nativeButton={false} render={<Link to={`new${location.search}`} />}>
      {t(kind === 'files' ? 'sixSteps.upload' : 'sixSteps.create')}
    </Button>
  ) : null;
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t(`sixSteps.${kind}`)}
          description={t('sixSteps.description')}
          actions={
            <>
              {(!!result?.data.length || (!!q && !!result && !error)) && create}
              <RefreshButton busy={busy} onClick={() => void load()} />
            </>
          }
        />
        {kind === 'files' && (
          <p className='text-sm text-muted-foreground'>
            {t('sixSteps.scanBlocked')}
          </p>
        )}
        {kind !== 'files' && (
          <form
            className='flex flex-wrap items-center gap-2'
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get('q') as string;
              setParams({ q: value, page: '1', sort, direction });
            }}
          >
            <Input
              className='w-full sm:max-w-xs'
              key={q}
              name='q'
              defaultValue={q}
              aria-label={t('sixSteps.search')}
              placeholder={t('sixSteps.search')}
            />
            <Button variant='outline' type='submit'>
              {t('sixSteps.searchAction')}
            </Button>
            {q && (
              <Button variant='ghost' onClick={() => setParams({})}>
                {t('sixSteps.clear')}
              </Button>
            )}
          </form>
        )}
        {error ? (
          <ErrorNotice error={error} retry={() => void load()} />
        ) : !result ? (
          <ContentSkeleton />
        ) : !result.meta.total ? (
          <Empty className='min-h-48 border border-dashed'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FileText />
              </EmptyMedia>
              <EmptyTitle>
                {t(q ? 'sixSteps.noResults' : 'sixSteps.empty')}
              </EmptyTitle>
              <EmptyDescription>
                {t('sixSteps.emptyDescription')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {q ? (
                <Button variant='outline' onClick={() => setParams({})}>
                  {t('sixSteps.clear')}
                </Button>
              ) : (
                create
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <DataTable
            columns={columns}
            data={result.data}
            manualPagination
            manualSorting
            sortingState={[{ id: sort, desc: direction === 'desc' }]}
            onSortingChange={(updater) => {
              const next =
                typeof updater === 'function'
                  ? updater([{ id: sort, desc: direction === 'desc' }])
                  : updater;
              setParams({
                q,
                page: '1',
                sort: next[0]?.id ?? 'createdAt',
                direction: next[0]?.desc === false ? 'asc' : 'desc',
              });
            }}
            rowCount={result.meta.total}
            loading={busy}
            paginationState={{ pageIndex: page - 1, pageSize: 10 }}
            onPaginationChange={(updater) => {
              const next =
                typeof updater === 'function'
                  ? updater({ pageIndex: page - 1, pageSize: 10 })
                  : updater;
              setParams({
                q,
                page: String(next.pageIndex + 1),
                sort,
                direction,
              });
            }}
            pageSizeOptions={[10]}
          />
        )}
      </PageContainer>
      <Outlet context={{ kind, load }} />
      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined);
        }}
        files={preview ? [preview] : []}
      />
    </>
  );
}
