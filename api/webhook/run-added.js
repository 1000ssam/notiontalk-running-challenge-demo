// 노션 자동화 웹훅 — 러닝기록이 추가됐을 때 호출됨
// 1. 헤더 시크릿 검증
// 2. 페이로드에서 페이지 ID 추출 → 러닝기록 페이지 fetch
// 3. 멱등성: 이미 문자발송완료=true 면 스킵
// 4. 챌린저 → 신청자 → 전화번호 traversal
// 5. 진행도 메시지 발송 (Solapi)
// 6. 러닝 횟수 == 7 이고 7회성공 미발송이면 추가 발송
// 7. 발송내역 DB 기록 + 러닝기록.문자발송완료=true

import {
  getRunRecord,
  getChallengerInfo,
  getChallengeInfo,
  countRuns,
  logMessage,
  hasSuccessfulMessage,
  markRunSent,
} from '../../lib/notion-challenge.js';
import { sendSms } from '../../lib/solapi.js';
import { messages } from '../../lib/messages.js';
import { parsePhone } from '../../lib/phone.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ _raw: raw });
      }
    });
    req.on('error', reject);
  });
}

// 노션 자동화 웹훅 페이로드는 형태가 가변적이라 여러 경로 시도
function extractPageId(body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [
    body.id,
    body.page_id,
    body.pageId,
    body?.data?.id,
    body?.page?.id,
    body?.entity?.id,
    body?.payload?.id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length >= 32) return c;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. 시크릿 검증
  const secret = req.headers['x-webhook-secret'] || req.headers['X-Webhook-Secret'];
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'body parse failed', message: e.message });
  }

  const pageId = extractPageId(body);
  if (!pageId) {
    return res.status(400).json({
      error: 'page id not found in payload',
      bodyKeys: Object.keys(body || {}),
    });
  }

  try {
    // 2. 러닝기록 fetch
    const run = await getRunRecord(pageId);

    // 3. 멱등성
    if (run.smsSent) {
      return res.status(200).json({ ok: true, skipped: 'already sent' });
    }
    if (!run.challengerId) {
      return res.status(200).json({ ok: true, skipped: 'no challenger relation' });
    }

    // 4. 챌린저 정보 + 전화번호
    const info = await getChallengerInfo(run.challengerId);
    if (!info.phone) {
      return res.status(200).json({ ok: true, skipped: 'no phone', challengerId: run.challengerId });
    }

    // 5. 러닝 횟수 (이번 러닝 포함) + 챌린지 목표 횟수
    // {target}/{total}이 챌린지 정보 DB값을 따라가도록 두 호출 병렬 실행.
    const [runCount, challenge] = await Promise.all([
      countRuns(run.challengerId),
      getChallengeInfo(),
    ]);
    const target = challenge?.targetCount || 7;

    // 발송 스위치(노션 제어): 크론과 동일하게 '발송 상태'가 '진행'이 아니면 발송 안 함.
    // challenge가 null이어도(정보 없음) sendingEnabled undefined → fail-closed로 차단.
    // 러닝 기록 자체는 이미 저장됨 — 여기서 막는 건 진행도/7회성공 문자 발송뿐.
    if (!challenge?.sendingEnabled) {
      return res.status(200).json({
        ok: true,
        skipped: `발송 중단 상태 (발송 상태=${challenge?.sendStatus || '미설정'})`,
      });
    }

    // 6. 진행도 메시지 발송
    const { to: parsedTo, country } = parsePhone(info.phone);
    const progressMsg = await messages.progress(info.name, runCount, target, 14, { overseas: !!country });
    const progressResult = await sendSms({ to: parsedTo, country, ...progressMsg });

    await logMessage({
      challengerId: run.challengerId,
      runId: pageId,
      type: '진행도',
      trigger: '웹훅',
      body: progressMsg.text,
      status: progressResult.ok ? '성공' : '실패',
      messageId: progressResult.messageId,
      errorMessage: progressResult.error,
      recipientName: info.name,
    });

    // 7. 목표 달성 메시지 (목표 도달 + 미발송 — 추가 인증 시에도 멱등 처리)
    let successSent = false;
    if (runCount >= target) {
      const already = await hasSuccessfulMessage(run.challengerId, '7회성공');
      if (!already) {
        const successMsg = await messages.success(info.name, target, { overseas: !!country });
        const successResult = await sendSms({ to: parsedTo, country, ...successMsg });
        await logMessage({
          challengerId: run.challengerId,
          runId: pageId,
          type: '7회성공',
          trigger: '웹훅',
          body: successMsg.text,
          status: successResult.ok ? '성공' : '실패',
          messageId: successResult.messageId,
          errorMessage: successResult.error,
          recipientName: info.name,
        });
        successSent = true;
      }
    }

    // 8. 진행도 SMS가 성공했을 때만 문자발송완료 표시 (실패 시 다음 webhook/cron 재시도용)
    if (progressResult.ok) {
      await markRunSent(pageId);
    }

    return res.status(200).json({
      ok: true,
      runCount,
      progressSent: progressResult.ok,
      successSent,
    });
  } catch (e) {
    console.error('webhook error:', e);
    return res.status(500).json({ error: 'internal error', message: e.message });
  }
}
