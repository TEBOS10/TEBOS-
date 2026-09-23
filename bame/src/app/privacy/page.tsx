import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";

export const metadata = {
  title: "Privacy Policy — BAME",
  description: "How BAME collects, uses, and protects the information athletes, event organisers, and website visitors share with us.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="flex-1 px-5 py-16">
        <div className="mx-auto max-w-3xl">
          <p className="bame-eyebrow">Legal</p>
          <h1 className="mt-2 text-3xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[var(--bame-muted)]">Last updated 23 September 2026.</p>

          <div className="mt-10 space-y-10 text-sm leading-relaxed text-[var(--bame-muted)]">
            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">1. Who we are</h2>
              <p className="mt-3">
                BAME (&quot;BAME&quot;, &quot;we&quot;, &quot;us&quot;) is a sports brand-management agency. This policy
                explains what information we collect through bamemarketing.site, why we collect it, who
                can see it, and the choices you have.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">2. What we collect</h2>
              <p className="mt-3">We collect information you give us directly, through two forms on this site:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-[var(--bame-ink)]">Quick enquiry</strong> — name, email, phone,
                  sport, career stage, and what you&apos;re looking for.
                </li>
                <li>
                  <strong className="text-[var(--bame-ink)]">Full diagnostic</strong> — a longer intake covering
                  athlete or event identity, performance and audience data, existing representation and
                  sponsorship arrangements, production and PR context, goals, and business details relevant
                  to assessing and planning a commercial engagement. This can include career, financial, and
                  contractual information you choose to share.
                </li>
              </ul>
              <p className="mt-3">
                We do not collect payment details, government ID numbers, or health information through
                these forms. We use privacy-friendly, cookieless website analytics (page views and general
                traffic patterns) to understand how the site is used — this does not identify you personally
                and does not use tracking cookies.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">3. Why we collect it</h2>
              <p className="mt-3">
                To assess whether and how BAME can represent or support you commercially, to respond to your
                enquiry, and — if you engage us — to deliver brand management, PR, production, sponsorship,
                and related services. We do not use your diagnostic information for anything beyond
                evaluating and, where agreed, delivering that engagement.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">4. Who can see it</h2>
              <p className="mt-3">
                Submissions are stored in our database and are visible only to BAME staff who need them to do
                their job — routed to the relevant department (sales, production, PR, finance, technology, or
                administration) once an admin reviews the case. Staff can only see cases assigned to their own
                department; administrators can see all cases. We do not sell, rent, or otherwise share your
                information with third parties for their own marketing purposes.
              </p>
              <p className="mt-3">
                If you opted in to the diagnostic&apos;s PDF/email delivery step, a copy of your submission is
                also sent to BAME&apos;s administration email for processing — this is BAME&apos;s own internal
                tooling, not a third-party marketing service.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">5. How long we keep it</h2>
              <p className="mt-3">
                We keep enquiry and diagnostic submissions for as long as reasonably needed to evaluate or
                deliver a potential engagement, or as long as you remain a client. If you ask us to delete
                your information and you are not an active client, we will do so, subject to any legal
                retention requirements.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">6. Your choices</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>You control what you share — most diagnostic fields are optional.</li>
                <li>
                  Submitting the diagnostic requires consenting to BAME processing your information for
                  assessment and service delivery, and to BAME contacting you about it. A separate,
                  optional consent covers using your information for marketing or publicity, which we
                  only act on where you&apos;ve confirmed it.
                </li>
                <li>You can ask us at any time to access, correct, or delete the information we hold about you.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">7. Security</h2>
              <p className="mt-3">
                Your data is stored with access controls that restrict it to authorised BAME staff and to the
                infrastructure providers who host our site and database on our behalf. We don&apos;t consider
                any system perfectly secure, but we apply reasonable technical safeguards appropriate to the
                sensitivity of the information.
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">8. Contact</h2>
              <p className="mt-3">
                Questions about this policy, or requests to access, correct, or delete your information,
                can be sent to{" "}
                <a href="mailto:bame.marketingagency@gmail.com" className="text-[var(--bame-accent)]">
                  bame.marketingagency@gmail.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-lg text-[var(--bame-ink)]">9. Changes to this policy</h2>
              <p className="mt-3">
                We may update this policy as our service or tooling changes. We&apos;ll update the date at
                the top of this page when we do.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
