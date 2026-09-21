// src/data/dpeFrance.key.test.mjs
//
// The DPE layer as the reader drives it since 2026-09-21: the seven lettered
// plates of the key that FILTER the map, the card of a clicked address printed
// in the key, the tag left on the globe, and the pills that group plates that
// would otherwise stand on one another.
//
// Four refusals carry over from the rest of the layer and are asserted here
// in their new places: a filter hides diagnostics and never counts them away,
// the card answers for an ADDRESS and never grades the building, the tag and
// the pills print a RANGE of letters and never an average, and a grouped plate
// is folded, never dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  DPE_CLASS_FILTER_ALL,
  DPE_CLASS_FILTER_VALUES,
  DPE_COLORS,
  DPE_OBSERVATORY_URL,
  dpeBuildingSummary,
  dpeClassFilterLetters,
  dpeClassFilterToggle,
  dpeClusterPillWidth,
  dpeClusterRuns,
  dpeClusterSummary,
  dpeDeclutterGroups,
  dpeFilterSites,
  dpeKeyNote,
  dpeObservatoryUrl,
  dpeRowControls,
  dpeSitePanel,
  dpeSiteTag,
  dpeSplitAddress,
} from './dpeFrance.js';
import { DPE_LABELS } from './dpeFeed.js';

/** One site as the proxy serves it: 16 diagnostics, C to E, mostly D. */
function republique() {
  const letters = ['C', 'C', 'C', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'E', 'E', 'E', 'E', 'E', null];
  const points = letters.map((letter, index) => ({
    id: `2569E20${String(index).padStart(5, '0')}C`,
    etiquetteDpe: letter,
    surfaceM2: 30 + index * 2.5,
    annualCostEur: 800 + index * 10,
    issuedOn: `2024-0${1 + (index % 9)}-1${index % 10}`,
  }));
  return {
    key: 'rnb:Y8BH22GSMCK7',
    kind: 'building',
    rnb: 'Y8BH22GSMCK7',
    address: '30 Rue de la République 69002 Lyon',
    points,
    summary: dpeBuildingSummary(points),
    shape: { via: 'id', rnbId: 'Y8BH22GSMCK7', parts: [] },
    parcel: { idu: '69382000AC0035', parts: [] },
  };
}

function site(key, letters) {
  const points = letters.map((letter, index) => ({ id: `${key}-${index}`, etiquetteDpe: letter }));
  return { key, address: `${key} Rue X 69002 Lyon`, points, summary: dpeBuildingSummary(points) };
}

/* ── the filter ────────────────────────────────────────────────────────── */

test('the filter takes every non-empty set of letters, and nothing else', () => {
  assert.equal(DPE_CLASS_FILTER_VALUES.length, 127);
  assert.equal(new Set(DPE_CLASS_FILTER_VALUES).size, 127, 'each set is written once');
  assert.ok(DPE_CLASS_FILTER_VALUES.includes(DPE_CLASS_FILTER_ALL));
  assert.ok(DPE_CLASS_FILTER_VALUES.includes('FG'));
  assert.ok(!DPE_CLASS_FILTER_VALUES.includes(''), 'a filter showing nothing is a blank map');
  assert.ok(!DPE_CLASS_FILTER_VALUES.includes('GF'), 'one spelling per set: ladder order');
  for (const value of DPE_CLASS_FILTER_VALUES) {
    assert.deepEqual([...value], DPE_LABELS.filter((letter) => value.includes(letter)));
  }
  assert.deepEqual(dpeClassFilterLetters('nonsense'), DPE_LABELS, 'a stale link shows everything');
});

test('a press shows one class, the next presses add or remove one', () => {
  assert.equal(dpeClassFilterToggle(DPE_CLASS_FILTER_ALL, 'D'), 'D', 'from everything: only D');
  assert.equal(dpeClassFilterToggle('F', 'G'), 'FG', 'then G joins: the passoires');
  assert.equal(dpeClassFilterToggle('FG', 'F'), 'G');
  assert.equal(dpeClassFilterToggle('G', 'G'), DPE_CLASS_FILTER_ALL,
    'removing the last letter shows everything, never nothing');
  assert.equal(dpeClassFilterToggle('GA', 'B'), 'B', 'an unreadable value is read as everything');
  for (const value of DPE_CLASS_FILTER_VALUES.slice(0, 20)) {
    for (const letter of DPE_LABELS) {
      assert.ok(DPE_CLASS_FILTER_VALUES.includes(dpeClassFilterToggle(value, letter)),
        `${value} + ${letter} stays a value the layer accepts`);
    }
  }
});

test('the filter keeps a building for the diagnostics it holds, not for its majority', () => {
  const sites = [republique(), site('b', ['A', 'B']), site('c', [null, null])];
  assert.equal(dpeFilterSites(sites, DPE_CLASS_FILTER_ALL), sites, 'nothing filtered, nothing copied');
  const onlyE = dpeFilterSites(sites, 'E');
  assert.equal(onlyE.length, 1, 'the mostly-D building stays: it holds five E');
  assert.equal(onlyE[0].summary.grade, 'E', 'and its plate now says E');
  assert.equal(onlyE[0].summary.total, 5, 'counting the E alone');
  assert.equal(onlyE[0].unfiltered.total, 16, 'while the card can still say out of how many');
  assert.equal(dpeFilterSites(sites, 'AB').length, 1);
  assert.equal(dpeFilterSites(sites, 'ABCDEF').some((entry) => entry.key === 'c'), false,
    'a diagnostic with no letter is in no class, so any filter hides it');
});

/* ── the key ───────────────────────────────────────────────────────────── */

test('the key: seven plates that filter, eight counts in two columns', () => {
  const payload = {
    distribution: { C: 43, D: 99, E: 40, F: 12, G: 5, B: 1 },
    entries: [{ etiquetteDpe: 'D' }, { etiquetteDpe: null }],
    total: 1_257,
    sites: [republique()],
  };
  const controls = withLocale('fr', () => dpeRowControls(payload, { classes: DPE_CLASS_FILTER_ALL }));
  assert.deepEqual(controls.legendSegments.map((plate) => plate.label), DPE_LABELS);
  assert.deepEqual(controls.legendSegments.map((plate) => plate.color), DPE_LABELS.map((l) => DPE_COLORS[l]));
  assert.ok(controls.legendSegments.every((plate) => plate.active), 'all shown');
  assert.equal(controls.legendSegments[3].toggle.param, 'classes');
  assert.equal(controls.legendSegments[3].toggle.value, 'D', 'pressing D shows D alone');
  assert.match(controls.legendSegments[3].title, /^N’afficher que D \(181 à 250 kWh\/m²\/an\)$/);
  assert.equal(controls.legendColumns, 2);
  assert.equal(controls.legend.length, 8);
  assert.ok(controls.legend.every((entry) => entry.channel === 'Diagnostics chargés'));
  assert.equal(controls.legend.find((entry) => entry.label === 'D').count, 99);
  assert.equal(controls.legend.at(-1).count, 1, 'the unlabelled diagnostic is counted');
  assert.match(controls.legendNote, /la pire des deux notes, énergie et gaz à effet de serre/);
  assert.match(controls.note, /^2 \/ 1\s257 diagnostics · rayon 200 m · 1 adresse$/);
});

test('a filtered key dims the classes it hides and says so, counts untouched', () => {
  const payload = { distribution: { D: 3, F: 1 }, entries: [], sites: [] };
  const controls = withLocale('fr', () => dpeRowControls(payload, { classes: 'FG' }));
  assert.deepEqual(controls.legendSegments.filter((plate) => plate.active).map((plate) => plate.label), ['F', 'G']);
  assert.equal(controls.legendSegments.find((plate) => plate.label === 'F').title, 'Masquer F');
  assert.equal(controls.legendSegments.find((plate) => plate.label === 'D').title, 'Afficher aussi D');
  assert.equal(controls.legendSegments.find((plate) => plate.label === 'D').toggle.value, 'DFG');
  assert.equal(controls.legend.find((entry) => entry.label === 'D').count, 3,
    'the counts are the whole answer: the dimmed plate says what is hidden');
  assert.match(withLocale('fr', () => dpeKeyNote(payload, 'FG')), /filtre F, G : 0 adresse affichée$/);
});

test('the key speaks English', () => {
  const payload = { distribution: { D: 3 }, entries: [{ etiquetteDpe: 'D' }], total: 40, sites: [] };
  const controls = withLocale('en', () => dpeRowControls(payload, { classes: 'D' }));
  assertNoFrench({
    note: controls.note,
    legendNote: controls.legendNote,
    segmentsLabel: controls.legendSegmentsLabel,
    titles: controls.legendSegments.map((plate) => plate.title),
    channel: controls.legend[0].channel,
  });
  assert.equal(controls.legendSegmentsLabel, 'Filter by class');
  assert.equal(controls.legend[0].channel, 'Ratings loaded');
  assert.equal(controls.legendSegments[3].title, 'Hide D');
  assert.equal(controls.legendSegments[4].title, 'Show E too');
  assert.match(controls.note, /^1 \/ 40 ratings · 200 m radius · filter D: 0 addresses shown$/);
});

/* ── the card in the key ───────────────────────────────────────────────── */

test('the card answers for an address: count, classes present, range, mode', () => {
  const panel = withLocale('fr', () => dpeSitePanel(republique()));
  assert.equal(panel.title, '30 Rue de la République');
  assert.equal(panel.meta, '69002 Lyon');
  assert.equal(panel.headline, '16 diagnostics');
  assert.deepEqual(panel.chips.items.map((chip) => chip.label), ['C', 'D', 'E']);
  assert.equal(panel.chips.items[1].color, DPE_COLORS.D);
  assert.equal(panel.chips.caption, 'Classes présentes');
  assert.equal(panel.chips.text, 'De C à E');
  assert.equal(panel.lines[0], 'Classe la plus fréquente : D');
  assert.ok(panel.lines.includes('1 sans étiquette publiée'), 'the unlabelled one is not hidden');
  assert.match(panel.footnote, /^Chaque DPE décrit un logement, pas l’immeuble entier/,
    'the mode is never presented as the building’s rating');
  assert.match(panel.footnote, /parcelle 69382000AC0035/);
  assert.equal(panel.list.summary, 'Voir les 16 diagnostics');
  assert.equal(panel.list.items.length, 16, 'every diagnostic is listed');
  assert.ok(panel.list.items[0].href.startsWith(DPE_OBSERVATORY_URL));
  assert.equal(panel.link.href, 'https://data.ademe.fr/datasets/dpe03existant');
});

test('a tie is named, not hidden behind the worse letter it resolves to', () => {
  const tied = site('t', ['C', 'C', 'E', 'E']);
  const panel = withLocale('fr', () => dpeSitePanel(tied));
  assert.equal(panel.lines[0], 'Classe la plus fréquente : E, à égalité avec C (la plus mauvaise est retenue)');
  const english = withLocale('en', () => dpeSitePanel(tied));
  assert.equal(english.lines[0], 'Most frequent class: E, tied with C (the worse one is kept)');
});

test('a unanimous address prints its letter once, and no mode line', () => {
  const panel = withLocale('fr', () => dpeSitePanel(site('u', ['D', 'D'])));
  assert.equal(panel.chips.text, 'Tous D');
  assert.ok(!panel.lines.some((line) => /plus fréquente/.test(line)));
  assert.equal(withLocale('fr', () => dpeSitePanel(site('one', ['F']))).chips.text, 'Classe F');
});

test('a filtered card says out of how many', () => {
  const [filtered] = dpeFilterSites([republique()], 'E');
  const panel = withLocale('fr', () => dpeSitePanel(filtered));
  assert.equal(panel.headline, '5 diagnostics');
  assert.ok(panel.lines.includes('Filtre actif : 5 sur 16 affichés'));
});

test('the card speaks English', () => {
  const panel = withLocale('en', () => dpeSitePanel(republique()));
  const keep = ['30 Rue de la République', '69002 Lyon'];
  assertNoFrench({ ...panel, title: null, meta: null }, { allow: keep });
  assert.equal(panel.headline, '16 ratings');
  assert.equal(panel.chips.caption, 'Classes present');
  assert.equal(panel.chips.text, 'From C to E');
  assert.equal(panel.lines[0], 'Most frequent class: D');
  assert.equal(panel.list.summary, 'See the 16 ratings');
  assert.equal(panel.link.label, 'Source: ADEME');
});

test('a diagnostic links to its own ADEME page only when its number is one', () => {
  assert.equal(dpeObservatoryUrl('2569E2000837C'), `${DPE_OBSERVATORY_URL}2569E2000837C`);
  assert.equal(dpeObservatoryUrl(' 2569e2000837c '), `${DPE_OBSERVATORY_URL}2569E2000837C`);
  assert.equal(dpeObservatoryUrl('dpe-3'), null, 'a made-up id gets no link rather than a dead one');
  assert.equal(dpeObservatoryUrl(null), null);
});

test('the BAN address splits into street and locality', () => {
  assert.deepEqual(dpeSplitAddress('30 Rue de la République 69002 Lyon'),
    { street: '30 Rue de la République', locality: '69002 Lyon' });
  assert.deepEqual(dpeSplitAddress('Lieu-dit sans code'), { street: 'Lieu-dit sans code', locality: null });
  assert.deepEqual(dpeSplitAddress(null), { street: null, locality: null });
});

/* ── the tag and the pills ─────────────────────────────────────────────── */

test('the tag prints the range and the count, never the mode', () => {
  assert.equal(dpeSiteTag(republique()), 'C–E · 16');
  assert.equal(dpeSiteTag(site('d', ['D', 'D'])), 'D · 2');
  assert.equal(dpeSiteTag(site('f', ['F'])), 'F');
  assert.equal(dpeSiteTag(site('n', [null, null])), '? · 2');
});

test('a pill says the range of all its sites, each letter in its colour', () => {
  const summary = dpeClusterSummary([site('a', ['D', 'E']), site('b', ['C']), site('c', ['F', 'D'])]);
  assert.deepEqual(summary, { best: 'C', worst: 'F', total: 5, sites: 3 });
  const runs = dpeClusterRuns(summary);
  assert.deepEqual(runs.map((run) => run.text), ['C', '–', 'F', ' · 5']);
  assert.equal(runs[0].color, DPE_COLORS.C);
  assert.equal(runs[2].color, DPE_COLORS.F);
  assert.deepEqual(dpeClusterRuns(dpeClusterSummary([site('n', [null])])).map((run) => run.text), ['?', ' · 1']);
});

test('plates that touch fold into one pill, and no two marks are left touching', () => {
  const at = (key, x, y, weight, letters = ['D']) => ({
    key, x, y, size: 22, weight, site: site(key, letters),
  });
  // A column of plates down one street, as a tilted camera stacks them, and
  // one plate well clear of it.
  const marks = [
    at('a', 100, 100, 3), at('b', 100, 114, 9), at('c', 100, 128, 2),
    at('d', 100, 142, 1, ['F']), at('e', 300, 300, 4),
  ];
  const groups = dpeDeclutterGroups(marks);
  const pill = groups.find((group) => group.members.length > 1);
  assert.equal(pill.seed.key, 'b', 'the pill is anchored on the address that says the most');
  assert.deepEqual(pill.members.map((mark) => mark.key).sort(), ['a', 'b', 'c'],
    'the plates it stood on fold into it');
  // `d` touched `c`, but `c` is folded now: the pill ends 12 px above `d`, so
  // `d` keeps its own plate rather than being swallowed for a touch that no
  // longer exists on screen.
  assert.deepEqual(groups.map((group) => group.members.length).sort(), [1, 1, 3]);
  assert.equal(groups.flatMap((group) => group.members).length, marks.length, 'nothing dropped');
  const boxes = groups.map((group) => (group.members.length > 1
    ? { x: group.seed.x, y: group.seed.y, w: dpeClusterPillWidth(dpeClusterRuns(dpeClusterSummary(group.members.map((m) => m.site)))), h: 24 }
    : { x: group.seed.x, y: group.seed.y, w: 22, h: 22 }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const overlap = Math.abs(boxes[i].x - boxes[j].x) * 2 < boxes[i].w + boxes[j].w
        && Math.abs(boxes[i].y - boxes[j].y) * 2 < boxes[i].h + boxes[j].h;
      assert.equal(overlap, false);
    }
  }
});

test('a pill wider than its plates swallows the neighbour it would land on', () => {
  // Two plates touch and become a pill; the pill is wider than either plate
  // and now reaches a third plate that touched neither of them.
  const at = (key, x, weight) => ({ key, x, y: 50, size: 22, weight, site: site(key, ['C', 'G']) });
  const groups = dpeDeclutterGroups([at('a', 100, 5), at('b', 110, 4), at('c', 150, 3)]);
  assert.equal(groups.length, 1, 'merged until nothing touches');
  assert.equal(groups[0].members.length, 3);
});

test('the selected plate is never folded into a pill', () => {
  const at = (key, y, weight, pinned = false) => ({
    key, x: 100, y, size: 22, weight, pinned, site: site(key, ['D']),
  });
  const groups = dpeDeclutterGroups([at('a', 100, 9), at('b', 110, 1, true), at('c', 120, 5)]);
  const pinned = groups.find((group) => group.seed.key === 'b');
  assert.deepEqual(pinned.members.map((mark) => mark.key), ['b']);
});
