/* 溯流 · 官方数据层（UMD）：浏览器挂 window.SuliuOfficial，Node 下 module.exports；零依赖、无 ESM 语法，file:// 可用 <script src> 加载 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SuliuOfficial = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE = 'https://trace.bgblockchain.xyz';
  const ENDPOINTS = { maintenance: '/api/maintenance', holdings: '/api/holdings', victims: '/api/victims', reviewed: '/api/reviewed', chains: '/api/chains', corrections: '/api/holdings/corrections' };
  const EXPLORERS = {
    eth: 'https://etherscan.io/address/', bsc: 'https://bscscan.com/address/', arb: 'https://arbiscan.io/address/', op: 'https://optimistic.etherscan.io/address/',
    base: 'https://basescan.org/address/', avax: 'https://snowtrace.io/address/', linea: 'https://lineascan.build/address/', hyperliquid: 'https://app.hyperliquid.xyz/explorer/address/',
    btc: 'https://mempool.space/address/', tron: 'https://tronscan.org/#/address/', xrp: 'https://xrpscan.com/account/', sol: 'https://solscan.io/account/',
    zec: 'https://blockchair.com/zcash/address/', algo: 'https://allo.info/account/', atom: 'https://www.mintscan.io/cosmos/address/',
    noble: 'https://www.mintscan.io/noble/address/', tia: 'https://www.mintscan.io/celestia/address/'
  };
  const SCHEMA = 'suliu.official-snapshot/v1';

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const isChainMap = o => isObj(o) && Object.keys(o).every(k => Array.isArray(o[k]) && o[k].every(x => typeof x === 'string'));

  function explorerUrl(chain, addr) {
    const k = String(chain == null ? '' : chain).toLowerCase();
    if (!has(EXPLORERS, k) || addr == null || addr === '') return null;
    return EXPLORERS[k] + encodeURIComponent(addr);
  }
  const officialUrl = addr => BASE + '/v2#' + encodeURIComponent(addr);

  // ---- 地址归一化：EVM/bech32 → 小写，ALGO → 大写，base58 类（btc 旧地址/tron/xrp/sol/zec）大小写敏感，原样 ----
  const RE_EVM = /^0x[0-9a-f]{40}$/i, RE_BECH = /^[a-z]{1,20}1[02-9ac-hj-np-z]{6,90}$/i, RE_ALGO = /^[A-Z2-7]{58}$/i;
  const isBech = s => RE_BECH.test(s) && (s === s.toLowerCase() || s === s.toUpperCase());
  const trim = a => String(a == null ? '' : a).trim();

  function normAddr(a) {
    const s = trim(a);
    if (RE_EVM.test(s)) return s.toLowerCase();
    if (isBech(s)) return s.toLowerCase();
    if (RE_ALGO.test(s)) return s.toUpperCase();
    return s;
  }
  function addrKind(a) {
    const s = trim(a);
    if (s.length < 20 || s.length > 100 || /[^0-9A-Za-z]/.test(s)) return 'invalid';
    if (RE_EVM.test(s)) return 'evm';
    if (isBech(s)) return 'bech32';
    if (RE_ALGO.test(s)) return 'algo';
    return 'base58';
  }

  function validateHoldings(o) {
    return isChainMap(o) && Object.keys(o).reduce((n, k) => n + o[k].length, 0) > 0;
  }

  // ---- 索引：snap → Index ----
  // 以链 / category 为键的对象一律 Object.create(null)：链键 '__proto__' 不会被吞掉（JSON.stringify / Object.keys 行为不变）
  function buildIndex(snap) {
    snap = snap || {};
    const byAddr = new Map(), evm = [], seenEvm = new Set();
    const ent = a => {
      const k = normAddr(a);
      let e = byAddr.get(k);
      if (!e) byAddr.set(k, e = { addr: String(a), holdings: [], victims: [], reviewed: null, correction: null });
      return e;
    };
    const feed = (m, field, source) => {
      const byChain = Object.create(null), all = new Set();
      if (isObj(m)) for (const c of Object.keys(m)) {
        const seen = new Set();
        for (const a of Array.isArray(m[c]) ? m[c] : []) {
          if (typeof a !== 'string' || !trim(a)) continue;
          const k = normAddr(a), e = ent(a);
          seen.add(k); all.add(k);
          if (!e[field].includes(c)) e[field].push(c);
          if (RE_EVM.test(k) && !seenEvm.has(k)) { seenEvm.add(k); evm.push({ norm: k, source }); }
        }
        byChain[c] = seen.size;
      }
      return { total: all.size, byChain };
    };
    const h = feed(snap.holdings, 'holdings', 'holdings');
    const v = feed(snap.victims, 'victims', 'victims');

    const rv = isObj(snap.reviewed) ? snap.reviewed : null;
    const items = rv && Array.isArray(rv.items) ? rv.items : [];
    for (const it of items) if (it && typeof it.address === 'string' && trim(it.address)) ent(it.address).reviewed = it;
    let rcounts = rv && isObj(rv.counts) ? rv.counts : null;
    if (!rcounts) { rcounts = Object.create(null); for (const it of items) if (it) rcounts[it.category] = (rcounts[it.category] || 0) + 1; }

    const cors = isObj(snap.corrections) && Array.isArray(snap.corrections.corrections) ? snap.corrections.corrections : [];
    for (const c of cors) {
      const tag = { id: c.id, listed_from: c.listed_from, listed_until: c.listed_until, reason: c.reason };
      for (const a of Array.isArray(c.addresses) ? c.addresses : []) {
        if (typeof a !== 'string' || !trim(a)) continue;
        const e = ent(a);
        if (!e.correction) e.correction = tag;
      }
    }

    return {
      byAddr, evm,
      stats: {
        holdingsTotal: h.total, holdingsByChain: h.byChain, victimsTotal: v.total, victimsByChain: v.byChain,
        reviewedCount: items.length, reviewedCounts: rcounts,
        corrections: cors.map(c => ({ id: c.id, chain: c.chain, count: typeof c.count === 'number' ? c.count : (Array.isArray(c.addresses) ? c.addresses.length : 0), listed_from: c.listed_from, listed_until: c.listed_until, restored_at: c.restored_at, reason: c.reason, csv: c.csv }))
      },
      snapTs: snap.snap_ts == null ? null : snap.snap_ts,
      fetchedAt: snap.fetched_at || null
    };
  }

  // ---- 查询：优先级 invalid > conflict > victim > attacker > reviewed_attacker_related > reviewed_not_attacker > retracted > spoof > none ----
  // chains：holdings/victims 命中时为官方链键；只在 reviewed/勘误里命中时，仅放 EXPLORERS 里存在的链键（'EVM'、'THOR' 等不放）。
  // listChain：仅 reviewed/勘误命中时为其原始 chain 字符串（供界面显示），命中 holdings/victims 时为 null。
  function lookup(index, input) {
    const kind = addrKind(input), norm = normAddr(input);
    const r = { input, norm, kind, status: 'none', entry: null, spoofOf: null, chains: [], listChain: null };
    if (kind === 'invalid') { r.status = 'invalid'; return r; }
    const e = (index && index.byAddr && index.byAddr.get(norm)) || null;
    if (e) {
      const rv = e.reviewed, inH = e.holdings.length > 0, inV = e.victims.length > 0;
      r.entry = e;
      r.chains = e.holdings.concat(e.victims.filter(c => !e.holdings.includes(c)));
      if (!r.chains.length) {
        let raw = null;
        if (rv && rv.chain) raw = String(rv.chain);
        else if (e.correction && index.stats) {
          const c = index.stats.corrections.find(x => x.id === e.correction.id);
          if (c && c.chain) raw = String(c.chain);
        }
        if (raw) {
          r.listChain = raw;
          const k = raw.toLowerCase();
          if (has(EXPLORERS, k)) r.chains = [k];
        }
      }
      if (inH && rv && rv.verdict === 'not_attacker') r.status = 'conflict';
      else if (inV) r.status = 'victim';
      else if (inH) r.status = 'attacker';
      else if (rv && rv.verdict === 'attacker_related') r.status = 'reviewed_attacker_related';
      else if (rv && rv.verdict === 'not_attacker') r.status = 'reviewed_not_attacker';
      else if (e.correction) r.status = 'retracted';
      if (r.status !== 'none') return r;
    }
    if (kind === 'evm' && index && Array.isArray(index.evm)) {
      const p = norm.slice(2, 6), s = norm.slice(-4);
      const m = index.evm.find(x => x.norm.slice(2, 6) === p && x.norm.slice(-4) === s);
      if (m) { r.status = 'spoof'; r.spoofOf = { norm: m.norm, source: m.source }; }
    }
    return r;
  }

  // ---- 名单差异 ----
  // 按链（added/removed/addedCount/removedCount）：按 normAddr 比较，输出原始写法，只列有变化的链；removed 只表示"该链不再列出"，不等于地址被官方移除。
  // 按地址（newAddrs/goneAddrs/relisted/spread）：把同一归一化地址在各链的出现合并后比较；告警只应使用 newCount/goneCount。
  //   newAddrs：cur 有、prev 任何链都没有；goneAddrs：prev 有、cur 任何链都没有（归一化写法，按首次出现顺序）
  //   relisted：两边都有、但至少失去一条链 → {addr, from:[prev 链], to:[cur 链]}；spread：两边都有、只增链不失链
  function diffHoldings(prev, cur) {
    const un = x => (isObj(x) && isObj(x.holdings) ? x.holdings : x);
    const out = {
      added: Object.create(null), removed: Object.create(null), addedCount: 0, removedCount: 0,
      newAddrs: [], newCount: 0, goneAddrs: [], goneCount: 0, relisted: [], relistedCount: 0, spread: [], spreadCount: 0
    };
    prev = un(prev); cur = un(cur);
    if (!isObj(prev) || !isObj(cur)) return out;
    const side = (m, c) => {
      const s = new Map();
      for (const a of Array.isArray(m[c]) ? m[c] : []) if (typeof a === 'string') { const k = normAddr(a); if (!s.has(k)) s.set(k, a); }
      return s;
    };
    const chains = new Set(Object.keys(prev).concat(Object.keys(cur)));
    const where = m => { // 归一化地址 → 出现的链；按 m 自身的链键顺序、链内出现顺序
      const w = new Map();
      for (const c of Object.keys(m)) for (const k of side(m, c).keys()) { const l = w.get(k); if (l) l.push(c); else w.set(k, [c]); }
      return w;
    };
    for (const c of chains) {
      const p = side(prev, c), q = side(cur, c);
      const add = [], rem = [];
      for (const [k, a] of q) if (!p.has(k)) add.push(a);
      for (const [k, a] of p) if (!q.has(k)) rem.push(a);
      if (add.length) { out.added[c] = add; out.addedCount += add.length; }
      if (rem.length) { out.removed[c] = rem; out.removedCount += rem.length; }
    }
    const pw = where(prev), cw = where(cur);
    for (const k of cw.keys()) if (!pw.has(k)) out.newAddrs.push(k);
    for (const [k, from] of pw) {
      const to = cw.get(k);
      if (!to) { out.goneAddrs.push(k); continue; }
      if (from.some(c => !to.includes(c))) out.relisted.push({ addr: k, from, to });
      else if (to.some(c => !from.includes(c))) out.spread.push({ addr: k, from, to });
    }
    out.newCount = out.newAddrs.length; out.goneCount = out.goneAddrs.length;
    out.relistedCount = out.relisted.length; out.spreadCount = out.spread.length;
    return out;
  }

  // ---- 消失原因：地址从 holdings 消失时，按"当前"索引解释原因。优先级 correction > reviewed_not_attacker > victim > still_listed > unknown ----
  // 返回 {kind:'correction', id, csv} | {kind:'reviewed_not_attacker', category} | {kind:'victim', chains} | {kind:'still_listed', chains} | {kind:'unknown'}
  function describeGone(index, norm) {
    const k = normAddr(norm);
    const e = (index && index.byAddr && typeof index.byAddr.get === 'function' && index.byAddr.get(k)) || null;
    if (!e) return { kind: 'unknown' };
    if (e.correction) {
      const list = index.stats && Array.isArray(index.stats.corrections) ? index.stats.corrections : [];
      const c = list.find(x => x.id === e.correction.id);
      return { kind: 'correction', id: e.correction.id, csv: c && c.csv != null ? c.csv : null };
    }
    if (e.reviewed && e.reviewed.verdict === 'not_attacker') return { kind: 'reviewed_not_attacker', category: e.reviewed.category };
    if (e.victims.length) return { kind: 'victim', chains: e.victims.slice() };
    if (e.holdings.length) return { kind: 'still_listed', chains: e.holdings.slice() };
    return { kind: 'unknown' };
  }
  const CATEGORY_ZH = { vault: '协议金库', cex: '交易所', arb: '套利者', user: '无关用户', poison: '投毒地址' };
  function goneText(info) {
    const k = info && info.kind;
    if (k === 'correction') return '官方勘误移除（' + info.id + '）：官方要求从黑名单移除';
    if (k === 'reviewed_not_attacker') {
      const c = info.category;
      return '官方已核查为非攻击者（' + (c != null && has(CATEGORY_ZH, c) ? CATEGORY_ZH[c] : (c == null || c === '' ? '未分类' : String(c))) + '）';
    }
    if (k === 'victim') return '已从攻击者名单移到官方受害钱包名单';
    if (k === 'still_listed') return '改列到 ' + (Array.isArray(info.chains) ? info.chains : []).map(c => String(c).toUpperCase()).join('/') + '，仍在官方名单';
    return '从官方名单消失，官方未说明原因（官方称名单只增不减），请先到官方看板核实，不要直接撤下';
  }

  // ---- 内容签名：FNV-1a 32 位十六进制；覆盖 holdings / victims（每条链一条记录 JSON.stringify([链, 排序后的归一化地址]) 再哈希；链键与地址不再混在同一条流里，'@b' 地址与 b 链不会撞）、
  //   reviewed.items 的 [address, verdict, category, name, note, chain, reviewed_ts]（每条记录 JSON.stringify 数组后再哈希，排序）、
  //   corrections 的 [id, count, chain, reason, listed_from, listed_until, restored_at, csv, 地址列表哈希]（同样 JSON.stringify 数组；地址归一化后排序再哈希，含个数；整体排序）；
  //   字段用 JSON 数组而不是 '|' 拼接：'a|b'+'c' 与 'a'+'b|c' 不会撞；
  //   与 snap_ts / fetched_at / chains / 其它元数据无关；非对象入参返回 '' ----
  const FNV_INIT = 0x811c9dc5;
  const fnv1a = (h, s) => {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
  };
  function contentSig(snap) {
    if (!isObj(snap)) return '';
    let h = FNV_INIT;
    const put = s => { h = fnv1a(h, String(s) + '\n'); };
    const chainMap = (tag, m) => {
      put('#' + tag);
      if (!isObj(m)) return;
      for (const c of Object.keys(m).sort()) {
        put(JSON.stringify([c, (Array.isArray(m[c]) ? m[c] : []).filter(a => typeof a === 'string' && trim(a)).map(normAddr).sort()]));
      }
    };
    chainMap('H', snap.holdings);
    chainMap('V', snap.victims);
    put('#R');
    const rv = isObj(snap.reviewed) && Array.isArray(snap.reviewed.items) ? snap.reviewed.items : [];
    const nz = x => (x == null ? '' : String(x));
    rv.filter(it => isObj(it) && typeof it.address === 'string' && trim(it.address))
      .map(it => JSON.stringify([normAddr(it.address), nz(it.verdict), nz(it.category), nz(it.name), nz(it.note), nz(it.chain), nz(it.reviewed_ts)])).sort().forEach(put);
    put('#C');
    const cs = isObj(snap.corrections) && Array.isArray(snap.corrections.corrections) ? snap.corrections.corrections : [];
    const addrHash = list => {
      const l = (Array.isArray(list) ? list : []).filter(a => typeof a === 'string' && trim(a)).map(normAddr).sort();
      return l.length + ':' + fnv1a(FNV_INIT, l.join('\n')).toString(16).padStart(8, '0');
    };
    cs.filter(isObj).map(c => JSON.stringify([nz(c.id), nz(c.count), nz(c.chain), nz(c.reason), nz(c.listed_from), nz(c.listed_until), nz(c.restored_at), nz(c.csv), addrHash(c.addresses)])).sort().forEach(put);
    return h.toString(16).padStart(8, '0');
  }

  // ---- 维护状态判定（fetchAll 与工具共用同一套口径）----
  // 冻结：maintenance 开着且 mode=freeze，或响应头 x-maintenance:freeze（headersFlag 必须严格为 true）；{on:false, mode:'freeze'} 不算
  const isFrozen = (maintenance, headersFlag) => !!(maintenance && maintenance.on && maintenance.mode === 'freeze') || headersFlag === true;
  // block：maintenance 开着且 mode=block（truthy 判断）；维护接口自身 503 在 fetchAll 里同样按 block 处理
  const isBlock = maintenance => !!(maintenance && maintenance.on && maintenance.mode === 'block');

  // ---- 收缩判定（reduceOfficial 与 tools/refresh-snapshot.mjs 共用同一口径）----
  // detectShrink(baseSnap, curSnap) → { suspicious, unexplained:[norm], missingChains:[链], explainedByCorrection:{id:count}, shrinkKey }
  //   缺链：baseSnap.holdings 里非空的链键，在 curSnap.holdings 里不存在或变为空数组（base 里本来就是空的链键不算）；按 base 的链键顺序。
  //   unexplained：diffHoldings(base, cur).goneAddrs 中，按 cur 的索引 describeGone 结果不是 correction 的地址（归一化写法，goneAddrs 顺序）。
  //   explainedByCorrection：被勘误解释的消失地址，按勘误 id 聚合个数（id 一律转字符串，只含有消失地址的 id）。
  //   suspicious = 缺链非空 || unexplained.length > 20。
  //   shrinkKey：suspicious 时为 missingChains 与 unexplained 各自排序后的哈希（'缺链数:无解释数:FNV'），供"连续 N 次同样的收缩"计数绑定内容；不可疑时为 ''。
  const SHRINK_GONE_MAX = 20;
  const hasAddr = l => Array.isArray(l) && l.some(a => typeof a === 'string' && trim(a) !== '');
  const shrinkKeyOf = (missing, unexplained) => {
    const s = JSON.stringify([missing.slice().sort(), unexplained.slice().sort()]);
    return missing.length + ':' + unexplained.length + ':' + fnv1a(FNV_INIT, s).toString(16).padStart(8, '0');
  };
  function shrinkOf(baseSnap, curSnap, d) { // d = diffHoldings(baseSnap, curSnap)，reduceOfficial 已算过就直接传进来
    const bh = isObj(baseSnap) && isObj(baseSnap.holdings) ? baseSnap.holdings : {}, ch = isObj(curSnap) && isObj(curSnap.holdings) ? curSnap.holdings : {};
    const missingChains = Object.keys(bh).filter(c => hasAddr(bh[c]) && !(has(ch, c) && hasAddr(ch[c])));
    const unexplained = [], explainedByCorrection = {}, explainedAddrs = new Map();   // explainedAddrs：id → 本轮该勘误解释的消失地址（仅 reduceOfficial 内部用，detectShrink 对外不带）
    if (d.goneAddrs.length) {
      const idx = buildIndex(curSnap);
      for (const a of d.goneAddrs) {
        const g = describeGone(idx, a);
        if (g.kind !== 'correction') { unexplained.push(a); continue; }
        const id = String(g.id);
        if (explainedAddrs.has(id)) explainedAddrs.get(id).push(a); else explainedAddrs.set(id, [a]);
        // defineProperty：勘误 id 即便是 '__proto__' 也当普通自有键，不去改原型
        Object.defineProperty(explainedByCorrection, id, { value: (has(explainedByCorrection, id) ? explainedByCorrection[id] : 0) + 1, enumerable: true, writable: true, configurable: true });
      }
    }
    const suspicious = missingChains.length > 0 || unexplained.length > SHRINK_GONE_MAX;
    return { suspicious, unexplained, missingChains, explainedByCorrection, explainedAddrs, shrinkKey: suspicious ? shrinkKeyOf(missingChains, unexplained) : '' };
  }
  const detectShrink = (baseSnap, curSnap) => { const { explainedAddrs, ...pub } = shrinkOf(baseSnap, curSnap, diffHoldings(baseSnap, curSnap)); return pub; };   // 对外结构不变（不带 explainedAddrs）
  // 勘误告警键：'c:'+id+':'+FNV(本轮该勘误解释的消失地址，归一化后排序再 '\n' 连接)；同一批不重复告警，同一 id 来了新一批再告警一次
  const correctionKey = (id, addrs) => 'c:' + id + ':' + fnv1a(FNV_INIT, addrs.slice().sort().join('\n')).toString(16).padStart(8, '0');

  // ---- 轮询状态机（纯函数，不改入参）----
  // state = { display, base, source: 'offline'|'cache'|'live'|'freeze'|null, alerted: ['n:'+norm | 'g:'+norm | 'c:'+勘误id+':'+批次哈希，最多 20000，先进先出], staleStreak, shrinkStreak, shrinkKey, unknownStreak, lastErrors, lastMode }
  //   shrinkStreak / unknownStreak 缺省为 0、shrinkKey 缺省为 ''（旧 state 兼容；旧 state 有 shrinkStreak 却没有 shrinkKey 时，连击从 1 重新计）
  // res = fetchAll 返回值；opts = { manual }；返回 { state, events, dirty }
  // events：{type:'block'|'error', errors} | {type:'frozen'} | {type:'stale_ignored', streak} | {type:'stale_accepted', rolledBack:[norm]}
  //   | {type:'maint_unknown', streak} | {type:'suspicious_shrink', goneCount, missingChains, streak} | {type:'shrink_accepted', gone:[norm]（回退路径上另带 stale:true）}
  //   | {type:'diff', diff, alertNew, alertGone, alertCorrections:[{id, count}]}
  // 冻结（mode==='freeze' 或 snap.frozen===true）快照只用来显示，永远不作为 diff 基线。
  // block / freeze 轮：本轮维护状态已知（res.maintUnknown 不为 true）时 unknownStreak 清零；维护状态未知（如维护接口 503）时不动。
  // 旧快照（snap_ts 小于基线）连续 3 次（或手动刷新）才接受；接受回退时不做 diff，"旧 base 有、新快照没有"的地址以 'n:'+norm 预写入 alerted（回来时不再当新增告警），并在 stale_accepted.rolledBack 给出。
  //   到了该接受的时候再用 detectShrink(base, 新快照) 判一次：可疑就不走 stale_accepted，按下面的"可疑收缩"处理（同一套 shrinkKey 连击 / manual）；
  //   保留期间 events [suspicious_shrink]、staleStreak 记为本轮值、其余不动；接受时 events [shrink_accepted{gone, stale:true}]（不 diff），
  //   'g:'+无解释地址、'n:'+全部消失地址 预写入 alerted，display=base=新快照，staleStreak / shrinkStreak 清零。
  // maintUnknown（res.maintUnknown===true）：前 3 轮不推进 base、不 diff、不动 staleStreak / shrinkStreak / shrinkKey；unknownStreak+1；events 首个是 maint_unknown。
  //   display：旧于基线的快照不更新；有 base 时先 detectShrink(base, 新快照)，可疑则 display 也不更新（沿用上次完整名单）、events 追加 suspicious_shrink
  //   （streak = 若计入将是的连击数，不落盘）；否则用新快照更新 display。
  //   已连续 3 轮之后（cur.unknownStreak>=3）按 live 正常处理，且 unknownStreak 保持不清零直到出现一轮 maintUnknown 不为 true 的结果。
  // 可疑收缩：见 detectShrink。可疑时 display / base / source / alerted 都不动，events [suspicious_shrink]；
  //   连击数只在同一 shrinkKey 上累加（内容变了从 1 重新计，中间穿插 block / error 轮不清零）；连续 3 次（或 manual）才接受：display=base=新快照、
  //   无解释消失地址以 'g:' 与 'n:' 写入 alerted（'n:' 与回退一致：它们回到名单时不再当新增告警）但不进 alertGone、events [shrink_accepted, …diff]。正常轮 shrinkStreak 清零、shrinkKey 置 ''。
  // 勘误解释的消失：不逐个写 'g:'，每个"勘误 id + 本轮该勘误解释的消失地址集合"一个键 'c:'+id+':'+FNV(归一化后排序 join)（同一批只告警一次，同一 id 的新一批再告警一次），
  //   告警内容在 diff 事件的 alertCorrections（[{id, count:本轮该勘误解释的消失个数}]），alertGone 只含无解释的消失地址。
  // alerted 对 new / gone / correction 各自去重
  // 重新布防：正常 diff 路径里，本轮 d.newAddrs（重新出现在 holdings 的地址）的 'g:'+norm 从 alerted 摘掉（'n:' 保留）——地址回到名单后再次消失会重新告警。
  const ALERTED_MAX = 20000, STALE_ACCEPT_AFTER = 3, SHRINK_ACCEPT_AFTER = 3, MAINT_UNKNOWN_MAX = 3;
  const streakOf = x => (typeof x === 'number' && x > 0 ? x : 0);
  function reduceOfficial(state, res, opts) {
    const st = state && typeof state === 'object' ? state : {};
    const manual = !!(opts && opts.manual);
    const cur = {
      display: st.display || null, base: st.base || null, source: st.source == null ? null : st.source,
      alerted: Array.isArray(st.alerted) ? st.alerted : [], staleStreak: typeof st.staleStreak === 'number' ? st.staleStreak : 0,
      shrinkStreak: streakOf(st.shrinkStreak), shrinkKey: typeof st.shrinkKey === 'string' ? st.shrinkKey : '', unknownStreak: streakOf(st.unknownStreak),
      lastErrors: Array.isArray(st.lastErrors) ? st.lastErrors : [], lastMode: st.lastMode == null ? null : st.lastMode
    };
    const next = { ...cur, alerted: cur.alerted.slice(-ALERTED_MAX), lastErrors: cur.lastErrors.slice() };
    const events = [];
    const errors = res && Array.isArray(res.errors) ? res.errors.slice() : [];
    const done = () => {
      const a = cur.display, b = next.display;
      const dirty = a === b ? false : (!a || !b) ? true : contentSig(a) !== contentSig(b);
      return { state: next, events, dirty };
    };
    // 把 keys 追加进 alerted（已在其中的不重复），最多保留 ALERTED_MAX 条
    const markAlerted = keys => {
      const s = new Set(cur.alerted), add = [];
      for (const k of keys) if (!s.has(k)) { s.add(k); add.push(k); }
      return cur.alerted.concat(add).slice(-ALERTED_MAX);
    };

    // 可疑收缩的连击数：只在"同一内容（shrinkKey）"上累加，内容变了从 1 重新计
    const streakFor = det => (cur.shrinkKey === det.shrinkKey ? cur.shrinkStreak : 0) + 1;
    const shrinkEvent = (det, streak) => ({ type: 'suspicious_shrink', goneCount: det.unexplained.length, missingChains: det.missingChains.slice(), streak });
    // 返回 true＝本轮保留旧名单（已记连击数、已出 suspicious_shrink 事件）；false＝该接受了（连续 3 次同样内容，或 manual）
    const holdShrink = det => {
      const streak = streakFor(det);
      if (streak >= SHRINK_ACCEPT_AFTER || manual) return false;
      next.shrinkStreak = streak; next.shrinkKey = det.shrinkKey;
      events.push(shrinkEvent(det, streak));
      return true;
    };

    const mode = res && res.mode;
    if (mode === 'block' || mode === 'error' || !res || !res.snap) {
      const type = mode === 'block' ? 'block' : 'error';
      next.lastMode = type; next.lastErrors = errors;
      if (type === 'block' && res && res.maintUnknown !== true) next.unknownStreak = 0;   // 本轮维护状态已知（确实在维护）
      events.push({ type, errors: errors.slice() });
      return done();
    }
    const snap = res.snap;
    next.lastErrors = errors;
    if (mode === 'freeze' || snap.frozen === true) {
      next.lastMode = 'freeze'; next.display = snap; next.source = 'freeze';
      if (res.maintUnknown !== true) next.unknownStreak = 0;
      events.push({ type: 'frozen' });
      return done();
    }
    next.lastMode = 'live';

    const bt = cur.base ? cur.base.snap_ts : null, rt = snap.snap_ts;
    const isStale = bt != null && rt != null && rt < bt;

    // 维护状态未知：前 MAINT_UNKNOWN_MAX 轮不推进 base、不 diff；display 只在"不旧于基线、且收缩判定不可疑"时更新，之后按 live 正常处理
    if (res.maintUnknown === true) {
      if (cur.unknownStreak < MAINT_UNKNOWN_MAX) {
        next.unknownStreak = cur.unknownStreak + 1;
        events.push({ type: 'maint_unknown', streak: next.unknownStreak });
        if (!isStale) {
          const det = cur.base ? detectShrink(cur.base, snap) : null;
          if (det && det.suspicious) events.push(shrinkEvent(det, streakFor(det)));   // 只提示，连击数不落盘
          else { next.display = snap; next.source = 'live'; }
        }
        return done();
      }
    } else next.unknownStreak = 0;

    if (isStale) {
      const streak = cur.staleStreak + 1;
      if (streak < STALE_ACCEPT_AFTER && !manual) {
        next.staleStreak = streak;
        events.push({ type: 'stale_ignored', streak });
        return done();
      }
      const d = diffHoldings(cur.base, snap), det = shrinkOf(cur.base, snap, d), rolledBack = d.goneAddrs;
      if (det.suspicious) {   // 回退且可疑：按收缩处理（同一套连击 / manual），不直接接受
        if (holdShrink(det)) { next.staleStreak = streak; return done(); }
        next.alerted = markAlerted(det.unexplained.map(a => 'g:' + a).concat(rolledBack.map(a => 'n:' + a)));
        events.push({ type: 'shrink_accepted', gone: det.unexplained.slice(), stale: true });
      } else {
        next.alerted = markAlerted(rolledBack.map(a => 'n:' + a));
        events.push({ type: 'stale_accepted', rolledBack: rolledBack.slice() });
      }
      next.display = snap; next.base = snap; next.source = 'live'; next.staleStreak = 0; next.shrinkStreak = 0; next.shrinkKey = '';
      return done();
    }

    next.staleStreak = 0;
    if (!cur.base) { next.display = snap; next.base = snap; next.source = 'live'; next.shrinkStreak = 0; next.shrinkKey = ''; return done(); }
    const d = diffHoldings(cur.base, snap), det = shrinkOf(cur.base, snap, d);

    let silentGone = null;
    if (det.suspicious) {
      if (holdShrink(det)) return done();
      silentGone = det.unexplained;
      events.push({ type: 'shrink_accepted', gone: det.unexplained.slice() });
    }
    next.shrinkStreak = 0; next.shrinkKey = ''; next.source = 'live';

    // 重新布防：本轮重新出现在 holdings 的地址（d.newAddrs）先从 alerted 里摘掉 'g:'+norm，之后它们再消失时能重新告警；'n:' 键保留（回来不当新增告警的预写仍有效）
    const rearm = new Set(d.newAddrs.map(a => 'g:' + a));
    const kept = rearm.size ? cur.alerted.filter(k => !rearm.has(k)) : cur.alerted;
    const seen = new Set(kept), alertNew = [], alertGone = [], alertCorrections = [], added = [];
    const mark = k => { if (seen.has(k)) return false; seen.add(k); added.push(k); return true; };
    // 接受收缩：无解释的消失静默（'g:'），同时以 'n:' 预写入（与回退一致），它们回到名单时不再当新增告警
    if (silentGone) { for (const a of silentGone) mark('g:' + a); for (const a of silentGone) mark('n:' + a); }
    for (const a of d.newAddrs) if (mark('n:' + a)) alertNew.push(a);
    for (const a of det.unexplained) if (mark('g:' + a)) alertGone.push(a);   // 勘误解释的消失不逐个记，见下
    for (const id of Object.keys(det.explainedByCorrection)) if (mark(correctionKey(id, det.explainedAddrs.get(id)))) alertCorrections.push({ id, count: det.explainedByCorrection[id] });
    next.alerted = kept.concat(added).slice(-ALERTED_MAX);
    next.display = snap; next.base = snap;
    if (d.addedCount > 0 || d.removedCount > 0 || d.newCount > 0 || d.goneCount > 0 || d.relistedCount > 0 || d.spreadCount > 0) events.push({ type: 'diff', diff: d, alertNew, alertGone, alertCorrections });
    return done();
  }

  // ---- 拉取：空响应≠空名单；维护 block / 503（含维护接口自身 503）一律不产出 snap，调用方沿用旧数据 ----
  // 返回 { mode, snap, errors, maintenance, maintUnknown }；maintUnknown=维护接口本次请求失败（浏览器读不到 x-maintenance，界面据此提示"维护状态未知"）
  // victims 地址总数为 0、reviewed items 为空 → 视为该接口失败（沿用 prev 同名字段、记入 errors），holdings 为空 → mode error
  // snap.frozen：mode===freeze 时为 true；冻结判定见 isFrozen（{on:false, mode:'freeze'} 不算），block 判定见 isBlock（on 为真且 mode==='block'）
  async function fetchAll({ fetchImpl = globalThis.fetch, base = BASE, timeoutMs = 20000, prev = null } = {}) {
    const get = async ep => {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      let timer;
      const tmo = new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error('timeout ' + timeoutMs + 'ms')); }, timeoutMs); });
      const run = (async () => {
        const res = await fetchImpl(base + ENDPOINTS[ep], ctl ? { cache: 'no-cache', signal: ctl.signal } : { cache: 'no-cache' });
        const status = typeof res.status === 'number' ? res.status : (res.ok === false ? 500 : 200);
        const hd = n => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(n) : null);
        const out = { status, snap: hd('x-snap-ts'), maint: hd('x-maintenance'), data: null, error: null };
        if (status < 200 || status >= 300) { out.error = 'HTTP ' + status; return out; }
        try { out.data = typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text()); }
        catch (e) { out.error = 'invalid JSON: ' + (e && e.message || e); }
        return out;
      })().catch(e => ({ status: 0, snap: null, maint: null, data: null, error: String(e && e.message || e) }));
      try { return await Promise.race([run, tmo]); }
      catch (e) { return { status: 0, snap: null, maint: null, data: null, error: String(e && e.message || e) }; }
      finally { clearTimeout(timer); }
    };
    const errors = [];
    const err = (endpoint, r, message) => errors.push({ endpoint, status: r.status, message });

    // 1) 维护状态：失败记 error 并标 maintUnknown；503 与 block 同样视为维护中，不再请求数据接口
    const mr = await get('maintenance');
    let maint = null;
    if (mr.error || !isObj(mr.data)) err('maintenance', mr, mr.error || 'unexpected response');
    else maint = mr.data;
    const maintUnknown = !maint;
    if (mr.status === 503) return { mode: 'block', snap: null, errors, maintenance: null, maintUnknown };
    if (isBlock(maint)) return { mode: 'block', snap: null, errors, maintenance: maint, maintUnknown };

    // 2) 并行拉其余 5 个
    const names = ['holdings', 'victims', 'reviewed', 'chains', 'corrections'];
    const valid = {
      holdings: validateHoldings, victims: d => isChainMap(d) && Object.keys(d).reduce((n, k) => n + d[k].length, 0) > 0,
      reviewed: d => isObj(d) && d.ok !== false && Array.isArray(d.items) && d.items.length > 0,
      chains: d => isObj(d) && d.ok !== false && Array.isArray(d.items),
      corrections: d => isObj(d) && d.ok !== false && Array.isArray(d.corrections)
    };
    const rs = await Promise.all(names.map(get)), R = {}, bad = {};
    names.forEach((n, i) => {
      R[n] = rs[i];
      const why = rs[i].error || (valid[n](rs[i].data) ? null : 'unexpected response (empty or malformed)');
      if (why) { bad[n] = true; err(n, rs[i], why); }
    });
    if (rs.some(r => r.status === 503)) return { mode: 'block', snap: null, errors, maintenance: maint, maintUnknown };
    // 3) holdings 不可用 → 不产出 snap
    if (bad.holdings) return { mode: 'error', snap: null, errors, maintenance: maint, maintUnknown };

    // 4) 其余接口失败 → 沿用 prev 同名字段
    const keep = (n, v) => (bad[n] || (n === 'maintenance' && !maint) ? (prev && prev[n] != null ? prev[n] : null) : v);
    const t = parseInt(R.holdings.snap, 10);
    const freeze = isFrozen(maint, rs.concat([mr]).some(r => r.maint === 'freeze'));
    const snap = {
      schema: SCHEMA, source: base, fetched_at: new Date().toISOString(), snap_ts: Number.isFinite(t) ? t : null, label: '实时', frozen: freeze,
      maintenance: keep('maintenance', maint), holdings: R.holdings.data,
      victims: keep('victims', R.victims.data), reviewed: keep('reviewed', R.reviewed.data),
      chains: keep('chains', R.chains.data), corrections: keep('corrections', R.corrections.data), history: []
    };
    return { mode: freeze ? 'freeze' : 'live', snap, errors, maintenance: maint, maintUnknown };
  }

  // Unix 秒 → 'YYYY-MM-DD HH:mm:ss'，固定 UTC+8，与系统时区无关
  function formatTs(unixSec) {
    const n = typeof unixSec === 'number' ? unixSec : parseFloat(unixSec);
    if (!isFinite(n)) return '—';
    const d = new Date((n + 8 * 3600) * 1000);
    if (isNaN(d.getTime())) return '—';
    const p = (x, w) => String(x).padStart(w || 2, '0');
    return p(d.getUTCFullYear(), 4) + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  }

  return {
    BASE, ENDPOINTS, EXPLORERS, explorerUrl, officialUrl, normAddr, addrKind, buildIndex, lookup, diffHoldings, validateHoldings, fetchAll, formatTs,
    describeGone, goneText, contentSig, isFrozen, detectShrink, reduceOfficial
  };
});
