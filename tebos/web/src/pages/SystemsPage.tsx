// The operating systems TEBOS builds, by kind of business. Public, like the
// pricing page. It shows each blueprint's outline only: the flows and how much
// of the work runs on written rules. The rules themselves are the product and
// stay inside TEBOS (nothing of value before payment).
import { BLUEPRINTS, blueprintCoverage } from "@core/blueprints";
import { EDITION_ADDS, TIER_NAMES, TIERS, VARIANTS } from "@core/editions";
import { useEffect } from "react";
import { SiteFrame } from "./BlogPage";

export function SystemsPage() {
  useEffect(() => {
    const before = document.title;
    document.title = "TEBOS · Operating systems by kind of business";
    return () => {
      document.title = before;
    };
  }, []);
  return (
    <SiteFrame>
      <p className="lp-kicker">Operating systems</p>
      <h1 className="lp-title">An operating system for your kind of business</h1>
      <p className="lp-sub">
        TEBOS starts every client from a blueprint for their kind of business: the tools it runs on, the flows its work moves
        through, and a written rule for each step so it no longer waits for the founder. We then fit it to how your business
        actually works, with you. These are blueprints, not client case studies.
      </p>
      <section className="system-card" data-testid="editions" aria-label="What each plan includes">
        <h2 className="blog-card-title">Every system comes in three sizes</h2>
        <ul className="plain-list">
          {TIERS.map((t) => <li key={t}><strong>{TIER_NAMES[t]}:</strong> {EDITION_ADDS[t].join("; ")}.</li>)}
        </ul>
        <p className="blog-meta">Each plan's size is a firm limit on the system: a larger system needs the larger plan. We recommend the diagnostic first, so the size fits what your business needs.</p>
      </section>
      <ul className="blog-list" data-testid="systems">
        {BLUEPRINTS.map((b) => {
          const c = blueprintCoverage(b);
          return (
            <li key={b.key} data-testid="system" className="system-card">
              <p className="blog-meta">{b.industry}</p>
              <h2 className="blog-card-title">{b.name}</h2>
              <p>{b.promise}</p>
              {(VARIANTS[b.key] ?? []).length > 0 && (
                <p className="blog-meta" data-testid="kinds">Tailored for: {(VARIANTS[b.key] ?? []).map((v) => v.label).join(" · ")}</p>
              )}
              <p className="blog-meta">
                {b.flows.map((f) => f.name).join(" · ")}
              </p>
              <p className="blog-meta">
                {c.steps} steps across {b.flows.length} flows · {c.stepsWithRules} run on a written rule · {c.founderSteps === 0 ? "none need" : `${c.founderSteps} still need`} the founder
              </p>
            </li>
          );
        })}
      </ul>
      <p className="lp-sub">
        Not on the list? Every business is mapped from its own evidence; a blueprint only gets us to a first draft faster.{" "}
        <a href="/self-check">Take the free self-check</a> or <a href="/pricing">see the plans</a>.
      </p>
    </SiteFrame>
  );
}
