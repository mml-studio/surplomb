// The owner-pass link printer: it must refuse to print a link that would not
// work, and name the origin the owner actually browses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerPassCommand } from './owner-pass.mjs';
import { verifyOwnerLink } from '../src/trialQuota.js';

const SECRET = 'a-script-owner-secret-long-enough-to-count';
const ENV = { GEV_TRIAL_LIMIT: '5', GEV_OWNER_PASS_SECRET: SECRET };

test('prints a link the server will take, for the public site by default', () => {
  const { code, out } = ownerPassCommand([], ENV);
  assert.equal(code, 0);
  const url = new URL(out.split('\n')[0]);
  assert.equal(`${url.origin}${url.pathname}`, 'https://surplomb.app/api/owner-pass');
  assert.ok(verifyOwnerLink(url.searchParams.get('t'), SECRET));
});

test('names the origin it is given, or the one the deployment declares', () => {
  const given = ownerPassCommand(['https://www.surplomb.app/'], ENV);
  assert.match(given.out, /^https:\/\/www\.surplomb\.app\/api\/owner-pass\?t=/);
  const declared = ownerPassCommand([], { ...ENV, GEV_PUBLIC_ORIGIN: 'https://example.org' });
  assert.match(declared.out, /^https:\/\/example\.org\/api\/owner-pass\?t=/);
});

test('refuses rather than print a link that would be a 404', () => {
  assert.equal(ownerPassCommand([], { GEV_OWNER_PASS_SECRET: SECRET }).code, 1, 'no trial');
  assert.equal(ownerPassCommand([], { GEV_TRIAL_LIMIT: '5' }).code, 1, 'no secret');
  assert.equal(ownerPassCommand([], { ...ENV, GEV_OWNER_PASS_SECRET: 'short' }).code, 1, 'short secret');
  assert.equal(ownerPassCommand(['not a url'], ENV).code, 1);
  assert.equal(ownerPassCommand(['javascript:alert(1)'], ENV).code, 1);
});
