// The public privacy policy and website terms.
import { useEffect } from "react";
import { LEGAL_UPDATED, PRIVACY_POLICY, WEBSITE_TERMS } from "../lib/legal";
import { SiteFrame } from "./BlogPage";
import { AgreementText } from "./ContractPage";

export function LegalPage({ which }: { which: "privacy" | "terms" }) {
  const title = which === "privacy" ? "Privacy policy" : "Website terms";
  useEffect(() => {
    const before = document.title;
    document.title = `${title} · TEBOS`;
    return () => {
      document.title = before;
    };
  }, [title]);
  return (
    <SiteFrame>
      <article className="contract-card blog-post">
        <h1>{title}</h1>
        <p className="lp-kicker">Last updated {LEGAL_UPDATED} · being reviewed by our legal advisers; this version applies until it is replaced</p>
        {/* the page's own heading is the h1 above; the text's first "# " line would repeat it */}
        <AgreementText text={(which === "privacy" ? PRIVACY_POLICY : WEBSITE_TERMS).replace(/^# [^\n]*\n+/, "")} />
      </article>
    </SiteFrame>
  );
}
