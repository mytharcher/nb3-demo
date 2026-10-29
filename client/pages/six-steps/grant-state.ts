import type { Row } from './index.js';
export function grantState(row: Row, now = Date.now()) {
  if (row.revoked) return 'revoked';
  if (!row.remaining) return 'exhausted';
  if (now < Date.parse(row.validFrom ?? '')) return 'notStarted';
  if (now > Date.parse(row.validUntil ?? '')) return 'expired';
  return 'available';
}
