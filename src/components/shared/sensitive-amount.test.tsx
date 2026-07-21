import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrivacyProvider, usePrivacy } from "./privacy-provider";
import { SensitiveAmount } from "./sensitive-amount";

function ToggleButton() {
  const { toggle } = usePrivacy();
  return (
    <button type="button" onClick={toggle}>
      Toggle privacy
    </button>
  );
}

describe("SensitiveAmount", () => {
  it("shows the value when privacy mode is off", () => {
    render(
      <PrivacyProvider initialConcealed={false}>
        <SensitiveAmount value="₹4,00,000.00" />
      </PrivacyProvider>,
    );

    expect(screen.getByText("₹4,00,000.00")).toBeInTheDocument();
  });

  it("conceals the value when privacy mode is on, with an accessible label", () => {
    render(
      <PrivacyProvider initialConcealed={true}>
        <SensitiveAmount value="₹4,00,000.00" />
      </PrivacyProvider>,
    );

    expect(screen.queryByText("₹4,00,000.00")).not.toBeInTheDocument();
    expect(screen.getByText("Amount hidden")).toBeInTheDocument();
  });

  it("toggles between concealed and revealed", async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider initialConcealed={false}>
        <SensitiveAmount value="₹1,234.00" />
        <ToggleButton />
      </PrivacyProvider>,
    );

    expect(screen.getByText("₹1,234.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle privacy" }));
    expect(screen.queryByText("₹1,234.00")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle privacy" }));
    expect(screen.getByText("₹1,234.00")).toBeInTheDocument();
  });

  it("persists the preference to a cookie on toggle", async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider initialConcealed={false}>
        <ToggleButton />
      </PrivacyProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Toggle privacy" }));
    expect(document.cookie).toContain("dhanos-privacy=1");

    await user.click(screen.getByRole("button", { name: "Toggle privacy" }));
    expect(document.cookie).toContain("dhanos-privacy=0");
  });
});
