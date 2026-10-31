import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Chains = require('../lib/chains.js');

const ETH_USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const BSC_USDT = '0x55d398326f99059ff775485246999027b3197955';
const EVM_ADDR = '0x' + '11'.repeat(20);
const EVM_TX = '0x' + 'ab'.repeat(32);
const BTC_ADDR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const BTC_TX = 'ab'.repeat(32);

test('chains：ETH / BSC / BTC 配置互相隔离（native / 白名单 / 浏览器链接）', () => {
  const eth = Chains.get('eth'), bsc = Chains.get('bsc'), btc = Chains.get('btc');
  assert.equal(eth.native.symbol, 'ETH');
  assert.equal(bsc.native.symbol, 'BNB');
  assert.equal(btc.native.symbol, 'BTC');
  assert.notEqual(eth.tokens, bsc.tokens, '不同链不共用同一份白名单对象');
  assert.ok(Object.prototype.hasOwnProperty.call(eth.tokens, ETH_USDT), 'ETH 有 ETH USDT');
  assert.ok(!Object.prototype.hasOwnProperty.call(bsc.tokens, ETH_USDT), 'ETH 的 USDT 合约不能出现在 BSC 白名单');
  assert.ok(Object.prototype.hasOwnProperty.call(bsc.tokens, BSC_USDT), 'BSC 有 BSC USDT');
  assert.ok(!Object.prototype.hasOwnProperty.call(eth.tokens, BSC_USDT), 'BSC 的 USDT 合约不能出现在 ETH 白名单');
  assert.equal(eth.official, true, 'Bitget 标签只默认在 ETH 启用');
  assert.equal(bsc.official, false);
  assert.equal(btc.official, false);
  assert.equal(eth.chainid, 1);
  assert.equal(bsc.chainid, 56);
  // 每条白名单都带来源
  for (const c of [eth, bsc]) for (const k of Object.keys(c.tokens)) assert.ok(c.tokens[k].src && /^https:\/\//.test(c.tokens[k].src), '缺少官方来源：' + k);
});

test('chains：get / resolve 支持 id、别名与 EVM chainid；未知返回 null', () => {
  assert.equal(Chains.get('eth').id, 'eth');
  assert.equal(Chains.get('Ethereum').id, 'eth');
  assert.equal(Chains.get('BNB').id, 'bsc');
  assert.equal(Chains.get('bitcoin').id, 'btc');
  assert.equal(Chains.get(1).id, 'eth');
  assert.equal(Chains.get(56).id, 'bsc');
  assert.equal(Chains.resolve('bsc').id, 'bsc');
  assert.equal(Chains.get('solana'), null);
  assert.equal(Chains.get(999), null);
  assert.equal(Chains.get(null), null);
  assert.deepEqual(Chains.ids().sort(), ['bsc', 'btc', 'eth', 'tron']);
  assert.equal(Chains.isSupported('bsc'), true);
  assert.equal(Chains.isSupported('solana'), false);
});

test('chains：explorerUrl 按链生成链接，且只接受格式合法的地址 / 哈希', () => {
  assert.equal(Chains.explorerUrl('eth', 'address', EVM_ADDR), 'https://etherscan.io/address/' + EVM_ADDR);
  assert.equal(Chains.explorerUrl('eth', 'tx', EVM_TX), 'https://etherscan.io/tx/' + EVM_TX);
  assert.equal(Chains.explorerUrl('bsc', 'address', EVM_ADDR), 'https://bscscan.com/address/' + EVM_ADDR);
  assert.equal(Chains.explorerUrl('bsc', 'tx', EVM_TX), 'https://bscscan.com/tx/' + EVM_TX);
  assert.equal(Chains.explorerUrl('btc', 'address', BTC_ADDR), 'https://mempool.space/address/' + BTC_ADDR);
  assert.equal(Chains.explorerUrl('btc', 'tx', BTC_TX), 'https://mempool.space/tx/' + BTC_TX);
  // 格式不对 → 不生成链接
  assert.equal(Chains.explorerUrl('eth', 'address', BTC_ADDR), null);
  assert.equal(Chains.explorerUrl('btc', 'address', EVM_ADDR), null);
  assert.equal(Chains.explorerUrl('eth', 'tx', BTC_TX), null);
  assert.equal(Chains.explorerUrl('btc', 'tx', EVM_TX), null);
  assert.equal(Chains.explorerUrl('solana', 'address', EVM_ADDR), null);
  assert.equal(Chains.explorerUrl('eth', 'other', EVM_ADDR), null);
});

test('chains：linkByChainId 支持跨链目标链（只给浏览器链接，未知链返回 null）', () => {
  assert.equal(Chains.linkByChainId(8453, 'tx', EVM_TX), 'https://basescan.org/tx/' + EVM_TX);
  assert.equal(Chains.linkByChainId(42161, 'address', EVM_ADDR), 'https://arbiscan.io/address/' + EVM_ADDR);
  assert.equal(Chains.linkByChainId(999999, 'tx', EVM_TX), null);
  assert.equal(Chains.linkByChainId(8453, 'tx', 'not-a-tx'), null);
});
