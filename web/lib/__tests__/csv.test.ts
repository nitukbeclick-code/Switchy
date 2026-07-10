import { describe, expect, it } from "vitest";
import { buildCsv, csvCell } from "@/lib/csv";

describe("csvCell", () => {
  it("passes plain values through unquoted", () => {
    expect(csvCell("דני")).toBe("דני");
    expect(csvCell("Pelephone")).toBe("Pelephone");
    expect(csvCell(42)).toBe("42");
  });

  it("renders null/undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("RFC-4180 quotes values with comma / quote / newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    // A malicious lead name must not become a live formula in Excel/Sheets.
    expect(csvCell("=HYPERLINK(0)")).toBe("'=HYPERLINK(0)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    // A phone with a leading + is neutralised too (harmless: shows as text).
    expect(csvCell("+972501234567")).toBe("'+972501234567");
  });

  it("quotes a value that is BOTH a formula and comma-bearing", () => {
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });
});

describe("buildCsv", () => {
  it("prepends a UTF-8 BOM and joins rows with CRLF", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv.slice(1)).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("escapes cells inside the built document", () => {
    const csv = buildCsv(["name"], [["=evil"], ["a,b"]]);
    expect(csv.slice(1)).toBe(`name\r\n'=evil\r\n"a,b"`);
  });
});
