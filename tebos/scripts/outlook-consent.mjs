#!/usr/bin/env node
// One-time grant: lets TEBOS's worker read the founder's Outlook inbox, read-only (Mail.Read).
//
//   OUTLOOK_CLIENT_ID=<the app's Application (client) ID> node scripts/outlook-consent.mjs
//
// It shows a short code and an address (microsoft.com/devicelogin). The founder opens the address on any device,
// signs in to Outlook, enters the code and approves "Read your mail". The script then writes the refresh token to
// ./outlook-refresh-token.txt (readable only by you) and prints nothing secret. Copy that file's contents into the
// worker's OUTLOOK_REFRESH_TOKEN variable on Railway, then delete the file.
//
// OUTLOOK_TENANT: "consumers" for outlook.com / hotmail.com (default), "organizations" for a work account.
import { writeFileSync } from "node:fs";

const clientId = process.env.OUTLOOK_CLIENT_ID;
const tenant = process.env.OUTLOOK_TENANT || "consumers";
if (!clientId) {
  console.error("Set OUTLOOK_CLIENT_ID to the app registration's Application (client) ID.");
  process.exit(1);
}
const scope = "offline_access https://graph.microsoft.com/Mail.Read";
const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;

const start = await fetch(`${base}/devicecode`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: clientId, scope }),
}).then((r) => r.json());
if (!start.device_code) {
  console.error(`Microsoft refused to start: ${start.error ?? "unknown error"}. Check "Allow public client flows" is on.`);
  process.exit(1);
}
console.log(`\nOpen ${start.verification_uri} and enter the code ${start.user_code}\n(it expires in ${Math.round(start.expires_in / 60)} minutes)\n`);

const deadline = Date.now() + start.expires_in * 1000;
let interval = (start.interval ?? 5) * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval));
  const t = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: start.device_code }),
  }).then((r) => r.json());
  if (t.refresh_token) {
    writeFileSync("outlook-refresh-token.txt", t.refresh_token, { mode: 0o600 });
    console.log("Granted. The refresh token is in ./outlook-refresh-token.txt: put it in OUTLOOK_REFRESH_TOKEN on the worker, then delete the file.");
    process.exit(0);
  }
  if (t.error === "slow_down") interval += 5000;
  else if (t.error !== "authorization_pending") {
    console.error(`Not granted: ${t.error}.`);
    process.exit(1);
  }
}
console.error("The code expired before it was approved. Run the script again.");
process.exit(1);
