-- Grant hygiene. On the live project, 27 tables created from 29 Oct onwards carried Supabase's default grants: every
-- privilege, including TRUNCATE, for anon and authenticated, wider than their migrations intended. Row-level security
-- held (no table here has a policy for anon, so the public reached no rows), but signed-in users could write columns
-- the migrations keep frozen (for example a booking's customer email, or an invitation's token hash readable by its
-- organisation), and TRUNCATE ignores row-level security. This puts each table back to exactly the privileges its
-- migrations grant, as the database tests have always run them: revoke everything from anon and authenticated, then
-- grant the same table and column privileges again. No data changes.
-- From now on scripts/check-migrations.mjs refuses a new public table that doesn't revoke these defaults.

revoke all on public.booking_hours from anon, authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.booking_hours to authenticated;
revoke all on public.booking_packages from anon, authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.booking_packages to authenticated;
revoke all on public.booking_services from anon, authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.booking_services to authenticated;
revoke all on public.booking_settings from anon, authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.booking_settings to authenticated;
revoke all on public.booking_time_off from anon, authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.booking_time_off to authenticated;
revoke all on public.bookings from anon, authenticated;
grant INSERT, SELECT on public.bookings to authenticated;
grant UPDATE (starts_at, ends_at, status, status_note, price_cents, deposit_ref, delivered_note, assignee_id, call_sheet_at, releases_note, backed_up_at, balance_ref, gallery_url) on public.bookings to authenticated;
revoke all on public.equity_applications from anon, authenticated;
grant INSERT, SELECT on public.equity_applications to authenticated;
grant UPDATE (org_id, business_name, registration_number, sector, trading_since, revenue_band, employees, owner_full_time, revenue_evidence_note, reporting_consent, package, status, status_note, agreement_ref) on public.equity_applications to authenticated;
revoke all on public.equity_terms from anon, authenticated;
grant INSERT, SELECT on public.equity_terms to authenticated;
grant UPDATE (ended_on) on public.equity_terms to authenticated;
revoke all on public.invitations from anon, authenticated;
grant SELECT (id, org_id, email, role, status, invited_by, accepted_by, created_at, expires_at, accepted_at) on public.invitations to authenticated;
grant UPDATE (status) on public.invitations to authenticated;
revoke all on public.partner_month_closes from anon, authenticated;
grant SELECT on public.partner_month_closes to authenticated;
grant INSERT (org_id, period, note) on public.partner_month_closes to authenticated;
revoke all on public.partner_sales from anon, authenticated;
grant INSERT, SELECT on public.partner_sales to authenticated;
revoke all on public.profiles from anon, authenticated;
grant SELECT on public.profiles to authenticated;
grant INSERT (user_id, display_name) on public.profiles to authenticated;
grant UPDATE (display_name) on public.profiles to authenticated;
revoke all on public.property_problems from anon, authenticated;
grant INSERT, SELECT, UPDATE on public.property_problems to authenticated;
revoke all on public.res_money_items from anon, authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.res_money_items to authenticated;
revoke all on public.sales_prospects from anon, authenticated;
grant INSERT, SELECT on public.sales_prospects to authenticated;
grant UPDATE (website, phone, status, next_call_on, last_outcome, enquiry_id, owner) on public.sales_prospects to authenticated;
revoke all on public.web_assets from anon, authenticated;
grant INSERT, SELECT on public.web_assets to authenticated;
grant UPDATE (label, kind, source, status, licence_note, location) on public.web_assets to authenticated;
revoke all on public.web_deployments from anon, authenticated;
grant INSERT, SELECT on public.web_deployments to authenticated;
grant UPDATE (outcome, rollback_note) on public.web_deployments to authenticated;
revoke all on public.web_intakes from anon, authenticated;
grant INSERT, SELECT on public.web_intakes to authenticated;
grant UPDATE (answers, status, reopen_reason) on public.web_intakes to authenticated;
revoke all on public.web_integrations from anon, authenticated;
grant INSERT, SELECT on public.web_integrations to authenticated;
grant UPDATE (provider, account_owner, tebos_access, purpose, status, verified_on, revocation_plan, transfer_plan) on public.web_integrations to authenticated;
revoke all on public.web_project_approvals from anon, authenticated;
grant INSERT, SELECT on public.web_project_approvals to authenticated;
revoke all on public.web_project_costs from anon, authenticated;
grant INSERT, SELECT on public.web_project_costs to authenticated;
grant UPDATE (disclosed_to_client) on public.web_project_costs to authenticated;
revoke all on public.web_projects from anon, authenticated;
grant INSERT, SELECT on public.web_projects to authenticated;
grant UPDATE (name, website_type, primary_objective, plan, status, status_note, maintainer_id, starting_point, existing_url) on public.web_projects to authenticated;
revoke all on public.web_qa_runs from anon, authenticated;
grant INSERT, SELECT on public.web_qa_runs to authenticated;
revoke all on public.web_readiness_items from anon, authenticated;
grant INSERT, SELECT on public.web_readiness_items to authenticated;
grant UPDATE (status, evidence) on public.web_readiness_items to authenticated;
revoke all on public.web_scope_revisions from anon, authenticated;
grant INSERT, SELECT on public.web_scope_revisions to authenticated;
revoke all on public.web_task_dependencies from anon, authenticated;
grant INSERT, SELECT on public.web_task_dependencies to authenticated;
revoke all on public.web_tasks from anon, authenticated;
grant INSERT, SELECT on public.web_tasks to authenticated;
grant UPDATE (title, done_when, due_on, assigned_to, status, blocked_reason, evidence) on public.web_tasks to authenticated;

-- members-only functions: they refuse non-members anyway; the public shouldn't be able to call them at all
revoke execute on function public.booking_crew(uuid) from anon;
revoke execute on function public.booking_schedule(uuid, date, integer) from anon;
