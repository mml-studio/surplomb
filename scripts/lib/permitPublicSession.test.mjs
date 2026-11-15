import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permitPublicSession } from './permitPublicSession.mjs';
import { permitListsRobots } from './permitLists.mjs';
import { PERMIT_LISTS, permitListLinks } from '../../src/data/permitListsFeed.js';

const page = 'https://town.example/webdelibplus/jsp/legal.jsp?role=usager';
const city = { page, source: { publicCookieRedirect: true } };
const redirect = '/redirect_ABCDEFGHIJKLMNOPQRSTUVWX/webdelibplus/jsp/legal.jsp?role=usager';
const html = (target = redirect) => `<html><head></head><body><script>window.location.href='${target}';</script><noscript>This website requires JS enabled and cookies</noscript></body></html>`;
const response = (body, cookie = 'anonymous=example') => new Response(body, { headers: { 'Content-Type': 'text/html', 'Set-Cookie': `${cookie}; Path=/; Secure; HttpOnly` } });
const text = async (r, max) => { const body = await r.text(); return body.length <= max ? body : null; };

test('an anonymous public cookie survives the literal redirect and its HTTP return redirect', async () => {
  const calls = [];
  const http = { text, async fetch(url, options) {
    calls.push({ url, cookie: new Headers(options.headers).get('Cookie') });
    if (calls.length === 1) return response(html());
    if (calls.length === 2) return new Response(null, { status: 302, headers: { Location: page, 'Set-Cookie': 'publicSession=ready; Path=/' } });
    return response('<html>Urbanism table</html>');
  } };
  const session = permitPublicSession(city, http);
  assert.equal(await (await session.fetch(page)).text(), '<html>Urbanism table</html>');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].cookie, 'anonymous=example');
  assert.match(calls[2].cookie, /publicSession=ready/);
  assert.doesNotMatch(JSON.stringify(session), /ready|anonymous/);
});

test('public-session cookies stay within their origin and one collection', async () => {
  const calls = [];
  const http = { text, async fetch(url, options) { calls.push(new Headers(options?.headers).get('Cookie')); return response('<html>Table</html>'); } };
  const session = permitPublicSession(city, http);
  await session.fetch(page);
  await session.fetch(page);
  await session.fetch('https://elsewhere.example/file.pdf');
  await permitPublicSession(city, http).fetch(page);
  assert.deepEqual(calls, [null, 'anonymous=example', null, null]);
  assert.equal(permitPublicSession({ page }, http), http);
});

test('no script runs, and changed paths, origins, queries or challenges are not followed', async () => {
  for (const body of [html('https://elsewhere.example/'), html(redirect.replace('legal.jsp', 'login.jsp')),
    html(redirect.replace('usager', 'admin')), '<html><script>document.cookie="auth=value"</script></html>', '<html>Verify you are human</html>']) {
    let calls = 0;
    const http = { text, async fetch() { calls += 1; return response(body); } };
    assert.equal(await (await permitPublicSession(city, http).fetch(page)).text(), body);
    assert.equal(calls, 1);
  }
});

test('a repeated JavaScript redirect or HTTP loop stops at its bound', async () => {
  let calls = 0;
  const session = permitPublicSession(city, { text, async fetch() { calls += 1; return response(html()); } });
  assert.match(await (await session.fetch(page)).text(), /window.location/);
  assert.equal(calls, 2);
  calls = 0;
  const loop = permitPublicSession(city, { text, async fetch() { calls += 1; return new Response(null, { status: 302, headers: { Location: page } }); } });
  assert.equal(await loop.fetch(page), null);
  assert.equal(calls, 4);
});

test('a large streamed index stays readable without waiting for clone cancellation', async () => {
  const body = `<html>${'Public index '.repeat(1000)}</html>`;
  const http = { async fetch() { return response(body); },
    async text() { throw new Error('The capped proxy reader must not consume the preview clone'); } };
  let timer;
  try {
    const result = await Promise.race([
      permitPublicSession(city, http).fetch(page),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The original body was blocked by clone cancellation')), 1000); }),
    ]);
    assert.equal(await result.text(), body);
  } finally {
    clearTimeout(timer);
  }
});

test('Marseille’s page and its robots.txt are read through the same initializer since 2026-10-18', async () => {
  const marseille = PERMIT_LISTS.find((city) => city.key === 'marseille');
  assert.equal(marseille.source.publicCookieRedirect, true);
  // The 288-byte answer every first request got on 2026-11-15, its token cut.
  const initializer = (path) => `<html lang="en"><head></head><body><script>window.location.href='/redirect_JHREYU6I3QGSBR4YFBYAYDQQNU5H5OBUMCU5WB64BZSNJX7J7VIA====${path}';</script><noscript>This website requires JS enabled and cookies</noscript></body></html>`;
  const page = '<a href="/sites/default/files/contenu/logement/ServicesetDemarches/registre-ads-en-cours-instruction-12-11-2026.pdf">Liste des&nbsp;dossiers en cours d\'instruction classés par arrondissement</a>'
    + '<a href="/sites/default/files/contenu/logement/ServicesetDemarches/affichage-du-27.08.26-au-10.11.26.pdf">Liste des autorisations délivrées ces deux derniers mois</a>';
  const robots = 'User-agent: *\nDisallow: /core/\nDisallow: /profiles/\n';
  const calls = [];
  const http = { text, async fetch(url, options) {
    const { pathname } = new URL(url);
    const cookie = new Headers(options?.headers).get('Cookie');
    calls.push([pathname.startsWith('/redirect_') ? 'redirect' : pathname, cookie]);
    if (pathname.startsWith('/redirect_')) {
      return new Response(null, { status: 307, headers: { Location: pathname.replace(/^\/redirect_[A-Z0-9=]+/, '') } });
    }
    if (!cookie) return response(initializer(pathname), 'bot_mitigation_cookie=EXAMPLE');
    if (pathname === '/robots.txt') return new Response(robots, { headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
    return new Response(page, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  } };
  const verdict = await permitListsRobots(marseille, http);
  assert.equal(verdict.final, true);
  assert.equal(verdict.allows('/core/install.php'), false, 'the real robots.txt is read, not the initializer taken for none');
  assert.equal(verdict.allows(new URL(marseille.page).pathname), true);
  const answer = await permitPublicSession(marseille, http).fetch(marseille.page);
  assert.deepEqual(permitListLinks(marseille, await answer.text()).map((list) => [list.board, list.layout, list.url.split('/').at(-1)]), [
    ['filings', 'register', 'registre-ads-en-cours-instruction-12-11-2026.pdf'],
    ['decisions', 'decisions', 'affichage-du-27.08.26-au-10.11.26.pdf'],
  ]);
  assert.deepEqual(calls.slice(-3), [[new URL(marseille.page).pathname, null], ['redirect', 'bot_mitigation_cookie=EXAMPLE'],
    [new URL(marseille.page).pathname, 'bot_mitigation_cookie=EXAMPLE']]);
});
