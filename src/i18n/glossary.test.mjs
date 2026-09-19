import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROPER_NOUNS, PROPER_NOUN_LIST } from './glossary.js';

const markdown = readFileSync(new URL('../../docs/GLOSSARY.md', import.meta.url), 'utf8');

/** The "Never translate" bullets of docs/GLOSSARY.md, one array per line. */
function markdownProperNouns() {
  const section = markdown.split(/^## Never translate$/m)[1]?.split(/^## /m)[0];
  assert.ok(section, 'docs/GLOSSARY.md lost its "## Never translate" section');
  return section
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- [^:]+:\s*/, '').split('·').map((item) => item.trim()).filter(Boolean));
}

test('the proper nouns in glossary.js are exactly the ones docs/GLOSSARY.md lists', () => {
  assert.deepEqual(Object.values(PROPER_NOUNS).map((items) => [...items]), markdownProperNouns());
});

test('no proper noun is listed twice', () => {
  const all = Object.values(PROPER_NOUNS).flat();
  assert.deepEqual(all.filter((item, index) => all.indexOf(item) !== index), []);
});

test('the flat list tries multi-word names before their parts', () => {
  assert.ok(PROPER_NOUN_LIST.indexOf('Géoportail de l’urbanisme') < PROPER_NOUN_LIST.indexOf('Géoportail'));
  assert.ok(PROPER_NOUN_LIST.indexOf('Île-de-France Mobilités') < PROPER_NOUN_LIST.indexOf('Île-de-France'));
  assert.equal(PROPER_NOUN_LIST.length, Object.values(PROPER_NOUNS).flat().length);
});
