import { describe, expect, it } from "vitest";
import type { AppError } from "@/bindings";
import { errorMessages, isAppError, messageFor } from "@/lib/errors";

const kinds: AppError[] = [
  { kind: "not_found" },
  { kind: "validation", field: "siren", key: "validation.siren.invalid" },
  { kind: "conflict", key: "conflict.note" },
  { kind: "permission_denied", resource: "calendar" },
  { kind: "calendar_unavailable" },
  { kind: "maintenance" },
  { kind: "schema_mismatch" },
  { kind: "storage" },
  { kind: "internal" },
];

describe("errors", () => {
  it("has a French message for each of the 9 kinds", () => {
    expect(Object.keys(errorMessages)).toHaveLength(9);
    for (const error of kinds) expect(messageFor(error)).toBe(errorMessages[`error.${error.kind}`]);
  });

  it("never puts identifiers in the message", () => {
    expect(messageFor({ kind: "permission_denied", resource: "calendar" })).toBe("Accès refusé.");
    expect(messageFor({ kind: "validation", field: "siren", key: "k" })).not.toContain("siren");
  });

  it("recognises only known kinds", () => {
    expect(kinds.every(isAppError)).toBe(true);
    for (const bad of ["denied", null, 4, {}, { kind: 3 }, { kind: "nope" }, { kind: "toString" }]) {
      expect(isAppError(bad)).toBe(false);
    }
  });
});
