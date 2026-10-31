/* 溯流 · Tron 公开交易追踪（ESM 服务模块，Node ≥ 20）。
 *
 * 数据源：TronGrid 公开 API（默认 https://api.trongrid.io），不需要 API key。
 *   设置环境变量 TRON_API_KEY 或命令行 --key 时，请求头加 TRON-PRO-API-KEY（付费档有更高频率）。
 * 端点：
 *   GET /v1/accounts/{address}/transactions          原生 TRX（只取 TransferContract）
 *   GET /v1/accounts/{address}/transactions/trc20    TRC20 转账（按合约白名单判断真假）
 *   GET /wallet/getaccount                           账户原生 TRX 余额
 * 分页用响应里的 meta.fingerprint，单页上限 200 条；查询带 only_confirmed=true。
 *
 * 金额一律保留整数最小单位（原生 TRX = SUN，6 位小数；USDT TRC20 = 6 位小数），同时给人类可读。
 * 只做「交易级」转账：列出每笔转账的发送方 / 接收方（链上事实）与金额，不推断：
 *   - 不推断地址身份归属（不把地址标成交易所 / 攻击者 / 受害方等）；
 *   - 不推断资金归属（不声称「被盗资金去了某地址」）；
 *   - USDT 是「可冻结稳定币」，但可冻结 ≠ 已冻结，本模块不查询、也不断言任何实际冻结状态。
 * 分页、调用预算、截断、确认状态、去重、失败原因都明确可见。
 *
 * 地址校验：主网 base58check（以 T 开头、34 字符），用 node:crypto 的 SHA-256 双重哈希验证校验和；
 * 校验失败直接报错，不做「去掉前缀再猜」。校验只判断地址格式与校验和是否合法，不涉及私钥。
 */
import { createHash } from 'node:crypto';

const DEFAULT_BASE = 'https://api.trongrid.io';
const EXPLORER = { address: 'https://tronscan.org/#/address/', tx: 'https://tronscan.org/#/transaction/' };
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const DECIMALS_TRX = 6;
const DECIMALS_USDT = 6;
const PAGE_LIMIT = 200; // TronGrid 单页上限

// ---------------- 哈希 / base58check ----------------
function sha256(buf) { return createHash('sha256').update(buf).digest(); }
function doubleSha256(buf) { return sha256(sha256(buf)); }

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(buf) {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of buf) num = num * 256n + BigInt(b);
  let s = '';
  while (num > 0n) { const r = Number(num % 58n); s = B58[r] + s; num = num / 58n; }
  return '1'.repeat(zeros) + s;
}
function base58Decode(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const c = B58.indexOf(str[i]);
    if (c < 0) return null;
    let carry = c;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry = carry >> 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry = carry >> 8; }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}
function base58checkDecode(str) {
  const raw = base58Decode(str);
  if (!raw || raw.length < 5) return null;
  const payload = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  if (!checksum.equals(doubleSha256(payload).subarray(0, 4))) return null;
  return payload;
}
function base58checkEncode(payload) {
  return base58Encode(Buffer.concat([payload, doubleSha256(payload).subarray(0, 4)]));
}

// ---------------- 地址校验 ----------------
/** 返回 {valid, network, type, reason}。主网地址：base58check，载荷 = 0x41 + 20 字节。 */
export function validateAddress(addr) {
  const invalid = reason => ({ valid: false, network: null, type: null, reason });
  if (typeof addr !== 'string') return invalid('不是字符串');
  const s = addr.trim();
  if (!s) return invalid('空地址');
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return invalid('不是合法的 Tron 主网地址（应以 T 开头、共 34 个 base58 字符）');
  const payload = base58checkDecode(s);
  if (!payload) return invalid('base58check 校验和不合法');
  if (payload.length !== 21 || payload[0] !== 0x41) return invalid('Tron 地址载荷应为 0x41 + 20 字节');
  return { valid: true, network: 'mainnet', type: 'account' };
}
export const isMainnetAddress = addr => validateAddress(addr).valid;
export const addressType = addr => validateAddress(addr).type;

/** 把 Tron 内部 hex 地址（0x41 + 20 字节，或裸 20 字节）转成 base58check 地址；不合法返回 null。 */
export function encodeAddressFromHex(hex) {
  const s = String(hex == null ? '' : hex).trim().replace(/^0x/i, '');
  let buf;
  if (/^41[0-9a-fA-F]{40}$/.test(s)) buf = Buffer.from(s, 'hex');
  else if (/^[0-9a-fA-F]{40}$/.test(s)) buf = Buffer.concat([Buffer.from([0x41]), Buffer.from(s, 'hex')]);
  else return null;
  return base58checkEncode(buf);
}

// ---------------- 小工具 ----------------
const shortAddr = a => (typeof a === 'string' && a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-6) : String(a || ''));
const intOr = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Math.trunc(Number(v)));
const mkError = (code, message) => { const e = new Error(message); e.code = code; return e; };
const sleepDefault = ms => new Promise(r => setTimeout(r, ms));

/** 整数最小单位字符串 → 人类可读（纯字符串运算，避免浮点精度丢失）。 */
export function humanAmount(minStr, decimals) {
  const s = String(minStr == null ? '' : minStr).trim();
  if (!/^\d+$/.test(s)) return '—';
  const dec = Math.max(0, Math.trunc(Number(decimals) || 0));
  if (dec === 0) return s;
  if (s.length <= dec) {
    const frac = s.padStart(dec, '0').replace(/0+$/, '');
    return frac ? '0.' + frac : '0';
  }
  const int = s.slice(0, s.length - dec);
  const frac = s.slice(s.length - dec).replace(/0+$/, '');
  return frac ? int + '.' + frac : int;
}
/** 整数最小单位字符串 → 带千分位的字符串（不转 Number，避免大额精度丢失）。 */
export function fmtMinUnits(s) {
  const str = String(s == null ? '' : s).trim();
  if (!/^\d+$/.test(str)) return '—';
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---------------- TronGrid 客户端 ----------------
export function createClient(o = {}) {
  const base = (o.base || DEFAULT_BASE).replace(/\/+$/, '');
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const key = String(o.key == null ? '' : o.key).trim();
  const minIntervalMs = o.minIntervalMs == null ? 250 : o.minIntervalMs;
  const sleep = o.sleepImpl || sleepDefault;
  let lastStart = 0;
  const client = { calls: 0, maxCalls: o.maxCalls == null ? 200 : o.maxCalls, base, key };

  async function get(path) {
    if (client.calls >= client.maxCalls) throw mkError('BUDGET', 'TronGrid 调用预算用完（' + client.calls + '/' + client.maxCalls + '）');
    const wait = lastStart + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    client.calls++;
    const url = base + path;
    const headers = {};
    if (key) headers['TRON-PRO-API-KEY'] = key;
    let res;
    try { res = await fetchImpl(url, { headers }); }
    catch (e) { throw mkError('NETWORK', 'TronGrid 请求失败：' + (e && e.message ? e.message : e)); }
    if (res && res.ok === false) {
      const status = res && res.status != null ? res.status : 0;
      if (status === 404) return null; // 地址 / 账户不存在 → null，由调用方处理
      if (status === 429) throw mkError('RATE', 'TronGrid 限流（HTTP 429）：无 key 时频率受限，可加大 --interval 或设置 TRON_API_KEY');
      if (status === 401 || status === 403) throw mkError('AUTH', 'TronGrid 鉴权失败（HTTP ' + status + '）：TRON-PRO-API-KEY 无效或未授权');
      throw mkError('HTTP', 'TronGrid HTTP ' + status);
    }
    let body;
    try { body = res && typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text()); }
    catch (e) { throw mkError('PARSE', 'TronGrid 响应不是 JSON：' + (e && e.message ? e.message : e)); }
    if (body && body.success === false) throw mkError('API', 'TronGrid 返回错误：' + (body.error || 'success=false'));
    return body;
  }

  client.getAccount = addr => get('/wallet/getaccount?address=' + encodeURIComponent(addr) + '&visible=true');
  client.getTransactions = (addr, fingerprint) => get('/v1/accounts/' + encodeURIComponent(addr) + '/transactions?limit=' + PAGE_LIMIT + '&only_confirmed=true' + (fingerprint ? '&fingerprint=' + encodeURIComponent(fingerprint) : ''));
  client.getTrc20Transactions = (addr, fingerprint) => get('/v1/accounts/' + encodeURIComponent(addr) + '/transactions/trc20?limit=' + PAGE_LIMIT + '&only_confirmed=true' + (fingerprint ? '&fingerprint=' + encodeURIComponent(fingerprint) : ''));
  return client;
}

// ---------------- 交易 → 规范化记录（纯函数） ----------------
/** 原生 TRX：只取 TransferContract；其它合约类型（智能合约调用）不计作原生转账。 */
export function normalizeNative(tx) {
  if (!tx || !tx.txID) return [];
  const contracts = tx.raw_data && Array.isArray(tx.raw_data.contract) ? tx.raw_data.contract : [];
  const ret = Array.isArray(tx.ret) ? tx.ret[0] : null;
  const contractRet = ret && ret.contractRet ? String(ret.contractRet) : null;
  const confirmed = tx.block_timestamp != null && tx.block_timestamp !== '';
  const block = tx.blockNumber != null && Number.isFinite(Number(tx.blockNumber)) ? Number(tx.blockNumber) : null;
  const ts = confirmed ? Math.floor(Number(tx.block_timestamp) / 1000) : null;
  const out = [];
  for (let ci = 0; ci < contracts.length; ci++) {
    const c = contracts[ci];
    if (!c || String(c.type) !== 'TransferContract') continue;
    const v = c.parameter && c.parameter.value ? c.parameter.value : {};
    const from = encodeAddressFromHex(v.owner_address);
    const to = encodeAddressFromHex(v.to_address);
    const amount = v.amount == null ? '0' : String(v.amount).trim();
    out.push({
      asset: 'TRX', contract: 'native', symbol: 'TRX', decimals: DECIMALS_TRX, freezable: false, whitelisted: true,
      amount_min: /^\d+$/.test(amount) ? amount : '0', amount_human: humanAmount(amount, DECIMALS_TRX),
      confirmed, block, ts, from, to, txid: tx.txID, note: '', contractRet
    });
  }
  return out;
}

/** TRC20 转账摘要：真假只按合约地址判断（符号可伪造）；非白名单合约标记 whitelisted=false，由调用方只计数。 */
export function normalizeTrc20(entry) {
  if (!entry || !entry.transaction_id) return null;
  const info = entry.token_info && typeof entry.token_info === 'object' ? entry.token_info : {};
  const contract = String(info.address || entry.contract_address || '').trim();
  const value = entry.value == null ? '0' : String(entry.value).trim();
  const decimals = info.decimals != null && Number.isFinite(Number(info.decimals)) ? Number(info.decimals) : 0;
  const whitelisted = contract === USDT_CONTRACT;
  const confirmed = entry.block_timestamp != null && entry.block_timestamp !== '';
  const ts = confirmed ? Math.floor(Number(entry.block_timestamp) / 1000) : null;
  const from = String(entry.from || '').trim() || null;
  const to = String(entry.to || '').trim() || null;
  return {
    asset: whitelisted ? 'USDT' : 'TRC20',
    contract, symbol: String(info.symbol || ''), decimals,
    freezable: whitelisted, whitelisted,
    amount_min: /^\d+$/.test(value) ? value : '0', amount_human: humanAmount(value, decimals),
    confirmed, block: null, ts, from, to, txid: entry.transaction_id,
    note: whitelisted ? '可冻结稳定币（可冻≠已冻）' : '', contractRet: null
  };
}

// ---------------- 追踪 ----------------
export async function trace(opts = {}) {
  opts = opts || {};
  const address = String(opts.address == null ? '' : opts.address).trim();
  const v = validateAddress(address);
  if (!v.valid) throw new TypeError('tron: 需要合法的 Tron 主网地址（收到：' + (address || '空') + '；' + v.reason + '）');

  const client = opts.client || createClient(opts);
  const maxTxs = Math.max(1, intOr(opts.maxTxs, 50));
  const minValue = Math.max(0, intOr(opts.minValue, 0));           // 最小单位阈值（SUN / USDT 最小单位）
  const maxPages = Math.max(1, intOr(opts.maxPages, 5));            // 每个数据源最多翻几页
  const nowFn = typeof opts.now === 'function' ? opts.now : () => new Date();
  const signal = opts.signal || null;
  const aborted = () => !!(signal && signal.aborted);
  const guard = () => { if (aborted()) throw mkError('ABORT', '已中止'); };
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const progress = msg => { if (onProgress) { try { onProgress({ calls: client.calls, maxCalls: client.maxCalls, msg }); } catch (e) {} } };

  const warnings = [], truncatedReasons = [];
  let truncated = false;
  const ignored = { nonWhitelistTrc20: 0, zeroValue: 0, belowMinValue: 0, duplicate: 0 };

  guard();
  progress('读取账户余额');
  const account = await client.getAccount(address).catch(e => { warnings.push('读取账户余额失败：' + e.message); return null; });
  const balanceSun = account && account.balance != null ? String(account.balance) : null;
  const accountType = account && account.type ? String(account.type) : null;

  // 去重键：同一条转账记录（原生按 txid；TRC20 同一交易可能有多条转账，带上 from/to/value）。
  const seen = new Set(), records = [];
  const pushRecord = rec => {
    const key = rec.asset + '|' + rec.txid + '|' + (rec.from || '') + '|' + (rec.to || '') + '|' + rec.amount_min;
    if (seen.has(key)) { ignored.duplicate++; return; }
    seen.add(key);
    records.push(rec);
  };
  const consider = rec => {
    if (!rec) return;
    if (rec.whitelisted === false) { ignored.nonWhitelistTrc20++; return; }
    if (rec.amount_min === '0') { ignored.zeroValue++; return; }
    if (minValue > 0 && /^\d+$/.test(rec.amount_min) && BigInt(rec.amount_min) < BigInt(minValue)) { ignored.belowMinValue++; return; }
    pushRecord(rec);
  };

  // 分页拉取：原生 TRX 与 TRC20 各自独立分页，统一去重、预算与页数上限。
  // 每个数据源至少读 1 页（避免原生 TRX 粉尘把上限占满后完全看不到 USDT），之后达到交易数上限就停。
  let capReached = false;
  const collect = async (label, getter, normalize) => {
    let fingerprint = null, pageCount = 0;
    while (true) {
      guard();
      if (client.calls >= client.maxCalls) { truncated = true; truncatedReasons.push('调用预算用完（' + client.calls + '/' + client.maxCalls + '），停止分页'); return; }
      if (pageCount >= maxPages) { truncated = true; truncatedReasons.push(label + ' 达到分页页数上限 ' + maxPages + ' 页，仍有更早记录未读取'); return; }
      if (pageCount > 0 && records.length >= maxTxs) { capReached = true; return; }
      const page = await getter(address, fingerprint).catch(e => {
        if (e && e.code === 'BUDGET') throw e;
        warnings.push('读取 ' + label + ' 分页失败：' + e.message); return null;
      });
      if (!page || !Array.isArray(page.data) || !page.data.length) return;
      for (const raw of page.data) {
        const recs = normalize(raw, address);
        if (Array.isArray(recs)) recs.forEach(consider);
        else consider(recs);
      }
      pageCount++;
      const next = page.meta && page.meta.fingerprint ? String(page.meta.fingerprint) : null;
      if (!next) return; // 没有下一页
      fingerprint = next;
    }
  };

  guard();
  progress('分页读取原生 TRX 转账');
  await collect('原生 TRX', (a, f) => client.getTransactions(a, f), normalizeNative);

  guard();
  progress('分页读取 TRC20 转账');
  await collect('TRC20', (a, f) => client.getTrc20Transactions(a, f), normalizeTrc20);

  // 排序：未确认在前（按 -1 区块），已确认按时间升序；同一秒按 txid 稳定排序。
  records.sort((a, b) => {
    const at = a.ts == null ? -1 : a.ts, bt = b.ts == null ? -1 : b.ts;
    return at - bt || String(a.txid || '').localeCompare(String(b.txid || ''));
  });
  // 单页最多 200 条，可能一次抓回远超 maxTxs；排序后截断到最早的 maxTxs 笔并明确标注。
  if (records.length > maxTxs) { records.splice(maxTxs); capReached = true; }
  if (capReached) {
    truncated = true;
    truncatedReasons.push('达到单次追踪的交易数上限 ' + maxTxs + ' 笔，只保留按时间最早的 ' + maxTxs + ' 笔，可能还有更早或其它类型转账未覆盖');
  }

  // 地址节点：主体 + 对手方（去重）；不推断任何地址的身份归属。
  const nodeById = new Map();
  const addNode = (addr, type, label) => {
    if (!addr) return null;
    const id = 'n' + nodeById.size;
    nodeById.set(addr, { id, addr, type, label: label || shortAddr(addr), note: '' });
    return id;
  };
  addNode(address, 'relay', '追踪起点（用户输入）');
  records.forEach(r => {
    [r.from, r.to].forEach(cp => { if (cp && cp !== address && !nodeById.has(cp)) addNode(cp, 'relay', null); });
  });

  // 每笔转账一行「交易级」明细：from / to 是链上事实，不代表地址归属或资金归属。
  const txRows = records.map((r, i) => {
    let note = r.note || '';
    if (r.contractRet && r.contractRet !== 'SUCCESS') note += (note ? '；' : '') + '失败（' + r.contractRet + '）';
    return {
      i, asset: r.asset, contract: r.contract, symbol: r.symbol, decimals: r.decimals, freezable: r.freezable,
      amount_min: r.amount_min, amount_human: r.amount_human,
      confirmed: r.confirmed, block: r.block, ts: r.ts,
      from: r.from, to: r.to, txid: r.txid, note
    };
  });

  const tracedAt = nowFn().toISOString();
  const reasons = Array.from(new Set(truncatedReasons)); // 两个数据源可能命中同一条预算原因，去重
  const facts = [
    ['起点', address],
    ['链', 'Tron（账户模型；原生 TRX + TRC20）'],
    ['数据来源', 'TronGrid 公开 API（' + client.base + '），抓取时间 ' + tracedAt],
    ['余额', balanceSun == null
      ? '—（读取失败或账户无原生余额）'
      : fmtMinUnits(balanceSun) + ' SUN（' + humanAmount(balanceSun, DECIMALS_TRX) + ' TRX；仅原生 TRX，TRC20 余额需单独查询合约）'],
    ['确认状态', '查询带 only_confirmed=true：已确认交易带区块 / 时间；未确认交易区块为「—」'],
    ['API 调用', client.calls + ' / ' + client.maxCalls + ' 次'],
    ['是否截断', truncated ? '是：' + reasons.join('；') : '否'],
    ['金额口径', '整数最小单位（TRX 与 USDT 均为 6 位小数），同时给出人类可读；只列转账的发送方与接收方（链上事实），不推断地址归属、不推断资金归属']
  ];
  const banner = [
    '<b>Tron 追踪</b> · 由 TronGrid 公开 API 实时拉取（无需 key）',
    '只列转账的发送方与接收方（链上事实），不推断地址归属、不推断资金归属；USDT 为可冻结稳定币（可冻≠已冻），本工具不判断任何实际冻结状态'
  ];

  return {
    case: {
      id: 'tron-' + address.slice(0, 12) + '-' + (accountType || 'live'),
      tab: 'Tron 追踪 ' + shortAddr(address), tabK: 'Tron 追踪', kind: 'real', unit: 'timestamp',
      chain: 'tron', focus: address,
      title: 'Tron 地址追踪 · ' + shortAddr(address), short: 'Tron 追踪 ' + shortAddr(address), en: 'Tron trace · ' + shortAddr(address),
      facts, banner,
      channels: '受害方官方举报渠道；相关交易所或协议的合规/安全联系人；执法机关',
      nodes: Array.from(nodeById.values()),
      txs: txRows
    },
    meta: {
      start: address, chain: 'tron', kind: 'account',
      params: { maxTxs, minValue, maxPages },
      calls: client.calls, maxCalls: client.maxCalls,
      truncated, truncatedReasons: reasons, warnings, ignored,
      traced_at: tracedAt,
      balance_sun: balanceSun,
      balance_trx: balanceSun == null ? null : humanAmount(balanceSun, DECIMALS_TRX),
      account_type: accountType,
      address_type: v.type,
      page_limit: PAGE_LIMIT
    }
  };
}

export { DEFAULT_BASE, EXPLORER, USDT_CONTRACT, DECIMALS_TRX, DECIMALS_USDT, PAGE_LIMIT, shortAddr, base58checkEncode, base58checkDecode };
