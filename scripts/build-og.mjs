// Build /public/og.png (1200x630) using Playwright headless Chromium.
// Self-contained: embeds Pretendard via CDN (cdn.jsdelivr) for Korean glyphs.
// Run: node scripts/build-og.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'public/og.png');

const html = String.raw`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1200px;
    height: 630px;
    overflow: hidden;
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif;
    color: #f5f5f5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
  }
  .stage {
    position: relative;
    width: 1200px;
    height: 630px;
    background:
      radial-gradient(1100px 720px at 92% -10%, rgba(214,255,0,0.22), transparent 55%),
      radial-gradient(900px 620px at -5% 115%, rgba(214,255,0,0.08), transparent 60%),
      linear-gradient(180deg, #0b0b0b 0%, #050505 100%);
    overflow: hidden;
    isolation: isolate;
  }
  /* faint grid */
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(ellipse 1100px 600px at 30% 60%, #000 50%, transparent 90%);
    -webkit-mask-image: radial-gradient(ellipse 1100px 600px at 30% 60%, #000 50%, transparent 90%);
  }
  /* speed lines */
  .speed { position: absolute; inset: 0; pointer-events: none; }

  .badge {
    position: absolute;
    top: 60px; left: 64px;
    display: inline-flex; align-items: center; gap: 10px;
    padding: 9px 16px 9px 12px;
    border-radius: 999px;
    background: rgba(214,255,0,0.10);
    border: 1px solid rgba(214,255,0,0.35);
    color: #D6FF00;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .badge .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #D6FF00;
    box-shadow: 0 0 14px #D6FF00;
  }

  .title-wrap { position: absolute; left: 64px; top: 152px; max-width: 720px; }
  .eyebrow {
    color: #8a8a8a; font-size: 22px; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 14px;
  }
  .title {
    font-size: 100px;
    font-weight: 800;
    line-height: 1.0;
    letter-spacing: -0.045em;
    color: #ffffff;
  }
  .title .accent {
    color: #D6FF00;
    text-shadow: 0 0 70px rgba(214,255,0,0.45);
    position: relative;
    display: inline-block;
  }
  /* no underline; rely on color + glow for the accent */
  .tagline {
    margin-top: 30px;
    color: #c8c8c8;
    font-size: 30px;
    font-weight: 500;
    letter-spacing: -0.02em;
  }
  .tagline .sep {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #D6FF00;
    margin: 0 14px 7px;
    vertical-align: middle;
  }

  .meta {
    position: absolute;
    left: 64px; bottom: 60px;
    display: flex; align-items: center; gap: 22px;
    color: #7a7a7a; font-size: 19px; font-weight: 500;
    letter-spacing: -0.01em;
  }
  .meta b { color: #f5f5f5; font-weight: 700; margin-right: 6px; }
  .meta .pipe { width: 1px; height: 18px; background: #2a2a2a; }

  /* Right-side dashboard card */
  .card {
    position: absolute;
    right: 64px; top: 138px;
    width: 372px;
    background: linear-gradient(180deg, #1a1a1a 0%, #101010 100%);
    border: 1px solid #2e2e2e;
    border-radius: 28px;
    padding: 26px 28px 24px;
    box-shadow:
      0 40px 70px rgba(0,0,0,0.6),
      0 0 0 1px rgba(255,255,255,0.02),
      inset 0 1px 0 rgba(255,255,255,0.05);
    transform: rotate(3deg);
  }
  .card .row { display: flex; align-items: center; justify-content: space-between; }
  .card .label { color: #c8c8c8; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .card .live { display: inline-flex; align-items: center; gap: 6px; color: #D6FF00; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
  .card .live .pulse { width: 6px; height: 6px; border-radius: 50%; background: #D6FF00; box-shadow: 0 0 10px #D6FF00; }
  .card .pace {
    margin-top: 14px;
    font-size: 64px; font-weight: 800; letter-spacing: -0.04em;
    color: #ffffff;
    font-feature-settings: "tnum" 1;
  }
  .card .pace small { color: #8a8a8a; font-size: 22px; font-weight: 600; margin-left: 6px; letter-spacing: 0; }
  .card .stats {
    margin-top: 18px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
    border-top: 1px solid #232323;
    padding-top: 16px;
  }
  .card .stat .k { color: #6a6a6a; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .card .stat .v { color: #f5f5f5; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; font-feature-settings: "tnum" 1; }

  /* Ring under card */
  .ring {
    position: absolute;
    right: -120px; bottom: -180px;
    width: 720px; height: 720px;
    border-radius: 50%;
    border: 1.5px solid rgba(214,255,0,0.20);
    box-shadow: inset 0 0 80px rgba(214,255,0,0.05);
  }
  .ring::after {
    content: ''; position: absolute; inset: -1.5px;
    border-radius: 50%;
    border: 1.5px dashed rgba(214,255,0,0.35);
    clip-path: polygon(50% 0, 100% 0, 100% 60%, 50% 50%);
    animation: none;
  }

  /* Day-pill bottom right */
  .day-pill {
    position: absolute;
    right: 64px; bottom: 56px;
    display: inline-flex; align-items: center; gap: 14px;
    padding: 12px 18px 12px 14px;
    background: rgba(214,255,0,0.08);
    border: 1px solid rgba(214,255,0,0.30);
    border-radius: 14px;
    color: #D6FF00;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.06em;
  }
  .day-pill .num {
    color: #ffffff;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    font-feature-settings: "tnum" 1;
  }
  .day-pill .bar {
    width: 110px; height: 6px;
    background: #1a1a1a;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid #2a2a2a;
  }
  .day-pill .bar i {
    display: block;
    height: 100%;
    width: 64%;
    background: linear-gradient(90deg, #D6FF00, #b4dd00);
    border-radius: 999px;
    box-shadow: 0 0 10px rgba(214,255,0,0.5);
  }

  /* Decorative arrow streak running across */
  .streak {
    position: absolute;
    left: 40px; top: 440px;
    width: 720px; height: 90px;
    pointer-events: none;
    opacity: 0.95;
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="grid"></div>

    <!-- speed lines (right side) -->
    <svg class="speed" viewBox="0 0 1200 630" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sl" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#D6FF00" stop-opacity="0"/>
          <stop offset="0.5" stop-color="#D6FF00" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#D6FF00" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g stroke="url(#sl)" stroke-width="1.2" fill="none" opacity="0.55">
        <line x1="640" y1="60"  x2="1180" y2="60"/>
        <line x1="700" y1="100" x2="1180" y2="100"/>
        <line x1="760" y1="140" x2="1180" y2="140"/>
      </g>
    </svg>

    <!-- bottom streak path (the "running route") -->
    <svg class="streak" viewBox="0 0 720 90">
      <defs>
        <linearGradient id="trail" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#D6FF00" stop-opacity="0"/>
          <stop offset="0.45" stop-color="#D6FF00" stop-opacity="0.7"/>
          <stop offset="1" stop-color="#D6FF00" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <path d="M 0 70 C 100 10, 220 90, 360 50 S 580 0, 700 36"
            stroke="url(#trail)" stroke-width="3" fill="none" stroke-linecap="round"/>
      <!-- chevron motion glyph at tip -->
      <g transform="translate(700,36)">
        <path d="M -6 -10 L 8 0 L -6 10" fill="none" stroke="#D6FF00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="0" cy="0" r="14" fill="#D6FF00" opacity="0.16"/>
      </g>
    </svg>

    <div class="badge">
      <span class="dot"></span>
      <span>NOTION TALK · SEASON 3</span>
    </div>

    <div class="title-wrap">
      <div class="eyebrow">RUNNING CHALLENGE</div>
      <h1 class="title">노션톡<br>러닝 챌린지 <span class="accent">3기</span></h1>
      <div class="tagline">달리고<span class="sep"></span>인증하고<span class="sep"></span>함께</div>
    </div>

    <div class="card">
      <div class="row">
        <div class="label">오늘의 러닝</div>
        <div class="live"><span class="pulse"></span>LIVE</div>
      </div>
      <div class="pace">8.24<small>km</small></div>
      <div class="stats">
        <div class="stat"><div class="k">PACE</div><div class="v">5'08"</div></div>
        <div class="stat"><div class="k">TIME</div><div class="v">42:18</div></div>
        <div class="stat"><div class="k">CAL</div><div class="v">512</div></div>
        <div class="stat"><div class="k">STREAK</div><div class="v">D-9</div></div>
      </div>
    </div>

    <div class="ring"></div>

    <div class="meta">
      <span><b>14일</b>7회 도전</span>
      <span class="pipe"></span>
      <span><b>25명</b>의 러너</span>
      <span class="pipe"></span>
      <span><b>스크린샷</b>으로 자동 인증</span>
    </div>

    <div class="day-pill">
      <span>DAY</span>
      <span class="num">09 / 14</span>
      <span class="bar"><i></i></span>
    </div>
  </div>
</body>
</html>`;

async function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Ensure web fonts are ready before screenshot
  await page.evaluate(() => document.fonts.ready);
  // small extra settle for variable font swap
  await page.waitForTimeout(300);

  await page.screenshot({
    path: OUT,
    type: 'png',
    omitBackground: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  await browser.close();
  console.log('Wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
