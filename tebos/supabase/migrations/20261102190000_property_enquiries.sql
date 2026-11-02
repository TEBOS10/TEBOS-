-- Property enquiries (founder, 2 Nov 2026: Tidy Enterprise stage 3, "an enquiry form with consent"; ADR 0022). A
-- property owner, or someone acting for one, tells a property business about a property problem from its public
-- website. Tidy Enterprise is the first; any organisation can switch it on. Additive only.
--
-- The rules (mirrored in src/domain/propertyEnquiry.ts):
--   * The public submits only through public.property_enquiry, and only to an organisation that has switched
--     enquiries on. It is throttled, and one email address can't have more than two new enquiries waiting.
--   * Consent is required: the person agrees that their details are used to reply about this enquiry. When they
--     agreed is stored with it.
--   * An enquiry names the situation (one of the problems the business works on), how the person is connected to the
--     property, roughly where it is, and what is happening in their own words. Contact details go in their own fields;
--     the description must not carry ID numbers, phone numbers or email addresses.
--   * Only the organisation's admins and operators read enquiries (they hold personal details); viewers don't.
--     new -> contacted -> closed, or new -> closed. Every change says why. Only the status and its note change.
--   * An admin may delete one (a person asking for their details to be removed). The audit trail records what
--     happened to each enquiry but never the person's details or words, so a deletion leaves nothing behind.

insert into public.state_transitions (machine, from_state, to_state) values
  ('property_enquiry', '(initial)', 'new'),
  ('property_enquiry', 'new', 'contacted'),
  ('property_enquiry', 'new', 'closed'),
  ('property_enquiry', 'contacted', 'closed');

alter table tebos_private.public_submissions drop constraint public_submissions_kind_check;
alter table tebos_private.public_submissions add constraint public_submissions_kind_check
  check (kind in ('enquiry', 'self_check', 'booking', 'property_enquiry'));

-- whether an organisation takes enquiries from its public website
create table public.property_enquiry_settings (
  org_id     uuid primary key references public.organisations (id) on delete cascade,
  accepting  boolean not null default false,
  updated_at timestamptz not null default now()
);

create sequence public.property_enquiry_ref_seq;

create table public.property_enquiries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  ref          text not null unique default 'EQ-' || lpad(nextval('public.property_enquiry_ref_seq')::text, 4, '0'),
  situation    text not null check (situation in ('arrears', 'low_rental', 'underused', 'redevelopment', 'life_event',
                                                  'financing', 'landlord_ops', 'other')),
  relationship text not null check (relationship in ('owner', 'co_owner', 'family_or_executor', 'adviser', 'other')),
  area         text not null check (length(trim(area)) between 2 and 120),
  message      text not null check (length(trim(message)) between 20 and 2000),
  name         text not null check (length(trim(name)) between 1 and 120),
  email        text not null check (length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone        text check (phone is null or length(phone) <= 40),
  consent_at   timestamptz not null,
  status       text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  status_note  text check (status_note is null or length(status_note) <= 500),
  created_at   timestamptz not null default now(),
  check (not tebos_private.looks_personal(message) and not tebos_private.looks_personal(area))
);
create index property_enquiries_org_idx on public.property_enquiries (org_id, created_at desc);

-- the team changes only the status, always saying why; who sent it and what they said stay as sent
create function tebos_private.guard_property_enquiry() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.org_id, new.ref, new.situation, new.relationship, new.area, new.message, new.name, new.email, new.phone, new.consent_at, new.created_at)
       is distinct from (old.org_id, old.ref, old.situation, old.relationship, old.area, old.message, old.name, old.email, old.phone, old.consent_at, old.created_at) then
      raise exception 'an enquiry is kept as sent; only its status changes' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if new.status is distinct from old.status and length(trim(coalesce(new.status_note, ''))) < 5 then
      raise exception 'say why the enquiry moves on' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create trigger guard_property_enquiry before insert or update on public.property_enquiries
  for each row execute function tebos_private.guard_property_enquiry();
create trigger guard_status before insert or update on public.property_enquiries
  for each row execute function tebos_private.guard_status('property_enquiry');
-- the audit trail is append-only, so it records what happened to an enquiry (its reference, situation and status),
-- never who sent it or what they wrote: deleting an enquiry on request then removes the person's details everywhere
create function tebos_private.audit_property_enquiry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.property_enquiries := case when tg_op = 'DELETE' then old else new end;
  v_verb text := lower(tg_op);
  v_slim jsonb;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then v_verb := 'transition'; end if;
  v_slim := jsonb_build_object('ref', v_row.ref, 'situation', v_row.situation, 'status', v_row.status, 'status_note', v_row.status_note);
  perform tebos_private.write_audit(v_row.org_id, 'property_enquiries.' || v_verb, 'property_enquiries', v_row.id,
    case when tg_op = 'INSERT' then null else jsonb_build_object('ref', old.ref, 'situation', old.situation, 'status', old.status, 'status_note', old.status_note) end,
    case when tg_op = 'DELETE' then null else v_slim end);
  return null;
end $$;
create trigger audit after insert or update or delete on public.property_enquiries
  for each row execute function tebos_private.audit_property_enquiry();
create trigger audit after insert or update or delete on public.property_enquiry_settings
  for each row execute function tebos_private.audit_row();

-- the organisation's admins and operators read and move enquiries on; admins delete one on request; nobody inserts
-- except through public.property_enquiry
alter table public.property_enquiries enable row level security;
alter table public.property_enquiry_settings enable row level security;
revoke all on public.property_enquiries from anon, authenticated;
revoke all on public.property_enquiry_settings from anon, authenticated;
create policy team_read on public.property_enquiries for select to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy team_update on public.property_enquiries for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy admin_delete on public.property_enquiries for delete to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']));
grant select, delete on public.property_enquiries to authenticated;
grant update (status, status_note) on public.property_enquiries to authenticated;

create policy member_read on public.property_enquiry_settings for select to authenticated
  using (tebos_private.is_member(org_id));
create policy admin_insert on public.property_enquiry_settings for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin']));
create policy admin_update on public.property_enquiry_settings for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']))
  with check (tebos_private.has_role(org_id, array['org_admin']));
grant select on public.property_enquiry_settings to authenticated;
grant insert (org_id, accepting), update (accepting, updated_at) on public.property_enquiry_settings to authenticated;
grant all on public.property_enquiries, public.property_enquiry_settings to service_role;
grant usage on sequence public.property_enquiry_ref_seq to service_role;
revoke all on function tebos_private.guard_property_enquiry(), tebos_private.audit_property_enquiry() from public;

-- ---------------------------------------------------------------------------
-- Public: is the form open, and sending an enquiry
-- ---------------------------------------------------------------------------
create function public.property_enquiry_open(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.accepting from public.organisations o join public.property_enquiry_settings s on s.org_id = o.id
                    where o.slug = p_slug), false)
$$;

create function public.property_enquiry(p_slug text, p_situation text, p_relationship text, p_area text, p_message text,
  p_name text, p_email text, p_phone text, p_consent boolean)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_ref text;
begin
  select o.id into v_org from public.organisations o join public.property_enquiry_settings s on s.org_id = o.id
   where o.slug = p_slug and s.accepting;
  if v_org is null then
    raise exception 'this business isn''t taking enquiries online yet' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'agree to your details being used to reply about this enquiry' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if length(trim(coalesce(p_message, ''))) < 20 then
    raise exception 'say a little more about what is happening with the property' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if tebos_private.looks_personal(p_message) or tebos_private.looks_personal(p_area) then
    raise exception 'leave ID numbers, phone numbers and email addresses out of the description; your contact details have their own boxes'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  perform tebos_private.throttle('property_enquiry', 3, 40);
  if (select count(*) from public.property_enquiries e
       where e.org_id = v_org and e.email = lower(trim(p_email)) and e.status = 'new') >= 2 then
    raise exception 'you already have two enquiries waiting; the team will reply first' using errcode = 'P0001', hint = 'TEBOS_RATE_LIMITED';
  end if;
  insert into public.property_enquiries (org_id, situation, relationship, area, message, name, email, phone, consent_at)
  values (v_org, p_situation, p_relationship, trim(p_area), trim(p_message), trim(p_name), lower(trim(p_email)),
          nullif(trim(coalesce(p_phone, '')), ''), now())
  returning ref into v_ref;
  return v_ref;
end $$;

revoke all on function public.property_enquiry_open(text) from public;
revoke all on function public.property_enquiry(text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.property_enquiry_open(text) to anon, authenticated, service_role;
grant execute on function public.property_enquiry(text, text, text, text, text, text, text, text, boolean) to anon, authenticated, service_role;

-- Tidy Enterprise is the first to use it: its row exists, switched off, so its admins find the Enquiries page and
-- switch it on themselves when the website goes live (nothing happens where the organisation doesn't exist)
insert into public.property_enquiry_settings (org_id, accepting)
select o.id, false from public.organisations o where o.slug = 'tidy-enterprise'
on conflict (org_id) do nothing;
