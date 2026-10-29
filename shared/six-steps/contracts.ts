import { z } from 'zod';

/** Stable domain reason IDs; receipt/auth/validator infrastructure retains its own IDs. */
export const sixStepErrorReasons = [
  'CONFIGURATION_INVALID',
  'CONFIGURATION_NOT_READY',
  'DECISION_REQUIRED',
  'VERSION_CONFLICT',
  'VERSION_IMMUTABLE',
  'RULE_INVALID',
  'RULE_WINDOW_OVERLAP',
  'SCORE_INVALID',
  'SCORE_BASIS_REQUIRED',
  'SCORE_REFERENCE_MISMATCH',
  'SCORE_TOTAL_MISMATCH',
  'CALENDAR_INVALID',
  'CALENDAR_COVERAGE_MISSING',
  'PERIOD_INVALID',
  'PERIOD_CLOSED',
  'GRANT_UNAVAILABLE',
  'ORGANIZATION_INVALID',
  'ORGANIZATION_NOT_READY',
  'PARTICIPANT_INACTIVE',
  'CONFLICT_OF_INTEREST',
  'FILE_ACCESS_DENIED',
  'FILE_NOT_SAFE',
  'FILE_POLICY_REJECTED',
  'FILE_DIGEST_MISMATCH',
  'SCAN_EVIDENCE_REQUIRED',
  'SCAN_FAILED',
  'NOTIFICATION_NOT_FOUND',
  'NOTIFICATION_NOT_READY',
  'RECIPIENTS_REQUIRED',
  'INVALID_SORT',
  'BODY_TOO_LARGE',
] as const;
export type SixStepErrorReason = (typeof sixStepErrorReasons)[number];

export const kinds = [
  'rules',
  'calendars',
  'periods',
  'templates',
  'filePolicies',
  'organizations',
] as const;
export const kindSchema = z.enum(kinds);
export type Kind = z.infer<typeof kindSchema>;
export const evidenceSchema = z.strictObject({
  source: z.string().trim().min(1).max(2000),
  approvedBy: z.string().trim().min(1).max(255),
  approvedAt: z.iso.datetime(),
  decisions: z.array(z.string().regex(/^DEC-(0[1-9]|1[0-3])$/)).min(1),
});
export const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
});
const decimal = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/);
export const ruleSchema = z.strictObject({
  scope: z.enum(['monthly', 'annual']),
  effectiveFrom: z.iso.datetime(),
  effectiveUntil: z.iso.datetime(),
  precision: z.number().int().min(0).max(6),
  rounding: z.enum(['halfUp', 'truncate']),
  total: decimal,
  aggregation: z.literal('sumIncludedWeights'),
  items: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        title: z.string().min(1),
        max: decimal,
        basisRequired: z.literal(true),
      }),
    )
    .min(1)
    .max(200),
  evidence: evidenceSchema.nullable(),
});
export const calendarSchema = z.strictObject({
  timezone: timezoneSchema,
  start: z.iso.date(),
  end: z.iso.date(),
  days: z
    .array(
      z.strictObject({
        date: z.iso.date(),
        working: z.boolean(),
        reason: z.string().min(1),
      }),
    )
    .min(1)
    .max(3660),
  evidence: evidenceSchema.nullable(),
});
export const periodSchema = z.strictObject({
  type: z.enum(['monthly', 'annual']),
  label: z.string().min(1),
  timezone: timezoneSchema,
  opensAt: z.iso.datetime(),
  closesAt: z.iso.datetime(),
  calendarVersionId: z.uuid(),
  evidence: evidenceSchema.nullable(),
});
export const filePolicySchema = z.strictObject({
  extensions: z.array(z.enum(['pptx', 'pdf', 'docx', 'xlsx'])).min(1),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024),
  scanRequired: z.literal(true),
  evidence: evidenceSchema.nullable(),
});
export const templateSchema = z.strictObject({
  fileVersionId: z.uuid(),
  effectiveFrom: z.iso.datetime(),
  evidence: evidenceSchema.nullable(),
});
export const organizationSchema = z.strictObject({
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  people: z
    .array(
      z.strictObject({
        userId: z.string().min(1),
        name: z.string().min(1),
        departmentId: z.string().min(1),
        departmentName: z.string().min(1),
        managerId: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(10000),
  evidence: evidenceSchema.nullable(),
});
export const payloadSchemas = {
  rules: ruleSchema,
  calendars: calendarSchema,
  periods: periodSchema,
  templates: templateSchema,
  filePolicies: filePolicySchema,
  organizations: organizationSchema,
};
export const createVersionSchema = z.strictObject({
  key: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
  title: z.string().trim().min(1).max(255),
  // The selected kind is validated with its strict schema by the domain service.
  payload: z.json(),
});
export const publishSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  expectedHeadVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(2000),
});
export const versionViewSchema = z.object({
  id: z.string(),
  kind: kindSchema,
  key: z.string(),
  title: z.string(),
  state: z.enum(['draft', 'published']),
  version: z.number(),
  payload: z.json(),
  createdBy: z.string(),
  createdAt: z.string(),
  publishedBy: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
});
export type VersionView = z.infer<typeof versionViewSchema>;
export const grantSchema = z
  .strictObject({
    periodVersionId: z.uuid(),
    userId: z.string().min(1),
    purpose: z.enum(['lateSubmission', 'extension']),
    targetId: z.string().min(1).nullable(),
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime(),
    uses: z.number().int().min(1).max(100),
    reason: z.string().trim().min(1).max(2000),
    evidence: evidenceSchema,
  })
  .superRefine((v, context) => {
    if (Date.parse(v.validFrom) >= Date.parse(v.validUntil))
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'Validity must end after it starts.',
      });
    if (v.purpose === 'extension' && !v.targetId)
      context.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: 'An extension requires an original submission ID.',
      });
  });
export type Rule = z.infer<typeof ruleSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
