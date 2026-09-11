export type MobileControlType = "stick2d" | "relative1d" | "hold" | "pulse" | "toggle";
export type MobileControlsOrientation = "portrait" | "landscape";
export type MobileControlsRoute = "none" | "pointer" | "touch";
export type MobileControlsLifecycle = "created" | "mounted" | "editing" | "destroyed";
export type MobileControlsPersistenceStatus = "disabled" | "ready" | "unavailable" | "invalid" | "write-failed";

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MobileControlDeclaration {
  readonly id: string;
  readonly type: MobileControlType;
  readonly label: string;
  readonly axis?: "x" | "y";
  readonly editable?: boolean;
  /** Release this contact as canceled as soon as it leaves the control bounds. */
  readonly cancelOnLeave?: boolean;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly layout: Readonly<Record<MobileControlsOrientation, NormalizedRect>>;
}

export interface MobileControlContactEnd {
  readonly identifier: number;
  readonly controlId: string;
  readonly kind: "release" | "cancel";
  readonly reason: string;
}

export interface MobileControlsSettings {
  readonly opacity: number;
  readonly stickDeadZone: number;
  readonly relativeSensitivity: number;
}

export type MobileControlsLayouts = Readonly<Record<
  MobileControlsOrientation,
  Readonly<Record<string, NormalizedRect>>
>>;

export interface MobileControlsProfile {
  readonly schema: "sfhs.mobile-controls-profile@1";
  readonly settings: MobileControlsSettings;
  readonly layouts: MobileControlsLayouts;
}

export interface MobileControlsFinding {
  readonly code:
    | "SFHS_MOBILE_CONTROLS_PROFILE_INVALID"
    | "SFHS_MOBILE_CONTROLS_PROFILE_UNKNOWN_CONTROL"
    | "SFHS_MOBILE_CONTROLS_PROFILE_VERSION_UNSUPPORTED";
  readonly path: string;
  readonly message: string;
}

export interface MobileControlsUpdateResult {
  readonly ok: boolean;
  readonly findings: readonly MobileControlsFinding[];
}

export interface MobileControlsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MobileControlsPersistenceOptions {
  readonly key: string;
  readonly storage?: MobileControlsStorage;
}

export interface CreateMobileControlsOptions {
  readonly controls: readonly MobileControlDeclaration[];
  readonly settings?: Partial<MobileControlsSettings>;
  readonly persistence?: MobileControlsPersistenceOptions;
  readonly onContactEnd?: (event: MobileControlContactEnd) => void;
  /** Cancel the browser's parallel Touch Event defaults when Pointer Events own contacts. */
  readonly preventNativeTouchDefaults?: boolean;
}

export interface Stick2dOutput {
  readonly type: "stick2d";
  readonly x: number;
  readonly y: number;
  readonly magnitude: number;
  readonly active: boolean;
}

export interface Relative1dOutput {
  readonly type: "relative1d";
  readonly rawNormalizedDelta: number;
  readonly delta: number;
  readonly active: boolean;
}

export interface HoldOutput {
  readonly type: "hold";
  readonly pressed: boolean;
}

export interface PulseOutput {
  readonly type: "pulse";
  readonly fired: boolean;
  readonly count: number;
}

export interface ToggleOutput {
  readonly type: "toggle";
  readonly state: boolean;
}

export type MobileControlOutput = Stick2dOutput | Relative1dOutput | HoldOutput | PulseOutput | ToggleOutput;

export interface MobileControlOwnerSnapshot {
  readonly controlId: string;
  readonly identifier: number;
}

export interface MobileControlsSnapshot {
  readonly schema: "sfhs.mobile-controls-state@1";
  readonly sequence: number;
  readonly lifecycle: MobileControlsLifecycle;
  readonly route: MobileControlsRoute;
  readonly orientation: MobileControlsOrientation;
  readonly persistence: MobileControlsPersistenceStatus;
  readonly controls: Readonly<Record<string, MobileControlOutput>>;
  readonly activePointers: readonly MobileControlOwnerSnapshot[];
}

export type MobileControlsListener = (snapshot: MobileControlsSnapshot) => void;

export interface MobileControlsController {
  mount(root: HTMLElement): void;
  destroy(): void;
  read(): MobileControlsSnapshot;
  flush(): MobileControlsSnapshot;
  subscribe(listener: MobileControlsListener): () => void;
  releaseAll(reason?: string): void;
  updateConfig(patch: Partial<MobileControlsSettings>): MobileControlsUpdateResult;
  updateLayout(
    orientation: MobileControlsOrientation,
    layoutPatch: Readonly<Record<string, NormalizedRect>>
  ): MobileControlsUpdateResult;
  updateLayouts(layoutPatch: Partial<MobileControlsLayouts>): MobileControlsUpdateResult;
  beginEdit(): void;
  commitEdit(): MobileControlsUpdateResult;
  cancelEdit(): void;
  exportProfile(): MobileControlsProfile;
  importProfile(profile: unknown): MobileControlsUpdateResult;
  resetProfile(): void;
}
