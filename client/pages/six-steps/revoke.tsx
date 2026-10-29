import { useState } from 'react';
import { useApiClient, useSubmission, useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '#components/ui/button';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '#components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { ErrorNotice } from './common.js';
import type { Row } from './index.js';
export default function RevokeGrant({
  row,
  onSaved,
}: {
  row: Row;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { session } = useAuthentication();
  const api = useApiClient();
  const toaster = useToaster();
  const { can } = useCan({
    resource: { type: 'settings', id: 'sixSteps.grants' },
    action: 'revoke',
  });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>();
  const submission = useSubmission({
    scope: `${session?.user.id}:sixSteps:revoke:${row.id}`,
  });
  if (!can) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('uiAudit.actionsFor', {
                name: row.userId ?? row.id,
              })}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-auto min-w-40'>
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant='destructive'
              disabled={row.revoked || !row.remaining}
              onClick={() => setOpen(true)}
            >
              {t('sixSteps.revoke')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!submission.submitting) setOpen(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('sixSteps.revokeTitle', { name: row.userId })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('sixSteps.revokeDescription', { period: row.periodVersionId })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <ErrorNotice error={error} /> : null}
          <Field>
            <FieldLabel htmlFor={`revoke-reason-${row.id}`}>
              {t('sixSteps.fields.reason')}
            </FieldLabel>
            <Input
              id={`revoke-reason-${row.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={t('sixSteps.fields.reason')}
              placeholder={t('sixSteps.fields.reason')}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submission.submitting}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={submission.submitting || !reason.trim()}
              onClick={() => {
                void (async () => {
                  try {
                    const saved = await submission.run(
                      { id: row.id, expectedVersion: row.version, reason },
                      (key, signal, snapshot) =>
                        api.request({
                          method: 'POST',
                          path: `sixSteps/grants/${snapshot.id}/revoke`,
                          headers: { 'Idempotency-Key': key },
                          json: {
                            expectedVersion: snapshot.expectedVersion,
                            reason: snapshot.reason,
                          },
                          signal,
                        }),
                    );
                    if (!saved) return;
                    setOpen(false);
                    toaster.show({
                      type: 'success',
                      title: t('sixSteps.saved'),
                    });
                    void onSaved();
                  } catch (e) {
                    setError(e);
                  }
                })();
              }}
            >
              {t(submission.submitting ? 'sixSteps.saving' : 'sixSteps.revoke')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
