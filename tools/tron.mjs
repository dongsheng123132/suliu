#!/usr/bin/env node
/* 溯流 · Tron 追踪（命令行）：node tools/tron.mjs <Tron 地址> [选项]
 * 引擎在 lib/tron.mjs；数据来自公开 TronGrid API（默认 https://api.trongrid.io），不需要 key。
 * 设置环境变量 TRON_API_KEY 或 --key 时，请求头加 TRON-PRO-API-KEY（付费档有更高频率）。
 * 只做交易级转账：列出每笔的发送方 / 接收方（链上事实）与金额；不推断地址归属、不推断资金归属。
 * USDT 为可冻结稳定币（可冻≠已冻），本工具不判断任何实际冻结状态。
 *
 * 选项：
 *   --max-txs N      最多追踪多少笔转账（默认 50）
 *   --min-value N    忽略低于该最小单位金额的转账（默认 0；只计数，不展开）
 *   --max-calls N    TronGrid 调用预算（默认 200）
 *   --max-pages N    每个数据源最多翻几页（默认 5；单页上限 200）
 *   --base URL       TronGrid API 根地址（默认 https://api.trongrid.io）
 *   --key KEY        TronGrid API key（也可用环境变量 TRON_API_KEY；不写进任何输出）
 *   --out FILE       结果 JSON（默认 cases/tron-<地址前10>.json）
 *   --html FILE      同时生成可打印 HTML 报告
 *   --record DIR     联网追踪，同时把每个响应按去掉域名的路径存进 DIR（做夹具）
 *   --replay DIR     不联网，从 DIR 读响应（夹具回放，不需要网络 / key）
 *   --interval MS    两次请求的最小间隔（默认 500；回放默认 0）
 *   --quiet          不在 stderr 打印每次请求
 *   -h, --help
 * 联网：检测到 HTTPS_PROXY / HTTP_PROXY 且 NODE_USE_ENV_PROXY 不是 '1' 时，带上 NODE_USE_ENV_PROXY=1 用同样参数重新启动自己
 *       （Node 24 默认不读系统代理变量；本机实测 TronGrid 可直连，但保留该行为以适配需要代理的网络）。
 * 退出码：0 完成；1 运行出错；2 参数错误；3 完成但结果被截断（预算 / 交易数 / 页数上限，结果文件照常写出）。
 * 演示：node tools/tron.mjs <地址> --replay tests/fixtures/tron-demo --out /tmp/tron.json --html /tmp/tron.html
 *       夹具是合成的演示数据（不是真实案件），只用来在无网络 / 无 key 时演示流程。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as Tron from '../lib/tron.mjs';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');
const SELF = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SELF));
const DEFAULT_BASE = Tron.DEFAULT_BASE;

class UsageError extends Error {}

function readKey(args) {
  if (args && args.key) return String(args.key).trim();
  const env = process.env.TRON_API_KEY;
  if (env && String(env).trim()) return String(env).trim();
  const f = join(ROOT, '.env');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*TRON_API_KEY\s*=\s*(.*?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

function parseArgs(argv) {
  const o = { maxTxs: 50, minValue: 0, maxCalls: 200, maxPages: 5, quiet: false, help: false };
  const needVal = (a, i) => { if (i + 1 >= argv.length || (argv[i + 1].startsWith('--') && argv[i + 1].length > 2)) throw new UsageError(a + ' 需要一个值'); return argv[i + 1]; };
  const needInt = (a, i, min) => { const v = needVal(a, i); if (!/^\d+$/.test(v) || Number(v) < min) throw new UsageError(a + ' 需要不小于 ' + min + ' 的整数，收到：' + v); return Number(v); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--max-txs') { o.maxTxs = needInt(a, i, 1); i++; }
    else if (a === '--min-value') { o.minValue = needInt(a, i, 0); i++; }
    else if (a === '--max-calls') { o.maxCalls = needInt(a, i, 1); i++; }
    else if (a === '--max-pages') { o.maxPages = needInt(a, i, 1); i++; }
    else if (a === '--interval') { o.interval = needInt(a, i, 0); i++; }
    else if (a === '--base') { o.base = needVal(a, i); i++; }
    else if (a === '--key') { o.key = needVal(a, i); i++; }
    else if (a === '--out') { o.out = needVal(a, i); i++; }
    else if (a === '--html') { o.html = needVal(a, i); i++; }
    else if (a === '--record') { o.record = needVal(a, i); i++; }
    else if (a === '--replay') { o.replay = needVal(a, i); i++; }
    else if (a === '--quiet') o.quiet = true;
    else if (a.startsWith('-')) throw new UsageError('未知选项：' + a);
    else if (o.address) throw new UsageError('只能给一个地址，多出来的：' + a);
    else o.address = a;
  }
  if (!o.help) {
    if (!o.address) throw new UsageError('缺少地址。用法：node tools/tron.mjs <Tron 地址> [选项]（--help 看全部选项）');
    const v = Tron.validateAddress(o.address);
    if (!v.valid) throw new UsageError('不是合法的 Tron 主网地址：' + o.address + '（' + v.reason + '）');
    if (o.record && o.replay) throw new UsageError('--record 与 --replay 不能同时用');
  }
  return o;
}

// ---- 夹具：key = 去掉域名的路径 + 查询串（TronGrid 的 key 走请求头，不进 URL）----
const keyOf = url => { const u = new URL(String(url)); return u.pathname + (u.search || ''); };
function makeRecordFetch(dir, realFetch) {
  mkdirSync(dir, { recursive: true });
  return async (url, init) => {
    const res = await realFetch(url, init);
    let body = null, text = '';
    try { text = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json()); body = JSON.parse(text); }
    catch (e) { body = null; }
    if (res.ok !== false && body != null) {
      const key = keyOf(url);
      writeFileSync(join(dir, 'trongrid-' + Buffer.from(key).toString('base64url').slice(0, 60) + '.json'), JSON.stringify({ key, response: body }) + '\n');
    }
    return { ok: res.ok, status: res.status, json: async () => (body == null ? JSON.parse(text) : JSON.parse(JSON.stringify(body))) };
  };
}
function makeReplayFetch(dir) {
  const d = resolve(dir);
  if (!existsSync(d)) throw new Error('--replay 目录不存在：' + d);
  const map = new Map();
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(d, f), 'utf8'));
    if (j && typeof j.key === 'string') map.set(j.key, j.response);
  }
  if (!map.size) throw new Error('--replay 目录里没有夹具（*.json）：' + d);
  return async url => {
    const key = keyOf(url);
    if (!map.has(key)) throw new Error('夹具里没有这个请求：' + key);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(map.get(key))) };
  };
}

function summary(result, outPath, mode) {
  const { case: c, meta } = result;
  const L = [];
  L.push('Tron 追踪起点 ' + meta.start + (mode ? '  [' + mode + ']' : ''));
  L.push('账户余额 ' + (meta.balance_trx == null ? '—' : meta.balance_trx + ' TRX') + '；转账 ' + c.txs.length + ' 笔（已确认 ' + c.txs.filter(t => t.confirmed).length + '，未确认 ' + c.txs.filter(t => !t.confirmed).length + '）；地址 ' + c.nodes.length + ' 个');
  L.push('调用 ' + meta.calls + ' / ' + meta.maxCalls + '；截断：' + (meta.truncated ? '是（' + meta.truncatedReasons.join('；') + '）' : '否'));
  L.push('已忽略（只计数）：非白名单 TRC20 合约 ' + meta.ignored.nonWhitelistTrc20 + '，零值 ' + meta.ignored.zeroValue + '，低于阈值 ' + meta.ignored.belowMinValue + '，重复 ' + meta.ignored.duplicate);
  L.push('');
  L.push('交易级明细（发送方 / 接收方是链上事实，不推断归属）：');
  c.txs.forEach((t, i) => {
    L.push((i + 1) + '. ' + (t.confirmed ? '已确认' : '未确认') + '  ' + (t.ts ? new Date(t.ts * 1000).toISOString() : '—') + '  区块 ' + (t.block == null ? '—' : t.block) + '  ' + t.asset + ' ' + t.amount_min + '（' + t.amount_human + '）');
    L.push('   ' + (t.from || '—') + ' → ' + (t.to || '—') + '  tx ' + t.txid + (t.note ? '  [' + t.note + ']' : ''));
  });
  if (meta.warnings.length) { L.push(''); L.push('提示：'); meta.warnings.forEach(w => L.push('  - ' + w)); }
  L.push('');
  L.push('金额单位为整数最小单位（TRX / USDT 均 6 位小数）；USDT 为可冻结稳定币（可冻≠已冻），本工具不判断实际冻结状态。');
  L.push('自动结果可能漏判或误判，提交举报前请人工复核。');
  if (outPath) L.push('结果已写入 ' + outPath);
  return L.join('\n');
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) {
    if (e instanceof UsageError) { process.stderr.write('参数错误：' + e.message + '\n'); return 2; }
    throw e;
  }
  if (args.help) {
    const head = readFileSync(SELF, 'utf8').split('\n').slice(1, 26).map(l => l.replace(/^ \* ?/, '').replace(/^\/\* /, ''));
    process.stdout.write(head.join('\n') + '\n');
    return 0;
  }

  // 联网且有系统代理变量时，带 NODE_USE_ENV_PROXY=1 重新启动自己（与 tools/trace.mjs 一致）
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!args.replay && proxy && process.env.NODE_USE_ENV_PROXY !== '1') {
    const r = spawnSync(process.execPath, [SELF, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    if (r.error) { process.stderr.write('重新启动失败：' + r.error.message + '\n'); return 1; }
    return r.status == null ? 1 : r.status;
  }

  const key = args.replay ? '' : readKey(args);
  let fetchImpl;
  try {
    if (args.replay) fetchImpl = makeReplayFetch(resolve(args.replay));
    else if (args.record) fetchImpl = makeRecordFetch(resolve(args.record), globalThis.fetch);
    else fetchImpl = globalThis.fetch;
  } catch (e) { process.stderr.write('错误：' + e.message + '\n'); return 1; }

  const client = Tron.createClient({
    base: args.base || DEFAULT_BASE, key, fetchImpl, maxCalls: args.maxCalls,
    minIntervalMs: args.interval != null ? args.interval : (args.replay ? 0 : 500)
  });

  let result;
  try {
    result = await Tron.trace({
      client, address: args.address, maxTxs: args.maxTxs, minValue: args.minValue, maxPages: args.maxPages,
      onProgress: args.quiet ? null : p => process.stderr.write('[' + p.calls + '/' + p.maxCalls + '] ' + p.msg + '\n')
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    process.stderr.write('追踪失败：' + (key ? msg.split(key).join('***') : msg) + '\n');
    return 1;
  }

  result.meta.params.base = client.base;
  result.meta.has_key = !!key;
  if (args.replay) { result.meta.demo = true; result.meta.demo_note = '夹具回放：合成的演示数据，不是真实案件'; }
  const text = JSON.stringify(result, null, 2);
  if (key && text.includes(key)) { process.stderr.write('错误：结果里出现了 key，拒绝写出\n'); return 1; }
  const outPath = resolve(args.out || join(ROOT, 'cases', 'tron-' + args.address.slice(0, 10) + '.json'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text + '\n');

  let htmlPath = null;
  if (args.html) {
    htmlPath = resolve(args.html);
    const html = ReportMulti.build({ kind: 'account', case: result.case, meta: result.meta, generatedAt: new Date().toISOString() });
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, html);
  }

  process.stdout.write(summary(result, outPath, args.replay ? '回放' : args.record ? '录制' : '') + (htmlPath ? '\n报告已写入 ' + htmlPath : '') + '\n');
  if (result.meta.truncated) { process.stderr.write('结果被截断（' + result.meta.truncatedReasons.join('；') + '），已写出部分结果，退出码 3\n'); return 3; }
  return 0;
}

export { parseArgs, makeRecordFetch, makeReplayFetch, keyOf, summary, readKey, UsageError };
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase()) {
  main().then(code => { process.exitCode = code; }, e => { process.stderr.write('未预期的错误：' + (e && e.stack ? e.stack : e) + '\n'); process.exitCode = 1; });
}
