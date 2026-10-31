import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Tron from '../lib/tron.mjs';
import { makeReplayFetch } from '../tools/tron.mjs';

const require = createRequire(import.meta.url);
const ReportMulti = require('../lib/report-multi.js');
const Chains = require('../lib/chains.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CLI = join(ROOT, 'tools', 'tron.mjs');
const FIX = join(HERE, 'fixtures', 'tron-demo');
const GEN = '2026-10-31T00:00:00.000Z';

// 演示地址全部由「同一套 base58check 编码」计算，夹具与测试保持一致。
const SUBJECT = Tron.encodeAddressFromHex('11'.repeat(20));
const CPA = Tron.encodeAddressFromHex('22'.repeat(20));
const CPB = Tron.encodeAddressFromHex('33'.repeat(20));
const CPC = Tron.encodeAddressFromHex('44'.repeat(20));
const USDT = Tron.USDT_CONTRACT;
const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const TRON_TX = 'ab'.repeat(32);

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) });

// ======================================================================
// 按链配置：Tron 与 ETH / BSC 隔离，链接走 tronscan，未知链拒绝
// ======================================================================
test('chains（Tron）：配置隔离、tronscan 链接、未知链拒绝；ids() 不混入 account 链', () => {
  const tron = Chains.get('tron');
  assert.equal(tron.kind, 'account');
  assert.equal(tron.native.symbol, 'TRX');
  assert.equal(tron.native.decimals, 6);
  assert.ok(Object.prototype.hasOwnProperty.call(tron.tokens, USDT), 'Tron 白名单含官方 USDT');
  assert.ok(!Object.prototype.hasOwnProperty.call(Chains.get('eth').tokens, USDT), 'Tron USDT 不能出现在 ETH 白名单');
  assert.ok(!Object.prototype.hasOwnProperty.call(tron.tokens, '0xdac17f958d2ee523a2206206994597c13d831ec7'), 'ETH USDT 不能出现在 Tron 白名单');
  assert.equal(tron.official, false, 'Bitget 标签不套到 Tron');
  assert.equal(Chains.explorerUrl('tron', 'address', USDT), 'https://tronscan.org/#/address/' + USDT);
  assert.equal(Chains.explorerUrl('tron', 'tx', TRON_TX), 'https://tronscan.org/#/transaction/' + TRON_TX);
  assert.equal(Chains.explorerUrl('eth', 'address', USDT), null, 'Tron 地址不能生成 etherscan 链接');
  assert.equal(Chains.explorerUrl('tron', 'address', '0x' + '11'.repeat(20)), null);
  assert.equal(Chains.get('solana'), null, '未知链仍拒绝');
  assert.equal(Chains.isSupported('tron'), true);
  assert.ok(!Chains.ids().includes('tron'), 'ids() 只列 EVM/UTXO 工具链，account 链通过 get() 单独取用');
  assert.ok(Chains.ids().includes('btc'));
});

// ======================================================================
// 地址校验和（正确 / 篡改）
// ======================================================================
test('tron.validateAddress：主网 base58check 正确；篡改一位 / 格式错一律拒绝', () => {
  assert.equal(Tron.validateAddress(USDT).valid, true, '官方 USDT 合约地址合法');
  assert.equal(Tron.validateAddress(SUBJECT).valid, true);
  assert.deepEqual(Tron.validateAddress(SUBJECT), { valid: true, network: 'mainnet', type: 'account' });
  assert.equal(Tron.isMainnetAddress(SUBJECT), true);
  // 篡改最后一位 → 校验和失败
  const tampered = USDT.slice(0, 33) + (USDT[33] === 'Z' ? 'Y' : 'Z');
  assert.notEqual(tampered, USDT);
  assert.equal(Tron.validateAddress(tampered).valid, false, '篡改后的地址必须被拒绝');
  assert.match(Tron.validateAddress(tampered).reason, /校验和/);
  // 篡改中间一位
  const mid = USDT.slice(0, 20) + (USDT[20] === 'A' ? 'B' : 'A') + USDT.slice(21);
  assert.equal(Tron.validateAddress(mid).valid, false);
  // 格式 / 类型
  assert.equal(Tron.validateAddress('0x' + '11'.repeat(20)).valid, false);
  assert.equal(Tron.validateAddress(USDT.toLowerCase()).valid, false, '小写 T 开头不是合法 Tron 地址');
  assert.equal(Tron.validateAddress(USDT.slice(0, 33)).valid, false, '长度不对必须拒绝');
  assert.equal(Tron.validateAddress('').valid, false);
  assert.equal(Tron.validateAddress(null).valid, false);
  // hex → base58check 往返
  const rt = Tron.encodeAddressFromHex('41' + '11'.repeat(20));
  assert.equal(rt, SUBJECT);
  assert.equal(Tron.validateAddress(rt).valid, true);
  assert.equal(Tron.encodeAddressFromHex('zz'), null);
});

// ======================================================================
// 金额：整数最小单位 + 人类可读
// ======================================================================
test('tron.humanAmount / fmtMinUnits：整数最小单位与人类可读（6 位小数）', () => {
  assert.equal(Tron.humanAmount('308700000', 6), '308.7');
  assert.equal(Tron.humanAmount('1000000000', 6), '1000');
  assert.equal(Tron.humanAmount('1', 6), '0.000001');
  assert.equal(Tron.humanAmount('0', 6), '0');
  assert.equal(Tron.humanAmount('123', 0), '123');
  assert.equal(Tron.humanAmount('not-a-number', 6), '—');
  assert.equal(Tron.fmtMinUnits('5000000000'), '5,000,000,000');
  assert.equal(Tron.fmtMinUnits('—'), '—');
});

// ======================================================================
// 交易级追踪（夹具回放）：白名单过滤、去重、确认状态、不推断归属
// ======================================================================
test('tron.trace（夹具回放）：交易级 from/to、白名单按合约、非白名单只计数、不推断归属', async () => {
  const client = Tron.createClient({ fetchImpl: makeReplayFetch(FIX), minIntervalMs: 0, maxCalls: 200 });
  const r = await Tron.trace({ client, address: SUBJECT, maxTxs: 50, now: () => new Date(GEN) });
  assert.equal(r.meta.kind, 'account');
  assert.equal(r.meta.chain, 'tron');
  assert.equal(r.meta.balance_sun, '5000000000');
  assert.equal(r.meta.balance_trx, '5000');
  assert.equal(r.meta.truncated, false);
  assert.equal(r.case.txs.length, 3, '2 笔原生 TRX + 1 笔 USDT；伪造合约不展开');
  // 非白名单 TRC20（符号也叫 USDT，但合约不同）只计数、不展开
  assert.equal(r.meta.ignored.nonWhitelistTrc20, 1);
  assert.equal(r.meta.ignored.duplicate, 0);
  assert.ok(r.case.txs.every(t => t.asset === 'TRX' || t.asset === 'USDT'));
  // 原生 TRX：TriggerSmartContract 不应被当作原生转账（夹具里那笔必须被跳过）
  const trx = r.case.txs.filter(t => t.asset === 'TRX');
  assert.equal(trx.length, 2);
  // 排序：按时间升序；确认状态与时间、区块可见
  for (const t of r.case.txs) {
    assert.ok(Number.isInteger(Number(t.ts)), '时间戳应为整数秒');
    assert.equal(t.confirmed, true);
    assert.ok(t.block == null || Number.isInteger(Number(t.block)));
    assert.match(t.txid, /^[0-9a-f]{64}$/);
    assert.ok('from' in t && 'to' in t, '交易级明细要带 from / to');
  }
  assert.deepEqual(r.case.txs.map(t => t.ts), [1699999500, 1700000000, 1700000500]);
  // USDT：整数最小单位 + 人类可读 + 可冻结标记
  const usdt = r.case.txs.find(t => t.asset === 'USDT');
  assert.equal(usdt.amount_min, '308700000');
  assert.equal(usdt.amount_human, '308.7');
  assert.equal(usdt.freezable, true);
  assert.match(usdt.note, /可冻/);
  assert.equal(usdt.from, SUBJECT);
  assert.equal(usdt.to, CPC);
  // 原生 1000 TRX 转出 / 250 TRX 转入
  const out = r.case.txs.find(t => t.asset === 'TRX' && t.amount_min === '1000000000');
  assert.equal(out.from, SUBJECT);
  assert.equal(out.to, CPA);
  const inTx = r.case.txs.find(t => t.asset === 'TRX' && t.amount_min === '250000000');
  assert.equal(inTx.from, CPB);
  assert.equal(inTx.to, SUBJECT);
  // 地址节点：起点 + 对手方去重，不推断身份
  assert.equal(r.case.nodes[0].addr, SUBJECT);
  assert.equal(new Set(r.case.nodes.map(n => n.addr)).size, r.case.nodes.length);
  // 明确写清不推断归属；USDT 可冻结 ≠ 已冻结
  assert.ok(r.case.facts.some(f => f[0] === '金额口径' && /不推断地址归属/.test(f[1]) && /不推断资金归属/.test(f[1])));
  assert.ok(r.case.facts.some(f => f[0] === '确认状态'));
  assert.ok(r.case.banner.join(' ').includes('可冻结'));
});

// ======================================================================
// 分页：fingerprint 翻页 + 重叠记录去重
// ======================================================================
test('tron.trace：分页用 fingerprint，重叠记录去重', async () => {
  const mkTx = (id, from, to, amount, ts, block) => ({
    txID: id, blockNumber: block, block_timestamp: ts, ret: [{ contractRet: 'SUCCESS' }],
    raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { owner_address: '41' + from.repeat(20), to_address: '41' + to.repeat(20), amount } } }] }
  });
  const tx1 = mkTx('c1'.repeat(32), '11', '22', 100, 1700000000000, 100);
  const tx2 = mkTx('c2'.repeat(32), '11', '33', 200, 1700000100000, 101);
  const tx3 = mkTx('c3'.repeat(32), '11', '44', 300, 1700000200000, 102);
  const calls = [];
  const fetchImpl = async url => {
    const u = new URL(url); const k = u.pathname + u.search; calls.push(k);
    if (k.startsWith('/wallet/getaccount')) return res(200, { balance: 0 });
    if (k.includes('/transactions/trc20')) return res(200, { data: [], success: true, meta: {} });
    if (u.pathname.endsWith('/transactions')) {
      if (!u.searchParams.get('fingerprint')) return res(200, { data: [tx1, tx2], success: true, meta: { fingerprint: 'FP1' } });
      return res(200, { data: [tx2, tx3], success: true, meta: {} });
    }
    throw new Error('unexpected ' + k);
  };
  const client = Tron.createClient({ fetchImpl, minIntervalMs: 0, maxCalls: 200 });
  const r = await Tron.trace({ client, address: SUBJECT, maxTxs: 50 });
  assert.equal(r.case.txs.length, 3, '重叠的 tx2 只保留一次');
  assert.equal(r.meta.ignored.duplicate, 1);
  assert.ok(calls.some(k => k.includes('fingerprint=FP1')), '第二页应带上 fingerprint');
  assert.equal(r.meta.truncated, false);
});

// ======================================================================
// 预算截断
// ======================================================================
test('tron.trace：调用预算用完 → 明确截断并返回已有部分', async () => {
  const tx1 = {
    txID: 'd1'.repeat(32), blockNumber: 100, block_timestamp: 1700000000000, ret: [{ contractRet: 'SUCCESS' }],
    raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { owner_address: '41' + '11'.repeat(20), to_address: '41' + '22'.repeat(20), amount: 100 } } }] }
  };
  const fetchImpl = async url => {
    const u = new URL(url); const k = u.pathname + u.search;
    if (k.startsWith('/wallet/getaccount')) return res(200, { balance: 0 });
    if (k.includes('/transactions/trc20')) return res(200, { data: [], success: true, meta: {} });
    return res(200, { data: [tx1], success: true, meta: { fingerprint: 'FPX' } });
  };
  const client = Tron.createClient({ fetchImpl, minIntervalMs: 0, maxCalls: 2 });
  const r = await Tron.trace({ client, address: SUBJECT, maxTxs: 50 });
  assert.equal(r.meta.truncated, true);
  assert.ok(r.meta.truncatedReasons.some(x => /预算/.test(x)));
  assert.equal(r.case.txs.length, 1, '预算内已抓到的部分要保留');
});

// ======================================================================
// 单页超过 --max-txs 且没有下一页：截断到上限并明确标注
// ======================================================================
test('tron.trace：单页记录数超过 --max-txs 且没有下一页 → 截断到上限并标注', async () => {
  const mkTx = n => ({
    txID: String(n).padStart(64, '0'), blockNumber: 100 + n, block_timestamp: 1700000000000 + n * 1000, ret: [{ contractRet: 'SUCCESS' }],
    raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { owner_address: '41' + '11'.repeat(20), to_address: '41' + '22'.repeat(20), amount: 1000 + n } } }] }
  });
  const page = Array.from({ length: 8 }, (_, i) => mkTx(i + 1));
  const fetchImpl = async url => {
    const u = new URL(url); const k = u.pathname + u.search;
    if (k.startsWith('/wallet/getaccount')) return res(200, { balance: 0 });
    if (k.includes('/transactions/trc20')) return res(200, { data: [], success: true, meta: {} });
    return res(200, { data: page, success: true, meta: {} }); // 没有 fingerprint = 没有下一页
  };
  const client = Tron.createClient({ fetchImpl, minIntervalMs: 0, maxCalls: 200 });
  const r = await Tron.trace({ client, address: SUBJECT, maxTxs: 3 });
  assert.equal(r.case.txs.length, 3, '只保留最早的 3 笔');
  assert.equal(r.meta.truncated, true);
  assert.ok(r.meta.truncatedReasons.some(x => /上限/.test(x)));
});

// ======================================================================
// 规范化纯函数：只取 TransferContract / 非白名单标记
// ======================================================================
test('tron.normalizeNative / normalizeTrc20：只认 TransferContract 与官方 USDT 合约', () => {
  const nativeTx = {
    txID: 'e1'.repeat(32), blockNumber: 7, block_timestamp: 1700000000000, ret: [{ contractRet: 'SUCCESS' }],
    raw_data: { contract: [
      { type: 'TriggerSmartContract', parameter: { value: { owner_address: '41' + '11'.repeat(20) } } },
      { type: 'TransferContract', parameter: { value: { owner_address: '41' + '11'.repeat(20), to_address: '41' + '22'.repeat(20), amount: 5000000 } } }
    ] }
  };
  const recs = Tron.normalizeNative(nativeTx);
  assert.equal(recs.length, 1, '只展开 TransferContract');
  assert.equal(recs[0].asset, 'TRX');
  assert.equal(recs[0].amount_min, '5000000');
  assert.equal(recs[0].whitelisted, true);
  // 未确认（无 block_timestamp）→ confirmed=false，时间为 null
  const unconf = Tron.normalizeNative({ txID: 'e2'.repeat(32), raw_data: nativeTx.raw_data, ret: [{ contractRet: 'SUCCESS' }] })[0];
  assert.equal(unconf.confirmed, false);
  assert.equal(unconf.ts, null);
  // TRC20：官方合约白名单；伪造合约（符号也叫 USDT）标记为非白名单
  const real = Tron.normalizeTrc20({ transaction_id: 'f1'.repeat(32), token_info: { symbol: 'USDT', address: USDT, decimals: 6 }, block_timestamp: 1700000000000, from: SUBJECT, to: CPC, value: '1000000' });
  assert.equal(real.whitelisted, true);
  assert.equal(real.freezable, true);
  assert.match(real.note, /可冻/);
  const fake = Tron.normalizeTrc20({ transaction_id: 'f2'.repeat(32), token_info: { symbol: 'USDT', address: CPA, decimals: 6 }, block_timestamp: 1700000000000, from: SUBJECT, to: CPC, value: '1000000' });
  assert.equal(fake.whitelisted, false, '真假只按合约地址判断，符号不可信');
  assert.equal(fake.freezable, false);
});

// ======================================================================
// API key：有 key 时加 TRON-PRO-API-KEY 请求头，没有时不加
// ======================================================================
test('tron.createClient：--key / TRON_API_KEY 走 TRON-PRO-API-KEY 请求头', async () => {
  let seen = null;
  const fetchImpl = async (url, init) => { seen = init && init.headers ? init.headers : {}; return res(200, { balance: 0 }); };
  const withKey = Tron.createClient({ fetchImpl, key: 'SECRET-KEY-123', minIntervalMs: 0, maxCalls: 10 });
  await withKey.getAccount(SUBJECT);
  assert.equal(seen['TRON-PRO-API-KEY'], 'SECRET-KEY-123');
  const noKey = Tron.createClient({ fetchImpl, minIntervalMs: 0, maxCalls: 10 });
  await noKey.getAccount(SUBJECT);
  assert.equal(seen['TRON-PRO-API-KEY'], undefined);
});

// ======================================================================
// 报告：转义、tronscan 链接、不出现 etherscan / bscscan / mempool
// ======================================================================
test('report-multi（Tron）：全转义、无 script，tronscan 链接，不出现 etherscan 链接', () => {
  const caseObj = {
    id: 'tron-test', chain: 'tron', focus: SUBJECT, title: EVIL,
    facts: [['数据来源', EVIL], ['金额口径', '整数最小单位（TRX / USDT 均 6 位小数）']],
    nodes: [{ id: 'n0', addr: SUBJECT, type: 'relay', label: EVIL, note: EVIL }],
    txs: [{
      i: 0, asset: 'USDT', symbol: 'USDT', contract: USDT, decimals: 6, freezable: true,
      amount_min: '308700000', amount_human: '308.7', confirmed: true, block: null, ts: 1700000500,
      from: SUBJECT, to: CPC, txid: TRON_TX, note: '可冻结稳定币（可冻≠已冻）'
    }]
  };
  const meta = { kind: 'account', start: SUBJECT, truncated: false, ignored: { nonWhitelistTrc20: 1, zeroValue: 0, belowMinValue: 0, duplicate: 0 }, warnings: [], calls: 3, maxCalls: 200, balance_trx: '5000' };
  const html = ReportMulti.build({ kind: 'account', case: caseObj, meta, generatedAt: GEN });
  assert.ok(!/<script/i.test(html), '不能有 script');
  assert.ok(!html.includes('<img'), '恶意 img 不能原样出现');
  assert.ok(html.includes(ReportMulti.esc(EVIL)), '恶意字符串应以转义形式出现');
  // tronscan 链接（地址 + 交易）
  assert.ok(html.includes('https://tronscan.org/#/address/' + SUBJECT));
  assert.ok(html.includes('https://tronscan.org/#/transaction/' + TRON_TX));
  // 不得混入其它链的浏览器
  assert.ok(!html.includes('etherscan.io'), 'Tron 报告不能出现 etherscan 链接');
  assert.ok(!html.includes('bscscan.com'));
  assert.ok(!html.includes('mempool.space'));
  // 冻结标记沿用「可冻结 ≠ 已冻结」，不断言实际冻结状态
  assert.ok(html.includes('可冻结稳定币'));
  assert.ok(html.includes('可冻≠已冻'));
  assert.ok(!/已冻结\s*[（(]?\s*是/.test(html));
  // 明确不推断归属
  assert.ok(html.includes('不推断地址身份归属'));
  assert.ok(html.includes('不推断资金归属'));
  // 整数最小单位 + 人类可读都在
  assert.ok(html.includes('308,700,000') || html.includes('308700000'));
  assert.ok(html.includes('308.7'));
  // 不传 kind 时也能按 case.chain === 'tron' 自动识别
  const auto = ReportMulti.build({ case: caseObj, meta, generatedAt: GEN });
  assert.ok(auto.includes('https://tronscan.org/#/transaction/' + TRON_TX));
});

test('report-multi（Tron）：夹具回放带「演示数据（夹具回放）」横幅；截断可见', () => {
  const html = ReportMulti.build({ kind: 'account', case: { chain: 'tron', focus: SUBJECT }, meta: { kind: 'account', demo: true, demo_note: '合成的演示数据', truncated: true, truncatedReasons: ['达到上限'], ignored: {}, warnings: [] }, generatedAt: GEN });
  assert.ok(html.includes('演示数据（夹具回放）'));
  assert.ok(html.includes('结果被截断'));
});

// ======================================================================
// CLI
// ======================================================================
const tmp = mkdtempSync(join(tmpdir(), 'suliu-tron-test-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('CLI tron --replay：退出码 0，写出 JSON 与 HTML，夹具数据明确标为演示', () => {
  const out = join(tmp, 'tron.json'), html = join(tmp, 'tron.html');
  const r = spawnSync(process.execPath, [CLI, SUBJECT, '--replay', FIX, '--out', out, '--html', html, '--quiet'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.meta.demo, true);
  assert.equal(j.case.txs.length, 3);
  assert.equal(j.meta.kind, 'account');
  assert.ok(existsSync(html));
  const h = readFileSync(html, 'utf8');
  assert.ok(!/<script/i.test(h), '报告不能有 script');
  assert.ok(/演示数据（夹具回放）/.test(h), '演示数据要有明确标记');
  assert.ok(h.includes('https://tronscan.org/#/transaction/'), 'Tron 链接用 tronscan');
  assert.ok(!h.includes('etherscan.io'), 'Tron 报告不能出现 etherscan 链接');
  assert.ok(h.includes('可冻≠已冻'));
});

test('CLI tron：参数错误 / 非法地址退出码 2；预算截断退出码 3', () => {
  assert.equal(spawnSync(process.execPath, [CLI, '--unknown'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'not-an-address'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, USDT.slice(0, 33) + 'Z'], { encoding: 'utf8' }).status, 2, '篡改地址必须退出码 2');
  const out3 = join(tmp, 'tron-truncated.json');
  const r3 = spawnSync(process.execPath, [CLI, SUBJECT, '--replay', FIX, '--max-calls', '1', '--out', out3, '--quiet'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r3.status, 3, r3.stderr);
  const j3 = JSON.parse(readFileSync(out3, 'utf8'));
  assert.equal(j3.meta.truncated, true);
  assert.ok(j3.meta.truncatedReasons.some(x => /预算/.test(x)));
  // 运行出错（夹具目录不存在）→ 退出码 1
  assert.equal(spawnSync(process.execPath, [CLI, SUBJECT, '--replay', join(tmp, 'no-such-dir'), '--out', join(tmp, 'x.json'), '--quiet'], { encoding: 'utf8' }).status, 1);
});
