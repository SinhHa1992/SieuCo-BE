import { Router } from 'express';
import { Design } from '../models/Design.js';

export const designsRouter = Router();

designsRouter.get('/', async (_req, res) => {
  try {
    const designs = await Design.find().sort({ createdAt: -1 });
    res.json(designs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch designs' });
  }
});

designsRouter.post('/', async (req, res) => {
  try {
    const { name, thumbnailUrl } = req.body;
    const design = await Design.create({
      name: name ?? 'Untitled Design',
      thumbnailUrl,
    });
    res.status(201).json(design);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create design' });
  }
});
