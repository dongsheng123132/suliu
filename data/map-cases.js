/* 由 tools/make-map-cases.mjs 生成：BTC 币安侧真实案例 + Tron 合成演示案例（页面内置可切换案例）。
 * 金额 / 地址 / 哈希都来自磁盘上的源数据；本文件不含任何脚本逻辑，只挂 window.SULIU_MAP_CASES。 */
window.SULIU_MAP_CASES = [
  {
    "id": "btc",
    "focus": "n0",
    "tab": "BTC 追踪",
    "tabK": "真实·交易级",
    "kind": "real",
    "unit": "block",
    "chain": "btc",
    "official": false,
    "title": "BTC 地址追踪 · bc1q0ts8…mkmfv3（币安侧）",
    "short": "BTC 币安侧追踪",
    "en": "BTC trace (Binance side, transaction-level)",
    "facts": [
      [
        "起点",
        "bc1q0ts8gaf9ht0rr4u02hr56f8thndqsc4kmkmfv3（终点钱包）"
      ],
      [
        "链",
        "Bitcoin（UTXO，交易级）"
      ],
      [
        "数据来源",
        "Blockstream Esplora 公开 API（https://mempool.space/api），抓取 2026-10-31T12:50:43Z"
      ],
      [
        "数据截止",
        "链头高度 973976（抓取时）；8 笔交易覆盖区块 973732–973930"
      ],
      [
        "覆盖",
        "交易级；单次追踪上限 8 笔，可能还有更早交易未覆盖（已截断）"
      ],
      [
        "金额口径",
        "整数聪（satoshi）；只列交易级输入 / 输出，不推断找零、不把输入累加成被盗总额"
      ],
      [
        "归属",
        "多输入多输出不构成资金归属证明；画「地址 → 交易 → 地址」二部图，不画地址到地址的归属边"
      ]
    ],
    "banner": [
      "<b>BTC 追踪（真实数据）</b> · Blockstream Esplora 公开 API，交易级输入 / 输出",
      "金额为整数聪（satoshi）；多输入多输出不构成归属证明，不推找零、不推被盗总额"
    ],
    "channels": "受害方官方举报渠道；币安合规 / 安全团队；执法机关",
    "nodes": [
      {
        "id": "n0",
        "addr": "bc1q0ts8gaf9ht0rr4u02hr56f8thndqsc4kmkmfv3",
        "label": "追踪起点（用户输入）",
        "note": "被追踪的终点钱包：8 笔交易中均为接收方（输出方向），截至链头未发现转出。",
        "type": "relay",
        "x": 560,
        "y": 40
      },
      {
        "id": "n1",
        "addr": "bc1q0mtc2f5agpkvlq6hhahmfr3hlr55kyfjhl2mnm",
        "label": "bc1q0mtc…hl2mnm",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 60
      },
      {
        "id": "n2",
        "addr": "bc1qhuq4genel5cuj00p7ggn30dwnzzjsw8mz3z2je",
        "label": "bc1qhuq4…z3z2je",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 100
      },
      {
        "id": "n3",
        "addr": "1AutiSmAHHWDwbwgMxxWNC2oBkCHi3ENPx",
        "label": "1AutiSmA…i3ENPx",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 210
      },
      {
        "id": "n4",
        "addr": "bc1qsu670y9mdz87zd3ecufvelfqp8dkrlfjsmnn4j",
        "label": "bc1qsu67…smnn4j",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 360
      },
      {
        "id": "n5",
        "addr": "bc1qrny8fcx3avyg4qwrqw729nx9g33z78y8wwvd0e",
        "label": "bc1qrny8…wwvd0e",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 160
      },
      {
        "id": "n6",
        "addr": "bc1pc3y0yuxwd7ce0d3665ypzfhpsrvytry9x856mnrdy7zyqm75ftes6ksncv",
        "label": "bc1pc3y0…6ksncv",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 510
      },
      {
        "id": "n7",
        "addr": "bc1q00h6esz7ysp6y8um9fyz22tzcqknvrveqdmfv3",
        "label": "bc1q00h6…qdmfv3",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 220
      },
      {
        "id": "n8",
        "addr": "bc1q2wvz0kcsn4hqmajwtey30ud27fl25w8pveznn6",
        "label": "bc1q2wvz…veznn6",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 280
      },
      {
        "id": "n9",
        "addr": "bc1q25jq93t0u2wn5mzlnhh3e6wy56029w5td5znn6",
        "label": "bc1q25jq…d5znn6",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 340
      },
      {
        "id": "n10",
        "addr": "bc1q42flhayrzy3zh8lkyevw8qcjduurt9a35wlsyx",
        "label": "bc1q42fl…5wlsyx",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 400
      },
      {
        "id": "n11",
        "addr": "bc1q4tdtjlkyktz2z67j58ujcrmf2xnlu3kxcvlsyx",
        "label": "bc1q4tdt…cvlsyx",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 460
      },
      {
        "id": "n12",
        "addr": "bc1q63qrfrpsg5hh0zzn3kp2xx9vljl7dq7tatsjxp",
        "label": "bc1q63qr…atsjxp",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 520
      },
      {
        "id": "n13",
        "addr": "bc1q6qgyrm77yzj4pfyczzhtuprfh0u55r5469sjxp",
        "label": "bc1q6qgy…69sjxp",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 580
      },
      {
        "id": "n14",
        "addr": "bc1qalwnl7dtaa73fsq5tyn0ghfy3fgfpqkt69tca8",
        "label": "bc1qalwn…69tca8",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 640
      },
      {
        "id": "n15",
        "addr": "bc1qad24qqvek2rzq8w8rhvcz5d5xget370y5ptca8",
        "label": "bc1qad24…5ptca8",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 700
      },
      {
        "id": "n16",
        "addr": "bc1qdfhmlrdvg4tm87zjl0vyf0xflp5ql50q3g88gw",
        "label": "bc1qdfhm…3g88gw",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 760
      },
      {
        "id": "n17",
        "addr": "bc1qdct7fc9mxfhqcl6ctdnm7vmu3cg3pc88cs88gw",
        "label": "bc1qdct7…cs88gw",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 820
      },
      {
        "id": "n18",
        "addr": "bc1qepc70u3u476vgvg3hfcwjgu4mecxe2uchs4lag",
        "label": "bc1qepc7…hs4lag",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 880
      },
      {
        "id": "n19",
        "addr": "bc1qe2j3zmuxewrc3ykftkxemwc52slex34s594lag",
        "label": "bc1qe2j3…594lag",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 940
      },
      {
        "id": "n20",
        "addr": "bc1qf5cyvv9w50tx9xx9s3xwsne0z87wvjj9l8a35u",
        "label": "bc1qf5cy…l8a35u",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1000
      },
      {
        "id": "n21",
        "addr": "bc1qf7vzdv46zuf75a02xx8a8j0j9j9qwdhyjza35u",
        "label": "bc1qf7vz…jza35u",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1060
      },
      {
        "id": "n22",
        "addr": "bc1qg3nrzpuvq2pxqx74tcrywr09dc208ze96n3t53",
        "label": "bc1qg3nr…6n3t53",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1120
      },
      {
        "id": "n23",
        "addr": "bc1qg6frkhjsd6tkdt4hlj0n3dppwdsgu5x0rn3t53",
        "label": "bc1qg6fr…rn3t53",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1180
      },
      {
        "id": "n24",
        "addr": "bc1qjwdw6vrzq4vf6hckutvx4ucj86awwv99mxnz7w",
        "label": "bc1qjwdw…mxnz7w",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1240
      },
      {
        "id": "n25",
        "addr": "bc1qjx6yj5x2f62jaff7nzllcjenrynyvrh3jjnz7w",
        "label": "bc1qjx6y…jjnz7w",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1300
      },
      {
        "id": "n26",
        "addr": "bc1qm2j6v3247khlwzxl7p9vqnfkghcllyhv9wjaat",
        "label": "bc1qm2j6…9wjaat",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1360
      },
      {
        "id": "n27",
        "addr": "bc1qmfty622g9frn8vnk25nmqunk9evegyxyf2jaat",
        "label": "bc1qmfty…f2jaat",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1420
      },
      {
        "id": "n28",
        "addr": "bc1qm8v88m5fy6kuq9myva2eemwycxqd3e0zcrs2l8",
        "label": "bc1qm8v8…crs2l8",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1480
      },
      {
        "id": "n29",
        "addr": "bc1qm9l94z4zr5ppf53kekpxex9ay7r3xermd0s2l8",
        "label": "bc1qm9l9…d0s2l8",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1540
      },
      {
        "id": "n30",
        "addr": "bc1qnq6jj9jmlf3945m3l8s0kxnqehrsga300k8t3s",
        "label": "bc1qnq6j…0k8t3s",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1600
      },
      {
        "id": "n31",
        "addr": "bc1qnk2d9pvtpgm7293j0ry74ckf0uj3leh8lz8t3s",
        "label": "bc1qnk2d…lz8t3s",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1660
      },
      {
        "id": "n32",
        "addr": "bc1qs3aej5tmcdz0vctz8y9rjcxtxg8v5385577s56",
        "label": "bc1qs3ae…577s56",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1720
      },
      {
        "id": "n33",
        "addr": "bc1qsrqaack4tek0l5r2ryz3y5ht3k8jq0zfxm7s56",
        "label": "bc1qsrqa…xm7s56",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1780
      },
      {
        "id": "n34",
        "addr": "bc1qs6xnmhar38z44g2za93pv8ygdcwurrh8l87w3v",
        "label": "bc1qs6xn…l87w3v",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1840
      },
      {
        "id": "n35",
        "addr": "bc1qs8ly7hwadch4dzet3rdar45zafq5p5jgar7w3v",
        "label": "bc1qs8ly…ar7w3v",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1900
      },
      {
        "id": "n36",
        "addr": "bc1qxrxujwxfnvz040jw76d26zhjdg5jura7hs968s",
        "label": "bc1qxrxu…hs968s",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 1960
      },
      {
        "id": "n37",
        "addr": "bc1qxtpf3zv6f8g05wghwqskrczdxlxzkg5s78968s",
        "label": "bc1qxtpf…78968s",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2020
      },
      {
        "id": "n38",
        "addr": "bc1qz8hdwv8gmml0u96dsvnzsagz6krjyzxmgxupdp",
        "label": "bc1qz8hd…gxupdp",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2080
      },
      {
        "id": "n39",
        "addr": "bc1qzpe6a56hpdacp7musul9zpeuznsjayqd5zupdp",
        "label": "bc1qzpe6…5zupdp",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2140
      },
      {
        "id": "n40",
        "addr": "bc1ql4mad6nxx43t79u7wadwqhtu0hx54ssg6mjlte",
        "label": "bc1ql4ma…6mjlte",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2200
      },
      {
        "id": "n41",
        "addr": "bc1q4js3dd7x95p5egv4tg5xegmhzwfh6x74jwjhfc",
        "label": "bc1q4js3…jwjhfc",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 660
      },
      {
        "id": "n42",
        "addr": "bc1qrg025e2pgx0rwya2kpgtj30972p64jt0hn6zyt",
        "label": "bc1qrg02…hn6zyt",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2260
      },
      {
        "id": "n43",
        "addr": "bc1qxg0l4p6xc50zuv9cl5f0l0wmaxjpg8wcy7s9ra",
        "label": "bc1qxg0l…y7s9ra",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2320
      },
      {
        "id": "n44",
        "addr": "bc1qt4q2c9z4xhmw9zvva6xm2wdcfvgmrlamra6y6p",
        "label": "bc1qt4q2…ra6y6p",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2380
      },
      {
        "id": "n45",
        "addr": "bc1qkx8jh7fvxjwunp5fmx65u0axpff7hny3yth9hz",
        "label": "bc1qkx8j…yth9hz",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2440
      },
      {
        "id": "n46",
        "addr": "bc1qj7mpj9sd55rzr3haguy3wv2pltvx0uuxzr5nda",
        "label": "bc1qj7mp…zr5nda",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 810
      },
      {
        "id": "n47",
        "addr": "bc1q6l9hsdrg79dhpwfuykh87nrpn76c59cs4g3aru",
        "label": "bc1q6l9h…4g3aru",
        "note": "",
        "type": "relay",
        "x": 560,
        "y": 2500
      },
      {
        "id": "n48",
        "addr": "bc1pd650mk7vh7mncnje3qmkrrshjenjqnmds0lvqsg8q6hrjqcjmktq2vyjm7",
        "label": "bc1pd650…2vyjm7",
        "note": "",
        "type": "relay",
        "x": 0,
        "y": 960
      },
      {
        "id": "tx0",
        "type": "tx",
        "label": "b1473693c9",
        "addr": "b1473693c972e8ee8a16d43e3efbe155af97761aa943284b4ed62fb3ba14ae00",
        "x": 280,
        "y": 60,
        "sub": "区块 973732",
        "note": "2026-10-30 04:20:06（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 469660000000 sats，输出 2 笔合计 469659999500 sats，矿工费 500 sats"
      },
      {
        "id": "tx1",
        "type": "tx",
        "label": "dc0edd8a71",
        "addr": "dc0edd8a71f0482c8ac366965b5a8c679a7877a36cae87e7b2094ac36dfbd6e8",
        "x": 280,
        "y": 210,
        "sub": "区块 973772",
        "note": "2026-10-30 12:34:22（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 152400 sats，输出 3 笔合计 146730 sats，矿工费 5670 sats"
      },
      {
        "id": "tx2",
        "type": "tx",
        "label": "b787a99d58",
        "addr": "b787a99d5844651232d4ed3f5add50c1cf8de1842adcc6fa329a4af215411913",
        "x": 280,
        "y": 360,
        "sub": "区块 973781",
        "note": "2026-10-30 13:46:14（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 3462 sats，输出 2 笔合计 3165 sats，矿工费 297 sats"
      },
      {
        "id": "tx3",
        "type": "tx",
        "label": "a6c9e98432",
        "addr": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "x": 280,
        "y": 510,
        "sub": "区块 973806",
        "note": "2026-10-30 18:26:31（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 22905 sats，输出 36 笔合计 11550 sats，矿工费 11355 sats"
      },
      {
        "id": "tx4",
        "type": "tx",
        "label": "bcebbd5d84",
        "addr": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "x": 280,
        "y": 660,
        "sub": "区块 973818",
        "note": "2026-10-30 19:43:45（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 150600 sats，输出 20 笔合计 149490 sats，矿工费 1110 sats"
      },
      {
        "id": "tx5",
        "type": "tx",
        "label": "543c8c164b",
        "addr": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "x": 280,
        "y": 810,
        "sub": "区块 973841",
        "note": "2026-10-31 00:03:38（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 131490 sats，输出 21 笔合计 127740 sats，矿工费 3750 sats"
      },
      {
        "id": "tx6",
        "type": "tx",
        "label": "836e3dbd6a",
        "addr": "836e3dbd6a7253c534114213482eb9f06810b828fded13f1a575ba552083c7c1",
        "x": 280,
        "y": 960,
        "sub": "区块 973848",
        "note": "2026-10-31 00:35:16（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 2795814 sats，输出 3 笔合计 2795368 sats，矿工费 446 sats"
      },
      {
        "id": "tx7",
        "type": "tx",
        "label": "1bec09e18a",
        "addr": "1bec09e18a444adf214668043c5276a409bd8994df6c6e76ca227f5e4c31dc30",
        "x": 280,
        "y": 1110,
        "sub": "区块 973930",
        "note": "2026-10-31 13:00:57（UTC+8）；本地址作为输出（接收方向）；输入 1 笔合计 5502 sats，输出 3 笔合计 5456 sats，矿工费 46 sats"
      }
    ],
    "txs": [
      {
        "from": "n1",
        "to": "tx0",
        "t": 973732,
        "amt": "469660000000 sats",
        "eth": null,
        "ts": 1793305206,
        "hash": "b1473693c972e8ee8a16d43e3efbe155af97761aa943284b4ed62fb3ba14ae00",
        "note": "输入（交易级）"
      },
      {
        "from": "tx0",
        "to": "n0",
        "t": 973732,
        "amt": "100000000000 sats",
        "eth": null,
        "ts": 1793305206,
        "hash": "b1473693c972e8ee8a16d43e3efbe155af97761aa943284b4ed62fb3ba14ae00",
        "note": "输出（交易级）"
      },
      {
        "from": "tx0",
        "to": "n2",
        "t": 973732,
        "amt": "369659999500 sats",
        "eth": null,
        "ts": 1793305206,
        "hash": "b1473693c972e8ee8a16d43e3efbe155af97761aa943284b4ed62fb3ba14ae00",
        "note": "输出（交易级）"
      },
      {
        "from": "n3",
        "to": "tx1",
        "t": 973772,
        "amt": "152400 sats",
        "eth": null,
        "ts": 1793334862,
        "hash": "dc0edd8a71f0482c8ac366965b5a8c679a7877a36cae87e7b2094ac36dfbd6e8",
        "note": "输入（交易级）"
      },
      {
        "from": "tx1",
        "to": "n0",
        "t": 973772,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793334862,
        "hash": "dc0edd8a71f0482c8ac366965b5a8c679a7877a36cae87e7b2094ac36dfbd6e8",
        "note": "输出（交易级）"
      },
      {
        "from": "tx1",
        "to": "n3",
        "t": 973772,
        "amt": "145730 sats",
        "eth": null,
        "ts": 1793334862,
        "hash": "dc0edd8a71f0482c8ac366965b5a8c679a7877a36cae87e7b2094ac36dfbd6e8",
        "note": "输出（交易级）"
      },
      {
        "from": "n4",
        "to": "tx2",
        "t": 973781,
        "amt": "3462 sats",
        "eth": null,
        "ts": 1793339174,
        "hash": "b787a99d5844651232d4ed3f5add50c1cf8de1842adcc6fa329a4af215411913",
        "note": "输入（交易级）"
      },
      {
        "from": "tx2",
        "to": "n0",
        "t": 973781,
        "amt": "333 sats",
        "eth": null,
        "ts": 1793339174,
        "hash": "b787a99d5844651232d4ed3f5add50c1cf8de1842adcc6fa329a4af215411913",
        "note": "输出（交易级）"
      },
      {
        "from": "tx2",
        "to": "n5",
        "t": 973781,
        "amt": "2832 sats",
        "eth": null,
        "ts": 1793339174,
        "hash": "b787a99d5844651232d4ed3f5add50c1cf8de1842adcc6fa329a4af215411913",
        "note": "输出（交易级）"
      },
      {
        "from": "n6",
        "to": "tx3",
        "t": 973806,
        "amt": "22905 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输入（交易级）"
      },
      {
        "from": "tx3",
        "to": "n0",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n7",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n8",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n9",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n10",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n11",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n12",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n13",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n14",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n15",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n16",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n17",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n18",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n19",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n20",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n21",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n22",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n23",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n24",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n25",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n26",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n27",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n28",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n29",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n30",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n31",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n32",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n33",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n34",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n35",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n36",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n37",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n38",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n39",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "tx3",
        "to": "n40",
        "t": 973806,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793355991,
        "hash": "a6c9e984325cd3a9d449c5595d46b0de35c7a24f7ab79fa4e5f4c8073da38095",
        "note": "输出（交易级）"
      },
      {
        "from": "n41",
        "to": "tx4",
        "t": 973818,
        "amt": "150600 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输入（交易级）"
      },
      {
        "from": "tx4",
        "to": "n38",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n42",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n36",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n43",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n22",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n20",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n8",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n16",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n0",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n32",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n34",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n24",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n30",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n10",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n18",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n28",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n26",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n14",
        "t": 973818,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "tx4",
        "to": "n44",
        "t": 973818,
        "amt": "131490 sats",
        "eth": null,
        "ts": 1793360625,
        "hash": "bcebbd5d84a43895c3dd288c395d11b2a5da0795df72a3ff583efd62c8d8130f",
        "note": "输出（交易级）"
      },
      {
        "from": "n44",
        "to": "tx5",
        "t": 973841,
        "amt": "131490 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输入（交易级）"
      },
      {
        "from": "tx5",
        "to": "n38",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n42",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n36",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n43",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n22",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n20",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n8",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n16",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n0",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n32",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n34",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n24",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n30",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n10",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n18",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n12",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n28",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n26",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n14",
        "t": 973841,
        "amt": "1000 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "tx5",
        "to": "n45",
        "t": 973841,
        "amt": "108740 sats",
        "eth": null,
        "ts": 1793376218,
        "hash": "543c8c164bf34e1c85fb688f3ad925c6cd4ec43d2bff543fbc0b243c75c143bf",
        "note": "输出（交易级）"
      },
      {
        "from": "n46",
        "to": "tx6",
        "t": 973848,
        "amt": "2795814 sats",
        "eth": null,
        "ts": 1793378116,
        "hash": "836e3dbd6a7253c534114213482eb9f06810b828fded13f1a575ba552083c7c1",
        "note": "输入（交易级）"
      },
      {
        "from": "tx6",
        "to": "n0",
        "t": 973848,
        "amt": "779 sats",
        "eth": null,
        "ts": 1793378116,
        "hash": "836e3dbd6a7253c534114213482eb9f06810b828fded13f1a575ba552083c7c1",
        "note": "输出（交易级）"
      },
      {
        "from": "tx6",
        "to": "n47",
        "t": 973848,
        "amt": "2794589 sats",
        "eth": null,
        "ts": 1793378116,
        "hash": "836e3dbd6a7253c534114213482eb9f06810b828fded13f1a575ba552083c7c1",
        "note": "输出（交易级）"
      },
      {
        "from": "n48",
        "to": "tx7",
        "t": 973930,
        "amt": "5502 sats",
        "eth": null,
        "ts": 1793422857,
        "hash": "1bec09e18a444adf214668043c5276a409bd8994df6c6e76ca227f5e4c31dc30",
        "note": "输入（交易级）"
      },
      {
        "from": "tx7",
        "to": "n0",
        "t": 973930,
        "amt": "330 sats",
        "eth": null,
        "ts": 1793422857,
        "hash": "1bec09e18a444adf214668043c5276a409bd8994df6c6e76ca227f5e4c31dc30",
        "note": "输出（交易级）"
      },
      {
        "from": "tx7",
        "to": "n48",
        "t": 973930,
        "amt": "5126 sats",
        "eth": null,
        "ts": 1793422857,
        "hash": "1bec09e18a444adf214668043c5276a409bd8994df6c6e76ca227f5e4c31dc30",
        "note": "输出（交易级）"
      }
    ]
  },
  {
    "id": "tron",
    "focus": "n0",
    "tab": "Tron 演示",
    "tabK": "演示·合成数据",
    "kind": "real",
    "unit": "time",
    "chain": "tron",
    "official": false,
    "demo": true,
    "title": "Tron 交易级追踪 · 演示（合成数据）",
    "short": "Tron 演示",
    "en": "Tron synthetic demo (not a real case)",
    "facts": [
      [
        "演示",
        "是——合成数据（tests/fixtures/tron-demo 夹具回放），不是真实案件，仅演示 Tron 追踪流程"
      ],
      [
        "起点",
        "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV"
      ],
      [
        "链",
        "Tron（账户模型；原生 TRX + TRC20）"
      ],
      [
        "数据来源",
        "TronGrid 公开 API（https://api.trongrid.io），抓取 2026-10-31T14:19:04.372Z"
      ],
      [
        "余额",
        "5000000000 SUN（5000 TRX；仅原生 TRX）"
      ],
      [
        "金额口径",
        "整数最小单位（TRX / USDT 均为 6 位小数），同时给出人类可读；只列发送方与接收方（链上事实），不推断归属"
      ],
      [
        "局限",
        "TRC20 摘要无区块号：时间轴按时间戳排序，标签写「时间」而非「区块」；USDT 为可冻结稳定币（可冻≠已冻）"
      ]
    ],
    "banner": [
      "<b>演示（合成数据）</b> · 不是真实案件，仅演示 Tron 追踪流程",
      "只列发送方与接收方（链上事实），不推断归属；USDT 可冻结（可冻≠已冻）"
    ],
    "channels": "受害方官方渠道；相关交易所合规团队；执法机关",
    "nodes": [
      {
        "id": "n0",
        "type": "relay",
        "label": "追踪起点（用户输入）",
        "addr": "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV",
        "note": "演示起点（合成数据，非真实地址）",
        "x": 280,
        "y": 120
      },
      {
        "id": "n1",
        "type": "relay",
        "label": "TEdvoHEa…n4QFhy",
        "addr": "TEdvoHEatmDKvTh3o9vBRB9Vdtbhn4QFhy",
        "note": "",
        "x": 0,
        "y": 60
      },
      {
        "id": "n2",
        "type": "relay",
        "label": "TD5gsCwx…ZKYp4E",
        "addr": "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E",
        "note": "",
        "x": 560,
        "y": 40
      },
      {
        "id": "n3",
        "type": "relay",
        "label": "TGCAjMXC…uyexBv",
        "addr": "TGCAjMXComunWZEXCT1LPBdcYbDVuyexBv",
        "note": "",
        "x": 560,
        "y": 190
      }
    ],
    "txs": [
      {
        "from": "n1",
        "to": "n0",
        "t": 1699999500,
        "amt": "250 TRX",
        "eth": null,
        "ts": 1699999500,
        "hash": "a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
        "note": "区块 60000050；"
      },
      {
        "from": "n0",
        "to": "n2",
        "t": 1700000000,
        "amt": "1000 TRX",
        "eth": null,
        "ts": 1700000000,
        "hash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
        "note": "区块 60000100；"
      },
      {
        "from": "n0",
        "to": "n3",
        "t": 1700000500,
        "amt": "308.7 USDT",
        "eth": null,
        "ts": 1700000500,
        "hash": "b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1",
        "flags": [
          "freeze"
        ],
        "note": "可冻结稳定币（可冻≠已冻）（TRC20 摘要无区块号）"
      }
    ]
  }
];
