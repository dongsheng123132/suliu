/* 溯流 · 多链可打印报告（UMD）：浏览器挂 window.SuliuReportMulti，Node 下 module.exports；零依赖、无 ESM 语法。
 *
 * 这是 v0.3 之后新增的「非以太坊 / 跨链」报告生成器。**不改动 lib/report.js**，避免以太坊报告回归。
 * 支持三种输入：
 *   kind:'utxo'   BTC 交易级追踪（lib/btc.mjs 的 trace 结果）
 *   kind:'bridge' 跨链解析结果（lib/bridge.mjs 的 resolveAcross 结果）
 *   kind:'trace'  通用 EVM 追踪（lib/trace-eth.js 的 trace 结果；用于 BSC 等非以太坊 EVM 链）
 * 契约：
 *   - 没有任何 <script> / on* 事件 / 外部资源（CSP meta 兜底）；
 *   - 所有外部字符串过 esc()；
 *   - 链接只拼校验过格式的地址 / 交易哈希，且按链取对应浏览器（lib/chains.js）；
 *   - 时间固定 UTC+8；BTC 金额同时给整数 satoshi 与 BTC 小数（只做展示换算，不改变记账单位）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let chains = null;
    try { chains = require('./chains.js'); } catch (e) { chains = null; }
    module.exports = factory(root, chains);
  } else root.SuliuReportMulti = factory(root, root && root.SuliuChains ? root.SuliuChains : null);
})(typeof self !== 'undefined' ? self : this, function (root, nodeChains) {
  'use strict';

  const Chains = nodeChains || (root && root.SuliuChains) || null;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const pad = n => String(n).padStart(2, '0');
  const RE_EVM_ADDR = /^0x[0-9a-fA-F]{40}$/, RE_EVM_TX = /^0x[0-9a-fA-F]{64}$/;
  const RE_BTC_TX = /^[0-9a-fA-F]{64}$/;

  function formatCst(sec) {
    if (sec == null || sec === '') return '';
    const n = Number(sec);
    if (!isFinite(n)) return '';
    const d = new Date(n * 1000 + 8 * 3600 * 1000);
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }
  function fmtInt(n) {
    if (!isNum(Number(n))) return '—';
    return String(Math.trunc(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function satsToBtc(sats) {
    if (!isNum(Number(sats))) return '';
    return (Number(sats) / 1e8).toFixed(8);
  }
  // 整数最小单位字符串 → 带千分位（纯字符串，避免大额精度丢失）
  function fmtMinUnits(s) {
    const str = String(s == null ? '' : s).trim();
    if (!/^\d+$/.test(str)) return '—';
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const reportId = (caseId, gen) => 'SL-M' + cyrb53(String(caseId == null ? '' : caseId) + '|' + String(gen == null ? '' : gen)).toString(16).toUpperCase().padStart(12, '0').slice(0, 10);

  const LINK_ATTR = ' target="_blank" rel="noopener noreferrer"';
  function linkByChain(ref, kind, value, label) {
    let href = null;
    if (Chains && typeof Chains.explorerUrl === 'function') href = Chains.explorerUrl(ref, kind, value);
    if (!href && Chains && typeof Chains.linkByChainId === 'function') href = Chains.linkByChainId(ref, kind, value);
    if (!href) return '<span class="mono">' + esc(label || value || '—') + '</span>';
    return '<a class="mono" href="' + esc(href) + '"' + LINK_ATTR + '>' + esc(label || value) + '</a>';
  }
  function txLink(ref, value) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return '<span class="muted">—</span>';
    return linkByChain(ref, 'tx', v, v);
  }
  function addrLink(ref, value) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return '<span class="muted">—</span>';
    return linkByChain(ref, 'address', v, v);
  }

  const CSS = `
:root{color-scheme:light;--ink:#16201d;--muted:#55605c;--line:#c9d1ce;--soft:#f3f5f4;--accent:#1f4fb8;--danger:#b3261e;--warn:#9a5a00;--ok:#1f7a4a}
*{box-sizing:border-box}
body{margin:0;background:#e6e9e8;color:var(--ink);font:10.5pt/1.55 "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent);text-decoration:none;overflow-wrap:anywhere}
.mono{font-family:ui-monospace,Menlo,Consolas,"Liberation Mono","Courier New",monospace}
.muted{color:var(--muted)}
.report{max-width:210mm;margin:12px auto 24px;background:#fff;padding:14mm 14mm 16mm;box-shadow:0 1px 8px rgba(0,0,0,.18)}
.printbar{max-width:210mm;margin:12px auto 0;padding:9px 14px;background:#fff6d1;border:1px solid #d9b94a;border-radius:6px;font-size:10.5pt}
.top{border-bottom:2.5px solid var(--ink);padding-bottom:4mm;margin-bottom:3mm}
.brand{margin:0;font-size:10pt;letter-spacing:.2em;color:var(--muted)}
h1{margin:2mm 0 1mm;font-size:20pt;line-height:1.25}
h2{margin:8mm 0 3mm;padding-bottom:1.5mm;border-bottom:1.5px solid var(--ink);font-size:13pt;break-after:avoid}
h3{margin:5mm 0 2mm;font-size:11pt;break-after:avoid}
table{width:100%;border-collapse:collapse;font-size:8.6pt;margin:0 0 4mm}
th,td{border:.5pt solid var(--line);padding:.9mm 1.6mm;vertical-align:top;text-align:left;overflow-wrap:anywhere}
th{background:var(--soft);font-weight:600}
table.kv th{width:32mm;white-space:nowrap}
.bx{border:1px solid var(--line);border-radius:1.5mm;padding:2.5mm 3.5mm;margin:0 0 3.5mm}
.bx.warn{border:2px solid var(--danger);background:#fdecea}
.bx.warn strong{color:var(--danger)}
.bx.note{border-color:#d9b94a;background:#fffbea}
.tag{display:inline-block;padding:0 1.6mm;border:.7pt solid currentColor;border-radius:2mm;font-size:8.4pt;font-weight:600}
.tag.fact{color:var(--ok)}.tag.infer{color:var(--warn)}.tag.bad{color:var(--danger)}
pre{white-space:pre-wrap;word-break:break-all;font-size:7.6pt;background:var(--soft);border:1px solid var(--line);border-radius:1.5mm;padding:2mm;max-height:120mm;overflow:auto}
.small{font-size:8.4pt}
.foot{margin-top:8mm;padding-top:2mm;border-top:1px solid var(--line);font-size:8.4pt;color:var(--muted)}
.blank{display:inline-block;min-width:32mm;border-bottom:.6pt solid var(--ink);color:transparent}
@page{size:A4;margin:14mm 12mm 16mm}
@media print{html,body{background:#fff}.printbar{display:none}.report{max-width:none;margin:0;padding:0;box-shadow:none}h2{break-after:avoid}tr{break-inside:avoid}}
`;

  const row = (th, td) => '<tr><th scope="row">' + th + '</th><td>' + td + '</td></tr>';
  const page = (title, rid, body) => '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">' +
    '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">' +
    '<title>' + esc(title) + '</title><style>' + CSS + '@page{@bottom-left{content:"溯流 · 多链报告 ' + esc(rid) + '";font-size:7.5pt;color:#55605c}@bottom-right{content:"第 " counter(page) " / " counter(pages) " 页";font-size:7.5pt;color:#55605c}}</style></head><body>' +
    '<div class="printbar">按 Ctrl+P（Mac 为 ⌘P）可打印或另存为 PDF</div>' +
    '<main class="report">' + body + '</main></body></html>\n';

  const header = (title, subtitle, chainName) => '<header class="top"><p class="brand">溯流 · SULIU' + (chainName ? ' · ' + esc(chainName) : '') + '</p><h1>' + esc(title) + '</h1><p class="muted">' + esc(subtitle) + '</p></header>';

  // ======================================================================
  // BTC（UTXO 交易级）
  // ======================================================================
  function buildBtc(o) {
    const c = o.case || {};
    const meta = isObj(o.meta) ? o.meta : {};
    const genMs = Date.parse(o.generatedAt || '');
    const rid = reportId(c.id, o.generatedAt);
    const nodes = Array.isArray(c.nodes) ? c.nodes.filter(isObj) : [];
    const txs = Array.isArray(c.txs) ? c.txs.filter(isObj) : [];
    const addrById = new Map(nodes.map(n => [n.addr, n]));
    const confirmed = txs.filter(t => t.confirmed).length;
    const unconfirmed = txs.length - confirmed;
    const maxBlock = txs.reduce((m, t) => (isNum(Number(t.block)) && (m == null || Number(t.block) > m) ? Number(t.block) : m), null);
    const maxTs = txs.reduce((m, t) => (isNum(Number(t.ts)) && (m == null || Number(t.ts) > m) ? Number(t.ts) : m), null);
    const chainName = 'Bitcoin';
    let b = header('BTC 地址追踪证据报告', c.title || c.id || '', chainName);
    if (meta.demo) b += '<div class="bx warn"><strong>演示数据（夹具回放）：</strong>' + esc(meta.demo_note || '合成的演示数据，不是真实案件') + '</div>';

    // 1 封面
    b += '<section><h2>1. 封面信息</h2><table class="kv"><tbody>';
    b += row('案件', esc(c.title || c.id || '（未命名）') + (c.id ? ' <span class="muted mono">(' + esc(c.id) + ')</span>' : ''));
    b += row('报告编号', '<span class="mono">' + esc(rid) + '</span>');
    b += row('生成时间', esc(formatCst(genMs / 1000)) + '（UTC+8）');
    b += row('链', esc(chainName) + '（UTXO，金额单位：整数 satoshi）');
    b += row('数据来源', esc((c.facts || []).find(f => Array.isArray(f) && f[0] === '数据来源') ? (c.facts.find(f => f[0] === '数据来源')[1]) : 'Esplora 公开 API'));
    b += row('数据截止', '最大区块 ' + (maxBlock == null ? '—' : maxBlock) + '；最晚交易时间 ' + (maxTs == null ? '—' : esc(formatCst(maxTs)) + '（UTC+8）') + '；链头高度 ' + (meta.tip_height == null ? '—' : meta.tip_height));
    if (meta.address_type) b += row('地址类型', esc(meta.address_type));
    b += '</tbody></table></section>';

    // 2 摘要
    b += '<section><h2>2. 摘要</h2>';
    if (meta.truncated) b += '<div class="bx warn"><strong>结果被截断，本报告不完整：</strong>' + esc((meta.truncatedReasons || []).join('；') || '原因未说明') + '</div>';
    b += '<div class="bx note"><strong>重要限制：</strong>本报告只做<b>交易级</b>输入 / 输出与确认状态，<b>不声称某个输入支付了某个输出</b>，<b>不推断找零归属</b>，<b>不把输入金额累加成被盗总额</b>。多输入多输出交易不构成资金归属证明，提交举报前请人工复核。</div>';
    b += '<table class="kv"><tbody>';
    b += row('起点地址', addrLink('btc', c.focus || meta.start));
    b += row('规模', '地址 ' + nodes.length + ' 个；交易 ' + txs.length + ' 笔（已确认 ' + confirmed + '，未确认 ' + unconfirmed + '）');
    b += row('确认状态口径', '已确认交易带区块高度与时间；未确认交易区块显示「—」，其金额与去向可能变化');
    if (meta.ignored) {
      const g = k => (isNum(Number(meta.ignored[k])) ? Number(meta.ignored[k]) : 0);
      b += row('已忽略（只计数）', '零值输出 ' + g('zeroValueOutput') + '；无地址输出（OP_RETURN 等）' + g('noAddress') + '；低于阈值 ' + g('belowMinSats') + '；重复交易 ' + g('duplicate'));
    }
    b += '</tbody></table>';
    if (Array.isArray(meta.warnings) && meta.warnings.length) b += '<h3>追踪时的警告</h3><ul class="small">' + meta.warnings.slice(0, 40).map(w => '<li>' + esc(clip(w, 500)) + '</li>').join('') + '</ul>';
    b += '</section>';

    // 3 交易明细
    b += '<section><h2>3. 交易明细（交易级）</h2><p class="small">按区块升序（未确认在前）。每笔交易分别列出全部输入与全部输出；这是链上记录本身，不代表输入与输出之间的支付关系。</p>';
    b += '<table><thead><tr><th>#</th><th>状态</th><th>区块 / 时间（UTC+8）</th><th>交易哈希</th><th>输入（地址: satoshi）</th><th>输出（地址: satoshi）</th><th>手续费</th></tr></thead><tbody>';
    txs.forEach((t, i) => {
      const status = t.confirmed ? '<span class="tag fact">已确认</span>' : '<span class="tag infer">未确认</span>';
      const when = (t.block == null ? '—' : t.block) + (isNum(Number(t.ts)) ? ' / ' + esc(formatCst(t.ts)) : ' / —');
      const ins = (Array.isArray(t.inputs) ? t.inputs : []).map(x => (x.addr ? addrLink('btc', x.addr) : '<span class="muted">（无地址 / coinbase）</span>') + ': ' + fmtInt(x.value_sats)).join('<br>') || '<span class="muted">—</span>';
      const outs = (Array.isArray(t.outputs) ? t.outputs : []).map(x => (x.addr ? addrLink('btc', x.addr) : '<span class="muted">（无地址 / OP_RETURN）</span>') + ': ' + fmtInt(x.value_sats)).join('<br>') || '<span class="muted">—</span>';
      const fee = t.fee_sats == null ? '—' : fmtInt(t.fee_sats) + ' <span class="muted small">(' + satsToBtc(t.fee_sats) + ' BTC)</span>';
      b += '<tr><td>' + (i + 1) + '</td><td>' + status + '</td><td>' + when + '</td><td>' + txLink('btc', t.txid) + '</td><td>' + ins + '</td><td>' + outs + '</td><td>' + fee + '</td></tr>';
    });
    b += '</tbody></table></section>';

    // 4 地址清单
    b += '<section><h2>4. 地址清单</h2><p class="small">共 ' + nodes.length + ' 个地址。地址只是出现过的对手方，不代表已确认身份或归属。</p><table><thead><tr><th>地址</th><th>类型</th><th>标签 / 说明</th></tr></thead><tbody>';
    nodes.forEach(n => { b += '<tr><td>' + addrLink('btc', n.addr) + '</td><td>' + esc(n.type || '') + '</td><td>' + esc(n.label || '') + (n.note ? ' · ' + esc(n.note) : '') + '</td></tr>'; });
    b += '</tbody></table></section>';

    // 5 方法与局限
    b += '<section><h2>5. 方法与局限</h2><ul class="small">';
    b += '<li><strong>数据来源：</strong>Esplora 公开 API（默认 mempool.space），不抓取网页、不需要 key。' + (meta.traced_at ? '抓取时间 ' + esc(formatCst(Date.parse(meta.traced_at) / 1000)) + '（UTC+8）。' : '') + '</li>';
    b += '<li><strong>金额口径：</strong>一律整数 satoshi；BTC 小数只做展示换算。</li>';
    b += '<li><strong>只追交易级：</strong>不推断输入→输出归属、不推断找零、不累加输入为被盗总额。</li>';
    b += '<li><strong>分页 / 预算：</strong>已确认交易按 25 条 / 页分页；调用 ' + (meta.calls == null ? '—' : meta.calls) + ' / ' + (meta.maxCalls == null ? '—' : meta.maxCalls) + ' 次。' + (meta.truncated ? '结果已截断。' : '') + '</li>';
    b += '<li><strong>确认状态：</strong>未确认交易可能被替换或永不确认；本报告如实标注，不当作最终结果。</li>';
    b += '</ul></section>';

    // 6 免责
    b += '<section><h2>6. 免责声明</h2><ul class="small"><li>本报告仅基于公开链上数据整理，不构成法律意见。</li><li>不承诺追回：冻结、拦截、退款均由有权机关或相关机构依法决定。</li><li>归因以执法机关结论为准；未命名单不等于资金干净。</li><li>溯流不经手资金、不替用户联系任何机构、不代提交举报。</li></ul></section>';
    b += '<p class="foot">报告编号 ' + esc(rid) + ' · 由溯流（Suliu）根据公开链上数据生成 · 仅供报案与向交易所 / 协议方说明情况使用，自动结果需人工复核。</p>';
    return page('BTC 地址追踪证据报告 · ' + (c.title || c.id || ''), rid, b);
  }

  // ======================================================================
  // 跨链解析
  // ======================================================================
  const STATUS_ZH = { filled: '已完成（filled）', pending: '处理中（pending）', refunded: '已退款（refunded）', expired: '已过期（expired）', not_found: '未找到（not_found）', unknown: '未知状态（unknown）', unsupported: '未支持（unsupported）' };
  const STATUS_CLASS = { filled: 'fact', pending: 'infer', refunded: 'bad', expired: 'infer', not_found: 'bad', unknown: 'infer', unsupported: 'bad' };

  function buildBridge(o) {
    const r = o.result || {};
    const genMs = Date.parse(o.generatedAt || r.retrieved_at || '');
    const rid = reportId('bridge-' + r.protocol + '-' + r.depositId + '-' + r.sourceTx, o.generatedAt || r.retrieved_at);
    const status = String(r.status || 'unknown');
    const statusZh = STATUS_ZH[status] || ('未知状态（' + status + '）');
    const title = (r.protocol === 'chainflip' ? 'Chainflip' : 'Across') + ' 跨链解析报告';
    let b = header(title, '协议：' + esc(r.protocol || '—'), String(r.protocol || '').toUpperCase());
    if (r.demo) b += '<div class="bx warn"><strong>演示数据（夹具回放）：</strong>' + esc(r.demo_note || '合成的演示数据，不是真实案件') + '</div>';

    b += '<section><h2>1. 摘要</h2>';
    b += '<div class="bx ' + (status === 'filled' ? '' : status === 'unknown' || status === 'pending' ? 'note' : 'warn') + '">';
    b += '<strong>状态：</strong><span class="tag ' + (STATUS_CLASS[status] || 'infer') + '">' + esc(statusZh) + '</span>';
    if (r.status_raw != null && String(r.status_raw) !== status) b += ' <span class="muted small">（原始状态：' + esc(r.status_raw) + '）</span>';
    b += '</div>';
    b += '<table class="kv"><tbody>';
    b += row('协议', esc(r.protocol || '—'));
    b += row('是否已自动解析', r.supported === false ? '<span class="tag bad">未支持</span> 只给人工链接' : '<span class="tag fact">已查询官方 API</span>');
    b += row('查询时刻', r.retrieved_at ? esc(formatCst(Date.parse(r.retrieved_at) / 1000)) + '（UTC+8）' : '—');
    if (r.originChainId != null) b += row('源链', 'chainid ' + esc(r.originChainId));
    if (r.destinationChainId != null) b += row('目标链', 'chainid ' + esc(r.destinationChainId));
    if (r.depositId != null) b += row('depositId', '<span class="mono">' + esc(r.depositId) + '</span>');
    b += '</tbody></table></section>';

    b += '<section><h2>2. 源交易与目标交易</h2><table class="kv"><tbody>';
    b += row('源交易', txLink(r.originChainId == null ? 'eth' : r.originChainId, r.sourceTx));
    b += row('目标交易', txLink(r.destinationChainId == null ? null : r.destinationChainId, r.targetTx));
    if (r.refundTx) b += row('退款交易', txLink(r.originChainId == null ? 'eth' : r.originChainId, r.refundTx));
    b += row('depositor（源地址）', addrLink(r.originChainId == null ? 'eth' : r.originChainId, r.depositor));
    b += row('recipient（目标地址）', addrLink(r.destinationChainId == null ? null : r.destinationChainId, r.recipient));
    b += row('输入', (r.inputAmount == null ? '—' : '<span class="mono">' + esc(r.inputAmount) + '</span>') + (r.inputToken ? ' <span class="muted small">' + esc(r.inputToken) + '</span>' : '') + '<div class="muted small">原始单位，未按代币精度换算</div>');
    b += row('输出', (r.outputAmount == null ? '—' : '<span class="mono">' + esc(r.outputAmount) + '</span>') + (r.outputToken ? ' <span class="muted small">' + esc(r.outputToken) + '</span>' : '') + '<div class="muted small">原始单位，未按代币精度换算</div>');
    b += '</tbody></table>';
    if (r.supported === false) {
      b += '<div class="bx note"><strong>本协议未自动解析。</strong>' + esc((r.manual && r.manual.note) || '请人工到官方浏览器核对，不要凭同金额同时间断定跨链对应。') + (r.manual && r.manual.explorer ? '<br>官方浏览器：' + esc(r.manual.explorer) + '（仅文字，未自动打开）' : '') + '</div>';
    }
    b += '</section>';

    b += '<section><h2>3. 数据来源与原始响应</h2><table class="kv"><tbody>';
    b += row('来源', esc(r.source || '—'));
    if (r.detail_source) b += row('明细接口', esc(r.detail_source));
    b += row('查询时刻', r.retrieved_at ? esc(formatCst(Date.parse(r.retrieved_at) / 1000)) + '（UTC+8）' : '—');
    b += '</tbody></table>';
    if (r.raw) b += '<h3>原始响应（raw，保留以便复核）</h3><pre>' + esc(clip(JSON.stringify(r.raw, null, 2), 20000)) + '</pre>';
    else b += '<p class="small muted">本协议没有可保留的 API 原始响应。</p>';
    if (Array.isArray(r.warnings) && r.warnings.length) b += '<h3>警告</h3><ul class="small">' + r.warnings.map(w => '<li>' + esc(clip(w, 500)) + '</li>').join('') + '</ul>';
    b += '</section>';

    b += '<section><h2>4. 方法与局限</h2><ul class="small">';
    b += '<li><strong>状态口径：</strong>filled / pending / refunded / expired / not_found / unknown 分开显示；<b>退款不当作完成</b>。unknown 原样保留原始状态，不猜测。</li>';
    b += '<li><strong>不猜对应：</strong>只认官方 API 返回的源交易、目标交易与目标地址；不凭「同金额、同时间」认定跨链对应。</li>';
    b += '<li><strong>金额口径：</strong>Across 的 inputAmount / outputAmount 是原始最小单位字符串，本报告不做代币精度换算，避免猜错精度。</li>';
    b += '<li><strong>Chainflip：</strong>本轮未找到稳定的公开查询 API，明确 unsupported，只给人工链接，不假装已自动解析。</li>';
    b += '</ul></section>';
    b += '<p class="foot">报告编号 ' + esc(rid) + ' · 由溯流（Suliu）根据官方 API 返回整理 · 自动结果需人工复核，不承诺追回。</p>';
    return page(title, rid, b);
  }

  // ======================================================================
  // 通用 EVM 追踪（BSC 等；ETH 仍用 lib/report.js）
  // ======================================================================
  function buildTrace(o) {
    const c = o.case || {};
    const meta = isObj(o.meta) ? o.meta : {};
    const genMs = Date.parse(o.generatedAt || '');
    const rid = reportId(c.id, o.generatedAt);
    const chainId = isNum(Number(meta.chainid)) ? Number(meta.chainid) : (isNum(Number(c.chainid)) ? Number(c.chainid) : null);
    const chainRef = c.chain || chainId || 'eth';
    const nodes = Array.isArray(c.nodes) ? c.nodes.filter(isObj) : [];
    const txs = Array.isArray(c.txs) ? c.txs.filter(isObj) : [];
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const label = n => (n && (n.label || n.addr)) || '—';
    let b = header('链上资金去向证据报告（多链）', c.title || c.id || '', (c.chainName || (chainId == null ? String(chainRef) : 'chainid ' + chainId)));
    b += '<section><h2>1. 摘要</h2>';
    if (meta.truncated) b += '<div class="bx warn"><strong>结果被截断：</strong>' + esc((meta.truncatedReasons || []).join('；') || '原因未说明') + '</div>';
    b += '<table class="kv"><tbody>';
    b += row('起点', addrLink(chainRef, meta.start || (c.nodes && c.nodes[0] && c.nodes[0].addr)));
    b += row('链', esc(String(chainRef)) + (chainId == null ? '' : '（chainid ' + chainId + '）'));
    b += row('规模', '地址 ' + nodes.length + ' 个；转账 ' + txs.length + ' 笔');
    b += row('数据来源', esc(((c.facts || []).find(f => Array.isArray(f) && f[0] === '数据来源') || [])[1] || 'Etherscan API V2'));
    b += row('是否截断', meta.truncated ? '是' : '否');
    const freezeTxs = txs.filter(t => Array.isArray(t.flags) && t.flags.indexOf('freeze') >= 0);
    if (freezeTxs.length) {
      b += row('可冻结稳定币流水', '共 ' + freezeTxs.length + ' 笔（USDT / USDC 等发行方理论上可冻结；<strong>可冻结 ≠ 已冻结</strong>，是否冻结由发行方依法决定，本报告不判断当前冻结状态）');
      b += '<div class="bx warn"><strong>可冻结点：</strong>该链路存在稳定币流水。若要争取冻结，请立即带上地址、交易哈希、区块与金额，由警方或受害方向发行方提出请求；资金转走很快，窗口可能只有几分钟。</div>';
    }
    b += '</tbody></table></section>';
    b += '<section><h2>2. 交易明细</h2><table><thead><tr><th>#</th><th>区块</th><th>从</th><th>到</th><th>金额</th><th>交易哈希</th></tr></thead><tbody>';
    txs.forEach((t, i) => {
      const f = nodeById.get(t.from), to = nodeById.get(t.to);
      const frozen = Array.isArray(t.flags) && t.flags.indexOf('freeze') >= 0;
      b += '<tr><td>' + (i + 1) + '</td><td>' + (t.t == null ? '—' : esc(t.t)) + '</td><td>' + esc(label(f)) + '<br>' + (f ? addrLink(chainRef, f.addr) : '—') + '</td><td>' + esc(label(to)) + '<br>' + (to ? addrLink(chainRef, to.addr) : '—') + '</td><td>' + esc(t.amt == null ? '—' : t.amt) + (frozen ? ' <span class="small">（可冻结稳定币·未确认已冻）</span>' : '') + '</td><td>' + txLink(chainRef, t.hash) + '</td></tr>';
    });
    b += '</tbody></table></section>';
    b += '<section><h2>3. 地址清单</h2><table><thead><tr><th>地址</th><th>类型</th><th>标签 / 依据</th></tr></thead><tbody>';
    nodes.forEach(n => { b += '<tr><td>' + addrLink(chainRef, n.addr) + '</td><td>' + esc(n.type || '') + '</td><td>' + esc(n.label || '') + (n.note ? ' · ' + esc(n.note) : '') + '</td></tr>'; });
    b += '</tbody></table></section>';
    b += '<section><h2>4. 方法与局限</h2><ul class="small"><li>数据来自 Etherscan API V2（按 chainid 区分链）；代币真假只按该链合约白名单判断。</li><li>只追转出；转入与退款未纳入。</li><li>自动结果可能漏判或误判，提交举报前请人工复核。</li><li>「可冻结」只表示资产类型理论上可被发行方冻结，本工具不查询、也不保证任何实际冻结状态。</li></ul></section>';
    b += '<p class="foot">报告编号 ' + esc(rid) + ' · 由溯流（Suliu）根据公开链上数据生成 · 自动结果需人工复核，不承诺追回。</p>';
    return page('链上资金去向证据报告 · ' + (c.title || c.id || ''), rid, b);
  }

  // ======================================================================
  // Tron（账户模型：原生 TRX + TRC20；交易级转账，不推断归属）
  // ======================================================================
  function buildTron(o) {
    const c = o.case || {};
    const meta = isObj(o.meta) ? o.meta : {};
    const genMs = Date.parse(o.generatedAt || '');
    const rid = reportId(c.id, o.generatedAt);
    const nodes = Array.isArray(c.nodes) ? c.nodes.filter(isObj) : [];
    const txs = Array.isArray(c.txs) ? c.txs.filter(isObj) : [];
    const confirmed = txs.filter(t => t.confirmed).length;
    const unconfirmed = txs.length - confirmed;
    const maxTs = txs.reduce((m, t) => (isNum(Number(t.ts)) && (m == null || Number(t.ts) > m) ? Number(t.ts) : m), null);
    const chainName = 'Tron';
    let b = header('Tron 地址追踪证据报告', c.title || c.id || '', chainName);
    if (meta.demo) b += '<div class="bx warn"><strong>演示数据（夹具回放）：</strong>' + esc(meta.demo_note || '合成的演示数据，不是真实案件') + '</div>';

    // 1 封面
    b += '<section><h2>1. 封面信息</h2><table class="kv"><tbody>';
    b += row('案件', esc(c.title || c.id || '（未命名）') + (c.id ? ' <span class="muted mono">(' + esc(c.id) + ')</span>' : ''));
    b += row('报告编号', '<span class="mono">' + esc(rid) + '</span>');
    b += row('生成时间', esc(formatCst(genMs / 1000)) + '（UTC+8）');
    b += row('链', esc(chainName) + '（账户模型；原生 TRX + TRC20，金额单位：整数最小单位，6 位小数）');
    b += row('数据来源', esc(((c.facts || []).find(f => Array.isArray(f) && f[0] === '数据来源') || [])[1] || 'TronGrid 公开 API'));
    b += row('数据截止', '最晚交易时间 ' + (maxTs == null ? '—' : esc(formatCst(maxTs)) + '（UTC+8）') + (meta.balance_trx != null ? '；账户原生 TRX 余额 ' + esc(String(meta.balance_trx)) + ' TRX' : ''));
    if (meta.address_type) b += row('地址类型', esc(meta.address_type));
    b += '</tbody></table></section>';

    // 2 摘要
    b += '<section><h2>2. 摘要</h2>';
    if (meta.truncated) b += '<div class="bx warn"><strong>结果被截断，本报告不完整：</strong>' + esc((meta.truncatedReasons || []).join('；') || '原因未说明') + '</div>';
    b += '<div class="bx note"><strong>重要限制：</strong>本报告只做<b>交易级</b>转账记录，列出每笔转账的发送方与接收方（链上事实），<b>不推断地址身份归属</b>，<b>不推断资金归属</b>，也不声称任何地址属于交易所 / 攻击者 / 受害方。USDT 是<b>可冻结稳定币</b>，但<b>可冻结 ≠ 已冻结</b>；本报告不查询、不断言任何实际冻结状态。</div>';
    b += '<table class="kv"><tbody>';
    b += row('起点地址', addrLink('tron', c.focus || meta.start));
    b += row('规模', '地址 ' + nodes.length + ' 个；转账 ' + txs.length + ' 笔（已确认 ' + confirmed + '，未确认 ' + unconfirmed + '）');
    b += row('确认状态口径', '查询带 only_confirmed=true；已确认转账带时间，未确认区块显示「—」，其金额与去向可能变化');
    const usdtTxs = txs.filter(t => t.freezable || t.asset === 'USDT');
    if (usdtTxs.length) {
      b += row('可冻结稳定币流水', '共 ' + usdtTxs.length + ' 笔 USDT（Tether 理论可冻结；<strong>可冻结 ≠ 已冻结</strong>，是否冻结由发行方依法决定，本报告不判断当前冻结状态）');
      b += '<div class="bx warn"><strong>可冻结点：</strong>该链路存在 USDT 流水。若要争取冻结，请立即带上地址、交易哈希、时间与金额，由警方或受害方向 Tether 发行方提出请求；资金转走很快，窗口可能只有几分钟。</div>';
    }
    if (meta.ignored) {
      const g = k => (isNum(Number(meta.ignored[k])) ? Number(meta.ignored[k]) : 0);
      b += row('已忽略（只计数）', '非白名单 TRC20 合约 ' + g('nonWhitelistTrc20') + '；零值 ' + g('zeroValue') + '；低于阈值 ' + g('belowMinValue') + '；重复 ' + g('duplicate'));
    }
    b += '</tbody></table>';
    if (Array.isArray(meta.warnings) && meta.warnings.length) b += '<h3>追踪时的警告</h3><ul class="small">' + meta.warnings.slice(0, 40).map(w => '<li>' + esc(clip(w, 500)) + '</li>').join('') + '</ul>';
    b += '</section>';

    // 3 交易明细
    b += '<section><h2>3. 转账明细（交易级）</h2><p class="small">按时间升序（未确认在前）。每笔分别列出资产、金额（整数最小单位 + 人类可读）、发送方、接收方与交易哈希。发送方 / 接收方是链上转账事实，不代表地址归属或资金归属。</p>';
    b += '<table><thead><tr><th>#</th><th>状态</th><th>时间（UTC+8） / 区块</th><th>资产</th><th>金额（最小单位 / 人类可读）</th><th>发送方</th><th>接收方</th><th>交易哈希</th></tr></thead><tbody>';
    txs.forEach((t, i) => {
      const status = t.confirmed ? '<span class="tag fact">已确认</span>' : '<span class="tag infer">未确认</span>';
      const when = (isNum(Number(t.ts)) ? esc(formatCst(t.ts)) : '—') + ' / ' + (t.block == null ? '<span class="muted">—</span>' : esc(String(t.block)));
      const asset = esc(t.asset || t.symbol || '—');
      const amt = '<span class="mono">' + esc(fmtMinUnits(t.amount_min)) + '</span>' + (t.amount_human ? ' <span class="muted small">(' + esc(t.amount_human) + ' ' + esc(t.symbol || '') + ')</span>' : '');
      const freeze = (t.freezable || t.asset === 'USDT') ? ' <span class="small">（可冻结稳定币（可冻≠已冻））</span>' : '';
      const note = t.note ? '<div class="small muted">' + esc(t.note) + '</div>' : '';
      b += '<tr><td>' + (i + 1) + '</td><td>' + status + '</td><td>' + when + '</td><td>' + asset + '</td><td>' + amt + freeze + note + '</td><td>' + addrLink('tron', t.from) + '</td><td>' + addrLink('tron', t.to) + '</td><td>' + txLink('tron', t.txid) + '</td></tr>';
    });
    b += '</tbody></table></section>';

    // 4 地址清单
    b += '<section><h2>4. 地址清单</h2><p class="small">共 ' + nodes.length + ' 个地址。地址只是转账中出现过的发送方 / 接收方，不代表已确认身份或归属。</p><table><thead><tr><th>地址</th><th>类型</th><th>标签 / 说明</th></tr></thead><tbody>';
    nodes.forEach(n => { b += '<tr><td>' + addrLink('tron', n.addr) + '</td><td>' + esc(n.type || '') + '</td><td>' + esc(n.label || '') + (n.note ? ' · ' + esc(n.note) : '') + '</td></tr>'; });
    b += '</tbody></table></section>';

    // 5 方法与局限
    b += '<section><h2>5. 方法与局限</h2><ul class="small">';
    b += '<li><strong>数据来源：</strong>TronGrid 公开 API（默认 api.trongrid.io），不抓取网页、不需要 key；设置 TRON_API_KEY 可提高频率。' + (meta.traced_at ? '抓取时间 ' + esc(formatCst(Date.parse(meta.traced_at) / 1000)) + '（UTC+8）。' : '') + '</li>';
    b += '<li><strong>金额口径：</strong>一律整数最小单位（TRX 与 USDT 均为 6 位小数）；人类可读金额只做展示换算，不改变记账单位。</li>';
    b += '<li><strong>只追交易级：</strong>不推断地址归属、不推断资金归属；原生 TRX 只取 TransferContract，不含智能合约内部转账（internal_transactions）。</li>';
    b += '<li><strong>分页 / 预算：</strong>TronGrid 单页上限 200，用响应里的 fingerprint 翻页；调用 ' + (meta.calls == null ? '—' : meta.calls) + ' / ' + (meta.maxCalls == null ? '—' : meta.maxCalls) + ' 次。' + (meta.truncated ? '结果已截断。' : '') + '</li>';
    b += '<li><strong>确认状态：</strong>查询带 only_confirmed=true；未确认转账可能被替换或永不确认，本报告如实标注，不当作最终结果。</li>';
    b += '<li><strong>USDT 冻结：</strong>可冻结 ≠ 已冻结；本工具不查询也不保证任何实际冻结状态。</li>';
    b += '</ul></section>';

    // 6 免责
    b += '<section><h2>6. 免责声明</h2><ul class="small"><li>本报告仅基于公开链上数据整理，不构成法律意见。</li><li>不承诺追回：冻结、拦截、退款均由有权机关或相关机构依法决定。</li><li>归因以执法机关结论为准；未命名单不等于资金干净。</li><li>溯流不经手资金、不替用户联系任何机构、不代提交举报。</li></ul></section>';
    b += '<p class="foot">报告编号 ' + esc(rid) + ' · 由溯流（Suliu）根据公开链上数据生成 · 仅供报案与向交易所 / 协议方说明情况使用，自动结果需人工复核。</p>';
    return page('Tron 地址追踪证据报告 · ' + (c.title || c.id || ''), rid, b);
  }

  function build(o) {
    o = o || {};
    const c = o.case || {};
    const kind = o.kind || (o.result ? 'bridge' : (c.chain === 'btc' || (o.meta && o.meta.kind === 'utxo') ? 'utxo' : (c.chain === 'tron' || (o.meta && o.meta.kind === 'account') ? 'account' : 'trace')));
    if (!o.generatedAt && !(o.result && o.result.retrieved_at)) throw new TypeError('build: 需要 generatedAt（ISO 字符串）');
    if (kind === 'utxo') return buildBtc(o);
    if (kind === 'bridge') return buildBridge(o);
    if (kind === 'account') return buildTron(o);
    return buildTrace(o);
  }

  return { build, buildBtc, buildBridge, buildTrace, buildTron, esc, formatCst, reportId };
});
