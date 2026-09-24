import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, readThemePreference, resolveTheme, writeThemePreference } from "./theme";

describe("theme preference", () => {
  it("persists light dark and system", () => {
    writeThemePreference("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readThemePreference()).toBe("light");
    writeThemePreference("dark");
    expect(readThemePreference()).toBe("dark");
    writeThemePreference("system");
    expect(readThemePreference()).toBe("system");
  });

  it("system follows OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});
