// lib/report.js 的测试：可打印证据报告（独立 HTML）。不联网；用页面里的 Bitget 内置案件、tests/fixtures 回放出的追踪案件、手写的最小案件。
// 守的契约：
//   - 章节齐全（1 封面信息 … 8 免责声明；附录只在有 guide 时出现）；
//   - 验收路径上的 6 笔交易哈希完整出现且带 Etherscan 链接；Chainflip 金库的卡点标为「可拦截通道」；时间固定 UTC+8；
//   - 输出不含 <script>、不含 on* 事件属性、不引用任何外部资源，唯一的 href 是校验过的 Etherscan 地址 / 交易链接；
//     case.channels 里的官方举报页只作为文字出现（例外规则见 stripAllowedUrls）；不含传入的假 key；
//   - 所有外部字符串（label / note / facts / info / meta / 附录）进 HTML 前转义；去向图 SVG 里的脚本、事件、外链被剥掉；
//   - 截断、推断的提示；rulesOf 与迁移前页面的判定逐笔一致；页面与 lib 的类型名一致；卡点文案不含联系方式、不承诺追回。
// 运行：node --test（Windows / Node 24 下别写 `node --test tests/`）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Report = require('../lib/report.js');
const Trace = require('../lib/trace-eth.js');
const Official = require('../lib/official-data.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'etherscan-bitget');
const HTML_TEXT = readFileSync(join(ROOT, '溯流资金画布.html'), 'utf8');
const cli = await import('../tools/trace.mjs');

const KEY = 'FAKEKEY-SECRET-0123456789abcdef';
const GEN = '2026-10-05T10:00:00.000Z';
const START = '0x04065ccf52929dce58d9c7659de6ddac2316e84e';
const VAULT = '0xf5e10380213880111522dd0efd3dbb45b9f62bcc';
const PATH_HASHES = [
  '0xa28255f172dbfd4208147be07a79e4cef775c62c565f9a777fcaec7bfc9345fa',
  '0x0dc715c3587859215be48b48f153997c214fc8e8766c727f4fd97b3fb4dbc569',
  '0xfcb7dfd6037a7156ad5930fef6e58ac1e5a4b7fd99b72e6986d1fc0cb7673243',
  '0x26dbe07ec0c1da81640e76fd0f786d387d6293fc83626dcb245a23f49e7e1c5f',
  '0x63097baed07012392851662f23622239012b6b573a32f83141233bf8ad405e8a',
  '0x53f6ef0332b60f2533e37952e546a580750cb06c5810b63274b9658b129527a5'
];
const SECTIONS = ['1. 封面信息', '2. 摘要', '3. 资金去向图', '4. 卡点清单', '5. 交易明细', '6. 地址清单', '7. 方法与局限', '8. 免责声明'];

// ======================================================================
// 数据：页面内置的 Bitget 案、夹具回放出的追踪案件（带 ts）、官方静态快照
// ======================================================================
/** 从页面 HTML 里取出内置案件（函数 T 与 const CASES 之间的纯数据代码），在 vm 里求值；页面代码没有改动，这里只读 */
function loadBuiltinCases() {
  const a = HTML_TEXT.indexOf('function T(from, to, t, amt, eth, o)'), b = HTML_TEXT.indexOf('CASES.forEach(', a);
  assert.ok(a > 0 && b > a, '在页面里找不到 function T … CASES 区块');
  return vm.runInNewContext(HTML_TEXT.slice(a, b) + '\n;CASES;', {});
}
const BUILTIN = loadBuiltinCases()[0];

const snapCtx = { window: {} };
vm.createContext(snapCtx);
vm.runInContext(readFileSync(join(ROOT, 'data', 'official-snapshot.js'), 'utf8'), snapCtx);
const SNAP = snapCtx.window.SULIU_OFFICIAL_SNAPSHOT;
const INDEX = Official.buildIndex(SNAP);

/** 回放夹具：与 tests/trace-eth.test.mjs 的 CLI 回放同参数，进程内跑（key 是假的，回放不会发出它） */
const client = Trace.createClient({ key: KEY, fetchImpl: cli.makeReplayFetch(FIX), minIntervalMs: 0, maxCalls: 120 });
const TRACED = await Trace.trace({ client, start: START, startBlock: 26081300, maxHops: 3, topK: 6, official: SNAP, now: () => new Date('2026-10-05T09:00:00.000Z') });

const build = (o = {}) => Report.build(Object.assign({ generatedAt: GEN }, o));
const reportBuiltin = (o = {}) => build(Object.assign({ case: BUILTIN, meta: {}, official: INDEX, officialLabel: SNAP.label }, o));
const reportTraced = (o = {}) => build(Object.assign({ case: TRACED.case, meta: TRACED.meta, official: INDEX, officialLabel: SNAP.label }, o));

/** 一份最小的内置风格案件（手写）：victim → attacker → cex / bridge / mixer，外加一个 USDT 冻结点 */
function miniCase() {
  const A = i => '0x' + String(i).repeat(40);
  return {
    id: 'mini', title: '最小案件', short: '最小', en: 'mini incident', channels: '受害方官方举报渠道；交易所合规渠道；执法机关',
    facts: [['金额', '示例'], ['数据', '手写测试数据']], focus: 'a',
    nodes: [
      { id: 'v', type: 'victim', label: '受害钱包', addr: A(1), note: '受害方' },
      { id: 'a', type: 'attacker', label: '攻击者', addr: A(2), note: '' },
      { id: 'x', type: 'cex', label: '某交易所充值地址', addr: A(3), note: '交易所热钱包' },
      { id: 'b', type: 'bridge', label: '某跨链桥', addr: A(4), note: '跨链桥' },
      { id: 'm', type: 'mixer', label: '某混币器', addr: A(5), note: '混币器' },
      { id: 'u', type: 'relay', label: 'USDT 接收', addr: A(6), note: '' },
      { id: 'd', type: 'dust', label: '仿冒地址', addr: '0x2222…2222', note: '' },
      { id: 'c', type: 'compliant', label: '某兑换协议金库', addr: A(7), note: '协议金库' }
    ],
    txs: [
      { from: 'v', to: 'a', t: 100, amt: '10 ETH', eth: 10, hash: '0x' + 'a'.repeat(64), flags: [] },
      { from: 'a', to: 'x', t: 110, amt: '4 ETH', eth: 4, hash: '0x' + 'b'.repeat(64), flags: [] },
      { from: 'a', to: 'b', t: 111, amt: '3 ETH', eth: 3, hash: '0x' + 'c'.repeat(64), flags: [] },
      { from: 'a', to: 'm', t: 112, amt: '2 ETH', eth: 2, hash: '0x' + 'd'.repeat(64), flags: [] },
      { from: 'a', to: 'u', t: 113, amt: '5,000 USDT', eth: null, hash: '0x' + 'e'.repeat(64), flags: ['freeze'] },
      { from: 'd', to: 'a', t: 114, amt: '0 ETH', eth: 0, hash: '0x' + 'f'.repeat(64), flags: [] },
      { from: 'a', to: 'c', t: 120, amt: '1 ETH', eth: 1, hash: '0x' + '9'.repeat(64), flags: [] }
    ]
  };
}

// ======================================================================
// 检查器
// ======================================================================
const sectionOf = (html, n) => { const m = new RegExp('<section id="s' + n + '"[^>]*>([\\s\\S]*?)</section>').exec(html); assert.ok(m, '没有第 ' + n + ' 节'); return m[1]; };
const tagsOf = html => html.match(/<[a-zA-Z][^>]*>/g) || [];
/** 去掉所有被允许的外部地址后，剩下的文本里不得再有 http(s)://：
 *  例外 1：Etherscan 的 address / tx 链接（href）；例外 2：case.channels 里的官方举报页文字（按转义后的原文剔除，只作为文字、不是链接） */
function stripAllowedUrls(html, channels) {
  let s = html.replace(/href="https:\/\/etherscan\.io\/(address\/0x[0-9a-fA-F]{40}|tx\/0x[0-9a-fA-F]{64})"/g, 'href="OK"');
  if (channels) s = s.split(Report.esc(channels)).join('CHANNELS');
  return s;
}
function assertSafe(html, label, channels) {
  assert.ok(!/<script/i.test(html), label + '：含 <script');
  assert.ok(!/<\/script/i.test(html), label + '：含 </script');
  for (const tag of tagsOf(html)) {   // 只看真正的标签：转义后的文字里出现 " onerror=" 之类不算
    assert.ok(!/\son[a-z]+\s*=/i.test(tag), label + '：含 on* 事件属性：' + tag.slice(0, 120));
    assert.ok(!/javascript:/i.test(tag), label + '：含 javascript: ' + tag.slice(0, 120));
    assert.ok(!/\s(src|srcset|action|formaction|background|poster)\s*=/i.test(tag), label + '：含 src 等会加载外部资源的属性：' + tag.slice(0, 120));
  }
  const hrefs = [...html.matchAll(/\shref\s*=\s*"([^"]*)"/g)].map(m => m[1]);
  for (const h of hrefs) assert.match(h, /^https:\/\/etherscan\.io\/(address\/0x[0-9a-fA-F]{40}|tx\/0x[0-9a-fA-F]{64})$/, label + '：href 不是校验过的 Etherscan 地址 / 交易：' + h);
  assert.ok(!/@import|url\s*\(\s*['"]?https?:/i.test(html), label + '：CSS 引用了外部资源');
  assert.ok(!/<(iframe|object|embed|link|form|img|image|audio|video)\b/i.test(html), label + '：含不该有的元素');
  const rest = stripAllowedUrls(html, channels);
  const bad = rest.match(/https?:\/\/[^\s"'<>]+/g);
  assert.equal(bad, null, label + '：含 etherscan 以外的 http(s) 地址：' + (bad || []).slice(0, 3).join(' '));
  assert.ok(!html.includes(KEY), label + '：含假 key');
  assert.ok(!/apikey=(?!\*\*\*)/i.test(html), label + '：含 apikey= 参数');
}

// ======================================================================
// 章节、验收路径、卡点
// ======================================================================
test('章节：1–8 节标题齐全且按顺序；没有 guide 时不出附录；有封面标题与报告编号', () => {
  for (const [name, html] of [['内置', reportBuiltin()], ['追踪', reportTraced()], ['最小', build({ case: miniCase() })]]) {
    let at = -1;
    for (const title of SECTIONS) {
      const i = html.indexOf('<h2>' + title + '</h2>');
      assert.ok(i > at, name + '：缺章节或顺序不对：' + title);
      at = i;
    }
    assert.ok(!html.includes('9. 附录'), name + '：没有 guide 却出了附录');
    assert.ok(html.includes('<h1>链上资金去向证据报告</h1>'), name);
    assert.match(sectionOf(html, 1), /报告编号<\/th><td><span class="mono">SL-[0-9A-F]{10}<\/span>/, name);
  }
});

test('输出确定性：同样输入同样输出；报告编号只由 case.id 与 generatedAt 决定；generatedAt 必填', () => {
  assert.equal(reportBuiltin(), reportBuiltin());
  const id = html => /SL-[0-9A-F]{10}/.exec(html)[0];
  assert.equal(id(reportBuiltin()), Report.reportId(BUILTIN.id, GEN));
  assert.notEqual(id(reportBuiltin()), id(reportBuiltin({ generatedAt: '2026-10-05T10:00:01.000Z' })));
  assert.notEqual(id(reportBuiltin()), id(reportTraced()));
  assert.throws(() => Report.build({ case: BUILTIN }), TypeError);
  assert.throws(() => Report.build({ case: BUILTIN, generatedAt: 'not a date' }), TypeError);
  assert.throws(() => Report.build({ generatedAt: GEN }), TypeError);
  assert.throws(() => Report.build({ case: { nodes: [] }, generatedAt: GEN }), TypeError);
});

test('验收路径：6 笔交易哈希（完整 64 位）都出现且带 Etherscan 链接——内置案件与夹具回放的追踪案件都是', () => {
  for (const [name, html] of [['内置', reportBuiltin()], ['追踪', reportTraced()]]) {
    for (const h of PATH_HASHES) {
      assert.ok(html.includes('href="https://etherscan.io/tx/' + h + '"'), name + '：缺 tx 链接 ' + h);
      assert.ok(sectionOf(html, 5).includes('>' + h + '</a>'), name + '：交易明细里没有完整哈希 ' + h);
      assert.ok(sectionOf(html, 4).includes('>' + h + '</a>'), name + '：卡点清单里没有完整哈希 ' + h);
    }
  }
});

test('卡点：Chainflip 金库有「进入可拦截通道」卡点，类型、地址、来源、金额、哈希齐全（内置案件与追踪案件）', () => {
  for (const [name, html] of [['内置', reportBuiltin()], ['追踪', reportTraced()]]) {
    const cards = sectionOf(html, 4).split('<div class="card">').slice(1);
    const card = cards.find(c => /<h3>卡点 \d+ · 进入可拦截通道/.test(c) && c.includes(VAULT));
    assert.ok(card, name + '：没有金库的「进入可拦截通道」卡点');
    assert.match(card, /<span class="pill sev-high">高<\/span>/, name);
    assert.ok(card.includes('href="https://etherscan.io/address/' + VAULT + '"'), name);
    assert.match(card, /接收方类型：可拦截通道/, name);
    for (const h of [PATH_HASHES[2], PATH_HASHES[5]]) assert.ok(card.includes('>' + h + '</a>'), name + '：金库卡点里缺存入交易 ' + h);
    // 金额合计：按资产分别求和，与独立算出来的结果一致（内置案件只有验收路径的两笔 → 400,000 USDT；追踪案件的金库还收到别的充值通道的转入）
    const c = name === '内置' ? BUILTIN : TRACED.case;
    const vaultId = c.nodes.find(n => n.addr === VAULT).id, sums = new Map();
    for (const tx of c.txs.filter(x => x.to === vaultId)) { const m = /^([\d,.]+) (\w+)$/.exec(tx.amt); sums.set(m[2], (sums.get(m[2]) || 0) + parseFloat(m[1].replace(/,/g, ''))); }
    for (const [sym, v] of sums) assert.ok(card.includes(v.toLocaleString('en-US', { maximumFractionDigits: 6 }) + ' ' + sym), name + '：金额合计缺 ' + v + ' ' + sym);
    assert.equal(sums.get('USDT') >= 400000, true);
    if (name === '内置') assert.match(card, /金额合计<\/th><td>400,000 USDT<div/);
    for (const tx of c.txs.filter(x => x.to === vaultId && x.hash)) assert.ok(card.includes('>' + tx.hash + '</a>'), name + '：缺存入交易 ' + tx.hash);
    assert.match(card, /<th scope="row">事实 \/ 推断<\/th>/, name);
    assert.match(card, /建议动作/, name);
  }
});

test('卡点：每个卡点按「接收方 + 规则」一条；类型文案来自 RULES；建议动作来自 HEADLINE / ACTION', () => {
  const html = build({ case: miniCase() }), s4 = sectionOf(html, 4);
  const heads = [...s4.matchAll(/<h3>卡点 (\d+) · ([^<]+)<span class="pill sev-(\w+)">([^<]+)<\/span><\/h3>/g)].map(m => [m[1], m[2], m[3], m[4]]);
  // 排序：紧急 → 高 → 中；同级按首次到达升序（cex 区块 110、freeze 区块 113；compliant 120；bridge 111、mixer 112）
  assert.deepEqual(heads, [['1', '进入中心化交易所', 'urgent', '紧急'], ['2', '可冻结资产出现', 'urgent', '紧急'], ['3', '进入可拦截通道', 'high', '高'], ['4', '去中心化跨链 / 兑换', 'mid', '中'], ['5', '混币器', 'mid', '中']]);
  for (const r of Report.RULES) {
    assert.ok(s4.includes(Report.esc(Report.HEADLINE[r.id])), r.id + ' 的 HEADLINE');
    assert.ok(s4.includes(Report.esc(Report.ACTION[r.id])), r.id + ' 的 ACTION');
  }
  assert.ok(!s4.includes('仿冒地址'), '投毒粉尘发出的转账不算卡点');
  assert.equal(s4.split('<div class="card">').length - 1, 5);
  assert.match(sectionOf(html, 2), /共 5 处：进入中心化交易所 1 · 可冻结资产出现 1 · 进入可拦截通道 1 · 去中心化跨链 \/ 兑换 1 · 混币器 1/);
});

test('摘要：起点、范围、卡点统计、金额最大的前 3 个卡点（按接收方合并、不重复计金额）', () => {
  const s = sectionOf(reportTraced(), 2);
  assert.ok(s.includes('href="https://etherscan.io/address/' + START + '"'), '起点地址');
  assert.match(s, /起始区块 26081300；结束区块 最新（未限定）；最多 3 跳；每个节点最多展开前 6 个对手方/);
  assert.match(s, /卡点数量<\/th><td>共 \d+ 处：进入中心化交易所 0 · 可冻结资产出现 \d+ · 进入可拦截通道 \d+ · 去中心化跨链 \/ 兑换 \d+ · 混币器 0/);
  assert.match(s, /金额最大的前 3 个卡点/);
  // 内置案件：across 300 ETH（≈90 万美元排序值）、0x5889 的 425,959.08 USDT、Chainflip 金库 400,000 USDT（可拦截通道 + 可冻结资产出现合并成一个，不重复计金额）
  const b = sectionOf(reportBuiltin(), 2);
  const top = [...b.matchAll(/<li><strong>([^<]*)<\/strong> · ([^<]*)<br>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(top, [['Across SpokePool V2', '去中心化跨链 / 兑换'], ['未标注 0x5889', '可冻结资产出现'], ['Chainflip 以太坊金库', '可冻结资产出现、进入可拦截通道']], '同一个接收方命中多条规则时合并成一项，规则按严重程度排');
  assert.match(b, /300 ETH/);
  assert.match(b, /425,959\.08 USDT/);
  assert.match(b, /金额合计：400,000 USDT/, '金库的两条存入各 20 万，合并后是 40 万而不是 80 万');
  assert.match(b, /人工巡查/);
  assert.match(b, /受害方钱包：/);
});

test('金额合计：按资产分别求和；无法解析的金额单独说明而不是悄悄漏掉', () => {
  const c = miniCase();
  c.txs.push({ from: 'a', to: 'x', t: 115, amt: '1,000 USDT', eth: null, hash: '0x' + '1'.repeat(64), flags: ['freeze'] });
  c.txs.push({ from: 'a', to: 'x', t: 116, amt: '70 ETH → USDT/USDC', eth: 70, hash: '0x' + '2'.repeat(64), flags: [] });
  c.txs.push({ from: 'a', to: 'x', t: 117, amt: null, eth: null, flags: [] });
  const cards = sectionOf(build({ case: c }), 4);
  const cex = cards.split('<div class="card">').find(x => x.includes('进入中心化交易所'));
  assert.match(cex, /金额合计<\/th><td>1,000 USDT \+ 4 ETH<br>|金额合计<\/th><td>4 ETH \+ 1,000 USDT<br>/);
  assert.match(cex, /另有 2 笔金额无法汇总（70 ETH → USDT\/USDC）/);
  assert.match(cex, /哈希未抓取/);
  const r = Report.sumAssets([{ amt: '1,000.5 USDT' }, { amt: '2 USDT' }, { amt: '0.25 ETH' }, { amt: 'x' }, { amt: null }]);
  assert.deepEqual([...r.sums], [['USDT', 1002.5], ['ETH', 0.25]]);
  assert.deepEqual(r.unparsed, ['x', null]);
  assert.equal(Report.parseAmt('70 ETH → USDT/USDC'), null);
  assert.deepEqual(Report.parseAmt('425,959.08 USDT'), { value: 425959.08, symbol: 'USDT' });
});

// ======================================================================
// 时间：固定 UTC+8
// ======================================================================
test('时间：formatCst 固定 UTC+8，与 Intl（Asia/Shanghai）一致，且不依赖系统时区', () => {
  const ref = sec => new Date(sec * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  for (const sec of [0, 1790664263, 1790664587, 1767225599, 1735689600, 2000000000]) assert.equal(Report.formatCst(sec), ref(sec), String(sec));
  assert.equal(Report.formatCst(1790664263), '2026-09-29 14:44:23');
  assert.equal(Report.formatCst('abc'), '');
  assert.equal(Report.formatCst(null), '');
  // 换一个系统时区跑同一段代码，结果必须相同
  const code = "const R=require(process.argv[1]);console.log(R.formatCst(1790664263)+'|'+R.build({case:{id:'x',nodes:[],txs:[]},generatedAt:'2026-10-05T10:00:00.000Z'}).includes('2026-10-05 18:00:00'))";
  for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
    const r = spawnSync(process.execPath, ['-e', code, join(ROOT, 'lib', 'report.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { TZ: tz }) });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '2026-09-29 14:44:23|true', 'TZ=' + tz);
  }
});

test('时间：追踪案件的交易明细、卡点、摘要都用 UTC+8 时间；内置案件无 ts 写「—」并在表头注明', () => {
  const html = reportTraced();
  const first = TRACED.case.txs.find(t => t.hash === PATH_HASHES[0]);
  assert.equal(first.ts, 1790664263);
  assert.ok(sectionOf(html, 5).includes('<td class="mono small">2026-09-29 14:44:23</td>'), '交易明细里的 UTC+8 时间');
  assert.ok(sectionOf(html, 4).includes('2026-09-29 14:44:23（UTC+8）'), '卡点里的 UTC+8 时间');
  assert.match(sectionOf(html, 1), /生成时间<\/th><td>2026-10-05 18:00:00（UTC\+8）/);
  assert.match(sectionOf(html, 1), /数据抓取时间<\/th><td>2026-10-05 17:00:00（UTC\+8）/, 'meta.traced_at 是 09:00Z → 17:00 UTC+8');
  const maxTs = Math.max(...TRACED.case.txs.map(t => t.ts)), maxBlock = Math.max(...TRACED.case.txs.map(t => t.t));
  assert.ok(sectionOf(html, 1).includes('最大区块 ' + maxBlock + '；最晚时间戳 ' + Report.formatCst(maxTs) + '（UTC+8）'), '数据截止');
  assert.ok(!sectionOf(html, 5).includes('以区块浏览器为准'), '有 ts 的案件表头不需要那句提示');

  const b = reportBuiltin();
  assert.match(sectionOf(b, 5), /<th>时间（UTC\+8）<br><span class="muted small">内置案件无时间戳，以区块浏览器为准<\/span><\/th>/);
  assert.ok(sectionOf(b, 5).includes('<td class="mono small">—</td>'));
  assert.match(sectionOf(b, 1), /最大区块 26081719；最晚时间戳：—（案件数据无时间戳，以区块浏览器为准）/);
  assert.match(sectionOf(b, 4), /—（无时间戳） · 区块 26081410/);
});

test('交易明细：按区块升序，笔数与案件一致，每个有效哈希完整出现并带链接', () => {
  for (const [name, c, html] of [['内置', BUILTIN, reportBuiltin()], ['追踪', TRACED.case, reportTraced()]]) {
    const s5 = sectionOf(html, 5), rows = s5.split('<tr').slice(2);
    assert.equal(rows.length, c.txs.length, name + '：行数');
    const blocks = rows.map(r => Number(/<td class="mono small n">(\d+)<\/td><td>/.exec(r)[1]));
    assert.deepEqual(blocks, blocks.slice().sort((a, b) => a - b), name + '：按区块升序');
    for (const tx of c.txs) if (tx.hash) assert.ok(s5.includes('href="https://etherscan.io/tx/' + tx.hash + '"'), name + '：缺 ' + tx.hash);
    assert.match(s5, /<th class="n">序号<\/th>/);
  }
});

// ======================================================================
// 安全：无脚本、无外链、无 key、全部转义
// ======================================================================
test('安全：输出不含 <script>、on* 属性、除 Etherscan 外的 http(s) 地址（官方举报页文字除外）、假 key', () => {
  assertSafe(reportBuiltin(), '内置', BUILTIN.channels);
  assertSafe(reportTraced(), '追踪', TRACED.case.channels);
  assertSafe(build({ case: miniCase() }), '最小', miniCase().channels);
  // 例外规则本身要能抓到违规：把官方举报页写成链接 / 混进别处，就应该失败
  const html = reportBuiltin();
  assert.ok(html.includes('https://trace.bgblockchain.xyz/report'), '内置案件的 channels 文字里有官方举报页');
  assert.throws(() => assertSafe(html.replace('</main>', '<a href="https://trace.bgblockchain.xyz/report">x</a></main>'), '坏样例', BUILTIN.channels));
  assert.throws(() => assertSafe(html.replace('</main>', '<p>https://evil.example/x</p></main>'), '坏样例', BUILTIN.channels));
  assert.throws(() => assertSafe(html.replace('</main>', '<img src=x></main>'), '坏样例', BUILTIN.channels));
  assert.throws(() => assertSafe(html.replace('</main>', '<p onclick="x()">a</p></main>'), '坏样例', BUILTIN.channels));
  assert.throws(() => assertSafe(html.replace('</main>', '<script>1</script></main>'), '坏样例', BUILTIN.channels));
  // 页面 CSP 兜底存在
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">/);
});

test('安全：用假 key 跑出来的追踪结果，报告里没有 key（含 meta.warnings 里意外带出的 apikey= 参数会被抹掉）', () => {
  assert.ok(!JSON.stringify(TRACED).includes(KEY));
  const meta = Object.assign({}, TRACED.meta, { warnings: ['请求失败 https://api.etherscan.io/v2/api?module=account&apikey=' + KEY + '&x=1'] });
  const html = reportTraced({ meta });
  assert.ok(!html.includes(KEY), 'key 原样出现');
  assert.match(html, /apikey=\*\*\*&amp;x=1/);
});

const EVIL = ['<img src=x onerror=alert(1)>', '"><script>alert(2)</script>', "'><svg onload=alert(3)>", '<a href="javascript:alert(4)">x</a>'];
test('XSS：label / note / facts / title / channels / tx.note / info / meta 里的恶意字符串只以转义形式出现', () => {
  const c = miniCase();
  c.title = EVIL[0] + EVIL[1];
  c.channels = EVIL[2] + ' ' + EVIL[3];
  c.facts.push([EVIL[0], EVIL[1]], ['数据来源', EVIL[2]]);
  c.nodes[2].label = EVIL[0]; c.nodes[2].note = EVIL[1] + EVIL[2];
  c.nodes[1].label = EVIL[3]; c.nodes[1].note = '推断 ' + EVIL[0];
  c.nodes[3].inferred = true; c.nodes[3].note = EVIL[1];
  c.txs[1].note = EVIL[0]; c.txs[2].amt = EVIL[1];
  c.offFilled = [EVIL[0]];
  const info = { party: EVIL[0], contact: EVIL[1], story: EVIL[0] + '\n' + EVIL[1] + '\n' + EVIL[2], theftTx: EVIL[2] };
  const meta = { params: { startBlock: 1 }, truncated: EVIL[1], warnings: [EVIL[0]], stoppedAt: [{ addr: '0x' + '9'.repeat(40), reason: EVIL[1] }], ignored: { fakeToken: EVIL[0] } };
  const html = build({ case: c, meta, info });
  // 没有任何一个恶意字符串变成标签 / 属性
  assert.ok(!/<img\b/i.test(html), '出现了 <img');
  assert.ok(!/<script/i.test(html), '出现了 <script');
  assert.ok(!/<svg\b[^>]*onload/i.test(html), '出现了 <svg onload');
  assert.ok(!/<a\b[^>]*href="javascript:/i.test(html), '出现了 javascript: 链接');
  assertSafe(html, 'XSS', null);
  // 转义形式存在于该出现的地方
  for (const ev of EVIL) assert.ok(html.includes(Report.esc(ev)), '缺少转义形式：' + ev);
  assert.ok(sectionOf(html, 1).includes('<div class="story">' + Report.esc(info.story) + '</div>'), '被盗经过');
  assert.ok(sectionOf(html, 1).includes('<th scope="row">报案人或单位</th><td>' + Report.esc(EVIL[0]) + '</td>'), '报案人');
  assert.ok(sectionOf(html, 1).includes('<th scope="row">联系方式</th><td>' + Report.esc(EVIL[1]) + '</td>'), '联系方式');
  assert.ok(html.includes('<title>链上资金去向证据报告 · ' + Report.esc(c.title) + '</title>'), '标题');
  assert.ok(sectionOf(html, 6).includes(Report.esc(EVIL[0])), '节点 label');
  assert.ok(sectionOf(html, 2).includes(Report.esc(EVIL[1])), '截断原因');
  // 被盗交易哈希格式不对：当文字显示，不生成链接
  assert.ok(!sectionOf(html, 1).includes('etherscan.io/tx/' + EVIL[2]));
  assert.match(sectionOf(html, 1), /格式不是 0x 加 64 位十六进制，未生成链接/);
});

test('XSS：地址 / 哈希先校验再拼链接——格式不对的只当文字，不进 href', () => {
  const c = miniCase();
  c.nodes[2].addr = '0x' + '3'.repeat(40) + '"onmouseover="alert(1)';
  c.nodes[3].addr = '0x123';
  c.txs[1].hash = '0x' + 'b'.repeat(63) + '"';
  c.txs[2].hash = 'javascript:alert(1)';
  const html = build({ case: c });
  assertSafe(html, '地址 / 哈希', null);
  assert.ok(!html.includes('onmouseover="alert'), '属性注入');
  assert.match(sectionOf(html, 6), /地址不完整，无法核对/);
  assert.match(sectionOf(html, 5), /哈希未抓取/);
});

const DIRTY_SVG = '<svg id="svg" role="application" viewBox="0 0 400 200" onload="alert(1)" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
  '<defs><marker id="ah" viewBox="0 0 10 10" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ah"/></marker></defs>' +
  '<script>alert(1)</script><style>@import url(http://evil.example/x.css)</style>' +
  '<g id="world" transform="translate(0,0) scale(1)" onclick="evil()" data-node="a&quot;><script>alert(9)</script>">' +
  '<g class="nd t-victim" onmouseover="x()"><rect class="box" width="216" height="68" rx="10" style="fill:url(http://evil.example/a.png)"/>' +
  '<text class="lb" x="12" y="41">&lt;img src=x onerror=alert(1)&gt; 受害方</text></g>' +
  '<a href="javascript:alert(2)"><text>link</text></a><a xlink:href="https://evil.example"><rect width="1" height="1"/></a>' +
  '<foreignObject><div onclick="x()">html</div></foreignObject><image href="http://evil.example/p.png" width="5" height="5"/>' +
  '<use xlink:href="#world"/><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onload" to="alert(1)"/>' +
  '<path class="ln" d="M0 0L5 5" marker-end="url(#ah)" stroke-width="2.00"/><path d="M0 0" fill="url(http://evil.example/x)"/>' +
  '<!-- <script>alert(3)</script> --><iframe src="http://evil.example"></iframe><text onfocus=x() y=1>unquoted</text></g></svg><p>after</p><script>alert(5)</script>';
test('SVG 清洗：剥掉 script / style / foreignObject / image / a / use / 事件属性 / 外链 / javascript:，保留图形与文字', () => {
  const out = Report.sanitizeSvg(DIRTY_SVG);
  assert.ok(out.startsWith('<svg') && out.endsWith('</svg>'), out.slice(0, 80));
  assert.ok(!/<script|<style|<foreignObject|<image|<iframe|<use|<animate|<set|<a[\s>]/i.test(out), out);
  for (const tag of tagsOf(out)) assert.ok(!/\son[a-z]+\s*=/i.test(tag), '事件属性：' + tag);
  const noText = out.replace(/>[^<]*</g, '><');   // 文字节点里已转义的内容不算（下面单独断言它被原样保留）
  assert.ok(!/javascript:|evil\.example|xmlns|xlink|href|@import|style=/i.test(noText), out);
  assert.ok(!/<p>after|alert\(5\)|alert\(1\)<\/script|alert\(3\)/.test(out), '<svg> 之外的内容与注释被丢弃');
  // 图形、文字、viewBox、marker 保留
  assert.match(out, /viewBox="0 0 400 200"/);
  assert.match(out, /<g class="nd t-victim"><rect class="box" width="216" height="68" rx="10"><\/rect>/);
  assert.match(out, /<text class="lb" x="12" y="41">&lt;img src=x onerror=alert\(1\)&gt; 受害方<\/text>/, '文字里已转义的内容原样保留，不会变成标签');
  assert.match(out, /marker-end="url\(#ah\)"/);
  assert.match(out, /<marker id="ah"/);
  // 属性里夹带的 <script> 不会成为标签（引号内的 < > 被转义）
  assert.ok(!/<script/i.test(out));
  // 不是 svg / 空 / 非字符串
  for (const bad of ['', '<div>x</div>', null, undefined, 123, '<svg']) assert.ok(typeof Report.sanitizeSvg(bad) === 'string');
  assert.equal(Report.sanitizeSvg('<div>x</div>'), '');
  assert.equal(Report.sanitizeSvg(null), '');
  // 嵌进整份报告后仍然安全；报告里的去向图在第 3 节，带图注
  const html = build({ case: miniCase(), svg: DIRTY_SVG });
  assertSafe(html, '带脏 SVG 的报告', null);
  assert.ok(sectionOf(html, 3).includes('<div class="diagram"><svg id="svg"'), '去向图嵌入第 3 节');
  assert.ok(sectionOf(html, 3).includes('图注：由溯流根据公开链上数据生成；虚线表示推断或未核实'), '图注');
  assert.ok(!sectionOf(build({ case: miniCase() }), 3).includes('<svg'), '没传 svg 就不出图');
  assert.match(sectionOf(build({ case: miniCase() }), 3), /本报告未附去向图/);
});

test('附录：有 guide（参数）才出第 9 节；html 经过白名单清洗，只放行 Etherscan 链接', () => {
  const guide = { sections: [
    { title: '报案材料清单', html: '<p class="x">带上 <strong>地址</strong>与哈希<script>alert(1)</script></p><ul><li onclick="x()">一</li></ul>' },
    { title: EVIL[0], html: '<a href="javascript:alert(1)">bad</a> <a href="https://evil.example/">evil</a> <a href="https://etherscan.io/address/0x' + '1'.repeat(40) + '">ok</a><iframe src="x"></iframe><img src=x onerror=alert(1)>' }
  ] };
  const html = build({ case: miniCase(), guide });
  assert.ok(html.includes('<h2>9. 附录：报案指引</h2>'));
  assertSafe(html, '带附录的报告', null);
  const s9 = sectionOf(html, 9);
  assert.ok(s9.includes('<h3>报案材料清单</h3>'));
  assert.ok(s9.includes('<p class="x">带上 <strong>地址</strong>与哈希</p>'), '<script> 被整块丢弃');
  assert.ok(s9.includes('<li>一</li>'), 'on* 属性被剥掉');
  assert.ok(s9.includes('<a href="https://etherscan.io/address/0x' + '1'.repeat(40) + '">ok</a>'));
  assert.ok(!/evil\.example|javascript:|<img|<iframe/i.test(s9));
  assert.ok(s9.includes(Report.esc(EVIL[0])), '附录标题转义');
  // 空 sections / 缺省都不出附录
  assert.ok(!build({ case: miniCase(), guide: { sections: [] } }).includes('9. 附录'));
  assert.ok(!build({ case: miniCase(), guide: {} }).includes('9. 附录'));
});

// ======================================================================
// 截断、推断、info、官方名单
// ======================================================================
test('截断：meta.truncated 为真 → 摘要里有醒目的截断原因；为假则没有', () => {
  const meta = Object.assign({}, TRACED.meta, { truncated: true, truncatedReasons: ['API 调用预算用完（120/120），剩余节点未展开'] });
  const s = sectionOf(reportTraced({ meta }), 2);
  assert.ok(s.includes('<div class="bx warn"><strong>结果被截断，本报告不完整：</strong>API 调用预算用完（120/120），剩余节点未展开。'), s.slice(0, 600));
  assert.ok(s.indexOf('bx warn') < s.indexOf('<table'), '截断提示在摘要表格之前（醒目）');
  assert.ok(sectionOf(reportTraced({ meta: Object.assign({}, meta, { truncated: '预算用完', truncatedReasons: undefined }) }), 2).includes('预算用完。'));
  assert.ok(sectionOf(reportTraced({ meta: { truncated: true } }), 2).includes('原因未说明'));
  assert.ok(!sectionOf(reportTraced(), 2).includes('bx warn'), 'truncated 为 false 不应出现截断提示');
  assert.equal(TRACED.meta.truncated, false);
});

test('推断与待核实：只有 inferred:true（或说明里写了「推断」）算推断；「待核实 / 待人工核实」不算，改在摘要单列「待核实事项」，卡点仍标「链上事实」', () => {
  const b = reportBuiltin(), s2 = sectionOf(b, 2), cards = sectionOf(b, 4).split('<div class="card">').slice(1);
  const R58 = '0x5889433b754324089d4b6f168840fe5b13fe25df', C51C = '0xc51c568be036cc5383575d23884beefbd7070db5', CH1 = '0xec008786a6a966f10f0fa01a6511517c4c05e079', U61 = '0x6101B936FA0F7aE9A49B7260CB59b56AA31d7126';
  const cardFor = (rule, addr) => {
    const c = cards.find(x => x.includes('· ' + rule + '<span') && x.includes('<th scope="row">地址</th><td><a class="mono addr" href="https://etherscan.io/address/' + addr + '"'));
    assert.ok(c, '找不到卡点：' + rule + ' ' + addr);
    return c;
  };
  // 0x0406 发出的冻结点：接收方都不是推断节点 → 链上事实（0x0406 的 note 写着「待人工核实」，但不改变标记），并提示见摘要
  for (const addr of [R58, C51C, U61]) {
    const c = cardFor('可冻结资产出现', addr);
    assert.match(c, /<span class="tag fact">链上事实<\/span>/, addr);
    assert.ok(!c.includes('tag infer'), addr + '：不该标推断');
    assert.match(c, /涉及的节点「下一跳 0x0406」有待核实事项，见第 2 节摘要的「待核实事项」/, addr);
  }
  // 经 ch1 / ch2 进金库、接收方就是 ch1：仍是推断
  assert.match(cardFor('可冻结资产出现', CH1), /<span class="tag infer">推断<\/span> 涉及推断出来的节点：Chainflip 充值通道 0xec00/);
  const cf = cardFor('进入可拦截通道', VAULT);
  assert.match(cf, /<span class="tag infer">推断<\/span>/, '金库的上游是推断出来的充值通道，卡点要标推断');
  assert.match(cf, /来源方「Chainflip 充值通道 0xec00」<span class="mono small muted">0xec0087…05e079<\/span>（推断）：推断为 Chainflip 一次性充值地址/);
  assert.match(cardFor('可冻结资产出现', VAULT), /<span class="tag infer">推断<\/span>/);
  // 摘要：推断提示框只列 inferred 节点，不含 0x0406；另有单列的「待核实事项」行，原文照录（转义）
  const box = /<div class="bx note">([\s\S]*?)<\/div>/.exec(s2)[1];
  assert.match(box, /本报告含推断内容，见第 4 节与第 6 节/);
  assert.match(box, /Chainflip 充值通道 0xec00/);
  assert.match(box, /Chainflip 充值通道 0x39dd/);
  assert.ok(!box.includes('0x0406'), '待核实的节点不算推断，不在推断提示框里');
  const n04 = BUILTIN.nodes.find(n => n.id === 'n04');
  assert.match(n04.note, /待人工核实/);
  assert.ok(s2.includes('<th scope="row">待核实事项</th><td><ul class="small" style="margin:0;padding-left:4.5mm"><li><strong>下一跳 0x0406</strong>（0x04065C…16E84E）：' + Report.esc(n04.note) + '</li></ul>'), '待核实事项行：节点标签 + note 原文');
  assert.match(s2, /Chainflip 金库在同一时段向它转回约 160 万 USDT（8 笔，像是兑换退款），待人工核实。/);
  // 地址清单：0x0406 标「待核实」不标「推断」；通道节点标「推断」
  const s6 = sectionOf(b, 6), rowOf = a => s6.split('<tr').find(r => r.includes('/address/' + a + '"'));
  assert.match(rowOf('0x04065CcF52929dCE58D9c7659dE6dDAc2316E84E'), /<span class="tag infer">待核实<\/span>/);
  assert.ok(!/<span class="tag infer">推断<\/span>/.test(rowOf('0x04065CcF52929dCE58D9c7659dE6dDAc2316E84E')));
  assert.match(rowOf(CH1), /<span class="tag infer">推断<\/span>/);
  // 判定函数
  assert.equal(Report.isInferred({ inferred: true }), true);
  assert.equal(Report.isInferred({ note: '充值通道（推断）：…' }), true, '引擎写进 note 的「推断」仍算推断（引擎不设 inferred 字段）');
  assert.equal(Report.isInferred({ note: '像是兑换被退款，待人工核实' }), false);
  assert.equal(Report.isInferred({ note: '待核实' }), false);
  assert.equal(Report.isInferred({ note: 'Bitget 官方 reviewed：Chainflip 以太坊 Vault' }), false);
  assert.equal(Report.isInferred(null), false);
  assert.equal(Report.isPending({ note: '像是兑换被退款，待人工核实' }), true);
  assert.equal(Report.isPending({ note: '待核实' }), true);
  assert.equal(Report.isPending({ note: '推断为充值通道', inferred: true }), false);
  assert.equal(Report.isPending(null), false);
  // 夹具追踪案件：没有待核实节点 → 没有这一行；引擎写了「推断」的合约 / 通道节点仍标推断
  assert.ok(!sectionOf(reportTraced(), 2).includes('待核实事项'));
  assert.match(sectionOf(reportTraced(), 4).split('<div class="card">').find(c => c.includes('进入可拦截通道') && c.includes(VAULT)), /<span class="tag infer">推断<\/span>/);
  // 只有待核实、没有推断的案件：不出推断提示框；出「待核实事项」（转义）；卡点标链上事实并提示
  const m = miniCase();
  m.nodes[1].note = '待核实 ' + EVIL[0];
  const h = build({ case: m }), hs2 = sectionOf(h, 2);
  assert.ok(!hs2.includes('本报告含推断内容'));
  assert.ok(hs2.includes('<li><strong>攻击者</strong>（0x222222…222222）：待核实 ' + Report.esc(EVIL[0]) + '</li>'));
  assertSafe(h, '待核实事项', null);
  assert.match(sectionOf(h, 4), /<span class="tag fact">链上事实<\/span>/);
  assert.ok(!sectionOf(h, 4).includes('tag infer'));
  assert.match(sectionOf(h, 4), /涉及的节点「攻击者」有待核实事项，见第 2 节摘要的「待核实事项」/);
  // 什么标记都没有的案件
  const clean = build({ case: miniCase() });
  assert.ok(!sectionOf(clean, 2).includes('本报告含推断内容'));
  assert.ok(!sectionOf(clean, 2).includes('待核实事项'));
  assert.match(sectionOf(clean, 4), /<span class="tag fact">链上事实<\/span>/);
  assert.ok(!sectionOf(clean, 4).includes('tag infer') && !sectionOf(clean, 4).includes('待核实事项'));
});

test('摘要起点：追踪案件用 meta.start；内置案件有受害方钱包就写受害方钱包（可多个），聚焦节点不当起点；没有受害方才退回聚焦节点', () => {
  const t = sectionOf(reportTraced(), 2);
  assert.ok(t.includes('<th scope="row">起点地址</th><td><a class="mono addr" href="https://etherscan.io/address/' + START + '"'), '追踪案件：meta.start');
  const b = sectionOf(reportBuiltin(), 2);
  const startRow = /<th scope="row">起点地址<\/th><td>([\s\S]*?)<\/td>/.exec(b)[1];
  assert.ok(startRow.includes('Bitget 6（热钱包）') && startRow.includes('href="https://etherscan.io/address/0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23"'), '起点＝受害方钱包 ' + startRow);
  assert.ok(!startRow.includes('0x04065CcF') && !startRow.includes('聚焦'), '聚焦节点 0x0406 不当起点');
  assert.ok(!b.includes('案件聚焦节点'));
  assert.ok(!b.includes('<th scope="row">受害方钱包</th>'), '内置案件不再另列「受害方钱包」行（已经是起点）');
  // 多个受害方钱包都列出
  const c2 = miniCase();
  c2.nodes.push({ id: 'v2', type: 'victim', label: '受害钱包二', addr: '0x' + '8'.repeat(40), note: '' });
  const r2 = /<th scope="row">起点地址<\/th><td>([\s\S]*?)<\/td>/.exec(sectionOf(build({ case: c2 }), 2))[1];
  assert.ok(r2.includes('/address/0x' + '1'.repeat(40) + '"') && r2.includes('/address/0x' + '8'.repeat(40) + '"'), '多个受害方钱包');
  // 追踪案件同时有 meta.start 和受害方节点：起点用 meta.start，受害方钱包另列
  const both = sectionOf(build({ case: miniCase(), meta: { start: '0x' + '4'.repeat(40), params: { startBlock: 1 } } }), 2);
  assert.ok(both.includes('<th scope="row">起点地址</th><td><a class="mono addr" href="https://etherscan.io/address/0x' + '4'.repeat(40) + '"'));
  assert.ok(both.includes('<th scope="row">受害方钱包</th>'));
  // 没有受害方节点：退回聚焦节点并注明
  const c4 = miniCase();
  c4.nodes = c4.nodes.filter(n => n.type !== 'victim');
  assert.match(sectionOf(build({ case: c4 }), 2), /<th scope="row">起点地址<\/th><td><a class="mono addr" href="https:\/\/etherscan\.io\/address\/0x2{40}"[^>]*>0x2{40}<\/a>（案件聚焦节点：攻击者）/);
});

test('info：用户填写的信息全部转义；空则不显示该行；被盗交易哈希格式对才生成链接', () => {
  const none = sectionOf(build({ case: miniCase() }), 1);
  for (const label of ['报案人或单位', '联系方式', '被盗交易哈希', '被盗经过']) assert.ok(!none.includes(label), '空 info 不该有：' + label);
  assert.ok(!none.includes('自行填写'));
  const h = '0x' + 'ab'.repeat(32);
  const s1 = sectionOf(build({ case: miniCase(), info: { party: '甲公司', contact: '张三 / 138****0000', story: '第一行\n第二行', theftTx: h } }), 1);
  assert.match(s1, /报案人或单位<\/th><td>甲公司<\/td>/);
  assert.match(s1, /联系方式<\/th><td>张三 \/ 138\*\*\*\*0000<\/td>/);
  assert.match(s1, /被盗经过<\/th><td><div class="story">第一行\n第二行<\/div>/);
  assert.ok(s1.includes('href="https://etherscan.io/tx/' + h + '"'));
  assert.match(s1, /以上 4 项由报案人自行填写，溯流未核实/);
  // 部分为空
  const s2 = sectionOf(build({ case: miniCase(), info: { party: '  乙  ', contact: '', story: '   ' } }), 1);
  assert.match(s2, /报案人或单位<\/th><td>乙<\/td>/);
  assert.ok(!s2.includes('联系方式') && !s2.includes('被盗经过'));
  assert.match(s2, /以上 1 项/);
  // 超长被截断
  assert.ok(sectionOf(build({ case: miniCase(), info: { story: 'x'.repeat(9000) } }), 1).split('x').length - 1 === 4000);
});

test('官方名单：写明「静态快照 <label>」与每个地址的状态；不传 official 就没有这一列；缺 lib 时提示未执行', () => {
  const html = reportTraced();
  const s6 = sectionOf(html, 6);
  assert.ok(s6.includes('Bitget 官方名单状态（静态快照 ' + SNAP.label + '）'));
  const rowOf = addr => s6.split('<tr').find(r => r.includes('/address/' + addr + '"'));
  assert.match(rowOf(START), /在官方攻击者名单中/);
  assert.match(rowOf(VAULT), /官方已核查：非攻击者「Chainflip 以太坊 Vault」（协议金库）/);
  assert.ok(sectionOf(html, 4).includes('<div>官方名单（静态快照 ' + SNAP.label + '）：官方已核查：非攻击者「Chainflip 以太坊 Vault」（协议金库）</div>'), '卡点的判定依据里带官方名单状态');
  // 传快照对象（而不是索引）也行；label 取快照自带的
  const bySnap = build({ case: TRACED.case, meta: TRACED.meta, official: SNAP });
  assert.ok(sectionOf(bySnap, 6).includes('静态快照 ' + SNAP.label));
  // 内置案件：补全地址的提示
  assert.match(sectionOf(reportBuiltin(), 6), /该地址由官方名单反推补全，命中官方名单不算独立印证/);
  // 没传 official
  const plain = build({ case: TRACED.case, meta: TRACED.meta });
  assert.ok(!sectionOf(plain, 6).includes('官方名单状态'));
  assert.ok(!sectionOf(plain, 4).includes('官方名单（静态快照'));
  // 传了但没有 lib
  const nolib = Report.build({ case: TRACED.case, meta: TRACED.meta, generatedAt: GEN, official: { holdings: {} }, officialLib: {} });
  assert.match(sectionOf(nolib, 6), /官方名单核对未执行/);
  // 仿冒与不在名单
  assert.match(sectionOf(build({ case: miniCase(), official: INDEX }), 6), /不在官方名单中（未命中不等于资金干净）/);
});

test('方法与局限、免责声明：规格要求的内容都在', () => {
  const s7 = sectionOf(reportTraced(), 7), s8 = sectionOf(reportTraced(), 8);
  assert.match(s7, /Etherscan API V2/);
  assert.match(s7, /代币真假只按合约地址判断（白名单：USDT、USDC、DAI、WETH、WBTC、stETH \+ 原生 ETH/);
  assert.match(s7, /金额为 0 或低于阈值的转账忽略（阈值：ETH 0\.05、WETH 0\.05、stETH 0\.05、USDT 100、USDC 100、DAI 100、WBTC 0\.002）/);
  assert.match(s7, /首 4 位、末 4 位相同/);
  assert.match(s7, /合约、协议金库、交易所视为终点/);
  assert.match(s7, new RegExp('假代币转账 ' + TRACED.meta.ignored.fakeToken + ' 笔；0 值 ' + TRACED.meta.ignored.zeroValue + ' 笔；低于阈值 ' + TRACED.meta.ignored.dust + ' 笔；疑似投毒 ' + TRACED.meta.ignored.poison + ' 笔；排在前 K 个之外未展开的对手方 ' + TRACED.meta.ignored.belowTopK + ' 个'));
  assert.match(s7, /只追转出：<\/strong>本报告只追踪资金的「转出」方向，转入记录与退款/);
  assert.match(s7, /推断不等于定性/);
  assert.match(s7, /自动结果需人工复核/);
  assert.match(s7, /追踪停止点与下一步/);
  assert.match(s7, /追踪时的警告/);
  assert.match(s7, new RegExp('API 调用 ' + TRACED.meta.calls + ' / 120 次'));
  for (const phrase of ['不构成法律意见', '不承诺追回', '归因以执法机关结论为准', '报案以当地公安机关的要求为准', '不替用户联系任何机构', '请勿联系或付费给洗钱方']) assert.ok(s8.includes(phrase), '免责声明缺：' + phrase);
  assert.ok(s8.includes(Report.esc(TRACED.case.channels)), '渠道文字');
  // 内置案件的方法节：人工巡查，不写 API 阈值
  const b7 = sectionOf(reportBuiltin(), 7);
  assert.match(b7, /人工巡查与 Etherscan API 补查/);
  assert.ok(!b7.includes('阈值：'));
});

test('封面：数据来源（追踪案件写「Etherscan API 自动追踪」，内置案件取 facts 里的来源说明）、案件说明、数据截止', () => {
  const t = sectionOf(reportTraced(), 1), b = sectionOf(reportBuiltin(), 1);
  assert.match(t, /数据来源<\/th><td>Etherscan API 自动追踪（Etherscan API V2（chainid 1），抓取时间 /);
  assert.match(b, /数据来源<\/th><td>Etherscan 地址页快照，2026-09-30；区块号为准；6 个截断或笔误地址按 Bitget 官方接口补全/);
  assert.match(b, /案件说明（来自案件数据）/);
  assert.match(b, /归因<\/th><td>受害方与分析机构判断，执法机关尚未确认/);
  assert.match(b, /案件<\/th><td>Bitget 被盗案 · 以太坊部分 <span class="muted mono">\(bitget\)<\/span>/);
});

test('降级：空案件、没有卡点、没有 meta / facts 都能生成，不抛错', () => {
  const html = build({ case: { id: 'empty', nodes: [], txs: [] } });
  for (const title of SECTIONS) assert.ok(html.includes('<h2>' + title + '</h2>'), title);
  assert.match(sectionOf(html, 4), /未识别到卡点/);
  assert.match(sectionOf(html, 2), /未识别到卡点（交易所、可冻结稳定币、可拦截通道、跨链 \/ 兑换、混币器）。未命中不等于资金安全/);
  assert.match(sectionOf(html, 1), /案件数据未写明来源/);
  assertSafe(html, '空案件', null);
  // 节点 / 转账里混进非对象、引用不存在的节点
  const odd = build({ case: { id: 'odd', nodes: [null, 5, { id: 'a', type: 'weird', label: 'A', addr: '0x' + '1'.repeat(40) }], txs: [null, { from: 'a', to: 'ghost', t: 'x', amt: null }, { from: 'ghost', to: 'a', t: 5 }] } });
  assert.match(sectionOf(odd, 5), /（未知节点）/);
  assert.match(sectionOf(odd, 6), /weird/);
});

// ======================================================================
// 打印样式、去向图样式
// ======================================================================
test('打印：A4 页面、提示条只靠 CSS 在打印时隐藏（不靠脚本）、去向图一节单独横向页、表头每页重复、条目不被切断', () => {
  const html = reportBuiltin(), css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.match(css, /@page\{size:A4;margin:/);
  assert.match(css, /@page diagram\{size:A4 landscape/);
  assert.match(css, /@media print\{[\s\S]*\.printbar\{display:none\}/);
  assert.match(css, /\.sec-diagram\{page:diagram;/);
  assert.match(css, /thead\{display:table-header-group\}/);
  assert.match(css, /tr\{break-inside:avoid/);
  assert.match(css, /print-color-adjust:exact/);
  assert.ok(html.includes('<div class="printbar">按 Ctrl+P（Mac 为 ⌘P）可打印或另存为 PDF</div>'));
  assert.ok(!/<script/i.test(html));
  assert.match(html, /@page\{@bottom-left\{content:"溯流 · 报告编号 SL-[0-9A-F]{10}"/);
  // 去向图用到的类（与页面画布一致）都有样式；动画不带进报告
  for (const cls of ['.nd .box', '.nd.inferred .box', '.nd.dust .box', '.ring.u', '.ring.h', '.eg.dash .ln', '.eg .lt', '.col-lb', '.ah-u', '.t-compliant{', '.t-attacker{']) assert.ok(css.includes(cls), '缺样式：' + cls);
  assert.ok(!/@keyframes|animation:/.test(css), '报告是静态的');
});

// ======================================================================
// rulesOf：与迁移前页面的判定逐笔一致
// ======================================================================
/** 迁移前页面里的 txRules（逐字拷贝，作为对照；迁移后页面不再有这份实现） */
function oldTxRules(tx, f, to) {
  if (f.type === 'dust') return [];
  const r = [];
  if (to.type === 'cex') r.push('cex');
  if (tx.flags && tx.flags.includes('freeze')) r.push('freeze');
  if (to.type === 'compliant') r.push('compliant');
  if (to.type === 'bridge') r.push('bridge');
  if (to.type === 'mixer') r.push('mixer');
  return r;
}
test('rulesOf：对 Bitget 内置案件与追踪案件的每笔转账，迁移前后规则结果相同；类型 × flags 全组合也相同', () => {
  let nonEmpty = 0, total = 0;
  const kinds = new Set();
  for (const c of [BUILTIN, TRACED.case]) {
    const N = new Map(c.nodes.map(n => [n.id, n]));
    for (const tx of c.txs) {
      const f = N.get(tx.from), to = N.get(tx.to);
      const a = Report.rulesOf(tx, f, to), b = oldTxRules(tx, f, to);
      assert.deepEqual(a, b, `${c.id} ${tx.from}→${tx.to} @${tx.t}`);
      total++; if (a.length) nonEmpty++;
      a.forEach(r => kinds.add(r));
    }
  }
  assert.ok(total >= 100 && nonEmpty >= 20, '对照不能是空转：' + total + ' / ' + nonEmpty);
  for (const r of ['freeze', 'compliant', 'bridge']) assert.ok(kinds.has(r), '对照里没有覆盖到 ' + r);
  const types = Object.keys(Report.TYPE_NAMES);
  for (const ft of types) for (const tt of types) for (const flags of [undefined, [], ['freeze'], ['x', 'freeze']]) {
    const tx = flags === undefined ? {} : { flags };
    assert.deepEqual(Report.rulesOf(tx, { type: ft }, { type: tt }), oldTxRules(tx, { type: ft }, { type: tt }), `${ft}→${tt} ${JSON.stringify(flags)}`);
  }
  assert.deepEqual(Report.rulesOf({}, null, { type: 'cex' }), []);
  assert.deepEqual(Report.rulesOf({ flags: ['freeze'] }, { type: 'relay' }, { type: 'cex' }), ['cex', 'freeze'], '顺序固定：cex 在 freeze 之前');
});

test('RULES / SEV / 类型名：与迁移前页面一致；页面 TYPES 与 lib 的 TYPE_NAMES 同名（页面自己保留一份 TYPES 用来校验导入的追踪文件）', () => {
  assert.deepEqual(Report.RULES.map(r => [r.id, r.name, r.sev]), [
    ['cex', '进入中心化交易所', 'urgent'], ['freeze', '可冻结资产出现', 'urgent'], ['compliant', '进入可拦截通道', 'high'], ['bridge', '去中心化跨链 / 兑换', 'mid'], ['mixer', '混币器', 'mid']
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(Report.SEV)), { urgent: { name: '紧急', prio: true, rank: 0 }, high: { name: '高', prio: true, rank: 1 }, mid: { name: '中', prio: false, rank: 2 } });
  const m = /const TYPES = (\{[\s\S]*?\n\});/.exec(HTML_TEXT);
  assert.ok(m, '页面里找不到 const TYPES');
  const pageTypes = vm.runInNewContext('(' + m[1] + ')', {});
  const pageNames = Object.fromEntries(Object.entries(pageTypes).map(([k, v]) => [k, v.name]));
  // 页面是 report.js 类型名的超集：report.js（本轮冻结）不认识的 'tx'（BTC 二部图的交易节点）只在页面里保留一份
  for (const [k, v] of Object.entries(Report.TYPE_NAMES)) assert.equal(pageNames[k], v, '页面 TYPES 必须包含 lib 的全部类型名：' + k);
  assert.equal(pageNames.tx, '交易', '页面新增 type:tx（BTC 交易节点）');
  assert.deepEqual(Object.keys(pageNames).filter(k => !(k in Report.TYPE_NAMES)), ['tx'], '页面比 lib 多出的类型只有 tx');
  assert.throws(() => { 'use strict'; Report.RULES.push({}); }, TypeError, 'RULES 是冻结的');
  assert.throws(() => { 'use strict'; Report.ACTION.cex = 'x'; }, TypeError, 'ACTION 是冻结的');
});

test('卡点文案：5 类齐全；只指向官方渠道；不写具体邮箱 / 电话 / 网址；稳定币冻结写发行方；不承诺追回', () => {
  assert.deepEqual(Object.keys(Report.ACTION).sort(), ['bridge', 'cex', 'compliant', 'freeze', 'mixer']);
  assert.deepEqual(Object.keys(Report.HEADLINE).sort(), ['bridge', 'cex', 'compliant', 'freeze', 'mixer']);
  for (const [name, table] of [['ACTION', Report.ACTION], ['HEADLINE', Report.HEADLINE]]) {
    for (const [k, text] of Object.entries(table)) {
      assert.ok(typeof text === 'string' && text.length >= 15, name + '.' + k);
      assert.ok(!/@|https?:|www\.|\.com|\.io\b/i.test(text), name + '.' + k + ' 不得含邮箱 / 网址：' + text);
      assert.ok(!/\d{6,}|\+\d|电话|微信|telegram|tg[:：]/i.test(text), name + '.' + k + ' 不得含电话 / 即时通讯号：' + text);
      assert.ok(!/撤/.test(text), name + '.' + k);
      const noNeg = text.replace(/不(保证|承诺|一定)[^，。；]*/g, '');
      assert.ok(!/(保证|承诺|一定|必定|肯定)/.test(noNeg), name + '.' + k + ' 不得承诺结果：' + text);
    }
  }
  assert.match(Report.ACTION.freeze, /由警方或受害方向发行方（Tether \/ Circle）提出冻结请求/);
  assert.match(Report.ACTION.cex, /执法请求 \/ Law Enforcement \/ Security/);
  assert.match(Report.ACTION.compliant, /Security \/ Law Enforcement \/ 执法请求/);
  for (const k of ['cex', 'freeze', 'compliant', 'bridge', 'mixer']) assert.match(Report.ACTION[k], /警方|公安|执法/, k + ' 要导向官方渠道');
  assert.match(Report.ACTION.cex + Report.ACTION.freeze + Report.ACTION.compliant + Report.ACTION.bridge + Report.ACTION.mixer, /不保证/);
});
