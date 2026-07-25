import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightedText } from "./highlight";

describe("HighlightedText", () => {
  it("wraps the matched substring in a <mark>, case-insensitively", () => {
    const { container } = render(
      <HighlightedText text="Zerodha Trading Account" query="zerodha" />,
    );
    const mark = container.querySelector("mark");
    expect(mark?.textContent).toBe("Zerodha");
    expect(container.textContent).toBe("Zerodha Trading Account");
  });

  it("returns the plain text unchanged when there is no match", () => {
    const { container } = render(
      <HighlightedText text="Priya Sharma" query="xyz" />,
    );
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Priya Sharma");
  });

  it("returns the plain text unchanged for an empty query", () => {
    const { container } = render(<HighlightedText text="Priya Sharma" query="  " />);
    expect(container.querySelector("mark")).toBeNull();
  });

  it("never interprets the record's own text as markup — a literal <script> stays plain text", () => {
    const { container } = render(
      <HighlightedText text="<script>alert(1)</script> Fund" query="fund" />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("Fund");
  });
});
