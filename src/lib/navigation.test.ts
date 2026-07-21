import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./navigation";

describe("isNavItemActive", () => {
  it("matches the dashboard only on an exact path", () => {
    expect(isNavItemActive("/app", "/app")).toBe(true);
    expect(isNavItemActive("/app/accounts", "/app")).toBe(false);
  });

  it("matches a section on its own path and any nested path", () => {
    expect(isNavItemActive("/app/accounts", "/app/accounts")).toBe(true);
    expect(isNavItemActive("/app/accounts/123", "/app/accounts")).toBe(true);
  });

  it("does not match a different section, including one with a shared prefix", () => {
    expect(isNavItemActive("/app/accounts", "/app/accounts-old")).toBe(false);
    expect(isNavItemActive("/app/goals", "/app/accounts")).toBe(false);
  });
});
