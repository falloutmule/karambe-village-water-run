import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
try {
  await page.goto(pathToFileURL(path.resolve('index.html')).href + '?dev=1');
  await page.waitForFunction(() => window.CR?.controls);
  // Permit the initial ResizeObserver layout notification before opening contacts.
  await page.waitForTimeout(100);
  const proof = await page.evaluate(() => {
    const game = CR.game, controls = CR.controls;
    const findings = [];
    const check = (value, label) => { if (!value) throw new Error(label); findings.push(label); };
    let vibrationRequests = 0;
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { vibrationRequests++; return true; } });
    const tick = (n = 1) => { controls.flush(); for (let i = 0; i < n; i++) game.update(1 / 120); };
    const reset = () => { controls.releaseAll('test'); game.startLevel(1); document.getElementById('overlay').classList.remove('open'); };
    const emit = (type, id, pointerId, within = true) => {
      const element = document.querySelector(`[data-sfhs-control-id="${id}"]`);
      const bounds = element.getBoundingClientRect();
      const target = type === 'pointerdown' || type === 'lostpointercapture' ? element : document;
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, button: 0,
        clientX: within ? bounds.left + bounds.width / 2 : 1, clientY: within ? bounds.top + bounds.height / 2 : 1 }));
    };
    const visualMatch = () => {
      const state = controls.read().mobile;
      for (const element of document.querySelectorAll('[data-sfhs-control-id]')) {
        const active = state.activePointers.some(owner => owner.controlId === element.dataset.sfhsControlId);
        check(element.dataset.controlActive === String(active), `visual matches ${element.dataset.sfhsControlId}`);
      }
    };
    const clean = label => {
      check(!game.input.left && !game.input.right && !game.canPress, `${label}: gameplay clear`);
      check(!controls.read().mobile.activePointers.length && !controls.read().queuedActions.length, `${label}: ownership/queue clear`);
      visualMatch();
    };
    reset();
    emit('pointerdown', 'left', 1); emit('pointerdown', 'can', 2); tick();
    check(game.input.left && !!game.canPress, 'movement + CAN multitouch'); visualMatch();
    emit('pointerdown', 'right', 1); emit('pointerdown', 'left', 3); tick();
    check(game.input.left && !game.input.right && controls.read().mobile.activePointers.length === 2, 'contacts cannot steal controls');
    emit('pointercancel', 'can', 2); check(!game.canPress && game.can.held, 'CAN cancel immediately clears without placing');
    emit('pointerup', 'left', 1); clean('document release');

    reset();
    emit('pointerdown', 'can', 4); emit('pointercancel', 'can', 4); tick();
    check(game.can.held, 'down/cancel before tick cannot become tap'); clean('queued cancel');
    emit('pointerdown', 'can', 5); emit('pointerup', 'can', 5); tick();
    check(!game.can.held && game.can.x > game.player.x, 'valid CAN tap places in front');
    game.can.full = true;
    emit('pointerdown', 'can', 6); tick(); emit('pointercancel', 'can', 6); tick();
    check(!game.can.held && game.can.full, 'cancel cannot accidentally pick up full can');
    emit('pointerdown', 'can', 7); emit('pointermove', 'can', 7, false); emit('pointerup', 'can', 7); tick();
    check(!game.can.held, 'CAN leave then return/up cannot commit'); clean('slide outside');
    emit('pointerdown', 'can', 8); tick(); emit('lostpointercapture', 'can', 8); tick();
    check(!game.can.held, 'lost capture cannot commit full-can pickup'); clean('lost capture');
    emit('pointerdown', 'can', 9); emit('pointerup', 'can', 9, false); tick();
    check(!game.can.held, 'release outside cannot commit');

    reset();
    emit('pointerdown', 'right', 10); emit('pointerdown', 'jump', 11); tick();
    check(game.input.right && game.player.vy < 0, 'movement + JUMP multitouch');
    emit('pointermove', 'right', 10, false); check(!game.input.right, 'movement clears immediately on leave');
    controls.releaseAll('end jump'); clean('jump release');
    game.vibrate(30);
    check(vibrationRequests === 0, 'gameplay haptic boundary makes no vibration request');
    for (const id of ['left', 'right', 'can', 'jump']) {
      const element = document.querySelector(`[data-sfhs-control-id="${id}"]`);
      check(element.tagName === 'DIV' && !element.hasAttribute('role') && element.getAttribute('aria-hidden') === 'true', `${id} uses a neutral touch surface`);
      for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        check(event.defaultPrevented, `${id} suppresses ${type}`);
      }
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
        const event = new TouchEvent(type, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        check(event.defaultPrevented, `${id} suppresses native ${type} defaults`);
      }
    }

    reset();
    emit('pointerdown', 'can', 12); tick(36); emit('pointerup', 'can', 12); tick();
    check(game.can.held, 'CAN hold release is not a quick tap');
    reset();
    emit('pointerdown', 'can', 13); emit('pointerup', 'can', 13); game.hitPlayer(1, 'TEST HIT'); tick();
    check(game.can.held, 'hit discards already queued tap'); clean('hit');
    reset();
    emit('pointerdown', 'left', 14); emit('pointerdown', 'can', 15); tick(); game.pause(); clean('pause');
    reset();
    emit('pointerdown', 'left', 16); emit('pointerdown', 'can', 17); tick(); game.startLevel(2); clean('level change');
    reset();
    emit('pointerdown', 'left', 18); emit('pointerdown', 'can', 19); tick(); game.resetCurrentCan(true); clean('retry');

    reset();
    const key = (type, value) => window.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true }));
    key('keydown', 'a'); key('keydown', 'ArrowLeft'); key('keydown', 'c'); tick();
    check(game.input.left && !!game.canPress, 'keyboard movement + CAN');
    key('keyup', 'a'); tick(); check(game.input.left, 'releasing one keyboard alias preserves other');
    window.dispatchEvent(new Event('blur')); clean('blur');
    check(controls.read().heldKeys.length === 0, 'blur clears held keyboard aliases');
    key('keyup', 'c'); tick(); check(game.can.held, 'keyup after blur cannot commit');

    for (const type of ['pagehide', 'resize', 'orientationchange']) {
      reset(); emit('pointerdown', 'left', 20); emit('pointerdown', 'can', 21); tick();
      window.dispatchEvent(new Event(type)); clean(type);
    }
    reset(); emit('pointerdown', 'left', 22); emit('pointerdown', 'can', 23); tick();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); clean('visibility hidden');
    delete document.visibilityState;
    if (window.visualViewport) {
      reset(); emit('pointerdown', 'can', 24); tick(); window.visualViewport.dispatchEvent(new Event('resize')); clean('visualViewport resize');
    }
    reset();
    return { checks: findings.length, findings };
  });
  // Real Chromium input dispatch exercises simultaneous native contacts and capture.
  const cdp = await context.newCDPSession(page);
  const touchPoints = await page.evaluate(() => ['right', 'can'].map((id, i) => {
    const r = document.querySelector(`[data-sfhs-control-id="${id}"]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: i + 31, radiusX: 5, radiusY: 5, force: 1 };
  }));
  await page.evaluate(() => {
    window.__holdEvents = [];
    window.__touchDefaults = [];
    for (const type of ['contextmenu', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, event => window.__holdEvents.push({ type, trusted: event.isTrusted }), true);
    document.getElementById('sfhs-game-controls').addEventListener('touchstart', event => window.__touchDefaults.push({ trusted: event.isTrusted, prevented: event.defaultPrevented }), { passive: true });
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await page.waitForTimeout(2100);
  const held = await page.evaluate(() => ({ owners: CR.controls.read().mobile.activePointers.length, events: window.__holdEvents, touchDefaults: window.__touchDefaults }));
  assert.equal(held.owners, 2, 'two-second hold remains owned');
  assert.deepEqual(held.events, [], 'two-second hold emits no browser gesture or cancellation events');
  assert.ok(held.touchDefaults.length > 0 && held.touchDefaults.every(event => event.trusted && event.prevented), 'native touchstart defaults are canceled alongside pointer ownership');
  const active = await page.evaluate(() => { CR.controls.flush(); CR.game.update(1 / 120); return { owners: CR.controls.read().mobile.activePointers.length, right: CR.game.input.right, can: !!CR.game.canPress }; });
  assert.deepEqual(active, { owners: 2, right: true, can: true }, 'real CDP multitouch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const released = await page.evaluate(() => ({ owners: CR.controls.read().mobile.activePointers.length, right: CR.game.input.right, can: !!CR.game.canPress, held: CR.game.can.held }));
  assert.deepEqual(released, { owners: 0, right: false, can: false, held: true }, 'real CDP touchCancel does not place can');
  assert.deepEqual(errors, [], 'page errors');
  fs.mkdirSync('test-results/controls', { recursive: true });
  fs.writeFileSync('test-results/controls/proof.json', JSON.stringify({ pass: true, ...proof, nativeLongHold: held, nativeMultitouch: active, nativeCancel: released, errors }, null, 2));
  console.log(`PASS controls: ${proof.checks} assertions plus native CDP long-hold/multitouch/cancel`);
} finally { await browser.close(); }
