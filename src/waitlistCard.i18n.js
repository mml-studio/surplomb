/**
 * Strings of src/waitlistCard.js — see docs/i18n/CONVENTIONS.md.
 *
 * THESE ARE THE HOSTED PRODUCT'S WORDS, so the English is written, not
 * translated: it has to read as naturally as the French to a reader who never
 * sees the other one. Two rules held while writing it, both from the decision
 * of 2026-09-17:
 *
 *   - NOTHING IS PROMISED THAT IS NOT BUILT. Every line of `includes` works
 *     today. There is no price, no plan and no payment page — there is a
 *     waitlist, and the card says only that.
 *   - THE GLOBE STAYS FREE, and the card repeats it every time, because the
 *     visitor is reading it at the moment something was refused.
 *
 * The usage choices' VALUES (`logement`, `immobilier`…) are data: they are
 * posted to Buttondown as `metadata__usage` and land on the subscriber's
 * record, so they stay as they are in both languages and only their label is
 * translated (CONVENTIONS § 4).
 */
import { defineMessages } from './i18n/messages.js';
import { countNoun } from './i18n/format.js';

export default defineMessages({
  usage: {
    housing: { fr: 'Je cherche un logement', en: 'I’m looking for a home' },
    property: { fr: 'Je travaille dans l’immobilier', en: 'I work in real estate' },
    curiosity: { fr: 'Par curiosité', en: 'Out of curiosity' },
    other: { fr: 'Autre raison', en: 'Some other reason' },
  },
  includes: {
    voice: { fr: 'La commande vocale', en: 'Voice control' },
    prices: {
      fr: 'Le prix au m² autour d’ici, en une question',
      en: 'The price per m² around here, in one question',
      note: 'The dvf-sales and avis-valeur medians the voice reads out.',
    },
    route: {
      fr: 'Le trajet à pied ou à vélo, tracé et minuté',
      en: 'The walking or cycling route, drawn and timed',
      note: '`annotate_map type=route`, drawn on the streets with its distance and time.',
    },
  },
  // Two sentences at most: what ran out, and that the map did not.
  stillFree: {
    fr: 'Le globe et ses couches restent gratuits.',
    en: 'The globe and its layers stay free.',
  },
  exhausted: {
    title: { fr: 'Essai terminé', en: 'Trial over' },
    countedTries: {
      fr: (limit) => `Vos ${limit} essais`,
      en: (limit) => `Your ${countNoun(limit, 'try', 'tries')}`,
      note: 'Subject of the sentence below, when the server said how many tries there were.',
      sample: [5],
    },
    tries: { fr: 'Vos essais', en: 'Your tries', note: 'Same subject, when the server named no number.' },
    lede: {
      fr: (subject, stillFree) => `${subject} premium sont utilisés. ${stillFree}`,
      en: (subject, stillFree) => `${subject} at the premium features are used up. ${stillFree}`,
      sample: ['Your 5 tries', 'The globe and its layers stay free.'],
    },
  },
  voice: {
    title: { fr: 'La voix est une fonction premium', en: 'Voice is a premium feature' },
    // Counted in COMMANDS, the word the mic uses (src/voicePremium.js).
    spent: {
      fr: (turns) => (turns > 1
        ? `Vos ${turns} commandes vocales offertes sont utilisées.`
        : 'Votre commande vocale offerte est utilisée.'),
      en: (turns) => (turns > 1
        ? `Your ${turns} free spoken requests are used up.`
        : 'Your free spoken request is used up.'),
      note: 'The visitor just spent the voice trial. The condition is the module’s own, '
        + 'kept in both languages so the French bytes do not move.',
      sample: [3],
    },
    none: {
      fr: 'Elle arrive à l’ouverture.',
      en: 'It arrives at launch.',
      note: 'This server offers no voice trial at all (GEV_TRIAL_VOICE=0).',
    },
    lede: {
      fr: (why, stillFree) => `${why} ${stillFree}`,
      en: (why, stillFree) => `${why} ${stillFree}`,
      sample: ['Your 3 free spoken requests are used up.', 'The globe and its layers stay free.'],
    },
  },
  direct: {
    title: { fr: 'Liste d’attente', en: 'Waitlist' },
    lede: {
      fr: 'La version hébergée de Surplomb ouvre bientôt. Le globe et toutes les couches restent gratuits ; l’abonnement ajoute le confort.',
      en: 'The hosted version of Surplomb opens soon. The globe and every layer stay free; the subscription adds the comfort.',
      note: 'The visitor asked for the card (?waitlist=1 or a button), so nothing was refused.',
    },
  },
  kicker: { fr: 'SURPLOMB · PREMIUM', en: 'SURPLOMB · PREMIUM' },
  close: { fr: 'Fermer', en: 'Close' },
  includesTitle: { fr: 'Premium, à l’ouverture', en: 'Premium, at launch' },
  email: { fr: 'Votre email', en: 'Your email' },
  emailPlaceholder: { fr: 'vous@exemple.fr', en: 'you@example.com' },
  usageLegend: { fr: 'Ce qui vous amène', en: 'What brings you here' },
  submit: { fr: 'Rejoindre la liste d’attente', en: 'Join the waitlist' },
  consent: {
    fr: 'Deux emails, rien d’autre. Via Buttondown, désinscription en un clic.',
    en: 'Two emails, nothing else. Through Buttondown, one-click unsubscribe.',
  },
  yourData: { fr: 'Vos données', en: 'Your data', note: 'Link to /confidentialite#vos-donnees — a French page; see src/legalLinks.i18n.js.' },
  joined: {
    fr: 'Vous êtes sur la liste. Si ce n’est pas fait, confirmez depuis l’email reçu.',
    en: 'You’re on the list. If you haven’t yet, confirm from the email you received.',
  },
  joinedNow: {
    fr: 'Buttondown s’est ouvert dans un nouvel onglet : terminez-y l’inscription, puis cliquez le lien de l’email de confirmation.',
    en: 'Buttondown opened in a new tab: finish signing up there, then click the link in the confirmation email.',
  },
  again: { fr: 'Utiliser une autre adresse', en: 'Use another address' },
  unavailable: {
    fr: 'Les inscriptions ne sont pas encore ouvertes sur ce serveur.',
    en: 'Sign-ups are not open on this server yet.',
    note: 'A clone with no GEV_WAITLIST_BUTTONDOWN: the card has no form, and says so.',
  },
});
