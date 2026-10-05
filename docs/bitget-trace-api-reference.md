> 本项目注（2026-09-30）：以下行号指本注插入之前的原文行号。原文第 338 行（流程图里的 `removed = 官方核实后移除的地址 → 从黑名单剔除`）与第 354 行（"关键设计点"第 2 条的"被移除 = 官方核实解除，要从黑名单撤下"）把"按链消失"等同于"官方核实后移除、要从黑名单撤下"，这是错误推断，不要照抄。
> 实测 `0x98c8a42a20ead5282302aed32bf813702e9a8c86`：12:55 快照在 holdings.eth，14:59 起在 holdings.arb，此后一直在官方名单里（不在 reviewed，也不在 corrections）；它只是从 eth 改列到 arb，按链看是 eth −1 / arb +1，按地址看并没有消失。官方明确说名单"只增不减"，只有出现在 `/api/holdings/corrections` 里的地址才是官方要求从黑名单撤下的；名单里的地址消失而官方没有说明时，应先到官方看板核实，不要直接撤下。
> 另外：浏览器跨域读不到 `x-maintenance` 响应头（`access-control-expose-headers` 只暴露 `x-snap-ts`、`x-cache`、`etag`），前端判断维护状态只能读 `/api/maintenance` 的 JSON。

# Bitget 被盗资金追踪站（trace.bgblockchain.xyz）API 参考与开源跟踪工具开发指南

> 整理时间：2026-09-30 12:30（UTC+8）
> 来源：官方文档页 
>
> [https://trace.bgblockchain.xyz/api](https://trace.bgblockchain.xyz/api)
>
>  \+ 实际请求验证（2026-09-30 实测全部 200）
> 站点背景：Bitget 2026-09-24 安全事件（INC 2026-09-24，被盗约 $387.5M）的官方资金追踪与赏金申报配套站，由 Bitget 安全团队维护，悬赏见官方公告。



***

## 1. 站点概况



* 纯前端 SPA（Claude Code / 普通 HTTP 客户端直接抓页面拿不到内容，必须用浏览器渲染或直接打 API）。

* 全部 API **免登录、免 key**；除 `POST /api/report` 外**允许跨域（CORS）**。

* 数据每 10 秒级更新；链上交易缓存比真实区块晚 1–10 分钟（EVM 1–2 分钟，其余链最多 10 分钟）。

* 看板路由：


  * `/v2#track` 概览（大盘数字）

  * `/v2#explorer` 地址浏览器（3623 个攻击者地址，可按链 / 资产 / 经过协议筛选，按持仓 / 最近动账 / 跳数排序）

  * `/v2#explorer?view=events` 最近动账记录（最近 1000 条，可按链 / 类型筛选）

  * `/v2#reviewed` 已核查的非攻击者地址

  * `/v2#graph` 资金大图

  * `/v2#<地址>` 单个地址详情

  * `/report` 在线提交线索表单

* 看板查询框支持批量粘贴（最多 500 个地址 / 哈希）。



***

## 2. API 端点一览



| 方法   | 路径                                   | 用途                       | 缓存     |
| ---- | ------------------------------------ | ------------------------ | ------ |
| GET  | `/api/holdings`                      | 攻击者控制过的全部地址（按链分组）        | 5s     |
| GET  | `/api/victims`                       | 本次被盗的 Bitget 钱包地址        | 5s     |
| GET  | `/api/reviewed`                      | 已核查的非攻击者地址 + 已定性的攻击者相关地址 | \~2min |
| GET  | `/api/chains`                        | 每条链累计流入 / 流出 / 内部调动（USD） | \~5min |
| GET  | `/api/maintenance`                   | 维护状态（block/freeze）       | —      |
| POST | `/api/report`                        | 提交线索（等同 /report 表单）      | 限流     |
| GET  | `/api/report/mine?c=`                | 按联系方式查自己提交过的线索           | 5/min  |
| GET  | `/api/holdings/corrections`          | 官方勘误（误列入名单的地址，需从黑名单移除）   | —      |
| GET  | `/api/holdings/corrections/<id>.csv` | 勘误清单 CSV                 | —      |

**统一要求：所有 GET 必须带自定义 User-Agent**（Python `requests` 等默认 UA 会被 403）。

建议 UA：`your-tool-name/1.0 (contact@example.com)`。



***

## 3. 各端点详解

### 3.1 GET /api/holdings —— 攻击者地址黑名单（核心数据源）



```
curl -s -A 'my-client/1.0' https://trace.bgblockchain.xyz/api/holdings
```

返回：



```
{
  "eth": ["0xd2c2f029eff5cacc686f24377cfddcfc82d9f899", "..."],
  "btc": ["bc1q..."],
  ...
}
```

要点：



* 键（链）：`eth bsc arb op base avax linea xrp btc tron zec algo tia atom noble hyperliquid sol`

* EVM 地址**一律小写**（含 EVM 系 bsc/arb/op/base/avax/linea；hyperliquid 也是 EVM 格式）。做比对时统一 `.lower()`。

* **名单只增不减**：地址转空（资金转走）后仍留在列表里，不代表解除；经核实不属于攻击者的地址会**移除**并出现在 corrections 里。

* 排序：链内当前有余额的排前面（按余额降序），已转空的排后面。

* 响应头 `x-snap-ts`：数据快照时间（Unix 秒）。实测 `x-snap-ts=1790744038`。

* 建议轮询间隔 15–30 秒。

* 注意：本接口**只有地址列表**，没有余额、标签、最近动账 —— 这些要自己接区块浏览器或用看板地址详情页。

### 3.2 GET /api/victims —— 被盗钱包地址



```
curl -s -A 'my-client/1.0' https://trace.bgblockchain.xyz/api/victims
```



* 本次事件中资金被偷走的 Bitget 自己的钱包，按链分组，格式同 holdings。

* 链：`eth bsc arb op base avax xrp tron zec algo tia atom`

* 同一个地址在多条链上被盗，会在多条链下各列一次。

* 实测样本：



```
{
  "eth":  ["0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23", "..."],
  "tron": ["TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb", "..."],
  ...
}
```

### 3.3 GET /api/reviewed —— 已核查地址（防误报白名单）



```
curl -s -A 'my-client/1.0' https://trace.bgblockchain.xyz/api/reviewed
```

返回（实测）：



```
{
  "ok": true,
  "generated_ts": 1790743868,
  "updated_ts": 1790743584,
  "count": 202,
  "counts": {"vault": 26, "cex": 7, "arb": 16, "user": 6, "poison": 3, "attacker": 144},
  "items": [
    {
      "address": "cosmos14r2cn7f5ztntkm3w07z3xmre6yay2zrvtjwhg6",
      "chain": "ATOM",
      "category": "vault",
      "verdict": "not_attacker",
      "name": "THORChain ATOM 金库",
      "name_en": "THORChain ATOM vault",
      "note": "...",
      "note_en": "...",
      "reviewed_ts": 1790479493
    }
  ]
}
```



* `category`：`vault` 协议金库 / `cex` 交易所地址 / `arb` THORChain 套利者 / `user` 无关用户 / `poison` 投毒地址 → verdict 均为 `not_attacker`；

* `attacker` → verdict = `attacker_related`（只定性，不给路径）。

* 含义：这些地址常被白帽误报为攻击者，**查到的不用再提交线索**；做跟踪工具时应用它过滤告警噪音。

* `chain` 字段是大写链名（ATOM/ETH/XRP/BTC…），地址本身小写。

### 3.4 GET /api/chains —— 分链资金流量



```
curl -s -A 'my-client/1.0' https://trace.bgblockchain.xyz/api/chains
```

返回（实测，节选）：



```
{
  "ok": true,
  "generated_ts": 1790744139,
  "method": "...",
  "items": [
    {"chain": "ETH", "in_usd": 303697368.83, "out_usd": 413862024.06,
     "internal_usd": 914324660.97, "n_in": 10256, "n_out": 6637, "n_internal": 2170,
     "unpriced": 2040, "t0": 1790013635, "t1": 1790743991},
    ...
  ]
}
```



* `in_usd`：非攻击者→攻击者（不含被盗钱包初始转入）；`out_usd`：攻击者→非攻击者；`internal_usd`：攻击者地址之间。

* 兑换在同链先流出再流入，两头都算；一笔钱过几条链就在几条链各算一次，**各链数字不能相加**。

* `unpriced`：没能折算 USD 的转账笔数；`t0/t1`：该链最早 / 最近一笔时间。

* items 按 in+out 降序。

### 3.5 GET /api/maintenance —— 维护状态



```
curl -s -A 'my-client/1.0' https://trace.bgblockchain.xyz/api/maintenance
```

正常返回：`{"ok":true,"on":false,"mode":null,"since":null,"frozen_ts":null,"msg_zh":"","msg_en":""}`

维护中返回：



```
{"ok":true,"on":true,"mode":"freeze","since":1790560000,"frozen_ts":1790559900,
 "msg_zh":"数据核对中","msg_en":"Data being verified"}
```



* `block`：页面和数据接口返回 503（响应头 `retry-after` 给重试秒数）→ **沿用上次名单，不要当成空列表**。

* `freeze`：接口照常返回但数据停在快照（响应头 `x-maintenance: freeze`），恢复后自动更新。

### 3.6 POST /api/report —— 提交线索（服务端调用，无 CORS）



```
curl -s -A 'my-client/1.0' https://trace.bgblockchain.xyz/api/report \
  -H 'content-type: application/json' \
  -d '{"contact":"whitehat@example.com","kind":"funds","dest":"dex",
       "chain":"Ethereum","address":"0x...","amount":"400,000 USDT","token":"USDT",
       "txs":["0x...","0x..."],"desc":"..."}'
```

成功返回：`{"ok":true,"id":"YYMMDD-HHMMSS-XXXX","ts":"...Z","bj":"2026-09-30 20:26:20"}`

字段：



* **必填&#x20;**`contact`：邮箱 / Telegram，用于核实和发奖；填邮箱后可用 `/api/report/mine` 查。

* 至少填一项：`address`（≤300 字）、`txs`（JSON 数组，≤10000 字）、`desc`（≤10000 字）。

* 选填：`kind` = `funds`/`identity`/`method`/`other`（默认 other）；`dest` = `cex`/`bridge`/`dex`/`otc`/`mixer`/`other`；`chain`（如 Ethereum/Bitcoin/XRP Ledger）；`amount`、`token`；`alias`；`lang`=zh/en。

* 附件：只能 multipart，`files=@x.png`，最多 3 张，每张 ≤2MB，仅 PNG/JPG/WEBP。

* 错误：`missing_contact / missing_content / too_long / too_many_files / file_too_large / bad_file / bad_json / 413 / 415 / 429`。

* **不支持跨域，只能服务端 / 命令行调用**；不要重复提交，补充时新提交一条并在 desc 里写原编号。

* 限流：每 IP 5 次 / 分钟、6 次 / 10 分钟、500 次 / 天（IPv6 按 /64 算）；请求体 ≤8MB。

### 3.7 GET /api/report/mine?c= —— 查自己提交过的线索



```
curl -s -A 'my-client/1.0' 'https://trace.bgblockchain.xyz/api/report/mine?c=whitehat@example.com'
```



* 只返回编号 / 时间 / 类型 / 链 / 打码地址（前 6 后 4），不返回描述和核查结果；最多列最近 100 条。

* 限流 5 次 / 分钟 / IP；`c` 少于 3 字符返回 400。

### 3.8 GET /api/holdings/corrections —— 官方勘误



```
{"ok":true,"corrections":[{"id":"20260928-btc","chain":"btc",
 "listed_from":"2026-09-28 09:46 UTC+8","listed_until":"2026-09-28 10:18 UTC+8",
 "restored_at":"2026-09-28 10:49 UTC+8",
 "reason":"自动跟踪误判...","count":8232,
 "csv":"/api/holdings/corrections/20260928-btc.csv","addresses":[...]}]}
```

做黑名单工具**必须处理勘误**：在误列区间内拉入的地址要从你的黑名单里剔除（CSV 字段：address、chain、wrongly\_listed\_from、wrongly\_listed\_until、action）。



***

## 4. 限流与响应头



* 所有 GET 每 IP 每分钟 1200 次（只计缓存未命中）。

* 超限返回 429，响应头 `retry-after` 给出等待秒数；恶意刷提交的 IP 会被 403 封禁。

* 维护期数据接口返回 503 + `retry-after`。

* 数据时间统一看响应头 `x-snap-ts`（Unix 秒）。



***

## 5. 开源跟踪工具建议架构



```
┌─ poller（15–30s）────────────────────────────┐
│ 1. GET /api/maintenance → on? mode?           │
│    block: 跳过本轮，沿用上轮名单                │
│    freeze: 拉但标记 frozen_ts                  │
│ 2. GET /api/holdings（带自定义 UA）            │
│ 3. 和本地最新快照 diff：                       │
│    added   = 新出现的地址 → 告警（重点）        │
│    removed = 官方核实后移除的地址 → 从黑名单剔除│（本项目注：见文首）
│ 4. 周期性 GET /api/reviewed → 白名单过滤       │
│    （vault/cex/arb/user/poison 命中则降级提示） │
│ 5. 周期性 GET /api/chains → 资金流动大盘        │
│ 6. GET /api/holdings/corrections → 应用勘误     │
└───────────────────────────────────────────────┘
告警 → 通知渠道（webhook/Telegram）
提交 → POST /api/report（服务端调用，desc 写原编号）
```

关键设计点：



1. **地址一律小写比对**；EVM 系各链地址格式相同，按 chain 分桶。

2. **diff 是核心价值**：holdings 只增不减，新增地址 = 攻击者新分仓 / 新下游，这是告警信号；被移除 = 官方核实解除，要从黑名单撤下。（本项目注：见文首）

3. **空响应 ≠ 空名单**：先看 maintenance 和 HTTP 状态，503 时保留旧快照。

4. **reviewed 白名单过滤**：否则协议金库（THORChain/Chainflip vault）、交易所充值地址会造成大量误报。

5. **余额 / 标签要自己补**：holdings 只有地址；要余额和最近动账需接 Etherscan（免费层限速，带好 UA/key）或对 `/v2#<地址>` 做页面渲染解析。

6. 每次快照按 `x-snap-ts` 落盘，方便回放与审计。



***

## 6. 最小可用轮询示例（Python）



```
import json, time, urllib.request, pathlib

UA = "my-open-tracker/1.0 (contact@example.com)"
BASE = "https://trace.bgblockchain.xyz"
SNAP_DIR = pathlib.Path("snaps")
SNAP_DIR.mkdir(exist_ok=True)

def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read()), r.headers.get("x-snap-ts")

def flatten(holdings):
    return {chain: set(a.lower() for a in addrs) for chain, addrs in holdings.items()}

def poll():
    maint, _ = get("/api/maintenance")
    if maint.get("on") and maint.get("mode") == "block":
        print("[maintenance block] skip, keep old list"); return
    holdings, snap_ts = get("/api/holdings")
    cur = flatten(holdings)
    prev_file = SNAP_DIR / "prev.json"
    prev = json.loads(prev_file.read_text()) if prev_file.exists() else {}
    for chain, addrs in cur.items():
        old = set(prev.get(chain, []))
        added = addrs - old
        removed = old - addrs
        if added: print(f"[NEW-{chain}] {len(added)}: {sorted(added)[:5]}...")
        if removed: print(f"[REMOVED-{chain}] {len(removed)}: {sorted(removed)[:5]}...")
    prev_file.write_text(json.dumps({k: sorted(v) for k, v in cur.items()}))
    print(f"[snap] x-snap-ts={snap_ts} total={sum(len(v) for v in cur.values())}")

if __name__ == "__main__":
    while True:
        try: poll()
        except Exception as e: print("[error]", e)
        time.sleep(20)
```

提交线索示例（服务端运行）：



```
curl -s -A 'my-open-tracker/1.0' https://trace.bgblockchain.xyz/api/report \
  -H 'content-type: application/json' \
  -d '{"contact":"you@example.com","kind":"funds","dest":"dex","chain":"Ethereum",
       "address":"0xF5e10380213880111522dd0efD3dbb45b9f62Bcc",
       "amount":"400,000 USDT","token":"USDT",
       "txs":["0xfcb7dfd6037a7156ad5930fef6e58ac1e5a4b7fd99b72e6986d1fc0cb7673243"],
       "desc":"补充线索，关联编号 YYMMDD-HHMMSS-XXXX ..."}'
```



***

## 7. 本次随附的实测数据快照（2026-09-30 \~12:28 UTC+8）

同目录下已保存实际拉取的 JSON，可直接当测试夹具（fixture）：



| 文件                              | 内容                                        |
| ------------------------------- | ----------------------------------------- |
| `api-holdings.json`             | 攻击者全量地址名单（实测 164KB）                       |
| `api-victims.json`              | 被盗 Bitget 钱包地址                            |
| `api-reviewed.json`             | 已核查地址（vault/cex/arb/user/poison/attacker） |
| `api-chains.json`               | 分链 in/out/internal USD 流量                 |
| `api-maintenance.json`          | 维护状态（当前 off）                              |
| `api-holdings_corrections.json` | 官方勘误清单                                    |

> 数据为快照，工具上线后应实时轮询而非长期引用本目录旧值。