import { calendarSchema, type Calendar } from './contracts.js';
import { fail } from './errors.js';

export const nextDate = (date: string): string =>
  new Date(Date.parse(`${date}T12:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
export function localDate(instant: Date, timezone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  return `${p.find((i) => i.type === 'year')!.value}-${p.find((i) => i.type === 'month')!.value}-${p.find((i) => i.type === 'day')!.value}`;
}
export function validateCalendar(input: Calendar): Calendar {
  const calendar = calendarSchema.parse(input);
  const days = new Set(calendar.days.map((day) => day.date));
  if (
    calendar.start > calendar.end ||
    days.size !== calendar.days.length ||
    calendar.days.some(
      (day) => day.date < calendar.start || day.date > calendar.end,
    )
  )
    fail('CALENDAR_INVALID');
  for (let date = calendar.start; date <= calendar.end; date = nextDate(date))
    if (!days.has(date)) fail('CALENDAR_COVERAGE_MISSING');
  return calendar;
}
/** Explicit per-date entries represent both holidays and make-up working days. */
export function addWorkingDays(
  input: Calendar,
  instant: Date,
  count: number,
): string {
  const calendar = validateCalendar(input);
  if (!Number.isInteger(count) || count < 0) fail('CALENDAR_INVALID');
  let date = localDate(instant, calendar.timezone);
  const days = new Map(calendar.days.map((day) => [day.date, day.working]));
  if (!days.has(date)) fail('CALENDAR_COVERAGE_MISSING');
  while (count > 0) {
    date = nextDate(date);
    const working = days.get(date);
    if (working === undefined) fail('CALENDAR_COVERAGE_MISSING');
    if (working) count--;
  }
  return date;
}
