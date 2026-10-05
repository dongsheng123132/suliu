// lib/guide.js 的测试：报案指引（报告第 9 节附录与页面「报案指引」对话框共用的同一份内容）。不联网。
// 守的契约：
//   - 内容逐字来自 docs/报案指引.md：八个一级部分一一对应（数量、标题、顺序）；md 里每一行正文（列表项、段落、表格每一格、模板每一行）都出现在 guide 里，
//     反过来 guide 里每一行文字也都能在 md 里找到（不漏抄、不改写、不添油加醋）；末尾那句免责说明保留为 guide.note；
//   - guide 的 html 不含 <script>、on* 属性、任何 http(s) 链接或 href（ic3.gov 只作为文字）；只用报告清洗白名单里的标签，且经 sanitizeFragment 后一字不变；
//   - 不含承诺追回的说法；模板里的空格（＿＿）每一个都包在 .blank 里，打印时留出手写宽度（地址 / 哈希的空格更宽）；
//   - 报告：传入 guide 时出现第 9 节「附录：报案指引」，不传时不出现；缺 lib/guide.js 时报告照常生成。
// 运行：node --test（Windows / Node 24 下别写 `node --test tests/`）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Guide = require('../lib/guide.js');
const Report = require('../lib/report.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MD = readFileSync(join(ROOT, 'docs', '报案指引.md'), 'utf8').replace(/\r\n?/g, '\n');

// ---------------------------------------------------------------------------------------------
// 从 md 里取期望：一级部分标题、正文行（去掉 markdown 标记后的纯文字）、末尾说明
// ---------------------------------------------------------------------------------------------
const MD_LINES = MD.split('\n');
const MD_TITLES = MD_LINES.filter(l => /^## /.test(l)).map(l => l.slice(3).trim());
const MD_NOTE = (MD_LINES.map(l => l.trim()).filter(l => /^\*[^*].*\*$/.test(l)).pop() || '').slice(1, -1);

/** 正文行：去掉标题、分隔线、前言（第一个 ## 之前）、末尾说明；去掉列表 / 引用 / 加粗标记；表格拆成一格一行 */
function mdBodyLines() {
  const out = [];
  let started = false;
  for (const raw of MD_LINES) {
    if (/^## /.test(raw)) { started = true; continue; }
    if (!started) continue;
    const ln = raw.trim();
    if (!ln || ln === '---' || ln === '>' || /^\*[^*].*\*$/.test(ln)) continue;
    if (/^\|[\s:|-]+\|$/.test(ln)) continue;   // 表格分隔线
    if (ln.startsWith('|')) { ln.replace(/^\|/, '').replace(/\|$/, '').split('|').forEach(c => { if (c.trim()) out.push(c.trim().replace(/\*\*/g, '')); }); continue; }
    out.push(ln.replace(/^>\s?/, '').replace(/^(\d+\.|-)\s+/, '').replace(/\*\*/g, '').trim());
  }
  return out.filter(Boolean);
}
const MD_BODY = mdBodyLines();

// ---------------------------------------------------------------------------------------------
// 从 guide 里取实际文字：块级标签与 <br> 当换行，其余标签去掉，再解实体
// ---------------------------------------------------------------------------------------------
const BLOCK = /<\/?(p|li|ul|ol|table|thead|tbody|tr|th|td|blockquote|div|h3|h4|h5|hr)\b[^>]*>/gi;
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const linesOf = html => decode(String(html).replace(/<br\s*\/?>/gi, '\n').replace(BLOCK, '\n').replace(/<[^>]+>/g, '')).split('\n').map(x => x.trim()).filter(Boolean);
const GUIDE_LINES = Guide.sections.flatMap(s => linesOf(s.html));
const GUIDE_TEXT = GUIDE_LINES.join('\n');
const ALL_HTML = Guide.sections.map(s => s.html).join('\n');

test('结构：sections 与 md 的八个一级部分一一对应（数量、标题、顺序）；id 非空且不重复；有版本号', () => {
  assert.equal(MD_TITLES.length, 8, 'md 里应有八个一级部分，实际 ' + MD_TITLES.length);
  assert.equal(Guide.sections.length, MD_TITLES.length);
  assert.deepEqual(Guide.sections.map(s => s.title), MD_TITLES);
  const ids = Guide.sections.map(s => s.id);
  assert.ok(ids.every(i => typeof i === 'string' && /^[a-z][a-z0-9-]*$/.test(i)), 'id 应是小写字母 / 数字 / 连字符：' + ids.join(','));
  assert.equal(new Set(ids).size, ids.length, 'id 重复');
  for (const s of Guide.sections) assert.ok(typeof s.html === 'string' && s.html.length > 20, s.title + ' 的 html 为空');
  assert.match(Guide.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(Guide.version, '2026-10-05');
  assert.equal(Object.isFrozen(Guide) && Object.isFrozen(Guide.sections) && Guide.sections.every(Object.isFrozen), true, '导出对象应冻结，页面或别的代码改不了它');
});

test('逐字：md 里每一行正文都出现在 guide 里（防漏抄），guide 里每一行文字也都在 md 里（防改写）', () => {
  assert.ok(MD_BODY.length > 40, 'md 正文行数异常：' + MD_BODY.length + '，解析器可能出错了');
  const missing = MD_BODY.filter(l => !GUIDE_TEXT.includes(l));
  assert.deepEqual(missing, [], 'md 里有这些行没出现在 guide 里：\n' + missing.join('\n'));
  const mdAll = MD_BODY.join('\n');
  const extra = GUIDE_LINES.filter(l => !mdAll.includes(l));
  assert.deepEqual(extra, [], 'guide 里有这些行在 md 里找不到（被改写或新增）：\n' + extra.join('\n'));
});

test('点名核对：表格每一行的首列、两段模板的首句、「先交钱就能帮你追回」那句、末尾说明', () => {
  // 表格行首列（md 里的第五部分）
  const rows = MD_LINES.filter(l => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l.trim())).map(l => l.replace(/^\|/, '').split('|')[0].trim());
  assert.deepEqual(rows, ['卡点', '中心化交易所（充值地址）', 'USDT / USDC 等可冻结稳定币', '跨链 / 兑换协议（如 Chainflip、THORChain）', '混币器'], 'md 表格行变了，请同步本测试');
  for (const r of rows) assert.ok(GUIDE_TEXT.includes(r), '表格首列没抄进来：' + r);
  const sec5 = Guide.sections[4].html;
  assert.equal((sec5.match(/<tr>/g) || []).length, rows.length, '表格行数');
  assert.ok(/<table><thead><tr><th>卡点<\/th><th>谁能动<\/th><th>怎么联系<\/th><th>带什么<\/th><\/tr><\/thead>/.test(sec5), '表头');
  // 两段模板的首句
  assert.ok(GUIDE_TEXT.includes('主题：紧急：被盗资金已存入贵平台，请求冻结与保全记录（案件编号：＿＿）'));
  assert.ok(GUIDE_TEXT.includes('Subject: URGENT – Stolen funds deposited to your platform – freeze and preservation request (Case ＿＿)'));
  const quotes = MD_LINES.filter(l => /^> \S/.test(l));
  assert.ok(quotes.length >= 8, 'md 里引用块行数异常');
  assert.equal((Guide.sections[5].html.match(/<blockquote>/g) || []).length, 2, '第六部分应有两个引用块（中文、English）');
  // 防二次诈骗那句
  assert.ok(GUIDE_TEXT.includes('任何声称"先交钱就能帮你追回"的人或公司，几乎都是骗子。'));
  assert.ok(GUIDE_TEXT.includes('溯流是免费的开源工具：不向受害者收费，不承诺追回。'));
  // 末尾说明
  assert.equal(Guide.note, MD_NOTE);
  assert.match(Guide.note, /^本指引是一般性信息整理，不构成法律意见；具体以当地公安机关和相关机构的要求为准。$/);
});

test('安全：html 不含 <script>、on* 属性、javascript:、任何 http(s) 链接或 href / src；ic3.gov 只作为文字；标签都在报告清洗白名单里', () => {
  assert.ok(!/<\s*\/?\s*script/i.test(ALL_HTML), '含 <script');
  assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(ALL_HTML), '含 on* 事件属性');
  assert.ok(!/javascript:|vbscript:|data:/i.test(ALL_HTML), '含脚本伪协议');
  assert.ok(!/https?:\/\//i.test(ALL_HTML) && !/https?:\/\//i.test(Guide.note), '含 http(s) 链接');
  assert.ok(!/\b(href|src|srcset|style|action)\s*=/i.test(ALL_HTML), '含 href / src / style 等属性');
  assert.ok(!/<a[\s>]/i.test(ALL_HTML), '含 <a>：指引里不放任何链接');
  assert.ok(GUIDE_TEXT.includes('ic3.gov') && !/(\/\/|www\.)ic3\.gov/.test(ALL_HTML), 'ic3.gov 应只作为文字出现');
  const ALLOWED = new Set(['p', 'div', 'span', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'small', 'code', 'pre', 'br', 'hr', 'h3', 'h4', 'h5', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote']);
  const used = new Set([...ALL_HTML.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1].toLowerCase()));
  for (const tg of used) assert.ok(ALLOWED.has(tg), '用了白名单之外的标签：' + tg);
  const attrs = [...ALL_HTML.matchAll(/<[a-zA-Z][^>]*?\s([a-zA-Z-]+)\s*=/g)].map(m => m[1].toLowerCase());
  assert.deepEqual([...new Set(attrs)], ['class'], '只允许 class 属性，实际：' + [...new Set(attrs)].join(','));
  // 报告用的清洗器过一遍应当一字不变：说明附录里的每一个标签与 class 都被保留
  for (const s of Guide.sections) assert.equal(Report.sanitizeFragment(s.html), s.html, s.title + '：经 sanitizeFragment 后有变化');
});

test('合规：不含承诺追回的说法；明确写了不承诺追回、骗子手法', () => {
  const all = ALL_HTML + '\n' + Guide.note + '\n' + Guide.sections.map(s => s.title).join('\n');
  for (const bad of ['保证追回', '一定能追回', '一定追回', '包追回', '百分之百追回', '100%追回', '保证找回', '一定能找回', '包找回']) assert.ok(!all.includes(bad), '出现了承诺追回的说法：' + bad);
  assert.ok(GUIDE_TEXT.includes('不承诺追回'));
  assert.ok(GUIDE_TEXT.includes('几乎都是骗子'));
  assert.ok(GUIDE_TEXT.includes('不构成法律意见') || Guide.note.includes('不构成法律意见'));
  assert.ok(!/@[A-Za-z0-9-]+\.[A-Za-z]{2,}|\b1[3-9]\d{9}\b/.test(all), '不得写具体邮箱或手机号');
});

test('模板空格：每个＿＿都包在 .blank 里（地址 / 哈希的更宽），数量与 md 一致；报告样式留足手写宽度', () => {
  const mdBlanks = (MD.match(/＿＿/g) || []).length;
  const htmlBlanks = (ALL_HTML.match(/＿＿/g) || []).length;
  assert.equal(htmlBlanks, mdBlanks, '＿＿ 的数量应与 md 一致');
  assert.equal((ALL_HTML.match(/<span class="blank( wide)?">＿＿<\/span>/g) || []).length, htmlBlanks, '有＿＿没被包进 .blank');
  const wide = (ALL_HTML.match(/<span class="blank wide">/g) || []).length;
  assert.equal(wide, 8, '钱包 / 哈希 / 交易 / 地址的空格（中文 4 个、English 4 个）应是 wide，实际 ' + wide);
  for (const m of ALL_HTML.matchAll(/(钱包 |哈希 |交易 |地址 |wallet |tx |address )<span class="blank( wide)?">/g)) assert.equal(m[2], ' wide', '地址 / 哈希前的空格应是 wide：' + m[1]);
  // 纯文字不变：去掉标签后与 md 的模板行完全一致（逐字对照已在上面的测试里做过）；这里只看样式
  const html = Report.build({ case: MINI, generatedAt: '2026-10-05T10:00:00.000Z', guide: Guide });
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const narrow = /\.blank\{[^}]*min-width:(\d+(?:\.\d+)?)mm/.exec(css), wide2 = /\.blank\.wide\{[^}]*min-width:(\d+(?:\.\d+)?)mm/.exec(css);
  assert.ok(narrow && Number(narrow[1]) >= 25, '窄空格至少 25mm：' + (narrow && narrow[1]));
  assert.ok(wide2 && Number(wide2[1]) >= 60, '地址 / 哈希空格至少 60mm：' + (wide2 && wide2[1]));
  assert.match(css, /\.blank\{[^}]*border-bottom:/, '空格要有下划线');
  assert.match(css, /\.appx blockquote\{[^}]*line-height:2\.[0-9]/, '模板行距要留够手写');
  assert.match(css, /@media print\{[\s\S]*\.appx\{break-before:page;page-break-before:always\}/, '附录打印时另起一页（标题不能孤零零留在上一页页底）');
});

// ---------------------------------------------------------------------------------------------
// 报告里的第 9 节
// ---------------------------------------------------------------------------------------------
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
const GEN = '2026-10-05T10:00:00.000Z';
const sectionOf = (html, n) => { const m = new RegExp('<section id="s' + n + '"[^>]*>([\\s\\S]*?)</section>').exec(html); assert.ok(m, '没有第 ' + n + ' 节'); return m[1]; };

test('报告：传入 guide 时出现第 9 节（八个部分 + 说明，内容与 guide 一致、顺序在第 8 节之后）；不传时不出现', () => {
  const withGuide = Report.build({ case: MINI, generatedAt: GEN, guide: Guide });
  assert.ok(withGuide.includes('<h2>9. 附录：报案指引</h2>'));
  assert.ok(withGuide.indexOf('<h2>8. 免责声明</h2>') < withGuide.indexOf('<h2>9. 附录：报案指引</h2>'));
  const s9 = sectionOf(withGuide, 9);
  let at = -1;
  for (const s of Guide.sections) {
    const h = '<h3>' + Report.esc(s.title) + '</h3><div class="bx">' + s.html + '</div>';
    const i = s9.indexOf(h);
    assert.ok(i > at, '第 9 节里缺少或顺序不对：' + s.title);
    at = i;
  }
  assert.ok(s9.includes('<em>' + Guide.note + '</em>'), '末尾说明');
  assert.ok(s9.indexOf('<em>') > at, '说明在八个部分之后');
  assert.ok(s9.includes('报案指引版本 ' + Guide.version));
  // 不传：没有附录（Node 下没有 window.SuliuGuide 兜底，所以确实没有）
  for (const g of [undefined, null, {}, { sections: [] }]) {
    const html = Report.build({ case: MINI, generatedAt: GEN, guide: g });
    assert.ok(!html.includes('9. 附录') && !html.includes('id="s9"'), '不传 guide（' + JSON.stringify(g) + '）却出了附录');
    assert.ok(html.includes('<h2>8. 免责声明</h2>'), '缺 guide 时报告其余部分照常生成');
  }
  // 带附录的报告仍然是一份安全的静态页：没有脚本 / 事件属性；链接只有 Etherscan 地址 / 交易
  assert.ok(!/<script/i.test(withGuide));
  for (const tag of withGuide.match(/<[a-zA-Z][^>]*>/g)) assert.ok(!/\son[a-z]+\s*=/i.test(tag), tag.slice(0, 100));
  for (const m of withGuide.matchAll(/\shref\s*=\s*"([^"]*)"/g)) assert.match(m[1], /^https:\/\/etherscan\.io\/(address\/0x[0-9a-fA-F]{40}|tx\/0x[0-9a-fA-F]{64})$/);
  assert.equal((withGuide.match(/https?:\/\/(?!etherscan\.io\/)[^\s"'<>]+/g) || []).length, 0, '报告里不应有 etherscan 以外的链接');
});

test('浏览器加载：脚本在没有 module 的环境里挂 window.SuliuGuide，内容与 Node 下一致', () => {
  const win = {};
  const ctx = vm.createContext({ self: win });
  vm.runInContext(readFileSync(join(ROOT, 'lib', 'guide.js'), 'utf8'), ctx, { filename: 'lib/guide.js' });
  assert.ok(win.SuliuGuide, '没有挂 SuliuGuide');
  assert.equal(win.SuliuGuide.version, Guide.version);
  const flat = g => JSON.stringify(g.sections.map(s => [s.id, s.title, s.html]));   // 不同 vm 上下文的数组原型不同，deepEqual 会误判，按 JSON 比
  assert.equal(flat(win.SuliuGuide), flat(Guide));
  assert.equal(win.SuliuGuide.note, Guide.note);
});
