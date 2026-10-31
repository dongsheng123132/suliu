import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Btc from '../lib/btc.mjs';
import { makeReplayFetch } from '../tools/btc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CLI = join(ROOT, 'tools', 'btc.mjs');
const FIX = join(HERE, 'fixtures', 'btc-demo');
const V = 'bc1qcqvt5cfefnq2f3ykhm8pz07msv54azcn02g5rz';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) });

// ======================================================================
// 地址校验（含 checksum）
// ======================================================================
test('btc.validateAddress：合法 bech32 / bech32m / base58check；校验和错、格式错一律拒绝', () => {
  assert.deepEqual(Btc.validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), { valid: true, network: 'mainnet', type: 'p2wpkh' });
  assert.equal(Btc.validateAddress('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3').type, 'p2wsh');
  assert.equal(Btc.validateAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0').type, 'p2tr');
  assert.equal(Btc.validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').type, 'p2pkh');
  assert.equal(Btc.validateAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx').network, 'testnet');
  // 改一个字符 → 校验和失败
  assert.equal(Btc.validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5').valid, false);
  // base58 改一个字符 → 校验和失败
  assert.equal(Btc.validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN0').valid, false);
  // 格式 / 类型
  assert.equal(Btc.validateAddress('not-an-address').valid, false);
  assert.equal(Btc.validateAddress('').valid, false);
  assert.equal(Btc.validateAddress(null).valid, false);
  assert.equal(Btc.isMainnetAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), true);
  assert.equal(Btc.isMainnetAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'), false);
  // 生成器与校验器一致
  const a = Btc.encodeP2wpkh(Buffer.from('751e76e8199196d454941c45d1b3a323f1433bd6', 'hex'));
  assert.equal(Btc.validateAddress(a).type, 'p2wpkh');
});

// ======================================================================
// 交易级追踪（夹具回放）
// ======================================================================
test('btc.trace：交易级输入 / 输出、整数 satoshi、确认状态、去重；不声称输入→输出归属', async () => {
  const client = Btc.createClient({ fetchImpl: makeReplayFetch(FIX), minIntervalMs: 0, maxCalls: 200 });
  const r = await Btc.trace({ client, address: V, maxTxs: 25, now: () => new Date('2026-10-31T00:00:00.000Z') });
  assert.equal(r.meta.kind, 'utxo');
  assert.equal(r.meta.tip_height, 800100);
  assert.equal(r.meta.truncated, false);
  assert.equal(r.case.txs.length, 5);
  assert.equal(r.case.txs.filter(t => t.confirmed).length, 4);
  const unconfirmed = r.case.txs.filter(t => !t.confirmed);
  assert.equal(unconfirmed.length, 1);
  assert.equal(unconfirmed[0].block, null, '未确认交易没有区块高度');
  assert.equal(unconfirmed[0].ts, null, '未确认交易没有时间戳');
  // 交易级结构：只有 inputs / outputs，没有单一 from / to 的支付归属
  for (const t of r.case.txs) {
    assert.ok(Array.isArray(t.inputs) && Array.isArray(t.outputs));
    assert.equal('from' in t, false);
    assert.equal('to' in t, false);
    for (const x of t.inputs.concat(t.outputs)) assert.ok(Number.isInteger(x.value_sats), '金额必须是整数 satoshi');
    assert.ok(Number.isInteger(t.fee_sats));
  }
  // 去重
  assert.equal(new Set(r.case.txs.map(t => t.txid)).size, r.case.txs.length);
  // 说明里有「不推断归属 / 找零」的限制
  assert.ok(r.case.facts.some(f => f[0] === '金额口径' && /不推断哪个输入支付哪个输出/.test(f[1])));
  assert.ok(r.case.facts.some(f => f[0] === '确认状态'));
  // 地址节点：起点 + 对手方去重
  assert.equal(r.case.nodes[0].addr, V);
  assert.equal(new Set(r.case.nodes.map(n => n.addr)).size, r.case.nodes.length);
});

test('btc.trace：调用预算用完 → 明确截断并返回已有部分', async () => {
  const client = Btc.createClient({ fetchImpl: makeReplayFetch(FIX), minIntervalMs: 0, maxCalls: 2 });
  const r = await Btc.trace({ client, address: V, maxTxs: 25 });
  assert.equal(r.meta.truncated, true);
  assert.ok(r.meta.truncatedReasons.some(x => /预算/.test(x)));
  assert.ok(r.meta.warnings.some(w => /预算/.test(w)));
});

test('btc.trace：已确认交易按 25 条 / 页分页，第二页用上一页最后一个 txid', async () => {
  const mkTx = (n, subject, height, time) => ({
    txid: n.toString(16).padStart(64, '0'), version: 2, locktime: 0, size: 200, weight: 800, fee: 100,
    vin: [{ txid: '0'.repeat(64), vout: 0, prevout: { scriptpubkey_address: subject, value: 1000 } }],
    vout: [{ scriptpubkey_address: subject, value: 900 }],
    status: { confirmed: true, block_height: height, block_time: time }
  });
  const page1 = Array.from({ length: 25 }, (_, i) => mkTx(i + 1, V, 100 + i, 1700000000 + i));
  const page2 = [mkTx(26, V, 200, 1700001000), mkTx(27, V, 201, 1700002000)];
  const calls = [];
  const fetchImpl = async url => {
    const p = new URL(url).pathname;
    calls.push(p);
    if (p === '/api/address/' + V) return res(200, { chain_stats: {} });
    if (p === '/api/blocks/tip/height') return res(200, 900000);
    if (p === '/api/address/' + V + '/txs/mempool') return res(200, []);
    if (p === '/api/address/' + V + '/txs/chain') return res(200, page1);
    if (p.startsWith('/api/address/' + V + '/txs/chain/')) return res(200, page2);
    throw new Error('unexpected ' + p);
  };
  const client = Btc.createClient({ fetchImpl, minIntervalMs: 0, maxCalls: 200 });
  const r = await Btc.trace({ client, address: V, maxTxs: 30 });
  assert.equal(r.case.txs.length, 27);
  assert.ok(calls.some(p => p === '/api/address/' + V + '/txs/chain/' + page1[24].txid), '第二页应带上一页最后一个 txid');
  assert.equal(r.meta.truncated, false);
});

// ======================================================================
// CLI
// ======================================================================
const tmp = mkdtempSync(join(tmpdir(), 'suliu-btc-test-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('CLI btc --replay：退出码 0，写出 JSON 与 HTML，夹具数据明确标为演示', () => {
  const out = join(tmp, 'btc.json'), html = join(tmp, 'btc.html');
  const r = spawnSync(process.execPath, [CLI, V, '--replay', FIX, '--out', out, '--html', html, '--quiet'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.meta.demo, true);
  assert.equal(j.case.txs.length, 5);
  assert.ok(existsSync(html));
  const h = readFileSync(html, 'utf8');
  assert.ok(!/<script/i.test(h), '报告不能有 script');
  assert.ok(/演示数据（夹具回放）/.test(h), '演示数据要有明确标记');
  assert.ok(/不声称某个输入支付了某个输出/.test(h));
  assert.ok(h.includes('https://mempool.space/tx/'), 'BTC 链接用 mempool.space');
});

test('CLI btc：参数错误退出码 2；非法地址退出码 2', () => {
  assert.equal(spawnSync(process.execPath, [CLI, '--unknown'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'not-an-address'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'], { encoding: 'utf8' }).status, 2, '非主网地址拒绝');
});
