// 챌린지 도메인 전용 노션 헬퍼
// - 챌린저 ↔ 신청자 ↔ 러닝기록 traversal
// - 발송내역 DB 기록/중복검사
// 기존 lib/notion.js 와 동일한 인증·API 버전 사용

import { queryDataSource } from './notion.js';

const API_BASE = 'https://api.notion.com/v1';
const API_VERSION = '2026-03-11';

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': API_VERSION,
  };
}

// 429 Too Many Requests에 한해 Retry-After 기반 backoff + 지터로 재시도 (최대 3회).
async function call(method, path, body, attempt = 0) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429 && attempt < 3) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '1', 10);
    const jitterMs = Math.floor(Math.random() * 300);
    const waitMs = Math.min(retryAfter * 1000, 5000) + jitterMs;
    console.warn(`[notion-challenge] 429 → retry in ${waitMs}ms (attempt ${attempt + 1}) path=${path}`);
    await new Promise((r) => setTimeout(r, waitMs));
    return call(method, path, body, attempt + 1);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Notion ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ── 모듈 레벨 TTL 캐시 ────────────────────────────────────────
// cold start 시 초기화. Vercel warm instance 동안 30 webhook burst를 흡수.
// 챌린지 정보·챌린저 정보·전화번호 등은 거의 안 변함 → 60s 스테일 허용 가능.
const _cache = new Map();
function getCached(key) {
  const c = _cache.get(key);
  if (!c) return undefined;
  if (c.expiresAt < Date.now()) {
    _cache.delete(key);
    return undefined;
  }
  return c.value;
}
function setCached(key, value, ttlMs) {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
const CACHE_TTL_MS = 60 * 1000;

function plainText(rich) {
  if (!Array.isArray(rich)) return '';
  return rich.map((t) => t.plain_text || '').join('');
}

// ── 러닝기록 ───────────────────────────────────────────────
export async function getRunRecord(pageId) {
  const page = await call('GET', `/pages/${pageId}`);
  const props = page.properties;
  return {
    id: page.id,
    challengerId: props['챌린저']?.relation?.[0]?.id || null,
    runDate: props['일시']?.date?.start || null,
    smsSent: props['문자발송완료']?.checkbox || false,
  };
}

export async function markRunSent(runId) {
  return call('PATCH', `/pages/${runId}`, {
    properties: { '문자발송완료': { checkbox: true } },
  });
}

// 챌린저의 러닝 횟수 — 챌린저 DB의 `러닝 횟수` formula 사용 (날짜 고유값 카운트)
// 같은 날 여러 번 인증해도 1회로 집계됨
export async function countRuns(challengerId) {
  const page = await call('GET', `/pages/${challengerId}`);
  const formula = page.properties['러닝 횟수']?.formula;
  if (formula?.type === 'number') return formula.number || 0;
  if (formula?.type === 'string') return parseInt(formula.string, 10) || 0;
  return 0;
}

// 마지막 러닝 일자 (ISO date string YYYY-MM-DD or null)
export async function getLastRunDate(challengerId) {
  const result = await queryDataSource(process.env.NOTION_DS_RUNNING, {
    filter: { property: '챌린저', relation: { contains: challengerId } },
    sorts: [{ property: '일시', direction: 'descending' }],
    page_size: 1,
  });
  return result.results[0]?.properties['일시']?.date?.start || null;
}

// ── 챌린저 + 신청자 ────────────────────────────────────────
export async function getChallenger(challengerId) {
  const page = await call('GET', `/pages/${challengerId}`);
  const props = page.properties;
  return {
    id: page.id,
    name: plainText(props['이름']?.title),
    applicantId: props['신청자']?.relation?.[0]?.id || null,
  };
}

export async function getApplicant(applicantId) {
  const page = await call('GET', `/pages/${applicantId}`);
  const props = page.properties;
  return {
    id: page.id,
    nickname: plainText(props['닉네임']?.title),
    phone: props['전화번호']?.phone_number || null,
    confirmed: props['참여 확정']?.checkbox || false,
  };
}

// 챌린저ID → { name, phone, confirmed } 한 번에
// name은 항상 챌린저 DB의 `이름`(title)을 정본으로 사용. 비어있을 때만 신청자 닉네임으로 fallback.
// 60s TTL 캐시 — 동일 webhook burst 시 동일 challenger 정보 중복 fetch 차단.
export async function getChallengerInfo(challengerId) {
  const cacheKey = `challenger-info:${challengerId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const challenger = await getChallenger(challengerId);
  let info;
  if (!challenger.applicantId) {
    info = {
      challengerId,
      name: challenger.name || '',
      phone: null,
      confirmed: false,
    };
  } else {
    const applicant = await getApplicant(challenger.applicantId);
    info = {
      challengerId,
      applicantId: applicant.id,
      name: challenger.name || applicant.nickname || '',
      phone: applicant.phone,
      confirmed: applicant.confirmed,
    };
  }
  setCached(cacheKey, info, CACHE_TTL_MS);
  return info;
}

// 참여 확정된 신청자 전체 (챌린저ID·전화번호 둘 다 있는 경우만)
// name은 챌린저 DB의 `이름`을 정본으로 사용. 신청자 닉네임은 fallback.
export async function getActiveChallengers() {
  const result = await queryDataSource(process.env.NOTION_DS_APPLICANTS, {
    filter: { property: '참여 확정', checkbox: { equals: true } },
    page_size: 100,
  });

  const draft = result.results
    .map((page) => {
      const props = page.properties;
      return {
        applicantId: page.id,
        challengerId: props['챌린저']?.relation?.[0]?.id || null,
        nickname: plainText(props['닉네임']?.title),
        phone: props['전화번호']?.phone_number || null,
      };
    })
    .filter((c) => c.challengerId && c.phone);

  // 챌린저 페이지를 병렬로 fetch해 정본 `이름` 가져오기
  const challengerNames = await Promise.all(
    draft.map(async (c) => {
      try {
        const page = await call('GET', `/pages/${c.challengerId}`);
        return plainText(page.properties['이름']?.title);
      } catch {
        return '';
      }
    })
  );

  return draft.map((c, i) => ({
    applicantId: c.applicantId,
    challengerId: c.challengerId,
    name: challengerNames[i] || c.nickname,
    phone: c.phone,
  }));
}

// ── 챌린지 정보 ────────────────────────────────────────────
// 60s TTL 캐시 — 챌린지 정보는 거의 안 변하므로 burst 흡수에 효과적.
// 30 webhook 동시 발화 시 노션 호출 30 → 1로 축소.
export async function getChallengeInfo() {
  const cacheKey = 'challenge-info';
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const result = await queryDataSource(process.env.NOTION_DS_CHALLENGE_INFO, {
    page_size: 1,
  });
  const page = result.results[0];
  if (!page) {
    setCached(cacheKey, null, CACHE_TTL_MS);
    return null;
  }
  const props = page.properties;

  // 종료일은 formula 또는 date — 두 형태 모두 대응
  let endDate = null;
  const endProp = props['종료일'];
  if (endProp?.type === 'formula') {
    endDate = endProp.formula?.date?.start || endProp.formula?.string || null;
  } else if (endProp?.type === 'date') {
    endDate = endProp.date?.start || null;
  }

  // 발송 상태(select): 노션에서 크론 발송을 켜고 끄는 스위치.
  // fail-closed — 명시적으로 '진행'일 때만 발송한다. 미설정/'중단'/오타는 모두 발송 차단.
  // 이렇게 해야 기수 시작 시 의도적으로 '진행'을 켜야만 메시지가 나간다(opt-in).
  const sendStatus = props['발송 상태']?.select?.name || null;

  const info = {
    id: page.id,
    name: plainText(props['챌린지명']?.title),
    startDate: props['시작일']?.date?.start || null,
    endDate,
    targetCount: props['목표 횟수']?.number || 7,
    sendStatus,
    sendingEnabled: sendStatus === '진행',
  };
  setCached(cacheKey, info, CACHE_TTL_MS);
  return info;
}

// ── 발송내역 DB ────────────────────────────────────────────
const MSG_TYPES = ['진행도', '독려', '7회성공', '마지막날', '첫날'];
const MSG_TRIGGERS = ['웹훅', '크론'];

export async function logMessage({
  challengerId,
  runId = null,
  type,
  trigger,
  body,
  status,
  messageId = null,
  errorMessage = null,
  recipientName = '',
}) {
  if (!MSG_TYPES.includes(type)) throw new Error(`unknown type: ${type}`);
  if (!MSG_TRIGGERS.includes(trigger)) throw new Error(`unknown trigger: ${trigger}`);
  if (!['성공', '실패'].includes(status)) throw new Error(`unknown status: ${status}`);

  const props = {
    '제목': {
      title: [{ text: { content: `${recipientName || ''} - ${type}`.slice(0, 100) } }],
    },
    '발송일시': { date: { start: new Date().toISOString() } },
    '수신 챌린저': { relation: [{ id: challengerId }] },
    '종류': { select: { name: type } },
    '본문': { rich_text: [{ text: { content: String(body || '').slice(0, 1900) } }] },
    '상태': { select: { name: status } },
    '트리거': { select: { name: trigger } },
  };
  if (runId) props['관련 러닝기록'] = { relation: [{ id: runId }] };
  if (messageId) {
    props['Solapi메시지ID'] = {
      rich_text: [{ text: { content: String(messageId) } }],
    };
  }
  if (errorMessage) {
    props['에러메시지'] = {
      rich_text: [{ text: { content: String(errorMessage).slice(0, 1900) } }],
    };
  }

  return call('POST', '/pages', {
    parent: {
      type: 'data_source_id',
      data_source_id: process.env.NOTION_DS_MESSAGE_LOG,
    },
    properties: props,
  });
}

// 특정 챌린저에게 특정 종류 메시지가 이미 성공 발송되었는지
export async function hasSuccessfulMessage(challengerId, type, { afterIso = null } = {}) {
  const filter = {
    and: [
      { property: '수신 챌린저', relation: { contains: challengerId } },
      { property: '종류', select: { equals: type } },
      { property: '상태', select: { equals: '성공' } },
    ],
  };
  if (afterIso) {
    filter.and.push({ property: '발송일시', date: { on_or_after: afterIso } });
  }
  const result = await queryDataSource(process.env.NOTION_DS_MESSAGE_LOG, {
    filter,
    page_size: 1,
  });
  return result.results.length > 0;
}

// ── 시간대 유틸 ────────────────────────────────────────────
// KST 기준 'YYYY-MM-DD' 반환
export function todayKstDate() {
  const now = new Date();
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' 두 날짜 사이 일수 차이 (정수, 미래는 음수)
export function daysBetweenIsoDate(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}
