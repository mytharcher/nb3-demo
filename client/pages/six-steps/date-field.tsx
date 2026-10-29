import { useState } from 'react';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { CalendarIcon } from 'lucide-react';
import { enUS, zhCN } from 'react-day-picker/locale';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '#components/ui/popover';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';

/** Instants are explicitly entered in UTC; business timezone remains a separate approved value. */
export default function DateField({
  field,
  invalid,
  onChange,
}: {
  field: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('');
  const [open, setOpen] = useState(false);
  const instant = field !== 'start' && field !== 'end';
  function value(selected: Date | undefined, clock: string) {
    const day = selected
      ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`
      : '';
    return day && (!instant || clock)
      ? instant
        ? `${day}T${clock.length === 5 ? `${clock}:00` : clock}Z`
        : day
      : '';
  }
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <input type='hidden' name={field} value={value(date, time)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={`ss-${field}`}
              variant='outline'
              aria-invalid={invalid}
              className='justify-start'
            />
          }
        >
          <CalendarIcon />
          {date ? date.toLocaleDateString(locale) : t('sixSteps.chooseDate')}
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <Calendar
            locale={locale.startsWith('zh') ? zhCN : enUS}
            labels={{
              labelNext: () => t('sixSteps.nextMonth'),
              labelPrevious: () => t('sixSteps.previousMonth'),
              labelMonthDropdown: () => t('sixSteps.chooseMonth'),
              labelYearDropdown: () => t('sixSteps.chooseYear'),
              labelDayButton: (day) =>
                day.toLocaleDateString(locale, { dateStyle: 'full' }),
            }}
            mode='single'
            selected={date}
            onSelect={(next) => {
              setDate(next);
              setOpen(false);
              onChange(value(next, time));
            }}
            captionLayout='dropdown'
            startMonth={new Date(2000, 0)}
            endMonth={new Date(2100, 11)}
          />
        </PopoverContent>
      </Popover>
      {instant ? (
        <>
          <Input
            type='time'
            step='1'
            className='w-40'
            value={time}
            aria-label={t('sixSteps.utcTime', {
              field: t(`sixSteps.fields.${field}`),
            })}
            onChange={(e) => {
              setTime(e.target.value);
              onChange(value(date, e.target.value));
            }}
          />
          <span className='text-sm text-muted-foreground'>UTC</span>
        </>
      ) : null}
    </div>
  );
}
