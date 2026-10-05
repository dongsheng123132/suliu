# 数据来源与许可说明

本项目的**代码**按 Apache License 2.0 发布，见 [LICENSE](LICENSE)。本文件只说明仓库里**数据**的来源。

## 一、链上数据：公开区块链与 Etherscan API

下面这些文件里的链上数据（地址、交易哈希、区块、时间、金额）来自公开的以太坊区块链，通过 Etherscan API 取得：

| 位置 | 内容 |
| --- | --- |
| `docs/示例报告-Bitget.html` | 以 Bitget 案为例生成的证据报告 |
| `tests/fixtures/etherscan-bitget/` | 追踪 Bitget 案时录制的 Etherscan API 响应（测试夹具，已去掉 apikey） |
| `cases/` | `tools/trace.mjs` 追踪结果的 JSON 输出 |

区块链数据本身是公开的；通过 Etherscan API 取得的响应，其使用条款归 Etherscan 所有，复用前请自行确认其 API 条款。本项目只用授权 API，不抓取区块浏览器网页，不使用从网页抓来的地址标签。

## 二、Bitget 官方名单：版权与使用条款归原方

下面这些文件里的数据来自 Bitget 官方公开接口（https://trace.bgblockchain.xyz/api）：

| 位置 | 内容 |
| --- | --- |
| `data/official-snapshot.js` | 页面与命令行追踪时用的静态官方标签（攻击者地址名单、受害钱包、已核查地址、勘误） |
| `snapshot/` | 历次抓取的官方数据原始快照与名单变化记录 |
| `archive/` | 存档版本里如含上述官方数据的副本，同样适用 |

这些数据的**版权与使用条款归原方（Bitget）所有**。本项目没有获得再授权，**不声称**它们是 CC BY 4.0 或任何其他开放许可，也不把它们并入本项目的许可。复用前请先确认 Bitget 的条款（或征得其同意），并注明来源：Bitget 官方追踪看板 https://trace.bgblockchain.xyz 。

`docs/示例报告-Bitget.html` 的「地址清单」和「卡点清单」里有「在官方攻击者名单中」之类的核对结果，这些结果是用上面的官方快照算出来的，同样按本节处理。

## 三、其他

- 地址标签只来自带公开来源的名单与链上事实，不收录个人身份信息。
- "未命中名单"不等于资金干净；"疑似 / 推断"不等于定性。
