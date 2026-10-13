# aain-hub-template — the chapter website every chapter forks

Vite + vanilla TypeScript + plain CSS. No framework, no CSS library — keep it that way.
Data comes from the dashboard's public bundle (`src/lib/bundle.ts`); content comes from
`aain-content`. Chapter identity, theme and feature flags live in `hub.config.json`.
`README.md` covers setup and hosting. This file is the house style.

## Map

```
src/main.ts            chapter site entry: config, theme, tabs, mounts the views
src/views/<tab>.ts     one file per nav tab (about, events, members, projects, learn, sponsor)
src/lib/*.ts           shared helpers (html escaping, format, bundle types, net, slug)
src/portfolio.ts       member profile page (portfolio.html), its own entry
src/article.ts         article page (article.html)
src/styles/hub.css     chapter site styles
src/styles/article.css article page styles
src/styles/portfolio.css  profile page styles, loaded alone (never with hub.css)
```

## Building something new — copy, don't invent

- New tab or section: copy the shape of `src/views/events.ts`. It opens with a block comment
  that states the rules the view follows, exports small pure `render…(): string` helpers,
  and one `mount…View(ctx: ViewCtx)` that writes to the DOM.
- HTML is built from template strings. Every value from data goes through `escapeHtml` /
  `escapeAttr` from `src/lib/html.ts`. No exceptions.
- Event links always come from `eventPageHref()` in `src/event-page.ts`; never build URLs by hand.
- New behaviour that a chapter might not want is a flag in `hub.config.json` → `features`.

## Colour and contrast rules

- Tokens only (`:root` at the top of `hub.css`). No raw hex in new rules, no new radii.
- Chapter colour flows through `--color-primary` / `--color-accent` (+ `-rgb` twins), set at
  runtime by `main.ts`. Never hardcode a chapter colour.
- An officer-typed colour can be anything. Before it touches text, run it through
  `deriveAccent()` / `contrastRatio()` in `src/accent.ts` (profile page: `portfolio-colors.ts`).
  A colour that can't be made readable falls back or is dropped, never invented.
- Text ladder on `--bg-base #0a0a0b`:
  - `--text-primary` (~18:1) headings · `--text-secondary` (~8:1) body
  - `--text-tertiary` (~3.9:1) is below AA for body text: meta and decoration only.
- Colour is never the only signal. Empty data means the section is absent, never a "0".
- Profile page: solid fills only, no gradient, glow or blur; nothing loops.

## Code habits

- A block comment above non-obvious code says *why*, in plain sentences. Match it.
- TypeScript everywhere, no `any` unless there is no other way.
- `npm run build` (runs `tsc`) must pass before a PR.

## UI copy

Plain English, second person, present tense, short. No "simply", "just", "easy". Don't print
claims you can't back up. Full guide: `aain-content/STYLE_GUIDE.md` §7 (Tone and Voice).

## Git

- Never commit to `main`. Branch first: `feature/…`, `fix/…`, `research/…`, `experiment/…`.
- Small commits, one idea each. Subject is a plain-English sentence about what changed for
  the visitor. `CONTRIBUTING.md` mentions `feat:` prefixes, but the history doesn't use them;
  follow the history. Real examples from `git log`:
  - `Member card: Tab out of the card returns to the name`
  - `Join is one menu, and the invite is behind the sign-up`
- Never commit `plans/`; plans stay local. Merge to `main` through a PR.
