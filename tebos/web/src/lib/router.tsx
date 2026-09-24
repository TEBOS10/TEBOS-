// A minimal client-side router: path patterns, links and navigation on top of
// the History API. TEBOS has a handful of routes; this avoids a dependency.
import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

const PathContext = createContext<string>("/");

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return <PathContext.Provider value={path}>{children}</PathContext.Provider>;
}

export const usePath = () => useContext(PathContext);

/** Match "/scans/:id" against a path; returns params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(s[i]!);
    else if (seg !== s[i]) return null;
  }
  return params;
}

export function Link({ to, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        rest.onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
