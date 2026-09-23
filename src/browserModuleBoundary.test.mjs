import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** Every browser-built module under src/ — the test files are Node-only. */
function browserModules(directory = SRC_ROOT) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...browserModules(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute);
  }
  return files.sort();
}

/**
 * Modules that live under `src/` for test proximity but are only ever loaded
 * by the dev server in `vite.config.js`, never by the browser.
 *
 * A glob over `src/**\/*.js` is the right shape for this guard — it cannot
 * produce a false NEGATIVE the way a transitive-import walk can — but it does
 * assume everything under `src/` is browser-built, and in this fork two things
 * are not. The exemption is not a suppression: the test below re-earns it on
 * every run by checking that no browser module imports these, so the day one
 * does, the boundary is enforced again with no edit here.
 */
const SERVER_ONLY = new Map([
  ['data/vigicruesFeed.js', 'node:crypto, for the geometryVersion hash the /api/vigicrues proxy stamps'],
  ['data/amenitiesPack.js', 'node:fs/zlib, for the BPE fold and the sharded pack the /api/amenities-fr proxy reads'],
  ['data/cctvFrameChecks.js', 'node:crypto, for the placeholder-frame digest the /api/cctv proxy and the timelapse recorder check'],
  ['data/cctvTimelapse.js', 'node:fs, for the recorded camera frames the /api/cctv/timelapse routes serve'],
  ['trialQuota.js', 'node:crypto, for the HMAC that signs the hosted trial cookie'],
  ['vrsStandingData.js', 'node:fs/zlib, for the daily VRS standing-data tarball the /api/flight-info proxy answers from'],
]);

test('no browser-built module imports a Node core module', () => {
  // Vite externalizes `node:*` for the browser and only WARNS, so a stray
  // import survives the build and turns into a runtime failure the moment the
  // guard around it is wrong. src/data/naturalEarthRegions.js and
  // src/data/neighborhoodPolygons.js both carried one to read their bundled
  // JSON packs under node:test; an import attribute serves both runtimes.
  const offenders = [];
  for (const file of browserModules()) {
    const relative = path.relative(SRC_ROOT, file).split(path.sep).join('/');
    if (SERVER_ONLY.has(relative)) continue;
    const source = readFileSync(file, 'utf8');
    // Static `from 'node:fs'` and dynamic `import('node:fs')`, quoted either way.
    if (/\bfrom\s*['"]node:|\bimport\s*\(\s*(?:\/\*[^*]*\*\/\s*)?['"]node:/.test(source)) {
      offenders.push(relative);
    }
  }

  assert.deepEqual(offenders, [], `Node core imports reached the browser build: ${offenders.join(', ')}`);
});

test('a server-only exemption lapses the moment a browser module imports it', () => {
  for (const [relative, why] of SERVER_ONLY) {
    const absolute = path.join(SRC_ROOT, relative);
    const specifier = path.basename(relative);
    // A server-only module importing another (the timelapse recorder reads
    // the frame checks) is still server-side: only browser importers count.
    const importers = browserModules()
      .filter((file) => file !== absolute)
      .filter((file) => !SERVER_ONLY.has(path.relative(SRC_ROOT, file).split(path.sep).join('/')))
      .filter((file) => new RegExp(`(?:from|import\\()\\s*['"][^'"]*\\b${specifier.replace('.', '\\.')}['"]`)
        .test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC_ROOT, file).split(path.sep).join('/'));
    assert.deepEqual(
      importers,
      [],
      `${relative} is exempt because it is server-only (${why}), but ${importers.join(', ')} imports it — `
      + 'either the exemption is wrong or the import is.',
    );
  }
});
