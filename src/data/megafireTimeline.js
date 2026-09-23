/**
 * The « frise » — the playback bar of the Gironde megafire replay, floating at
 * the bottom centre just above the navigation bar.
 *
 * WHY A BAR OF ITS OWN (2026-09-23). The replay used to be driven from chips in
 * the layer's row of the Layers panel: « ↺ Rejouer » and one chip per satellite
 * frame, in a panel that folds as soon as the globe is touched. A replay is
 * watched on the map, so its controls have to stay in view while it runs, and
 * the approved mock-up (`incendies-v2-01-empreinte-incandescente`) puts them
 * in one panel under the fire: a title and a date line on the left, the main
 * button and ‹ › on the right, and under a hairline a slim track of stops,
 * the current one lit, ended by a grey « Fin des détections ».
 *
 * WHAT THE TRACK SHOWS. Stages, not a time axis: the replay runs through
 * SEGMENTS (groups of days) that each get the same share of the track and of
 * the playthrough — the clock's own model (`megafireClock.js`, « A replay in
 * stages »). A continuous `position` runs from 0 to `segments.length`; segment
 * i spans [i, i + 1] and its STOP sits at its end, i + 1, because a stage is
 * shown whole once its last day has played. The progress line fills from the
 * left up to `position`, tinted stage by stage with the colour of that stage's
 * ring on the map, so the bar and the map share one key. The end tag says
 * where the DATA stops — the last satellite detection — and never that the
 * fire did.
 *
 * WHAT THIS MODULE DOES NOT KNOW. Dates, counts and stage labels arrive
 * formatted and localised from the layer; commands go back to it through
 * `onCommand` and the bar changes only when the layer calls `update()`. So the
 * bar holds no clock and no timer: it cannot drift from what the map shows.
 *
 * WHY `update()` COMPARES BEFORE IT WRITES. The layer calls it on every frame
 * of the replay, up to ~15 times a second. Rewriting a text node or an
 * attribute with the same value still queues a mutation record, and the world
 * overlay watches `document.body` for chrome coming and going
 * (`src/overlays/worldOverlay.js`). So the pure view-model
 * ({@link megafireTimelineView}) is diffed against the last one, and what did
 * change goes through the read-before-write helpers of `domWrite.js`. While a
 * stage plays, one frame writes one custom property: the scale of that
 * stage's fill (and the knob's place) — a transform, painted without layout.
 *
 * ACCESSIBILITY. The bar is a labelled `role="group"` of real buttons. The
 * stops are a list whose current stop carries `aria-current="step"` and the
 * only `tabindex="0"` (a roving tab stop): Tab lands on it, ← and → move
 * through the stages, Home and End jump to the first and the last. A polite
 * live region reads the date line when a stop is REACHED or the replay STOPS —
 * never on every frame, which would drown a screen reader in dates.
 *
 * WHERE IT SITS. `style.css` (« THE MEGAFIRE REPLAY BAR ») and `phone.css`
 * place it; while it is mounted `<html>` carries
 * {@link MEGAFIRE_TIMELINE_OPEN_CLASS}, which hides the place chip it would
 * otherwise sit on and lifts the toast above it.
 *
 * @module megafireTimeline
 */

import messages from './megafireTimeline.i18n.js';
import { writeAttribute, writeProperty, writeText } from './domWrite.js';
import { lucideIconMask } from './lucideIcons.js';

/** The bar's element id. */
export const MEGAFIRE_TIMELINE_ID = 'megafire-timeline';

/** Set on `<html>` while the bar is mounted. */
export const MEGAFIRE_TIMELINE_OPEN_CLASS = 'megafire-timeline-open';

/**
 * Below this a position counts as ON a stop. The layer's paced coordinate is
 * computed from instants, so a stop it seeks to can come back as
 * 1.9999999999999998.
 */
const EPSILON = 1e-6;

/**
 * Fills and the knob are written to four decimals: a tenth of a pixel on the
 * widest bar, and a paused replay re-sent at 15 Hz writes nothing.
 */
const FILL_PRECISION = 1e4;

const round = (value) => Math.round(value * FILL_PRECISION) / FILL_PRECISION;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * @typedef {object} MegafireTimelineSegment
 * @property {string} id
 * @property {string} label - Already localised (« 24-25 juil. »).
 * @property {string} [color] - The stage's ring colour on the map, any CSS colour.
 */

/**
 * @typedef {object} MegafireTimelineState
 * @property {number} position - 0 … segments.length.
 * @property {boolean} playing
 * @property {boolean} [atStart] - Derived from `position` when omitted.
 * @property {boolean} [atEnd] - Derived from `position` when omitted.
 * @property {string} heading - The big line (« 24 juillet 2026 »).
 * @property {string} [detail] - The small line under it.
 */

/**
 * @typedef {'ahead'|'target'|'current'|'reached'} MegafireStopState
 * `reached`: the replay went past this stop. `current`: the replay stands ON
 * it. `target`: the replay is inside this stop's stage, on its way to it.
 * `ahead`: not yet.
 */

/**
 * What the bar shows for a state — pure, so the unit tests pin it without a
 * DOM, and `update()` diffs two of these instead of reading the page.
 *
 * The main button reads « Pause » while playing, « Rejouer » at the end,
 * « Lire » at the start and « Reprendre » anywhere else. The CURRENT stop is
 * the one ending the stage the cursor is in: at 1.4 the second stage is
 * playing and its stop, at 2, is lit as the target; at exactly 2 it is
 * current. At 0 no stop is current and the first holds the tab stop.
 *
 * @param {MegafireTimelineState} state
 * @param {ReadonlyArray<MegafireTimelineSegment>} segments
 */
export function megafireTimelineView(state = {}, segments = []) {
  const m = messages();
  const count = segments.length;
  const raw = Number(state?.position);
  const position = Number.isFinite(raw) ? Math.min(count, Math.max(0, raw)) : 0;
  const playing = Boolean(state?.playing);
  const atStart = typeof state?.atStart === 'boolean' ? state.atStart : position <= EPSILON;
  const atEnd = typeof state?.atEnd === 'boolean' ? state.atEnd : position >= count - EPSILON;
  const reachedCount = Math.min(count, Math.floor(position + EPSILON));
  const currentIndex = count ? Math.min(count - 1, Math.ceil(position - EPSILON) - 1) : -1;
  const atStop = Math.abs(position - Math.round(position)) < EPSILON;

  let mainAction = 'resume';
  if (playing) mainAction = 'pause';
  else if (atEnd) mainAction = 'replay';
  else if (atStart) mainAction = 'play';

  const stops = segments.map((segment, index) => {
    let stopState = 'ahead';
    if (index === currentIndex) stopState = index < reachedCount ? 'current' : 'target';
    else if (index < reachedCount) stopState = 'reached';
    return {
      id: String(segment?.id ?? index),
      label: String(segment?.label ?? ''),
      state: stopState,
      current: index === currentIndex,
      fill: round(clamp01(position - index)),
    };
  });

  return {
    count,
    position,
    playing,
    atStart,
    atEnd,
    atStop,
    ended: atEnd && !playing,
    /** How far along the whole track, 0 … 1: the knob's place. */
    fraction: count ? round(position / count) : 0,
    mainAction,
    mainGlyph: mainAction === 'resume' ? 'play' : mainAction,
    mainLabel: m[mainAction],
    prevDisabled: atStart,
    nextDisabled: atEnd,
    currentIndex,
    reachedCount,
    /** The stop that holds the list's one tab stop. */
    focusIndex: Math.max(0, currentIndex),
    stops,
    heading: String(state?.heading ?? ''),
    detail: String(state?.detail ?? ''),
  };
}

/**
 * What the live region should say going from one view to the next, or '' for
 * nothing. It speaks when the replay STOPS (paused, or run to the end) and
 * when a stop is REACHED — the count of stops behind the cursor changed,
 * whether the replay crossed one or a press jumped to one. A frame that only
 * moved the fill says nothing.
 *
 * @param {?ReturnType<typeof megafireTimelineView>} previous
 * @param {ReturnType<typeof megafireTimelineView>} next
 * @returns {string}
 */
export function megafireTimelineAnnouncement(previous, next) {
  if (!previous || !next) return '';
  const m = messages().announce;
  if (previous.playing && !next.playing) {
    return next.atEnd ? m.ended(next.heading) : m.paused(next.heading);
  }
  if (previous.reachedCount !== next.reachedCount) {
    return next.ended ? m.ended(next.heading) : m.stop(next.heading, next.detail);
  }
  return '';
}

/** Remove an attribute only if it is there: a removal is a mutation too. */
function clearAttribute(node, name) {
  if (typeof node.getAttribute === 'function' && node.getAttribute(name) === null) return false;
  node.removeAttribute(name);
  return true;
}

/**
 * Build the bar. Nothing is attached until `mount()`.
 *
 * @param {object} options
 * @param {ReadonlyArray<MegafireTimelineSegment>} options.segments
 * @param {(command: {type: 'toggle'|'prev'|'next'} | {type: 'seek', index: number}) => void} options.onCommand
 * @param {Document} [options.doc]
 */
export function createMegafireTimeline({ segments = [], onCommand = () => {}, doc = globalThis.document } = {}) {
  const list = segments.map((segment, index) => ({
    id: String(segment?.id ?? index),
    label: String(segment?.label ?? ''),
    color: typeof segment?.color === 'string' && segment.color ? segment.color : '',
  }));
  const count = list.length;
  const m = messages();

  const make = (tag, className, parent) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    parent?.appendChild(node);
    return node;
  };
  const hide = (node) => {
    node.setAttribute('aria-hidden', 'true');
    return node;
  };
  const icon = (parent, name, className = 'shell-icon') => {
    const glyph = hide(make('span', className, parent));
    const uri = lucideIconMask(name);
    if (uri) glyph.style.setProperty('--shell-icon', `url("${uri}")`);
    return glyph;
  };
  const button = (className, parent, command) => {
    const node = make('button', className, parent);
    node.type = 'button';
    node.dataset.command = command;
    return node;
  };

  const root = make('div', 'megafire-timeline');
  root.id = MEGAFIRE_TIMELINE_ID;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', m.group);
  root.style.setProperty('--mt-count', String(Math.max(1, count)));
  const body = make('div', 'megafire-timeline-body', root);

  const head = make('div', 'megafire-timeline-head', body);
  const titles = make('div', 'megafire-timeline-titles', head);
  const eyebrow = make('p', 'megafire-timeline-eyebrow', titles);
  eyebrow.textContent = m.eyebrow;
  const headingNode = make('p', 'megafire-timeline-heading', titles);
  const detailNode = make('p', 'megafire-timeline-detail', titles);

  const controls = make('div', 'megafire-timeline-controls', head);
  const main = button('megafire-timeline-btn megafire-timeline-main', controls, 'toggle');
  const mainGlyph = icon(main, 'rotate-ccw', 'shell-icon megafire-timeline-glyph');
  const mainLabel = make('span', 'megafire-timeline-main-label', main);
  const prev = button('megafire-timeline-btn megafire-timeline-step', controls, 'prev');
  prev.setAttribute('aria-label', m.previous);
  prev.title = m.previous;
  icon(prev, 'chevron-left');
  const next = button('megafire-timeline-btn megafire-timeline-step', controls, 'next');
  next.setAttribute('aria-label', m.next);
  next.title = m.next;
  icon(next, 'chevron-right');

  hide(make('div', 'megafire-timeline-rule', body));

  const track = make('div', 'megafire-timeline-track', body);
  const rail = hide(make('div', 'megafire-timeline-rail', track));
  make('span', 'megafire-timeline-start', rail);
  const fills = list.map((segment, index) => {
    const fill = make('span', 'megafire-timeline-fill', rail);
    fill.style.setProperty('--mt-i', String(index));
    if (segment.color) fill.style.setProperty('--mt-color', segment.color);
    return fill;
  });
  const knob = make('span', 'megafire-timeline-knob', rail);

  const stopList = make('ol', 'megafire-timeline-stops', track);
  stopList.setAttribute('aria-label', m.stages);
  const stops = list.map((segment, index) => {
    const item = make('li', 'megafire-timeline-stop-item', stopList);
    const stop = button('megafire-timeline-stop', item, 'seek');
    stop.dataset.index = String(index);
    stop.title = m.stopTitle(segment.label);
    hide(make('span', 'megafire-timeline-dot', stop));
    const label = make('span', 'megafire-timeline-stop-label', stop);
    label.textContent = segment.label;
    return stop;
  });

  const end = make('p', 'megafire-timeline-end', body);
  end.textContent = m.end;
  end.title = m.endTitle;

  const live = make('p', 'megafire-timeline-live', body);
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  // ── Rendering ─────────────────────────────────────────────────────────────

  let view = null;
  let quiet = true; // the first state after building announces nothing
  let focusPending = false;
  let destroyed = false;

  /** Write what differs between `previous` (null: everything) and `nextView`. */
  function render(nextView, previous) {
    const changed = (key) => !previous || previous[key] !== nextView[key];
    if (changed('heading')) writeText(headingNode, nextView.heading);
    if (changed('detail')) {
      writeText(detailNode, nextView.detail);
      writeProperty(detailNode, 'hidden', !nextView.detail);
    }
    if (changed('mainAction')) {
      writeText(mainLabel, nextView.mainLabel);
      writeAttribute(mainGlyph, 'data-glyph', nextView.mainGlyph);
      writeAttribute(root, 'data-action', nextView.mainAction);
    }
    if (changed('prevDisabled')) writeProperty(prev, 'disabled', nextView.prevDisabled);
    if (changed('nextDisabled')) writeProperty(next, 'disabled', nextView.nextDisabled);
    if (changed('playing')) writeAttribute(root, 'data-playing', nextView.playing ? 'true' : 'false');
    if (changed('ended')) writeAttribute(root, 'data-ended', nextView.ended ? 'true' : 'false');
    if (changed('fraction')) knob.style.setProperty('--mt-at', String(nextView.fraction));
    if (changed('atStop')) writeProperty(knob, 'hidden', nextView.atStop);
    for (let index = 0; index < count; index += 1) {
      const stop = nextView.stops[index];
      const before = previous?.stops[index];
      if (!before || before.fill !== stop.fill) fills[index].style.setProperty('--mt-fill', String(stop.fill));
      if (!before || before.state !== stop.state) {
        writeAttribute(stops[index], 'data-state', stop.state);
        if (stop.current) writeAttribute(stops[index], 'aria-current', 'step');
        else clearAttribute(stops[index], 'aria-current');
      }
    }
    if (changed('focusIndex')) {
      stops.forEach((stop, index) => writeAttribute(stop, 'tabindex', index === nextView.focusIndex ? '0' : '-1'));
    }
  }

  /** After a key press, keep the focus on the stop the replay moved to. */
  function followFocus() {
    if (!focusPending || !view) return;
    const active = doc.activeElement;
    if (!active || !stopList.contains(active)) {
      focusPending = false;
      return;
    }
    const target = stops[view.focusIndex];
    if (target && target !== active) target.focus();
    focusPending = false;
  }

  /** @param {MegafireTimelineState} state */
  function update(state) {
    if (destroyed) return;
    const nextView = megafireTimelineView(state, list);
    render(nextView, view);
    if (!quiet) {
      const said = megafireTimelineAnnouncement(view, nextView);
      if (said) writeText(live, said);
    }
    quiet = false;
    view = nextView;
    followFocus();
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  function onClick(event) {
    const target = event.target?.closest?.('button[data-command]');
    if (!target || target.disabled || !root.contains(target)) return;
    const command = target.dataset.command;
    if (command === 'seek') onCommand({ type: 'seek', index: Number(target.dataset.index) });
    else onCommand({ type: command });
  }

  function onKeydown(event) {
    let command = null;
    switch (event.key) {
      case 'ArrowLeft':
        if (!view?.prevDisabled) command = { type: 'prev' };
        break;
      case 'ArrowRight':
        if (!view?.nextDisabled) command = { type: 'next' };
        break;
      case 'Home':
        command = { type: 'seek', index: 0 };
        break;
      case 'End':
        command = { type: 'seek', index: count - 1 };
        break;
      default:
        return;
    }
    // The globe listens for arrows too; inside the list they are the list's.
    event.preventDefault();
    event.stopPropagation?.();
    if (!command || !count) return;
    focusPending = true;
    onCommand(command);
  }

  root.addEventListener('click', onClick);
  stopList.addEventListener('keydown', onKeydown);

  // A bar that is mounted before the layer's first update still reads right.
  update({ position: 0, playing: false, heading: '' });
  quiet = true;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  const api = {
    element: root,
    /** Attach the bar (by default to `<body>`) and hide the place chip. */
    mount(parent = doc.body) {
      if (destroyed || !parent) return api;
      if (root.parentNode !== parent) parent.appendChild(root);
      doc.documentElement?.classList?.add(MEGAFIRE_TIMELINE_OPEN_CLASS);
      return api;
    },
    /** Detach it; `mount()` brings it back as it was. */
    unmount() {
      root.parentNode?.removeChild(root);
      doc.documentElement?.classList?.remove(MEGAFIRE_TIMELINE_OPEN_CLASS);
      return api;
    },
    update,
    /** Detach it for good: later calls do nothing. */
    destroy() {
      if (destroyed) return;
      api.unmount();
      root.removeEventListener('click', onClick);
      stopList.removeEventListener('keydown', onKeydown);
      destroyed = true;
    },
  };
  return api;
}
