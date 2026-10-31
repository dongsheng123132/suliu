/* 溯流 · 按链资产配置（UMD）：浏览器挂 window.SuliuChains，Node 下 module.exports；零依赖、无 ESM 语法，file:// 可用 <script src> 加载。
 *
 * 这是「每一条链」唯一的配置来源：原生币、代币白名单、区块浏览器链接、API 端点、Bitget 官方标签是否启用。
 * 铁律：任何非以太坊链都必须用自己这一份配置；绝不允许把 ETH 的白名单 / 原生币 / 链接套到别的链上。
 *
 * 代币白名单一律按「合约地址」判断（符号 / 名称都可以伪造）。合约地址来源见每条的 `src` 字段：
 *   - ETH：各发行方官方地址（Tether / Circle / MakerDAO / WETH / BitGo / Lido），可在 Etherscan 逐条核对。
 *   - BSC：Binance 官方 Pegged Token（BNB Smart Chain 官方桥接资产），可在 BscScan 逐条核对。
 *   - BTC：UTXO 链，无代币白名单；原生 BTC，区块浏览器用 mempool.space（Blockstream Esplora 的公开实例）。
 *
 * Bitget 官方标签（lib/official-data.js + data/official-snapshot.js）只对 ETH 生效（official: true）；其它链一律 false。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SuliuChains = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RE_EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
  const RE_EVM_TX = /^0x[0-9a-fA-F]{64}$/;
  // BTC 地址仅做「格式」校验（用于生成链接）；严格的 base58check / bech32 校验和在 lib/btc.mjs 里做。
  const RE_BTC_BASE58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
  const RE_BTC_BECH32 = /^(bc1|tb1|bcrt1)[02-9ac-hj-np-z]{11,71}$/i;
  const RE_BTC_TX = /^[0-9a-fA-F]{64}$/;
  // Tron 地址仅做「格式」校验（用于生成链接）；严格的 base58check 校验和在 lib/tron.mjs 里做。
  const RE_TRON_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  const RE_TRON_TX = /^[0-9a-fA-F]{64}$/;

  const ETH = {
    id: 'eth', name: 'Ethereum', kind: 'evm', chainid: 1,
    native: { symbol: 'ETH', decimals: 18, freezable: false },
    tokens: {
      '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, freezable: true, src: 'https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7' },
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, freezable: true, src: 'https://etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
      '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, freezable: false, src: 'https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f' },
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, freezable: false, src: 'https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, freezable: false, src: 'https://etherscan.io/token/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' },
      '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', decimals: 18, freezable: false, src: 'https://etherscan.io/token/0xae7ab96520de3a18e5e111b5eaab095312d7fe84' }
    },
    minValue: { ETH: 0.05, WETH: 0.05, stETH: 0.05, USDT: 100, USDC: 100, DAI: 100, WBTC: 0.002 },
    priceHints: { ETH: 3000, BTC: 60000 },
    api: { base: 'https://api.etherscan.io/v2/api', v2: true },
    explorer: { address: 'https://etherscan.io/address/', tx: 'https://etherscan.io/tx/' },
    official: true,
    sources: 'Etherscan API V2（chainid 1）；代币白名单来自各发行方官方合约'
  };

  const BSC = {
    id: 'bsc', name: 'BNB Smart Chain', kind: 'evm', chainid: 56,
    native: { symbol: 'BNB', decimals: 18, freezable: false },
    tokens: {
      '0x55d398326f99059ff775485246999027b3197955': { symbol: 'USDT', decimals: 18, freezable: false, src: 'https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955' },
      '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { symbol: 'USDC', decimals: 18, freezable: false, src: 'https://bscscan.com/token/0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
      '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': { symbol: 'WBNB', decimals: 18, freezable: false, src: 'https://bscscan.com/token/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' },
      '0x2170ed0880ac9a755fd29b2688956bd959f933f8': { symbol: 'ETH', decimals: 18, freezable: false, src: 'https://bscscan.com/token/0x2170ed0880ac9a755fd29b2688956bd959f933f8' },
      '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': { symbol: 'BTCB', decimals: 18, freezable: false, src: 'https://bscscan.com/token/0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c' },
      '0xe9e7cea3dedca5984780bafc599bd69add087d56': { symbol: 'BUSD', decimals: 18, freezable: false, src: 'https://bscscan.com/token/0xe9e7cea3dedca5984780bafc599bd69add087d56' }
    },
    minValue: { BNB: 0.05, WBNB: 0.05, ETH: 0.05, USDT: 100, USDC: 100, BUSD: 100, BTCB: 0.002 },
    priceHints: { BNB: 600, ETH: 3000, BTC: 60000 },
    api: { base: 'https://api.etherscan.io/v2/api', v2: true },
    explorer: { address: 'https://bscscan.com/address/', tx: 'https://bscscan.com/tx/' },
    official: false,
    sources: 'Etherscan API V2（chainid 56）；代币白名单来自 Binance 官方 Pegged Token（BNB Smart Chain 桥接资产）'
  };

  const BTC = {
    id: 'btc', name: 'Bitcoin', kind: 'utxo',
    native: { symbol: 'BTC', decimals: 8, freezable: false },
    tokens: {},
    minValue: { BTC: 0.0001 },
    priceHints: { BTC: 60000 },
    api: { base: 'https://mempool.space/api', v2: false, esplora: true },
    explorer: { address: 'https://mempool.space/address/', tx: 'https://mempool.space/tx/' },
    official: false,
    sources: 'Blockstream Esplora 公开 API（mempool.space 实例）；无代币白名单，原生 BTC'
  };

  const TRON = {
    id: 'tron', name: 'Tron', kind: 'account',
    native: { symbol: 'TRX', decimals: 6, freezable: false },
    tokens: {
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT', decimals: 6, freezable: true, src: 'https://tronscan.org/#/token20/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }
    },
    minValue: { TRX: 100, USDT: 100 },
    priceHints: { TRX: 0.1, USDT: 1 },
    api: { base: 'https://api.trongrid.io', v2: false, trongrid: true },
    explorer: { address: 'https://tronscan.org/#/address/', tx: 'https://tronscan.org/#/transaction/' },
    official: false,
    sources: 'TronGrid 公开 API（https://api.trongrid.io）；代币白名单仅 Tether 官方 USDT（TRC20）合约'
  };

  const CHAINS = { eth: ETH, bsc: BSC, btc: BTC, tron: TRON };
  const ALIASES = { ethereum: 'eth', mainnet: 'eth', bnb: 'bsc', bsc: 'bsc', binance: 'bsc', 'bnb-smart-chain': 'bsc', bitcoin: 'btc', btc: 'btc', tron: 'tron', trx: 'tron' };
  const CHAINID = { 1: 'eth', 56: 'bsc' };
  // 仅用于生成「目标链」链接的常见 EVM 浏览器（跨链结果里出现的目标链）。键是 EVM chainid。
  const EXPLORERS = {
    1: { address: 'https://etherscan.io/address/', tx: 'https://etherscan.io/tx/' },
    10: { address: 'https://optimistic.etherscan.io/address/', tx: 'https://optimistic.etherscan.io/tx/' },
    56: { address: 'https://bscscan.com/address/', tx: 'https://bscscan.com/tx/' },
    137: { address: 'https://polygonscan.com/address/', tx: 'https://polygonscan.com/tx/' },
    8453: { address: 'https://basescan.org/address/', tx: 'https://basescan.org/tx/' },
    42161: { address: 'https://arbiscan.io/address/', tx: 'https://arbiscan.io/tx/' },
    43114: { address: 'https://snowtrace.io/address/', tx: 'https://snowtrace.io/tx/' }
  };

  function freeze(o) {
    Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) freeze(o[k]); });
    return Object.freeze(o);
  }
  freeze(CHAINS);
  freeze(ETH.tokens); freeze(BSC.tokens);

  /** 返回链配置；未知返回 null。接受 id（'eth'/'bsc'/'btc'）、别名（'ethereum'/'bnb'…）或 EVM chainid（1/56）。 */
  function get(ref) {
    if (ref == null) return null;
    if (typeof ref === 'number') return CHAINS[CHAINID[ref]] || null;
    const s = String(ref).trim().toLowerCase();
    if (!s) return null;
    if (CHAINS[s]) return CHAINS[s];
    const alias = ALIASES[s];
    return alias ? CHAINS[alias] : null;
  }
  const resolve = get;
  // ids() 供 EVM / UTXO 工具链列出「支持链」提示；account 模型链（tron）通过 get() / explorerUrl() 单独取用，
  // 不混进 trace-eth 的 EVM 支持链列表（避免把 tron 当成 EVM 链）。注意：isSupported('tron') 仍为 true。
  const ids = () => Object.keys(CHAINS).filter(id => CHAINS[id].kind !== 'account');
  const isSupported = ref => !!get(ref);

  /** 生成区块浏览器链接；只拼校验过格式的地址 / 交易哈希，且按链取对应的浏览器。 */
  function explorerUrl(chainRef, kind, value) {
    const c = get(chainRef);
    if (!c || !c.explorer) return null;
    const v = String(value == null ? '' : value).trim();
    if (!v) return null;
    if (kind === 'address') {
      if (c.kind === 'utxo') { if (!(RE_BTC_BASE58.test(v) || RE_BTC_BECH32.test(v))) return null; }
      else if (c.kind === 'account') { if (!RE_TRON_ADDR.test(v)) return null; }
      else if (!RE_EVM_ADDR.test(v)) return null;
      return c.explorer.address + v;
    }
    if (kind === 'tx') {
      if (c.kind === 'utxo') { if (!RE_BTC_TX.test(v)) return null; }
      else if (c.kind === 'account') { if (!RE_TRON_TX.test(v)) return null; }
      else if (!RE_EVM_TX.test(v)) return null;
      return c.explorer.tx + v;
    }
    return null;
  }

  /** 按 EVM chainid 生成链接（跨链目标链可能不在 CHAINS 里，只在 EXPLORERS 里）。未知链返回 null。 */
  function linkByChainId(chainid, kind, value) {
    const id = CHAINID[Number(chainid)];
    if (id) return explorerUrl(id, kind, value);
    const ex = EXPLORERS[Number(chainid)];
    if (!ex) return null;
    const v = String(value == null ? '' : value).trim();
    if (!v) return null;
    if (kind === 'address') return RE_EVM_ADDR.test(v) ? ex.address + v : null;
    if (kind === 'tx') return RE_EVM_TX.test(v) ? ex.tx + v : null;
    return null;
  }

  return { CHAINS, EXPLORERS, get, resolve, ids, isSupported, explorerUrl, linkByChainId };
});
