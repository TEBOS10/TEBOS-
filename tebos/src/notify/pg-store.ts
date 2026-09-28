// Postgres side of enquiry alerts. The claim counts the attempt in the same
// statement, so two workers never alert for the same enquiry at once and a
// crash mid-send simply leaves the enquiry due for a retry.

import pg from "pg";
import { MAX_ALERT_ATTEMPTS, type Enquiry, type EnquiryStore } from "./enquiries";

/** Minimum wait between attempts for the same enquiry. */
const RETRY_AFTER = "5 minutes";

export class PgEnquiryStore implements EnquiryStore {
  constructor(private readonly pool: pg.Pool) {}

  async claimNext(): Promise<Enquiry | null> {
    const { rows } = await this.pool.query(
      `with next as (
         select id from public.enquiries
          where notified_at is null and notify_attempts < $1
            and coalesce(notify_last_try, '-infinity') < now() - interval '${RETRY_AFTER}'
          order by created_at
          for update skip locked
          limit 1
       )
       update public.enquiries e set notify_attempts = e.notify_attempts + 1, notify_last_try = now()
         from next where e.id = next.id
       returning e.id, e.plan, e.name, e.business, e.email, e.phone, e.website, e.message, e.created_at, e.notify_attempts`,
      [MAX_ALERT_ATTEMPTS],
    );
    const r = rows[0];
    return r
      ? { id: r.id, plan: r.plan, name: r.name, business: r.business, email: r.email, phone: r.phone, website: r.website, message: r.message,
          createdAt: new Date(r.created_at).toISOString(), attempts: r.notify_attempts }
      : null;
  }

  async markSent(id: string, reference: string): Promise<void> {
    await this.pool.query(
      "update public.enquiries set notified_at = now(), notify_reference = $2, notify_error = null where id = $1 and notified_at is null",
      [id, reference],
    );
  }

  async markFailed(id: string, detail: string): Promise<void> {
    await this.pool.query("update public.enquiries set notify_error = $2 where id = $1", [id, detail.slice(0, 1000)]);
  }
}
