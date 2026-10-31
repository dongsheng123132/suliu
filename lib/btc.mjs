/* 溯流 · Bitcoin 公开 UTXO 追踪（ESM 服务模块，Node ≥ 20）。
 *
 * 数据源：公开 Esplora API（默认 mempool.space 实例），不需要 API key。
 * 金额一律是整数 satoshi。只做「交易级」输入 / 输出与确认状态，不推断：
 *   - 多输入多输出交易里，**不声称某个输入支付了某个输出**；
 *   - 不推断找零归属（哪个输出是找零、归谁，均不猜测）；
 *   - 不把输入金额累加成「被盗总额」（多个输入可能混有无关资金）。
 * 分页、调用预算、截断、确认状态、去重、失败原因都明确可见。
 *
 * 地址校验：base58check（P2PKH / P2SH）用 node:crypto 的 SHA-256 双重哈希验证校验和；
 *           bech32 / bech32m（P2WPKH / P2WSH / P2TR）用 bech32 多项式校验（无需哈希）。
 * 校验不涉及私钥，也不从地址反推公钥；只判断「地址格式与校验和是否合法」。
 */
import { createHash } from 'node:crypto';

const DEFAULT_BASE = 'https://mempool.space/api';
const EXPLORER = { address: 'https://mempool.space/address/', tx: 'https://mempool.space/tx/' };

// ---------------- 哈希 ----------------
function sha256(buf) { return createHash('sha256').update(buf).digest(); }
function doubleSha256(buf) { return sha256(sha256(buf)); }

// ---------------- base58check ----------------
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

// ---------------- bech32 / bech32m ----------------
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_CONST = 1, BECH32M_CONST = 0x2bc830a3;
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function bech32Polymod(values) {
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const out = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}
function convertBits(data, fromBits, toBits, pad) {
  let acc = 0, bits = 0;
  const ret = [], maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; ret.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits > 0) ret.push((acc << (toBits - bits)) & maxv); }
  else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) return null;
  return ret;
}
function bech32Decode(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null; // 混合大小写无效
  const l = s.toLowerCase();
  const pos = l.lastIndexOf('1');
  if (pos < 1 || pos + 7 > l.length || l.length > 90) return null;
  const hrp = l.slice(0, pos);
  const data = [];
  for (const ch of l.slice(pos + 1)) { const d = BECH32_CHARSET.indexOf(ch); if (d < 0) return null; data.push(d); }
  const poly = bech32Polymod(bech32HrpExpand(hrp).concat(data));
  let encoding;
  if (poly === BECH32_CONST) encoding = 'bech32';
  else if (poly === BECH32M_CONST) encoding = 'bech32m';
  else return null;
  const values = data.slice(0, -6);
  const witver = values[0];
  if (witver > 16) return null;
  const program = convertBits(values.slice(1), 5, 8, false);
  if (!program || program.length < 2 || program.length > 40) return null;
  if (encoding === 'bech32' && witver !== 0) return null;
  if (encoding === 'bech32m' && witver === 0) return null;
  return { hrp, witver, program, encoding };
}
function bech32Checksum(hrp, data, encoding) {
  const const_ = encoding === 'bech32m' ? BECH32M_CONST : BECH32_CONST;
  const poly = bech32Polymod(bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0])) ^ const_;
  const out = [];
  for (let i = 0; i < 6; i++) out.push((poly >>> (5 * (5 - i))) & 31);
  return out;
}
function bech32Encode(hrp, witver, program) {
  const encoding = witver === 0 ? 'bech32' : 'bech32m';
  const data = [witver].concat(convertBits(program, 8, 5, true));
  const chars = data.concat(bech32Checksum(hrp, data, encoding)).map(v => BECH32_CHARSET[v]);
  return hrp + '1' + chars.join('');
}

// ---------------- 地址校验 ----------------
const HRP_NET = { bc: 'mainnet', tb: 'testnet', bcrt: 'regtest' };

/** 返回 {valid, network, type, reason}。type ∈ p2pkh|p2sh|p2wpkh|p2wsh|p2tr */
export function validateAddress(addr) {
  const invalid = (reason) => ({ valid: false, network: null, type: null, reason });
  if (typeof addr !== 'string') return invalid('不是字符串');
  const s = addr.trim();
  if (!s) return invalid('空地址');

  // bech32 / bech32m：只按已知 HRP 前缀识别（bc / tb / bcrt），避免误把含 '1' 的 base58 地址当 bech32
  if (/^(bc|tb|bcrt)1[02-9ac-hj-np-z]+$/i.test(s)) {
    const d = bech32Decode(s);
    if (!d) return invalid('bech32 校验和或格式不合法');
    const network = HRP_NET[d.hrp] || null;
    if (!network) return invalid('未知的 bech32 前缀：' + d.hrp);
    if (d.witver === 0 && d.program.length === 20) return { valid: true, network, type: 'p2wpkh' };
    if (d.witver === 0 && d.program.length === 32) return { valid: true, network, type: 'p2wsh' };
    if (d.witver === 1 && d.program.length === 32) return { valid: true, network, type: 'p2tr' };
    return { valid: true, network, type: 'witness v' + d.witver + '（' + d.program.length + ' 字节）' };
  }

  // base58check
  if (/^[13mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(s)) {
    const payload = base58checkDecode(s);
    if (!payload) return invalid('base58check 校验和不合法');
    const v = payload[0];
    const net = v === 0x00 || v === 0x05 ? 'mainnet' : (v === 0x6f || v === 0xc4 ? 'testnet' : null);
    if (v === 0x00 || v === 0x6f) return { valid: true, network: net, type: 'p2pkh' };
    if (v === 0x05 || v === 0xc4) return { valid: true, network: net, type: 'p2sh' };
    return { valid: true, network: net, type: 'base58（version 0x' + v.toString(16) + '）' };
  }

  return invalid('不是合法的比特币地址格式');
}
export const isMainnetAddress = addr => { const v = validateAddress(addr); return v.valid && v.network === 'mainnet'; };
export const addressType = addr => validateAddress(addr).type;

// ---------------- 生成地址（仅用于测试与演示数据，不涉及私钥） ----------------
export function encodeP2pkh(hash160) { return base58Encode(Buffer.concat([Buffer.from([0x00]), Buffer.from(hash160), doubleSha256(Buffer.concat([Buffer.from([0x00]), Buffer.from(hash160)])).subarray(0, 4)])); }
export function encodeP2sh(scriptHash) { return base58Encode(Buffer.concat([Buffer.from([0x05]), Buffer.from(scriptHash), doubleSha256(Buffer.concat([Buffer.from([0x05]), Buffer.from(scriptHash)])).subarray(0, 4)])); }
export function encodeP2wpkh(hash160) { return bech32Encode('bc', 0, Buffer.from(hash160)); }
export function encodeP2wsh(sha256) { return bech32Encode('bc', 0, Buffer.from(sha256)); }
export function encodeP2tr(xonly) { return bech32Encode('bc', 1, Buffer.from(xonly)); }

// ---------------- 小工具 ----------------
const shortAddr = a => (typeof a === 'string' && a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-6) : String(a || ''));
const intOr = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Math.trunc(Number(v)));
const mkError = (code, message) => { const e = new Error(message); e.code = code; return e; };
const sleepDefault = ms => new Promise(r => setTimeout(r, ms));

// ---------------- Esplora 客户端 ----------------
export function createClient(o = {}) {
  const base = (o.base || DEFAULT_BASE).replace(/\/+$/, '');
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const minIntervalMs = o.minIntervalMs == null ? 250 : o.minIntervalMs;
  const sleep = o.sleepImpl || sleepDefault;
  let lastStart = 0;
  const client = { calls: 0, maxCalls: o.maxCalls == null ? 200 : o.maxCalls, base };

  async function get(path) {
    if (client.calls >= client.maxCalls) throw mkError('BUDGET', 'Esplora 调用预算用完（' + client.calls + '/' + client.maxCalls + '）');
    const wait = lastStart + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    client.calls++;
    const url = base + path;
    let res;
    try { res = await fetchImpl(url); }
    catch (e) { throw mkError('NETWORK', 'Esplora 请求失败：' + (e && e.message ? e.message : e)); }
    if (res && res.ok === false) {
      const status = res && res.status != null ? res.status : 0;
      if (status === 404) return null; // 地址 / 交易不存在 → null，由调用方处理
      throw mkError('HTTP', 'Esplora HTTP ' + status);
    }
    try { return res && typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text()); }
    catch (e) { throw mkError('PARSE', 'Esplora 响应不是 JSON：' + (e && e.message ? e.message : e)); }
  }

  client.getAddress = addr => get('/address/' + encodeURIComponent(addr));
  client.getAddressTxs = addr => get('/address/' + encodeURIComponent(addr) + '/txs');
  client.getAddressTxsChain = (addr, lastTxid) => get('/address/' + encodeURIComponent(addr) + '/txs/chain' + (lastTxid ? '/' + lastTxid : ''));
  client.getAddressTxsMempool = addr => get('/address/' + encodeURIComponent(addr) + '/txs/mempool');
  client.getTx = txid => get('/tx/' + txid);
  client.tipHeight = () => get('/blocks/tip/height');
  return client;
}

// ---------------- 交易 → 规范化记录（纯函数） ----------------
function normalizeTx(tx, subject) {
  const status = tx && tx.status ? tx.status : {};
  const confirmed = status.confirmed === true;
  const inputs = Array.isArray(tx.vin) ? tx.vin.map(v => ({
    address: (v && v.prevout && v.prevout.scriptpubkey_address) || null,
    value_sats: v && v.prevout && Number.isFinite(Number(v.prevout.value)) ? Math.trunc(Number(v.prevout.value)) : 0
  })) : [];
  const outputs = Array.isArray(tx.vout) ? tx.vout.map(v => ({
    address: (v && v.scriptpubkey_address) || null,
    value_sats: v && Number.isFinite(Number(v.value)) ? Math.trunc(Number(v.value)) : 0
  })) : [];
  const totalIn = inputs.reduce((n, i) => n + (i.value_sats || 0), 0);
  const totalOut = outputs.reduce((n, o) => n + (o.value_sats || 0), 0);
  const normSubj = subject.trim();
  return {
    txid: tx.txid || null,
    confirmed,
    block_height: confirmed ? (status.block_height == null ? null : Number(status.block_height)) : null,
    block_time: confirmed && status.block_time != null ? Number(status.block_time) : null,
    fee_sats: tx.fee != null && Number.isFinite(Number(tx.fee)) ? Math.trunc(Number(tx.fee)) : null,
    inputs, outputs,
    total_in_sats: totalIn, total_out_sats: totalOut,
    involves_subject_as_input: inputs.some(i => i.address === normSubj),
    involves_subject_as_output: outputs.some(o => o.address === normSubj)
  };
}

/** 对手方地址集合：去重、排除主体地址、排除空 / OP_RETURN（null）地址 */
function counterparties(record, subject) {
  const s = new Set(), normSubj = subject.trim();
  for (const x of record.inputs.concat(record.outputs)) if (x.address && x.address !== normSubj) s.add(x.address);
  return Array.from(s);
}

// ---------------- 追踪 ----------------
export async function trace(opts = {}) {
  opts = opts || {};
  const address = String(opts.address == null ? '' : opts.address).trim();
  const v = validateAddress(address);
  if (!v.valid || v.network !== 'mainnet') throw new TypeError('btc: 需要合法的比特币主网地址（收到：' + (address || '空') + '）');

  const client = opts.client || createClient(opts);
  const maxTxs = Math.max(1, intOr(opts.maxTxs, 25));
  const minSats = Math.max(0, intOr(opts.minSats, 0));
  const nowFn = typeof opts.now === 'function' ? opts.now : () => new Date();
  const signal = opts.signal || null;
  const aborted = () => !!(signal && signal.aborted);
  const guard = () => { if (aborted()) throw mkError('ABORT', '已中止'); };
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const progress = msg => { if (onProgress) { try { onProgress({ calls: client.calls, maxCalls: client.maxCalls, msg }); } catch (e) {} } };

  const warnings = [], truncatedReasons = [];
  let truncated = false;
  const ignored = { zeroValueOutput: 0, belowMinSats: 0, noAddress: 0, duplicate: 0 };

  guard();
  progress('读取地址信息与链头高度');
  const [info, tip] = await Promise.all([
    client.getAddress(address).catch(e => { warnings.push('读取地址信息失败：' + e.message); return null; }),
    client.tipHeight().catch(e => { warnings.push('读取链头高度失败：' + e.message); return null; })
  ]);
  const tipHeight = Number.isFinite(Number(tip)) ? Number(tip) : null;

  // 交易收集：先 mempool（未确认），再链上（已确认，按 25 条 / 页分页）。去重按 txid。
  const seen = new Set(), records = [];
  const pushTx = tx => {
    if (!tx || !tx.txid || seen.has(tx.txid)) { if (tx && tx.txid && seen.has(tx.txid)) ignored.duplicate++; return; }
    seen.add(tx.txid);
    records.push(normalizeTx(tx, address));
  };

  guard();
  progress('读取未确认交易');
  const mempool = await client.getAddressTxsMempool(address).catch(e => { warnings.push('读取未确认交易失败：' + e.message); return null; });
  (Array.isArray(mempool) ? mempool : []).forEach(pushTx);

  guard();
  progress('分页读取链上交易');
  let lastTxid = null, pageCount = 0;
  while (records.length < maxTxs) {
    guard();
    if (client.calls >= client.maxCalls) { truncated = true; truncatedReasons.push('调用预算用完（' + client.calls + '/' + client.maxCalls + '），停止分页'); break; }
    const page = await client.getAddressTxsChain(address, lastTxid).catch(e => {
      if (e && e.code === 'BUDGET') throw e;
      warnings.push('读取链上交易分页失败：' + e.message); return null;
    });
    if (!Array.isArray(page) || !page.length) break;
    page.forEach(pushTx);
    pageCount++;
    if (page.length < 25) break;
    lastTxid = page[page.length - 1].txid;
    if (!lastTxid) break;
  }
  if (records.length >= maxTxs && !truncated) {
    // 达到上限时无法确定是否还有更早的交易（不再多发一次探测请求），保守地标注可能未覆盖。
    truncated = true;
    truncatedReasons.push('达到单次追踪的交易数上限 ' + maxTxs + ' 笔，可能还有更早的交易未覆盖');
  }

  // 排序：未确认在前（按 0 区块），已确认按区块高度升序
  records.sort((a, b) => ((a.block_height == null ? -1 : a.block_height) - (b.block_height == null ? -1 : b.block_height)) || ((a.block_time || 0) - (b.block_time || 0)));

  // 组装地址节点：主体 + 对手方（去重）
  const nodeById = new Map();
  const addNode = (addr, type, label) => {
    if (!addr) return null;
    const id = 'n' + nodeById.size;
    nodeById.set(addr, { id, addr, type, label: label || shortAddr(addr), note: '' });
    return id;
  };
  addNode(address, 'relay', '追踪起点（用户输入）');
  const seenCp = new Set();
  records.forEach(r => counterparties(r, address).forEach(cp => { if (!seenCp.has(cp)) { seenCp.add(cp); addNode(cp, 'relay', null); } }));

  // 每笔交易生成一行「交易级」明细：不给 from→to 归属；只列输入 / 输出与金额
  const txRows = records.map((r, i) => {
    const ins = r.inputs.filter(x => x.address).map(x => ({ addr: x.address, value_sats: x.value_sats }));
    const outs = r.outputs.map(x => ({ addr: x.address || null, value_sats: x.value_sats }));
    outs.forEach(o => { if (!o.addr) ignored.noAddress++; if (o.value_sats === 0) ignored.zeroValueOutput++; if (minSats > 0 && o.value_sats > 0 && o.value_sats < minSats) ignored.belowMinSats++; });
    return {
      i, txid: r.txid, confirmed: r.confirmed, block: r.block_height, ts: r.block_time,
      fee_sats: r.fee_sats, total_in_sats: r.total_in_sats, total_out_sats: r.total_out_sats,
      inputs: ins, outputs: outs,
      note: (r.involves_subject_as_input ? '本地址作为输入（转出方向）' : '') + (r.involves_subject_as_output ? (r.involves_subject_as_input ? '；' : '') + '本地址作为输出（接收方向）' : '')
    };
  });

  const tracedAt = nowFn().toISOString();
  const facts = [
    ['起点', address],
    ['链', 'Bitcoin（UTXO）'],
    ['数据来源', 'Esplora 公开 API（' + client.base + '），抓取时间 ' + tracedAt],
    ['链头高度', tipHeight == null ? '—（读取失败）' : tipHeight],
    ['确认状态', '已确认交易带区块高度与时间；未确认交易区块为「—」'],
    ['API 调用', client.calls + ' / ' + client.maxCalls + ' 次'],
    ['是否截断', truncated ? '是：' + truncatedReasons.join('；') : '否'],
    ['金额口径', '整数 satoshi；只列交易级输入 / 输出，不推断哪个输入支付哪个输出、不推断找零归属、不把输入金额累加成被盗总额']
  ];
  const banner = ['<b>BTC 追踪</b> · 由 Esplora 公开 API 实时拉取（无需 key）', '多输入多输出交易不构成资金归属证明，提交举报前请人工复核'];

  return {
    case: {
      id: 'btc-' + address.slice(0, 12) + '-' + (tipHeight == null ? 'live' : tipHeight),
      tab: 'BTC 追踪 ' + shortAddr(address), tabK: 'BTC 追踪', kind: 'real', unit: 'block',
      chain: 'btc', focus: address,
      title: 'BTC 地址追踪 · ' + shortAddr(address), short: 'BTC 追踪 ' + shortAddr(address), en: 'BTC trace · ' + shortAddr(address),
      facts, banner,
      channels: '受害方官方举报渠道；相关交易所或协议的合规/安全联系人；执法机关',
      nodes: Array.from(nodeById.values()),
      txs: txRows
    },
    meta: {
      start: address, chain: 'btc', kind: 'utxo',
      params: { maxTxs, minSats },
      calls: client.calls, maxCalls: client.maxCalls,
      truncated, truncatedReasons, warnings, ignored,
      traced_at: tracedAt, tip_height: tipHeight,
      address_type: v.type, chain_stats: info && info.chain_stats ? info.chain_stats : null
    }
  };
}

export { DEFAULT_BASE, EXPLORER, shortAddr, normalizeTx, counterparties };
