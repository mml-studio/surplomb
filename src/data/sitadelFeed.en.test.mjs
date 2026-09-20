// The Sitadel permits in English, composed from the SAME Nantes capture the
// French tests pin: 10 housing rows, 4 demolition rows and 14 cadastral
// parcels taken on 2026-09-02 through the URLs the proxy builds.
//
// The claim this layer is built around is the one that has to survive the
// translation: Sitadel publishes NO coordinate, so every point is arithmetic,
// and the card says so on its last line. So does the English one.
//
// The last block is the drift guard. `projectSitadelCommune()` also runs in
// `vite.config.js`, which has no locale, so `summary.bands[].label` is French
// by construction and the browser relabels the band ID. The three data tables
// are compared against the catalog the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  SITADEL_BANDS,
  SITADEL_NATURE_LABELS,
  SITADEL_OUTCOME_LABELS,
  SITADEL_TYPE_LABELS,
  buildSitadelPermitCard,
  formatSitadelDate,
  formatSurfaceM2,
  indexCadastreParcels,
  projectSitadelCommune,
  sitadelBandBlurb,
  sitadelBandLabel,
  sitadelLoadingLabel,
  sitadelNatureLabel,
  sitadelOutcomeLabel,
  sitadelPermitTitle,
  sitadelTypeLabel,
  sitadelUnplacedLines,
} from './sitadelFeed.js';
import messages, {
  SITADEL_NATURE,
  SITADEL_OUTCOME_WORDS,
  SITADEL_TYPES,
} from './sitadelFeed.i18n.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const H44 = read('sitadel-logements-44109-sample.json');
const D44 = read('sitadel-demolir-44109-sample.json');
const C44 = read('sitadel-cadastre-44109-sample.json');
const COMMUNE44 = read('sitadel-commune-44109-sample.json')[0];

const nantes = () => {
  const { index } = indexCadastreParcels([C44]);
  return projectSitadelCommune({
    housing: H44, demolition: D44, index, commune: COMMUNE44,
  });
};

/** Street names and applicants are the file's own words, whatever the reader's. */
const PUBLISHED = ['RUE DES AVENEAUX', 'PARIS HABITAT-OPH'];

test('a permit card admits its computed position, in English', (t) => {
  useTestLocale('en', t);
  const pack = nantes();
  const concordant = pack.permits.find((permit) => permit.i === '0441091200392');
  const card = buildSitadelPermitCard(concordant, pack.parcels);
  assert.ok(card[0].includes('27 dwellings'), card[0]);
  assert.ok(card.some((line) => line.includes('2 parcels')), card.join(' | '));
  assert.ok(card.some((line) => line.includes('2 dwellings demolished')), card.join(' | '));
  assert.ok(card.some((line) => line === 'Position computed by a cadastral join — Sitadel publishes no coordinates'),
    'the last line is never optional');
  assert.ok(card.some((line) => line.includes('consistent')), card.join(' | '));
  assertNoFrench(card, { allow: PUBLISHED });
});

test('a discordant area check shouts in English as it does in French', () => {
  const pack = nantes();
  const discordant = pack.permits.find((permit) => permit.i === '0441091200686');
  const en = withLocale('en', () => buildSitadelPermitCard(discordant, pack.parcels));
  const fr = withLocale('fr', () => buildSitadelPermitCard(discordant, pack.parcels));
  assert.ok(en.some((line) => line.includes('INCONSISTENT')), en.join(' | '));
  assert.ok(fr.some((line) => line.includes('DISCORDANT')), fr.join(' | '));
});

test('a demolition with no published land area says so, and names itself', (t) => {
  useTestLocale('en', t);
  const pack = nantes();
  const demolition = pack.permits.find((permit) => permit.i === '04410921A0030');
  const card = buildSitadelPermitCard(demolition, pack.parcels);
  assert.equal(card[0], 'Demolition permit');
  assert.ok(card.some((line) => line === 'Land area not published — the outline is not cross-checked'),
    card.join(' | '));
});

test('the three site dates keep the distinctions the file actually makes', (t) => {
  useTestLocale('en', t);
  const pack = nantes();
  const started = pack.permits.find((permit) => permit.i === '0441091200506');
  const card = buildSitadelPermitCard(started, pack.parcels);
  assert.ok(card.some((line) => line === 'Site opened on Jul 18, 2016 — completion not declared'),
    card.join(' | '));
});

test('surfaces and dates switch with the language, and French does not move', () => {
  assert.equal(withLocale('en', () => formatSurfaceM2(816)), '816 m²');
  assert.equal(withLocale('en', () => formatSurfaceM2(132633)), '13.26 ha');
  assert.equal(withLocale('en', () => formatSitadelDate('2024-10-04')), 'Oct 4, 2024');
  assert.equal(withLocale('fr', () => formatSitadelDate('2024-10-04')), '04/10/2024');
  assert.equal(withLocale('en', () => formatSitadelDate('pas une date')), null);
});

test('the row line names the municipality first, in English too', (t) => {
  useTestLocale('en', t);
  assert.equal(sitadelLoadingLabel({ status: 'too-high' }),
    'Sitadel answers one municipality at a time — zoom in below 12 km');
  assert.equal(sitadelLoadingLabel({ status: 'loading', commune: 'Nantes' }), 'Permits for Nantes…');
  assert.equal(sitadelLoadingLabel({ status: 'no-commune' }),
    'No French municipality under the center of the screen');
  const ready = sitadelLoadingLabel({
    status: 'ready',
    commune: 'Nantes',
    millesime: '2026-07',
    summary: {
      drawn: 1372, parcels: 1180, permits: 5698, ambiguous: 4007, missing: 266, noref: 59,
      dwellingsDrawn: 5120,
    },
  });
  // A municipality is the whole answer, so it comes first; the share is a
  // percentage with no space before the sign, per the glossary.
  assert.ok(ready.startsWith('Nantes · 1,372 permits placed on 1,180 parcels'), ready);
  assert.ok(ready.includes('4,332 not placed (76%)'), ready);
  assert.ok(ready.includes('5,120 dwellings authorized'), ready);
  assert.ok(ready.includes('2026-07 vintage'), ready);
  assertNoFrench(ready);
});

test('the three unplaced failures stay three different English sentences', (t) => {
  useTestLocale('en', t);
  const lines = sitadelUnplacedLines({ ambiguous: 4007, missing: 266, noref: 59 });
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('section prefixes'), lines[0]);
  assert.ok(lines[1].includes('divided or renumbered'), lines[1]);
  assert.ok(lines[2].includes('no cadastral reference published'), lines[2]);
  // Singular and plural are both written: "1 ambiguous references" on a rural
  // municipality is how a reader stops believing the rest of the card.
  assert.ok(sitadelUnplacedLines({ ambiguous: 1 })[0].startsWith('1 ambiguous reference '),
    sitadelUnplacedLines({ ambiguous: 1 })[0]);
  assertNoFrench(lines);
});

test('a permit with no dwellings is named by its type alone', () => {
  assert.equal(withLocale('en', () => sitadelPermitTitle({ t: 'DP' })), 'Prior declaration');
  assert.equal(withLocale('en', () => sitadelPermitTitle({ f: 'dem' })), 'Demolition permit');
  assert.equal(withLocale('en', () => sitadelPermitTitle({})), 'Planning permit');
  assert.equal(withLocale('fr', () => sitadelPermitTitle({ t: 'DP' })), 'Déclaration préalable');
});

/* ── the drift guard: four tables, a server with no locale ───────────────── */

test('the payload keeps the producer’s French, and the browser relabels the id', () => {
  const pack = nantes();
  for (const band of pack.summary.bands) {
    const source = SITADEL_BANDS.find((entry) => entry.id === band.id);
    assert.equal(band.label, source.label, `band ${band.id} drifted from the table`);
    assert.equal(band.label, messages('fr').bands[band.id].label, `band ${band.id} drifted from the catalog`);
    assert.equal(band.blurb, messages('fr').bands[band.id].blurb, `blurb ${band.id} drifted`);
    assert.equal(withLocale('fr', () => sitadelBandLabel(band.id)), band.label);
    assertNoFrench(withLocale('en', () => sitadelBandLabel(band.id)), { message: `band ${band.id}` });
    assertNoFrench(withLocale('en', () => sitadelBandBlurb(band.id)), { message: `blurb ${band.id}` });
  }
  assert.equal(withLocale('en', () => sitadelBandLabel('commence')), 'Site opened');
  // An unknown band falls back to `autorise`, in both languages, as it always did.
  assert.equal(withLocale('en', () => sitadelBandLabel('nope')), 'Authorized');
});

test('the three data tables repeat the producer’s own French, word for word', () => {
  for (const [table, catalog] of [
    [SITADEL_NATURE_LABELS, SITADEL_NATURE],
    [SITADEL_TYPE_LABELS, SITADEL_TYPES],
    [SITADEL_OUTCOME_LABELS, SITADEL_OUTCOME_WORDS],
  ]) {
    for (const [key, label] of Object.entries(table)) {
      assert.equal(label, catalog('fr')[key], `${key} drifted`);
      assertNoFrench(catalog('en')[key], { message: `${key} in English` });
    }
  }
  // The keys are the publisher's own modalities and codes; they are never
  // translated, and a value off the list is not invented.
  assert.equal(withLocale('en', () => sitadelNatureLabel(1)), 'New construction');
  assert.equal(withLocale('en', () => sitadelNatureLabel(9)), undefined);
  assert.equal(withLocale('en', () => sitadelTypeLabel('PA')), 'Development permit');
  assert.equal(withLocale('en', () => sitadelTypeLabel('ZZ')), undefined);
  assert.equal(withLocale('en', () => sitadelOutcomeLabel('ambiguous')),
    'Ambiguous reference — several parcels carry this number');
});
