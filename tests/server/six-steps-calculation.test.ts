import { describe, expect, it } from 'vitest';
import {
  calculate,
  average,
  reconsider,
  calculateReconsideration,
  validateAIResult,
} from '../../server/providers/six-steps/calculation.js';
import {
  addWorkingDays,
  validateCalendar,
} from '../../server/providers/six-steps/calendar.js';
import {
  assertNoConflict,
  materialVisible,
} from '../../server/providers/six-steps/organization.js';
import type {
  Rule,
  Calendar,
} from '../../server/providers/six-steps/contracts.js';

// Synthetic fixture only; this is not a production rule or approved business timezone.
const rule: Rule = {
  scope: 'monthly',
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveUntil: '2027-01-01T00:00:00Z',
  precision: 2,
  rounding: 'halfUp',
  total: '100',
  aggregation: 'sumIncludedWeights',
  items: [{ id: 'item', title: 'Synthetic', max: '100', basisRequired: true }],
  evidence: null,
};
describe('M06 exact scoring structure', () => {
  it('validates evidence and references, and sums raw reconsideration means only once', () => {
    const split = {
      ...rule,
      total: '2',
      items: ['a', 'b'].map((id) => ({
        id,
        title: 'Synthetic',
        max: '1',
        basisRequired: true as const,
      })),
    };
    const total = calculateReconsideration(
      split,
      { a: '0', b: '0' },
      { a: ['0', '0', '1'], b: ['0', '0', '1'] },
    );
    expect(total.items.a!.formal).toBe('0.33');
    expect(total.formal).toBe('0.67'); // 0.333… + 0.333…, never 0.33 + 0.33.
    const references = {
      roundId: 'fixture-round',
      fileVersionId: 'fixture-file',
      ruleVersionId: 'fixture-rule',
    };
    const output = {
      ...references,
      items: { item: { score: '30', basis: 'Synthetic evidence' } },
      total: '30.00',
    };
    expect(validateAIResult(rule, references, output).formal).toBe('30.00');
    expect(() =>
      validateAIResult(rule, references, { ...output, fileVersionId: 'wrong' }),
    ).toThrow('SCORE_REFERENCE_MISMATCH');
    expect(() =>
      validateAIResult(rule, references, { ...output, total: '29' }),
    ).toThrow('SCORE_TOTAL_MISMATCH');
    expect(() =>
      validateAIResult(rule, references, {
        ...output,
        items: { item: { score: '30', basis: '' } },
      }),
    ).toThrow('SCORE_BASIS_REQUIRED');
  });
  it.each(['29.99', '30.00', '85.00', '85.01'])(
    'preserves formal boundary %s without floating point drift',
    (score) => expect(calculate(rule, { item: score }).formal).toBe(score),
  );
  it('rounds once, requires complete values and rejects extra or out-of-range scores', () => {
    expect(calculate(rule, { item: '29.995' }).formal).toBe('30.00');
    expect(() => calculate(rule, {})).toThrow();
    expect(() => calculate(rule, { item: '101' })).toThrow();
    expect(() => calculate(rule, { item: '80', extra: '0' })).toThrow();
    expect(() =>
      calculate(
        { ...rule, items: [...rule.items, ...rule.items] },
        { item: '50' },
      ),
    ).toThrow();
  });
  it('averages exactly three totals; partial seats are refused', () => {
    expect(average(['70', '80', '90'], '100', 2, 'halfUp').formal).toBe(
      '80.00',
    );
    expect(average(['0.1', '0.2', '0.3'], '100', 2, 'halfUp').formal).toBe(
      '0.20',
    );
    expect(() => average(['70', '80'], '100', 2, 'halfUp')).toThrow();
    expect(reconsider('5', ['6', null, '8'], '10', 2, 'halfUp')).toBe('7.00');
    expect(reconsider('5', [null, null, null], '10', 2, 'halfUp')).toBe('5.00');
  });
});
describe('M12 explicit calendar and M02 conflict boundaries', () => {
  const calendar: Calendar = {
    timezone: 'Asia/Singapore',
    start: '2026-10-23',
    end: '2026-10-28',
    evidence: null,
    days: [
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ].map((date, i) => ({
      date,
      working: i === 0 || i > 2,
      reason: 'Synthetic fixture',
    })),
  };
  it('calculates Wednesday after three workdays and handles a make-up Saturday', () => {
    expect(addWorkingDays(calendar, new Date('2026-10-23T12:00:00Z'), 3)).toBe(
      '2026-10-28',
    );
    expect(
      addWorkingDays(
        {
          ...calendar,
          days: calendar.days.map((d) =>
            d.date === '2026-10-24' ? { ...d, working: true } : d,
          ),
        },
        new Date('2026-10-23T12:00:00Z'),
        3,
      ),
    ).toBe('2026-10-27');
    expect(() =>
      addWorkingDays(calendar, new Date('2026-10-23T12:00:00Z'), 4),
    ).toThrow('CALENDAR_COVERAGE_MISSING');
    expect(() =>
      validateCalendar({ ...calendar, days: calendar.days.slice(1) }),
    ).toThrow('CALENDAR_COVERAGE_MISSING');
  });
  it('requires complete non-conflicting identity relationships independent of roles', () => {
    expect(() => assertNoConflict('author', ['author'])).toThrow(
      'CONFLICT_OF_INTEREST',
    );
    expect(() =>
      assertNoConflict('reviewer', ['author'], ['reviewer']),
    ).toThrow();
    const relation = {
      active: true,
      participants: ['author', 'submitter'],
      reviewerId: 'reviewer',
      expertIds: ['expert'],
    };
    for (const id of ['author', 'submitter', 'reviewer', 'expert'])
      expect(materialVisible(id, relation, false)).toBe(true);
    expect(materialVisible('reporter', relation, false)).toBe(false);
    expect(materialVisible('oldExpert', relation, false)).toBe(false);
    expect(materialVisible('admin', { ...relation, active: false }, true)).toBe(
      false,
    );
  });
});
