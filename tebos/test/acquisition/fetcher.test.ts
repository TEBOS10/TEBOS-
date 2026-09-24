import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeFetch, type Vetter } from "../../src/acquisition/fetcher";
import { checkRedirect, systemResolver } from "../../src/security/url-safety";

// A local server stands in for "a public website". Only the name site.test
// is vetted — and pinned — to it; any other hop gets the real policy, which
// rejects loopback. site.test never exists in DNS, so a successful fetch
// proves the connection used the vetted address, not a fresh lookup.

const hits: string[] = [];
let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    switch (req.url) {
      case "/":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end("<html><head><title>Home</title></head><body><h1>Hello</h1></body></html>");
      case "/moved":
        res.writeHead(301, { location: `http://site.test:${port}/` });
        return res.end();
      case "/to-internal":
        res.writeHead(302, { location: "http://127.0.0.1/secret" }); // port 80: only the address check can refuse it
        return res.end();
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        return res.end();
      case "/bomb": {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        return res.end(gzipSync(Buffer.alloc(5 * 1024 * 1024, "a")));
      }
      case "/down":
        res.writeHead(503, { "content-type": "text/html" });
        return res.end("unavailable");
      case "/image":
        res.writeHead(200, { "content-type": "image/png" });
        return res.end(Buffer.alloc(10));
      case "/slow":
        return; // never responds
      default:
        res.writeHead(404);
        return res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const vet: Vetter = async (url, hop, from) => {
  const u = new URL(url, from ?? undefined);
  if (u.hostname === "site.test") return { safe: true, url: u, addresses: ["127.0.0.1"] };
  return hop === 0 || !from ? { safe: false, reason: "host_not_allowed", detail: "test vetter" } : checkRedirect(from, url, hop, systemResolver);
};
const at = (path: string) => `http://site.test:${port}${path}`;

describe("safeFetch", () => {
  it("connects to the vetted address without resolving the host name", async () => {
    const r = await safeFetch(at("/"), { vet });
    expect(r).toMatchObject({ kind: "ok", status: 200, truncated: false });
    expect(r.kind === "ok" && r.body).toContain("<h1>Hello</h1>");
    expect(r.kind === "ok" && r.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("follows redirects only after vetting each hop", async () => {
    const r = await safeFetch(at("/moved"), { vet });
    expect(r).toMatchObject({ kind: "ok", finalUrl: at("/"), redirects: [at("/")] });
  });

  it("refuses a redirect into a private address and never requests it", async () => {
    const before = hits.filter((h) => h === "/secret").length;
    const r = await safeFetch(at("/to-internal"), { vet });
    expect(r).toMatchObject({ kind: "blocked", reason: "private_address" });
    expect(hits.filter((h) => h === "/secret").length).toBe(before);
  });

  it("stops redirect loops", async () => {
    expect(await safeFetch(at("/loop"), { vet, maxRedirects: 3 })).toMatchObject({ kind: "blocked", reason: "too_many_redirects" });
  });

  it("caps decompressed size, so a compression bomb cannot exhaust memory", async () => {
    const r = await safeFetch(at("/bomb"), { vet, maxBytes: 64 * 1024 });
    expect(r).toMatchObject({ kind: "ok", truncated: true, bytes: 64 * 1024 });
  });

  it("classifies errors, unreadable content and timeouts", async () => {
    expect(await safeFetch(at("/down"), { vet })).toMatchObject({ kind: "http_error", status: 503 });
    expect(await safeFetch(at("/image"), { vet })).toMatchObject({ kind: "unreadable", contentType: "image/png" });
    expect(await safeFetch(at("/slow"), { vet, timeoutMs: 200 })).toMatchObject({ kind: "network_error", detail: "Timed out after 200 ms" });
  });

  it("with the default policy, refuses loopback before opening a connection", async () => {
    const before = hits.length;
    const r = await safeFetch(`http://127.0.0.1:${port}/`);
    expect(r.kind).toBe("blocked");
    expect(hits.length).toBe(before);
  });
});
