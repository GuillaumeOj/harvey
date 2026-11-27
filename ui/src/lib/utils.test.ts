import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b", { c: true, d: false })).toBe("a b c");
  });

  it("lets the last conflicting Tailwind class win", () => {
    expect(cn("p-2 bg-primary", "p-4")).toBe("bg-primary p-4");
  });
});
