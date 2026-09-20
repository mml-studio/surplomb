/**
 * What the globe says when the system takes the 3D context away — see
 * src/contextLoss.js.
 *
 * The sentence names the CAUSE before the cure: a reader whose globe just went
 * grey is owed the reason, and « le système » / “the system” is the honest
 * actor — neither the app nor the reader did this.
 *
 * The two buttons are the same pair `src/staleBuildRecovery.js` offers, and
 * they are worded identically on purpose: one word for one action, wherever a
 * reload is proposed.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  countdown: {
    fr: (seconds) => `Le rendu 3D a été interrompu par le système — rechargement dans ${seconds} s.`,
    en: (seconds) => `The system interrupted the 3D view — reloading in ${seconds} s.`,
    sample: [8],
  },
  manual: {
    fr: 'Le rendu 3D a été interrompu par le système. Rechargez pour le relancer.',
    en: 'The system interrupted the 3D view. Reload to bring it back.',
    note: 'Shown when the page has already reloaded once for this: it does not do it again by itself.',
  },
  reload: { fr: 'RECHARGER', en: 'RELOAD' },
  cancel: { fr: 'ANNULER', en: 'CANCEL', note: 'Stops the countdown; the reload button stays within reach.' },
});
