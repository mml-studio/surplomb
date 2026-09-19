/**
 * The loading veil's sun: « le soleil au zénith ».
 *
 * The Belvédère mark is a sun over two planes — a terrace, and the ground seen
 * from above. On the loading veil the sun leaves its place in the mark and
 * runs a slow arc over the terrace; the terrace casts its shadow on the ground,
 * longer the lower the sun. A pointer takes the sun over (God's Eye View's eye
 * followed the pointer the same way). When the veil lifts, the sun glides back
 * to its place in the mark, straight over the terrace, and the shadow shrinks
 * to nothing: « aucun angle mort », said without a word.
 *
 * Motion written by ChatGPT from our brief (2026-09-19), rewired here onto
 * the real veil: the ending listens for `#loading-screen.hidden` instead of a
 * `ready` class, nothing runs while the veil is not on screen (the showcase
 * keeps it `display: none`), and everything is torn down once the sun has
 * landed — the cockpit never pays for a frame of it.
 *
 * Coordinates are SVG user units in the mark's own 360 × 320 frame. The sun's
 * position is kept as an offset from ARC_CENTRE, the point where its lower
 * edge touches the terrace's top (y 102): above that line it never overlaps
 * the terrace.
 *
 * @module loaderSun
 */

/** One full arc, rise to set. */
export const ARC_MS = 6000;
/** Pointer smoothing, per 60 Hz frame. */
export const LERP = 0.12;
/** Radius of the arc the sun runs, in user units. */
export const ARC_RADIUS = 88;
/** Where the arc is centred: the sun sits on the terrace at y 62. */
export const ARC_CENTRE = Object.freeze({ x: 188, y: 62 });
/** The sun's place in the mark (cy 48), as an offset from ARC_CENTRE. */
export const MARK_OFFSET = Object.freeze({ x: 0, y: -14 });
/** Glide from anywhere to the arc, and from anywhere to the mark. */
export const GLIDE_MS = 600;
/** How long a still pointer keeps the sun before it resumes its arc. */
export const POINTER_HOLD_MS = 3000;

const FADE_SPAN = 0.12;
const SHADOW_OPACITY = 0.4;
const CTM_TTL_MS = 1000;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (t) => t * t * (3 - 2 * t);
/** Ease-out cubic, for both glides. */
export const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;

/**
 * The sun on its arc: phase 0 rises on the left, 0.5 is the zenith, 1 sets on
 * the right.
 * @param {number} phase
 * @returns {{x:number, y:number}}
 */
export function arcPosition(phase) {
  const angle = Math.PI * phase;
  return { x: -ARC_RADIUS * Math.cos(angle), y: -ARC_RADIUS * Math.sin(angle) };
}

/**
 * The sun's opacity on its arc: it fades in over the first 12 % and out over
 * the last, so the loop has no visible seam.
 * @param {number} phase
 * @returns {number}
 */
export function arcAlpha(phase) {
  return smoothstep(clamp01(Math.min(1, phase / FADE_SPAN, (1 - phase) / FADE_SPAN)));
}

/**
 * The arc phase nearest to a free position, kept off the horizons so the arc
 * picks the sun up while it is still visible.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function phaseNear(x, y) {
  // A pointer below the logo leaves y at 0, and `-y` at -0: atan2(-0, -x)
  // is -π, which sent a sun released on the right horizon back to the left.
  return Math.max(0.15, Math.min(0.85, Math.atan2(Math.max(0, -y), -x) / Math.PI));
}

/**
 * Where the pointer asks the sun to be: its offset from ARC_CENTRE, held in
 * the half-disc over the terrace — never below it, never past the arc.
 * @param {number} dx Pointer offset from ARC_CENTRE, in user units.
 * @param {number} dy
 * @returns {{x:number, y:number}}
 */
export function skyTarget(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ...MARK_OFFSET };
  const y = Math.min(0, dy);
  const distance = Math.hypot(dx, y);
  if (distance <= ARC_RADIUS) return { x: dx, y };
  const scale = ARC_RADIUS / distance;
  return { x: dx * scale, y: y * scale };
}

/**
 * How long the shadow is: 0 with the sun straight over the terrace, 1 with the
 * sun on the horizon. It follows the sun's DIRECTION, not its height, so the
 * mark's own sun (low, but overhead) casts none.
 * @param {number} x Sun offset from ARC_CENTRE.
 * @param {number} y
 * @returns {number}
 */
export function shadowLength(x, y) {
  const distance = Math.hypot(x, y);
  if (distance < 1e-6) return 0;
  return clamp01(1 + y / distance);
}

/**
 * The terrace's shadow, as a transform on a copy of the terrace clipped to
 * the ground: pushed away from the sun, stretched as it sinks.
 * @param {number} x Sun offset from ARC_CENTRE.
 * @param {number} y
 * @returns {string}
 */
export function shadowTransform(x, y) {
  const low = shadowLength(x, y);
  const tx = ARC_CENTRE.x - x * (0.35 + low);
  const ty = 174 + 60 * low;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${(0.5 + 0.5 * low).toFixed(3)} ${(1.6 * low).toFixed(3)}) translate(-188 -102)`;
}

/**
 * The shadow's opacity: none with the sun overhead or faded out.
 * @param {number} x
 * @param {number} y
 * @param {number} alpha The sun's own opacity.
 * @returns {number}
 */
export function shadowOpacity(x, y, alpha) {
  return SHADOW_OPACITY * clamp01(alpha) * Math.min(1, shadowLength(x, y) * 4);
}

let activeSun = null;

/**
 * Put the sun back in the mark and stop it: an error line under a sun still
 * running its course would read as « still working ».
 */
export function stopLoaderSun() {
  activeSun?.();
}

/**
 * Wire the sun of the loading veil. Returns a cleanup callback.
 *
 * @param {HTMLElement|null} [veil] `#loading-screen`.
 * @returns {() => void}
 */
export function initLoaderSun(veil = globalThis.document?.getElementById('loading-screen')) {
  const svg = veil?.querySelector('[data-loader-sun]');
  const sun = svg?.querySelector('.loader-sun');
  const shadow = svg?.querySelector('.loader-shadow');
  if (!sun || !shadow || typeof requestAnimationFrame !== 'function') return () => {};

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const isReduced = () => Boolean(reduced?.matches);
  const isLifted = () => veil.classList.contains('hidden');

  let x = MARK_OFFSET.x;
  let y = MARK_OFFSET.y;
  let alpha = 1;
  let targetX = x;
  let targetY = y;
  // The veil opens on the mark as drawn; the first glide lifts the sun from
  // there to the zenith, and the arc carries on to the right.
  let phase = 0.5;
  let join = { x, y, alpha, t: 0 };
  let following = false;
  let movedAt = -Infinity;
  let ending = null;
  let raf = 0;
  let last = 0;
  let disposed = false;
  let onScreen = typeof IntersectionObserver !== 'function';
  let ctm = null;
  let ctmAt = -Infinity;

  const paint = () => {
    sun.setAttribute('transform', `translate(${x.toFixed(2)} ${(y - MARK_OFFSET.y).toFixed(2)})`);
    sun.setAttribute('opacity', alpha.toFixed(3));
    shadow.setAttribute('transform', shadowTransform(x, y));
    shadow.setAttribute('opacity', shadowOpacity(x, y, alpha).toFixed(3));
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  const wake = () => {
    if (!raf && !disposed && onScreen && !isReduced() && !globalThis.document?.hidden) {
      raf = requestAnimationFrame(frame);
    }
  };

  // The sun at rest is simply the mark: no transform, no shadow.
  const settle = () => {
    x = MARK_OFFSET.x;
    y = MARK_OFFSET.y;
    alpha = 1;
    sun.removeAttribute('transform');
    sun.removeAttribute('opacity');
    shadow.setAttribute('opacity', '0');
  };

  function frame(now) {
    raf = 0;
    if (disposed || !onScreen || isReduced() || globalThis.document?.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.max(0, now - last) : 0;
    last = now;

    if (ending) {
      ending.t += dt;
      const k = easeOut(ending.t / GLIDE_MS);
      x = ending.x + (MARK_OFFSET.x - ending.x) * k;
      y = ending.y + (MARK_OFFSET.y - ending.y) * k;
      alpha = ending.alpha + (1 - ending.alpha) * k;
      if (ending.t >= GLIDE_MS) {
        dispose();
        return;
      }
    } else if (now - movedAt < POINTER_HOLD_MS) {
      const k = 1 - (1 - LERP) ** (dt / (1000 / 60));
      x += (targetX - x) * k;
      y += (targetY - y) * k;
      alpha += (1 - alpha) * k;
      following = true;
      join = null;
    } else {
      if (following) {
        phase = phaseNear(x, y);
        join = { x, y, alpha, t: 0 };
        following = false;
      }
      phase = (phase + dt / ARC_MS) % 1;
      const onArc = arcPosition(phase);
      const arcA = arcAlpha(phase);
      if (join) {
        join.t += dt;
        const k = easeOut(join.t / GLIDE_MS);
        x = join.x + (onArc.x - join.x) * k;
        y = join.y + (onArc.y - join.y) * k;
        alpha = join.alpha + (arcA - join.alpha) * k;
        if (join.t >= GLIDE_MS) join = null;
      } else {
        x = onArc.x;
        y = onArc.y;
        alpha = arcA;
      }
    }
    paint();
    wake();
  }

  // Cached: the veil only moves on a resize, and a fresh CTM per pointer
  // event would force a layout in the middle of the cockpit's boot.
  const screenToUser = (clientX, clientY) => {
    const now = performance.now();
    if (!ctm || now - ctmAt > CTM_TTL_MS) {
      ctm = svg.getScreenCTM()?.inverse() ?? null;
      ctmAt = now;
    }
    if (!ctm) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(ctm);
  };

  const onPointerMove = (event) => {
    if (ending || !onScreen || isReduced()) return;
    // A finger only steers while it is down; a mouse steers by hovering.
    if (event.pointerType !== 'mouse' && !event.buttons) return;
    const point = screenToUser(event.clientX, event.clientY);
    if (!point) return;
    const target = skyTarget(point.x - ARC_CENTRE.x, point.y - ARC_CENTRE.y);
    targetX = target.x;
    targetY = target.y;
    movedAt = performance.now();
    wake();
  };

  const onResize = () => { ctm = null; };

  const onVisibility = () => {
    stop();
    wake();
  };

  const onReducedChange = () => {
    stop();
    if (isReduced()) settle();
    else wake();
  };

  const lift = () => {
    if (ending || disposed || !isLifted()) return;
    // Nobody would see the glide: land at once and let go of everything.
    if (isReduced() || !onScreen || globalThis.document?.hidden) {
      dispose();
      return;
    }
    ending = { x, y, alpha, t: 0 };
    wake();
  };

  const classWatch = new MutationObserver(lift);
  const screenWatch = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) wake();
      else stop();
    })
    : null;

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (activeSun === dispose) activeSun = null;
    stop();
    settle();
    classWatch.disconnect();
    screenWatch?.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    globalThis.document?.removeEventListener('visibilitychange', onVisibility);
    reduced?.removeEventListener?.('change', onReducedChange);
  }

  if (isLifted()) {
    dispose();
    return dispose;
  }

  activeSun?.();
  activeSun = dispose;
  classWatch.observe(veil, { attributes: true, attributeFilter: ['class'] });
  screenWatch?.observe(svg);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  globalThis.document?.addEventListener('visibilitychange', onVisibility);
  reduced?.addEventListener?.('change', onReducedChange);
  if (isReduced()) settle();
  else wake();
  return dispose;
}
