# Spec — UI scaffold (issue #18)

React 19 + TypeScript strict + Vite + bun + Tailwind + shadcn/ui + Biome + Vitest in `ui/`, themed with
`brand/generated/tokens.css` and locally bundled fonts. The issue body (GuillaumeOj/harvey#18) is the reference;
this file records the decisions it leaves open and how the work is split.

Spec refs: `docs/SPEC.md` §6.2, §6.3, §8.1, §11, §12.1, §12.2, NFR-01, NFR-05, NFR-07.

## Deliverables

### Root (bun workspace)

- `package.json`: `"private": true`, `"workspaces": ["ui"]`, `"packageManager": "bun@1.4.2"` (the bun installed
  on the dev machine), `"trustedDependencies": []`. Dev dependencies at the root only if a root tool needs them
  (Biome lives at the root, see below).
- `bunfig.toml`: `[install] exact = true`.
- `bun.lock` committed (text lockfile). No `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`.
- `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.DS_Store`.
- `biome.json` (root) and `@biomejs/biome` as an exact root devDependency, so `bun run --cwd ui ci` and the root
  both use the same binary.
  - formatter on: 2-space indent, `lineWidth` 120, double quotes, trailing commas `all`, semicolons always.
  - linter `recommended` + `a11y` group (all recommended a11y rules on, errors).
  - organize imports on (Biome 2 `assist.actions.source.organizeImports`).
  - JSON formatting on.
  - `files.includes` excludes: `brand/generated/**`, `**/dist/**`, `**/coverage/**`, `**/node_modules/**`,
    `ui/src/bindings.ts`, `.claude/**`, `.orchestrator/**`, `brand/icon/**`.
  - Covers `brand/build-tokens.ts`. Formatting fixes there are allowed (no behaviour change, file not moved).

### `ui/`

As specified in the issue (scripts, `tsconfig.json` flags, `vite.config.ts`, `index.html`, `main.tsx`, `App.tsx`,
shadcn, Vitest). Decisions on top of it:

| Topic | Decision |
|---|---|
| Versions | Latest stable of each package at install time, exact. React 19.x, Vite current major, Tailwind 4.x via `@tailwindcss/vite`, Biome 2.x, Vitest current major + `@vitest/coverage-v8` same version, TypeScript 5.x latest. Record the chosen versions in the task report. |
| `ui/package.json` `ci` script | `biome ci .` run from `ui/` must use the root `biome.json` (Biome walks up to find it). |
| Test env | `jsdom`. |
| Fonts | **`@fontsource/*` static packages** (not `-variable`), exact-pinned: `@fontsource/inter` (400, 500, 600), `@fontsource/newsreader` (400, 400-italic, 500, 500-italic), `@fontsource/jetbrains-mono` (400, 500). Imported per weight in `ui/src/styles/fonts.css` (or `main.tsx`). Reason: static packages register the families `"Inter"`, `"Newsreader"`, `"JetBrains Mono"`, the exact names `tokens.css` uses; the `-variable` packages register `"Inter Variable"` etc. and would silently fall back. Vite bundles the woff2 files into `dist/`; no remote URL anywhere. |
| Colours | `@theme inline` maps every shadcn variable from `tokens.css` (`--color-background: var(--background)`, …, `sidebar-*`) and every Harvey colour token (`surface-*`, `texte-*`, `marque-*`, `statut-*`, `liste-*` + `-fond`, `neutre-*`) to `--color-<name>`. Tailwind's default colour palette is cleared (`--color-*: initial`) except `white`/`black`/`transparent`/`current`, so no non-brand colour can be used by accident. No hex literal in `ui/src/**`. |
| Radii | `--radius-petit/moyen/grand` → `var(--rayon-*)`. Keep shadcn's derived `--radius-sm/md/lg/xl` from `var(--radius)` so vendored components work unchanged. |
| Spacing | `--spacing-1/2/3/4/6/8: var(--espace-*)` (so `p-4` is the 16 px token); Tailwind's `--spacing` base stays 0.25rem for other steps. |
| Fonts in theme | `--font-ui`, `--font-lecture`, `--font-mono` → `var(--font-*)` from tokens; `--font-sans: var(--font-ui)` so the default body font is Inter. Body uses `bg-background text-foreground font-ui` + the `corps` text style. |
| Text styles | `@utility <name>` for each of the 10 text styles, reading **only** the CSS variables emitted by the generator (see brand task below), e.g. `font-size: var(--texte-titre-page-taille)`. No size/weight literal in `ui/`. |
| Dark mode | `@custom-variant dark` matching exactly the `tokens.css` selectors: `[data-theme="dark"]` on `<html>`, or `prefers-color-scheme: dark` when `<html>` is not `[data-theme="light"]`. |
| Motion | `--default-transition-duration: var(--duree)`, `--default-transition-timing-function: var(--courbe)`. `@media (prefers-reduced-motion: reduce)` sets transition and animation durations to 0 (and iteration count 1) on `*, ::before, ::after`. |
| shadcn | `components.json` style `new-york`, base colour irrelevant (overridden), CSS path `src/styles/globals.css`, aliases `@/components`, `@/lib/utils`, `@/components/ui`. `button` added. Any `^`/`~` the CLI writes is corrected to exact; any lockfile it creates other than `bun.lock` is deleted. `tw-animate-css` only if the button needs it. |
| Placeholder `App` | French, *vouvoiement*: heading "Harvey" (`titre-page`), one paragraph (`corps`), a primary `Button` (e.g. "Commencer"), a reference in `mono` (e.g. `2026-0001`), a small note sample in `note-corps` (Newsreader, with an italic word) so all three fonts are visible. A theme toggle is **not** required; light/dark is checked via OS appearance and `data-theme` set by hand in devtools. No `localStorage`. |
| Coverage | v8, reporters `text` + `lcov`, thresholds 90 on lines/statements/functions/branches; include `src/**`; exclude `src/bindings.ts`, `src/components/ui/**`, `src/main.tsx`, `src/test/**`, `**/*.test.{ts,tsx}`, `**/*.d.ts`. |
| Docs | `ui/README.md` (short): commands (`bun install --frozen-lockfile`, `bun run --cwd ui dev|build|typecheck|ci|test:coverage`), where tokens and fonts come from, how to add a shadcn component and re-pin. |

### `brand/` — text styles in `tokens.css` (generator extension)

`tokens.css` today emits colours, fonts, radii, spacing, shadow and motion, but not the text styles (they only reach
`HarveyTokens.swift`). To keep `brand/tokens.json` the single source (acceptance: "changing a token … changes the UI
without touching `ui/`"), `brand/build-tokens.ts` also emits, in the light `:root` block (theme-independent), for each
`text.<name>`:

```css
--texte-<name>-police: var(--font-<font>);   /* ui | lecture | mono */
--texte-<name>-taille: <size>px;
--texte-<name>-interligne: <lineHeight>px;
--texte-<name>-graisse: <weight>;
--texte-<name>-approche: <letterSpacing>;    /* only when set */
--texte-<name>-casse: <transform>;           /* only when set */
--texte-<name>-largeur-max: <maxWidth>px;    /* only when set */
```

The names do not collide with the existing `--texte-principal` / `--texte-secondaire` colour variables (all new ones
have a `-police|-taille|…` suffix). `generated/` is regenerated and committed; `--check` keeps working;
`HarveyTokens.swift` output is unchanged; `brand/README.md` mentions the text-style variables.

## Out of scope

Tauri, `@tauri-apps/api`, `bindings.ts` (#19); shell, router, i18n, formatters (#40); TanStack Query (#36); lefthook,
markdownlint (#20); CI jobs (#21); Renovate, CODEOWNERS (#22). No `api-contract.md`: there is no backend/frontend
interface in this feature.

## Work split

1. **back** — brand generator extension (`brand/build-tokens.ts`, `brand/generated/*`, `brand/README.md`). Small.
2. **front** (depends on 1, Opus) — everything else: root workspace, Biome, `ui/`. Front owns `biome.json` and may
   reformat `brand/build-tokens.ts` with Biome (formatting only). Front asks **ui** for a visual review of the
   placeholder in light and dark (fonts, colours, text styles match the brand guide) before reporting.

No design task: the placeholder is a token showcase, not a product screen (see `ux-brief.md`).

## Acceptance (lead checks on the integration branch before the PR)

- Clean checkout: `bun install --frozen-lockfile` works; only `bun.lock` exists; every version in both
  `package.json` files is exact (`grep -E '"[\^~]|"(latest|next|\*)"'` finds nothing).
- `bun run --cwd ui build`, `typecheck`, `ci`, `test:coverage` pass; thresholds at 90.
- `bun brand/build-tokens.ts --check` passes; editing a colour or a text size in `tokens.json` + regenerating
  changes the built CSS with no change under `ui/`.
- Built `ui/dist/` contains the woff2 files and no `http(s)://` font/CDN URL (`grep -r "fonts.googleapis\|https://" ui/dist`
  shows no stylesheet/font reference).
- `Button` default variant renders with `bg-primary text-primary-foreground` (→ tokens).
- `biome.json` has recommended + a11y + organize imports.
