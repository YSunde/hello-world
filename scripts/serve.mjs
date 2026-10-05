#!/usr/bin/env node
/*
 * КБ-13 · локальный сервер одной командой, без установки пакетов:
 *   node scripts/serve.mjs            → http://localhost:8013/
 *   PORT=3000 node scripts/serve.mjs  → другой порт
 * Отдаёт файлы сайта, поддерживает перемотку видео (HTTP Range). Используется и в Codespaces.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..') + sep);
const port = Number(process.env.PORT) || 8013;
const host = process.env.HOST || (process.env.CODESPACES ? '0.0.0.0' : '127.0.0.1');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

const server = createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(root, rel));
  let st;
  try {
    if (!file.startsWith(root)) throw new Error('outside');
    st = statSync(file);
    if (!st.isFile()) throw new Error('not a file');
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }
  const headers = {
    'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m) {
    if (m[1]) {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), st.size - 1);
    } else if (m[2]) start = Math.max(0, st.size - Number(m[2]));
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Порт ${port} занят. Запустите с другим: PORT=8014 node scripts/serve.mjs` : e.message);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`\n  КБ-13 работает: http://localhost:${port}/\n  Остановить: Ctrl+C\n`);
});
