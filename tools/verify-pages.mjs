import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const valueFor = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const url = new URL(valueFor('--url', 'https://falloutmule.github.io/karambe-village-water-run/')).href;
const attempts = Number.parseInt(valueFor('--attempts', '1'), 10);
const delayMs = Number.parseInt(valueFor('--delay-ms', '5000'), 10);
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) throw Error('--attempts must be 1..60');
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60000) throw Error('--delay-ms must be 0..60000');

const proofDir = 'test-results/pages-live';
fs.mkdirSync(proofDir, { recursive: true });
const expected = fs.readFileSync('index.html');
const expectedSha256 = crypto.createHash('sha256').update(expected).digest('hex');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForCommittedBytes() {
  const observations = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      const bytes = Buffer.from(await response.arrayBuffer());
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      observations.push({ attempt, status: response.status, bytes: bytes.length, sha256 });
      if (response.status === 200 && bytes.equals(expected)) return { bytes, observations };
    } catch (error) {
      observations.push({ attempt, error: error instanceof Error ? error.message : String(error) });
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw Object.assign(new Error(`Pages did not serve committed index.html after ${attempts} attempts`), { observations });
}

let browser;
let deploymentObservations = [];
try {
  const deployed = await waitForCommittedBytes();
  deploymentObservations = deployed.observations;
  const { defaultBrowserType: _ignored, ...android } = devices['Pixel 5'];
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ...android, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], unexpected = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.resourceType() !== 'document' && !request.url().startsWith('data:')) unexpected.push(request.url());
  });
  page.on('requestfailed', request => errors.push(request.failure()?.errorText ?? 'request failed'));

  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.level-pick').count(), 0);
  assert.equal(await page.locator('#levelSelectBox').isVisible(), false);
  const initialCheck = await page.evaluate(() => CR.runFullSelfCheck());
  assert.ok(!await page.evaluate(() => CR.dev || CR.game), 'production URL does not expose mutable debug state');
  assert.ok(initialCheck.pass, 'initial live self-check passes');

  await page.locator('#primaryBtn').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__liveTouchDefaults = [];
    document.getElementById('sfhs-game-controls')?.addEventListener('touchstart', event => {
      window.__liveTouchDefaults.push({ trusted: event.isTrusted, prevented: event.defaultPrevented });
    }, { passive: true });
  });
  const centers = [];
  for (const id of ['right', 'can']) {
    const rect = await page.locator(`[data-sfhs-control-id="${id}"]`).boundingBox();
    assert.ok(rect, `${id} control is visible`);
    centers.push({ id: centers.length + 1, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: centers });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-control-active="true"]').count(), 2);
  const defaults = await page.evaluate(() => window.__liveTouchDefaults);
  assert.ok(defaults.length > 0 && defaults.every(event => event.trusted && event.prevented), 'trusted touch defaults are canceled');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await page.locator('[data-control-active="true"]').count(), 0);

  const selfcheck = await page.evaluate(() => CR.runFullSelfCheck());
  assert.ok(selfcheck.pass, 'post-input live self-check passes');
  await page.screenshot({ path: `${proofDir}/game.png` });
  await page.locator('#menuBtn').click();
  assert.equal((await page.locator('#primaryBtn').textContent())?.trim(), 'RESUME');
  await page.goto(new URL('?dev=1', url).href, { waitUntil: 'networkidle' });
  assert.ok(!await page.evaluate(() => CR.dev || CR.game), 'query flag cannot expose production debug state');
  assert.equal(await page.locator('.level-pick').count(), 0);
  assert.equal(await page.locator('#levelSelectBox').isVisible(), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);

  const proof = {
    pass: true,
    url,
    status: 200,
    bytes: deployed.bytes.length,
    sha256: expectedSha256,
    build: selfcheck.buildId,
    attempts: deployed.observations,
    selfcheck,
    liveMultitouchAndCancel: true,
    trustedTouchDefaultsCanceled: true,
    publicDevFlagDisabled: true,
    errors,
    unexpectedRequests: unexpected,
    physicalPhone: 'not tested'
  };
  fs.writeFileSync(`${proofDir}/proof.json`, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} catch (error) {
  const failure = {
    pass: false,
    url,
    expectedBytes: expected.length,
    expectedSha256,
    observations: error?.observations ?? deploymentObservations,
    error: error instanceof Error ? error.message : String(error)
  };
  fs.writeFileSync(`${proofDir}/proof.json`, JSON.stringify(failure, null, 2));
  throw error;
} finally {
  await browser?.close();
}
