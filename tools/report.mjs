#!/usr/bin/env node
/* 溯流 · 通用多链报告（命令行）：node tools/report.mjs <case.json> [选项]
 * 把 tools/trace.mjs、tools/btc.mjs、tools/resolve-bridge.mjs 写出的 JSON 渲染成可打印 HTML。
 *
 * 选项：
 *   --out FILE       输出 HTML（默认 <输入文件名>.html）
 *   --kind K         utxo | bridge | trace | account（默认自动判断）
 *   --generated-at S 报告生成时间（ISO 字符串；默认当前时间，同输入同样输出可传固定值）
 *   -h, --help
 * 输入可以是：
 *   - trace 结果 {case, meta}
 *   - BTC 结果 {case, meta}（meta.kind === 'utxo' 或 case.chain === 'btc'）
 *   - Tron 结果 {case, meta}（meta.kind === 'account' 或 case.chain === 'tron'）
 *   - 跨链结果 {protocol, status, ...}
 * 退出码：0 完成；1 读取 / 渲染失败；2 参数错误。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');
const SELF = fileURLToPath(import.meta.url);

class UsageError extends Error {}
function parseArgs(argv) {
  const o = { help: false };
  const needVal = (a, i) => { if (i + 1 >= argv.length) throw new UsageError(a + ' 需要一个值'); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--out') { o.out = needVal(a, i); i++; }
    else if (a === '--kind') { o.kind = needVal(a, i); i++; }
    else if (a === '--generated-at') { o.generatedAt = needVal(a, i); i++; }
    else if (a.startsWith('-')) throw new UsageError('未知选项：' + a);
    else if (o.input) throw new UsageError('只能给一个 JSON 文件，多出来的：' + a);
    else o.input = a;
  }
  if (!o.help) {
    if (!o.input) throw new UsageError('缺少输入 JSON。用法：node tools/report.mjs <case.json> [选项]');
    if (o.kind && ['utxo', 'bridge', 'trace', 'account'].indexOf(o.kind) < 0) throw new UsageError('--kind 只支持 utxo / bridge / trace / account');
  }
  return o;
}

function detectKind(data) {
  if (data && typeof data === 'object' && (data.protocol || data.status)) return 'bridge';
  if (data && data.meta && data.meta.kind === 'utxo') return 'utxo';
  if (data && data.case && data.case.chain === 'btc') return 'utxo';
  if (data && data.meta && data.meta.kind === 'account') return 'account';
  if (data && data.case && data.case.chain === 'tron') return 'account';
  return 'trace';
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) {
    if (e instanceof UsageError) { process.stderr.write('参数错误：' + e.message + '\n'); return 2; }
    throw e;
  }
  if (args.help) {
    const raw = readFileSync(SELF, 'utf8').split('\n');
    const end = raw.findIndex((l, i) => i > 0 && /^\s*\*\/\s*$/.test(l));
    const head = raw.slice(1, end > 0 ? end : raw.length).map(l => l.replace(/^ \* ?/, '').replace(/^\/\* ?/, ''));
    process.stdout.write(head.join('\n') + '\n');
    return 0;
  }
  const inPath = resolve(args.input);
  let data;
  try { data = JSON.parse(readFileSync(inPath, 'utf8')); }
  catch (e) { process.stderr.write('读取失败：' + e.message + '\n'); return 1; }

  const kind = args.kind || detectKind(data);
  const generatedAt = args.generatedAt || new Date().toISOString();
  let html;
  try {
    if (kind === 'bridge') html = ReportMulti.build({ kind: 'bridge', result: data, generatedAt: data.retrieved_at || generatedAt });
    else html = ReportMulti.build({ kind, case: data.case, meta: data.meta || {}, generatedAt });
  } catch (e) { process.stderr.write('渲染失败：' + (e && e.message ? e.message : e) + '\n'); return 1; }

  const outPath = resolve(args.out || inPath.replace(/\.json$/i, '') + '.html');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  process.stdout.write('报告已写入 ' + outPath + '\n（kind=' + kind + '）\n');
  return 0;
}

export { parseArgs, detectKind, UsageError };
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase()) {
  main().then(code => { process.exitCode = code; }, e => { process.stderr.write('未预期的错误：' + (e && e.stack ? e.stack : e) + '\n'); process.exitCode = 1; });
}
