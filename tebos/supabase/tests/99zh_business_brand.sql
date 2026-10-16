-- Business colours are lower-case hex; relationship is one of the three.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zh;
create function t99zh.refused(p_sql text) returns boolean
language plpgsql as $$
begin
  begin execute p_sql; exception when check_violation then return true; end;
  return false;
end $$;
create function t99zh.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;

insert into public.organisations (id, name, slug) values ('9f6f0000-0000-0000-0000-0000000000d1', 'Org 99zh', 'org-99zh');
insert into public.businesses (id, org_id, name, brand_primary, brand_accent, brand_surface, relationship)
  values ('9f6f0000-0000-0000-0000-0000000000b1', '9f6f0000-0000-0000-0000-0000000000d1', 'Client 99zh', '#111111', '#c9a227', '#ffffff', 'client');
select t99zh.ok((select relationship = 'client' and brand_accent = '#c9a227' from public.businesses where name = 'Client 99zh'), 'stored');
select t99zh.ok(t99zh.refused($$update public.businesses set brand_primary = 'gold' where name = 'Client 99zh'$$), 'not a colour');
select t99zh.ok(t99zh.refused($$update public.businesses set brand_accent = '#C9A227' where name = 'Client 99zh'$$), 'upper case refused');
select t99zh.ok(t99zh.refused($$update public.businesses set relationship = 'prospect' where name = 'Client 99zh'$$), 'unknown relationship');
update public.businesses set relationship = null, brand_primary = null where name = 'Client 99zh';
select t99zh.ok((select relationship is null from public.businesses where name = 'Client 99zh'), 'both may be unset');
