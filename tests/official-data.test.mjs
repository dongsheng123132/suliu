// lib/official-data.js 的测试：夹具全部取自官方真实快照，期望值来自已知事实，不为过测试改期望
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const O = require('../lib/official-data.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = path.join(ROOT, 'snapshot');

// 夹具加载：只读项目内 snapshot/<时间戳>/api_<name>.json，缺了直接失败，不回退到别处
const CUR_DIR = path.join(SNAP, '20260930-145900');
const OLD_DIR = path.join(SNAP, '20260930-125500');
function loadJson(name, dir) {
  const p = path.join(dir, `api_${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`夹具缺失：${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const cur = {}, old = {};
for (const n of ['holdings', 'victims', 'reviewed', 'chains', 'maintenance', 'holdings_corrections']) cur[n] = loadJson(n, CUR_DIR);
old.holdings = loadJson('holdings', OLD_DIR);

const mkSnap = (o = {}) => ({
  schema: 'suliu.official-snapshot/v1', source: O.BASE, fetched_at: '2026-09-30T14:59:00+08:00', snap_ts: null, label: 't',
  maintenance: cur.maintenance, holdings: cur.holdings, victims: cur.victims, reviewed: cur.reviewed, chains: cur.chains,
  corrections: cur.holdings_corrections, history: [], ...o
});
const snap = mkSnap();
const idx = O.buildIndex(snap);
const allAddrs = m => Object.values(m).flat();
const chainsOf = m => Object.keys(m);
// 库里以链 / category 为键的对象是无原型对象（P11）；断言时先转成普通对象，其余比较保持 strict deepEqual
const P = o => ({ ...o });

// ---------- a) normAddr / addrKind ----------
test('a) normAddr：EVM 混合大小写 → 小写，两端空白被裁掉', () => {
  const low = '0x770b10b273fc44fe9197d6bf20f145c2e98463ee';
  assert.equal(O.normAddr('0x770B10B273FC44FE9197D6BF20F145C2E98463EE'), low);
  assert.equal(O.normAddr('0X770B10B273FC44FE9197D6BF20F145C2E98463EE'), low);
  assert.equal(O.normAddr('  0x770B10b273fc44fe9197d6bf20f145c2e98463EE \n'), low);
  assert.equal(O.addrKind('0x770B10B273FC44FE9197D6BF20F145C2E98463EE'), 'evm');
});
test('a) normAddr：bech32 大写 → 小写（bc1 / cosmos1 / noble1 / celestia1）', () => {
  const bc1 = cur.holdings.btc.find(a => a.startsWith('bc1'));
  assert.ok(bc1, '夹具里应有 bc1 地址');
  assert.equal(O.normAddr(bc1.toUpperCase()), bc1);
  assert.equal(O.addrKind(bc1.toUpperCase()), 'bech32');
  assert.equal(O.addrKind(bc1), 'bech32');
  for (const c of ['atom', 'noble', 'tia']) {
    const a = cur.holdings[c][0];
    assert.equal(O.normAddr(a.toUpperCase()), a, c);
    assert.equal(O.addrKind(a), 'bech32', c);
  }
  // 混合大小写的 bech32 不合法，不能擅自改写
  const mixed = bc1.slice(0, 10) + bc1.slice(10, 14).toUpperCase() + bc1.slice(14);
  assert.equal(O.normAddr(mixed), mixed);
});
test('a) normAddr：btc 旧地址（1/3 开头）、tron、xrp、sol、zec 原样，绝不转小写', () => {
  const legacy = cur.holdings.btc.filter(a => /^[13]/.test(a));
  assert.ok(legacy.length > 0);
  for (const a of legacy) { assert.equal(O.normAddr(a), a); assert.equal(O.addrKind(a), 'base58'); }
  for (const c of ['tron', 'xrp', 'sol', 'zec']) for (const a of cur.holdings[c]) {
    assert.equal(O.normAddr(a), a, `${c} ${a}`);
    assert.equal(O.addrKind(a), 'base58', `${c} ${a}`);
  }
  assert.equal(O.normAddr('TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb'), 'TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb');
});
test('a) normAddr：ALGO 小写/混合输入 → 大写', () => {
  const algo = cur.holdings.algo[0];
  assert.match(algo, /^[A-Z2-7]{58}$/);
  assert.equal(O.normAddr(algo.toLowerCase()), algo);
  assert.equal(O.addrKind(algo.toLowerCase()), 'algo');
  assert.equal(O.addrKind(algo), 'algo');
  assert.equal(O.normAddr(algo.slice(0, 20).toLowerCase() + algo.slice(20)), algo);
});
test('a) addrKind：空、含空白、过短、过长、非字母数字 → invalid', () => {
  for (const bad of ['', '   ', null, undefined, 'hello', '0x123', 'abc def ghi jkl mno pqr stu',
    '0x770b10b273fc44fe9197d6bf20f145c2e98463e!', '0x770b10b273fc44fe9197d6bf20f145c2 e98463ee', 'a'.repeat(101), 'a'.repeat(19)])
    assert.equal(O.addrKind(bad), 'invalid', JSON.stringify(bad));
  assert.notEqual(O.addrKind('a'.repeat(20)), 'invalid');
  assert.notEqual(O.addrKind('a'.repeat(100)), 'invalid');
});
test('a) 夹具体检：官方 holdings/victims 全部地址都是 normAddr 的不动点，且都不是 invalid', () => {
  for (const m of [cur.holdings, cur.victims, old.holdings]) for (const a of allAddrs(m)) {
    assert.equal(O.normAddr(a), a, a);
    assert.notEqual(O.addrKind(a), 'invalid', a);
  }
});
test('a) explorerUrl / officialUrl', () => {
  assert.equal(O.explorerUrl('eth', '0xabc'), 'https://etherscan.io/address/0xabc');
  assert.equal(O.explorerUrl('tron', 'TJ7h'), 'https://tronscan.org/#/address/TJ7h');
  assert.equal(O.explorerUrl('tia', 'celestia1x'), 'https://www.mintscan.io/celestia/address/celestia1x');
  assert.equal(O.explorerUrl('nope', 'x'), null);
  assert.equal(O.explorerUrl('__proto__', 'x'), null);
  assert.equal(O.explorerUrl('eth', 'a b#c'), 'https://etherscan.io/address/a%20b%23c');
  for (const c of chainsOf(cur.holdings)) assert.ok(O.EXPLORERS[c], `17 条链都应有浏览器前缀：${c}`);
  assert.equal(O.officialUrl('0xAbC'), 'https://trace.bgblockchain.xyz/v2#0xAbC');
  assert.equal(O.officialUrl('a b'), 'https://trace.bgblockchain.xyz/v2#a%20b');
  assert.equal(O.BASE, 'https://trace.bgblockchain.xyz');
  assert.equal(O.ENDPOINTS.corrections, '/api/holdings/corrections');
});

// ---------- b) lookup ----------
test('b) lookup：攻击者地址（大写输入）→ attacker，链含 eth bsc arb base avax op', () => {
  const r = O.lookup(idx, '0x770B10B273FC44FE9197D6BF20F145C2E98463EE');
  assert.equal(r.status, 'attacker');
  assert.equal(r.kind, 'evm');
  assert.equal(r.norm, '0x770b10b273fc44fe9197d6bf20f145c2e98463ee');
  for (const c of ['eth', 'bsc', 'arb', 'base', 'avax', 'op']) assert.ok(r.chains.includes(c), c);
  assert.ok(r.entry && r.entry.holdings.includes('eth'));
  assert.equal(r.spoofOf, null);
});
test('b) lookup：输入两端空白不影响结果，result.input 保持原样', () => {
  const inp = '  0x770B10B273FC44FE9197D6BF20F145C2E98463EE\n';
  const r = O.lookup(idx, inp);
  assert.equal(r.status, 'attacker');
  assert.equal(r.input, inp);
});
test('b) lookup：受害钱包（大写输入）→ victim', () => {
  const r = O.lookup(idx, '0x1AB4973A48DC892CD9971ECE8E01DCC7688F8F23');
  assert.equal(r.status, 'victim');
  assert.ok(r.chains.includes('eth'));
  assert.ok(r.entry.victims.includes('eth'));
});
test('b) lookup：reviewed 金库 / poison → reviewed_not_attacker', () => {
  const v = O.lookup(idx, 'cosmos14r2cn7f5ztntkm3w07z3xmre6yay2zrvtjwhg6');
  assert.equal(v.status, 'reviewed_not_attacker');
  assert.equal(v.entry.reviewed.category, 'vault');
  assert.equal(v.entry.reviewed.verdict, 'not_attacker');
  const p = O.lookup(idx, '0x2db39583d7f801e5a07bcd3508862c106613e8fb');
  assert.equal(p.status, 'reviewed_not_attacker');
  assert.equal(p.entry.reviewed.category, 'poison');
});
test('b) lookup：勘误地址 → retracted（bc1 与 1/3 开头的旧地址各取一个）', () => {
  const list = cur.holdings_corrections.corrections[0].addresses;
  const a1 = list.find(a => a.startsWith('bc1')), a2 = list.find(a => /^[13]/.test(a));
  for (const a of [a1, a2]) {
    assert.ok(a);
    const r = O.lookup(idx, a);
    assert.equal(r.status, 'retracted', a);
    assert.equal(r.entry.correction.id, '20260928-btc');
    assert.ok(r.entry.correction.reason);
    assert.deepEqual(r.chains, ['btc']);
  }
  assert.equal(O.lookup(idx, a1.toUpperCase()).status, 'retracted', 'bc1 大写输入也命中');
});
test('b) lookup：tron 大小写敏感 —— 原样 → victim，全小写 → none', () => {
  const t = 'TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb';
  const r = O.lookup(idx, t);
  assert.equal(r.status, 'victim');
  assert.deepEqual(r.chains, ['tron']);
  const l = O.lookup(idx, t.toLowerCase());
  assert.equal(l.status, 'none');
  assert.equal(l.entry, null);
  assert.equal(O.lookup(idx, t.toUpperCase()).status, 'none');
});
test('b) lookup：仿冒地址（前 4 + 后 4 hex 相同）→ spoof', () => {
  const r = O.lookup(idx, '0x770b' + '0'.repeat(32) + '63ee');
  assert.equal(r.status, 'spoof');
  assert.equal(r.spoofOf.norm, '0x770b10b273fc44fe9197d6bf20f145c2e98463ee');
  assert.equal(r.spoofOf.source, 'holdings');
  assert.equal(r.entry, null);
  // 仿冒受害钱包
  const s = O.lookup(idx, '0x1ab4' + 'f'.repeat(32) + '8f23');
  assert.equal(s.status, 'spoof');
  assert.equal(s.spoofOf.source, 'victims');
  // 只有前缀相同不算
  assert.equal(O.lookup(idx, '0x770b' + '0'.repeat(32) + '0000').status, 'none');
  // 非 EVM 不做仿冒比对：'Tx770b' 的 slice(2,6)='770b'、'63ee' 结尾，与 0x770b…63ee 的比对键完全相同，仍必须是 none
  const nonEvm = 'Tx770b' + 'a'.repeat(25) + '63ee';
  assert.equal(O.addrKind(nonEvm), 'base58');
  assert.equal(O.lookup(idx, nonEvm).status, 'none');
  assert.equal(O.lookup(idx, nonEvm).spoofOf, null);
});
test('b) lookup：无关 EVM 地址 → none；hello → invalid', () => {
  const r = O.lookup(idx, '0x1234567890abcdef1234567890abcdef12345678');
  assert.equal(r.status, 'none');
  assert.equal(r.entry, null);
  assert.equal(r.spoofOf, null);
  assert.deepEqual(r.chains, []);
  const h = O.lookup(idx, 'hello');
  assert.equal(h.status, 'invalid');
  assert.equal(h.kind, 'invalid');
  assert.equal(h.entry, null);
  assert.equal(O.lookup(idx, '').status, 'invalid');
});
test('b) lookup：reviewed 中 category=attacker 且在 holdings → attacker；不在 holdings → reviewed_attacker_related', () => {
  const hs = new Set(allAddrs(cur.holdings));
  const atk = cur.reviewed.items.filter(i => i.category === 'attacker');
  const inH = atk.filter(i => hs.has(O.normAddr(i.address))), notH = atk.filter(i => !hs.has(O.normAddr(i.address)));
  assert.ok(inH.length > 0 && notH.length > 0);
  for (const it of inH.slice(0, 5)) {
    const r = O.lookup(idx, it.address);
    assert.equal(r.status, 'attacker', it.address);
    assert.equal(r.entry.reviewed.verdict, 'attacker_related');
    assert.equal(r.entry.reviewed.category, 'attacker');
  }
  for (const it of notH.slice(0, 5)) {
    const r = O.lookup(idx, it.address);
    assert.equal(r.status, 'reviewed_attacker_related', it.address);
    assert.equal(r.entry.reviewed.verdict, 'attacker_related');
  }
});
test('b) lookup：全量扫描 —— holdings 全是 attacker（无 conflict），victims 全是 victim，reviewed 状态与 verdict 一致', () => {
  for (const [c, list] of Object.entries(cur.holdings)) for (const a of list) {
    const r = O.lookup(idx, a);
    assert.equal(r.status, 'attacker', `${c} ${a}`);
    assert.ok(r.chains.includes(c));
  }
  for (const [c, list] of Object.entries(cur.victims)) for (const a of list) {
    const r = O.lookup(idx, a);
    assert.equal(r.status, 'victim', `${c} ${a}`);
    assert.ok(r.chains.includes(c));
  }
  const hs = new Set(allAddrs(cur.holdings));
  for (const it of cur.reviewed.items) {
    const r = O.lookup(idx, it.address);
    const want = hs.has(it.address) ? 'attacker' : it.verdict === 'attacker_related' ? 'reviewed_attacker_related' : 'reviewed_not_attacker';
    assert.equal(r.status, want, it.address);
  }
});
test('b) lookup：状态优先级（合成快照）conflict > victim > attacker；reviewed_not_attacker > retracted', () => {
  const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20), D = '0x' + 'd4'.repeat(20);
  const rv = (address, verdict, category) => ({ address, chain: 'EVM', category, verdict, name: 'n', note: 'x', reviewed_ts: 1 });
  const s = mkSnap({
    holdings: { eth: [A, B, D], bsc: [A.toUpperCase().replace('0X', '0x')] },
    victims: { eth: [B, C] },
    reviewed: { ok: true, count: 3, counts: { cex: 2, attacker: 1 }, items: [rv(A, 'not_attacker', 'cex'), rv(C, 'attacker_related', 'attacker'), rv(D, 'not_attacker', 'cex')] },
    corrections: { ok: true, corrections: [{ id: 'x1', chain: 'eth', listed_from: 'a', listed_until: 'b', restored_at: 'c', reason: 'r', count: 2, csv: '/c.csv', addresses: [D, C] }] }
  });
  const i2 = O.buildIndex(s);
  const st = a => O.lookup(i2, a).status;
  assert.equal(st(A), 'conflict', 'holdings + reviewed not_attacker');
  assert.equal(st(B), 'victim', 'victim 优先于 holdings');
  assert.equal(st(C), 'victim', 'victim 优先于 reviewed attacker_related');
  assert.equal(st(D), 'conflict', 'D 在 holdings 且 reviewed not_attacker');
  assert.deepEqual(O.lookup(i2, A).chains, ['eth', 'bsc'], 'holdings 同一地址大小写不同也合并');
  // 只在勘误 + reviewed not_attacker（不在 holdings）：reviewed 优先
  const E = '0x' + 'e5'.repeat(20);
  const s2 = mkSnap({
    holdings: { eth: [A] }, victims: {},
    reviewed: { ok: true, items: [rv(E, 'not_attacker', 'cex')], counts: {} },
    corrections: { ok: true, corrections: [{ id: 'x2', chain: 'eth', addresses: [E, D] }] }
  });
  const i3 = O.buildIndex(s2);
  assert.equal(O.lookup(i3, E).status, 'reviewed_not_attacker');
  assert.equal(O.lookup(i3, D).status, 'retracted');
});
test('b) lookup：同一地址同时在 holdings、victims 且 reviewed not_attacker → conflict（conflict > victim）', () => {
  const X = '0x' + '9a'.repeat(20);
  const s = mkSnap({
    holdings: { eth: [X] }, victims: { eth: [X] },
    reviewed: { ok: true, count: 1, counts: { cex: 1 }, items: [{ address: X, chain: 'EVM', category: 'cex', verdict: 'not_attacker', name: 'n', note: 'x', reviewed_ts: 1 }] },
    corrections: { ok: true, corrections: [] }
  });
  const r = O.lookup(O.buildIndex(s), X.toUpperCase().replace('0X', '0x'));
  assert.equal(r.status, 'conflict');
  assert.deepEqual(r.chains, ['eth'], '同一条链只出现一次');
  assert.equal(r.listChain, null, 'holdings/victims 命中时 listChain 为 null');
  // 对照：去掉 reviewed 后同一地址就是 victim
  const r2 = O.lookup(O.buildIndex({ ...s, reviewed: { ok: true, count: 0, counts: {}, items: [] } }), X);
  assert.equal(r2.status, 'victim');
});
test('b) lookup：reviewed-only 的 EVM 金库地址 → chains 为 []（不放 "evm"），listChain 为原始 "EVM"', () => {
  const V = '0x' + '5d'.repeat(20);
  const s = mkSnap({
    holdings: { eth: ['0x' + 'a1'.repeat(20)] }, victims: {},
    reviewed: { ok: true, count: 1, counts: { vault: 1 }, items: [{ address: V, chain: 'EVM', category: 'vault', verdict: 'not_attacker', name: 'vault', note: 'x', reviewed_ts: 1 }] },
    corrections: { ok: true, corrections: [] }
  });
  const r = O.lookup(O.buildIndex(s), V);
  assert.equal(r.status, 'reviewed_not_attacker');
  assert.deepEqual(r.chains, []);
  assert.equal(r.listChain, 'EVM');
  // 同样不在 EXPLORERS 的 THOR
  const T = 'thor1' + 'q'.repeat(38);
  const r2 = O.lookup(O.buildIndex(mkSnap({ holdings: { eth: ['0x' + 'a1'.repeat(20)] }, victims: {}, reviewed: { ok: true, items: [{ address: T, chain: 'THOR', category: 'vault', verdict: 'not_attacker' }] }, corrections: { ok: true, corrections: [] } })), T);
  assert.equal(r2.status, 'reviewed_not_attacker');
  assert.deepEqual(r2.chains, []);
  assert.equal(r2.listChain, 'THOR');
  // 在 EXPLORERS 里的 BTC：chains 放小写键，listChain 保持原始大写
  const B = 'bc1q' + 'q'.repeat(38);
  const r3 = O.lookup(O.buildIndex(mkSnap({ holdings: { eth: ['0x' + 'a1'.repeat(20)] }, victims: {}, reviewed: { ok: true, items: [{ address: B, chain: 'BTC', category: 'cex', verdict: 'not_attacker' }] }, corrections: { ok: true, corrections: [] } })), B);
  assert.equal(r3.status, 'reviewed_not_attacker');
  assert.deepEqual(r3.chains, ['btc']);
  assert.equal(r3.listChain, 'BTC');
});
test('b) lookup：真实夹具里 reviewed-only 的 EVM/THOR 地址 chains 为 []，chains 里只会出现 EXPLORERS 的链键，holdings 命中时 listChain 为 null', () => {
  const held = new Set([...allAddrs(cur.holdings), ...allAddrs(cur.victims)]);
  const only = cur.reviewed.items.filter(i => !held.has(O.normAddr(i.address)));
  const evm = only.filter(i => i.chain === 'EVM'), thor = only.filter(i => i.chain === 'THOR');
  assert.ok(evm.length > 0 && thor.length > 0, '夹具里应有 reviewed-only 的 EVM 与 THOR 条目');
  for (const it of evm.concat(thor)) {
    const r = O.lookup(idx, it.address);
    assert.deepEqual(r.chains, [], it.address);
    assert.equal(r.listChain, it.chain, it.address);
  }
  for (const it of only) {
    const r = O.lookup(idx, it.address);
    for (const c of r.chains) assert.ok(O.EXPLORERS[c], `${it.address} chains 含 ${c}`);
    assert.equal(r.listChain, it.chain, it.address);
  }
  assert.equal(O.lookup(idx, '0x770b10b273fc44fe9197d6bf20f145c2e98463ee').listChain, null);
  assert.equal(O.lookup(idx, 'TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb').listChain, null);
  // 勘误命中：chains 用勘误链键（在 EXPLORERS 内），listChain 为勘误里的原始 chain 字符串
  const a = cur.holdings_corrections.corrections[0].addresses.find(x => x.startsWith('bc1'));
  const rc = O.lookup(idx, a);
  assert.equal(rc.status, 'retracted');
  assert.deepEqual(rc.chains, ['btc']);
  assert.equal(rc.listChain, cur.holdings_corrections.corrections[0].chain);
  // none / invalid / spoof 的 listChain 都是 null
  assert.equal(O.lookup(idx, '0x1234567890abcdef1234567890abcdef12345678').listChain, null);
  assert.equal(O.lookup(idx, 'hello').listChain, null);
});
test('b) lookup / buildIndex 对空或缺失数据不抛错', () => {
  const e = O.buildIndex(null);
  assert.equal(e.stats.holdingsTotal, 0);
  assert.equal(e.byAddr.size, 0);
  assert.equal(O.lookup(e, '0x' + 'a1'.repeat(20)).status, 'none');
  assert.equal(O.lookup(null, '0x' + 'a1'.repeat(20)).status, 'none');
  const e2 = O.buildIndex({ holdings: { eth: ['0x' + 'a1'.repeat(20)] } });
  assert.equal(e2.stats.victimsTotal, 0);
  assert.equal(O.lookup(e2, '0x' + 'a1'.repeat(20)).status, 'attacker');
});

// ---------- c) buildIndex.stats ----------
test('c) buildIndex.stats 与夹具一致', () => {
  const uniq = new Set(allAddrs(cur.holdings));
  const s = idx.stats;
  assert.equal(s.holdingsTotal, uniq.size);
  assert.ok(uniq.size < allAddrs(cur.holdings).length, '夹具里 EVM 地址跨链重复，去重后应更少');
  assert.deepEqual(P(s.holdingsByChain), Object.fromEntries(Object.entries(cur.holdings).map(([c, l]) => [c, new Set(l).size])));
  assert.equal(s.victimsTotal, new Set(allAddrs(cur.victims)).size);
  assert.deepEqual(P(s.victimsByChain), Object.fromEntries(Object.entries(cur.victims).map(([c, l]) => [c, new Set(l).size])));
  assert.equal(s.reviewedCount, cur.reviewed.count);
  assert.deepEqual(s.reviewedCounts, cur.reviewed.counts);
  assert.equal(s.corrections.length, 1);
  assert.equal(s.corrections[0].count, 8232);
  assert.equal(s.corrections[0].id, '20260928-btc');
  assert.equal(s.corrections[0].chain, 'btc');
  assert.equal(s.corrections[0].csv, '/api/holdings/corrections/20260928-btc.csv');
  assert.equal(s.corrections[0].listed_from, '2026-09-28 09:46 UTC+8');
  assert.equal(s.corrections[0].restored_at, '2026-09-28 10:49 UTC+8');
  assert.ok(s.corrections[0].reason);
  assert.equal(idx.snapTs, null);
  assert.equal(idx.fetchedAt, '2026-09-30T14:59:00+08:00');
  assert.equal(O.buildIndex(mkSnap({ snap_ts: 1790751566 })).snapTs, 1790751566);
});
test('c) buildIndex：evm 数组去重、source 合法，且只含 EVM 地址', () => {
  const norms = idx.evm.map(x => x.norm);
  assert.equal(new Set(norms).size, norms.length);
  for (const x of idx.evm) { assert.match(x.norm, /^0x[0-9a-f]{40}$/); assert.ok(x.source === 'holdings' || x.source === 'victims'); }
  const want = new Set([...allAddrs(cur.holdings), ...allAddrs(cur.victims)].filter(a => /^0x[0-9a-f]{40}$/i.test(a)).map(a => a.toLowerCase()));
  assert.equal(norms.length, want.size);
  assert.deepEqual(new Set(norms), want);
});
test('c) buildIndex：byAddr 收录勘误全部地址，Entry 字段形状正确', () => {
  const list = cur.holdings_corrections.corrections[0].addresses;
  assert.equal(list.length, 8232);
  for (const a of list) assert.ok(idx.byAddr.has(O.normAddr(a)), a);
  const e = idx.byAddr.get('0x770b10b273fc44fe9197d6bf20f145c2e98463ee');
  assert.deepEqual(Object.keys(e).sort(), ['addr', 'correction', 'holdings', 'reviewed', 'victims']);
  assert.equal(e.addr, '0x770b10b273fc44fe9197d6bf20f145c2e98463ee');
  assert.equal(e.correction, null);
});

// ---------- d) diffHoldings ----------
const EMPTY_DIFF = { added: Object.create(null), removed: Object.create(null), addedCount: 0, removedCount: 0, newAddrs: [], newCount: 0, goneAddrs: [], goneCount: 0, relisted: [], relistedCount: 0, spread: [], spreadCount: 0 };
test('d) diffHoldings 真实 12:55 → 14:59 按地址语义：新增地址 12、消失地址 0；0x98c8… 是 eth→arb 改列而不是移除', (t) => {
  const d = O.diffHoldings(old.holdings, cur.holdings);
  const MOVED = '0x98c8a42a20ead5282302aed32bf813702e9a8c86';
  // 按链语义不变
  assert.equal(d.addedCount, 18);
  assert.equal(d.removedCount, 1);
  // 地址级
  assert.equal(d.newCount, 12);
  assert.equal(d.newAddrs.length, 12);
  assert.equal(d.goneCount, 0);
  assert.deepEqual(d.goneAddrs, []);
  assert.deepEqual(d.relisted, [{ addr: MOVED, from: ['eth'], to: ['arb'] }]);
  assert.equal(d.relistedCount, 1);
  // spread：如实断言（实测为空：12:55→14:59 没有"只增链不失链"的老地址），并打印出来
  t.diagnostic('spread(12:55→14:59) = ' + JSON.stringify(d.spread) + ' spreadCount=' + d.spreadCount);
  assert.deepEqual(d.spread, []);
  assert.equal(d.spreadCount, 0);
  // 独立算一遍：newAddrs = cur 全部归一化地址 − old 全部归一化地址
  const oldSet = new Set(allAddrs(old.holdings).map(O.normAddr)), curSet = new Set(allAddrs(cur.holdings).map(O.normAddr));
  const wantNew = [...curSet].filter(a => !oldSet.has(a));
  assert.deepEqual([...d.newAddrs].sort(), wantNew.sort());
  assert.deepEqual([...oldSet].filter(a => !curSet.has(a)), []);
  assert.ok(!d.newAddrs.includes(MOVED), '0x98c8… 一直在名单里，不算新增');
  assert.ok(oldSet.has(MOVED) && curSet.has(MOVED));
  assert.ok(old.holdings.eth.includes(MOVED) && !old.holdings.arb.includes(MOVED));
  assert.ok(cur.holdings.arb.includes(MOVED) && !cur.holdings.eth.includes(MOVED));
  for (const a of d.newAddrs) assert.equal(O.normAddr(a), a, '输出归一化写法');
  assert.equal(new Set(d.newAddrs).size, 12, '同一地址在多条链新增只算一次');
});
test('d) diffHoldings 合成数据：new / gone / relisted / spread 四类，另含未变化地址与大小写归一', () => {
  const H = n => '0x' + n.repeat(20);
  const A = H('a1'), B = H('b2'), C = H('c3'), D = H('d4'), E = H('e5'), F = H('f6'), G = H('a7');
  const EU = '0x' + 'E5'.repeat(20); // E 的大写写法，在 eth 上以大写出现
  const prev = { eth: [A, B, C, F, G], bsc: [B, F] };
  const cur2 = { eth: [A, D, EU, F], bsc: [A, B, F], arb: [E, G] };
  const d = O.diffHoldings(prev, cur2);
  // new：D（eth）、E（eth 大写 + arb 小写，只算一次，归一化小写），按 cur 首次出现顺序
  assert.deepEqual(d.newAddrs, [D, E]);
  assert.equal(d.newCount, 2);
  // gone：C
  assert.deepEqual(d.goneAddrs, [C]);
  assert.equal(d.goneCount, 1);
  // relisted：B 失去 eth 仍在 bsc；G 从 eth 改列 arb（按 prev 出现顺序）
  assert.deepEqual(d.relisted, [{ addr: B, from: ['eth', 'bsc'], to: ['bsc'] }, { addr: G, from: ['eth'], to: ['arb'] }]);
  assert.equal(d.relistedCount, 2);
  // spread：A 原在 eth，现 eth + bsc，没失去任何链
  assert.deepEqual(d.spread, [{ addr: A, from: ['eth'], to: ['eth', 'bsc'] }]);
  assert.equal(d.spreadCount, 1);
  // F 前后链集合相同（顺序不同也不算变化）：不在任何一类里
  const inAny = a => d.newAddrs.includes(a) || d.goneAddrs.includes(a) || d.relisted.some(x => x.addr === a) || d.spread.some(x => x.addr === a);
  assert.equal(inAny(F), false);
  assert.deepEqual(O.diffHoldings({ eth: [F], bsc: [F] }, { bsc: [F], eth: [F] }), EMPTY_DIFF);
  // 按链语义不变：eth 新增 D、EU（原始写法），移除 B、C、G；bsc 新增 A；arb 新增 E、G
  assert.deepEqual(P(d.added), { eth: [D, EU], bsc: [A], arb: [E, G] });
  assert.deepEqual(P(d.removed), { eth: [B, C, G] });
  assert.equal(d.addedCount, 5);
  assert.equal(d.removedCount, 3);
  // 失去链又得到别的链 → relisted，不同时出现在 spread
  assert.ok(!d.spread.some(x => x.addr === G));
  // 直接传快照对象（取 .holdings）等价
  assert.deepEqual(O.diffHoldings({ holdings: prev }, { holdings: cur2 }), d);
});
test('d) diffHoldings prev=null / cur=null / 非对象：地址级字段全为空与 0', () => {
  for (const [p, c] of [[null, cur.holdings], [undefined, cur.holdings], [cur.holdings, null], [null, null], ['x', cur.holdings]]) {
    const d = O.diffHoldings(p, c);
    for (const k of ['newAddrs', 'goneAddrs', 'relisted', 'spread']) assert.deepEqual(d[k], [], k);
    for (const k of ['newCount', 'goneCount', 'relistedCount', 'spreadCount', 'addedCount', 'removedCount']) assert.equal(d[k], 0, k);
    assert.deepEqual(P(d.added), {});
    assert.deepEqual(P(d.removed), {});
  }
});
test('d) diffHoldings(12:55 → 14:59) 按链语义：eth +10 −1，btc +1，arb +4，hyperliquid +3（removed 只表示该链不再列出）', () => {
  const d = O.diffHoldings(old.holdings, cur.holdings);
  assert.deepEqual(Object.keys(d.added).sort(), ['arb', 'btc', 'eth', 'hyperliquid']);
  assert.deepEqual(Object.keys(d.removed), ['eth']);
  assert.equal(d.added.eth.length, 10);
  assert.equal(d.removed.eth.length, 1);
  assert.deepEqual(d.removed.eth, ['0x98c8a42a20ead5282302aed32bf813702e9a8c86']);
  assert.equal(d.added.btc.length, 1);
  assert.equal(d.added.arb.length, 4);
  assert.equal(d.added.hyperliquid.length, 3);
  assert.equal(d.addedCount, 18);
  assert.equal(d.removedCount, 1);
  // 输出的是 cur 中的原始写法
  for (const c of Object.keys(d.added)) for (const a of d.added[c]) assert.ok(cur.holdings[c].includes(a), a);
  const oldEth = new Set(old.holdings.eth);
  for (const a of d.added.eth) assert.ok(!oldEth.has(a));
  // 没变化的链不出现
  for (const c of ['bsc', 'base', 'avax', 'op', 'linea', 'tron', 'xrp', 'sol', 'zec', 'algo', 'atom', 'noble', 'tia']) {
    assert.ok(!(c in d.added) && !(c in d.removed), c);
  }
});
test('d) diffHoldings 反向：新增/移除对调；相同输入与 prev=null 为空', () => {
  const r = O.diffHoldings(cur.holdings, old.holdings);
  assert.equal(r.addedCount, 1);
  assert.equal(r.removedCount, 18);
  assert.deepEqual(r.added.eth, ['0x98c8a42a20ead5282302aed32bf813702e9a8c86']);
  // 地址级：反向时 12 个新地址变成"消失"，0x98c8… 从 arb 改回 eth 仍是 relisted，而不是新增/消失
  assert.equal(r.newCount, 0);
  assert.equal(r.goneCount, 12);
  assert.deepEqual(r.relisted, [{ addr: '0x98c8a42a20ead5282302aed32bf813702e9a8c86', from: ['arb'], to: ['eth'] }]);
  assert.equal(r.spreadCount, 0);
  const same = O.diffHoldings(cur.holdings, cur.holdings);
  assert.deepEqual(same, EMPTY_DIFF);
  const n = O.diffHoldings(null, cur.holdings);
  assert.deepEqual(n, EMPTY_DIFF);
  assert.deepEqual(O.diffHoldings(undefined, cur.holdings), n);
  assert.deepEqual(O.diffHoldings(cur.holdings, null), n);
});
test('d) diffHoldings 按归一化地址比较：EVM/bech32 大小写不算变化，base58 大小写算变化，新链整体算新增', () => {
  const E = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
  const BC = 'bc1q578370zc2zrr39l9prsjfc7xhwdmhek3pavwvz';
  const p = { eth: [E], btc: [BC, '1BoatSLRHtKNngkdXEeobR76b53LETtpyT'], tron: ['TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb'] };
  const c = { eth: [E.toLowerCase()], btc: [BC.toUpperCase(), '1boatslrhtkngkdxeeobr76b53lettpyt'], tron: ['TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb'], sol: ['8TR7jNakHmeQRBrZ8wExb6JhmML5Mvi7XfZuokKWdHt4'] };
  const d = O.diffHoldings(p, c);
  assert.deepEqual(P(d.added), { btc: ['1boatslrhtkngkdxeeobr76b53lettpyt'], sol: ['8TR7jNakHmeQRBrZ8wExb6JhmML5Mvi7XfZuokKWdHt4'] });
  assert.deepEqual(P(d.removed), { btc: ['1BoatSLRHtKNngkdXEeobR76b53LETtpyT'] });
  assert.equal(d.addedCount, 2);
  assert.equal(d.removedCount, 1);
  // 地址级：base58 大小写不同是不同地址 → 一个新增、一个消失；EVM/bech32 大小写不算变化
  assert.deepEqual(d.newAddrs, ['1boatslrhtkngkdxeeobr76b53lettpyt', '8TR7jNakHmeQRBrZ8wExb6JhmML5Mvi7XfZuokKWdHt4']);
  assert.equal(d.newCount, 2);
  assert.deepEqual(d.goneAddrs, ['1BoatSLRHtKNngkdXEeobR76b53LETtpyT']);
  assert.equal(d.goneCount, 1);
  assert.equal(d.relistedCount, 0);
  assert.equal(d.spreadCount, 0);
  // 整条链消失
  const g = O.diffHoldings({ eth: [E], tia: ['celestia1znch3lcdp59ggrk5zll463ef9qkvxj4c9pnjww'] }, { eth: [E] });
  assert.deepEqual(P(g.removed), { tia: ['celestia1znch3lcdp59ggrk5zll463ef9qkvxj4c9pnjww'] });
  assert.equal(g.removedCount, 1);
  assert.deepEqual(g.goneAddrs, ['celestia1znch3lcdp59ggrk5zll463ef9qkvxj4c9pnjww']);
  assert.equal(g.goneCount, 1);
});

// ---------- e) validateHoldings ----------
test('e) validateHoldings', () => {
  for (const bad of [{}, { eth: [] }, [], null, undefined, { eth: 'x' }, { eth: [1] }, { eth: ['a'], bsc: 'y' }, 'str', 42, { eth: [], bsc: [] }])
    assert.equal(O.validateHoldings(bad), false, JSON.stringify(bad));
  assert.equal(O.validateHoldings({ eth: ['0xabc'] }), true);
  assert.equal(O.validateHoldings({ eth: [], bsc: ['x'] }), true);
  assert.equal(O.validateHoldings(cur.holdings), true);
  assert.equal(O.validateHoldings(old.holdings), true);
});

// ---------- f) fetchAll（假 fetch） ----------
const B = O.BASE;
const jsonRes = (body, { status = 200, headers = {} } = {}) => {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, ok: status >= 200 && status < 300, headers: { get: k => (k.toLowerCase() in h ? h[k.toLowerCase()] : null) }, json: async () => body };
};
// routes：路径 → 响应对象 | 函数；未列出的路径返回 404
function fakeFetch(routes) {
  const calls = [], inits = [];
  const f = async (url, init) => {
    assert.ok(url.startsWith(B), url);
    const p = url.slice(B.length);
    calls.push(p);
    inits.push(init);
    const r = routes[p];
    if (!r) return jsonRes({}, { status: 404 });
    return typeof r === 'function' ? r(init) : r;
  };
  f.calls = calls;
  f.inits = inits;
  return f;
}
const okRoutes = (over = {}, hh = { 'x-snap-ts': '1790751566' }) => ({
  '/api/maintenance': jsonRes(cur.maintenance),
  '/api/holdings': jsonRes(cur.holdings, { headers: hh }),
  '/api/victims': jsonRes(cur.victims, { headers: hh }),
  '/api/reviewed': jsonRes(cur.reviewed),
  '/api/chains': jsonRes(cur.chains),
  '/api/holdings/corrections': jsonRes(cur.holdings_corrections),
  ...over
});
const blockMaint = { ok: true, on: true, mode: 'block', since: 1790750000, frozen_ts: null, msg_zh: '维护中', msg_en: 'maintenance' };

test('f) fetchAll 正常 → live，snap_ts 取自 x-snap-ts，snap 结构符合契约', async () => {
  const f = fakeFetch(okRoutes());
  const t0 = Date.now();
  const r = await O.fetchAll({ fetchImpl: f });
  assert.equal(r.mode, 'live');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.maintenance, cur.maintenance);
  const s = r.snap;
  assert.equal(s.schema, 'suliu.official-snapshot/v1');
  assert.equal(s.source, B);
  assert.equal(s.snap_ts, 1790751566);
  assert.equal(s.label, '实时');
  assert.deepEqual(s.history, []);
  assert.ok(Math.abs(new Date(s.fetched_at).getTime() - t0) < 10000);
  assert.equal(new Date(s.fetched_at).toISOString(), s.fetched_at);
  assert.deepEqual(s.holdings, cur.holdings);
  assert.deepEqual(s.victims, cur.victims);
  assert.deepEqual(s.reviewed, cur.reviewed);
  assert.deepEqual(s.chains, cur.chains);
  assert.deepEqual(s.corrections, cur.holdings_corrections);
  assert.deepEqual(s.maintenance, cur.maintenance);
  assert.deepEqual([...f.calls].sort(), ['/api/chains', '/api/holdings', '/api/holdings/corrections', '/api/maintenance', '/api/reviewed', '/api/victims']);
  assert.equal(f.calls[0], '/api/maintenance', '先拉维护状态');
  assert.equal(O.buildIndex(s).stats.holdingsTotal, idx.stats.holdingsTotal);
  assert.equal(s.frozen, false, 'live 时 snap.frozen 为 false');
  assert.equal(r.maintUnknown, false, '维护接口成功时 maintUnknown 为 false');
});
test('f) fetchAll：缺 x-snap-ts → snap_ts 为 null；x-snap-ts 是垃圾值也为 null', async () => {
  const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({}, {})) });
  assert.equal(r.mode, 'live');
  assert.equal(r.snap.snap_ts, null);
  const r2 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({}, { 'x-snap-ts': 'garbage' })) });
  assert.equal(r2.snap.snap_ts, null);
});
test('f) fetchAll：不传 fetchImpl 时默认取 globalThis.fetch（临时替换 globalThis.fetch 真测）', async () => {
  const saved = globalThis.fetch;
  const f = fakeFetch(okRoutes());
  globalThis.fetch = f;
  try {
    const r = await O.fetchAll({});
    assert.equal(r.mode, 'live');
    assert.equal(f.calls.length, 6, '6 个请求都走了被替换的 globalThis.fetch');
    assert.deepEqual(r.snap.holdings, cur.holdings);
    const r2 = await O.fetchAll();
    assert.equal(r2.mode, 'live');
    assert.equal(f.calls.length, 12, '连参数对象都不传也走 globalThis.fetch');
  } finally { globalThis.fetch = saved; }
  assert.equal(globalThis.fetch, saved, 'globalThis.fetch 已还原');
});
test("f) fetchAll：每个请求都带 { cache: 'no-cache' } 与 AbortSignal", async () => {
  const f = fakeFetch(okRoutes());
  await O.fetchAll({ fetchImpl: f });
  assert.equal(f.inits.length, 6);
  for (let i = 0; i < f.inits.length; i++) {
    assert.ok(f.inits[i] && typeof f.inits[i] === 'object', f.calls[i]);
    assert.equal(f.inits[i].cache, 'no-cache', f.calls[i]);
    assert.ok(f.inits[i].signal && typeof f.inits[i].signal.aborted === 'boolean', f.calls[i] + ' 带 signal');
  }
  // 维护 block：唯一的一个请求也带 no-cache
  const fb = fakeFetch(okRoutes({ '/api/maintenance': jsonRes(blockMaint) }));
  await O.fetchAll({ fetchImpl: fb });
  assert.equal(fb.inits.length, 1);
  assert.equal(fb.inits[0].cache, 'no-cache');
});
test('f) fetchAll：base 参数生效', async () => {
  const seen = [];
  const f = async url => { seen.push(url); return jsonRes({ ok: true, on: false, mode: null }); };
  const r = await O.fetchAll({ fetchImpl: f, base: 'http://127.0.0.1:1' });
  assert.ok(seen.length >= 1 && seen.every(u => u.startsWith('http://127.0.0.1:1/api/')));
  assert.equal(r.mode, 'error');
});
test('f) fetchAll：maintenance block → mode block，snap 为 null，且没有请求任何数据接口', async () => {
  const f = fakeFetch(okRoutes({ '/api/maintenance': jsonRes(blockMaint) }));
  const r = await O.fetchAll({ fetchImpl: f });
  assert.equal(r.mode, 'block');
  assert.equal(r.snap, null);
  assert.deepEqual(r.maintenance, blockMaint);
  assert.deepEqual(f.calls, ['/api/maintenance']);
});
test('f) fetchAll：holdings 503 → block；任一数据接口 503 → block', async () => {
  const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': jsonRes({ error: 'x' }, { status: 503, headers: { 'retry-after': '30' } }) })) });
  assert.equal(r.mode, 'block');
  assert.equal(r.snap, null);
  assert.ok(r.errors.some(e => e.endpoint === 'holdings' && e.status === 503));
  for (const ep of ['/api/victims', '/api/reviewed', '/api/chains', '/api/holdings/corrections']) {
    const x = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ [ep]: jsonRes({}, { status: 503 }) })), prev: { holdings: cur.holdings } });
    assert.equal(x.mode, 'block', ep);
    assert.equal(x.snap, null, ep);
  }
});
test('f) fetchAll：holdings 返回 {} / {eth:[]} / 数组 / 500 / 网络异常 → error，snap 为 null（空响应≠空名单）', async () => {
  for (const body of [{}, { eth: [] }, [], null, { eth: 'x' }]) {
    const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': jsonRes(body) })), prev: { holdings: cur.holdings } });
    assert.equal(r.mode, 'error', JSON.stringify(body));
    assert.equal(r.snap, null);
    assert.ok(r.errors.some(e => e.endpoint === 'holdings'), JSON.stringify(body));
  }
  const r500 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': jsonRes({}, { status: 500 }) })) });
  assert.equal(r500.mode, 'error');
  assert.equal(r500.snap, null);
  assert.ok(r500.errors.some(e => e.endpoint === 'holdings' && e.status === 500));
  const rNet = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': () => { throw new TypeError('fetch failed'); } })) });
  assert.equal(rNet.mode, 'error');
  assert.equal(rNet.snap, null);
  const rBadJson = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': { status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError('Unexpected token <'); } } })) });
  assert.equal(rBadJson.mode, 'error');
  assert.ok(rBadJson.errors.some(e => e.endpoint === 'holdings' && /JSON/.test(e.message)));
});
test('f) fetchAll：reviewed 500 且 prev 有 reviewed → live，沿用 prev.reviewed，errors 里有 reviewed', async () => {
  const prevReviewed = { ok: true, count: 1, counts: { cex: 1 }, items: [{ address: '0xprev' }] };
  const prev = { reviewed: prevReviewed, chains: { ok: true, items: [] } };
  const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/reviewed': jsonRes({}, { status: 500 }) })), prev });
  assert.equal(r.mode, 'live');
  assert.equal(r.snap.reviewed, prevReviewed);
  assert.deepEqual(r.snap.holdings, cur.holdings, '成功的接口用新数据');
  assert.deepEqual(r.snap.chains, cur.chains, '成功的接口不被 prev 覆盖');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].endpoint, 'reviewed');
  assert.equal(r.errors[0].status, 500);
  // prev 为 null → 该字段为 null
  const r2 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/reviewed': jsonRes({}, { status: 500 }) })), prev: null });
  assert.equal(r2.mode, 'live');
  assert.equal(r2.snap.reviewed, null);
  assert.ok(r2.errors.some(e => e.endpoint === 'reviewed'));
  // 其余非 holdings 接口同理
  for (const [name, ep] of [['victims', '/api/victims'], ['chains', '/api/chains'], ['corrections', '/api/holdings/corrections']]) {
    const sentinel = { sentinel: name };
    const x = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ [ep]: () => { throw new Error('boom'); } })), prev: { [name]: sentinel } });
    assert.equal(x.mode, 'live', name);
    assert.equal(x.snap[name], sentinel, name);
    assert.ok(x.errors.some(e => e.endpoint === name), name);
  }
});
test('f) fetchAll：victims 返回 {} 或 {eth:[]} → 视为该接口失败：沿用 prev.victims，errors 含 victims（message 含 empty），mode 仍 live', async () => {
  const prevVictims = { eth: ['0x' + 'aa'.repeat(20)], tron: ['TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb'] };
  for (const body of [{}, { eth: [] }, { eth: [], tron: [] }]) {
    const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/victims': jsonRes(body) })), prev: { victims: prevVictims } });
    const tag = JSON.stringify(body);
    assert.equal(r.mode, 'live', tag);
    assert.equal(r.snap.victims, prevVictims, tag);
    assert.deepEqual(r.snap.holdings, cur.holdings, tag);
    assert.deepEqual(r.snap.reviewed, cur.reviewed, '其余接口不受影响');
    const e = r.errors.filter(x => x.endpoint === 'victims');
    assert.equal(e.length, 1, tag);
    assert.match(e[0].message, /empty/, tag);
    assert.equal(r.errors.length, 1, tag);
    // prev 为 null：该字段为 null，不抛错，且下游 buildIndex 也不抛错
    const r2 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/victims': jsonRes(body) })), prev: null });
    assert.equal(r2.mode, 'live', tag);
    assert.equal(r2.snap.victims, null, tag);
    assert.ok(r2.errors.some(x => x.endpoint === 'victims'), tag);
    assert.equal(O.buildIndex(r2.snap).stats.victimsTotal, 0, tag);
    // prev 里没有 victims 字段 → 同样为 null
    const r3 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/victims': jsonRes(body) })), prev: { holdings: cur.holdings } });
    assert.equal(r3.snap.victims, null, tag);
  }
  // 对照：非空 victims 正常采用
  const ok = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/victims': jsonRes({ eth: ['0x' + 'bb'.repeat(20)] }) })), prev: { victims: prevVictims } });
  assert.deepEqual(ok.snap.victims, { eth: ['0x' + 'bb'.repeat(20)] });
  assert.deepEqual(ok.errors, []);
});
test('f) fetchAll：reviewed items:[]（或 ok:false）→ 视为该接口失败：沿用 prev.reviewed，errors 含 reviewed（message 含 empty），prev 为 null 时为 null', async () => {
  const prevReviewed = { ok: true, count: 1, counts: { cex: 1 }, items: [{ address: '0xprev', chain: 'EVM', category: 'cex', verdict: 'not_attacker' }] };
  const bodies = [{ ok: true, count: 0, counts: {}, items: [] }, { ok: true, items: [] }, { ok: false, items: [{ address: '0xzzz' }] }];
  for (const body of bodies) {
    const tag = JSON.stringify(body);
    const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/reviewed': jsonRes(body) })), prev: { reviewed: prevReviewed } });
    assert.equal(r.mode, 'live', tag);
    assert.equal(r.snap.reviewed, prevReviewed, tag);
    assert.deepEqual(r.snap.victims, cur.victims, tag);
    const e = r.errors.filter(x => x.endpoint === 'reviewed');
    assert.equal(e.length, 1, tag);
    assert.match(e[0].message, /empty/, tag);
    const r2 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/reviewed': jsonRes(body) })), prev: null });
    assert.equal(r2.mode, 'live', tag);
    assert.equal(r2.snap.reviewed, null, tag);
    assert.ok(r2.errors.some(x => x.endpoint === 'reviewed'), tag);
    assert.equal(O.buildIndex(r2.snap).stats.reviewedCount, 0, tag);
  }
  // chains 与 corrections 仍允许空数组（沿用旧规则）：corrections=[] 是合法的"当前没有勘误"
  const r3 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings/corrections': jsonRes({ ok: true, corrections: [] }) })) });
  assert.equal(r3.mode, 'live');
  assert.deepEqual(r3.snap.corrections, { ok: true, corrections: [] });
  assert.deepEqual(r3.errors, []);
});
test('f) fetchAll：maintenance 接口失败 → 只记 error，仍继续拉数据，mode live，maintUnknown true', async () => {
  const f = fakeFetch(okRoutes({ '/api/maintenance': jsonRes({}, { status: 502 }) }));
  const r = await O.fetchAll({ fetchImpl: f, prev: { maintenance: cur.maintenance } });
  assert.equal(r.mode, 'live');
  assert.equal(r.maintenance, null);
  assert.ok(r.errors.some(e => e.endpoint === 'maintenance' && e.status === 502));
  assert.equal(f.calls.length, 6);
  assert.deepEqual(r.snap.maintenance, cur.maintenance, '沿用 prev.maintenance');
  assert.equal(r.maintUnknown, true);
});
test('f) fetchAll：maintenance 网络失败 / 非法 JSON / 返回非对象 → mode live，maintUnknown true；成功则 false', async () => {
  const net = fakeFetch(okRoutes({ '/api/maintenance': () => { throw new TypeError('fetch failed'); } }));
  const r = await O.fetchAll({ fetchImpl: net });
  assert.equal(r.mode, 'live');
  assert.equal(r.maintUnknown, true);
  assert.equal(r.maintenance, null);
  assert.ok(r.errors.some(e => e.endpoint === 'maintenance' && e.status === 0 && /fetch failed/.test(e.message)));
  assert.equal(net.calls.length, 6, '维护状态未知时仍拉数据');
  assert.equal(r.snap.maintenance, null, 'prev 为空时 snap.maintenance 为 null');
  const badJson = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': { status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError('Unexpected token <'); } } })) });
  assert.equal(badJson.mode, 'live');
  assert.equal(badJson.maintUnknown, true);
  const arr = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes([1, 2]) })) });
  assert.equal(arr.maintUnknown, true);
  // 成功（含 on:false、freeze）→ false
  const ok = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes()) });
  assert.equal(ok.maintUnknown, false);
  const fm = { ok: true, on: true, mode: 'freeze', since: 1, frozen_ts: 1, msg_zh: 'x', msg_en: 'x' };
  assert.equal((await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes(fm) })) })).maintUnknown, false);
  // 其它出口也带 maintUnknown：block（维护中）为 false，holdings 失败的 error 出口按维护接口结果
  assert.equal((await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes(blockMaint) })) })).maintUnknown, false);
  const e1 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': jsonRes({}) })) });
  assert.equal(e1.mode, 'error');
  assert.equal(e1.maintUnknown, false);
  const e2 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/holdings': jsonRes({}), '/api/maintenance': () => { throw new Error('boom'); } })) });
  assert.equal(e2.mode, 'error');
  assert.equal(e2.maintUnknown, true);
});
test('f) fetchAll：maintenance 接口自身 503 → mode block，snap 为 null，不再请求数据接口（与 maintenance.on+block 一致）', async () => {
  const f = fakeFetch(okRoutes({ '/api/maintenance': jsonRes({ error: 'maintenance' }, { status: 503, headers: { 'retry-after': '30' } }) }));
  const r = await O.fetchAll({ fetchImpl: f, prev: { holdings: cur.holdings } });
  assert.equal(r.mode, 'block');
  assert.equal(r.snap, null);
  assert.ok(r.errors.some(e => e.endpoint === 'maintenance' && e.status === 503));
  assert.deepEqual(f.calls, ['/api/maintenance']);
  assert.equal(r.maintUnknown, true, '维护接口本次请求失败，没拿到维护状态');
  // 对照：数据接口都健康、只有维护接口 503，也是 block（不能因为数据拿得到就当作 live）
  const f2 = fakeFetch(okRoutes({ '/api/maintenance': jsonRes({}, { status: 503 }) }));
  assert.equal((await O.fetchAll({ fetchImpl: f2 })).mode, 'block');
  // 502/500 不等于维护：仍按"只记 error"处理
  assert.equal((await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes({}, { status: 500 }) })) })).mode, 'live');
});
test('f) fetchAll：x-maintenance: freeze 响应头 或 maintenance.mode=freeze → freeze（仍返回 snap）', async () => {
  const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({}, { 'x-snap-ts': '1790751566', 'x-maintenance': 'freeze' })) });
  assert.equal(r.mode, 'freeze');
  assert.ok(r.snap);
  assert.equal(r.snap.snap_ts, 1790751566);
  assert.deepEqual(r.snap.holdings, cur.holdings);
  assert.equal(r.snap.frozen, true, 'freeze 时 snap.frozen 为 true');
  const fm = { ok: true, on: true, mode: 'freeze', since: 1, frozen_ts: 1790700000, msg_zh: '冻结', msg_en: 'frozen' };
  const r2 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes(fm) })) });
  assert.equal(r2.mode, 'freeze');
  assert.ok(r2.snap);
  assert.deepEqual(r2.snap.maintenance, fm);
  assert.equal(r2.snap.frozen, true);
  assert.equal(typeof r2.snap.frozen, 'boolean');
  // 维护关闭（on:false, mode:null）→ live，frozen 为 false
  const r3 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes({ ok: true, on: false, mode: null }) })) });
  assert.equal(r3.mode, 'live');
  assert.equal(r3.snap.frozen, false);
});
test('f) fetchAll：超时（假 fetch 挂起直到 abort）→ error；不听 signal 的假 fetch 也会被超时截断', async () => {
  let aborted = 0;
  const hang = init => new Promise((_, rej) => init.signal.addEventListener('abort', () => { aborted++; rej(new DOMException('aborted', 'AbortError')); }));
  const t0 = Date.now();
  const r = await O.fetchAll({ fetchImpl: fakeFetch({ '/api/maintenance': hang, '/api/holdings': hang, '/api/victims': hang, '/api/reviewed': hang, '/api/chains': hang, '/api/holdings/corrections': hang }), timeoutMs: 50 });
  assert.equal(r.mode, 'error');
  assert.equal(r.snap, null);
  assert.ok(Date.now() - t0 < 3000);
  assert.ok(aborted >= 1, 'AbortController 应被触发');
  assert.ok(r.errors.some(e => e.endpoint === 'holdings' && /timeout/i.test(e.message)));
  const deaf = () => new Promise(() => {});
  const r2 = await O.fetchAll({ fetchImpl: fakeFetch({ '/api/maintenance': deaf, '/api/holdings': deaf, '/api/victims': deaf, '/api/reviewed': deaf, '/api/chains': deaf, '/api/holdings/corrections': deaf }), timeoutMs: 50 });
  assert.equal(r2.mode, 'error');
  assert.equal(r2.snap, null);
  // 单个非 holdings 接口超时 → 沿用 prev，整体仍 live
  const sentinel = { sentinel: 1 };
  const r3 = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/chains': hang })), timeoutMs: 50, prev: { chains: sentinel } });
  assert.equal(r3.mode, 'live');
  assert.equal(r3.snap.chains, sentinel);
});

// ---------- g) formatTs ----------
test('g) formatTs：固定 UTC+8', () => {
  // 1790751566 = 20726 天 + 25166 秒 → 2026-09-30 06:59:26 UTC → UTC+8 14:59:26（与 14:59 抓取的快照吻合）
  assert.equal(O.formatTs(1790751566), '2026-09-30 14:59:26');
  assert.equal(O.formatTs(0), '1970-01-01 08:00:00');
  assert.equal(O.formatTs(1790697600), '2026-09-30 00:00:00', 'UTC+8 午夜');
  assert.equal(O.formatTs(1790697599), '2026-09-29 23:59:59');
  assert.equal(O.formatTs(1790726400 - 1), '2026-09-30 07:59:59');
  assert.equal(O.formatTs('1790751566'), '2026-09-30 14:59:26');
  for (const bad of [null, undefined, NaN, '', 'x', Infinity]) assert.equal(O.formatTs(bad), '—', String(bad));
  assert.equal(O.formatTs(null), '—');
});
test('g) formatTs 不依赖系统时区：把 Date 的本地时间 getter 全部污染后结果不变', () => {
  const P = Date.prototype, names = ['getFullYear', 'getMonth', 'getDate', 'getHours', 'getMinutes', 'getSeconds', 'getDay', 'getTimezoneOffset'];
  const saved = names.map(n => P[n]);
  try {
    names.forEach(n => { P[n] = () => 7; });
    assert.equal(O.formatTs(1790751566), '2026-09-30 14:59:26');
  } finally { names.forEach((n, i) => { P[n] = saved[i]; }); }
});

// ---------- P11) 链键 '__proto__'：按链 / category 为键的对象是无原型对象，键不会丢 ----------
test('P11) diffHoldings：JSON.parse 出来的 "__proto__" 链键 —— addedCount 与 Object.keys(added) 一致，removed 同理', () => {
  const X = '0x' + 'ab'.repeat(20), Y = '0x' + 'cd'.repeat(20);
  const evil = JSON.parse('{"__proto__":["' + X + '"]}');
  assert.deepEqual(Object.keys(evil), ['__proto__'], '夹具本身要有 own 的 __proto__ 键');
  const d = O.diffHoldings({ eth: [Y] }, evil);
  assert.equal(d.addedCount, 1);
  assert.deepEqual(Object.keys(d.added), ['__proto__']);
  assert.deepEqual(Object.keys(d.added).reduce((n, k) => n + d.added[k].length, 0), d.addedCount, 'addedCount 与 added 里的地址数一致');
  assert.equal(JSON.stringify(d.added), '{"__proto__":["' + X + '"]}');
  assert.equal(Object.getPrototypeOf(d.added), null);
  assert.equal(d.removedCount, 1);
  assert.deepEqual(Object.keys(d.removed), ['eth']);
  // 反向：__proto__ 链被移除
  const r = O.diffHoldings(evil, { eth: [Y] });
  assert.equal(r.removedCount, 1);
  assert.deepEqual(Object.keys(r.removed), ['__proto__']);
  assert.equal(JSON.stringify(r.removed), '{"__proto__":["' + X + '"]}');
  assert.equal(Object.getPrototypeOf(r.removed), null);
  // 地址级不受影响
  assert.deepEqual(d.newAddrs, [X]);
  assert.deepEqual(d.goneAddrs, [Y]);
  // 普通链键的输出形状不变：Object.keys / JSON.stringify
  const n = O.diffHoldings({ eth: [Y] }, { eth: [Y, X], bsc: [X] });
  assert.deepEqual(Object.keys(n.added), ['eth', 'bsc']);
  assert.equal(JSON.stringify(n.added), JSON.stringify({ eth: [X], bsc: [X] }));
});
test('P11) buildIndex：holdingsByChain / victimsByChain / reviewedCounts 保留 "__proto__" 键', () => {
  const X = '0x' + 'ab'.repeat(20);
  const s = { holdings: JSON.parse('{"__proto__":["' + X + '"],"eth":["' + X + '"]}'), victims: JSON.parse('{"__proto__":["' + X + '"]}'),
    reviewed: { ok: true, items: [{ address: X, chain: 'EVM', category: '__proto__', verdict: 'not_attacker' }] } };
  const st = O.buildIndex(s).stats;
  assert.deepEqual(Object.keys(st.holdingsByChain).sort(), ['__proto__', 'eth']);
  assert.equal(st.holdingsByChain['__proto__'], 1);
  assert.deepEqual(Object.keys(st.victimsByChain), ['__proto__']);
  assert.equal(st.victimsByChain['__proto__'], 1);
  assert.deepEqual(Object.keys(st.reviewedCounts), ['__proto__'], 'reviewed 未带 counts 时按 category 统计，category 为 __proto__ 也不丢');
  assert.equal(st.reviewedCounts['__proto__'], 1);
  assert.equal(JSON.stringify(st.holdingsByChain), '{"__proto__":1,"eth":1}');
});

// ---------- h) describeGone / goneText ----------
const hx = n => '0x' + n.repeat(20);
const noReviewed = { ok: true, count: 0, counts: {}, items: [] };
const noCorr = { ok: true, corrections: [] };
test('h) describeGone：五种 kind 各一例（真实夹具，14:59 index）+ goneText 文案', () => {
  const corr = cur.holdings_corrections.corrections[0];
  const c = O.describeGone(idx, O.normAddr(corr.addresses[0]));
  assert.deepEqual(c, { kind: 'correction', id: '20260928-btc', csv: '/api/holdings/corrections/20260928-btc.csv' });
  assert.equal(O.goneText(c), '官方勘误移除（20260928-btc）：官方要求从黑名单移除');
  assert.ok(O.goneText(c).includes('官方要求从黑名单移除'));

  const rv = O.describeGone(idx, 'cosmos14r2cn7f5ztntkm3w07z3xmre6yay2zrvtjwhg6');
  assert.deepEqual(rv, { kind: 'reviewed_not_attacker', category: 'vault' });
  assert.equal(O.goneText(rv), '官方已核查为非攻击者（协议金库）');

  const V = '0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23';
  const v = O.describeGone(idx, V);
  assert.equal(v.kind, 'victim');
  assert.deepEqual(v.chains, idx.byAddr.get(V).victims);
  assert.ok(v.chains.includes('eth'));
  assert.equal(O.goneText(v), '已从攻击者名单移到官方受害钱包名单');

  const sl = O.describeGone(idx, '0x98c8a42a20ead5282302aed32bf813702e9a8c86');
  assert.deepEqual(sl, { kind: 'still_listed', chains: ['arb'] });
  assert.equal(O.goneText(sl), '改列到 ARB，仍在官方名单');

  const R = '0x9f3c5a7e1b2d4680aceb13579bdf02468ace1357';
  assert.equal(idx.byAddr.has(R), false, '随机地址不在夹具里');
  const u = O.describeGone(idx, R);
  assert.deepEqual(u, { kind: 'unknown' });
  assert.equal(O.goneText(u), '从官方名单消失，官方未说明原因（官方称名单只增不减），请先到官方看板核实，不要直接撤下');

  // 文案约束：除 correction 外不含"从黑名单移除""应从黑名单撤下"；所有文案不含"官方核实"
  const all = [c, rv, v, sl, u, ...['vault', 'cex', 'arb', 'user', 'poison', 'zzz', null].map(category => ({ kind: 'reviewed_not_attacker', category })),
    { kind: 'still_listed', chains: ['eth', 'arb'] }, { kind: 'victim', chains: [] }, null, {}, { kind: 'nope' }];
  for (const info of all) {
    const t = O.goneText(info), tag = JSON.stringify(info) + ' → ' + t;
    assert.equal(typeof t, 'string', tag);
    assert.ok(t.length > 0, tag);
    assert.ok(!t.includes('官方核实'), tag);
    if (info && info.kind === 'correction') continue;
    assert.ok(!t.includes('从黑名单移除'), tag);
    assert.ok(!t.includes('应从黑名单撤下'), tag);
  }
});
test('h) goneText：分类中文、未知分类原样、多链用 / 连接、未知 kind 按 unknown 处理', () => {
  const rn = category => O.goneText({ kind: 'reviewed_not_attacker', category });
  assert.equal(rn('vault'), '官方已核查为非攻击者（协议金库）');
  assert.equal(rn('cex'), '官方已核查为非攻击者（交易所）');
  assert.equal(rn('arb'), '官方已核查为非攻击者（套利者）');
  assert.equal(rn('user'), '官方已核查为非攻击者（无关用户）');
  assert.equal(rn('poison'), '官方已核查为非攻击者（投毒地址）');
  assert.equal(rn('zzz'), '官方已核查为非攻击者（zzz）');
  assert.equal(rn('__proto__'), '官方已核查为非攻击者（__proto__）', '分类查表不吃原型链');
  assert.equal(rn('constructor'), '官方已核查为非攻击者（constructor）');
  assert.equal(O.goneText({ kind: 'still_listed', chains: ['eth', 'arb', 'tia'] }), '改列到 ETH/ARB/TIA，仍在官方名单');
  const unk = O.goneText({ kind: 'unknown' });
  for (const bad of [null, undefined, {}, { kind: 'nope' }]) assert.equal(O.goneText(bad), unk);
  for (const s of ['官方未说明原因', '官方称名单只增不减', '官方看板', '不要直接撤下']) assert.ok(unk.includes(s), s);
});
test('h) describeGone：优先级 correction > reviewed_not_attacker > victim > still_listed；无匹配 / 空索引 / 大小写输入', () => {
  const X = hx('c1');
  const mk = o => O.buildIndex(mkSnap({ holdings: { eth: [X], arb: [X] }, victims: { bsc: [X] }, reviewed: noReviewed, corrections: noCorr, ...o }));
  const rvItem = { address: X, chain: 'EVM', category: 'cex', verdict: 'not_attacker' };
  const corr = { ok: true, corrections: [{ id: 'k1', chain: 'eth', csv: '/k1.csv', addresses: [X] }, { id: 'k2', chain: 'eth', addresses: [X] }] };
  const rvs = { ok: true, items: [rvItem] };
  assert.deepEqual(O.describeGone(mk({ reviewed: rvs, corrections: corr }), X), { kind: 'correction', id: 'k1', csv: '/k1.csv' }, '多条勘误取第一条');
  assert.deepEqual(O.describeGone(mk({ reviewed: rvs }), X), { kind: 'reviewed_not_attacker', category: 'cex' });
  assert.deepEqual(O.describeGone(mk(), X), { kind: 'victim', chains: ['bsc'] });
  assert.deepEqual(O.describeGone(mk({ victims: {} }), X), { kind: 'still_listed', chains: ['eth', 'arb'] });
  assert.equal(O.goneText(O.describeGone(mk({ victims: {} }), X)), '改列到 ETH/ARB，仍在官方名单');
  // 勘误没有 csv → csv 为 null
  assert.deepEqual(O.describeGone(mk({ corrections: { ok: true, corrections: [{ id: 'k2', chain: 'eth', addresses: [X] }] } }), X), { kind: 'correction', id: 'k2', csv: null });
  // reviewed 里是 attacker_related 不算 reviewed_not_attacker
  assert.equal(O.describeGone(mk({ reviewed: { ok: true, items: [{ ...rvItem, verdict: 'attacker_related', category: 'attacker' }] } }), X).kind, 'victim');
  assert.deepEqual(O.describeGone(mk({ victims: {}, holdings: {}, reviewed: { ok: true, items: [{ ...rvItem, verdict: 'attacker_related' }] } }), X), { kind: 'unknown' });
  // 空索引 / null / 大小写
  for (const i of [null, undefined, {}, O.buildIndex(null), O.buildIndex({ holdings: { eth: [hx('d4')] } })]) assert.deepEqual(O.describeGone(i, X), { kind: 'unknown' });
  assert.deepEqual(O.describeGone(mk({ victims: {} }), '0x' + 'C1'.repeat(20)), { kind: 'still_listed', chains: ['eth', 'arb'] });
  // 返回的 chains 是副本，改它不影响索引
  const i2 = mk({ victims: {} });
  O.describeGone(i2, X).chains.push('zzz');
  assert.deepEqual(i2.byAddr.get(X).holdings, ['eth', 'arb']);
});

// ---------- i) contentSig ----------
const upperKnown = a => (['evm', 'bech32'].includes(O.addrKind(a)) ? a.toUpperCase() : a);
const shuffled = m => Object.fromEntries(Object.keys(m).reverse().map(c => [c, m[c].slice().reverse().map(upperKnown)]));
test('i) contentSig：8 位小写十六进制；同内容不同顺序 / 不同大小写 EVM(bech32) → 相同；base58 大小写不同 → 不同', () => {
  const s0 = O.contentSig(snap);
  assert.match(s0, /^[0-9a-f]{8}$/);
  assert.equal(O.contentSig(snap), s0, '同一输入两次结果一致');
  const s1 = mkSnap({ holdings: shuffled(cur.holdings), victims: shuffled(cur.victims) });
  assert.notDeepEqual(s1.holdings.eth.slice(0, 3), cur.holdings.eth.slice(0, 3), '夹具确实被打乱、改了大小写');
  assert.equal(O.contentSig(s1), s0);
  // reviewed.items 顺序不同 → 相同；corrections 顺序不同 → 相同
  assert.equal(O.contentSig(mkSnap({ reviewed: { ...cur.reviewed, items: cur.reviewed.items.slice().reverse() } })), s0);
  const c2 = { ok: true, corrections: [{ id: 'a', count: 1, addresses: ['x'] }, { id: 'b', count: 2, addresses: ['y', 'z'] }] };
  assert.equal(O.contentSig(mkSnap({ corrections: c2 })), O.contentSig(mkSnap({ corrections: { ok: true, corrections: c2.corrections.slice().reverse() } })));
  // base58 大小写敏感：tron 地址转小写是另一个地址
  const t = cur.holdings.tron[0];
  assert.notEqual(O.contentSig(mkSnap({ holdings: { ...cur.holdings, tron: [t.toLowerCase(), ...cur.holdings.tron.slice(1)] } })), s0);
  assert.equal(O.contentSig(null), '');
  assert.equal(O.contentSig(undefined), '');
  assert.equal(O.contentSig([]), '');
  assert.match(O.contentSig({}), /^[0-9a-f]{8}$/);
});
test('i) contentSig：snap_ts / fetched_at / chains / label / maintenance / frozen / history 变化 → 相同', () => {
  const s0 = O.contentSig(snap);
  for (const o of [{ snap_ts: 1790751566 }, { snap_ts: 5, fetched_at: '2020-01-01T00:00:00.000Z' }, { chains: { ok: true, items: [{ id: 'eth' }] } }, { chains: null },
    { label: '别的', frozen: true, history: [{ t: 1 }] }, { maintenance: { ok: true, on: true, mode: 'freeze' } }, { source: 'file://x' }])
    assert.equal(O.contentSig(mkSnap(o)), s0, JSON.stringify(o).slice(0, 60));
});
test('i) contentSig：holdings / victims 内容变化 → 不同（含 "__proto__" 链键）', () => {
  const s0 = O.contentSig(snap), X = hx('e1');
  assert.notEqual(O.contentSig(mkSnap({ holdings: { ...cur.holdings, eth: [...cur.holdings.eth, X] } })), s0);
  assert.notEqual(O.contentSig(mkSnap({ holdings: { ...cur.holdings, eth: cur.holdings.eth.slice(1) } })), s0);
  assert.notEqual(O.contentSig(mkSnap({ victims: { ...cur.victims, eth: [...cur.victims.eth, X] } })), s0);
  // 同一地址从 holdings 挪到 victims 也算变化
  assert.notEqual(O.contentSig(mkSnap({ holdings: { eth: [X] }, victims: {} })), O.contentSig(mkSnap({ holdings: {}, victims: { eth: [X] } })));
  // 换链算变化
  assert.notEqual(O.contentSig(mkSnap({ holdings: { eth: [X] } })), O.contentSig(mkSnap({ holdings: { arb: [X] } })));
  const evil = a => JSON.parse('{"__proto__":' + JSON.stringify(a) + '}');
  assert.notEqual(O.contentSig(mkSnap({ holdings: evil([X]) })), O.contentSig(mkSnap({ holdings: evil([hx('e2')]) })));
  assert.notEqual(O.contentSig(mkSnap({ holdings: evil([X]) })), O.contentSig(mkSnap({ holdings: {} })));
});
test('i) contentSig：S13 holdings / victims 每条链 JSON.stringify([链, 排序后的归一化地址]) 再哈希 —— 链键与地址不再混流（{a:["@b"]} 与 {a:[], b:[]} 签名不同）', () => {
  const sig = (h, v) => O.contentSig({ holdings: h, victims: v });
  assert.notEqual(sig({ a: ['@b'] }, {}), sig({ a: [], b: [] }, {}), 'holdings：地址 "@b" 与链 b 不撞');
  assert.notEqual(sig({}, { a: ['@b'] }), sig({}, { a: [], b: [] }), 'victims 同理');
  // 同一链内：地址顺序 / EVM 大小写仍无关，空链键仍有区别
  assert.equal(sig({ eth: [hx('e1'), hx('e2')] }, {}), sig({ eth: [hx('e2'), '0x' + 'E1'.repeat(20)] }, {}));
  assert.notEqual(sig({ a: [] }, {}), sig({}, {}), '多一条空链键，签名不同');
  assert.match(sig({ a: ['@b'] }, {}), /^[0-9a-f]{8}$/);
});
test('i) contentSig：reviewed 某条 verdict / category / address 变化但 count 与 updated_ts 不变 → 不同（P9）', () => {
  const s0 = O.contentSig(snap);
  const variants = [it => { it.verdict = it.verdict === 'not_attacker' ? 'attacker_related' : 'not_attacker'; }, it => { it.category = it.category + 'x'; }, it => { it.address = hx('f7'); }];
  for (const f of variants) {
    const rv = structuredClone(cur.reviewed);
    f(rv.items[0]);
    assert.equal(rv.count, cur.reviewed.count);
    assert.equal(rv.updated_ts, cur.reviewed.updated_ts);
    assert.equal(rv.items.length, cur.reviewed.items.length);
    assert.notEqual(O.contentSig(mkSnap({ reviewed: rv })), s0);
  }
  // R8：name / note / chain / reviewed_ts 也参与签名（专项测试见 R8 小节）
  const rv2 = structuredClone(cur.reviewed);
  rv2.items[0].note = '改了备注';
  assert.notEqual(O.contentSig(mkSnap({ reviewed: rv2 })), s0);
});
test('i) contentSig：corrections 地址数变化（id 与 count 不变）→ 不同；count / id 变化 → 不同（P9）', () => {
  const s0 = O.contentSig(snap);
  const c = structuredClone(cur.holdings_corrections);
  c.corrections[0].addresses = c.corrections[0].addresses.slice(0, -1);
  assert.equal(c.corrections[0].count, cur.holdings_corrections.corrections[0].count);
  assert.equal(c.corrections[0].id, cur.holdings_corrections.corrections[0].id);
  assert.notEqual(O.contentSig(mkSnap({ corrections: c })), s0);
  const c2 = structuredClone(cur.holdings_corrections);
  c2.corrections[0].count += 1;
  assert.notEqual(O.contentSig(mkSnap({ corrections: c2 })), s0);
  const c3 = structuredClone(cur.holdings_corrections);
  c3.corrections[0].id = 'other';
  assert.notEqual(O.contentSig(mkSnap({ corrections: c3 })), s0);
  assert.notEqual(O.contentSig(mkSnap({ corrections: noCorr })), s0);
  // R8：地址内容换了但个数没变 → 也算变化（地址列表哈希）
  const c4 = structuredClone(cur.holdings_corrections);
  c4.corrections[0].addresses[0] = hx('f8');
  assert.notEqual(O.contentSig(mkSnap({ corrections: c4 })), s0);
});

// ---------- j) isFrozen + fetchAll 冻结 / block 判定 ----------
test('j) isFrozen：{on:false, mode:"freeze"} → false；{on:true, mode:"freeze"} → true；响应头 true → true', () => {
  assert.equal(O.isFrozen({ on: false, mode: 'freeze' }, false), false);
  assert.equal(O.isFrozen({ on: false, mode: 'freeze' }), false);
  assert.equal(O.isFrozen({ on: true, mode: 'freeze' }, false), true);
  assert.equal(O.isFrozen({ on: true, mode: 'freeze' }), true);
  assert.equal(O.isFrozen(null, true), true);
  assert.equal(O.isFrozen({ on: false, mode: null }, true), true);
  assert.equal(O.isFrozen({ on: true, mode: 'block' }, false), false);
  assert.equal(O.isFrozen({ on: true, mode: null }, false), false);
  for (const m of [null, undefined, {}, cur.maintenance]) assert.equal(O.isFrozen(m, false), false);
  assert.equal(O.isFrozen(null, 'freeze'), false, '头标志必须严格为 true');
  assert.equal(O.isFrozen(null, 1), false);
  assert.equal(O.isFrozen(null, undefined), false);
  assert.equal(typeof O.isFrozen({ on: 1, mode: 'freeze' }, false), 'boolean');
  assert.equal(O.isFrozen({ on: 1, mode: 'freeze' }, false), true);
});
test('f) fetchAll：maintenance {on:false, mode:"freeze"} 不算冻结 → live，snap.frozen 为 false；响应头 freeze 仍算冻结（P10）', async () => {
  const off = { ok: true, on: false, mode: 'freeze', since: null, frozen_ts: null, msg_zh: '', msg_en: '' };
  const r = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes(off) })) });
  assert.equal(r.mode, 'live');
  assert.equal(r.snap.frozen, false);
  assert.deepEqual(r.snap.maintenance, off);
  // 头标志仍然生效，即使 on:false
  const h = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes(off) }, { 'x-snap-ts': '1', 'x-maintenance': 'freeze' })) });
  assert.equal(h.mode, 'freeze');
  assert.equal(h.snap.frozen, true);
  // on:true + freeze → freeze
  const on = await O.fetchAll({ fetchImpl: fakeFetch(okRoutes({ '/api/maintenance': jsonRes({ ...off, on: true, frozen_ts: 1 }) })) });
  assert.equal(on.mode, 'freeze');
  assert.equal(on.snap.frozen, true);
});
test('f) fetchAll：block 判定 —— on 为真且 mode=block 才算；{on:false, mode:"block"} 不算；维护接口 503 仍是 block（P5）', async () => {
  const f0 = fakeFetch(okRoutes({ '/api/maintenance': jsonRes({ ok: true, on: false, mode: 'block' }) }));
  const r0 = await O.fetchAll({ fetchImpl: f0 });
  assert.equal(r0.mode, 'live');
  assert.equal(f0.calls.length, 6);
  const f1 = fakeFetch(okRoutes({ '/api/maintenance': jsonRes({ ok: true, on: 1, mode: 'block' }) }));
  const r1 = await O.fetchAll({ fetchImpl: f1 });
  assert.equal(r1.mode, 'block', 'on 为真值（非严格 true）也算');
  assert.equal(r1.snap, null);
  assert.deepEqual(f1.calls, ['/api/maintenance']);
  const f2 = fakeFetch(okRoutes({ '/api/maintenance': jsonRes({ error: 'x' }, { status: 503 }) }));
  const r2 = await O.fetchAll({ fetchImpl: f2 });
  assert.equal(r2.mode, 'block');
  assert.equal(r2.snap, null);
  assert.deepEqual(f2.calls, ['/api/maintenance']);
});

// ---------- k) reduceOfficial ----------
const RED_KEYS = ['alerted', 'base', 'display', 'lastErrors', 'lastMode', 'shrinkKey', 'shrinkStreak', 'source', 'staleStreak', 'unknownStreak'];
const mkS = (holdings, snap_ts = null, extra = {}) => ({
  schema: 'suliu.official-snapshot/v1', snap_ts, fetched_at: '2026-09-30T00:00:00.000Z', holdings,
  victims: { eth: [hx('bb')] }, reviewed: { ok: true, updated_ts: 1, count: 1, items: [{ address: hx('cc'), verdict: 'not_attacker', category: 'cex' }] },
  corrections: { ok: true, corrections: [] }, ...extra
});
const liveR = (s, errors = []) => ({ mode: 'live', snap: { ...s, frozen: false }, errors });
const freezeR = (s, errors = []) => ({ mode: 'freeze', snap: { ...s, frozen: true }, errors });
const st0 = (disp, o = {}) => ({ display: disp, base: disp, source: 'offline', alerted: [], staleStreak: 0, lastErrors: [], lastMode: null, ...o });
const evTypes = r => r.events.map(e => e.type);
const countIn = (results, key, addr) => results.reduce((n, r) => n + r.events.filter(e => e.type === 'diff').reduce((m, e) => m + e[key].filter(a => a === addr).length, 0), 0);

test('k) S1：live L1 → 冻结 F（比 L1 多 X1）→ live L2（含 X1）：冻结轮不 diff、base 不变，X1 恰在 L2 告警一次', () => {
  const X0 = hx('a0'), X1 = hx('a1');
  const L1 = mkS({ eth: [X0] }, 100), F = mkS({ eth: [X0, X1] }, 105), L2 = mkS({ eth: [X0, X1] }, 120);
  const r1 = O.reduceOfficial(st0(L1), freezeR(F));
  assert.deepEqual(r1.events, [{ type: 'frozen' }]);
  assert.deepEqual(Object.keys(r1.state).sort(), RED_KEYS);
  assert.deepEqual(r1.state.base, L1, '冻结快照不作为基线');
  assert.deepEqual(r1.state.display.holdings, F.holdings, '冻结快照用于显示');
  assert.equal(r1.state.display.frozen, true);
  assert.equal(r1.state.source, 'freeze');
  assert.deepEqual(r1.state.alerted, []);
  assert.equal(r1.state.lastMode, 'freeze');
  assert.equal(r1.dirty, true);
  const r2 = O.reduceOfficial(r1.state, liveR(L2));
  assert.deepEqual(evTypes(r2), ['diff']);
  assert.deepEqual(r2.events[0].alertNew, [X1]);
  assert.deepEqual(r2.events[0].alertGone, []);
  assert.equal(r2.events[0].diff.newCount, 1);
  assert.deepEqual(r2.state.alerted, ['n:' + X1]);
  assert.equal(r2.state.source, 'live');
  assert.equal(r2.state.lastMode, 'live');
  assert.deepEqual(r2.state.base.holdings, L2.holdings);
  assert.deepEqual(r2.state.display.holdings, L2.holdings);
  assert.equal(r2.dirty, false, '冻结内容与恢复后内容相同，画布不必重画');
  const r3 = O.reduceOfficial(r2.state, liveR(mkS(L2.holdings, 130)));
  assert.deepEqual(r3.events, []);
  assert.equal(countIn([r1, r2, r3], 'alertNew', X1), 1, 'X1 总共只告警一次');
});
test('k) S2：L1 → L2（新增 X2，告警）→ 冻结 F（旧内容、snap_ts 为 null）→ live L3（同 L2）：X2 只告警一次，且没有假"消失"', () => {
  const X0 = hx('a0'), X2 = hx('a2');
  const L1 = mkS({ eth: [X0] }, 100), L2 = mkS({ eth: [X0, X2] }, 110), F = mkS({ eth: [X0] }, null), L3 = mkS({ eth: [X0, X2] }, 130);
  const r1 = O.reduceOfficial(st0(L1), liveR(L2));
  assert.deepEqual(r1.events[0].alertNew, [X2]);
  const r2 = O.reduceOfficial(r1.state, freezeR(F));
  assert.deepEqual(r2.events, [{ type: 'frozen' }]);
  assert.deepEqual(r2.state.base.holdings, L2.holdings, '基线仍是冻结前的 L2');
  assert.deepEqual(r2.state.display.holdings, F.holdings);
  const r3 = O.reduceOfficial(r2.state, liveR(L3));
  assert.deepEqual(r3.events, [], '恢复后与基线 L2 相同：无 diff、无告警');
  assert.equal(countIn([r1, r2, r3], 'alertNew', X2), 1);
  assert.equal(countIn([r1, r2, r3], 'alertGone', X2), 0);
  assert.deepEqual(r3.state.alerted, ['n:' + X2]);
  assert.equal(r3.dirty, true, '显示从冻结旧内容回到含 X2 的内容');
});
test('k) 冻结判定：res.mode=freeze 或 res.snap.frozen=true 都走冻结分支；冻结不改 alerted / staleStreak / base；无基线时冻结快照也不当基线', () => {
  const A = hx('a0'), L1 = mkS({ eth: [A] }, 100), F = mkS({ eth: [A, hx('a1')] }, 90);
  const s = st0(L1, { alerted: ['n:x'], staleStreak: 2 });
  for (const res of [freezeR(F), { mode: 'live', snap: { ...F, frozen: true }, errors: [] }, { mode: 'freeze', snap: { ...F }, errors: [] }]) {
    const r = O.reduceOfficial(s, res);
    assert.deepEqual(r.events, [{ type: 'frozen' }]);
    assert.equal(r.state.source, 'freeze');
    assert.deepEqual(r.state.base, L1);
    assert.deepEqual(r.state.alerted, ['n:x']);
    assert.equal(r.state.staleStreak, 2, '冻结旧于基线也不算"旧快照"（P8）');
  }
  const r0 = O.reduceOfficial(st0(null), freezeR(F));
  assert.equal(r0.state.base, null);
  assert.deepEqual(r0.state.display.holdings, F.holdings);
  assert.equal(r0.dirty, true);
  // 冻结轮更新 lastErrors
  assert.deepEqual(O.reduceOfficial(s, freezeR(F, [{ endpoint: 'victims', status: 500, message: 'x' }])).state.lastErrors, [{ endpoint: 'victims', status: 500, message: 'x' }]);
});
test('k) S3：旧快照（base snap_ts 100，res 90）连续三次非 manual → 前两次 stale_ignored，第三次 stale_accepted；不 diff、不告警；manual 第一次就接受', () => {
  const A = hx('a0'), B = hx('a1');
  const L1 = mkS({ eth: [A, B] }, 100), OLD = mkS({ eth: [A] }, 90);
  const r1 = O.reduceOfficial(st0(L1), liveR(OLD));
  assert.deepEqual(r1.events, [{ type: 'stale_ignored', streak: 1 }]);
  assert.deepEqual(r1.state.display, L1);
  assert.deepEqual(r1.state.base, L1);
  assert.equal(r1.state.staleStreak, 1);
  assert.equal(r1.dirty, false);
  const r2 = O.reduceOfficial(r1.state, liveR(OLD));
  assert.deepEqual(r2.events, [{ type: 'stale_ignored', streak: 2 }]);
  assert.deepEqual(r2.state.base, L1);
  assert.equal(r2.state.staleStreak, 2);
  const r3 = O.reduceOfficial(r2.state, liveR(OLD));
  assert.deepEqual(r3.events, [{ type: 'stale_accepted', rolledBack: [B] }]);
  assert.deepEqual(r3.state.display.holdings, OLD.holdings);
  assert.deepEqual(r3.state.base.holdings, OLD.holdings);
  assert.equal(r3.state.base.snap_ts, 90);
  assert.equal(r3.state.staleStreak, 0);
  assert.equal(r3.state.source, 'live');
  assert.deepEqual(r3.state.alerted, ['n:' + B], '接受回退不产生"消失"告警（B 没有 g: 记录）；回退掉的 B 以 n: 预写入，回来时不再当新增告警（R3）');
  assert.equal(r3.dirty, true);
  // 接受之后同样的快照不再是旧快照：无事件
  const r4 = O.reduceOfficial(r3.state, liveR(OLD));
  assert.deepEqual(r4.events, []);
  // manual：第一次就接受
  const m = O.reduceOfficial(st0(L1), liveR(OLD), { manual: true });
  assert.deepEqual(m.events, [{ type: 'stale_accepted', rolledBack: [B] }]);
  assert.equal(m.state.base.snap_ts, 90);
  assert.equal(m.state.staleStreak, 0);
  assert.deepEqual(m.state.alerted, ['n:' + B]);
  // 中途来了一个正常快照 → 连击清零
  const n1 = O.reduceOfficial(st0(L1), liveR(OLD));
  const n2 = O.reduceOfficial(n1.state, liveR(mkS({ eth: [A, B] }, 110)));
  assert.equal(n2.state.staleStreak, 0);
  assert.deepEqual(n2.events, []);
  // 任一侧 snap_ts 为空 → 不算旧快照
  assert.deepEqual(evTypes(O.reduceOfficial(st0(L1), liveR(mkS({ eth: [A] }, null)))), ['diff']);
  assert.deepEqual(evTypes(O.reduceOfficial(st0(mkS({ eth: [A, B] }, null)), liveR(mkS({ eth: [A] }, 5)))), ['diff']);
  // snap_ts 相等 → 不算旧
  assert.deepEqual(evTypes(O.reduceOfficial(st0(L1), liveR(mkS({ eth: [A] }, 100)))), ['diff']);
});
test('k) S4：block / error 不改 display / base / source / alerted，只更新 lastErrors / lastMode，事件带 errors', () => {
  const L1 = mkS({ eth: [hx('a0')] }, 100);
  const s = st0(L1, { alerted: ['n:x'], staleStreak: 1, source: 'live' });
  const errs = [{ endpoint: 'maintenance', status: 503, message: 'HTTP 503' }];
  for (const mode of ['block', 'error']) {
    const r = O.reduceOfficial(s, { mode, snap: null, errors: errs });
    assert.deepEqual(r.events, [{ type: mode, errors: errs }], mode);
    assert.deepEqual(r.state.display, L1);
    assert.deepEqual(r.state.base, L1);
    assert.equal(r.state.source, 'live');
    assert.deepEqual(r.state.alerted, ['n:x']);
    assert.equal(r.state.staleStreak, 1);
    assert.equal(r.state.lastMode, mode);
    assert.deepEqual(r.state.lastErrors, errs);
    assert.equal(r.dirty, false);
  }
  // 显示为空时 block 也不 dirty；缺 errors 字段不抛错
  const r0 = O.reduceOfficial(st0(null), { mode: 'block', snap: null });
  assert.equal(r0.dirty, false);
  assert.deepEqual(r0.events, [{ type: 'block', errors: [] }]);
  assert.equal(r0.state.display, null);
  // 之后的 live 照常更新 lastMode / lastErrors
  const r1 = O.reduceOfficial(r0.state, liveR(L1, [{ endpoint: 'reviewed', status: 500, message: 'x' }]));
  assert.equal(r1.state.lastMode, 'live');
  assert.deepEqual(r1.state.lastErrors, [{ endpoint: 'reviewed', status: 500, message: 'x' }]);
  assert.equal(r1.dirty, true);
});
test('k) S5：alerted 上限 20000，先进先出淘汰（新增地址与消失地址都记入）', () => {
  const old20k = Array.from({ length: 20000 }, (_, i) => 'n:old' + i);
  const A = hx('a0'), N1 = hx('a1'), N2 = hx('a2'), N3 = hx('a3');
  const L1 = mkS({ eth: [A, N3] }, 100);
  const r = O.reduceOfficial(st0(L1, { alerted: old20k }), liveR(mkS({ eth: [A, N1, N2] }, 110)));
  assert.deepEqual(r.events[0].alertNew, [N1, N2]);
  assert.deepEqual(r.events[0].alertGone, [N3]);
  assert.equal(r.state.alerted.length, 20000);
  assert.equal(r.state.alerted[0], 'n:old3', '最早的 3 条被淘汰');
  assert.ok(!r.state.alerted.includes('n:old0') && !r.state.alerted.includes('n:old2'));
  assert.deepEqual(r.state.alerted.slice(-3), ['n:' + N1, 'n:' + N2, 'g:' + N3]);
  assert.equal(old20k.length, 20000);
  // 传进来的 alerted 超过上限（旧版本存的 / 别处并进来的）：先截到最后 20000 条
  const over = Array.from({ length: 20050 }, (_, i) => 'n:o' + i);
  const ro = O.reduceOfficial(st0(mkS({ eth: [A] }, 100), { alerted: over }), liveR(mkS({ eth: [A] }, 101)));
  assert.equal(ro.state.alerted.length, 20000);
  assert.equal(ro.state.alerted[0], 'n:o50');
  // 一次新增 20100 个：alertNew 不截断，alerted 只保留最后 20000
  const many = Array.from({ length: 20100 }, (_, i) => '0x' + i.toString(16).padStart(40, '0'));
  const r2 = O.reduceOfficial(st0(mkS({ eth: [A] }, 100)), liveR(mkS({ eth: [A, ...many] }, 110)));
  assert.equal(r2.events[0].alertNew.length, 20100);
  assert.equal(r2.state.alerted.length, 20000);
  assert.equal(r2.state.alerted[0], 'n:' + many[100]);
  assert.equal(r2.state.alerted[19999], 'n:' + many[20099]);
  // 已被淘汰的记录可以再次告警；仍在记录里的不会
  const r3 = O.reduceOfficial(st0(mkS({ eth: [A] }, 120), { alerted: r2.state.alerted }), liveR(mkS({ eth: [A, many[0], many[20099]] }, 130)));
  assert.deepEqual(r3.events[0].alertNew, [many[0]]);
});
test('k) alerted 去重：n: 与 g: 互相独立；回来（新增，n: 已预写不再告警）只摘掉 g:，S2 重新布防：消失(告警)→回来→再消失，第二次消失会再告警', () => {
  const A = hx('a0'), X = hx('a1');
  const seq = [mkS({ eth: [A, X] }, 110), mkS({ eth: [A] }, 120), mkS({ eth: [A, X] }, 130), mkS({ eth: [A] }, 140)];
  let s = st0(mkS({ eth: [A] }, 100)); const rs = [];
  for (const sn of seq) { const r = O.reduceOfficial(s, liveR(sn)); rs.push(r); s = r.state; }
  // 语义变化（S2）：第 4 轮原来是 [0, 0]（g:X 还在 alerted 里，再次消失不告警），现在 X 回来那一轮已摘掉 g:X，所以第 4 轮是 [0, 1]
  assert.deepEqual(rs.map(r => r.events.map(e => [e.alertNew.length, e.alertGone.length])), [[[1, 0]], [[0, 1]], [[0, 0]], [[0, 1]]]);
  assert.deepEqual(rs[1].state.alerted, ['n:' + X, 'g:' + X]);
  assert.deepEqual(rs[2].state.alerted, ['n:' + X], '回来那一轮：g:X 被摘掉，n:X 保留');
  assert.deepEqual(rs[2].events[0].diff.newAddrs, [X], 'diff 本身仍如实报告');
  assert.deepEqual(rs[3].events[0].diff.goneAddrs, [X]);
  assert.deepEqual(rs[3].events[0].alertGone, [X], '第二次消失重新告警');
  assert.deepEqual(s.alerted, ['n:' + X, 'g:' + X]);
  // 大小写：EVM 大写写法与小写视为同一地址
  const up = '0x' + 'A1'.repeat(20);
  const r = O.reduceOfficial(st0(mkS({ eth: [A] }, 100), { alerted: ['n:' + X] }), liveR(mkS({ eth: [A, up] }, 110)));
  assert.deepEqual(r.events[0].alertNew, []);
  assert.equal(r.events[0].diff.newCount, 1);
});
test('k) live 正常轮：base 为空 → display = base = snap 且不 diff；diff 事件只在有变化时出现（relisted / spread 也算变化）', () => {
  const A = hx('a0');
  const r0 = O.reduceOfficial(st0(null), liveR(mkS({ eth: [A] }, 100)));
  assert.deepEqual(r0.events, []);
  assert.deepEqual(r0.state.base.holdings, { eth: [A] });
  assert.deepEqual(r0.state.display.holdings, { eth: [A] });
  assert.equal(r0.state.source, 'live');
  assert.equal(r0.dirty, true);
  const r1 = O.reduceOfficial(st0(mkS({ eth: [A] }, 100)), liveR(mkS({ eth: [A] }, 101)));
  assert.deepEqual(r1.events, []);
  const rel = O.reduceOfficial(st0(mkS({ eth: [A, hx('a1')] }, 100)), liveR(mkS({ eth: [hx('a1')], arb: [A] }, 101)));
  assert.deepEqual(evTypes(rel), ['diff']);
  assert.equal(rel.events[0].diff.relistedCount, 1);
  assert.deepEqual(rel.events[0].alertNew, []);
  assert.deepEqual(rel.events[0].alertGone, []);
  const spr = O.reduceOfficial(st0(mkS({ eth: [A] }, 100)), liveR(mkS({ eth: [A], arb: [A] }, 101)));
  assert.equal(spr.events[0].diff.spreadCount, 1);
  // 真实夹具：12:55 → 14:59 新增 12 个
  const rf = O.reduceOfficial(st0(mkSnap({ holdings: old.holdings, snap_ts: 100 })), liveR(mkSnap({ snap_ts: 200 })));
  assert.equal(rf.events[0].alertNew.length, 12);
  assert.deepEqual(rf.events[0].alertGone, []);
  assert.equal(rf.state.alerted.length, 12);
});
test('k) S6：dirty —— 只有 snap_ts 变化 → false；holdings 变化 → true；display 从 null 到有 → true；reviewed / corrections 内容变化 → true', () => {
  const A = hx('a0'), B = hx('a1');
  const L1 = mkS({ eth: [A] }, 100);
  assert.equal(O.reduceOfficial(st0(L1), liveR(mkS({ eth: [A] }, 200, { fetched_at: '2027-01-01T00:00:00.000Z', chains: { ok: true, items: [1] } }))).dirty, false);
  assert.equal(O.reduceOfficial(st0(L1), liveR(mkS({ eth: [A, B] }, 200))).dirty, true);
  assert.equal(O.reduceOfficial(st0(null), liveR(L1)).dirty, true);
  assert.equal(O.reduceOfficial(st0(null), { mode: 'error', snap: null, errors: [] }).dirty, false, '两边都空 → false');
  // 冻结同内容 → display 换了对象但内容一样 → false
  assert.equal(O.reduceOfficial(st0(L1), freezeR(mkS({ eth: [A] }, null))).dirty, false);
  // reviewed verdict 变、count 与 updated_ts 不变
  const rvChanged = mkS({ eth: [A] }, 200, { reviewed: { ok: true, updated_ts: 1, count: 1, items: [{ address: hx('cc'), verdict: 'attacker_related', category: 'cex' }] } });
  assert.equal(O.reduceOfficial(st0(L1), liveR(rvChanged)).dirty, true);
  // corrections 地址数变、id 与 count 不变
  const corr = n => ({ ok: true, corrections: [{ id: 'k', count: 2, addresses: Array.from({ length: n }, (_, i) => hx(i.toString(16).padStart(2, '0'))) }] });
  assert.equal(O.reduceOfficial(st0(mkS({ eth: [A] }, 100, { corrections: corr(2) })), liveR(mkS({ eth: [A] }, 200, { corrections: corr(3) }))).dirty, true);
  // stale_ignored → 显示没变 → false
  assert.equal(O.reduceOfficial(st0(L1), liveR(mkS({ eth: [A, B] }, 50))).dirty, false);
});
test('k) S7：入参不被修改（state / res / opts 深拷贝前后比较），返回的 state 与 alerted 是新对象', () => {
  const A = hx('a0'), B = hx('a1'), C = hx('a2');
  const L1 = mkS({ eth: [A, B] }, 100), L2 = mkS({ eth: [A, C] }, 110), OLD = mkS({ eth: [A] }, 90), F = mkS({ eth: [A, B, C] }, null);
  const base = st0(L1, { alerted: ['n:zz', 'g:yy'], lastErrors: [{ endpoint: 'x', status: 1, message: 'm' }], staleStreak: 1, source: 'live', lastMode: 'live' });
  const cases = [
    [base, liveR(L2, [{ endpoint: 'reviewed', status: 500, message: 'x' }]), {}], [base, freezeR(F), {}], [base, liveR(OLD), {}], [base, liveR(OLD), { manual: true }],
    [{ ...base, staleStreak: 2 }, liveR(OLD), undefined], [base, { mode: 'block', snap: null, errors: [{ endpoint: 'maintenance', status: 503, message: 'x' }] }, {}],
    [base, { mode: 'error', snap: null, errors: [] }, {}], [st0(null), liveR(L1), {}], [null, liveR(L1), null], [undefined, freezeR(F), undefined]
  ];
  for (const [state, res, opts] of cases) {
    const sc = structuredClone(state), rc = structuredClone(res), oc = structuredClone(opts);
    const out = O.reduceOfficial(state, res, opts);
    assert.deepStrictEqual(state, sc);
    assert.deepStrictEqual(res, rc);
    assert.deepStrictEqual(opts, oc);
    assert.deepEqual(Object.keys(out).sort(), ['dirty', 'events', 'state']);
    assert.deepEqual(Object.keys(out.state).sort(), RED_KEYS);
    assert.ok(Array.isArray(out.state.alerted) && Array.isArray(out.state.lastErrors) && Array.isArray(out.events));
    assert.equal(typeof out.dirty, 'boolean');
    if (state) { assert.notEqual(out.state, state); assert.notEqual(out.state.alerted, state.alerted); assert.notEqual(out.state.lastErrors, state.lastErrors); }
  }
  // 事件里的 errors 是副本：改事件不影响 res
  const res = { mode: 'block', snap: null, errors: [{ endpoint: 'a' }] };
  const out = O.reduceOfficial(base, res);
  out.events[0].errors.push({ endpoint: 'b' });
  out.state.lastErrors.push({ endpoint: 'c' });
  assert.deepEqual(res.errors, [{ endpoint: 'a' }]);
});

// ---------- l) R3 / R4 / R5 / R8 / R11：回退预写 alerted、可疑收缩、维护未知、签名扩展、frozen === true ----------
const hexN = i => '0x' + i.toString(16).padStart(40, '0');
const addrsN = (n, off = 0) => Array.from({ length: n }, (_, i) => hexN(off + i + 1));
const unkR = (s, errors = []) => ({ ...liveR(s, errors), maintUnknown: true });
// 勘误告警键（S3）：'c:'+id+':'+FNV-1a32(该批消失地址排序后 '\n' 连接)；这里独立实现一份，不复用 lib 的哈希
const fnv32 = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const cKey = (id, addrs) => 'c:' + id + ':' + fnv32(addrs.slice().sort().join('\n'));

test('l) R3：接受回退 → rolledBack = 旧 base 有、新快照没有的地址（归一化、跨链合并、改列不算），以 n: 预写入 alerted；这些地址回来时不告警，真新增照常告警', () => {
  const A = hx('a0'), B = hx('a1'), C = hx('a2'), D = hx('a3'), X = hx('a9'), E = hx('a5');
  const UP = '0x' + 'A4'.repeat(20), up = '0x' + 'a4'.repeat(20);
  const L1 = mkS({ eth: [A, B, UP], arb: [C, D, E] }, 100);
  const OLD = mkS({ eth: [A, D], arb: [E] }, 90);   // arb 仍非空：不算缺链（缺链的回退见 Q4 的测试）
  const m = O.reduceOfficial(st0(L1), liveR(OLD), { manual: true });
  assert.deepEqual(m.events, [{ type: 'stale_accepted', rolledBack: [B, up, C] }], 'D 只是 arb→eth 改列，不算回退掉；UP 输出归一化写法');
  assert.deepEqual(m.state.alerted, ['n:' + B, 'n:' + up, 'n:' + C]);
  assert.deepEqual(m.state.base.holdings, OLD.holdings);
  assert.deepEqual(m.state.display.holdings, OLD.holdings);
  assert.equal(m.state.staleStreak, 0);
  // 回来时（外加一个真新增 X）：B / UP / C 不再当新增告警，X 照常告警；diff 本身仍如实报告
  const back = O.reduceOfficial(m.state, liveR(mkS({ eth: [A, D, B, UP, X], arb: [C, E] }, 110)));
  assert.deepEqual(evTypes(back), ['diff']);
  assert.deepEqual(back.events[0].alertNew, [X]);
  assert.deepEqual(back.events[0].alertGone, []);
  assert.deepEqual(back.events[0].diff.newAddrs.slice().sort(), [B, up, X, C].sort());
  assert.equal(back.state.alerted.filter(k => k === 'n:' + B).length, 1);
  assert.ok(back.state.alerted.includes('n:' + X));
  // 三次非 manual 的自然接受同样预写；alerted 里已有的 n: 记录不重复写入
  let s = st0(L1, { alerted: ['n:' + B] });
  const seq = [];
  for (let i = 0; i < 3; i++) { const r = O.reduceOfficial(s, liveR(OLD)); seq.push(r); s = r.state; }
  assert.deepEqual(seq.map(evTypes), [['stale_ignored'], ['stale_ignored'], ['stale_accepted']]);
  assert.deepEqual(seq[0].state.alerted, ['n:' + B], '忽略期间不动 alerted');
  assert.deepEqual(seq[2].events[0].rolledBack, [B, up, C]);
  assert.deepEqual(seq[2].state.alerted, ['n:' + B, 'n:' + up, 'n:' + C]);
  // 回退掉的地址为 0 个时：rolledBack 为 []，alerted 不变
  const none = O.reduceOfficial(st0(mkS({ eth: [A] }, 100), { alerted: ['n:z'] }), liveR(mkS({ eth: [A, B] }, 90)), { manual: true });
  assert.deepEqual(none.events, [{ type: 'stale_accepted', rolledBack: [] }]);
  assert.deepEqual(none.state.alerted, ['n:z']);
});

const KEEP = hx('a0'), G = addrsN(30);
const shrinkBase = () => mkS({ eth: [KEEP, ...G] }, 100);
const shrunk = (nGone, ts = 110, extra = {}) => mkS({ eth: [KEEP, ...G.slice(nGone)] }, ts, extra);

test('l) R4：无解释消失 > 20 个 → suspicious_shrink；display / base / source / alerted 都不动，不告警；恰好 20 个仍是正常 diff', () => {
  const L1 = shrinkBase(), X = hx('a9');
  const s0 = st0(L1, { alerted: ['n:x'], source: 'live' });
  const r = O.reduceOfficial(s0, liveR(mkS({ eth: [KEEP, X, ...G.slice(21)] }, 110)));
  assert.deepEqual(r.events, [{ type: 'suspicious_shrink', goneCount: 21, missingChains: [], streak: 1 }], '本轮还有真新增 X，可疑轮也一律不告警、不出 diff');
  assert.deepEqual(r.state.display, L1);
  assert.deepEqual(r.state.base, L1);
  assert.equal(r.state.source, 'live');
  assert.deepEqual(r.state.alerted, ['n:x']);
  assert.equal(r.state.shrinkStreak, 1);
  assert.equal(r.state.staleStreak, 0);
  assert.equal(r.state.lastMode, 'live');
  assert.equal(r.dirty, false, 'display 没变');
  // display 是冻结快照时，可疑轮同样保持它，source 也保持 freeze
  const F = mkS({ eth: [KEEP, ...G.slice(0, 5)] }, null);
  const rf = O.reduceOfficial(st0(L1, { display: F, source: 'freeze' }), liveR(shrunk(21)));
  assert.deepEqual(rf.state.display, F);
  assert.equal(rf.state.source, 'freeze');
  assert.equal(rf.state.shrinkStreak, 1);
  // 边界：20 个不算可疑 → 正常 diff，20 个都告警，streak 为 0，base 推进
  const r20 = O.reduceOfficial(st0(L1, { shrinkStreak: 2 }), liveR(shrunk(20)));
  assert.deepEqual(evTypes(r20), ['diff']);
  assert.equal(r20.events[0].alertGone.length, 20);
  assert.deepEqual(r20.state.base.holdings, shrunk(20).holdings);
  assert.equal(r20.state.shrinkStreak, 0);
  assert.equal(r20.state.alerted.length, 20);
});

test('l) R4 / Q4：base 里非空的链键在新快照里不存在或变成空数组 → suspicious（哪怕只少 1 个地址）；base 里本来就空的链键、新增链不算', () => {
  const A = hx('a0'), B = hx('a1'), C = hx('a2');
  const r = O.reduceOfficial(st0(mkS({ eth: [A], arb: [B] }, 100)), liveR(mkS({ eth: [A] }, 110)));
  assert.deepEqual(r.events, [{ type: 'suspicious_shrink', goneCount: 1, missingChains: ['arb'], streak: 1 }]);
  assert.deepEqual(r.state.base.holdings, { eth: [A], arb: [B] });
  assert.deepEqual(r.state.display.holdings, { eth: [A], arb: [B] });
  assert.deepEqual(r.state.alerted, []);
  const r2 = O.reduceOfficial(st0(mkS({ eth: [A], arb: [B], btc: [C] }, 100)), liveR(mkS({ eth: [A] }, 110)));
  assert.deepEqual(r2.events, [{ type: 'suspicious_shrink', goneCount: 2, missingChains: ['arb', 'btc'], streak: 1 }]);
  // Q4：链键还在、但列表变成空数组，同样算缺链（以前不算）
  const r3 = O.reduceOfficial(st0(mkS({ eth: [A], arb: [B] }, 100)), liveR(mkS({ eth: [A], arb: [] }, 110)));
  assert.deepEqual(r3.events, [{ type: 'suspicious_shrink', goneCount: 1, missingChains: ['arb'], streak: 1 }]);
  assert.deepEqual(r3.state.base.holdings, { eth: [A], arb: [B] });
  // base 里本来就是空数组的链键：cur 里没有它不算缺链
  const r3b = O.reduceOfficial(st0(mkS({ eth: [A, B], arb: [] }, 100)), liveR(mkS({ eth: [A] }, 110)));
  assert.deepEqual(evTypes(r3b), ['diff']);
  assert.deepEqual(r3b.events[0].alertGone, [B]);
  // 新增一条链不是收缩
  const r4 = O.reduceOfficial(st0(mkS({ eth: [A] }, 100)), liveR(mkS({ eth: [A], arb: [B] }, 110)));
  assert.deepEqual(evTypes(r4), ['diff']);
  assert.deepEqual(r4.events[0].alertNew, [B]);
});

test('l) R4：勘误解释的大批消失不算可疑（正常 diff、照常告警）；只有"非 correction"的才计入 20 的阈值，goneCount 是无解释的个数', () => {
  const L1 = shrinkBase();
  const corr = list => ({ ok: true, corrections: [{ id: 'c1', count: list.length, addresses: list }] });
  // 30 个全被勘误解释 → 正常 diff
  const r = O.reduceOfficial(st0(L1), liveR(shrunk(30, 110, { corrections: corr(G) })));
  assert.deepEqual(evTypes(r), ['diff']);
  assert.equal(r.events[0].alertGone.length, 0, 'Q2：勘误解释的消失不逐个告警');
  assert.deepEqual(r.events[0].alertCorrections, [{ id: 'c1', count: 30 }]);
  assert.deepEqual(r.state.alerted, [cKey('c1', G)], 'S3：键改为 c:id:该批地址哈希（原为 c:c1）');
  assert.equal(r.state.shrinkStreak, 0);
  assert.deepEqual(r.state.base.holdings, { eth: [KEEP] });
  // 30 个被解释 + U 个无解释：U=20 → 正常；U=21 → 可疑，goneCount=21（不是 51）
  const Ux = n => addrsN(n, 100);
  const bigBase = n => mkS({ eth: [KEEP, ...G, ...Ux(n)] }, 100);
  const c = corr(G);
  const ok20 = O.reduceOfficial(st0(bigBase(20)), liveR(mkS({ eth: [KEEP] }, 110, { corrections: c })));
  assert.deepEqual(evTypes(ok20), ['diff']);
  assert.equal(ok20.events[0].alertGone.length, 20, '20 个无解释的逐个告警');
  assert.deepEqual(ok20.events[0].alertCorrections, [{ id: 'c1', count: 30 }], '30 个被勘误解释的按 id 聚合');
  assert.equal(ok20.state.alerted.length, 21, '20 个 g: + 1 个 c:');
  const bad21 = O.reduceOfficial(st0(bigBase(21)), liveR(mkS({ eth: [KEEP] }, 110, { corrections: c })));
  assert.deepEqual(bad21.events, [{ type: 'suspicious_shrink', goneCount: 21, missingChains: [], streak: 1 }]);
  // 无解释的另一类：进了受害名单也算"无解释"（只有 correction 才算解释）
  const victimsAll = mkS({ eth: [KEEP] }, 110, { victims: { eth: G.slice(0, 21) } });
  const rv = O.reduceOfficial(st0(L1), liveR(victimsAll));
  assert.deepEqual(rv.events, [{ type: 'suspicious_shrink', goneCount: 30, missingChains: [], streak: 1 }]);
});

test('l) R4 / Q1：连续 3 次可疑才接受（第 3 次）：display = base = 新快照，无解释消失以 g: 与 n: 写入 alerted 但不告警；manual 第一次就接受；正常轮清零 streak', () => {
  const L1 = shrinkBase();
  let s = st0(L1); const rs = [];
  for (let i = 0; i < 3; i++) { const r = O.reduceOfficial(s, liveR(shrunk(21, 110 + i))); rs.push(r); s = r.state; }
  assert.deepEqual(rs[0].events, [{ type: 'suspicious_shrink', goneCount: 21, missingChains: [], streak: 1 }]);
  assert.deepEqual(rs[1].events, [{ type: 'suspicious_shrink', goneCount: 21, missingChains: [], streak: 2 }]);
  assert.equal(rs[1].state.shrinkStreak, 2);
  assert.deepEqual(rs[1].state.base, L1);
  assert.deepEqual(rs[1].state.alerted, []);
  const gone21 = G.slice(0, 21);
  assert.deepEqual(evTypes(rs[2]), ['shrink_accepted', 'diff']);
  assert.deepEqual(rs[2].events[0], { type: 'shrink_accepted', gone: gone21 });
  assert.deepEqual(rs[2].events[1].alertGone, [], '无解释消失不告警');
  assert.deepEqual(rs[2].events[1].alertNew, []);
  assert.equal(rs[2].events[1].diff.goneCount, 21, 'diff 本身如实记录');
  assert.deepEqual(rs[2].state.alerted, [...gone21.map(a => 'g:' + a), ...gone21.map(a => 'n:' + a)], 'Q1：g: 之外同时 n: 预写入');
  assert.deepEqual(rs[2].state.base.holdings, shrunk(21).holdings);
  assert.deepEqual(rs[2].state.display.holdings, shrunk(21).holdings);
  assert.equal(rs[2].state.shrinkStreak, 0);
  assert.equal(rs[2].state.source, 'live');
  assert.equal(rs[2].dirty, true);
  assert.equal(rs.reduce((n, r) => n + r.events.filter(e => e.type === 'diff').reduce((m, e) => m + e.alertGone.length, 0), 0), 0, '全程没有任何消失告警');
  assert.deepEqual(evTypes(O.reduceOfficial(rs[2].state, liveR(shrunk(21, 120)))), [], '接受之后同样的名单不再有事件');
  // manual：第一次就接受
  const m = O.reduceOfficial(st0(L1), liveR(shrunk(21)), { manual: true });
  assert.deepEqual(m.events[0], { type: 'shrink_accepted', gone: gone21 });
  assert.deepEqual(m.state.base.holdings, shrunk(21).holdings);
  assert.deepEqual(m.state.alerted, [...gone21.map(a => 'g:' + a), ...gone21.map(a => 'n:' + a)]);
  assert.equal(m.state.shrinkStreak, 0);
  // 整链缺失也是 3 次 / manual 才接受，gone 列表里只有无解释的消失地址
  const A = hx('a0'), B = hx('a1');
  const mc = O.reduceOfficial(st0(mkS({ eth: [A], arb: [B] }, 100)), liveR(mkS({ eth: [A] }, 110)), { manual: true });
  assert.deepEqual(mc.events[0], { type: 'shrink_accepted', gone: [B] });
  assert.deepEqual(mc.state.base.holdings, { eth: [A] });
  // 中间来一个正常轮 → streak 清零，之后重新从 1 数
  const a = O.reduceOfficial(st0(L1), liveR(shrunk(21, 110)));
  const b = O.reduceOfficial(a.state, liveR(mkS({ eth: [KEEP, ...G] }, 115)));
  assert.deepEqual(b.events, []);
  assert.equal(b.state.shrinkStreak, 0);
  const c = O.reduceOfficial(b.state, liveR(shrunk(21, 120)));
  assert.deepEqual(c.events, [{ type: 'suspicious_shrink', goneCount: 21, missingChains: [], streak: 1 }]);
  // 正常的少量 diff 轮同样清零
  const e = O.reduceOfficial(a.state, liveR(shrunk(3, 116)));
  assert.deepEqual(evTypes(e), ['diff']);
  assert.equal(e.state.shrinkStreak, 0);
});

test('l) R4 / Q2：接受可疑收缩的那一轮 —— 真新增照常告警一次，勘误解释的消失按勘误 id 聚合告警一次（c: 键），只有无解释的消失被静默', () => {
  const U = addrsN(21, 200), C1 = hx('c1'), X = hx('a9');
  const L1 = mkS({ eth: [KEEP, ...U, C1] }, 100);
  const snapN = mkS({ eth: [KEEP, X] }, 110, { corrections: { ok: true, corrections: [{ id: 'c1', count: 1, addresses: [C1] }] } });
  const r = O.reduceOfficial(st0(L1), liveR(snapN), { manual: true });
  assert.deepEqual(evTypes(r), ['shrink_accepted', 'diff']);
  assert.deepEqual(r.events[0].gone, U);
  assert.deepEqual(r.events[1].alertNew, [X]);
  assert.deepEqual(r.events[1].alertGone, [], '勘误解释的不进 alertGone');
  assert.deepEqual(r.events[1].alertCorrections, [{ id: 'c1', count: 1 }]);
  assert.deepEqual(r.state.alerted, [...U.map(a => 'g:' + a), ...U.map(a => 'n:' + a), 'n:' + X, cKey('c1', [C1])], 'S3：键改为 c:id:该批地址哈希（原为 c:c1）');
});

test('l) S2：30 个无解释消失 → 3 轮接受（静默）→ 官方恢复（不告警，n: 已预写）→ 其中 2 个再次消失，这 2 个必须出现在 alertGone', () => {
  const L1 = shrinkBase();
  let s = st0(L1); const rs = [];
  for (let i = 0; i < 3; i++) { const r = O.reduceOfficial(s, liveR(shrunk(30, 110 + i))); rs.push(r); s = r.state; }
  assert.deepEqual(rs.map(evTypes), [['suspicious_shrink'], ['suspicious_shrink'], ['shrink_accepted', 'diff']]);
  assert.deepEqual(rs[2].events[1].alertGone, [], '接受那一轮静默');
  assert.deepEqual(s.alerted, [...G.map(a => 'g:' + a), ...G.map(a => 'n:' + a)]);
  // 官方恢复：30 个全部回来 → 不告警（n: 已预写），diff 如实报告 30 个新增；g: 全部摘掉，n: 保留
  const back = O.reduceOfficial(s, liveR(mkS({ eth: [KEEP, ...G] }, 120)));
  assert.deepEqual(evTypes(back), ['diff']);
  assert.deepEqual(back.events[0].alertNew, [], '恢复不当新增告警');
  assert.deepEqual(back.events[0].alertGone, []);
  assert.equal(back.events[0].diff.newCount, 30);
  assert.deepEqual(back.state.alerted, G.map(a => 'n:' + a), 'g: 全部摘掉（重新布防），n: 保留');
  // 其中 2 个真的再次消失 → 必须告警
  const again = O.reduceOfficial(back.state, liveR(mkS({ eth: [KEEP, ...G.slice(2)] }, 130)));
  assert.deepEqual(evTypes(again), ['diff']);
  assert.deepEqual(again.events[0].alertGone, [G[0], G[1]], '再次消失的 2 个必须出现在 alertGone');
  assert.deepEqual(again.events[0].alertNew, []);
  assert.deepEqual(again.state.alerted, [...G.map(a => 'n:' + a), 'g:' + G[0], 'g:' + G[1]]);
  // 对照：没有回来的地址不被重新布防（只摘本轮 newAddrs 的 g:）——只恢复 28 个，另外 2 个的 g: 仍在
  const part = O.reduceOfficial(s, liveR(mkS({ eth: [KEEP, ...G.slice(2)] }, 120)));
  assert.deepEqual(part.state.alerted.filter(k => k.startsWith('g:')), ['g:' + G[0], 'g:' + G[1]], '没回来的 2 个 g: 保留');
  assert.equal(part.state.alerted.filter(k => k.startsWith('n:')).length, 30, 'n: 全部保留');
});

test('l) S3：同一勘误 id 按批次告警 —— 先 2 个消失（告警）→ 同一批重放（不告警）→ 又有 8 个新消失被同一 id 解释（告警，count 8）', () => {
  const P = addrsN(10, 300);
  const corr = list => ({ ok: true, corrections: [{ id: 'c1', count: list.length, addresses: list }] });
  const L1 = mkS({ eth: [KEEP, ...P] }, 100);
  const first = P.slice(0, 2), rest = P.slice(2);
  const snap2 = mkS({ eth: [KEEP, ...rest] }, 110, { corrections: corr(first) });
  const r1 = O.reduceOfficial(st0(L1), liveR(snap2));
  assert.deepEqual(r1.events[0].alertCorrections, [{ id: 'c1', count: 2 }]);
  assert.deepEqual(r1.events[0].alertGone, []);
  assert.equal(r1.state.alerted.length, 1);
  // 同一批重放：base 回到消失前、alerted 沿用 → 同一 id 同一批地址，不再告警
  const r2 = O.reduceOfficial({ ...r1.state, base: L1, display: L1 }, liveR(mkS({ eth: [KEEP, ...rest] }, 115, { corrections: corr(first) })));
  assert.equal(r2.events[0].diff.goneCount, 2, 'diff 仍如实报告 2 个消失');
  assert.deepEqual(r2.events[0].alertCorrections, [], '同一批重放不再告警');
  assert.deepEqual(r2.state.alerted, r1.state.alerted, '同一批重放不新增键');
  // 又有 8 个新的被同一 id 解释的消失 → 新批次，再告警一次，count 8
  const r3 = O.reduceOfficial(r1.state, liveR(mkS({ eth: [KEEP] }, 120, { corrections: corr(P) })));
  assert.equal(r3.events[0].diff.goneCount, 8);
  assert.deepEqual(r3.events[0].alertCorrections, [{ id: 'c1', count: 8 }]);
  assert.deepEqual(r3.events[0].alertGone, []);
  assert.deepEqual(r3.state.alerted, [cKey('c1', first), cKey('c1', rest)], '键格式：c:id:该批地址哈希，两批两个键');
  assert.notEqual(cKey('c1', first), cKey('c1', rest));
  // 批次内的顺序无关：地址顺序不同的同一批，键相同（按排序后哈希）
  const r4 = O.reduceOfficial({ ...r3.state, base: mkS({ eth: [KEEP, ...rest.slice().reverse()] }, 120) }, liveR(mkS({ eth: [KEEP] }, 125, { corrections: corr(P) })));
  assert.deepEqual(r4.events[0].alertCorrections, []);
  // 不同 id 解释同样的地址是另一个键
  assert.notEqual(cKey('c1', first), cKey('c2', first));
});

test('l) R5：maintUnknown 前三轮只更新 display，不推进 base / 不 diff / 不动 staleStreak；第 4 轮恢复正常，期间的新增 X 在恢复轮恰好告警一次', () => {
  const A = hx('a0'), X = hx('a1'), Y = hx('a2');
  const L1 = mkS({ eth: [A] }, 100);
  let s = st0(L1, { source: 'live' }); const rs = [];
  for (let i = 0; i < 3; i++) { const r = O.reduceOfficial(s, unkR(mkS({ eth: [A, X] }, 110 + i))); rs.push(r); s = r.state; }
  rs.forEach((r, i) => {
    assert.deepEqual(r.events, [{ type: 'maint_unknown', streak: i + 1 }], 'round ' + (i + 1));
    assert.equal(r.state.unknownStreak, i + 1);
    assert.deepEqual(r.state.base, L1, 'base 不推进');
    assert.deepEqual(r.state.display.holdings, { eth: [A, X] }, 'display 用 live 结果更新');
    assert.deepEqual(r.state.alerted, []);
    assert.equal(r.state.staleStreak, 0);
    assert.equal(r.state.source, 'live');
    assert.equal(r.state.lastMode, 'live');
  });
  assert.equal(rs[0].dirty, true);
  assert.equal(rs[1].dirty, false);
  const r4 = O.reduceOfficial(s, unkR(mkS({ eth: [A, X] }, 113)));
  assert.deepEqual(evTypes(r4), ['diff'], '第 4 轮即便仍 maintUnknown 也按 live 处理');
  assert.deepEqual(r4.events[0].alertNew, [X]);
  assert.deepEqual(r4.state.base.holdings, { eth: [A, X] });
  assert.equal(r4.state.unknownStreak, 3, '仍未知时不清零，不会再进入 3 轮沉默');
  const r5 = O.reduceOfficial(r4.state, unkR(mkS({ eth: [A, X, Y] }, 114)));
  assert.deepEqual(r5.events[0].alertNew, [Y], '长期未知不会永远不告警');
  assert.equal(countIn([...rs, r4, r5], 'alertNew', X), 1, 'X 总共只告警一次');
  // 之后维护状态明确（maintUnknown 不为 true）→ streak 清零，再次未知重新数
  const r6 = O.reduceOfficial(r5.state, liveR(mkS({ eth: [A, X, Y] }, 115)));
  assert.equal(r6.state.unknownStreak, 0);
  assert.deepEqual(r6.events, []);
  const r7 = O.reduceOfficial(r6.state, unkR(mkS({ eth: [A, X, Y] }, 116)));
  assert.deepEqual(r7.events, [{ type: 'maint_unknown', streak: 1 }]);
  // 中途维护状态明确一次 → 连击清零，那一轮正常 diff
  const q1 = O.reduceOfficial(st0(L1), unkR(mkS({ eth: [A, X] }, 110)));
  const q2 = O.reduceOfficial(q1.state, unkR(mkS({ eth: [A, X] }, 111)));
  const q3 = O.reduceOfficial(q2.state, liveR(mkS({ eth: [A, X] }, 112)));
  assert.equal(q2.state.unknownStreak, 2);
  assert.deepEqual(q3.events[0].alertNew, [X]);
  assert.equal(q3.state.unknownStreak, 0);
  assert.deepEqual(O.reduceOfficial(q3.state, unkR(mkS({ eth: [A, X, Y] }, 113))).events, [{ type: 'maint_unknown', streak: 1 }]);
});

test('l) R5：maintUnknown 不接受旧快照（含 manual）：staleStreak 不动，display 也保持；没有 base 时 display 更新但 base 仍为空', () => {
  const A = hx('a0'), B = hx('a1');
  const L1 = mkS({ eth: [A, B] }, 100), OLD = mkS({ eth: [A] }, 90);
  for (const o of [undefined, { manual: true }]) {
    const r = O.reduceOfficial(st0(L1, { source: 'live', staleStreak: 1 }), unkR(OLD), o);
    assert.deepEqual(r.events, [{ type: 'maint_unknown', streak: 1 }]);
    assert.deepEqual(r.state.display, L1);
    assert.deepEqual(r.state.base, L1);
    assert.equal(r.state.staleStreak, 1);
    assert.equal(r.state.source, 'live');
    assert.deepEqual(r.state.alerted, []);
  }
  const r0 = O.reduceOfficial(st0(null), unkR(L1));
  assert.deepEqual(r0.events, [{ type: 'maint_unknown', streak: 1 }]);
  assert.equal(r0.state.base, null);
  assert.deepEqual(r0.state.display.holdings, L1.holdings);
  // 未知期间的收缩判定（Q3）：可疑时 display 不更新、多出 suspicious_shrink 事件，连击数（shrinkStreak / shrinkKey）不动、base 不动；细节见 Q3 的测试
  const rs = O.reduceOfficial(st0(shrinkBase(), { shrinkStreak: 1 }), unkR(shrunk(25)));
  assert.deepEqual(evTypes(rs), ['maint_unknown', 'suspicious_shrink']);
  assert.equal(rs.state.shrinkStreak, 1);
  assert.deepEqual(rs.state.base, shrinkBase());
  assert.deepEqual(rs.state.display, shrinkBase());
});

test('l) 旧 state 兼容：缺 shrinkStreak / unknownStreak 视为 0；返回的 state 总带这两个字段；新事件路径不改入参', () => {
  const A = hx('a0'), L1 = mkS({ eth: [A] }, 100);
  const legacy = { display: L1, base: L1, source: 'live', alerted: [], staleStreak: 0, lastErrors: [], lastMode: 'live' };
  const r = O.reduceOfficial(legacy, liveR(mkS({ eth: [A] }, 101)));
  assert.equal(r.state.shrinkStreak, 0);
  assert.equal(r.state.unknownStreak, 0);
  assert.deepEqual(Object.keys(r.state).sort(), RED_KEYS);
  assert.deepEqual(Object.keys(O.reduceOfficial(null, liveR(L1)).state).sort(), RED_KEYS);
  assert.equal(O.reduceOfficial({ ...legacy, shrinkStreak: 'x', unknownStreak: -4 }, liveR(L1)).state.unknownStreak, 0);
  const cases = [
    [st0(shrinkBase()), liveR(shrunk(21)), {}], [st0(shrinkBase(), { shrinkStreak: 2 }), liveR(shrunk(21)), {}], [st0(shrinkBase()), liveR(shrunk(21)), { manual: true }],
    [st0(L1), unkR(mkS({ eth: [A, hx('a1')] }, 110)), {}], [st0(L1, { unknownStreak: 3 }), unkR(mkS({ eth: [A, hx('a1')] }, 110)), {}],
    [st0(mkS({ eth: [A, hx('a1')] }, 100)), liveR(mkS({ eth: [A] }, 90)), { manual: true }]
  ];
  for (const [state, res, opts] of cases) {
    const sc = structuredClone(state), rc = structuredClone(res), oc = structuredClone(opts);
    const out = O.reduceOfficial(state, res, opts);
    assert.deepStrictEqual(state, sc);
    assert.deepStrictEqual(res, rc);
    assert.deepStrictEqual(opts, oc);
    assert.notEqual(out.state.alerted, state.alerted);
  }
});

test('l) R8：contentSig 覆盖 reviewed 的 name / note / chain / reviewed_ts / verdict / category / address', () => {
  const A = hx('a0');
  const mkR = (over = {}) => mkS({ eth: [A] }, 1, { reviewed: { ok: true, count: 1, updated_ts: 1, items: [{ address: hx('cc'), verdict: 'not_attacker', category: 'cex', name: 'n0', note: 'm0', chain: 'eth', reviewed_ts: 5, ...over }] } });
  const s0 = O.contentSig(mkR());
  assert.equal(O.contentSig(mkR()), s0);
  for (const over of [{ note: 'm1' }, { name: 'n1' }, { chain: 'arb' }, { reviewed_ts: 6 }, { verdict: 'attacker_related' }, { category: 'vault' }, { address: hx('cd') }, { note: 'm0 ' }, { note: '' }]) {
    assert.notEqual(O.contentSig(mkR(over)), s0, JSON.stringify(over));
  }
  assert.equal(O.contentSig(mkR({ address: hx('cc').toUpperCase().replace('0X', '0x') })), s0, 'EVM 地址大小写归一');
  assert.equal(O.contentSig({ ...mkR(), snap_ts: 999, fetched_at: 'z' }), s0, '元数据仍不参与');
  // 条目顺序无关
  const two = (a, b) => mkS({ eth: [A] }, 1, { reviewed: { ok: true, count: 2, items: [a, b] } });
  const i1 = { address: hx('c1'), verdict: 'not_attacker', category: 'cex', note: 'a' }, i2 = { address: hx('c2'), verdict: 'not_attacker', category: 'vault', note: 'b' };
  assert.equal(O.contentSig(two(i1, i2)), O.contentSig(two(i2, i1)));
  // reviewed 备注变了 → reducer 判 dirty（画布要重画）
  const r = O.reduceOfficial(st0(mkR()), liveR(mkR({ note: 'm1' })));
  assert.equal(r.dirty, true);
  assert.equal(O.reduceOfficial(st0(mkR()), liveR(mkR())).dirty, false);
});

test('l) R8：contentSig 覆盖 corrections 的 reason / listed_from / listed_until / restored_at / csv / 地址列表内容（个数不变也算）', () => {
  const A = hx('a0');
  const base = { id: 'k', count: 2, reason: 'r0', listed_from: 10, listed_until: 20, restored_at: 30, csv: 'a.csv', addresses: [hx('01'), hx('02')] };
  const mkC = (over = {}) => mkS({ eth: [A] }, 1, { corrections: { ok: true, corrections: [{ ...base, ...over }] } });
  const s0 = O.contentSig(mkC());
  assert.equal(O.contentSig(mkC()), s0);
  for (const over of [{ reason: 'r1' }, { listed_from: 11 }, { listed_until: 21 }, { restored_at: 31 }, { csv: 'b.csv' }, { id: 'k2' }, { count: 3 },
    { addresses: [hx('01'), hx('03')] }, { addresses: [hx('01')] }, { addresses: [hx('01'), hx('02'), hx('03')] }, { restored_at: null }]) {
    assert.notEqual(O.contentSig(mkC(over)), s0, JSON.stringify(over));
  }
  assert.equal(O.contentSig(mkC({ addresses: [hx('02'), hx('01')] })), s0, '地址顺序无关');
  assert.equal(O.contentSig(mkC({ addresses: [hx('01').toUpperCase().replace('0X', '0x'), hx('02')] })), s0, 'EVM 地址大小写归一');
  const r = O.reduceOfficial(st0(mkC()), liveR(mkC({ reason: 'r1' })));
  assert.equal(r.dirty, true);
  assert.equal(O.reduceOfficial(st0(mkC()), liveR(mkC({ addresses: [hx('01'), hx('03')] }))).dirty, true);
});

test('l) R11：reducer 只有 snap.frozen === true 才算冻结；frozen 为 "false" / "true" 字符串 / 1 / 对象都按 live 处理；mode:"freeze" 仍是冻结', () => {
  const A = hx('a0'), B = hx('a1');
  const L1 = mkS({ eth: [A] }, 100), L2 = mkS({ eth: [A, B] }, 110);
  for (const f of ['false', 'true', 1, '1', {}, [], null, undefined]) {
    const r = O.reduceOfficial(st0(L1), { mode: 'live', snap: { ...L2, frozen: f }, errors: [] });
    assert.deepEqual(evTypes(r), ['diff'], 'frozen=' + JSON.stringify(f));
    assert.deepEqual(r.events[0].alertNew, [B]);
    assert.equal(r.state.source, 'live');
    assert.equal(r.state.lastMode, 'live');
    assert.deepEqual(r.state.base.holdings, L2.holdings);
  }
  const fz = O.reduceOfficial(st0(L1), { mode: 'live', snap: { ...L2, frozen: true }, errors: [] });
  assert.deepEqual(fz.events, [{ type: 'frozen' }]);
  assert.deepEqual(fz.state.base, L1);
  const fm = O.reduceOfficial(st0(L1), { mode: 'freeze', snap: { ...L2, frozen: 'false' }, errors: [] });
  assert.deepEqual(fm.events, [{ type: 'frozen' }]);
  assert.equal(fm.state.source, 'freeze');
});
