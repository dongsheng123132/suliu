import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Trace = require('../lib/trace-eth.js');
const Chains = require('../lib/chains.js');
const { parseArgs, UsageError } = await import('../tools/trace.mjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const TRACE_CLI = join(ROOT, 'tools', 'trace.mjs');
const BSC_FIX = join(HERE, 'fixtures', 'etherscan-bsc-demo');

const S = '0x' + '11'.repeat(20), A = '0x' + '22'.repeat(20), B = '0x' + '33'.repeat(20), C = '0x' + '44'.repeat(20);
const BSC_USDT = '0x55d398326f99059ff775485246999027b3197955';
const ETH_USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const H = c => '0x' + c.repeat(64);
const norm = a => String(a).toLowerCase();
const pick = (list, a) => (list || []).filter(r => norm(r.from) === norm(a) || norm(r.to) === norm(a));

function mkClient(rows, chainid) {
  return {
    calls: 0, maxCalls: 100, chainid, pageSize: 1000,
    async txlist(a) { return pick(rows.txlist, a); },
    async tokentx(a) { return pick(rows.tokentx, a); },
    async txlistinternal(a) { return pick(rows.internal, a); },
    async getcode() { return '0x'; },
    async getsourcecode() { return {}; }
  };
}
const row = (over) => Object.assign({ hash: H('a'), blockNumber: '100', timeStamp: '1700000000' }, over);
const usdtRow = (to, contract, value, over) => row(Object.assign({ from: S, to, contractAddress: contract, value, tokenSymbol: 'USDT', tokenDecimal: '18' }, over));

test('trace.resolveChain：未知链拒绝（code:CHAIN）；缺省保持 ETH；支持 bsc', () => {
  assert.equal(Trace.resolveChain(null), null);
  assert.equal(Trace.resolveChain('eth').chainid, 1);
  assert.equal(Trace.resolveChain('bsc').chainid, 56);
  assert.equal(Trace.resolveChain(56).id, 'bsc');
  assert.throws(() => Trace.resolveChain('solana'), e => e.code === 'CHAIN' && /未知链/.test(e.message));
});

test('trace 按链白名单：BSC 用 BSC 的 USDT 合约与 BNB 原生币，ETH 合约在 BSC 上算假代币', async () => {
  const rows = {
    txlist: [row({ from: S, to: A, value: '1000000000000000000', isError: '0' })],
    tokentx: [usdtRow(B, BSC_USDT, '200000000000000000000'), usdtRow(C, ETH_USDT, '200000000', { blockNumber: '102', hash: H('c') })],
    internal: []
  };
  const client = mkClient(rows, 56);
  const r = await Trace.trace({ client, start: S, chain: 'bsc', maxHops: 1, topK: 5, now: () => new Date('2026-10-31T00:00:00.000Z') });
  const nodeOf = a => r.case.nodes.find(n => n.addr === a);
  const txTo = id => r.case.txs.find(t => t.to === id);
  assert.equal(txTo(nodeOf(A).id).amt, '1 BNB');
  assert.equal(txTo(nodeOf(B).id).amt, '200 USDT');
  assert.deepEqual(txTo(nodeOf(B).id).flags, [], 'BSC 白名单代币不标可冻结');
  assert.equal(nodeOf(C), undefined, 'ETH 的 USDT 合约在 BSC 上不能当真币');
  assert.equal(r.meta.ignored.fakeToken, 1);
  assert.ok(r.case.facts.find(f => f[0] === '数据来源')[1].includes('chainid 56'));
  assert.ok(r.case.facts.find(f => f[0] === '数据来源')[1].includes('BNB Smart Chain'));
  assert.ok(r.case.banner[0].includes('BNB Smart Chain'));
  assert.ok(r.case.facts.find(f => f[0] === '金额说明')[1].includes('BNB'));
  assert.equal(r.case.chain, 'bsc', '结果要带链标识，供多链报告按链生成链接');
  assert.equal(r.case.chainid, 56);
  assert.equal(r.meta.chainid, 56);
});

test('trace 非 ETH 链不套用 Bitget 官方标签（给警告，不做官方核对）', async () => {
  const rows = { txlist: [row({ from: S, to: A, value: '1000000000000000000', isError: '0' })], tokentx: [], internal: [] };
  const client = mkClient(rows, 56);
  const r = await Trace.trace({ client, start: S, chain: 'bsc', maxHops: 1, official: { holdings: {} }, officialLib: require('../lib/official-data.js') });
  assert.ok(r.meta.warnings.some(w => /不使用 Bitget 官方标签/.test(w)));
});

test('trace 默认（不传 chain）仍是以太坊：ETH USDT 可冻结、banner 与旧版一致', async () => {
  const rows = {
    txlist: [row({ from: S, to: A, value: '1000000000000000000', isError: '0' })],
    tokentx: [usdtRow(B, ETH_USDT, '200000000', { tokenDecimal: '6' })],
    internal: []
  };
  const client = mkClient(rows, 1);
  const r = await Trace.trace({ client, start: S, maxHops: 1, topK: 5 });
  const nodeOf = a => r.case.nodes.find(n => n.addr === a);
  const txTo = id => r.case.txs.find(t => t.to === id);
  assert.equal(txTo(nodeOf(A).id).amt, '1 ETH');
  assert.equal(txTo(nodeOf(B).id).amt, '200 USDT');
  assert.deepEqual(txTo(nodeOf(B).id).flags, ['freeze']);
  assert.equal(r.case.banner[0], '<b>自动追踪</b> · 由 Etherscan API 实时拉取', 'ETH 默认 banner 不变');
  assert.ok(r.case.facts.find(f => f[0] === '数据来源')[1].includes('chainid 1'));
});

test('trace 按链分类：classifyTokenTransfer 只在传入的白名单里认代币', () => {
  const bsc = Chains.get('bsc');
  assert.equal(Trace.classifyTokenTransfer({ contractAddress: BSC_USDT, value: '200000000000000000000' }, bsc.minValue, bsc.tokens).kind, 'real');
  assert.equal(Trace.classifyTokenTransfer({ contractAddress: ETH_USDT, value: '1' }, bsc.minValue, bsc.tokens).kind, 'fakeToken');
  assert.equal(Trace.classifyNativeTransfer({ isError: '0', value: '1000000000000000000' }, bsc.minValue, bsc.native).symbol, 'BNB');
});

test('CLI trace 参数：--chain 接受 eth/bsc，未知链与 BTC 都退出码 2 级别（UsageError）', () => {
  assert.equal(parseArgs([S, '--chain', 'bsc']).chain, 'bsc');
  assert.equal(parseArgs([S]).chain, 'eth');
  assert.throws(() => parseArgs([S, '--chain', 'solana']), e => e instanceof UsageError && /未知链/.test(e.message));
  assert.throws(() => parseArgs([S, '--chain', 'btc']), e => e instanceof UsageError, 'BTC 不是 EVM 链，不能走 trace.mjs');
});

test('CLI trace --chain bsc --replay：离线跑通，结果带 bsc 链标识与 BNB 原生币', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-trace-chain-test-'));
  try {
    const out = join(tmp, 'bsc.json');
    const r = spawnSync(process.execPath, [TRACE_CLI, S, '--chain', 'bsc', '--replay', BSC_FIX, '--hops', '1', '--top', '5', '--max-calls', '50', '--quiet', '--out', out], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(j.case.chain, 'bsc');
    assert.equal(j.case.chainid, 56);
    assert.ok(j.case.txs.some(t => t.amt === '1 BNB'), '原生币是 BNB，不是 ETH');
    assert.ok(j.case.txs.some(t => t.amt === '200 USDT'), 'BSC 白名单 USDT 被识别');
    assert.ok(!readdirSync(BSC_FIX).some(f => /apikey/i.test(readFileSync(join(BSC_FIX, f), 'utf8'))), '夹具里不能出现 apikey');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
