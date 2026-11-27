import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/App";

afterEach(() => clearMocks());

const mockInfo = () => mockIPC((cmd) => (cmd === "app_info" ? { version: "0.1.0", build_channel: "dev" } : undefined));

describe("App", () => {
  it("renders the French heading", () => {
    mockInfo();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Harvey" })).toHaveClass("titre-page");
  });

  it("exposes the primary button by role and name", async () => {
    mockInfo();
    render(<App />);
    const button = screen.getByRole("button", { name: "Commencer" });
    expect(button).toHaveClass("bg-primary", "text-primary-foreground");
    await userEvent.tab();
    expect(button).toHaveFocus();
  });

  it("shows the reading and mono text styles", () => {
    mockInfo();
    render(<App />);
    expect(screen.getByText("2026-0001")).toHaveClass("mono");
    expect(screen.getByText("exactement").closest("p")).toHaveClass("note-corps");
  });

  it("shows a loading state, then the version and channel", async () => {
    mockInfo();
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
    expect(await screen.findByText("Version 0.1.0 · dev")).toHaveClass("mono");
  });

  it("shows the French error message when app_info fails", async () => {
    mockIPC(() => Promise.reject({ kind: "maintenance" }));
    render(<App />);
    expect(await screen.findByText("Harvey est en maintenance. Réessayez dans un instant.")).toBeInTheDocument();
  });

  it("falls back to the internal message on an ACL denial", async () => {
    mockIPC(() => Promise.reject("denied"));
    render(<App />);
    expect(await screen.findByText("Une erreur inattendue est survenue.")).toBeInTheDocument();
  });
});
