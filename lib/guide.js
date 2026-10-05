/* 溯流 · 报案指引（UMD）：浏览器挂 window.SuliuGuide，Node 下 module.exports；零依赖、无 ESM 语法，file:// 可用 <script src> 加载。
 *
 * 内容逐字来自 docs/报案指引.md 的八个一级部分（一到八）；有出入以 md 为准（tests/guide.test.mjs 逐项对照 md，防漏抄、防改写）。
 * 导出 { version, sections: [{id, title, html}], note }：
 *   - html 只用 lib/report.js 的 sanitizeFragment 白名单里的标签与 class；不含 <script>、on* 属性、任何 http(s) 链接（ic3.gov 之类只作为文字出现）；
 *   - 模板里的空格（＿＿）包在 <span class="blank">（窄）/ <span class="blank wide">（地址、哈希）里：文字照旧，打印时由样式留出手写的下划线宽度；
 *   - note 是 md 末尾那句免责说明（纯文本，不含标记），由报告附录与页面对话框在最后单独显示。
 * 报告第 9 节「附录：报案指引」与页面「报案指引」对话框读的是同一份；缺这个文件时报告照常生成、只是没有附录。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SuliuGuide = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const sections = [
    {
      id: 'first-steps',
      title: '一、被盗后最先做的三件事',
      html: [
        `<ol><li><strong>止损。</strong> 如果是私钥或助记词泄露，立刻把钱包里剩下的资产转到一个全新钱包（新助记词、最好换一台设备）；如果是授权被盗（点了钓鱼链接、签了授权），先在钱包里取消对可疑合约的授权（revoke），再转移资产。</li><li><strong>固定证据。</strong> 用本工具生成证据报告并保存为 PDF；记下被盗那一笔交易的哈希和时间。</li><li><strong>抢时间。</strong> 报告里如果出现"进入交易所"或"可冻结稳定币（USDT/USDC）"，越早报告越有机会冻结——冻结窗口常常只有几分钟到几小时。</li></ol>`
      ].join('')
    },
    {
      id: 'individual-cn',
      title: '二、个人怎么报案（中国大陆）',
      html: [
        `<ul><li><strong>去哪里</strong>：向当地公安机关报案（拨打 110，或到辖区派出所）。报案时说明是"网络盗窃"或"网络诈骗"，由公安机关按管辖安排办理部门。属于网络诈骗的，可以同时在"国家反诈中心"App 里举报。</li><li><strong>带什么</strong>：<ul><li>本人身份证件；</li><li>被盗钱包地址，以及"这个钱包是你的"的证明：钱包 App 截图、当初从哪个交易所提币到这个地址的记录（提币记录最有说服力）；会操作的话，可以用该地址对一段文字签名；</li><li>被盗经过的时间线：什么时候、在哪里、做了什么操作、什么时候发现；</li><li>本报告（交易明细里有每一笔的时间、金额、交易哈希和区块浏览器链接）；</li><li>诈骗类还要带：与对方的聊天记录、对方账号、网址或 App 名称、你给对方转账的记录。</li></ul></li><li><strong>要拿到什么</strong>：报案回执（受案回执或立案通知）。交易所和稳定币发行方冻结资金，通常要看执法机关出具的正式请求。</li><li><strong>如果没有立案</strong>：可以询问是否能出具书面告知，以及有什么复议或补充材料的途径，以当地公安机关的说明为准。</li><li><strong>提醒</strong>：各地公安机关对虚拟货币案件的受理口径不同，以当地要求为准。</li></ul>`
      ].join('')
    },
    {
      id: 'other-regions',
      title: '三、其他国家和地区',
      html: [
        `<p>向当地警方或官方网络犯罪举报平台报案。例如：美国可向 FBI 的 IC3（ic3.gov）举报；中国香港可向香港警务处报案（支持网上报案）；新加坡可向新加坡警察部队报案（支持网上报案）。带的材料与上面相同。</p>`
      ].join('')
    },
    {
      id: 'organizations',
      title: '四、企业和项目方',
      html: [
        `<ul><li>由法务或安全负责人牵头，指定一个对外窗口，所有对外沟通留记录。</li><li>保全内部证据：服务器和访问日志、密钥管理记录、相关人员操作记录，不要在调查前清理或重装。</li><li>报案：同上，并按所在司法辖区的要求评估是否需要通知受影响用户或监管机构。</li><li>公开攻击者地址：像 Bitget 这次一样，把攻击者地址公开（附交易哈希），方便交易所和协议自动拦截。</li><li>可联系白帽应急组织协助，例如 Security Alliance 的 SEAL 911（社区组织，不是官方机构）。</li><li>如果要发悬赏，由企业自己发布、自己出资、自己发放，并写清规则。</li></ul>`
      ].join('')
    },
    {
      id: 'chokepoints',
      title: '五、资金到了不同"卡点"，分别怎么联系',
      html: [
        `<table><thead><tr><th>卡点</th><th>谁能动</th><th>怎么联系</th><th>带什么</th></tr></thead><tbody><tr><td>中心化交易所（充值地址）</td><td>交易所</td><td>在该交易所官网找"执法请求 / Law Enforcement"入口或安全邮箱；同时开工单要求先保全账户</td><td>收款地址、交易哈希、金额、时间、报案回执编号、本报告</td></tr><tr><td>USDT / USDC 等可冻结稳定币</td><td>发行方（Tether / Circle）</td><td>发行方一般只接受执法机关的冻结请求：把地址和交易哈希交给办案警方，由警方提交</td><td>持币地址、相关交易哈希、本报告</td></tr><tr><td>跨链 / 兑换协议（如 Chainflip、THORChain）</td><td>视协议而定，去中心化协议可能无法冻结</td><td>在协议官网或官方社交账号找安全联系方式（Security / Bug Bounty）</td><td>存入交易哈希、目标链和收款地址（若已知）</td></tr><tr><td>混币器</td><td>基本无法冻结</td><td>记录存入时间与面额，交给警方，供日后关联取出</td><td>存入交易哈希</td></tr></tbody></table>`
      ].join('')
    },
    {
      id: 'freeze-template',
      title: '六、给交易所的冻结 / 保全请求（模板）',
      html: [
        `<p><strong>中文：</strong></p>`,
        `<blockquote><p>主题：紧急：被盗资金已存入贵平台，请求冻结与保全记录（案件编号：<span class="blank">＿＿</span>）</p><p>我们是<span class="blank">＿＿</span>（个人姓名 / 公司名称）。<span class="blank">＿＿</span>年<span class="blank">＿＿</span>月<span class="blank">＿＿</span>日（UTC+8），钱包 <span class="blank wide">＿＿</span> 中的资产被盗，被盗交易哈希 <span class="blank wide">＿＿</span>。<br>根据公开链上数据，其中 <span class="blank">＿＿</span>（金额与币种）于 <span class="blank">＿＿</span>（时间）通过交易 <span class="blank wide">＿＿</span> 转入地址 <span class="blank wide">＿＿</span>，该地址疑似贵平台的用户充值地址。<br>我们已向 <span class="blank">＿＿</span>（公安机关名称）报案，回执编号 <span class="blank">＿＿</span>。恳请贵平台冻结相关账户并保全账户与交易记录，等待执法机关的正式调取。证据报告见附件。<br>联系人：<span class="blank">＿＿</span> 联系方式：<span class="blank">＿＿</span></p></blockquote>`,
        `<p><strong>English:</strong></p>`,
        `<blockquote><p>Subject: URGENT – Stolen funds deposited to your platform – freeze and preservation request (Case <span class="blank">＿＿</span>)</p><p>We are <span class="blank">＿＿</span>. On <span class="blank">＿＿</span> (UTC), assets were stolen from wallet <span class="blank wide">＿＿</span> (tx <span class="blank wide">＿＿</span>). Public on-chain data shows that <span class="blank">＿＿</span> (amount/asset) was transferred to address <span class="blank wide">＿＿</span>, which appears to be a deposit address on your platform, in tx <span class="blank wide">＿＿</span> at <span class="blank">＿＿</span> (UTC).<br>The theft has been reported to <span class="blank">＿＿</span> (police authority), report no. <span class="blank">＿＿</span>. We respectfully request that you freeze the associated account and preserve all related records pending a formal law enforcement request. The evidence report is attached.<br>Contact: <span class="blank">＿＿</span></p></blockquote>`
      ].join('')
    },
    {
      id: 'avoid-scams',
      title: '七、防止二次被骗',
      html: [
        `<ul><li>任何声称"先交钱就能帮你追回"的人或公司，几乎都是骗子。</li><li>交易所和项目方的官方人员不会主动私信你要钱、要助记词。</li><li>永远不要把助记词、私钥交给任何人，包括自称"安全专家"的人。</li><li>溯流是免费的开源工具：不向受害者收费，不承诺追回。</li></ul>`
      ].join('')
    },
    {
      id: 'preserve-evidence',
      title: '八、证据保全小贴士',
      html: [
        `<ul><li>截图要带上系统时间；原始文件（聊天记录导出、交易所账单）不要只留截图。</li><li>每联系一个机构，记下时间、对象、渠道、对方答复。</li><li>报告和所有材料各存两份（电脑 + 云盘或 U 盘）。</li></ul>`
      ].join('')
    }
  ];

  return Object.freeze({
    version: '2026-10-05',
    sections: Object.freeze(sections.map(s => Object.freeze(s))),
    note: "本指引是一般性信息整理，不构成法律意见；具体以当地公安机关和相关机构的要求为准。"
  });
});
