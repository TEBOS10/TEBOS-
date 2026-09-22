import Link from "next/link";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import IntakeWizard from "@/components/intake/IntakeWizard";

export const metadata = {
  title: "Diagnostic intake — BAME",
};

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const initialValues: Record<string, string> = {};
  if (get("contact_type")) initialValues.contact_type = get("contact_type")!;
  if (get("full_name")) {
    initialValues.full_name = get("full_name")!;
    initialValues.athlete_full_name = get("full_name")!;
  }
  if (get("email")) initialValues.email = get("email")!;
  if (get("phone")) initialValues.phone = get("phone")!;
  if (get("sport")) initialValues.primary_sport = get("sport")!;
  if (get("lead_id")) initialValues.lead_id = get("lead_id")!;
  if (get("package_interest")) initialValues.package_interest = get("package_interest")!;
  if (get("event_package_interest")) initialValues.event_package_interest = get("event_package_interest")!;
  if (get("lead_source")) initialValues.lead_source = get("lead_source")!;

  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-5 py-14">
          <p className="bame-eyebrow">Client diagnostic intake</p>
          <h1 className="mt-3 text-3xl md:text-4xl">Athlete &amp; event diagnostic.</h1>
          <p className="mt-4 text-sm text-[var(--bame-muted)]">
            BAME uses this master intake to understand you, your commercial position, and what you need — across
            brand, PR, production, sponsorship and tech — before any work is scoped. Complete it once; every BAME
            department works from the same record rather than asking you to repeat yourself.{" "}
            <Link href="/" className="underline">
              Back to BAME
            </Link>
            .
          </p>
          <div className="mt-10 rounded-3xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6 md:p-10">
            <IntakeWizard initialValues={initialValues} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
