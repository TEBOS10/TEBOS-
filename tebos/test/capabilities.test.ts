import { describe, expect, it } from "vitest";
import { connectionLabel, routeCapability, type ConnectionInstance, type RoutingRegistry } from "../src";

const now = new Date("2026-09-24T12:00:00Z");
const fresh = "2026-09-24T11:00:00Z";

const registry: RoutingRegistry = {
  connectors: [
    { key: "resend", provider: "Resend", authMethod: "api_key", executionMethod: "api" },
    { key: "gmail", provider: "Gmail", authMethod: "oauth2", executionMethod: "mcp" },
    { key: "browser-mail", provider: "Webmail (browser)", authMethod: "basic", executionMethod: "browser" },
  ],
  connectorCapabilities: [
    { connectorKey: "browser-mail", capabilityKey: "email.send_transactional", operation: "write", riskTier: 2, requiredScopes: [] },
    { connectorKey: "gmail", capabilityKey: "email.send_transactional", operation: "write", riskTier: 2, requiredScopes: ["gmail.send"] },
    { connectorKey: "resend", capabilityKey: "email.send_transactional", operation: "write", riskTier: 2, requiredScopes: [] },
  ],
};

const conn = (over: Partial<ConnectionInstance>): ConnectionInstance => ({
  id: "c",
  connectorKey: "resend",
  businessId: null,
  status: "connected",
  grantedScopes: [],
  lastVerifiedAt: fresh,
  ...over,
});

describe("capability routing", () => {
  it("selects by capability and prefers structured technology over browser automation", () => {
    const route = routeCapability(
      "email.send_transactional",
      "write",
      registry,
      [conn({ connectorKey: "browser-mail" }), conn({ connectorKey: "resend" })],
      "b1",
      now,
    );
    expect(route.filter((c) => c.availability.usable).map((c) => c.connector.key)).toEqual(["resend", "browser-mail"]);
  });

  it("never treats a known-but-unconnected provider as usable", () => {
    const route = routeCapability("email.send_transactional", "write", registry, [], "b1", now);
    expect(route.every((c) => !c.availability.usable)).toBe(true);
    expect(route.find((c) => c.connector.key === "resend")?.availability).toMatchObject({ reason: "not_connected" });
  });

  it("reports unverified, unhealthy and under-scoped connections honestly", () => {
    const route = routeCapability(
      "email.send_transactional",
      "write",
      registry,
      [
        conn({ connectorKey: "resend", lastVerifiedAt: "2026-09-01T00:00:00Z" }),
        conn({ connectorKey: "gmail", grantedScopes: ["gmail.readonly"] }),
        conn({ connectorKey: "browser-mail", status: "expired" }),
      ],
      null,
      now,
    );
    const reason = (k: string) => {
      const a = route.find((c) => c.connector.key === k)?.availability;
      return a && !a.usable ? a.reason : "usable";
    };
    expect([reason("resend"), reason("gmail"), reason("browser-mail")]).toEqual(["not_verified", "missing_scopes", "unhealthy"]);
  });

  it("prefers a business-scoped connection over an organisation-wide one", () => {
    const route = routeCapability(
      "email.send_transactional",
      "write",
      registry,
      [conn({ id: "org-wide" }), conn({ id: "biz", businessId: "b1" }), conn({ id: "other-biz", businessId: "b2" })],
      "b1",
      now,
    );
    expect(route.find((c) => c.connector.key === "resend")?.connection?.id).toBe("biz");
  });

  it("labels connections without overstating them", () => {
    expect(connectionLabel(null, now)).toBe("Available — not connected");
    expect(connectionLabel(conn({ status: "configured", lastVerifiedAt: null }), now)).toBe("Configured — not yet verified");
    expect(connectionLabel(conn({ lastVerifiedAt: "2026-09-01T00:00:00Z" }), now)).toBe("Connected — not verified recently");
    expect(connectionLabel(conn({}), now)).toBe("Connected");
  });
});
