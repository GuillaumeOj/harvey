import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b", { c: true, d: false })).toBe("a b c");
  });

  it("lets the last conflicting Tailwind class win", () => {
    expect(cn("p-2 bg-primary", "p-4")).toBe("bg-primary p-4");
  });

  it("knows the brand radii, shadow and fonts", () => {
    expect(cn("rounded-md", "rounded-grand")).toBe("rounded-grand");
    expect(cn("shadow-xs", "shadow-flottant")).toBe("shadow-flottant");
    expect(cn("font-ui", "font-lecture")).toBe("font-lecture");
  });

  it("treats text styles as one group that overrides font utilities", () => {
    expect(cn("corps-fort", "corps")).toBe("corps");
    expect(cn("font-mono uppercase", "legende")).toBe("legende");
  });
});
