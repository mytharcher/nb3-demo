import { useAuthenticationErrorResolver } from '@nocobase/app-plugin-authentication/client/actions';
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { LogOut, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar';
import { Spinner } from '#components/ui/spinner';

import { LanguageSwitcher } from './language-switcher.js';

export function UserMenu(): ReactElement {
  const {
    client,
    session,
    isPending: isLoading,
    refresh,
  } = useAuthentication();
  const identity = session?.user
    ? {
        id: session.user.id,
        fullName: session.user.name,
        email: session.user.email,
        avatar: session.user.image ?? undefined,
      }
    : null;
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { t } = useTranslation();
  const toaster = useToaster();
  const resolveError = useAuthenticationErrorResolver();

  const name =
    identity?.fullName ||
    identity?.email ||
    t('account.fallback', { defaultValue: 'Account' });
  const initials = getInitials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={0}
        aria-label={t('account.openMenu', {
          defaultValue: 'Open account menu',
        })}
        className='cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
      >
        <Avatar size='lg'>
          {identity?.avatar ? (
            <AvatarImage src={identity.avatar} alt='' />
          ) : null}
          <AvatarFallback>
            {isLoading ? <UserRound aria-hidden='true' /> : initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <div className='px-2 py-1.5'>
          <p className='truncate text-sm font-medium'>{name}</p>
          {identity?.email ? (
            <p className='truncate text-xs text-muted-foreground'>
              {identity.email}
            </p>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <LanguageSwitcher />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={isLoggingOut}
            onClick={() => {
              void (async () => {
                setIsLoggingOut(true);
                try {
                  // Better Auth returns API failures as data rather than throwing.
                  const result = await client.signOut();
                  if (result.error) {
                    toaster.show({
                      type: 'error',
                      title:
                        resolveError(result.error)?.message ??
                        t('account.signOutFailed', {
                          defaultValue: 'Unable to sign out. Please try again.',
                        }),
                    });
                    return;
                  }
                  await refresh();
                } catch (error) {
                  toaster.show({
                    type: 'error',
                    title:
                      resolveError(error)?.message ??
                      t('account.signOutFailed', {
                        defaultValue: 'Unable to sign out. Please try again.',
                      }),
                  });
                } finally {
                  setIsLoggingOut(false);
                }
              })();
            }}
          >
            {isLoggingOut ? <Spinner /> : <LogOut />}
            {isLoggingOut
              ? t('account.signingOut', { defaultValue: 'Signing out…' })
              : t('account.signOut', { defaultValue: 'Sign out' })}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
