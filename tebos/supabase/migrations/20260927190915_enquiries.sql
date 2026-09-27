-- Enquiries from the public pricing page: a business asking to start a plan
-- or to apply for an equity partnership.
--
-- Anyone may submit one (signed in or not); nobody can read them through the
-- API. They are read by TEBOS staff in the database (service role). A
-- submission cannot choose its own status, and every field is bounded.

create table public.enquiries (
  id         uuid primary key default gen_random_uuid(),
  plan       text not null check (plan in ('starter', 'growth', 'equity')),
  name       text not null check (length(btrim(name)) between 1 and 120),
  business   text not null check (length(btrim(business)) between 1 and 160),
  email      text not null check (length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone      text check (phone is null or length(phone) <= 40),
  website    text check (website is null or length(website) <= 300),
  message    text check (message is null or length(message) <= 2000),
  status     text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.enquiries enable row level security;
revoke all on public.enquiries from anon, authenticated;
grant insert (plan, name, business, email, phone, website, message) on public.enquiries to anon, authenticated;

-- Insert only; there is deliberately no select, update or delete policy.
create policy enquiries_submit on public.enquiries for insert to anon, authenticated
  with check (status = 'new');
