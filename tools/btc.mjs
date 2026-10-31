#!/usr/bin/env node
/* 溯流 · Bitcoin UTXO 追踪（命令行）：node tools/btc.mjs <比特币地址> [选项]
 * 引擎在 lib/btc.mjs；数据来自公开 Esplora API（默认 mempool.space），不需要 key。
 * 只做交易级输入 / 输出与确认状态：不声称输入支付某个输出、不推断找零归属、不累加输入为被盗总额。
 *
 * 选项：
 *   --max-txs N      最多追踪多少笔交易（默认 25）
 *   --min-sats N     忽略低于该值的输出（默认 0；只影响统计，不删交易）
 *   --max-calls N    Esplora 调用预算（默认 200）
 *   --base URL       Esplora API 根地址（默认 https://mempool.space/api）
 *   --out FILE       结果 JSON（默认 cases/btc-<地址前10>.json）
 *   --html FILE      同时生成可打印 HTML 报告
 *   --record DIR     联网追踪，同时把每个响应按去掉域名的路径存进 DIR（做夹具）
 *   --replay DIR     不联网，从 DIR 读响应（夹具回放，不需要网络）
 *   --interval MS    两次请求的最小间隔（默认 250；回放默认 0）
 *   --quiet          不在 stderr 打印每次请求
 *   -h, --help
 * 退出码：0 完成；1 运行出错；2 参数错误；3 完成但结果被截断（预算 / 交易数上限 / 达到上限，结果文件照常写出）。
 * 演示：node tools/btc.mjs <地址> --replay tests/fixtures/btc-demo --out /tmp/btc.json --html /tmp/btc.html
 *       夹具是合成的演示数据（不是真实案件），只用来在无网络 / 无 key 时演示流程。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as Btc from '../lib/btc.mjs';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');
const SELF = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SELF));
const DEFAULT_BASE = Btc.DEFAULT_BASE;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { maxTxs: 25, minSats: 0, maxCalls: 200, quiet: false, help: false };
  const needVal = (a, i) => { if (i + 1 >= argv.length || (argv[i + 1].startsWith('--') && argv[i + 1].length > 2)) throw new UsageError(a + ' 需要一个值'); return argv[i + 1]; };
  const needInt = (a, i, min) => { const v = needVal(a, i); if (!/^\d+$/.test(v) || Number(v) < min) throw new UsageError(a + ' 需要不小于 ' + min + ' 的整数，收到：' + v); return Number(v); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--max-txs') { o.maxTxs = needInt(a, i, 1); i++; }
    else if (a === '--min-sats') { o.minSats = needInt(a, i, 0); i++; }
    else if (a === '--max-calls') { o.maxCalls = needInt(a, i, 1); i++; }
    else if (a === '--interval') { o.interval = needInt(a, i, 0); i++; }
    else if (a === '--base') { o.base = needVal(a, i); i++; }
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
    if (!o.address) throw new UsageError('缺少地址。用法：node tools/btc.mjs <比特币地址> [选项]（--help 看全部选项）');
    const v = Btc.validateAddress(o.address);
    if (!v.valid) throw new UsageError('不是合法的比特币地址：' + o.address + '（' + v.reason + '）');
    if (v.network !== 'mainnet') throw new UsageError('只支持比特币主网地址（收到 ' + v.network + '）');
    if (o.record && o.replay) throw new UsageError('--record 与 --replay 不能同时用');
  }
  return o;
}

// ---- 夹具：key = 去掉域名的路径 + 查询串（Esplora 没有 key）----
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
      writeFileSync(join(dir, 'esplora-' + Buffer.from(key).toString('base64url').slice(0, 60) + '.json'), JSON.stringify({ key, response: body }) + '\n');
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
  L.push('BTC 追踪起点 ' + meta.start + (mode ? '  [' + mode + ']' : ''));
  L.push('链头高度 ' + (meta.tip_height == null ? '—' : meta.tip_height) + '；交易 ' + c.txs.length + ' 笔（已确认 ' + c.txs.filter(t => t.confirmed).length + '，未确认 ' + c.txs.filter(t => !t.confirmed).length + '）；地址 ' + c.nodes.length + ' 个');
  L.push('调用 ' + meta.calls + ' / ' + meta.maxCalls + '；截断：' + (meta.truncated ? '是（' + meta.truncatedReasons.join('；') + '）' : '否'));
  L.push('已忽略（只计数）：零值输出 ' + meta.ignored.zeroValueOutput + '，无地址输出 ' + meta.ignored.noAddress + '，低于阈值 ' + meta.ignored.belowMinSats + '，重复交易 ' + meta.ignored.duplicate);
  L.push('');
  L.push('交易级明细（不推断输入→输出归属、不推断找零）：');
  c.txs.forEach((t, i) => {
    L.push((i + 1) + '. ' + (t.confirmed ? '已确认' : '未确认') + '  区块 ' + (t.block == null ? '—' : t.block) + (t.ts ? ' (' + new Date(t.ts * 1000).toISOString() + ')' : '') + '  tx ' + t.txid);
    L.push('   输入：' + (t.inputs.length ? t.inputs.map(x => (x.addr || '（无地址）') + ':' + x.value_sats).join('，') : '—'));
    L.push('   输出：' + (t.outputs.length ? t.outputs.map(x => (x.addr || '（无地址/OP_RETURN）') + ':' + x.value_sats).join('，') : '—'));
  });
  if (meta.warnings.length) { L.push(''); L.push('提示：'); meta.warnings.forEach(w => L.push('  - ' + w)); }
  L.push('');
  L.push('金额单位为整数 satoshi；多输入多输出交易不构成资金归属证明，提交举报前请人工复核。');
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

  let fetchImpl;
  try {
    if (args.replay) fetchImpl = makeReplayFetch(args.replay);
    else if (args.record) fetchImpl = makeRecordFetch(resolve(args.record), globalThis.fetch);
    else fetchImpl = globalThis.fetch;
  } catch (e) { process.stderr.write('错误：' + e.message + '\n'); return 1; }

  const client = Btc.createClient({
    base: args.base || DEFAULT_BASE, fetchImpl, maxCalls: args.maxCalls,
    minIntervalMs: args.interval != null ? args.interval : (args.replay ? 0 : 250)
  });

  let result;
  try {
    result = await Btc.trace({
      client, address: args.address, maxTxs: args.maxTxs, minSats: args.minSats,
      onProgress: args.quiet ? null : p => process.stderr.write('[' + p.calls + '/' + p.maxCalls + '] ' + p.msg + '\n')
    });
  } catch (e) {
    process.stderr.write('追踪失败：' + (e && e.message ? e.message : e) + '\n');
    return 1;
  }

  result.meta.params.base = client.base;
  if (args.replay) { result.meta.demo = true; result.meta.demo_note = '夹具回放：合成的演示数据，不是真实案件'; }
  const text = JSON.stringify(result, null, 2);
  const outPath = resolve(args.out || join(ROOT, 'cases', 'btc-' + args.address.slice(0, 10) + '.json'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text + '\n');

  let htmlPath = null;
  if (args.html) {
    htmlPath = resolve(args.html);
    const html = ReportMulti.build({ kind: 'utxo', case: result.case, meta: result.meta, generatedAt: new Date().toISOString() });
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, html);
  }

  process.stdout.write(summary(result, outPath, args.replay ? '回放' : args.record ? '录制' : '') + (htmlPath ? '\n报告已写入 ' + htmlPath : '') + '\n');
  if (result.meta.truncated) { process.stderr.write('结果被截断（' + result.meta.truncatedReasons.join('；') + '），已写出部分结果，退出码 3\n'); return 3; }
  return 0;
}

export { parseArgs, makeRecordFetch, makeReplayFetch, keyOf, summary, UsageError };
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase()) {
  main().then(code => { process.exitCode = code; }, e => { process.stderr.write('未预期的错误：' + (e && e.stack ? e.stack : e) + '\n'); process.exitCode = 1; });
}
