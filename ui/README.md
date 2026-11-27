# Harvey UI

React 19 + TypeScript (strict) + Vite + Tailwind CSS 4 + shadcn/ui, loaded by the Tauri WKWebView
(dev server `http://localhost:1420`, build output `ui/dist`).

## Commands

bun is the only package manager and runner. Install once, from the repository root:

```sh
bun install --frozen-lockfile
```

Then, from the repository root:

| Command | What it does |
|---|---|
| `bun run --cwd ui dev` | Vite dev server on port 1420 (fails if the port is taken) |
| `bun run --cwd ui build` | `tsc --noEmit` then `vite build` into `ui/dist` (target Safari 17) |
| `bun run --cwd ui typecheck` | TypeScript, strict |
| `bun run --cwd ui check` / `check:fix` | Biome format + lint + organised imports (root `biome.json`) |
| `bun run --cwd ui ci` | Biome in CI mode (read-only) |
| `bun run --cwd ui test` / `test:watch` | Vitest (jsdom + Testing Library) |
| `bun run --cwd ui test:coverage` | Vitest with v8 coverage, 90 % thresholds |

## Tokens

`src/styles/globals.css` imports `brand/generated/tokens.css` directly (never copy it). The tokens are generated from
`brand/tokens.json` by `bun brand/build-tokens.ts`: change the token there, regenerate, and the UI follows with no change
under `ui/`. `globals.css` only maps the variables to Tailwind:

- colours: shadcn names (`bg-primary`, `text-muted-foreground`, `border-border` …) and Harvey names (`bg-marque-primaire`,
  `text-statut-erreur`, `bg-liste-sauge-fond` …). Tailwind's default palette and type scales (`text-sm`, `font-bold`, `leading-*`, `tracking-*` …) are removed: only
  brand colours and the text styles below exist.
- radii `rounded-petit|moyen|grand`, spacing steps 1/2/3/4/6/8 (`p-4` = `--espace-4`), fonts `font-ui|lecture|mono`.
  The spacing steps drive every utility on those steps, sizes included (`h-8`, `size-4` …): changing a spacing token
  also resizes those elements.
- text styles as utilities: `titre-page`, `titre-section`, `titre-carte`, `corps`, `corps-fort`, `legende`, `note-titre`,
  `note-corps`, `mono`, `mono-petit`.
- dark mode: OS appearance, or `data-theme="dark"` / `"light"` on `<html>`; the `dark:` variant uses the same selectors.
- `prefers-reduced-motion: reduce` turns transitions and animations off.

Never write a hex colour, px size or font weight for a brand value in `ui/src`: add or change a token instead.

## Fonts

Inter (400/500/600), Newsreader (400/500 + italic) and JetBrains Mono (400/500), SIL OFL 1.1, come from the static
`@fontsource/*` packages (imported in `src/styles/fonts.css`). Vite bundles the `woff2` files into `dist/`; nothing is
loaded from the network. Do not switch to the `@fontsource-variable/*` packages: they register different family names
("Inter Variable" …) and the tokens would silently fall back to system fonts.

## shadcn/ui components

Components are vendored under `src/components/ui/` (`components.json`: style `new-york`, aliases `@/components`,
`@/lib/utils`). To add one:

```sh
cd ui && bunx --bun shadcn@<exact version> add <component>
```

Then check what the CLI changed before committing:

- every new dependency in `ui/package.json` must be an exact version (remove any `^` or `~`), then run `bun install` to
  update `bun.lock`;
- delete any `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml` it created;
- revert any edit to `src/styles/globals.css` (the theme comes from the tokens);
- replace default Tailwind type classes (`text-sm`, `font-medium` …, which no longer generate CSS) with the brand
  text styles;
- `cn()` (`src/lib/utils.ts`) knows the brand radii, shadow, fonts and text styles; extend it when adding a theme key.
