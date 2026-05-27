# 03 · 따라해보기 (B) — AI Studio로 한 땀 한 땀 (코딩 에이전트 없이)

> 두 갈래 중 **(B)** 입니다.
> - **(A)** 클로드 코드·Codex·Cursor 같은 **코딩 에이전트**가 있다 → [`03-tutorial.md`](./03-tutorial.md)로 가세요. 훨씬 빠릅니다.
> - **(B)** 그런 도구 없이, **AI Studio(=브라우저 속 Gemini)** 와 **복사·붙여넣기**로 직접 → **이 문서**입니다.

이 길은 손이 더 많이 가지만(한 땀 한 땀), 그만큼 "무엇이 어디에 들어가는지"가 눈에 보입니다.

## 이 길의 좋은 소식

- **컴퓨터에 설치할 게 거의 없습니다.** 텍스트 편집기(메모장이나 [VS Code](https://code.visualstudio.com/))와 **웹브라우저**면 됩니다.
- **명령어(터미널)를 한 줄도 안 칩니다.** 깃허브 업로드도, 배포도 전부 **웹사이트 화면에서 클릭**으로 합니다.
- **비밀키를 파일에 적지 않습니다.** 키는 마지막에 Vercel 설정 화면에만 넣습니다 → 실수로 깃허브에 유출될 일이 없습니다.

## 먼저 — "AI Studio"와 "코딩 에이전트"는 뭐가 다른가요

| | 코딩 에이전트 (클로드 코드 등) | **AI Studio (브라우저 속 Gemini 챗)** |
|---|---|---|
| 하는 일 | 내 컴퓨터에 **파일을 직접 만들고** 명령도 실행 | 코드를 **'글'로 보여줄 뿐** |
| 그래서 | "만들어줘" 하면 끝 | 내가 그 글을 **복사해 파일로 저장**해야 함 |
| 배포 | 알아서 해줌 | 내가 **깃허브·Vercel 화면에서 직접** |

→ 이 문서에서는 AI Studio를 **"옆에서 도와주는 선생님"** 으로 씁니다. 코드를 처음부터 끝까지 AI Studio에게 새로 짜달라고 하면 조각이 서로 안 맞아 깨지기 쉽습니다.
**그래서 정답 코드는 이 저장소(repo)에서 그대로 복사**하고, AI Studio에게는 *"이게 무슨 뜻이야?"*, *"이 에러 왜 나?"* 를 물어봅니다.

> 🤖 **AI Studio 여는 법**: <https://aistudio.google.com> 접속 → 구글 로그인 → 새 채팅(Chat/Create Prompt). 여기서 질문하고 답을 받습니다. (API 키 받았던 그 사이트 맞습니다.)

---

## STEP 0 · 노션 준비 (Tutorial A와 동일)

이 부분은 (A)와 똑같습니다. [`03-tutorial.md`의 STEP 0](./03-tutorial.md#step-0--준비-15분)을 보고 그대로 하세요:
1. **Gemini 키** 발급(<https://aistudio.google.com/apikey>) — 메모장에 잠깐 보관
2. 노션 **표 2개**(러닝 기록 / 챌린저) 만들기
3. 노션 **인테그레이션(사원증)** 만들고 → **두 표에 각각 `⋯ → 연결 추가`로 초대**, **토큰**(`ntn_...`) 보관

> ⚠️ **(B) 길에서 특히 중요**: 표의 **칸 이름을 [02 워크플로의 표](./02-workflow.md#노션-데이터-모델--어떤-표를-미리-만들어-두나)와 글자 하나까지 똑같이** 만드세요 — 괄호·단위까지(`거리(km)`, `시간(초)`, `평균 페이스(초/km)`, `평균 심박수`, `고도 상승(m)`, `케이던스`, `칼로리`, `제목`, `일시`, `챌린저`, `인증샷`).
> (A) 길은 코딩 에이전트가 이름을 맞춰주지만, (B) 길은 **복사한 코드가 이 이름들을 그대로 찾기** 때문에 다르면 작동하지 않습니다.

이번 길에서는 `.env.local` 파일을 만들지 **않습니다.** 키는 맨 마지막에 Vercel에만 넣습니다.

---

## STEP 1 · 파일을 한 땀 한 땀 만들기

만들 파일은 이렇게 생겼습니다(입력 자동화 기준):

```
running-challenge/
  public/
    index.html        ← 챌린저가 보는 화면
  api/
    challengers.js     ← "참가자 목록" 입구
    upload.js          ← "사진 받아 처리" 입구
  lib/
    gemini.js          ← 사진 → 데이터(AI)
    notion.js          ← 노션에 기록
  package.json         ← 이 프로젝트가 쓰는 부품 목록
```

### 만드는 방법 — 파일마다 반복

각 파일에 대해 이렇게 하세요:

1. 이 저장소(repo)에서 그 파일을 엽니다. 예: `lib/gemini.js` → 저장소 상위 폴더의 [`lib/gemini.js`](../lib/gemini.js).
2. 우측 **Raw** 버튼(또는 복사 아이콘)을 눌러 **전체 코드를 복사**합니다.
3. 메모장이나 VS Code에 **붙여넣고**, **정확한 폴더·파일 이름**으로 저장합니다. (`lib` 폴더 안에 `gemini.js`)

복사할 파일 목록(저장소 상위에서):
- [`public/index.html`](../public/index.html)
- [`api/challengers.js`](../api/challengers.js)
- [`api/upload.js`](../api/upload.js)
- [`lib/gemini.js`](../lib/gemini.js)
- [`lib/notion.js`](../lib/notion.js)

`package.json`은 짧으니 아래를 그대로 복사해 만드세요:

```json
{
  "name": "running-challenge",
  "private": true,
  "type": "module",
  "dependencies": {
    "busboy": "^1.6.0"
  }
}
```

> 🤖 **AI Studio 활용**: 붙여넣은 코드가 궁금하면 AI Studio에 *"이 코드가 무슨 일을 하는지 한 문장씩 쉽게 설명해줘"* 하고 코드를 붙여넣어 보세요. (이해용입니다. 코드를 고칠 필요는 없습니다.)
> 🧑‍🎓 **더 깊이 배우고 싶다면**: AI Studio에 *"러닝 앱 스크린샷에서 거리·시간·페이스를 JSON으로 뽑는 Gemini 호출 코드를 만들어줘. 화면에 없는 값은 추측 말고 null로"* 처럼 직접 만들어달라고 해볼 수도 있습니다. 다만 결과가 저장소 코드와 달라 다른 파일과 안 맞을 수 있으니, **실제 배포에는 저장소 코드를 쓰는 걸 권합니다.**

✅ **체크포인트**: 위 구조대로 폴더·파일이 만들어졌나요? 파일 이름·폴더 위치가 정확해야 합니다(`api/upload.js`는 반드시 `api` 폴더 안에).

---

## STEP 2 · 깃허브에 올리기 (전부 웹 화면에서)

명령어 없이, 깃허브 웹사이트에서 클릭과 드래그로 올립니다.

1. <https://github.com> 로그인 → 우상단 **`+` → New repository**
2. 이름 입력(예: `running-challenge`) → **Private/Public 아무거나** → **Create repository**
3. 새 리포 화면에서 **"uploading an existing file"** 링크 클릭
4. STEP 1에서 만든 폴더 안의 파일들을 **창으로 드래그앤드롭** (폴더째 끌어다 놓으면 `api/`, `lib/` 구조도 유지됩니다) → 아래 **Commit changes**

> 💡 컴퓨터에 파일을 안 만들고 싶다면: 리포 화면에서 **Add file → Create new file**을 눌러 이름 칸에 `api/upload.js`처럼 **경로째** 입력하면 폴더까지 만들어집니다. 거기에 코드를 붙여넣고 Commit. (메모장 없이 브라우저만으로 가능)

✅ **체크포인트**: 리포에 `public/`, `api/`, `lib/`, `package.json`이 보입니다. **비밀키 파일은 없습니다**(애초에 안 만들었으니까요). 👍

---

## STEP 3 · Vercel에 배포 (웹 대시보드)

1. <https://vercel.com> → **깃허브 계정으로 로그인**
2. **Add New… → Project** → 방금 만든 깃허브 리포 옆 **Import**
3. 설정 화면에서 **Framework Preset: Other**(자동 인식됨) 그대로 두기
4. **Environment Variables**(환경 변수) 칸을 펼쳐 아래를 입력합니다. 이름과 값을 한 줄씩:
   - `NOTION_TOKEN` → 노션 토큰(`ntn_...`)
   - `GEMINI_API_KEY` → Gemini 키
   - `NOTION_DASHBOARD_URL` → (지금은 비워두거나, 챌린지 노션 페이지 공개 URL)
   - *(데이터소스 ID 2개는 STEP 4에서 채웁니다 — 지금은 비워둬도 배포는 됩니다)*
5. **Deploy** 클릭 → 잠시 후 `https://러닝챌린지-어쩌고.vercel.app` 주소가 나옵니다.

> 🔑 **여기가 비밀의 안전한 지점**: 키를 깃허브가 아니라 **Vercel 화면에만** 넣었습니다. ([01의 시크릿 관리](./01-concepts.md#시크릿-관리--비밀번호는-따로-보관) — "코드와 비밀번호는 다른 채널" 그 장면입니다.)

✅ **체크포인트**: 주소가 열립니다. 단, 아직 챌린저 목록이 비어 있을 수 있어요(데이터소스 ID를 안 넣어서). 다음 단계에서 채웁니다.

---

## STEP 4 · 가장 까다로운 한 곳 — 데이터소스 ID 찾기

> 솔직히 말씀드리면, **여기가 (B) 길에서 제일 번거롭습니다.** 노션은 표마다 "데이터소스 ID"라는 게 있는데, 이건 노션 화면 URL에는 안 보이고 **한 번 조회**해야 알 수 있습니다. (A) 길에서는 코딩 에이전트가 이걸 자동으로 읽어옵니다. (B) 길에서는 아래처럼 **임시 도우미 페이지**를 잠깐 띄워서 알아냅니다.

**4-1. 도우미 파일을 잠깐 추가** — 깃허브 리포에서 `api/find-ids.js`를 새로 만들어(Add file → Create new file → 이름 `api/find-ids.js`) 아래를 붙여넣고 Commit:

```js
// (임시) 노션 표의 data_source_id를 알려주는 도우미. 다 쓰면 삭제하세요.
export default async function handler(req, res) {
  const db = req.query.db;
  if (!db) return res.status(400).send('주소 끝에 ?db=노션표의32자리ID 를 붙이세요');
  const r = await fetch(`https://api.notion.com/v1/databases/${db}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2026-03-11',
    },
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json(data);
  res.status(200).json({
    표제목: data.title?.[0]?.plain_text,
    data_sources: (data.data_sources || []).map((s) => ({ 이름: s.name, data_source_id: s.id })),
  });
}
```

커밋하면 Vercel이 **자동으로 다시 배포**합니다(1분 안팎).

**4-2. 32자리 표 ID 알아내기** — 노션에서 표를 열고 주소(URL)를 봅니다. 주소 속 **32자리 영문·숫자 덩어리**가 표 ID입니다. 러닝 기록 표, 챌린저 표 각각 복사하세요.

**4-3. 브라우저로 도우미 호출** — 주소창에 이렇게 입력:
```
https://<내-주소>.vercel.app/api/find-ids?db=<러닝기록표의32자리ID>
```
화면에 `data_source_id`가 나옵니다 → 복사. 챌린저 표 ID로도 한 번 더 해서 그 값도 복사.

> 🤖 막히면 AI Studio에 화면에 뜬 내용을 붙여넣고 *"여기서 data_source_id가 뭐야? 에러면 왜 그런지 알려줘"* 라고 물어보세요. (`unauthorized`/`object_not_found`가 뜨면 → STEP 0의 "표에 인테그레이션 초대"를 안 한 것)

**4-4. Vercel에 ID 넣기** — Vercel 프로젝트 → **Settings → Environment Variables**:
- `NOTION_DS_RUNNING` → 러닝 기록 표의 data_source_id
- `NOTION_DS_CHALLENGERS` → 챌린저 표의 data_source_id

**4-5. 도우미 삭제 + 재배포** — 깃허브에서 `api/find-ids.js`를 삭제(파일 → 휴지통 아이콘 → Commit). 그리고 Vercel **Deployments → 맨 위 항목 ⋯ → Redeploy**로 새 환경변수를 반영합니다.

✅ **체크포인트**: 재배포 후 사이트를 열면 챌린저 목록이 노션에서 불러온 이름들로 채워집니다.

---

## STEP 5 · 진짜 써보기

휴대폰 브라우저로 `https://<내-주소>.vercel.app`을 엽니다 → 본인 선택 → 러닝 앱 스크린샷 한 장 업로드 → **30초 안에 노션 '러닝 기록' 표에 새 데이터베이스 페이지**(표의 한 줄)가 채워집니다. 🎉

🆘 **막히면** (모아보기):
- 목록이 빔 → STEP 4 데이터소스 ID가 비었거나, 챌린저 표에 사람이 없거나, 표에 인테그레이션 초대를 안 함.
- 업로드 시 오류 → Vercel **Settings → Environment Variables**에 5개(`NOTION_TOKEN`, `GEMINI_API_KEY`, `NOTION_DS_RUNNING`, `NOTION_DS_CHALLENGERS`, `NOTION_DASHBOARD_URL`)가 다 있는지 확인 후 **Redeploy**.
- 노션에 데이터베이스 페이지는 생기는데 칸이 비거나 오류 → **칸 이름이 [02 표](./02-workflow.md#노션-데이터-모델--어떤-표를-미리-만들어-두나)와 정확히 같은지**(괄호·단위까지) 확인. (B) 길에서 가장 흔한 실수입니다.
- 화면 내용을 그대로 복사해 AI Studio에 붙여넣고 물어보면 대부분 원인을 짚어줍니다.

---

## 두 길 비교 — 다음엔 어떤 걸?

| | (A) 코딩 에이전트 | (B) AI Studio + 손수 |
|---|---|---|
| 속도 | 빠름(요청→완성) | 느림(한 땀 한 땀) |
| 설치 | 에이전트 설치 필요 | 편집기+브라우저면 끝 |
| 명령어 | 에이전트가 대신 | 한 줄도 안 침(웹 클릭) |
| 데이터소스 ID | 자동 | 도우미로 직접(STEP 4) |
| 배우는 것 | "부탁하는 법" | "어디에 무엇이 들어가는지" |

처음 한 번은 (B)로 한 땀 한 땀 해보면 구조가 손에 잡히고, 그다음부터는 (A)로 빠르게 — 이 순서를 추천합니다.

## 다음 단계 — 심화(자동 문자)

문자 자동화(웹훅·크론)는 [02 워크플로의 심화 절](./02-workflow.md#심화--문자-자동화의-안전장치들)에 구조가 정리돼 있습니다. (B) 길로도 같은 방식 — 저장소의 `api/webhook/`, `api/cron/`, `lib/`를 복사하고 Vercel에 환경변수를 더 넣으면 됩니다. 단 유료 문자 서비스 계정과 발신번호 등록이 필요하고, 노션 자동화(웹훅) 설정이 추가로 들어갑니다.

---

막히는 단어 → [01 개념](./01-concepts.md) / 흐름 → [02 워크플로](./02-workflow.md) / 빠른 길 → [(A) 03-tutorial.md](./03-tutorial.md).
