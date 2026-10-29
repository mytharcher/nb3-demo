import { ruleSchema, type Rule } from './contracts.js';
import { fail } from './errors.js';

const SCALE = 1_000_000n;
function units(value: string): bigint {
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(value)) fail('SCORE_INVALID');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}
function format(
  value: bigint,
  precision: number,
  denominator: bigint,
  rounding: Rule['rounding'],
): string {
  const divisor = denominator * 10n ** BigInt(6 - precision);
  const rounded =
    rounding === 'halfUp'
      ? (value * 2n + divisor) / (divisor * 2n)
      : value / divisor;
  const text = rounded.toString().padStart(precision + 1, '0');
  return precision
    ? `${text.slice(0, -precision)}.${text.slice(-precision)}`
    : text;
}
export function validateRule(input: Rule): Rule {
  const rule = ruleSchema.parse(input);
  if (
    Date.parse(rule.effectiveFrom) >= Date.parse(rule.effectiveUntil) ||
    new Set(rule.items.map((i) => i.id)).size !== rule.items.length ||
    units(rule.total) <= 0n ||
    rule.items.reduce((sum, item) => sum + units(item.max), 0n) !==
      units(rule.total)
  )
    fail('RULE_INVALID');
  return rule;
}
/** Items already contain their weight. No floating point or second weighting. */
export function calculate(ruleInput: Rule, scores: Record<string, string>) {
  const rule = validateRule(ruleInput);
  if (Object.keys(scores).length !== rule.items.length) fail('SCORE_INVALID');
  let sum = 0n;
  for (const item of rule.items) {
    const score = units(scores[item.id] ?? '');
    if (score > units(item.max)) fail('SCORE_INVALID');
    sum += score;
  }
  return {
    raw: format(sum, 6, 1n, 'truncate'),
    formal: format(sum, rule.precision, 1n, rule.rounding),
  };
}
export function average(
  scores: readonly string[],
  maximum: string,
  precision: number,
  rounding: Rule['rounding'],
) {
  if (
    scores.length !== 3 ||
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 6
  )
    fail('SCORE_INVALID');
  const values = scores.map(units);
  if (values.some((v) => v > units(maximum))) fail('SCORE_INVALID');
  const sum = values.reduce((a, b) => a + b, 0n);
  return {
    numerator: sum.toString(),
    denominator: (3n * SCALE).toString(),
    formal: format(sum, precision, 3n, rounding),
  };
}
export function reconsider(
  original: string,
  seats: readonly (string | null)[],
  maximum: string,
  precision: number,
  rounding: Rule['rounding'],
) {
  if (
    seats.length !== 3 ||
    units(original) > units(maximum) ||
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 6
  )
    fail('SCORE_INVALID');
  const scores = seats.filter((s): s is string => s !== null).map(units);
  if (scores.some((s) => s > units(maximum))) fail('SCORE_INVALID');
  return format(
    scores.length ? scores.reduce((a, b) => a + b, 0n) : units(original),
    precision,
    BigInt(scores.length || 1),
    rounding,
  );
}

/** Preserve rational means until the final total; never sum rounded item displays. */
export function calculateReconsideration(
  ruleInput: Rule,
  original: Record<string, string>,
  reviews: Record<string, readonly (string | null)[]>,
) {
  const rule = validateRule(ruleInput);
  calculate(rule, original);
  const ids = new Set(rule.items.map((item) => item.id));
  if (Object.keys(reviews).some((id) => !ids.has(id))) fail('SCORE_INVALID');
  let numerator = 0n;
  const items: Record<
    string,
    { numerator: string; denominator: string; formal: string }
  > = {};
  for (const item of rule.items) {
    const seats = reviews[item.id];
    if (seats && seats.length !== 3) fail('SCORE_INVALID');
    const accepted =
      seats?.filter((score): score is string => score !== null).map(units) ??
      [];
    if (accepted.some((score) => score > units(item.max)))
      fail('SCORE_INVALID');
    const sum = accepted.length
      ? accepted.reduce((a, b) => a + b, 0n)
      : units(original[item.id]);
    const count = BigInt(accepted.length || 1);
    // Three seats permit denominators 1, 2 or 3; six is their exact common denominator.
    numerator += sum * (6n / count);
    items[item.id] = {
      numerator: sum.toString(),
      denominator: (count * SCALE).toString(),
      formal: format(sum, rule.precision, count, rule.rounding),
    };
  }
  return {
    items,
    numerator: numerator.toString(),
    denominator: (6n * SCALE).toString(),
    formal: format(numerator, rule.precision, 6n, rule.rounding),
  };
}

export function validateAIResult(
  rule: Rule,
  expected: { roundId: string; fileVersionId: string; ruleVersionId: string },
  output: {
    roundId: string;
    fileVersionId: string;
    ruleVersionId: string;
    items: Record<string, { score: string; basis: string }>;
    total: string;
  },
) {
  if (
    Object.entries(expected).some(
      ([field, value]) => output[field as keyof typeof expected] !== value,
    )
  )
    fail('SCORE_REFERENCE_MISMATCH');
  if (Object.values(output.items).some((item) => !item.basis.trim()))
    fail('SCORE_BASIS_REQUIRED');
  const calculated = calculate(
    rule,
    Object.fromEntries(
      Object.entries(output.items).map(([id, item]) => [id, item.score]),
    ),
  );
  if (units(calculated.formal) !== units(output.total))
    fail('SCORE_TOTAL_MISMATCH');
  return calculated;
}
