// 노션 API 미니 클라이언트
// HTTP 요청을 fetch로 직접 호출 — SDK 없이 핵심만

const API_BASE = 'https://api.notion.com/v1';
const API_VERSION = '2026-03-11';

function authHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': API_VERSION,
  };
}

// 429 Too Many Requests에 한해 Retry-After 기반 backoff + 지터로 재시도 (최대 3회).
// 다른 4xx/5xx는 즉시 throw — 노션 스키마 오류 등은 재시도해봐야 의미 없음.
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
    console.warn(`[notion] 429 → retry in ${waitMs}ms (attempt ${attempt + 1}) path=${path}`);
    await new Promise((r) => setTimeout(r, waitMs));
    return call(method, path, body, attempt + 1);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Notion ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// 멀티파트는 fetch가 boundary 포함 Content-Type을 자동 설정하므로 직접 지정 금지
async function callMultipart(method, path, form) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Notion ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ── 바이너리 → Notion 파일 업로드 ─────────────────────────────
// 단일파트 한도 20MB. 초과 시 명확히 실패시킴 (분할 업로드 미지원)
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const EXT_FROM_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function uploadBuffer(buffer, mimeType) {
  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error(`인증샷 크기 초과 (20MB 제한): ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
  }
  const ext = EXT_FROM_MIME[mimeType] || 'bin';
  const filename = `인증샷.${ext}`;

  // Step 1: 업로드 슬롯 생성
  const upload = await call('POST', '/file_uploads', {
    filename,
    content_type: mimeType,
  });

  // Step 2: 바이너리 전송 (multipart)
  const blob = new Blob([buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, filename);
  await callMultipart('POST', `/file_uploads/${upload.id}/send`, form);

  return { id: upload.id, filename };
}

// ── DS 조회 (페이지 단위 행 가져오기) ───────────────────────────
export async function queryDataSource(dsId, body = {}) {
  return call('POST', `/data_sources/${dsId}/query`, body);
}

// ── 챌린저 목록 가져오기 ──────────────────────────────────────
// "이름" title 속성에서 텍스트를 추출하고 페이지 ID와 함께 반환
export async function listChallengers() {
  const dsId = process.env.NOTION_DS_CHALLENGERS;
  const data = await queryDataSource(dsId, { page_size: 100 });
  return data.results
    .map((page) => {
      const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
      const name = titleProp?.title?.[0]?.plain_text?.trim() || '(이름없음)';
      // 노션 페이지 아이콘 정규화 → 클라이언트가 바로 쓰기 좋게 평탄화
      // file 타입 URL은 ~1시간 만료지만 우리 앱은 새로고침마다 재호출이라 OK
      let icon = null;
      if (page.icon?.type === 'emoji') icon = { type: 'emoji', value: page.icon.emoji };
      else if (page.icon?.type === 'external') icon = { type: 'image', value: page.icon.external?.url };
      else if (page.icon?.type === 'file') icon = { type: 'image', value: page.icon.file?.url };
      return { id: page.id, name, icon };
    })
    .filter((c) => c.name !== '(이름없음)')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// ── 새 러닝 기록 행 만들기 ────────────────────────────────────
export async function createRunningRecord({ challengerId, data, imageBuffer, imageMimeType }) {
  const dsId = process.env.NOTION_DS_RUNNING;

  // 인증은 그날 하는 걸 원칙 → 이미지에 박힌 날짜 무시, 항상 KST 오늘.
  // toISOString().slice(0,10)는 UTC 기준이라 KST 00:00~09:00 업로드 시
  // 하루 전 날짜가 박혔던 버그가 있었음 (notion-challenge.js의 todayKstDate와 동일 로직).
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateOnly = kst.toISOString().slice(0, 10);
  const properties = {
    '제목': {
      title: [{ text: { content: dateOnly } }],
    },
    '챌린저': {
      relation: [{ id: challengerId }],
    },
    '일시': {
      date: { start: dateOnly },
    },
  };

  // 숫자 속성: null이 아닌 값만 채움
  if (data.distance_km != null) properties['거리(km)'] = { number: data.distance_km };
  if (data.duration_seconds != null) properties['시간(초)'] = { number: data.duration_seconds };
  if (data.pace_per_km_seconds != null) properties['평균 페이스(초/km)'] = { number: data.pace_per_km_seconds };
  if (data.avg_heart_rate != null) properties['평균 심박수'] = { number: data.avg_heart_rate };
  if (data.elevation_gain_m != null) properties['고도 상승(m)'] = { number: data.elevation_gain_m };
  if (data.cadence != null) properties['케이던스'] = { number: data.cadence };
  if (data.calories != null) properties['칼로리'] = { number: data.calories };

  // 인증샷: 바이너리를 노션에 업로드 후 file_upload 형식으로 첨부
  if (imageBuffer) {
    const { id: uploadId, filename } = await uploadBuffer(imageBuffer, imageMimeType || 'image/jpeg');
    properties['인증샷'] = {
      files: [
        {
          name: filename,
          type: 'file_upload',
          file_upload: { id: uploadId },
        },
      ],
    };
  }

  return call('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: dsId },
    properties,
  });
}
