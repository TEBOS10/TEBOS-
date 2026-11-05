# Tidy Property Operations: changelog

Newest first. How to run and test the product: TESTING-STRATEGY.md.

### 5 Nov 2026: directive v2, Releases 0 (audit) and 1 (design foundation), plus "Needs attention" (built, not live)

- Audit: `AUDIT-V2.md` (what exists, nine defects found, gaps against v2, information architecture).
- apple-design skill installed (`.claude/skills/apple-design`, recorded in `skills-lock.json`) and read in full; applied
  selectively (DESIGN-SYSTEM.md §6).
- Design foundation: `web/src/ops/tokens.css` is the single source of truth (colour, type, spacing, radius, elevation,
  materials, motion, layers); `ops.css` rewritten against it with no raw colours; dark (default), light and system
  themes (`web/src/ops/theme.ts`, choice in the sidebar).
- Accessibility: skip link; focusable main; contrast fixed where it failed AA (captions 3.3:1 → 5.0:1; two chart
  colours); reduced motion, reduced transparency, more contrast and forced colours; 44px touch targets; rem type.
- Layout: breakpoints aligned with the shared stylesheet (portrait tablets get the compact layout instead of a broken
  half-sidebar); the sidebar runs the full page height; long names and nine-figure balances wrap instead of overflowing.
- Feature: **Needs attention** on the overview (`src/domain/opsAttention.ts`): overdue rent, rent not yet charged,
  fixed terms ending, vacant units, quotes waiting, urgent or stale repairs, deposits not received or not located,
  tenants with no contact details. Each line links to the record and says what it was computed from.
- Database (migration still unapplied): index on `ops_maintenance_photos (request_id, created_at)`.
- Docs: DESIGN-SYSTEM, DATABASE-DICTIONARY, TESTING-STRATEGY, AUDIT-V2; CHANGELOG renamed from CHANGELOG-AND-DEV;
  corrections to two over-broad statements about what tenant notes refuse.
- Tests: `web/src/ops/tokens.test.ts` (16), `test/opsAttention.test.ts` (9), `e2e/ops.spec.ts` now 17 (theme, skip link,
  reader settings, touch targets, 390/768/1440 with stress data, needs attention).

### 4 Nov 2026: Release 0 and Release 1 (built, not live)

- Docs: PRODUCT-VISION, COMPETITOR-ANALYSIS, PRODUCT-REQUIREMENTS, SYSTEM-ARCHITECTURE, IMPLEMENTATION-ROADMAP,
  SECURITY-AND-COMPLIANCE, this file; ADR 0023; separate `docs/venture-studio/FEASIBILITY.md`.
- Database: migration `20261104090000_property_operations.sql` (see SYSTEM-ARCHITECTURE §2); test
  `supabase/tests/99zzm_property_operations.sql`.
- Domain: `src/domain/opsLedger.ts` (dates, pro-rata, positions, statements, rand parsing and formatting, CSV);
  `opsMaintenanceMachine` in `src/domain/states.ts`; tests in `test/opsLedger.test.ts` and `test/schema-parity.test.ts`.
- Web: the `ops` app (`web/ops/`, `web/src/ops/`, `web/src/lib/opsData.ts`, `web/vite.ops.config.ts`); e2e
  `web/e2e/ops.spec.ts`; the fake Supabase in `web/e2e/fake-supabase.ts` answers the ops functions.
- Fix: `99zzf_equity_programme.sql` compared a future date against UTC while the rule uses the South African date, so
  it failed between 22:00 and 24:00 UTC. The test now uses `tebos_private.sa_today()`.
