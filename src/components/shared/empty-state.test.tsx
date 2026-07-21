import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(
      <EmptyState
        title="Nothing here"
        description="Add your first item to get started."
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(
      screen.getByText("Add your first item to get started."),
    ).toBeInTheDocument();
  });

  it("renders the action when provided", () => {
    render(
      <EmptyState title="Nothing here" action={<button>Add item</button>} />,
    );
    expect(
      screen.getByRole("button", { name: "Add item" }),
    ).toBeInTheDocument();
  });

  it("omits the description when not provided", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByText(/get started/)).not.toBeInTheDocument();
  });
});
