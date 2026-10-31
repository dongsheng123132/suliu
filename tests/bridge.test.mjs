import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAcross, resolveBridge, normalizeStatus, chainflipUnsupported } from '../lib/bridge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CLI = join(ROOT, 'tools', 'resolve-bridge.mjs');
const FIX = join(HERE, 'fixtures', 'across-demo');

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) });
const SRC = '0x' + '4d'.repeat(32);
const TGT = '0x' + 'da'.repeat(32);
const REFUND = '0x' + 'ee'.repeat(32);
const DEPOSITOR = '0x' + '11'.repeat(20);
const RECIPIENT = '0x' + '22'.repeat(20);
const SEL = 'depositId=D1&originChainId=1';
const statusKey = '/api/deposit/status?' + SEL;
const detailKey = '/api/deposit?' + SEL;

function mock(map) {
  return async url => {
    const u = new URL(url);
    const key = u.pathname + u.search;
    if (!map[key]) throw new Error('unexpected request: ' + key);
    return res(map[key][0], map[key][1]);
  };
}

test('bridge.normalizeStatus：filled / pending / refunded / expired / not_found / unknown 分开，不混淆', () => {
  assert.equal(normalizeStatus('filled'), 'filled');
  assert.equal(normalizeStatus('FILLED'), 'filled');
  assert.equal(normalizeStatus('pending'), 'pending');
  assert.equal(normalizeStatus('unfilled'), 'pending');
  assert.equal(normalizeStatus('refunded'), 'refunded');
  assert.equal(normalizeStatus('expired'), 'expired');
  assert.equal(normalizeStatus('not_found'), 'not_found');
  assert.equal(normalizeStatus('weird-status'), 'unknown');
  assert.equal(normalizeStatus(null), 'unknown');
  assert.notEqual(normalizeStatus('refunded'), 'filled');
});

test('bridge.resolveAcross：filled → 源交易 / 目标交易 / 目标地址 / raw / source / retrieved_at 都保留', async () => {
  const map = {
    [statusKey]: [200, { status: 'filled', originChainId: 1, depositId: 'D1', depositTxHash: SRC, fillTx: TGT, destinationChainId: 8453, depositRefundTxHash: null }],
    [detailKey]: [200, { deposit: { depositor: DEPOSITOR, recipient: RECIPIENT, inputToken: '0x' + '33'.repeat(20), inputAmount: '200000000', outputToken: '0x' + '44'.repeat(20), outputAmount: '199000000', status: 'filled', originChainId: 1, destinationChainId: 8453, depositId: 'D1', depositTxHash: SRC, fillTx: TGT } }]
  };
  const r = await resolveAcross({ originChainId: 1, depositId: 'D1', fetchImpl: mock(map), base: 'https://across.to/api' });
  assert.equal(r.protocol, 'across');
  assert.equal(r.supported, true);
  assert.equal(r.status, 'filled');
  assert.equal(r.status_raw, 'filled');
  assert.equal(r.sourceTx, SRC);
  assert.equal(r.targetTx, TGT);
  assert.equal(r.depositor, DEPOSITOR);
  assert.equal(r.recipient, RECIPIENT);
  assert.equal(r.destinationChainId, 8453);
  assert.ok(r.source.includes('/deposit/status?'));
  assert.ok(r.detail_source.includes('/deposit?'));
  assert.ok(!Number.isNaN(Date.parse(r.retrieved_at)), 'retrieved_at 是 ISO 时间');
  assert.ok(r.raw.status && r.raw.detail, '保留两次原始响应');
  assert.deepEqual(r.warnings, []);
});

test('bridge.resolveAcross：refunded 明确是退款，不当成 filled；退款交易单独保留', async () => {
  const map = {
    [statusKey]: [200, { status: 'refunded', originChainId: 1, depositId: 'D1', depositTxHash: SRC, fillTx: null, destinationChainId: 8453, depositRefundTxHash: REFUND }],
    [detailKey]: [200, { deposit: { status: 'refunded', originChainId: 1, destinationChainId: 8453, depositId: 'D1', depositTxHash: SRC, fillTx: null, depositRefundTxHash: REFUND, depositor: DEPOSITOR } }]
  };
  const r = await resolveAcross({ originChainId: 1, depositId: 'D1', fetchImpl: mock(map) });
  assert.equal(r.status, 'refunded');
  assert.equal(r.refundTx, REFUND);
  assert.equal(r.targetTx, null);
  assert.notEqual(r.status, 'filled');
});

test('bridge.resolveAcross：pending 与 not_found 都不当作 filled', async () => {
  const pend = {
    [statusKey]: [200, { status: 'pending', originChainId: 1, depositId: 'D1', depositTxHash: SRC, destinationChainId: 8453 }],
    [detailKey]: [200, { deposit: { status: 'pending', originChainId: 1, destinationChainId: 8453, depositId: 'D1' } }]
  };
  assert.equal((await resolveAcross({ originChainId: 1, depositId: 'D1', fetchImpl: mock(pend) })).status, 'pending');
  const nf = { [statusKey]: [404, { error: 'DepositNotFoundException' }], [detailKey]: [404, { error: 'DepositNotFoundException' }] };
  const r = await resolveAcross({ originChainId: 1, depositId: 'D1', fetchImpl: mock(nf) });
  assert.equal(r.status, 'not_found');
  assert.ok(r.warnings.some(w => /not_found/.test(w)));
});

test('bridge.resolveAcross：鉴权失败明确报 AUTH；参数不合法报 QUERY', async () => {
  const auth = { [statusKey]: [401, {}], [detailKey]: [401, {}] };
  await assert.rejects(resolveAcross({ originChainId: 1, depositId: 'D1', fetchImpl: mock(auth) }), e => e.code === 'AUTH' && /Across API key/.test(e.message));
  await assert.rejects(resolveAcross({ depositId: 'D1', fetchImpl: mock({}) }), e => e.code === 'QUERY');
});

test('bridge.chainflip：明确 unsupported，只给人工链接，不假装已自动解析', async () => {
  const r = await chainflipUnsupported({ depositTxnRef: SRC });
  assert.equal(r.protocol, 'chainflip');
  assert.equal(r.supported, false);
  assert.equal(r.status, 'unsupported');
  assert.equal(r.manual.explorer, 'https://explorer.chainflip.io/');
  assert.ok(r.warnings.some(w => /unsupported/.test(w)));
  const r2 = await resolveBridge({ protocol: 'chainflip' });
  assert.equal(r2.supported, false);
  await assert.rejects(async () => resolveBridge({ protocol: 'wormhole' }), e => e.code === 'PROTOCOL');
});

// ======================================================================
// CLI
// ======================================================================
const tmp = mkdtempSync(join(tmpdir(), 'suliu-bridge-test-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('CLI resolve-bridge --replay（Across）：退出码 0，JSON 与 HTML 写出，夹具标为演示', () => {
  const out = join(tmp, 'bridge.json'), html = join(tmp, 'bridge.html');
  const r = spawnSync(process.execPath, [CLI, '--protocol', 'across', '--origin-chain-id', '1', '--deposit-id', 'demo-7654321', '--replay', FIX, '--out', out, '--html', html, '--quiet'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.status, 'filled');
  assert.equal(j.demo, true);
  assert.ok(j.raw.status && j.raw.detail);
  assert.ok(existsSync(html));
  const h = readFileSync(html, 'utf8');
  assert.ok(/已完成（filled）/.test(h));
  assert.ok(h.includes('https://basescan.org/tx/'), '目标链 8453 用 basescan 链接');
  assert.ok(!/<script/i.test(h));
});

test('CLI resolve-bridge（Chainflip）：退出码 0，明确 unsupported', () => {
  const out = join(tmp, 'chainflip.json');
  const r = spawnSync(process.execPath, [CLI, '--protocol', 'chainflip', '--deposit-txn-ref', SRC, '--out', out, '--quiet'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.supported, false);
  assert.equal(j.status, 'unsupported');
});

test('CLI resolve-bridge：参数错误退出码 2（Across 缺查询条件 / 未知协议）', () => {
  assert.equal(spawnSync(process.execPath, [CLI, '--protocol', 'across'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, '--protocol', 'wormhole'], { encoding: 'utf8' }).status, 2);
});
