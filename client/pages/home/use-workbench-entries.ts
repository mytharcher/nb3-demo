import { ApiClientError } from '@nocobase/app-client';
import { useEffect, useState } from 'react';
import {
  useAuthorizationClient,
  useAuthorizationRevision,
} from '@nocobase/app-plugin-authorization/client';
import { workbenchEntries } from './entries.js';

export function useWorkbenchEntries() {
  const client = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    client: typeof client;
    revision: number;
    attempt: number;
    entries: (typeof workbenchEntries)[number][];
    failed: boolean;
    status?: number;
  }>();
  useEffect(() => {
    let active = true;
    void Promise.all(
      workbenchEntries.map(async (entry) =>
        (await client.can({
          resource: { type: 'settings', id: `sixSteps.${entry.key}` },
          action: 'read',
        }))
          ? entry
          : undefined,
      ),
    ).then(
      (entries) => {
        if (active)
          setResult({
            client,
            revision,
            attempt,
            entries: entries.filter((entry) => entry !== undefined),
            failed: false,
          });
      },
      (error: unknown) => {
        if (active)
          setResult({
            client,
            revision,
            attempt,
            entries: [],
            failed: true,
            status: error instanceof ApiClientError ? error.status : undefined,
          });
      },
    );
    return () => {
      active = false;
    };
  }, [client, revision, attempt]);
  const current =
    result?.client === client &&
    result.revision === revision &&
    result.attempt === attempt;
  return {
    loading: !current,
    failed: current && result.failed,
    status: current ? result.status : undefined,
    entries: current ? result.entries : [],
    retry: () => {
      client.invalidate();
      setAttempt((value) => value + 1);
    },
  };
}
