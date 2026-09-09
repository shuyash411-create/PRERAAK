/**
 * CSV generation.
 *
 * Two things here are load-bearing rather than decorative.
 *
 * **Quoting** follows RFC 4180: a field containing a comma, a quote or a
 * newline is wrapped in quotes, and quotes inside it are doubled. Work log
 * summaries are free text somebody typed on a phone; they contain all three.
 *
 * **Formula injection.** A spreadsheet treats a cell beginning `=`, `+`, `-`
 * or `@` as a formula, so a summary reading `=HYPERLINK(...)` becomes live
 * code when the file is opened. Every such cell is prefixed with an
 * apostrophe, which spreadsheets read as "this is text". The data in this
 * system is typed by people, so this is not a hypothetical.
 */

export type Column<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";

  let value = String(raw);

  // Neutralise anything a spreadsheet would execute.
  if (FORMULA_START.test(value)) value = `'${value}`;

  if (NEEDS_QUOTING.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Rows to a CSV document.
 *
 * Starts with a UTF-8 byte order mark: without it Excel on Windows reads the
 * file as the local codepage and mangles every non-ASCII name.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];

  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(","));
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A CSV HTTP response, named for the dataset and today's IST date. */
export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Personal data: never let a proxy or the browser keep a copy.
      "Cache-Control": "no-store, private",
    },
  });
}

/** `yes` / `no`, rather than the `TRUE`/`FALSE` a spreadsheet may reinterpret. */
export function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
