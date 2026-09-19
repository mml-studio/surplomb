// No i18n module, catalog or migrated module may read the machine's language
// when it loads.
//
// Node 24+ ships a global `navigator` whose `language` is the runner's. A
// module that consulted it at import would switch `npm test` to English on an
// en-US CI runner, and ~1,400 French assertions would fail for a reason that
// has nothing to do with the code they test. So this file poisons `navigator`
// and `document` BEFORE importing anything — dynamically, since static imports
// would be evaluated before the poison — and fails if an import touches them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every catalog under src/, plus the modules they belong to. */
function catalogsAndModules() {
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'local_data' && entry.name !== 'fixtures') visit(absolute);
      } else if (entry.name.endsWith('.i18n.js')) {
        found.push(absolute, absolute.replace(/\.i18n\.js$/, '.js'));
      }
    }
  };
  visit(SRC);
  return [...new Set(found)].sort();
}

const touched = [];
for (const name of ['navigator', 'document']) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      // Only OUR modules are on trial: Cesium's own feature detection reads
      // both at import and is not what this test is about.
      const caller = new Error().stack.split('\n')[2]?.trim() || '';
      if (caller.includes(pathToFileURL(SRC).href) && !caller.includes('node_modules')) {
        touched.push(`${name} (${caller})`);
      }
      return undefined;
    },
  });
}

test('importing the i18n layer and every catalogued module reads neither navigator nor document', async () => {
  const i18n = readdirSync(path.join(SRC, 'i18n'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(SRC, 'i18n', name));
  const modules = [...new Set([...i18n, ...catalogsAndModules()])];
  assert.ok(modules.length >= 12, `found only ${modules.length} modules`);
  for (const file of modules) await import(pathToFileURL(file).href);
  assert.deepEqual(touched, [], 'a module read the environment while loading');
});

test('with navigator saying en-US, the locale is still French', async () => {
  const { getLocale } = await import('./locale.js');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US', languages: ['en-US', 'en'] },
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  assert.equal(getLocale(), 'fr');
});
