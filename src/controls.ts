import { createMobileControls } from '../vendor/sfhs/mobile-controls/index.ts';
import type { MobileControlContactEnd } from '../vendor/sfhs/mobile-controls/types.ts';

/** Product actions adapt the authoritative SFHS contact stream to game commands. */
export function createGameControls(game: any) {
  const ids = ['left', 'right', 'can', 'jump'] as const;
  const labels = ['Move left', 'Move right', 'Use jerry can', 'Jump'];
  const icons = ['◀', '▶', '▣', '↑'];
  const names = ['LEFT', 'RIGHT', 'CAN', 'JUMP'];
  const controlsBar = document.getElementById('controls')!;
  const root = document.createElement('div');
  root.id = 'sfhs-game-controls';
  document.body.append(root);

  type Transaction = { token: number; source: string; started: number; ended?: number; canceled: boolean };
  type Action = { kind: 'jump' | 'begin' | 'end'; source: string; transaction?: Transaction };
  let handleContactEnd = (_event: MobileControlContactEnd) => {};
  const placeholder = { x: .01, y: .75, width: .2, height: .1 };
  const mobile = createMobileControls({
    controls: ids.map((id, index) => ({
      id,
      type: id === 'jump' ? 'pulse' as const : 'hold' as const,
      label: labels[index],
      editable: false,
      cancelOnLeave: true,
      minWidth: .02,
      minHeight: .02,
      layout: { portrait: placeholder, landscape: placeholder }
    })),
    settings: { opacity: 1 },
    onContactEnd: event => handleContactEnd(event)
  });
  mobile.mount(root);

  const elements = new Map(ids.map(id => [id, root.querySelector<HTMLElement>(`[data-sfhs-control-id="${id}"]`)!]));
  ids.forEach((id, index) => {
    const element = elements.get(id)!;
    element.classList.add('control');
    element.draggable = false;
    const label = element.querySelector('.sfhs-mobile-control-label')!;
    label.replaceChildren(document.createTextNode(icons[index]), Object.assign(document.createElement('span'), { className: 'small', textContent: names[index] }));
  });
  const style = document.createElement('style');
  style.textContent = `
    #sfhs-game-controls{pointer-events:none;z-index:5;background:none}
    #sfhs-game-controls .sfhs-mobile-control{pointer-events:auto;display:block;padding:0;opacity:1;border:1px solid rgba(255,255,255,.17);border-bottom-color:rgba(0,0,0,.48);border-radius:17px;color:#fffbe5;background:linear-gradient(var(--button-top),var(--button-bottom));box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 4px 0 #0a1e12;font-weight:900;font-size:clamp(16px,4.5vw,23px);letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.5);appearance:none;-webkit-appearance:none;-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-user-drag:none}
    #sfhs-game-controls [data-sfhs-control-id="can"]{background:linear-gradient(#9a7a16,#5d480d)}
    #sfhs-game-controls [data-sfhs-control-id="jump"]{background:linear-gradient(#7a4331,#472318)}
    #sfhs-game-controls .sfhs-mobile-control[data-control-active="true"]{filter:brightness(1.13);border-color:#ffe47a;box-shadow:inset 0 3px 8px rgba(0,0,0,.5),0 3px 0 #0a1e12;background:var(--button-press)}
  `;
  root.append(style);

  const keys = new Set<string>();
  const disposers: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, fn: EventListener, options: AddEventListenerOptions | boolean = false) => {
    target.addEventListener(type, fn, options);
    disposers.push(() => target.removeEventListener(type, fn, options));
  };
  for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
    listen(root, type, (event => event.preventDefault()) as EventListener, { capture: true, passive: false });
  }
  const playing = () => game.state === 'playing';
  const canKeys = () => keys.has(' ') || keys.has('c');
  let sequence = 0;
  let actions: Action[] = [];
  let transaction: Transaction | null = null;
  let previous = new Map<number, string>();
  let clearing = false;
  let disposed = false;

  const clearCan = () => {
    if (transaction) transaction.canceled = true;
    transaction = null;
    actions = actions.filter(action => action.kind === 'jump');
    game.cancelCanAction();
  };
  const beginCan = (source: string) => {
    if (transaction || !playing()) return;
    transaction = { token: ++sequence, source, started: performance.now(), canceled: false };
    actions.push({ kind: 'begin', source, transaction });
  };
  const endCan = (source: string, commit: boolean) => {
    if (!transaction || transaction.source !== source) return;
    if (!commit) { clearCan(); return; }
    transaction.ended = performance.now();
    actions.push({ kind: 'end', source, transaction });
  };
  const movement = () => {
    const output: any = mobile.read().controls;
    game.input.left = playing() && (keys.has('a') || keys.has('arrowleft') || output.left.pressed);
    game.input.right = playing() && (keys.has('d') || keys.has('arrowright') || output.right.pressed);
  };
  function releaseAll(reason = 'consumer') {
    if (clearing) return;
    clearing = true;
    actions = [];
    keys.clear();
    clearCan();
    mobile.releaseAll(reason);
    previous.clear();
    game.input.left = game.input.right = false;
    if (game.player) game.player.jumpBuffer = 0;
    clearing = false;
  }

  handleContactEnd = event => {
    const source = `pointer:${event.identifier}`;
    if (event.controlId === 'can') endCan(source, event.kind === 'release' && playing());
    if (event.kind === 'cancel') actions = actions.filter(action => action.source !== source);
  };

  const unsubscribe = mobile.subscribe(snapshot => {
    const current = new Map(snapshot.activePointers.map(owner => [owner.identifier, owner.controlId]));
    for (const [id, control] of current) {
      if (previous.has(id) || clearing) continue;
      game.sound.unlock();
      if (!playing()) continue;
      const source = `pointer:${id}`;
      if (control === 'can') beginCan(source);
      if (control === 'jump') actions.push({ kind: 'jump', source });
    }
    previous = current;
    movement();
  });

  const supportedKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w', ' ', 'c', 'escape']);
  ids.forEach(id => {
    const proxy = document.getElementById(`${id}Btn`)!;
    listen(proxy, 'click', (() => {
      if (!playing()) return;
      game.sound.unlock();
      if (id === 'jump') actions.push({ kind: 'jump', source: 'assistive:jump' });
      if (id === 'can') { beginCan('assistive:can'); endCan('assistive:can', true); }
      if (id === 'left' || id === 'right') {
        const key = id === 'left' ? 'arrowleft' : 'arrowright';
        keys.add(key);
        movement();
        setTimeout(() => { keys.delete(key); movement(); }, 180);
      }
    }) as EventListener);
  });
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!supportedKeys.has(key) || (event.target as HTMLElement)?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    if (event.repeat || keys.has(key)) return;
    if (key === 'escape') { releaseAll('menu'); document.getElementById('menuBtn')?.click(); return; }
    if (!playing()) return;
    const wasCan = canKeys();
    keys.add(key);
    game.sound.unlock();
    if (key === 'arrowup' || key === 'w') actions.push({ kind: 'jump', source: `key:${key}` });
    if ((key === ' ' || key === 'c') && !wasCan) beginCan('keyboard');
    movement();
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
    const bar = controlsBar.getBoundingClientRect();
    if (!viewport.width || !viewport.height || !bar.width || !bar.height) return;
    const css = getComputedStyle(controlsBar);
    const left = parseFloat(css.paddingLeft) || 8;
    const right = parseFloat(css.paddingRight) || 8;
    const top = parseFloat(css.paddingTop) || 7;
    const bottom = parseFloat(css.paddingBottom) || 7;
    const gap = parseFloat(css.columnGap) || 6;
    const weights = [1, 1, 1.08, 1.08];
    const unit = (bar.width - left - right - gap * 3) / weights.reduce((sum, value) => sum + value, 0);
    let cursor = bar.left + left;
    const patch: Record<string, { x: number; y: number; width: number; height: number }> = {};
    ids.forEach((id, index) => {
      const width = unit * weights[index];
      patch[id] = { x: (cursor - viewport.left) / viewport.width, y: (bar.top + top - viewport.top) / viewport.height, width: width / viewport.width, height: (bar.height - top - bottom) / viewport.height };
      cursor += width + gap;
    });
    mobile.updateLayout('portrait', patch);
    mobile.updateLayout('landscape', patch);
  };
  listen(window, 'resize', layout as EventListener);
  listen(window, 'orientationchange', layout as EventListener);
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', layout as EventListener);
    listen(window.visualViewport, 'scroll', layout as EventListener);
  }
  const observer = new ResizeObserver(layout);
  observer.observe(controlsBar);
  layout();

  return {
    flush() {
      if (!playing()) {
        if (mobile.read().activePointers.length || actions.length || keys.size) releaseAll('not-playing');
        return mobile.read();
      }
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
      releaseAll('dispose');
      disposed = true;
      unsubscribe();
      observer.disconnect();
      disposers.forEach(dispose => dispose());
      mobile.destroy();
      root.remove();
    }
  };
}
