// Capability routing (dossier §18/§19/§20/§41).
//
// Business logic asks "which capability is required?". The router answers
// with the tenant's connections that can provide it, each with an honest
// reason when it cannot be used. It never reports a provider as usable
// unless the tenant's connection is verified and holds the required scopes.

import type { RiskTier } from "./risk";
import type { ConnectionStatus } from "./states";

export interface Capability {
  key: string;
  name: string;
  defaultRiskTier: RiskTier;
}

export type ExecutionTechnology = "api" | "mcp" | "automation" | "browser" | "internal";

export interface ConnectorDescriptor {
  key: string;
  provider: string;
  authMethod: "none" | "api_key" | "oauth2" | "basic" | "service_account" | "mcp";
  executionMethod: ExecutionTechnology;
}

export interface ConnectorCapability {
  connectorKey: string;
  capabilityKey: string;
  operation: "read" | "write";
  riskTier: RiskTier;
  requiredScopes: readonly string[];
}

export interface ConnectionInstance {
  id: string;
  connectorKey: string;
  businessId: string | null;
  status: ConnectionStatus;
  grantedScopes: readonly string[];
  lastVerifiedAt: string | null;
}

/** How stale a verification may be before a "connected" instance is treated as unverified. */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Structured APIs first, browser automation last (dossier §20): browser
 * automation is only chosen when nothing more structured is available.
 */
export const TECHNOLOGY_PREFERENCE: readonly ExecutionTechnology[] = ["internal", "api", "mcp", "automation", "browser"];

export type ProviderAvailability =
  | { usable: true }
  | {
      usable: false;
      reason: "not_connected" | "not_verified" | "missing_scopes" | "unhealthy";
      detail: string;
    };

export interface ProviderCandidate {
  connector: ConnectorDescriptor;
  mapping: ConnectorCapability;
  connection: ConnectionInstance | null;
  availability: ProviderAvailability;
}

export interface RoutingRegistry {
  connectors: readonly ConnectorDescriptor[];
  connectorCapabilities: readonly ConnectorCapability[];
}

export function assessConnection(
  connector: ConnectorDescriptor,
  mapping: ConnectorCapability,
  connection: ConnectionInstance | null,
  now: Date = new Date(),
): ProviderAvailability {
  if (connector.executionMethod === "internal" && connector.authMethod === "none") return { usable: true };
  if (!connection) {
    return { usable: false, reason: "not_connected", detail: `TEBOS supports ${connector.provider}, but it is not connected` };
  }
  if (connection.status !== "connected") {
    return { usable: false, reason: "unhealthy", detail: `${connector.provider} connection is ${connection.status}` };
  }
  if (!connection.lastVerifiedAt || now.getTime() - new Date(connection.lastVerifiedAt).getTime() > VERIFICATION_TTL_MS) {
    return { usable: false, reason: "not_verified", detail: `${connector.provider} has not been verified recently` };
  }
  const missing = mapping.requiredScopes.filter((s) => !connection.grantedScopes.includes(s));
  if (missing.length > 0) {
    return { usable: false, reason: "missing_scopes", detail: `Missing permission scopes: ${missing.join(", ")}` };
  }
  return { usable: true };
}

/**
 * All providers that could deliver a capability for a business, usable ones
 * first (by technology preference), each with an honest availability.
 * A business-scoped connection wins over an organisation-wide one.
 */
export function routeCapability(
  capabilityKey: string,
  operation: "read" | "write",
  registry: RoutingRegistry,
  connections: readonly ConnectionInstance[],
  businessId: string | null,
  now: Date = new Date(),
): ProviderCandidate[] {
  const candidates: ProviderCandidate[] = [];
  for (const mapping of registry.connectorCapabilities) {
    if (mapping.capabilityKey !== capabilityKey || mapping.operation !== operation) continue;
    const connector = registry.connectors.find((c) => c.key === mapping.connectorKey);
    if (!connector) continue;
    const relevant = connections.filter(
      (c) => c.connectorKey === connector.key && (c.businessId === null || c.businessId === businessId),
    );
    const connection =
      relevant.find((c) => c.businessId === businessId && businessId !== null) ?? relevant.find((c) => c.businessId === null) ?? null;
    candidates.push({ connector, mapping, connection, availability: assessConnection(connector, mapping, connection, now) });
  }
  const rank = (c: ProviderCandidate) =>
    (c.availability.usable ? 0 : 100) + TECHNOLOGY_PREFERENCE.indexOf(c.connector.executionMethod);
  return candidates.sort((a, b) => rank(a) - rank(b));
}

/** The label the interface shows. "Connected" only when it really is. */
export function connectionLabel(connection: ConnectionInstance | null, now: Date = new Date()): string {
  if (!connection) return "Available — not connected";
  if (connection.status === "connected") {
    const fresh =
      connection.lastVerifiedAt && now.getTime() - new Date(connection.lastVerifiedAt).getTime() <= VERIFICATION_TTL_MS;
    return fresh ? "Connected" : "Connected — not verified recently";
  }
  const labels: Record<Exclude<ConnectionStatus, "connected">, string> = {
    configured: "Configured — not yet verified",
    authentication_required: "Action required — authentication needed",
    degraded: "Degraded",
    expired: "Expired",
    unavailable: "Unavailable",
    disabled: "Disabled",
  };
  return labels[connection.status];
}
