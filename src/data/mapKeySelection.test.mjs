// Whether the map key can carry a selection card — the question that decides
// between a tag over the globe and a card beside it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mapKeyCarriesSelection } from './mapKeySelection.js';

/** A key node and the page around it, as the browser would answer for them. */
function page({ shell = 'desktop', hidden = false, collapsed = false, style = null, rects = 1 } = {}) {
  const key = {
    hidden,
    classList: { contains: (name) => collapsed && name === 'collapsed' },
    getClientRects: () => Array.from({ length: rects }, () => ({})),
  };
  globalThis.document = {
    documentElement: { dataset: { shell } },
    getElementById: (id) => (id === 'map-legend' ? key : null),
  };
  globalThis.getComputedStyle = style ? () => style : undefined;
  return key;
}

test('the key carries the card only where the reader can actually see it', () => {
  const originalDocument = globalThis.document;
  const originalStyle = globalThis.getComputedStyle;
  try {
    page();
    assert.equal(mapKeyCarriesSelection(), true);

    // THE CLEAN VIEW HIDES WITHOUT REMOVING: `body.ui-clean-view #map-legend`
    // is `opacity: 0; visibility: hidden`, and such a node KEEPS its layout
    // boxes. Read from `getClientRects` alone, the key answered "on screen"
    // and a clicked mast printed its title on the globe and its card in a
    // panel nobody could see.
    page({ style: { visibility: 'hidden', display: 'block', opacity: '0' } });
    assert.equal(mapKeyCarriesSelection(), false, 'the clean view is not a key on screen');
    page({ style: { visibility: 'visible', display: 'none', opacity: '1' } });
    assert.equal(mapKeyCarriesSelection(), false);
    page({ style: { visibility: 'visible', display: 'block', opacity: '0' } });
    assert.equal(mapKeyCarriesSelection(), false);
    page({ style: { visibility: 'visible', display: 'block', opacity: '1' } });
    assert.equal(mapKeyCarriesSelection(), true);

    // Folded, hidden, off the layout, on a phone: the globe keeps the card.
    page({ collapsed: true });
    assert.equal(mapKeyCarriesSelection(), false);
    page({ hidden: true });
    assert.equal(mapKeyCarriesSelection(), false);
    page({ rects: 0 });
    assert.equal(mapKeyCarriesSelection(), false);
    page({ shell: 'phone' });
    assert.equal(mapKeyCarriesSelection(), false, 'the phone has a tab of its own for the selection');

    globalThis.document = { getElementById: () => null, documentElement: { dataset: {} } };
    assert.equal(mapKeyCarriesSelection(), false, 'no key at all');
    globalThis.document = undefined;
    assert.equal(mapKeyCarriesSelection(), false);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = originalStyle;
  }
});
