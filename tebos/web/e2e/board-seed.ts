// A small operating board for the fixture business: two pieces, one flow, two objectives.
import { BIZ, ORG } from "./fixtures";

export function seedBoard(t: Record<string, unknown[]>) {
  const row = { org_id: ORG, business_id: BIZ, retired_at: null };
  t.board_components = [
    { ...row, id: "pc1", name: "Website", kind: "channel", basis: "observed", supplier: null },
    { ...row, id: "pc2", name: "Invoicing app", kind: "software", basis: "stated", supplier: "Xero" },
  ];
  t.board_flows = [{ ...row, id: "fl1", name: "Order to delivery", objective_id: null, created_at: "2026-10-01T00:00:00Z" }];
  t.board_steps = [
    { ...row, id: "st1", flow_id: "fl1", position: 1, name: "Take the order", performer: "founder", component_id: "pc1", documented: false },
    { ...row, id: "st2", flow_id: "fl1", position: 2, name: "Send the invoice", performer: "automation", component_id: "pc2", documented: true },
  ];
  t.objectives = [
    { ...row, id: "ob1", title: "Orders a month", status: "active", direction: "at_least", target_value: 40, unit: "count", created_at: "2026-10-01T00:00:00Z" },
    { ...row, id: "ob2", title: "Founder hours a week", status: "active", direction: "at_most", target_value: 30, unit: "hours_per_week", created_at: "2026-10-02T00:00:00Z" },
  ];
  // two measured readings of the first objective; the owner's figure for the second never fills a gauge
  t.objective_measurements = [
    { ...row, id: "m1", objective_id: "ob1", basis: "measured", value: 18, measured_at: "2026-10-07T08:00:00Z" },
    { ...row, id: "m2", objective_id: "ob1", basis: "measured", value: 26, measured_at: "2026-10-14T08:00:00Z" },
    { ...row, id: "m3", objective_id: "ob2", basis: "stated", value: 25, measured_at: "2026-10-14T08:00:00Z" },
  ];
}
