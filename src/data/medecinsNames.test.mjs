// Which doctors' names may be shown, and which file they may come from.
//
// Every name below is invented. The point of this module is that real ones
// stay out of git, and a test fixture is in git.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  EMPTY_SUPPRESSION,
  addressNamesPractitioner,
  buildSuppressionIndex,
  foldPractitionerName,
  isSuppressed,
  medecinsRuntimePaths,
  pairPractitioners,
  parseSuppressionList,
  practitionerNameKey,
  withoutSuppressed,
} from './medecinsNames.js';

const site = ({ cp = '75011', registre = '' } = {}) => [
  48.86, 2.38, 0, '75111', cp, 'Paris', '1 RUE X', '', 'liberal', [['01', 2]], 2, registre,
];

test('names fold across accents, case, hyphens and word order', () => {
  assert.equal(foldPractitionerName('Lefèvre-Durand  Hélène'), 'LEFEVRE DURAND HELENE');
  assert.equal(practitionerNameKey('Dr Jean Dupontel'.replace(/^Dr /, '')), practitionerNameKey('DUPONTEL JEAN'));
  // Word-exact: a longer name is another person, not a match.
  assert.notEqual(practitionerNameKey('DUPONTEL JEAN PIERRE'), practitionerNameKey('DUPONTEL JEAN'));
});

test('the list reads names, comments and optional postal-code prefixes', () => {
  const entries = parseSuppressionList([
    '# objections, one per line',
    'DUPONTEL JEAN',
    '',
    'Martinez Claire ; 75011   # asked on 2026-09-22',
    'DURANDEAU PAUL ; 63',
    'ROUSSELIN ANNE ; not-a-code',
    ' ; 75011',
  ].join('\n'));
  assert.deepEqual(entries, [
    { key: 'DUPONTEL JEAN', scope: '' },
    { key: 'CLAIRE MARTINEZ', scope: '75011' },
    { key: 'DURANDEAU PAUL', scope: '63' },
    // A scope that is not a postal-code prefix narrows nothing: hiding a
    // namesake is the safe failure, showing the person who objected is not.
    { key: 'ANNE ROUSSELIN', scope: '' },
  ]);
  // Corsica's département letters are a valid prefix too.
  assert.equal(parseSuppressionList('CASANOVI LUCA ; 2A')[0].scope, '2A');
});

test('a suppressed practitioner is removed whole, and only where the scope says', () => {
  const index = buildSuppressionIndex(parseSuppressionList('MARTINEZ CLAIRE ; 750\nDUPONTEL JEAN'));
  const practitioners = [
    ['MARTINEZ CLAIRE', 'F', '01', '1', ''],
    ['DUPONTEL JEAN', 'M', '15', '3', '3'],
    ['DUPONTEL JEAN PIERRE', 'M', '15', '3', ''],
  ];
  const paris = withoutSuppressed(practitioners, site(), index);
  assert.deepEqual(paris.map((entry) => entry[0]), ['DUPONTEL JEAN PIERRE']);

  // Outside the 750 prefix, only the unscoped entry applies.
  const lyon = withoutSuppressed(practitioners, site({ cp: '69003' }), index);
  assert.deepEqual(lyon.map((entry) => entry[0]), ['MARTINEZ CLAIRE', 'DUPONTEL JEAN PIERRE']);

  // The register's own postal code counts too, when BAN answered another one.
  assert.ok(isSuppressed(index, 'MARTINEZ CLAIRE', site({ cp: '69003', registre: '75012 PARIS CEDEX 12' })));
});

test('an empty list changes nothing and costs nothing', () => {
  const practitioners = [['MARTINEZ CLAIRE', 'F', '01', '1', '']];
  assert.equal(withoutSuppressed(practitioners, site(), EMPTY_SUPPRESSION), practitioners);
  assert.deepEqual(withoutSuppressed(null, site(), EMPTY_SUPPRESSION), []);
  assert.equal(isSuppressed(EMPTY_SUPPRESSION, 'MARTINEZ CLAIRE', site()), false);
});

test('a names file pairs with its pack by digest, or by line count for the 2026-09-01 pack', () => {
  const declared = { lignes: 3, sha256: 'abc' };
  assert.deepEqual(pairPractitioners({ declared, lines: 3, siteCount: 3, digest: 'abc' }), { ok: true, reason: null });
  assert.deepEqual(pairPractitioners({ declared, lines: 3, siteCount: 3, digest: 'def' }), { ok: false, reason: 'digest' });
  assert.deepEqual(pairPractitioners({ declared, lines: 4, siteCount: 4, digest: 'abc' }), { ok: false, reason: 'line-count' });
  // The 2026-09-01 pack declares nothing: the line count is all it has.
  assert.deepEqual(pairPractitioners({ lines: 3, siteCount: 3 }), { ok: true, reason: null });
  assert.deepEqual(pairPractitioners({ lines: 2, siteCount: 3 }), { ok: false, reason: 'line-count' });
  // A pack built without names says so, and nothing lying beside it is its.
  assert.deepEqual(pairPractitioners({ declared: null, lines: 3, siteCount: 3 }), { ok: false, reason: 'undeclared' });
  assert.deepEqual(pairPractitioners({ declared, lines: 0, siteCount: 3 }), { ok: false, reason: 'absent' });
});

test('an address line that is a nameplate is caught, a street named after a doctor is not', () => {
  assert.equal(addressNamesPractitioner('CABINET DU DR B. VALDORNE', ['VALDORNE BENOIT']), true);
  assert.equal(addressNamesPractitioner('CABINET MEDICAL DOCTEUR VALDORNE', ['VALDORNE BENOIT']), true);
  // Streets, even when the doctor practising there shares the surname.
  assert.equal(addressNamesPractitioner('12 AVENUE DU DOCTEUR ANDRE VALDORNE', ['VALDORNE MARIE']), false);
  assert.equal(addressNamesPractitioner('R DU DR VALDORNE', ['VALDORNE MARIE']), false);
  // A title with nobody from this address in it is a nameplate for someone
  // else, or a street — not a name this build can attribute.
  assert.equal(addressNamesPractitioner('CABINET DU DR VALDORNE', ['MARTINEZ CLAIRE']), false);
  // A surname without a title is a place name (SAINT MARTIN DU VAR).
  assert.equal(addressNamesPractitioner('SAINT MARTINEZ DU VAR', ['MARTINEZ ERIC']), false);
  assert.equal(addressNamesPractitioner('', ['MARTINEZ ERIC']), false);
});

test('runtime paths default under .gev-cache and follow the environment', () => {
  const defaults = medecinsRuntimePaths('/app', {}, path);
  assert.equal(defaults.packDir, path.join('/app', '.gev-cache', 'medecins-fr', 'pack'));
  assert.equal(defaults.suppressPath, path.join('/app', '.gev-cache', 'medecins-fr', 'suppress.txt'));
  const custom = medecinsRuntimePaths('/app', {
    GEV_MEDECINS_PACK_DIR: 'data/doctors',
    GEV_MEDECINS_SUPPRESS: '/etc/surplomb/suppress.txt',
  }, path);
  assert.equal(custom.packDir, path.resolve('/app', 'data/doctors'));
  assert.equal(custom.suppressPath, '/etc/surplomb/suppress.txt');
});
