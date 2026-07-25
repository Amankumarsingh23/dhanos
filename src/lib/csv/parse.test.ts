import { describe, expect, it } from "vitest";
import { parseCsv, splitHeaderAndRows } from "./parse";

describe("parseCsv", () => {
  it("parses a simple comma-separated file", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    const rows = parseCsv('name,note\n"Amazon, Inc.",monthly\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Amazon, Inc.", "monthly"],
    ]);
  });

  it("handles a quoted field containing an embedded newline", () => {
    const rows = parseCsv('name,note\n"line one\nline two",x\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["line one\nline two", "x"],
    ]);
  });

  it("handles an escaped double-quote inside a quoted field", () => {
    const rows = parseCsv('name\n"She said ""hi"""\n');
    expect(rows).toEqual([["name"], ['She said "hi"']]);
  });

  it("handles a file with no trailing newline", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves an intentional blank row in the middle of the file", () => {
    const rows = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      [""],
      ["3", "4"],
    ]);
  });

  it("returns an empty array for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("splitHeaderAndRows", () => {
  it("splits the first row as headers and the rest as data", () => {
    const { headers, dataRows } = splitHeaderAndRows([
      ["date", "amount"],
      ["2026-01-01", "100"],
      ["2026-01-02", "200"],
    ]);
    expect(headers).toEqual(["date", "amount"]);
    expect(dataRows).toEqual([
      ["2026-01-01", "100"],
      ["2026-01-02", "200"],
    ]);
  });

  it("returns empty headers/rows for an empty input", () => {
    expect(splitHeaderAndRows([])).toEqual({ headers: [], dataRows: [] });
  });
});
