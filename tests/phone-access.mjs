import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const live = process.env.KARAMBE_LIVE === '1';
const base = 'https://falloutmule.github.io/karambe-village-water-run/';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, acceptDownloads: true });
if (!live) await context.route(base + '**', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync('index.html') }));
const page = await context.newPage();
const errors = [], requests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (request.resourceType() !== 'document' && !request.url().startsWith('data:')) requests.push(request.url()); });
try {
  if (live) {
    const response = await fetch(base + 'index.html', { cache: 'no-store' });
    assert.equal(response.status, 200);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync('index.html')));
    checks.push('live bytes match index.html');
  }
  for (const [width, height] of [[320, 568], [390, 844], [412, 915]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    assert.equal(await page.locator('.level-pick').count(), 3);
    for (const button of await page.locator('.level-pick').all()) {
      const rect = await button.boundingBox();
      assert.ok(rect.y >= 0 && rect.y + rect.height <= height && rect.x >= 0 && rect.x + rect.width <= width);
    }
    assert.ok(await page.locator('#downloadBtn').isVisible() && await page.locator('#installBtn').isVisible());
    const installRect = await page.locator('#installBtn').boundingBox();
    assert.ok(installRect.y + installRect.height <= height);
    checks.push(`selector and download visible ${width}x${height}`);
    for (let index = 0; index < 3; index++) {
      await page.locator('.level-pick').nth(index).tap();
      assert.ok(!await page.locator('#overlay').evaluate(element => element.classList.contains('open')));
      await page.locator('#menuBtn').tap();
    }
    checks.push(`touch enters all three levels ${width}x${height}`);
  }

  await page.goto(pathToFileURL(path.resolve('index.html')).href + '?dev=1');
  assert.equal(await page.locator('.level-pick').count(), 3);
  for (let index = 0; index < 3; index++) {
    await page.locator('.level-pick').nth(index).tap();
    assert.equal(await page.evaluate(() => CR.game.level), index + 1);
    assert.equal(await page.evaluate(() => CR.game.state), 'playing');
    await page.locator('#menuBtn').tap();
  }
  assert.ok(await page.evaluate(() => CR.runFullSelfCheck().pass));
  assert.ok(await page.locator('#offlineStatus').isVisible());
  assert.ok(!await page.locator('#downloadBtn').isVisible());
  checks.push('downloaded index.html boots offline and starts all levels');

  await page.goto(base);
  await page.setViewportSize({ width: 320, height: 568 });
  fs.mkdirSync('test-results/phone-access', { recursive: true });
  await page.screenshot({ path: 'test-results/phone-access/selector.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  fs.writeFileSync('test-results/phone-access/' + (live ? 'live' : 'local') + '.json', JSON.stringify({ pass: true, live, url: base, checks, errors, unexpectedRequests: requests }, null, 2));
  console.log(JSON.stringify({ pass: true, live, checks }));
} finally {
  await browser.close();
}
