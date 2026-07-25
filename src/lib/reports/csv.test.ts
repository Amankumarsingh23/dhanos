import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("builds a header row and data rows joined by commas", () => {
    const csv = buildCsv(
      [
        { key: "category", label: "Category" },
        { key: "amount", label: "Amount" },
      ],
      [
        { category: "Groceries", amount: 1200 },
        { category: "Rent", amount: 25000 },
      ],
    );
    expect(csv).toBe("Category,Amount\r\nGroceries,1200\r\nRent,25000");
  });

  it("quotes a cell containing a comma", () => {
    const csv = buildCsv(
      [{ key: "name", label: "Name" }],
      [{ name: "Doe, Jane" }],
    );
    expect(csv).toBe('Name\r\n"Doe, Jane"');
  });

  it("quotes and escapes a cell containing a double quote", () => {
    const csv = buildCsv(
      [{ key: "note", label: "Note" }],
      [{ note: 'Say "hello"' }],
    );
    expect(csv).toBe('Note\r\n"Say ""hello"""');
  });

  it("quotes a cell containing a newline", () => {
    const csv = buildCsv(
      [{ key: "note", label: "Note" }],
      [{ note: "line one\nline two" }],
    );
    expect(csv).toBe('Note\r\n"line one\nline two"');
  });

  it("renders null/undefined as an empty cell", () => {
    const csv = buildCsv(
      [{ key: "value", label: "Value" }],
      [{ value: null }, { value: undefined }],
    );
    expect(csv).toBe("Value\r\n\r\n");
  });

  it("produces just a header row for no data", () => {
    const csv = buildCsv([{ key: "a", label: "A" }], []);
    expect(csv).toBe("A");
  });

  describe("CSV injection (CWE-1236)", () => {
    it.each([
      ["=", "=cmd|'/C calc'!A1"],
      ["+", "+cmd|'/C calc'!A1"],
      ["-", "-2+3+cmd|'/C calc'!A1"],
      ["@", "@SUM(1+1)"],
      ["tab", "\tmalicious"],
    ])(
      "prefixes a cell starting with %s with an apostrophe so it's never read as a formula",
      (_label, value) => {
        const csv = buildCsv(
          [{ key: "note", label: "Note" }],
          [{ note: value }],
        );
        expect(csv).toBe(`Note\r\n'${value}`);
      },
    );

    it("still quotes correctly when a formula-looking cell also contains a comma", () => {
      const csv = buildCsv(
        [{ key: "note", label: "Note" }],
        [{ note: '=HYPERLINK("http://evil.example"), gotcha' }],
      );
      expect(csv).toBe(
        'Note\r\n"\'=HYPERLINK(""http://evil.example""), gotcha"',
      );
    });

    it("also escapes a negative-number-looking string, an accepted trade-off (see csv.ts comment)", () => {
      const csv = buildCsv(
        [{ key: "delta", label: "Delta" }],
        [{ delta: "-500.00" }],
      );
      expect(csv).toBe("Delta\r\n'-500.00");
    });
  });
});
