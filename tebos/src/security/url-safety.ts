// SSRF-safe URL acquisition policy (dossier §24).
//
// "Public reading is automatic" is only safe if TEBOS can prove the target
// is public. Every URL — the one a user submits and every redirect hop — is
// checked for scheme, credentials, port and host, and every address its host
// resolves to must be publicly routable. The fetcher must then connect to
// the returned, already-vetted address (not re-resolve the name), which
// closes the DNS-rebinding gap.

import { isIP } from "node:net";

export type UnsafeReason =
  | "invalid_url"
  | "scheme_not_allowed"
  | "credentials_in_url"
  | "port_not_allowed"
  | "host_not_allowed"
  | "private_address"
  | "dns_failure"
  | "too_many_redirects";

export type UrlCheck =
  | { safe: true; url: URL; addresses: string[] }
  | { safe: false; reason: UnsafeReason; detail: string };

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface UrlPolicy {
  allowedPorts: ReadonlySet<number>;
  maxRedirects: number;
}

export const DEFAULT_URL_POLICY: UrlPolicy = {
  allowedPorts: new Set([80, 443]),
  maxRedirects: 5,
};

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

// [network, prefix length]
const BLOCKED_V4: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inV4Range(ip: string, [net, bits]: [string, number]): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(net) & mask);
}

/** Expand an IPv6 address (optionally with a trailing dotted IPv4) to 8 hextets. */
function v6ToHextets(ip: string): number[] {
  let addr = ip.toLowerCase().split("%")[0] ?? "";
  const tail = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail?.[1]) {
    const n = v4ToInt(tail[1]);
    addr = addr.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = addr.split("::");
  const h = head ? head.split(":") : [];
  const r = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const fill = addr.includes("::") ? new Array(8 - h.length - r.length).fill("0") : [];
  return [...h, ...fill, ...r].map((x) => parseInt(x, 16));
}

function hextetsToV4(a: number, b: number): string {
  return [a >> 8, a & 0xff, b >> 8, b & 0xff].join(".");
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !BLOCKED_V4.some((range) => inV4Range(ip, range));
  if (family !== 6) return false;

  const x = v6ToHextets(ip);
  if (x.length !== 8 || x.some((n) => Number.isNaN(n))) return false;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = x;

  if (x.every((n) => n === 0)) return false; // ::
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1) return false; // ::1
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) {
    return isPublicAddress(hextetsToV4(g, h)); // IPv4-mapped / IPv4-compatible
  }
  if (a === 0x64 && b === 0xff9b) return isPublicAddress(hextetsToV4(g, h)); // NAT64
  if (a === 0x2002) return isPublicAddress(hextetsToV4(b, c)); // 6to4
  if ((a & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((a & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((a & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((a & 0xff00) === 0xff00) return false; // multicast
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return false; // discard-only
  return true;
}

/** Synchronous checks that need no network: scheme, credentials, port, host shape, IP literals. */
export function checkUrlShape(input: string | URL, policy: UrlPolicy = DEFAULT_URL_POLICY): UrlCheck {
  let url: URL;
  try {
    url = new URL(String(input));
  } catch {
    return { safe: false, reason: "invalid_url", detail: "Not a valid absolute URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { safe: false, reason: "scheme_not_allowed", detail: `Scheme ${url.protocol} is not allowed` };
  }
  if (url.username || url.password) {
    return { safe: false, reason: "credentials_in_url", detail: "URLs may not carry credentials" };
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!policy.allowedPorts.has(port)) {
    return { safe: false, reason: "port_not_allowed", detail: `Port ${port} is not allowed` };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(host)) {
    return isPublicAddress(host)
      ? { safe: true, url, addresses: [host] }
      : { safe: false, reason: "private_address", detail: `${host} is not a public address` };
  }
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".")) {
    return { safe: false, reason: "host_not_allowed", detail: `${host} is not a public host name` };
  }
  return { safe: true, url, addresses: [] };
}

/** Full check: shape, then every resolved address must be public. */
export async function checkUrl(input: string | URL, resolve: Resolver, policy: UrlPolicy = DEFAULT_URL_POLICY): Promise<UrlCheck> {
  const shape = checkUrlShape(input, policy);
  if (!shape.safe || shape.addresses.length > 0) return shape;

  let resolved: ResolvedAddress[];
  try {
    resolved = await resolve(shape.url.hostname);
  } catch (err) {
    return { safe: false, reason: "dns_failure", detail: `Could not resolve ${shape.url.hostname}: ${(err as Error).message}` };
  }
  if (resolved.length === 0) {
    return { safe: false, reason: "dns_failure", detail: `${shape.url.hostname} did not resolve` };
  }
  const bad = resolved.find((r) => !isPublicAddress(r.address));
  if (bad) {
    return { safe: false, reason: "private_address", detail: `${shape.url.hostname} resolves to non-public ${bad.address}` };
  }
  return { safe: true, url: shape.url, addresses: resolved.map((r) => r.address) };
}

/**
 * Validate a redirect hop. Relative Location headers resolve against the
 * current URL; the resulting target gets the full check again.
 */
export async function checkRedirect(
  current: URL,
  location: string,
  hop: number,
  resolve: Resolver,
  policy: UrlPolicy = DEFAULT_URL_POLICY,
): Promise<UrlCheck> {
  if (hop > policy.maxRedirects) {
    return { safe: false, reason: "too_many_redirects", detail: `More than ${policy.maxRedirects} redirects` };
  }
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return { safe: false, reason: "invalid_url", detail: "Redirect location is not a valid URL" };
  }
  return checkUrl(next, resolve, policy);
}

/** Resolver backed by the system DNS, returning every address. */
export const systemResolver: Resolver = async (hostname) => {
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};
