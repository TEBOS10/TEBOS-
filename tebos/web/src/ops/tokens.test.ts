// The design foundation's guard rails (docs/property-operations/DESIGN-SYSTEM.md):
// 1. tokens.css is the only place raw colours live; 2. every token a component uses exists;
// 3. every text and graphic pairing meets WCAG 2.2 AA in both themes, computed from the real token values.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

const dir = resolve(__dirname);
const tokens = readFileSync(resolve(dir, "tokens.css"), "utf8");
const ops = readFileSync(resolve(dir, "ops.css"), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  const css = stripComments(tokens);
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
const dark = block(':root, :root[data-theme="dark"]');
const light = block(':root[data-theme="light"]');
const lightSidebar = { ...light, ...block(':root[data-theme="light"] .ops-app .sidebar') };

type RGBA = [number, number, number, number];
function parse(value: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) { const n = parseInt(hex[1]!, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) { const [r, g, b, a = "1"] = rgba[1]!.split(",").map((x) => x.trim()); return [Number(r), Number(g), Number(b), Number(a)]; }
  throw new Error(`not a colour: ${value}`);
}
/** a translucent colour as it actually appears over the surface beneath it */
function over(top: RGBA, under: RGBA): RGBA {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}
function luminance([r, g, b]: RGBA): number {
  const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(fg: RGBA, bg: RGBA): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}
function ratio(theme: Record<string, string>, fg: string, bg: string, base = "--ops-surface"): number {
  const under = parse(theme[base]!);
  const back = over(parse(theme[bg]!), under);
  return contrast(over(parse(theme[fg]!), back), back);
}

describe("design tokens", () => {
  it("keeps raw colours in tokens.css only", () => {
    const literal = stripComments(ops).match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi);
    expect(literal).toBeNull();
  });

  it("defines every token that the styles and the app use", () => {
    const defined = new Set([...stripComments(tokens).matchAll(/(--ops-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const app = ["OpsApp.tsx", "DashboardPage.tsx"].map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
    const used = new Set([...(ops + app).matchAll(/var\((--ops-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect([...used].filter((t) => !defined.has(t))).toEqual([]);
  });

  it("defines the same colour tokens in both themes", () => {
    const colourKeys = (t: Record<string, string>) => Object.keys(t).filter((k) => /^(#|rgba?\()/.test(t[k]!)).sort();
    expect(colourKeys(light)).toEqual(colourKeys(dark));
  });

  for (const [name, theme] of [["dark", dark], ["light", light]] as const) {
    describe(`${name} theme meets WCAG 2.2 AA`, () => {
      it("body, secondary, caption and link text: at least 4.5:1 on every surface", () => {
        for (const fg of ["--ops-text", "--ops-text-2", "--ops-text-3", "--ops-text-4", "--ops-accent-text"]) {
          for (const bg of ["--ops-bg", "--ops-surface", "--ops-surface-2"]) {
            expect(ratio(theme, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
      it("status text on its own tint: at least 4.5:1", () => {
        for (const s of ["good", "warn", "bad", "info", "neutral"]) {
          expect(ratio(theme, `--ops-${s}`, `--ops-${s}-bg`), s).toBeGreaterThanOrEqual(4.5);
        }
      });
      it("button text on the navy: at least 4.5:1", () => {
        expect(ratio(theme, "--ops-on-accent", "--ops-accent")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(theme, "--ops-on-accent", "--ops-accent-hover")).toBeGreaterThanOrEqual(4.5);
      });
      it("focus ring and status dots: at least 3:1 against the surface (non-text contrast)", () => {
        for (const fg of ["--ops-focus", "--ops-good", "--ops-warn", "--ops-bad", "--ops-info"]) {
          expect(ratio(theme, fg, "--ops-surface"), fg).toBeGreaterThanOrEqual(3);
        }
      });
      it("chart bars that carry meaning: at least 3:1 against their track", () => {
        for (const fg of ["--ops-chart-expected", "--ops-chart-billed", "--ops-chart-received", "--ops-chart-overdue"]) {
          expect(ratio(theme, fg, "--ops-track"), fg).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }

  it("the dark sidebar stays readable in the light theme", () => {
    for (const fg of ["--ops-text", "--ops-text-2", "--ops-text-3", "--ops-text-4", "--ops-accent-text"]) {
      expect(ratio(lightSidebar, fg, "--ops-sidebar", "--ops-sidebar"), fg).toBeGreaterThanOrEqual(4.5);
      expect(ratio(lightSidebar, fg, "--ops-surface", "--ops-sidebar"), `${fg} on sidebar surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("respects the reader's motion, transparency and contrast settings", () => {
    for (const q of ["prefers-reduced-motion: reduce", "prefers-reduced-transparency: reduce", "prefers-contrast: more"]) {
      expect(tokens.includes(q) || ops.includes(q), q).toBe(true);
    }
    expect(ops).toContain("pointer: coarse");
  });
});

describe("theme choice", () => {
  it("system follows the device; dark and light are fixed", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });
});
