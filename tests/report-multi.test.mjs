import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');

const GEN = '2026-10-31T00:00:00.000Z';
const BTC_ADDR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const BTC_TX = 'ab'.repeat(32);
const EVM_ADDR = '0x' + '11'.repeat(20);
const EVM_ADDR2 = '0x' + '22'.repeat(20);
const EVM_TX = '0x' + 'ab'.repeat(32);
const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)>';

test('report-multi.esc：外部字符串全部转义', () => {
  assert.equal(ReportMulti.esc('<a>"&\''), '&lt;a&gt;&quot;&amp;&#39;');
  assert.equal(ReportMulti.esc(null), '');
  assert.equal(ReportMulti.esc(undefined), '');
});

test('report-multi（BTC）：无 script / 事件属性；含不推断归属与找零的声明；BTC 链接用 mempool.space', () => {
  const caseObj = {
    id: 'btc-test', chain: 'btc', focus: BTC_ADDR, title: EVIL,
    facts: [['数据来源', EVIL], ['金额口径', '整数 satoshi']],
    nodes: [{ id: 'n0', addr: BTC_ADDR, type: 'relay', label: EVIL, note: EVIL }],
    txs: [{ i: 0, txid: BTC_TX, confirmed: true, block: 800000, ts: 1700000000, fee_sats: 100, inputs: [{ addr: BTC_ADDR, value_sats: 1000 }], outputs: [{ addr: BTC_ADDR, value_sats: 900 }] }]
  };
  const meta = { kind: 'utxo', truncated: false, ignored: {}, warnings: [], calls: 1, maxCalls: 10, tip_height: 800100 };
  const html = ReportMulti.build({ kind: 'utxo', case: caseObj, meta, generatedAt: GEN });
  assert.ok(!/<script/i.test(html), '不能有 script');
  assert.ok(!html.includes('<img'), '恶意 img 不能原样出现');
  assert.ok(html.includes(ReportMulti.esc(EVIL)), '恶意字符串应以转义形式出现');
  assert.ok(html.includes('不声称某个输入支付了某个输出'));
  assert.ok(html.includes('不推断找零归属'));
  assert.ok(html.includes('https://mempool.space/tx/' + BTC_TX));
  assert.ok(html.includes('https://mempool.space/address/' + BTC_ADDR));
  assert.ok(html.includes('整数 satoshi'));
});

test('report-multi（BTC）：夹具回放带「演示数据」横幅；截断可见', () => {
  const caseObj = { id: 'btc-demo', chain: 'btc', focus: BTC_ADDR, facts: [], nodes: [], txs: [] };
  const html = ReportMulti.build({ kind: 'utxo', case: caseObj, meta: { kind: 'utxo', demo: true, demo_note: '合成的演示数据', truncated: true, truncatedReasons: ['达到上限'], ignored: {}, warnings: [] }, generatedAt: GEN });
  assert.ok(html.includes('演示数据（夹具回放）'));
  assert.ok(html.includes('结果被截断'));
});

test('report-multi（跨链）：filled 状态、源 / 目标交易按链生成链接、raw 保留、退款口径说明', () => {
  const result = {
    protocol: 'across', supported: true, status: 'filled', status_raw: 'filled',
    originChainId: 1, destinationChainId: 8453, depositId: 'D1',
    sourceTx: EVM_TX, targetTx: EVM_TX, refundTx: null,
    depositor: EVM_ADDR, recipient: EVM_ADDR2,
    inputToken: null, inputAmount: '200000000', outputToken: null, outputAmount: '199000000',
    source: 'https://across.to/api/deposit/status?depositId=D1&originChainId=1',
    detail_source: 'https://across.to/api/deposit?depositId=D1&originChainId=1',
    retrieved_at: GEN, raw: { status: { status: 'filled' }, detail: { deposit: { status: 'filled' } } }, warnings: []
  };
  const html = ReportMulti.build({ kind: 'bridge', result, generatedAt: GEN });
  assert.ok(html.includes('已完成（filled）'));
  assert.ok(html.includes('https://etherscan.io/tx/' + EVM_TX), '源链 1 用 etherscan');
  assert.ok(html.includes('https://basescan.org/tx/' + EVM_TX), '目标链 8453 用 basescan');
  assert.ok(html.includes('退款不当作完成'));
  assert.ok(html.includes('原始响应'));
  assert.ok(!/<script/i.test(html));
});

test('report-multi（跨链）：pending / refunded / unsupported 状态不混淆', () => {
  const base = { protocol: 'across', supported: true, originChainId: 1, destinationChainId: 8453, depositId: 'D1', sourceTx: EVM_TX, targetTx: null, refundTx: null, depositor: null, recipient: null, inputToken: null, inputAmount: null, outputToken: null, outputAmount: null, source: 'x', detail_source: null, retrieved_at: GEN, raw: null, warnings: [] };
  assert.ok(ReportMulti.build({ kind: 'bridge', result: Object.assign({}, base, { status: 'pending' }), generatedAt: GEN }).includes('处理中（pending）'));
  assert.ok(ReportMulti.build({ kind: 'bridge', result: Object.assign({}, base, { status: 'refunded', refundTx: EVM_TX }), generatedAt: GEN }).includes('已退款（refunded）'));
  const cf = Object.assign({}, base, { protocol: 'chainflip', supported: false, status: 'unsupported', manual: { explorer: 'https://explorer.chainflip.io/', note: '人工核对' } });
  const h = ReportMulti.build({ kind: 'bridge', result: cf, generatedAt: GEN });
  assert.ok(h.includes('未支持（unsupported）'));
  assert.ok(h.includes('本协议未自动解析'));
});

test('report-multi（通用 EVM，BSC）：链接用 bscscan，不混用 etherscan', () => {
  const caseObj = {
    id: 'trace-bsc', chain: 'bsc', chainName: 'BNB Smart Chain', focus: 'n0', title: 'BSC 追踪',
    facts: [['数据来源', 'Etherscan API V2（chainid 56）']],
    nodes: [{ id: 'n0', addr: EVM_ADDR, type: 'relay', label: 'S' }, { id: 'n1', addr: EVM_ADDR2, type: 'relay', label: 'A' }],
    txs: [{ from: 'n0', to: 'n1', t: 100, amt: '1 BNB', hash: EVM_TX }]
  };
  const html = ReportMulti.build({ kind: 'trace', case: caseObj, meta: { start: EVM_ADDR, chainid: 56 }, generatedAt: GEN });
  assert.ok(html.includes('https://bscscan.com/address/' + EVM_ADDR));
  assert.ok(html.includes('https://bscscan.com/tx/' + EVM_TX));
  assert.ok(!html.includes('etherscan.io'), 'BSC 报告不能用 etherscan 链接');
});

test('report-multi.reportId：同样的输入得到同样的编号', () => {
  assert.equal(ReportMulti.reportId('a', GEN), ReportMulti.reportId('a', GEN));
  assert.notEqual(ReportMulti.reportId('a', GEN), ReportMulti.reportId('b', GEN));
});
