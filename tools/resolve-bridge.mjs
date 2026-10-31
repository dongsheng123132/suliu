#!/usr/bin/env node
/* 溯流 · 跨链解析（命令行）：node tools/resolve-bridge.mjs --protocol across --origin-chain-id N --deposit-id ID [选项]
 * 只解析已核实的官方 API；Across 用官方 /deposit/status 与 /deposit，保留 raw / source / retrieved_at。
 * Chainflip 本轮明确 unsupported，只给人工链接，不假装已自动解析。
 *
 * 选项：
 *   --protocol P           across（默认）/ chainflip
 *   --origin-chain-id N    源链 chainid（Across 必填，除非只给 --deposit-txn-ref）
 *   --deposit-id ID        Across depositId（与 --origin-chain-id 一起用）
 *   --deposit-txn-ref TX   源交易哈希（Across 可单独使用）
 *   --key S                Across API key（也可用环境变量 ACROSS_API_KEY；不会打印 / 写进任何输出）
 *   --base URL             Across API 根地址（默认 https://across.to/api）
 *   --out FILE             结果 JSON（默认 cases/bridge-<协议>-<depositId 或 源交易前10>.json）
 *   --html FILE            同时生成可打印 HTML 报告
 *   --record DIR           联网查询，同时把响应按「路径 + 查询串」存进 DIR（做夹具）
 *   --replay DIR           不联网，从 DIR 读响应（夹具回放，不需要 key）
 *   --interval MS          两次请求的最小间隔（默认 250；回放默认 0）
 *   --quiet                不打印进度
 *   -h, --help
 * 退出码：0 完成（含 chainflip unsupported）；1 运行出错（网络 / API / 鉴权 / 未找到且非 not_found 的硬错误）；2 参数错误。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { resolveBridge, normalizeStatus, ACROSS_BASE } from '../lib/bridge.mjs';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');
const SELF = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SELF));

class UsageError extends Error {}
const keyOf = url => { const u = new URL(String(url)); return u.pathname + (u.search || ''); };

function parseArgs(argv) {
  const o = { protocol: 'across', quiet: false, help: false };
  const needVal = (a, i) => { if (i + 1 >= argv.length || (argv[i + 1].startsWith('--') && argv[i + 1].length > 2)) throw new UsageError(a + ' 需要一个值'); return argv[i + 1]; };
  const needInt = (a, i, min) => { const v = needVal(a, i); if (!/^\d+$/.test(v) || Number(v) < min) throw new UsageError(a + ' 需要不小于 ' + min + ' 的整数，收到：' + v); return Number(v); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--protocol') { o.protocol = needVal(a, i); i++; }
    else if (a === '--origin-chain-id') { o.originChainId = needInt(a, i, 1); i++; }
    else if (a === '--deposit-id') { o.depositId = needVal(a, i); i++; }
    else if (a === '--deposit-txn-ref') { o.depositTxnRef = needVal(a, i); i++; }
    else if (a === '--key') { o.key = needVal(a, i); i++; }
    else if (a === '--base') { o.base = needVal(a, i); i++; }
    else if (a === '--interval') { o.interval = needInt(a, i, 0); i++; }
    else if (a === '--out') { o.out = needVal(a, i); i++; }
    else if (a === '--html') { o.html = needVal(a, i); i++; }
    else if (a === '--record') { o.record = needVal(a, i); i++; }
    else if (a === '--replay') { o.replay = needVal(a, i); i++; }
    else if (a === '--quiet') o.quiet = true;
    else if (a.startsWith('-')) throw new UsageError('未知选项：' + a);
    else throw new UsageError('多余的参数：' + a);
  }
  if (!o.help) {
    const p = String(o.protocol).toLowerCase();
    if (p !== 'across' && p !== 'chainflip') throw new UsageError('--protocol 只支持 across / chainflip，收到：' + o.protocol);
    if (p === 'across' && !o.depositTxnRef && (o.originChainId == null || !o.depositId)) throw new UsageError('Across 需要 --origin-chain-id + --deposit-id，或只给 --deposit-txn-ref');
    if (o.depositTxnRef && !/^0x[0-9a-fA-F]{64}$/.test(o.depositTxnRef)) throw new UsageError('--deposit-txn-ref 必须是 0x + 64 位十六进制');
    if (o.record && o.replay) throw new UsageError('--record 与 --replay 不能同时用');
  }
  return o;
}

function makeRecordFetch(dir, realFetch) {
  mkdirSync(dir, { recursive: true });
  return async (url, init) => {
    const res = await realFetch(url, init);
    let body = null, text = '';
    try { text = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json()); body = JSON.parse(text); } catch (e) { body = null; }
    if (res.ok !== false && body != null) {
      const key = keyOf(url);
      if (init && init.headers && (init.headers.Authorization || init.headers.authorization)) { /* 只存响应，不存 key */ }
      writeFileSync(join(dir, 'across-' + Buffer.from(key).toString('base64url').slice(0, 60) + '.json'), JSON.stringify({ key, response: body }) + '\n');
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

function summary(result) {
  const L = [];
  L.push('跨链协议 ' + result.protocol + ' · 状态 ' + result.status + (result.status_raw != null && String(result.status_raw) !== result.status ? '（原始 ' + result.status_raw + '）' : ''));
  if (result.supported === false) {
    L.push('未支持自动解析：' + (result.manual && result.manual.explorer ? '请人工到 ' + result.manual.explorer + ' 核对' : '请人工核对'));
  } else {
    L.push('源链 chainid ' + (result.originChainId == null ? '—' : result.originChainId) + ' → 目标链 chainid ' + (result.destinationChainId == null ? '—' : result.destinationChainId));
    if (result.depositId != null) L.push('depositId ' + result.depositId);
    L.push('源交易 ' + (result.sourceTx || '—'));
    L.push('目标交易 ' + (result.targetTx || '—'));
    if (result.refundTx) L.push('退款交易 ' + result.refundTx);
    L.push('源地址 ' + (result.depositor || '—'));
    L.push('目标地址 ' + (result.recipient || '—'));
    L.push('查询时刻 ' + result.retrieved_at);
    L.push('来源 ' + result.source);
  }
  if (result.warnings && result.warnings.length) { L.push(''); L.push('提示：'); result.warnings.forEach(w => L.push('  - ' + w)); }
  L.push('');
  L.push('状态口径：filled / pending / refunded / expired / not_found / unknown 分开；退款不当作完成。不凭同金额同时间猜跨链对应。');
  return L.join('\n');
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) {
    if (e instanceof UsageError) { process.stderr.write('参数错误：' + e.message + '\n'); return 2; }
    throw e;
  }
  if (args.help) {
    const head = readFileSync(SELF, 'utf8').split('\n').slice(1, 21).map(l => l.replace(/^ \* ?/, '').replace(/^\/\* /, ''));
    process.stdout.write(head.join('\n') + '\n');
    return 0;
  }

  const protocol = String(args.protocol).toLowerCase();
  if (protocol === 'chainflip') {
    const result = await resolveBridge({ protocol: 'chainflip', originChainId: args.originChainId, depositId: args.depositId, depositTxnRef: args.depositTxnRef });
    return finish(result, args);
  }

  let fetchImpl;
  try {
    if (args.replay) fetchImpl = makeReplayFetch(args.replay);
    else if (args.record) fetchImpl = makeRecordFetch(resolve(args.record), globalThis.fetch);
    else fetchImpl = globalThis.fetch;
  } catch (e) { process.stderr.write('错误：' + e.message + '\n'); return 1; }

  const key = args.key || process.env.ACROSS_API_KEY || '';
  let result;
  try {
    result = await resolveBridge({
      protocol: 'across', originChainId: args.originChainId, depositId: args.depositId,
      depositTxnRef: args.depositTxnRef, key, base: args.base || ACROSS_BASE,
      fetchImpl, signal: null
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).split(key || '\u0000').join('***');
    process.stderr.write('跨链解析失败：' + msg + '\n');
    return 1;
  }
  return finish(result, args);
}

function finish(result, args) {
  if (args && args.replay) { result.demo = true; result.demo_note = '夹具回放：合成的演示数据，不是真实案件'; }
  const text = JSON.stringify(result, null, 2);
  const idPart = result.depositId || (result.sourceTx ? String(result.sourceTx).slice(0, 10) : 'x');
  const outPath = resolve(args.out || join(ROOT, 'cases', 'bridge-' + result.protocol + '-' + idPart + '.json'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text + '\n');
  let htmlPath = null;
  if (args.html) {
    htmlPath = resolve(args.html);
    const html = ReportMulti.build({ kind: 'bridge', result, generatedAt: result.retrieved_at || new Date().toISOString() });
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, html);
  }
  process.stdout.write(summary(result) + '\n' + '\n结果已写入 ' + outPath + (htmlPath ? '\n报告已写入 ' + htmlPath : '') + '\n');
  return 0;
}

export { parseArgs, makeRecordFetch, makeReplayFetch, keyOf, summary, UsageError };
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase()) {
  main().then(code => { process.exitCode = code; }, e => { process.stderr.write('未预期的错误：' + (e && e.stack ? e.stack : e) + '\n'); process.exitCode = 1; });
}
