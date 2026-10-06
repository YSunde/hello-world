#!/usr/bin/env node
/*
 * КБ-13 · рендер видео-визитки.
 * Покадрово снимает video/render.html (Playwright + Chromium), синтезирует звук разрядов,
 * собирает H.264 MP4 и постер WebP через ffmpeg.
 *   node scripts/render-video.mjs [папка-для-кадров]
 * Нужны: playwright (npm), ffmpeg с libx264 и libwebp.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const posterOnly = args.includes('--poster-only');
const framesDir = args.find((a) => !a.startsWith('--')) || join(tmpdir(), 'kb13-frames');
const outDir = join(root, 'assets/video');
const FPS = 30;
const DURATION = 24.5;
const STRIKES = [0.3, 7.55, 14.05, 16.45, 20.45];
const CUTS = [3.1, 7.3, 11.6, 16.0, 20.2];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}

/* статический сервер для сцены */
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

if (!posterOnly) await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${port}/video/render.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => window.ready);
const stage = await page.$('#stage');
const total = posterOnly ? 0 : Math.round(DURATION * FPS);
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.renderFrame(t), i / FPS);
  await stage.screenshot({ path: join(framesDir, `f${String(i).padStart(5, '0')}.png`) });
  if (i % 60 === 0) console.log(`кадр ${i}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)} c`);
}
// постер: финальная сцена (знак КБ13, паутина разряда, направления) — не повторяет кадры страницы
const posterPng = join(framesDir, 'poster.png');
await page.evaluate(() => {
  for (let t = 20.2; t <= 23.2; t += 1 / 30) window.renderFrame(t);
});
await stage.screenshot({ path: posterPng });
await browser.close();
server.close();
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', posterPng, '-vf', 'scale=1280:-2', '-c:v', 'libwebp', '-quality', '84', join(outDir, 'kb13-vizitka-poster.webp')], { stdio: 'inherit' });
if (posterOnly) {
  console.log('постер обновлён');
  process.exit(0);
}

/* ---------- звук: гул + треск разрядов + раскаты ---------- */
const SR = 48000;
const N = Math.round(DURATION * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const env = Math.min(1, t / 1.5) * Math.min(1, (DURATION - t) / 1.5);
  const lfo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t);
  const d = 0.03 * env * lfo * (Math.sin(2 * Math.PI * 55 * t) + 0.45 * Math.sin(2 * Math.PI * 82.4 * t) + 0.2 * Math.sin(2 * Math.PI * 110.3 * t));
  L[i] += d;
  R[i] += d;
}
function strike(at, amp, rumble, pan) {
  // треск: серия коротких высокочастотных щелчков
  let hp = 0;
  let prev = 0;
  for (let k = 0; k < 7; k++) {
    const b = at + k * 0.017 + Math.abs(rnd()) * 0.012;
    const a = amp * (1 - k / 8);
    const s0 = Math.round(b * SR);
    for (let j = 0; j < 0.05 * SR && s0 + j < N; j++) {
      const x = rnd() * Math.exp(-j / (0.007 * SR)) * a;
      hp = 0.86 * (hp + x - prev);
      prev = x;
      L[s0 + j] += hp * (1 - pan);
      R[s0 + j] += hp * (1 + pan);
    }
  }
  // раскат: «коричневый» шум через фильтр низких частот
  let br = 0;
  let lp = 0;
  const s0 = Math.round((at + 0.04) * SR);
  for (let j = 0; j < 2.4 * SR && s0 + j < N; j++) {
    br = (br + rnd() * 0.02) * 0.998;
    lp += (br - lp) * 0.03;
    const e = Math.min(1, j / (0.06 * SR)) * Math.exp(-j / (0.85 * SR));
    const v = lp * e * rumble * 14;
    L[s0 + j] += v;
    R[s0 + j] += v;
  }
}
STRIKES.forEach((s, i) => strike(s, 0.55, 0.32, i % 2 ? 0.25 : -0.25));
CUTS.forEach((c, i) => strike(c - 0.2, 0.32, 0.12, i % 2 ? -0.4 : 0.4));
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / peak;
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + N * 4, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
const wavPath = join(framesDir, 'audio.wav');
await writeFile(wavPath, wav);

/* ---------- сборка ---------- */
const mp4 = join(outDir, 'kb13-vizitka.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(framesDir, 'f%05d.png'), '-i', wavPath, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4], { stdio: 'inherit' });
console.log('готово:', mp4);
