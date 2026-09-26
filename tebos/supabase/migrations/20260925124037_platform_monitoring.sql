-- Platform monitoring: TEBOS reads a connected platform's operational
-- snapshot (aggregates only, through a login that can do nothing else) and
-- records it as connected-system evidence. The first platform is BAME
-- (connectors/bame/bame_os_tebos_export.sql, applied to bame-os).
--
-- Read-only: the capability is tier 0, and no write capability is mapped to
-- this connector, so no action can be routed through it.

insert into public.capabilities (key, name, description, default_risk_tier) values
  ('operations.read_metrics', 'Read operational metrics',
   'Read aggregate operating numbers (volumes, backlogs, ages) from a connected platform. No personal data.', 0);

insert into public.connectors (key, provider, name, auth_method, supports_webhooks, supports_polling, rate_limit,
                               data_sensitivity, execution_method)
values ('bame-ops', 'BAME', 'BAME operations snapshot (read-only)', 'service_account', false, true,
        '{"min_interval_minutes": 15}', 'controlled', 'api');

insert into public.connector_capabilities (connector_key, capability_key, operation, risk_tier, required_scopes)
values ('bame-ops', 'operations.read_metrics', 'read', 0, '{operations:read}');
