import Busboy from 'busboy';
import { extractRunningData } from '../lib/gemini.js';
import { createRunningRecord } from '../lib/notion.js';

export const config = {
  api: { bodyParser: false }, // multipart는 직접 파싱
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const fields = {};
    let fileBuffer = null;
    let fileMimeType = null;

    bb.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        if (name === 'image') {
          fileBuffer = Buffer.concat(chunks);
          fileMimeType = info.mimeType || 'image/jpeg';
        }
      });
    });
    bb.on('field', (name, value) => {
      fields[name] = value;
    });
    bb.on('finish', () => resolve({ fields, fileBuffer, fileMimeType }));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fields, fileBuffer, fileMimeType } = await parseMultipart(req);
    const challengerId = fields.challengerId;
    if (!challengerId || !fileBuffer) {
      return res.status(400).json({ error: 'image와 challengerId 필요' });
    }

    // 1) OCR
    const data = await extractRunningData({
      imageBase64: fileBuffer.toString('base64'),
      mimeType: fileMimeType,
    });

    // 2) 노션 행 생성 (인증샷은 바이너리로 직접 업로드)
    const result = await createRunningRecord({
      challengerId,
      data,
      imageBuffer: fileBuffer,
      imageMimeType: fileMimeType,
    });

    return res.status(200).json({
      success: true,
      extracted: data,
      notionPageId: result.id,
      // 결과 카드의 CTA는 신규 기록 페이지가 아니라 챌린지 대시보드로 보냄
      // 공개된 노션 대시보드 URL을 환경변수로 주입 (예: https://<workspace>.notion.site/<id>?v=<view>)
      notionUrl: process.env.NOTION_DASHBOARD_URL || '',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
