const ALLOWED_STATUS = new Set(['follow', 'proposal', 'closed']);

export function normalizeDealStatus(raw: unknown): string {
  if (typeof raw !== 'string') return 'follow';
  const s = raw.trim().toLowerCase();
  return ALLOWED_STATUS.has(s) ? s : 'follow';
}

export function trimStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

const MAX_LINKED_CONTACTS = 50;
const MAX_CONTACT_ID_LEN = 256;

/** Unique device ids for deal → contact links; empty array allowed */
export function sanitizeContactDeviceIds(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= MAX_LINKED_CONTACTS) break;
    const id = trimStr(typeof item === 'string' ? item : String(item), MAX_CONTACT_ID_LEN);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
