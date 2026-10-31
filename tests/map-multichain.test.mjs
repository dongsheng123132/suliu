// 多链资金地图（2026-10-31 扩展）：BTC（币安侧真实，二部图）+ Tron（合成演示）接入同一资金地图。
// 锁定：
//   1. 内置案件顺序仍是 Bitget 默认（CASES[0]）+ 币安 + BTC + Tron 可切换，原两案不动；
//   2. BTC 画「地址 → 交易 → 地址」二部图：交易本身是节点（type:'tx'），边只连地址↔交易，绝不出现地址→地址直连边；
//      金额是整数聪（sats），交易节点标签是 txid 前 10 位，链接走 mempool.space；
//   3. Tron 明确标「演示（合成数据）」，时间轴用时间戳（unit:'time'），USDT 标可冻结（≠已冻结），链接走 tronscan；
//   4. 链接按链生成（ETH→etherscan / BTC→mempool / Tron→tronscan），地址 / 哈希先校验再拼；
//   5. 页面 esc() 能转义恶意字符串；报告无 script、SVG 被清洗；BTC / Tron 案例都能过 lib/report.js 生成报告。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Report = require('../lib/report.js');
const Chains = require('../lib/chains.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILE = path.join(ROOT, '溯流资金画布.html');
const HTML = fs.readFileSync(HTML_FILE, 'utf8');
const GEN = '2026-10-31T00:00:00.000Z';

/** 从页面源码里取出内置 CASES 数组（只读文本，不执行页面其余脚本；与 tests/binance-case.test.mjs 同款） */
function loadInlineCases() {
  const a = HTML.indexOf('const CASES = [');
  const b = HTML.indexOf('\n];', a);
  assert.ok(a >= 0 && b > a, '找不到 const CASES = [ … ] 区块');
  const block = HTML.slice(a, b + 3);
  const T = (from, to, t, amt, eth, o) => Object.assign({ from, to, t, amt, eth }, o || {});
  return vm.runInNewContext(block + '\n;CASES', { T });
}

/** data/map-cases.js 里的 BTC / Tron 内置案例（页面通过 <script src> 加载后并入 CASES） */
function loadMapCases() {
  const f = path.join(ROOT, 'data', 'map-cases.js');
  assert.ok(fs.existsSync(f), '缺少 data/map-cases.js（用 node tools/make-map-cases.mjs 生成）');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: 'data/map-cases.js' });
  const list = sandbox.window && sandbox.window.SULIU_MAP_CASES;
  assert.ok(Array.isArray(list) && list.length >= 2, 'data/map-cases.js 里应至少含 BTC / Tron 两个案例');
  return list;
}

/** 复刻页面加载逻辑：内置 CASES 之后追加 data/map-cases.js 里的案例（同 id 不重复） */
function allCases() {
  const merged = loadInlineCases();
  loadMapCases().forEach(c => { if (!merged.some(x => x.id === c.id)) merged.push(c); });
  return merged;
}

const byId = id => {
  const c = allCases().find(x => x.id === id);
  assert.ok(c, '找不到内置案例：' + id);
  return c;
};

// ---------------------------------------------------------------------------------------------
// 1. 案例顺序
// ---------------------------------------------------------------------------------------------
test('内置案例顺序：bitget 默认（CASES[0]）+ 币安 + BTC + Tron，CSS 里有新类型 tx 的配色', () => {
  assert.deepEqual(Array.from(allCases(), c => c.id), ['bitget', 'binance', 'btc', 'tron'], '顺序与默认案例不能变');
  assert.equal(allCases()[0].id, 'bitget', 'Bitget 仍是默认案例');
  // 页面源码里要真的把 data/map-cases.js 并入 CASES，而不是只存在于文件里
  assert.match(HTML, /window\.SULIU_MAP_CASES/, '页面要读取 window.SULIU_MAP_CASES');
  assert.match(HTML, /CASES\.push\(c\)/, '页面要把 map-cases 并入 CASES');
  assert.match(HTML, /<script src="data\/map-cases\.js"><\/script>/, '页面要以 file:// 可用的 <script src> 加载 map-cases.js');
  assert.match(HTML, /\.t-tx\{--c:var\(--t-tx\)\}/, 'CSS 要给交易节点类型 .t-tx 配色');
});

// ---------------------------------------------------------------------------------------------
// 2. BTC 二部图
// ---------------------------------------------------------------------------------------------
test('BTC 二部图：交易本身是节点（type:tx），边只连「地址 ↔ 交易」，绝不出现地址→地址直连边', () => {
  const btc = byId('btc');
  assert.equal(btc.chain, 'btc');
  assert.equal(btc.unit, 'block', 'BTC 有区块号，时间轴按区块');
  assert.equal(btc.official, false, 'BTC 是独立来源，不套 Bitget 官方名单');
  const txNodes = btc.nodes.filter(n => n.type === 'tx');
  assert.equal(txNodes.length, 8, '8 笔交易应各是一个 tx 节点');
  const addrIds = new Set(btc.nodes.filter(n => n.type !== 'tx').map(n => n.id));
  const txIds = new Set(txNodes.map(n => n.id));
  assert.equal(addrIds.size, 49, '源 JSON 的 49 个地址节点都要保留');
  for (const tx of btc.txs) {
    const fAddr = addrIds.has(tx.from), fTx = txIds.has(tx.from);
    const tAddr = addrIds.has(tx.to), tTx = txIds.has(tx.to);
    assert.ok((fAddr && tTx) || (fTx && tAddr), `每条边必须一端是地址、一端是交易：${tx.from}→${tx.to}`);
    assert.ok(!(fAddr && tAddr), `禁止地址→地址直连边（不推资金归属）：${tx.from}→${tx.to}`);
    assert.ok(!(fTx && tTx), `禁止交易→交易边：${tx.from}→${tx.to}`);
  }
});

test('BTC 金额与标签：整数聪（sats）、交易节点标签是 txid 前 10 位、地址/哈希格式合法', () => {
  const btc = byId('btc');
  const txNodes = btc.nodes.filter(n => n.type === 'tx');
  txNodes.forEach(n => {
    assert.match(n.addr, /^[0-9a-fA-F]{64}$/, '交易节点 addr 应是完整 txid：' + n.addr);
    assert.match(n.label, /^[0-9a-fA-F]{10}$/, '交易节点标签应是 txid 前 10 位：' + n.label);
    assert.equal(n.label, n.addr.slice(0, 10));
  });
  btc.txs.forEach(t => {
    assert.match(t.amt, /^\d+ sats$/, '金额必须是整数聪（不推归属、不换算）：' + t.amt);
    assert.match(t.hash, /^[0-9a-fA-F]{64}$/, 'BTC 交易哈希是 64 位十六进制（无 0x）：' + t.hash);
  });
  // facts / banner 要写明「真实币安侧 / 交易级 / 整数聪 / 不推归属」
  const facts = new Map(btc.facts);
  const all = btc.facts.map(f => f.join(' ')).join(' ') + ' ' + btc.banner.join(' ');
  assert.match(all, /整数聪|satoshi|sats/i, '要注明整数聪');
  assert.match(all, /不.*归属|归属.*不|不构成归属/, '要写明不推资金归属');
  assert.match(btc.banner.join(' '), /真实数据|真实/, 'banner 要写明真实数据');
  assert.match(facts.get('数据截止') || '', /973976|973732|973930/, '要写数据截止区块 / 覆盖范围');
});

test('BTC 链接按链生成：地址→mempool.space/address/、交易→mempool.space/tx/，不是 etherscan', () => {
  const btc = byId('btc');
  const addr = btc.nodes.find(n => n.type !== 'tx' && n.addr).addr;
  const txid = btc.nodes.find(n => n.type === 'tx').addr;
  assert.ok(addr);
  const aUrl = Chains.explorerUrl('btc', 'address', addr);
  const tUrl = Chains.explorerUrl('btc', 'tx', txid);
  assert.ok(aUrl && aUrl.startsWith('https://mempool.space/address/'), 'BTC 地址链接应为 mempool.space：' + aUrl);
  assert.ok(tUrl && tUrl.startsWith('https://mempool.space/tx/'), 'BTC 交易链接应为 mempool.space：' + tUrl);
  assert.ok(!/etherscan/i.test(aUrl + tUrl), 'BTC 不得用 etherscan');
});

// ---------------------------------------------------------------------------------------------
// 3. Tron 演示案例
// ---------------------------------------------------------------------------------------------
test('Tron 演示：明确标「演示（合成数据）」，时间轴用时间戳（unit:time、标签「时间」），报告顶部也带标记', () => {
  const tron = byId('tron');
  assert.equal(tron.demo, true, 'Tron 案例必须带 demo:true');
  assert.equal(tron.chain, 'tron');
  assert.equal(tron.unit, 'time', 'TRC20 无区块号，时间轴按时间戳');
  const all = [tron.title, tron.short, tron.tab, tron.tabK].join(' ') + ' ' + tron.facts.map(f => f.join(' ')).join(' ') + ' ' + tron.banner.join(' ');
  assert.match(all, /演示/, '案例文案要出现「演示」');
  assert.match(all, /合成数据/, '案例文案要出现「合成数据」');
  const facts = tron.facts.map(f => f.join(' ')).join(' ');
  assert.match(facts, /TRC20/, 'facts 要提到 TRC20');
  assert.match(facts, /无区块号/, 'facts 要写明 TRC20 摘要无区块号局限');
  // 时间标签：非区块链显示「时间」而不是「区块」
  assert.match(HTML, /unitOf\(\) === 'time' \? '时间 '/, '时间轴要按链切换「时间 / 区块」标签');
  assert.match(HTML, /个时间点/, '时间链的步进文案要改成「个时间点」');
});

test('Tron：USDT 标可冻结（可冻≠已冻）、原生 TRX 展示、tronscan 链接、交易哈希 64 位十六进制', () => {
  const tron = byId('tron');
  const usdt = tron.txs.filter(t => / USDT$/.test(t.amt || ''));
  const trx = tron.txs.filter(t => / TRX$/.test(t.amt || ''));
  assert.ok(usdt.length >= 1, '应有 USDT 转账');
  assert.ok(trx.length >= 1, '应展示原生 TRX');
  usdt.forEach(t => {
    assert.ok(Array.isArray(t.flags) && t.flags.indexOf('freeze') >= 0, 'USDT 必须标为可冻结稳定币（flags:freeze）');
    assert.match(t.note || '', /可冻/, 'USDT 说明要写「可冻≠已冻」');
  });
  tron.txs.forEach(t => assert.match(t.hash, /^[0-9a-fA-F]{64}$/, 'Tron 交易哈希是 64 位十六进制：' + t.hash));
  const addr = tron.nodes.find(n => n.addr).addr;
  const txid = tron.txs[0].hash;
  const aUrl = Chains.explorerUrl('tron', 'address', addr);
  const tUrl = Chains.explorerUrl('tron', 'tx', txid);
  assert.ok(aUrl && aUrl.startsWith('https://tronscan.org/#/address/'), 'Tron 地址链接应为 tronscan：' + aUrl);
  assert.ok(tUrl && tUrl.startsWith('https://tronscan.org/#/transaction/'), 'Tron 交易链接应为 tronscan：' + tUrl);
});

// ---------------------------------------------------------------------------------------------
// 4. 按链生成链接 + 格式校验
// ---------------------------------------------------------------------------------------------
test('链接按链生成且先校验格式：ETH→etherscan、BTC→mempool、Tron→tronscan；非法地址 / 哈希返回 null', () => {
  const ethAddr = '0x28c6c06298d514db089934071355e5743bf21d60';
  const ethTx = '0x53bd38b816c23e74134786c29a8c18d792777998a3b9326047b583100e88e2f3';
  assert.equal(Chains.explorerUrl('eth', 'address', ethAddr), 'https://etherscan.io/address/' + ethAddr);
  assert.equal(Chains.explorerUrl('eth', 'tx', ethTx), 'https://etherscan.io/tx/' + ethTx);
  // 跨链不能串：BTC 地址套 ETH 浏览器应被拒绝
  assert.equal(Chains.explorerUrl('eth', 'address', 'bc1q0ts8gaf9ht0rr4u02hr56f8thndqsc4kmkmfv3'), null, 'BTC 地址不能拼 etherscan');
  assert.equal(Chains.explorerUrl('btc', 'address', ethAddr), null, 'ETH 地址不能拼 mempool');
  assert.equal(Chains.explorerUrl('tron', 'tx', ethTx), null, '0x 哈希不能拼 tronscan');
  // 格式错误一律 null，不拼链接
  assert.equal(Chains.explorerUrl('btc', 'address', 'not-an-address'), null);
  assert.equal(Chains.explorerUrl('tron', 'address', 'T123'), null);
  assert.equal(Chains.explorerUrl('btc', 'tx', 'zzz'), null);
  assert.equal(Chains.explorerUrl('tron', 'tx', '0x' + 'a'.repeat(64)), null);
});

test('页面渲染用 linkOf / SuliuChains 生成链接，不再把 etherscan 写死在详情里', () => {
  assert.match(HTML, /<script src="lib\/chains\.js"><\/script>/, '页面要加载 lib/chains.js');
  assert.match(HTML, /function linkOf\(/, '页面要有按链生成链接的 linkOf');
  assert.match(HTML, /CHAINS0\.explorerUrl/, 'linkOf 要调用 SuliuChains.explorerUrl');
  // 详情 / 连线里的硬编码 etherscan 地址 / 交易链接应已移除（报告仍由 lib/report.js 负责，不在页面源码里）
  const body = HTML.slice(HTML.indexOf("(function(){"), HTML.indexOf('</script>', HTML.indexOf('(function(){')));
  assert.ok(!/https:\/\/etherscan\.io\/address\//.test(body), '页面详情里不应再写死 etherscan 地址链接');
  assert.ok(!/https:\/\/etherscan\.io\/tx\//.test(body), '页面详情里不应再写死 etherscan 交易链接');
});

// ---------------------------------------------------------------------------------------------
// 5. 恶意字符串转义
// ---------------------------------------------------------------------------------------------
test('恶意字符串转义：页面 esc() 把 < > " \' & 全部转义', () => {
  const m = /const esc = s => String\(s == null \? '' : s\)\.replace\(\/\[&<>"'\]\/g[^\n]*/.exec(HTML);
  assert.ok(m, '找不到页面 esc() 定义');
  const esc = vm.runInNewContext(m[0] + '\n;esc');
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const out = esc(evil);
  assert.ok(!/<|>|"|'/.test(out), '尖括号与引号必须被转义：' + out);
  assert.ok(out.includes('&lt;img') && out.includes('&gt;') && out.includes('&amp;') && out.includes('&#39;') && out.includes('&quot;'));
  assert.equal(esc(null), '');
});

test('恶意字符串经 lib/report.js：BTC / Tron 案例的报告里也全部转义、无 script', () => {
  for (const id of ['btc', 'tron']) {
    const c = byId(id);
    const evil = JSON.parse(JSON.stringify(c));
    evil.nodes[0] = Object.assign({}, evil.nodes[0], { label: '<script>alert(1)</script>', note: '"><img src=x onerror=alert(2)>' });
    evil.title = '<svg onload=alert(3)>' + evil.title;
    const html = Report.build({ case: evil, meta: {}, generatedAt: GEN, official: null, info: {}, guide: null, brand: null });
    assert.ok(!/<script/i.test(html), id + ' 报告里不能有 script');
    assert.ok(!/<img/i.test(html), id + ' 报告里不能有未转义的 <img> 标签');
    assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(html), id + ' 报告里不能有未转义的 on* 事件属性');
    assert.ok(html.includes('&lt;script&gt;'), id + ' 报告里恶意标签应被转义显示');
  }
});

// ---------------------------------------------------------------------------------------------
// 6. 报告：无 script、SVG 清洗、两案都能生成
// ---------------------------------------------------------------------------------------------
test('BTC / Tron 报告：都能过 lib/report.js，无 script，画布 SVG 被清洗后嵌入', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><g class="nd t-tx"><rect width="10" height="10"/><text x="1" y="18">交易</text></g></svg>';
  for (const id of ['btc', 'tron']) {
    const c = byId(id);
    const html = Report.build({ case: c, meta: {}, generatedAt: GEN, official: null, officialLabel: '', svg, info: {}, guide: null, brand: null });
    assert.ok(!/<script/i.test(html), id + ' 报告不能有 script');
    assert.ok(html.includes('<svg'), id + ' 报告要嵌入画布 SVG');
    assert.ok(html.includes('交易'), id + ' SVG 文本节点要保留（安全序列化不丢内容）');
    assert.ok(html.includes(c.title), id + ' 报告要出现案件标题');
  }
  // 恶意 SVG 清洗
  const tron = byId('tron');
  const evil = Report.build({ case: tron, meta: {}, generatedAt: GEN, official: null,
    svg: '<svg onload="alert(1)"><script>alert(2)</script><foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject><rect width="1" height="1"/></svg>',
    info: {}, guide: null, brand: null });
  assert.ok(!/<script/i.test(evil) && !/onload=/i.test(evil) && !/<foreignobject/i.test(evil) && !/<iframe/i.test(evil), '恶意 SVG 必须被清洗');
});
