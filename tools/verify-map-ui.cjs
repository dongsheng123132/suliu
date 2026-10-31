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
    await page.getByRole('tab', { name: /Bitget/ }).click();
    if (await page.locator('#world').innerHTML() !== before) throw new Error('Bitget rendering changed after switching cases');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ tabs, binanceNodes: nodes, timeline: { early, late }, bitgetRestored: true, errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
