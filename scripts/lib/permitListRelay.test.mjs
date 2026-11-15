import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMIT_LIST_RELAY_ERROR_HEADER,
  permitListRelayFetch,
  permitListRelayHosts,
  permitListRelayTarget,
  resolvePermitListRelay,
} from './permitListRelay.mjs';
import { permitListsRobots, readPermitCity } from './permitLists.mjs';
import { PERMIT_LISTS } from '../../src/data/permitListsFeed.js';

const RELAY = 'http://172.22.0.1:3128';
const text = async (response, max) => { const body = await response.text(); return body.length <= max ? body : null; };
const bytes = async (response) => new Uint8Array(await response.arrayBuffer());
const city = (key) => PERMIT_LISTS.find((entry) => entry.key === key);

/** A relay fixture: answers `<relay>/fetch?url=…` from `site(url, headers)`, and records every call. */
function fakeRelay(site) {
  const calls = [];
  const send = async (url, init = {}) => {
    const asked = new URL(url);
    const headers = new Headers(init.headers);
    calls.push({ url, inner: asked.origin === RELAY && asked.pathname === '/fetch' ? asked.searchParams.get('url') : null, headers });
    return site(calls.at(-1).inner ?? url, headers);
  };
  return { send, calls };
}

test('the relay address is an http(s) base without query, hash or trailing slash', () => {
  assert.equal(resolvePermitListRelay(undefined), null);
  assert.equal(resolvePermitListRelay('  '), null);
  assert.equal(resolvePermitListRelay('not a url'), null);
  assert.equal(resolvePermitListRelay('ftp://172.22.0.1:3128'), null);
  assert.equal(resolvePermitListRelay('http://172.22.0.1:3128/'), RELAY);
  assert.equal(resolvePermitListRelay(' http://172.22.0.1:3128/?x=1#y '), RELAY);
  assert.equal(resolvePermitListRelay('https://relay.example/base/'), 'https://relay.example/base');
});

test('the ten towns whose host drops the staging box are the relayed ones, and nothing else', () => {
  const relayed = PERMIT_LISTS.filter((entry) => entry.source?.relay === true).map((entry) => entry.key).sort();
  assert.deepEqual(relayed, ['04130', '05135', '26381', '34197', '45227', '47025', '57232', '57319', '81136', '88132']
    .map((insee) => `wp-media-${insee}`));
  for (const key of relayed) assert.equal(city(key).source.protocol, 'wp-media', key);
  assert.deepEqual([...permitListRelayHosts(PERMIT_LISTS)].sort(), [
    'beauville-47.fr', 'deyvillers.fr', 'herny.fr', 'jaillans.fr', 'larroque81.org', 'mairie-francaltroff.fr',
    'mairie-peret.fr', 'mairie-saintecolombe-hautesalpes.fr', 'montlaux.fr', 'www.nevoy.fr',
  ]);
  const hosts = permitListRelayHosts([
    { page: 'https://a.example/', source: { relay: true, wpBase: 'https://api.a.example/' } },
    { page: 'https://b.example/', source: { relay: 'yes' } },
    { page: 'https://c.example/' },
  ]);
  assert.deepEqual([...hosts], ['a.example', 'api.a.example'], 'only `relay: true`, with a separate API host');
});

test('a GET to a relayed host goes to the relay with its address encoded; anything else goes direct', () => {
  const hosts = new Set(['herny.fr']);
  const url = 'https://herny.fr/wp-json/wp/v2/media?mime_type=application/pdf&after=2026-10-01T00:00:00&page=1&_fields=date,source_url,title';
  const target = new URL(permitListRelayTarget(url, {}, { relay: RELAY, hosts }));
  assert.equal(target.origin + target.pathname, `${RELAY}/fetch`);
  assert.equal(target.searchParams.get('url'), url, 'the query of the address survives the round trip');
  assert.equal([...target.searchParams.keys()].length, 1);
  assert.equal(permitListRelayTarget(url, { method: 'get' }, { relay: RELAY, hosts }), target.href);
  assert.equal(permitListRelayTarget(url, { method: 'POST' }, { relay: RELAY, hosts }), url, 'the relay reads GET only');
  assert.equal(permitListRelayTarget('https://www.royat.fr/robots.txt', {}, { relay: RELAY, hosts }), 'https://www.royat.fr/robots.txt');
  assert.equal(permitListRelayTarget(url, {}, { relay: null, hosts }), url);
});

test('without `PERMIT_LIST_RELAY`, or with no relayed town, the sweep keeps `fetch` itself', () => {
  const send = async () => new Response('');
  assert.equal(permitListRelayFetch(send, { relay: undefined, cities: PERMIT_LISTS }), send);
  assert.equal(permitListRelayFetch(send, { relay: '', cities: PERMIT_LISTS }), send);
  assert.equal(permitListRelayFetch(send, { relay: RELAY, cities: [{ page: 'https://www.royat.fr/' }] }), send);
});

test('the site’s own answer passes through the relay; the relay’s own failure reads as no answer', async () => {
  const { send, calls } = fakeRelay((url) => {
    if (url.endsWith('/gone.pdf')) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    if (url.endsWith('/same.pdf')) return new Response(null, { status: 304, headers: { ETag: '"a"' } });
    if (url.endsWith('/down.pdf')) {
      return new Response('upstream-unreachable\n', { status: 502, headers: { [PERMIT_LIST_RELAY_ERROR_HEADER]: 'upstream-unreachable' } });
    }
    return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf', 'Last-Modified': 'Thu, 12 Nov 2026 13:42:18 GMT' } });
  });
  const relayed = permitListRelayFetch(send, { relay: `${RELAY}/`, cities: [city('wp-media-57319')] });
  const ok = await relayed('https://herny.fr/wp-content/uploads/a.pdf', { headers: { 'User-Agent': 'Surplomb/1.0', 'If-None-Match': '"z"' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('last-modified'), 'Thu, 12 Nov 2026 13:42:18 GMT');
  assert.equal(await ok.text(), '%PDF-1.7');
  assert.equal(calls[0].inner, 'https://herny.fr/wp-content/uploads/a.pdf');
  assert.equal(calls[0].headers.get('user-agent'), 'Surplomb/1.0', 'the user agent travels with the request');
  assert.equal(calls[0].headers.get('if-none-match'), '"z"');
  assert.equal((await relayed('https://herny.fr/gone.pdf')).status, 404, 'a missing file is the site’s answer');
  assert.equal((await relayed('https://herny.fr/same.pdf')).status, 304);
  await assert.rejects(relayed('https://herny.fr/down.pdf'), /relay: upstream-unreachable \(HTTP 502\)/);
  await relayed('https://www.royat.fr/robots.txt');
  assert.equal(calls.at(-1).url, 'https://www.royat.fr/robots.txt', 'a town that is not relayed is asked directly');
});

test('a relayed town’s robots.txt and media API are read through the relay by the sweep’s own readers', async () => {
  const herny = city('wp-media-57319');
  const { send, calls } = fakeRelay((url, headers) => {
    const { pathname } = new URL(url);
    if (pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /wp-admin/\nDisallow: /search/\n', { headers: { 'Content-Type': 'text/plain' } });
    }
    if (pathname === '/wp-json/wp/v2/media' && headers.get('accept') === 'application/json') {
      return new Response('[]', { headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
    }
    return new Response('', { status: 404 });
  });
  // The server's `permitListsHttp`, less the pacing: `fetch` throws where the server's returns null.
  const relayed = permitListRelayFetch(send, { relay: RELAY, cities: PERMIT_LISTS });
  const http = { fetch: (url, init) => relayed(url, init).catch(() => null), text, bytes };
  const robots = await permitListsRobots(herny, http);
  assert.equal(robots.final, true);
  assert.equal(robots.allows('/wp-json/wp/v2/media'), true);
  assert.equal(robots.allows('/wp-content/uploads/2026/11/a.pdf'), true);
  const read = await readPermitCity(herny, http, { allows: robots.allows, day: '2026-11-15' });
  assert.ok(read, 'an empty month is still a reading');
  assert.deepEqual(calls.map((call) => new URL(call.url).origin), [RELAY, RELAY]);
  assert.deepEqual(calls.map((call) => new URL(call.inner).pathname), ['/robots.txt', '/wp-json/wp/v2/media']);
  assert.equal(new URL(calls[1].inner).searchParams.get('mime_type'), 'application/pdf');
});

test('a relay that cannot reach a town leaves its robots.txt unsettled, not refused for a day', async () => {
  const { send } = fakeRelay(() => new Response('upstream-unreachable\n', {
    status: 502, headers: { [PERMIT_LIST_RELAY_ERROR_HEADER]: 'upstream-unreachable' },
  }));
  const relayed = permitListRelayFetch(send, { relay: RELAY, cities: PERMIT_LISTS });
  const http = { fetch: (url, init) => relayed(url, init).catch(() => null), text, bytes };
  const robots = await permitListsRobots(city('wp-media-88132'), http);
  assert.equal(robots.final, false, 'asked again next time');
  // The same 502 from the site itself is its answer, and reads as a refusal (RFC 9309).
  const site = permitListRelayFetch(async () => new Response('Bad gateway', { status: 502 }), { relay: RELAY, cities: PERMIT_LISTS });
  const refused = await permitListsRobots(city('wp-media-88132'), { fetch: site, text, bytes });
  assert.equal(refused.final, true);
  assert.equal(refused.allows('/wp-json/wp/v2/media'), false);
});
