// CSV export. Cells are quoted per RFC 4180, and any cell a spreadsheet would
// treat as a formula (leading = + - @, tab or carriage return) is prefixed
// with an apostrophe, so text read from a scanned website can't run as a
// formula when a report is opened in Excel or Sheets (CSV injection).

export type Cell = string | number | boolean | null | undefined;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so spreadsheet apps read UTF-8 correctly
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
