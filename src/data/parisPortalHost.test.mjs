// The Paris layers read the city's Opendatasoft tenant by its Opendatasoft
// host. On 2026-09-23 paris.fr's own name servers answered NXDOMAIN for the
// `opendata.paris.fr` alias, and « Îlots de fraîcheur », « Comptages routiers »
// and the Paris permits all failed with a 503 while
// `parisdata.opendatasoft.com` served every one of their datasets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { FRAICHEUR_PORTAL } from './fraicheurFeed.js';
import { COMPTAGES_PORTAL } from './comptagesFeed.js';
import { LOCAL_ADS_PORTALS } from './adsFeed.js';

const TENANT_HOST = 'parisdata.opendatasoft.com';

test('the three Paris layers query the Opendatasoft host, not the city alias', () => {
  assert.equal(FRAICHEUR_PORTAL, TENANT_HOST);
  assert.equal(COMPTAGES_PORTAL, TENANT_HOST);
  assert.equal(LOCAL_ADS_PORTALS.find((portal) => portal.key === 'paris').portal, TENANT_HOST);
});

test('no shipped module or proxy builds a URL on the dead alias', () => {
  const offenders = [];
  const scan = (path) => {
    if (/https:\/\/opendata\.paris\.fr/.test(readFileSync(path, 'utf8'))) offenders.push(path);
  };
  const dataDir = new URL('.', import.meta.url);
  for (const name of readdirSync(dataDir)) {
    if (name.endsWith('.js')) scan(new URL(name, dataDir));
  }
  scan(new URL('../../vite.config.js', import.meta.url));
  assert.deepEqual(offenders.map(String), []);
});
