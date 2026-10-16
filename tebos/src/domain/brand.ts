// A business's colours, for its tile on the TEBOS client map (founder, 16 Oct 2026: "the colours should be based
// off of the business's colours"). Stored on the business and checked by the database
// (migration 20261017140000_business_brand.sql); text on a tile is always chosen for contrast, never assumed.
import { fail, OK, type Check } from "./rules";

/** How a business relates to Tidy: the client map shows clients and ventures in development. */
export const RELATIONSHIPS = { client: "Client", in_development: "In development", own: "Tidy's own" } as const;
export type Relationship = keyof typeof RELATIONSHIPS;

export const HEX = /^#[0-9a-f]{6}$/;

export interface Brand {
  /** the tile's background */
  primary: string;
  /** highlights: a glow, a stripe, the status mark */
  accent: string;
  /** a second, lighter surface */
  surface: string;
}

export function checkBrand(b: Partial<Brand>): Check {
  for (const [k, v] of Object.entries(b)) {
    if (v !== null && v !== undefined && !HEX.test(v)) return fail("TEBOS_VALIDATION", `The ${k} colour must look like #a1b2c3 (lower case).`);
  }
  return OK;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

export const DARK_INK = "#17120e";
export const LIGHT_INK = "#ffffff";

/** The text colour that reads best on a background. */
export function inkFor(background: string): string {
  return contrast(background, DARK_INK) >= contrast(background, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}
