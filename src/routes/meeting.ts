import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import https from 'https';
import axios from 'axios';
import FormData from 'form-data';
import OpenAI from 'openai';
import { User } from '../models/User.js';
import { Contact } from '../models/Contact.js';

const router = Router();

// Use axios for Whisper - avoids ECONNRESET from node-fetch (OpenAI SDK)
const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

// Use fresh connections for GPT (smaller requests)
const httpsAgent = new https.Agent({ keepAlive: false });

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && 'cause' in err ? (err.cause as Error) : null;
  const causeMsg = cause?.message ?? '';
  const code = (err as { code?: string })?.code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ECONNRESET') ||
    msg.includes('Connection error') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    causeMsg.includes('ECONNRESET') ||
    (cause as { code?: string })?.code === 'ECONNRESET'
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isRetryableError(err)) {
        console.log(`[meeting] Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

type ContactLean = {
  deviceContactId: string;
  displayName: string;
  jobTitle?: string;
  company?: string;
};

type SuggestionOut = {
  deviceContactId: string;
  displayName: string;
  jobTitle: string;
  company: string;
  reason: string;
};

const MAX_CONTACTS_FOR_AI = 350;

async function suggestDealContacts(
  openai: OpenAI,
  ctx: { transcript: string; nguoiQuyetDinh: string; nhuCau: string; timeline: string },
  contacts: ContactLean[]
): Promise<SuggestionOut[]> {
  if (contacts.length === 0) return [];
  const byId = new Map(contacts.map((c) => [c.deviceContactId, c]));
  const payload = contacts.slice(0, MAX_CONTACTS_FOR_AI).map((c) => ({
    deviceContactId: c.deviceContactId,
    name: c.displayName,
    jobTitle: (c.jobTitle ?? '').slice(0, 200),
    company: (c.company ?? '').slice(0, 200),
  }));

  const suggestResponse = await withRetry(
    () =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Bạn gợi ý liên hệ phù hợp với cơ hội bán từ bản ghi cuộc trao đổi (tiếng Việt).
Danh sách liên hệ là JSON, mỗi phần tử có deviceContactId (bắt buộc giữ nguyên), name, jobTitle, company.
Chỉ được trả về deviceContactId có trong danh sách — không bịa id.
Trả về JSON: { "suggestions": [ { "deviceContactId": "...", "reason": "một câu tiếng Việt" } ] }
Tối đa 10 người, sắp xếp từ phù hợp nhất đến kém hơn. Nếu không ai phù hợp, "suggestions": [].`,
          },
          {
            role: 'user',
            content: `Ngữ cảnh kèo:
- Người quyết định / đối tác (trích xuất): ${ctx.nguoiQuyetDinh}
- Nhu cầu: ${ctx.nhuCau}
- Timeline: ${ctx.timeline}
- Đoạn bản ghi (rút gọn): ${ctx.transcript.slice(0, 6000)}

Danh sách liên hệ:
${JSON.stringify(payload)}`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    3,
    2000
  );

  const raw = suggestResponse.choices[0]?.message?.content;
  if (!raw) return [];
  let parsed: { suggestions?: unknown };
  try {
    parsed = JSON.parse(raw) as { suggestions?: unknown };
  } catch {
    console.error('[meeting] Invalid suggestions JSON:', raw);
    return [];
  }
  const list = parsed.suggestions;
  if (!Array.isArray(list)) return [];

  const out: SuggestionOut[] = [];
  for (const item of list) {
    if (out.length >= 10) break;
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.deviceContactId ?? '').trim();
    if (!id || !byId.has(id)) continue;
    const row = byId.get(id)!;
    out.push({
      deviceContactId: id,
      displayName: row.displayName,
      jobTitle: row.jobTitle ?? '',
      company: row.company ?? '',
      reason: String(o.reason ?? '').trim().slice(0, 500),
    });
  }
  return out;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => {
      const dir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_, file, cb) => {
      cb(null, `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

interface MeetingExtract {
  nguoiQuyetDinh: string;
  nhuCau: string;
  nganSach: number | null;
  timeline: string;
}

router.post('/extract', upload.single('audio'), async (req: Request, res: Response) => {
  // Allow up to 3 minutes for upload + Whisper + GPT processing
  req.setTimeout(180000);
  res.setTimeout(180000);

  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const apiKey = process.env.OPENAI_API_KEY!;
  const openai = new OpenAI({
    apiKey,
    httpAgent: httpsAgent,
  });
  const filePath = req.file.path;
  const fileSize = req.file.size;
  const originalName = req.file.originalname ?? '(unknown)';
  const storedName = path.basename(filePath);

  console.log('[meeting] Extract request received:', {
    originalName,
    storedPath: filePath,
    storedName,
    fileSize,
  });

  try {
    // Validate file has content
    if (!fileSize || fileSize < 1000) {
      return res.status(400).json({
        error: 'File quá nhỏ hoặc trống. Vui lòng ghi âm lại.',
      });
    }

    // 1. Transcribe with Whisper using axios (avoids node-fetch ECONNRESET)
    const filename = path.basename(filePath);
    const transcriptionRes = await withRetry(
      () => {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), {
          filename,
          contentType: 'audio/mp4',
        });
        form.append('model', 'whisper-1');
        form.append('language', 'vi');
        return axios.post(OPENAI_TRANSCRIPTIONS_URL, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120000,
          validateStatus: () => true,
        });
      },
      3,
      2000
    );

    if (transcriptionRes.status !== 200) {
      const errData = transcriptionRes.data?.error ?? transcriptionRes.data;
      const errMsg = typeof errData === 'object' ? errData.message ?? JSON.stringify(errData) : String(errData);
      throw new Error(errMsg || `Whisper API error: ${transcriptionRes.status}`);
    }

    const text = transcriptionRes.data?.text ?? '';

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Không thể nhận diện giọng nói. Vui lòng thử lại với âm thanh rõ hơn.',
      });
    }

    // 2. Extract structured info with GPT - retry on ECONNRESET
    const extractResponse = await withRetry(
      () =>
        openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Bạn là trợ lý trích xuất thông tin từ bản ghi âm cuộc họp kinh doanh (tiếng Việt).
Trả về JSON với đúng các key sau (không thêm key khác):
- nguoiQuyetDinh: Người có quyền quyết định (tên, chức vụ) - string
- nhuCau: Nhu cầu của khách hàng - string
- nganSach: Ngân sách (số tiền VND, ví dụ: 5000000000 cho 5 tỷ, 1000000 cho 1 triệu). Chỉ số, không có dấu phẩy. null nếu không đề cập.
- timeline: Thời gian thực hiện / deadline dạng thời lượng (vd: "3 tháng", "2 tuần", "Q2/2025", "cuối năm"). string, "" nếu không đề cập.

Chỉ trả về JSON thuần, không có markdown hay giải thích.`,
        },
        {
          role: 'user',
          content: `Trích xuất thông tin từ bản ghi sau:\n\n${text}`,
        },
      ],
      response_format: { type: 'json_object' },
        }),
      3,
      2000
    );

    const rawContent = extractResponse.choices[0]?.message?.content;
    if (!rawContent) {
      return res.status(500).json({ error: 'AI extraction failed' });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent) as Record<string, unknown>;
    } catch {
      console.error('GPT returned invalid JSON:', rawContent);
      return res.status(500).json({ error: 'Lỗi phân tích kết quả AI' });
    }
    const rawNganSach = parsed.nganSach;
    let nganSach: number | null = null;
    if (typeof rawNganSach === 'number' && !Number.isNaN(rawNganSach)) {
      nganSach = rawNganSach;
    } else if (typeof rawNganSach === 'string' && rawNganSach.trim()) {
      const s = rawNganSach.toLowerCase();
      const numVal = parseFloat(rawNganSach.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!Number.isNaN(numVal)) {
        if (s.includes('tỷ') || s.includes('ty') || s.includes('billion')) {
          nganSach = numVal * 1e9;
        } else if (s.includes('triệu') || s.includes('million')) {
          nganSach = numVal * 1e6;
        } else if (s.includes('nghìn') || s.includes('ngàn') || s.includes('k')) {
          nganSach = numVal * 1e3;
        } else {
          nganSach = numVal;
        }
      }
    }
    const result = {
      transcript: text,
      nguoiQuyetDinh: String(parsed.nguoiQuyetDinh ?? ''),
      nhuCau: String(parsed.nhuCau ?? ''),
      nganSach,
      timeline: String(parsed.timeline ?? ''),
    };

    let contactSuggestions: SuggestionOut[] = [];
    const userEmailRaw = typeof req.body?.userEmail === 'string' ? req.body.userEmail.trim() : '';
    if (userEmailRaw) {
      const normalized = userEmailRaw.toLowerCase();
      try {
        const user = await User.findOne({ email: normalized }).lean();
        if (user) {
          const contactDocs = await Contact.find({ userEmail: normalized })
            .select('deviceContactId displayName jobTitle company')
            .lean()
            .limit(MAX_CONTACTS_FOR_AI)
            .exec();
          if (contactDocs.length > 0) {
            const lean: ContactLean[] = contactDocs.map((c) => ({
              deviceContactId: String(c.deviceContactId),
              displayName: String(c.displayName ?? ''),
              jobTitle: (c as { jobTitle?: string }).jobTitle,
              company: (c as { company?: string }).company,
            }));
            contactSuggestions = await suggestDealContacts(openai, result, lean);
          }
        }
      } catch (suggestErr) {
        console.error('[meeting] contactSuggestions error:', suggestErr);
      }
    }

    res.json({ ...result, contactSuggestions });
  } catch (err: unknown) {
    console.error('Meeting extract error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Map common API errors to user-friendly messages
    let userMessage = `Lỗi xử lý: ${message}`;
    if (message.includes('Invalid file format') || message.includes('unsupported format')) {
      userMessage = 'Định dạng file không hỗ trợ. Thử ghi âm lại hoặc dùng file mp3/wav.';
    } else if (message.includes('Incorrect API key') || message.includes('invalid_api_key')) {
      userMessage = 'Cấu hình API key không đúng. Liên hệ quản trị viên.';
    } else if (message.includes('Rate limit') || message.includes('rate_limit')) {
      userMessage = 'Quá nhiều yêu cầu. Vui lòng thử lại sau vài phút.';
    } else if (message.includes('Connection error') || message.includes('ECONNRESET')) {
      userMessage =
        'Không kết nối được OpenAI. Kiểm tra mạng, tắt VPN/proxy hoặc thử lại sau.';
    } else if (message.includes('quota') || message.includes('billing')) {
      userMessage = 'Đã hết hạn mức API. Kiểm tra tài khoản OpenAI và thanh toán.';
    }
    res.status(500).json({ error: userMessage });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

export { router as meetingRouter };
