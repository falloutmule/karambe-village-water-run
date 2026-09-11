import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const live = process.env.KARAMBE_LIVE === '1';
const base = 'https://falloutmule.github.io/karambe-village-water-run/';
const viewports = [[320, 568], [390, 844], [412, 915]];
const controlIds = ['left', 'right', 'can', 'jump'];
const { defaultBrowserType: _ignored, ...android } = devices['Pixel 5'];
const server = live ? null : http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!['/', '/index.html'].includes(pathname)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  response.end(fs.readFileSync('index.html'));
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const target = live ? base : `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ ...android, viewport: { width: 320, height: 568 }, acceptDownloads: true });
await context.addInitScript(() => {
  window.__phoneProbe = { vibrations: [], audioStarts: 0, contexts: 0 };
  try {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value(pattern) { window.__phoneProbe.vibrations.push(pattern); return true; }
    });
  } catch {}
  const Native = window.AudioContext;
  if (Native) {
    window.AudioContext = new Proxy(Native, {
      construct(target, args) {
        const context = Reflect.construct(target, args);
        window.__phoneProbe.contexts++;
        for (const method of ['createOscillator', 'createBufferSource']) {
          const nativeMethod = context[method].bind(context);
          context[method] = (...methodArgs) => {
            const source = nativeMethod(...methodArgs);
            const start = source.start.bind(source);
            source.start = (...startArgs) => { window.__phoneProbe.audioStarts++; return start(...startArgs); };
            return source;
          };
        }
        return context;
      }
    });
  }
});

const page = await context.newPage();
const errors = [], requests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => {
  if (request.resourceType() !== 'document' && !request.url().startsWith('data:')) requests.push(request.url());
});

async function installTouchObserver() {
  await page.evaluate(() => {
    window.__phoneTouchDefaults = [];
    const root = document.getElementById('sfhs-game-controls');
    if (!root) throw new Error('missing mobile control root');
    root.addEventListener('touchstart', event => {
      window.__phoneTouchDefaults.push({ trusted: event.isTrusted, prevented: event.defaultPrevented });
    }, { passive: true });
  });
}

async function setSound(enabled) {
  const overlay = page.locator('#overlay');
  const wasOpen = await overlay.evaluate(element => element.classList.contains('open'));
  if (!wasOpen) await page.locator('#menuBtn').tap();
  const button = page.locator('#soundBtn');
  const current = (await button.textContent())?.includes('ON');
  if (current !== enabled) await button.tap();
  assert.equal((await button.textContent())?.includes('ON'), enabled);
  if (!wasOpen) await page.locator('#primaryBtn').tap();
}

async function touch(ids, holdMs = 360) {
  await page.evaluate(() => { window.__phoneTouchDefaults = []; });
  const points = [];
  for (let index = 0; index < ids.length; index++) {
    const rect = await page.locator(`[data-sfhs-control-id="${ids[index]}"]`).boundingBox();
    assert.ok(rect, `${ids[index]} control is visible`);
    points.push({ id: index + 1, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await page.waitForTimeout(holdMs);
  assert.equal(await page.locator('[data-control-active="true"]').count(), ids.length, `${ids.join('+')} remains owned while held`);
  const defaults = await page.evaluate(() => window.__phoneTouchDefaults);
  assert.ok(defaults.length > 0 && defaults.every(event => event.trusted && event.prevented), `${ids.join('+')} cancels trusted touch defaults`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await page.locator('[data-control-active="true"]').count(), 0, `${ids.join('+')} releases cleanly`);
}

async function exerciseControls(label) {
  await installTouchObserver();
  await setSound(false);
  let audio = await page.evaluate(() => ({ ...window.__phoneProbe }));
  for (const id of controlIds) await touch([id]);
  let after = await page.evaluate(() => ({ ...window.__phoneProbe }));
  assert.equal(after.contexts, audio.contexts, `${label}: muted holds do not open audio`);

  await setSound(true);
  audio = await page.evaluate(() => ({ ...window.__phoneProbe }));
  for (const id of controlIds) await touch([id]);
  await touch(['right', 'can'], 500);
  await touch(['left', 'jump'], 500);
  after = await page.evaluate(() => ({ ...window.__phoneProbe }));
  assert.ok(after.contexts > audio.contexts || after.audioStarts > audio.audioStarts, `${label}: sound-enabled real-time loop creates audio`);
  assert.deepEqual(after.vibrations, [], `${label}: controls never request vibration`);
  checks.push(`${label}: all controls SOUND OFF/ON, simultaneous contacts, trusted defaults, audio, and release`);
}

try {
  if (live) {
    const response = await fetch(base + 'index.html', { cache: 'no-store' });
    assert.equal(response.status, 200);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync('index.html')));
    checks.push('live bytes match index.html');
  }

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto(target);
    assert.equal(await page.locator('.level-pick').count(), 0);
    assert.equal(await page.locator('#levelSelectBox').isVisible(), false);
    assert.ok(await page.locator('#downloadBtn').isVisible() && await page.locator('#installBtn').isVisible());
    const installRect = await page.locator('#installBtn').boundingBox();
    assert.ok(installRect.y + installRect.height <= height);
    checks.push(`fresh release locks selector and shows download ${width}x${height}`);
    await page.locator('#primaryBtn').tap();
    await exerciseControls(`${width}x${height}`);
  }

  const downloadContext = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const downloadPage = await downloadContext.newPage();
  await downloadPage.goto(target);
  const [download] = await Promise.all([downloadPage.waitForEvent('download'), downloadPage.locator('#downloadBtn').click()]);
  const downloadDir = 'test-results/phone-access';
  fs.mkdirSync(downloadDir, { recursive: true });
  const downloadedPath = path.resolve(downloadDir, 'downloaded.html');
  const temporaryPath = await download.path();
  assert.ok(temporaryPath, 'browser completed offline download');
  fs.copyFileSync(temporaryPath, downloadedPath);
  await downloadContext.close();
  assert.equal(download.suggestedFilename(), 'Karambe-Village-Water-Run.html');
  assert.ok(fs.readFileSync(downloadedPath).equals(fs.readFileSync('index.html')), 'downloaded bytes match index.html');

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(pathToFileURL(downloadedPath).href + '?dev=1');
  assert.equal(await page.locator('.level-pick').count(), 3);
  for (let index = 0; index < 3; index++) {
    await page.locator('.level-pick').nth(index).tap();
    assert.equal(await page.evaluate(() => CR.game?.level), index + 1);
    assert.equal(await page.evaluate(() => CR.game?.state), 'playing');
    await page.locator('#menuBtn').tap();
  }
  assert.ok(await page.evaluate(() => CR.runFullSelfCheck().pass));
  assert.ok(await page.locator('#offlineStatus').isVisible());
  assert.ok(!await page.locator('#downloadBtn').isVisible());
  await page.locator('.level-pick').first().tap();
  await exerciseControls('downloaded file');
  checks.push('downloaded exact artifact boots offline; development bypass starts all levels');

  await page.goto(target);
  await page.setViewportSize({ width: 320, height: 568 });
  fs.mkdirSync('test-results/phone-access', { recursive: true });
  await page.screenshot({ path: 'test-results/phone-access/locked-start.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const proof = { pass: true, live, url: base, device: devices['Pixel 5'].userAgent, checks, errors, unexpectedRequests: requests };
  fs.writeFileSync(`test-results/phone-access/${live ? 'live' : 'local'}.json`, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ pass: true, live, checks }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
