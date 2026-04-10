import { Router, Request, Response } from 'express';
import { User } from '../models/User.js';
import { Contact } from '../models/Contact.js';
import {
  sanitizeContactRow,
  MAX_IMPORT_BATCH,
  type SanitizedContactRow,
} from '../lib/contactsImportValidation.js';

export const contactsRouter = Router();

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
