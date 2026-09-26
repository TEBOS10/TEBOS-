// Public tour: a short animated explainer of what TEBOS does for a business.
// No account needed. /tour?record=1 shows only the frame, played once, for
// capturing it as a video clip.
import { ShieldCheck } from "lucide-react";
import { EXPLAINER_SECONDS, Explainer } from "../components/Explainer";

export function TourPage() {
  const recording = new URLSearchParams(window.location.search).get("record") === "1";
  if (recording) {
    return (
      <div className="tour tour-recording">
        <Explainer recording />
      </div>
    );
  }
  return (
    <div className="tour">
      <div className="tour-inner">
        <div className="tour-top">
          <div className="tour-brand">
            <span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span> TEBOS
          </div>
          <a className="tour-link" href="/">Sign in</a>
        </div>
        <h1 className="tour-lede">See how TEBOS helps a business, in {Math.round(EXPLAINER_SECONDS)} seconds.</h1>
        <p className="tour-sub">
          TEBOS looks at a business from the outside, listens to the people running it, reads its real numbers, and shows what's
          costing it money, with the proof. Then it helps fix it and checks that the fix worked.
        </p>
        <Explainer
          cta={
            <div className="tour-actions">
              <a className="btn btn-lime" href="/demo">Try the demo</a>
            </div>
          }
        />
        <p className="tour-sub" style={{ fontSize: 14 }}>
          The agency in this tour is fictional. Want to explore it yourself? <a className="tour-link" href="/demo">Open the interactive demo</a>. No account needed.
        </p>
      </div>
    </div>
  );
}
