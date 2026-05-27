// 닉네임 매칭으로 SOURCE DB의 "식별 이모지" 속성값을
// TARGET DB의 같은 닉네임 페이지의 페이지 아이콘으로 동기화
//
// 사용법: node sync-emoji-icons.mjs [--dry-run]
//
// 엣지케이스(빈 값, 텍스트, 여러개 이모지, 매칭 실패 등)는 건드리지 않고
// 끝에 별도 보고만 함.

import { readFileSync } from 'fs';

// ── .env.local 로드 ─────────────────────────────────────────────
try {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* 없으면 무시 — 이미 환경변수로 들어있을 수도 있음 */
}

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN 누락. .env.local 또는 환경변수에 설정 필요');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

// URL의 32자 hex → 8-4-4-4-12 dashed UUID
function dashUuid(id32) {
  const s = id32.replace(/-/g, '');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const SOURCE_DB_ID = dashUuid(process.env.NOTION_EMOJI_SOURCE_DB_ID || ''); // 식별 이모지 속성 보유
const TARGET_DB_ID = dashUuid(process.env.NOTION_EMOJI_TARGET_DB_ID || ''); // 페이지 아이콘 설정 대상

const SOURCE_PROP_NAME = '식별 이모지';

// ── Notion API 미니 클라이언트 ─────────────────────────────────
const API_BASE = 'https://api.notion.com/v1';
const API_VERSION = '2026-03-11';

async function call(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Notion ${res.status} ${method} ${path}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

async function getPrimaryDataSourceId(dbId) {
  const db = await call('GET', `/databases/${dbId}`);
  if (!db.data_sources?.length) throw new Error(`DB ${dbId}에 data_sources 없음`);
  if (db.data_sources.length > 1) {
    console.warn(`  ⚠️  DB ${dbId}에 data source가 ${db.data_sources.length}개 — 첫 번째 사용`);
  }
  return db.data_sources[0].id;
}

async function queryAll(dsId) {
  const out = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await call('POST', `/data_sources/${dsId}/query`, body);
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

// ── 헬퍼 ────────────────────────────────────────────────────────
function getTitleText(page) {
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
  return titleProp?.title?.map((t) => t.plain_text).join('').trim() || '';
}

function getPropPlainText(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('');
  if (p.type === 'title') return p.title.map((t) => t.plain_text).join('');
  if (p.type === 'select') return p.select?.name ?? '';
  if (p.type === 'multi_select') return p.multi_select.map((o) => o.name).join('');
  return null; // 다른 타입은 호출부에서 처리
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function classifyEmoji(raw) {
  if (raw == null) return { kind: 'missing' };
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'empty' };
  const graphemes = [...segmenter.segment(trimmed)].map((s) => s.segment);
  if (graphemes.length > 1) return { kind: 'multi', value: trimmed, count: graphemes.length };
  // graphemes.length === 1
  const g = graphemes[0];
  if (/\p{Extended_Pictographic}/u.test(g)) return { kind: 'emoji', value: g };
  return { kind: 'text', value: trimmed };
}

// ── 메인 흐름 ───────────────────────────────────────────────────
console.log(`[1/4] 두 DB의 data source ID 조회${DRY_RUN ? ' (DRY-RUN)' : ''}`);
const [sourceDsId, targetDsId] = await Promise.all([
  getPrimaryDataSourceId(SOURCE_DB_ID),
  getPrimaryDataSourceId(TARGET_DB_ID),
]);
console.log(`  source DS = ${sourceDsId}`);
console.log(`  target DS = ${targetDsId}`);

console.log('[2/4] 두 DB의 페이지 전체 조회');
const [sourcePages, targetPages] = await Promise.all([
  queryAll(sourceDsId),
  queryAll(targetDsId),
]);
console.log(`  source ${sourcePages.length}건 / target ${targetPages.length}건`);

console.log(`[3/4] source에서 닉네임 → "${SOURCE_PROP_NAME}" 매핑 구성`);
const sourceMap = new Map();   // nickname → emoji
const sourceEdge = [];         // {nickname, kind, value, ...}
for (const p of sourcePages) {
  const nick = getTitleText(p);
  if (!nick) continue;
  const raw = getPropPlainText(p, SOURCE_PROP_NAME);
  const cls = classifyEmoji(raw);
  if (cls.kind === 'emoji') {
    sourceMap.set(nick, cls.value);
  } else {
    sourceEdge.push({ nickname: nick, ...cls, raw });
  }
}
console.log(`  단일 이모지 ${sourceMap.size}건 / 엣지 ${sourceEdge.length}건`);

console.log(`[4/4] target 페이지 아이콘 PATCH${DRY_RUN ? ' (DRY-RUN, 호출 안 함)' : ''}`);
const updated = [];
const unchanged = [];
const noMatch = [];
const dupNick = new Map(); // nickname → count

for (const tp of targetPages) {
  const nick = getTitleText(tp);
  if (!nick) continue;
  dupNick.set(nick, (dupNick.get(nick) || 0) + 1);
  const emoji = sourceMap.get(nick);
  if (!emoji) {
    noMatch.push(nick);
    continue;
  }
  // 이미 같은 이모지면 스킵
  if (tp.icon?.type === 'emoji' && tp.icon.emoji === emoji) {
    unchanged.push(nick);
    continue;
  }
  if (DRY_RUN) {
    updated.push({ nickname: nick, emoji, before: tp.icon ?? null });
    console.log(`  [dry] ${nick} ← ${emoji}`);
    continue;
  }
  await call('PATCH', `/pages/${tp.id}`, {
    icon: { type: 'emoji', emoji },
  });
  updated.push({ nickname: nick, emoji });
  console.log(`  ✓ ${nick} ← ${emoji}`);
}

// ── 결과 보고 ───────────────────────────────────────────────────
console.log('\n===== 결과 =====');
console.log(`✅ 적용 ${updated.length}건${DRY_RUN ? ' (실제 호출 X)' : ''}`);
console.log(`⏭  이미 동일 ${unchanged.length}건`);
console.log(`❓ source에 닉네임 없음 ${noMatch.length}건`);

console.log('\n===== 엣지케이스 (별도 검토) =====');
if (sourceEdge.length === 0 && noMatch.length === 0) {
  console.log('(없음)');
} else {
  if (sourceEdge.length) {
    console.log(`\n[source "${SOURCE_PROP_NAME}" 값이 단일 이모지가 아님 — ${sourceEdge.length}건]`);
    for (const e of sourceEdge) {
      const tag = {
        empty: '비어있음',
        missing: '속성 없음',
        text: '텍스트',
        multi: `여러 글자(${e.count})`,
      }[e.kind] || e.kind;
      console.log(`  - ${e.nickname}: [${tag}] ${JSON.stringify(e.raw)}`);
    }
  }
  if (noMatch.length) {
    console.log(`\n[target에 있는데 source에서 매칭 닉네임 못 찾음 — ${noMatch.length}건]`);
    for (const n of noMatch) console.log(`  - ${n}`);
  }
  const dups = [...dupNick.entries()].filter(([, c]) => c > 1);
  if (dups.length) {
    console.log(`\n[target에 닉네임 중복 — ${dups.length}건]`);
    for (const [n, c] of dups) console.log(`  - ${n} (${c}개)`);
  }
}
