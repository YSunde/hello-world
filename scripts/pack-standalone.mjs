#!/usr/bin/env node
/*
 * КБ-13 · сборка сайта в ОДИН независимый HTML-файл.
 * Внутрь кладутся скрипты (собраны в один, без модулей), стили, шрифты, картинки, видео.
 * Файл открывается двойным кликом с диска (file://), без сервера и VS Code.
 *   node scripts/pack-standalone.mjs [выходной-файл]
 * Нужны: node 18+, npx (скачает esbuild), ffmpeg с libx264 — для облегчённого видео 720p
 * (без ffmpeg кладётся исходное видео).
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'standalone', 'kb13.html');
const tmp = mkdtempSync(join(tmpdir(), 'kb13-pack-'));
const MIME = { '.webm': 'video/webm', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const dataUri = (file) => `data:${MIME[extname(file)] || 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;
const cache = new Map();
const asset = (rel) => {
  const clean = rel.split('?')[0];
  if (!cache.has(clean)) {
    const f = join(root, clean);
    if (!existsSync(f)) throw new Error(`нет файла: ${clean}`);
    cache.set(clean, dataUri(f));
  }
  return cache.get(clean);
};

// 1) свежая страница
execFileSync('node', [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
let html = readFileSync(join(root, 'index.html'), 'utf8');

// 2) скрипты: все модули → один классический скрипт (модули не грузятся по file://)
const bundle = join(tmp, 'bundle.js');
execFileSync('npx', ['--yes', 'esbuild@0.24.2', join(root, 'assets/js/main.js'), '--bundle', '--format=iife', '--minify', '--target=es2020', `--outfile=${bundle}`], { stdio: 'inherit' });
const js = readFileSync(bundle, 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script type="module" src="assets\/js\/main\.js[^"]*"><\/script>\s*/, '');
html = html.replace('</body>', () => `<script>${js}</script>\n</body>`);

// 3) стили со шрифтами внутри
let css = readFileSync(join(root, 'assets/css/main.css'), 'utf8');
css = css.replace(/url\((['"]?)\.\.\/(fonts\/[^'")]+)\1\)/g, (_, q, p) => `url(${asset('assets/' + p)})`);
html = html.replace(/<link rel="stylesheet" href="assets\/css\/main\.css[^"]*">/, () => `<style>${css}</style>`);

// 4) лишнее для одного файла: предзагрузки
html = html.replace(/<link rel="preload"[^>]*>\s*/g, '');
html = html.replace(/<link rel="icon" href="([^"]+)"/, (_, p) => `<link rel="icon" href="${asset(p)}"`);

// 5) картинки: одна версия (полная), без srcset
html = html.replace(/<img\b[^>]*>/g, (tag) => {
  const m = tag.match(/ src="(assets\/[^"]+)"/);
  if (!m) return tag;
  let src = m[1];
  const full = src.replace(/-768(\.\w+)$/, '$1');
  if (full !== src && existsSync(join(root, full))) src = full;
  return tag
    .replace(/ srcset="[^"]*"/, '')
    .replace(/ sizes="[^"]*"/, '')
    .replace(/ loading="lazy"/, '')
    .replace(/ src="[^"]+"/, () => ` src="${asset(src)}"`);
});

// 6) видео: облегчённая 720p-копия (если есть ffmpeg), постер
html = html.replace(/ poster="(assets\/[^"]+)"/g, (_, p) => ` poster="${asset(p)}"`);
html = html.replace(/<source src="(assets\/[^"]+\.mp4)" type="video\/mp4">/g, (_, p) => {
  let file = join(root, p);
  let webm = '';
  let mp4type = 'video/mp4';
  try {
    const small = join(tmp, 'video-720.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-profile:v', 'high', '-level', '3.1', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '112k', small]);
    file = small;
    // точные кодеки: браузер без H.264 пропустит эту дорожку сразу и возьмёт WebM
    mp4type = 'video/mp4; codecs=&quot;avc1.64001F, mp4a.40.2&quot;';
    // запасная дорожка WebM — для браузеров без H.264 (например, сборки Chromium)
    const vp9 = join(tmp, 'video-720.webm');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(root, p), '-vf', 'scale=1280:-2', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '96k', vp9]);
    webm = `<source src="${dataUri(vp9)}" type="video/webm; codecs=&quot;vp9, opus&quot;">`;
  } catch {
    console.warn('ffmpeg недоступен — в файл кладётся исходное видео');
  }
  return `<source src="${dataUri(file)}" type="${mp4type}">${webm}`;
});
html = html.replace(/ preload="none"/, ' preload="metadata"');

// 7) контроль: ссылок на внешние файлы не осталось
const left = [...html.matchAll(/(?:src|href|poster)="(assets\/[^"]+)"/g)].map((m) => m[1]);
if (left.length) {
  rmSync(tmp, { recursive: true, force: true });
  throw new Error('остались ссылки на файлы: ' + [...new Set(left)].join(', '));
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
rmSync(tmp, { recursive: true, force: true });
console.log(`готово: ${out} — ${(Buffer.byteLength(html) / 1048576).toFixed(1)} МБ`);
