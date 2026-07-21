import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Explicit-import test files don't get RTL's automatic afterEach cleanup
// (it only self-registers when it detects test-framework globals), so
// without this, Radix portals (Dialog, Tooltip) leak into document.body
// across tests in the same file.
afterEach(() => {
  cleanup();
});
