import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isStale, StaleDataIndicator } from "./stale-data-indicator";

function renderWithTooltipProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("isStale", () => {
  it("is not stale just now", () => {
    expect(isStale(new Date())).toBe(false);
  });

  it("is stale after the default 24 hour threshold", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    expect(isStale(twoDaysAgo)).toBe(true);
  });

  it("respects a custom threshold", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(isStale(oneHourAgo, 2)).toBe(false);
    expect(isStale(oneHourAgo, 0.5)).toBe(true);
  });
});

describe("StaleDataIndicator", () => {
  it("labels a fresh value as Updated", () => {
    renderWithTooltipProvider(<StaleDataIndicator asOf={new Date()} />);
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });

  it("labels an old value as Stale", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    renderWithTooltipProvider(<StaleDataIndicator asOf={twoDaysAgo} />);
    expect(screen.getByText(/Stale/)).toBeInTheDocument();
  });
});
