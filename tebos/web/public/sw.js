// TEBOS's service worker. It does one thing: when a page can't load because
// there's no connection, it shows an honest offline page instead of the
// browser's error. It never stores your data: every request goes to the
// network as usual, so nothing out of date can be shown as current. The only
// thing kept on the phone is the TEBOS icon the offline page shows.
const CACHE = "tebos-offline-v1";
const ICON = "/brand/icon-192.png";

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b111b" />
    <title>TEBOS · Offline</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b111b; color: #e2e8f0; font: 16px/1.5 system-ui, sans-serif; }
      main { max-width: 340px; padding: 24px; text-align: center; }
      img { width: 72px; height: 72px; border-radius: 16px; }
      h1 { font-size: 22px; margin: 16px 0 8px; color: #fff; }
      p { color: #9aa3b0; margin: 0 0 20px; }
      button { font: inherit; font-weight: 700; padding: 10px 18px; border-radius: 10px; border: 0; background: #7fb2ff; color: #0b0f16; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <img src="${ICON}" alt="" />
      <h1>You're offline</h1>
      <p>TEBOS shows live figures, so it needs a connection. Nothing is kept on this phone, so nothing you see in TEBOS is ever out of date.</p>
      <button type="button" onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(ICON)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })));
  } else if (url.origin === self.location.origin && url.pathname === ICON) {
    event.respondWith(fetch(event.request).catch(() => caches.match(ICON)));
  }
  // everything else (data, scripts, images) is left to the network, untouched
});
