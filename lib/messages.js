// 메시지 본문 + 헤더 생성 — 노션 메시지 템플릿 DB에서 활성=true row를 fetch해
// 플레이스홀더 치환 후 { subject, text } 형태로 반환.
//
// subject는 Solapi LMS 제목으로 매핑됨 (sendSms({ to, ...rendered }) 패턴).
//
// 템플릿 fetch 실패 / 활성 row 없음 / NOTION_DS_MESSAGE_TEMPLATE 미설정 시
// 하드코딩 FALLBACK 사용.
//
// 모든 함수는 async. 호출 측에서 반드시 await 할 것.
//
// 플레이스홀더: {name} {runCount} {total} {target} {remaining} {remainingPhrase}
//               {daysSince} {challengeName}

import { queryDataSource } from './notion.js';

const FALLBACK_HEADER = '러닝챌린지 3기';

// 활성 row가 없을 때 사용하는 안전망 (메시지 템플릿 DB 생성 당시 기본값과 동일, 헤더 분리 후)
const FALLBACK_BODY = {
  '진행도': `{name}님 오늘도 달리셨네요!\n현재 {runCount}/{total}회 ({remainingPhrase})\n끝까지 화이팅! 🔥`,
  '독려': `{name}님, 마지막 러닝이 {daysSince}일 전이에요.\n오늘 짧게라도 한 번 어떠세요? 🔥`,
  '7회성공': `{name}님, 챌린지 성공을 축하합니다!\n7회 달성 완료. 남은 기간도 즐겁게 달려요. 🔥`,
  '마지막날': `{name}님, 챌린지 마지막 날입니다.\n그동안 정말 수고 많으셨어요.\n오늘 마무리도 잘하시고, 4기에서 또 만나요! 🔥`,
  '첫날': `{name}님, 오늘부터 챌린지 시작입니다!\n2주 동안 {target}회 러닝 인증이 목표예요.\n첫 발걸음 응원합니다! 🔥`,
};

// 해외 발송용 단축 본문 (SMS 90 byte 한도 안. 이모지 제거, 헤더 없음).
// Solapi 해외 발송은 SMS만 지원 → 헤더(subject) 붙이면 LMS 분류로 거절됨.
const FALLBACK_BODY_OVERSEAS = {
  '진행도': `{name}님 오늘도 달리셨네요! {runCount}/{total}회 ({remainingPhrase})`,
  '독려': `{name}님 마지막 러닝 {daysSince}일 전. 오늘 한 번 어떠세요?`,
  '7회성공': `{name}님 챌린지 성공 축하해요! 7회 달성 완료.`,
  '마지막날': `{name}님 챌린지 마지막 날입니다. 그동안 수고하셨어요.`,
  '첫날': `{name}님 오늘부터 챌린지 시작! 2주 동안 {target}회 목표.`,
};

function fillTemplate(body, vars) {
  return body.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : `{${key}}`,
  );
}

function richToString(rich) {
  if (!Array.isArray(rich)) return '';
  return rich.map((t) => t.plain_text || '').join('');
}

// 모듈 레벨 TTL 캐시 — cron이 30 챌린저 처리 시 동일 type 템플릿 30회 fetch를 1회로 축소.
const _tplCache = new Map();
const TPL_TTL_MS = 60 * 1000;

// 종류별 활성=true 첫번째 row의 { header, body }. 없거나 실패하면 null.
async function fetchActiveTemplate(type) {
  const dsId = process.env.NOTION_DS_MESSAGE_TEMPLATE;
  if (!dsId) return null;

  const cached = _tplCache.get(type);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const result = await queryDataSource(dsId, {
      filter: {
        and: [
          { property: '종류', select: { equals: type } },
          { property: '활성', checkbox: { equals: true } },
        ],
      },
      page_size: 1,
    });
    const page = result.results[0];
    const value = page
      ? {
          header: richToString(page.properties['헤더']?.rich_text),
          body: richToString(page.properties['본문']?.rich_text),
        }
      : null;
    _tplCache.set(type, { value, expiresAt: Date.now() + TPL_TTL_MS });
    return value;
  } catch (e) {
    console.warn(`[messages] template fetch failed for "${type}":`, e.message);
    // 실패는 캐시하지 않음 — 다음 호출에서 재시도
    return null;
  }
}

// overseas=true면 노션 템플릿 무시하고 FALLBACK_BODY_OVERSEAS 사용 + subject 제거.
// (해외 발송에 노션 템플릿을 쓰지 않는 이유: 헤더가 자동으로 붙어 LMS 분류로 거절됨.
//  1명·테스트 단계라 코드 FALLBACK이 가장 단순.)
async function resolveMessage(type, vars, { overseas = false } = {}) {
  if (overseas) {
    return {
      subject: null,
      text: fillTemplate(FALLBACK_BODY_OVERSEAS[type], vars),
    };
  }
  const fetched = await fetchActiveTemplate(type);
  const header = (fetched?.header || FALLBACK_HEADER).trim();
  const body = fetched?.body || FALLBACK_BODY[type];
  return {
    subject: header || null,
    text: fillTemplate(body, vars),
  };
}

export const messages = {
  async progress(name, runCount, target = 7, total = 14, opts = {}) {
    const remaining = Math.max(target - runCount, 0);
    const remainingPhrase = remaining > 0 ? `성공까지 ${remaining}회` : '이미 성공 달성';
    return resolveMessage('진행도', { name, runCount, target, total, remaining, remainingPhrase }, opts);
  },

  async encourage(name, daysSince, opts = {}) {
    return resolveMessage('독려', { name, daysSince }, opts);
  },

  async success(name, target = 7, opts = {}) {
    return resolveMessage('7회성공', { name, target }, opts);
  },

  async lastDay(name, challengeName = '', opts = {}) {
    return resolveMessage('마지막날', { name, challengeName }, opts);
  },

  async firstDay(name, challengeName = '', target = 7, total = 14, opts = {}) {
    return resolveMessage('첫날', { name, challengeName, target, total }, opts);
  },
};
