// The locale gate: which language a page speaks, decided once, in three copies.
//
// Same arrangement as src/vitrine/gate.test.mjs: the inline head script in
// index.html paints the right `lang` first, src/i18n/locale.js is the rule the
// modules read. Each inline copy is RUN here over a matrix of inputs and must
// answer exactly what `resolveLocale()` answers, storage write included.
//
// TWO PAGES CARRY THE SCRIPT. `index.html` is the globe; `fiche.html` is the
// Address X-ray, a second document of the same application, framed inside the
// globe and opened on its own by readers who print it. A reader who chose
// English must not meet a French sheet in either place, so the two copies are
// checked against the module AND against each other, character for character.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_LOCALE,
  I18N_READY_ATTRIBUTE,
  LOCALE_AUTO_DETECT,
  LOCALE_QA_GLOBAL,
  LOCALE_QUERY_PARAM,
  LOCALE_STORAGE_KEY,
  LOCALE_TAGS,
  SUPPORTED_LOCALES,
  getLocale,
  getLocaleOverride,
  localeFromLanguages,
  localeTag,
  normalizeLocale,
  readLocaleSignals,
  resolveLocale,
  setLocaleOverride,
} from './locale.js';

const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const FICHE_HTML = readFileSync(new URL('../../fiche.html', import.meta.url), 'utf8');
const STYLE_CSS = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
/** The documents that carry the inline gate, by name. */
const GATED_PAGES = Object.freeze({ 'index.html': INDEX_HTML, 'fiche.html': FICHE_HTML });

test('French is the default, English the second, and each has one tag', () => {
  assert.equal(DEFAULT_LOCALE, 'fr');
  assert.deepEqual(SUPPORTED_LOCALES, ['fr', 'en']);
  assert.deepEqual(LOCALE_TAGS, { fr: 'fr-FR', en: 'en-US' });
  assert.equal(LOCALE_STORAGE_KEY, 'gev:locale:v1');
  assert.equal(LOCALE_QUERY_PARAM, 'lang');
  assert.equal(LOCALE_QA_GLOBAL, '__GEV_LOCALE__');
});

test('any language tag maps to a supported locale, or to nothing', () => {
  for (const [input, expected] of [
    ['fr', 'fr'], ['FR', 'fr'], ['fr-FR', 'fr'], ['fr_CA', 'fr'], ['en', 'en'], ['en-GB', 'en'],
    ['EN-us', 'en'], ['de', null], ['', null], [' en', null], ['french', null], [null, null],
    [undefined, null], [42, null], [{ toString: () => 'en' }, null],
  ]) {
    assert.equal(normalizeLocale(input), expected, JSON.stringify(input));
  }
});

test('a browser language list: the first French or English entry decides, English otherwise', () => {
  assert.equal(localeFromLanguages(['fr-FR', 'en-US']), 'fr');
  assert.equal(localeFromLanguages(['en-US', 'fr-FR']), 'en');
  assert.equal(localeFromLanguages(['de-DE', 'fr']), 'fr');
  assert.equal(localeFromLanguages(['de-DE', 'es']), 'en');
  assert.equal(localeFromLanguages([]), 'en');
  assert.equal(localeFromLanguages(undefined), 'en');
});

test('the order: QA flag, then ?lang=, then storage, then the browser (when on), then French', () => {
  const pick = (signals) => {
    const { locale, source, persist } = resolveLocale(signals);
    return `${locale}:${source}${persist ? ':persist' : ''}`;
  };
  assert.equal(pick({}), 'fr:default');
  assert.equal(pick({ qa: 'en', query: 'fr', stored: 'fr' }), 'en:qa');
  assert.equal(pick({ query: 'en', stored: 'fr' }), 'en:query:persist');
  assert.equal(pick({ query: 'de', stored: 'en' }), 'en:stored');
  assert.equal(pick({ stored: 'en' }), 'en:stored');
  assert.equal(pick({ stored: 'xx' }), 'fr:default');
  // The browser is asked only when detection is on — and it is OFF today.
  assert.equal(LOCALE_AUTO_DETECT, false);
  assert.equal(pick({ languages: ['en-US'] }), 'fr:default');
  assert.equal(pick({ languages: ['en-US'], autoDetect: true }), 'en:navigator');
  assert.equal(pick({ languages: ['fr-FR'], autoDetect: true }), 'fr:navigator');
  assert.equal(pick({ stored: 'fr', languages: ['en-US'], autoDetect: true }), 'fr:stored');
  // A QA run never writes a preference nobody chose.
  assert.equal(resolveLocale({ qa: 'en', query: 'en' }).persist, false);
});

test('the page locale is <html lang>, and never the machine’s language', (t) => {
  // Node 24+ has a global navigator saying en-US on most CI runners. The
  // locale must not care: that would flip `npm test` into English.
  t.after(() => setLocaleOverride(null));
  assert.equal(getLocale(), 'fr', 'no document under Node → French');
  assert.equal(getLocale({ getAttribute: () => 'en' }), 'en');
  assert.equal(getLocale({ getAttribute: () => 'en-GB' }), 'en');
  assert.equal(getLocale({ getAttribute: () => 'de' }), 'fr');
  assert.equal(getLocale({ getAttribute: () => null }), 'fr');
  assert.equal(getLocale({ lang: 'en' }), 'en');
  setLocaleOverride('en');
  assert.equal(getLocaleOverride(), 'en');
  assert.equal(getLocale({ getAttribute: () => 'fr' }), 'en', 'the test override wins');
  setLocaleOverride(null);
  assert.equal(getLocaleOverride(), null);
  assert.equal(localeTag('en'), 'en-US');
  assert.equal(localeTag('xx'), 'fr-FR');
  assert.equal(localeTag(), 'fr-FR');
});

test('the signals are read from injectable globals, storage failures included', () => {
  const store = new Map([[LOCALE_STORAGE_KEY, 'en']]);
  const signals = readLocaleSignals({
    windowRef: { [LOCALE_QA_GLOBAL]: 'fr', localStorage: { getItem: (k) => store.get(k) ?? null } },
    location: { search: '?lang=en&q=Lyon' },
    navigatorRef: { languages: ['de-DE', 'en'], language: 'de-DE' },
  });
  assert.deepEqual(signals, { qa: 'fr', query: 'en', stored: 'en', languages: ['de-DE', 'en'] });
  const hostile = readLocaleSignals({
    windowRef: { get localStorage() { throw new Error('SecurityError'); } },
    location: {},
    navigatorRef: { languages: [], language: 'fr-FR' },
  });
  assert.deepEqual(hostile, { qa: undefined, query: null, stored: null, languages: ['fr-FR'] });
});

// ── the inline copy ───────────────────────────────────────────────────────

/** The inline gate, extracted from a page as it ships. */
function inlineGateScript({ auto, page = 'index.html' } = {}) {
  const match = GATED_PAGES[page].match(/<script>\s*\/\* locale-gate \*\/\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
  assert.ok(match, `the inline locale gate is gone from ${page}`);
  const body = match[1];
  if (auto === undefined) return body;
  assert.match(body, /var AUTO = (true|false);/);
  return body.replace(/var AUTO = (true|false);/, `var AUTO = ${auto};`);
}

const QA_VALUES = [undefined, 'en', 'fr', 'EN-us', 'de', 42];
const SEARCHES = ['', '?lang=en', '?lang=fr', '?lang=EN', '?lang=de', '?lang=', '?lang=en-GB&x=1', '?q=Lyon'];
const STORED = [null, 'en', 'fr', 'xx', 'THROWS'];
const LANGUAGE_LISTS = [['en-US'], ['fr-FR'], ['de-DE', 'fr'], ['de-DE'], []];

function runInline(body, { qa, search, stored, languages }) {
  const attrs = new Map();
  const writes = [];
  const storage = stored === 'THROWS'
    ? null
    : {
      getItem: (key) => (key === LOCALE_STORAGE_KEY ? stored : null),
      setItem: (key, value) => writes.push([key, value]),
    };
  const windowRef = {
    ...(qa === undefined ? {} : { [LOCALE_QA_GLOBAL]: qa }),
    get localStorage() {
      if (!storage) throw new Error('SecurityError');
      return storage;
    },
  };
  const navigatorRef = { languages, language: languages[0] };
  new Function('location', 'window', 'document', 'navigator', body)(
    { search },
    windowRef,
    { documentElement: { setAttribute: (k, v) => attrs.set(k, v) } },
    navigatorRef,
  );
  return { lang: attrs.get('lang'), writes, windowRef, navigatorRef };
}

for (const page of Object.keys(GATED_PAGES)) {
  for (const auto of [false, true]) {
    test(`${page}: the inline head script answers exactly what resolveLocale answers (detection ${auto ? 'on' : 'off'})`, () => {
      const body = inlineGateScript({ auto, page });
      let cases = 0;
      for (const qa of QA_VALUES) {
        for (const search of SEARCHES) {
          for (const stored of STORED) {
            for (const languages of LANGUAGE_LISTS) {
              const { lang, writes, windowRef, navigatorRef } = runInline(body, { qa, search, stored, languages });
              const signals = readLocaleSignals({ windowRef, location: { search }, navigatorRef });
              const expected = resolveLocale({ ...signals, autoDetect: auto });
              const label = JSON.stringify({ page, qa, search, stored, languages });
              assert.equal(lang, expected.locale, `inline gate disagrees for ${label}`);
              const wrote = writes.length > 0;
              assert.equal(wrote, expected.persist && stored !== 'THROWS', `storage write disagrees for ${label}`);
              if (wrote) assert.deepEqual(writes, [[LOCALE_STORAGE_KEY, expected.locale]]);
              cases += 1;
            }
          }
        }
      }
      assert.equal(cases, QA_VALUES.length * SEARCHES.length * STORED.length * LANGUAGE_LISTS.length);
    });
  }
}

test('the X-ray carries the same gate as the globe, character for character', () => {
  // A copy that drifts is worse than no copy: the two pages would disagree
  // about the same reader's language, and the sheet is framed INSIDE the globe.
  assert.equal(inlineGateScript({ page: 'fiche.html' }), inlineGateScript({ page: 'index.html' }));
  // And the page it is copied into says where the original lives.
  assert.match(FICHE_HTML, /src\/i18n\/locale\.js/);
  assert.match(FICHE_HTML, /<html lang="fr">/);
});

test('the inline copy uses the module constants, not look-alikes', () => {
  const body = inlineGateScript();
  assert.ok(body.includes(`var KEY = '${LOCALE_STORAGE_KEY}';`), 'storage key drifted');
  assert.ok(body.includes(`var AUTO = ${LOCALE_AUTO_DETECT};`), 'auto-detection flag drifted');
  assert.ok(body.includes(`window.${LOCALE_QA_GLOBAL}`), 'QA flag drifted');
  assert.ok(body.includes(`.get('${LOCALE_QUERY_PARAM}')`), 'query parameter drifted');
  assert.ok(body.includes(`|| '${DEFAULT_LOCALE}'`), 'default locale drifted');
  // It writes `<html lang>` and nothing else on the page.
  assert.deepEqual(body.match(/setAttribute\('[^']+'/g), ["setAttribute('lang'"]);
});

test('the gate runs after the vitrine gate and before the stylesheet that reads it', () => {
  const vitrine = INDEX_HTML.indexOf('/* vitrine-gate */');
  const locale = INDEX_HTML.indexOf('/* locale-gate */');
  const stylesheet = INDEX_HTML.indexOf('<link rel="stylesheet" href="/style.css"');
  assert.ok(vitrine > 0 && locale > vitrine && stylesheet > locale);
  // The static attribute stays French: a page whose script never ran is French.
  assert.match(INDEX_HTML, /<html lang="fr">/);
});

test('an English page hides the loading line until its markup is translated', () => {
  const rule = new RegExp(
    `html\\[lang="en"\\]:not\\(\\[${I18N_READY_ATTRIBUTE}\\]\\) #loading-screen \\.loader-status\\s*\\{\\s*visibility: hidden;\\s*\\}`,
  );
  assert.match(STYLE_CSS, rule);
});

test('boot reads the locale statically and fetches the markup applicator only when not French', () => {
  const boot = readFileSync(new URL('../boot.js', import.meta.url), 'utf8');
  assert.match(boot, /^import \{[^}]*getLocale[^}]*\} from '\.\/i18n\/locale\.js';$/m);
  assert.doesNotMatch(boot, /^import .*i18n\/markup/m, 'the applicator must not be in the entry chunk');
  assert.match(boot, /if \(getLocale\(\) === DEFAULT_LOCALE\) return Promise\.resolve\(\);/);
  assert.match(boot, /import\('\.\/i18n\/markup\.js'\)/);
  assert.match(boot, /\.finally\(\(\) => document\.documentElement\.setAttribute\(I18N_READY_ATTRIBUTE, ''\)\)/);
  // The cockpit starts on translated markup.
  assert.match(boot, /Promise\.all\(\[loadCockpit\(\), enableCesiumWidgets\(\), markupReady\]\)/);
});
