-- Email alerts for new enquiries. TEBOS's worker emails each new enquiry to
-- the team once, and records the outcome here. Only the server writes these
-- columns: the public insert grant covers the enquiry's own fields only.

alter table public.enquiries
  add column notified_at       timestamptz,
  add column notify_attempts   int not null default 0 check (notify_attempts >= 0),
  add column notify_last_try   timestamptz,
  add column notify_reference  text,
  add column notify_error      text check (notify_error is null or length(notify_error) <= 1000),
  add constraint enquiries_notified_has_reference check (notified_at is null or notify_reference is not null);

create index enquiries_to_notify_idx on public.enquiries (created_at) where notified_at is null;
