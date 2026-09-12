import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const html = fs.readFileSync('index.html', 'utf8');
const hook = 'if (DEV_ACCESS) window.CR.game = game;';
assert.equal(html.split(hook).length, 2, 'one precise instrumentation location');
// Release fixture exposes state ONLY. All normal release flags/persistence logic remain intact.
const instrumented = html.replace(hook, 'window.CR.game = game;');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!['/', '/index.html', '/instrumented.html'].includes(pathname)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  res.end(pathname === '/instrumented.html' ? instrumented : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP karambe.test 127.0.0.1'] });
const evidence = { fixture: 'Instrumented release exposes CR.game only; unmodified release separately verified', checks: [], music: [], viewports: [], unexpectedRequests: [], pageErrors: [] };
const contexts = [];
const check = (value, label) => { assert.ok(value, label); evidence.checks.push(label); };
async function session({ manual = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  page.on('request', request => { if (request.resourceType() !== 'document') evidence.unexpectedRequests.push(request.url()); });
  if (manual) await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  // Observer only: counts AudioContext construction without creating one.
  await page.addInitScript(() => {
    window.__audioCreated = 0;
    const Native = window.AudioContext;
    if (Native) window.AudioContext = new Proxy(Native, { construct(target, args) { window.__audioCreated++; return Reflect.construct(target, args); } });
  });
  return page;
}
async function threeCans(page) {
  await page.evaluate(() => { for (let i = 0; i < 3; i++) { CR.game.elapsed += 10; CR.game.can.full = true; CR.game.deliverCan(); } });
  await page.waitForTimeout(460);
}
try {
  const normal = await session();
  await normal.goto(base);
  check(await normal.evaluate(() => !CR.dev && !CR.game && !CR.controls && CR.saveVersion === 1), 'unmodified normal release has schema metadata and no debug access');
  check(await normal.locator('.level-pick').count() === 0 && !await normal.locator('#levelSelectBox').isVisible(), 'first-ever release requires the full sequential run');
  check((await normal.locator('#overlaySubtitle').textContent())?.includes('unlock Level Select'), 'fresh release explains the unlock rule');
  check(await normal.locator('#downloadBtn').isVisible() && await normal.locator('#installBtn').isVisible(), 'start menu exposes offline download and home-screen help');
  check(await normal.locator('#volumeSlider').isVisible() && await normal.locator('#volumeSlider').inputValue() === '100', 'start menu exposes full-volume adjustment');
  check(await normal.evaluate(() => window.__audioCreated === 0), 'no AudioContext before gesture');
  await normal.locator('#soundBtn').click();
  check(await normal.locator('#soundBtn').textContent() === 'SOUND: OFF', 'sound toggle disables');
  await normal.locator('#volumeSlider').fill('40');
  check(await normal.locator('#volumeValue').textContent() === '40%' && await normal.evaluate(() => localStorage.getItem('karambe-audio-volume') === '0.40'), 'volume adjustment updates and persists while muted');
  await normal.reload();
  check(await normal.locator('#soundBtn').textContent() === 'SOUND: OFF', 'mute preference persists');
  check(await normal.locator('#volumeSlider').inputValue() === '40' && await normal.locator('#volumeValue').textContent() === '40%', 'volume preference persists');
  check(await normal.evaluate(() => window.__audioCreated === 0), 'muted reload does not initialize audio');
  await normal.locator('#primaryBtn').click();
  check(await normal.locator('#overlay').evaluate(el => !el.classList.contains('open')), 'normal menu starts playable release');
  await normal.evaluate(() => localStorage.setItem('karambe-water-run-best-times', '[10,20,30]'));
  await normal.reload();
  check(await normal.locator('.level-pick').count() === 0 && !await normal.locator('#levelSelectBox').isVisible(), 'best-time entries alone do not unlock selection');

  const accessible = await session({ manual: false });
  await accessible.goto(base);
  await accessible.waitForTimeout(100);
  check(await accessible.evaluate(() => document.getElementById('app').inert && document.activeElement?.id === 'primaryBtn'), 'open dialog makes gameplay inert and focuses its primary action');
  check(await accessible.locator('#overlay').getAttribute('aria-describedby') === 'overlaySubtitle', 'dialog title and description are associated');
  await accessible.locator('#secondaryBtn').click();
  check(await accessible.locator('#secondaryBtn').getAttribute('aria-expanded') === 'true' && await accessible.locator('#overlayBody').isVisible(), 'help expansion exposes its state');
  await accessible.locator('#primaryBtn').click();
  check(await accessible.evaluate(() => !document.getElementById('app').inert && document.activeElement?.id === 'menuBtn'), 'closing dialog restores gameplay focus');
  await accessible.locator('#menuBtn').click();
  await accessible.waitForTimeout(50);
  check(await accessible.evaluate(() => document.getElementById('app').inert && document.activeElement?.id === 'primaryBtn'), 'pause dialog restores inert focus management');
  check(await accessible.locator('#secondaryBtn').getAttribute('aria-controls') === null && await accessible.locator('#secondaryBtn').getAttribute('aria-expanded') === null, 'restart action does not expose false help-disclosure state');

  const sequential = await session();
  await sequential.goto(base + '/instrumented.html');
  check(await sequential.evaluate(() => !CR.dev && CR.game.runMode === 'full'), 'instrumented fixture retains normal release flags');
  check(await sequential.evaluate(() => CR.game.startLevel(3) === false && CR.game.level === 1 && CR.game.state === 'ready'), 'release game API blocks direct level entry while locked');
  await sequential.locator('#primaryBtn').click();
  for (let level = 1; level <= 3; level++) {
    check(await sequential.evaluate(n => CR.game.level === n && CR.game.state === 'playing', level), `full run enters Level ${level} sequentially`);
    await threeCans(sequential);
    check(await sequential.evaluate(() => CR.game.canSplits.length === 3 && CR.game.levelCans === 3), `Level ${level} records three deliveries/splits`);
    if (level < 3) {
      check(await sequential.evaluate(() => localStorage.getItem('karambe-water-run-full-clear') === null && !CR.game.fullRunUnlocked), `Level ${level} keeps Level Select locked`);
      await sequential.locator('#volumeSlider').focus();
      await sequential.keyboard.press('Tab');
      check(await sequential.evaluate(() => document.activeElement?.id === 'primaryBtn'), `Level ${level} dialog focus trap skips hidden Level Select descendants`);
      await sequential.locator('#primaryBtn').click();
    }
  }
  check(await sequential.evaluate(() => CR.game.state === 'over' && CR.game.fullRunUnlocked && localStorage.getItem('karambe-water-run-full-clear') === '1'), 'full sequential clear permanently unlocks selection');
  check(await sequential.locator('.level-pick').count() === 3 && await sequential.locator('#levelSelectBox').isVisible(), 'completion dialog exposes all three levels after unlock');
  await sequential.goto(base);
  check(await sequential.evaluate(() => !CR.game && !CR.dev), 'post-clear reload is unmodified release');
  check(await sequential.locator('.level-pick').count() === 3 && await sequential.locator('#levelSelectBox').isVisible(), 'unmodified release reload preserves all three unlocked levels');
  await sequential.locator('.level-pick').nth(2).click();
  check(!await sequential.locator('#overlay').evaluate(element => element.classList.contains('open')), 'persisted unlock permits release level selection');
  await sequential.evaluate(() => localStorage.setItem('karambe-water-run-best-times', '{broken'));
  await sequential.reload();
  check(await sequential.locator('.level-pick').count() === 3, 'corrupt best-time data cannot revoke the independent permanent unlock');

  const single = await session();
  await single.goto(base + '/instrumented.html');
  check(await single.evaluate(() => CR.game.startLevel(3) === false && CR.game.state === 'ready'), 'fresh release cannot bypass progression through the game API');

  const publicDev = await session({ manual: false });
  await publicDev.goto(`http://karambe.test:${server.address().port}/?dev=1`);
  check(await publicDev.evaluate(() => CR.dev && !CR.game && !CR.controls), 'public Dev Menu exposes no mutable debug hooks');
  check(await publicDev.locator('.level-pick').count() === 3 && (await publicDev.locator('.level-select-title').textContent()) === 'DEV MENU — LEVEL ACCESS', 'public test URL exposes the labeled three-level Dev Menu');
  await publicDev.locator('.level-pick').nth(2).click();
  check(await publicDev.evaluate(() => ['karambe-water-run-full-clear', 'karambe-water-run-best-times', 'karambe-water-run-best-total'].every(key => localStorage.getItem(key) === null)), 'public Dev Menu does not write release progression or records');

  const dev = await session({ manual: false });
  await dev.goto(base + '/?dev=1');
  check(await dev.locator('.level-pick').count() === 3 && await dev.locator('#levelSelectBox').isVisible(), 'trusted local development mode exposes Level Select');
  check((await dev.locator('#overlayTitle').textContent())?.startsWith('DEV MENU') && (await dev.locator('.level-select-title').textContent()) === 'DEV MENU — LEVEL ACCESS', 'development level access is clearly labeled as the Dev Menu');
  check((await dev.locator('#overlaySubtitle').textContent())?.includes('not saved'), 'Dev Menu explains its isolated persistence');
  await dev.locator('#primaryBtn').click();
  for (let level = 1; level <= 3; level++) {
    await dev.evaluate(n => CR.game.startLevel(n), level);
    const before = await dev.evaluate(() => CR.game.sound.diagnostics.musicNotes);
    await dev.waitForTimeout(750);
    const data = await dev.evaluate(() => ({ ...CR.game.sound.diagnostics, contextState: CR.game.sound.ctx?.state }));
    check(data.level === level && data.musicNotes > before && data.contextState === 'running', `original music advances in Level ${level} after gesture`);
    evidence.music.push(data);
  }
  await dev.evaluate(() => {
    CR.game.startLevel(1);
    Object.assign(CR.game.player, { platform: 5, x: 60, grounded: true, climbing: null });
    Object.assign(CR.game.can, { held: true, full: false });
    CR.game.beginCanAction();
    CR.game.updateCanAction(1.3);
  });
  await dev.waitForTimeout(50);
  check((await dev.locator('#gameStatus').textContent())?.includes('FULL CAN'), 'live status announces completed can filling');
  await dev.evaluate(() => CR.game.pause());
  await dev.waitForTimeout(50);
  check((await dev.locator('#gameStatus').textContent())?.includes('PAUSED'), 'live status announces pause');
  await dev.evaluate(() => CR.game.start());
  for (let level = 1; level <= 3; level++) {
    await threeCans(dev);
    check((await dev.locator('#gameStatus').textContent())?.includes(level === 3 ? 'WATER RUN COMPLETE' : `LEVEL ${level} COMPLETE`), `live status announces completion ${level}`);
    if (level < 3) await dev.locator('#primaryBtn').click();
  }
  check(await dev.evaluate(() => ['karambe-water-run-full-clear', 'karambe-water-run-best-times', 'karambe-water-run-best-total'].every(key => localStorage.getItem(key) === null)), 'development bypass never writes release unlock or bests');
  await dev.locator('#soundBtn').click();
  check(await dev.evaluate(() => !CR.game.sound.enabled && CR.game.sound.voices.size === 0), 'mute stops active audio voices');

  const viewport = await session();
  for (const [width, height] of [[320, 568], [390, 844], [412, 915]]) {
    await viewport.setViewportSize({ width, height });
    await viewport.goto(base);
    await viewport.waitForTimeout(60);
    const result = await viewport.evaluate(() => {
      const v = window.visualViewport;
      const width = v?.width ?? innerWidth, height = v?.height ?? innerHeight;
      const boxes = [...document.querySelectorAll('[data-sfhs-control-id]')].map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.sfhsControlId, x: r.x, y: r.y, width: r.width, height: r.height }; });
      return { width, height, boxes, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check(!result.horizontalOverflow && result.boxes.length === 4 && result.boxes.every(r => r.x >= -1 && r.y >= -1 && r.x + r.width <= result.width + 1 && r.y + r.height <= result.height + 1 && r.width >= 44 && r.height >= 44), `${width}x${height}: four in-bounds touch targets, no horizontal overflow`);
    evidence.viewports.push(result);
  }
  const file = await session();
  await file.goto(pathToFileURL(path.resolve('index.html')).href);
  check(await file.evaluate(() => !!CR && !CR.dev && !CR.game && document.querySelectorAll('[data-sfhs-control-id]').length === 4), 'unmodified standalone file boots without development access');
  check(await file.locator('#offlineStatus').isVisible() && !await file.locator('#downloadBtn').isVisible(), 'standalone file identifies itself as the offline copy');

  const downloadPage = await session();
  await downloadPage.goto(base);
  const [download] = await Promise.all([downloadPage.waitForEvent('download'), downloadPage.locator('#downloadBtn').click()]);
  const downloadedPath = await download.path();
  check(download.suggestedFilename() === 'Karambe-Village-Water-Run.html' && downloadedPath && fs.readFileSync(downloadedPath).equals(fs.readFileSync('index.html')), 'download action returns exact built artifact bytes');
  assert.deepEqual(evidence.unexpectedRequests, [], 'no runtime network requests beyond navigation document');
  assert.deepEqual(evidence.pageErrors, [], 'no page errors');
  evidence.pass = true;
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/release.json', JSON.stringify(evidence, null, 2));
  console.log(`PASS release: ${evidence.checks.length} checks; normal release, instrumented progression, audio, viewport, file, network`);
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
