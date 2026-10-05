/* 溯流 · 以太坊地址追踪引擎（UMD）：浏览器挂 window.SuliuTrace，Node 下 module.exports；零依赖、无 ESM 语法，file:// 可用 <script src> 加载。
 * 数据只来自 Etherscan API V2（txlist / tokentx / txlistinternal / eth_getCode / getsourcecode），不抓网页、不用网页标签。
 * 官方名单（Bitget 官方快照）可选，由 official-data.js 提供：Node 下自动 require('./official-data.js')，浏览器下取 window.SuliuOfficial（须先于 trace 调用加载）。
 *
 * 判定铁律（来自 Bitget 案实测，改动前先看 tests/trace-eth.test.mjs）：
 *   1. 代币真假只按合约地址：符号可以仿（"ÚЅDТ"、带零宽字符的 "USD￰T"，甚至就叫 "USDT"），发送方也可以伪造。只认 TOKENS 白名单（以太坊主网）+ 原生 ETH（isError==='0'）。
 *   2. 金额为 0 / 低于阈值的转账、与图中已有地址「首 4 位 + 末 4 位」相同但不是同一地址的对手方 = 投毒，不跟进，只计数。
 *   3. 碰到协议金库 / 合约就停：先看官方名单，再 eth_getCode（0xef0100 开头的 EIP-7702 委托按普通地址），再 getsourcecode 取合约名按名字归类。
 *   4. 一次性充值通道（推断）：≥3 个不同来源收款、≥80% 转出归集到同一个终点 → 终点之前的节点标为充值通道，作为终点。
 * 美元折算（priceHints）只用于给对手方排序，不是成交价、不进入任何金额字段。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let off = null;
    try { off = require('./official-data.js'); } catch (e) { off = null; }
    module.exports = factory(root, off);
  } else root.SuliuTrace = factory(root, null);
})(typeof self !== 'undefined' ? self : this, function (root, nodeOfficial) {
  'use strict';

  const COL = 340, ROW = 100; // 与页面一致：列宽 340；同一跳内节点纵向间距 100
  const DEFAULT_BASE = 'https://api.etherscan.io/v2/api';
  const MAX_TX_PER_EDGE = 20; // 同一对（对手方, 资产）最多逐笔列出的笔数，其余折进 note

  // ---------------- 代币白名单（以太坊主网，按合约地址） ----------------
  const TOKENS = {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, freezable: true },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, freezable: true },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, freezable: false },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, freezable: false },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, freezable: false },
    '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', decimals: 18, freezable: false }
  };
  Object.keys(TOKENS).forEach(k => Object.freeze(TOKENS[k]));
  Object.freeze(TOKENS);
  const NATIVE = Object.freeze({ symbol: 'ETH', decimals: 18, freezable: false });
  const DEFAULT_MIN_VALUE = Object.freeze({ ETH: 0.05, WETH: 0.05, stETH: 0.05, USDT: 100, USDC: 100, DAI: 100, WBTC: 0.002 });
  const DEFAULT_PRICE_HINTS = Object.freeze({ ETH: 3000, BTC: 60000 });

  // ---------------- 小工具 ----------------
  const RE_ADDR = /^0x[0-9a-f]{40}$/i;
  const lc = a => (typeof a === 'string' && RE_ADDR.test(a.trim()) ? a.trim().toLowerCase() : null);
  const shortAddr = a => (a && a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : String(a || ''));
  /** Etherscan 行里的 timeStamp（Unix 秒，字符串）→ 数字；缺失 / 非法 / 非正数 → null */
  const tsOf = row => { const n = row && row.timeStamp != null && row.timeStamp !== '' ? Number(row.timeStamp) : NaN; return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null; };
  const intOr = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Math.trunc(Number(v)));
  const sleepDefault = ms => new Promise(r => setTimeout(r, ms));

  function scrub(text, key) {
    let s = String(text == null ? '' : text);
    if (key) s = s.split(String(key)).join('***');
    return s.replace(/(apikey=)[^&\s"'<>]+/gi, '$1***');
  }
  function mkError(code, message, key) {
    const e = new Error(scrub(message, key));
    e.code = code;
    return e;
  }

  function parseUnits(v, decimals) {
    const n = Number(String(v == null ? '' : v).trim() || '0');
    if (!Number.isFinite(n) || n < 0) return null;
    return n / Math.pow(10, decimals);
  }
  function fmtAmount(amount, symbol) {
    const digits = amount >= 1000 ? 2 : amount >= 1 ? 4 : 8;
    return amount.toLocaleString('en-US', { maximumFractionDigits: digits }) + ' ' + symbol;
  }

  /** 首 4 位 + 末 4 位 hex 相同但不是同一地址 → true（投毒 / 仿冒地址） */
  function isLookalike(a, b) {
    const x = lc(a), y = lc(b);
    if (!x || !y || x === y) return false;
    return x.slice(2, 6) === y.slice(2, 6) && x.slice(-4) === y.slice(-4);
  }

  // ---------------- 代码判定 ----------------
  /** EIP-7702 委托账户的代码是 0xef0100 + 20 字节委托地址，仍是 EOA */
  function isEip7702Code(code) { return typeof code === 'string' && /^0xef0100[0-9a-f]{40}$/i.test(code); }
  /** 非空且不是 EIP-7702 委托 → 合约 */
  function isContractCode(code) {
    if (typeof code !== 'string') return false;
    const c = code.trim().toLowerCase();
    if (c === '' || c === '0x' || c === '0x0') return false;
    return !isEip7702Code(c);
  }

  // ---------------- 转账分类（纯函数） ----------------
  /**
   * tokentx 一行 → {kind:'real'|'fakeToken'|'zeroValue'|'dust', symbol, decimals, freezable, amount, contract}
   * 只看 contractAddress：不在 TOKENS 白名单里一律 fakeToken，不管符号、tokenName、from 写的是谁。
   * 白名单代币的小数位用白名单里的，不信行里的 tokenDecimal。
   */
  function classifyTokenTransfer(row, minValue) {
    const contract = String((row && row.contractAddress) || '').toLowerCase();
    const tok = Object.prototype.hasOwnProperty.call(TOKENS, contract) ? TOKENS[contract] : null;
    if (!tok) return { kind: 'fakeToken', contract, symbol: row && row.tokenSymbol != null ? String(row.tokenSymbol) : '', amount: null };
    return classifyAmount(parseUnits(row.value, tok.decimals), tok, contract, minValue);
  }
  /** txlist / txlistinternal 一行 → 同上；isError 不是 '0' 的（失败交易）返回 kind:'failed' */
  function classifyNativeTransfer(row, minValue) {
    if (!row || String(row.isError) !== '0') return { kind: 'failed', symbol: 'ETH', amount: null };
    return classifyAmount(parseUnits(row.value, NATIVE.decimals), NATIVE, null, minValue);
  }
  function classifyAmount(amount, tok, contract, minValue) {
    const base = { symbol: tok.symbol, decimals: tok.decimals, freezable: tok.freezable, contract, amount };
    if (amount == null || amount === 0) return Object.assign(base, { kind: 'zeroValue', amount: amount == null ? 0 : amount });
    const min = minValue && Object.prototype.hasOwnProperty.call(minValue, tok.symbol) ? Number(minValue[tok.symbol]) : 0;
    if (amount < min) return Object.assign(base, { kind: 'dust' });
    return Object.assign(base, { kind: 'real' });
  }
  function usdOf(symbol, amount, price) {
    if (!(amount > 0)) return 0;
    const p = price || DEFAULT_PRICE_HINTS;
    if (symbol === 'ETH' || symbol === 'WETH' || symbol === 'stETH') return amount * (Number(p.ETH) || 0);
    if (symbol === 'WBTC') return amount * (Number(p.BTC) || 0);
    if (symbol === 'USDT' || symbol === 'USDC' || symbol === 'DAI') return amount;
    return 0;
  }

  // ---------------- 合约名 → 类型 ----------------
  /**
   * 合约名字启发式（只在没有官方标注时用，结论一律是"推断"）。
   * Chainflip → compliant；SpokePool/Bridge/Portal/Gateway… → bridge；Router/Swap/Uniswap… → dex；Tornado/Mixer → mixer；Vault → bridge（协议金库，需人工确认）；其它 → relay。
   */
  function classifyContractName(name) {
    const n = String(name || '').trim();
    if (!n) return { type: 'relay', unverified: true, why: '合约源码未验证（getsourcecode 无合约名）' };
    if (/chainflip/i.test(n)) return { type: 'compliant', why: '名字含 Chainflip' };
    if (/tornado|mixer|railgun|cyclone/i.test(n)) return { type: 'mixer', why: '名字含混币器关键词' };
    if (/spokepool|bridge|portal|gateway|wormhole|layerzero|stargate|thorchain|across|relayer|messenger/i.test(n)) return { type: 'bridge', why: '名字含跨链关键词' };
    if (/router|swap|uniswap|sushi|pancake|curve|balancer|aggregator|1inch|paraswap|cowswap|settlement|pair|pool/i.test(n)) return { type: 'dex', why: '名字含兑换关键词' };
    if (/vault/i.test(n)) return { type: 'bridge', why: '协议金库（未能确认所属协议，需人工判断）' };
    return { type: 'relay', why: '名字没有可识别的协议关键词，需人工查看' };
  }

  // 一次性充值通道常常是"部署后转发"的合约（Chainflip 的 Deposit 合约：getcode 非空，源码验证名就叫 Deposit）。
  // 这类合约仍记为终点，但会额外读一次它自己的转出，看是否集中归集到某个终点（只为找到去向，不展开别的对手方）。
  const FORWARDER_RE = /deposit|forwarder/i;

  // ---------------- 一次性充值通道启发式（纯函数） ----------------
  /**
   * sources：历史上给该地址转过钱（真资产、过阈值）的不同地址；outflows：[{to, usd}]（过阈值的真转出，按对手方聚合或不聚合均可）。
   * 命中：不同来源 ≥ minSources 且 去向最大的对手方占转出美元的 ≥ minShare。
   * isTerminal(addr)：去向是否是终点（合约 / 金库 / 交易所）。不传则不检查。
   * 返回 {match, sources, share, dest, total}；match 为 false 时 dest/share 仍给出最大对手方，便于排查。
   */
  function detectDepositChannel(o) {
    o = o || {};
    const minSources = o.minSources == null ? 3 : o.minSources, minShare = o.minShare == null ? 0.8 : o.minShare;
    const uniq = new Set((o.sources || []).map(a => lc(a) || String(a).toLowerCase()));
    const byTo = new Map();
    let total = 0;
    for (const f of o.outflows || []) {
      const to = lc(f && f.to) || String((f && f.to) || '').toLowerCase();
      const usd = Number(f && f.usd) || 0;
      if (!to || !(usd > 0)) continue;
      byTo.set(to, (byTo.get(to) || 0) + usd);
      total += usd;
    }
    let dest = null, best = 0;
    for (const [to, usd] of byTo) if (usd > best || (usd === best && dest !== null && to < dest)) { dest = to; best = usd; }
    const share = total > 0 ? best / total : 0;
    const okTerminal = typeof o.isTerminal === 'function' ? !!dest && !!o.isTerminal(dest) : !!dest;
    return { match: uniq.size >= minSources && share >= minShare && okTerminal, sources: uniq.size, share, dest, total };
  }

  // ---------------- 布局（纯函数） ----------------
  /**
   * levels[hop] = [id, ...]（同一跳内按给定顺序）→ {id:{x,y}}。x = 跳数×COL；同一跳内以 ROW=100 间距、以同一条水平中线居中；
   * 整体平移到最上面的节点 y=top（默认 40），使页面坐标全为正。
   */
  function layout(levels, opt) {
    opt = opt || {};
    const col = opt.col || COL, row = opt.row || ROW, top = opt.top == null ? 40 : opt.top;
    const pos = {};
    let minY = Infinity;
    (levels || []).forEach((ids, hop) => {
      (ids || []).forEach((id, i) => {
        const y = (i - (ids.length - 1) / 2) * row;
        pos[id] = { x: hop * col, y };
        if (y < minY) minY = y;
      });
    });
    if (!Number.isFinite(minY)) return pos;
    const shift = top - minY;
    Object.keys(pos).forEach(id => { pos[id].y = Math.round(pos[id].y + shift); });
    return pos;
  }

  /** 把请求 URL / 参数对象规范成与 apikey 无关的键（--record / --replay 用），参数按字母序 */
  function requestKey(urlOrParams) {
    let entries;
    if (typeof urlOrParams === 'string') {
      const u = new URL(urlOrParams);
      entries = Array.from(u.searchParams.entries());
    } else entries = Object.keys(urlOrParams || {}).map(k => [k, String(urlOrParams[k])]);
    return entries.filter(e => e[0].toLowerCase() !== 'apikey').sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
      .map(e => encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1])).join('&');
  }

  // ---------------- Etherscan 客户端 ----------------
  const RATE_RE = /max calls per sec|rate limit|too many requests/i;
  /**
   * createClient：限速（minIntervalMs）、遇限速退避重试（最多 retries=3 次）、预算（maxCalls，超出抛 code:'BUDGET'）。
   * key 只存在闭包里，不挂在返回对象上；所有错误消息会剥掉 key 与 apikey= 参数。
   * calls 只增不减：每一次真实发出的请求（含限速重试）都算一次。
   * 额外可选项：pageSize（默认 1000）、retries、backoffMs、sleepImpl（测试用）。
   */
  function createClient(o) {
    o = o || {};
    const key = o.key == null ? '' : String(o.key);
    const fetchImpl = o.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined);
    const chainid = o.chainid == null ? 1 : o.chainid;
    const minIntervalMs = o.minIntervalMs == null ? 350 : o.minIntervalMs;
    const base = o.base || DEFAULT_BASE;
    const retries = o.retries == null ? 3 : o.retries;
    const backoffMs = o.backoffMs == null ? 1200 : o.backoffMs;
    const sleep = o.sleepImpl || sleepDefault;
    const onCall = typeof o.onCall === 'function' ? o.onCall : null;
    let lastStart = 0;

    const client = {
      calls: 0,
      maxCalls: o.maxCalls == null ? 80 : o.maxCalls,
      chainid,
      pageSize: o.pageSize == null ? 1000 : o.pageSize
    };

    async function throttle() {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
    }

    async function request(params, ropts) {
      const signal = ropts && ropts.signal;
      for (let attempt = 0; ; attempt++) {
        if (signal && signal.aborted) throw mkError('ABORT', '已中止', key);
        if (client.calls >= client.maxCalls) throw mkError('BUDGET', 'API 调用预算用完（' + client.calls + '/' + client.maxCalls + '）', key);
        await throttle();
        if (signal && signal.aborted) throw mkError('ABORT', '已中止', key);
        client.calls++;
        const q = new URLSearchParams();
        q.set('chainid', String(chainid));
        Object.keys(params).forEach(k => { if (params[k] != null) q.set(k, String(params[k])); });
        q.set('apikey', key);
        if (onCall) { try { onCall({ n: client.calls, maxCalls: client.maxCalls, module: params.module, action: params.action, address: params.address || null }); } catch (e) { /* 回调出错不影响请求 */ } }

        let res, body;
        try {
          res = await fetchImpl(base + '?' + q.toString(), signal ? { signal } : undefined);
          if (res && res.ok === false && (res.status === 429 || res.status >= 500)) { body = { __http: res.status }; }
          else if (res && res.ok === false) throw mkError('HTTP', 'Etherscan HTTP ' + res.status, key);
          else body = typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text());
        } catch (e) {
          if (e && e.code === 'HTTP') throw e;
          if (signal && signal.aborted) throw mkError('ABORT', '已中止', key);
          throw mkError('NETWORK', 'Etherscan 请求失败：' + (e && e.message ? e.message : e), key);
        }

        const resultStr = body && typeof body.result === 'string' ? body.result : '';
        const msgStr = body && typeof body.message === 'string' ? body.message : '';
        const limited = (body && body.__http) || (body && body.status === '0' && (RATE_RE.test(resultStr) || RATE_RE.test(msgStr)));
        if (limited) {
          if (attempt >= retries) throw mkError('RATE_LIMIT', 'Etherscan 限速，重试 ' + retries + ' 次仍失败：' + (resultStr || msgStr || 'HTTP ' + body.__http), key);
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
        if (body && body.error) throw mkError('API', 'Etherscan ' + params.action + '：' + (body.error.message || JSON.stringify(body.error)), key);
        if (body && body.jsonrpc && 'result' in body) return body.result; // proxy 模块：JSON-RPC 风格
        if (body && body.status === '1') return body.result;
        if (body && body.status === '0' && /no transactions found|no records found/i.test(msgStr + ' ' + resultStr)) return [];
        throw mkError('API', 'Etherscan ' + params.action + '：' + (msgStr || 'NOTOK') + (resultStr ? ' ' + resultStr : ''), key);
      }
    }

    const list = action => async (addr, opts) => {
      opts = opts || {};
      const r = await request({
        module: 'account', action, address: addr,
        startblock: opts.startblock == null ? 0 : opts.startblock, endblock: opts.endblock == null ? 99999999 : opts.endblock,
        page: opts.page || 1, offset: opts.offset || client.pageSize, sort: opts.sort || 'asc'
      }, opts);
      return Array.isArray(r) ? r : [];
    };
    client.txlist = list('txlist');
    client.tokentx = list('tokentx');
    client.txlistinternal = list('txlistinternal');
    client.getcode = async (addr, opts) => {
      const r = await request({ module: 'proxy', action: 'eth_getCode', address: addr, tag: 'latest' }, opts);
      return typeof r === 'string' ? r : '0x';
    };
    client.getsourcecode = async (addr, opts) => {
      const r = await request({ module: 'contract', action: 'getsourcecode', address: addr }, opts);
      return (Array.isArray(r) && r[0] && typeof r[0] === 'object') ? r[0] : {};
    };
    return client;
  }

  // ---------------- 官方名单 → 节点信息 ----------------
  const NEXT_STEP = {
    compliant: '下一步：向该通道运营方的安全 / 合规联系人报告（附地址、交易哈希、区块、金额），并到其区块浏览器按存入交易查兑换后的目标链与收款地址',
    bridge: '下一步：到目标链继续追踪（按这笔存入交易查跨链后的收款地址）',
    dex: '下一步：兑换后的资产通常回到发起地址或指定接收地址，继续看发起地址之后的转出',
    cex: '下一步：立即通过受害方官方举报渠道和该交易所合规渠道报告，附地址、交易哈希、区块和金额，请求冻结对应账户',
    mixer: '下一步：记录面额和时间，为之后关联取出做准备',
    contract: '下一步：人工查看该合约的用途与资金去向',
    victim: '下一步：这是官方登记的受害钱包，无需展开',
    excluded: '官方已核查为非攻击者，不再展开'
  };

  function officialInfo(r, short) {
    if (!r) return null;
    const rv = r.entry && r.entry.reviewed;
    const chains = (r.chains || []).join('/') || (r.listChain || '');
    switch (r.status) {
      case 'spoof':
        return { poison: true, note: '与官方名单地址 ' + (r.spoofOf && r.spoofOf.norm) + ' 首尾相同，疑似仿冒' };
      case 'victim':
        return { type: 'victim', terminal: true, label: short, note: 'Bitget 官方 victims：受害钱包（' + chains + '）', reason: 'Bitget 官方 victims：受害钱包。' + NEXT_STEP.victim };
      case 'attacker':
        return { type: 'attacker', terminal: false, label: short, note: 'Bitget 官方 holdings：攻击者地址（' + chains + '）' };
      case 'reviewed_attacker_related':
        return { type: 'attacker', terminal: false, label: (rv && rv.name) || short, note: 'Bitget 官方 reviewed：' + ((rv && rv.name) || '') + '（与攻击者相关）' };
      case 'conflict':
        return { type: 'relay', terminal: true, label: (rv && rv.name) || short, note: 'Bitget 官方名单冲突：同时在 holdings 与 reviewed(not_attacker) 里，需人工核对官方看板', reason: '官方名单冲突，需人工核对' };
      case 'reviewed_not_attacker': {
        const cat = rv && rv.category, name = (rv && rv.name) || '';
        const base = 'Bitget 官方 reviewed：' + name;
        if (cat === 'poison') return { poison: true, note: base + '（投毒地址）' };
        if (cat === 'cex') return { type: 'cex', terminal: true, label: name || short, excluded: false, note: base + '（交易所）', reason: base + '。' + NEXT_STEP.cex };
        if (cat === 'vault') {
          const type = /chainflip|near/i.test(name) ? 'compliant' : 'bridge';
          return { type, terminal: true, excluded: true, label: name || short, note: base + '（协议金库；官方已核查，非攻击者）', reason: base + '（协议金库）。' + NEXT_STEP[type] };
        }
        return { type: 'relay', terminal: true, excluded: true, label: name || short, note: base + '（' + (cat || '其它') + '；官方已核查，非攻击者）', reason: base + '。' + NEXT_STEP.excluded };
      }
      default:
        return null;
    }
  }

  // ---------------- 追踪 ----------------
  const makeAbort = () => mkError('ABORT', '已中止');

  async function trace(opts) {
    opts = opts || {};
    const client = opts.client;
    if (!client || typeof client.txlist !== 'function') throw new TypeError('trace: 需要 client（createClient 的返回值）');
    const startAddr = lc(opts.start);
    if (!startAddr) throw new TypeError('trace: start 不是合法的以太坊地址');
    const startBlock = intOr(opts.startBlock, 0), endBlock = intOr(opts.endBlock, 99999999);
    if (startBlock > endBlock) throw new RangeError('trace: startBlock 大于 endBlock');
    const maxHops = Math.max(0, intOr(opts.maxHops, 3)), topK = Math.max(1, intOr(opts.topK, 5));
    const minValue = Object.assign({}, DEFAULT_MIN_VALUE, opts.minValue || {});
    const priceHints = Object.assign({}, DEFAULT_PRICE_HINTS, opts.priceHints || {});
    const signal = opts.signal || null, onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const nowFn = typeof opts.now === 'function' ? opts.now : () => new Date();
    const pageSize = client.pageSize || 1000;
    const OL = opts.officialLib || nodeOfficial || (root && root.SuliuOfficial) || null;

    const warnings = [], stoppedAt = [], truncatedReasons = [];
    const ignored = { fakeToken: 0, zeroValue: 0, dust: 0, poison: 0, belowTopK: 0 };
    let index = null;
    if (opts.official) {
      if (opts.official.byAddr && typeof opts.official.byAddr.get === 'function') index = opts.official;
      else if (OL && typeof OL.buildIndex === 'function') index = OL.buildIndex(opts.official);
      else warnings.push('官方名单未加载（缺少 official-data.js / window.SuliuOfficial），本次没有做官方名单核对');
    }

    const nodes = new Map(), order = [], txs = [];
    let expandedCount = 0;
    const queue = [];
    const aborted = () => !!(signal && signal.aborted);
    const progress = msg => {
      if (!onProgress) return;
      try { onProgress({ calls: client.calls, maxCalls: client.maxCalls, visited: expandedCount, queue: queue.length, msg }); } catch (e) { /* 回调出错不影响追踪 */ }
    };
    const guard = () => { if (aborted()) throw makeAbort(); };
    const cOpts = signal ? { signal } : {};

    function addNode(addr, depth, info, arrival) {
      const rec = Object.assign({ id: 'n' + order.length, addr, depth, arrival, expanded: false, terminal: false }, info);
      nodes.set(addr, rec);
      order.push(rec);
      return rec;
    }

    // ---- 对手方分类（带缓存；官方名单优先，其次 getcode / getsourcecode） ----
    const clsCache = new Map();
    let apiClassifications = 0; // 真正走了 API 的分类次数（官方名单命中、缓存命中不算），用来限制每个节点检查多少个对手方
    const lookupOfficial = addr => (index && OL && typeof OL.lookup === 'function' ? OL.lookup(index, addr) : null);
    async function classify(addr) {
      if (clsCache.has(addr)) return clsCache.get(addr);
      const short = shortAddr(addr);
      const r = lookupOfficial(addr);
      const off = officialInfo(r, short);
      if (off) { off.official = true; clsCache.set(addr, off); return off; }
      guard();
      apiClassifications++;
      progress('eth_getCode ' + short);
      const code = await client.getcode(addr, cOpts);
      let info;
      if (!isContractCode(code)) {
        if (isEip7702Code(code)) {
          info = { type: 'relay', terminal: false, label: short, note: 'EIP-7702 委托账户（eth_getCode 以 0xef0100 开头，委托到 0x' + code.slice(8) + '），按普通地址展开' };
        } else info = { type: 'relay', terminal: false, label: short, note: '普通地址（eth_getCode 为空），自动展开' };
      } else {
        guard();
        progress('getsourcecode ' + short);
        const src = await client.getsourcecode(addr, cOpts);
        let name = String(src.ContractName || '').trim(), via = '';
        if ((src.Proxy === '1' || /proxy/i.test(name)) && lc(src.Implementation)) {
          guard();
          progress('getsourcecode（实现合约）' + shortAddr(lc(src.Implementation)));
          const impl = await client.getsourcecode(lc(src.Implementation), cOpts);
          const iname = String(impl.ContractName || '').trim();
          if (iname) { via = name ? name + ' → ' : ''; name = iname; }
        }
        const cn = classifyContractName(name);
        const label = name || short;
        const shown = via + (name || '未验证合约');
        info = {
          type: cn.type, terminal: true, label, contract: true, forwarder: FORWARDER_RE.test(name),
          note: '合约：' + shown + '（getsourcecode）；' + cn.why + '；按名字推断，非官方标注',
          reason: '合约：' + shown + '，' + cn.why + '，一律为终点。' + NEXT_STEP[cn.type === 'relay' ? 'contract' : cn.type]
        };
      }
      if (r && r.status === 'retracted' && info) info.note += '；Bitget 官方勘误曾将其从黑名单移除，请以官方为准';
      clsCache.set(addr, info);
      return info;
    }

    // ---- 起点 ----
    const startShort = shortAddr(startAddr);
    const startOff = officialInfo(lookupOfficial(startAddr), startShort);
    const startInfo = { type: 'relay', label: startShort, note: '起点（用户输入）', terminal: false };
    if (startOff && !startOff.poison) {
      startInfo.type = startOff.type; startInfo.label = startOff.label || startShort; startInfo.excluded = startOff.excluded; startInfo.official = true;
      startInfo.note = '起点（用户输入）；' + startOff.note;
    }
    const startNode = addNode(startAddr, 0, startInfo, startBlock);
    queue.push(startNode);

    // ---- 展开一个节点：全部成功才提交，中途失败（预算 / 中止 / 网络）整体回滚 ----
    async function expand(node) {
      const A = node.addr, opt = Object.assign({ startblock: node.arrival, endblock: endBlock }, cOpts);
      progress('展开 ' + shortAddr(A) + '（区块 ≥ ' + node.arrival + '）');
      guard();
      const rowsTx = await client.txlist(A, opt);
      guard();
      const rowsTok = await client.tokentx(A, opt);
      guard();
      const rowsInt = await client.txlistinternal(A, opt);

      const local = { fakeToken: 0, zeroValue: 0, dust: 0, poison: 0, belowTopK: 0 };
      const localWarn = [];
      [['txlist', rowsTx], ['tokentx', rowsTok], ['txlistinternal', rowsInt]].forEach(p => {
        if (p[1].length >= pageSize) localWarn.push(shortAddr(A) + ' 的 ' + p[0] + ' 返回 ' + p[1].length + ' 行，达到单页上限 ' + pageSize + '，更晚的转账可能没有覆盖');
      });

      const known = new Set(nodes.keys());
      const poisonCache = new Map();
      const isPoisonCp = cp => {
        if (poisonCache.has(cp)) return poisonCache.get(cp);
        let hit = false;
        for (const k of known) if (isLookalike(cp, k)) { hit = true; break; }
        if (!hit) { const r = lookupOfficial(cp); hit = !!(r && r.status === 'spoof'); }
        poisonCache.set(cp, hit);
        return hit;
      };
      const out = new Map(); // cp → {addr, usd, first, assets: Map(symbol → {symbol, freezable, usd, transfers[]})}
      const srcs = new Set();

      const take = (row, cls, native) => {
        const from = lc(row.from), to = lc(row.to);
        if (from !== A && to !== A) return;
        if (from === A && to === A) return;
        if (to === A) { // 入账：只用来统计"不同来源"（真资产、过阈值）
          if (from && cls.kind === 'real') srcs.add(from);
          return;
        }
        if (!to) return; // 合约创建
        if (cls.kind === 'failed') return;
        if (cls.kind === 'fakeToken') { local.fakeToken++; return; }
        if (cls.kind === 'zeroValue') {
          if (native && row.input && row.input !== '0x') return; // 带 calldata 的 0 值调用不是转账，真实转账在 tokentx 里
          local.zeroValue++; return;
        }
        if (isPoisonCp(to)) { local.poison++; return; }
        if (cls.kind === 'dust') { local.dust++; return; }
        let c = out.get(to);
        if (!c) out.set(to, c = { addr: to, usd: 0, first: Infinity, assets: new Map() });
        let a = c.assets.get(cls.symbol);
        if (!a) c.assets.set(cls.symbol, a = { symbol: cls.symbol, freezable: cls.freezable, usd: 0, total: 0, transfers: [] });
        const blk = Number(row.blockNumber), usd = usdOf(cls.symbol, cls.amount, priceHints);
        a.transfers.push({ block: blk, hash: row.hash, amount: cls.amount, ts: tsOf(row) });
        a.total += cls.amount; a.usd += usd; c.usd += usd;
        if (blk < c.first) c.first = blk;
      };
      rowsTx.forEach(r => take(r, classifyNativeTransfer(r, minValue), true));
      rowsInt.forEach(r => take(r, classifyNativeTransfer(r, minValue), true));
      rowsTok.forEach(r => take(r, classifyTokenTransfer(r, minValue), false));

      const cands = Array.from(out.values()).sort((x, y) => (y.usd - x.usd) || (x.first - y.first) || (x.addr < y.addr ? -1 : 1));
      const plan = []; // {cp, info|null(已知节点), existing}
      let channel = null;

      // 充值通道（推断）。官方已认定的地址（攻击者 / 受害方 / 已核查）不套用推断，以官方为准；
      // 转发合约（node.forwarder）本身就是通道的证据，不再要求 ≥3 个来源，只要求 ≥80% 转出归集到同一个终点。
      const isFwd = !!node.forwarder;
      if (!node.official && cands.length && (isFwd || srcs.size >= 3)) {
        const det = detectDepositChannel({ sources: Array.from(srcs), outflows: cands.map(c => ({ to: c.addr, usd: c.usd })), minSources: isFwd ? 0 : 3, minShare: 0.8 });
        if (det.match) {
          const ex = nodes.get(det.dest);
          const dinfo = ex || await classify(det.dest);
          if (dinfo && dinfo.terminal && !dinfo.forwarder) {
            channel = { dest: det.dest, share: det.share, sources: det.sources, dinfo };
            plan.push({ cp: out.get(det.dest), info: dinfo, existing: ex || null });
          }
        }
      }

      if (!channel && !isFwd) {
        // 名额 topK 只给"新出现的、可继续展开的"对手方；终点（合约 / 金库 / 交易所）与已在图中的地址不占名额，但检查次数有上限 topK*3
        let slots = 0, examined = 0, full = false;
        const maxExamine = topK * 3;
        for (const c of cands) {
          const ex = nodes.get(c.addr);
          if (ex) { plan.push({ cp: c, info: ex, existing: ex }); continue; } // 已在图中：只补边，不重复展开
          if (full || slots >= topK || examined >= maxExamine) { full = true; local.belowTopK++; continue; }
          const before = apiClassifications;
          guard();
          const info = await classify(c.addr);
          if (apiClassifications > before) examined++;
          if (info.poison) { local.poison += Array.from(c.assets.values()).reduce((n, a) => n + a.transfers.length, 0); continue; }
          if (!info.terminal) slots++;
          plan.push({ cp: c, info, existing: null });
        }
      }

      // ---- 提交 ----
      expandedCount++;
      node.expanded = true;
      Object.keys(local).forEach(k => { ignored[k] += local[k]; });
      localWarn.forEach(w => warnings.push(w));
      if (local.belowTopK) warnings.push(shortAddr(A) + '：另有 ' + local.belowTopK + ' 个对手方（按美元折算排序，仅用于排序）排在前 ' + topK + ' 个可展开对手方之外，未检查也未展开');

      for (const p of plan) {
        const c = p.cp;
        let to = p.existing;
        if (!to) {
          to = addNode(c.addr, node.depth + 1, {
            type: p.info.type, label: p.info.label || shortAddr(c.addr), note: p.info.note, excluded: p.info.excluded,
            terminal: !!p.info.terminal, reason: p.info.reason, official: !!p.info.official, forwarder: !!p.info.forwarder
          }, c.first);
          if (to.forwarder) queue.push(to); // 终点合约，但要读一次转出找归集去向；stoppedAt 在它被处理后再记
          else if (to.terminal) stoppedAt.push({ addr: to.addr, reason: p.info.reason || '终点' });
          else queue.push(to);
        } else if (!to.expanded && c.first < to.arrival) to.arrival = c.first;
        // 边：每个资产逐笔列出（最多 MAX_TX_PER_EDGE 笔），其余折进最后一笔的 note
        for (const a of Array.from(c.assets.values()).sort((x, y) => y.usd - x.usd)) {
          const ts = a.transfers.slice().sort((x, y) => x.block - y.block);
          const shown = ts.slice(0, MAX_TX_PER_EDGE);
          shown.forEach((t, k) => {
            const tx = {
              from: node.id, to: to.id, t: t.block, ts: t.ts, amt: fmtAmount(t.amount, a.symbol),
              eth: (a.symbol === 'ETH' || a.symbol === 'WETH') ? Math.round(t.amount * 1e6) / 1e6 : null,
              hash: t.hash, flags: a.freezable ? ['freeze'] : []
            };
            if (k === shown.length - 1 && ts.length > shown.length) tx.note = '同一对地址还有 ' + (ts.length - shown.length) + ' 笔 ' + a.symbol + ' 转账未逐笔列出，合计 ' + fmtAmount(a.total, a.symbol);
            txs.push(tx);
          });
        }
      }

      if (channel) {
        const pct = Math.round(channel.share * 100);
        const dname = channel.dinfo.label || shortAddr(channel.dest);
        node.note = (node.note ? node.note + '；' : '') + '充值通道（推断）：' + (isFwd ? '转发合约，' : '') + '历史上 ' + channel.sources + ' 个不同来源，' + pct + '% 转出归集到 ' + dname;
        node.channel = true;
        stoppedAt.push({ addr: A, reason: '充值通道（推断）→ ' + dname + '（' + channel.sources + ' 个不同来源，' + pct + '% 转出归集），视为终点。' + (NEXT_STEP[channel.dinfo.type] || '') });
      } else if (isFwd) {
        stoppedAt.push({ addr: A, reason: (node.reason || '合约，终点') + '；读了它的转出，没有 ≥80% 集中归集到某个终点，到此为止' });
      }
    }

    // ---- BFS 主循环 ----
    let truncated = false, consecutiveErrors = 0;
    const markRest = reason => queue.splice(0).forEach(n => stoppedAt.push({ addr: n.addr, reason }));
    progress('开始追踪 ' + startShort);
    while (queue.length) {
      if (aborted()) {
        truncated = true; truncatedReasons.push('已中止（AbortSignal）'); markRest('已中止，未展开'); break;
      }
      const node = queue.shift();
      if (node.depth >= maxHops) { stoppedAt.push({ addr: node.addr, reason: node.forwarder ? (node.reason || '合约，终点') + '；已达最大跳数 ' + maxHops + '，未追它的归集去向' : '已达最大跳数 ' + maxHops + '，未继续展开' }); continue; }
      try {
        await expand(node);
        consecutiveErrors = 0;
      } catch (e) {
        if (e && e.code === 'BUDGET') {
          truncated = true; truncatedReasons.push('API 调用预算用完（' + client.calls + '/' + client.maxCalls + '），剩余节点未展开');
          stoppedAt.push({ addr: node.addr, reason: '预算用完，未展开' }); markRest('预算用完，未展开'); break;
        }
        if ((e && e.code === 'ABORT') || aborted()) {
          truncated = true; truncatedReasons.push('已中止（AbortSignal）');
          stoppedAt.push({ addr: node.addr, reason: '已中止，未展开' }); markRest('已中止，未展开'); break;
        }
        consecutiveErrors++;
        if (node === startNode || consecutiveErrors >= 3) throw e;
        warnings.push(shortAddr(node.addr) + ' 展开失败：' + (e && e.message ? e.message : e));
        stoppedAt.push({ addr: node.addr, reason: '展开失败：' + (e && e.message ? e.message : e) });
      }
    }
    progress(truncated ? '已截断，返回部分结果' : '追踪完成');

    // ---- 组装 case ----
    const tracedAt = nowFn().toISOString();
    const levels = [];
    order.forEach(n => { (levels[n.depth] = levels[n.depth] || []).push(n.id); });
    const pos = layout(levels.map(l => l || []));
    const caseNodes = order.map(n => {
      const o = { id: n.id, type: n.type, label: n.label || shortAddr(n.addr), addr: n.addr, x: pos[n.id].x, y: pos[n.id].y, note: n.note || '' };
      if (n.excluded) o.excluded = true;
      return o;
    });
    const rangeText = '区块 ' + startBlock + ' – ' + (endBlock >= 99999999 ? '最新' : endBlock) + '；最多 ' + maxHops + ' 跳，每个节点最多展开 ' + topK + ' 个对手方';
    const result = {
      case: {
        id: 'trace-' + startAddr.slice(0, 8) + '-' + startBlock,
        tab: '追踪 ' + startShort, tabK: '自动追踪', kind: 'real', unit: 'block', focus: startNode.id,
        title: '地址追踪 · ' + startShort, short: '追踪 ' + startShort, en: 'Auto trace · ' + startShort,
        facts: [
          ['起点', startAddr],
          ['范围', rangeText],
          ['数据来源', 'Etherscan API V2（chainid ' + (client.chainid == null ? 1 : client.chainid) + '），抓取时间 ' + tracedAt],
          ['API 调用', client.calls + ' / ' + client.maxCalls + ' 次'],
          ['是否截断', truncated ? '是：' + truncatedReasons.join('；') : '否'],
          ['金额说明', '美元折算只用于给对手方排序，不是成交价；代币真假只按合约地址判断（白名单：USDT / USDC / DAI / WETH / WBTC / stETH + 原生 ETH）']
        ],
        banner: ['<b>自动追踪</b> · 由 Etherscan API 实时拉取', '自动结果可能漏判或误判，提交举报前请人工复核'],
        channels: '受害方官方举报渠道；相关交易所或协议的合规/安全联系人；执法机关',
        nodes: caseNodes,
        txs
      },
      meta: {
        start: startAddr,
        params: { startBlock, endBlock, maxHops, topK, minValue, priceHints },
        calls: client.calls, maxCalls: client.maxCalls,
        truncated, truncatedReasons, warnings, stoppedAt, ignored,
        traced_at: tracedAt
      }
    };
    return result;
  }

  return {
    TOKENS, NATIVE, DEFAULT_MIN_VALUE, DEFAULT_PRICE_HINTS, COL, ROW,
    createClient, trace,
    classifyTokenTransfer, classifyNativeTransfer, classifyContractName, isEip7702Code, isContractCode, isLookalike,
    detectDepositChannel, layout, requestKey, usdOf, fmtAmount, shortAddr
  };
});
