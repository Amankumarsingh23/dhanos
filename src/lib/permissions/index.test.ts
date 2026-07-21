import { describe, expect, it } from "vitest";
import { can } from "./index";

describe("can", () => {
  it("lets an owner read, write, manage members, and manage household settings", () => {
    expect(can("owner", "read")).toBe(true);
    expect(can("owner", "write")).toBe(true);
    expect(can("owner", "manage_members")).toBe(true);
    expect(can("owner", "manage_household")).toBe(true);
  });

  it("lets an admin do everything an owner can", () => {
    expect(can("admin", "read")).toBe(true);
    expect(can("admin", "write")).toBe(true);
    expect(can("admin", "manage_members")).toBe(true);
    expect(can("admin", "manage_household")).toBe(true);
  });

  it("lets an editor read and write, but not manage members or settings", () => {
    expect(can("editor", "read")).toBe(true);
    expect(can("editor", "write")).toBe(true);
    expect(can("editor", "manage_members")).toBe(false);
    expect(can("editor", "manage_household")).toBe(false);
  });

  it("only lets a viewer read", () => {
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "write")).toBe(false);
    expect(can("viewer", "manage_members")).toBe(false);
    expect(can("viewer", "manage_household")).toBe(false);
  });
});
