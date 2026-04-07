import { Router, Request, Response } from 'express';
import { ExportLog } from '../models/ExportLog.js';

export const exportRouter = Router();

exportRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { format, scale, quality } = req.body;

    const formatStr = String(format ?? 'png').toLowerCase();
    const scaleNum = Number(scale ?? 1);
    const qualityNum = Number(quality ?? 90);

    await ExportLog.create({
      format: formatStr,
      scale: scaleNum,
      quality: qualityNum,
    });

    res.status(200).json({
      success: true,
      export: {
        format: formatStr,
        scale: scaleNum,
        quality: qualityNum,
        url: `/exports/sample.${formatStr}`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});
