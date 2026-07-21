import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders the last item as the current page without a link", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Accounts", href: "/accounts" },
          { label: "Checking" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/accounts",
    );

    const current = screen.getByText("Checking");
    expect(current).toHaveAttribute("aria-current", "page");
  });
});
