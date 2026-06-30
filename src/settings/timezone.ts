/**
 * Minimal VS Code configuration shape needed by timezone resolution.
 */
export interface TimezoneConfiguration {
  /**
   * Reads a setting value.
   *
   * @param key - Setting key under `codeWatch`.
   * @returns Setting value, or `undefined`.
   */
  get<T>(key: string): T | undefined;
}

/**
 * Minimal VS Code workspace shape needed by timezone resolution.
 */
export interface TimezoneWorkspace {
  /**
   * Reads a named configuration section.
   *
   * @param section - Configuration section name.
   * @returns Configuration reader.
   */
  getConfiguration(section: "codeWatch"): TimezoneConfiguration;
}

/**
 * Detects the system timezone through Intl.
 *
 * @returns IANA timezone name, or `undefined` when unavailable.
 */
export type SystemTimezoneDetector = () => string | undefined;

/**
 * Timezone used when configuration and system detection are invalid.
 */
export const FALLBACK_TIMEZONE = "UTC";

/**
 * Resolves the configured timezone for Code Watch.
 *
 * @param workspace - Workspace-like configuration provider.
 * @param detectSystemTimezone - Function used for automatic timezone detection.
 * @returns Valid IANA timezone name.
 */
export function resolveTimezone(
  workspace: TimezoneWorkspace,
  detectSystemTimezone: SystemTimezoneDetector = detectIntlTimezone,
): string {
  const configuration = workspace.getConfiguration("codeWatch");
  const selected = configuration.get<string>("timezone") ?? "";
  const candidate =
    selected === ""
      ? detectSystemTimezone()
      : selected === "(custom)"
        ? configuration.get<string>("timezoneCustom")
        : selected;

  if (candidate === undefined || candidate.trim() === "") {
    return FALLBACK_TIMEZONE;
  }

  return isValidTimeZone(candidate) ? candidate : FALLBACK_TIMEZONE;
}

/**
 * Checks whether Intl accepts a timezone name.
 *
 * @param timeZone - Timezone name to validate.
 * @returns `true` when the timezone is valid.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the system timezone from Intl.
 *
 * @returns IANA timezone name, or `undefined` when unavailable.
 */
function detectIntlTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
