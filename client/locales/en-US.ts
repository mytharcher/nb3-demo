import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';
import sixSteps from './six-steps.en.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  ...fileUi,
  sixSteps,
  workbench: {
    sessionExpired: 'Your session has expired. Sign in again to continue.',
    forbidden:
      'You cannot access these tools. Ask an administrator for access.',
    title: 'Workbench',
    description: 'Your notifications and business tools, in one place.',
    inbox: 'Inbox',
    inboxDescription: 'Read your notifications and follow up on updates.',
    openInbox: 'Open inbox',
    entries: 'Business tools',
    entriesDescription: 'Available tools follow your current permissions.',
    open: 'Open',
    openModule: 'Open {{name}}',
    noAccess: 'No business tools assigned yet',
    noAccessDescription:
      'Ask an administrator to assign the permissions you need. Your inbox remains available.',
    loadFailed: 'Unable to load your available tools. Please try again.',
    modules: {
      rules: 'Manage scoring rules and published versions.',
      calendars: 'Maintain workdays and calendar coverage.',
      periods: 'Manage submission windows and their calendars.',
      templates: 'Maintain report templates and version references.',
      filePolicies:
        'Configure file types, size limits and security requirements.',
      organizations: 'Maintain organization and participant snapshots.',
      grants: 'Manage late submission and extension grants.',
      files: 'View uploaded files and their processing status.',
      processes: 'Inspect process definitions and execution history.',
    },
  },
  uiAudit: { actionsFor: 'Actions for {{name}}' },
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
