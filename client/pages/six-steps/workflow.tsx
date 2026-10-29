import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { LifecycleDescription, RecordHistory } from '@nocobase/lifecycle';
import {
  WorkflowManagementLayout,
  WorkflowDefinitionDetail,
} from '#extensions/nocobase-workflow-management/layout';
import { WorkflowDefinitionList } from '#extensions/nocobase-workflow-management/definition-list';
import { WorkflowExecutionList } from '#extensions/nocobase-workflow-management/execution-list';
import { WorkflowExecutionDetail } from '#extensions/nocobase-workflow-management/execution-detail';
import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { BackButton } from '#components/back-button';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import RefreshButton from './refresh-button.js';
import { workflowLocation } from './fields.js';
import { ErrorNotice, ContentSkeleton } from './common.js';

type Execution = {
  id: string;
  title: string;
  state: string;
  createdAt: string;
};
export default function WorkflowPage() {
  const api = useApiClient();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { tab, id } = workflowLocation(location.pathname);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const [definition, setDefinition] = useState<LifecycleDescription>();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [total, setTotal] = useState(0);
  const [history, setHistory] = useState<RecordHistory>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const definitionResult = await api.request<{
        data: LifecycleDescription;
      }>({ path: 'sixStepProcesses/definition' });
      setDefinition(definitionResult.data);
      const rows = await api.request<{
        data: Execution[];
        meta: { total: number };
      }>({ path: 'sixStepProcesses/executions', query: { page, order } });
      setExecutions(rows.data);
      setTotal(rows.meta.total);
      if (tab === 'executions' && id)
        setHistory(
          (
            await api.request<{ data: RecordHistory }>({
              path: `sixStepProcesses/executions/${id}`,
            })
          ).data,
        );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [api, page, order, id, tab]);
  useEffect(() => {
    // This effect starts external requests and tracks their loading/completion state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const label = (name: string) =>
    t(`sixSteps.workflowLabels.${name}`, { defaultValue: name });
  const diagram = (
    currentState?: string,
    transitions: readonly {
      transition: string;
      from: string | null;
      to: string;
    }[] = [],
  ) =>
    definition ? (
      <LifecycleDiagram
        description={definition}
        autoHeight
        ariaLabel={t('sixSteps.workflowDescription')}
        currentState={currentState}
        history={transitions}
        stateLabel={(state) => t(`sixSteps.${state.name}`)}
        transitionLabel={() => t('sixSteps.publish')}
      />
    ) : null;
  return (
    <WorkflowManagementLayout
      title={t('sixSteps.processes')}
      description={t('sixSteps.workflowDescription')}
      labels={{
        definitions: t('sixSteps.definitions'),
        executions: t('sixSteps.executions'),
      }}
      tab={tab}
      detail={!!id}
      onTabChange={(value) => void navigate(`/workflows/${value}`)}
    >
      {error ? <ErrorNotice error={error} retry={() => void load()} /> : null}
      {id ? (
        <>
          <BackButton to={`/workflows/${tab}${location.search}`}>
            {t('navigation.back')}
          </BackButton>
          <PageHeader
            title={t(
              tab === 'definitions'
                ? 'sixSteps.workflowDescription'
                : 'sixSteps.executions',
            )}
            actions={<RefreshButton busy={busy} onClick={() => void load()} />}
          />
          {!definition || (tab === 'executions' && !history) ? (
            error ? null : (
              <ContentSkeleton detail />
            )
          ) : tab === 'definitions' ? (
            <WorkflowDefinitionDetail
              diagram={diagram()}
              parameters={<p>{t('sixSteps.noParameters')}</p>}
              diagramTitle={t('sixSteps.workflowDescription')}
              parametersTitle={t('sixSteps.parameters')}
            />
          ) : (
            history && (
              <WorkflowExecutionDetail
                key={id}
                transitions={history.transitions.map((entry) => ({
                  ...entry,
                  id: String(entry.id),
                }))}
                effects={history.effectRuns.map((effect) => ({
                  ...effect,
                  id: String(effect.id),
                }))}
                state={history.transitions.at(-1)?.to ?? 'draft'}
                labels={{
                  processDiagram: label('diagram'),
                  history: label('history'),
                  historyHint: label('historyHint'),
                  step: label('step'),
                  transition: label('transition'),
                  from: label('from'),
                  to: label('to'),
                  actor: label('actor'),
                  time: label('time'),
                  noHistory: label('noHistory'),
                  effects: label('effects'),
                  effect: label('effect'),
                  state: t('sixSteps.state'),
                  attempts: label('attempts'),
                  error: label('error'),
                  noEffects: label('noEffects'),
                  executionParameters: t('sixSteps.parameters'),
                  snapshotHint: t('sixSteps.noParameters'),
                  showStep: (step) => t('sixSteps.step', { step }),
                }}
                stateLabel={(state) => t(`sixSteps.${state}`)}
                transitionLabel={(transition) =>
                  transition === '$create'
                    ? t('sixSteps.create')
                    : t('sixSteps.publish')
                }
                dateLabel={(at) => new Date(at).toLocaleString(locale)}
                effectStatusLabel={label}
                renderDiagram={({ current, history: entries }) =>
                  diagram(current, entries)
                }
              />
            )
          )}
        </>
      ) : tab === 'definitions' ? (
        <WorkflowDefinitionList
          rows={
            definition
              ? [
                  {
                    id: definition.name,
                    title: (
                      <RecordLink
                        to={`definitions/${definition.name}${location.search}`}
                      >
                        {t('sixSteps.workflowDescription')}
                      </RecordLink>
                    ),
                    activity: total,
                  },
                ]
              : []
          }
          search={null}
          loaded={!!definition}
          loading={busy}
          empty={t('sixSteps.empty')}
          labels={{
            refresh: t('sixSteps.refresh'),
            workflow: t('sixSteps.workflowDescription'),
            executionCount: t('sixSteps.executions'),
            executionActivity: t('sixSteps.executions'),
          }}
          onRefresh={() => void load()}
        />
      ) : (
        <WorkflowExecutionList
          rows={executions.map((row) => ({
            id: row.id,
            record: (
              <RecordLink to={`executions/${row.id}${location.search}`}>
                {row.title}
              </RecordLink>
            ),
            workflow: t('sixSteps.workflowDescription'),
            state: t(`sixSteps.${row.state}`),
            createdAt: new Date(row.createdAt).toLocaleString(locale),
          }))}
          loaded={!!definition}
          loading={busy}
          filters={null}
          empty={t('sixSteps.empty')}
          labels={{
            refresh: t('sixSteps.refresh'),
            record: t('sixSteps.name'),
            workflow: t('sixSteps.workflowDescription'),
            state: t('sixSteps.state'),
            createdAt: t('sixSteps.createdAt'),
            previous: t('sixSteps.previous'),
            next: t('sixSteps.next'),
          }}
          order={order === 'desc' ? 'newest' : 'oldest'}
          onSort={() =>
            setParams({ page: '1', order: order === 'desc' ? 'asc' : 'desc' })
          }
          onRefresh={() => void load()}
          pagination={`${page} / ${Math.max(1, Math.ceil(total / 10))}`}
          previousDisabled={busy || page === 1}
          nextDisabled={busy || page * 10 >= total}
          onPrevious={() => setParams({ page: String(page - 1), order })}
          onNext={() => setParams({ page: String(page + 1), order })}
        />
      )}
    </WorkflowManagementLayout>
  );
}
