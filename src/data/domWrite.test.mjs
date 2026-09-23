import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeAttribute, writeProperty, writeText } from './domWrite.js';

/** A node that counts every assignment, the way a mutation observer would. */
function makeNode() {
  const writes = [];
  const attributes = new Map();
  const node = { writes };
  for (const key of ['textContent', 'hidden', 'title']) {
    let value = key === 'hidden' ? false : '';
    Object.defineProperty(node, key, {
      get: () => value,
      set: (next) => { writes.push(key); value = next; },
    });
  }
  node.setAttribute = (name, value) => { writes.push(`@${name}`); attributes.set(name, String(value)); };
  node.getAttribute = (name) => (attributes.has(name) ? attributes.get(name) : null);
  return node;
}

test('a value already on screen is not written again', () => {
  const node = makeNode();
  assert.equal(writeText(node, '84'), true);
  assert.equal(writeText(node, '84'), false);
  assert.equal(writeProperty(node, 'hidden', true), true);
  assert.equal(writeProperty(node, 'hidden', true), false);
  assert.equal(writeAttribute(node, 'aria-pressed', 'true'), true);
  assert.equal(writeAttribute(node, 'aria-pressed', 'true'), false);
  assert.deepEqual(node.writes, ['textContent', 'hidden', '@aria-pressed']);
});

test('a changed value is written, stringified the way the DOM would', () => {
  const node = makeNode();
  writeText(node, 84);
  assert.equal(node.textContent, '84');
  assert.equal(writeText(node, 84), false, 'the number and its text are the same value on screen');
  writeText(node, null);
  assert.equal(node.textContent, '');
  writeAttribute(node, 'aria-busy', false);
  assert.equal(node.getAttribute('aria-busy'), 'false');
  assert.equal(writeAttribute(node, 'aria-busy', false), false);
});

test('a missing node is a no-op, and a node that cannot be read back is written as before', () => {
  assert.equal(writeText(null, 'x'), false);
  assert.equal(writeProperty(undefined, 'hidden', true), false);
  assert.equal(writeAttribute(null, 'title', 'x'), false);
  const calls = [];
  const blind = { setAttribute: (name, value) => calls.push([name, value]) };
  writeAttribute(blind, 'aria-label', 'Antennes');
  writeAttribute(blind, 'aria-label', 'Antennes');
  assert.deepEqual(calls, [['aria-label', 'Antennes'], ['aria-label', 'Antennes']]);
});

test('a dataset key is a property like any other', () => {
  const dataset = {};
  assert.equal(writeProperty(dataset, 'feedState', 'nominal'), true);
  assert.equal(writeProperty(dataset, 'feedState', 'nominal'), false);
  assert.equal(dataset.feedState, 'nominal');
});
