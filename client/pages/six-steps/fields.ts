export const fields = {
  rules: [
    'scope',
    'effectiveFrom',
    'effectiveUntil',
    'precision',
    'rounding',
    'total',
    'aggregation',
    'items',
    'evidence',
  ],
  calendars: ['timezone', 'start', 'end', 'days', 'evidence'],
  periods: [
    'type',
    'label',
    'timezone',
    'opensAt',
    'closesAt',
    'calendarVersionId',
    'evidence',
  ],
  templates: ['fileVersionId', 'effectiveFrom', 'evidence'],
  filePolicies: ['extensions', 'maxBytes', 'scanRequired', 'evidence'],
  organizations: ['source', 'sourceVersion', 'people', 'evidence'],
  grants: [
    'periodVersionId',
    'userId',
    'purpose',
    'targetId',
    'validFrom',
    'validUntil',
    'uses',
    'reason',
    'evidence',
  ],
  files: ['policyVersionId'],
} as const;
export type Module = keyof typeof fields;
export const jsonFields = new Set([
  'items',
  'days',
  'extensions',
  'people',
  'evidence',
]);
export const numberFields = new Set(['precision', 'maxBytes', 'uses']);
export function moduleFromPath(path: string): Module {
  const module = path.split('/')[1];
  if (!Object.hasOwn(fields, module ?? ''))
    throw new Error('Unknown business module route');
  return module as Module;
}

export function workflowLocation(path: string) {
  const [, , segment, id] = path.split('/');
  return {
    tab:
      segment === 'executions'
        ? ('executions' as const)
        : ('definitions' as const),
    id,
  };
}
