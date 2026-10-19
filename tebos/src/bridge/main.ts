// The Model Bridge service (its own Railway service, separate from the worker):
//
//   TEBOS_BRIDGE_DATABASE_URL=postgres://tebos_bridge:…@…/postgres PORT=8080 npx tsx src/bridge/main.ts
//
// TEBOS_BRIDGE_DATABASE_URL is the tebos_bridge login (session pooler), which can
// only execute the tebos_bridge functions. Never give this service the worker's
// TEBOS_DATABASE_URL. TEBOS_DATABASE_CA (optional, recommended) verifies the
// database's TLS certificate. TEBOS_BRIDGE_ALLOWED_ORIGINS (optional, comma
// separated) lists browser origins allowed to call; AI clients send none.
import pg from "pg";
import { poolConfig } from "../db";
import { PgBridgeDb } from "./pg-db";
import { createBridgeServer } from "./server";

const url = process.env.TEBOS_BRIDGE_DATABASE_URL;
if (!url) {
  console.error("TEBOS_BRIDGE_DATABASE_URL is not set");
  process.exit(1);
}
if (/\/\/(postgres|tebos_worker)[.:@]/.test(url)) {
  console.error("TEBOS_BRIDGE_DATABASE_URL must be the tebos_bridge login, not a privileged one");
  process.exit(1);
}

const log = (e: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...e }));
const pool = new pg.Pool(poolConfig(url));
const server = createBridgeServer({
  db: new PgBridgeDb(pool),
  allowedOrigins: (process.env.TEBOS_BRIDGE_ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  log,
});
const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => log({ event: "bridge.listening", port }));

const stop = () => {
  server.close(() => void pool.end().then(() => process.exit(0)));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
