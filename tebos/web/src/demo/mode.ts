// Demo mode: the real TEBOS interface on a fictional business, answered by an
// in-browser backend (./client.ts). Opened at /demo; nothing is sent to any
// server and nothing is stored beyond this tab. Leaving the demo, or closing
// the tab, discards everything.

const KEY = "tebos.demo";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.pathname === "/demo") {
      sessionStorage.setItem(KEY, "1");
      window.history.replaceState(null, "", "/");
      return true;
    }
    // Opening the main address always shows the home page, even in a tab that
    // was in the demo: the demo never takes over the site's front door.
    // (Inside the demo, its Home link navigates without a reload and stays.)
    if (window.location.pathname === "/") {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return window.location.pathname === "/demo";
  }
}

export const isDemo = read();

export function exitDemo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  window.location.assign("/");
}
