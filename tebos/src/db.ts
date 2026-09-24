// Database connection settings for TEBOS server processes.
import type pg from "pg";

// Supabase signs its database certificates with its own CA. Set
// TEBOS_DATABASE_CA to that CA (PEM, from the Supabase dashboard) to verify the
// server properly. Its ssl settings take precedence over any sslmode in the URL.
export function poolConfig(connectionString: string, caPem: string | undefined = process.env.TEBOS_DATABASE_CA): pg.PoolConfig {
  // env vars often carry PEMs with escaped "\\n" newlines
  const ca = caPem?.replace(/\\n/g, "\n");
  if (!ca) return { connectionString, max: 4 };
  const u = new URL(connectionString);
  for (const p of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) u.searchParams.delete(p);
  return { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true }, max: 4 };
}

