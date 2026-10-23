// What the device remembers of the person's preferences: whether the amounts are covered and which
// theme to paint. They are the only things of the application kept on the device (ADR-0035) and
// they have nothing to do with the ledger, so they live apart from its store.

import { createSignal } from "solid-js";

export type Theme = "system" | "light" | "dark";

const PRIVACY_KEY = "atlas.privacy";
const THEME_KEY = "atlas.theme";

/** localStorage, tolerant: in private mode it can throw or come back empty. */
const readLocal = (key: string): string | undefined => {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    // Blocked site data: the preference is simply not remembered, and the
    // caller's default applies. There is nothing else to do and nothing worth
    // telling the user about.
    return undefined;
  }
};

const writeLocal = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembering a preference is a minor loss.
  }
};

/**
 * Privacy is **on** unless the device explicitly says it is off: anything that is not the literal
 * "off" — nothing stored, storage blocked, a value written by an older version — leaves the amounts
 * covered.
 *
 * It is a function of its own, and not an expression inside `createSignal`, so a
 * test can reach it: turning `!== "off"` into `=== "on"` used to pass the whole
 * suite and left every amount visible on first run.
 */
export const privacyFromPreference = (stored: string | undefined): boolean => stored !== "off";

/** Anything stored that is not a theme follows the system. */
export const themeFromPreference = (stored: string | undefined): Theme =>
  stored === "light" || stored === "dark" ? stored : "system";

const [privacyOn, setPrivacyOn] = createSignal(privacyFromPreference(readLocal(PRIVACY_KEY)));
const [currentTheme, setCurrentTheme] = createSignal<Theme>(
  themeFromPreference(readLocal(THEME_KEY)),
);

/** Are the amounts covered? On by default: the first read is what decides. */
export const privacy = privacyOn;

export const setPrivacy = (value: boolean): void => {
  setPrivacyOn(value);
  writeLocal(PRIVACY_KEY, value ? "on" : "off");
};

export const theme = currentTheme;

export const setTheme = (value: Theme): void => {
  setCurrentTheme(value);
  writeLocal(THEME_KEY, value);
};
