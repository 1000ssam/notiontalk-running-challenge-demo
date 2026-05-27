// Gemini Vision OCR 호출
// 이미지에서 러닝 데이터를 JSON으로 추출

const MODEL = 'gemini-2.5-flash';

const SCHEMA = {
  type: 'object',
  properties: {
    distance_km: { type: 'number', nullable: true },
    duration_seconds: { type: 'integer', nullable: true },
    pace_per_km_seconds: { type: 'integer', nullable: true },
    avg_heart_rate: { type: 'integer', nullable: true },
    elevation_gain_m: { type: 'number', nullable: true },
    cadence: { type: 'integer', nullable: true },
    calories: { type: 'integer', nullable: true },
    date_iso: { type: 'string', nullable: true },
    app_name: { type: 'string', nullable: true },
  },
  required: [],
};

const PROMPT = `러닝/워킹/실내 운동 화면에서 한 건의 활동 데이터를 추출하세요.

[지원하는 화면 유형]
A. 워크아웃 상세 — 한 건의 운동 세션 (예: "Outdoor Run", "Indoor Walk", "Indoor Run", "Outdoor Walk", "달리기", "걷기")
B. 일일 활동 요약 — 하루 누적 (활동링 + 걸음수 + 활동시간 + 이동거리 표시. 예: 삼성헬스 메인)

[추출 규칙]
- 화면에 명시된 값만 채움. 추측·계산 금지. 보이지 않으면 null (0으로 채우지 말 것).
- Walk/Run 동등 취급. Walking/Running/걷기/달리기/워킹/러닝 모두 활동으로 인정.
- 한 화면에 여러 활동이 있으면 가장 두드러진 한 건만.
- 수면 데이터는 무시.

[단위 변환]
- 거리: km. "mi"이면 변환(1mi=1.60934km).
  - 일일 활동 요약은 "활동으로 이동한 거리" / "이동거리" / "Walking+Running Distance" 등을 사용.
- 시간: 초.
  - 워크아웃 상세: "32:15" → 1935. "0:44:41" → 2681. "55:15" → 3315.
  - 일일 활동 요약: 분 단위만 보이면 분×60. 예: "활동 시간 83분" → 4980. "83/90분"이면 현재값 83 사용 → 4980.
- 페이스: km당 초. "6'12''/km" → 372. "10'03''/km" → 603. "8:53/mi"는 (8*60+53)/1.60934로 환산.
  - 일일 활동 요약처럼 페이스 표시가 없으면 null (시간/거리로 계산하지 말 것).
- 칼로리: kcal.
  - 워크아웃 상세에 Active와 Total 둘 다 있으면 Active를 우선 (운동 측정치). 예: "Active Kilocalories 276 / Total 345" → 276.
  - 일일 활동 요약에는 "활동 칼로리"와 "총 칼로리 소모량" 둘 다 있으면 "활동 칼로리" 우선.
- 심박수: BPM. 표시 없으면 null. 일일 활동 요약엔 보통 없음.
- 케이던스: spm. 워크아웃 상세에서만. "걸음 수"와 혼동 금지 (걸음 수는 누적 카운트라 케이던스 아님).

[앱 식별 (app_name)]
- 한국어·영문·일본어 단서 모두 활용. Apple Fitness, 삼성헬스, Strava, 나이키 등.
- 확신 없으면 null.`;

export async function extractRunningData({ imageBase64, mimeType }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: SCHEMA,
      temperature: 0,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${JSON.stringify(data)}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답이 비어 있음');
  return JSON.parse(text);
}
