import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export type Block =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "h2"; text: string }
  | { type: "p"; text: string; bold?: boolean }
  | { type: "bullet"; text: string }
  | { type: "table"; rows: string[][]; widths: number[] }
  | { type: "spacer"; height: number }
  | { type: "pagebreak" };

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 36;

interface RenderOptions {
  docTitle: string;
  footerRight: string; // e.g. "Initials: BAME ______    Athlete ______"
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderPdf(blocks: Block[], options: RenderOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y = 0;
  let pageNum = 0;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNum += 1;
    y = PAGE_HEIGHT - MARGIN;
  }

  function drawFooter() {
    page.drawText(`${options.docTitle}`, { x: MARGIN, y: FOOTER_Y + 12, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(`Page ${pageNum}`, { x: PAGE_WIDTH - MARGIN - 40, y: FOOTER_Y + 12, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(options.footerRight, { x: MARGIN, y: FOOTER_Y, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN + 30) {
      drawFooter();
      newPage();
    }
  }

  newPage();

  for (const block of blocks) {
    if (block.type === "pagebreak") {
      drawFooter();
      newPage();
      continue;
    }
    if (block.type === "spacer") {
      ensureSpace(block.height);
      y -= block.height;
      continue;
    }
    if (block.type === "title") {
      ensureSpace(28);
      page.drawText(block.text, { x: MARGIN, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.15) });
      y -= 26;
      continue;
    }
    if (block.type === "subtitle") {
      ensureSpace(18);
      page.drawText(block.text, { x: MARGIN, y, size: 11, font: regular, color: rgb(0.35, 0.35, 0.4) });
      y -= 22;
      continue;
    }
    if (block.type === "h2") {
      ensureSpace(20);
      page.drawText(block.text, { x: MARGIN, y, size: 12, font: bold, color: rgb(0.1, 0.1, 0.2) });
      y -= 18;
      continue;
    }
    if (block.type === "p") {
      const font = block.bold ? bold : regular;
      const lines = wrapText(block.text, font, 10, CONTENT_WIDTH);
      for (const line of lines) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
        y -= 13.5;
      }
      y -= 4;
      continue;
    }
    if (block.type === "bullet") {
      const lines = wrapText(block.text, regular, 10, CONTENT_WIDTH - 14);
      for (let i = 0; i < lines.length; i++) {
        ensureSpace(14);
        const prefix = i === 0 ? "•" : "";
        page.drawText(prefix, { x: MARGIN, y, size: 10, font: regular });
        page.drawText(lines[i], { x: MARGIN + 14, y, size: 10, font: regular, color: rgb(0.1, 0.1, 0.1) });
        y -= 13.5;
      }
      y -= 2;
      continue;
    }
    if (block.type === "table") {
      const LINE_H = 11;
      for (const [rowIdx, row] of block.rows.entries()) {
        const isHeader = rowIdx === 0;
        const cellLines = row.map((cell, colIdx) => wrapText(cell, isHeader ? bold : regular, 9, block.widths[colIdx] - 6));
        const lineCount = Math.max(1, ...cellLines.map((l) => l.length));
        const rowHeight = lineCount * LINE_H + 6;
        ensureSpace(rowHeight + 4);
        let x = MARGIN;
        for (const [colIdx, lines] of cellLines.entries()) {
          lines.forEach((line, li) => {
            page.drawText(line, { x: x + 3, y: y - li * LINE_H, size: 9, font: isHeader ? bold : regular, color: rgb(0.1, 0.1, 0.1) });
          });
          x += block.widths[colIdx];
        }
        page.drawLine({
          start: { x: MARGIN, y: y - rowHeight + LINE_H - 2 },
          end: { x: MARGIN + block.widths.reduce((a, b) => a + b, 0), y: y - rowHeight + LINE_H - 2 },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
        y -= rowHeight;
      }
      y -= 6;
      continue;
    }
  }
  drawFooter();

  return doc.save();
}
