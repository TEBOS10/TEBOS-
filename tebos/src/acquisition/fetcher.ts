// SSRF-safe page fetcher for public acquisition (dossier §24).
//
// Every URL — the first one and every redirect hop — is vetted by the URL
// safety module before a socket is opened, and the connection is pinned to
// the vetted address through a custom `lookup`, so the host name is never
// re-resolved between the check and the connect (no DNS rebinding).
// Responses are size-capped after decompression (no zip bombs), time-boxed,
// and restricted to text content TEBOS can actually read.

import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { checkRedirect, checkUrl, DEFAULT_URL_POLICY, systemResolver, type UrlCheck, type UrlPolicy } from "../security/url-safety";

export const USER_AGENT = "TEBOS-Acquisition/0.1 (+evidence-before-assertion)";

const READABLE_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export type FetchOutcome =
  | {
      kind: "ok";
      requestedUrl: string;
      finalUrl: string;
      status: number;
      contentType: string;
      body: string;
      bytes: number;
      truncated: boolean;
      contentHash: string;
      redirects: string[];
    }
  | { kind: "blocked"; requestedUrl: string; finalUrl: string; reason: string; detail: string }
  | {
      kind: "http_error";
      requestedUrl: string;
      finalUrl: string;
      status: number;
      detail: string;
    }
  | { kind: "unreadable"; requestedUrl: string; finalUrl: string; status: number; contentType: string; detail: string }
  | { kind: "network_error"; requestedUrl: string; finalUrl: string; detail: string };

/** Vets a URL before any connection. hop 0 = the requested URL, hop n = the nth redirect. */
export type Vetter = (url: string, hop: number, from: URL | null) => Promise<UrlCheck>;

export interface FetchOptions {
  vet?: Vetter;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
}

export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchOutcome>;

export function defaultVetter(policy: UrlPolicy = DEFAULT_URL_POLICY): Vetter {
  return (url, hop, from) =>
    hop === 0 || !from ? checkUrl(url, systemResolver, policy) : checkRedirect(from, url, hop, systemResolver, policy);
}

/** A lookup that only ever answers with the pre-vetted addresses. */
function pinnedLookup(addresses: string[]): LookupFunction {
  const entries = addresses.map((address) => ({ address, family: isIP(address) === 6 ? 6 : 4 }));
  return ((_hostname: string, options: { all?: boolean } | number, callback: (...args: unknown[]) => void) => {
    const cb = typeof options === "function" ? (options as unknown as (...args: unknown[]) => void) : callback;
    const all = typeof options === "object" && options?.all;
    if (all) cb(null, entries);
    else cb(null, entries[0]!.address, entries[0]!.family);
  }) as unknown as LookupFunction;
}

function decoderFor(contentType: string): TextDecoder {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  try {
    return new TextDecoder(charset || "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  stream: Readable;
  abort: () => void;
}

function request(url: URL, addresses: string[], accept: string, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        signal,
        lookup: pinnedLookup(addresses),
        headers: {
          "user-agent": USER_AGENT,
          accept,
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, stream: res, abort: () => req.destroy() }),
    );
    req.on("error", reject);
    req.end();
  });
}

async function readCapped(res: RawResponse, maxBytes: number): Promise<{ buffer: Buffer; bytes: number; truncated: boolean }> {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  let stream: Readable = res.stream;
  if (encoding === "gzip" || encoding === "x-gzip") stream = res.stream.pipe(createGunzip());
  else if (encoding === "deflate") stream = res.stream.pipe(createInflate());
  else if (encoding === "br") stream = res.stream.pipe(createBrotliDecompress());

  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  for await (const chunk of stream) {
    const buf = chunk as Buffer;
    if (bytes + buf.length > maxBytes) {
      chunks.push(buf.subarray(0, maxBytes - bytes));
      bytes = maxBytes;
      truncated = true;
      res.abort();
      break;
    }
    chunks.push(buf);
    bytes += buf.length;
  }
  return { buffer: Buffer.concat(chunks), bytes, truncated };
}

export const safeFetch: Fetcher = async (requestedUrl, options = {}) => {
  const vet = options.vet ?? defaultVetter();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? DEFAULT_URL_POLICY.maxRedirects;
  const accept = options.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.8";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const redirects: string[] = [];
  let current = requestedUrl;
  let from: URL | null = null;

  try {
    for (let hop = 0; ; hop++) {
      if (hop > maxRedirects) {
        return { kind: "blocked", requestedUrl, finalUrl: current, reason: "too_many_redirects", detail: `More than ${maxRedirects} redirects` };
      }
      const check = await vet(current, hop, from);
      if (!check.safe) return { kind: "blocked", requestedUrl, finalUrl: current, reason: check.reason, detail: check.detail };

      const url = check.url;
      const res = await request(url, check.addresses, accept, controller.signal);

      if (REDIRECT_CODES.has(res.status) && res.headers.location) {
        res.abort();
        from = url;
        current = new URL(String(res.headers.location), url).toString();
        redirects.push(current);
        continue;
      }

      const finalUrl = url.toString();
      if (res.status < 200 || res.status >= 300) {
        res.abort();
        return { kind: "http_error", requestedUrl, finalUrl, status: res.status, detail: `HTTP ${res.status}` };
      }

      const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
      if (!READABLE_TYPES.some((t) => contentType.startsWith(t))) {
        res.abort();
        return {
          kind: "unreadable",
          requestedUrl,
          finalUrl,
          status: res.status,
          contentType,
          detail: `Content type ${contentType || "(none)"} is not readable text`,
        };
      }

      const { buffer, bytes, truncated } = await readCapped(res, maxBytes);
      return {
        kind: "ok",
        requestedUrl,
        finalUrl,
        status: res.status,
        contentType,
        body: decoderFor(contentType).decode(buffer),
        bytes,
        truncated,
        contentHash: createHash("sha256").update(buffer).digest("hex"),
        redirects,
      };
    }
  } catch (err) {
    const detail = controller.signal.aborted ? `Timed out after ${timeoutMs} ms` : (err as Error).message;
    return { kind: "network_error", requestedUrl, finalUrl: current, detail };
  } finally {
    clearTimeout(timer);
  }
};
