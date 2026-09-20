// The Digital infrastructure layer in English: the card of one data center,
// and the four surface classes that say what a shape on the globe outlines.
//
// The measured figures inside those four sentences are the file's own record
// of itself — medians, shares, object counts — and the English keeps every
// one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  datacenterCardDetails,
  datacenterSurfaceWords,
  formatFootprint,
  formatPowerMw,
} from './datacentersPack.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const DATA = ['Digital Realty MRS3', 'Digital Realty', 'Telehouse', 'DCWatch'];

test('a data center card reads in English, and says which base spoke', () => {
  const lines = withLocale('en', () => datacenterCardDetails({
    tags: {
      name: 'Digital Realty MRS3', operator: 'Digital Realty',
      building: 'data_center', 'data_center:power': '24 MW',
    },
  }, { areaM2: 7500 }));
  assertNoFrench(lines, { allow: DATA });
  assert.equal(lines[0], 'Digital Realty · 24 MW');
  assert.equal(lines[1], 'building footprint ≈ 7,500 m²');
  // French, unchanged.
  const french = withLocale('fr', () => datacenterCardDetails({
    tags: {
      name: 'Digital Realty MRS3', operator: 'Digital Realty',
      building: 'data_center', 'data_center:power': '24 MW',
    },
  }, { areaM2: 7500 }));
  assert.match(french[1].replace(/\s/g, ' '), /^emprise au sol ≈ 7 500 m²$/);
});

test('a site outline is not a building, and a height is not a floor count', () => {
  const site = withLocale('en', () => datacenterCardDetails({
    tags: { name: 'Campus', landuse: 'industrial', height: '12.5' },
  }, { areaM2: 31_204 }));
  assertNoFrench(site, { allow: DATA });
  assert.ok(site.some((line) => /site footprint ≈ 31,000 m²/.test(line)), site.join(' | '));
  assert.ok(site.some((line) => /12\.5 m high/.test(line)), site.join(' | '));
  const levels = withLocale('en', () => datacenterCardDetails({
    tags: { name: 'Hall', building: 'data_center', 'building:levels': '3' },
  }, { areaM2: 5000 }));
  assert.ok(levels.some((line) => /3 floors/.test(line)), levels.join(' | '));
});

test('a year and a provenance line say where each figure came from', () => {
  const lines = withLocale('en', () => datacenterCardDetails({
    tags: { name: 'Marseille', building: 'data_center' },
    dcwatch: { powerMw: 15.6, startYear: 2019, release: '2026-06' },
  }, { areaM2: 0 }));
  assertNoFrench(lines, { allow: DATA });
  assert.ok(lines.some((line) => /in service since 2019/.test(line)), lines.join(' | '));
  assert.ok(lines.some((line) => /^power, year: DCWatch 2026-06$/.test(line)), lines.join(' | '));
  assert.ok(withLocale('fr', () => datacenterCardDetails({
    tags: { name: 'Marseille', building: 'data_center' },
    dcwatch: { powerMw: 15.6, startYear: 2019, release: '2026-06' },
  }, { areaM2: 0 })).some((line) => /^puissance, année : DCWatch 2026-06$/.test(line)));
});

test('the four surface classes keep their measurements in English', () => {
  const volume = withLocale('en', () => datacenterSurfaceWords('volume'));
  assertNoFrench(volume);
  assert.equal(volume.label, 'Built volume');
  assert.match(volume.blurb, /461 objects, 10\.6% of the pack\.$/);
  const point = withLocale('en', () => datacenterSurfaceWords('point'));
  assert.equal(point.label, 'No footprint');
  assert.match(point.blurb, /“absent” must not read as “small”/);
  assert.match(point.blurb, /834 OSM nodes, plus 287 French sites DCWatch locates/);
  assert.equal(withLocale('fr', () => datacenterSurfaceWords('slab').label), 'Emprise seule');
  assert.equal(withLocale('en', () => datacenterSurfaceWords('nope')), null);
});

test('the numbers follow the reader', () => {
  assert.equal(withLocale('en', () => formatFootprint(7500)), '7,500 m²');
  assert.equal(withLocale('fr', () => formatFootprint(7500)).replace(/\s/g, ' '), '7 500 m²');
  assert.equal(withLocale('en', () => formatFootprint(310_000)), '31 ha');
  // A tenth is worth printing under 10 MW and is noise above it.
  assert.equal(withLocale('en', () => formatPowerMw(8.4)), '8.4 MW');
  assert.equal(withLocale('fr', () => formatPowerMw(8.4)), '8,4 MW');
  assert.equal(withLocale('en', () => formatPowerMw(15.6)), '16 MW');
  assert.equal(withLocale('en', () => formatPowerMw(85)), '85 MW');
});
