// lib/brand.js（品牌位）与版本号的测试。不联网。
// 守的契约：
//   - brand.js 只导出 name / tagline / serviceNote / contact / site 五个字符串字段；
//   - 报告：contact 与 site 都为空（含缺省、全空白）时，报告里不出现任何「联系我们」内容；任一非空时，报告末尾出现一行
//     「需要人工协助（企业应急、报告人工复核）：<contact> <site>」并紧跟固定说明「溯流不向受害者收取「追回费」，不承诺追回。」；
//   - 所有字段转义（XSS 字符串只作为文字）；site 只有以 https:// 开头才做成链接，其余（javascript:、http://、大小写变体、带引号 / 空白）只当纯文字；
//   - 版本：package.json、lib/report.js 的 VERSION、页面品牌角标、报告页脚都是 0.3（0.3.0）；
//   - 页面：读 window.SuliuBrand，品牌位用 textContent 写入（不用 innerHTML 拼品牌字段）。
// 运行：node --test（Windows / Node 24 下别写 `node --test tests/`）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Brand = require('../lib/brand.js');
const Report = require('../lib/report.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const PAGE = readFileSync(join(ROOT, '溯流资金画布.html'), 'utf8');
const GEN = '2026-10-05T10:00:00.000Z';
const LINE = '需要人工协助（企业应急、报告人工复核）：';
const FIXED = '溯流不向受害者收取「追回费」，不承诺追回。';

const A = i => '0x' + String(i).repeat(40);
const MINI = {
  id: 'mini', title: '最小案件', channels: '', facts: [], focus: 'a',
  nodes: [
    { id: 'v', type: 'victim', label: '受害钱包', addr: A(1), note: '' },
    { id: 'a', type: 'attacker', label: '攻击者', addr: A(2), note: '' },
    { id: 'x', type: 'cex', label: '某交易所充值地址', addr: A(3), note: '' }
  ],
  txs: [
    { from: 'v', to: 'a', t: 100, amt: '10 ETH', eth: 10, hash: '0x' + 'a'.repeat(64), flags: [] },
    { from: 'a', to: 'x', t: 110, amt: '4 ETH', eth: 4, hash: '0x' + 'b'.repeat(64), flags: [] }
  ]
};
const build = brand => Report.build({ case: MINI, generatedAt: GEN, brand });
const tail = html => html.slice(html.lastIndexOf('<p class="foot">'));   // 页脚与其后（含品牌行）
const tagsOf = html => html.match(/<[a-zA-Z][^>]*>/g) || [];

test('brand.js：只有五个字符串字段（页面 / 报告读它）；浏览器下挂 window.SuliuBrand', () => {
  assert.deepEqual(Object.keys(Brand).sort(), ['contact', 'name', 'serviceNote', 'site', 'tagline']);
  for (const k of Object.keys(Brand)) assert.equal(typeof Brand[k], 'string', k);
  assert.equal(Brand.name, '溯流');
  assert.equal(Brand.tagline, '被盗资金证据报告');
  const win = {};
  vm.runInContext(readFileSync(join(ROOT, 'lib', 'brand.js'), 'utf8'), vm.createContext({ self: win }), { filename: 'lib/brand.js' });
  assert.ok(win.SuliuBrand && win.SuliuBrand.name === Brand.name && win.SuliuBrand.contact === Brand.contact);
});

test('空：缺省 / 空字符串 / 全空白 / 非对象 / 只有 name 和 tagline，报告里都没有任何联系内容与固定说明', () => {
  for (const b of [undefined, null, {}, { contact: '', site: '' }, { contact: '   ', site: '\n\t' }, 'x', 42, { name: '溯流', tagline: '被盗资金证据报告', serviceNote: '这是服务说明', contact: '', site: '' }]) {
    const html = build(b);
    assert.ok(!html.includes('需要人工协助'), '空 brand 也出现了联系行：' + JSON.stringify(b));
    assert.ok(!html.includes('追回费'), '空 brand 也出现了固定说明：' + JSON.stringify(b));
    assert.ok(!html.includes('class="foot brandline"'), '空 brand 也出现了联系行容器');
    assert.ok(!html.includes('这是服务说明'), 'serviceNote 目前不显示');
    assert.ok(html.includes('<h2>8. 免责声明</h2>'));
  }
});

test('非空：contact / site 任一非空，报告末尾出现联系行并紧跟固定说明；顺序在页脚之后、</main> 之前', () => {
  const both = build({ contact: '微信 suliu-help，电话 000-0000', site: 'https://example.com/help' });
  assert.ok(both.includes(LINE + '微信 suliu-help，电话 000-0000 <a href="https://example.com/help" target="_blank" rel="noopener noreferrer">https://example.com/help</a><br>' + FIXED));
  assert.equal((both.match(/需要人工协助/g) || []).length, 1, '联系行只出现一次');
  assert.equal((both.match(/追回费/g) || []).length, 1, '固定说明只出现一次');
  const t = tail(both);
  assert.ok(t.indexOf('报告编号 SL-') < t.indexOf('需要人工协助') && t.indexOf(FIXED) < t.indexOf('</main>'), '品牌行应在页脚之后、</main> 之前');
  // 只有 contact
  const c = build({ contact: 'help@example.com' });
  assert.ok(c.includes(LINE + 'help@example.com<br>' + FIXED));
  assert.ok(!/<a href="https?:\/\/(?!etherscan)/.test(c));
  // 只有 site
  const s = build({ site: 'https://example.com' });
  assert.ok(s.includes(LINE + '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a><br>' + FIXED));
  // 页脚读 name
  assert.ok(tail(build({ name: '某应急服务' })).includes('由某应急服务（Suliu）v0.3 根据公开链上数据生成'));
  assert.ok(tail(build(undefined)).includes('由溯流（Suliu）v0.3 根据公开链上数据生成'));
});

test('XSS：contact / site / name 里的标签、引号、脚本伪协议全部只作为文字；site 只有 https:// 开头才做成链接', () => {
  const EVIL = ['<img src=x onerror=alert(1)>', '"><script>alert(2)</script>', "'><svg onload=alert(3)>", '<a href="javascript:alert(4)">x</a>'];
  const html = build({ name: EVIL[0], contact: EVIL[1] + EVIL[2], site: EVIL[3] });
  assert.ok(!/<script/i.test(html) && !/<img\b/i.test(html) && !/<svg\b[^>]*onload/i.test(html), '标签被带进来了');
  for (const tg of tagsOf(html)) assert.ok(!/\son[a-z]+\s*=/i.test(tg) && !/javascript:/i.test(tg), '标签里有事件属性或脚本伪协议：' + tg.slice(0, 100));
  const t = tail(html);
  for (const e of EVIL) assert.ok(t.includes(Report.esc(e)), '应转义后原样显示：' + e);
  // 非 https 的 site 一律当纯文字：不出现 <a href="那个值">
  for (const site of ['javascript:alert(1)', 'http://example.com', 'HTTPS://example.com', ' ftp://example.com', 'https://', 'https://exa mple.com', 'https://example.com/"onmouseover="x', 'https://example.com/<b>', "https://example.com/'x", 'https://example.com/a\\b', '//example.com', 'example.com']) {
    const h = build({ site });
    const hrefs = [...h.matchAll(/\shref\s*=\s*"([^"]*)"/g)].map(m => m[1]).filter(x => !/^https:\/\/etherscan\.io\//.test(x));
    assert.deepEqual(hrefs, [], '不该做成链接：' + JSON.stringify(site) + ' → ' + hrefs.join(' '));
    assert.ok(h.includes(Report.esc(site.trim())) || site.trim() === '', '应作为纯文字出现：' + JSON.stringify(site));
    assert.ok(h.includes(FIXED), '非空就要带固定说明');
  }
  // 合格的 https 站点：链接、转义后的 href 与显示文字一致，rel 带 noopener
  const ok = build({ site: 'https://example.com/a?b=1&c=2' });
  assert.ok(ok.includes('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1&amp;c=2</a>'));
  // key 形态的字符串也会被 t() 抹掉
  assert.ok(!build({ contact: 'apikey=ABCDEF123' }).includes('ABCDEF123'));
  // 超长字段被截断，不会撑爆页脚
  assert.ok(!build({ contact: 'x'.repeat(5000) }).includes('x'.repeat(301)));
});

test('版本：package.json、lib/report.js 的 VERSION、页面品牌角标、报告页脚一致，都是 0.3（0.3.0）', () => {
  assert.equal(PKG.version, '0.3.0');
  assert.equal(Report.VERSION, PKG.version);
  const mm = PKG.version.split('.').slice(0, 2).join('.');
  const badge = /<span class="mark"><span id="brandName">[^<]*<\/span><small>v(\d+\.\d+)<\/small><\/span>/.exec(PAGE);
  assert.ok(badge, '页面里找不到品牌角标');
  assert.equal(badge[1], mm, '页面品牌角标版本');
  assert.ok(!/原型 v0\.2|v0\.2（|>v0\.2</.test(PAGE), '页面里还有旧版本号');
  assert.ok(tail(build(undefined)).includes('（Suliu）v' + mm + ' 根据公开链上数据生成'), '报告页脚版本');
});

test('页面：读 window.SuliuBrand；品牌位用 textContent / 文本节点写入，不用 innerHTML 拼品牌字段；联系方式为空时底栏隐藏', () => {
  assert.ok(/<script src="lib\/brand\.js"><\/script>/.test(PAGE), '页面没引用 lib/brand.js');
  assert.ok(PAGE.includes('window.SuliuBrand'), '页面没有读 window.SuliuBrand');
  const a = PAGE.indexOf('function brandRender()'), b = PAGE.indexOf("window.addEventListener('resize'", a);
  assert.ok(a > 0 && b > a, '找不到 brandRender');
  const fn = PAGE.slice(a, b);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(fn), 'brandRender 里不许用 innerHTML 一类拼标记');
  assert.ok(fn.includes('textContent') && fn.includes('createTextNode'));
  assert.ok(fn.includes('foot.hidden = true'), '联系方式为空时应隐藏底栏');
  assert.ok(fn.includes(LINE) && fn.includes(FIXED), '页面底栏的联系行与固定说明要与报告一致');
  const RE_SRC = String.raw`/^https:\/\/[^\s"'<>\\]+$/`;
  assert.ok(fn.includes(RE_SRC), '页面的 site 链接校验应是 ' + RE_SRC);
  assert.ok(readFileSync(join(ROOT, 'lib', 'report.js'), 'utf8').includes('RE_SITE = ' + RE_SRC), '报告的 site 链接校验应与页面是同一个正则');
  assert.ok(/<footer class="brandfoot" id="brandFoot" hidden><\/footer>/.test(PAGE), '底栏默认隐藏');
  // 页面生成报告时把同一份 brand 与 guide 传给 build
  assert.ok(/RPT\.build\(\{.*guide:GD, brand:BR0\}\)/.test(PAGE), '生成报告时没传 guide / brand');
});
