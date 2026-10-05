#!/usr/bin/env node
/* 溯流 · 以太坊地址追踪（命令行）：node tools/trace.mjs <地址> [选项]
 * 引擎在 lib/trace-eth.js（页面与命令行共用一份）；官方名单用 data/official-snapshot.js（离线快照，没有就跳过官方核对）。
 *
 * 选项：
 *   --from-block N   起始区块（默认 0）          --to-block N    结束区块（默认 99999999 = 最新）
 *   --hops N         最多追几跳（默认 3）        --top N         每个节点最多展开几个对手方（默认 5）
 *   --max-calls N    API 调用预算（默认 80）     --out FILE      结果 JSON（默认 cases/trace-<地址前10>-<起始区块>.json）
 *   --record DIR     联网追踪，同时把每个 API 响应按"去掉 apikey 后的参数"为键存进 DIR（做夹具）
 *   --replay DIR     不联网，从 DIR 读响应（夹具回放，不需要 key）
 *   --no-official    不做官方名单核对          --quiet         不在 stderr 打印每次 API 调用
 *   --interval MS    两次 API 调用的最小间隔（默认 350；回放默认 0）
 *   -h, --help
 * key：环境变量 ETHERSCAN_API_KEY，或项目根 .env 里的 ETHERSCAN_API_KEY。绝不通过命令行参数传，也绝不会被打印或写进任何输出。
 * 联网：检测到 HTTPS_PROXY / HTTP_PROXY 且 NODE_USE_ENV_PROXY 不是 '1' 时，带上 NODE_USE_ENV_PROXY=1 用同样参数重新启动自己
 *       （Node 24 默认不读系统代理变量，国内直连 api.etherscan.io 会 "fetch failed"）。
 * 退出码：0 追踪完成；1 运行出错（缺 key / 网络 / API 错误 / 夹具缺失）；2 参数错误；3 完成但结果被截断（预算用完或被中断，结果文件照常写出）。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SELF));
const Trace = require('../lib/trace-eth.js');
const Official = require('../lib/official-data.js');

const TYPE_NAME = {
  victim: '受害方', attacker: '攻击者', relay: '中转', dex: 'DEX 兑换', bridge: '跨链 / 兑换服务', compliant: '可拦截通道',
  cex: '中心化交易所', mixer: '混币器', otc: 'OTC / 失去踪迹', frozen: '已冻结', hypo: '推演节点', dust: '投毒粉尘'
};

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { hops: 3, top: 5, maxCalls: 80, fromBlock: 0, toBlock: 99999999, official: true, quiet: false, help: false };
  const needVal = (a, i) => {
    if (i + 1 >= argv.length || (argv[i + 1].startsWith('--') && argv[i + 1].length > 2)) throw new UsageError(a + ' 需要一个值');
    return argv[i + 1];
  };
  const needInt = (a, i, min) => {
    const v = needVal(a, i);
    if (!/^\d+$/.test(v) || Number(v) < min) throw new UsageError(a + ' 需要不小于 ' + min + ' 的整数，收到：' + v);
    return Number(v);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--from-block') { o.fromBlock = needInt(a, i, 0); i++; }
    else if (a === '--to-block') { o.toBlock = needInt(a, i, 0); i++; }
    else if (a === '--hops') { o.hops = needInt(a, i, 0); i++; }
    else if (a === '--top') { o.top = needInt(a, i, 1); i++; }
    else if (a === '--max-calls') { o.maxCalls = needInt(a, i, 1); i++; }
    else if (a === '--interval') { o.interval = needInt(a, i, 0); i++; }
    else if (a === '--out') { o.out = needVal(a, i); i++; }
    else if (a === '--record') { o.record = needVal(a, i); i++; }
    else if (a === '--replay') { o.replay = needVal(a, i); i++; }
    else if (a === '--no-official') o.official = false;
    else if (a === '--quiet') o.quiet = true;
    else if (a.startsWith('-')) throw new UsageError('未知选项：' + a);
    else if (o.address) throw new UsageError('只能给一个地址，多出来的：' + a);
    else o.address = a;
  }
  if (!o.help) {
    if (!o.address) throw new UsageError('缺少地址。用法：node tools/trace.mjs <地址> [选项]（--help 看全部选项）');
    if (!/^0x[0-9a-fA-F]{40}$/.test(o.address)) throw new UsageError('不是合法的以太坊地址（0x + 40 位十六进制）：' + o.address);
    if (o.record && o.replay) throw new UsageError('--record 与 --replay 不能同时用');
    if (o.fromBlock > o.toBlock) throw new UsageError('--from-block 大于 --to-block');
  }
  return o;
}

function readKey() {
  if (process.env.ETHERSCAN_API_KEY && process.env.ETHERSCAN_API_KEY.trim()) return process.env.ETHERSCAN_API_KEY.trim();
  const f = join(ROOT, '.env');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*ETHERSCAN_API_KEY\s*=\s*(.*?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

function loadOfficial() {
  const f = join(ROOT, 'data', 'official-snapshot.js');
  if (!existsSync(f)) return null;
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
  return ctx.window.SULIU_OFFICIAL_SNAPSHOT || null;
}

// ---- 夹具：录制 / 回放 ----
const fixtureName = (key, params) => {
  const p = new URLSearchParams(key);
  const addr = (p.get('address') || 'x').slice(0, 10);
  return (p.get('module') || 'm') + '-' + (p.get('action') || 'a') + '-' + addr + '-' + createHash('sha1').update(key).digest('hex').slice(0, 8) + '.json';
};

function makeRecordFetch(dir, realFetch, secret) {
  mkdirSync(dir, { recursive: true });
  return async (url, init) => {
    const res = await realFetch(url, init);
    const text = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json());
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* 不是 JSON：不录 */ }
    const msg = json && typeof json.message === 'string' ? json.message : '';
    const good = res.ok && json && (json.status === '1' || /no transactions found|no records found/i.test(msg) || (json.jsonrpc && 'result' in json && !json.error));
    if (good) {
      const key = Trace.requestKey(String(url));
      const body = JSON.stringify({ key, response: json });
      if (secret && body.includes(secret)) throw new Error('录制中止：响应里出现了 key，拒绝写入夹具');
      writeFileSync(join(dir, fixtureName(key)), body + '\n');
    }
    return { ok: res.ok, status: res.status, json: async () => JSON.parse(text) };
  };
}

function makeReplayFetch(dir) {
  if (!existsSync(dir)) throw new Error('--replay 目录不存在：' + dir);
  const map = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j && typeof j.key === 'string') map.set(j.key, j.response);
  }
  if (!map.size) throw new Error('--replay 目录里没有夹具（*.json）：' + dir);
  return async url => {
    const key = Trace.requestKey(String(url));
    if (!map.has(key)) throw new Error('夹具里没有这个请求：' + key);
    const body = map.get(key);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
}

// ---- 去向树 ----
function renderTree(result) {
  const { case: c, meta } = result;
  const byId = new Map(c.nodes.map(n => [n.id, n]));
  const stops = new Map();
  meta.stoppedAt.forEach(s => { if (!stops.has(s.addr)) stops.set(s.addr, []); stops.get(s.addr).push(s.reason); });
  const out = new Map(); // from → Map(to → txs)
  c.txs.forEach(t => {
    if (!out.has(t.from)) out.set(t.from, new Map());
    const m = out.get(t.from);
    if (!m.has(t.to)) m.set(t.to, []);
    m.get(t.to).push(t);
  });
  const lines = [];
  const printed = new Set();
  const FREEZE_NODE = new Set(['cex', 'compliant']);
  const head = n => {
    const tn = TYPE_NAME[n.type] || n.type;
    return n.label + ' [' + tn + (FREEZE_NODE.has(n.type) ? ' · 可冻结点' : '') + '] ' + n.addr;
  };
  const txLine = t => '· ' + t.amt + (t.flags && t.flags.includes('freeze') ? ' [可冻结点：稳定币]' : '') + '  区块 ' + t.t + '  tx ' + t.hash;
  const walk = (id, prefix) => {
    const n = byId.get(id);
    const stop = stops.get(n.addr) || [];
    stop.forEach(r => lines.push(prefix + '■ ' + r));
    const kids = out.get(id) ? Array.from(out.get(id).entries()) : [];
    kids.forEach(([to, txs], i) => {
      const last = i === kids.length - 1;
      const kid = byId.get(to);
      const again = printed.has(to);
      lines.push(prefix + (last ? '└─ ' : '├─ ') + '→ ' + head(kid) + (again ? '  （已在上方出现）' : ''));
      const sub = prefix + (last ? '   ' : '│  ');
      txs.forEach(t => lines.push(sub + txLine(t) + (t.note ? '  （' + t.note + '）' : '')));
      if (!again) { printed.add(to); walk(to, sub); }
    });
  };
  const root = byId.get(c.focus);
  printed.add(root.id);
  lines.push(head(root) + '  （起点）');
  walk(root.id, '');
  return lines.join('\n');
}

function summary(result, outPath, mode) {
  const { case: c, meta } = result;
  const ig = meta.ignored;
  const L = [];
  L.push('追踪起点 ' + meta.start + '  区块 ' + meta.params.startBlock + ' – ' + (meta.params.endBlock >= 99999999 ? '最新' : meta.params.endBlock) +
    '  最多 ' + meta.params.maxHops + ' 跳，每节点展开 ≤' + meta.params.topK + ' 个对手方' + (mode ? '  [' + mode + ']' : ''));
  L.push('API 调用 ' + meta.calls + ' / ' + meta.maxCalls + '；截断：' + (meta.truncated ? '是（' + meta.truncatedReasons.join('；') + '）' : '否') +
    '；节点 ' + c.nodes.length + '，转账 ' + c.txs.length);
  L.push('已忽略（只计数）：假代币 ' + ig.fakeToken + '，0 值 ' + ig.zeroValue + '，低于阈值 ' + ig.dust + '，投毒 ' + ig.poison + '，超出 topK 未检查的对手方 ' + (ig.belowTopK || 0));
  L.push('（美元折算只用于排序；代币真假只按合约地址判断）');
  L.push('');
  L.push(renderTree(result));
  if (meta.warnings.length) { L.push(''); L.push('提示：'); meta.warnings.forEach(w => L.push('  - ' + w)); }
  L.push('');
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
    const head = readFileSync(SELF, 'utf8').split('\n').slice(1, 17).map(l => l.replace(/^ \* ?/, '').replace(/^\/\* /, ''));
    process.stdout.write(head.join('\n') + '\n');
    return 0;
  }

  // 联网且有系统代理变量时，带 NODE_USE_ENV_PROXY=1 重新启动自己
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!args.replay && proxy && process.env.NODE_USE_ENV_PROXY !== '1') {
    const r = spawnSync(process.execPath, [SELF, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    if (r.error) { process.stderr.write('重新启动失败：' + r.error.message + '\n'); return 1; }
    return r.status == null ? 1 : r.status;
  }

  let key = '';
  let fetchImpl;
  try {
    if (args.replay) {
      key = 'REPLAY-NO-KEY';
      fetchImpl = makeReplayFetch(resolve(args.replay));
    } else {
      key = readKey();
      if (!key) { process.stderr.write('缺少 Etherscan key：在环境变量或项目根 .env 里设置 ETHERSCAN_API_KEY（免费申请：https://etherscan.io/myapikey）\n'); return 1; }
      fetchImpl = args.record ? makeRecordFetch(resolve(args.record), globalThis.fetch, key) : globalThis.fetch;
    }
  } catch (e) { process.stderr.write('错误：' + String(e.message).split(key).join('***') + '\n'); return 1; }

  const client = Trace.createClient({
    key, fetchImpl, maxCalls: args.maxCalls,
    minIntervalMs: args.interval != null ? args.interval : (args.replay ? 0 : 350),
    backoffMs: args.replay ? 0 : 1200,
    onCall: args.quiet ? null : info => process.stderr.write('[' + info.n + '/' + info.maxCalls + '] ' + info.module + '.' + info.action + (info.address ? ' ' + info.address : '') + '\n')
  });

  let official = null;
  if (args.official) {
    try { official = loadOfficial(); } catch (e) { process.stderr.write('警告：官方快照读取失败，跳过官方核对：' + e.message + '\n'); }
    if (!official) process.stderr.write('警告：没有官方快照（data/official-snapshot.js），跳过官方核对\n');
  }

  const ac = new AbortController();
  process.once('SIGINT', () => { process.stderr.write('\n收到中断，正在收尾并写出已有的部分结果…\n'); ac.abort(); });

  let result;
  try {
    result = await Trace.trace({
      client, start: args.address, startBlock: args.fromBlock, endBlock: args.toBlock, maxHops: args.hops, topK: args.top,
      official, officialLib: Official, signal: ac.signal
    });
  } catch (e) {
    process.stderr.write('追踪失败：' + String(e && e.message ? e.message : e).split(key).join('***') + '\n');
    return 1;
  }

  const text = JSON.stringify(result, null, 2);
  if (key && key !== 'REPLAY-NO-KEY' && text.includes(key)) { process.stderr.write('错误：结果里出现了 key，拒绝写出\n'); return 1; }
  const outPath = resolve(args.out || join(ROOT, 'cases', 'trace-' + args.address.toLowerCase().slice(0, 10) + '-' + args.fromBlock + '.json'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text + '\n');

  process.stdout.write(summary(result, outPath, args.replay ? '回放' : args.record ? '录制' : '') + '\n');
  if (result.meta.truncated) { process.stderr.write('结果被截断（' + result.meta.truncatedReasons.join('；') + '），已写出部分结果，退出码 3\n'); return 3; }
  return 0;
}

// 只在被直接运行时才执行；被测试 import 时只导出下面这些函数
export { parseArgs, makeRecordFetch, makeReplayFetch, renderTree, summary, fixtureName, UsageError };
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase()) {
  main().then(code => { process.exitCode = code; }, e => {
    process.stderr.write('未预期的错误：' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
  });
}
