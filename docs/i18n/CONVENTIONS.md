# i18n conventions — how a module becomes bilingual

Surplomb speaks French by default and English as its second language. This page
is everything a translation batch needs besides [`docs/GLOSSARY.md`](../GLOSSARY.md),
which fixes the vocabulary. Read both before touching a file; the rules below
are enforced by tests, and the tests tell you which rule you broke.

Two promises hold everything together:

1. **French does not move.** A migrated module prints, in French, exactly the
   bytes it printed before. The ~1,400 French assertions in the test suite pass
   untouched; if one fails, the migration is wrong, not the test.
2. **Messages are read when drawing, never when loading.** Every string is
   fetched from its catalog inside the function that draws it. That is what
   lets one page switch language by reloading, and one test switch language by
   calling `useTestLocale('en')`.

## 1. How the page knows its language

- The inline `/* locale-gate */` script in `index.html` decides before any
  stylesheet or module runs, and writes the answer on `<html lang>`. Order:
  `window.__GEV_LOCALE__` (QA) › `?lang=fr|en` (remembered in `localStorage`
  under `gev:locale:v1`) › the stored choice › `navigator.languages` (off
  until the language switch ships) › French.
- Every module reads the locale with `getLocale()` from `src/i18n/locale.js`,
  which reads `<html lang>` and nothing else. **Never read `navigator.language`**:
  Node 24+ has one, and a module that read it would turn `npm test` English on
  an en-US CI runner. Under Node, `getLocale()` is French unless a test says
  otherwise.
- Changing language is `switchLocale('en', { shareLink })` (`src/i18n/switch.js`):
  store the choice, flush the share hash, drop `?lang=`, reload. The hash
  restores camera, layers and panels. No module ever repaints itself in another
  language.
- To look at English by hand: open `/globe?lang=en` (it is remembered; `?lang=fr`
  to come back).

## 2. Catalogs

A module `src/data/foo.js` keeps its visible strings in **`src/data/foo.i18n.js`**,
next to it. One catalog per module, default export, built with `defineMessages`:

```js
// src/data/foo.i18n.js
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  replay: { fr: '↺ Rejouer', en: '↺ Replay', note: 'The cursor is on the last detection.' },
  dayOf: {
    fr: (day, days) => `jour ${day} sur ${days}`,
    en: (day, days) => `day ${day} of ${days}`,
    sample: [4, 10],
  },
  legend: {                       // groups nest as deep as you like
    fronts: { fr: 'front de feu actif', en: 'active fire front' },
  },
});
```

A **leaf** is an object with an own `fr` key. It may carry:

| key | required | what it is |
|---|---|---|
| `fr` | yes | The French, byte for byte what the module printed. |
| `en` | yes | The English. Same type as `fr`. |
| `note` | no | Context for whoever translates it next: what the button does, what a placeholder holds. Write one whenever the key alone would not tell you. |
| `sample` | for functions | The arguments the parity test renders the function with. Realistic values (`[4, 10]`, `['Jul 24 09:05']`). |
| `keep` | no | French proper nouns this message keeps in English that the glossary does not list (a place name: `keep: ['Saint-Médard-en-Jalles']`). |

Values are **strings**, **functions** (interpolation, plurals, agreement) or
**arrays of strings** (static tables such as month names). Rules for functions:

- same number of parameters in `fr` and `en` — the parity test compares
  `.length`, so **no default parameters**;
- parameters arrive **already formatted**: pass `formatNumber(x)`, not `x`. A
  message places words around values; it does not format them;
- one message per sentence, not per fragment. Word order differs between the
  languages (`${month} ${day}` against `${day} ${month}`); a sentence cut into
  concatenated pieces cannot be translated.

### Reading a catalog

```js
import messages from './foo.i18n.js';

function drawRow(state) {
  const m = messages();                 // the page's locale, resolved once and cached
  chip.label = m.replay;
  line.textContent = m.dayOf(state.day, state.days);
}
```

**Never at module top level** (ratchet R5, held at zero):

```js
const LABEL = messages().replay;                  // ✗ read at load
export default { name: messages().name };         // ✗ same thing
export default { get name() { return messages().name; } };   // ✓ a getter
const label = () => messages().replay;            // ✓ a function
```

A constant table of labels (`const LEVELS = [{ label: 'Faible' }, …]`) becomes
a function, or keeps its keys and looks labels up when drawing.

## 3. Worked example: the Gironde megafire layer

The pilot migrated three modules end to end: `src/data/megafirePack.js`,
`src/data/megafireClock.js` and `src/data/girondeMegafire.js`, each with its
`.i18n.js` and an `.en.test.mjs`. Before, the legend of `girondeMegafire.js`:

```js
legend.push({
  label: `périmètre au ${step.label}`,
  blurb: `${step.burntHa.toLocaleString('fr-FR')} ha brûlés, relevés par Copernicus EMS sur `
    + `une image ${step.sensor} du ${step.label} UTC. Le chiffre est celui du publieur, `
    + 'jamais recalculé sur le dessin.',
});
```

After, in the module:

```js
const m = messages();                                   // inside getRowControls()
const stepLabel = (step) => megafireStepLabel(Date.parse(step.acq));
legend.push({
  label: m.legend.perimeter(stepLabel(step)),
  blurb: m.legend.perimeterBlurb(formatNumber(step.burntHa), step.sensor, stepLabel(step)),
});
```

and in `girondeMegafire.i18n.js`:

```js
perimeterBlurb: {
  fr: (hectares, sensor, stamp) => `${hectares} ha brûlés, relevés par Copernicus EMS sur `
    + `une image ${sensor} du ${stamp} UTC. Le chiffre est celui du publieur, `
    + 'jamais recalculé sur le dessin.',
  en: (hectares, sensor, stamp) => `${hectares} ha burned, as mapped by Copernicus EMS on `
    + `a ${sensor} image of ${stamp} UTC. The figure is the publisher’s own, `
    + 'never recomputed from the drawing.',
  sample: ['5,775.4', 'Sentinel-2', 'Jul 24 09:05'],
},
```

Four things to copy from it:

- **The French string was moved, not retyped** — same concatenation, same
  spaces, same apostrophes. `formatNumber` replaced `toLocaleString('fr-FR')`
  because it prints the same bytes in French.
- **The step label is DATA.** `megafirePack.js` stores `label: '24 juil. 09:05'`
  for each satellite frame, and the build writes it into `event.json`, where the
  QA harness matches chips against it. That value stays French and stays put
  (inside an `i18n-ignore` block, see § 4). What the reader sees is computed
  from the instant, `megafireStepLabel(Date.parse(step.acq))`, which prints
  `24 juil. 09:05` in French — equal to the stored value, and a test says so —
  and `Jul 24 09:05` in English.
- **Proper nouns stay**: `Copernicus EMS`, `EFFIS`, `FIRMS`, `Pléiades Neo`.
- **The English test covers the whole surface a reader sees**, through the real
  module: `src/data/girondeMegafire.en.test.mjs` loads the layer on a viewer
  double, reads chips, legend and stats with `withLocale('en', …)`, runs
  `assertNoFrench` over all of it, pins the key sentences, and pins a few French
  ones in the same file to prove one loaded layer answers in both languages.

Result: R1 53 → 1 (the layer's `name`, which belongs to the registry batch),
R2 33 → 0, R4 3 → 0 over the three files; French output byte-identical in the
eight cursor states captured before and after.

## 4. Data is not a label

Values that come from data — a DVF `type_local`, a crime category joined from
the CSV, a GTFS route name, a share-link token (`poste`, `tous`, `mardi`), a
value persisted in a pack — **stay as they are**, in code, in caches, in links.
Only their display is translated, with `labelFor`:

```js
const TYPE_LOCAL = defineMessages({
  Appartement: { fr: 'Appartement', en: 'Apartment' },
  Maison: { fr: 'Maison', en: 'House' },
  Dépendance: { fr: 'Dépendance', en: 'Outbuilding' },
});
cell.textContent = labelFor(TYPE_LOCAL, row.type_local);   // unknown value → shown raw
```

The ratchets would count those French data literals. Mark them, and say why in
a comment:

```js
'Appartement', // i18n-ignore-line
// i18n-ignore-next-line
const TOKENS = ['poste', 'tous'];
// i18n-ignore-start — persisted data values (sensor names, French labels)
…
// i18n-ignore-end
```

The escape hatch exists for data only. Prose under an `i18n-ignore` is a
review finding — with one standing exception, marked as such wherever it
appears: text **read by the model and never by a reader** (a voice tool's
`note`, a spoken alias). A tool contract is a protocol, and a protocol that
changed language per page is one the routing bench could never pin.

A marker names a **statement**, not a row of characters: the reason it carries
may wrap onto a second comment line, and the declaration it points at may wrap
onto a third. It never reaches into a function body — write the extent out
with `i18n-ignore-start`/`end` when that is what you mean.

### The layer registry's own three fields

Every layer module opens with `{ id, name, icon, source, … }`, in French,
under one `i18n-ignore` block per file that points at the header of
`src/data/layerTaxonomy.i18n.js`. None of those strings is what the panel
prints: `name` and `source` are the **generator's input** (`npm run
layers:manifest` derives `layerManifest.js`, `DATA_SOURCES.md` and the
README's table from them) and the panel's **fallback** for a layer with no
taxonomy row. What a reader sees is `labels[id]` and `sources[id]` in the
taxonomy's catalog. One explanation, one pointer, thirty markers — do not
write a thirty-first argument.

## 5. Numbers, dates, plurals: `src/i18n/format.js`

Every function takes an options object whose extra keys go to `Intl`, plus
`locale` (defaults to the page's) and `plainSpaces: true` (every U+00A0 and
U+202F becomes an ASCII space — for the modules that already flattened them by
hand, and the only way to get the same bytes out of Node's ICU and a
browser's). `Intl` objects are cached; call these in hot loops freely.

| Before | After | French | English |
|---|---|---|---|
| `x.toLocaleString('fr-FR', o)` | `formatNumber(x, o)` | `12 400` | `12,400` |
| `Math.round(x).toLocaleString('fr-FR')` | `formatInteger(x)` | `12 400` | `12,400` |
| `x.toLocaleString('fr-FR', { maximumFractionDigits: 1 })` | `formatDecimal(x, 1)` | `5,6` | `5.6` |
| `` `${n} %` `` | `formatPercent(points, o)` — **points** (91.3), not a ratio | `91,3 %` | `91.3%` |
| `` `${n} €` `` | `formatEuros(x, o)` — round first if the module did | `245 000 €` | `€245,000` |
| `` `${n} €/m²` `` | `formatEurosPerM2(x, o)` | `3 200 €/m²` | `€3,200/m²` |
| `` `${n} km` `` | `formatQuantity(x, 'km', o)` — unit **symbols** only | `120 km` | `120 km` |
| `d.toLocaleDateString('fr-FR', o)` | `formatDate(d, o)` — keep the `timeZone` | `19 sept. 2026` | `Sep 19, 2026` |
| `d.toLocaleTimeString('fr-FR', o)` | `formatTime(d, o)` | `14:05` | `2:05 PM` → pass `hourCycle: 'h23'` for `14:05` |
| `d.toLocaleString('fr-FR', o)` | `formatDateTime(d, o)` | | |
| `new Intl.ListFormat('fr-FR').format(a)` | `formatList(a, o)` | `a, b et c` | `a, b, and c` |
| `` `il y a ${n} min` `` | `formatAge(n, 'min')` — units `s`, `min`, `h`, `d` | `il y a 5 min` | `5 min ago` |
| a month table | `monthName(i, { style: 'short' })` | `juil.` | `Jul` |
| a weekday table (0 = Sunday) | `weekdayName(i, { style })` | `mardi` | `Tuesday` |
| `` n > 1 ? 'ventes' : 'vente' `` | `plural(n, 'vente', 'ventes')` | | |
| `` `${n} ventes` `` | `countNoun(n, one, other)` — inside a message, per language | `12 400 ventes` | `12,400 sales` |
| `` `${n}ᵉ` ``, `1ᵉʳ` | `ordinal(n, { feminine })` | `2ᵉ`, `1ʳᵉ` | `2nd`, `21st` |

Gotchas:

- **French CLDR puts 0 in the singular** (`0 vente`). A module that printed
  `0 ventes` with `n === 1 ? …` is not following French rules; keep its own
  condition inside the message to stay byte-identical.
- The English 24-hour clock (glossary rule) needs `hourCycle: 'h23'` in the
  options; the French default already is.
- `toLocaleLowerCase('fr-FR')` and `localeCompare(…, 'fr')` are case folding and
  sorting of French data. They are not display formatting: leave them.
- In a message, `countNoun` and `plural` are called with each language's own
  words: `fr: (n) => countNoun(n, 'vente', 'ventes')`,
  `en: (n) => countNoun(n, 'sale', 'sales')`.

## 6. The static shell: `index.html`

The French stays in the HTML — `index.html` is the French catalog of the shell.
An element with an English version names a key; the English lives in
`src/i18n/markup.i18n.js` under that key:

```html
<button data-i18n="panel.close" data-i18n-title="panel.closeTitle" title="Fermer le panneau">
  <span class="material-symbols-outlined">close</span> Fermer
</button>
```

```js
panel: {
  close: { fr: 'Fermer', en: 'Close' },
  closeTitle: { fr: 'Fermer le panneau', en: 'Close the panel' },
},
```

- Attributes: `data-i18n` (text), `data-i18n-aria-label`, `data-i18n-title`,
  `data-i18n-placeholder`, `data-i18n-alt`.
- `fr` repeats the HTML text (whitespace collapsed); `markup.test.mjs` fails
  when they differ or when a key has no element.
- The applicator (`src/i18n/markup.js`, called by `src/boot.js` only when the
  page is not French) rewrites an element's own text nodes and leaves element
  children alone, so an icon ligature (`.material-symbols-outlined`) survives.
  Put `data-i18n` on the element that holds the words, not on a wrapper whose
  text sits in several children.
- `<template>` contents are translated too (the first-run card).
- `translate="no"` exempts an element (a brand name, a code).
- The showcase (`#vitrine`) and `<head>` are out of scope: the landing page
  gets its own English document later.
- While an English page's markup is being translated, `style.css` hides the
  loading line (`html[lang="en"]:not([data-i18n-ready])`), so its French never
  flashes.

## 7. Server errors

The server keeps answering French prose under `error`; each error gains a
stable `code`, and the client picks the words:

```js
status.textContent = serverMessage(payload);   // src/i18n/serverMessages.js
```

Codes live in `src/i18n/serverMessages.i18n.js`. An unknown code, or none,
falls back to `payload.error`, so a client can ship before its server.

A code almost always rides on a **failed** response, and a client that bails on
`!response.ok` never reads the body that carries it — which is how eleven call
sites showed `HTTP 503` while the server was sending words. That branch is one
line:

```js
if (!response.ok) throw new Error(await serverFailureMessage(response));
if (!response.ok) {                                   // keeping the old line
  throw new Error(await serverFailureMessage(response, { fallback: `carroyage HTTP ${response.status}` }));
}
```

It is deliberately forgiving about the response it is handed: a test double for
an outage is usually `{ ok: false, status: 503 }` with no body at all, and it
falls back to `HTTP <status>` rather than throwing.

## 8. Tests

- **Leave the French tests alone.** They run in French (the default) and must
  pass unchanged. A test that pins the English shell of the inherited
  interface (`'LOADING LIVE DATA'`, `'POWER UP · 8 KEYS WAITING'`) switches to
  `useTestLocale('en')` only when your change makes that shell French.
- **English coverage goes in a new file, `<module>.en.test.mjs`**, next to the
  module:

  ```js
  import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

  useTestLocale('en');                                   // the whole file in English
  test('…', (t) => { useTestLocale('en', t); … });       // or one test, restored after
  const label = withLocale('en', () => chipLabel(state)); // or one call
  assertNoFrench(layer.getRowControls(), { allow: ['Pléiades Neo'] });
  ```

  Assert the sentences a reader sees, not only the absence of French.
  `assertNoFrench` accepts a string or any object (every string inside is
  checked) and reports French words, elisions, accents and French number
  typography (`5,6`, `91,3 %`, `3 200 €`).
- A test that reads a module's SOURCE to find a French string now reads the
  `.i18n.js` next to it.
- `src/i18n/messagesParity.test.mjs` checks every catalog automatically:
  `fr` and `en` present, same type, same arity, arrays of equal length, only
  the known leaf keys, a `sample` for each function, and English with no
  French in it (glossary proper nouns and the leaf's `keep` allowed).
- To make code recognise a string in either language (a harness reading a chip,
  a parser), use `inAllLocales(catalog, 'play.replay')`.

## 9. The ratchets

`src/i18n/i18nRatchet.test.mjs` counts five things per file and fails when a
count goes **up** against `src/i18n/i18n-baseline.json`:

| Rule | Counts | Target |
|---|---|---|
| R1 | French string literals outside catalogs (words, elisions, accents) | floor |
| R2 | literals written straight into the interface, any language: `textContent =`, `innerHTML =`, `title =`, `setAttribute('aria-label' \| 'title' \| 'placeholder' \| 'alt', …)`, `append(…)`, and object keys named like labels (`label`, `title`, `blurb`, `text`, `description`, `*Label`…) | floor |
| R3 | `index.html` text and `title`/`aria-label`/`placeholder`/`alt` without `data-i18n*` | floor |
| R4 | `toLocaleString/DateString/TimeString('fr-FR')` and `Intl.*('fr-FR')` outside `src/i18n` | 0 |
| R5 | a catalog, formatter, `labelFor` or `getLocale` called at module top level | **0, always** |

Catalogs (`*.i18n.js`), `src/i18n/` and `src/vitrine/` are exempt from R1, R2
and R4 — the showcase at `/` is French BY DECISION (D2), the same decision that
exempts `<head>` and `#vitrine` from R3, and counting a page nobody is
translating would leave the ratchet a floor it can never reach. Nothing is ever
exempt from R5. Addresses (URLs, data URIs, asset paths) and lists of CSS class
tokens are not text and no rule reads them. The rules' exact definitions are at
the top of `scripts/lib/i18nScan.mjs`.

**All five counts are zero and the baseline is zero.** The ratchet is no longer
a ladder: any French literal, any hard-coded interface string, any
`toLocale*('fr-FR')` outside `src/i18n` is a failing test the moment it is
written. What French remains in `src/` is marked, and every marker says why.

```sh
npm run i18n:report                                   # totals against the baseline
npm run i18n:report -- src/data/dvfSales.js src/data/dvf   # your files, before → after
npm run i18n:report -- --details src/data/dvfSales.js       # every finding, with its line
npm run i18n:report -- --top 20                       # the heaviest files per rule
```

Run it on your files before you start and before you push, and paste both
tables in the pull request. **Do not run `npm run i18n:tighten`** in a batch:
the orchestrator lowers the baseline between waves, so parallel batches never
conflict on it. When the ratchet fails, it prints the new strings with their
lines: move them into the catalog, or, if they are data, mark them (§ 4).

## 10. QA in English

Every harness page gets its locale from `newQaPage()` (`scripts/lib/qa-first-run.mjs`):
French by default, whatever headless Chrome announces.

```sh
GEV_QA_LOCALE=en npm run qa:gironde-megafire -- --url http://127.0.0.1:41xx   # a harness on the English globe
```

or `newQaPage(browser, { locale: 'en' })` in a harness of your own. Your layer's
French harness must still pass unchanged; take English screenshots of what you
translated for the pull request. A harness that asserts on a string should
match it through `inAllLocales()` or, better, on a `data-*` attribute.

## 11. Writing the English

- Vocabulary from `docs/GLOSSARY.md`, always — its domain sections for layer
  words, and its *Cartography and data* section for the words legends and
  cards share (*spatial unit* for maille, *classification* for discrétisation,
  *dot* for pastille, *cap* for écrêtage, *vintage* for millésime). A term it
  lacks: use the closest pattern it sets, and list the new term in your pull
  request body; the glossary is updated once, between waves.
- US English: *color, meter, neighborhood, burned*. Sentence case for layer
  names and buttons; layer-group headers in capitals.
- Numbers through the formatters, never typed: `5.6 s`, `91.3%`, `€3,200/m²`,
  `Sep 19, 2026`, 24-hour clock, metric units.
- Typography: no space before `: ; ? !`; curly apostrophes (’) and quotes (“ ”)
  in interface strings; keep the product's symbols (`▶ ❚❚ ↺ ■ ·`).
- Translate meaning, not words, and keep every number and every claim. The
  French is argued and precise (“première détection”, not “start of the fire”);
  the English must make the same claim. A `note` on the leaf is where you
  record why a word was chosen.
- Proper nouns stay French with their accents (Géorisques, Île-de-France,
  Météo-France); acronyms stay and are glossed once (*property sales (DVF)*).

## 12. A batch, step by step

1. `npm run i18n:report -- <your files>` → keep the table.
2. Per module: create `<module>.i18n.js`; move each visible string into it
   (French verbatim, English per § 11); replace `toLocale*('fr-FR')` with the
   formatters; turn load-time strings into getters or functions; mark data
   with `i18n-ignore`.
3. Per module: `<module>.en.test.mjs` covering what a reader sees.
4. `TZ=UTC npm test` — every existing French test green, untouched.
5. `npm run build` if you touched `index.html` or CSS;
   `npm run layers:manifest:check` if you touched a layer.
6. Your layer's `qa:*` harness in French; screenshots with `GEV_QA_LOCALE=en`.
7. `npm run i18n:report -- <your files>` again; both tables in the PR body,
   with the new glossary terms you needed. Title and commits in English (the
   `English` check: `node scripts/check-english.mjs --base origin/main --head HEAD --title "…"`).

## 13. API reference

`src/i18n/locale.js`

- `DEFAULT_LOCALE` — `'fr'`.
- `SUPPORTED_LOCALES` — `['fr', 'en']`.
- `LOCALE_TAGS` — `{ fr: 'fr-FR', en: 'en-US' }`.
- `LOCALE_STORAGE_KEY` — `'gev:locale:v1'`.
- `LOCALE_QUERY_PARAM` — `'lang'`.
- `LOCALE_QA_GLOBAL` — `'__GEV_LOCALE__'`.
- `LOCALE_AUTO_DETECT` — `false` until the switch ships (the inline gate carries the same value).
- `I18N_READY_ATTRIBUTE` — `'data-i18n-ready'`.
- `normalizeLocale(value)` → `'fr' | 'en' | null`.
- `localeFromLanguages(languages)` → `'fr' | 'en'`.
- `resolveLocale({ qa, query, stored, languages, autoDetect })` → `{ locale, source, persist }`.
- `readLocaleSignals({ windowRef, location, navigatorRef })` → the gate's inputs (never call at import).
- `getLocale(root?)` → the page's locale, from `<html lang>`.
- `localeTag(locale?)` → `'fr-FR' | 'en-US'`.
- `setLocaleOverride(locale | null)`, `getLocaleOverride()` — tests only.

`src/i18n/messages.js`

- `defineMessages(definition)` → accessor `(locale?) => resolved`, with `.definition`.
- `isCatalog(value)`, `isMessageLeaf(node)`, `MESSAGE_LEAF_KEYS`.
- `labelFor(table, raw, { locale })` → display label of a data value, raw value if unknown.
- `inAllLocales(table, 'dotted.key', ...args)` → the message in every locale.
- `messageLeaves(definition)` → `[{ path, leaf }]`.

`src/i18n/format.js`

- `formatNumber(x, o)`, `formatInteger(x, o)`, `formatDecimal(x, digits, o)`,
  `formatPercent(points, o)`, `formatEuros(x, o)`, `formatEurosPerM2(x, o)`,
  `formatQuantity(x, unit, o)`, `formatList(items, o)`.
- `formatDate(d, o)`, `formatTime(d, o)`, `formatDateTime(d, o)`, `formatAge(n, unit, o)`.
- `monthName(i, { style, locale })`, `weekdayName(i, { style, locale })`.
- `plural(n, one, other, o)`, `countNoun(n, one, other, o)`, `ordinal(n, { feminine, locale })`.

`src/i18n/markup.js`

- `applyMarkup(root?, { locale, catalog })` → `{ applied, missing }`.
- `setElementText(element, text)`, `markMarkupReady(html?)`, `MARKUP_ATTRIBUTES`, `ICON_LIGATURE_CLASS`.

`src/i18n/switch.js`

- `switchLocale(locale, { shareLink, storage, location, history, root })` → `true` if a reload was asked.
- `rememberLocale(locale, storage?)`, `localeReloadHref(href, locale, stored)`.

`src/i18n/serverMessages.js`

- `serverMessage(payload, { fallback, catalog, locale })` → the message for `payload.code`, else `payload.error`.
- `serverFailureMessage(response, options)` → the same, reading a failed response's body first; falls back to `HTTP <status>`.

`src/i18n/testing.js`

- `useTestLocale(locale, t?)` → restore; `withLocale(locale, fn)`; `assertNoFrench(value, { allow, message })`.

`src/i18n/frenchDetector.js`

- `findFrench(text, { allow, formatting })` → evidence list; `looksFrench(text, options)`.

`src/i18n/glossary.js`

- `PROPER_NOUNS`, `PROPER_NOUN_LIST` — the glossary's "Never translate" list.

`scripts/lib/qa-first-run.mjs`

- `newQaPage(browser, { locale })`, `suppressFirstRun(page, { locale })`,
  `skipVitrine(page, { locale })`, `qaLocale(options, env)`.

## 14. Who owns what

One owner per hot file, so parallel batches never collide:

- `index.html`, `src/ui.js`, `src/main.js`, the language switch, turning
  `LOCALE_AUTO_DETECT` on (in `locale.js` **and** the inline gate) — the shell batch.
- `src/data/manager.js`, `layerTaxonomy.js`, `layerCoverage.js`, `hud.js`,
  layer names and statuses — the registry batch. A layer module's `name` and
  `source` are registry strings, marked `i18n-ignore` where they stand: change
  what the panel prints in `layerTaxonomy.i18n.js`, and the module's own field
  only when the manifest it generates should change too (both, together — a
  test compares them byte for byte).
- `vite.config.js` (server error codes), `src/voice/*` — the voice and server batch.
- `src/i18n/**` — the infrastructure; ask the orchestrator for a change.
- `src/i18n/i18n-baseline.json`, `CHANGELOG.md`, `README.md` — the orchestrator.
