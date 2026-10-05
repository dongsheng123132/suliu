/* 溯流 · 品牌位（UMD）：浏览器挂 window.SuliuBrand，Node 下 module.exports；零依赖、无 ESM 语法，file:// 可用 <script src> 加载。
 *
 * 这个文件只放「对外署名」用的几个字段，由运营者自己改；页面顶栏、页面底部、报告页脚读取它。
 *   name        品牌名（页面顶栏、报告页脚）
 *   tagline     一句话副标题（页面顶栏）
 *   serviceNote 预留，目前不显示
 *   contact     联系方式（电话 / 邮箱 / 微信等纯文字）。contact 与 site 都为空时，页面和报告里不显示任何「联系我们」内容
 *   site        网站。只有以 https:// 开头才会做成链接，否则只当纯文字显示
 * contact / site 任一非空时，页面底部与报告末尾显示一行「需要人工协助（企业应急、报告人工复核）：…」，并紧跟固定说明
 * 「溯流不向受害者收取「追回费」，不承诺追回。」所有字段进入页面 / 报告前都会转义。
 * 缺这个文件时页面和报告照常工作，使用内置默认值、不显示联系方式。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SuliuBrand = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    name: '溯流',
    tagline: '被盗资金证据报告',
    serviceNote: '',
    contact: '微信 hecare888 · 邮箱 hefangsheng@gmail.com',
    site: 'https://www.hequbing.com'
  };
});
