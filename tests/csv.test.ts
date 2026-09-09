import { describe, expect, it } from "vitest";
import { toCsv, yesNo, type Column } from "@/lib/csv";

type Row = { a: string; b: number | null };
const cols: Column<Row>[] = [
  { header: "A", value: (r) => r.a },
  { header: "B", value: (r) => r.b },
];

/** Strip the BOM and split into lines, as a spreadsheet would see it. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

describe("quoting", () => {
  it("quotes fields containing commas, quotes or newlines", () => {
    const csv = lines(
      toCsv(
        [
          { a: "plain", b: 1 },
          { a: "has, comma", b: 2 },
          { a: 'has "quotes"', b: 3 },
          { a: "has\nnewline", b: 4 },
        ],
        cols,
      ),
    );

    expect(csv[1]).toBe("plain,1");
    expect(csv[2]).toBe('"has, comma",2');
    expect(csv[3]).toBe('"has ""quotes""",3');
    // A quoted newline stays inside the field, so the row spans two lines.
    expect(csv.slice(4).join("\r\n")).toBe('"has\nnewline",4');
  });

  it("writes empty cells for null and undefined", () => {
    expect(lines(toCsv([{ a: "", b: null }], cols))[1]).toBe(",");
  });

  it("round-trips through a strict parser", () => {
    const value = 'Fixed the "IST" bug, again\nand tested it';
    const csv = toCsv([{ a: value, b: 7 }], cols).replace(/^﻿/, "");

    // Minimal RFC 4180 reader.
    const fields: string[] = [];
    let cur = "", inQuotes = false, i = csv.indexOf("\r\n") + 2;
    for (; i < csv.length; i += 1) {
      const ch = csv[i];
      if (inQuotes) {
        if (ch === '"' && csv[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else if (ch === "\r" && csv[i + 1] === "\n") break;
      else cur += ch;
    }
    fields.push(cur);

    expect(fields[0]).toBe(value);
    expect(fields[1]).toBe("7");
  });
});

describe("formula injection", () => {
  it("neutralises cells a spreadsheet would execute", () => {
    const nasty = [
      "=cmd|' /C calc'!A0",
      "+1+1",
      "-1+1",
      "@SUM(A1:A9)",
      "=HYPERLINK(\"http://evil.test\",\"click\")",
    ];

    for (const value of nasty) {
      const out = lines(toCsv([{ a: value, b: 0 }], cols))[1];
      expect(out.startsWith("'") || out.startsWith('"\'')).toBe(true);
      expect(out).not.toMatch(/^[=+\-@]/);
    }
  });

  it("leaves ordinary text alone", () => {
    expect(lines(toCsv([{ a: "Fixed the parser", b: 1 }], cols))[1]).toBe("Fixed the parser,1");
  });

  it("does not mangle a negative number written as text", () => {
    // Still neutralised — correctness of the guard beats convenience, and a
    // reader can strip the apostrophe.
    expect(lines(toCsv([{ a: "-5", b: 1 }], cols))[1]).toBe("'-5,1");
  });
});

describe("encoding", () => {
  it("starts with a UTF-8 BOM so Excel reads names correctly", () => {
    expect(toCsv([], cols).startsWith("﻿")).toBe(true);
  });

  it("preserves non-ASCII names", () => {
    expect(toCsv([{ a: "Meera Kṛṣṇan", b: 1 }], cols)).toContain("Meera Kṛṣṇan");
  });

  it("uses CRLF line endings", () => {
    expect(toCsv([{ a: "x", b: 1 }], cols)).toContain("\r\n");
  });

  it("writes a header row even with no data", () => {
    expect(lines(toCsv([], cols))).toEqual(["A,B"]);
  });
});

describe("yesNo", () => {
  it("avoids spreadsheet boolean coercion", () => {
    expect(yesNo(true)).toBe("yes");
    expect(yesNo(false)).toBe("no");
  });
});
