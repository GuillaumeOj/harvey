/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import tokens from "../../../brand/tokens.json";

// globals.css maps tokens by hand (CSS has no loops): fail when a token in brand/tokens.json is not mapped.
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const names = (record: object) => Object.keys(record).filter((key) => !key.startsWith("$"));

describe("globals.css theme mapping", () => {
  it("has a text-style utility for every text token", () => {
    for (const style of names(tokens.text)) expect(css).toContain(`@utility ${style} {`);
  });

  it("maps every colour token", () => {
    const colours = [
      ...names(tokens.shadcn),
      ...Object.entries(tokens.color).flatMap(([group, entries]) => names(entries).map((n) => `${group}-${n}`)),
      ...names(tokens.palette.liste).flatMap((n) => [`liste-${n}`, `liste-${n}-fond`]),
      ...names(tokens.palette.neutre).map((n) => `neutre-${n}`),
    ];
    for (const colour of colours) expect(css).toContain(`--color-${colour}: var(--${colour});`);
  });

  it("maps every radius, spacing step and shadow", () => {
    for (const r of names(tokens.radius)) expect(css).toContain(`--radius-${r}: var(--rayon-${r});`);
    for (const s of names(tokens.space)) expect(css).toContain(`--spacing-${s}: var(--espace-${s});`);
    for (const s of names(tokens.shadow)) expect(css).toContain(`--shadow-${s}: var(--ombre-${s});`);
  });
});
