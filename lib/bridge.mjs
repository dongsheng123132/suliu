/* 溯流 · 跨链解析（ESM 服务模块）。
 *
 * 只解析「已核实」的官方 API，不编造接口、不凭「同金额同时间」猜跨链对应。
 *
 * Across：官方 Tracking Deposits API
 *   GET https://across.to/api/deposit/status?originChainId=<int>&depositId=<string>
 *   GET https://across.to/api/deposit?originChainId=<int>&depositId=<string>        （完整明细：depositor / recipient / 金额 / 目标链）
 *   也支持只传 depositTxnRef（源交易哈希）。文档：https://docs.across.to/api-reference/deposit/status/get
 *   保留每一次响应的 raw、请求 URL（source）与查询时刻（retrieved_at）。
 *   状态归一化：filled / pending / refunded / expired / not_found / unknown 分开，绝不把退款当成完成。
 *
 * Chainflip：本轮未核实到稳定的公开查询 API → 明确 supported:false（unsupported），只给官方浏览器人工链接，不假装已自动解析。
 */
const ACROSS_BASE = 'https://across.to/api';
const ACROSS_SOURCE = 'Across 官方 API：GET /deposit/status 与 /deposit（https://docs.across.to/api-reference/deposit/status/get）';
const CHAINFLIP_EXPLORER = 'https://explorer.chainflip.io/';

const mkError = (code, message) => { const e = new Error(message); e.code = code; return e; };

/** 跨链服务原始状态 → 统一状态。不得把 refunded / expired 混成 filled。 */
export function normalizeStatus(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s === 'filled' || s === 'completed' || s === 'success') return 'filled';
  if (s === 'refunded' || s === 'refund') return 'refunded';
  if (s === 'expired') return 'expired';
  if (s === 'pending' || s === 'unfilled' || s === 'deposited' || s === 'in_progress' || s === 'processing') return 'pending';
  if (s === 'not_found' || s === 'depositnotfound') return 'not_found';
  return 'unknown';
}

const qs = params => Object.keys(params).filter(k => params[k] != null && params[k] !== '')
  .sort().map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]))).join('&');

async function httpJson(url, key, fetchImpl, signal) {
  const headers = {};
  if (key) headers.Authorization = 'Bearer ' + key;
  let res;
  try { res = await fetchImpl(url, { headers, signal }); }
  catch (e) {
    if (signal && signal.aborted) throw mkError('ABORT', '已中止');
    throw mkError('NETWORK', 'Across 请求失败：' + (e && e.message ? e.message : e));
  }
  if (res && res.ok === false && (res.status === 401 || res.status === 403)) throw mkError('AUTH', 'Across API 鉴权失败（HTTP ' + res.status + '）：需要可用的 Across API key（--key 或环境变量 ACROSS_API_KEY）');
  let body = null;
  try { body = res && typeof res.json === 'function' ? await res.json() : null; } catch (e) { body = null; }
  return { status: res && res.status != null ? res.status : 0, body };
}

/**
 * resolveAcross(o) → 归一化结果。o = { originChainId, depositId, depositTxnRef, key?, base?, fetchImpl?, retrievedAt?, signal? }
 * 结果字段：protocol / supported / status（归一化）/ status_raw / originChainId / destinationChainId /
 *          depositId / sourceTx / targetTx / refundTx / depositor / recipient / inputToken / inputAmount /
 *          outputToken / outputAmount / source（请求 URL）/ retrieved_at / raw（两次原始响应） / warnings
 */
export async function resolveAcross(o = {}) {
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const base = (o.base || ACROSS_BASE).replace(/\/+$/, '');
  const retrieved_at = (o.retrievedAt instanceof Date ? o.retrievedAt : new Date()).toISOString();
  const originChainId = o.originChainId == null || o.originChainId === '' ? null : Number(o.originChainId);
  const depositId = o.depositId == null || o.depositId === '' ? null : String(o.depositId);
  const depositTxnRef = o.depositTxnRef == null || o.depositTxnRef === '' ? null : String(o.depositTxnRef);

  if (!depositTxnRef && (originChainId == null || depositId == null)) {
    throw mkError('QUERY', 'Across 需要 originChainId + depositId，或只给 depositTxnRef');
  }
  const sel = depositTxnRef ? { depositTxnRef } : { originChainId, depositId };
  const statusUrl = base + '/deposit/status?' + qs(sel);
  const detailUrl = base + '/deposit?' + qs(sel);
  const warnings = [];

  // 两个接口各自独立：一个失败（含鉴权）不影响另一个已成功的结果；两个都失败才抛错。
  const tryJson = async url => {
    try { return await httpJson(url, o.key, fetchImpl, o.signal); }
    catch (e) { return { status: 0, body: null, error: e }; }
  };
  const [sr, dr] = await Promise.all([tryJson(statusUrl), tryJson(detailUrl)]);
  if (sr.error && dr.error) {
    const authErr = [sr.error, dr.error].find(e => e && e.code === 'AUTH');
    if (authErr) throw authErr;
    throw mkError('API', 'Across 接口不可用：' + sr.error.message + ' / ' + dr.error.message);
  }
  if (sr.error) warnings.push('状态接口失败：' + sr.error.message);
  if (dr.error) warnings.push('明细接口失败：' + dr.error.message);

  const statusBody = sr.status === 200 && sr.body && typeof sr.body === 'object' ? sr.body : null;
  const detailBody = dr.status === 200 && dr.body && typeof dr.body === 'object' ? (dr.body.deposit || dr.body) : null;

  // 两个接口都 404 / 空 → not_found（明确区别于 pending）
  if (!statusBody && !detailBody) {
    const notFound = (sr.status === 404 || dr.status === 404) || (sr.status === 200 || dr.status === 200);
    if (!notFound) {
      const bad = [sr, dr].find(r => r.status === 400);
      if (bad) throw mkError('QUERY', 'Across 查询参数不合法（HTTP 400）');
      throw mkError('API', 'Across 接口不可用（HTTP ' + sr.status + '/' + dr.status + '）');
    }
    return {
      protocol: 'across', supported: true, status: 'not_found', status_raw: null,
      originChainId, destinationChainId: null, depositId,
      sourceTx: depositTxnRef, targetTx: null, refundTx: null,
      depositor: null, recipient: null,
      inputToken: null, inputAmount: null, outputToken: null, outputAmount: null,
      source: statusUrl, detail_source: detailUrl, retrieved_at,
      raw: { status: sr.body, detail: dr.body }, warnings: warnings.concat(['Across 未找到该 deposit（not_found，不是 pending）'])
    };
  }

  const pick = (k) => (detailBody && detailBody[k] != null ? detailBody[k] : (statusBody && statusBody[k] != null ? statusBody[k] : null));
  const statusRaw = pick('status');
  const status = normalizeStatus(statusRaw);
  if (status === 'unknown' && statusRaw != null) warnings.push('Across 返回了未识别的状态：' + String(statusRaw) + '（原样保留，不猜测）');

  const refundTx = pick('depositRefundTxHash') || pick('depositRefundTxnRef') || null;
  // 一致性检查：filled 必须有目标交易；refunded 必须有退款交易
  if (status === 'filled' && !pick('fillTx') && !pick('fillTxnRef')) warnings.push('状态为 filled 但没有目标交易哈希，请人工核对');
  if ((status === 'refunded' || status === 'expired') && !refundTx) warnings.push('状态为 ' + status + ' 但没有退款交易哈希，请人工核对');

  return {
    protocol: 'across', supported: true,
    status, status_raw: statusRaw,
    originChainId: pick('originChainId') == null ? originChainId : Number(pick('originChainId')),
    destinationChainId: pick('destinationChainId') == null ? null : Number(pick('destinationChainId')),
    depositId: pick('depositId') == null ? depositId : String(pick('depositId')),
    sourceTx: pick('depositTxHash') || pick('depositTxnRef') || depositTxnRef || null,
    targetTx: pick('fillTx') || pick('fillTxnRef') || null,
    refundTx,
    depositor: pick('depositor') || null,
    recipient: pick('recipient') || null,
    inputToken: pick('inputToken') || null,
    inputAmount: pick('inputAmount') == null ? null : String(pick('inputAmount')),
    outputToken: pick('outputToken') || null,
    outputAmount: pick('outputAmount') == null ? null : String(pick('outputAmount')),
    source: statusUrl, detail_source: detailUrl, retrieved_at,
    raw: { status: sr.body, detail: dr.body }, warnings
  };
}

/** Chainflip：明确 unsupported，只给人工链接。 */
export function chainflipUnsupported(o = {}) {
  return {
    protocol: 'chainflip', supported: false, status: 'unsupported', status_raw: null,
    originChainId: o.originChainId == null ? null : Number(o.originChainId),
    destinationChainId: null, depositId: o.depositId == null ? null : String(o.depositId),
    sourceTx: o.depositTxnRef || null, targetTx: null, refundTx: null,
    depositor: null, recipient: null, inputToken: null, inputAmount: null, outputToken: null, outputAmount: null,
    source: '未找到稳定的公开 Chainflip 查询 API（官方提供的是节点 RPC 与 Broker API，需要自建节点或成为 broker；本轮不接）',
    detail_source: null,
    retrieved_at: (o.retrievedAt instanceof Date ? o.retrievedAt : new Date()).toISOString(),
    manual: {
      explorer: CHAINFLIP_EXPLORER,
      note: '请到 Chainflip 官方浏览器按存入交易人工核对目标链与收款地址；不要凭「同金额同时间」断定跨链对应。'
    },
    raw: null,
    warnings: ['Chainflip 本轮 unsupported：不假装已自动解析，需人工续查']
  };
}

/** 按协议分发；未知协议直接拒绝。 */
export function resolveBridge(o = {}) {
  const p = String(o.protocol == null ? 'across' : o.protocol).trim().toLowerCase();
  if (p === 'across') return resolveAcross(o);
  if (p === 'chainflip') return Promise.resolve(chainflipUnsupported(o));
  throw mkError('PROTOCOL', '不支持的跨链协议：' + p + '（支持：across / chainflip）');
}

export { ACROSS_BASE, ACROSS_SOURCE, CHAINFLIP_EXPLORER };
