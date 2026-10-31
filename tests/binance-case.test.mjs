// 币安内置案例（2026-10-31 地图纠偏）：只新增一个可切换的真实案例，Bitget 仍是默认。
// 这个测试锁定三件事，防止以后把「独立来源 / 有限覆盖 / 转账≠归属」写丢或写错：
//   1. 内置案件是 bitget（默认，index 0）+ binance（可切换），且币安案带 official:false（不套 Bitget 官方名单）；
//   2. 币安案的来源、数据截止区块、有限覆盖、归因口径都在 facts / banner 里，且节点 / 交易结构可渲染；
//   3. 用 lib/report.js 给币安案生成报告不报错、不出现「与官方不符」这类 Bitget 名单误判，画布 SVG 被安全嵌入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Report = require('../lib/report.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILE = path.join(ROOT, '溯流资金画布.html');
const HTML = fs.readFileSync(HTML_FILE, 'utf8');
const GEN = '2026-10-31T00:00:00.000Z';

/** 从页面源码里取出内置 CASES 数组（只读文本，不执行页面其余脚本） */
function loadCases() {
  const a = HTML.indexOf('const CASES = [');
  const b = HTML.indexOf('\n];', a);
  assert.ok(a >= 0 && b > a, '找不到 const CASES = [ … ] 区块');
  const block = HTML.slice(a, b + 3);
  const T = (from, to, t, amt, eth, o) => Object.assign({ from, to, t, amt, eth }, o || {});
  return vm.runInNewContext(block + '\n;CASES', { T });
}

test('内置案件：bitget（默认）+ binance（可切换真实案例）；币安案不套用 Bitget 官方名单', () => {
  const cases = loadCases();
  assert.deepEqual(Array.from(cases, c => c.id), ['bitget', 'binance'], '默认仍是 Bitget，币安作为第二个可切换案例');
  assert.equal(cases[0].kind, 'real');
  const bin = cases[1];
  assert.equal(bin.kind, 'real');
  assert.equal(bin.chain, 'eth');
  assert.equal(bin.unit, 'block');
  assert.equal(bin.official, false, '币安案是独立来源，必须显式关闭 Bitget 官方名单核对');
  assert.ok(bin.focus && bin.nodes.some(n => n.id === bin.focus));
});

test('币安案声明：独立来源、数据截止区块、有限覆盖、转账不等于盗款，都在 facts / banner 里', () => {
  const bin = loadCases()[1];
  const facts = new Map(bin.facts);
  assert.ok(/Etherscan/.test(facts.get('来源')) && /独立/.test(facts.get('来源')), '来源要写明 Etherscan 实测 + 独立于 Bitget 名单');
  assert.ok(/26303600/.test(facts.get('数据截止')), '数据截止区块必须写明（26303600）');
  assert.ok(/26300700/.test(facts.get('范围')) && /26303600/.test(facts.get('范围')), '追踪范围要写明');
  assert.ok(/21/.test(facts.get('有限覆盖')) && /15/.test(facts.get('有限覆盖')), '有限覆盖要写明未展开的对手方数量');
  const attribution = facts.get('归因口径') || '';
  assert.ok(/盗款/.test(attribution) && /不当作攻击者定性/.test(attribution), '归因口径要明确：热钱包流水≠盗款，接收方不当作攻击者');
  const banner = bin.banner.join(' ');
  assert.ok(/不等于每笔都是盗款/.test(banner), 'banner 要提示转账不等于盗款');
  assert.ok(/有限覆盖/.test(banner), 'banner 要提示有限覆盖');
});

test('币安案结构：节点 id 唯一、地址是完整 EVM 地址、交易两端存在、哈希合法、稳定币带 freeze 标记', () => {
  const bin = loadCases()[1];
  const ids = new Map();
  for (const n of bin.nodes) {
    assert.ok(!ids.has(n.id), '节点 id 重复：' + n.id);
    ids.set(n.id, n);
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), '节点要有坐标（沿用三栏画布）');
    if (n.addr) assert.match(n.addr, /^0x[0-9a-fA-F]{40}$/, '必须是完整以太坊地址：' + n.addr);
  }
  for (const t of bin.txs) {
    assert.ok(ids.has(t.from) && ids.has(t.to), '交易两端必须是已有节点：' + t.from + '→' + t.to);
    assert.ok(Number.isFinite(t.t), '交易要有区块号（时间轴）');
    assert.match(t.hash, /^0x[0-9a-fA-F]{64}$/, '交易哈希必须是 0x + 64 位十六进制');
    assert.ok(Number.isFinite(t.ts), '交易要有时间戳（报告按 UTC+8 显示）');
  }
  const usdt = bin.txs.filter(t => /USDT$/.test(t.amt || ''));
  assert.ok(usdt.length >= 3, '应有 USDT 流水');
  assert.ok(usdt.every(t => Array.isArray(t.flags) && t.flags.indexOf('freeze') >= 0), 'USDT 流水必须标为可冻结稳定币');
  // 稳定币金额不能为 0（避免把粉尘当金额）
  for (const t of usdt) assert.ok(/[1-9]/.test(t.amt), 'USDT 金额不应是 0：' + t.amt);
});

test('币安案报告（lib/report.js）：可生成、无 script、不出现 Bitget 名单误判、画布 SVG 安全嵌入', () => {
  const bin = loadCases()[1];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect x="1" y="1" width="8" height="8"/><text x="2" y="18">画布</text></svg>';
  const html = Report.build({
    case: bin, meta: {}, generatedAt: GEN, official: null, officialLabel: '', svg,
    info: { party: '', contact: '', story: '', theftTx: '' }, guide: null, brand: null
  });
  assert.ok(!/<script/i.test(html), '报告不能有 script');
  assert.ok(html.includes('币安热钱包') || html.includes(bin.title), '报告标题 / 起点要出现币安案');
  assert.ok(html.includes('独立'), '报告要出现「独立来源」声明');
  assert.ok(html.includes('26303600'), '报告要出现数据截止区块');
  assert.ok(!html.includes('与官方不符'), '币安案不是 Bitget 名单，不能出现 Bitget 名单误判徽标');
  assert.ok(html.includes('<svg'), '画布去向图要嵌入报告');
  assert.ok(html.includes('画布'), 'SVG 文本节点要保留（安全序列化，不丢内容）');
  // 恶意 SVG 必须被清洗掉（不能把未清洗 SVG 放进 HTML）
  const evil = Report.build({
    case: bin, meta: {}, generatedAt: GEN, official: null,
    svg: '<svg onload="alert(1)"><script>alert(2)</script><rect width="1" height="1"/></svg>',
    info: {}, guide: null, brand: null
  });
  assert.ok(!/<script/i.test(evil) && !/onload=/i.test(evil), '恶意 SVG 里的 script / on* 必须被清洗');
});

test('币安案可冻结流水：报告里标出可冻结点，并保留「可冻结资产」逐笔标记', () => {
  const bin = loadCases()[1];
  const html = Report.build({ case: bin, meta: {}, generatedAt: GEN, official: null, info: {}, guide: null, brand: null });
  const freezeTxs = bin.txs.filter(t => Array.isArray(t.flags) && t.flags.indexOf('freeze') >= 0);
  assert.ok(freezeTxs.length >= 3, '币安案应有至少 3 笔 USDT 可冻结流水');
  assert.ok(html.includes('可冻结资产出现'), '报告要出现「可冻结资产出现」卡点');
  assert.ok(html.includes('卡点数量'), '报告要有卡点数量汇总');
  assert.ok(/可冻结资产/.test(html), '逐笔标记可冻结资产');
});
