// Every catalog in the repository, checked leaf by leaf.
//
// A leaf must have `fr` AND `en`, of the same type; a function must take the
// same number of arguments in both languages (no default parameters: they
// hide from `.length`); an array must have the same length; and the English
// must not be French — rendered with the leaf's `sample` arguments when it is
// a function, and judged by src/i18n/frenchDetector.js with the glossary's
// proper nouns (plus the leaf's own `keep` list) allowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MESSAGE_LEAF_KEYS, isCatalog, messageLeaves } from './messages.js';
import { findFrench } from './frenchDetector.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function catalogFiles(dir = SRC) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'local_data' && entry.name !== 'fixtures') out.push(...catalogFiles(absolute));
    } else if (entry.name.endsWith('.i18n.js')) out.push(absolute);
  }
  return out.sort();
}

const FILES = catalogFiles();
const relative = (file) => path.relative(path.dirname(SRC), file).split(path.sep).join('/');

/** Render a value in one language: strings as they are, functions with their sample. */
function render(value, sample) {
  if (typeof value === 'function') {
    const args = Array.isArray(sample) ? sample : Array.from({ length: value.length }, (_, i) => i + 2);
    return [String(value(...args))];
  }
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

test('the repository has catalogs, and each sits next to its module', () => {
  assert.ok(FILES.length >= 6, `found ${FILES.length} catalogs`);
  for (const file of FILES) {
    const module = file.replace(/\.i18n\.js$/, '.js');
    assert.ok(existsSync(module), `${relative(file)} has no ${path.basename(module)} beside it`);
  }
});

for (const file of FILES) {
  test(`${relative(file)}: every leaf is complete, parallel and English in English`, async () => {
    const exports = await import(pathToFileURL(file).href);
    assert.ok(isCatalog(exports.default), 'the default export must be defineMessages({…})');
    const catalogs = Object.entries(exports).filter(([, value]) => isCatalog(value));
    const problems = [];
    for (const [exportName, catalog] of catalogs) {
      for (const { path: key, leaf } of messageLeaves(catalog.definition)) {
        const where = `${exportName === 'default' ? '' : `${exportName}.`}${key}`;
        if (!leaf) {
          problems.push(`${where}: not a leaf ({ fr, en }) nor a group`);
          continue;
        }
        const extra = Object.keys(leaf).filter((k) => !MESSAGE_LEAF_KEYS.includes(k));
        if (extra.length) problems.push(`${where}: unknown key(s) ${extra.join(', ')}`);
        if (!Object.hasOwn(leaf, 'en')) {
          problems.push(`${where}: no English`);
          continue;
        }
        const { fr, en } = leaf;
        const kind = (v) => (Array.isArray(v) ? 'array' : typeof v);
        if (!['string', 'function', 'array'].includes(kind(fr))) problems.push(`${where}: fr is a ${kind(fr)}`);
        if (kind(fr) !== kind(en)) {
          problems.push(`${where}: fr is a ${kind(fr)}, en is a ${kind(en)}`);
          continue;
        }
        if (typeof fr === 'function' && fr.length !== en.length) {
          problems.push(`${where}: fr takes ${fr.length} argument(s), en takes ${en.length}`);
        }
        if (Array.isArray(fr) && fr.length !== en.length) {
          problems.push(`${where}: fr has ${fr.length} entries, en has ${en.length}`);
        }
        if (typeof fr === 'string' && !fr.trim()) problems.push(`${where}: empty French`);
        if (typeof en === 'string' && !en.trim()) problems.push(`${where}: empty English`);
        if (leaf.note !== undefined && typeof leaf.note !== 'string') problems.push(`${where}: note must be a string`);
        if (leaf.sample !== undefined && (!Array.isArray(leaf.sample) || typeof fr !== 'function')) {
          problems.push(`${where}: sample is an argument array, for function messages`);
        }
        if (leaf.keep !== undefined && !(Array.isArray(leaf.keep) && leaf.keep.every((k) => typeof k === 'string'))) {
          problems.push(`${where}: keep is an array of proper nouns`);
        }
        let rendered;
        try {
          rendered = render(en, leaf.sample);
          render(fr, leaf.sample);
        } catch (error) {
          problems.push(`${where}: rendering with its sample threw (${error.message})`);
          continue;
        }
        for (const text of rendered) {
          const found = findFrench(text, { allow: leaf.keep || [] });
          if (found.length) {
            problems.push(`${where}: French in English — ${found.map((f) => `${f.kind} “${f.match}”`).join(', ')}: ${text}`);
          }
        }
      }
    }
    assert.deepEqual(problems, []);
  });
}
