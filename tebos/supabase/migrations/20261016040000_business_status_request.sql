-- REEDS request type 2: "How are my businesses doing?" (founder's build order, 15 Oct).
--
-- Only the list of request kinds changes. The kind is still fixed once asked,
-- and planning, running, verifying and reporting stay the server's; every task
-- of the new kind is a count with an independent recount, like the first kind.
alter table public.work_requests drop constraint work_requests_kind_check,
  add constraint work_requests_kind_check check (kind in ('attention_today', 'business_status'));
