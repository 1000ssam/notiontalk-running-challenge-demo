// 메시지 템플릿 노션 DB 생성 + 5개 기본 row 입력
// 1회성 셋업 스크립트. 재실행해도 멱등성 없음 — DB 중복 생성 방지 위해 1회만 실행할 것.

// 노션 REST API 래퍼(작성자 개인 헬퍼)에 의존. 공개 리포에는 미포함 —
// @notionhq/client 또는 직접 fetch(lib/notion.js의 notionFetch 참고)로 대체하세요.
import { notion } from './notion-helper.mjs';

const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID; // 메시지 템플릿 DB를 만들 상위 페이지 ID

const SCHEMA = {
  '제목': { title: {} },
  '종류': {
    select: {
      options: [
        { name: '진행도', color: 'blue' },
        { name: '독려', color: 'orange' },
        { name: '7회성공', color: 'green' },
        { name: '마지막날', color: 'purple' },
        { name: '첫날', color: 'yellow' },
      ],
    },
  },
  '본문': { rich_text: {} },
  '활성': { checkbox: {} },
};

// 현재 lib/messages.js 하드코딩과 동일한 본문
const HEADER = '[러닝챌린지 3기]';

const DEFAULT_TEMPLATES = [
  {
    title: '진행도 (기본)',
    type: '진행도',
    body: `${HEADER}\n{name}님 오늘도 달리셨네요!\n현재 {runCount}/{total}회 ({remainingPhrase})\n끝까지 화이팅! 🔥`,
  },
  {
    title: '독려 (기본)',
    type: '독려',
    body: `${HEADER}\n{name}님, 마지막 러닝이 {daysSince}일 전이에요.\n오늘 짧게라도 한 번 어떠세요? 🔥`,
  },
  {
    title: '7회성공 (기본)',
    type: '7회성공',
    body: `${HEADER}\n{name}님, 챌린지 성공을 축하합니다!\n7회 달성 완료. 남은 기간도 즐겁게 달려요. 🔥`,
  },
  {
    title: '마지막날 (기본)',
    type: '마지막날',
    body: `${HEADER}\n{name}님, 챌린지 마지막 날입니다.\n그동안 정말 수고 많으셨어요.\n오늘 마무리도 잘하시고, 4기에서 또 만나요! 🔥`,
  },
  {
    title: '첫날 (기본)',
    type: '첫날',
    body: `${HEADER}\n{name}님, 오늘부터 챌린지 시작입니다!\n2주 동안 {target}회 러닝 인증이 목표예요.\n첫 발걸음 응원합니다! 🔥`,
  },
];

async function main() {
  console.log('1) DB 생성 중...');
  const db = await notion.createDatabase(PARENT_PAGE_ID, '메시지 템플릿', '✉️', SCHEMA);
  console.log('   생성된 DB ID:', db.id);
  console.log('   생성된 DS ID:', db.dataSourceId || '(자동 매핑됨)');

  // notion-api.mjs는 createDatabase 후 dataSourceId를 반환하지 않을 수 있어 조회로 가져오기
  const dbInfo = await notion.call('GET', `/databases/${db.id}`);
  const dsId = dbInfo.data_sources?.[0]?.id;
  if (!dsId) throw new Error('data_source_id를 찾지 못했습니다');
  console.log('   DS ID 조회 성공:', dsId);

  console.log('\n2) 기본 템플릿 5개 입력 중...');
  for (const t of DEFAULT_TEMPLATES) {
    const page = await notion.createPage(db.id, {
      '제목': notion.prop.title(t.title),
      '종류': notion.prop.select(t.type),
      '본문': { rich_text: [{ text: { content: t.body } }] },
      '활성': notion.prop.checkbox(true),
    });
    console.log('   ✓', t.type, '→', page.id);
  }

  console.log('\n=========================================================');
  console.log('완료. .env / Vercel에 다음 값을 등록하세요:');
  console.log(`NOTION_DS_MESSAGE_TEMPLATE=${dsId}`);
  console.log('=========================================================');
}

main().catch((e) => {
  console.error('실패:', e);
  process.exit(1);
});
