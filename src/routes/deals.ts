import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Deal } from '../models/Deal.js';
import { Contact } from '../models/Contact.js';
import type { IDealLinkedContact } from '../models/Deal.js';
import {
  normalizeDealStatus,
  trimStr,
  sanitizeContactDeviceIds,
} from '../lib/dealsValidation.js';

export const dealsRouter = Router();

const MAX_LEN = 50000;

type ClientLinkedContact = { device_contact_id: string; display_name: string };

type ContactHydrated = {
  displayName: string;
  jobTitle: string;
  company: string;
  phones: string[];
  emails: string[];
};

type ClientLinkedContactDetail = {
  device_contact_id: string;
  display_name: string;
  job_title: string;
  company: string;
  phones: string[];
  emails: string[];
};

function linkedContactsForResponse(doc: Record<string, unknown>): ClientLinkedContact[] {
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

function collectLinkedDeviceIdsFromDealDoc(doc: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const row of linkedContactsForResponse(doc)) {
    if (row.device_contact_id) ids.add(row.device_contact_id);
  }
  return [...ids];
}

async function loadContactMap(userEmail: string, ids: string[]): Promise<Map<string, ContactHydrated>> {
  if (ids.length === 0) return new Map();
  const rows = await Contact.find({ userEmail, deviceContactId: { $in: ids } })
    .select('deviceContactId displayName jobTitle company phones emails')
    .lean()
    .exec();
  return new Map(
    rows.map((r) => {
      const c = r as {
        deviceContactId: string;
        displayName?: string;
        jobTitle?: string;
        company?: string;
        phones?: string[];
        emails?: string[];
      };
      return [
        String(c.deviceContactId),
        {
          displayName: String(c.displayName ?? ''),
          jobTitle: String(c.jobTitle ?? ''),
          company: String(c.company ?? ''),
          phones: Array.isArray(c.phones) ? c.phones.map(String) : [],
          emails: Array.isArray(c.emails) ? c.emails.map(String) : [],
        } satisfies ContactHydrated,
      ];
    })
  );
}

function buildLinkedContactsDetail(
  plain: Record<string, unknown>,
  contactById: Map<string, ContactHydrated>
): ClientLinkedContactDetail[] {
  return linkedContactsForResponse(plain).map((r) => {
    const c = contactById.get(r.device_contact_id);
    return {
      device_contact_id: r.device_contact_id,
      display_name: c?.displayName?.trim() ? c.displayName : r.display_name,
      job_title: c?.jobTitle ?? '',
      company: c?.company ?? '',
      phones: c?.phones ?? [],
      emails: c?.emails ?? [],
    };
  });
}

type DealLean = {
  _id: mongoose.Types.ObjectId;
  userEmail: string;
  transcript: string;
  nguoiQuyetDinh: string;
  nhuCau: string;
  nganSach: number | null;
  timeline: string;
  status: string;
  linkedContacts?: IDealLinkedContact[];
  contactDeviceId?: string;
  contactName?: string;
  createdAt: Date;
};

function toClientDeal(doc: DealLean, contactById: Map<string, ContactHydrated>) {
  const plain = doc as unknown as Record<string, unknown>;
  return {
    id: doc._id.toString(),
    user_email: doc.userEmail,
    created_at: doc.createdAt.toISOString(),
    transcript: doc.transcript,
    nguoiQuyetDinh: doc.nguoiQuyetDinh,
    nhuCau: doc.nhuCau,
    nganSach: doc.nganSach,
    timeline: doc.timeline,
    status: doc.status,
    linked_contacts: buildLinkedContactsDetail(plain, contactById),
  };
}

async function resolveLinkedContacts(
  userEmail: string,
  ids: string[]
): Promise<IDealLinkedContact[]> {
  if (ids.length === 0) return [];
  const found = await Contact.find({
    userEmail,
    deviceContactId: { $in: ids },
  })
    .select('deviceContactId displayName')
    .lean()
    .exec();
  const byId = new Map(found.map((c) => [String(c.deviceContactId), String(c.displayName ?? '')]));
  const out: IDealLinkedContact[] = [];
  for (const id of ids) {
    if (!byId.has(id)) {
      throw new Error('CONTACT_NOT_FOUND');
    }
    out.push({ deviceContactId: id, displayName: byId.get(id)! });
  }
  return out;
}

dealsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userEmail = typeof req.query.userEmail === 'string' ? req.query.userEmail.trim() : '';
    if (!userEmail) {
      res.status(400).json({ error: 'userEmail is required' });
      return;
    }
    const normalized = userEmail.toLowerCase();
    const user = await User.findOne({ email: normalized });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const list = await Deal.find({ userEmail: normalized })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const allIds = new Set<string>();
    for (const d of list) {
      for (const id of collectLinkedDeviceIdsFromDealDoc(d as Record<string, unknown>)) {
        allIds.add(id);
      }
    }
    const contactById = await loadContactMap(normalized, [...allIds]);
    res.json(list.map((d) => toClientDeal(d as DealLean, contactById)));
  } catch (err) {
    console.error('GET /deals error:', err);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

dealsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userEmailRaw = req.body?.userEmail;
    if (typeof userEmailRaw !== 'string' || !userEmailRaw.trim()) {
      res.status(400).json({ error: 'userEmail is required' });
      return;
    }
    const normalized = userEmailRaw.trim().toLowerCase();
    const user = await User.findOne({ email: normalized });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const transcript = trimStr(req.body?.transcript, MAX_LEN);
    const nguoiQuyetDinh = trimStr(req.body?.nguoiQuyetDinh, 2000);
    const nhuCau = trimStr(req.body?.nhuCau, 5000);
    const timeline = trimStr(req.body?.timeline, 500);
    let nganSach: number | null = null;
    if (req.body?.nganSach != null && req.body.nganSach !== '') {
      const n = Number(req.body.nganSach);
      if (!Number.isFinite(n)) {
        res.status(400).json({ error: 'nganSach must be a number' });
        return;
      }
      nganSach = n;
    }
    const status = normalizeDealStatus(req.body?.status);

    const idList = sanitizeContactDeviceIds(
      req.body?.contactDeviceIds ?? req.body?.contact_device_ids
    );

    let linkedContacts: IDealLinkedContact[] = [];
    try {
      linkedContacts = await resolveLinkedContacts(normalized, idList);
    } catch (e) {
      if ((e as Error).message === 'CONTACT_NOT_FOUND') {
        res.status(400).json({ error: 'Một hoặc nhiều liên hệ không tồn tại' });
        return;
      }
      throw e;
    }

    const created = await Deal.create({
      userEmail: normalized,
      transcript,
      nguoiQuyetDinh,
      nhuCau,
      nganSach,
      timeline,
      status,
      linkedContacts,
      contactDeviceId: '',
      contactName: '',
    });

    const doc = created.toObject();
    const ids = collectLinkedDeviceIdsFromDealDoc(doc as unknown as Record<string, unknown>);
    const contactById = await loadContactMap(normalized, ids);
    res.status(201).json(toClientDeal(doc as DealLean, contactById));
  } catch (err) {
    console.error('POST /deals error:', err);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

dealsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid deal id' });
      return;
    }
    const userEmailRaw = req.body?.userEmail;
    if (typeof userEmailRaw !== 'string' || !userEmailRaw.trim()) {
      res.status(400).json({ error: 'userEmail is required' });
      return;
    }
    const normalized = userEmailRaw.trim().toLowerCase();
    const user = await User.findOne({ email: normalized });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const $set: Record<string, unknown> = {};
    if (req.body?.status !== undefined) {
      $set.status = normalizeDealStatus(req.body?.status);
    }
    if (
      req.body?.contactDeviceIds !== undefined ||
      req.body?.contact_device_ids !== undefined
    ) {
      const idList = sanitizeContactDeviceIds(
        req.body?.contactDeviceIds ?? req.body?.contact_device_ids
      );
      try {
        $set.linkedContacts = await resolveLinkedContacts(normalized, idList);
      } catch (e) {
        if ((e as Error).message === 'CONTACT_NOT_FOUND') {
          res.status(400).json({ error: 'Một hoặc nhiều liên hệ không tồn tại' });
          return;
        }
        throw e;
      }
      $set.contactDeviceId = '';
      $set.contactName = '';
    }

    if (Object.keys($set).length === 0) {
      res.status(400).json({ error: 'Không có trường để cập nhật' });
      return;
    }

    const updated = await Deal.findOneAndUpdate(
      { _id: id, userEmail: normalized },
      { $set },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
    const ids = collectLinkedDeviceIdsFromDealDoc(updated as Record<string, unknown>);
    const contactById = await loadContactMap(normalized, ids);
    res.json(toClientDeal(updated as DealLean, contactById));
  } catch (err) {
    console.error('PATCH /deals/:id error:', err);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});
