import { describe, expect, it } from "vitest";
import { checkRedirect, checkUrl, checkUrlShape, isPublicAddress, type Resolver } from "../src";

const dns =
  (table: Record<string, string[]>): Resolver =>
  async (host) => {
    const addrs = table[host];
    if (!addrs) throw new Error("ENOTFOUND");
    return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

describe("address classification", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1", "2001:db8::1", "ff02::1",
  ])("blocks non-public %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

describe("URL shape", () => {
  it.each([
    ["file:///etc/passwd", "scheme_not_allowed"],
    ["gopher://example.com/", "scheme_not_allowed"],
    ["javascript:alert(1)", "scheme_not_allowed"],
    ["https://user:pass@example.com/", "credentials_in_url"],
    ["https://example.com:6379/", "port_not_allowed"],
    ["http://localhost/", "host_not_allowed"],
    ["http://printer.local/", "host_not_allowed"],
    ["http://intranet/", "host_not_allowed"],
    ["http://127.0.0.1/", "private_address"],
    ["http://2130706433/", "private_address"], // decimal 127.0.0.1
    ["http://0x7f.0.0.1/", "private_address"],
    ["http://[::ffff:169.254.169.254]/", "private_address"],
    ["not a url", "invalid_url"],
  ])("rejects %s", (url, reason) => {
    expect(checkUrlShape(url)).toMatchObject({ safe: false, reason });
  });

  it("accepts an ordinary public website", () => {
    expect(checkUrlShape("https://mmupiandclay.co.za/")).toMatchObject({ safe: true });
  });
});

describe("resolution", () => {
  it("rejects hosts that resolve to private addresses (including mixed answers)", async () => {
    const r = dns({ "evil.example": ["93.184.216.34", "10.0.0.5"] });
    expect(await checkUrl("https://evil.example/", r)).toMatchObject({ safe: false, reason: "private_address" });
  });

  it("returns the vetted addresses to connect to", async () => {
    const r = dns({ "example.com": ["93.184.216.34"] });
    expect(await checkUrl("https://example.com/", r)).toMatchObject({ safe: true, addresses: ["93.184.216.34"] });
  });

  it("reports DNS failure as its own reason, not as 'site does not exist'", async () => {
    expect(await checkUrl("https://nope.example/", dns({}))).toMatchObject({ safe: false, reason: "dns_failure" });
  });

  it("re-checks every redirect hop and caps the chain", async () => {
    const r = dns({ "example.com": ["93.184.216.34"], "internal.example": ["192.168.0.10"] });
    const from = new URL("https://example.com/start");
    expect(await checkRedirect(from, "/next", 1, r)).toMatchObject({ safe: true });
    expect(await checkRedirect(from, "https://internal.example/admin", 1, r)).toMatchObject({ safe: false, reason: "private_address" });
    expect(await checkRedirect(from, "http://169.254.169.254/latest/meta-data", 1, r)).toMatchObject({ safe: false });
    expect(await checkRedirect(from, "/next", 6, r)).toMatchObject({ safe: false, reason: "too_many_redirects" });
  });
});
