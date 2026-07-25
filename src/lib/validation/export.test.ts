import { describe, expect, it } from "vitest";
import {
  EXPORT_GROUPS,
  EXPORT_SCHEMA_VERSION,
  EXPORT_TABLE_KEYS,
  EXPORT_TABLE_LABELS,
  exportCsvTablesSchema,
} from "./export";

describe("export table registry", () => {
  it("has no duplicate table keys across groups", () => {
    const seen = new Set<string>();
    for (const key of EXPORT_TABLE_KEYS) {
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("EXPORT_TABLE_KEYS matches exactly what the groups list", () => {
    const fromGroups = EXPORT_GROUPS.flatMap((group) =>
      group.tables.map((table) => table.key),
    );
    expect([...EXPORT_TABLE_KEYS].sort()).toEqual([...fromGroups].sort());
  });

  it("every table key has a label", () => {
    for (const key of EXPORT_TABLE_KEYS) {
      expect(EXPORT_TABLE_LABELS[key]).toBeTruthy();
    }
  });

  it("every group has a non-empty key/label and at least one table", () => {
    for (const group of EXPORT_GROUPS) {
      expect(group.key.length).toBeGreaterThan(0);
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.tables.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate group keys", () => {
    const seen = new Set<string>();
    for (const group of EXPORT_GROUPS) {
      expect(seen.has(group.key)).toBe(false);
      seen.add(group.key);
    }
  });

  it("schema version looks like semver", () => {
    expect(EXPORT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("exportCsvTablesSchema", () => {
  it("accepts a selection of known table keys", () => {
    const result = exportCsvTablesSchema.safeParse({
      tables: ["people", "institutions"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown table key", () => {
    const result = exportCsvTablesSchema.safeParse({
      tables: ["people", "not_a_real_table"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty selection", () => {
    const result = exportCsvTablesSchema.safeParse({ tables: [] });
    expect(result.success).toBe(false);
  });
});
