import net from 'net';
import os from 'os';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database.js';
import { exportRouter } from './routes/export.js';
import { designsRouter } from './routes/designs.js';
import { authRouter } from './routes/auth.js';
import { meetingRouter } from './routes/meeting.js';
import { contactsRouter } from './routes/contacts.js';
import { dealsRouter } from './routes/deals.js';

dotenv.config();

function lanBaseUrls(port: number): string[] {
  const ifs = os.networkInterfaces();
  const out: string[] = [];
  for (const addrs of Object.values(ifs)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.internal || !net.isIPv4(a.address)) continue;
      out.push(`http://${a.address}:${port}`);
    }
  }
  return out;
}

const app = express();
const PORT = process.env.PORT ?? 3002;
const HOST = process.env.HOST ?? '0.0.0.0';

app.use(cors());
// Google Contacts import can send large batches (see MAX_IMPORT_BATCH); default 100kb is too small.
app.use(express.json({ limit: '12mb' }));

app.use('/api/auth', authRouter);
app.use('/api/export', exportRouter);
app.use('/api/designs', designsRouter);
app.use('/api/meeting', meetingRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/deals', dealsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

connectDB()
  .then(() => {
    app.listen(Number(PORT), HOST, () => {
      const p = Number(PORT);
      console.log(`Design Export API running on http://localhost:${p}`);
      if (HOST === '0.0.0.0') {
        const lan = lanBaseUrls(p);
        if (lan.length > 0) {
          console.log('On your phone (same Wi‑Fi), use one of:');
          for (const u of lan) console.log(`  ${u}`);
        }
        console.log(
          'If the phone cannot connect, allow TCP port 3002 in Windows Firewall for Private networks.'
        );
      }
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
