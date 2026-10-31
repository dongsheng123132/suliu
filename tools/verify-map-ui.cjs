// Run with SULIU_PLAYWRIGHT_MODULE pointing at an installed Playwright module.
// Exercises the real page; does not add a runtime dependency to Suliu.
const { chromium } = require(process.env.SULIU_PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SULIU_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1050 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.SULIU_MAP_URL || 'file://' + path.resolve(__dirname, '../溯流资金画布.html'));
    await page.getByRole('tab', { name: /Bitget/ }).waitFor();
    const before = await page.locator('#world').innerHTML();
    const tabs = await page.getByRole('tab').allTextContents();
    if (tabs.length !== 4 || !tabs.some(t => /BTC/.test(t)) || !tabs.some(t => /Tron/.test(t))) throw new Error('Expected Bitget / 币安 / BTC / Tron tabs, got: ' + JSON.stringify(tabs));

    // ---- 币安（原有案例保持不变）----
    const binance = page.getByRole('tab', { name: /币安|Binance/ });
    if (await binance.count() !== 1) throw new Error('Expected one Binance case tab');
    await binance.click();
    await page.getByRole('tab', { name: /币安|Binance/ }).getAttribute('aria-selected').then(v => { if (v !== 'true') throw new Error('Binance case not selected'); });
    const nodes = await page.locator('[data-node]').count();
    if (nodes < 4) throw new Error('Binance graph has too few rendered nodes');
    await page.locator('[data-node]').first().click();
    if (!await page.locator('a[href^="https://etherscan.io/address/"]').count()) throw new Error('Missing address evidence link');
    await page.locator('input[type=range]').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const early = await page.locator('#nowLbl').textContent();
    await page.locator('input[type=range]').evaluate(el => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const late = await page.locator('#nowLbl').textContent();
    if (early === late) throw new Error('Timeline did not move');
    fs.mkdirSync(path.resolve(__dirname, '../docs/img'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../docs/img/binance-funds-map.png') });

    // ---- BTC：二部图（交易是节点），链接走 mempool.space，时间轴按区块 ----
    await page.getByRole('tab', { name: /BTC/ }).click();
    const btc = await page.evaluate(() => {
      const txIds = new Set([...document.querySelectorAll('g.nd.t-tx')].map(e => e.getAttribute('data-node')));
      const edgeKeys = [...new Set([...document.querySelectorAll('[data-edge]')].map(e => e.getAttribute('data-edge')))];
      const edges = edgeKeys.map(k => k.split('|'));
      const bad = edges.filter(([f, t]) => !txIds.has(f) && !txIds.has(t)).length;
      const txLabels = [...document.querySelectorAll('g.nd.t-tx .lb')].map(e => e.textContent);
      return { txCount: txIds.size, edgeCount: edges.length, badEdges: bad, txLabels, now: document.querySelector('#nowLbl').textContent };
    });
    if (btc.txCount !== 8) throw new Error('BTC case should render 8 transaction nodes, got ' + btc.txCount);
    if (btc.badEdges !== 0) throw new Error('BTC case has address→address edges: ' + btc.badEdges);
    if (!btc.txLabels.every(l => /^[0-9a-f]{10}$/.test(l))) throw new Error('BTC tx node labels should be txid first 10: ' + JSON.stringify(btc.txLabels));
    if (!/区块/.test(btc.now)) throw new Error('BTC timeline should be labelled 区块: ' + btc.now);
    await page.locator('g.nd.t-tx').first().click();
    if (!await page.locator('a[href^="https://mempool.space/tx/"]').count()) throw new Error('Missing mempool.space tx link on BTC tx node');
    await page.locator('g.nd:not(.t-tx)').first().click();
    if (!await page.locator('a[href^="https://mempool.space/address/"]').count()) throw new Error('Missing mempool.space address link on BTC address node');
    await page.screenshot({ path: path.resolve(__dirname, '../docs/img/btc-funds-map.png') });

    // ---- Tron：演示标记、时间轴按时间、链接走 tronscan ----
    await page.getByRole('tab', { name: /Tron/ }).click();
    const tron = await page.evaluate(() => ({
      card: document.querySelector('#caseCard').textContent,
      banner: document.querySelector('#banner').textContent,
      now: document.querySelector('#nowLbl').textContent,
      nodes: document.querySelectorAll('[data-node]').length
    }));
    if (!/演示/.test(tron.card) || !/合成数据/.test(tron.card)) throw new Error('Tron case card missing 演示（合成数据） marker: ' + tron.card.slice(0, 120));
    if (!/演示/.test(tron.banner)) throw new Error('Tron banner missing 演示 marker');
    if (!/时间/.test(tron.now) || /区块/.test(tron.now)) throw new Error('Tron timeline should be labelled 时间: ' + tron.now);
    await page.locator('[data-node]').first().click();
    if (!await page.locator('a[href^="https://tronscan.org/"]').count()) throw new Error('Missing tronscan link on Tron node');
    await page.screenshot({ path: path.resolve(__dirname, '../docs/img/tron-funds-map.png') });

    // ---- 切回 Bitget：原渲染逐字节不变 ----
    await page.getByRole('tab', { name: /Bitget/ }).click();
    if (await page.locator('#world').innerHTML() !== before) throw new Error('Bitget rendering changed after switching cases');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ tabs, binanceNodes: nodes, timeline: { early, late }, btc, tron: { now: tron.now, nodes: tron.nodes }, bitgetRestored: true, errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
