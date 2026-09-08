import type {
  MobileControlDeclaration,
  MobileControlsFinding,
  MobileControlsLayouts,
  MobileControlsOrientation,
  MobileControlsProfile,
  MobileControlsSettings,
  NormalizedRect
} from "./types.ts";

export const defaultMobileControlsSettings: MobileControlsSettings = Object.freeze({
  opacity: 0.6,
  stickDeadZone: 0.08,
  relativeSensitivity: 1
});

const orientations: readonly MobileControlsOrientation[] = Object.freeze(["portrait", "landscape"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteIn(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function cloneRect(rect: NormalizedRect): NormalizedRect {
  return Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}

function cloneLayouts(layouts: MobileControlsLayouts): MobileControlsLayouts {
  const copy = {} as Record<MobileControlsOrientation, Readonly<Record<string, NormalizedRect>>>;
  for (const orientation of orientations) {
    copy[orientation] = Object.freeze(Object.fromEntries(
      Object.entries(layouts[orientation])
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, rect]) => [id, cloneRect(rect)])
    ));
  }
  return Object.freeze(copy);
}

export function cloneProfile(profile: MobileControlsProfile): MobileControlsProfile {
  return Object.freeze({
    schema: "sfhs.mobile-controls-profile@1",
    settings: Object.freeze({ ...profile.settings }),
    layouts: cloneLayouts(profile.layouts)
  });
}

export function createDefaultProfile(
  declarations: readonly MobileControlDeclaration[],
  settings: Partial<MobileControlsSettings> = {}
): MobileControlsProfile {
  const layouts = { portrait: {}, landscape: {} } as Record<
    MobileControlsOrientation,
    Record<string, NormalizedRect>
  >;
  for (const declaration of declarations) {
    for (const orientation of orientations) {
      layouts[orientation][declaration.id] = cloneRect(declaration.layout[orientation]);
    }
  }
  return cloneProfile({
    schema: "sfhs.mobile-controls-profile@1",
    settings: {
      ...defaultMobileControlsSettings,
      ...settings
    },
    layouts
  });
}

export function validateDeclarations(declarations: readonly MobileControlDeclaration[]): void {
  if (declarations.length === 0) throw new TypeError("Mobile controls require at least one declaration.");
  const ids = new Set<string>();
  for (const declaration of declarations) {
    if (!/^[a-z][a-z0-9-]*$/u.test(declaration.id)) {
      throw new TypeError(`Invalid mobile control id: ${declaration.id}`);
    }
    if (ids.has(declaration.id)) throw new TypeError(`Duplicate mobile control id: ${declaration.id}`);
    ids.add(declaration.id);
    if (declaration.label.trim().length === 0) throw new TypeError(`Control ${declaration.id} requires a label.`);
    if (declaration.type !== "relative1d" && declaration.axis !== undefined) {
      throw new TypeError(`Control ${declaration.id} may only declare an axis for relative1d.`);
    }
    if (declaration.minWidth !== undefined && !finiteIn(declaration.minWidth, 0.02, 0.8)) {
      throw new TypeError(`Control ${declaration.id} has an invalid minWidth.`);
    }
    if (declaration.minHeight !== undefined && !finiteIn(declaration.minHeight, 0.02, 0.8)) {
      throw new TypeError(`Control ${declaration.id} has an invalid minHeight.`);
    }
    for (const orientation of orientations) {
      const rect = declaration.layout[orientation];
      if (!finiteIn(rect.x, 0, 1) || !finiteIn(rect.y, 0, 1) || !finiteIn(rect.width, 0.02, 1) || !finiteIn(rect.height, 0.02, 1)) {
        throw new TypeError(`Control ${declaration.id} has invalid ${orientation} geometry.`);
      }
    }
  }
}

function finding(path: string, message: string): MobileControlsFinding {
  return Object.freeze({ code: "SFHS_MOBILE_CONTROLS_PROFILE_INVALID", path, message });
}

export function validateProfile(
  value: unknown,
  declarations: readonly MobileControlDeclaration[]
): { readonly profile?: MobileControlsProfile; readonly findings: readonly MobileControlsFinding[] } {
  if (!isRecord(value)) return { findings: Object.freeze([finding("/", "Profile must be an object.")]) };
  if (value.schema !== "sfhs.mobile-controls-profile@1") {
    return { findings: Object.freeze([Object.freeze({
      code: "SFHS_MOBILE_CONTROLS_PROFILE_VERSION_UNSUPPORTED",
      path: "/schema",
      message: "Only sfhs.mobile-controls-profile@1 is supported."
    })]) };
  }
  const findings: MobileControlsFinding[] = [];
  const settings = value.settings;
  if (!isRecord(settings)) {
    findings.push(finding("/settings", "Settings must be an object."));
  } else {
    if (!finiteIn(settings.opacity, 0.1, 1)) findings.push(finding("/settings/opacity", "Opacity must be between 0.1 and 1."));
    if (!finiteIn(settings.stickDeadZone, 0, 0.5)) findings.push(finding("/settings/stickDeadZone", "Stick dead zone must be between 0 and 0.5."));
    if (!finiteIn(settings.relativeSensitivity, 0.25, 4)) findings.push(finding("/settings/relativeSensitivity", "Relative sensitivity must be between 0.25 and 4."));
  }
  const layouts = value.layouts;
  const declarationsById = new Map(declarations.map((entry) => [entry.id, entry]));
  const normalizedLayouts = { portrait: {}, landscape: {} } as Record<
    MobileControlsOrientation,
    Record<string, NormalizedRect>
  >;
  if (!isRecord(layouts)) {
    findings.push(finding("/layouts", "Layouts must be an object."));
  } else {
    for (const orientation of orientations) {
      const orientationLayout = layouts[orientation];
      if (!isRecord(orientationLayout)) {
        findings.push(finding(`/layouts/${orientation}`, `${orientation} layout must be an object.`));
        continue;
      }
      for (const [id, candidate] of Object.entries(orientationLayout)) {
        const declaration = declarationsById.get(id);
        if (declaration === undefined) {
          findings.push(Object.freeze({
            code: "SFHS_MOBILE_CONTROLS_PROFILE_UNKNOWN_CONTROL",
            path: `/layouts/${orientation}/${id}`,
            message: `Unknown control id: ${id}`
          }));
          continue;
        }
        if (!isRecord(candidate)) {
          findings.push(finding(`/layouts/${orientation}/${id}`, "Control geometry must be an object."));
          continue;
        }
        const minWidth = declaration.minWidth ?? 0.08;
        const minHeight = declaration.minHeight ?? 0.08;
        if (
          !finiteIn(candidate.x, 0, 1) || !finiteIn(candidate.y, 0, 1) ||
          !finiteIn(candidate.width, minWidth, 1) || !finiteIn(candidate.height, minHeight, 1) ||
          (typeof candidate.x === "number" && typeof candidate.width === "number" && candidate.x + candidate.width > 1) ||
          (typeof candidate.y === "number" && typeof candidate.height === "number" && candidate.y + candidate.height > 1)
        ) {
          findings.push(finding(`/layouts/${orientation}/${id}`, "Control geometry is outside its normalized bounds."));
          continue;
        }
        normalizedLayouts[orientation][id] = {
          x: candidate.x,
          y: candidate.y,
          width: candidate.width,
          height: candidate.height
        };
      }
      for (const declaration of declarations) {
        normalizedLayouts[orientation][declaration.id] ??= cloneRect(declaration.layout[orientation]);
      }
    }
  }
  if (findings.length > 0 || !isRecord(settings)) return { findings: Object.freeze(findings) };
  return {
    profile: cloneProfile({
      schema: "sfhs.mobile-controls-profile@1",
      settings: {
        opacity: settings.opacity as number,
        stickDeadZone: settings.stickDeadZone as number,
        relativeSensitivity: settings.relativeSensitivity as number
      },
      layouts: normalizedLayouts
    }),
    findings: Object.freeze([])
  };
}

export function serializeProfile(profile: MobileControlsProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}
