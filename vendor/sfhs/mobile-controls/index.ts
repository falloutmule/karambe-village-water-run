import { createMobileControlsRuntime } from "./runtime.ts";

export const packageIdentity = "@sfhs/mobile-controls" as const;
export const createMobileControls = createMobileControlsRuntime;

export { defaultMobileControlsSettings, serializeProfile } from "./profile.ts";
export type {
  CreateMobileControlsOptions,
  HoldOutput,
  MobileControlDeclaration,
  MobileControlOutput,
  MobileControlOwnerSnapshot,
  MobileControlsController,
  MobileControlsFinding,
  MobileControlsLayouts,
  MobileControlsLifecycle,
  MobileControlsListener,
  MobileControlsOrientation,
  MobileControlsPersistenceOptions,
  MobileControlsPersistenceStatus,
  MobileControlsProfile,
  MobileControlsRoute,
  MobileControlsSettings,
  MobileControlsSnapshot,
  MobileControlsStorage,
  MobileControlsUpdateResult,
  MobileControlType,
  NormalizedRect,
  PulseOutput,
  Relative1dOutput,
  Stick2dOutput,
  ToggleOutput
} from "./types.ts";
