import {
  CalendarDays,
  ClipboardList,
  FileText,
  ListChecks,
  Network,
  Paperclip,
  ShieldCheck,
  Timer,
} from 'lucide-react';

/** These links open module lists; their read requirements match the entry routes. */
export const workbenchEntries = [
  { key: 'rules', path: '/rules', icon: ListChecks },
  { key: 'calendars', path: '/calendars', icon: CalendarDays },
  { key: 'periods', path: '/periods', icon: Timer },
  { key: 'templates', path: '/templates', icon: FileText },
  { key: 'filePolicies', path: '/filePolicies', icon: ShieldCheck },
  { key: 'organizations', path: '/organizations', icon: Network },
  { key: 'grants', path: '/grants', icon: ClipboardList },
  { key: 'files', path: '/files', icon: Paperclip },
  { key: 'processes', path: '/workflows', icon: Network },
] as const;
