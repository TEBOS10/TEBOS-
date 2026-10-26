// The Outlook mailbox as a REEDS source (founder's choice, 26 Oct 2026): read-only, through Microsoft Graph, with a
// refresh token the founder grants once (scripts/outlook-consent.mjs). Each new inbox message becomes one source
// event: its own message ID, its Outlook link, when it arrived, the sender's display name and the subject. Never the
// body and never the sender's address: TEPOS keeps a short pointer to the message, not a copy of the mailbox.
//
// It files messages as untriaged; nothing becomes a task until the founder (or a later, tested extraction step)
// says what the message asks for.
//
// Needs, on the worker: OUTLOOK_CLIENT_ID, OUTLOOK_REFRESH_TOKEN, REEDS_ORG_ID, and optionally OUTLOOK_TENANT
// ("consumers" for an outlook.com/hotmail address, the default; "organizations" or a tenant ID for a work account).
// Without them the source stays "not connected" and this never runs.

import type { SourceAdapter, SourceItem } from "./sync";

export interface OutlookConfig {
  clientId: string;
  refreshToken: string;
  tenant: string;
}

type Fetch = typeof fetch;

export function outlookConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OutlookConfig | null {
  const clientId = env.OUTLOOK_CLIENT_ID?.trim();
  const refreshToken = env.OUTLOOK_REFRESH_TOKEN?.trim();
  if (!clientId || !refreshToken) return null;
  return { clientId, refreshToken, tenant: env.OUTLOOK_TENANT?.trim() || "consumers" };
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string | null;
  receivedDateTime: string;
  webLink?: string;
  from?: { emailAddress?: { name?: string } };
}

/** Graph's subject, cut to a summary; an empty subject says so rather than inventing one. */
export function summarise(m: Pick<GraphMessage, "subject">): string {
  const s = (m.subject ?? "").replace(/\s+/g, " ").trim();
  return (s || "(no subject)").slice(0, 300);
}

export class OutlookAdapter implements SourceAdapter {
  readonly type = "email" as const;

  constructor(private readonly config: OutlookConfig, private readonly http: Fetch = fetch, private readonly pageSize = 25) {}

  private async accessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: "refresh_token",
      refresh_token: this.config.refreshToken,
      scope: "offline_access https://graph.microsoft.com/Mail.Read",
    });
    const res = await this.http(`https://login.microsoftonline.com/${encodeURIComponent(this.config.tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
    if (!res.ok || !json.access_token) {
      // the error code only: Microsoft's descriptions can echo request details
      throw new Error(`Outlook sign-in failed (${res.status}${json.error ? `, ${json.error}` : ""}); grant access again with scripts/outlook-consent.mjs`);
    }
    return json.access_token;
  }

  /** Inbox messages received after the cursor (an ISO time), oldest first, one page at a time. */
  async fetchSince(cursor: string | null): Promise<{ items: SourceItem[]; cursor: string | null }> {
    const token = await this.accessToken();
    const since = cursor ?? new Date(Date.now() - 2 * 864e5).toISOString(); // first run: the last two days only
    const q = new URLSearchParams({
      $select: "id,internetMessageId,subject,receivedDateTime,webLink,from",
      $filter: `receivedDateTime gt ${since}`,
      $orderby: "receivedDateTime asc",
      $top: String(this.pageSize),
    });
    const res = await this.http(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${q.toString()}`, {
      headers: { authorization: `Bearer ${token}`, prefer: 'outlook.body-content-type="text"' },
    });
    if (!res.ok) throw new Error(`Outlook read failed (${res.status})`);
    const json = (await res.json()) as { value?: GraphMessage[] };
    const messages = json.value ?? [];
    const items: SourceItem[] = messages.map((m) => ({
      sourceRef: (m.internetMessageId || m.id).slice(0, 300),
      sourceLink: m.webLink?.startsWith("https://") ? m.webLink.slice(0, 500) : null,
      receivedAt: m.receivedDateTime,
      sender: m.from?.emailAddress?.name?.slice(0, 120) || null,
      summary: summarise(m),
      triage: "untriaged",
      workspace: "personal",
      items: [],
    }));
    return { items, cursor: messages.length ? messages[messages.length - 1]!.receivedDateTime : cursor };
  }
}
