// 溯流资金画布.html 的静态契约测试：只读 HTML 文本，不启浏览器、不联网、不执行页面脚本。
// 范围（2026-10-05 范围剃刀后）：页面只做「证据报告」这一个产品——Bitget 一个内置示例案件 + 追踪地址面板 + 静态官方标签。守的是：
//   - 「撤」字（撤下 / 撤回 ……）、「官方核实」「从黑名单移除」这类会被当成操作建议的文案，只能来自 lib.goneText，页面自己不许写；
//   - 页面不得自己定义名为 reduceOfficial / goneText / describeGone / detectShrink 的函数（判定口径只有 lib 一份）；
//   - 主内联脚本语法正确（vm.Script 只编译不运行）；
//   - 页面不得自己定义 rulesOf / ACTION / HEADLINE（卡点判定与卡点文案的唯一来源是 lib/report.js，页面只调用）；
//   - 必需脚本：data/official-snapshot.js、lib/official-data.js、lib/trace-eth.js、lib/report.js、lib/guide.js、lib/brand.js，都在主内联脚本之前加载；页面不另抄一份报案指引；Google 字体 link 不阻塞渲染（media="print"）；
//   - 页面只读：不许有 POST 到 /api/report 的代码、sendBeacon、<form，也不许有任何自动发信代码；不许有 console.* 调用（API key 不能被打印）；
//   - 范围清单：内置案件只有 bitget；已删除功能（官方实时视图、盯盘告警规则开关、推演节点、核对地址框、事件数据源导出、洗钱七阶段）的标识不许再出现；
//     页面不许请求 trace.bgblockchain.xyz 的 /api/，也不许自己 fetch（官方数据只用静态快照；文字链接到 /report 举报页、/v2 看板页可以）。
// 所有文本类检查都先剥掉 HTML 注释 / JS 注释 / CSS 注释，再解码 \uXXXX 与 HTML 实体，然后才查——注释里的说明不算，转义和实体也躲不过。
// 运行：node --test（Windows / Node 24 下别写 `node --test tests/`）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILE = path.join(ROOT, '溯流资金画布.html');
const HTML = fs.readFileSync(HTML_FILE, 'utf8');

// 页面不得自己定义的函数名（这些口径只有 lib 一份）
const LIB_ONLY_FNS = ['reduceOfficial', 'goneText', 'describeGone', 'detectShrink'];
// 卡点判定 / 文案只在 lib/report.js 里有一份；页面不得以函数或常量的形式再定义（调用 RPT.rulesOf / RPT.ACTION / RPT.HEADLINE 可以）
const REPORT_ONLY_NAMES = ['rulesOf', 'ACTION', 'HEADLINE'];

// 允许出现的举报页链接文本 / href；它不含 /api/report，只是让「/report」作为链接存在
const ALLOWED_REPORT_LINK = 'https://trace.bgblockchain.xyz/report';

/** 命中位置前后各取一点上下文，失败信息里带上，省得回头再 grep */
const around = (text, idx, n = 30) => JSON.stringify(text.slice(Math.max(0, idx - n), idx + n));

// ---------------------------------------------------------------------------------------------
// 文本清洗：剥注释 + 解码转义 / 实体
// ---------------------------------------------------------------------------------------------

const JS_TYPE_OK = ty => !ty || /^(text|application)\/(javascript|ecmascript)$/i.test(ty) || ty.toLowerCase() === 'module';
const RE_KEYWORD_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * 剥掉 JS 注释（// 与 /* *\/），识别单 / 双引号字符串、模板字符串（含 ${} 嵌套）、正则字面量，字符串里的 '//' 不当注释。
 * opts.blank：把字符串 / 模板字符串的内容清空（保留引号与 ${} 里的代码）——用来数「调用」和找「定义」，字符串里的字样不算代码。
 * 换行保留（注释里的换行也留一个），方便定位。
 */
function stripJsComments(src, opts = {}) {
  const blank = !!opts.blank, n = src.length, tpl = []; // tpl：每个正在展开的 ${ 一个花括号深度
  let out = '', i = 0, lastSig = '';
  const regexAllowed = () => {
    if (!lastSig) return true;
    if (/[\w$]/.test(lastSig)) { const w = /([A-Za-z_$][\w$]*)$/.exec(out.slice(-40).trimEnd()); return !!w && RE_KEYWORD_BEFORE_REGEX.has(w[1]); }
    return !/[)\]]/.test(lastSig);
  };
  const templateBody = () => { // 已经吃掉开头的反引号 / 上一个 } ：一直读到结尾反引号或下一个 ${
    while (i < n) {
      const c = src[i];
      if (c === '\\') { if (!blank) out += c + (src[i + 1] === undefined ? '' : src[i + 1]); i += 2; continue; }
      if (c === '`') { out += c; i++; lastSig = '`'; return; }
      if (c === '$' && src[i + 1] === '{') { out += '${'; i += 2; tpl.push(0); lastSig = '{'; return; }
      if (!blank || c === '\n') out += c;
      i++;
    }
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2), body = e < 0 ? src.slice(i) : src.slice(i, e + 2);
      out += /\n/.test(body) ? '\n' : ' '; i = e < 0 ? n : e + 2; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      out += blank ? c + c : src.slice(i, j + 1); i = j + 1; lastSig = c; continue;
    }
    if (c === '`') { out += c; i++; templateBody(); continue; }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < n) {
        const x = src[j];
        if (x === '\\') { j += 2; continue; }
        if (x === '\n') break;
        if (cls) { if (x === ']') cls = false; } else if (x === '[') cls = true; else if (x === '/') break;
        j++;
      }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      out += src.slice(i, j); i = j; lastSig = ')'; continue;
    }
    if (c === '{' && tpl.length) tpl[tpl.length - 1]++;
    if (c === '}' && tpl.length) {
      if (tpl[tpl.length - 1] === 0) { tpl.pop(); out += c; i++; templateBody(); continue; }
      tpl[tpl.length - 1]--;
    }
    out += c; i++;
    if (!/\s/.test(c)) lastSig = c;
  }
  return out;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const codePoint = cp => (Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '');
/** 解码 HTML 实体（&#NNN; &#xHH; 和几个常见命名实体）与 JS 转义（\uXXXX \u{X} \xHH）；反复解到不变，防止 &#92;u64a4 这类套娃 */
function decodeEscapes(text) {
  let cur = String(text);
  for (let k = 0; k < 4; k++) {
    const next = cur
      .replace(/&#x([0-9a-f]+);?/gi, (m, h) => codePoint(parseInt(h, 16)) || m)
      .replace(/&#(\d+);?/g, (m, d) => codePoint(parseInt(d, 10)) || m)
      .replace(/&([a-z]+);/gi, (m, nm) => (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, nm.toLowerCase()) ? NAMED_ENTITIES[nm.toLowerCase()] : m))
      .replace(/\\u\{([0-9a-f]+)\}/gi, (m, h) => codePoint(parseInt(h, 16)) || m)
      .replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/**
 * 清洗整份 HTML：剥 <!-- --> 注释、可执行 <script> 里的 JS 注释、<style> 里的 CSS 注释，最后解码转义 / 实体。
 * 返回 { text：清洗后的全文；scripts：每个可执行内联脚本清洗后的代码；codeScripts：同上但字符串内容清空（数调用 / 找定义用）；
 *         plain / plainBlank：分别是上面两种、但没有解码转义 / 实体的版本（解码会把 '&#39;' 变成 '''，只能用来查文字，不能拿去编译） }
 */
function cleanHtml(html) {
  let text = '', i = 0;
  const scripts = [], codeScripts = [], plain = [], plainBlank = [], re = /<!--|<script\b|<style\b/gi;
  for (let m; (m = re.exec(html));) {
    text += html.slice(i, m.index);
    if (m[0] === '<!--') {
      const e = html.indexOf('-->', m.index + 4);
      text += ' '; i = e < 0 ? html.length : e + 3; re.lastIndex = i; continue;
    }
    const tag = m[0].toLowerCase() === '<script' ? 'script' : 'style';
    const open = /^<[^>]*>/.exec(html.slice(m.index));
    if (!open) { text += html.slice(m.index); i = html.length; break; }
    const bodyStart = m.index + open[0].length, closeRe = new RegExp('</' + tag + '\\b[^>]*>', 'i');
    const rest = html.slice(bodyStart), cm = closeRe.exec(rest);
    const body = cm ? rest.slice(0, cm.index) : rest, close = cm ? cm[0] : '';
    let cleaned = body;
    if (tag === 'style') cleaned = body.replace(/\/\*[\s\S]*?\*\//g, ' ');
    else {
      const ty = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(open[0]);
      if (!/\bsrc\s*=/i.test(open[0]) && JS_TYPE_OK(ty && ty[1])) {
        cleaned = stripJsComments(body);
        const blanked = stripJsComments(body, { blank: true });
        scripts.push(decodeEscapes(cleaned)); codeScripts.push(decodeEscapes(blanked)); plain.push(cleaned); plainBlank.push(blanked);
      }
    }
    text += open[0] + cleaned + close;
    i = bodyStart + body.length + close.length; re.lastIndex = i;
  }
  text += html.slice(i);
  return { text: decodeEscapes(text), scripts, codeScripts, plain, plainBlank };
}

const CLEAN = cleanHtml(HTML);
const TEXT = CLEAN.text, CODE = CLEAN.codeScripts.join('\n');

// ---------------------------------------------------------------------------------------------
// 结构解析（沿用原有检查）
// ---------------------------------------------------------------------------------------------

/** 取所有可执行的 <script>（不含带 src 的、不含 type 不是 JS 的），返回 [{code, index}] */
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m; (m = re.exec(html));) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const ty = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (ty && !/^(text|application)\/(javascript|ecmascript)$/i.test(ty[1]) && ty[1].toLowerCase() !== 'module') continue;
    out.push({ code: m[2], index: m.index });
  }
  return out;
}

/** 所有 <script src="..."> 的 src，按出现顺序，带位置 */
function scriptSrcs(html) {
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (let m; (m = re.exec(html));) out.push({ src: m[1], index: m.index });
  return out;
}

/** 从 openIdx（指向 '('）起找配对的 ')'，识别单 / 双 / 反引号字符串里的括号；找不到返回文本末尾 */
function callEnd(text, openIdx) {
  let depth = 0, q = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return text.length;
}

/** 找出「往 /api/report 发请求」的 fetch 调用：参数里同时有 POST 与 report，或直接写了 /api/report；返回命中的调用文本列表 */
function badFetchCalls(text) {
  const bad = [];
  const re = /\bfetch\s*\(/g;
  for (let m; (m = re.exec(text));) {
    const open = m.index + m[0].length - 1, call = text.slice(m.index, callEnd(text, open));
    if (/\/api\/report/i.test(call) || (/['"`]POST['"`]/i.test(call) && /report/i.test(call))) bad.push(call);
  }
  return bad;
}

/** 自动发信 / 上报类代码的特征（页面只读，一个都不该有）；返回 [特征名, 位置]。
 *  sendBeacon、<form、/api/report 是「出现即违规」（不再要求带括号）；举报页链接 ALLOWED_REPORT_LINK 先摘掉再查 */
const MAIL_PATTERNS = [
  ['mailto:', /mailto:/i], ['sendBeacon', /sendBeacon/i], ['<form', /<\s*form\b/i], ['/api/report', /\/api\/report/i], ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['method: POST', /\bmethod\s*:\s*['"`]POST['"`]/i], ['xhr.open(POST)', /\.open\s*\(\s*['"`]POST['"`]/i],
  ['smtp / sendmail', /\b(smtp|sendmail|nodemailer)\b/i], ['emailjs / formsubmit', /\b(emailjs|formsubmit)\b/i],
];
const withoutAllowedLink = text => text.split(ALLOWED_REPORT_LINK).join(' ');
const mailHits = text => { const t = withoutAllowedLink(text); return MAIL_PATTERNS.filter(([, re]) => re.test(t)).map(([name, re]) => [name, t.search(re)]); };

/** 页面里「自己定义」了 names 里的函数名？返回 [{name, kind, at}]。code 应该是清空字符串内容后的代码（codeScripts）。
 *  认：function NAME、NAME = function / 箭头、对象属性 NAME: function / 箭头、方法简写 NAME(...) {、成员赋值 x.NAME = ...（改写 lib 也算） */
function definedFns(code, names) {
  const hits = [], FN = String.raw`(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)`;
  for (const nm of names) {
    const pats = [
      ['function 声明', new RegExp(String.raw`\bfunction\s*\*?\s*${nm}\b`)],
      ['变量 = 函数', new RegExp(String.raw`\b(?:const|let|var)\s+${nm}\s*=\s*${FN}`)],
      ['成员 / 变量赋值', new RegExp(String.raw`\.\s*${nm}\s*=(?!=)`)],
      ['对象属性 = 函数', new RegExp(String.raw`(?:^|[^.\w$])${nm}\s*:\s*${FN}`)],
      ['方法简写', new RegExp(String.raw`(?:^|[{,;]\s*)(?:async\s+)?${nm}\s*\([^)]*\)\s*\{`)],
    ];
    for (const [kind, re] of pats) { const m = re.exec(code); if (m) hits.push({ name: nm, kind, at: m.index }); }
  }
  return hits;
}

/** 页面里「以任何形式声明或赋值」了 names 里的名字？认：function / class / const / let / var NAME、NAME = …、x.NAME = …、对象属性 NAME: …。
 *  只调用 / 读取（RPT.ACTION[a.rule]、typeof x.rulesOf === 'function'）不算。code 应该是清空字符串内容后的代码（codeScripts）。 */
function declaredNames(code, names) {
  const hits = [];
  for (const nm of names) {
    const pats = [
      ['声明', new RegExp(String.raw`\b(?:function|class|const|let|var)\s*\*?\s*${nm}\b`)],
      ['赋值', new RegExp(String.raw`(?<![.\w$])${nm}\s*=(?!=)`)],
      ['成员赋值', new RegExp(String.raw`\.\s*${nm}\s*=(?!=)`)],
      ['对象属性', new RegExp(String.raw`(?:^|[{,]\s*)${nm}\s*:`)],
      ['方法简写', new RegExp(String.raw`(?:^|[{,;]\s*)(?:async\s+)?${nm}\s*\([^)]*\)\s*\{`)],
    ];
    for (const [kind, re] of pats) { const m = re.exec(code); if (m) hits.push({ name: nm, kind, at: m.index }); }
  }
  return hits;
}

/** 内置案件的 id：CASES 数组里 2 空格缩进的 `  id:'xxx'`（节点是 4 空格缩进的 `{id:'xxx', type:`，不会混进来）；找不到 CASES 区块返回 null */
function builtinCaseIds(code) {
  const a = code.indexOf('const CASES = ['), b = code.indexOf('CASES.forEach(', a);
  if (a < 0 || b < 0) return null;
  return [...code.slice(a, b).matchAll(/^ {2}id:\s*'([^']+)'/gm)].map(m => m[1]);
}

/** 已删除功能的标识（出现在页面代码 / 标记里就是把删掉的东西又加回来了）；返回命中的 [标识, 位置] */
const REMOVED_IDENTS = [
  'id="live"', 'id="offBtn"', 'offBtn', 'id="feedBtn"', 'feedBtn', 'id="q"', 'id="qBtn"', 'id="stages"', 'id="rules"',
  'addHypo', 'delHypo', 'checkAddrs', 'renderStages', 'renderRules', 'lvOpen', 'lvClose', 'renderLive', 'offRefresh', 'offSchedule', 'offOnResult', 'offFeedBlock',
  'STAGES', 'ruleOn', 'LAST_TSV', 'OFFICIAL_API', 'reduceOfficial', 'detectShrink'
];
const removedHits = text => REMOVED_IDENTS.map(id => [id, text.indexOf(id)]).filter(([, i]) => i >= 0);

/** 页面对官方接口 /api/ 的请求特征：域名后直接跟 /api，或页面自己写 fetch( / XMLHttpRequest（联网只允许 lib/trace-eth.js 去 Etherscan） */
const apiHits = text => [['bgblockchain.xyz/api', /bgblockchain\.xyz\/api\b/i], ['fetch(', /(?<![\w$.])fetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/]].filter(([, re]) => re.test(text)).map(([n]) => n);

// ---------------------------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------------------------

test('页面文件存在且非空', () => {
  assert.ok(HTML.length > 10000, `HTML 只有 ${HTML.length} 字符，不像完整页面：${HTML_FILE}`);
  assert.ok(CLEAN.scripts.length >= 1 && CODE.length > 5000, `清洗后没有可用的主脚本（scripts=${CLEAN.scripts.length}, code=${CODE.length}），清洗器可能出错了`);
});

test('清洗后的主内联脚本仍能编译（清洗器没有把代码切坏）', () => {
  const longest = a => a.reduce((x, y) => (y.length > x.length ? y : x));
  assert.doesNotThrow(() => new vm.Script(longest(CLEAN.plain), { filename: '溯流资金画布.html<cleaned-main-inline-script>' }), '剥注释之后主内联脚本无法编译：stripJsComments 把正则、字符串或注释边界判错了');
  assert.doesNotThrow(() => new vm.Script(longest(CLEAN.plainBlank), { filename: 'blank-strings' }), '清空字符串内容之后主内联脚本无法编译');
});

test('文案：全文（剥注释、解码转义 / 实体之后）不得出现「撤」字、「官方核实」「从黑名单移除」（这些文案只能来自 lib.goneText）', () => {
  for (const phrase of ['撤下', '官方核实', '从黑名单移除', '撤']) {
    const i = TEXT.indexOf(phrase);
    assert.equal(i, -1, `清洗后的 HTML 里出现了「${phrase}」（位置 ${i}）：${around(TEXT, i)}。该文案只能由 lib.goneText 提供，页面不要自己写（包括用 \\uXXXX / &#NNN; 写）`);
  }
});

test('范围清单：内置案件为 bitget（默认）+ 币安（可切换真实案例）；Bybit / Harmony / Ronin 回放已删除并存档', () => {
  const ids = builtinCaseIds(CLEAN.scripts.join('\n'));   // 用保留字符串内容的版本（CODE 里字符串被清空了）
  assert.ok(ids, '找不到 const CASES = [ … ] 区块');
  assert.deepEqual(ids, ['bitget', 'binance'], `内置案件应为 bitget + binance，实际：${JSON.stringify(ids)}`);
});

test('范围清单：已删除功能（官方实时视图 / 规则开关 / 推演节点 / 核对地址框 / 事件数据源导出 / 洗钱七阶段）的标识不许再出现', () => {
  const hits = removedHits(TEXT);
  assert.deepEqual(hits, [], `页面里又出现了已删除功能的标识：${hits.map(([n, i]) => `${n}@${i} ${around(TEXT, i)}`).join(' | ')}`);
});

test('范围清单：页面不得请求 trace.bgblockchain.xyz 的 /api/，也不得自己 fetch（官方数据只用静态快照；文字链接到 /report、/v2 页面可以）', () => {
  const hits = apiHits(withoutAllowedLink(TEXT));
  assert.deepEqual(hits, [], `页面里出现了联网请求特征：${hits.join(', ')}`);
});

test('页面不得自己定义 reduceOfficial / goneText / describeGone / detectShrink（判定口径只有 lib 一份）', () => {
  const hits = definedFns(CODE, LIB_ONLY_FNS);
  assert.deepEqual(hits, [], `页面里自己定义了 lib 的函数：${hits.map(h => `${h.name}（${h.kind}）@${h.at} ${around(CODE, h.at, 40)}`).join(' | ')}`);
});

test('页面不得自己定义 rulesOf / ACTION / HEADLINE（卡点判定与文案的唯一来源是 lib/report.js）', () => {
  const hits = declaredNames(CODE, REPORT_ONLY_NAMES);
  assert.deepEqual(hits, [], `页面里自己定义了 lib/report.js 的内容：${hits.map(h => `${h.name}（${h.kind}）@${h.at} ${around(CODE, h.at, 40)}`).join(' | ')}`);
  // 页面确实在调用 lib 的这三样（不是删了没人用）
  for (const nm of ['rulesOf', 'ACTION', 'HEADLINE']) assert.ok(new RegExp(String.raw`RPT\.${nm}\b`).test(CODE), `页面没有调用 RPT.${nm}`);
});

test('主内联脚本语法正确（vm.Script 编译，不执行）', () => {
  const scripts = inlineScripts(HTML);
  assert.ok(scripts.length >= 1, '没找到内联 <script>');
  const main = scripts.reduce((a, b) => (b.code.length > a.code.length ? b : a));
  assert.ok(main.code.length > 5000, `最大的内联脚本只有 ${main.code.length} 字符，不像主脚本`);
  assert.doesNotThrow(() => new vm.Script(main.code, { filename: '溯流资金画布.html<main-inline-script>' }), '主内联脚本无法编译');
  assert.doesNotThrow(() => new Function(main.code), '主内联脚本作为函数体无法编译');
  // 其余内联脚本（如果有）也得能编译
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s.code, { filename: `inline@${s.index}` }), `内联脚本（位置 ${s.index}）无法编译`);
});

test('引用 data/official-snapshot.js 与 lib/official-data.js（并且都在主内联脚本之前加载，文件存在）', () => {
  const srcs = scriptSrcs(HTML), by = name => srcs.find(x => x.src.replace(/^\.\//, '') === name);
  const snap = by('data/official-snapshot.js'), lib = by('lib/official-data.js');
  assert.ok(snap, '没有 <script src="data/official-snapshot.js">');
  assert.ok(lib, '没有 <script src="lib/official-data.js">');
  const scripts = inlineScripts(HTML), main = scripts.reduce((a, b) => (b.code.length > a.code.length ? b : a));
  assert.ok(snap.index < main.index && lib.index < main.index, '两个数据 / lib 脚本必须在主内联脚本之前');
  assert.ok(fs.existsSync(path.join(ROOT, 'data', 'official-snapshot.js')), 'data/official-snapshot.js 文件不存在');
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'official-data.js')), 'lib/official-data.js 文件不存在');
});

test('引用 lib/trace-eth.js 且在主内联脚本之前加载（该文件缺失时页面降级、追踪按钮置灰，所以这里不断言文件存在）', () => {
  const trace = scriptSrcs(HTML).find(x => x.src.replace(/^\.\//, '') === 'lib/trace-eth.js');
  assert.ok(trace, '没有 <script src="lib/trace-eth.js">');
  const scripts = inlineScripts(HTML), main = scripts.reduce((a, b) => (b.code.length > a.code.length ? b : a));
  assert.ok(trace.index < main.index, 'lib/trace-eth.js 必须在主内联脚本之前加载');
});

test('引用 lib/report.js 且在主内联脚本之前加载，文件存在（卡点判定、卡点文案、报告都来自它；页面缺它时只会提示未加载）', () => {
  const rep = scriptSrcs(HTML).find(x => x.src.replace(/^\.\//, '') === 'lib/report.js');
  assert.ok(rep, '没有 <script src="lib/report.js">');
  const trace = scriptSrcs(HTML).find(x => x.src.replace(/^\.\//, '') === 'lib/trace-eth.js');
  const scripts = inlineScripts(HTML), main = scripts.reduce((a, b) => (b.code.length > a.code.length ? b : a));
  assert.ok(rep.index < main.index, 'lib/report.js 必须在主内联脚本之前加载');
  assert.ok(trace && trace.index < rep.index, 'lib/report.js 应排在 lib/trace-eth.js 之后');
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'report.js')), 'lib/report.js 文件不存在');
});

test('引用 lib/guide.js、lib/brand.js 且都在主内联脚本之前、排在 lib/report.js 之后，文件存在；页面不另写一份指引（只读 window.SuliuGuide）', () => {
  const srcs = scriptSrcs(HTML), by = name => srcs.find(x => x.src.replace(/^\.\//, '') === name);
  const rep = by('lib/report.js'), guide = by('lib/guide.js'), brand = by('lib/brand.js');
  assert.ok(guide, '没有 <script src="lib/guide.js">');
  assert.ok(brand, '没有 <script src="lib/brand.js">');
  const scripts = inlineScripts(HTML), main = scripts.reduce((a, b) => (b.code.length > a.code.length ? b : a));
  assert.ok(rep && rep.index < guide.index, 'lib/guide.js 应排在 lib/report.js 之后');
  assert.ok(guide.index < main.index && brand.index < main.index, 'lib/guide.js、lib/brand.js 必须在主内联脚本之前加载');
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'guide.js')), 'lib/guide.js 文件不存在');
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'brand.js')), 'lib/brand.js 文件不存在');
  // 页面只读同一份 SuliuGuide：不得把指引正文另抄一份（用指引里几句有代表性的话探测）
  for (const probe of ['国家反诈中心', '先交钱就能帮你追回', 'Law Enforcement', 'SEAL 911', '受案回执', 'Subject: URGENT']) assert.equal(TEXT.includes(probe), false, `页面里出现了指引正文「${probe}」：指引只能来自 lib/guide.js`);
  const SRC = CLEAN.scripts.join('\n');   // 保留字符串内容的版本（CODE 里字符串被清空了）
  assert.ok(SRC.includes('window.SuliuGuide'), '页面没有读 window.SuliuGuide');
  assert.ok(/id="guideBtn"/.test(TEXT) && />报案指引</.test(TEXT), '页面里没有「报案指引」入口');
  assert.ok(/\$\('#guideBtn'\)\.onclick = gdOpen/.test(SRC), '「报案指引」入口没有接线');
  // 缺 lib/guide.js 时按钮置灰、报告照常生成：页面里必须有这条降级
  assert.ok(/\$\('#guideBtn'\)\.disabled = !GD/.test(SRC), '缺 lib/guide.js 时应把入口置灰');
});

test('追踪地址：页面脚本里不得有 console.* 调用（Etherscan API key 不能被打印出来）', () => {
  const hits = [...CODE.matchAll(/\bconsole\s*\./g)].map(m => around(CODE, m.index, 40));
  assert.deepEqual(hits, [], `页面脚本里出现了 console 调用：${hits.join(' | ')}`);
});

test('Google 字体 <link> 必须带 media="print"（不阻塞渲染；<noscript> 里的兜底除外）', () => {
  const noNoscript = HTML.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  const links = (noNoscript.match(/<link\b[^>]*>/gi) || []).filter(t => /href\s*=\s*["'][^"']*fonts\.googleapis\.com/i.test(t) && /rel\s*=\s*["']?stylesheet/i.test(t));
  assert.ok(links.length >= 1, '没找到 fonts.googleapis.com 的 stylesheet link');
  for (const t of links) assert.ok(/\bmedia\s*=\s*["']print["']/i.test(t), `Google 字体 link 没有 media="print"：${t}`);
});

test('只读：不得有 POST 到 /api/report 的代码，不得出现 sendBeacon、<form、/api/report，也不得有任何自动发信 / 上报代码（举报页 https://trace.bgblockchain.xyz/report 作为链接文本 / href 允许）', () => {
  const calls = badFetchCalls(TEXT);
  assert.deepEqual(calls, [], `发现往 /api/report 发请求的 fetch 调用：${calls.join(' | ')}`);
  const hits = mailHits(TEXT);
  assert.deepEqual(hits, [], `发现自动发信 / 上报特征：${hits.map(([n, i]) => `${n}@${i} ${around(withoutAllowedLink(TEXT), i)}`).join(' | ')}`);
});

test('检测器自检：坏样例能被抓到，好样例不误报（防止上面的断言空转）', () => {
  // ---- 原有：fetch / 发信 ----
  assert.equal(badFetchCalls(`fetch('https://trace.bgblockchain.xyz/api/report', {method: 'POST', body: x})`).length, 1);
  assert.equal(badFetchCalls(`fetch(BASE + '/api/report', {\n method: "POST" })`).length, 1);
  assert.equal(badFetchCalls(`fetch(u, {method:'POST', body:'report'})`).length, 1);
  assert.equal(badFetchCalls(`fetch('/api/holdings', {cache:'no-cache'}); foo('POST', 'report')`).length, 0);
  assert.ok(mailHits(`location.href = 'mailto:a@b.c'`).length >= 1);
  assert.ok(mailHits(`navigator.sendBeacon('/x', d)`).length >= 1);
  assert.ok(mailHits(`fetch(u, {method: 'POST'})`).length >= 1);
  assert.equal(mailHits(`fetch('/api/holdings', {cache:'no-cache'})`).length, 0);
  // ---- 新增：sendBeacon（不带括号也算）、<form、/api/report；举报页链接放行 ----
  assert.ok(mailHits(`var s = 'sendBeacon';`).length >= 1);
  assert.ok(mailHits(`<form action="/x"><input></form>`).length >= 1);
  assert.ok(mailHits(`<FORM method=post>`).length >= 1);
  assert.ok(mailHits(`const u = BASE + '/api/report';`).length >= 1);
  assert.ok(mailHits(`<a href="https://trace.bgblockchain.xyz/api/report">x</a>`).length >= 1);
  assert.equal(mailHits(`<a href="https://trace.bgblockchain.xyz/report">Bitget 官方举报页 https://trace.bgblockchain.xyz/report</a>`).length, 0);
  assert.equal(mailHits(`channels:'Bitget 官方举报页 https://trace.bgblockchain.xyz/report ；稳定币冻结……'`).length, 0);
  assert.ok(mailHits(`<a href="https://trace.bgblockchain.xyz/report">x</a> <form>`).length >= 1, '放行链接不能连带放行别的违规');
  // ---- 新增：注释剥离 ----
  const js = s => stripJsComments(s);
  assert.equal(js(`a = 1; // 撤下 sendBeacon\nb = 2;`).includes('撤'), false);
  assert.equal(js(`a = 1; /* 撤下\n LIB.goneText( */ b = 2;`).includes('撤'), false);
  assert.equal(js(`var u = 'https://x.y/z'; // c`).includes("'https://x.y/z'"), true, '字符串里的 // 不能当注释');
  assert.equal(js(`var r = /\\/\\/[a-z]+/; // c`).includes('/\\/\\/[a-z]+/'), true, '正则里的 // 不能当注释');
  assert.equal(js(`var r = /["']/g; var s = "撤"; // "`).includes('"撤"'), true, '正则里的引号不能把字符串状态带偏');
  assert.equal(js('var t = `a // ${x /* c */ + "撤"} b`; /* d */').includes('撤'), true, '模板字符串里的表达式代码要保留');
  assert.equal(js('var t = `a // ${x} 撤`; // e').includes('撤'), true, '模板字符串正文里的 // 不是注释');
  assert.equal(js(`x = a / b; y = c / d; // 撤`).includes('撤'), false, '除号不能被当成正则开头而吞掉后面的注释');
  assert.equal(js(`return /x/.test(s); // 撤`).includes('撤'), false);
  assert.equal(stripJsComments(`a('LIB.goneText(') + LIB.goneText(x)`, { blank: true }), `a('') + LIB.goneText(x)`);
  const c = cleanHtml(`<p>a<!-- 撤下 --></p><style>/* 撤下 */ p{color:red}</style><script>var a = 1; // 撤下\nvar b = '撤';</script><script src="x.js"></script><script type="application/json">{"k":"//撤"}</script>`);
  assert.equal(c.text.includes('撤下'), false);
  assert.equal(c.text.includes(`'撤'`), true, '代码里的字符串要保留');
  assert.equal(c.text.includes('//撤'), true, '非 JS 的 <script>（JSON）不剥注释、内容原样保留');
  assert.equal(c.scripts.length, 1);
  // ---- 新增：解码 ----
  assert.equal(decodeEscapes(`\\u64a4\\u4e0b`), '撤下');
  assert.equal(decodeEscapes(`\\u{64a4}`), '撤');
  assert.equal(decodeEscapes(`&#25764;&#x4e0b;`), '撤下');
  assert.equal(decodeEscapes(`&#92;u64a4`), '撤', '实体套转义');
  assert.equal(decodeEscapes(`&lt;form&gt; &amp;&quot;`), '<form> &"');
  assert.equal(decodeEscapes(`\\x73endBeacon`), 'sendBeacon');
  assert.ok(mailHits(decodeEscapes(`navigator.\\u0073endBeacon(u)`)).length >= 1);
  assert.ok(mailHits(decodeEscapes(`&#60;form action=x&#62;`)).length >= 1);
  assert.equal(decodeEscapes('&#99999999999;'), '&#99999999999;', '越界码点原样保留，不抛错');
  // ---- 新增：函数定义 / 调用计数 ----
  const defs = code => definedFns(code, LIB_ONLY_FNS).map(h => h.name);
  assert.deepEqual(defs(`function goneText(i){ return ''; }`), ['goneText']);
  assert.deepEqual(defs(`const reduceOfficial = (s, r) => s;`), ['reduceOfficial']);
  assert.deepEqual(defs(`var describeGone = function(){};`), ['describeGone']);
  assert.deepEqual(defs(`const detectShrink = async (a, b) => ({});`), ['detectShrink']);
  assert.deepEqual(defs(`window.goneText = x => x;`), ['goneText']);
  assert.deepEqual(defs(`LIB.detectShrink = f;`), ['detectShrink']);
  assert.deepEqual(defs(`const o = { goneText: function(){}, x: 1 };`), ['goneText']);
  assert.deepEqual(defs(`const o = { describeGone: i => i };`), ['describeGone']);
  assert.deepEqual(defs(`const o = { reduceOfficial(s, r) { return s; } };`), ['reduceOfficial']);
  assert.deepEqual(defs(`class A { detectShrink(a, b) { return 1; } }`), ['detectShrink']);
  assert.deepEqual(defs(`function goneNote(res){ return LIB.goneText(i); } function goneHtml(a){ try { t = LIB.goneText(info); } catch (e) {} }`), [], '页面自己的 goneNote / goneHtml 不算，调用 LIB.goneText 不算');
  assert.deepEqual(defs(`const LIB = LIB0 && ['reduceOfficial', 'describeGone', 'goneText'].every(k => typeof LIB0[k] === 'function') ? LIB0 : null;`), [], '字符串里的名字不算');
  assert.deepEqual(defs(`const {goneText} = LIB; if (goneText === 1) {}`), [], '解构引用、比较不算定义');
  // ---- 新增：declaredNames（函数 / 常量 / 变量 / 赋值 / 属性）----
  const decl = code => [...new Set(declaredNames(code, REPORT_ONLY_NAMES).map(h => h.name))];   // 同一个名字可能同时命中「声明」和「赋值」，按名字去重
  assert.deepEqual(decl(`function rulesOf(tx, f, to){ return []; }`), ['rulesOf']);
  assert.deepEqual(decl(`const ACTION = { cex: 'x' };`), ['ACTION']);
  assert.deepEqual(decl(`const HEADLINE = {
 cex: 'x' }; let ACTION;`).sort(), ['ACTION', 'HEADLINE']);
  assert.deepEqual(decl(`var rulesOf = (a) => a;`), ['rulesOf']);
  assert.deepEqual(decl(`ACTION = other;`), ['ACTION']);
  assert.deepEqual(decl(`window.HEADLINE = h; x.rulesOf = f;`).sort(), ['HEADLINE', 'rulesOf']);
  assert.deepEqual(decl(`const o = { rulesOf: f, ACTION: {} };`).sort(), ['ACTION', 'rulesOf']);
  assert.deepEqual(decl(`class A { rulesOf(a, b) { return 1; } }`), ['rulesOf']);
  assert.deepEqual(decl(`t += RPT.HEADLINE[a.rule] + RPT.ACTION[a.rule]; RPT.rulesOf(tx, f, to);`), [], '只调用 / 读取不算');
  assert.deepEqual(decl(`const RPT = X && typeof X.rulesOf === 'function' && X.HEADLINE && X.ACTION ? X : null;`), [], '读取与比较不算');
  assert.deepEqual(decl(`const ACTION_MAP = 1; function rulesOfAll(){}`), [], '名字只是前缀不算');
  // ---- 范围清单检测器 ----
  assert.deepEqual(builtinCaseIds("const CASES = [\n{\n  id:'bitget', focus:'n04',\n  nodes:[\n    {id:'bg6', type:'victim'}\n  ]\n}\n];\n\nCASES.forEach(c => 1);"), ['bitget']);
  assert.deepEqual(builtinCaseIds("const CASES = [\n{\n  id:'bitget', focus:'n04',\n  nodes:[]\n},\n{\n  id:'bybit', focus:'split',\n  nodes:[]\n}\n];\nCASES.forEach(c => 1);"), ['bitget', 'bybit'], '多一个案件要被数出来');
  assert.equal(builtinCaseIds('const X = 1;'), null);
  assert.ok(removedHits('<main class="live" id="live" hidden>').length >= 1);
  assert.ok(removedHits('function addHypo(f){}').length >= 1);
  assert.ok(removedHits('document.getElementById("feedBtn")').length >= 1);
  assert.deepEqual(removedHits('const x = 1; function renderCanvas(){} // 卡点'), []);
  assert.deepEqual(apiHits("fetch('https://trace.bgblockchain.xyz/api/holdings')"), ['bgblockchain.xyz/api', 'fetch(']);
  assert.deepEqual(apiHits("const u = 'https://trace.bgblockchain.xyz/api/chains'"), ['bgblockchain.xyz/api']);
  assert.deepEqual(apiHits('x = new XMLHttpRequest()'), ['XMLHttpRequest']);
  assert.deepEqual(apiHits('官方 /api/victims 里没有这个前缀；<a href="https://trace.bgblockchain.xyz/report">举报页</a> https://trace.bgblockchain.xyz/v2#0x1'), [], '文字里提到 /api/victims、链接到 /report、/v2 都不算请求');
  assert.deepEqual(apiHits('prefetch(1)'), [], 'prefetch( 不是 fetch(');
  // 「撤下」等文案的检测本身就是 includes，不需要再自检；字体 link 的检测用一段带 noscript 的样例验证
  const sample = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?x" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?x"></noscript>`;
  const stripped = sample.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  assert.equal((stripped.match(/<link\b[^>]*>/gi) || []).length, 1);
});
