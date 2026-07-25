import { describe, expect, it } from "vitest";
import { groupSearchResults } from "./queries";
import type { SearchResultRow } from "./types";

function row(entityType: SearchResultRow["entityType"], id: string): SearchResultRow {
  return { entityType, id, title: id, subtitle: null, href: `/app/${entityType}/${id}` };
}

describe("groupSearchResults", () => {
  it("buckets rows by entity type in the fixed display order, regardless of input order", () => {
    const rows: SearchResultRow[] = [
      row("decision", "d1"),
      row("account", "a1"),
      row("account", "a2"),
      row("person", "p1"),
    ];
    const groups = groupSearchResults(rows);
    expect(groups.map((group) => group.entityType)).toEqual([
      "account",
      "person",
      "decision",
    ]);
    expect(groups.find((group) => group.entityType === "account")?.rows).toHaveLength(2);
  });

  it("drops any entity type with zero matches — no empty groups", () => {
    const groups = groupSearchResults([row("loan", "l1")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entityType).toBe("loan");
  });

  it("returns no groups for an empty result set", () => {
    expect(groupSearchResults([])).toEqual([]);
  });
});
