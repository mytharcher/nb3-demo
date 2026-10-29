import type { ReactElement, ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Page-level actions stay beside the title at every viewport width. */
  readonly actions?: ReactNode;
}

/** The heading of a page: its only `h1`, an optional description, and the actions that apply to the whole page. */
export function PageHeader({
  actions,
  description,
  title,
}: PageHeaderProps): ReactElement {
  return (
    <header className='flex items-start justify-between gap-4'>
      <div className='min-w-0'>
        <h1 className='font-heading text-2xl font-semibold tracking-[-0.035em] break-words'>
          {title}
        </h1>
        {description ? (
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className='flex max-w-[50%] shrink-0 flex-wrap items-center justify-end gap-2'>
          {actions}
        </div>
      ) : null}
    </header>
  );
}
