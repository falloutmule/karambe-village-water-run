import {
  cloneProfile,
  createDefaultProfile,
  validateDeclarations,
  validateProfile
} from "./profile.ts";
import type {
  CreateMobileControlsOptions,
  MobileControlDeclaration,
  MobileControlOutput,
  MobileControlsController,
  MobileControlsFinding,
  MobileControlsLifecycle,
  MobileControlsListener,
  MobileControlsOrientation,
  MobileControlsPersistenceStatus,
  MobileControlsProfile,
  MobileControlsRoute,
  MobileControlsSnapshot,
  MobileControlsStorage,
  MobileControlsUpdateResult,
  NormalizedRect
} from "./types.ts";

type MutableOutput =
  | { type: "stick2d"; x: number; y: number; magnitude: number; active: boolean }
  | { type: "relative1d"; rawNormalizedDelta: number; delta: number; active: boolean }
  | { type: "hold"; pressed: boolean }
  | { type: "pulse"; fired: boolean; count: number }
  | { type: "toggle"; state: boolean };

interface Owner {
  readonly identifier: number;
  readonly controlId: string;
  readonly startX: number;
  readonly startY: number;
  readonly extent: number;
  readonly editKind?: "drag" | "resize";
  readonly editRect?: NormalizedRect;
  lastX: number;
  lastY: number;
}

interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const controlStyles = `
.sfhs-mobile-controls-root{position:fixed;z-index:1000;overflow:hidden;touch-action:none;overscroll-behavior:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;--sfhs-mobile-controls-opacity:.6;--sfhs-mobile-controls-accent:#63d9ff;--sfhs-mobile-controls-bg:rgba(5,18,28,.64);--sfhs-mobile-controls-fg:#f4fbff}
.sfhs-mobile-control{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border:2px solid color-mix(in srgb,var(--sfhs-mobile-controls-accent) 72%,transparent);background:var(--sfhs-mobile-controls-bg);color:var(--sfhs-mobile-controls-fg);opacity:var(--sfhs-mobile-controls-opacity);border-radius:999px;touch-action:none;overscroll-behavior:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;font:700 12px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:0;margin:0}
.sfhs-mobile-control[data-control-active="true"]{filter:brightness(1.35);border-color:var(--sfhs-mobile-controls-accent)}
.sfhs-mobile-control-label{pointer-events:none;text-align:center}
.sfhs-mobile-control-stick-dot{position:absolute;left:50%;top:50%;width:24%;aspect-ratio:1;border-radius:50%;background:var(--sfhs-mobile-controls-accent);transform:translate(-50%,-50%);pointer-events:none}
.sfhs-mobile-control[data-sfhs-control-type="relative1d"]{border-radius:22px}
.sfhs-mobile-control-resize{display:none;position:absolute;right:0;bottom:0;width:28px;height:28px;border-radius:50%;background:var(--sfhs-mobile-controls-accent);border:2px solid #031018;transform:translate(18%,18%);touch-action:none}
.sfhs-mobile-controls-root[data-editing="true"] .sfhs-mobile-control{outline:2px dashed rgba(255,255,255,.8);outline-offset:2px}
.sfhs-mobile-controls-root[data-editing="true"] .sfhs-mobile-control-resize{display:block}
`;

function orientationFor(width: number, height: number): MobileControlsOrientation {
  return height >= width ? "portrait" : "landscape";
}

function successful(): MobileControlsUpdateResult {
  return Object.freeze({ ok: true, findings: Object.freeze([]) });
}

function failed(findings: readonly MobileControlsFinding[]): MobileControlsUpdateResult {
  return Object.freeze({ ok: false, findings: Object.freeze([...findings]) });
}

function profileFinding(path: string, message: string): MobileControlsFinding {
  return Object.freeze({ code: "SFHS_MOBILE_CONTROLS_PROFILE_INVALID", path, message });
}

function mutableOutputFor(declaration: MobileControlDeclaration): MutableOutput {
  switch (declaration.type) {
    case "stick2d": return { type: "stick2d", x: 0, y: 0, magnitude: 0, active: false };
    case "relative1d": return { type: "relative1d", rawNormalizedDelta: 0, delta: 0, active: false };
    case "hold": return { type: "hold", pressed: false };
    case "pulse": return { type: "pulse", fired: false, count: 0 };
    case "toggle": return { type: "toggle", state: false };
  }
}

function frozenOutput(output: MutableOutput): MobileControlOutput {
  return Object.freeze({ ...output });
}

function deepSnapshot(
  sequence: number,
  lifecycle: MobileControlsLifecycle,
  route: MobileControlsRoute,
  orientation: MobileControlsOrientation,
  persistence: MobileControlsPersistenceStatus,
  outputs: Readonly<Record<string, MutableOutput>>,
  owners: ReadonlyMap<number, Owner>
): MobileControlsSnapshot {
  return Object.freeze({
    schema: "sfhs.mobile-controls-state@1",
    sequence,
    lifecycle,
    route,
    orientation,
    persistence,
    controls: Object.freeze(Object.fromEntries(
      Object.entries(outputs).sort(([left], [right]) => left.localeCompare(right)).map(([id, output]) => [id, frozenOutput(output)])
    )),
    activePointers: Object.freeze([...owners.values()]
      .sort((left, right) => left.identifier - right.identifier)
      .map((owner) => Object.freeze({ controlId: owner.controlId, identifier: owner.identifier })))
  });
}

export function createMobileControlsRuntime(options: CreateMobileControlsOptions): MobileControlsController {
  validateDeclarations(options.controls);
  const declarations = Object.freeze(options.controls.map((entry) => Object.freeze({ ...entry })));
  const declarationById = new Map(declarations.map((entry) => [entry.id, entry]));
  const defaultProfile = createDefaultProfile(declarations, options.settings);
  const defaultValidation = validateProfile(defaultProfile, declarations);
  if (defaultValidation.profile === undefined) {
    throw new TypeError(defaultValidation.findings.map((entry) => `${entry.path}: ${entry.message}`).join("; "));
  }
  let profile = cloneProfile(defaultProfile);
  let root: HTMLElement | undefined;
  let lifecycle: MobileControlsLifecycle = "created";
  let route: MobileControlsRoute = "none";
  let persistenceStatus: MobileControlsPersistenceStatus = options.persistence === undefined ? "disabled" : "unavailable";
  let storage: MobileControlsStorage | undefined;
  let orientation: MobileControlsOrientation = "portrait";
  let sequence = 0;
  let editBaseline: MobileControlsProfile | undefined;
  let safeInsets: Insets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
  const outputs: Record<string, MutableOutput> = Object.fromEntries(declarations.map((entry) => [entry.id, mutableOutputFor(entry)]));
  const elements = new Map<string, HTMLElement>();
  const owners = new Map<number, Owner>();
  const ownerByControl = new Map<string, number>();
  const listeners = new Set<MobileControlsListener>();
  const disposers: Array<() => void> = [];

  const notify = (): void => {
    sequence += 1;
    const snapshot = read();
    for (const listener of listeners) listener(snapshot);
  };

  const add = (
    target: EventTarget,
    type: string,
    listener: EventListener,
    eventOptions?: AddEventListenerOptions | boolean
  ): void => {
    target.addEventListener(type, listener, eventOptions);
    disposers.push(() => target.removeEventListener(type, listener, eventOptions));
  };

  const resolveStorage = (): MobileControlsStorage | undefined => {
    if (options.persistence === undefined) return undefined;
    if (options.persistence.storage !== undefined) return options.persistence.storage;
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  };

  const persist = (): void => {
    if (options.persistence === undefined) {
      persistenceStatus = "disabled";
      return;
    }
    if (storage === undefined) {
      persistenceStatus = "unavailable";
      return;
    }
    try {
      storage.setItem(options.persistence.key, JSON.stringify(profile));
      persistenceStatus = "ready";
    } catch {
      persistenceStatus = "write-failed";
    }
  };

  const loadPersisted = (): void => {
    storage = resolveStorage();
    if (options.persistence === undefined) {
      persistenceStatus = "disabled";
      return;
    }
    if (storage === undefined) {
      persistenceStatus = "unavailable";
      return;
    }
    try {
      const serialized = storage.getItem(options.persistence.key);
      if (serialized === null) {
        persistenceStatus = "ready";
        return;
      }
      const result = validateProfile(JSON.parse(serialized) as unknown, declarations);
      if (result.profile === undefined) {
        persistenceStatus = "invalid";
        return;
      }
      profile = result.profile;
      persistenceStatus = "ready";
    } catch {
      persistenceStatus = "invalid";
    }
  };

  const measureInsets = (): Insets => {
    if (root === undefined) return Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    root.append(probe);
    const style = getComputedStyle(probe);
    const measured = Object.freeze({
      top: Number.parseFloat(style.paddingTop) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0
    });
    probe.remove();
    return measured;
  };

  const clampedRect = (declaration: MobileControlDeclaration, rect: NormalizedRect): NormalizedRect => {
    if (root === undefined) return rect;
    const bounds = root.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const minWidth = declaration.minWidth ?? 0.08;
    const minHeight = declaration.minHeight ?? 0.08;
    const safeLeft = safeInsets.left / width;
    const safeRight = safeInsets.right / width;
    const safeTop = safeInsets.top / height;
    const safeBottom = safeInsets.bottom / height;
    const rectWidth = Math.min(Math.max(rect.width, minWidth), Math.max(minWidth, 1 - safeLeft - safeRight));
    const rectHeight = Math.min(Math.max(rect.height, minHeight), Math.max(minHeight, 1 - safeTop - safeBottom));
    return Object.freeze({
      x: Math.min(Math.max(rect.x, safeLeft), 1 - safeRight - rectWidth),
      y: Math.min(Math.max(rect.y, safeTop), 1 - safeBottom - rectHeight),
      width: rectWidth,
      height: rectHeight
    });
  };

  const applyLayout = (): void => {
    if (root === undefined) return;
    root.style.setProperty("--sfhs-mobile-controls-opacity", String(profile.settings.opacity));
    root.dataset.editing = String(lifecycle === "editing");
    for (const declaration of declarations) {
      const element = elements.get(declaration.id);
      if (element === undefined) continue;
      const rect = clampedRect(declaration, profile.layouts[orientation][declaration.id] ?? declaration.layout[orientation]);
      element.style.left = `${rect.x * 100}%`;
      element.style.top = `${rect.y * 100}%`;
      element.style.width = `${rect.width * 100}%`;
      element.style.height = `${rect.height * 100}%`;
    }
  };

  const updateViewport = (release: boolean): void => {
    if (root === undefined) return;
    if (release) releaseAll("viewport-change");
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    root.style.left = `${viewport?.offsetLeft ?? 0}px`;
    root.style.top = `${viewport?.offsetTop ?? 0}px`;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    orientation = orientationFor(width, height);
    safeInsets = measureInsets();
    applyLayout();
    notify();
  };

  const setActiveVisual = (controlId: string, active: boolean): void => {
    const element = elements.get(controlId);
    if (element !== undefined) element.dataset.controlActive = String(active);
  };

  const syncStickVisual = (controlId: string, x: number, y: number): void => {
    const dot = elements.get(controlId)?.querySelector<HTMLElement>(".sfhs-mobile-control-stick-dot");
    if (dot !== null && dot !== undefined) dot.style.transform = `translate(calc(-50% + ${x * 120}%),calc(-50% + ${-y * 120}%))`;
  };

  const releaseOwner = (identifier: number): void => {
    const owner = owners.get(identifier);
    if (owner === undefined) return;
    owners.delete(identifier);
    ownerByControl.delete(owner.controlId);
    const output = outputs[owner.controlId];
    if (output === undefined) return;
    switch (output.type) {
      case "stick2d":
        output.x = 0; output.y = 0; output.magnitude = 0; output.active = false;
        syncStickVisual(owner.controlId, 0, 0);
        break;
      case "relative1d": output.active = false; break;
      case "hold": output.pressed = false; break;
      case "pulse": break;
      case "toggle": break;
    }
    setActiveVisual(owner.controlId, false);
    notify();
  };

  const beginOwner = (
    identifier: number,
    controlId: string,
    clientX: number,
    clientY: number,
    target: EventTarget | null
  ): boolean => {
    if (ownerByControl.has(controlId) || owners.has(identifier)) return false;
    const declaration = declarationById.get(controlId);
    const element = elements.get(controlId);
    const output = outputs[controlId];
    if (declaration === undefined || element === undefined || output === undefined) return false;
    const bounds = element.getBoundingClientRect();
    let editKind: Owner["editKind"];
    let editRect: NormalizedRect | undefined;
    if (lifecycle === "editing") {
      if (declaration.editable === false) return false;
      editKind = target instanceof Element && target.closest("[data-sfhs-resize-handle]") !== null ? "resize" : "drag";
      editRect = profile.layouts[orientation][controlId] ?? declaration.layout[orientation];
    } else {
      switch (output.type) {
        case "stick2d": output.active = true; break;
        case "relative1d": output.active = true; break;
        case "hold": output.pressed = true; break;
        case "pulse": output.count += 1; output.fired = true; break;
        case "toggle": output.state = !output.state; break;
      }
    }
    const axis = declaration.axis ?? "x";
    const owner: Owner = {
      identifier,
      controlId,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      extent: Math.max(1, axis === "x" ? bounds.width : bounds.height),
      ...(editKind === undefined ? {} : { editKind }),
      ...(editRect === undefined ? {} : { editRect })
    };
    owners.set(identifier, owner);
    ownerByControl.set(controlId, identifier);
    setActiveVisual(controlId, true);
    notify();
    return true;
  };

  const moveOwner = (identifier: number, clientX: number, clientY: number): void => {
    const owner = owners.get(identifier);
    if (owner === undefined || root === undefined) return;
    const declaration = declarationById.get(owner.controlId);
    const output = outputs[owner.controlId];
    if (declaration === undefined || output === undefined) return;
    if (owner.editKind !== undefined && owner.editRect !== undefined) {
      const bounds = root.getBoundingClientRect();
      const dx = (clientX - owner.startX) / Math.max(1, bounds.width);
      const dy = (clientY - owner.startY) / Math.max(1, bounds.height);
      const candidate: NormalizedRect = owner.editKind === "drag"
        ? { ...owner.editRect, x: owner.editRect.x + dx, y: owner.editRect.y + dy }
        : { ...owner.editRect, width: owner.editRect.width + dx, height: owner.editRect.height + dy };
      const clean = clampedRect(declaration, candidate);
      profile = cloneProfile({
        ...profile,
        layouts: {
          ...profile.layouts,
          [orientation]: { ...profile.layouts[orientation], [owner.controlId]: clean }
        }
      });
      applyLayout();
      owner.lastX = clientX;
      owner.lastY = clientY;
      notify();
      return;
    }
    switch (output.type) {
      case "stick2d": {
        const element = elements.get(owner.controlId);
        const rect = element?.getBoundingClientRect();
        const radius = Math.max(1, Math.min(rect?.width ?? 1, rect?.height ?? 1) * 0.35);
        const dx = clientX - owner.startX;
        const dy = clientY - owner.startY;
        const distance = Math.hypot(dx, dy);
        const magnitude = Math.min(1, distance / radius);
        if (distance === 0 || magnitude < profile.settings.stickDeadZone) {
          output.x = 0; output.y = 0; output.magnitude = 0;
        } else if (distance > 0) {
          output.x = (dx / distance) * magnitude;
          output.y = (-dy / distance) * magnitude;
          output.magnitude = magnitude;
        }
        syncStickVisual(owner.controlId, output.x, output.y);
        break;
      }
      case "relative1d": {
        const axis = declaration.axis ?? "x";
        const movement = axis === "x" ? clientX - owner.lastX : clientY - owner.lastY;
        const normalized = movement / owner.extent;
        output.rawNormalizedDelta += normalized;
        output.delta += normalized * profile.settings.relativeSensitivity;
        break;
      }
      case "hold":
      case "pulse":
      case "toggle":
        break;
    }
    owner.lastX = clientX;
    owner.lastY = clientY;
    notify();
  };

  const pointerSamples = (event: PointerEvent): readonly PointerEvent[] => {
    const candidate = event as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    try {
      const samples = candidate.getCoalescedEvents?.();
      if (samples !== undefined && samples.length > 0) return samples;
    } catch {
      // The parent event remains the exact-once fallback.
    }
    return Object.freeze([event]);
  };

  const installPointerRoute = (): void => {
    for (const [controlId, element] of elements) {
      add(element, "pointerdown", ((rawEvent: Event) => {
        const event = rawEvent as PointerEvent;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (!beginOwner(event.pointerId, controlId, event.clientX, event.clientY, event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        try { element.setPointerCapture(event.pointerId); } catch { /* Document tracking remains authoritative. */ }
      }) as EventListener, { passive: false });
      add(element, "lostpointercapture", ((rawEvent: Event) => {
        releaseOwner((rawEvent as PointerEvent).pointerId);
      }) as EventListener, { passive: false });
    }
    add(document, "pointermove", ((rawEvent: Event) => {
      const event = rawEvent as PointerEvent;
      if (!owners.has(event.pointerId)) return;
      event.preventDefault();
      for (const sample of pointerSamples(event)) moveOwner(event.pointerId, sample.clientX, sample.clientY);
    }) as EventListener, { passive: false });
    const finish = ((rawEvent: Event) => {
      const event = rawEvent as PointerEvent;
      if (!owners.has(event.pointerId)) return;
      event.preventDefault();
      releaseOwner(event.pointerId);
    }) as EventListener;
    add(document, "pointerup", finish, { passive: false });
    add(document, "pointercancel", finish, { passive: false });
  };

  const installTouchRoute = (): void => {
    for (const [controlId, element] of elements) {
      add(element, "touchstart", ((rawEvent: Event) => {
        const event = rawEvent as TouchEvent;
        for (const touch of Array.from(event.changedTouches)) {
          if (beginOwner(touch.identifier, controlId, touch.clientX, touch.clientY, event.target)) {
            event.preventDefault();
            event.stopPropagation();
            break;
          }
        }
      }) as EventListener, { passive: false });
    }
    add(document, "touchmove", ((rawEvent: Event) => {
      const event = rawEvent as TouchEvent;
      let handled = false;
      for (const touch of Array.from(event.touches.length > 0 ? event.touches : event.changedTouches)) {
        if (!owners.has(touch.identifier)) continue;
        handled = true;
        moveOwner(touch.identifier, touch.clientX, touch.clientY);
      }
      if (handled) event.preventDefault();
    }) as EventListener, { passive: false });
    const finish = ((rawEvent: Event) => {
      const event = rawEvent as TouchEvent;
      let handled = false;
      for (const touch of Array.from(event.changedTouches)) {
        if (!owners.has(touch.identifier)) continue;
        handled = true;
        releaseOwner(touch.identifier);
      }
      if (handled) event.preventDefault();
    }) as EventListener;
    add(document, "touchend", finish, { passive: false });
    add(document, "touchcancel", finish, { passive: false });
  };

  const makeControlElement = (declaration: MobileControlDeclaration): HTMLElement => {
    const discrete = declaration.type === "hold" || declaration.type === "pulse" || declaration.type === "toggle";
    const element = document.createElement(discrete ? "button" : "div");
    if (element instanceof HTMLButtonElement) element.type = "button";
    element.className = "sfhs-mobile-control";
    element.dataset.sfhsControlId = declaration.id;
    element.dataset.sfhsControlType = declaration.type;
    element.dataset.controlActive = "false";
    element.setAttribute("aria-label", declaration.label);
    if (!discrete) {
      element.setAttribute("role", "button");
      element.tabIndex = 0;
    }
    const label = document.createElement("span");
    label.className = "sfhs-mobile-control-label";
    label.textContent = declaration.label;
    element.append(label);
    if (declaration.type === "stick2d") {
      const dot = document.createElement("span");
      dot.className = "sfhs-mobile-control-stick-dot";
      element.append(dot);
    }
    const resize = document.createElement("span");
    resize.className = "sfhs-mobile-control-resize";
    resize.dataset.sfhsResizeHandle = "true";
    resize.setAttribute("aria-hidden", "true");
    element.append(resize);
    return element;
  };

  function read(): MobileControlsSnapshot {
    return deepSnapshot(sequence, lifecycle, route, orientation, persistenceStatus, outputs, owners);
  }

  function releaseAll(reason = "consumer"): void {
    void reason;
    owners.clear();
    ownerByControl.clear();
    for (const [controlId, output] of Object.entries(outputs)) {
      switch (output.type) {
        case "stick2d": output.x = 0; output.y = 0; output.magnitude = 0; output.active = false; syncStickVisual(controlId, 0, 0); break;
        case "relative1d": output.rawNormalizedDelta = 0; output.delta = 0; output.active = false; break;
        case "hold": output.pressed = false; break;
        case "pulse": output.fired = false; output.count = 0; break;
        case "toggle": output.state = false; break;
      }
      setActiveVisual(controlId, false);
    }
    notify();
  }

  const controller: MobileControlsController = {
    mount(mountRoot): void {
      if (lifecycle === "destroyed") throw new Error("Destroyed mobile controls cannot be mounted.");
      if (root !== undefined) throw new Error("Mobile controls are already mounted.");
      root = mountRoot;
      loadPersisted();
      root.replaceChildren();
      root.classList.add("sfhs-mobile-controls-root");
      const style = document.createElement("style");
      style.dataset.sfhsMobileControlsStyle = "true";
      style.textContent = controlStyles;
      root.append(style);
      for (const declaration of declarations) {
        const element = makeControlElement(declaration);
        elements.set(declaration.id, element);
        root.append(element);
      }
      lifecycle = "mounted";
      route = typeof window.PointerEvent === "function" ? "pointer" : "touch";
      if (route === "pointer") installPointerRoute(); else installTouchRoute();
      add(window, "blur", (() => releaseAll("blur")) as EventListener);
      add(window, "pagehide", (() => releaseAll("pagehide")) as EventListener);
      add(document, "visibilitychange", (() => { if (document.visibilityState === "hidden") releaseAll("visibility-hidden"); }) as EventListener);
      add(window, "resize", (() => updateViewport(true)) as EventListener);
      add(window, "orientationchange", (() => updateViewport(true)) as EventListener);
      if (window.visualViewport !== null) {
        add(window.visualViewport, "resize", (() => updateViewport(true)) as EventListener);
        add(window.visualViewport, "scroll", (() => updateViewport(false)) as EventListener);
      }
      if (options.persistence !== undefined) {
        add(window, "storage", ((rawEvent: Event) => {
          const event = rawEvent as StorageEvent;
          if (event.key !== options.persistence?.key || event.newValue === null) return;
          try {
            const result = validateProfile(JSON.parse(event.newValue) as unknown, declarations);
            if (result.profile === undefined) {
              persistenceStatus = "invalid";
            } else {
              profile = result.profile;
              persistenceStatus = "ready";
              applyLayout();
            }
          } catch {
            persistenceStatus = "invalid";
          }
          notify();
        }) as EventListener);
      }
      updateViewport(false);
    },
    destroy(): void {
      if (lifecycle === "destroyed") return;
      releaseAll("destroy");
      for (const dispose of disposers.splice(0)) dispose();
      if (root !== undefined) {
        root.replaceChildren();
        root.classList.remove("sfhs-mobile-controls-root");
        delete root.dataset.editing;
      }
      elements.clear();
      route = "none";
      lifecycle = "destroyed";
      root = undefined;
      notify();
      listeners.clear();
    },
    read,
    flush(): MobileControlsSnapshot {
      const snapshot = read();
      for (const output of Object.values(outputs)) {
        if (output.type === "relative1d") {
          output.rawNormalizedDelta = 0;
          output.delta = 0;
        } else if (output.type === "pulse") {
          output.fired = false;
          output.count = 0;
        }
      }
      sequence += 1;
      return snapshot;
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    releaseAll,
    updateConfig(patch): MobileControlsUpdateResult {
      const candidate: MobileControlsProfile = {
        ...profile,
        settings: { ...profile.settings, ...patch }
      };
      const result = validateProfile(candidate, declarations);
      if (result.profile === undefined) return failed(result.findings);
      profile = result.profile;
      applyLayout();
      persist();
      notify();
      return successful();
    },
    updateLayout(targetOrientation, layoutPatch): MobileControlsUpdateResult {
      const candidate: MobileControlsProfile = {
        ...profile,
        layouts: {
          ...profile.layouts,
          [targetOrientation]: { ...profile.layouts[targetOrientation], ...layoutPatch }
        }
      };
      const result = validateProfile(candidate, declarations);
      if (result.profile === undefined) return failed(result.findings);
      profile = result.profile;
      applyLayout();
      persist();
      notify();
      return successful();
    },
    beginEdit(): void {
      if (lifecycle !== "mounted") return;
      releaseAll("edit-entry");
      editBaseline = cloneProfile(profile);
      lifecycle = "editing";
      applyLayout();
      notify();
    },
    commitEdit(): MobileControlsUpdateResult {
      if (lifecycle !== "editing") return failed([profileFinding("/lifecycle", "Controls are not being edited.")]);
      const result = validateProfile(profile, declarations);
      if (result.profile === undefined) return failed(result.findings);
      profile = result.profile;
      editBaseline = undefined;
      lifecycle = "mounted";
      applyLayout();
      persist();
      notify();
      return successful();
    },
    cancelEdit(): void {
      if (lifecycle !== "editing") return;
      if (editBaseline !== undefined) profile = editBaseline;
      editBaseline = undefined;
      lifecycle = "mounted";
      applyLayout();
      notify();
    },
    exportProfile(): MobileControlsProfile {
      return cloneProfile(profile);
    },
    importProfile(value): MobileControlsUpdateResult {
      const result = validateProfile(value, declarations);
      if (result.profile === undefined) return failed(result.findings);
      releaseAll("profile-import");
      profile = result.profile;
      applyLayout();
      persist();
      notify();
      return successful();
    },
    resetProfile(): void {
      releaseAll("profile-reset");
      profile = cloneProfile(defaultProfile);
      editBaseline = undefined;
      if (lifecycle === "editing") lifecycle = "mounted";
      if (options.persistence !== undefined && storage !== undefined) {
        try {
          storage.removeItem(options.persistence.key);
          persistenceStatus = "ready";
        } catch {
          persistenceStatus = "write-failed";
        }
      }
      applyLayout();
      notify();
    }
  };

  return Object.freeze(controller);
}
