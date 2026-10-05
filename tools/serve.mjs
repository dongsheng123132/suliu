#!/usr/bin/env node
// tools/serve.mjs -- 零依赖静态文件服务器。根目录 = 项目根，端口默认 8777（8765 被本机另一个网站占用，不要用）。
//   node tools/serve.mjs [端口]
// '/' 返回 溯流资金画布.html。只允许 GET / HEAD。仅监听 127.0.0.1。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = '溯流资金画布.html';
const HOST = '127.0.0.1';

const arg = process.argv[2];
const PORT = arg === undefined ? 8777 : Number(arg);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[用法错误] 端口必须是 1-65535 的整数，收到: ${arg}`);
  console.error('用法: node tools/serve.mjs [端口=8777]');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function send(res, code, text, extra = {}) {
  const body = Buffer.from(text + '\n', 'utf8');
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(body);
}

/** 把请求路径解析成根目录内的绝对路径；不合法返回 null */
function resolveSafe(rawPath) {
  let p;
  try { p = decodeURIComponent(rawPath); } catch { return null; }
  if (p.includes('\0')) return null;
  if (p === '/') p = '/' + INDEX;
  // 拒绝 '..' 段、反斜杠、冒号（盘符 / NTFS 备用数据流）——不做"规范化后放行"，直接拒绝
  const segs = p.split('/');
  for (const s of segs) {
    if (s === '..' || s.includes('\\') || s.includes(':')) return null;
  }
  const target = path.resolve(ROOT, '.' + p);
  const r = path.relative(ROOT, target);
  if (r === '' || r.startsWith('..') || path.isAbsolute(r)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  const done = (code) => console.log(`${req.method} ${req.url} -> ${code} (${Date.now() - started} ms)`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return done(405);
  }
  const pathname = (req.url || '/').split('?')[0].split('#')[0];
  const file = resolveSafe(pathname);
  if (!file) {
    send(res, 403, 'Forbidden');
    return done(403);
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      send(res, 404, 'Not Found');
      return done(404);
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return done(200); }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    res.on('close', () => done(200));
  });
});

server.on('error', (e) => {
  console.error(`[错误] 无法监听 ${HOST}:${PORT}: ${e.code || ''} ${e.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT}`);
  console.log(`http://${HOST}:${PORT}/  (Ctrl+C 退出)`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(); process.exit(0); });
}
