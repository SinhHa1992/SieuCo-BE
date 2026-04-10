import { linkedContactsForResponse, collectLinkedDeviceIdsFromDealDoc } from './dealLinkedContactIds.js';

export type ContactDealStat = {
  deviceContactId: string;
  dealCount: number;
  fallbackDisplayName: string;
};

/** Rank linked contacts by how many distinct deals they appear in; cap at [limit]. */
export function topContactsByDeals(deals: Record<string, unknown>[], limit: number): ContactDealStat[] {
  const dealCounts = new Map<string, number>();
  const idToName = new Map<string, string>();
  for (const deal of deals) {
    const plain = deal as Record<string, unknown>;
    for (const row of linkedContactsForResponse(plain)) {
      const id = row.device_contact_id;
      if (!id) continue;
      const dn = row.display_name.trim();
      if (dn && !idToName.has(id)) idToName.set(id, dn);
    }
    for (const id of collectLinkedDeviceIdsFromDealDoc(plain)) {
      dealCounts.set(id, (dealCounts.get(id) ?? 0) + 1);
    }
  }
  const ranked = [...dealCounts.entries()]
    .map(([deviceContactId, dealCount]) => ({
      deviceContactId,
      dealCount,
      fallbackDisplayName: idToName.get(deviceContactId) ?? '',
    }))
    .sort(
      (a, b) =>
        b.dealCount - a.dealCount ||
        a.deviceContactId.localeCompare(b.deviceContactId)
    );
  const n = Math.max(0, Math.floor(limit));
  return ranked.slice(0, n);
}
