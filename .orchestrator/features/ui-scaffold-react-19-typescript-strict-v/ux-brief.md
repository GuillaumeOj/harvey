# UX brief — UI scaffold placeholder (issue #18)

No new design is produced for this feature. The only screen is a throw-away placeholder that proves the toolchain,
the tokens and the fonts; the product shell comes with #40.

## Placeholder content (French, vouvoiement)

Centred column on `bg-background`, max width ~680 px, `p-8`, vertical gap `espace-4`:

1. "Harvey" — `titre-page`.
2. One sentence in `corps` (`text-muted-foreground` allowed), e.g. "Votre cabinet, vos dossiers, votre temps — au même endroit."
3. A sample in `note-corps` (Newsreader) with one *italic* word.
4. A reference in `mono`, e.g. `2026-0001`.
5. A primary shadcn `Button`, e.g. "Commencer".

## Review by ui

Before front reports, **ui** checks the running dev server (or screenshots) in light and dark — OS appearance and
`data-theme="dark"` / `"light"` on `<html>` — against the Brand guide page of the figcraft file:
Inter / Newsreader / JetBrains Mono actually render (not fallbacks), colours and text styles match the tokens,
button uses the oxblood primary, focus ring uses the sage accent, reduced motion disables the button transition.
