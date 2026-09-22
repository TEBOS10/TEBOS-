import Link from "next/link";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import QuickLeadForm from "@/components/site/QuickLeadForm";

const PILLARS = [
  { n: "01", title: "Brand management", desc: "Positioning, identity, and a clear story people can recognise." },
  { n: "02", title: "PR & marketing", desc: "The right visibility, press direction, and campaign thinking." },
  { n: "03", title: "Social & production", desc: "Content direction, creative production, and a presence that stays active." },
  { n: "04", title: "Sponsorship", desc: "Commercial readiness, partner alignment, and opportunities worth pursuing." },
];

const SPORTS = [
  { n: "01", title: "Football", desc: "A commercial presence that travels with the player." },
  { n: "02", title: "Tennis", desc: "A personal story with the confidence to travel globally." },
  { n: "03", title: "Athletics", desc: "Momentum from the track to the market." },
  { n: "04", title: "Combat", desc: "Identity, audience, and opportunity around the athlete." },
  { n: "05", title: "Your sport", desc: "Brand management shaped around your reality." },
];

const HOW = [
  { n: "01", title: "Clarify", desc: "We understand your current position, ambition, and the commercial story worth building." },
  { n: "02", title: "Shape", desc: "We coordinate the brand, content, PR, marketing, and partner direction around one plan." },
  { n: "03", title: "Grow", desc: "We turn consistent brand work into a stronger platform for opportunities and partnerships." },
];

const PACKAGES = [
  {
    n: "01",
    title: "Foundation",
    tag: null,
    desc: "The commercial starting line for athletes building a clear, credible profile.",
    price: "R6,500 monthly investment",
    items: ["Brand and commercial positioning", "Athlete profile and opportunity review", "Core content direction", "Monthly progress conversation"],
  },
  {
    n: "02",
    title: "Growth",
    tag: "Most popular",
    desc: "For athletes expanding their commercial presence with more consistent support.",
    price: "R10,000 monthly investment",
    items: ["Everything in Foundation", "Expanded content and management scope", "Commercial opportunity development", "Monthly activity reporting"],
  },
  {
    n: "03",
    title: "Custom",
    tag: null,
    desc: "A made-to-measure strategy and retainer for complex athlete, company, and bespoke commercial requirements.",
    price: "Tailored — structured around your reality",
    items: ["Tailored strategy and delivery scope", "Flexible retainer structure", "Company and stakeholder alignment", "Priority commercial and campaign support"],
  },
];

const ARCHITECTURE = [
  { n: "01", title: "Production", desc: "Lifestyle, personal-brand, matchday, and campaign media coordinated to the agreed scope." },
  { n: "02", title: "Personal branding", desc: "Positioning, content pillars, visual direction, and a recognisable commercial story." },
  { n: "03", title: "Social management", desc: "Planning at Foundation; managed distribution and review at Growth; expanded support through Custom." },
  { n: "04", title: "Digital presence", desc: "A professional profile hub, gallery, video, enquiry pathway, and source-aware next step." },
  { n: "05", title: "Content planning", desc: "Monthly themes, key dates, usage direction, and the content rhythm behind the work." },
  { n: "06", title: "Account management", desc: "One accountable BAME relationship coordinating client, production, partners, and approvals." },
  { n: "07", title: "PR & commercial", desc: "Athlete or event positioning, media angles, partnerships, and announcements scoped to the brief; coverage and sponsorship are never guaranteed." },
];

const EVENT_PACKAGES = [
  { n: "01", title: "Event foundation", desc: "For organisers defining their event position, participant experience, and commercial direction.", items: ["Event brand narrative", "Audience and stakeholder map", "Core content direction"] },
  { n: "02", title: "Commercial growth", desc: "For established events building sponsorship readiness, campaign momentum, and a stronger partner story.", items: ["Partner proposition", "Campaign and PR direction", "Content and delivery rhythm"] },
  { n: "03", title: "Custom event", desc: "For company-led, high-complexity, or multi-stakeholder events requiring a tailored operating plan and retainer.", items: ["Bespoke strategy", "Flexible delivery team", "Commercial and production alignment"] },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 md:pt-24">
          <p className="bame-eyebrow">Brand management for sport</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight md:text-6xl">
            Build the name. <em className="not-italic text-[var(--bame-accent)]">Own the moment.</em>
          </h1>
          <p className="mt-6 max-w-xl text-[var(--bame-muted)]">
            BAME helps athletes and sports events become commercially established through brand, PR, social media,
            marketing, production, and sponsorship.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/intake?contact_type=athlete" className="rounded-full bg-[var(--bame-accent)] px-6 py-3 text-sm font-semibold text-[#1a1608]">
              Build my brand
            </Link>
            <Link href="/intake?contact_type=event" className="rounded-full px-6 py-3 text-sm font-semibold ring-1 ring-[var(--bame-line)]">
              I run a sports event
            </Link>
          </div>
          <p className="mt-10 text-xs text-[var(--bame-muted)]">Multi-sport by design — built from South Africa, ready for the world.</p>
        </section>

        {/* Services */}
        <section id="services" className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="bame-eyebrow">What BAME manages</p>
            <h2 className="mt-3 max-w-2xl text-3xl md:text-4xl">Make the work connect.</h2>
            <p className="mt-4 max-w-2xl text-[var(--bame-muted)]">
              One accountable brand-management relationship, built around the parts of your career or event that need to move together.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {PILLARS.map((p) => (
                <div key={p.n} className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
                  <div className="bame-eyebrow">{p.n}</div>
                  <h3 className="mt-2 text-xl">{p.title}</h3>
                  <p className="mt-2 text-sm text-[var(--bame-muted)]">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sports */}
        <section className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="bame-eyebrow">Built to replicate</p>
            <h2 className="mt-3 max-w-2xl text-3xl md:text-4xl">Our method adapts to your sport.</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
              {SPORTS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-[var(--bame-line)] p-5">
                  <div className="bame-eyebrow">{s.n}</div>
                  <h3 className="mt-2 text-lg">{s.title}</h3>
                  <p className="mt-2 text-xs text-[var(--bame-muted)]">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="bame-eyebrow">How BAME works</p>
            <h2 className="mt-3 max-w-2xl text-3xl md:text-4xl">Clear direction. Real momentum.</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {HOW.map((h) => (
                <div key={h.n}>
                  <div className="bame-eyebrow">{h.n}</div>
                  <h3 className="mt-2 text-xl">{h.title}</h3>
                  <p className="mt-2 text-sm text-[var(--bame-muted)]">{h.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Packages */}
        <section id="athletes" className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="bame-eyebrow">For athletes</p>
            <h2 className="mt-3 max-w-2xl text-3xl md:text-4xl">Choose your starting line.</h2>
            <p className="mt-4 max-w-2xl text-[var(--bame-muted)]">
              Start with the path that reflects where you are. BAME confirms final scope after understanding the full picture.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {PACKAGES.map((p) => (
                <div key={p.n} className="flex flex-col rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
                  <div className="flex items-center justify-between">
                    <div className="bame-eyebrow">{p.n}</div>
                    {p.tag && <span className="rounded-full bg-[var(--bame-accent)] px-3 py-1 text-xs font-semibold text-[#1a1608]">{p.tag}</span>}
                  </div>
                  <h3 className="mt-3 text-2xl">{p.title}</h3>
                  <p className="mt-2 text-sm text-[var(--bame-muted)]">{p.desc}</p>
                  <p className="mt-4 text-sm font-medium">{p.price}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-[var(--bame-muted)]">
                    {p.items.map((i) => (
                      <li key={i}>— {i}</li>
                    ))}
                  </ul>
                  <Link
                    href={`/intake?contact_type=athlete&package_interest=${encodeURIComponent(p.title)}`}
                    className="mt-6 rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-center text-sm font-semibold text-[#1a1608]"
                  >
                    Start with {p.title}
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-[var(--bame-muted)]">Final scope and terms remain subject to human review.</p>
          </div>
        </section>

        {/* Package architecture */}
        <section className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="bame-eyebrow">The BAME package architecture</p>
            <h2 className="mt-3 max-w-2xl text-3xl md:text-4xl">One system. Different depth.</h2>
            <p className="mt-4 max-w-2xl text-[var(--bame-muted)]">
              BAME does not simply create content. We build the marketing and commercial-positioning system around the athlete or sports property,
              then coordinate the right delivery around it. Choose a starting point. Complete the diagnostic. Receive a reasoned recommendation.
            </p>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {ARCHITECTURE.map((a) => (
                <div key={a.n} className="rounded-2xl border border-[var(--bame-line)] p-5">
                  <div className="bame-eyebrow">{a.n}</div>
                  <h3 className="mt-2 text-lg">{a.title}</h3>
                  <p className="mt-2 text-xs text-[var(--bame-muted)]">{a.desc}</p>
                </div>
              ))}
            </div>
            <Link href="/intake" className="mt-8 inline-block rounded-full bg-[var(--bame-accent)] px-6 py-3 text-sm font-semibold text-[#1a1608]">
              Take the two-minute diagnostic
            </Link>
          </div>
        </section>

        {/* Events */}
        <section id="events" className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="bame-eyebrow">For tournament & sports-event organisers</p>
            <h2 className="mt-3 max-w-2xl text-3xl md:text-4xl">Build the moment around the match.</h2>
            <p className="mt-4 max-w-2xl text-[var(--bame-muted)]">
              Bring your event brand, participant experience, content, commercial story, partnerships, and delivery rhythm into one event plan.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {EVENT_PACKAGES.map((p) => (
                <div key={p.n} className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
                  <div className="bame-eyebrow">{p.n}</div>
                  <h3 className="mt-2 text-xl">{p.title}</h3>
                  <p className="mt-2 text-sm text-[var(--bame-muted)]">{p.desc}</p>
                  <ul className="mt-4 space-y-2 text-sm text-[var(--bame-muted)]">
                    {p.items.map((i) => (
                      <li key={i}>— {i}</li>
                    ))}
                  </ul>
                  <Link
                    href={`/intake?contact_type=event&event_package_interest=${encodeURIComponent(p.title)}`}
                    className="mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-[var(--bame-line)]"
                  >
                    Discuss this path
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Referral */}
        <section id="refer" className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-6xl px-5 text-center">
            <p className="bame-eyebrow">Know someone BAME should meet?</p>
            <h2 className="mt-3 text-3xl md:text-4xl">Make the introduction. Earn 10%.</h2>
            <p className="mx-auto mt-4 max-w-xl text-[var(--bame-muted)]">
              Refer a successful new BAME client and earn 10% of eligible collected client revenue after owner review.
            </p>
            <Link href="/intake?lead_source=Referral" className="mt-6 inline-block rounded-full bg-[var(--bame-accent)] px-6 py-3 text-sm font-semibold text-[#1a1608]">
              Refer a client
            </Link>
          </div>
        </section>

        {/* Lead form */}
        <section className="border-t border-[var(--bame-line)] py-20">
          <div className="mx-auto max-w-3xl px-5">
            <p className="bame-eyebrow">Start with context</p>
            <h2 className="mt-3 text-3xl md:text-4xl">Tell us where you are now.</h2>
            <p className="mt-4 text-[var(--bame-muted)]">
              Share a few details and the BAME team will guide you toward the most useful next conversation. Private by design — no commitment at this stage.
            </p>
            <div className="mt-8">
              <QuickLeadForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
