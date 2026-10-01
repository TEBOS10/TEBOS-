// TEBOS's public articles: practical pieces on structure, flows and
// measurement. Public, like the pricing page: no account, no data.
import { ShieldCheck } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { POSTS, postBySlug } from "../lib/blog";
import { AgreementText } from "./ContractPage";

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function useTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** The public site's frame: header, navigation and footer. */
export function SiteFrame({ current, children }: { current?: "blog" | "pricing"; children: ReactNode }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/"><span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span> TEBOS</a>
        <nav className="lp-links" aria-label="Site">
          <a href="/demo">Demo</a>
          <a href="/systems">Systems</a>
          <a href="/self-check">Self-check</a>
          <a href="/blog" aria-current={current === "blog" ? "page" : undefined}>Blog</a>
          <a href="/pricing" aria-current={current === "pricing" ? "page" : undefined}>Pricing</a>
          <a className="lp-signin" href="/sign-in">Sign in</a>
        </nav>
      </header>
      <main className="blog-wrap">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-foot">
      <span>TEBOS · Evidence before assertion</span>
      <nav className="row" style={{ gap: 14 }} aria-label="Legal">
        <a href="/privacy" className="tour-link">Privacy</a>
        <a href="/terms" className="tour-link">Terms</a>
      </nav>
    </footer>
  );
}

export function BlogIndex() {
  useTitle("TEBOS · Articles on business operating architecture");
  return (
    <SiteFrame current="blog">
      <p className="lp-kicker">Blog</p>
      <h1 className="lp-title">Structure, flows and measurement</h1>
      <p className="lp-sub">Practical pieces for founders and leadership teams of growing businesses. Each one works on its own; you don't need TEBOS to use it.</p>
      <ul className="blog-list">
        {POSTS.map((p) => (
          <li key={p.slug} data-testid="post">
            <a href={`/blog/${p.slug}`}>
              <h2>{p.title}</h2>
              <p>{p.summary}</p>
              <span className="blog-meta">{longDate(p.date)} · {p.minutes} min read</span>
            </a>
          </li>
        ))}
      </ul>
    </SiteFrame>
  );
}

export function BlogPost({ slug }: { slug: string }) {
  const post = postBySlug(slug);
  useTitle(post ? `${post.title} · TEBOS` : "Not found · TEBOS");
  if (!post) {
    return (
      <SiteFrame current="blog">
        <h1 className="lp-title">That article doesn't exist</h1>
        <p className="lp-sub"><a href="/blog">See all articles</a></p>
      </SiteFrame>
    );
  }
  return (
    <SiteFrame current="blog">
      <article className="contract-card blog-post">
        <p className="lp-kicker"><a href="/blog">Blog</a> · {longDate(post.date)} · {post.minutes} min read</p>
        <h1>{post.title}</h1>
        <AgreementText text={post.body} />
        <div className="blog-cta">
          <a className="btn btn-primary" href="/demo">See a mapped business in the demo</a>
          <a className="btn" href="/pricing">Plans and pricing</a>
        </div>
      </article>
    </SiteFrame>
  );
}
