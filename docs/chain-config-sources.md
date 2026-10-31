# 按链配置与官方合约来源

本文件记录 `lib/chains.js` 里每条链的配置依据。**代码里的白名单只按合约地址判断**（符号、名称、发送方都可以伪造）；下表是这些合约地址的官方来源，便于逐条复核。

> 原则：非以太坊链必须使用自己这一份原生币 / 白名单 / 浏览器链接；**不允许把 ETH 的配置套到别的链上**。未知链直接拒绝。

## 1. 以太坊主网（`eth`，chainid 1）

| 资产 | 合约地址 | 小数位 | 可冻结 | 官方来源 |
| --- | --- | --- | --- | --- |
| USDT | `0xdac17f958d2ee523a2206206994597c13d831ec7` | 6 | 是 | Tether 官方发行；[Etherscan](https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7) |
| USDC | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | 6 | 是 | Circle 官方发行；[Etherscan](https://etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48) |
| DAI | `0x6b175474e89094c44da98b954eedeac495271d0f` | 18 | 否 | MakerDAO；[Etherscan](https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f) |
| WETH | `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2` | 18 | 否 | 规范 WETH9；[Etherscan](https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2) |
| WBTC | `0x2260fac5e5542a773aa44fbcfedf7c193bc2c599` | 8 | 否 | BitGo / WBTC 官方；[Etherscan](https://etherscan.io/token/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599) |
| stETH | `0xae7ab96520de3a18e5e111b5eaab095312d7fe84` | 18 | 否 | Lido；[Etherscan](https://etherscan.io/token/0xae7ab96520de3a18e5e111b5eaab095312d7fe84) |

- 原生币：ETH（18 位）。
- API：Etherscan API V2，`https://api.etherscan.io/v2/api`，`chainid=1`。
- 浏览器：`https://etherscan.io/address/`、`https://etherscan.io/tx/`。
- Bitget 官方标签：**默认只在 ETH 启用**（`official: true`）。

## 2. BNB Smart Chain（`bsc`，chainid 56）

BSC 上流通的 USDT / USDC 等是 **Binance 官方 Pegged Token（BNB Smart Chain 桥接资产）**，不是以太坊上的原合约。因此必须使用 BSC 自己的合约地址；把 ETH 的 USDT 合约用在 BSC 上会被判为假代币。

| 资产 | 合约地址 | 小数位 | 官方来源 |
| --- | --- | --- | --- |
| Binance-Peg USDT | `0x55d398326f99059ff775485246999027b3197955` | 18 | Binance 官方 Pegged Token；[BscScan](https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955) |
| Binance-Peg USDC | `0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d` | 18 | [BscScan](https://bscscan.com/token/0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d) |
| Wrapped BNB（WBNB） | `0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c` | 18 | [BscScan](https://bscscan.com/token/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c) |
| Binance-Peg Ethereum（ETH） | `0x2170ed0880ac9a755fd29b2688956bd959f933f8` | 18 | [BscScan](https://bscscan.com/token/0x2170ed0880ac9a755fd29b2688956bd959f933f8) |
| Binance-Peg BTCB | `0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c` | 18 | [BscScan](https://bscscan.com/token/0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c) |
| Binance-Peg BUSD | `0xe9e7cea3dedca5984780bafc599bd69add087d56` | 18 | [BscScan](https://bscscan.com/token/0xe9e7cea3dedca5984780bafc599bd69add087d56) |

- 原生币：BNB（18 位）。
- API：Etherscan API V2，`chainid=56`（同一个 key 覆盖 V2 支持的链；具体可用链以 Etherscan 文档为准）。
- 浏览器：`https://bscscan.com/address/`、`https://bscscan.com/tx/`。
- Bitget 官方标签：**不启用**（`official: false`）——该名单是 Bitget 以太坊案件相关地址，不能套到 BSC。
- 本轮 BSC 白名单代币统一标 `freezable: false`：Pegged Token 的冻结能力由发行方 / 托管方决定，本版本不替它做可冻结断言。

## 3. Bitcoin（`btc`，UTXO）

- 没有代币白名单；原生 BTC，金额单位 **整数 satoshi**（1 BTC = 100,000,000 satoshi）。
- 数据源：公开 **Esplora API**（默认 `https://mempool.space/api`，即 Blockstream Esplora 的公开实例），无需 key。
- 浏览器：`https://mempool.space/address/`、`https://mempool.space/tx/`。
- 地址校验：base58check（P2PKH / P2SH）用 `node:crypto` 的 SHA-256 双重哈希验证校验和；bech32 / bech32m（P2WPKH / P2WSH / P2TR）用 bech32 多项式校验。只校验格式与校验和，不涉及私钥，也不反推公钥。
- Bitget 官方标签：不启用。

## 4. Tron（`tron`，账户模型）

Tron 是账户模型（不是 UTXO），原生币为 TRX，另有 TRC20 代币。**Tron 的 USDT 与以太坊 / BSC 上的 USDT 是三个不同的合约**，必须使用 Tron 自己的地址；把 ETH 的 USDT 合约套到 Tron 上会被判为非白名单（只计数、不展开）。

| 资产 | 合约地址 | 小数位 | 可冻结 | 官方来源 |
| --- | --- | --- | --- | --- |
| USDT（TRC20） | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 | 是（可冻结稳定币，可冻≠已冻） | Tether 官方发行的 TRC20 USDT；[Tronscan](https://tronscan.org/#/token20/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) |

- 原生币：TRX（6 位小数，最小单位 SUN）。
- 数据源：**TronGrid 公开 API**（`https://api.trongrid.io`），无需 key；设置 `TRON_API_KEY` 或 `--key` 时请求头加 `TRON-PRO-API-KEY`（付费档频率更高）。
  - `GET /v1/accounts/{address}/transactions`：原生 TRX（只取 `TransferContract`），`limit` 上限 200，`only_confirmed=true`，分页用 `meta.fingerprint`。
  - `GET /v1/accounts/{address}/transactions/trc20`：TRC20 转账摘要（含 `transaction_id` / `token_info` / `from` / `to` / `value` / `block_timestamp`），同样 `limit` / `only_confirmed` / `fingerprint`。
  - `GET /wallet/getaccount`：账户原生 TRX 余额（`balance`，单位 SUN）；不含 TRC20 余额（需单独查合约）。
- 浏览器：`https://tronscan.org/#/address/`、`https://tronscan.org/#/transaction/`。
- 地址校验：主网 **base58check**（以 `T` 开头、34 字符），载荷 = `0x41` + 20 字节，用 `node:crypto` 的 SHA-256 双重哈希验证校验和。校验失败直接报错，不做「去掉前缀再猜」。API 返回的 Tron 内部 hex 地址（`41` + 20 字节）由 `lib/tron.mjs` 转成 base58check。
- 金额口径：原生 TRX 与 USDT 均保留**整数最小单位**（6 位小数），同时给人类可读；大额用字符串 / BigInt 比较，不经过浮点。
- 可达性（2026-10-31 实测）：本机中国网络下 `api.trongrid.io` 解析到真实 AWS 新加坡地址，Node 24 `fetch` 不设代理变量也返回 HTTP 200；设 `HTTPS_PROXY` 也可用。**直连可用，代理非必需**；CLI 仍保留「检测代理则自动带 `NODE_USE_ENV_PROXY=1` 重启」的兜底。
- 限制：只到交易级；原生 TRX 不含 `internal_transactions`；TRC20 摘要不带区块号（逐笔查详情可补，本轮为控制预算未做）。
- Bitget 官方标签：不启用。

## 5. 链接生成规则

`lib/chains.js` 的 `explorerUrl(chain, 'address'|'tx', value)`：

- EVM 地址必须是 `0x` + 40 位十六进制；交易哈希必须是 `0x` + 64 位十六进制。
- BTC 地址必须是格式合法的 base58 / bech32（链接层只做格式校验，严格校验和见 `lib/btc.mjs`）；txid 必须是 64 位十六进制。
- Tron 地址必须形如以 `T` 开头、34 个 base58 字符（链接层只做格式校验，严格 base58check 校验和见 `lib/tron.mjs`）；txid 必须是 64 位十六进制（Tron txid 无 `0x` 前缀）。
- 不合法一律返回 `null`，报告里只显示纯文本，不生成链接。
- 跨链目标链可能不在主配置里：`linkByChainId(chainid, ...)` 覆盖常见 EVM 浏览器（1 / 10 / 56 / 137 / 8453 / 42161 / 43114），未知链返回 `null`。

## 6. 新增一条链要改什么

1. 在 `lib/chains.js` 的 `CHAINS` 里加一条配置（原生币、白名单 + `src` 来源、`minValue`、`priceHints`、`api`、`explorer`、`official`）。
2. EVM 链同时把 chainid 加进 `CHAINID`；只在跨链报告里出现的链把浏览器加进 `EXPLORERS`。
3. 在新链自己的测试文件里增加隔离测试（例如 `tests/tron.test.mjs`），**不改动既有测试文件**；断言 ETH / BSC 的合约不能出现在新链白名单里，反之亦然。
4. 更新本文件与 README。

> 已按此流程接入：`btc`（UTXO，Esplora）与 `tron`（账户模型，TronGrid）。新增链的报告在 `lib/report-multi.js` 里各有一个 builder（`buildBtc` / `buildTron` / `buildTrace`），链接一律走 `Chains.explorerUrl(chain, ...)`，不会把别的链的白名单或浏览器套过来。
>
> 注意 `Chains.ids()` 只列 EVM / UTXO 工具链（eth / bsc / btc）；account 模型链（tron）通过 `Chains.get('tron')` / `Chains.explorerUrl('tron', ...)` 单独取用，`Chains.isSupported('tron')` 仍为 true。这样 `tools/trace.mjs` 的「支持链」提示不会把 tron 误当成 EVM 链。
