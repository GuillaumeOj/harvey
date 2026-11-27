# Harvey brand

Direction: **Bordeaux & Pierre** — oxblood primary, muted sage accent, limestone neutrals; Inter (UI), Newsreader (long notes), JetBrains Mono (references, amounts).

The full style guide (voice, colour, type, icons, components, tokens) lives on the **Brand guide** page of the project's figcraft file, where colours are variables (`Harvey · Couleurs`, modes Clair / Sombre) and sizes are `Harvey · Dimensions`. Logo and app icon are not defined yet (dedicated work, spec §8.2).

## Files

| File | What |
| --- | --- |
| `tokens.json` | Single source of truth for code: colours (light/dark), list palette, fonts, text styles, radii, spacing, shadow, motion, shadcn/ui mapping. |
| `build-tokens.ts` | Validates `tokens.json` and generates the files below. |
| `generated/tokens.css` | CSS variables + shadcn/ui aliases. Light on `:root`; dark via `prefers-color-scheme` or `[data-theme="dark"]`. Also carries the text styles as `--texte-<style>-*` variables. |
| `generated/HarveyTokens.swift` | SwiftUI constants for the widget; colours resolve to light/dark from the current appearance. |

## Changing a token

1. Change the variable in figcraft (so the guide stays accurate).
2. Change the same value in `tokens.json`.
3. Run `bun brand/build-tokens.ts` and commit the generated files.

`bun brand/build-tokens.ts --check` exits non-zero when `generated/` is out of date (for CI).

Every text/background pair in `tokens.json` passes WCAG 2.1 AA (≥ 4.5:1) in both themes; keep it that way when changing values.

Fonts are SIL OFL 1.1 and must be bundled with the app (Inter, Newsreader, JetBrains Mono).
