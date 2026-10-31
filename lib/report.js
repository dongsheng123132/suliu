/* 溯流 · 可打印证据报告（UMD）：浏览器挂 window.SuliuReport，Node 下 module.exports；零依赖、无 ESM 语法，file:// 可用 <script src> 加载。
 *
 * build({case, meta, generatedAt, official?, officialLabel?, svg?, info?, guide?, brand?}) → 一份完整、独立的 HTML 字符串（内联 CSS、A4 打印友好）。
 * 输出契约（tests/report.test.mjs 锁定）：
 *   - 没有任何 <script>、没有 on* 事件属性、不引用任何外部资源（另有 CSP meta 兜底）；
 *   - 唯一的外链是 https://etherscan.io/address/<校验过的 40 位十六进制地址> 与 /tx/<校验过的 64 位十六进制哈希>；
 *     例外：brand.site 非空且以 https:// 开头时，报告末尾「需要人工协助」一行里会把它做成链接（见 lib/brand.js，默认为空，默认报告里没有）；
 *     case.channels 里的官方举报页只作为文字出现，不生成链接；
 *   - 所有来自 case / meta / info / official 的字符串进入 HTML 前都经过 esc()；地址、哈希先按格式校验再拼链接；
 *   - 时间一律按固定 UTC+8 格式化（formatCst），不依赖运行环境的时区；
 *   - 每条结论区分「链上事实」与「推断 / 待核实」，并写明数据截止区块 / 时间。
 * 卡点判定（rulesOf）与卡点文案（HEADLINE / ACTION）的唯一来源是本文件：页面只调用，不再自己定义。
 * 文案合规：只引导向官方渠道（受害方官方举报页、交易所 / 协议方的执法请求入口、执法机关）；不写任何具体邮箱或电话；不承诺追回。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let off = null;
    try { off = require('./official-data.js'); } catch (e) { off = null; }
    module.exports = factory(root, off);
  } else root.SuliuReport = factory(root, null);
})(typeof self !== 'undefined' ? self : this, function (root, nodeOfficial) {
  'use strict';

  /** 版本号：与 package.json 的 version 一致（tests/brand.test.mjs 对照）；报告页脚显示 v 主.次 */
  const VERSION = '0.4.0';

  // ======================================================================
  // 卡点规则、严重程度、类型名、文案（页面与报告共用的唯一一份）
  // ======================================================================
  const freezeAll = o => { Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object') Object.freeze(o[k]); }); return Object.freeze(o); };

  /** 卡点只保留与「能不能冻结 / 拦截」相关的固定判定；紧急 / 高（prio）在画布上画红 / 橙框，并可预览举报文本 */
  const SEV = freezeAll({
    urgent: { name: '紧急', prio: true, rank: 0 },
    high: { name: '高', prio: true, rank: 1 },
    mid: { name: '中', prio: false, rank: 2 }
  });
  const RULES = Object.freeze([
    { id: 'cex', name: '进入中心化交易所', sev: 'urgent' },
    { id: 'freeze', name: '可冻结资产出现', sev: 'urgent' },
    { id: 'compliant', name: '进入可拦截通道', sev: 'high' },
    { id: 'bridge', name: '去中心化跨链 / 兑换', sev: 'mid' },
    { id: 'mixer', name: '混币器', sev: 'mid' }
  ].map(r => Object.freeze(r)));
  const RULE = {};
  RULES.forEach(r => { RULE[r.id] = r; });

  const TYPE_NAMES = freezeAll({
    victim: '受害方', attacker: '攻击者', relay: '中转', dex: 'DEX 兑换',
    bridge: '跨链 / 兑换服务', compliant: '可拦截通道', cex: '中心化交易所', mixer: '混币器',
    otc: 'OTC / 失去踪迹', frozen: '已冻结', hypo: '推演节点', dust: '投毒粉尘'
  });

  /** 发生了什么 */
  const HEADLINE = freezeAll({
    cex: '被追踪资金进入中心化交易所，这是可冻结线索。',
    freeze: '被追踪资金以可冻结的稳定币（USDT / USDC）形式出现，冻结窗口可能只有几分钟。',
    compliant: '被追踪资金进入可拦截的通道（兑换协议的充值地址或金库），运营方可能有机会拒绝或退款。',
    bridge: '被追踪资金进入去中心化跨链桥或兑换服务，通常无法在链上直接冻结。',
    mixer: '被追踪资金进入混币器，链上去向在此处中断。'
  });
  /** 下一步怎么做：只指向官方渠道；不写任何具体邮箱或电话（会过时） */
  const ACTION = freezeAll({
    cex: '先向当地公安机关报案，并通过受害方官方举报渠道（如有）提交；同时在该交易所官网查找「执法请求 / Law Enforcement / Security」入口，由警方或受害方提交地址、交易哈希、区块和金额，请求其核查相关账户。是否冻结由交易所依法决定，不保证结果。',
    freeze: '先向当地公安机关报案并通知受害方；由警方或受害方向发行方（Tether / Circle）提出冻结请求，并附上地址、交易哈希、区块和金额。稳定币转走很快，同时继续查看该地址之后的转出。不保证能够冻结。',
    compliant: '在该通道（协议）官网查找「Security / Law Enforcement / 执法请求」入口，由警方或受害方提交地址、交易哈希、区块和金额，请其核查并视情况拒绝或退款；同时告知报案机关。不保证对方同意。',
    bridge: '到目标链继续追踪：按这笔存入交易查跨链或兑换后的收款地址；把存入交易的哈希、时间和金额写进报案材料，交给警方。通常无法直接冻结，不保证追回。',
    mixer: '把存入的时间、金额和交易哈希写进报案材料，交给警方；混币之后的关联分析需要执法机关或专业机构完成，本报告不做推断，不保证追回。'
  });

  /**
   * 一笔转账触发了哪些卡点规则（返回规则 id 数组，顺序固定）。
   * 投毒粉尘节点发出的转账不算卡点；tx.flags 含 'freeze'（可冻结稳定币）、接收方类型为 cex / compliant / bridge / mixer 各算一条。
   */
  function rulesOf(tx, fromNode, toNode) {
    if (!tx || !fromNode || !toNode) return [];
    if (fromNode.type === 'dust') return [];
    const r = [];
    if (toNode.type === 'cex') r.push('cex');
    if (Array.isArray(tx.flags) && tx.flags.indexOf('freeze') >= 0) r.push('freeze');
    if (toNode.type === 'compliant') r.push('compliant');
    if (toNode.type === 'bridge') r.push('bridge');
    if (toNode.type === 'mixer') r.push('mixer');
    return r;
  }

  /** 节点是「推断」的：inferred:true，或说明里写了「推断」（引擎给按名字归类的合约、充值通道写的就是这个词）。
   *  「待核实 / 待人工核实」不算推断：那是某条事实还没核对完，只在摘要「待核实事项」里单列，不改变卡点的「链上事实」标记。 */
  const INFER_RE = /推断/;
  const PENDING_RE = /待人工核实|待核实/;
  const noteOf = n => String(n.note == null ? '' : n.note);
  function isInferred(n) { return !!n && (n.inferred === true || INFER_RE.test(noteOf(n))); }
  function isPending(n) { return !!n && PENDING_RE.test(noteOf(n)); }

  // ======================================================================
  // 小工具：转义、校验、格式化
  // ======================================================================
  const RE_ADDR = /^0x[0-9a-fA-F]{40}$/;
  const RE_HASH = /^0x[0-9a-fA-F]{64}$/;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  /** 文本：先把 apikey=xxx 之类抹掉（防御性，key 本不该出现在任何数据里），再转义 */
  const t = s => esc(String(s == null ? '' : s).replace(/(api_?key=)[^&\s"'<>]+/gi, '$1***'));
  const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const pad = (n, w) => String(n).padStart(w || 2, '0');

  function shortAddr(a) {
    const s = String(a == null ? '' : a);
    return RE_ADDR.test(s) ? s.slice(0, 8) + '…' + s.slice(-6) : s;
  }

  /** Unix 秒 → 'YYYY-MM-DD HH:mm:ss'（固定 UTC+8，不依赖系统时区）；非法返回 '' */
  function formatCst(sec) {
    if (sec == null || sec === '') return '';
    const n = Number(sec);
    if (!isFinite(n)) return '';
    const d = new Date(n * 1000 + 8 * 3600 * 1000);
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }

  /** 数字 → 千分位字符串，最多 6 位小数（去尾零） */
  function fmtNum(n) {
    if (!isFinite(n)) return '—';
    const s = Math.abs(n).toFixed(6).split('.');
    const f = (s[1] || '').replace(/0+$/, '');
    return (n < 0 ? '-' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }

  /** 53 位字符串哈希（cyrb53），只用来生成报告编号，不是安全用途 */
  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  /** 报告编号：SL- + 10 位十六进制，由 case.id 与 generatedAt 决定（同一份输入得到同一个编号） */
  function reportId(caseId, generatedAt) {
    return 'SL-' + cyrb53(String(caseId == null ? '' : caseId) + '|' + String(generatedAt == null ? '' : generatedAt)).toString(16).toUpperCase().padStart(14, '0').slice(0, 10);
  }

  const AMT_RE = /^\s*([\d,]+(?:\.\d+)?)\s+([A-Za-z][A-Za-z0-9]*)\s*$/;
  /** '200,000 USDT' → {value, symbol}；解析不了（'70 ETH → USDT/USDC'、null）返回 null */
  function parseAmt(s) {
    const m = typeof s === 'string' ? AMT_RE.exec(s) : null;
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ''));
    return isFinite(v) ? { value: v, symbol: m[2] } : null;
  }
  /** 一组转账按资产分别求和：{sums: Map(symbol → 合计), unparsed: [原文 | null...]} */
  function sumAssets(txs) {
    const sums = new Map(), unparsed = [];
    txs.forEach(tx => {
      const a = parseAmt(tx.amt);
      if (a) sums.set(a.symbol, (sums.get(a.symbol) || 0) + a.value);
      else unparsed.push(tx.amt == null || tx.amt === '' ? null : String(tx.amt));
    });
    return { sums, unparsed };
  }
  function sumsText(res) {
    const parts = Array.from(res.sums, p => fmtNum(p[1]) + ' ' + t(p[0]));
    let s = parts.length ? parts.join(' + ') : '—';
    if (res.unparsed.length) {
      const raw = res.unparsed.filter(x => x != null);
      s += '<br><span class="muted">另有 ' + res.unparsed.length + ' 笔金额无法汇总' + (raw.length ? '（' + raw.map(t).join('；') + '）' : '（金额未核对或未抓取）') + '，见第 5 节交易明细</span>';
    }
    return s;
  }
  /** 只用来给卡点排序的美元折算：稳定币 1:1，ETH / BTC 用 priceHints（不是成交价，不进入任何金额字段） */
  function usdRank(sums, hints) {
    const p = hints || {};
    const eth = Number(p.ETH) > 0 ? Number(p.ETH) : 3000, btc = Number(p.BTC) > 0 ? Number(p.BTC) : 60000;
    let total = 0;
    sums.forEach((v, sym) => {
      if (sym === 'ETH' || sym === 'WETH' || sym === 'stETH') total += v * eth;
      else if (sym === 'WBTC') total += v * btc;
      else if (sym === 'USDT' || sym === 'USDC' || sym === 'DAI') total += v;
    });
    return total;
  }

  // ======================================================================
  // 链接：只拼校验过的地址 / 哈希
  // ======================================================================
  const LINK_ATTR = ' target="_blank" rel="noopener noreferrer"';
  function addrHtml(a) {
    const s = String(a == null ? '' : a).trim();
    if (RE_ADDR.test(s)) return '<a class="mono addr" href="https://etherscan.io/address/' + s + '"' + LINK_ATTR + '>' + s + '</a>';
    return s ? '<span class="mono addr">' + t(s) + '</span> <span class="muted">（地址不完整，无法核对）</span>' : '<span class="muted">—</span>';
  }
  function hashHtml(h) {
    const s = String(h == null ? '' : h).trim();
    if (RE_HASH.test(s)) return '<a class="mono hash" href="https://etherscan.io/tx/' + s + '"' + LINK_ATTR + '>' + s + '</a>';
    return '<span class="muted">—（哈希未抓取）</span>';
  }

  // ======================================================================
  // 标记清洗（SVG / 附录 HTML）：逐个标签重组，只放行白名单元素与属性，不依赖正则乱删
  // ======================================================================
  const VOID_TAGS = new Set(['br', 'hr', 'wbr']);
  const NAME_RE = /^[A-Za-z][A-Za-z0-9:_-]*/;
  const attrEsc = v => String(v).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /**
   * spec = {tags: Set（小写）, drop: Set（连同内容整块丢弃）, attr(tag, attrLower, value) → 清洗后的值 | null（丢弃该属性）}
   * 不在 tags 里的标签只丢标签本身，内容照常处理；注释、<!…>、<?…> 一律丢弃；孤立的 '<' 转成文本；结尾补齐未闭合的标签。
   */
  function sanitizeMarkup(src, spec) {
    const s = String(src == null ? '' : src), n = s.length, stack = [];
    let i = 0, out = '';
    const closeTo = lower => {
      let k = stack.length - 1;
      while (k >= 0 && stack[k].lower !== lower) k--;
      if (k < 0) return;
      while (stack.length > k) out += '</' + stack.pop().orig + '>';
    };
    while (i < n) {
      const lt = s.indexOf('<', i);
      if (lt < 0) { out += s.slice(i); break; }
      out += s.slice(i, lt);
      i = lt;
      if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
      if (s[i + 1] === '!' || s[i + 1] === '?') { const e = s.indexOf('>', i); i = e < 0 ? n : e + 1; continue; }
      if (s[i + 1] === '/') {
        const e = s.indexOf('>', i), body = s.slice(i + 2, e < 0 ? n : e);
        i = e < 0 ? n : e + 1;
        const nm = NAME_RE.exec(body.trim());
        if (nm && spec.tags.has(nm[0].toLowerCase())) closeTo(nm[0].toLowerCase());
        continue;
      }
      const nm = NAME_RE.exec(s.slice(i + 1, i + 64));
      if (!nm) { out += '&lt;'; i++; continue; }
      const orig = nm[0], lower = orig.toLowerCase();
      let j = i + 1 + orig.length, selfClose = false;
      const attrs = [];
      for (;;) {
        while (j < n && /\s/.test(s[j])) j++;
        if (j >= n) break;
        if (s[j] === '>') { j++; break; }
        if (s[j] === '/') { if (s[j + 1] === '>') { selfClose = true; j += 2; break; } j++; continue; }
        const am = /^[^\s=\/>"'<]+/.exec(s.slice(j, j + 200));
        if (!am) { j++; continue; }
        const an = am[0];
        j += an.length;
        while (j < n && /\s/.test(s[j])) j++;
        let val = '';
        if (s[j] === '=') {
          j++;
          while (j < n && /\s/.test(s[j])) j++;
          if (s[j] === '"' || s[j] === "'") { const q = s[j], e = s.indexOf(q, j + 1); val = s.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
          else { const m2 = /^[^\s>]*/.exec(s.slice(j, j + 2000)); val = m2[0]; j += val.length; }
        }
        attrs.push([an, val]);
      }
      i = j;
      if (spec.drop.has(lower)) {
        if (!selfClose) { const re = new RegExp('</' + lower.replace(/[^a-z0-9]/g, '') + '\\s*>', 'ig'); re.lastIndex = i; const m3 = re.exec(s); i = m3 ? m3.index + m3[0].length : n; }
        continue;
      }
      if (!spec.tags.has(lower)) continue;
      let tag = '<' + orig;
      attrs.forEach(a => {
        if (!/^[A-Za-z][A-Za-z0-9:_.-]*$/.test(a[0])) return;
        const v = spec.attr(lower, a[0].toLowerCase(), a[1]);
        if (v != null) tag += ' ' + a[0] + '="' + attrEsc(v) + '"';
      });
      if (VOID_TAGS.has(lower)) { out += tag + '>'; continue; }
      out += tag + '>';
      if (selfClose) out += '</' + orig + '>';
      else stack.push({ orig, lower });
    }
    while (stack.length) out += '</' + stack.pop().orig + '>';
    return out;
  }

  const SVG_TAGS = new Set(['svg', 'defs', 'marker', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc']);
  const SVG_DROP = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'image', 'a', 'animate', 'animatetransform', 'set', 'use', 'link', 'meta', 'base', 'form', 'textarea', 'select', 'button', 'template', 'noscript']);
  const SVG_SPEC = {
    tags: SVG_TAGS, drop: SVG_DROP,
    attr(tag, name, val) {
      if (/^(on|xmlns|xlink|href|src|style|srcset|action|formaction|background|data-)/.test(name)) return null;
      if (/javascript:|vbscript:|data:\s*text\/html|expression\s*\(|url\s*\(\s*['"]?\s*(?!#)/i.test(val)) return null;
      return val;
    }
  };
  /** 去向图 SVG 清洗：只保留 <svg>…</svg> 里白名单元素 / 属性；没有 <svg> 或清洗后为空返回 '' */
  function sanitizeSvg(svg) {
    if (typeof svg !== 'string') return '';
    const m = /<svg\b[\s\S]*<\/svg\s*>/i.exec(svg);
    if (!m) return '';
    const out = sanitizeMarkup(m[0], SVG_SPEC);
    return /^<svg\b/i.test(out) ? out : '';
  }

  const HTML_TAGS = new Set(['p', 'div', 'span', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'small', 'code', 'pre', 'br', 'hr', 'h3', 'h4', 'h5', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'blockquote']);
  const HTML_DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'textarea', 'select', 'button', 'template', 'noscript', 'link', 'meta', 'base', 'audio', 'video', 'canvas', 'title']);
  const HTML_SPEC = {
    tags: HTML_TAGS, drop: HTML_DROP,
    attr(tag, name, val) {
      if (name === 'class' || name === 'colspan' || name === 'rowspan') return /^[\w\s-]{0,80}$/.test(val) ? val : null;
      if (tag === 'a' && name === 'href') return /^https:\/\/etherscan\.io\/(address\/0x[0-9a-fA-F]{40}|tx\/0x[0-9a-fA-F]{64})$/.test(val.trim()) ? val.trim() : null;
      return null;
    }
  };
  /** 附录等第三方 / 静态 HTML 片段清洗：白名单标签，只留 class / colspan / rowspan，链接只放行校验过的 Etherscan 地址 / 交易 */
  function sanitizeFragment(html) { return sanitizeMarkup(html, HTML_SPEC); }

  // ======================================================================
  // 官方名单（静态快照）核对
  // ======================================================================
  const CAT_NAMES = { vault: '协议金库', cex: '交易所', arb: '套利者', user: '无关用户', poison: '投毒', attacker: '攻击者相关' };
  function officialCtx(o) {
    const off = o.official;
    if (!off || typeof off !== 'object') return null;
    const OL = o.officialLib || nodeOfficial || (root && root.SuliuOfficial) || null;
    let index = null, label = o.officialLabel == null ? null : String(o.officialLabel);
    if (off.byAddr && typeof off.byAddr.get === 'function') { index = off; label = label || (off.label ? String(off.label) : null) || (off.fetchedAt ? String(off.fetchedAt) : null); }
    else if (OL && typeof OL.buildIndex === 'function' && (off.holdings || off.victims || off.reviewed)) {
      try { index = OL.buildIndex(off); } catch (e) { index = null; }
      label = label || (off.label ? String(off.label) : null) || (off.fetched_at ? String(off.fetched_at) : null);
    }
    if (!index || !OL || typeof OL.lookup !== 'function') return { ok: false };
    return { ok: true, index, OL, label: label || '时间未记录' };
  }
  /** 官方名单状态 → {text, flag}；文案只描述「在 / 不在名单里」，不说「已确认 / 安全」 */
  function officialText(oc, addr) {
    if (!oc || !oc.ok) return null;
    if (!RE_ADDR.test(String(addr == null ? '' : addr).trim())) return { text: '地址不完整，无法核对', flag: 'none' };
    let r = null;
    try { r = oc.OL.lookup(oc.index, String(addr).trim()); } catch (e) { r = null; }
    if (!r) return { text: '核对失败', flag: 'none' };
    const chains = (r.chains || []).map(c => String(c).toUpperCase()).join('/') || (r.listChain ? String(r.listChain).toUpperCase() : '');
    const rv = r.entry && r.entry.reviewed, nm = rv && rv.name ? '「' + rv.name + '」' : '';
    switch (r.status) {
      case 'attacker': return { text: '在官方攻击者名单中' + (chains ? '（' + chains + '）' : ''), flag: 'listed' };
      case 'victim': return { text: '在官方受害钱包名单中' + (chains ? '（' + chains + '）' : ''), flag: 'listed' };
      case 'reviewed_attacker_related': return { text: '官方已核查：攻击者相关' + nm + '（不在持有名单中）', flag: 'listed' };
      case 'reviewed_not_attacker': return { text: '官方已核查：非攻击者' + nm + (rv && rv.category ? '（' + (own(CAT_NAMES, rv.category) ? CAT_NAMES[rv.category] : String(rv.category)) + '）' : ''), flag: 'reviewed' };
      case 'conflict': return { text: '官方数据冲突：同时在攻击者名单和「非攻击者」核查里，请以官方看板为准', flag: 'warn' };
      case 'spoof': return { text: '疑似仿冒官方名单中的地址（首 4 位与末 4 位相同，中间不同），请逐位核对', flag: 'warn' };
      case 'retracted': {
        let g = '';
        try { const info = oc.OL.describeGone(oc.index, oc.OL.normAddr(addr)); g = info ? String(oc.OL.goneText(info) || '') : ''; } catch (e) { g = ''; }
        return { text: g || '官方勘误涉及该地址，请以官方看板为准', flag: 'warn' };
      }
      case 'invalid': return { text: '地址格式无效，无法核对', flag: 'none' };
      default: return { text: '不在官方名单中（未命中不等于资金干净）', flag: 'none' };
    }
  }

  // ======================================================================
  // 样式（内联；A4 打印友好；去向图 SVG 用到的类与变量也在这里，浅色固定）
  // ======================================================================
  const CSS = `
:root{color-scheme:light;--ink:#16201d;--muted:#55605c;--line:#c9d1ce;--soft:#f3f5f4;--accent:#1f4fb8;--danger:#b3261e;--warn:#9a5a00;--ok:#1f7a4a;
--bg:#ffffff;--surface:#ffffff;--surface-2:#f5f7f6;--edge:#97a39f;
--t-victim:#56708f;--t-attacker:#c2362b;--t-relay:#6a7672;--t-dex:#2d6fd3;--t-bridge:#7a4ec6;--t-compliant:#a8558f;--t-cex:#d27a14;--t-mixer:#3b4341;--t-otc:#8c9290;--t-frozen:#2b8a55;--t-hypo:#9a7412;--t-dust:#a3aaa7;
--sev-urgent:#c62828;--sev-high:#b46400;--sev-mid:#50629a;
--font-ui:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",system-ui,-apple-system,"Segoe UI",sans-serif;
--font-mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono","Courier New",monospace}
*{box-sizing:border-box}
html{background:#e6e9e8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:var(--ink);font:10.5pt/1.55 var(--font-ui)}
a{color:var(--accent);text-decoration:none;overflow-wrap:anywhere}
.mono{font-family:var(--font-mono)}
.muted{color:var(--muted)}
.printbar{max-width:210mm;margin:12px auto 0;padding:9px 14px;background:#fff6d1;border:1px solid #d9b94a;border-radius:6px;font-size:10.5pt}
.report{max-width:210mm;margin:12px auto 24px;background:#fff;padding:14mm 14mm 16mm;box-shadow:0 1px 8px rgba(0,0,0,.18)}
.top{border-bottom:2.5px solid var(--ink);padding-bottom:4mm;margin-bottom:2mm}
.brand{margin:0;font-size:10pt;letter-spacing:.2em;color:var(--muted)}
h1{margin:2mm 0 1mm;font-size:21pt;letter-spacing:.04em;line-height:1.25}
.case-title{margin:0;font-size:12.5pt;font-weight:600}
h2{margin:8mm 0 3mm;padding-bottom:1.5mm;border-bottom:1.5px solid var(--ink);font-size:13.5pt;break-after:avoid;page-break-after:avoid}
h3{margin:5mm 0 2mm;font-size:11pt;break-after:avoid;page-break-after:avoid}
p{margin:0 0 2.5mm}
ul,ol{margin:0 0 3mm;padding-left:5.5mm}
li{margin-bottom:1mm}
table{width:100%;border-collapse:collapse;font-size:8.6pt;margin:0 0 4mm}
th,td{border:.5pt solid var(--line);padding:.9mm 1.6mm;vertical-align:top;text-align:left;overflow-wrap:anywhere}
th{background:var(--soft);font-weight:600}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
table.kv th{width:31mm;white-space:nowrap}
table.tx,table.fixed{table-layout:fixed}
table.tx th.n,table.tx td.n{white-space:nowrap}
.story{white-space:pre-wrap}
.hash{font-size:7.4pt;word-break:break-all}
.addr{font-size:8.2pt;word-break:break-all}
.tag{display:inline-block;padding:0 1.6mm;border:.7pt solid currentColor;border-radius:2mm;font-size:8.4pt;font-weight:600;line-height:1.5}
.tag.fact{color:var(--ok)}
.tag.infer{color:var(--warn)}
.pill{display:inline-block;padding:0 1.6mm;border:.7pt solid currentColor;border-radius:2mm;font-size:8.2pt;line-height:1.5;margin-left:1.5mm}
.sev-urgent{color:var(--sev-urgent)}.sev-high{color:var(--sev-high)}.sev-mid{color:var(--sev-mid)}
.bx{border:1px solid var(--line);border-radius:1.5mm;padding:2.5mm 3.5mm;margin:0 0 3.5mm;background:#fff}
.bx.warn{border:2px solid var(--danger);background:#fdecea}
.bx.warn strong{color:var(--danger)}
.bx.note{border-color:#d9b94a;background:#fffbea}
.card{margin:0 0 3mm;break-inside:avoid;page-break-inside:avoid}
.card h3{margin-top:3mm}
.card table{margin-bottom:0}
.txl{margin:0 0 1.2mm}
.txl .m{display:block;font-size:8.2pt;color:var(--muted)}
tr.dust td{color:#6c7572;background:#fafbfa}
.small{font-size:8.4pt}
.cap{font-size:8.6pt;color:var(--muted);margin:1.5mm 0 0}
.legend{display:flex;flex-wrap:wrap;gap:1mm 4mm;font-size:8.4pt;color:var(--muted);margin:0 0 2mm}
.legend i{display:inline-block;width:2.4mm;height:2.4mm;border-radius:50%;background:var(--c);margin-right:1.4mm;vertical-align:0}
.diagram{border:1px solid var(--line);border-radius:1.5mm;padding:2mm;background:#fff}
.diagram svg{display:block;width:auto;height:auto;max-width:100%;margin:0 auto}
.foot{margin-top:8mm;padding-top:2mm;border-top:1px solid var(--line);font-size:8.4pt;color:var(--muted)}
.foot.brandline{margin-top:1.5mm;padding-top:0;border-top:0}
.appx .bx{margin-bottom:3mm}
.appx blockquote{margin:0 0 3mm;padding:1.5mm 3.5mm;border-left:1.2mm solid var(--line);background:var(--soft);line-height:2.5;break-inside:avoid;page-break-inside:avoid}
.appx blockquote p{margin:0 0 1.5mm}
.blank{display:inline-block;min-width:32mm;border-bottom:.6pt solid var(--ink);color:transparent;line-height:1.2;text-align:center}
.blank.wide{min-width:84mm}

/* 去向图（与页面画布同一套类名；只保留静态呈现，不含动画与选中态） */
.t-victim{--c:var(--t-victim)}.t-attacker{--c:var(--t-attacker)}.t-relay{--c:var(--t-relay)}.t-dex{--c:var(--t-dex)}.t-bridge{--c:var(--t-bridge)}
.t-compliant{--c:var(--t-compliant)}.t-cex{--c:var(--t-cex)}.t-mixer{--c:var(--t-mixer)}.t-otc{--c:var(--t-otc)}.t-frozen{--c:var(--t-frozen)}
.t-hypo{--c:var(--t-hypo)}.t-dust{--c:var(--t-dust)}
.nd .box{fill:#fff;stroke:var(--c);stroke-width:1.4}
.nd .stk{fill:#fff;stroke:var(--line);stroke-width:1}
.nd.hypo .box,.nd.inferred .box{stroke-dasharray:6 4;fill:var(--surface-2)}
.nd.dust .box{stroke-dasharray:2 3}
.nd .dot{fill:var(--c)}
.nd .ty{font-size:10.5px;fill:var(--muted);letter-spacing:.04em}
.nd .lb{font-size:13.5px;font-weight:600;fill:var(--ink)}
.nd .ad{font-family:var(--font-mono);font-size:11px;fill:var(--muted)}
.nd .rt{font-family:var(--font-mono);font-size:10.5px;fill:var(--ink)}
.nd .rt.warn{fill:var(--t-cex);font-weight:600}
.nd .rt.ok{fill:var(--t-frozen);font-weight:600}
.nd .of{font-size:10px;font-weight:600}
.nd .of.warn{fill:var(--t-cex)}.nd .of.mute{fill:var(--muted);font-weight:400}
.ring{fill:none;stroke-width:2.5}
.ring.u{stroke:var(--sev-urgent)}.ring.h{stroke:var(--sev-high)}
.eg .ln{fill:none;stroke:var(--edge)}
.eg.u .ln{stroke:var(--sev-urgent)}.eg.h .ln{stroke:var(--sev-high)}
.eg.dash .ln{stroke-dasharray:6 5}.eg.dust .ln{stroke:var(--t-dust);stroke-dasharray:1.5 4}
.eg .hit{fill:none;stroke:transparent;stroke-width:0}
.eg .lbg{fill:#fff;stroke:var(--line);stroke-width:.8}
.eg .lt{font-family:var(--font-mono);font-size:10.5px;fill:var(--muted)}
.eg.u .lt{fill:var(--sev-urgent)}.eg.h .lt{fill:var(--sev-high)}
.col-lb{font-size:11px;fill:var(--muted);letter-spacing:.08em}
.col-ln{stroke:var(--line);stroke-dasharray:2 6}
.ah{fill:var(--edge)}.ah-u{fill:var(--sev-urgent)}.ah-h{fill:var(--sev-high)}.ah-a{fill:var(--accent)}.ah-d{fill:var(--t-dust)}

@page{size:A4;margin:14mm 12mm 16mm}
@page diagram{size:A4 landscape;margin:10mm 10mm 14mm}
@media print{
  html,body{background:#fff}
  .printbar{display:none}
  .report{max-width:none;margin:0;padding:0;box-shadow:none}
  .sec-diagram{page:diagram;break-before:page;page-break-before:always;break-after:page;page-break-after:always}
  .sec-diagram h2{margin-top:0}
  .appx{break-before:page;page-break-before:always}
  .appx h2{margin-top:0}
  .diagram svg{max-height:136mm}
  a{color:var(--accent)}
}
`;

  // ======================================================================
  // 报告各节
  // ======================================================================
  const row = (th, td) => '<tr><th scope="row">' + th + '</th><td>' + td + '</td></tr>';
  const cmpTx = (a, b) => (a.t - b.t) || (a.i - b.i);
  /** 按区块（再按原始顺序）升序；t 不是数字的排最后 */
  function chrono(txs) {
    return txs.map((tx, i) => ({ tx, i, t: isNum(Number(tx.t)) && tx.t !== null && tx.t !== '' ? Number(tx.t) : Infinity })).sort(cmpTx).map(x => x.tx);
  }
  const blockOf = tx => (tx && tx.t !== null && tx.t !== '' && isNum(Number(tx.t)) ? Number(tx.t) : null);
  /** 到达时间文案：UTC+8 时间 + 区块 */
  function whenText(tx) {
    const b = blockOf(tx);
    const tm = tx && isNum(Number(tx.ts)) && tx.ts !== null && tx.ts !== '' ? formatCst(tx.ts) : '';
    return (tm ? t(tm) + '（UTC+8）' : '—（无时间戳）') + ' · 区块 ' + (b == null ? '—' : b);
  }
  const nodeLabel = n => (n ? String(n.label != null && n.label !== '' ? n.label : n.id) : '（未知节点）');

  function truncReason(meta) {
    if (typeof meta.truncated === 'string' && meta.truncated) return clip(meta.truncated, 400);
    if (Array.isArray(meta.truncatedReasons)) { const r = meta.truncatedReasons.filter(x => typeof x === 'string' && x).join('；'); if (r) return clip(r, 600); }
    for (const k of ['truncatedReason', 'truncated_reason', 'reason']) if (typeof meta[k] === 'string' && meta[k]) return clip(meta[k], 400);
    return '原因未说明';
  }

  function buildCards(c, nodeById) {
    const m = new Map();
    c.txs.forEach(tx => {
      const f = nodeById.get(tx.from), to = nodeById.get(tx.to);
      if (!f || !to) return;
      rulesOf(tx, f, to).forEach(rule => {
        const key = rule + '|' + tx.to;
        let k = m.get(key);
        if (!k) m.set(key, k = { rule, toId: tx.to, to, txs: [], senders: new Map() });
        k.txs.push(tx);
        k.senders.set(tx.from, f);
      });
    });
    const cards = Array.from(m.values());
    cards.forEach(k => { k.txs = chrono(k.txs); k.first = k.txs[0]; k.firstBlock = blockOf(k.first); });
    cards.sort((a, b) => (SEV[RULE[a.rule].sev].rank - SEV[RULE[b.rule].sev].rank)
      || ((a.firstBlock == null ? Infinity : a.firstBlock) - (b.firstBlock == null ? Infinity : b.firstBlock))
      || (a.toId < b.toId ? -1 : a.toId > b.toId ? 1 : 0));
    return cards;
  }

  /** 按接收方合并（同一个地址可能同时命中多条规则）：并集交易、不重复计金额，供摘要的「金额最大的前 3 个卡点」使用 */
  function topReceivers(cards, hints, limit) {
    const by = new Map();
    cards.forEach(k => {
      let g = by.get(k.toId);
      if (!g) by.set(k.toId, g = { to: k.to, toId: k.toId, rules: [], txs: new Set() });
      if (g.rules.indexOf(k.rule) < 0) g.rules.push(k.rule);
      k.txs.forEach(x => g.txs.add(x));
    });
    const list = Array.from(by.values()).map(g => {
      const txs = chrono(Array.from(g.txs)), res = sumAssets(txs);
      g.rules.sort((a, b) => SEV[RULE[a].sev].rank - SEV[RULE[b].sev].rank);
      return { to: g.to, rules: g.rules, txs, res, usd: usdRank(res.sums, hints), first: txs[0] };
    });
    list.sort((a, b) => (b.usd - a.usd) || ((blockOf(a.first) == null ? Infinity : blockOf(a.first)) - (blockOf(b.first) == null ? Infinity : blockOf(b.first))));
    return list.slice(0, limit);
  }

  function coverSection(x) {
    const { c, meta, info, genMs, rid, maxBlock, maxTs } = x;
    let h = '<section id="s1"><h2>1. 封面信息</h2><table class="kv"><tbody>';
    h += row('案件', t(c.title || c.id || '（未命名案件）') + (c.id ? ' <span class="muted mono">(' + t(c.id) + ')</span>' : ''));
    h += row('报告编号', '<span class="mono">' + t(rid) + '</span>');
    h += row('生成时间', t(formatCst(genMs / 1000)) + '（UTC+8）');
    let src, usedKey = null;
    if (x.isTraced) {
      const f = findFact(c, ['数据来源']);
      src = 'Etherscan API 自动追踪' + (f ? '（' + t(f.value) + '）' : '');
      if (f) usedKey = f.key;
    } else {
      const f = findFact(c, ['数据来源', '数据']);
      src = f ? t(f.value) : '案件数据未写明来源';
      if (f) usedKey = f.key;
    }
    h += row('数据来源', src);
    h += row('数据截止', (maxBlock == null ? '区块号：—' : '最大区块 ' + maxBlock) + '；' + (maxTs == null ? '最晚时间戳：—（案件数据无时间戳，以区块浏览器为准）' : '最晚时间戳 ' + t(formatCst(maxTs)) + '（UTC+8）'));
    if (meta.traced_at) { const ms = Date.parse(meta.traced_at); if (isFinite(ms)) h += row('数据抓取时间', t(formatCst(ms / 1000)) + '（UTC+8）'); }
    const ir = [];
    if (info.party) ir.push(row('报案人或单位', t(info.party)));
    if (info.contact) ir.push(row('联系方式', t(info.contact)));
    if (info.theftTx) ir.push(row('被盗交易哈希', RE_HASH.test(info.theftTx) ? hashHtml(info.theftTx) : t(info.theftTx) + ' <span class="muted small">（格式不是 0x 加 64 位十六进制，未生成链接）</span>'));
    if (info.story) ir.push(row('被盗经过', '<div class="story">' + t(info.story) + '</div>'));
    if (ir.length) h += ir.join('') + row('说明', '<span class="muted">以上 ' + ir.length + ' 项由报案人自行填写，溯流未核实。</span>');
    h += '</tbody></table>';
    const facts = (Array.isArray(c.facts) ? c.facts : []).filter(f => Array.isArray(f) && f.length >= 2 && String(f[0]) !== usedKey);   // 已经在「数据来源」里写过的那一条不再重复
    if (facts.length) {
      h += '<h3>案件说明（来自案件数据）</h3><table class="kv"><tbody>' + facts.map(f => row(t(clip(f[0], 60)), t(clip(f[1], 800)))).join('') + '</tbody></table>';
    }
    return h + '</section>';
  }
  function findFact(c, keys) {
    for (const k of keys) {
      const f = (Array.isArray(c.facts) ? c.facts : []).find(x => Array.isArray(x) && x.length >= 2 && String(x[0]) === k);
      if (f && String(f[1]).trim()) return { key: k, value: clip(f[1], 600) };
    }
    return null;
  }

  function summarySection(x) {
    const { c, meta, cards, nodes, nodeById, inferredNodes } = x;
    let h = '<section id="s2"><h2>2. 摘要</h2>';
    if (meta.truncated) h += '<div class="bx warn"><strong>结果被截断，本报告不完整：</strong>' + t(truncReason(meta)) + '。截断之后的资金去向没有被追踪，不能据此认为资金没有继续转移。</div>';
    if (inferredNodes.length) {
      h += '<div class="bx note"><strong>本报告含推断内容，见第 4 节与第 6 节。</strong>涉及节点：' + inferredNodes.slice(0, 12).map(n => t(nodeLabel(n))).join('、') + (inferredNodes.length > 12 ? ' 等 ' + inferredNodes.length + ' 个' : '') + '。推断不等于定性，需人工复核。</div>';
    }
    h += '<table class="kv"><tbody>';
    // 起点：追踪案件用 meta.start（并另列受害方钱包）；内置案件有受害方钱包就写受害方钱包（可多个），聚焦节点不当起点；都没有才退回聚焦节点
    const victims = nodes.filter(n => n.type === 'victim' && n.addr && RE_ADDR.test(n.addr));
    const victimsHtml = victims.slice(0, 6).map(n => t(nodeLabel(n)) + '<br>' + addrHtml(n.addr)).join('<br>') + (victims.length > 6 ? '<br><span class="muted">等 ' + victims.length + ' 个</span>' : '');
    const metaStart = typeof meta.start === 'string' && RE_ADDR.test(meta.start) ? meta.start : '';
    if (metaStart) {
      h += row('起点地址', addrHtml(metaStart));
      if (victims.length) h += row('受害方钱包', victimsHtml);
    } else if (victims.length) {
      h += row('起点地址', '<span class="muted small">受害方钱包：</span><br>' + victimsHtml);
    } else {
      const f = nodeById.get(c.focus);
      h += row('起点地址', f && f.addr ? addrHtml(f.addr) + '（案件聚焦节点：' + t(nodeLabel(f)) + '）' : '<span class="muted">—</span>');
    }
    if (x.isTraced && isObj(meta.params)) {
      const p = meta.params, endB = isNum(p.endBlock) && p.endBlock < 99999999 ? String(p.endBlock) : '最新（未限定）';
      h += row('追踪范围', '起始区块 ' + (isNum(p.startBlock) ? p.startBlock : '—') + '；结束区块 ' + t(endB) + '；最多 ' + (isNum(p.maxHops) ? p.maxHops : '—') + ' 跳；每个节点最多展开前 ' + (isNum(p.topK) ? p.topK : '—') + ' 个对手方（按金额排序）');
    } else h += row('追踪范围', '人工巡查（非自动追踪；范围以案件数据为准）');
    const dustTx = c.txs.filter(tx => { const f = nodeById.get(tx.from); return f && f.type === 'dust'; }).length;
    h += row('规模', '地址 ' + nodes.length + ' 个；转账 ' + c.txs.length + ' 笔' + (dustTx ? '（其中投毒 / 仿冒地址的 ' + dustTx + ' 笔）' : ''));
    const cnt = {};
    cards.forEach(k => { cnt[k.rule] = (cnt[k.rule] || 0) + 1; });
    h += row('卡点数量', cards.length ? '共 ' + cards.length + ' 处：' + RULES.map(r => t(r.name) + ' ' + (cnt[r.id] || 0)).join(' · ') : '未识别到卡点（交易所、可冻结稳定币、可拦截通道、跨链 / 兑换、混币器）。未命中不等于资金安全，也不等于没有可冻结点');
    const top = topReceivers(cards, meta.params && meta.params.priceHints, 3);
    if (top.length) {
      h += row('金额最大的前 3 个卡点', '<ol class="small" style="margin:0;padding-left:4.5mm">' + top.map(g =>
        '<li><strong>' + t(nodeLabel(g.to)) + '</strong> · ' + g.rules.map(r => t(RULE[r].name)).join('、') + '<br>' + addrHtml(g.to.addr) + '<br>金额合计：' + sumsText(g.res) + '<br>首次到达：' + whenText(g.first) + '</li>').join('') +
        '</ol><div class="muted small">排序仅按金额折算（稳定币 1:1，ETH 等按追踪时的参考价）；折算只用于排序，不是成交价。</div>');
    }
    if (x.pendingNodes.length) {
      h += row('待核实事项', '<ul class="small" style="margin:0;padding-left:4.5mm">' + x.pendingNodes.slice(0, 8).map(n => '<li><strong>' + t(nodeLabel(n)) + '</strong>' + (n.addr ? '（' + t(shortAddr(n.addr)) + '）' : '') + '：' + t(n.note) + '</li>').join('') + (x.pendingNodes.length > 8 ? '<li>另有 ' + (x.pendingNodes.length - 8) + ' 个节点的说明里有待核实事项，见第 6 节。</li>' : '') + '</ul><div class="muted small">以上是案件数据里写明尚未核实的事项，核实前不要当作定论。涉及这些节点的卡点仍按链上记录标「链上事实」，并在卡点里提示见本行。</div>');
    }
    return h + '</tbody></table></section>';
  }

  function legendHtml(nodes) {
    const types = [];
    nodes.forEach(n => { if (own(TYPE_NAMES, n.type) && types.indexOf(n.type) < 0) types.push(n.type); });
    return types.map(ty => '<span class="t-' + ty + '"><i></i>' + t(TYPE_NAMES[ty]) + '</span>').join('');
  }
  function diagramSection(x) {
    let h = '<section id="s3" class="sec-diagram"><h2>3. 资金去向图</h2>';
    if (x.svg) {
      h += '<div class="legend">' + legendHtml(x.nodes) + '</div><div class="diagram">' + x.svg + '</div>';
      h += '<p class="cap">图注：由溯流根据公开链上数据生成；虚线表示推断或未核实</p><p class="cap">红框为紧急卡点，橙框为高级别卡点；边上的文字是该方向的金额合计（显示值），具体交易见第 5 节。</p>';
    } else h += '<p class="muted">本报告未附去向图（命令行或离线生成时不含画布图）。资金去向见第 5 节交易明细与第 4 节卡点清单。</p>';
    return h + '</section>';
  }

  function cardsSection(x) {
    const { c, cards, oc } = x;
    let h = '<section id="s4"><h2>4. 卡点清单</h2>';
    h += '<p class="small">卡点＝资金到达了可能被冻结、拦截或需要重点报告的对手方（交易所、可冻结稳定币、可拦截通道、跨链 / 兑换、混币器）。「链上事实」指转账记录本身可在区块浏览器逐笔核对；「推断」指对地址身份或资金归属的判断，需人工复核。金额合计是转账明细里显示值（已四舍五入）按资产分别求和的结果。</p>';
    if (c.channels) h += '<p class="small"><strong>报告渠道（来自案件数据）：</strong>' + t(clip(c.channels, 500)) + '</p>';
    if (!cards.length) return h + '<p>未识别到卡点。这只说明自动规则没有命中，不代表资金安全或没有可冻结点；请结合第 5、6 节人工复核。</p></section>';
    cards.forEach((k, idx) => {
      const rule = RULE[k.rule], sev = SEV[rule.sev], to = k.to;
      const senders = Array.from(k.senders.values());
      const inf = [to].concat(senders).filter(isInferred);
      const uniqInf = inf.filter((n, i) => inf.indexOf(n) === i);
      const pend = [to].concat(senders).filter(isPending).filter((n, i, a) => a.indexOf(n) === i);
      const res = sumAssets(k.txs);
      let basis = '<div>接收方「' + t(nodeLabel(to)) + '」：' + (to.note ? t(to.note) : '<span class="muted">（节点无说明）</span>') + '</div>';
      const infSenders = senders.filter(isInferred);
      infSenders.slice(0, 3).forEach(s => { basis += '<div>来源方「' + t(nodeLabel(s)) + '」' + (s.addr ? '<span class="mono small muted">' + t(shortAddr(s.addr)) + '</span>' : '') + '（推断）：' + (s.note ? t(s.note) : '<span class="muted">（节点无说明）</span>') + '</div>'; });
      if (infSenders.length > 3) basis += '<div class="muted small">另有 ' + (infSenders.length - 3) + ' 个推断的来源方，依据见第 6 节地址清单。</div>';
      const ot = officialText(oc, to.addr);
      h += '<div class="card"><h3>卡点 ' + (idx + 1) + ' · ' + t(rule.name) + '<span class="pill sev-' + rule.sev + '">' + t(sev.name) + '</span></h3><table class="kv"><tbody>';
      h += row('类型', '<strong>' + t(rule.name) + '</strong>（严重程度：' + t(sev.name) + '）');
      h += row('地址', addrHtml(to.addr));
      h += row('标签', t(nodeLabel(to)) + ' · 接收方类型：' + t(own(TYPE_NAMES, to.type) ? TYPE_NAMES[to.type] : to.type) + (to.excluded ? '（已核查，非攻击者）' : ''));
      h += row('来自', senders.map(s => t(nodeLabel(s)) + (s.addr ? '<br>' + addrHtml(s.addr) : '')).join('<br>') || '—');
      h += row('首次到达', whenText(k.first));
      h += row('金额合计', sumsText(res) + '<div class="muted small">共 ' + k.txs.length + ' 笔，按资产分别求和</div>');
      h += row('涉及交易（' + k.txs.length + ' 笔）', k.txs.map(tx => '<div class="txl"><span class="m">区块 ' + (blockOf(tx) == null ? '—' : blockOf(tx)) + (isNum(Number(tx.ts)) && tx.ts !== null && tx.ts !== '' ? ' · ' + t(formatCst(tx.ts)) + '（UTC+8）' : '') + ' · ' + t(tx.amt == null || tx.amt === '' ? (tx.approx ? '金额未核对' : '金额未抓取') : tx.amt) + '</span>' + hashHtml(tx.hash) + '</div>').join(''));
      if (ot) basis += '<div>官方名单（静态快照 ' + t(oc.label) + '）：' + t(ot.text) + '</div>';
      h += row('判定依据', basis);
      h += row('事实 / 推断', (uniqInf.length
        ? '<span class="tag infer">推断</span> 涉及推断出来的节点：' + uniqInf.slice(0, 6).map(n => t(nodeLabel(n)) + (n.addr ? '（' + t(shortAddr(n.addr)) + '）' : '')).join('、') + (uniqInf.length > 6 ? ' 等 ' + uniqInf.length + ' 个' : '') + '。转账记录本身是链上事实，但据此得出的去向结论需人工复核。'
        : '<span class="tag fact">链上事实</span> 转账记录来自链上数据，可按上方哈希逐笔核对；接收方身份依据见「判定依据」。') + (pend.length ? '<div class="muted small">涉及的节点「' + pend.slice(0, 4).map(n => t(nodeLabel(n))).join('」「') + '」有待核实事项，见第 2 节摘要的「待核实事项」。</div>' : ''));
      h += row('建议动作', '<p>' + t(HEADLINE[k.rule]) + '</p><p style="margin:0">' + t(ACTION[k.rule]) + '</p>');
      h += '</tbody></table></div>';
    });
    return h + '</section>';
  }

  function txSection(x) {
    const { c, nodeById } = x;
    const sorted = chrono(c.txs), noTs = sorted.some(tx => !(tx.ts !== null && tx.ts !== '' && isNum(Number(tx.ts))));
    const ncell = id => { const n = nodeById.get(id); return n ? t(nodeLabel(n)) + '<br><span class="mono small muted">' + t(shortAddr(n.addr || '')) + '</span>' : '<span class="muted">（未知节点）</span>'; };
    let h = '<section id="s5"><h2>5. 交易明细</h2><p class="small">按区块、时间升序。共 ' + sorted.length + ' 笔。哈希可在 Etherscan 逐笔核对。</p>';
    h += '<table class="tx"><colgroup><col style="width:9mm"><col style="width:27mm"><col style="width:17mm"><col style="width:25mm"><col style="width:25mm"><col style="width:26mm"><col></colgroup><thead><tr><th class="n">序号</th><th>时间（UTC+8）' + (noTs ? '<br><span class="muted small">' + (x.isTraced ? '部分记录无时间戳，以区块浏览器为准' : '内置案件无时间戳，以区块浏览器为准') + '</span>' : '') + '</th><th class="n">区块</th><th>从</th><th>到</th><th>金额与资产</th><th>交易哈希</th></tr></thead><tbody>';
    sorted.forEach((tx, i) => {
      const f = nodeById.get(tx.from), dust = f && f.type === 'dust';
      const hasTs = tx.ts !== null && tx.ts !== '' && isNum(Number(tx.ts));
      let amt = tx.amt == null || tx.amt === '' ? (tx.approx ? '金额未核对' : '金额未抓取') : String(tx.amt);
      let extra = '';
      if (Array.isArray(tx.flags) && tx.flags.indexOf('freeze') >= 0) extra += '<div class="small muted">可冻结资产</div>';
      if (dust) extra += '<div class="small muted">投毒 / 仿冒地址发出，不计入资金去向</div>';
      if (tx.note) extra += '<div class="small muted">' + t(clip(tx.note, 600)) + '</div>';
      h += '<tr' + (dust ? ' class="dust"' : '') + '><td class="n">' + (i + 1) + '</td><td class="mono small">' + (hasTs ? t(formatCst(tx.ts)) : '—') + '</td><td class="mono small n">' + (blockOf(tx) == null ? '—' : blockOf(tx)) + '</td><td>' + ncell(tx.from) + '</td><td>' + ncell(tx.to) + '</td><td>' + t(amt) + extra + '</td><td>' + hashHtml(tx.hash) + '</td></tr>';
    });
    return h + '</tbody></table></section>';
  }

  function nodesSection(x) {
    const { nodes, oc, c } = x;
    const filled = new Set(Array.isArray(c.offFilled) ? c.offFilled.filter(i => typeof i === 'string') : []);
    let h = '<section id="s6"><h2>6. 地址清单</h2><p class="small">共 ' + nodes.length + ' 个地址。类型与「依据」是追踪时的判断；带「推断 / 待核实」标记的需人工复核。</p>';
    if (x.officialRequested && !(oc && oc.ok)) h += '<p class="small muted">官方名单核对未执行（缺少 lib/official-data.js 或名单数据）。</p>';
    h += '<table class="fixed"><colgroup><col style="width:52mm"><col style="width:15mm"><col style="width:25mm"><col>' + (oc && oc.ok ? '<col style="width:36mm">' : '') + '</colgroup><thead><tr><th>完整地址</th><th>类型</th><th>标签</th><th>依据</th>' + (oc && oc.ok ? '<th>Bitget 官方名单状态（静态快照 ' + t(oc.label) + '）</th>' : '') + '</tr></thead><tbody>';
    nodes.forEach(n => {
      const inf = isInferred(n);
      let ocell = '';
      if (oc && oc.ok) {
        const ot = officialText(oc, n.addr);
        ocell = '<td>' + (ot ? t(ot.text) : '—') + (n.id && filled.has(n.id) ? '<div class="small muted">该地址由官方名单反推补全，命中官方名单不算独立印证。</div>' : '') + '</td>';
      }
      h += '<tr' + (n.type === 'dust' ? ' class="dust"' : '') + '><td>' + addrHtml(n.addr) + '</td><td>' + t(own(TYPE_NAMES, n.type) ? TYPE_NAMES[n.type] : String(n.type)) + (n.excluded ? '<div class="small muted">已核查，非攻击者</div>' : '') + '</td><td>' + t(nodeLabel(n)) + '</td><td>' + (n.note ? t(n.note) : '<span class="muted">—</span>') + (inf ? '<div><span class="tag infer">推断</span></div>' : '') + (isPending(n) ? '<div><span class="tag infer">待核实</span></div>' : '') + '</td>' + ocell + '</tr>';
    });
    return h + '</tbody></table></section>';
  }

  function methodSection(x) {
    const { meta, isTraced } = x;
    const p = isObj(meta.params) ? meta.params : null;
    let h = '<section id="s7"><h2>7. 方法与局限</h2><ul>';
    if (isTraced) h += '<li><strong>数据来源：</strong>Etherscan API V2（以太坊主网）的 txlist、tokentx、txlistinternal、eth_getCode、getsourcecode；不抓取区块浏览器网页，不使用网页标签。' + (meta.traced_at && isFinite(Date.parse(meta.traced_at)) ? '抓取时间 ' + t(formatCst(Date.parse(meta.traced_at) / 1000)) + '（UTC+8）。' : '') + '官方名单为 Bitget 官方接口的静态快照。</li>';
    else h += '<li><strong>数据来源：</strong>人工巡查与 Etherscan API 补查（具体见第 1 节案件说明）；官方名单为 Bitget 官方接口的静态快照。</li>';
    let thr = '';
    if (p && isObj(p.minValue)) thr = '（阈值：' + Object.keys(p.minValue).filter(k => isNum(Number(p.minValue[k]))).map(k => t(k) + ' ' + fmtNum(Number(p.minValue[k]))).join('、') + '）';
    h += '<li><strong>过滤规则：</strong>代币真假只按合约地址判断（白名单：USDT、USDC、DAI、WETH、WBTC、stETH + 原生 ETH；符号与发送方都可以伪造，同名 / 仿冒符号的代币一律不算）；金额为 0 或低于阈值的转账忽略' + thr + '；与图中已有地址首 4 位、末 4 位相同但不是同一地址的对手方视为投毒地址，只计数不展开；合约、协议金库、交易所视为终点，不继续展开。</li>';
    if (isObj(meta.ignored)) {
      const g = k => (isNum(Number(meta.ignored[k])) ? Number(meta.ignored[k]) : 0);
      h += '<li><strong>被忽略的记录：</strong>假代币转账 ' + g('fakeToken') + ' 笔；0 值 ' + g('zeroValue') + ' 笔；低于阈值 ' + g('dust') + ' 笔；疑似投毒 ' + g('poison') + ' 笔；排在前 K 个之外未展开的对手方 ' + g('belowTopK') + ' 个。</li>';
    }
    h += '<li><strong>只追转出：</strong>本报告只追踪资金的「转出」方向，转入记录与退款（例如协议把资金退回）没有纳入，可能影响结论。</li>';
    h += '<li><strong>金额口径：</strong>金额取自转账明细的显示值（已四舍五入），合计为显示值之和；美元折算只用于给卡点排序，不是成交价。</li>';
    h += '<li><strong>推断不等于定性：</strong>带「推断 / 待核实」标记的结论只是依据公开数据的判断，没有执法机关的确认；未命中官方名单不等于资金干净。</li>';
    h += '<li><strong>自动结果需人工复核：</strong>自动追踪可能漏判或误判；提交任何材料前请逐位核对地址与哈希，警惕首尾相同的仿冒地址。</li>';
    h += '</ul>';
    const warns = Array.isArray(meta.warnings) ? meta.warnings.filter(w => typeof w === 'string' && w) : [];
    if (warns.length) h += '<h3>追踪时的警告</h3><ul class="small">' + warns.slice(0, 40).map(w => '<li>' + t(clip(w, 500)) + '</li>').join('') + '</ul>';
    const stops = Array.isArray(meta.stoppedAt) ? meta.stoppedAt.filter(s => isObj(s) && typeof s.addr === 'string') : [];
    if (stops.length) {
      h += '<h3>追踪停止点与下一步</h3><table><thead><tr><th>地址</th><th>停止原因 / 下一步</th></tr></thead><tbody>' + stops.slice(0, 100).map(s => '<tr><td>' + addrHtml(s.addr) + '</td><td>' + t(clip(s.reason, 800)) + '</td></tr>').join('') + '</tbody></table>';
    }
    if (isTraced && isNum(Number(meta.calls))) h += '<p class="small muted">API 调用 ' + Number(meta.calls) + ' / ' + (isNum(Number(meta.maxCalls)) ? Number(meta.maxCalls) : '—') + ' 次。</p>';
    return h + '</section>';
  }

  function disclaimerSection(x) {
    const { c } = x;
    let h = '<section id="s8"><h2>8. 免责声明</h2><ul>';
    h += '<li>本报告仅基于公开链上数据整理，不构成法律意见。</li>';
    h += '<li>不承诺追回：冻结、拦截、退款均由有权机关或相关机构依法决定，溯流不保证任何结果。</li>';
    h += '<li>归因以执法机关结论为准；分析机构或受害方的判断只是判断，不等于定性。</li>';
    h += '<li>报案以当地公安机关的要求为准；材料格式与受理方式请向办案机关确认。</li>';
    h += '<li>溯流不经手资金、不替用户联系任何机构、不代提交举报；请勿联系或付费给洗钱方，也不要向任何声称「先交钱帮你追回」的人付款。</li>';
    h += '</ul>';
    if (c.channels) h += '<p class="small"><strong>正式报告渠道（来自案件数据，仅作文字提示）：</strong>' + t(clip(c.channels, 500)) + '</p>';
    return h + '</section>';
  }

  function appendixSection(x) {
    const g = x.guide;
    if (!g || !Array.isArray(g.sections) || !g.sections.length) return '';
    const secs = g.sections.filter(s => isObj(s) && typeof s.title === 'string');
    if (!secs.length) return '';
    const ver = typeof g.version === 'string' && g.version ? '<p class="cap">报案指引版本 ' + t(clip(g.version, 40)) + '</p>' : '';
    const note = typeof g.note === 'string' && g.note.trim() ? '<p class="small"><em>' + t(clip(g.note.trim(), 400)) + '</em></p>' : '';
    return '<section id="s9" class="appx"><h2>9. 附录：报案指引</h2>' + ver + secs.map(s => '<h3>' + t(clip(s.title, 120)) + '</h3><div class="bx">' + sanitizeFragment(s.html == null ? '' : String(s.html)) + '</div>').join('') + note + '</section>';
  }

  // ======================================================================
  // 品牌位（lib/brand.js）：名字、联系方式。联系方式为空时什么都不显示
  // ======================================================================
  const RE_SITE = /^https:\/\/[^\s"'<>\\]+$/;
  function cleanBrand(b) {
    b = isObj(b) ? b : {};
    const s = (v, n) => (typeof v === 'string' ? clip(v.trim(), n) : '');
    return { name: s(b.name, 60) || '溯流', tagline: s(b.tagline, 100), serviceNote: s(b.serviceNote, 300), contact: s(b.contact, 300), site: s(b.site, 300) };
  }
  /** contact / site 都为空返回 ''；否则一行「需要人工协助……」加固定说明。所有字段转义；site 只有 https:// 开头才做成链接 */
  function brandLineHtml(b) {
    const parts = [];
    if (b.contact) parts.push(t(b.contact));
    if (b.site) parts.push(RE_SITE.test(b.site) ? '<a href="' + esc(b.site) + '"' + LINK_ATTR + '>' + t(b.site) + '</a>' : t(b.site));
    if (!parts.length) return '';
    return '<p class="foot brandline">需要人工协助（企业应急、报告人工复核）：' + parts.join(' ') + '<br>溯流不向受害者收取「追回费」，不承诺追回。</p>';
  }

  // ======================================================================
  // 总装
  // ======================================================================
  function cleanInfo(i) {
    i = isObj(i) ? i : {};
    const s = (v, n) => (typeof v === 'string' ? clip(v.trim(), n) : '');
    return { party: s(i.party, 300), contact: s(i.contact, 300), story: s(i.story, 4000), theftTx: s(i.theftTx, 200) };
  }

  /**
   * 生成报告 HTML。必填：case（含 nodes[] / txs[]）、generatedAt（ISO 字符串，由调用方传入，保证同样输入同样输出）。
   * 可选：meta（trace() 返回的 meta）、official（buildIndex 的结果或快照对象）、officialLabel、svg（页面画布生成的 SVG 字符串）、
   *       info {party, contact, story, theftTx}、guide {version?, sections:[{title, html}], note?}（缺省时取 window.SuliuGuide；没有就不出附录）、
 *       brand {name, contact, site}（缺省时取 window.SuliuBrand；没有就用默认名、不显示联系方式）、officialLib（测试用）。
   */
  function build(o) {
    o = o || {};
    const c = o.case;
    if (!isObj(c) || !Array.isArray(c.nodes) || !Array.isArray(c.txs)) throw new TypeError('build: 需要 case（含 nodes[] 与 txs[]）');
    const genMs = typeof o.generatedAt === 'string' ? Date.parse(o.generatedAt) : NaN;
    if (!isFinite(genMs)) throw new TypeError('build: generatedAt 必须是 ISO 时间字符串（由调用方传入）');
    const meta = isObj(o.meta) ? o.meta : {};
    const info = cleanInfo(o.info);
    const nodes = c.nodes.filter(isObj);
    const nodeById = new Map();
    nodes.forEach(n => { if (n.id != null) nodeById.set(n.id, n); });
    const txs = c.txs.filter(isObj);
    const cc = Object.assign({}, c, { nodes, txs });
    const isTraced = !!meta.params || c.tabK === '自动追踪' || /^trace-/.test(String(c.id == null ? '' : c.id));
    const rid = reportId(c.id, o.generatedAt);
    let maxBlock = null, maxTs = null;
    txs.forEach(tx => {
      const b = blockOf(tx); if (b != null && (maxBlock == null || b > maxBlock)) maxBlock = b;
      if (tx.ts !== null && tx.ts !== '' && isNum(Number(tx.ts)) && (maxTs == null || Number(tx.ts) > maxTs)) maxTs = Number(tx.ts);
    });
    const cards = buildCards(cc, nodeById);
    const oc = officialCtx(o);
    const guide = o.guide || (root && root.SuliuGuide) || null;
    const brand = cleanBrand(o.brand || (root && root.SuliuBrand) || null);
    const x = {
      c: cc, meta, info, nodes, nodeById, genMs, rid, isTraced, maxBlock, maxTs, cards, oc, officialRequested: !!o.official, guide,
      inferredNodes: nodes.filter(isInferred),
      pendingNodes: nodes.filter(isPending),
      svg: sanitizeSvg(o.svg)
    };
    const title = '链上资金去向证据报告 · ' + (c.title || c.id || '');
    return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">' +
      '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">' +
      '<title>' + t(title) + '</title><style>' + CSS + '@page{@bottom-left{content:"溯流 · 报告编号 ' + rid + '";font-size:7.5pt;color:#55605c}@bottom-right{content:"第 " counter(page) " / " counter(pages) " 页";font-size:7.5pt;color:#55605c}}</style></head><body>' +
      '<div class="printbar">按 Ctrl+P（Mac 为 ⌘P）可打印或另存为 PDF</div><main class="report">' +
      '<header class="top"><p class="brand">溯流 · SULIU</p><h1>链上资金去向证据报告</h1><p class="case-title">' + t(c.title || c.id || '') + '</p></header>' +
      coverSection(x) + summarySection(x) + diagramSection(x) + cardsSection(x) + txSection(x) + nodesSection(x) + methodSection(x) + disclaimerSection(x) + appendixSection(x) +
      '<p class="foot">报告编号 ' + t(rid) + ' · 由' + t(brand.name) + '（Suliu）v' + VERSION.split('.').slice(0, 2).join('.') + ' 根据公开链上数据生成 · 仅供报案与向交易所 / 协议方说明情况使用，自动结果需人工复核。</p>' + brandLineHtml(brand) + '</main></body></html>\n';
  }

  return {
    VERSION, RULES, SEV, TYPE_NAMES, HEADLINE, ACTION,
    rulesOf, isInferred, isPending, build,
    formatCst, reportId, sanitizeSvg, sanitizeFragment, esc, parseAmt, sumAssets, fmtNum
  };
});
