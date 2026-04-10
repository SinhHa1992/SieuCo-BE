import { Router, Request, Response } from 'express';
import { User } from '../models/User.js';
import { Contact } from '../models/Contact.js';
import { Deal } from '../models/Deal.js';
import {
  sanitizeContactRow,
  MAX_IMPORT_BATCH,
  type SanitizedContactRow,
} from '../lib/contactsImportValidation.js';
import { topContactsByDeals } from '../lib/contactDealAggregation.js';

export const contactsRouter = Router();

/** Up to 3 contacts linked to the most deals, with deal_count and profile fields. */
contactsRouter.get('/top-by-deals', async (req: Request, res: Response) => {
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
    const list = await Deal.find({ userEmail: normalized }).lean().exec();
    const stats = topContactsByDeals(list as Record<string, unknown>[], 3);
    if (stats.length === 0) {
      res.json([]);
      return;
    }
    const ids = stats.map((s) => s.deviceContactId);
    const rows = await Contact.find({ userEmail: normalized, deviceContactId: { $in: ids } })
      .select('deviceContactId displayName jobTitle company phones emails gender')
      .lean()
      .exec();
    const byId = new Map(
      rows.map((r) => {
        const c = r as {
          deviceContactId: string;
          displayName?: string;
          jobTitle?: string;
          company?: string;
          phones?: string[];
          emails?: string[];
          gender?: string;
        };
        return [
          String(c.deviceContactId),
          {
            display_name: String(c.displayName ?? ''),
            job_title: String(c.jobTitle ?? ''),
            company: String(c.company ?? ''),
            phones: Array.isArray(c.phones) ? c.phones.map(String) : [],
            emails: Array.isArray(c.emails) ? c.emails.map(String) : [],
            gender: String(c.gender ?? ''),
          },
        ];
      })
    );
    const out = stats.map((stat) => {
      const c = byId.get(stat.deviceContactId);
      const displayName =
        c?.display_name?.trim() ? c.display_name : stat.fallbackDisplayName || 'Liên hệ';
      const phones = c?.phones ?? [];
      const gender = c?.gender ?? '';
      return {
        device_contact_id: stat.deviceContactId,
        display_name: displayName,
        job_title: c?.job_title ?? '',
        company: c?.company ?? '',
        phones,
        emails: c?.emails ?? [],
        gender,
        deal_count: stat.dealCount,
      };
    });
    res.json(out);
  } catch (err) {
    console.error('GET /contacts/top-by-deals error:', err);
    res.status(500).json({ error: 'Failed to fetch top contacts' });
  }
});

contactsRouter.get('/', async (req: Request, res: Response) => {
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
    const list = await Contact.find({ userEmail: normalized })
      .sort({ displayName: 1 })
      .lean()
      .exec();
    res.json(list);
  } catch (err) {
    console.error('GET /contacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

contactsRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const userEmailRaw = req.body?.userEmail;
    const contactsRaw = req.body?.contacts;
    if (typeof userEmailRaw !== 'string' || !userEmailRaw.trim()) {
      res.status(400).json({ error: 'userEmail is required' });
      return;
    }
    if (!Array.isArray(contactsRaw)) {
      res.status(400).json({ error: 'contacts must be an array' });
      return;
    }
    if (contactsRaw.length > MAX_IMPORT_BATCH) {
      res.status(400).json({ error: `At most ${MAX_IMPORT_BATCH} contacts per request` });
      return;
    }

    const normalizedEmail = userEmailRaw.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const sanitized: SanitizedContactRow[] = [];
    for (const row of contactsRaw) {
      const s = sanitizeContactRow(row);
      if (s) sanitized.push(s);
    }

    if (sanitized.length === 0) {
      res.status(400).json({ error: 'No valid contacts to import' });
      return;
    }

    const bulk = sanitized.map((c) => ({
      updateOne: {
        filter: { userEmail: normalizedEmail, deviceContactId: c.deviceContactId },
        update: {
          $set: {
            userEmail: normalizedEmail,
            deviceContactId: c.deviceContactId,
            displayName: c.displayName,
            jobTitle: c.jobTitle,
            company: c.company,
            phones: c.phones,
            emails: c.emails,
            gender: c.gender,
          },
        },
        upsert: true,
      },
    }));

    const result = await Contact.bulkWrite(bulk, { ordered: false });

    res.status(200).json({
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
      imported: sanitized.length,
    });
  } catch (err) {
    console.error('POST /contacts/import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});
