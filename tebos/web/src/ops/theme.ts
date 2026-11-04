// The reader's chosen theme for Tidy Property Operations. "system" follows the device and keeps following it.
// The choice is a per-device convenience kept in localStorage; if storage is unavailable the app is dark (its default).
export type ThemeChoice = "dark" | "light" | "system";
const KEY = "tpo-theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" || v === "dark" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function resolveTheme(choice: ThemeChoice, prefersLight: boolean): "dark" | "light" {
  return choice === "system" ? (prefersLight ? "light" : "dark") : choice;
}

const lightQuery = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null);

/** Set <html data-theme>. Call before the first render so there is no flash of the wrong theme. */
export function applyTheme(choice: ThemeChoice = readTheme()): void {
  document.documentElement.dataset.theme = resolveTheme(choice, lightQuery()?.matches ?? false);
  document.documentElement.dataset.themeChoice = choice;
}

export function saveTheme(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, choice); } catch { /* the choice still applies for this visit */ }
  applyTheme(choice);
}

/** Keep "system" in step when the device switches between light and dark. */
export function followSystemTheme(): () => void {
  const q = lightQuery();
  if (!q) return () => {};
  const on = () => { if (readTheme() === "system") applyTheme("system"); };
  q.addEventListener("change", on);
  return () => q.removeEventListener("change", on);
}
