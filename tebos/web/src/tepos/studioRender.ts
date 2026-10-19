// The Listing studio's advert, drawn on a canvas in the browser from the founder's own photos and the listing's
// stated facts (advertCopy). Pelser Real Estate's colours, taken from its logo; a serif for the headline and price,
// Manrope for the rest. Nothing leaves the device until the founder downloads or files it.
import type { AdvertCopy, AgentCard } from "@core/studio";

export const BRAND = {
  red: "#E31E26",
  crimson: "#B71C2B",
  burgundy: "#7E141B",
  ink: "#2B1A1C",
  muted: "#7A6567",
  rule: "#E6DADA",
  paper: "#FBF8F6",
  white: "#FFFFFF",
} as const;

export const FORMATS = {
  post: { label: "Post (4:5)", w: 1080, h: 1350 },
  story: { label: "Story (9:16)", w: 1080, h: 1920 },
} as const;
export type Format = keyof typeof FORMATS;

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = "Manrope, system-ui, sans-serif";

export async function loadFonts() {
  if (!("fonts" in document)) return;
  await Promise.allSettled([
    document.fonts.load(`600 64px ${SERIF}`), document.fonts.load(`500 40px ${SERIF}`),
    document.fonts.load(`700 24px ${SANS}`), document.fonts.load(`500 20px ${SANS}`),
  ]);
}

export interface AdvertInput {
  format: Format;
  copy: AdvertCopy;
  card: AgentCard;
  photos: HTMLImageElement[];
  logo: HTMLImageElement | null;
}

/** Draws the image to fill the box, cropping the overflow from the centre, as a photographer would frame it. */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function contain(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const s = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

const trimmed = new WeakMap<HTMLImageElement, HTMLCanvasElement | HTMLImageElement>();

/** The logo without the white margin around it, so the mark fills its card. Falls back to the image as it is. */
function trimWhite(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const known = trimmed.get(img);
  if (known) return known;
  let out: HTMLCanvasElement | HTMLImageElement = img;
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (cx) {
      cx.drawImage(img, 0, 0);
      const { data } = cx.getImageData(0, 0, c.width, c.height);
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (data[i + 3]! > 16 && (data[i]! < 235 || data[i + 1]! < 235 || data[i + 2]! < 235)) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 > x0 && y1 > y0) {
        const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
        const t = document.createElement("canvas");
        t.width = x1 - x0 + 2 * m;
        t.height = y1 - y0 + 2 * m;
        t.getContext("2d")?.drawImage(c, x0 - m, y0 - m, t.width, t.height, 0, 0, t.width, t.height);
        out = t;
      }
    }
  } catch {
    // a logo the browser won't let us read is drawn as it is
  }
  trimmed.set(img, out);
  return out;
}

/** Sets the largest font up to `size` that fits the text in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, size: number, max: number) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= max) break;
    s -= 2;
  } while (s > 12);
  return s;
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align: "left" | "right" | "center" = "left") {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + tracking * (chars.length - 1);
  let cx = align === "left" ? x : align === "right" ? x - width : x - width / 2;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + tracking;
  }
  return width;
}

function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#EFE6E4");
  g.addColorStop(1, "#E2D3D1");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = BRAND.muted;
  ctx.font = `500 26px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("Add your photos", x + w / 2, y + h / 2);
}

export function drawAdvert(canvas: HTMLCanvasElement, a: AdvertInput) {
  const { w, h } = FORMATS[a.format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const story = a.format === "story";
  const pad = 64;
  const footerH = story ? 150 : 128;
  const thumbs = a.photos.slice(1, 4);
  const heroH = story ? (thumbs.length ? 1000 : 1200) : (thumbs.length ? 640 : 780);
  const thumbH = story ? 240 : 170;
  const gap = 8;

  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, w, h);

  // The hero photo, with a soft shade at the top so the logo card and ribbon read on any picture.
  if (a.photos[0]) cover(ctx, a.photos[0], 0, 0, w, heroH);
  else placeholder(ctx, 0, 0, w, heroH);
  const shade = ctx.createLinearGradient(0, 0, 0, 220);
  shade.addColorStop(0, "rgba(20,8,10,0.35)");
  shade.addColorStop(1, "rgba(20,8,10,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, 220);

  let y = heroH;
  if (thumbs.length) {
    const tw = (w - gap * (thumbs.length - 1)) / thumbs.length;
    thumbs.forEach((img, i) => cover(ctx, img, i * (tw + gap), y + gap, tw, thumbH));
    y += gap + thumbH;
  }

  // The logo on a white card, top left.
  const cardW = story ? 230 : 200;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = BRAND.white;
  roundRect(ctx, pad - 16, pad - 16, cardW, cardW, 18);
  ctx.fill();
  ctx.restore();
  if (a.logo) contain(ctx, trimWhite(a.logo), pad - 2, pad - 2, cardW - 28, cardW - 28);
  else {
    ctx.fillStyle = BRAND.crimson;
    ctx.font = `600 34px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.fillText("PELSER", pad - 16 + cardW / 2, pad - 16 + cardW / 2);
  }

  // The ribbon, top right.
  ctx.font = `700 ${story ? 30 : 26}px ${SANS}`;
  const ribbonW = ctx.measureText(a.copy.ribbon).width + a.copy.ribbon.length * 6 + 72;
  ctx.fillStyle = BRAND.burgundy;
  ctx.fillRect(w - ribbonW, pad, ribbonW, story ? 78 : 68);
  ctx.fillStyle = BRAND.red;
  ctx.fillRect(w - ribbonW, pad, 8, story ? 78 : 68);
  ctx.fillStyle = BRAND.white;
  spaced(ctx, a.copy.ribbon, w - ribbonW + 40, pad + (story ? 50 : 44), 6);

  // Headline, place and price.
  y += story ? 90 : 76;
  const textW = w - pad * 2;
  ctx.fillStyle = BRAND.burgundy;
  fit(ctx, a.copy.headline, 600, SERIF, story ? 76 : 62, textW * 0.62);
  ctx.textAlign = "left";
  ctx.fillText(a.copy.headline, pad, y);
  ctx.fillStyle = BRAND.red;
  fit(ctx, a.copy.price, 600, SERIF, story ? 80 : 66, textW * 0.38);
  ctx.textAlign = "right";
  ctx.fillText(a.copy.price, w - pad, y);
  if (a.copy.place) {
    y += story ? 52 : 44;
    ctx.fillStyle = BRAND.muted;
    ctx.font = `600 ${story ? 24 : 21}px ${SANS}`;
    spaced(ctx, a.copy.place.toUpperCase(), pad, y, 4);
  }

  // The features, as figures with small labels between hairlines.
  const feats = a.copy.features.slice(0, 5);
  if (feats.length) {
    y += story ? 60 : 44;
    ctx.fillStyle = BRAND.rule;
    ctx.fillRect(pad, y, textW, 2);
    const cellW = textW / feats.length;
    const vy = y + (story ? 86 : 70);
    feats.forEach((f, i) => {
      const cx = pad + cellW * i + cellW / 2;
      ctx.fillStyle = BRAND.burgundy;
      fit(ctx, f.value, 600, SERIF, story ? 58 : 48, cellW - 16);
      ctx.textAlign = "center";
      ctx.fillText(f.value, cx, vy);
      ctx.fillStyle = BRAND.muted;
      ctx.font = `700 ${story ? 17 : 15}px ${SANS}`;
      spaced(ctx, f.label.toUpperCase(), cx, vy + (story ? 36 : 30), 2, "center");
      if (i > 0) {
        ctx.fillStyle = BRAND.rule;
        ctx.fillRect(pad + cellW * i, y + 26, 2, story ? 96 : 80);
      }
    });
    y += story ? 150 : 124;
    ctx.fillStyle = BRAND.rule;
    ctx.fillRect(pad, y, textW, 2);
  }

  // Highlights, on as many lines as fit above the footer.
  if (a.copy.highlights.length) {
    ctx.fillStyle = BRAND.ink;
    ctx.font = `500 ${story ? 26 : 22}px ${SANS}`;
    ctx.textAlign = "left";
    let line = "";
    let ly = y + (story ? 56 : 44);
    const limit = h - footerH - 20;
    for (const item of a.copy.highlights.map((s) => `—  ${s}`)) {
      const next = line ? `${line}      ${item}` : item;
      if (ctx.measureText(next).width > textW && line) {
        if (ly <= limit) ctx.fillText(line, pad, ly);
        ly += story ? 40 : 34;
        line = item;
      } else line = next;
    }
    if (line && ly <= limit) ctx.fillText(line, pad, ly);
  }

  // The footer: the founder's name and title on the left, how to reach them on the right, the agency's line below.
  const fy = h - footerH;
  ctx.fillStyle = BRAND.burgundy;
  ctx.fillRect(0, fy, w, footerH);
  ctx.fillStyle = BRAND.red;
  ctx.fillRect(0, fy, w, 6);
  const name = a.card.name.trim() || "Pelser Real Estate";
  ctx.fillStyle = BRAND.white;
  fit(ctx, name, 600, SERIF, story ? 42 : 38, textW * 0.5);
  ctx.textAlign = "left";
  ctx.fillText(name, pad, fy + (story ? 62 : 56));
  if (a.card.title.trim()) {
    ctx.fillStyle = "#F2D3D5";
    fit(ctx, a.card.title.trim().toUpperCase(), 600, SANS, story ? 17 : 15, textW * 0.55);
    spaced(ctx, a.card.title.trim().toUpperCase(), pad, fy + (story ? 96 : 86), 1.5);
  }
  ctx.fillStyle = BRAND.white;
  const contact = [a.card.phone.trim(), a.card.email.trim()].filter(Boolean);
  contact.forEach((c, i) => {
    fit(ctx, c, 600, SANS, story ? 24 : 21, textW * 0.42);
    ctx.textAlign = "right";
    ctx.fillText(c, w - pad, fy + (story ? 60 : 52) + i * (story ? 34 : 30));
  });
  if (a.card.agencyLine.trim()) {
    ctx.fillStyle = "#E9C3C6";
    fit(ctx, a.card.agencyLine.trim(), 500, SANS, 14, textW);
    ctx.textAlign = "center";
    ctx.fillText(a.card.agencyLine.trim(), w / 2, h - 16);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image couldn't be opened."));
    img.src = src;
  });
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The advert couldn't be saved."))), "image/png"));
}
