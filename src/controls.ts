import { createMobileControls } from '../vendor/sfhs/mobile-controls/index.ts';
import type { MobileControlContactEnd, MobileControlsSnapshot } from '../vendor/sfhs/mobile-controls/types.ts';

interface GameControlsTarget {
  state: string;
  input: { left: boolean; right: boolean };
  player?: { jumpBuffer: number };
  canPress?: { time: number } | null;
  sound: { unlock(): void };
  cancelCanAction(): void;
  beginCanAction(): void;
  endCanAction(commit: boolean): void;
  jump(): void;
}

/** Product actions adapt the authoritative SFHS contact stream to game commands. */
export function createGameControls(game: GameControlsTarget, options: { clicky?: boolean } = {}) {
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
    preventNativeTouchDefaults: true,
    leaveTolerancePx: options.clicky ? 18 : 0,
    onContactEnd: event => handleContactEnd(event)
  });
  mobile.mount(root);
  root.dataset.surface = options.clicky ? 'clicky' : 'standard';

  const elements = new Map(ids.map(id => [id, root.querySelector<HTMLElement>(`[data-sfhs-control-id="${id}"]`)!]));
  ids.forEach((id, index) => {
    const element = elements.get(id)!;
    element.classList.add('control');
    element.draggable = false;
    const label = element.querySelector('.sfhs-mobile-control-label')!;
    label.replaceChildren(document.createTextNode(icons[index]), Object.assign(document.createElement('span'), { className: 'small', textContent: names[index] }));
  });
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
  const assistiveMoves = new Set<'left' | 'right'>();
  const assistiveTimers = new Map<'left' | 'right', number>();

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
  const movement = (snapshot: MobileControlsSnapshot = mobile.read()) => {
    const left = snapshot.controls.left;
    const right = snapshot.controls.right;
    game.input.left = playing() && (keys.has('a') || keys.has('arrowleft') || assistiveMoves.has('left') || (left.type === 'hold' && left.pressed));
    game.input.right = playing() && (keys.has('d') || keys.has('arrowright') || assistiveMoves.has('right') || (right.type === 'hold' && right.pressed));
  };
  const clearAssistiveMoves = () => {
    for (const timer of assistiveTimers.values()) clearTimeout(timer);
    assistiveTimers.clear();
    assistiveMoves.clear();
  };
  function releaseAll(reason = 'consumer') {
    if (clearing) return;
    clearing = true;
    actions = [];
    keys.clear();
    clearAssistiveMoves();
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
    movement(snapshot);
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
        const existing = assistiveTimers.get(id);
        if (existing !== undefined) clearTimeout(existing);
        assistiveMoves.add(id);
        movement();
        assistiveTimers.set(id, window.setTimeout(() => {
          assistiveTimers.delete(id);
          assistiveMoves.delete(id);
          if (!disposed) movement();
        }, 180));
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
    mobile.updateLayouts({ portrait: patch, landscape: patch });
  };
  let layoutFrame = 0;
  const scheduleLayout = () => {
    if (disposed || layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; layout(); });
  };
  listen(window, 'resize', scheduleLayout as EventListener);
  listen(window, 'orientationchange', scheduleLayout as EventListener);
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', scheduleLayout as EventListener);
    listen(window.visualViewport, 'scroll', scheduleLayout as EventListener);
  }
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(controlsBar);
  layout();

  return {
    flush() {
      if (!playing()) {
        if (mobile.read().activePointers.length || actions.length || keys.size || assistiveMoves.size) releaseAll('not-playing');
        return mobile.read();
      }
      const snapshot = mobile.flush();
      movement(snapshot);
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
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      unsubscribe();
      observer.disconnect();
      disposers.forEach(dispose => dispose());
      mobile.destroy();
      root.remove();
    }
  };
}
