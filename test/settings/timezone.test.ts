import { describe, expect, it } from "vitest";
import { resolveTimezone } from "../../src/settings/timezone";
import type { TimezoneWorkspace } from "../../src/settings/timezone";

describe("resolveTimezone", () => {
  it("uses a configured major timezone", () => {
    expect(resolveTimezone(workspace("Asia/Tokyo", ""), () => "UTC")).toBe(
      "Asia/Tokyo",
    );
  });

  it("uses a valid custom timezone", () => {
    expect(
      resolveTimezone(
        workspace("(custom)", "Pacific/Chatham"),
        () => "Asia/Tokyo",
      ),
    ).toBe("Pacific/Chatham");
  });

  it("uses Intl auto detection when timezone is empty", () => {
    expect(resolveTimezone(workspace("", ""), () => "Europe/London")).toBe(
      "Europe/London",
    );
  });

  it("falls back to UTC for invalid configured values", () => {
    expect(resolveTimezone(workspace("Invalid/Zone", ""), () => "UTC")).toBe(
      "UTC",
    );
    expect(resolveTimezone(workspace("(custom)", ""), () => "UTC")).toBe("UTC");
    expect(resolveTimezone(workspace("", ""), () => "Invalid/Zone")).toBe(
      "UTC",
    );
  });
});

/**
 * Creates a workspace-like configuration object.
 *
 * @param timezone - `codeWatch.timezone` value.
 * @param timezoneCustom - `codeWatch.timezoneCustom` value.
 * @returns Workspace configuration provider.
 */
function workspace(
  timezone: string,
  timezoneCustom: string,
): TimezoneWorkspace {
  return {
    getConfiguration() {
      return {
        get<T>(key: string): T | undefined {
          const values = {
            timezone,
            timezoneCustom,
          };

          return values[key as keyof typeof values] as T | undefined;
        },
      };
    },
  };
}
