// CLI에서 이미지 한 장을 챌린저 행에 입력
// 사용법: node cli-upload.mjs <이미지경로> <챌린저이름>
// 예시:   node cli-upload.mjs samples/nrc_phone.jpg 카리나

import { readFileSync } from 'fs';

// .env.local 자동 로드
const envContent = readFileSync('.env.local', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

import { listChallengers, createRunningRecord } from './lib/notion.js';
import { extractRunningData } from './lib/gemini.js';

const [, , imagePath, challengerName] = process.argv;
if (!imagePath || !challengerName) {
  console.error('사용법: node cli-upload.mjs <이미지경로> <챌린저이름>');
  process.exit(1);
}

console.log(`[1/3] 챌린저 목록에서 "${challengerName}" 찾는 중...`);
const challengers = await listChallengers();
const target = challengers.find((c) => c.name === challengerName);
if (!target) {
  console.error(`  ❌ "${challengerName}" 챌린저 없음. 가능한 이름: ${challengers.map(c => c.name).join(', ')}`);
  process.exit(1);
}
console.log(`  ✓ ${target.name} (${target.id.slice(0, 8)})`);

console.log(`[2/3] 이미지 OCR... (${imagePath})`);
const imgBuffer = readFileSync(imagePath);
const ext = imagePath.split('.').pop().toLowerCase();
const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
const data = await extractRunningData({
  imageBase64: imgBuffer.toString('base64'),
  mimeType,
});
console.log('  ✓ 추출 결과:', JSON.stringify(data, null, 2));

console.log('[3/3] 노션에 새 러닝 기록 생성 (인증샷 업로드 포함)...');
const result = await createRunningRecord({
  challengerId: target.id,
  data,
  imageBuffer: imgBuffer,
  imageMimeType: mimeType,
});
console.log(`  ✅ 완료 — https://www.notion.so/${result.id.replace(/-/g, '')}`);
