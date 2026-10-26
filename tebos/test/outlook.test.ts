import { describe, expect, it } from "vitest";
import { OutlookAdapter, outlookConfigFromEnv, summarise } from "../src/sources/outlook";

const config = { clientId: "client", refreshToken: "refresh", tenant: "consumers" };

function fakeGraph(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const http = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { http, calls };
}

describe("the Outlook source", () => {
  it("is off unless its client ID and refresh token are set", () => {
    expect(outlookConfigFromEnv({})).toBeNull();
    expect(outlookConfigFromEnv({ OUTLOOK_CLIENT_ID: "c" })).toBeNull();
    expect(outlookConfigFromEnv({ OUTLOOK_CLIENT_ID: "c", OUTLOOK_REFRESH_TOKEN: "r" })).toEqual({ clientId: "c", refreshToken: "r", tenant: "consumers" });
  });

  it("reads new inbox messages as pointers: ID, link, time, sender's name and subject; never the body or address", async () => {
    const { http, calls } = fakeGraph([
      { status: 200, body: { access_token: "tok" } },
      { status: 200, body: { value: [
        { id: "AAA", internetMessageId: "<m1@mail>", subject: "  FICA   checklist for Linden ", receivedDateTime: "2026-10-26T08:00:00Z", webLink: "https://outlook.live.com/owa/?ItemID=AAA",
          from: { emailAddress: { name: "Principal", address: "principal@agency.test" } }, body: { content: "private body" } },
        { id: "BBB", subject: null, receivedDateTime: "2026-10-26T09:00:00Z", webLink: "javascript:alert(1)" },
      ] } },
    ]);
    const r = await new OutlookAdapter(config, http).fetchSince("2026-10-26T07:00:00Z");
    expect(r.cursor).toBe("2026-10-26T09:00:00Z");
    expect(r.items[0]).toEqual({ sourceRef: "<m1@mail>", sourceLink: "https://outlook.live.com/owa/?ItemID=AAA", receivedAt: "2026-10-26T08:00:00Z",
      sender: "Principal", summary: "FICA checklist for Linden", triage: "untriaged", workspace: "personal", items: [] });
    expect(r.items[1]).toMatchObject({ sourceRef: "BBB", sourceLink: null, summary: "(no subject)", sender: null });
    expect(JSON.stringify(r.items)).not.toContain("principal@agency.test");
    expect(JSON.stringify(r.items)).not.toContain("private body");
    // read-only, filtered from the cursor, asking only for the fields it keeps
    expect(String(calls[0]!.init!.body)).toContain("Mail.Read");
    expect(calls[1]!.url).toContain("receivedDateTime+gt+2026-10-26T07%3A00%3A00Z");
    expect(calls[1]!.url).not.toContain("body");
  });

  it("a refused sign-in fails loudly, without echoing Microsoft's description", async () => {
    const { http } = fakeGraph([{ status: 400, body: { error: "invalid_grant", error_description: "AADSTS70000: details with ids" } }]);
    await expect(new OutlookAdapter(config, http).fetchSince(null)).rejects.toThrow("Outlook sign-in failed (400, invalid_grant)");
    await expect(new OutlookAdapter(config, fakeGraph([{ status: 400, body: { error: "invalid_grant", error_description: "AADSTS70000" } }]).http).fetchSince(null)).rejects.not.toThrow("AADSTS");
  });

  it("an empty subject says so", () => {
    expect(summarise({ subject: "" })).toBe("(no subject)");
  });
});
