/** Linked contact rows and device ids on a deal document (Mongo lean / plain object). */

export type ClientLinkedContact = { device_contact_id: string; display_name: string };

export function linkedContactsForResponse(doc: Record<string, unknown>): ClientLinkedContact[] {
  const raw = doc.linkedContacts;
  if (Array.isArray(raw) && raw.length > 0) {
    const out: ClientLinkedContact[] = [];
    for (const item of raw) {
      if (item === null || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const id = String(o.deviceContactId ?? '').trim();
      if (!id) continue;
      out.push({
        device_contact_id: id,
        display_name: String(o.displayName ?? ''),
      });
    }
    return out;
  }
  const legacyId = String(doc.contactDeviceId ?? '').trim();
  if (legacyId) {
    return [
      {
        device_contact_id: legacyId,
        display_name: String(doc.contactName ?? ''),
      },
    ];
  }
  return [];
}

export function collectLinkedDeviceIdsFromDealDoc(doc: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const row of linkedContactsForResponse(doc)) {
    if (row.device_contact_id) ids.add(row.device_contact_id);
  }
  return [...ids];
}
