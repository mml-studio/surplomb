/**
 * @module waitlistCard
 * @description The « essai terminé » card: opens IN PLACE over the globe, with
 * the Buttondown waitlist form inside it.
 *
 * WHY IN PLACE. A redirect to a landing page loses the globe the visitor was
 * looking at and the share-link state that got them there. The card is
 * non-modal, like the first-run launcher: the map stays usable behind it.
 *
 * WHY A QUESTION AND NO PRICE. The launch timer counts sign-ups, and twenty
 * bare emails out of a LinkedIn post prove little; one answer about the use
 * (`metadata__usage`) says who they are. The price stays OFF the card
 * (decision of 2026-09-17): it belongs on the payment page that comes later,
 * the way a SaaS shows « premium » first and the number at checkout.
 *
 * WHY A PLAIN FORM POST. Buttondown asks embed forms not to submit with
 * `fetch`: a subscriber may have to pass a CAPTCHA or fix a typo on its
 * response page. The form therefore posts into a new tab, and the card only
 * says what happens next.
 *
 * Loaded on demand by `main.js` on the first WAITLIST_OPEN_EVENT, or at boot
 * for `?waitlist=1`, so it costs nothing to a visit that never meets it.
 */

import { PREMIUM_CROWN_SVG } from './voicePremium.js';

/** Written on submit, so a returning visitor is not asked twice. */
export const WAITLIST_JOINED_KEY = 'gev:waitlist-joined:v1';
/** Written when the card opened, so an automatic refusal opens it once per tab, and never after a click did. */
export const WAITLIST_AUTO_SHOWN_KEY = 'gev:waitlist-auto-shown:v1';
const CARD_ID = 'waitlist-card';

/** The use question. Values land on the subscriber as `metadata__usage`. */
export const WAITLIST_USAGE_CHOICES = Object.freeze([
  Object.freeze({ value: 'logement', label: 'Je cherche un logement' }),
  Object.freeze({ value: 'immobilier', label: 'Je travaille dans l’immobilier' }),
  Object.freeze({ value: 'curiosite', label: 'Par curiosité' }),
  Object.freeze({ value: 'autre', label: 'Autre raison' }),
]);

/**
 * What the hosted version adds, named on the card. Everything here works
 * today; nothing is a roadmap item, and nothing waits on a key not yet held.
 *
 * The two after the voice are what the voice DOES, because they are the
 * strongest things the subscription holds (rewritten 2026-09-17): outside the
 * voice, the code has only the HUD's five-word summary and Google place names.
 * The price is the `dvf-sales` and `avis-valeur` medians the voice reads out
 * (`get_entity_context` → `layerSummaries`); the route is `annotate_map`
 * `type=route`, drawn on the streets with its distance and time. The line it
 * replaced promised the 2 144 Météo-France stations, which need a contract
 * that is not signed (`docs/meteofrance-api-access.md`).
 */
export const WAITLIST_INCLUDES = Object.freeze([
  'La commande vocale',
  'Le prix au m² autour d’ici, en une question',
  'Le trajet à pied ou à vélo, tracé et minuté',
]);

/**
 * Title and opening line for each way into the card.
 *
 * @param {'exhausted'|'voice'|'direct'} reason
 * @param {{limit?: number|null, voice?: {limit?: number}|null}} [trial] - The `/api/trial` body.
 * @returns {{title: string, lede: string}}
 */
export function waitlistCopy(reason, trial = {}) {
  // Two sentences at most: what ran out, and that the map did not.
  const open = 'Le globe et ses couches restent gratuits.';
  if (reason === 'exhausted') {
    const count = Number(trial.limit) > 0 ? `Vos ${trial.limit} essais` : 'Vos essais';
    return {
      title: 'Essai terminé',
      lede: `${count} premium sont utilisés. ${open}`,
    };
  }
  if (reason === 'voice') {
    // Said as premium, the way interface software says it, whether the
    // visitor just used the voice trial or this server offers none. The
    // trial is counted in commands, the word the mic uses (src/voicePremium.js).
    const turns = Number(trial.voice?.limit) || 0;
    const why = turns > 0
      ? (turns > 1 ? `Vos ${turns} commandes vocales offertes sont utilisées.` : 'Votre commande vocale offerte est utilisée.')
      : 'Elle arrive à l’ouverture.';
    return {
      title: 'La voix est une fonction premium',
      lede: `${why} ${open}`,
    };
  }
  return {
    title: 'Liste d’attente',
    lede: 'La version hébergée de Surplomb ouvre bientôt. Le globe et toutes les couches restent gratuits ; l’abonnement ajoute le confort.',
  };
}

/**
 * Whether a request should open the card now.
 *
 * @param {{reason: string, explicit?: boolean}} detail
 * @param {{getItem: Function}|null} sessionStore
 * @returns {boolean}
 */
export function shouldOpenWaitlist(detail, sessionStore) {
  if (!detail || !detail.reason) return false;
  if (detail.explicit) return true;
  try {
    return sessionStore?.getItem?.(WAITLIST_AUTO_SHOWN_KEY) !== '1';
  } catch {
    return true;
  }
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * The card's markup. Pure, so a test can read it without a DOM.
 *
 * @param {{
 *   reason: 'exhausted'|'voice'|'direct',
 *   trial?: {limit?: number|null, waitlist?: {action: string}|null},
 *   joined?: boolean,
 * }} input
 * @returns {string}
 */
export function renderWaitlistCard({ reason, trial = {}, joined = false }) {
  const { title, lede } = waitlistCopy(reason, trial);
  const waitlist = trial.waitlist && /^https:\/\/buttondown\.com\//.test(trial.waitlist.action || '')
    ? trial.waitlist
    : null;
  const includes = WAITLIST_INCLUDES.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const choices = WAITLIST_USAGE_CHOICES.map((choice, index) => `
        <label class="waitlist-choice">
          <input type="radio" name="metadata__usage" value="${escapeHtml(choice.value)}"${index === 0 ? ' required' : ''} />
          <span>${escapeHtml(choice.label)}</span>
        </label>`).join('');

  const form = waitlist ? `
    <form class="waitlist-form" action="${escapeHtml(waitlist.action)}" method="post" target="_blank" rel="noopener"${joined ? ' hidden' : ''}>
      <label class="waitlist-field" for="waitlist-email">
        <span>Votre email</span>
        <input id="waitlist-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="vous@exemple.fr" />
      </label>
      <fieldset class="waitlist-usage">
        <legend>Ce qui vous amène</legend>${choices}
      </fieldset>
      <input type="hidden" name="embed" value="1" />
      <input type="hidden" name="tag" value="liste-attente" />
      <input type="hidden" name="metadata__declencheur" value="${escapeHtml(reason)}" />
      <button type="submit" class="waitlist-submit">Rejoindre la liste d’attente</button>
      <p class="waitlist-consent">Deux emails, rien d’autre. Via Buttondown, désinscription en un clic. <a href="/confidentialite#vos-donnees" target="_blank" rel="noopener">Vos données</a></p>
    </form>
    <div class="waitlist-joined" role="status"${joined ? '' : ' hidden'}>
      <p data-waitlist-joined-text>Vous êtes sur la liste. Si ce n’est pas fait, confirmez depuis l’email reçu.</p>
      <button type="button" class="waitlist-again" data-waitlist-again>Utiliser une autre adresse</button>
    </div>` : `
    <p class="waitlist-unavailable">Les inscriptions ne sont pas encore ouvertes sur ce serveur.</p>`;

  return `
    <div class="waitlist-scanline" aria-hidden="true"></div>
    <header class="waitlist-header">
      <span class="waitlist-kicker">${PREMIUM_CROWN_SVG}SURPLOMB · PREMIUM</span>
      <button type="button" class="waitlist-close" data-waitlist-close aria-label="Fermer">×</button>
    </header>
    <h2 id="waitlist-title">${escapeHtml(title)}</h2>
    <p id="waitlist-lede">${escapeHtml(lede)}</p>
    <div class="waitlist-body">
      <p class="waitlist-includes-title">Premium, à l’ouverture</p>
      <ul class="waitlist-includes">${includes}</ul>
      ${form}
    </div>`;
}

function readFlag(store, key) {
  try { return store?.getItem?.(key) === '1'; } catch { return false; }
}

function writeFlag(store, key, on) {
  try {
    if (on) store?.setItem?.(key, '1');
    else store?.removeItem?.(key);
  } catch { /* a blocked store only costs the memory of this choice */ }
}

/**
 * Own the card. `main.js` forwards every WAITLIST_OPEN_EVENT to `open`.
 *
 * @param {{
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   fetchImpl?: typeof fetch,
 *   localStore?: Storage|null,
 *   sessionStore?: Storage|null,
 * }} options
 * @returns {{open: (detail: {reason: string, explicit?: boolean}) => Promise<boolean>, close: () => void}}
 */
export function initWaitlistCard({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  localStore = globalThis.localStorage ?? null,
  sessionStore = globalThis.sessionStorage ?? null,
} = {}) {
  let root = null;
  let opening = null;
  let openingExplicit = false;
  let returnFocus = null;

  const onKeydown = (event) => {
    if (event.key === 'Escape' && root) close();
  };

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    documentRef.removeEventListener('keydown', onKeydown);
    if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
    returnFocus = null;
  }

  async function readTrial() {
    try {
      const response = await fetchImpl('/api/trial', { cache: 'no-store', headers: { Accept: 'application/json' } });
      return response.ok ? await response.json() : {};
    } catch {
      return {};
    }
  }

  function wire(card, reason) {
    card.querySelector('[data-waitlist-close]')?.addEventListener('click', close);
    const form = card.querySelector('.waitlist-form');
    const joined = card.querySelector('.waitlist-joined');
    const joinedText = card.querySelector('[data-waitlist-joined-text]');
    form?.addEventListener('submit', () => {
      // Not prevented: the POST goes to Buttondown in a new tab, which is
      // where a CAPTCHA or a typo gets handled. This only updates the card.
      writeFlag(localStore, WAITLIST_JOINED_KEY, true);
      windowRef?.setTimeout?.(() => {
        form.hidden = true;
        if (joinedText) {
          joinedText.textContent = 'Buttondown s’est ouvert dans un nouvel onglet : terminez-y l’inscription, puis cliquez le lien de l’email de confirmation.';
        }
        if (joined) joined.hidden = false;
      }, 0);
    });
    card.querySelector('[data-waitlist-again]')?.addEventListener('click', () => {
      writeFlag(localStore, WAITLIST_JOINED_KEY, false);
      if (joined) joined.hidden = true;
      if (form) {
        form.hidden = false;
        form.querySelector('input[type="email"]')?.focus();
      }
    });
    card.dataset.reason = reason;
  }

  async function open(detail) {
    if (!shouldOpenWaitlist(detail, sessionStore)) return false;
    // Whatever opened it, the visitor has read the card: the HUD running out
    // after the voice card must not open « Essai terminé » on top of it.
    writeFlag(sessionStore, WAITLIST_AUTO_SHOWN_KEY, true);
    // An automatic refusal never replaces a card the visitor asked for.
    if (root && !detail.explicit) return true;
    if (opening) {
      // A gesture is never answered with the card an automatic refusal was
      // still loading (the HUD's « essais utilisés » swallowed the voice card
      // that way): it opens once that one has, and replaces it.
      if (!detail.explicit || openingExplicit) return opening;
      return opening.then(() => open(detail));
    }
    openingExplicit = Boolean(detail.explicit);
    opening = (async () => {
      const trial = await readTrial();
      const card = documentRef.createElement('aside');
      card.id = CARD_ID;
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-labelledby', 'waitlist-title');
      card.setAttribute('aria-describedby', 'waitlist-lede');
      card.innerHTML = renderWaitlistCard({
        reason: detail.reason,
        trial,
        joined: readFlag(localStore, WAITLIST_JOINED_KEY),
      });
      if (root) root.remove();
      else {
        returnFocus = detail.explicit ? documentRef.activeElement : null;
        documentRef.addEventListener('keydown', onKeydown);
      }
      root = card;
      wire(card, detail.reason);
      documentRef.body.appendChild(card);
      // Only a gesture aimed at the paid feature takes focus. The HUD's
      // periodic refusal must not pull the caret out of the search box.
      if (detail.explicit) {
        const target = card.querySelector('.waitlist-form:not([hidden]) input[type="email"]')
          || card.querySelector('[data-waitlist-close]');
        target?.focus?.({ preventScroll: true });
      }
      return true;
    })().finally(() => { opening = null; });
    return opening;
  }

  return { open, close };
}
