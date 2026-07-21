/**
 * Role-based permission matrix for household-scoped data, matching
 * docs/security-model.md §3. This is advisory for the UI (e.g. hiding a
 * "delete" button); Row Level Security is the actual enforcement point and
 * must independently reject anything this check would have blocked.
 */
export type HouseholdRole = "owner" | "admin" | "editor" | "viewer";

export type HouseholdAction =
  "read" | "write" | "manage_members" | "manage_household";

const PERMISSION_MATRIX: Record<HouseholdRole, ReadonlySet<HouseholdAction>> = {
  owner: new Set(["read", "write", "manage_members", "manage_household"]),
  admin: new Set(["read", "write", "manage_members", "manage_household"]),
  editor: new Set(["read", "write"]),
  viewer: new Set(["read"]),
};

export function can(role: HouseholdRole, action: HouseholdAction): boolean {
  return PERMISSION_MATRIX[role].has(action);
}
