import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/App";

describe("App", () => {
  it("renders the French heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Harvey" })).toHaveClass("titre-page");
  });

  it("exposes the primary button by role and name", async () => {
    render(<App />);
    const button = screen.getByRole("button", { name: "Commencer" });
    expect(button).toHaveClass("bg-primary", "text-primary-foreground");
    await userEvent.tab();
    expect(button).toHaveFocus();
  });

  it("shows the reading and mono text styles", () => {
    render(<App />);
    expect(screen.getByText("2026-0001")).toHaveClass("mono");
    expect(screen.getByText("exactement").closest("p")).toHaveClass("note-corps");
  });
});
