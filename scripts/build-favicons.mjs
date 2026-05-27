#!/usr/bin/env node
/**
 * Rasterize public/favicon.svg into all required PNG sizes.
 *
 * Outputs (under public/):
 *   - favicon-16.png    16x16
 *   - favicon-32.png    32x32
 *   - apple-touch-icon.png  180x180  (uses dedicated SVG with larger safe area)
 *   - icon-192.png     192x192
 *   - icon-512.png     512x512
 *
 * Usage: node scripts/build-favicons.mjs
 *
 * sharp is a devDependency. Do NOT promote it to runtime deps.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const FAVICON_SVG = path.join(PUBLIC_DIR, 'favicon.svg');

// Apple-touch-icon needs a dedicated SVG with extra safe area:
// iOS rounds the corners and overlays a tile background, so we
// inset the mark and use a full-bleed background fill.
const APPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#0B1A33"/>
  <g transform="translate(28 28) scale(1.95)">
    <circle cx="42" cy="15" r="5.5" fill="#D6FF00"/>
    <path d="M20 50 L30 38 L25 28 L40 24 L50 34" fill="none" stroke="#D6FF00" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M25 28 L18 18" fill="none" stroke="#D6FF00" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    <g stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.95">
      <path d="M6 44 H16"/>
      <path d="M4 54 H12"/>
    </g>
  </g>
</svg>`;

const targets = [
  { name: 'favicon-16.png', size: 16, src: 'favicon' },
  { name: 'favicon-32.png', size: 32, src: 'favicon' },
  { name: 'icon-192.png', size: 192, src: 'favicon' },
  { name: 'icon-512.png', size: 512, src: 'favicon' },
  { name: 'apple-touch-icon.png', size: 180, src: 'apple' },
];

async function main() {
  const faviconBuf = await fs.readFile(FAVICON_SVG);
  const appleBuf = Buffer.from(APPLE_SVG, 'utf8');

  for (const t of targets) {
    const src = t.src === 'apple' ? appleBuf : faviconBuf;
    const out = path.join(PUBLIC_DIR, t.name);
    await sharp(src, { density: 384 })
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);

    const meta = await sharp(out).metadata();
    if (meta.width !== t.size || meta.height !== t.size) {
      throw new Error(`Size mismatch for ${t.name}: got ${meta.width}x${meta.height}, want ${t.size}x${t.size}`);
    }
    console.log(`  ${t.name}  ${meta.width}x${meta.height}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
