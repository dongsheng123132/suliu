#!/usr/bin/env node
/* 溯流 · 生成页面内置的 BTC / Tron 可切换案例数据（data/map-cases.js）。
 *
 * 为什么用生成器：cases/btc-binance-973.json 与 tests/fixtures/tron-demo 里含真实地址，
 * 由本脚本在磁盘上读取后直接写入 data/map-cases.js（地址不进生成器的源码、也不进任何日志）。
 * 页面（溯流资金画布.html）通过 <script src="data/map-cases.js"> 以 file:// 方式加载，零构建、零依赖。
 *
 * 产出约定（与页面 renderCanvas / renderTimeline / renderInspector / report.js 兼容）：
 *   - BTC：unit:'block'，chain:'btc'，官方名单 official:false；画「地址 → 交易 → 地址」二部图，
 *     交易节点 type:'tx'、label=txid 前 10 位、addr=完整 txid；金额用整数聪（sats），不推归属。
 *   - Tron：unit:'time'，chain:'tron'，official:false；时间轴用 Unix 秒时间戳；明确标「演示（合成数据）」；
 *     USDT 交易 flags:['freeze']（可冻结≠已冻结）；TRC20 无区块号写进 facts。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SELF));

function fmtCst(sec) {
  if (sec == null || sec === '' || !isFinite(Number(sec))) return '—';
  const d = new Date(Number(sec) * 1000 + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
}

// ---- BTC：从 cases/btc-binance-973.json 生成「地址 → 交易 → 地址」二部图 ----
function buildBtc(json) {
  const src = json.case;
  const focus = src.focus;

  // 地址节点：沿用源 JSON 的 id / addr / label / note；x / y 由本脚本按二部图布局补齐。
  const txNodes = src.txs.map((t, i) => ({
    id: 'tx' + i,
    type: 'tx',
    label: String(t.txid).slice(0, 10),
    addr: t.txid,
    x: 280,
    y: 60 + i * 150,
    sub: '区块 ' + t.block,
    note: fmtCst(t.ts) + '（UTC+8）；' + (t.note ? t.note + '；' : '') + '输入 ' + t.inputs.length + ' 笔合计 ' + t.total_in_sats + ' sats，输出 ' + t.outputs.length + ' 笔合计 ' + t.total_out_sats + ' sats，矿工费 ' + t.fee_sats + ' sats'
  }));

  // 布局：左侧=输入地址，中间=交易节点，右侧=输出地址。地址既当输入又当输出时，按首次出现的角色定列。
  const placed = new Map(); // id -> {x, y}
  let inY = 60, outY = 40;
  const placeLeft = id => { if (!placed.has(id)) { placed.set(id, { x: 0, y: inY }); inY += 150; } };
  const placeRight = id => { if (!placed.has(id)) { placed.set(id, { x: 560, y: outY }); outY += 60; } };

  // 源 JSON 里节点的 id 是 n0..n48，inputs/outputs 存的是 addr，不是 id；按 addr 映射回节点 id
  const idByAddr = new Map();
  src.nodes.forEach(n => idByAddr.set(n.addr, n.id));
  // 页面 / 报告里的 case.focus 约定是「节点 id」（Bitget: n04、币安: b1），不是地址
  const focusId = idByAddr.get(focus) || (src.nodes[0] && src.nodes[0].id);
  if (!focusId) throw new Error('BTC 案例找不到起点节点');

  const txs = [];
  src.txs.forEach((t, ti) => {
    const txId = 'tx' + ti;
    // 输入边：输入地址 → 交易节点
    t.inputs.forEach(ip => {
      const nid = ip.addr ? idByAddr.get(ip.addr) : null;
      if (!nid) return;
      placeLeft(nid);
      txs.push({ from: nid, to: txId, t: t.block, amt: String(ip.value_sats) + ' sats', eth: null, ts: t.ts, hash: t.txid, note: '输入（交易级）' });
    });
    // 输出边：交易节点 → 输出地址（跳过 OP_RETURN / 无地址的输出）
    t.outputs.forEach(op => {
      const nid = op.addr ? idByAddr.get(op.addr) : null;
      if (!nid) return;
      placeRight(nid);
      txs.push({ from: txId, to: nid, t: t.block, amt: String(op.value_sats) + ' sats', eth: null, ts: t.ts, hash: t.txid, note: '输出（交易级）' });
    });
  });

  // 把位置写回地址节点
  const addrNodes = src.nodes.map(n => {
    const o = { id: n.id, addr: n.addr, label: n.label, note: n.note || '', type: 'relay' };
    const p = placed.get(n.id) || { x: 0, y: inY };
    o.x = p.x; o.y = p.y;
    if (n.id === focusId) {
      o.note = (o.note ? o.note + '；' : '') + '被追踪的终点钱包：8 笔交易中均为接收方（输出方向），截至链头未发现转出。';
    }
    return o;
  });

  const nodes = addrNodes.concat(txNodes);
  // 按块升序（页面 computeTimes 会再排一次，这里保证顺序稳定）
  txs.sort((a, b) => a.t - b.t);

  return {
    id: 'btc',
    focus: focusId,
    tab: 'BTC 追踪',
    tabK: '真实·交易级',
    kind: 'real',
    unit: 'block',
    chain: 'btc',
    official: false,
    title: 'BTC 地址追踪 · bc1q0ts8…mkmfv3（币安侧）',
    short: 'BTC 币安侧追踪',
    en: 'BTC trace (Binance side, transaction-level)',
    facts: [
      ['起点', 'bc1q0ts8gaf9ht0rr4u02hr56f8thndqsc4kmkmfv3（终点钱包）'],
      ['链', 'Bitcoin（UTXO，交易级）'],
      ['数据来源', 'Blockstream Esplora 公开 API（https://mempool.space/api），抓取 2026-10-31T12:50:43Z'],
      ['数据截止', '链头高度 973976（抓取时）；8 笔交易覆盖区块 973732–973930'],
      ['覆盖', '交易级；单次追踪上限 8 笔，可能还有更早交易未覆盖（已截断）'],
      ['金额口径', '整数聪（satoshi）；只列交易级输入 / 输出，不推断找零、不把输入累加成被盗总额'],
      ['归属', '多输入多输出不构成资金归属证明；画「地址 → 交易 → 地址」二部图，不画地址到地址的归属边']
    ],
    banner: [
      '<b>BTC 追踪（真实数据）</b> · Blockstream Esplora 公开 API，交易级输入 / 输出',
      '金额为整数聪（satoshi）；多输入多输出不构成归属证明，不推找零、不推被盗总额'
    ],
    channels: '受害方官方举报渠道；币安合规 / 安全团队；执法机关',
    nodes,
    txs
  };
}

// ---- Tron：先跑 tools/tron.mjs --replay 拿结构，再转成页面 case（明确标注演示） ----
function buildTron() {
  const acc = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/tron-demo/account.json'), 'utf8'));
  const addr = acc.response.address;
  const tmp = join(ROOT, '.tmp-tron-case.json');
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/tron.mjs'), addr, '--replay', join(ROOT, 'tests/fixtures/tron-demo'), '--out', tmp, '--quiet'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('tron.mjs --replay 失败（exit ' + r.status + '）：' + (r.stderr || r.stdout || ''));
  const result = JSON.parse(readFileSync(tmp, 'utf8'));
  rmSync(tmp, { force: true });
  const src = result.case;
  const meta = result.meta;

  // 页面 / 报告里的 from / to / focus 都是「节点 id」，而 Tron 引擎的 case.txs 里存的是地址；这里统一映射。
  const idByAddr = new Map();
  src.nodes.forEach(n => idByAddr.set(n.addr, n.id));
  const focusId = idByAddr.get(src.focus) || (src.nodes[0] && src.nodes[0].id);
  if (!focusId) throw new Error('Tron 案例找不到起点节点');

  // 布局：起点在中间，左边来源、右边去向（3 笔转账、4 个地址，简单二列）
  const pos = {};
  pos[focusId] = { x: 280, y: 120 };
  let leftN = 0, rightN = 0;
  src.txs.forEach(t => {
    const fid = idByAddr.get(t.from), tid = idByAddr.get(t.to);
    if (fid && fid !== focusId && !pos[fid]) { pos[fid] = { x: 0, y: 60 + leftN * 150 }; leftN++; }
    if (tid && tid !== focusId && !pos[tid]) { pos[tid] = { x: 560, y: 40 + rightN * 150 }; rightN++; }
  });

  const nodes = src.nodes.map(n => {
    const p = pos[n.id] || { x: 0, y: 60 };
    const o = { id: n.id, type: 'relay', label: n.label, addr: n.addr, note: n.note || '', x: p.x, y: p.y };
    if (n.id === focusId) o.note = (o.note ? o.note + '；' : '') + '演示起点（合成数据，非真实地址）';
    return o;
  });

  const txs = src.txs.map(t => {
    const fid = idByAddr.get(t.from), tid = idByAddr.get(t.to);
    if (!fid || !tid) throw new Error('Tron 交易端点不在节点里：' + t.txid);
    const o = {
      from: fid, to: tid, t: t.ts,
      amt: String(t.amount_human) + ' ' + t.symbol,
      eth: null,
      ts: t.ts,
      hash: t.txid
    };
    if (t.freezable) o.flags = ['freeze'];
    o.note = (t.block != null ? '区块 ' + t.block + '；' : '') + (t.note || '') + (t.block == null ? '（TRC20 摘要无区块号）' : '');
    return o;
  });
  txs.sort((a, b) => a.t - b.t);

  return {
    id: 'tron',
    focus: focusId,
    tab: 'Tron 演示',
    tabK: '演示·合成数据',
    kind: 'real',
    unit: 'time',
    chain: 'tron',
    official: false,
    demo: true,
    title: 'Tron 交易级追踪 · 演示（合成数据）',
    short: 'Tron 演示',
    en: 'Tron synthetic demo (not a real case)',
    facts: [
      ['演示', '是——合成数据（tests/fixtures/tron-demo 夹具回放），不是真实案件，仅演示 Tron 追踪流程'],
      ['起点', src.focus],
      ['链', 'Tron（账户模型；原生 TRX + TRC20）'],
      ['数据来源', 'TronGrid 公开 API（https://api.trongrid.io），抓取 ' + meta.traced_at],
      ['余额', meta.balance_sun + ' SUN（' + meta.balance_trx + ' TRX；仅原生 TRX）'],
      ['金额口径', '整数最小单位（TRX / USDT 均为 6 位小数），同时给出人类可读；只列发送方与接收方（链上事实），不推断归属'],
      ['局限', 'TRC20 摘要无区块号：时间轴按时间戳排序，标签写「时间」而非「区块」；USDT 为可冻结稳定币（可冻≠已冻）']
    ],
    banner: [
      '<b>演示（合成数据）</b> · 不是真实案件，仅演示 Tron 追踪流程',
      '只列发送方与接收方（链上事实），不推断归属；USDT 可冻结（可冻≠已冻）'
    ],
    channels: '受害方官方渠道；相关交易所合规团队；执法机关',
    nodes,
    txs
  };
}

const btc = buildBtc(JSON.parse(readFileSync(join(ROOT, 'cases/btc-binance-973.json'), 'utf8')));
const tron = buildTron();
const out = join(ROOT, 'data/map-cases.js');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, '/* 由 tools/make-map-cases.mjs 生成：BTC 币安侧真实案例 + Tron 合成演示案例（页面内置可切换案例）。\n * 金额 / 地址 / 哈希都来自磁盘上的源数据；本文件不含任何脚本逻辑，只挂 window.SULIU_MAP_CASES。 */\nwindow.SULIU_MAP_CASES = ' + JSON.stringify([btc, tron], null, 2) + ';\n');
console.log('wrote ' + out);
