// The Power plants layer in English: the card a clicked site opens, the label
// painted beside a mark, the filter chips and the key — all from the captured
// EDF files, through the real projection, so the two languages are two
// readings of one fleet.
//
// What this file also pins is where translation STOPS. `REP 900`,
// `Fil de l'eau` and `Multi-oxyde d’uranium et de plutonium` are values EDF
// publishes: they are looked up, never printed, and a code this build has
// never seen is shown exactly as published in either language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildEdfPlantCard,
  buildPlantRecords,
  filiereLegend,
  filiereWords,
  formatMegawatts,
  localDay,
  plantFilterChips,
  plantKindChip,
  plantKindText,
  plantLabelText,
  plantSubjectText,
  summarizePlants,
} from './edfPowerPlants.js';
import { projectEdfPlants } from './edfPlantsFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const fixture = (name) => JSON.parse(readFileSync(
  new URL(`./fixtures/edf-plants-${name}.json`, import.meta.url), 'utf8',
));
const PROJECTED = projectEdfPlants({
  nucleaire: { meta: fixture('nucleaire-dataset'), lines: fixture('nucleaire-sample') },
  hydraulique: { meta: fixture('hydraulique-dataset'), lines: fixture('hydraulique-sample') },
  thermique: { meta: fixture('thermique-dataset'), lines: fixture('thermique-sample') },
}, 'test');
const RECORDS = buildPlantRecords({
  fetchedAt: 1_772_000_000_000, stale: false, source: PROJECTED.source,
  sites: PROJECTED.sites, datasets: PROJECTED.datasets, totals: PROJECTED.totals,
});

const GRAVELINES = Object.freeze({
  id: 'nucleaire:GRAVELINES', name: 'GRAVELINES', filiere: 'nucleaire',
  lat: 51.012846, lon: 2.139287, mw: 5460, units: 6, kind: 'REP 900', tech: 'REP',
  fuel: null, operator: 'EDF SA', commune: 'Gravelines', departement: 'Nord',
  region: 'Hauts-de-France', commissionedFrom: 1980, commissionedTo: 1985,
  secondaryReserveMw: 150, referenceDate: '2025-12-31',
});

// Site names, communes, départements and régions are data.
const PLACES = ['Gravelines', 'Nord', 'Hauts-de-France', 'GRAND-MAISON', 'Isère',
  'Auvergne-Rhône-Alpes', 'Blénod', 'Pont-à-Mousson', 'Meurthe-et-Moselle', 'Grand Est'];

test('the card of a nuclear site reads as a sentence in English', () => {
  const card = withLocale('en', () => buildEdfPlantCard(GRAVELINES));
  assertNoFrench(card, { allow: PLACES });
  const lines = card.split('\n');
  assert.equal(lines[0], 'GRAVELINES');
  const body = lines.slice(1).join('\n');
  assert.match(body, /Nuclear power plant · 6 pressurized-water reactors of 900 MW/);
  assert.match(body, /5,460 MW installed: the site’s maximum, not what it is generating right now/);
  assert.match(body, /150 MW held in reserve to stabilize the grid within minutes/);
  assert.match(body, /Gravelines · Nord · Hauts-de-France/);
  assert.match(body, /6 reactors connected to the grid between 1980 and 1985/);
  assert.match(body, /EDF’s own record of its nuclear fleet, as of Dec 31, 2025/);
  // The published codes are translated, never recited.
  for (const code of [/REP 900\b(?! MW)/, /tranche/, /couplée/]) {
    assert.doesNotMatch(body, code, String(code));
  }
});

test('the same site, in French, prints exactly what it printed before', () => {
  const body = withLocale('fr', () => buildEdfPlantCard(GRAVELINES));
  assert.match(body, /Centrale nucléaire · 6 réacteurs à eau pressurisée de 900 MW/);
  assert.match(body, /5 460 MW installés/);
  assert.match(body, /150 MW tenus en réserve/);
  assert.match(body, /entre 1980 et 1985/);
  assert.match(body, /arrêté au 31\/12\/2025/);
});

test('a hydro regime is a word AND the sentence that explains it', () => {
  const grandMaison = RECORDS.find((r) => r.name === 'GRAND-MAISON');
  const card = withLocale('en', () => buildEdfPlantCard(grandMaison));
  assertNoFrench(card, { allow: PLACES });
  assert.match(card, /mixed pumped-storage plant/);
  assert.match(card, /pumps water back up off-peak/);
  assert.match(withLocale('fr', () => buildEdfPlantCard(grandMaison)),
    /remonte de l’eau aux heures creuses/);
});

test('a peaking turbine says what it is, and its fuel says which column it came from', () => {
  const peaker = {
    name: 'TAC', filiere: 'thermique', kind: 'Fioul Domestique', tech: 'TAC',
    fuel: 'Fioul Domestique', mw: 185, units: 1, commissionedFrom: 1978,
  };
  const card = withLocale('en', () => buildEdfPlantCard(peaker));
  assertNoFrench(card);
  assert.match(card, /combustion turbine — a peaking machine, started for a few hours at a time/);
  assert.match(card, /unit connected to the grid in 1978/);
  const nuclearFuel = withLocale('en', () => buildEdfPlantCard({
    ...GRAVELINES, fuel: 'Multi-oxyde d’uranium et de plutonium',
  }));
  assert.match(nuclearFuel, /fuel: MOX \(recycled uranium and plutonium\)/);
});

test('a code this build has never seen is printed as published, in both languages', () => {
  const future = { name: 'FLAMANVILLE 3', filiere: 'nucleaire', kind: 'EPR2', units: 2, mw: 3200 };
  assert.equal(withLocale('en', () => plantKindText(future)), '2 × EPR2');
  assert.equal(withLocale('fr', () => plantKindText(future)), '2 × EPR2');
  assert.equal(withLocale('en', () => plantKindChip('EPR2')), 'EPR2');
});

test('the globe label keeps the short register in English', () => {
  assert.equal(withLocale('en', () => plantLabelText(GRAVELINES)),
    'GRAVELINES · 5,460 MW · 6 reactors');
  assert.equal(withLocale('fr', () => plantLabelText(GRAVELINES)),
    'GRAVELINES · 5 460 MW · 6 réacteurs');
  // Once a generation type is the subject, the third field drops — in both.
  assert.equal(withLocale('en', () => plantLabelText(GRAVELINES, { filiere: 'nucleaire' })),
    'GRAVELINES · 5,460 MW');
});

test('the subject line names what the place IS', () => {
  assert.equal(withLocale('en', () => plantSubjectText(GRAVELINES)),
    'Nuclear power plant · 6 pressurized-water reactors of 900 MW');
  assert.equal(withLocale('en', () => plantSubjectText({ filiere: 'hydraulique', kind: 'Lac' })),
    'Hydro plant · reservoir plant');
  assert.equal(withLocale('en', () => plantSubjectText({})), 'Power plant');
});

test('the filter strip and its sub-categories are English', () => {
  const chips = withLocale('en', () => plantFilterChips(RECORDS, { filiere: 'hydraulique' }));
  assertNoFrench(chips.map(({ label, title }) => ({ label, title })), { allow: PLACES });
  assert.equal(chips[0].label, 'ALL');
  assert.match(chips[0].title, /^All \d+ sites of the three generation types — [\d,]+ MW installed$/);
  assert.deepEqual(chips.slice(1, 4).map((chip) => chip.label), ['NUCLEAR', 'HYDRO', 'FOSSIL']);
  const hydro = chips.find((chip) => chip.id === 'f:hydraulique');
  assert.match(hydro.title, /^Hydro — \d+ sites, [\d,]+ MW\. Click again to go back to the whole of France$/);
  const nuclear = chips.find((chip) => chip.id === 'f:nucleaire');
  assert.match(nuclear.title, /^Keep only nuclear — \d+ sites, [\d,]+ MW$/);
  const subAll = chips.find((chip) => chip.id === 'k:all');
  assert.equal(subAll.label, 'ALL');
  assert.equal(subAll.title, 'Every sub-category — hydro');
  const reservoir = chips.find((chip) => chip.id === 'k:Lac');
  assert.match(reservoir.title, /^reservoir plant — \d+ sites?, [\d,]+ MW$/);
  assert.equal(reservoir.label, 'RESERVOIR');
  // French, same strip: the words it always printed.
  const french = withLocale('fr', () => plantFilterChips(RECORDS, { filiere: 'hydraulique' }));
  assert.equal(french[0].label, 'TOUTES');
  assert.equal(french.find((chip) => chip.id === 'k:Lac').label, 'LAC');
});

test('the key names each generation type and what it holds', () => {
  const legend = withLocale('en', () => filiereLegend(summarizePlants(RECORDS)));
  assertNoFrench(legend.map(({ label, blurb }) => ({ label, blurb })));
  assert.deepEqual(legend.map((row) => row.label), ['Nuclear', 'Hydro', 'Fossil-fired']);
  assert.match(legend[0].blurb,
    /^Pressurized-water reactors operated by EDF — [\d,]+ MW installed, \d+ reactors$/);
  assert.match(legend[1].blurb, /^EDF plants above 100 MW, plus those holding at least 20 MW/);
  assert.equal(withLocale('fr', () => filiereLegend(summarizePlants(RECORDS)))[2].label,
    'Thermique à flamme');
});

test('the four registers of one generation type, side by side', () => {
  const en = withLocale('en', () => filiereWords('thermique'));
  assert.deepEqual(
    { label: en.label, subject: en.subject, chip: en.chip, unitNoun: en.unitNoun },
    { label: 'Fossil-fired', subject: 'Fossil-fired plant', chip: 'FOSSIL', unitNoun: 'unit' },
  );
  // Hydro counts no machines: its file publishes no unit count.
  assert.equal(withLocale('en', () => filiereWords('hydraulique').unitNoun), null);
  assert.equal(withLocale('en', () => filiereWords('géothermie')), null);
});

test('megawatts and dates take the reader’s own typography', () => {
  assert.equal(withLocale('en', () => formatMegawatts(5460)), '5,460 MW');
  assert.equal(withLocale('fr', () => formatMegawatts(5460)), '5 460 MW');
  assert.equal(withLocale('en', () => localDay('2025-12-31')), 'Dec 31, 2025');
  assert.equal(withLocale('fr', () => localDay('2025-12-31')), '31/12/2025');
  assert.equal(withLocale('en', () => localDay('sans date')), 'sans date');
});
