// Solapi v4 SMS 발송 — HMAC-SHA256 인증
// 발신번호는 사전 등록된 번호만 사용 가능 (SOLAPI_SENDER)
// 한국 휴대폰 번호는 하이픈 제거하여 발송

import crypto from 'node:crypto';

const API_BASE = 'https://api.solapi.com';

function authHeader() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('SOLAPI_API_KEY 또는 SOLAPI_API_SECRET 미설정');
  }
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function normalizePhone(phone) {
  return String(phone).replace(/[^0-9]/g, '');
}

// 단일 발송
// subject: LMS 제목 (한글 ~20자 / 40 bytes 권장). 값이 있으면 Solapi가 자동으로 LMS로 분류.
// country: 해외 국가코드 ('81' 등, '+' 없이 숫자만). 있으면 message.country 세팅 + subject 무시
//          (해외는 SMS만 지원되므로 subject가 붙으면 LMS로 분류돼 거절됨).
// 반환: { ok: boolean, messageId?: string, error?: string, raw: any }
export async function sendSms({ to, text, subject = null, country = null }) {
  const from = process.env.SOLAPI_SENDER;
  if (!from) {
    return { ok: false, messageId: null, error: 'SOLAPI_SENDER 미설정', raw: null };
  }
  const cleanedTo = normalizePhone(to);
  if (!cleanedTo) {
    return { ok: false, messageId: null, error: '수신번호 형식 오류', raw: { to } };
  }

  const message = { to: cleanedTo, from: normalizePhone(from), text };
  if (country) {
    // 해외: country 세팅 + subject 강제 무시 (LMS 자동 분류 방지)
    message.country = String(country);
  } else if (subject && String(subject).trim()) {
    // 국내: 빈 문자열은 미지정과 동일하게 처리 (Solapi가 빈 subject를 LMS로 강제하지 않게)
    message.subject = String(subject).trim();
  }

  let res;
  let data;
  try {
    res = await fetch(`${API_BASE}/messages/v4/send`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    data = await res.json();
  } catch (e) {
    return { ok: false, messageId: null, error: `네트워크 오류: ${e.message}`, raw: null };
  }

  if (!res.ok) {
    const errMsg =
      data?.message ||
      data?.errorMessage ||
      data?.errorCode ||
      `HTTP ${res.status}`;
    return { ok: false, messageId: null, error: errMsg, raw: data };
  }

  // v4 응답: { messageId, statusCode, ... } 또는 그룹/큐 형식
  const messageId = data?.messageId || data?.groupId || null;
  // statusCode '2000' 계열이 성공
  const statusCode = data?.statusCode || '';
  if (statusCode && !String(statusCode).startsWith('2')) {
    return {
      ok: false,
      messageId,
      error: `Solapi statusCode=${statusCode}: ${data?.statusMessage || ''}`,
      raw: data,
    };
  }
  return { ok: true, messageId, error: null, raw: data };
}
