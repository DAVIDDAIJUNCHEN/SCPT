import {
  DEFAULT_CUSTOM_COLOR,
  DEFAULT_PALETTE,
  LEGACY_PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  VALID_PALETTES,
  normalizeHexColor,
  type ThemePalette,
} from "./themePalettes";

export type ThemePreference = "system" | "light" | "dark";

export type StoredAppearance = {
  preference: ThemePreference;
  palette: ThemePalette;
  /** Brand hex for the "custom" palette; ignored for curated palettes. */
  customColor?: string;
};

const VALID_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

function isPreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" && (VALID_PREFERENCES as string[]).includes(value)
  );
}

function isPalette(value: unknown): value is ThemePalette {
  return (
    typeof value === "string" &&
    ([...VALID_PALETTES, "custom"] as string[]).includes(value)
  );
}

function readLegacyPalette(): ThemePalette {
  const stored = localStorage.getItem(LEGACY_PALETTE_STORAGE_KEY);
  if (isPalette(stored)) return stored;
  return DEFAULT_PALETTE;
}

/**
 * Upstream Octop shipped `rose` as the implicit default palette. 星语 rebrand
 * switched {@link DEFAULT_PALETTE} to `tech` (brand blue), but a palette that
 * an earlier session persisted into localStorage always wins over the code
 * default — so browsers that opened the app before the rebrand stayed rose
 * forever. This one-shot migration upgrades that single legacy value; any
 * other stored palette (a deliberate pick) is left untouched.
 */
const LEGACY_DEFAULT_PALETTE: ThemePalette = "rose";

/** Marker so the rebrand migration runs at most once per browser. */
export const PALETTE_MIGRATION_KEY = "octop:palette-rebrand-migrated";

export function migrateLegacyDefaultPalette(
  palette: ThemePalette,
): ThemePalette {
  try {
    if (localStorage.getItem(PALETTE_MIGRATION_KEY)) return palette;
    localStorage.setItem(PALETTE_MIGRATION_KEY, "1");
  } catch {
    return palette;
  }
  return palette === LEGACY_DEFAULT_PALETTE ? DEFAULT_PALETTE : palette;
}

/**
 * Read light/dark preference + brand palette from the shared `theme` key.
 * Migrates legacy plain-string `theme` and `octop:ui-palette` values, plus the
 * one-shot rebrand migration of the legacy implicit palette (see
 * {@link migrateLegacyDefaultPalette}).
 */
export function readStoredAppearance(): StoredAppearance {
  const appearance = readStoredAppearanceRaw();
  const palette = migrateLegacyDefaultPalette(appearance.palette);
  return palette === appearance.palette ? appearance : { ...appearance, palette };
}

function readStoredAppearanceRaw(): StoredAppearance {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  if (!raw) {
    return {
      preference: "system",
      palette: readLegacyPalette(),
      customColor: DEFAULT_CUSTOM_COLOR,
    };
  }

  // Legacy: plain preference string
  if (isPreference(raw)) {
    return {
      preference: raw,
      palette: readLegacyPalette(),
      customColor: DEFAULT_CUSTOM_COLOR,
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const preference = isPreference(obj.preference)
        ? obj.preference
        : "system";
      const palette = isPalette(obj.palette)
        ? obj.palette
        : readLegacyPalette();
      const customColor =
        normalizeHexColor(obj.customColor as string) ?? DEFAULT_CUSTOM_COLOR;
      return { preference, palette, customColor };
    }
  } catch {
    // fall through
  }

  return {
    preference: "system",
    palette: readLegacyPalette(),
    customColor: DEFAULT_CUSTOM_COLOR,
  };
}

/** Persist both fields under the same `theme` key; drop legacy palette key. */
export function writeStoredAppearance(appearance: StoredAppearance): void {
  localStorage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({
      preference: appearance.preference,
      palette: appearance.palette,
      customColor:
        normalizeHexColor(appearance.customColor ?? "") ?? DEFAULT_CUSTOM_COLOR,
    }),
  );
  localStorage.removeItem(LEGACY_PALETTE_STORAGE_KEY);
}

/** One-shot boot read + migrate for ThemeProvider initial state. */
export function loadAppearanceOnBoot(): StoredAppearance {
  const appearance = readStoredAppearance();
  writeStoredAppearance(appearance);
  return appearance;
}
