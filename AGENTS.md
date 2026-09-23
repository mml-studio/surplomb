# Agent instructions

Read by coding agents (Claude Code through `CLAUDE.md`, Codex, others) before
they touch this repository. Humans: [CONTRIBUTING.md](CONTRIBUTING.md) says the
same things at more length.

## Language

- **Write everything in English:** code, comments, docs, commit messages,
  pull-request titles and bodies. Answer the person you work for in their own
  language — that is conversation, not repository content.
- **Visible strings are bilingual.** French is the default locale, English the
  second. A string the reader sees lives in the module's `<module>.i18n.js`
  catalog as `{ fr, en }`; never hard-code one in either language. Until a
  module is migrated, leave its French strings where they are.
- **Use [`docs/GLOSSARY.md`](docs/GLOSSARY.md)** for every French term
  (*commune* → *municipality*, *DVF* → *property sales (DVF)*). A missing term
  goes into the section of its domain in the same pull request — except during
  a parallel translation wave, where batches list new terms in their PR body and
  the glossary is updated once, between waves.
- **Do not rewrite history.** Commits and pull requests before 2026-09-19 are
  mostly French; leave them. The `English` check fails a pull request whose
  title or own commits read as French (`node scripts/check-english.mjs --base
  origin/main --head HEAD --title "…"` runs it locally).

## Commits and pull requests

- A commit subject says what the reader saw and what changed, in one sentence:
  *"Links to Lyon opened sales on an empty map: camera rounding noise no longer
  blocks moveEnd"*. The body argues the decision in prose, with the numbers that
  were measured.
- **`gh` needs `--repo mml-studio/surplomb` on every call.** The repository is a
  fork, and without the flag `gh` resolves to the upstream
  `bilawalsidhu/gods-eye-view` — including `gh pr create`.
- Branch from a fresh `origin/main` and rebase before pushing; `CHANGELOG.md`
  and `docs/CURRENT-STATE.md` conflict on almost every pull request, and both
  sides of such a conflict are kept.
- Fill the [pull-request template](.github/pull_request_template.md).

## Before you push

1. `npm test` and `TZ=UTC npm test` (CI runs Node 24 in UTC and Node 26 in
   Europe/Paris).
   A failure in a file your diff does not touch: run `gh run list --repo
   mml-studio/surplomb --branch main --limit 1` before anything else. If main
   is green, the cause is your machine — a key in `.env`, a missing tool — not
   main; do not check main out again to prove it. Fix the test so it no
   longer depends on that, in its own pull request.
2. `npm run build` whenever `index.html`, a CSS file or anything Vite
   transforms changed: `npm test` parses neither CSS nor HTML.
3. `npm run layers:manifest:check` when a layer module changed.
4. The repository is **public**: `git diff origin/main | grep -nE "gmail|hotmail|outlook"`
   must print nothing. No personal address, account name or keychain entry in
   a tracked file.
5. If runtime behavior changed, update `docs/CURRENT-STATE.md` and
   `CHANGELOG.md` (English entries under `[Unreleased]`).

## Browser harnesses

- Open pages with `newQaPage(browser)` from `scripts/lib/qa-first-run.mjs`,
  never `browser.newPage()`: it handles the first-run card and keeps the run
  off the metered 3D tiles.
- By hand: `http://localhost:4173/globe?welcome=0&photoreal=0`.

## Where things are

- `docs/CURRENT-STATE.md` is the runtime reference; read it first.
- `src/ui.js` holds panels and HUD; `src/data/<layer>.js` holds one layer each;
  the server-side proxies live in `vite.config.js`.
- `DATA_SOURCES.md` records the license of every source; a new source is not
  done until it is there.
