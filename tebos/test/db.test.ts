import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/db";

describe("database connection settings", () => {
  const url = "postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require";

  it("uses the connection string as-is when no CA is configured", () => {
    expect(poolConfig(url, undefined)).toEqual({ connectionString: url, max: 4 });
  });

  it("verifies the server against the configured CA, overriding any sslmode in the URL", () => {
    const cfg = poolConfig(url, "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----");
    expect(cfg.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----", rejectUnauthorized: true });
    expect(cfg.connectionString).toBe("postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres");
  });
});
