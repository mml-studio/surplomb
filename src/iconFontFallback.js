/**
 * iconFontFallback — draw a system symbol where the icon font never arrived.
 *
 * Every icon in this interface is a Material Symbols LIGATURE: the element's
 * text is the icon's name, and the font turns `my_location` into a target.
 * When the font does not load, nothing throws and nothing goes blank — the
 * name itself is drawn, in the fallback serif, spilling out of its button.
 * Seen 2026-09-17 on an iPhone 17 Pro in Firefox Focus, whose « Bloquer les
 * polices web » setting blocks every downloaded font: the three round buttons
 * top right read `my_locatpublic`. Playwright WebKit with font requests
 * aborted draws the same pixels; with the fonts served, the same build draws
 * the glyphs.
 *
 * A content blocker is not a network error a retry can fix, so the answer is a
 * second drawing: once a probe shows the ligature did not form, every symbols
 * element gets a Unicode stand-in from ICON_FALLBACK, drawn by the system font
 * no blocker can refuse. The icon name moves to `data-icon-name`, so the
 * glyph comes back if the font arrives late (a slow line, not a blocker).
 *
 * The page's own code keeps writing icon NAMES into these elements (the
 * cockpit toggles swap `right_panel_open` for `right_panel_close`); a
 * MutationObserver, running only in fallback mode, converts each write.
 * Nothing in the app reads an icon's text back.
 *
 * `src/iconFontFallback.test.mjs` fails when a glyph in the subset has no
 * stand-in, so adding an icon cannot reopen the hole.
 */

export const ICON_SELECTOR = '.material-symbols-outlined';
export const ICON_NAME_ATTRIBUTE = 'data-icon-name';
/** Set on <html> while the stand-ins are drawn; style.css keys on it. */
export const ICON_FONT_ATTRIBUTE = 'data-icon-font';

const ICON_FONT_FAMILY = 'Material Symbols Outlined';
const PROBE_GLYPH = 'my_location';
const PROBE_SIZE_PX = 40;
/** A formed ligature is one glyph, about 1 em. The word is over 5 em. */
const LIGATURE_MAX_EM = 1.5;
/**
 * How long to wait for the font before judging. The face is
 * `font-display: block`, so past 3 s the browser draws the words anyway.
 */
const SETTLE_MS = 4000;
const ICON_NAME = /^[a-z0-9_]+$/;

/**
 * One stand-in per glyph in `config/material-symbols-subset.json`. U+FE0E asks
 * for the text presentation of characters that also exist as emoji, so the
 * symbol takes the element's colour instead of drawing a coloured picture.
 */
export const ICON_FALLBACK = Object.freeze({
  adjust: '◎',
  arrow_drop_down: '▾',
  arrow_forward: '→',
  arrow_left: '◂',
  arrow_right: '▸',
  bolt: 'ϟ',
  chevron_left: '‹',
  chevron_right: '›',
  close: '✕',
  close_fullscreen: '⤡',
  dark_mode: '☾',
  east: '→',
  flare: '✺',
  flight: '✈\uFE0E',
  layers_clear: '⊘',
  light_mode: '☀\uFE0E',
  my_location: '⌖',
  navigation: '▲',
  open_in_full: '⤢',
  public: '🌐\uFE0E',
  radar: '◉',
  radio: '≋',
  right_panel_close: '⇥',
  right_panel_open: '⇤',
  rocket_launch: '⇡',
  skip_next: '⏭\uFE0E',
  skip_previous: '⏮\uFE0E',
});

/** Drawn for a name the table does not know: a dot, never the word. */
const UNKNOWN_FALLBACK = '•';

/**
 * @param {string} name
 * @returns {string}
 */
export function fallbackFor(name) {
  return Object.hasOwn(ICON_FALLBACK, name) ? ICON_FALLBACK[name] : UNKNOWN_FALLBACK;
}

/**
 * Whether a probe of `widthPx`, set at `fontSizePx`, drew one glyph rather
 * than the letters of its name.
 * @param {number} widthPx
 * @param {number} fontSizePx
 * @returns {boolean}
 */
export function ligatureFormed(widthPx, fontSizePx) {
  return widthPx > 0 && widthPx <= fontSizePx * LIGATURE_MAX_EM;
}

/** @param {Element} element */
export function drawStandIn(element) {
  const name = (element.textContent || '').trim();
  // A stand-in never matches ICON_NAME, so this also skips our own writes.
  if (!ICON_NAME.test(name)) return;
  element.setAttribute(ICON_NAME_ATTRIBUTE, name);
  element.textContent = fallbackFor(name);
}

/** @param {Element} element */
export function drawGlyph(element) {
  const name = element.getAttribute(ICON_NAME_ATTRIBUTE);
  if (!name) return;
  element.removeAttribute(ICON_NAME_ATTRIBUTE);
  // Only undo our own write: a stand-in the app has since replaced is theirs.
  if (element.textContent === fallbackFor(name)) element.textContent = name;
}

/** @param {Node} root @param {(element: Element) => void} draw */
function sweep(root, draw) {
  if (root.nodeType !== 1) return;
  if (root.matches(ICON_SELECTOR)) draw(root);
  for (const element of root.querySelectorAll(ICON_SELECTOR)) draw(element);
}

/**
 * Watch the icon font and swap in stand-ins if it does not form ligatures.
 * @param {{doc?: Document, win?: Window, settleMs?: number}} [options]
 * @returns {{ready: Promise<boolean>}} `ready` resolves to whether the
 *   stand-ins are drawn after the first judgement.
 */
export function installIconFontFallback({ doc = document, win = window, settleMs = SETTLE_MS } = {}) {
  const fonts = doc.fonts;
  if (!fonts || !doc.body) return { ready: Promise.resolve(false) };

  // Styled inline, not with ICON_SELECTOR, so the sweep never rewrites it.
  const probe = doc.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.textContent = PROBE_GLYPH;
  probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;`
    + `font-family:'${ICON_FONT_FAMILY}';font-size:${PROBE_SIZE_PX}px;font-feature-settings:'liga';`;
  doc.body.appendChild(probe);

  let missing = false;
  let observer = null;

  const onMutations = (records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        const parent = record.target.parentElement;
        if (parent?.matches(ICON_SELECTOR)) drawStandIn(parent);
      } else if (record.type === 'attributes') {
        if (record.target.matches(ICON_SELECTOR)) drawStandIn(record.target);
      } else if (record.target.nodeType === 1 && record.target.matches(ICON_SELECTOR)) {
        drawStandIn(record.target);
      } else {
        for (const node of record.addedNodes) sweep(node, drawStandIn);
      }
    }
  };

  const showStandIns = () => {
    missing = true;
    doc.documentElement.setAttribute(ICON_FONT_ATTRIBUTE, 'missing');
    sweep(doc.body, drawStandIn);
    observer = new win.MutationObserver(onMutations);
    observer.observe(doc.body, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'],
    });
  };

  const showGlyphs = () => {
    missing = false;
    observer?.disconnect();
    observer = null;
    doc.documentElement.removeAttribute(ICON_FONT_ATTRIBUTE);
    for (const element of doc.querySelectorAll(`[${ICON_NAME_ATTRIBUTE}]`)) drawGlyph(element);
    fonts.removeEventListener?.('loadingdone', judge);
    probe.remove();
  };

  function judge() {
    const formed = ligatureFormed(probe.getBoundingClientRect().width, PROBE_SIZE_PX);
    if (formed) showGlyphs();
    else if (!missing) showStandIns();
    return missing;
  }

  const load = Promise.resolve()
    .then(() => fonts.load(`${PROBE_SIZE_PX}px "${ICON_FONT_FAMILY}"`, PROBE_GLYPH))
    .catch(() => null);
  const settled = new Promise((resolve) => win.setTimeout(resolve, settleMs));
  const ready = Promise.race([load, settled]).then(() => {
    const drawn = judge();
    // A late font restores the glyphs; a blocked one never fires this.
    if (drawn) fonts.addEventListener?.('loadingdone', judge);
    return drawn;
  });
  return { ready };
}
