// 免 key 数据源相关测试：createClient({ rpcBase }) 的 JSON-RPC 取代码通路，以及空 key 时的脱敏。
// 全程不联网：fetch 全部用假实现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Trace = require('../lib/trace-eth.js');
const cli = await import('../tools/trace.mjs');

const noSleep = async () => {};

function makeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    const rec = { url: String(url), init: init || {} };
    calls.push(rec);
    const body = await handler(rec);
    return { ok: true, status: 200, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test('rpcBase：eth_getCode 走 JSON-RPC POST，而不是 Etherscan GET', async () => {
  const fetchImpl = makeFetch(rec => {
    assert.equal(rec.init.method, 'POST', '必须是 POST');
    const sent = JSON.parse(rec.init.body);
    assert.equal(sent.jsonrpc, '2.0');
    assert.equal(sent.method, 'eth_getCode');
    assert.deepEqual(sent.params, ['0xabc', 'latest']);
    return { jsonrpc: '2.0', id: sent.id, result: '0xef0100' + '11'.repeat(20) };
  });
  const client = Trace.createClient({
    key: '', fetchImpl, rpcBase: 'https://rpc.example', maxCalls: 5, minIntervalMs: 0, backoffMs: 0, sleepImpl: noSleep
  });
  const code = await client.getcode('0xabc');
  assert.equal(code, '0xef0100' + '11'.repeat(20));
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, 'https://rpc.example');
  assert.equal(client.calls, 1, 'RPC 调用同样计入预算');
  assert.ok(Trace.isEip7702Code(code), 'EIP-7702 委托代码应被识别');
});

test('不传 rpcBase：eth_getCode 仍走原来的 Etherscan proxy GET（默认行为不变）', async () => {
  const fetchImpl = makeFetch(rec => {
    assert.equal(rec.init.method, undefined, '默认仍是 GET');
    assert.match(rec.url, /module=proxy/, '应带 module=proxy');
    assert.match(rec.url, /action=eth_getCode/);
    return { status: '1', message: 'OK', result: '0x' };
  });
  const client = Trace.createClient({ key: 'K', fetchImpl, maxCalls: 5, minIntervalMs: 0, sleepImpl: noSleep });
  assert.equal(await client.getcode('0xabc'), '0x');
  assert.match(fetchImpl.calls[0].url, /apikey=K/);
});

test('rpcBase：预算用完抛 BUDGET，不会超发请求', async () => {
  const fetchImpl = makeFetch(rec => ({ jsonrpc: '2.0', id: 1, result: '0x' }));
  const client = Trace.createClient({ key: '', fetchImpl, rpcBase: 'https://rpc.example', maxCalls: 1, minIntervalMs: 0, sleepImpl: noSleep });
  await client.getcode('0xabc');
  await assert.rejects(() => client.getcode('0xdef'), e => e.code === 'BUDGET');
  assert.equal(fetchImpl.calls.length, 1);
});

test('rpcBase：JSON-RPC 报错与 HTTP 失败分别归类，且不泄露 key', async () => {
  const failRpc = Trace.createClient({
    key: 'SUPER-SECRET', rpcBase: 'https://rpc.example', maxCalls: 3, minIntervalMs: 0,
    fetchImpl: makeFetch(() => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } })), sleepImpl: noSleep
  });
  await assert.rejects(() => failRpc.getcode('0xabc'), e => {
    assert.equal(e.code, 'API');
    assert.ok(!String(e.message).includes('SUPER-SECRET'), '错误信息里不能出现 key');
    return true;
  });

  const http500 = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const c2 = Trace.createClient({ key: '', rpcBase: 'https://rpc.example', maxCalls: 2, retries: 1, backoffMs: 0, minIntervalMs: 0, fetchImpl: http500, sleepImpl: noSleep });
  await assert.rejects(() => c2.getcode('0xabc'), e => e.code === 'RATE_LIMIT');
});

test('空 key 时 scrubKey 不逐字符插 ***（这会让报错信息变成乱码）', () => {
  assert.equal(cli.scrubKey('Etherscan 请求失败', ''), 'Etherscan 请求失败');
  assert.equal(cli.scrubKey('bad key abc123', 'abc123'), 'bad key ***');
  assert.equal(cli.scrubKey('no key here', null), 'no key here');
});

test('--base / --rpc 进入参数解析，且未知选项仍报错', () => {
  const o = cli.parseArgs(['0x' + '1'.repeat(40), '--base', 'https://eth.blockscout.com/api', '--rpc', 'https://ethereum.publicnode.com']);
  assert.equal(o.base, 'https://eth.blockscout.com/api');
  assert.equal(o.rpc, 'https://ethereum.publicnode.com');
  assert.equal(o.chain, 'eth', '默认链仍是 eth');
  assert.throws(() => cli.parseArgs(['0x' + '1'.repeat(40), '--nope']), cli.UsageError);
});
