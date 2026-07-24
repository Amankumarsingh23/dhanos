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
    expect(csv).toBe(
      "Category,Amount\r\nGroceries,1200\r\nRent,25000",
    );
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
});
