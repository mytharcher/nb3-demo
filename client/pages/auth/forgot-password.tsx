import { usePasswordResetCapability } from '@nocobase/app-plugin-authentication/client';
import { usePasswordResetRequest } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PasswordResetRequestForm } from '#extensions/nocobase-auth-forms/password-reset-request-form';

import { AuthPage } from './shared.js';
import { AuthFormStatus } from '#extensions/nocobase-auth-forms/form-parts';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

export default function ForgotPasswordPage(): ReactElement {
  const { t } = useTranslation();
  const request = usePasswordResetRequest();
  const capability = usePasswordResetCapability();

  return (
    <AuthPage
      description={
        capability.data?.passwordResetAvailable === false
          ? ''
          : t('auth.forgotDescription')
      }
      title={t('auth.forgotTitle')}
    >
      {capability.isPending ? (
        <Skeleton className='h-48' aria-label={t('auth.loading')} />
      ) : capability.isError ? (
        <div className='flex flex-col gap-4'>
          <AuthFormStatus type='error'>
            {t('auth.capabilityLoadFailed')}
          </AuthFormStatus>
          <Button variant='outline' onClick={() => void capability.refetch()}>
            {t('auth.retry')}
          </Button>
        </div>
      ) : capability.data?.passwordResetAvailable !== true ? (
        <div className='flex flex-col gap-4'>
          <AuthFormStatus type='error'>
            {t('auth.passwordResetUnavailable')}
          </AuthFormStatus>
          <p className='text-center text-sm text-muted-foreground'>
            {t('auth.rememberPassword')}{' '}
            <Link to='/login'>{t('auth.signIn')}</Link>
          </p>
        </div>
      ) : (
        <PasswordResetRequestForm
          error={request.error?.message}
          footer={
            <>
              {t('auth.rememberPassword')}{' '}
              <Link to='/login'>{t('auth.signIn')}</Link>
            </>
          }
          labels={{
            email: t('auth.email'),
            submit: t('auth.sendResetLink'),
            submitting: t('auth.sending'),
            success: t('auth.resetSent'),
          }}
          onSubmit={request.submit}
          submitting={request.isPending}
          success={request.isSuccess}
        />
      )}
    </AuthPage>
  );
}
