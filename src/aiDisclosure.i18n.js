/**
 * Strings of src/aiDisclosure.js — see docs/i18n/CONVENTIONS.md.
 *
 * The mark is two letters, and the two letters differ by language: « IA » is
 * how French abbreviates *intelligence artificielle*. It is therefore NOT one
 * of the cockpit's English instrument words (`AI AGENT`, `MIC`, `SUMMARY`):
 * a disclosure the reader must understand is written in the reader's language.
 *
 * The voice sentence names no vendor on purpose. The mic runs on OpenAI
 * Realtime where that key is set, and on a text model through OpenRouter with
 * the browser's own speech synthesis where it is not
 * (src/voice/voiceProviderPolicy.js). The summary sentence can name its maker:
 * `/api/openai/hud-summary` has no other provider.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  badge: {
    fr: 'IA',
    en: 'AI',
    note: 'The mark itself, on a 13 px pill. « IA » is the French abbreviation of « intelligence artificielle ».',
  },
  voice: {
    fr: 'Assistant d’intelligence artificielle — voix de synthèse',
    en: 'Artificial intelligence assistant — synthetic voice',
    note: 'Tooltip and screen-reader description of the mark on the mic.',
  },
  summary: {
    fr: 'Résumé rédigé par une intelligence artificielle (OpenAI)',
    en: 'Summary written by artificial intelligence (OpenAI)',
    note: 'Tooltip of the mark beside the HUD summary label, shown only while the line came from the model.',
  },
});
