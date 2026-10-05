// 以太坊追踪引擎测试：
//   1) 用 --replay 回放真实录制的 Bitget 案夹具（tests/fixtures/etherscan-bitget/，key 已剥掉），断言已知路径；
//   2) 用合成链上数据测各条判定规则（假代币 / 0 值 / 投毒 / EIP-7702 / 合约终点 / 官方名单 / 充值通道 / 预算截断 / key 不外泄）。
// 全程不联网，不需要 key。夹具重录：node tools/trace.mjs 0x04065CcF52929dCE58D9c7659dE6dDAc2316E84E --from-block 26081300 --hops 3 --top 6 --max-calls 120 --record tests/fixtures/etherscan-bitget
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const Trace = require('../lib/trace-eth.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'tools', 'trace.mjs');
const FIX = join(ROOT, 'tests', 'fixtures', 'etherscan-bitget');
const cli = await import('../tools/trace.mjs');

const KEY = 'FAKEKEY-SECRET-0123456789abcdef';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

// ======================================================================
// 合成链上数据
// ======================================================================
const addr = tag => '0x' + createHash('sha1').update('addr:' + tag).digest('hex');
const txhash = n => '0x' + createHash('sha256').update('tx:' + n).digest('hex');
/** 与 base 首 4 位、末 4 位相同、中间不同的仿冒地址 */
const lookalike = base => '0x' + base.slice(2, 6) + 'f'.repeat(32) + base.slice(-4);

function Chain() {
  const db = { txlist: {}, tokentx: {}, txlistinternal: {}, code: {}, source: {} };
  let n = 0;
  const push = (kind, row) => { for (const a of new Set([row.from, row.to])) (db[kind][a] = db[kind][a] || []).push(row); };
  const raw = (amount, decimals) => String(BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(decimals - 6));
  const self = {
    db,
    eth(from, to, amount, block, extra) {
      push('txlist', Object.assign({ blockNumber: String(block), hash: txhash(++n), from, to, value: raw(amount, 18), isError: '0', input: '0x' }, extra));
      return self;
    },
    internal(from, to, amount, block) {
      push('txlistinternal', { blockNumber: String(block), hash: txhash(++n), from, to, value: raw(amount, 18), isError: '0', type: 'call' });
      return self;
    },
    tok(from, to, contract, symbol, amount, block, decimals = 6) {
      push('tokentx', { blockNumber: String(block), hash: txhash(++n), from, to, contractAddress: contract, tokenSymbol: symbol, tokenName: symbol, tokenDecimal: String(decimals), value: raw(amount, decimals) });
      return self;
    },
    usdt: (from, to, amount, block) => self.tok(from, to, USDT, 'USDT', amount, block),
    contract(a, name) { db.code[a] = '0x6080604052348015'; db.source[a] = { ContractName: name }; return self; },
    code(a, c) { db.code[a] = c; return self; }
  };
  return self;
}

function mockChain(db, hooks) {
  const log = [];
  const fetchImpl = async url => {
    const u = new URL(url);
    const p = Object.fromEntries(u.searchParams);
    const a = (p.address || '').toLowerCase();
    log.push({ module: p.module, action: p.action, address: a, startblock: p.startblock == null ? null : Number(p.startblock), apikey: p.apikey });
    if (hooks && hooks.onFetch) hooks.onFetch(p, log);
    const reply = j => ({ ok: true, status: 200, json: async () => j });
    if (p.module === 'account') {
      const rows = ((db[p.action] || {})[a] || []).filter(r => Number(r.blockNumber) >= Number(p.startblock) && Number(r.blockNumber) <= Number(p.endblock));
      return reply(rows.length ? { status: '1', message: 'OK', result: rows } : { status: '0', message: 'No transactions found', result: [] });
    }
    if (p.action === 'eth_getCode') return reply({ jsonrpc: '2.0', id: 1, result: db.code[a] || '0x' });
    if (p.action === 'getsourcecode') return reply({ status: '1', message: 'OK', result: [db.source[a] || { ContractName: '' }] });
    return reply({ status: '0', message: 'NOTOK', result: 'unknown action' });
  };
  return { fetchImpl, log };
}

async function run(chain, start, o = {}) {
  const m = mockChain(chain.db, o.hooks);
  const client = Trace.createClient({ key: KEY, fetchImpl: m.fetchImpl, minIntervalMs: 0, backoffMs: 0, maxCalls: o.maxCalls == null ? 500 : o.maxCalls });
  const result = await Trace.trace({
    client, start, startBlock: o.startBlock == null ? 0 : o.startBlock, maxHops: o.maxHops == null ? 3 : o.maxHops, topK: o.topK == null ? 5 : o.topK,
    official: o.official || null, signal: o.signal, minValue: o.minValue, priceHints: o.priceHints
  });
  return { result, log: m.log, client };
}
const byAddr = (result, a) => result.case.nodes.find(n => n.addr === a);
const has = (result, a) => !!byAddr(result, a);
const called = (log, action, a) => log.some(l => l.action === action && l.address === a);
const stopOf = (result, a) => result.meta.stoppedAt.filter(s => s.addr === a).map(s => s.reason).join(' | ');

const snapshot = ({ holdings = [], victims = [], reviewed = [] } = {}) => ({
  holdings: { eth: holdings }, victims: { eth: victims },
  reviewed: { items: reviewed.map(r => Object.assign({ chain: 'EVM', verdict: 'not_attacker' }, r)) }
});

// ======================================================================
// 纯函数
// ======================================================================
test('TOKENS：只含白名单 6 个主网合约，USDT / USDC 标可冻结', () => {
  assert.deepEqual(Object.keys(Trace.TOKENS).sort(), [
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', '0x6b175474e89094c44da98b954eedeac495271d0f', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0xdac17f958d2ee523a2206206994597c13d831ec7'
  ]);
  assert.deepEqual(Trace.TOKENS[USDT], { symbol: 'USDT', decimals: 6, freezable: true });
  assert.deepEqual(Trace.TOKENS[USDC], { symbol: 'USDC', decimals: 6, freezable: true });
  assert.equal(Trace.TOKENS['0x6b175474e89094c44da98b954eedeac495271d0f'].decimals, 18);
  assert.equal(Trace.TOKENS['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'].decimals, 8);
  assert.equal(Trace.TOKENS['0x6b175474e89094c44da98b954eedeac495271d0f'].freezable, false);
});

test('classifyTokenTransfer：符号叫 USDT 但合约不在白名单 → 假代币；仿冒符号（零宽字符等）同样', () => {
  const m = Trace.DEFAULT_MIN_VALUE;
  const fake = (symbol, contract) => ({ contractAddress: contract, tokenSymbol: symbol, tokenDecimal: '6', value: '200000000000', from: addr('s'), to: addr('t') });
  assert.equal(Trace.classifyTokenTransfer(fake('USDT', '0xeceea491e6b202a19a637826edefe9f40a77383c'), m).kind, 'fakeToken');
  assert.equal(Trace.classifyTokenTransfer(fake('USD\u{FFF0}T', '0x9f208556ba20fdb39d36824acaead6bcb0b77d2f'), m).kind, 'fakeToken');
  assert.equal(Trace.classifyTokenTransfer(fake('ÚЅDТ', '0x7604ab22b23c5cd1b937c379a61a72a1349d8766'), m).kind, 'fakeToken');
  const real = Trace.classifyTokenTransfer(fake('随便写什么', USDT), m); // 白名单合约：符号怎么写都不影响
  assert.equal(real.kind, 'real');
  assert.equal(real.symbol, 'USDT');
  assert.equal(real.amount, 200000);
  assert.equal(real.freezable, true);
});

test('classifyTokenTransfer：白名单代币 0 值 / 低于阈值 / 达到阈值；小数位用白名单的，不信行里的 tokenDecimal', () => {
  const m = Trace.DEFAULT_MIN_VALUE;
  const row = (contract, value, dec = '6') => ({ contractAddress: contract, tokenSymbol: 'X', tokenDecimal: dec, value });
  assert.equal(Trace.classifyTokenTransfer(row(USDT, '0'), m).kind, 'zeroValue');
  assert.equal(Trace.classifyTokenTransfer(row(USDT, '99999999'), m).kind, 'dust'); // 99.999999 < 100
  assert.equal(Trace.classifyTokenTransfer(row(USDT, '100000000'), m).kind, 'real'); // 正好 100
  assert.equal(Trace.classifyTokenTransfer(row(USDT, '100000000', '18'), m).amount, 100); // 行里谎报 18 位也按 6 位算
  const wbtc = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
  assert.equal(Trace.classifyTokenTransfer(row(wbtc, '100000', '8'), m).kind, 'dust'); // 0.001 < 0.002
  assert.equal(Trace.classifyTokenTransfer(row(wbtc, '200000', '8'), m).kind, 'real');
  assert.equal(Trace.classifyTokenTransfer(row(USDT, 'abc'), m).kind, 'zeroValue'); // 畸形金额不当真
});

test('classifyNativeTransfer：失败交易 / 0 值 / 低于阈值 / 正常', () => {
  const m = Trace.DEFAULT_MIN_VALUE;
  const row = (value, isError = '0') => ({ value, isError });
  assert.equal(Trace.classifyNativeTransfer(row('1000000000000000000', '1'), m).kind, 'failed');
  assert.equal(Trace.classifyNativeTransfer(row('0'), m).kind, 'zeroValue');
  assert.equal(Trace.classifyNativeTransfer(row('1000000000000000'), m).kind, 'dust'); // 0.001 ETH 手续费 < 0.05
  const ok = Trace.classifyNativeTransfer(row('200000000000000000000'), m);
  assert.equal(ok.kind, 'real');
  assert.equal(ok.symbol, 'ETH');
  assert.equal(ok.amount, 200);
  assert.equal(ok.freezable, false);
});

test('isEip7702Code / isContractCode：0xef0100 + 20 字节是 EOA；其它非空代码才是合约', () => {
  const delegated = '0xef0100' + '63c0c19a282a1b52b07dd5a65b58948a07dae32b';
  assert.equal(Trace.isEip7702Code(delegated), true);
  assert.equal(Trace.isEip7702Code(delegated.toUpperCase().replace('0X', '0x')), true);
  assert.equal(Trace.isEip7702Code('0xef0100'), false); // 长度不对
  assert.equal(Trace.isEip7702Code('0x6080604052'), false);
  assert.equal(Trace.isContractCode('0x'), false);
  assert.equal(Trace.isContractCode(''), false);
  assert.equal(Trace.isContractCode(delegated), false);
  assert.equal(Trace.isContractCode('0x6080604052'), true);
  assert.equal(Trace.isContractCode(delegated + '00'), true); // 多一个字节就不是委托前缀了
});

test('isLookalike：首 4 + 末 4 位相同但不是同一地址', () => {
  const a = '0x04065ccf52929dce58d9c7659de6ddac2316e84e';
  assert.equal(Trace.isLookalike(a, '0x0406E4cea183A14B6579158D07bB9874c686e84e'), true);
  assert.equal(Trace.isLookalike(a, a), false);
  assert.equal(Trace.isLookalike(a, a.toUpperCase().replace('0X', '0x')), false); // 仅大小写不同 = 同一地址
  assert.equal(Trace.isLookalike(a, '0x0406' + '0'.repeat(32) + 'e84f'), false);
  assert.equal(Trace.isLookalike(a, 'nonsense'), false);
});

test('classifyContractName：按合约名归类；Chainflip → compliant；未验证 → relay 并注明', () => {
  const t = n => Trace.classifyContractName(n).type;
  assert.equal(t('UniversalRouter'), 'dex');
  assert.equal(t('SwapRouter02'), 'dex');
  assert.equal(t('UniswapV3Pool'), 'dex');
  assert.equal(t('AcrossSpokePool'), 'bridge'); // 含 Pool 但先按 SpokePool 归 bridge
  assert.equal(t('L1StandardBridge'), 'bridge');
  assert.equal(t('THORChain_Router'), 'bridge');
  assert.equal(t('Vault'), 'bridge');
  assert.equal(t('ChainflipVault'), 'compliant');
  assert.equal(t('TornadoCash'), 'mixer');
  assert.equal(t('Whatever'), 'relay');
  const u = Trace.classifyContractName('');
  assert.equal(u.type, 'relay');
  assert.equal(u.unverified, true);
});

test('detectDepositChannel：≥3 个不同来源且 ≥80% 转出归集到同一终点才命中', () => {
  const V = addr('vault'), R = addr('other');
  const srcs = n => Array.from({ length: n }, (_, i) => addr('src' + i));
  const hit = Trace.detectDepositChannel({ sources: srcs(12), outflows: [{ to: V, usd: 95 }, { to: R, usd: 5 }] });
  assert.equal(hit.match, true);
  assert.equal(hit.dest, V);
  assert.equal(hit.sources, 12);
  assert.ok(Math.abs(hit.share - 0.95) < 1e-9);
  assert.equal(Trace.detectDepositChannel({ sources: srcs(2), outflows: [{ to: V, usd: 100 }] }).match, false, '来源不足 3 个');
  assert.equal(Trace.detectDepositChannel({ sources: srcs(3), outflows: [{ to: V, usd: 79 }, { to: R, usd: 21 }] }).match, false, '归集比例 79% < 80%');
  assert.equal(Trace.detectDepositChannel({ sources: srcs(3), outflows: [{ to: V, usd: 80 }, { to: R, usd: 20 }] }).match, true, '正好 80%');
  assert.equal(Trace.detectDepositChannel({ sources: srcs(5), outflows: [{ to: V, usd: 100 }], isTerminal: () => false }).match, false, '去向不是终点');
  assert.equal(Trace.detectDepositChannel({ sources: [addr('a'), addr('a'), addr('a')], outflows: [{ to: V, usd: 1 }] }).sources, 1, '同一来源重复不累计');
  assert.equal(Trace.detectDepositChannel({ sources: srcs(5), outflows: [] }).match, false);
});

test('layout：x = 跳数×340；同一跳内 100px 间距、同一条中线居中；整体 y 为正', () => {
  const pos = Trace.layout([['s'], ['a', 'b', 'c', 'd'], ['e', 'f', 'g']]);
  assert.equal(pos.s.x, 0);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(k => pos[k].x), [340, 340, 340, 340]);
  assert.deepEqual(['e', 'f', 'g'].map(k => pos[k].x), [680, 680, 680]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(k => pos[k].y), [40, 140, 240, 340]);
  assert.deepEqual(['e', 'f', 'g'].map(k => pos[k].y), [90, 190, 290]);
  // 各跳以同一条中线居中
  const mid = ids => (Math.min(...ids.map(k => pos[k].y)) + Math.max(...ids.map(k => pos[k].y))) / 2;
  assert.equal(mid(['s']), mid(['a', 'b', 'c', 'd']));
  assert.equal(mid(['e', 'f', 'g']), mid(['a', 'b', 'c', 'd']));
  assert.deepEqual(Trace.layout([]), {});
});

test('requestKey：与 apikey 无关、与参数顺序无关', () => {
  const a = Trace.requestKey('https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=0xabc&apikey=SECRET1');
  const b = Trace.requestKey('https://api.etherscan.io/v2/api?apikey=SECRET2&address=0xabc&action=txlist&module=account&chainid=1');
  assert.equal(a, b);
  assert.ok(!/secret/i.test(a));
  assert.ok(!/apikey/i.test(a));
});

// ======================================================================
// 客户端
// ======================================================================
const okRes = j => ({ ok: true, status: 200, json: async () => j });

test('createClient：超出 maxCalls 抛 code:BUDGET，calls 不超过预算，且不再发请求', async () => {
  let sent = 0;
  const client = Trace.createClient({ key: KEY, fetchImpl: async () => { sent++; return okRes({ status: '1', message: 'OK', result: [] }); }, minIntervalMs: 0, maxCalls: 2 });
  await client.txlist(addr('a'));
  await client.tokentx(addr('a'));
  await assert.rejects(client.txlistinternal(addr('a')), e => e.code === 'BUDGET' && !e.message.includes(KEY));
  await assert.rejects(client.getcode(addr('a')), e => e.code === 'BUDGET');
  assert.equal(client.calls, 2);
  assert.equal(client.maxCalls, 2);
  assert.equal(sent, 2);
});

test('createClient：status 0 + No transactions found 视为空数组；其它错误抛出且 message 不含 key', async () => {
  const empty = Trace.createClient({ key: KEY, minIntervalMs: 0, fetchImpl: async () => okRes({ status: '0', message: 'No transactions found', result: [] }) });
  assert.deepEqual(await empty.txlist(addr('a')), []);
  // 服务器把请求 URL（含 key）回显进了错误信息
  const echo = Trace.createClient({ key: KEY, minIntervalMs: 0, fetchImpl: async url => okRes({ status: '0', message: 'NOTOK', result: 'Invalid API Key for ' + url }) });
  await assert.rejects(echo.txlist(addr('a')), e => e.code === 'API' && !e.message.includes(KEY) && !/apikey=[^*]/i.test(e.message));
  // 网络层报错里带了 URL
  const net = Trace.createClient({ key: KEY, minIntervalMs: 0, fetchImpl: async url => { throw new Error('fetch failed: ' + url); } });
  await assert.rejects(net.txlist(addr('a')), e => e.code === 'NETWORK' && !e.message.includes(KEY));
});

test('createClient：遇到 "Max calls per sec" 退避重试，最多 3 次；重试也计入 calls', async () => {
  let n = 0;
  const sleeps = [];
  const limited = () => okRes({ status: '0', message: 'NOTOK', result: 'Max calls per sec rate limit reached (3/sec)' });
  const c1 = Trace.createClient({
    key: KEY, minIntervalMs: 0, sleepImpl: ms => { sleeps.push(ms); return Promise.resolve(); },
    fetchImpl: async () => (++n <= 2 ? limited() : okRes({ status: '1', message: 'OK', result: [{ blockNumber: '1' }] }))
  });
  assert.deepEqual(await c1.txlist(addr('a')), [{ blockNumber: '1' }]);
  assert.equal(c1.calls, 3);
  assert.equal(sleeps.length, 2);
  let m = 0;
  const c2 = Trace.createClient({ key: KEY, minIntervalMs: 0, maxCalls: 50, sleepImpl: () => Promise.resolve(), fetchImpl: async () => { m++; return limited(); } });
  await assert.rejects(c2.txlist(addr('a')), e => e.code === 'RATE_LIMIT' && !e.message.includes(KEY));
  assert.equal(m, 4, '首次 + 3 次重试');
  assert.equal(c2.calls, 4);
});

test('createClient：限速（两次请求间隔 ≥ minIntervalMs）；key 不挂在 client 上；onCall 信息里没有 key', async () => {
  const stamps = [];
  const infos = [];
  const client = Trace.createClient({
    key: KEY, minIntervalMs: 60, onCall: i => infos.push(i),
    fetchImpl: async () => { stamps.push(Date.now()); return okRes({ status: '1', message: 'OK', result: [] }); }
  });
  await client.txlist(addr('a'));
  await client.tokentx(addr('a'));
  await client.txlistinternal(addr('a'));
  assert.ok(stamps[1] - stamps[0] >= 55 && stamps[2] - stamps[1] >= 55, '间隔 ' + (stamps[1] - stamps[0]) + ' / ' + (stamps[2] - stamps[1]));
  assert.ok(!JSON.stringify(client).includes(KEY));
  assert.ok(!JSON.stringify(infos).includes(KEY));
  assert.equal(infos.length, 3);
  assert.equal(infos[0].action, 'txlist');
});

test('createClient：请求带 apikey / chainid；getcode / getsourcecode 返回形状', async () => {
  const seen = [];
  const client = Trace.createClient({
    key: KEY, chainid: 1, minIntervalMs: 0,
    fetchImpl: async url => {
      const p = Object.fromEntries(new URL(url).searchParams);
      seen.push(p);
      if (p.action === 'eth_getCode') return okRes({ jsonrpc: '2.0', id: 1, result: '0x6080' });
      if (p.action === 'getsourcecode') return okRes({ status: '1', message: 'OK', result: [{ ContractName: 'Vault' }] });
      return okRes({ status: '1', message: 'OK', result: [] });
    }
  });
  assert.equal(await client.getcode(addr('a')), '0x6080');
  assert.deepEqual(await client.getsourcecode(addr('a')), { ContractName: 'Vault' });
  await client.txlist(addr('a'), { startblock: 5, endblock: 9 });
  assert.ok(seen.every(p => p.apikey === KEY && p.chainid === '1'));
  assert.equal(seen[0].module, 'proxy');
  assert.equal(seen[1].module, 'contract');
  assert.equal(seen[2].startblock, '5');
  assert.equal(seen[2].endblock, '9');
});

// ======================================================================
// trace：合成数据
// ======================================================================
test('trace 参数校验：start 不是地址 → TypeError；缺 client → TypeError', async () => {
  const client = Trace.createClient({ key: KEY, fetchImpl: async () => okRes({}), minIntervalMs: 0 });
  await assert.rejects(Trace.trace({ client, start: '0x123' }), TypeError);
  await assert.rejects(Trace.trace({ start: addr('s') }), TypeError);
  await assert.rejects(Trace.trace({ client, start: addr('s'), startBlock: 10, endBlock: 5 }), RangeError);
});

test('trace：假代币（符号 USDT 但合约不在白名单）被忽略，真 USDT 照常追', async () => {
  const S = addr('S'), R = addr('R'), F = addr('F');
  const chain = Chain()
    .usdt(S, R, 1000, 100)
    .tok(S, F, '0xeceea491e6b202a19a637826edefe9f40a77383c', 'USDT', 9000000, 101)
    .tok(S, F, '0x9f208556ba20fdb39d36824acaead6bcb0b77d2f', 'USD\u{FFF0}T', 9000000, 102)
    .tok(F, S, '0xeceea491e6b202a19a637826edefe9f40a77383c', 'USDT', 9000000, 103); // 伪造发送方为 S 的假转账（落在 S 的 tokentx 里）
  const { result, log } = await run(chain, S);
  assert.ok(has(result, R));
  assert.ok(!has(result, F), '只靠假代币关联的对手方不能出现');
  assert.equal(result.meta.ignored.fakeToken, 2, '只数 S 发出的两笔');
  assert.ok(!called(log, 'eth_getCode', F), '连 getcode 都不该为它花预算');
  assert.ok(result.case.txs.every(t => t.amt === '1,000 USDT'));
});

test('trace：0 值、低于阈值、失败交易都不跟进；带 calldata 的 0 值合约调用不算转账', async () => {
  const S = addr('S'), R = addr('R'), Z = addr('Z'), D = addr('D'), X = addr('X');
  const chain = Chain()
    .eth(S, R, 2, 100)
    .eth(S, Z, 0, 101) // 0 值普通转账
    .usdt(S, Z, 0, 102) // 白名单代币 0 值（零额转账投毒）
    .eth(S, D, 0.01, 103) // 低于 0.05 ETH
    .usdt(S, D, 0.5, 104) // 低于 100 USDT
    .eth(S, X, 50, 105, { isError: '1' }) // 失败交易，钱没动
    .eth(S, USDT, 0, 106, { input: '0xa9059cbb0000' }); // transfer 调用本身，真正的转账在 tokentx
  const { result, log } = await run(chain, S);
  assert.deepEqual(result.case.nodes.map(n => n.addr).sort(), [R, S].sort());
  assert.deepEqual(
    { zeroValue: result.meta.ignored.zeroValue, dust: result.meta.ignored.dust, fakeToken: result.meta.ignored.fakeToken, poison: result.meta.ignored.poison },
    { zeroValue: 2, dust: 2, fakeToken: 0, poison: 0 }
  );
  for (const a of [Z, D, X]) assert.ok(!called(log, 'eth_getCode', a));
});

test('trace：阈值可调（minValue）', async () => {
  const S = addr('S'), D = addr('D');
  const chain = Chain().eth(S, D, 0.01, 100);
  assert.ok(!has((await run(chain, S)).result, D));
  assert.ok(has((await run(chain, S, { minValue: { ETH: 0.005 } })).result, D));
});

test('trace：与图中已有地址首 4 位 + 末 4 位相同的对手方 = 投毒，不展开、不查 getcode', async () => {
  const S = addr('S'), R = addr('R');
  const P = lookalike(S); // 仿冒起点
  const P2 = lookalike(R); // 仿冒 R（R 在 S 的第一轮就进图，但同一轮内不互相比较；R 的展开里再出现 P2 才算）
  const chain = Chain()
    .usdt(S, R, 5000, 100)
    .usdt(S, P, 3000, 101) // 真 USDT 转给仿冒起点的地址：仍是投毒
    .usdt(R, P2, 4000, 110);
  const { result, log } = await run(chain, S);
  assert.ok(has(result, R));
  assert.ok(!has(result, P));
  assert.ok(!has(result, P2));
  assert.equal(result.meta.ignored.poison, 2);
  assert.ok(!called(log, 'eth_getCode', P) && !called(log, 'eth_getCode', P2));
});

test('trace：官方名单里的仿冒地址（与官方地址首尾相同）也算投毒', async () => {
  const S = addr('S'), ATK = addr('ATK');
  const P = lookalike(ATK);
  const chain = Chain().usdt(S, P, 5000, 100);
  const { result } = await run(chain, S, { official: snapshot({ holdings: [ATK] }) });
  assert.ok(!has(result, P));
  assert.equal(result.meta.ignored.poison, 1);
});

test('trace：0xef0100 前缀的代码按普通 EOA 展开；真合约停下并按合约名分类', async () => {
  const S = addr('S'), E = addr('E'), G = addr('G'), C = addr('C');
  const chain = Chain()
    .eth(S, E, 10, 100)
    .eth(S, C, 8, 101)
    .eth(E, G, 9, 110)
    .code(E, '0xef0100' + '63c0c19a282a1b52b07dd5a65b58948a07dae32b')
    .contract(C, 'UniversalRouter')
    .eth(C, addr('after-router'), 8, 120); // 合约之后的转出：不该被展开
  const { result, log } = await run(chain, S);
  const e = byAddr(result, E), c = byAddr(result, C);
  assert.equal(e.type, 'relay');
  assert.match(e.note, /EIP-7702/);
  assert.ok(called(log, 'txlist', E), '7702 委托账户按普通地址展开');
  assert.ok(has(result, G), '展开后找到下一跳');
  assert.equal(c.type, 'dex');
  assert.match(c.note, /合约：UniversalRouter（getsourcecode）/);
  assert.ok(!called(log, 'txlist', C), '合约一律是终点，不展开');
  assert.ok(!has(result, addr('after-router')));
  assert.match(stopOf(result, C), /UniversalRouter/);
});

test('trace：官方名单优先，命中就不再查 getcode；vault → compliant（Chainflip）/ bridge，cex → cex，victim / 攻击者 / poison', async () => {
  const S = addr('S'), VAULT = addr('chainflip'), OTHERV = addr('othervault'), CEX = addr('cex'), ATK = addr('atk'), VIC = addr('vic'), POI = addr('poi'), ARB = addr('arb');
  const chain = Chain()
    .usdt(S, VAULT, 9000, 100).usdt(S, OTHERV, 8000, 100).usdt(S, CEX, 7000, 100).usdt(S, ATK, 6000, 100).usdt(S, VIC, 5000, 100).usdt(S, POI, 4000, 100).usdt(S, ARB, 3000, 100)
    .usdt(ATK, addr('next'), 5500, 120)
    .usdt(VIC, addr('never'), 4500, 120);
  const official = snapshot({
    holdings: [ATK], victims: [VIC],
    reviewed: [
      { address: VAULT, category: 'vault', name: 'Chainflip 以太坊 Vault' }, { address: OTHERV, category: 'vault', name: 'Some 协议金库' },
      { address: CEX, category: 'cex', name: '某交易所热钱包' }, { address: POI, category: 'poison', name: '投毒地址' }, { address: ARB, category: 'arb', name: '套利者' }
    ]
  });
  const { result, log } = await run(chain, S, { official });
  const t = a => byAddr(result, a) && byAddr(result, a).type;
  assert.equal(t(VAULT), 'compliant');
  assert.equal(t(OTHERV), 'bridge');
  assert.equal(t(CEX), 'cex');
  assert.equal(t(ATK), 'attacker');
  assert.equal(t(VIC), 'victim');
  assert.equal(t(ARB), 'relay');
  assert.ok(!has(result, POI), 'reviewed 里的 poison 类只计数不画');
  assert.equal(result.meta.ignored.poison, 1);
  assert.match(byAddr(result, VAULT).note, /Bitget 官方 reviewed：Chainflip 以太坊 Vault/);
  assert.equal(byAddr(result, VAULT).excluded, true);
  assert.equal(byAddr(result, VAULT).label, 'Chainflip 以太坊 Vault');
  assert.match(stopOf(result, VAULT), /Chainflip/);
  assert.ok(!called(log, 'eth_getCode', VAULT) && !called(log, 'eth_getCode', CEX), '官方命中不花 getcode');
  assert.ok(called(log, 'txlist', ATK), '官方攻击者地址继续展开');
  assert.ok(has(result, addr('next')));
  assert.ok(!called(log, 'txlist', VIC) && !has(result, addr('never')), '受害钱包不展开');
  assert.ok(!called(log, 'txlist', VAULT) && !called(log, 'txlist', CEX));
});

test('trace：官方名单可以传已建好的索引，也可以不传（不传则不做官方核对）', async () => {
  const S = addr('S'), V = addr('V');
  const chain = Chain().usdt(S, V, 9000, 100);
  const Official = require('../lib/official-data.js');
  const snap = snapshot({ reviewed: [{ address: V, category: 'cex', name: '交易所' }] });
  assert.equal(byAddr((await run(chain, S, { official: Official.buildIndex(snap) })).result, V).type, 'cex');
  assert.equal(byAddr((await run(chain, S)).result, V).type, 'relay');
});

test('trace：一次性充值通道（推断）：≥3 个不同来源且 ≥80% 转出归集到同一个金库 → 标通道、加去向节点与边、作为终点', async () => {
  const S = addr('S'), C = addr('C'), V = addr('V'), R = addr('R');
  const chain = Chain()
    .usdt(S, C, 1000, 100)
    .usdt(addr('x1'), C, 500, 101).usdt(addr('x2'), C, 500, 102).usdt(addr('x3'), C, 500, 103) // 共 4 个不同来源
    .usdt(C, V, 2400, 110) // 96%
    .usdt(C, R, 100, 111)
    .contract(V, 'Vault');
  const { result, log } = await run(chain, S);
  const c = byAddr(result, C);
  assert.match(c.note, /充值通道（推断）/);
  assert.match(c.note, /4 个不同来源/);
  assert.match(c.note, /96%/);
  assert.ok(has(result, V));
  assert.ok(result.case.txs.some(t => t.from === c.id && t.to === byAddr(result, V).id && t.amt === '2,400 USDT'), '去向边');
  assert.ok(!has(result, R), '剩下的零头不跟');
  assert.ok(!called(log, 'eth_getCode', R));
  assert.match(stopOf(result, C), /充值通道（推断）/);
});

test('trace：充值通道的反例：来源只有 2 个、比例不够、去向不是终点 → 当普通地址继续展开', async () => {
  const S = addr('S'), C = addr('C'), V = addr('V'), R = addr('R');
  // 来源不足
  let chain = Chain().usdt(S, C, 1000, 100).usdt(addr('x1'), C, 500, 101).usdt(C, V, 1500, 110).contract(V, 'Vault');
  let r = (await run(chain, S)).result;
  assert.doesNotMatch(byAddr(r, C).note, /充值通道/);
  // 比例 70%
  chain = Chain().usdt(S, C, 1000, 100).usdt(addr('x1'), C, 500, 101).usdt(addr('x2'), C, 500, 102).usdt(C, V, 1400, 110).usdt(C, R, 600, 111).contract(V, 'Vault');
  r = (await run(chain, S)).result;
  assert.doesNotMatch(byAddr(r, C).note, /充值通道/);
  assert.ok(has(r, V) && has(r, R));
  // 去向是普通 EOA，不是终点
  chain = Chain().usdt(S, C, 1000, 100).usdt(addr('x1'), C, 500, 101).usdt(addr('x2'), C, 500, 102).usdt(C, R, 2000, 110);
  r = (await run(chain, S)).result;
  assert.doesNotMatch(byAddr(r, C).note, /充值通道/);
  assert.ok(has(r, R));
});

test('trace：来源只算真资产且过阈值：假代币 / 粉尘 / 失败交易的发送方不凑数', async () => {
  const S = addr('S'), C = addr('C'), V = addr('V'), R = addr('R');
  const chain = Chain()
    .usdt(S, C, 1000, 100)
    .tok(addr('f1'), C, '0xeceea491e6b202a19a637826edefe9f40a77383c', 'USDT', 500, 101) // 假代币
    .usdt(addr('d1'), C, 0.0002, 102) // 粉尘
    .eth(addr('e1'), C, 3, 103, { isError: '1' }) // 失败
    .usdt(C, V, 950, 110).usdt(C, R, 50, 111)
    .contract(V, 'Vault');
  const { result } = await run(chain, S);
  assert.doesNotMatch(byAddr(result, C).note, /充值通道/, '只有 1 个真来源');
});

test('trace：官方已认定的攻击者地址不套用充值通道推断（以官方为准，继续展开）', async () => {
  const S = addr('S'), C = addr('C'), V = addr('V'), R = addr('R');
  const chain = Chain()
    .usdt(S, C, 1000, 100).usdt(addr('x1'), C, 500, 101).usdt(addr('x2'), C, 500, 102).usdt(addr('x3'), C, 500, 103)
    .usdt(C, V, 2400, 110).usdt(C, R, 100, 111).contract(V, 'Vault');
  const { result } = await run(chain, S, { official: snapshot({ holdings: [C] }) });
  const c = byAddr(result, C);
  assert.equal(c.type, 'attacker');
  assert.doesNotMatch(c.note, /充值通道/);
  assert.ok(has(result, V) && has(result, R));
});

test('trace：转发合约（Chainflip 的 Deposit）仍是终点，但会读它的转出，找到归集去向；去向在官方名单里 → compliant', async () => {
  const S = addr('S'), W = addr('W'), V = addr('V');
  const chain = Chain()
    .usdt(S, W, 200000, 100)
    .usdt(W, V, 200000, 110)
    .eth(W, V, 30, 120)
    .contract(W, 'Deposit');
  const official = snapshot({ reviewed: [{ address: V, category: 'vault', name: 'Chainflip 以太坊 Vault' }] });
  const { result, log } = await run(chain, S, { official });
  const w = byAddr(result, W), v = byAddr(result, V);
  assert.equal(w.type, 'relay');
  assert.match(w.note, /合约：Deposit/);
  assert.match(w.note, /充值通道（推断）：转发合约/);
  assert.equal(v.type, 'compliant');
  assert.ok(called(log, 'txlist', W), '读了转发合约的转出');
  assert.ok(!called(log, 'txlist', V), '金库不展开');
  const edge = result.case.txs.filter(t => t.from === w.id && t.to === v.id);
  assert.deepEqual(edge.map(t => t.amt).sort(), ['200,000 USDT', '30 ETH'].sort());
  assert.deepEqual(edge.find(t => t.amt === '200,000 USDT').flags, ['freeze']);
  assert.match(stopOf(result, W), /充值通道（推断）→ Chainflip 以太坊 Vault/);
});

test('trace：转发合约的转出没有集中到某个终点 → 就停在合约，不乱连', async () => {
  const S = addr('S'), W = addr('W'), V1 = addr('V1'), V2 = addr('V2');
  const chain = Chain().usdt(S, W, 1000, 100).usdt(W, V1, 500, 110).usdt(W, V2, 500, 111).contract(W, 'Deposit').contract(V1, 'Vault').contract(V2, 'Router');
  const { result } = await run(chain, S);
  assert.ok(!has(result, V1) && !has(result, V2));
  assert.doesNotMatch(byAddr(result, W).note, /充值通道/);
  assert.match(stopOf(result, W), /没有 ≥80% 集中归集/);
});

test('trace：topK 只数可继续展开的新对手方；终点合约不占名额；超出的只计数并给提示', async () => {
  const S = addr('S'), RT = addr('router');
  const E = [1, 2, 3, 4].map(i => addr('E' + i));
  const chain = Chain().eth(S, RT, 100, 100).contract(RT, 'UniversalRouter');
  E.forEach((e, i) => chain.eth(S, e, 40 - i * 5, 101 + i)); // 40,35,30,25
  const { result, log } = await run(chain, S, { topK: 2, maxHops: 1 });
  assert.ok(has(result, RT), '终点合约不占名额');
  assert.ok(has(result, E[0]) && has(result, E[1]));
  assert.ok(!has(result, E[2]) && !has(result, E[3]));
  assert.equal(result.meta.ignored.belowTopK, 2);
  assert.ok(result.meta.warnings.some(w => /另有 2 个对手方/.test(w) && /排序/.test(w)));
  assert.ok(!called(log, 'eth_getCode', E[2]));
});

test('trace：同金额按最早区块排序（确定性）；按美元折算排序（ETH 用 priceHints）', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B'), C = addr('C');
  const chain = Chain().usdt(S, A, 6000, 100).eth(S, B, 3, 101) /* 3 ETH ≈ 9000 */.usdt(S, C, 6000, 99);
  const r1 = (await run(chain, S, { topK: 2, maxHops: 1 })).result;
  assert.ok(has(r1, B) && has(r1, C) && !has(r1, A), 'B(9000) 第一，C 与 A 同为 6000，C 区块更早');
  const r2 = (await run(chain, S, { topK: 2, maxHops: 1, priceHints: { ETH: 1000 } })).result; // 3 ETH ≈ 3000，垫底
  assert.ok(has(r2, A) && has(r2, C) && !has(r2, B));
});

test('trace：每个节点只看资金到达该节点之后的转出（startblock = 最早到达区块）；起点用 startBlock', async () => {
  const S = addr('S'), E = addr('E'), Early = addr('early'), Late = addr('late'), Pre = addr('pre');
  const chain = Chain()
    .eth(S, Pre, 9, 50) // 在 startBlock 之前
    .eth(S, E, 10, 100)
    .eth(E, Early, 9, 90) // E 收到钱之前的转出
    .eth(E, Late, 9, 120);
  const { result, log } = await run(chain, S, { startBlock: 80 });
  assert.ok(!has(result, Pre));
  assert.ok(has(result, Late));
  assert.ok(!has(result, Early));
  assert.equal(log.find(l => l.action === 'txlist' && l.address === S).startblock, 80);
  assert.equal(log.find(l => l.action === 'txlist' && l.address === E).startblock, 100);
  assert.equal(result.case.id, 'trace-' + S.slice(0, 8) + '-80');
});

test('trace：已出现的地址不重复展开（环），但补上这条边', async () => {
  const S = addr('S'), A = addr('A');
  const chain = Chain().eth(S, A, 10, 100).eth(A, S, 9, 110);
  const { result, log } = await run(chain, S);
  assert.equal(result.case.nodes.length, 2);
  assert.equal(log.filter(l => l.action === 'txlist' && l.address === S).length, 1);
  assert.equal(result.case.txs.length, 2);
  const s = byAddr(result, S), a = byAddr(result, A);
  assert.ok(result.case.txs.some(t => t.from === a.id && t.to === s.id));
});

test('trace：maxHops 限制深度，最后一层只记录、不再展开', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B'), C = addr('C');
  const chain = Chain().eth(S, A, 10, 100).eth(A, B, 9, 110).eth(B, C, 8, 120);
  const { result, log } = await run(chain, S, { maxHops: 2 });
  assert.ok(has(result, B) && !has(result, C));
  assert.ok(!called(log, 'txlist', B));
  assert.match(stopOf(result, B), /最大跳数/);
  assert.equal(byAddr(result, B).x, 680);
  assert.equal(result.meta.truncated, false, '到达 maxHops 是设计内的边界，不算截断');
});

test('trace：预算用完 → meta.truncated 为 true，说明原因，已得到的部分照常返回；中途被截的节点整体回滚', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B');
  const chain = Chain().eth(S, A, 10, 100).eth(A, B, 9, 110);
  // S 展开 3 次 + A 的 getcode 1 次 = 4；A 的 txlist 是第 5 次，tokentx 第 6 次被拒
  const { result, client } = await run(chain, S, { maxCalls: 5 });
  assert.equal(result.meta.truncated, true);
  assert.ok(result.meta.truncatedReasons.some(r => /预算/.test(r)));
  assert.ok(client.calls <= 5);
  assert.equal(result.meta.calls, client.calls);
  assert.equal(result.meta.maxCalls, 5);
  assert.ok(has(result, S) && has(result, A), '已完成的部分保留');
  assert.ok(!has(result, B));
  assert.equal(result.case.txs.length, 1);
  assert.match(stopOf(result, A), /预算/);
  assert.match(result.case.facts.find(f => f[0] === '是否截断')[1], /^是/);
  // 预算连起点的展开都不够：起点没有边，但仍返回结构完整的结果
  const tiny = (await run(chain, S, { maxCalls: 2 })).result;
  assert.equal(tiny.meta.truncated, true);
  assert.equal(tiny.case.nodes.length, 1);
  assert.deepEqual(tiny.case.txs, []);
  assert.match(stopOf(tiny, S), /预算/);
});

test('trace：signal 中止 → 停止、truncated 为 true，返回已有部分', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B');
  const chain = Chain().eth(S, A, 10, 100).eth(A, B, 9, 110);
  const ac = new AbortController();
  const { result } = await run(chain, S, { signal: ac.signal, hooks: { onFetch: (p, log) => { if (log.length === 4) ac.abort(); } } });
  assert.equal(result.meta.truncated, true);
  assert.ok(result.meta.truncatedReasons.some(r => /中止/.test(r)));
  assert.ok(has(result, S));
  // 开始前就已中止
  const ac2 = new AbortController();
  ac2.abort();
  const r2 = (await run(chain, S, { signal: ac2.signal })).result;
  assert.equal(r2.meta.truncated, true);
  assert.equal(r2.meta.calls, 0);
  assert.equal(r2.case.nodes.length, 1);
});

test('trace：onProgress 收到 {calls,maxCalls,visited,queue,msg}', async () => {
  const S = addr('S'), A = addr('A');
  const chain = Chain().eth(S, A, 10, 100);
  const m = mockChain(chain.db);
  const client = Trace.createClient({ key: KEY, fetchImpl: m.fetchImpl, minIntervalMs: 0, maxCalls: 50 });
  const seen = [];
  await Trace.trace({ client, start: S, maxHops: 1, onProgress: p => seen.push(p) });
  assert.ok(seen.length >= 2);
  for (const p of seen) assert.deepEqual(Object.keys(p).sort(), ['calls', 'maxCalls', 'msg', 'queue', 'visited']);
  assert.equal(seen[seen.length - 1].calls, client.calls);
  assert.ok(seen[seen.length - 1].visited >= 1);
});

test('trace：单个节点展开失败（非预算）→ 记警告并继续；起点失败直接抛出，且错误里没有 key', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B'), C = addr('C');
  const chain = Chain().eth(S, A, 10, 100).eth(S, B, 9, 101).eth(B, C, 8, 120);
  const { result } = await run(chain, S, { hooks: { onFetch: p => { if ((p.address || '').toLowerCase() === A && p.action === 'txlist') throw new Error('boom ' + KEY); } } });
  assert.ok(has(result, C), 'B 的分支不受 A 失败影响');
  assert.ok(result.meta.warnings.some(w => w.includes('展开失败')));
  assert.ok(!JSON.stringify(result).includes(KEY));
  const m = mockChain(chain.db, { onFetch: () => { throw new Error('connect ECONNREFUSED https://x/?apikey=' + KEY); } });
  const client = Trace.createClient({ key: KEY, fetchImpl: m.fetchImpl, minIntervalMs: 0 });
  await assert.rejects(Trace.trace({ client, start: S }), e => e.code === 'NETWORK' && !e.message.includes(KEY));
});

test('trace：结果对象里绝不出现 key', async () => {
  const S = addr('S'), A = addr('A'), V = addr('V');
  const chain = Chain().usdt(S, A, 5000, 100).usdt(A, V, 5000, 110).contract(V, 'Vault');
  const infos = [];
  const m = mockChain(chain.db);
  const client = Trace.createClient({ key: KEY, fetchImpl: m.fetchImpl, minIntervalMs: 0, maxCalls: 100, onCall: i => infos.push(i) });
  const result = await Trace.trace({ client, start: S });
  assert.ok(!JSON.stringify(result).includes(KEY));
  assert.ok(!JSON.stringify(infos).includes(KEY));
  assert.ok(m.log.every(l => l.apikey === KEY), '请求本身带了 key（只是结果里没有）');
  assert.ok(!JSON.stringify(result).includes('apikey'));
});

test('trace 输出契约：case 与页面 CASES 同结构；节点 type 只用页面已有的；x/y 布局', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B'), V = addr('V'), D = addr('D');
  const chain = Chain().usdt(S, A, 5000, 100).usdt(S, B, 4000, 100).usdt(A, V, 5000, 110).usdt(B, D, 3000, 111).contract(V, 'Vault');
  const { result } = await run(chain, S, { startBlock: 7 });
  const c = result.case;
  assert.equal(c.id, 'trace-' + S.slice(0, 8) + '-7');
  assert.equal(c.tab, '追踪 ' + Trace.shortAddr(S));
  assert.equal(c.tabK, '自动追踪');
  assert.equal(c.kind, 'real');
  assert.equal(c.unit, 'block');
  assert.equal(c.focus, byAddr(result, S).id);
  assert.equal(typeof c.title, 'string');
  assert.equal(typeof c.short, 'string');
  assert.equal(typeof c.en, 'string');
  assert.deepEqual(c.banner, ['<b>自动追踪</b> · 由 Etherscan API 实时拉取', '自动结果可能漏判或误判，提交举报前请人工复核']);
  assert.equal(c.channels, '受害方官方举报渠道；相关交易所或协议的合规/安全联系人；执法机关');
  const keys = c.facts.map(f => f[0]);
  for (const k of ['起点', '范围', '数据来源', 'API 调用', '是否截断']) assert.ok(keys.includes(k), '缺 facts：' + k);
  assert.ok(c.facts.find(f => f[0] === '数据来源')[1].includes(result.meta.traced_at), '抓取时间');
  assert.ok(c.facts.every(f => Array.isArray(f) && f.length === 2));
  const TYPES = ['victim', 'attacker', 'relay', 'dex', 'bridge', 'compliant', 'cex', 'mixer', 'otc', 'frozen', 'hypo', 'dust'];
  for (const n of c.nodes) {
    assert.ok(TYPES.includes(n.type), n.type);
    assert.equal(typeof n.id, 'string');
    assert.equal(typeof n.label, 'string');
    assert.equal(typeof n.note, 'string');
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  }
  assert.equal(new Set(c.nodes.map(n => n.id)).size, c.nodes.length, 'id 唯一');
  const depthX = { [S]: 0, [A]: 340, [B]: 340, [D]: 680, [V]: 680 };
  for (const [a, x] of Object.entries(depthX)) assert.equal(byAddr(result, a).x, x);
  assert.equal(Math.abs(byAddr(result, A).y - byAddr(result, B).y), 100);
  const ids = new Set(c.nodes.map(n => n.id));
  for (const t of c.txs) {
    assert.ok(ids.has(t.from) && ids.has(t.to));
    assert.ok(Number.isInteger(t.t));
    assert.equal(typeof t.amt, 'string');
    assert.ok(t.eth === null || typeof t.eth === 'number');
    assert.match(t.hash, /^0x[0-9a-f]{64}$/);
    assert.ok(Array.isArray(t.flags));
  }
  const m = result.meta;
  assert.equal(m.start, S);
  assert.deepEqual(Object.keys(m.ignored).filter(k => k !== 'belowTopK').sort(), ['dust', 'fakeToken', 'poison', 'zeroValue']);
  for (const k of ['params', 'calls', 'maxCalls', 'truncated', 'truncatedReasons', 'warnings', 'stoppedAt', 'ignored', 'traced_at']) assert.ok(k in m, k);
  assert.ok(!Number.isNaN(Date.parse(m.traced_at)));
  assert.ok(m.stoppedAt.every(s => typeof s.addr === 'string' && typeof s.reason === 'string'));
});

test('trace：ETH / WETH 的 eth 字段是数量，其它资产为 null；可冻结稳定币带 freeze 标记；金额字符串带千分位', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B'), C = addr('C'), W = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const chain = Chain().eth(S, A, 200, 100).tok(S, B, USDC, 'USDC', 123456.78, 100).tok(S, C, W, 'WETH', 7.5, 100, 18);
  const { result } = await run(chain, S);
  const tx = a => result.case.txs.find(t => t.to === byAddr(result, a).id);
  assert.deepEqual([tx(A).amt, tx(A).eth, tx(A).flags], ['200 ETH', 200, []]);
  assert.deepEqual([tx(B).amt, tx(B).eth, tx(B).flags], ['123,456.78 USDC', null, ['freeze']]);
  assert.deepEqual([tx(C).amt, tx(C).eth, tx(C).flags], ['7.5 WETH', 7.5, []]);
});

test('trace：每笔转账带 ts（Etherscan 的 timeStamp，Unix 秒，数字）；缺失 / 非法 / 非正数为 null；内部转账与代币转账同样', async () => {
  const S = addr('S'), A = addr('A'), B = addr('B'), C = addr('C'), D = addr('D');
  const chain = Chain().eth(S, A, 200, 100, { timeStamp: '1790664263' }).eth(S, B, 150, 101).eth(S, C, 120, 102, { timeStamp: 'abc' }).eth(S, D, 110, 103, { timeStamp: '0' });
  const { result } = await run(chain, S);
  const ts = a => result.case.txs.find(t => t.to === byAddr(result, a).id).ts;
  assert.equal(ts(A), 1790664263);
  assert.equal(typeof ts(A), 'number');
  assert.equal(ts(B), null, '没有 timeStamp → null');
  assert.equal(ts(C), null, '非数字 → null');
  assert.equal(ts(D), null, '0 不是有效时间戳 → null');
  assert.ok(result.case.txs.every(t => 'ts' in t), '每笔转账都有 ts 键');
  // 代币转账：mock 的 tokentx 行也可以带 timeStamp
  const E = addr('E'), F = addr('F');
  const c2 = Chain().usdt(E, F, 5000, 200);
  Object.values(c2.db.tokentx).forEach(rows => rows.forEach(r => { r.timeStamp = '1790664300'; }));
  const r2 = await run(c2, E);
  assert.equal(r2.result.case.txs[0].ts, 1790664300);
});

test('trace：内部转账（txlistinternal）也算原生 ETH 转出', async () => {
  const S = addr('S'), A = addr('A');
  const chain = Chain().internal(S, A, 12, 100);
  const { result } = await run(chain, S);
  assert.ok(has(result, A));
  assert.equal(result.case.txs[0].amt, '12 ETH');
});

test('trace：同一对地址转账过多只逐笔列出前 20 笔，其余折进 note', async () => {
  const S = addr('S'), A = addr('A');
  const chain = Chain();
  for (let i = 0; i < 25; i++) chain.eth(S, A, 1, 100 + i);
  const { result } = await run(chain, S);
  assert.equal(result.case.txs.length, 20);
  assert.match(result.case.txs[19].note, /还有 5 笔 ETH 转账未逐笔列出，合计 25 ETH/);
});

test('trace：单页返回达到上限时给警告（可能漏掉更晚的转账）', async () => {
  const S = addr('S'), A = addr('A');
  const chain = Chain();
  for (let i = 0; i < 3; i++) chain.eth(S, A, 1, 100 + i);
  const m = mockChain(chain.db);
  const client = Trace.createClient({ key: KEY, fetchImpl: m.fetchImpl, minIntervalMs: 0, pageSize: 3 });
  const result = await Trace.trace({ client, start: S, maxHops: 1 });
  assert.ok(result.meta.warnings.some(w => /单页上限 3/.test(w)));
});

// ======================================================================
// 真实夹具回放（Bitget 案）
// ======================================================================
const START = '0x04065ccf52929dce58d9c7659de6ddac2316e84e';
const A6101 = '0x6101b936fa0f7ae9a49b7260cb59b56aa31d7126';
const AEC00 = '0xec008786a6a966f10f0fa01a6511517c4c05e079';
const A2279 = '0x2279e1a93f66bf97833b76d5897734ff0b0ca520';
const A39DD = '0x39ddab7ed57f837e50366f5f6199eba43ba44424';
const VAULT = '0xf5e10380213880111522dd0efd3dbb45b9f62bcc';
const REPLAY_ARGS = [START, '--from-block', '26081300', '--hops', '3', '--top', '6', '--max-calls', '120', '--replay', FIX, '--quiet'];

const tmp = mkdtempSync(join(tmpdir(), 'suliu-trace-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

function runCli(args, env) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), timeout: 60000 });
}
const replay = runCli([...REPLAY_ARGS, '--out', join(tmp, 'bitget.json')]);
const bitget = replay.status === 0 || replay.status === 3 ? JSON.parse(readFileSync(join(tmp, 'bitget.json'), 'utf8')) : null;

test('夹具：目录存在、有录制文件、没有 apikey 字样、没有 .env 里的 key', () => {
  assert.ok(existsSync(FIX));
  const files = readdirSync(FIX).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 40, '夹具文件数 ' + files.length);
  let envKey = '';
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) { const m = readFileSync(envFile, 'utf8').match(/^\s*ETHERSCAN_API_KEY\s*=\s*(.*?)\s*$/m); if (m) envKey = m[1].replace(/^["']|["']$/g, ''); }
  let leakedParam = 0, leakedKey = 0;
  for (const f of files) {
    const text = readFileSync(join(FIX, f), 'utf8');
    if (/apikey/i.test(text)) leakedParam++;
    if (envKey && text.includes(envKey)) leakedKey++;
  }
  assert.equal(leakedParam, 0, '夹具里不能出现 apikey 参数');
  assert.equal(leakedKey, 0, '夹具里不能出现 .env 里的 key（值不打印）');
});

test('CLI --replay：退出码 0，stdout 是去向树，stderr 为空，结果文件写出', () => {
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(replay.stderr, '');
  assert.match(replay.stdout, /追踪起点 0x04065ccf/);
  assert.match(replay.stdout, /\[回放\]/);
  assert.match(replay.stdout, /Chainflip 以太坊 Vault \[可拦截通道 · 可冻结点\]/);
  assert.match(replay.stdout, /200,000 USDT \[可冻结点：稳定币\]/);
  assert.ok(replay.stdout.includes('0xa28255f172dbfd4208147be07a79e4cef775c62c565f9a777fcaec7bfc9345fa'));
  assert.ok(!!bitget);
  assert.deepEqual(Object.keys(bitget).sort(), ['case', 'meta']);
});

test('夹具回放：0x0406 → 0x6101（200,000 USDT，可冻结）→ 0xec0087 → Chainflip 金库（compliant，终点）', () => {
  const { case: c, meta } = bitget;
  const node = a => c.nodes.find(n => n.addr === a);
  const tx = h => c.txs.find(t => t.hash === h);
  const e1 = tx('0xa28255f172dbfd4208147be07a79e4cef775c62c565f9a777fcaec7bfc9345fa');
  assert.ok(e1, '0x0406 → 0x6101');
  assert.equal(e1.from, node(START).id);
  assert.equal(e1.to, node(A6101).id);
  assert.equal(e1.amt, '200,000 USDT');
  assert.ok(e1.flags.includes('freeze'));
  assert.equal(e1.t, 26081410);
  const e2 = tx('0x0dc715c3587859215be48b48f153997c214fc8e8766c727f4fd97b3fb4dbc569');
  assert.ok(e2, '0x6101 → 0xec0087');
  assert.equal(e2.from, node(A6101).id);
  assert.equal(e2.to, node(AEC00).id);
  const e3 = tx('0xfcb7dfd6037a7156ad5930fef6e58ac1e5a4b7fd99b72e6986d1fc0cb7673243');
  assert.ok(e3, '0xec0087 → Chainflip 金库');
  assert.equal(e3.from, node(AEC00).id);
  assert.equal(e3.to, node(VAULT).id);
  assert.equal(node(VAULT).type, 'compliant');
  assert.match(node(VAULT).note, /Bitget 官方 reviewed：Chainflip 以太坊 Vault/);
  assert.ok(meta.stoppedAt.some(s => s.addr === VAULT && /Chainflip/.test(s.reason)), '金库是终点');
  assert.ok(!c.txs.some(t => t.from === node(VAULT).id), '金库之后不展开');
});

test('夹具回放：0x0406 → 0x2279 → 0x39dd → 同一个金库', () => {
  const { case: c } = bitget;
  const node = a => c.nodes.find(n => n.addr === a);
  const tx = h => c.txs.find(t => t.hash === h);
  const f1 = tx('0x26dbe07ec0c1da81640e76fd0f786d387d6293fc83626dcb245a23f49e7e1c5f');
  const f2 = tx('0x63097baed07012392851662f23622239012b6b573a32f83141233bf8ad405e8a');
  const f3 = tx('0x53f6ef0332b60f2533e37952e546a580750cb06c5810b63274b9658b129527a5');
  assert.ok(f1 && f2 && f3);
  assert.deepEqual([f1.from, f1.to], [node(START).id, node(A2279).id]);
  assert.deepEqual([f2.from, f2.to], [node(A2279).id, node(A39DD).id]);
  assert.deepEqual([f3.from, f3.to], [node(A39DD).id, node(VAULT).id]);
  assert.equal(f1.amt, '200,000 USDT');
  assert.ok(f1.flags.includes('freeze'));
  assert.equal(c.nodes.filter(n => n.addr === VAULT).length, 1, '两条路径汇到同一个金库节点');
});

test('夹具回放：每笔转账都带 ts，且与夹具里原始响应的 timeStamp 一致；验收路径上 6 笔的 ts 钉死', () => {
  const raw = new Map();
  for (const f of readdirSync(FIX)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(FIX, f), 'utf8'));
    if (Array.isArray(j.response && j.response.result)) for (const r of j.response.result) if (r.hash && r.timeStamp) raw.set(r.hash, Number(r.timeStamp));
  }
  const { txs } = bitget.case;
  assert.ok(txs.length > 0);
  for (const t of txs) {
    assert.ok(Number.isInteger(t.ts) && t.ts > 0, '非空整数 ts：' + t.hash);
    assert.equal(t.ts, raw.get(t.hash), 'ts 与夹具原始 timeStamp 一致：' + t.hash);
  }
  const pinned = {
    '0xa28255f172dbfd4208147be07a79e4cef775c62c565f9a777fcaec7bfc9345fa': 1790664263, // 0x0406 → 0x6101（区块 26081410）
    '0x0dc715c3587859215be48b48f153997c214fc8e8766c727f4fd97b3fb4dbc569': 1790664275, // 0x6101 → 0xec0087
    '0xfcb7dfd6037a7156ad5930fef6e58ac1e5a4b7fd99b72e6986d1fc0cb7673243': 1790664467, // 0xec0087 → Chainflip 金库
    '0x26dbe07ec0c1da81640e76fd0f786d387d6293fc83626dcb245a23f49e7e1c5f': 1790664359, // 0x0406 → 0x2279
    '0x63097baed07012392851662f23622239012b6b573a32f83141233bf8ad405e8a': 1790664467, // 0x2279 → 0x39dd
    '0x53f6ef0332b60f2533e37952e546a580750cb06c5810b63274b9658b129527a5': 1790664587  // 0x39dd → Chainflip 金库
  };
  for (const [h, ts] of Object.entries(pinned)) assert.equal(txs.find(t => t.hash === h).ts, ts, h);
});

test('夹具回放：只靠假代币 / 0 值转账关联的对手方不能出现', () => {
  const nodes = new Set(bitget.case.nodes.map(n => n.addr));
  for (const bad of ['0xec003b7d7be284d26e5e1725b780ab18f5f00079', '0x39dda181e4fa0d4c9b94a18424e9361eb3044424']) assert.ok(!nodes.has(bad), bad);
  // 从夹具里的原始 tokentx 反推：0x0406 发出的转账里，只收到过假代币的地址一个都不能进图
  const rows = fixtureRows('tokentx', START);
  const realTo = new Set(), fakeTo = new Set();
  for (const r of rows) {
    if (r.from !== START) continue;
    const cls = Trace.classifyTokenTransfer(r, Trace.DEFAULT_MIN_VALUE);
    (cls.kind === 'real' ? realTo : fakeTo).add(r.to);
  }
  const fakeOnly = [...fakeTo].filter(a => !realTo.has(a));
  assert.ok(fakeOnly.length >= 10, '夹具里有大量只收到假代币的地址：' + fakeOnly.length);
  for (const a of fakeOnly) assert.ok(!nodes.has(a), a);
  assert.ok(bitget.meta.ignored.fakeToken >= 100);
  assert.ok(bitget.meta.ignored.zeroValue > 0);
});

test('夹具回放："另 3 笔 USDT"（区块 26081466 / 26081482 / 26081496）是真 USDT：合约在白名单里，金额与对手方见夹具', () => {
  const rows = fixtureRows('tokentx', START).filter(r => r.from === START);
  const expect = [
    ['26081466', '0x8524a4da206ce85d7bc11252ff98fec61fd97c46af6368936a3a10b5ac61afee', '0xc51c568be036cc5383575d23884beefbd7070db5', 200000],
    ['26081482', '0x9b3a450a544fa2abd1d063a659cd82a1c32f8b605be535cc5075ee49c36111a8', '0x3e6fc6fb04989e7e5bf2b844e841246feb6b8db2', 200000],
    ['26081496', '0x0786f257eed8a29e45b2d5f310a7f5e57651db13be4106831dd72d1503baf0b2', '0x5889433b754324089d4b6f168840fe5b13fe25df', 425959.082337]
  ];
  for (const [block, hash, to, amount] of expect) {
    const r = rows.find(x => x.hash === hash);
    assert.ok(r, hash);
    assert.equal(r.blockNumber, block);
    assert.equal(r.to, to);
    assert.equal(r.contractAddress, USDT);
    const cls = Trace.classifyTokenTransfer(r, Trace.DEFAULT_MIN_VALUE);
    assert.equal(cls.kind, 'real');
    assert.ok(Math.abs(cls.amount - amount) < 1e-6);
  }
  // 同一区块附近还有伪造发送方的假 "USDT"（合约不是官方 USDT）
  const fakes = rows.filter(r => Number(r.blockNumber) >= 26081460 && Number(r.blockNumber) <= 26081500 && r.contractAddress !== USDT);
  assert.ok(fakes.length >= 3);
  assert.ok(fakes.every(r => Trace.classifyTokenTransfer(r, Trace.DEFAULT_MIN_VALUE).kind === 'fakeToken'));
});

test('夹具回放：布局（x = 跳数×340，同一跳 100px 间距）与预算', () => {
  const { case: c, meta } = bitget;
  const start = c.nodes.find(n => n.addr === START);
  assert.equal(start.x, 0);
  assert.equal(c.focus, start.id);
  assert.equal(c.nodes.find(n => n.addr === A6101).x, 340);
  assert.equal(c.nodes.find(n => n.addr === AEC00).x, 680);
  assert.equal(c.nodes.find(n => n.addr === VAULT).x, 1020);
  const byX = new Map();
  c.nodes.forEach(n => { if (!byX.has(n.x)) byX.set(n.x, []); byX.get(n.x).push(n.y); });
  for (const ys of byX.values()) { ys.sort((a, b) => a - b); for (let i = 1; i < ys.length; i++) assert.equal(ys[i] - ys[i - 1], 100); }
  assert.equal(meta.truncated, false);
  assert.ok(meta.calls > 0 && meta.calls <= 120);
  assert.equal(meta.maxCalls, 120);
  assert.equal(c.id, 'trace-0x04065c-26081300');
  assert.ok(!JSON.stringify(bitget).includes('apikey'));
});

test('CLI --replay --max-calls 12：预算用完 → 退出码 3，结果文件照常写出且 truncated=true', () => {
  const out = join(tmp, 'trunc.json');
  const r = runCli([START, '--from-block', '26081300', '--hops', '3', '--top', '6', '--max-calls', '12', '--replay', FIX, '--quiet', '--out', out]);
  assert.equal(r.status, 3, r.stderr + r.stdout);
  assert.match(r.stderr, /截断/);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.meta.truncated, true);
  assert.ok(j.meta.calls <= 12);
  assert.ok(j.case.nodes.length >= 1);
  assert.match(r.stdout, /截断：是/);
});

test('CLI：参数错误退出码 2；夹具缺失 / 目录不存在退出码 1；任何输出里没有 key', () => {
  assert.equal(runCli([]).status, 2);
  assert.equal(runCli(['0x123']).status, 2);
  assert.equal(runCli([START, '--hops', 'x']).status, 2);
  assert.equal(runCli([START, '--bogus']).status, 2);
  assert.equal(runCli([START, '--record', tmp, '--replay', tmp]).status, 2);
  const missingDir = runCli([START, '--replay', join(tmp, 'nope')]);
  assert.equal(missingDir.status, 1);
  assert.match(missingDir.stderr, /不存在/);
  // 夹具里没有这个起点：回放读不到任何请求 → 追踪失败，退出码 1
  const unknown = runCli(['0x' + '1'.repeat(40), '--replay', FIX, '--quiet', '--out', join(tmp, 'x.json')]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /追踪失败/);
  assert.equal(runCli(['--help']).status, 0);
  for (const r of [replay, missingDir, unknown]) assert.ok(!(r.stdout + r.stderr).includes('apikey='));
});

// ======================================================================
// 录制 / 回放往返（用合成链上数据，不联网）
// ======================================================================
test('--record：每个响应存一个文件、键里没有 apikey、响应里没有 key；--replay 回放得到同一个结果', async () => {
  const S = addr('S'), A = addr('A'), V = addr('V');
  const chain = Chain().usdt(S, A, 5000, 100).usdt(A, V, 5000, 110).contract(V, 'Vault').eth(S, addr('Z'), 0, 101);
  const m = mockChain(chain.db);
  const dir = join(tmp, 'rec');
  const rec = cli.makeRecordFetch(dir, m.fetchImpl, KEY);
  const c1 = Trace.createClient({ key: KEY, fetchImpl: rec, minIntervalMs: 0, maxCalls: 100 });
  const r1 = await Trace.trace({ client: c1, start: S });
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.equal(files.length, c1.calls, '每个不同请求一个文件');
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.ok(!text.includes(KEY));
    assert.ok(!/apikey/i.test(text));
    assert.ok(typeof JSON.parse(text).key === 'string');
  }
  const c2 = Trace.createClient({ key: 'ANOTHER', fetchImpl: cli.makeReplayFetch(dir), minIntervalMs: 0, maxCalls: 100 });
  const r2 = await Trace.trace({ client: c2, start: S, now: () => new Date(r1.meta.traced_at) });
  assert.deepEqual(r2, r1);
  // 回放缺请求 → 明确报错
  const c3 = Trace.createClient({ key: 'K', fetchImpl: cli.makeReplayFetch(dir), minIntervalMs: 0 });
  await assert.rejects(c3.txlist(addr('unseen')), e => e.code === 'NETWORK' && /夹具里没有这个请求/.test(e.message));
});

test('--record：限速 / 报错响应不入夹具；响应里带 key 时拒绝写入', async () => {
  const dir = join(tmp, 'rec2');
  let mode = 'limit';
  const fake = async () => (mode === 'limit'
    ? okRes({ status: '0', message: 'NOTOK', result: 'Max calls per sec rate limit reached' })
    : mode === 'leak' ? { ok: true, status: 200, text: async () => JSON.stringify({ status: '1', message: 'OK', result: [{ echo: KEY }] }) }
      : { ok: true, status: 200, text: async () => JSON.stringify({ status: '1', message: 'OK', result: [] }) });
  const wrap = f => async (u, i) => { const r = await f(u, i); return r.text ? r : { ok: r.ok, status: r.status, text: async () => JSON.stringify(await r.json()) }; };
  const rec = cli.makeRecordFetch(dir, wrap(fake), KEY);
  const client = Trace.createClient({ key: KEY, fetchImpl: rec, minIntervalMs: 0, maxCalls: 20, retries: 0 });
  await assert.rejects(client.txlist(addr('a')), e => e.code === 'RATE_LIMIT');
  assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], []);
  mode = 'leak';
  await assert.rejects(client.txlist(addr('a')), e => /拒绝写入/.test(e.message) && !e.message.includes(KEY));
  assert.deepEqual(readdirSync(dir), []);
  mode = 'ok';
  await client.txlist(addr('a'));
  assert.equal(readdirSync(dir).length, 1);
});

// ======================================================================
// 夹具读取辅助
// ======================================================================
function fixtureRows(action, address) {
  for (const f of readdirSync(FIX)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(FIX, f), 'utf8'));
    const p = new URLSearchParams(j.key);
    if (p.get('action') === action && p.get('address') === address && Array.isArray(j.response.result)) return j.response.result;
  }
  return [];
}
