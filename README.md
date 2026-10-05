# 溯流（Suliu）v0.3

**钱被盗之后，把一个钱包地址变成一份能直接拿去报案、找交易所冻结的证据报告。**

开源、免安装、免费：一个 HTML 文件加几个脚本，双击就能用。溯流只把公开链上数据变成你自己拿去用的报告：不常驻盯盘，不经手资金，不替你联系任何人，不承诺追回。

## 三步用法

1. **双击打开** `溯流资金画布.html`（用浏览器打开，不用安装任何东西）。
2. **填你自己的 Etherscan key**：点右上角「追踪地址」，粘贴 key。没有的话到 https://etherscan.io/myapikey 免费申请。key 只存在你自己的浏览器里，只发给 Etherscan，不会写进报告、不会导出、不会上传到别处。
3. **输入被盗地址追踪，生成报告，打印成 PDF**：填被盗的以太坊地址（知道被盗时间的话填起始区块，可以少花调用次数），点「开始追踪」；追完点「生成报告」，在新窗口里按 Ctrl+P（Mac 为 ⌘P）另存为 PDF。

目标是被盗的人 10 分钟内拿到一份可以打印的报告。想先看成品：打开 `docs/示例报告-Bitget.html`（Bitget 案的真实链路）。

顶栏的「报案指引」按钮可以随时查看去哪里报案、带什么材料、怎么联系交易所，内容和报告第 9 节附录是同一份。

## 报告里有什么

| 节 | 内容 |
| --- | --- |
| 1 封面信息 | 案件、报告编号、生成时间、数据来源、数据截止区块与时间；你自愿填写的报案人 / 联系方式 / 被盗经过（只写进报告文件，不保存、不上传） |
| 2 摘要 | 起点、追踪范围、规模、卡点数量、金额最大的前 3 个卡点、截断提示、待核实事项 |
| 3 资金去向图 | 缩放友好的矢量图，红框 / 橙框标出紧急与高级别卡点 |
| 4 卡点清单 | 交易所、可冻结稳定币、可拦截通道（如 Chainflip）、跨链 / 兑换、混币器；每个卡点写明该找谁、怎么说、要带什么，并标明是「链上事实」还是「推断」 |
| 5 交易明细 | 每笔的时间（UTC+8）、区块、金额、交易哈希和 Etherscan 链接 |
| 6 地址清单 | 完整地址、类型、判断依据、Bitget 官方名单核对结果 |
| 7 方法与局限 | 数据来源、过滤规则、被忽略的记录、追踪停止点与下一步 |
| 8 免责声明 | 不是法律意见、不承诺追回、归因分级 |
| 9 附录：报案指引 | 报案材料清单、给交易所 / 协议方的冻结与保全请求模板（中英文，空格留出手写位置） |

## 能做什么，不能做什么

能做：

- 追踪**以太坊主网**上从一个地址转出的资金，最多 5 跳；API 调用有上限，用多少显示多少。
- 代币真假只按合约地址判断（USDT、USDC、DAI、WETH、WBTC、stETH 和原生 ETH）；假币、0 值、粉尘、首尾相同的仿冒地址只计数、不展开。
- 识别可冻结点：交易所、可冻结稳定币、可拦截通道，并写明下一步。
- 把追踪结果导出为 JSON，或载入别人发来的 JSON（人工应急协助时用）。

不能做：

- **只支持以太坊。** Tron、BTC、其他 EVM 链现在不支持。
- **只追转出。** 转入和退款（例如协议把资金退回）没有纳入，报告里会写明。
- **自动结果需要人工复核。** 可能漏判或误判；提交任何材料前请逐位核对地址与哈希。
- **不实时盯盘，不发提醒。** 追的是你点击那一刻的链上数据。
- 不代提交举报、不发邮件、不联系任何机构，所有对外动作由你自己确认后做。

## 命令行（开发与人工应急服务用）

需要 Node.js 24。key 放在环境变量 `ETHERSCAN_API_KEY`，或复制 `.env.example` 为 `.env` 后填入（`.env` 已在 `.gitignore` 里）。

```bash
node tools/trace.mjs <地址> --from-block N --hops 3 --top 5 --max-calls 80   # 联网追踪，结果写到 cases/*.json
node tools/trace.mjs <地址> --replay tests/fixtures/etherscan-bitget         # 离线回放录制好的响应（不需要 key）
node tools/serve.mjs 8777                                                    # 本地起服务（一般不需要，双击 HTML 即可）
node --test                                                                  # 全部测试
```

在中国大陆访问 Etherscan 需要走代理：设好系统的 `HTTPS_PROXY`，`tools/trace.mjs` 会自动带上 `NODE_USE_ENV_PROXY=1` 重新启动自己。浏览器里直接用不需要这一步（走系统代理）。Node 24 下不要写 `node --test tests/`，直接 `node --test`。

## 合规声明

- 只做公开数据整理，只引导向正式渠道报告：受害方官方举报页、交易所合规渠道、执法机关。
- 不联系、不付费给洗钱方，不提供私下追讨功能；**不向受害者预收费用，不承诺追回**。"先交钱帮你追回"是最常见的二次诈骗手法。
- 归因分级："执法机关确认"与"分析机构判断"分开标注；以执法机关结论为准。
- 标签带公开来源，不收录个人身份信息；"疑似 / 推断"不等于定性；未命中名单不等于资金干净。
- 遵守数据源条款：用授权 API，不批量抓区块浏览器网页，不使用从 Etherscan 网页抓来的标签。
- 中国大陆认定虚拟货币相关业务活动为非法金融活动；运营主体、服务对象、服务器位置上线前请律师评估。
- 报案指引不是法律意见，以当地公安机关的要求为准。
- 地址逐位核对，警惕首尾相同的仿冒地址。

## 目录

| 路径 | 内容 |
| --- | --- |
| `溯流资金画布.html` | 页面（双击即开）：追踪地址、资金流向画布、报案指引、生成报告 |
| `lib/trace-eth.js` | 以太坊追踪引擎（页面与命令行共用） |
| `lib/report.js` | 可打印证据报告；卡点判定与卡点文案的唯一来源 |
| `lib/guide.js` | 报案指引（报告第 9 节附录与页面「报案指引」共用） |
| `lib/brand.js` | 品牌位：名字、联系方式（默认为空，为空时不显示任何联系内容） |
| `lib/official-data.js`、`data/official-snapshot.js` | 静态官方标签（Bitget 官方名单快照）与查询函数 |
| `index.html` | 在线版入口（跳转到画布页） |
| `tools/trace.mjs`、`tools/serve.mjs` | 命令行追踪、本地静态服务器 |
| `tests/` | 测试；`tests/fixtures/etherscan-bitget/` 是 Etherscan 真实录制夹具 |
| `docs/示例报告-Bitget.html` | Bitget 案示例报告 |
| `docs/报案指引.md` | 报案指引原文（`lib/guide.js` 逐字对照它，由测试锁定） |
| `docs/bitget-trace-api-reference.md` | Bitget 官方接口参考 |
| `snapshot/`、`cases/` | Bitget 官方数据原始快照、示例追踪结果 |
| `LICENSE`、`DATA-LICENSE.md` | 代码许可、数据来源与许可说明 |

## 许可

代码：[Apache License 2.0](LICENSE)，Copyright 2026 贺去病AI工作室。

数据：见 [DATA-LICENSE.md](DATA-LICENSE.md)。其中 Bitget 官方名单（`data/official-snapshot.js`、`snapshot/`）的版权与使用条款归原方，复用前请确认其条款并注明来源。

---

## English (short)

**Suliu turns one stolen-funds wallet address into an evidence report you can hand to the police or send to an exchange to request a freeze.**

Free, open source, no install: double-click `溯流资金画布.html` in your browser, paste your own Etherscan API key (free at https://etherscan.io/myapikey; it stays in your browser and is only sent to Etherscan), enter the stolen address, run the trace, then generate the report and print it to PDF with Ctrl+P. The report ends with a reporting guide and freeze-request templates (Chinese and English). Open `docs/示例报告-Bitget.html` for a worked example.

Scope: Ethereum mainnet only; outgoing transfers only (incoming transfers and refunds are not covered); automatic results need human review; no real-time monitoring or alerts. Suliu never contacts anyone on your behalf, never handles funds, charges victims nothing and does not promise recovery. Reporting guidance is general information, not legal advice; follow the requirements of your local law-enforcement agency.

Code is Apache-2.0 (see `LICENSE`). Data sources are described in `DATA-LICENSE.md`; the Bitget official list in `data/official-snapshot.js` and `snapshot/` belongs to its original owner, so confirm its terms and cite the source before reuse.
