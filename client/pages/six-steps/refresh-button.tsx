import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import { Button } from '#components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
export default function RefreshButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            disabled={busy}
            aria-label={t('sixSteps.refresh')}
            onClick={onClick}
          />
        }
      >
        <RefreshCw className={busy ? 'animate-spin' : undefined} />
      </TooltipTrigger>
      <TooltipContent>{t('sixSteps.refresh')}</TooltipContent>
    </Tooltip>
  );
}
