// ────────────────────────────────────────────────────────────────────────────
// csv.ts — a tiny, dependency-free CSV builder for admin-side exports.
//
// SECURITY: the only consumer today is the CRM leads export, whose rows carry
// customer PII that already lives in the admin's browser (fetched via crm-api).
// Building the file client-side keeps that PII off any new endpoint. Two hardening
// rules are baked in so an exported cell can never be weaponised:
//   1. RFC-4180 quoting — any value with a comma / quote / newline is wrapped in
//      double quotes with inner quotes doubled, so the columns never desync.
//   2. Formula-injection guard — a value that a spreadsheet would read as a
//      formula (leading = + - @, or tab/CR) is prefixed with a single quote, so a
//      malicious lead name like `=HYPERLINK(...)` opens as text, not a live cell.
// A UTF-8 BOM is prepended so Excel renders Hebrew correctly.
// ────────────────────────────────────────────────────────────────────────────

/** Chars that make a spreadsheet treat a cell as a formula (CSV-injection). */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Escape one cell: neutralise formula leads, then RFC-4180 quote if needed. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV document (with a UTF-8 BOM) from a header row + data rows. */
export function buildCsv(headers: string[], rows: readonly unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n");
}

/** Trigger a browser download of `content` as `filename` (no-op server-side). */
export function downloadCsv(filename: string, content: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
