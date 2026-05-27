# 노션톡 러닝 챌린지 — 데모

러닝 앱 스크린샷 **한 장**을 올리면, AI가 거리·시간·페이스·심박 등을 읽어 **노션 DB에 자동으로 기록**하는 작은 웹앱입니다.

> 이 저장소는 워크숍/스터디에서 "이거 어떻게 만들었어요?"라는 질문에 답하기 위해 공개한 **정제본**입니다.
> 토큰·API 키 등 모든 시크릿은 환경변수로 분리되어 있고, 실제 워크스페이스 ID·개인정보는 제거했습니다.

## 직접 만들어보기 — AI에게 시키세요

코딩을 몰라도 됩니다. 본인 상황에 맞게 **둘 중 하나만** 하면, 그다음은 AI가 페이즈 단위로 안내합니다.

- **🤖 코딩 에이전트가 있다면** (클로드 코드·Cursor·Codex·Antigravity CLI 등)
  → **이 저장소를 에이전트에게 읽히고** *"`guide/AGENT-BUILD-GUIDE.md`대로 페이즈 0부터 만들자"* 라고 하세요.
- **💬 브라우저 챗봇만 있다면** (ChatGPT·Claude·Gemini 등)
  → [`guide/AGENT-BUILD-GUIDE.md`](./guide/AGENT-BUILD-GUIDE.md) **이 한 파일만 복사해 붙여넣고** *"페이즈 0 시작"* 이라고 하세요.

---

## 무엇을 하나

```
[러닝 앱 스크린샷]
      │  ① 웹페이지에서 챌린저 선택 + 사진 업로드
      ▼
[ /api/upload ]
      │  ② Gemini Vision OCR로 이미지 → 러닝 데이터(JSON) 추출
      │  ③ 노션 '러닝 기록' DB에 새 행 생성 (거리/시간/페이스/심박/칼로리…)
      ▼
[노션 DB]  ──④ 행 추가 webhook──▶ [ /api/webhook/run-added ] ──▶ 진행도 문자 발송(Solapi)

[ /api/cron/daily-morning ]  매일 아침 Vercel Cron으로 독려 메시지 발송
```

- **사람은 사진만 올리면 끝.** 숫자 입력·표 정리는 전부 자동.
- 백엔드가 핵심이고 프런트는 최소한(정적 HTML 한 장).

## 기술 스택

| 역할 | 사용 기술 |
|------|-----------|
| 호스팅 / 서버리스 함수 / 크론 | Vercel (`api/` = 서버리스 함수) |
| 이미지 인식 (OCR) | Google **Gemini** Vision (`gemini-2.5-flash`) |
| 데이터 저장 | **노션** REST API (`2026-03-11` 버전) |
| 문자 발송 | **Solapi** SMS/LMS (HMAC-SHA256 인증) |
| 런타임 | Node.js (ESM), 의존성 최소화 (`busboy`로 멀티파트 업로드 파싱) |
| 프런트 | 바닐라 HTML/CSS/JS (`public/index.html`) |

## 디렉토리 구조

```
api/
  challengers.js        챌린저 명단을 노션에서 읽어 프런트에 제공
  upload.js             사진 업로드 → OCR → 노션 기록 (핵심 엔드포인트)
  webhook/run-added.js  노션에 기록 추가 시 진행도 문자 발송 (x-webhook-secret 보호)
  cron/daily-morning.js 매일 아침 독려 메시지 (Vercel Cron, CRON_SECRET 보호)
  debug.js              환경변수 설정 여부만 점검 (값은 노출 안 함)
lib/
  gemini.js             Gemini Vision OCR 호출
  notion.js             노션 REST 호출 헬퍼
  notion-challenge.js   챌린지 도메인 로직 (행 생성/조회 등)
  messages.js           문자 메시지 템플릿
  solapi.js             Solapi 발송 (HMAC-SHA256 서명)
  phone.js              전화번호 파싱 (국내/해외)
public/
  index.html            업로드 UI
scripts/                DB·속성을 코드로 셋업한 1회성 유틸 (아래 주의 참고)
samples/                OCR 테스트용 러닝 앱 스크린샷 (작성자 본인 데이터)
WORKFLOW.md             단계별 빌드 교재 (가장 자세한 설명)
```

## 로컬에서 돌려보기

> 노션 인테그레이션 토큰과 Gemini API 키가 필요합니다.

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 채우기
cp .env.example .env.local
#   .env.local 을 열어 NOTION_TOKEN, GEMINI_API_KEY 등을 채웁니다.

# 3) 로컬 개발 서버 (Vercel CLI)
npm run dev
```

준비물 발급 위치:
- **노션 토큰**: <https://www.notion.so/my-integrations> → 인테그레이션 생성 후, 사용할 DB의 `⋯ → 연결 추가`로 권한 부여
- **Gemini API 키**: <https://aistudio.google.com/apikey>
- **Solapi 키**(문자 발송 시): <https://solapi.com>

자세한 노션 DB 스키마·OCR 프롬프트·배포 과정은 [`WORKFLOW.md`](./WORKFLOW.md)를 참고하세요.

## 배포

Vercel에 배포합니다. 환경변수는 Vercel 프로젝트 설정(또는 `vercel env add`)에 등록하고, 크론 스케줄은 [`vercel.json`](./vercel.json)에 정의되어 있습니다.

```bash
npm run deploy   # vercel --prod
```

## ⚠️ 주의

- `scripts/`와 `sync-emoji-icons.mjs`는 작성자가 노션 DB·속성을 **코드로 세팅한 1회성 유틸**입니다.
  작성자 개인 노션 헬퍼 모듈에 의존하므로 **그대로는 실행되지 않습니다**.
  로직 참고용이며, 직접 쓰려면 [`@notionhq/client`](https://github.com/makenotion/notion-sdk-js) 또는 `lib/notion.js` 패턴으로 교체하세요.
- **시크릿은 절대 커밋하지 마세요.** 모든 키는 `.env.local`(gitignore됨) 또는 배포 플랫폼 환경변수로만 주입합니다.
- `samples/`의 스크린샷은 작성자 본인의 러닝 기록입니다.

## 라이선스

학습용 공개 자료입니다. 자유롭게 참고하세요.
