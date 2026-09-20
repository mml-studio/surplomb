/**
 * Strings of src/voice/voiceCost.js — one sentence, and it is a caveat.
 *
 * The module is otherwise a price table and runs on the SERVER too
 * (`vite.config.js` imports `resolveVoiceModel` to mint a session at the right
 * tier). Nothing on that path reads this catalog: the only message here is
 * appended to a tooltip in the browser, by `gevRealtime.syncCostUi`.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  incompleteNote: {
    fr: 'Estimation incomplète — une réponse était encore en vol à la fin de la session, son usage n’a jamais été reporté.',
    en: 'Estimate is incomplete — a response was still in flight when the session ended, so its usage was never reported.',
    note: 'Deliberately not called a lower bound: the estimate can run high as well as low, so it is neither floor nor ceiling — just incomplete.',
  },
});
