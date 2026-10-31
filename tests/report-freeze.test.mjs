// 可冻结点渲染测试：稳定币流水必须在报告里标出来，且必须写明「可冻结 ≠ 已冻结」。
// 币安案的核心价值就是抢冻结窗口，标错这一句会误导用户。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');

const GEN = '2026-10-31T00:00:00.000Z';
const VICTIM = '0x' + 'aa'.repeat(20);
const RECEIVER = '0x' + 'bb'.repeat(20);
const TX1 = '0x' + '01'.repeat(32);
const TX2 = '0x' + '02'.repeat(32);

function makeCase() {
  return {
    id: 'freeze-test', chain: 'eth', focus: VICTIM, title: '可冻结点测试',
    facts: [['数据来源', 'Etherscan API V2（chainid 1）']],
    nodes: [
      { id: 'n0', type: 'victim', label: '受害钱包', addr: VICTIM },
      { id: 'n1', type: 'attacker', label: '接收方', addr: RECEIVER }
    ],
    txs: [
      { from: 'n0', to: 'n1', t: 100, ts: 1793305000, amt: '1,000 USDT', hash: TX1, flags: ['freeze'] },
      { from: 'n0', to: 'n1', t: 101, ts: 1793305100, amt: '12 ETH', hash: TX2, flags: [] }
    ]
  };
}

test('稳定币流水：出现可冻结点摘要，且明确「可冻结 ≠ 已冻结」', () => {
  const html = ReportMulti.build({ case: makeCase(), meta: { start: VICTIM, truncated: false }, generatedAt: GEN });
  assert.match(html, /可冻结稳定币流水/);
  assert.match(html, /可冻结 ≠ 已冻结/, '必须写明可冻结不等于已冻结');
  assert.match(html, /共 1 笔/, '只统计带 freeze 标记的那一笔');
  assert.doesNotMatch(html, /已冻结资/);
});

test('逐笔标记：USDT 那行有标记，ETH 那行没有', () => {
  const html = ReportMulti.build({ case: makeCase(), meta: { start: VICTIM, truncated: false }, generatedAt: GEN });
  const usdtRow = html.split('<tr>').find(r => r.includes('1,000 USDT'));
  const ethRow = html.split('<tr>').find(r => r.includes('12 ETH'));
  assert.ok(usdtRow && usdtRow.includes('可冻结稳定币'), 'USDT 行应带可冻结标记');
  assert.ok(ethRow && !ethRow.includes('可冻结稳定币'), 'ETH 行不应带可冻结标记');
});

test('局限声明：明确工具不查询也不保证实际冻结状态', () => {
  const html = ReportMulti.build({ case: makeCase(), meta: { start: VICTIM, truncated: false }, generatedAt: GEN });
  assert.match(html, /不查询、也不保证任何实际冻结状态/);
});
