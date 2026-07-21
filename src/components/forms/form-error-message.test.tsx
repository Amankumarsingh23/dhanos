import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormErrorMessage } from "./form-error-message";

describe("FormErrorMessage", () => {
  it("renders the message when provided", () => {
    render(<FormErrorMessage message="Email is required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Email is required");
  });

  it("renders nothing when there is no message", () => {
    const { container } = render(<FormErrorMessage message={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
