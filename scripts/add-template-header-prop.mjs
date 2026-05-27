// 메시지 템플릿 DB에 '헤더' (rich_text) 속성 추가 + 기존 5개 row 갱신
// 1회성 셋업 스크립트.
//
// - 헤더 속성: rich_text. LMS subject로 매핑됨 (Solapi 한글 ~20자 권장).
// - 기존 row 본문에서 '[러닝챌린지 3기]\n' 제거 (헤더로 옮겼으므로).

// 노션 REST API 래퍼(작성자 개인 헬퍼)에 의존. 공개 리포에는 미포함 —
// @notionhq/client 또는 직접 fetch(lib/notion.js의 notionFetch 참고)로 대체하세요.
import { notion } from './notion-helper.mjs';

const DB_ID = process.env.NOTION_TEMPLATE_DB_ID;
const DS_ID = process.env.NOTION_TEMPLATE_DS_ID;
const HEADER_TEXT = '러닝챌린지 3기';
const INLINE_HEADER = '[러닝챌린지 3기]\n';

async function main() {
  console.log('1) 데이터소스에 "헤더" rich_text 속성 추가...');
  await notion.call('PATCH', `/data_sources/${DS_ID}`, {
    properties: { '헤더': { rich_text: {} } },
  });
  console.log('   ✓ 추가 완료');

  console.log('\n2) 기존 row 5개 조회...');
  const all = await notion.queryAll(DB_ID, {});
  console.log('   row 수:', all.length);

  console.log('\n3) 각 row에 헤더 입력 + 본문에서 inline header 제거...');
  for (const page of all) {
    const titleText = (page.properties['제목']?.title || []).map((t) => t.plain_text).join('');
    const rich = page.properties['본문']?.rich_text || [];
    const oldBody = rich.map((t) => t.plain_text || '').join('');
    const newBody = oldBody.startsWith(INLINE_HEADER)
      ? oldBody.slice(INLINE_HEADER.length)
      : oldBody;

    await notion.call('PATCH', `/pages/${page.id}`, {
      properties: {
        '헤더': { rich_text: [{ text: { content: HEADER_TEXT } }] },
        '본문': { rich_text: [{ text: { content: newBody } }] },
      },
    });
    console.log(`   ✓ ${titleText} — 헤더 적용 + 본문 ${oldBody === newBody ? '변동없음' : 'inline header 제거'}`);
  }

  console.log('\n완료.');
}

main().catch((e) => {
  console.error('실패:', e);
  process.exit(1);
});
