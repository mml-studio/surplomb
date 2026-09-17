import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEGAL_BLOCKS,
  LEGAL_FIELDS,
  LEGAL_PAGES,
  legalNoticeFromEnv,
  legalPageForUrl,
  renderLegalPage,
} from './legalNotice.js';

const FULL_ENV = Object.freeze({
  GEV_LEGAL_PUBLISHER: 'Exemple SAS, au capital de 1 000 €',
  GEV_LEGAL_REGISTRATION: 'RCS Nulle-Part 000 000 000',
  GEV_LEGAL_ADDRESS: '1 rue de l’Exemple, 00000 Nulle-Part',
  GEV_LEGAL_PHONE: '+33 1 23 45 67 89',
  GEV_LEGAL_EMAIL: 'contact@example.org',
  GEV_LEGAL_DIRECTOR: 'Camille Exemple',
  GEV_LEGAL_HOSTING: 'Hébergeur A, 1 avenue A, Ville A | Stockage B, 2 rue B, Ville B',
});

const page = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('an instance that sets nothing is incomplete, and says which variables', () => {
  const notice = legalNoticeFromEnv({});
  assert.equal(notice.complete, false);
  assert.deepEqual(
    notice.missing,
    LEGAL_FIELDS.filter((f) => f.required).map((f) => f.env),
  );
  // An unregistered individual has no number to show; the phone is the
  // operator's call. Neither holds the page back.
  assert.ok(!notice.missing.includes('GEV_LEGAL_REGISTRATION'));
  assert.ok(!notice.missing.includes('GEV_LEGAL_PHONE'));
});

test('a full identity is complete, and the providers split on the pipe only', () => {
  const notice = legalNoticeFromEnv(FULL_ENV);
  assert.equal(notice.complete, true);
  assert.deepEqual(notice.hosting, ['Hébergeur A, 1 avenue A, Ville A', 'Stockage B, 2 rue B, Ville B']);
  // Blank entries between pipes are not providers.
  assert.equal(legalNoticeFromEnv({ ...FULL_ENV, GEV_LEGAL_HOSTING: ' | ' }).complete, false);
});

test('a configured page carries the identity and no fallback', () => {
  const html = renderLegalPage(page('mentions-legales.html'), FULL_ENV);
  assert.match(html, /Exemple SAS, au capital de 1 000 €/);
  assert.match(html, /RCS Nulle-Part 000 000 000/);
  assert.match(html, /Camille Exemple/);
  assert.match(html, /<a href="mailto:contact@example\.org">contact@example\.org<\/a>/);
  assert.match(html, /<a href="tel:\+33123456789">\+33 1 23 45 67 89<\/a>/);
  assert.match(html, /<li>Stockage B, 2 rue B, Ville B<\/li>/);
  assert.doesNotMatch(html, /class="missing/);
  assert.doesNotMatch(html, /<!--\/?gev:/, 'every marker is consumed');
});

test('an instance may leave the phone out, and the row goes with it', () => {
  const { GEV_LEGAL_PHONE, ...noPhone } = FULL_ENV;
  const notice = legalNoticeFromEnv(noPhone);
  assert.equal(notice.complete, true);
  const html = renderLegalPage(page('mentions-legales.html'), noPhone);
  assert.doesNotMatch(html, /Téléphone/);
  assert.doesNotMatch(html, /tel:/);
  assert.match(html, /Exemple SAS/);
  assert.doesNotMatch(html, /class="missing/);
});

test('the environment is text, never markup', () => {
  const html = renderLegalPage(page('mentions-legales.html'), {
    ...FULL_ENV,
    GEV_LEGAL_PUBLISHER: '<script>alert(1)</script>',
    GEV_LEGAL_EMAIL: 'x@example.org"><img src=x>',
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
});

test('an incomplete identity keeps the fallback visible and names what is missing', () => {
  const { GEV_LEGAL_ADDRESS, ...partial } = FULL_ENV;
  const html = renderLegalPage(page('mentions-legales.html'), partial);
  assert.match(html, /Cette instance n’a pas renseigné son éditeur/);
  assert.match(html, /Variables manquantes : <code>GEV_LEGAL_ADDRESS<\/code>/);
  // Half an identity must not look like a finished one.
  assert.doesNotMatch(html, /Exemple SAS/);
});

test('the clean path and the file path both name a legal page, nothing else does', () => {
  assert.equal(legalPageForUrl('/mentions-legales'), 'mentions-legales.html');
  assert.equal(legalPageForUrl('/mentions-legales.html'), 'mentions-legales.html');
  assert.equal(legalPageForUrl('/mentions-legales/?ref=globe'), 'mentions-legales.html');
  assert.equal(legalPageForUrl('/confidentialite#cookies'), 'confidentialite.html');
  for (const url of ['/', '/fiche.html', '/api/confidentialite', '/MENTIONS-LEGALES', '/x/../mentions-legales', '/constructor']) {
    assert.equal(legalPageForUrl(url), null, url);
  }
});

test('each shipped page is well-formed for the substitution', () => {
  const expected = {
    'mentions-legales.html': ['publisher', 'hosting'],
    'confidentialite.html': ['controller'],
  };
  for (const file of Object.values(LEGAL_PAGES)) {
    const html = page(file);
    // A marker quoted inside an HTML comment closes that comment early: the
    // openers and closers must pair up.
    assert.equal(html.split('<!--').length, html.split('-->').length, `${file}: unbalanced comments`);
    for (const name of LEGAL_BLOCKS) {
      const opens = html.split(`<!--gev:legal:${name}-->`).length - 1;
      const closes = html.split(`<!--/gev:legal:${name}-->`).length - 1;
      assert.equal(opens, closes, `${file}: ${name} markers unbalanced`);
      assert.equal(opens > 0, expected[file].includes(name), `${file}: ${name}`);
    }
    assert.match(html, /<meta name="robots" content="noindex">/, `${file} is not a landing page`);
  }
});

test('no identity is committed: the pages carry no address, mail or phone of their own', () => {
  for (const file of Object.values(LEGAL_PAGES)) {
    const html = page(file);
    assert.doesNotMatch(html, /[\w.+-]+@[\w-]+\.[\w.]+/, `${file} names an email address`);
    assert.doesNotMatch(html, /(?:\+33|\b0[1-9])(?:[ .-]?\d{2}){4}\b/, `${file} names a phone number`);
  }
});

test('the waitlist paragraph appears only on an instance that runs one', () => {
  const html = page('confidentialite.html');
  assert.match(html, /<!--gev:if:waitlist-->/);
  const off = renderLegalPage(html, FULL_ENV);
  const on = renderLegalPage(html, { ...FULL_ENV, GEV_WAITLIST_BUTTONDOWN: 'exemple' });
  assert.doesNotMatch(off, /Buttondown/);
  assert.match(on, /Buttondown/);
  assert.doesNotMatch(on, /<!--\/?gev:/);
});

test('the address sheet stays out of search engines, as the privacy page promises', () => {
  // DVF sales are published on the condition that they are not indexed by
  // online search engines (Livre des procédures fiscales, art. R*112 A-3), and
  // `fiche.html` prints them as text. The launch-day removal of `noindex`
  // concerns `index.html` alone.
  assert.match(page('fiche.html'), /<meta name="robots" content="noindex">/);
  assert.match(page('confidentialite.html'), /moteurs de recherche/);
});

test('the trial cookie is disclosed only where a trial runs', () => {
  const html = page('confidentialite.html');
  assert.match(html, /<!--gev:if:trial-->/);
  assert.doesNotMatch(renderLegalPage(html, FULL_ENV), /gev_trial/);
  assert.doesNotMatch(renderLegalPage(html, { ...FULL_ENV, GEV_TRIAL_LIMIT: '0' }), /gev_trial/);
  assert.match(renderLegalPage(html, { ...FULL_ENV, GEV_TRIAL_LIMIT: '5' }), /gev_trial/);
});
