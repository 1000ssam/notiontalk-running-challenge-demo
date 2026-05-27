// 챌린지 정보 DS에 '발송 상태'(select: 진행/중단) 속성을 추가하고,
// 현재 챌린지 페이지(들)를 '중단'으로 세팅한다.
//
// - 멱등: 속성이 이미 있으면 추가 단계를 건너뛴다.
// - 직접 API(2026-03-11). MCP 미사용. lib/notion.js와 동일 방식.
// - 인자: 없으면 apply, `dry`면 조회만(변경 X).
//
// 사용:
//   node scripts/setup-send-status.mjs dry    # 현재 상태만 출력
//   node scripts/setup-send-status.mjs        # 속성 추가 + '중단' 세팅

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── env 로드: .env.production.local 우선 (send-gift-notice.mjs와 동일 패턴) ──
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val && !process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnvFile(path.join(__dirname, '../.env.production.local'));
loadEnvFile(path.join(__dirname, '../.env.local'));

const TOKEN = process.env.NOTION_TOKEN;
const DS_ID = process.env.NOTION_DS_CHALLENGE_INFO;
const API_VERSION = '2026-03-11';
const PROP = '발송 상태';
const DRY = process.argv[2] === 'dry';

if (!TOKEN || !DS_ID) {
  console.error('환경변수 누락: NOTION_TOKEN / NOTION_DS_CHALLENGE_INFO');
  process.exit(1);
}

async function call(method, p, body) {
  const res = await fetch(`https://api.notion.com/v1${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

const titleOf = (props) => {
  const t = Object.values(props).find((x) => x.type === 'title');
  return t?.title?.[0]?.plain_text || '(제목없음)';
};

(async () => {
  // 1) 현재 스키마 확인
  const ds = await call('GET', `/data_sources/${DS_ID}`);
  const hasProp = Boolean(ds.properties?.[PROP]);
  console.log(`데이터소스: ${ds.title?.[0]?.plain_text || DS_ID}`);
  console.log(`'${PROP}' 속성 존재: ${hasProp ? '예' : '아니오'}`);

  // 2) 페이지 현황
  const q = await call('POST', `/data_sources/${DS_ID}/query`, { page_size: 100 });
  console.log(`페이지 수: ${q.results.length}`);
  for (const pg of q.results) {
    const cur = pg.properties?.[PROP]?.select?.name || '(미설정)';
    console.log(`  - ${titleOf(pg.properties)} | ${PROP}=${cur}`);
  }

  if (DRY) {
    console.log('\n[dry] 변경하지 않음.');
    return;
  }

  // 3) 속성 추가(멱등)
  if (!hasProp) {
    await call('PATCH', `/data_sources/${DS_ID}`, {
      properties: {
        [PROP]: {
          select: {
            options: [
              { name: '진행', color: 'green' },
              { name: '중단', color: 'red' },
            ],
          },
        },
      },
    });
    console.log(`\n'${PROP}' 속성 추가 완료 (진행/중단)`);
  } else {
    console.log(`\n'${PROP}' 속성 이미 존재 — 추가 생략`);
  }

  // 4) 모든 페이지를 '중단'으로 (getChallengeInfo가 어느 행을 골라도 차단되도록)
  for (const pg of q.results) {
    await call('PATCH', `/pages/${pg.id}`, {
      properties: { [PROP]: { select: { name: '중단' } } },
    });
    console.log(`  세팅: ${titleOf(pg.properties)} → 중단`);
  }

  console.log('\n완료. 크론은 매일 돌지만 발송 상태=중단이라 메시지를 보내지 않음.');
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
