-- The waiting list, and an operating system that starts by itself.
--
-- Anyone can join the waiting list from the public site, naming their kind of
-- business. A person at TEBOS accepts them (the pipeline's existing decision),
-- and from there everything runs without being told: payment, the agreement,
-- the account, and, new here, their business on TEBOS with the blueprint for
-- their kind of business laid onto its board as proposals on day 1.

alter table public.enquiries
  add column kind text not null default 'enquiry' check (kind in ('enquiry', 'waitlist')),
  add column industry text check (industry is null or industry ~ '^[a-z0-9-]{1,48}$');
grant insert (kind, industry) on public.enquiries to anon, authenticated;

alter table public.opportunities
  add column from_waitlist boolean not null default false,
  add column industry text check (industry is null or industry ~ '^[a-z0-9-]{1,48}$'),
  -- the client's business on TEBOS, created at onboarding
  add column business_id uuid references public.businesses (id);

-- The worker lays the blueprint down at onboarding (apply_blueprint runs as its caller).
grant execute on function public.apply_blueprint(uuid, jsonb) to service_role;
