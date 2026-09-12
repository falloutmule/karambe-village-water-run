import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const runtimeSource = fs.readFileSync('vendor/sfhs/mobile-controls/runtime.ts', 'utf8');
const typesSource = fs.readFileSync('vendor/sfhs/mobile-controls/types.ts', 'utf8');
const adapterSource = fs.readFileSync('src/controls.ts', 'utf8');
assert.match(typesSource, /preventNativeTouchDefaults\?: boolean/, 'native touch suppression is an opt-in SFHS option');
assert.match(typesSource, /leaveTolerancePx\?: number/, 'SFHS exposes bounded leave tolerance');
assert.match(typesSource, /updateLayouts\(layoutPatch: Partial<MobileControlsLayouts>\)/, 'SFHS exposes atomic multi-orientation layout updates');
assert.match(runtimeSource, /options\.preventNativeTouchDefaults !== true/, 'native touch suppression defaults off');
assert.match(adapterSource, /preventNativeTouchDefaults: true/, 'Karambe opts into native touch suppression');
assert.match(adapterSource, /leaveTolerancePx: options\.clicky \? 18 : 0/, 'clicky test enables an 18px retention rim');
assert.match(adapterSource, /mobile\.updateLayouts\(\{ portrait: patch, landscape: patch \}\)/, 'Karambe updates both layouts atomically');
assert.doesNotMatch(adapterSource, /for \(const type of \['touchstart'/, 'product adapter has no duplicate Touch Event suppression route');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
try {
  await page.goto(pathToFileURL(path.resolve('index.html')).href + '?dev=1&clicky=1');
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
    const emitPoint = (type, id, pointerId, clientX, clientY) => {
      const element = document.querySelector(`[data-sfhs-control-id="${id}"]`);
      const target = type === 'pointerdown' ? element : document;
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, button: 0, clientX, clientY }));
    };
    const emitCoalesced = (id, pointerId, samples) => {
      const element = document.querySelector(`[data-sfhs-control-id="${id}"]`);
      const bounds = element.getBoundingClientRect();
      const event = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId,
        clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 });
      Object.defineProperty(event, 'getCoalescedEvents', { value: () => samples.map(([dx, dy]) => new PointerEvent('pointermove', {
        pointerType: 'touch', pointerId, clientX: bounds.left + bounds.width / 2 + dx, clientY: bounds.top + bounds.height / 2 + dy
      })) });
      document.dispatchEvent(event);
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
    check(CR.clicky === true && document.getElementById('sfhs-game-controls').dataset.surface === 'clicky', 'clicky test is query gated and mounted');
    const clickyLeft = document.querySelector('[data-sfhs-control-id="left"]');
    const restingDepth = new DOMMatrixReadOnly(getComputedStyle(clickyLeft, '::before').transform).m42;
    check(Math.abs(restingDepth - 6) < .1, 'clicky surface has six-pixel raised depth');
    const clickyBounds = clickyLeft.getBoundingClientRect();
    emitPoint('pointerdown', 'left', 40, clickyBounds.left + clickyBounds.width / 2, clickyBounds.top + clickyBounds.height / 2);
    clickyLeft.getAnimations({ subtree: true }).forEach(animation => animation.finish());
    const pressedTravel = new DOMMatrixReadOnly(getComputedStyle(clickyLeft, '::after').transform).m42;
    check(Math.abs(pressedTravel - 5) < .1, 'clicky surface travels five pixels on press');
    emitPoint('pointerup', 'left', 40, clickyBounds.left + clickyBounds.width / 2, clickyBounds.top + clickyBounds.height / 2);
    clean('clicky visual');
    reset();
    const originalControlPress = game.sound.controlPress.bind(game.sound);
    let controlPresses = 0;
    game.sound.controlPress = () => { controlPresses++; };
    emit('pointerdown', 'left', 41); emit('pointerdown', 'can', 42);
    check(controlPresses === 2, 'clicky cue fires exactly once for each new contact');
    const heldSequence = controls.read().mobile.sequence;
    emitCoalesced('left', 41, [[0, 0], [1, 0], [2, 0], [0, 0]]);
    check(controlPresses === 2, 'held and coalesced moves do not retrigger clicky cue');
    check(controls.read().mobile.sequence === heldSequence, 'coalesced hold moves do not publish unchanged snapshots');
    controls.releaseAll('sequence-check');
    game.sound.controlPress = originalControlPress;
    check(controls.read().mobile.sequence === heldSequence + 1, 'multitouch releaseAll publishes exactly one snapshot');
    clean('batched release');

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
    reset();
    const rightBounds = document.querySelector('[data-sfhs-control-id="right"]').getBoundingClientRect();
    const rightY = rightBounds.top + rightBounds.height / 2;
    emitPoint('pointerdown', 'right', 25, rightBounds.left + rightBounds.width / 2, rightY); tick();
    emitPoint('pointermove', 'right', 25, rightBounds.right + 10, rightY);
    check(game.input.right && controls.read().mobile.activePointers.length === 1, 'small thumb slip stays owned inside retention rim');
    emitPoint('pointermove', 'right', 25, rightBounds.right + 24, rightY);
    check(!game.input.right && controls.read().mobile.activePointers.length === 0, 'larger slide still cancels outside retention rim');
    clean('retention rim');
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
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      document.getElementById('sfhs-game-controls').addEventListener(type, event => window.__touchDefaults.push({ type, trusted: event.isTrusted, cancelable: event.cancelable, prevented: event.defaultPrevented }), { passive: true });
    }
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints.map(point => ({ ...point, x: point.x + 1 })) });
  await page.waitForTimeout(2100);
  const held = await page.evaluate(() => ({ owners: CR.controls.read().mobile.activePointers.length, events: window.__holdEvents, touchDefaults: window.__touchDefaults }));
  assert.equal(held.owners, 2, 'two-second hold remains owned');
  assert.deepEqual(held.events, [], 'two-second hold emits no browser gesture or cancellation events');
  assert.ok(held.touchDefaults.some(event => event.type === 'touchstart') && held.touchDefaults.some(event => event.type === 'touchmove'), 'trusted native touch start/move events are observed');
  assert.ok(held.touchDefaults.every(event => event.trusted && (!event.cancelable || event.prevented)), 'cancelable native touch defaults are canceled alongside pointer ownership');
  const active = await page.evaluate(() => { CR.controls.flush(); CR.game.update(1 / 120); return { owners: CR.controls.read().mobile.activePointers.length, right: CR.game.input.right, can: !!CR.game.canPress }; });
  assert.deepEqual(active, { owners: 2, right: true, can: true }, 'real CDP multitouch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const released = await page.evaluate(() => ({ owners: CR.controls.read().mobile.activePointers.length, right: CR.game.input.right, can: !!CR.game.canPress, held: CR.game.can.held }));
  assert.deepEqual(released, { owners: 0, right: false, can: false, held: true }, 'real CDP touchCancel does not place can');
  const endPoint = touchPoints[0];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [endPoint] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const nativeDefaults = await page.evaluate(() => window.__touchDefaults);
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    assert.ok(nativeDefaults.some(event => event.type === type && event.trusted && (!event.cancelable || event.prevented)), `trusted native ${type} default is observed and canceled when cancelable`);
  }

  // A separate page keeps the real animation loop running so held controls,
  // audio gating, and sequence growth are exercised together.
  const realtimeContext = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const realtimePage = await realtimeContext.newPage();
  const realtimeErrors = [];
  realtimePage.on('pageerror', error => realtimeErrors.push(error.message));
  await realtimePage.addInitScript(() => {
    window.__vibrationRequests = 0;
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__vibrationRequests++; return true; } });
  });
  await realtimePage.goto(pathToFileURL(path.resolve('index.html')).href + '?dev=1&clicky=1');
  await realtimePage.waitForFunction(() => window.CR?.controls);
  await realtimePage.evaluate(() => { CR.game.startLevel(1); document.getElementById('overlay').classList.remove('open'); });
  const realtimeCdp = await realtimeContext.newCDPSession(realtimePage);
  const realtimePoints = await realtimePage.evaluate(() => Object.fromEntries(['left', 'right', 'can', 'jump'].map((id, index) => {
    const rect = document.querySelector(`[data-sfhs-control-id="${id}"]`).getBoundingClientRect();
    return [id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, id: index + 71, radiusX: 5, radiusY: 5, force: 1 }];
  })));
  const holdEachControl = async enabled => {
    await realtimePage.evaluate(value => {
      CR.controls.releaseAll('realtime-mode');
      CR.game.startLevel(1);
      CR.game.sound.setEnabled(value);
    }, enabled);
    const before = await realtimePage.evaluate(() => ({ ...CR.game.sound.diagnostics }));
    for (const id of ['left', 'right', 'can', 'jump']) {
      await realtimeCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [realtimePoints[id]] });
      await realtimePage.waitForTimeout(220);
      assert.equal(await realtimePage.evaluate(() => CR.controls.read().mobile.activePointers.length), 1, `${id} remains owned with SOUND ${enabled ? 'ON' : 'OFF'}`);
      await realtimeCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await realtimePage.waitForTimeout(40);
    }
    return realtimePage.evaluate(start => ({
      before: start,
      after: { ...CR.game.sound.diagnostics },
      vibrations: window.__vibrationRequests,
      owners: CR.controls.read().mobile.activePointers.length
    }), before);
  };
  const mutedCounters = await holdEachControl(false);
  assert.equal(mutedCounters.after.scheduled, mutedCounters.before.scheduled, 'SOUND OFF schedules no audio voices during held controls');
  assert.equal(mutedCounters.after.unlocks, mutedCounters.before.unlocks, 'SOUND OFF performs no audio unlock');
  assert.equal(mutedCounters.owners, 0, 'SOUND OFF control sequence releases ownership');
  const audibleCounters = await holdEachControl(true);
  assert.ok(audibleCounters.after.unlocks > audibleCounters.before.unlocks || audibleCounters.after.scheduled > audibleCounters.before.scheduled, 'SOUND ON records an unlock or scheduled voice');
  assert.ok(audibleCounters.after.controlCues > audibleCounters.before.controlCues, 'SOUND ON schedules clicky control cues');
  assert.equal(audibleCounters.owners, 0, 'SOUND ON control sequence releases ownership');

  await realtimePage.evaluate(() => { CR.controls.releaseAll('realtime-multitouch'); CR.game.startLevel(1); CR.game.sound.setEnabled(true); });
  const realtimeStart = await realtimePage.evaluate(() => ({ sequence: CR.controls.read().mobile.sequence, elapsed: CR.game.elapsed }));
  await realtimeCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [realtimePoints.right, realtimePoints.can] });
  await realtimePage.waitForTimeout(1000);
  const realtimeHeld = await realtimePage.evaluate(start => ({
    owners: CR.controls.read().mobile.activePointers.length,
    right: CR.game.input.right,
    can: Boolean(CR.game.canPress),
    elapsedDelta: CR.game.elapsed - start.elapsed,
    sequenceDelta: CR.controls.read().mobile.sequence - start.sequence
  }), realtimeStart);
  assert.equal(realtimeHeld.owners, 2, 'unfrozen real-time multitouch remains owned');
  assert.equal(realtimeHeld.right, true, 'unfrozen real-time movement remains active');
  assert.equal(realtimeHeld.can, true, 'unfrozen real-time CAN remains active');
  assert.ok(realtimeHeld.elapsedDelta > .5, 'unfrozen game loop advances while controls are held');
  assert.ok(realtimeHeld.sequenceDelta >= 20 && realtimeHeld.sequenceDelta <= 180, `real-time control sequence stays within frame bounds (${realtimeHeld.sequenceDelta})`);
  await realtimeCdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const realtimeReleased = await realtimePage.evaluate(() => ({
    owners: CR.controls.read().mobile.activePointers.length,
    right: CR.game.input.right,
    can: Boolean(CR.game.canPress),
    vibrations: window.__vibrationRequests
  }));
  assert.deepEqual(realtimeReleased, { owners: 0, right: false, can: false, vibrations: 0 }, 'unfrozen cancel clears multitouch without vibration requests');
  await realtimePage.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    document.getElementById('leftBtn').click();
  });
  await realtimePage.waitForTimeout(240);
  assert.equal(await realtimePage.evaluate(() => CR.game.input.left), true, 'assistive movement timeout cannot erase a physical keyboard hold');
  await realtimePage.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true, cancelable: true })));
  await realtimePage.evaluate(() => { document.getElementById('rightBtn').click(); CR.controls.dispose(); });
  await realtimePage.waitForTimeout(240);
  assert.equal(await realtimePage.locator('#sfhs-game-controls').count(), 0, 'disposing controls clears pending assistive movement lifecycle');
  assert.deepEqual(realtimeErrors, [], 'unfrozen page errors');
  await realtimeContext.close();
  assert.deepEqual(errors, [], 'page errors');
  fs.mkdirSync('test-results/controls', { recursive: true });
  fs.writeFileSync('test-results/controls/proof.json', JSON.stringify({ pass: true, ...proof, nativeLongHold: held, nativeMultitouch: active, nativeCancel: released, nativeTouchDefaults: nativeDefaults, realtime: { mutedCounters, audibleCounters, held: realtimeHeld, released: realtimeReleased }, errors }, null, 2));
  console.log(`PASS controls: ${proof.checks} assertions plus deterministic and unfrozen native CDP hold/multitouch/cancel`);
} finally { await browser.close(); }
