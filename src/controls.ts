import { createMobileControls } from '../vendor/sfhs/mobile-controls/index.ts';

/** Product actions adapt SFHS hold ownership; a canceled contact is never a tap. */
export function createGameControls(game: any, UI: any = {}) {
  const ids = ['left', 'right', 'can', 'jump'];
  const originals = ids.map(id => document.getElementById(`${id}Btn`)!);
  const root = document.createElement('div');
  root.id = 'sfhs-game-controls';
  document.body.append(root);
  const rect = { x: .01, y: .75, width: .2, height: .1 };
  const mobile = createMobileControls({ controls: ids.map((id, i) => ({
    id, type: 'hold' as const, label: originals[i].getAttribute('aria-label') || id,
    editable: false, minWidth: .02, minHeight: .02,
    layout: { portrait: rect, landscape: rect }
  })), settings: { opacity: 1 } });
  mobile.mount(root);
  // Retain the established grid as inert layout anchors; actual SFHS elements own input.
  const elements = new Map(ids.map(id => [id, root.querySelector<HTMLElement>(`[data-sfhs-control-id="${id}"]`)!]));
  originals.forEach((original, i) => {
    const element = elements.get(ids[i])!;
    element.classList.add('control');
    element.draggable = false;
    element.setAttribute('autocomplete', 'off');
    const label = element.querySelector('.sfhs-mobile-control-label')!;
    label.innerHTML = original.innerHTML;
    original.style.visibility = 'hidden';
    original.setAttribute('aria-hidden', 'true');
    original.setAttribute('inert', '');
    original.tabIndex = -1;
  });
  const style = document.createElement('style');
  style.textContent = `
    #sfhs-game-controls{pointer-events:none;z-index:5;background:none}
    #sfhs-game-controls .sfhs-mobile-control{pointer-events:auto;display:block;padding:0;opacity:1;border:1px solid rgba(255,255,255,.17);border-bottom-color:rgba(0,0,0,.48);border-radius:17px;color:#fffbe5;background:linear-gradient(var(--button-top),var(--button-bottom));box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 4px 0 #0a1e12;font-weight:900;font-size:clamp(16px,4.5vw,23px);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.5);appearance:none;-webkit-appearance:none;-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-user-drag:none}
    #sfhs-game-controls [data-sfhs-control-id="can"]{background:linear-gradient(#9a7a16,#5d480d)}
    #sfhs-game-controls [data-sfhs-control-id="jump"]{background:linear-gradient(#7a4331,#472318)}
    #sfhs-game-controls .sfhs-mobile-control[data-control-active="true"]{filter:none;transform:translateY(3px);box-shadow:inset 0 2px 5px rgba(0,0,0,.45),0 1px 0 #0a1e12;background:var(--button-press)}
  `;
  root.append(style);
  const disposers: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, fn: EventListener, capture = false) => {
    target.addEventListener(type, fn, { capture, passive: false });
    disposers.push(() => target.removeEventListener(type, fn, capture));
  };
  const suppressHoldGesture = (event: Event) => {
    if (!(event.target as Element)?.closest?.('#sfhs-game-controls .sfhs-mobile-control')) return;
    event.preventDefault();
  };
  for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
    listen(root, type, suppressHoldGesture as EventListener, true);
  }
  const keys = new Set<string>();
  type Transaction = { token: number; source: string; started: number; ended?: number; committed: boolean; canceled: boolean };
  type Action = { kind: 'jump' | 'begin' | 'end'; source: string; transaction?: Transaction };
  let sequence = 0;
  let actions: Action[] = [];
  let transaction: Transaction | null = null;
  let previous = new Map<number, string>();
  let disposed = false;
  let clearing = false;
  const acceptedReleases = new Set<number>();
  const playing = () => game.state === 'playing';
  const isLeft = () => keys.has('a') || keys.has('arrowleft');
  const isRight = () => keys.has('d') || keys.has('arrowright');
  const canKeys = () => keys.has(' ') || keys.has('c');
  const clearCan = () => {
    if (transaction) transaction.canceled = true;
    transaction = null;
    actions = actions.filter(action => action.kind === 'jump');
    game.cancelCanAction();
  };
  const beginCan = (source: string) => {
    if (transaction || !playing()) return;
    transaction = { token: ++sequence, source, started: performance.now(), committed: false, canceled: false };
    actions.push({ kind: 'begin', source, transaction });
  };
  const endCan = (source: string, commit: boolean) => {
    if (!transaction || transaction.source !== source) return;
    if (!commit) { clearCan(); return; }
    transaction.committed = true;
    transaction.ended = performance.now();
    actions.push({ kind: 'end', source, transaction });
  };
  const movement = () => {
    const controls: any = mobile.read().controls;
    game.input.left = playing() && (isLeft() || controls.left.pressed);
    game.input.right = playing() && (isRight() || controls.right.pressed);
  };
  function releaseAll(reason = 'consumer') {
    if (clearing) return;
    clearing = true;
    actions = [];
    keys.clear();
    acceptedReleases.clear();
    clearCan();
    mobile.releaseAll(reason);
    previous.clear();
    game.input.left = game.input.right = false;
    if (game.player) game.player.jumpBuffer = 0;
    clearing = false;
  }
  const unsubscribe = mobile.subscribe(snapshot => {
    const current = new Map(snapshot.activePointers.map(owner => [owner.identifier, owner.controlId]));
    for (const [id, control] of previous) {
      if (current.has(id)) continue;
      const source = `pointer:${id}`;
      const validRelease = acceptedReleases.delete(id);
      if (control === 'can' && !validRelease) endCan(source, false);
      if (!validRelease) actions = actions.filter(action => action.source !== source);
    }
    for (const [id, control] of current) {
      if (previous.has(id) || clearing) continue;
      game.sound.unlock();
      if (!playing()) continue;
      const source = `pointer:${id}`;
      if (control === 'can') beginCan(source);
      if (control === 'jump') actions.push({ kind: 'jump', source });
    }
    previous = current;
    // Release is immediately reflected even between animation frames.
    if (!snapshot.controls.left || !(snapshot.controls.left as any).pressed) game.input.left = playing() && isLeft();
    if (!snapshot.controls.right || !(snapshot.controls.right as any).pressed) game.input.right = playing() && isRight();
  });
  const inside = (id: string, x: number, y: number) => {
    const bounds = elements.get(id)!.getBoundingClientRect();
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  };
  // Capture phase classifies the native release before SFHS's document listener removes ownership.
  listen(document, 'pointerup', ((event: PointerEvent) => {
    const owner = mobile.read().activePointers.find(item => item.identifier === event.pointerId);
    if (!owner) return;
    const valid = inside(owner.controlId, event.clientX, event.clientY) && playing();
    if (valid) acceptedReleases.add(event.pointerId);
    if (owner.controlId === 'can') endCan(`pointer:${event.pointerId}`, valid);
  }) as EventListener, true);
  listen(document, 'pointermove', ((event: PointerEvent) => {
    const owner = mobile.read().activePointers.find(item => item.identifier === event.pointerId);
    if (!owner || inside(owner.controlId, event.clientX, event.clientY)) return;
    // SFHS deliberately holds outside; this game requests cancel-on-leave. Use its existing release route.
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: event.pointerId, pointerType: event.pointerType }));
  }) as EventListener, true);
  // SFHS also has a mutually exclusive Touch Events fallback.
  listen(document, 'touchend', ((event: TouchEvent) => {
    if (mobile.read().route !== 'touch') return;
    for (const touch of Array.from(event.changedTouches)) {
      const owner = mobile.read().activePointers.find(item => item.identifier === touch.identifier);
      if (!owner) continue;
      const valid = inside(owner.controlId, touch.clientX, touch.clientY) && playing();
      if (valid) acceptedReleases.add(touch.identifier);
      if (owner.controlId === 'can') endCan(`pointer:${touch.identifier}`, valid);
    }
  }) as EventListener, true);
  listen(document, 'touchmove', ((event: TouchEvent) => {
    if (mobile.read().route !== 'touch') return;
    for (const touch of Array.from(event.changedTouches)) {
      const owner = mobile.read().activePointers.find(item => item.identifier === touch.identifier);
      if (!owner || inside(owner.controlId, touch.clientX, touch.clientY)) continue;
      const canceled = new Event('touchcancel', { bubbles: true });
      Object.defineProperty(canceled, 'changedTouches', { value: [touch] });
      document.dispatchEvent(canceled);
    }
  }) as EventListener, true);
  const supportedKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w', ' ', 'c', 'escape']);
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!supportedKeys.has(key)) return;
    if ((event.target as HTMLElement)?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    if (event.repeat || keys.has(key)) return;
    if (key === 'escape') { releaseAll('menu'); document.getElementById('menuBtn')?.click(); return; }
    if (!playing()) return;
    const wasCan = canKeys();
    keys.add(key);
    game.sound.unlock();
    if (key === 'arrowup' || key === 'w') actions.push({ kind: 'jump', source: `key:${key}` });
    if ((key === ' ' || key === 'c') && !wasCan) beginCan('keyboard');
  }) as EventListener);
  listen(window, 'keyup', ((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!supportedKeys.has(key)) return;
    event.preventDefault();
    const hadKey = keys.delete(key);
    if (hadKey && (key === ' ' || key === 'c') && !canKeys()) endCan('keyboard', playing());
    movement();
  }) as EventListener);
  const layout = () => {
    if (disposed) return;
    const viewport = root.getBoundingClientRect();
    if (!viewport.width || !viewport.height) return;
    const patch = Object.fromEntries(originals.map((original, i) => {
      const bounds = original.getBoundingClientRect();
      return [ids[i], { x: Math.max(0, (bounds.left - viewport.left) / viewport.width), y: Math.max(0, (bounds.top - viewport.top) / viewport.height), width: Math.min(1, bounds.width / viewport.width), height: Math.min(1, bounds.height / viewport.height) }];
    }));
    mobile.updateLayout('portrait', patch);
    mobile.updateLayout('landscape', patch);
  };
  listen(window, 'blur', (() => {
    releaseAll('blur');
    if (playing()) { game.pause(); UI.showOverlay?.('pause'); }
  }) as EventListener);
  listen(window, 'pagehide', (() => releaseAll('pagehide')) as EventListener);
  listen(document, 'visibilitychange', (() => { if (document.visibilityState === 'hidden') releaseAll('visibility-hidden'); }) as EventListener);
  for (const type of ['resize', 'orientationchange']) listen(window, type, (() => { releaseAll(type); layout(); game.resize(); }) as EventListener);
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', (() => { releaseAll('viewport-resize'); layout(); }) as EventListener);
    listen(window.visualViewport, 'scroll', (() => { releaseAll('viewport-scroll'); layout(); }) as EventListener);
  }
  const observer = new ResizeObserver(() => { releaseAll('layout'); layout(); game.resize(); });
  observer.observe(document.getElementById('controls')!);
  layout();
  return {
    flush() {
      if (!playing()) { releaseAll('not-playing'); return mobile.read(); }
      const snapshot = mobile.flush();
      movement();
      const pending = actions;
      actions = [];
      for (const action of pending) {
        if (!playing()) break;
        if (action.kind === 'jump') { game.jump(); continue; }
        const current = action.transaction!;
        if (current.canceled) continue;
        if (action.kind === 'begin') game.beginCanAction();
        if (action.kind === 'end') {
          // Preserve hold duration even when down/up both occur between simulation ticks.
          if (game.canPress) game.canPress.time = Math.max(game.canPress.time, ((current.ended ?? performance.now()) - current.started) / 1000);
          game.endCanAction(true);
          if (transaction === current) transaction = null;
        }
      }
      return snapshot;
    },
    releaseAll,
    read() { return { mobile: mobile.read(), heldKeys: [...keys], queuedActions: actions.map(action => action.kind), canTransaction: transaction ? { ...transaction } : null }; },
    dispose() {
      releaseAll('dispose'); disposed = true; unsubscribe(); observer.disconnect(); disposers.forEach(fn => fn()); mobile.destroy(); root.remove();
      originals.forEach(original => { original.style.visibility = ''; original.removeAttribute('aria-hidden'); original.removeAttribute('inert'); original.removeAttribute('tabindex'); });
    }
  };
}
