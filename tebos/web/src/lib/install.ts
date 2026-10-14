// The installable app: register the service worker (public/sw.js: an honest
// offline page, no stored data), and offer "Install TEBOS" when the browser
// says the app can be installed.
import { useEffect, useState } from "react";

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // not installable in this browser; the site works exactly the same without it
    });
  });
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The browser's install prompt, when it offers one (Android Chrome, desktop Chrome and Edge). */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const installed = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!event) return null;
  return async () => {
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };
}
