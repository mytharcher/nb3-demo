import { useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';
import {
  createUuid,
  ApiClientError,
  useApiClient,
  useSubmission,
  useToaster,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { z } from 'zod';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import {
  createVersionSchema,
  payloadSchemas,
  grantSchema,
} from '../../../shared/six-steps/contracts.js';
import { fields, jsonFields, numberFields, type Module } from './fields.js';
import { ErrorNotice } from './common.js';
import { useSettingsLeave } from '../settings/hooks.js';
import DateField from './date-field.js';

export default function ConfigurationForm() {
  const { kind, load } = useOutletContext<{
    kind: Module;
    load: () => Promise<void>;
  }>();
  const { t } = useTranslation();
  const api = useApiClient();
  const { session } = useAuthentication();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [dirty, setDirty] = useState(false);
  const [fileSelection, setFileSelection] = useState(createUuid);
  const submission = useSubmission({
    scope: `${session?.user.id}:sixSteps:${kind}:create`,
  });
  const leave = useSettingsLeave(
    dirty,
    submission.submitting || submission.pending,
  );
  function validate(values: Record<string, unknown>) {
    const parsed: Record<string, unknown> = {};
    const fieldErrors: Record<string, string> = {};
    for (const field of fields[kind]) {
      const raw = values[field];
      const text = typeof raw === 'string' ? raw.trim() : '';
      try {
        parsed[field] = jsonFields.has(field)
          ? JSON.parse(text || (field === 'evidence' ? 'null' : '[]'))
          : numberFields.has(field)
            ? text
              ? Number(text)
              : undefined
            : field === 'scanRequired'
              ? text === 'true'
              : field === 'targetId'
                ? text || null
                : text;
      } catch {
        fieldErrors[field] = t('sixSteps.invalidJson');
      }
    }
    const input =
      kind === 'grants'
        ? parsed
        : { key: values.key, title: values.title, payload: parsed };
    if (kind !== 'files') {
      const checks =
        kind === 'grants'
          ? [grantSchema.safeParse(input)]
          : [
              createVersionSchema.safeParse(input),
              payloadSchemas[kind].safeParse(parsed),
            ];
      for (const check of checks)
        if (!check.success)
          for (const issue of check.error.issues) {
            fieldErrors[String(issue.path[0] ?? 'evidence')] = t(
              'sixSteps.invalidField',
              { path: issue.path.join('.') },
            );
          }
    } else if (
      !z.uuid().safeParse(parsed.policyVersionId).success ||
      !(values.file instanceof File) ||
      !values.file.size
    ) {
      fieldErrors.policyVersionId = t('sixSteps.invalidField', {
        path: 'policyVersionId / file',
      });
    }
    return { parsed, input, fieldErrors };
  }
  const submit = async () => {
    const values: Record<string, FormDataEntryValue> = {
      ...Object.fromEntries(new FormData(formRef.current!)),
      fileSelection,
    };
    try {
      const result = await submission.run(
        values,
        async (key, signal, snapshot) => {
          const { parsed, input, fieldErrors } = validate(snapshot);
          setErrors(fieldErrors);
          if (Object.keys(fieldErrors).length) {
            formRef.current
              ?.querySelector<HTMLElement>(`#ss-${Object.keys(fieldErrors)[0]}`)
              ?.focus();
            return;
          }
          if (kind === 'files') {
            const body = new FormData();
            body.set('policyVersionId', String(parsed.policyVersionId));
            body.set('file', snapshot.file);
            return api.request({
              method: 'POST',
              path: 'sixSteps/files',
              body,
              headers: { 'Idempotency-Key': key },
              signal,
            });
          }
          return api.request({
            method: 'POST',
            path: `sixSteps/${kind}`,
            json: input,
            headers: { 'Idempotency-Key': key },
            signal,
          });
        },
      );
      if (!result) return;
      leave.allow();
      toaster.show({ type: 'success', title: t('sixSteps.saved') });
      void load();
      void navigate(
        { pathname: '..', search: location.search },
        { replace: true },
      );
    } catch (cause) {
      setError(cause);
      if (
        cause instanceof ApiClientError &&
        cause.payload &&
        typeof cause.payload === 'object'
      ) {
        const detail: unknown = Reflect.get(cause.payload, 'error');
        const violations: unknown =
          detail && typeof detail === 'object'
            ? Reflect.get(detail, 'fieldViolations')
            : undefined;
        if (Array.isArray(violations)) {
          const mapped: Record<string, string> = {};
          for (const violation of violations) {
            if (!violation || typeof violation !== 'object') continue;
            const path: unknown = Reflect.get(violation, 'field');
            if (typeof path === 'string')
              mapped[path.replace(/^payload\./, '').split('.')[0]] = t(
                'sixSteps.invalidField',
                { path },
              );
          }
          setErrors(mapped);
          formRef.current
            ?.querySelector<HTMLElement>(`#ss-${Object.keys(mapped)[0]}`)
            ?.focus();
        }
      }
    }
  };
  return (
    <RouteChildPage>
      <PageContainer className='max-w-3xl'>
        <PageHeader
          title={t(kind === 'files' ? 'sixSteps.upload' : 'sixSteps.create')}
          description={t(`sixSteps.${kind}`)}
        />
        {error ? <ErrorNotice error={error} /> : null}
        {kind === 'files' ? (
          <p className='text-sm text-muted-foreground'>
            {t('sixSteps.scanBlocked')}
          </p>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{t(`sixSteps.${kind}`)}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              ref={formRef}
              onInput={() => {
                setDirty(true);
                if (Object.keys(errors).length && formRef.current)
                  setErrors(
                    validate(Object.fromEntries(new FormData(formRef.current)))
                      .fieldErrors,
                  );
              }}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <FieldGroup>
                {kind !== 'grants' && kind !== 'files'
                  ? ['key', 'title'].map((field) => (
                      <Field key={field} data-invalid={!!errors[field]}>
                        <FieldLabel htmlFor={`ss-${field}`}>
                          {t(`sixSteps.${field === 'title' ? 'name' : field}`)}{' '}
                          *
                        </FieldLabel>
                        <Input
                          id={`ss-${field}`}
                          name={field}
                          aria-invalid={!!errors[field]}
                        />
                        {errors[field] ? (
                          <FieldError>{errors[field]}</FieldError>
                        ) : null}
                      </Field>
                    ))
                  : null}
                {fields[kind].map((field) => (
                  <Field key={field} data-invalid={!!errors[field]}>
                    <FieldLabel htmlFor={`ss-${field}`}>
                      {t(`sixSteps.fields.${field}`)}
                      {field === 'targetId' ||
                      (field === 'evidence' && kind !== 'grants')
                        ? ''
                        : ' *'}
                    </FieldLabel>
                    {jsonFields.has(field) ? (
                      <Textarea
                        id={`ss-${field}`}
                        name={field}
                        rows={5}
                        aria-invalid={!!errors[field]}
                        placeholder={field === 'evidence' ? 'null' : undefined}
                      />
                    ) : [
                        'start',
                        'end',
                        'effectiveFrom',
                        'effectiveUntil',
                        'opensAt',
                        'closesAt',
                        'validFrom',
                        'validUntil',
                      ].includes(field) ? (
                      <DateField
                        field={field}
                        invalid={!!errors[field]}
                        onChange={(value) => {
                          setDirty(true);
                          if (Object.keys(errors).length && formRef.current)
                            setErrors(
                              validate({
                                ...Object.fromEntries(
                                  new FormData(formRef.current),
                                ),
                                [field]: value,
                              }).fieldErrors,
                            );
                        }}
                      />
                    ) : (
                      <Input
                        id={`ss-${field}`}
                        name={field}
                        inputMode={
                          numberFields.has(field) ? 'numeric' : undefined
                        }
                        aria-invalid={!!errors[field]}
                      />
                    )}
                    <FieldDescription>
                      {t([`sixSteps.hints.${field}`, 'sixSteps.explicitValue'])}
                    </FieldDescription>
                    {errors[field] ? (
                      <FieldError>{errors[field]}</FieldError>
                    ) : null}
                  </Field>
                ))}
                {kind === 'files' ? (
                  <Field>
                    <FieldLabel htmlFor='ss-file'>
                      {t('sixSteps.file')} *
                    </FieldLabel>
                    <Input
                      id='ss-file'
                      name='file'
                      type='file'
                      onChange={() => {
                        setFileSelection(createUuid());
                        setDirty(true);
                      }}
                    />
                  </Field>
                ) : null}
                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    variant='outline'
                    disabled={submission.submitting}
                    onClick={() =>
                      void navigate({ pathname: '..', search: location.search })
                    }
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button type='submit' disabled={submission.submitting}>
                    {t(
                      submission.submitting
                        ? 'sixSteps.saving'
                        : 'sixSteps.create',
                    )}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        {leave.dialog}
      </PageContainer>
    </RouteChildPage>
  );
}
