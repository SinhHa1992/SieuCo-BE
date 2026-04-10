/** Shared validation/sanitization for contact import payloads (used by routes + tests). */

const MAX_NAME = 500;
const MAX_PHONE = 80;
const MAX_EMAIL = 320;
const MAX_JOB = 300;
const MAX_GENDER = 32;
const MAX_LIST_LEN = 50;

export type SanitizedContactRow = {
  deviceContactId: string;
  displayName: string;
  jobTitle: string;
  company: string;
  phones: string[];
  emails: string[];
  gender: string;
};

function trimStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function trimList(v: unknown, maxLen: number, itemMax: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (out.length >= maxLen) break;
    const s = trimStr(item, itemMax);
    if (s.length > 0) out.push(s);
  }
  return out;
}

function normalizeGender(raw: unknown): string {
  const s = trimStr(raw, MAX_GENDER).toLowerCase();
  if (s === 'male' || s === 'female') return s;
  return '';
}

export function sanitizeContactRow(raw: unknown): SanitizedContactRow | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const deviceContactId = trimStr(o.deviceContactId, 256);
  if (!deviceContactId) return null;
  let displayName = trimStr(o.displayName, MAX_NAME);
  if (!displayName) displayName = 'Không tên';
  const phones = trimList(o.phones, MAX_LIST_LEN, MAX_PHONE);
  const emails = trimList(o.emails, MAX_LIST_LEN, MAX_EMAIL);
  const jobTitle = trimStr(o.jobTitle, MAX_JOB);
  const company = trimStr(o.company, MAX_JOB);
  const gender = normalizeGender(o.gender);
  return { deviceContactId, displayName, jobTitle, company, phones, emails, gender };
}

export const MAX_IMPORT_BATCH = 2000;
