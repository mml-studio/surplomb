/**
 * Strings of `src/data/buildingDossier.js` — the three lines a building card
 * gains once the RNB has said which ground the volume stands on.
 *
 * Amounts arrive formatted (`formatEuros`), months already named
 * (`monthName`): a message only places words around them.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** What this ground last sold for — DVF, a month and never a day. */
  sale: {
    sold: {
      fr: (month, amount) => `Vendu ${month} · ${amount}`,
      en: (month, amount) => `Sold ${month} · ${amount}`,
      note: 'The month, not the day: DVF is a fiscal extract published twice a year.',
      sample: ['March 2024', '€245,000'],
    },
    line: {
      fr: (parts) => `${parts} — DVF, sur cette parcelle`,
      en: (parts) => `${parts} — DVF, on this parcel`,
      note: 'Closes the sale line: the sale is attached to the PARCEL, not to the building.',
      sample: ['Sold March 2024 · €245,000 · €3,200/m²'],
    },
  },

  /** What has been authorized on this ground since 2013 — Sitadel. */
  permits: {
    count: {
      fr: (count) => `${count} autorisation${count > 1 ? 's' : ''}`,
      en: (count) => `${count} ${plural(count, 'permit', 'permits', { locale: 'en' })}`,
      note: 'Used when the newest permit carries no label of its own.',
      sample: [3],
    },
    withDate: {
      fr: (label, month) => `${label} · ${month}`,
      en: (label, month) => `${label} · ${month}`,
      note: '`label` is the permit’s own, as `adsFeed.js` composed it (`PC · Autorisé`).',
      sample: ['PC', 'June 2023'],
    },
    more: {
      fr: (more) => ` · +${more} autre${more > 1 ? 's' : ''} depuis 2013`,
      en: (more) => ` · +${more} more since 2013`,
      sample: [33],
    },
    line: {
      fr: (head) => `Permis : ${head} — Sitadel, sur cette parcelle`,
      en: (head) => `Permits: ${head} — Sitadel, on this parcel`,
      sample: ['PC · June 2023'],
    },
  },

  /** What the local zoning plan says about this point. */
  zoning: {
    none: {
      fr: 'PLU : aucun zonage publié sur ce point',
      en: 'PLU: no zoning published at this point',
      note: 'Asked, and the document draws no zone here — not the same as never asked.',
    },
    line: {
      fr: (zone) => `PLU : ${zone}`,
      en: (zone) => `PLU: ${zone}`,
      note: '`zone` is the document’s own code and label (`UA — Zone urbaine`).',
      sample: ['UA'],
    },
    alsoZones: {
      fr: (more) => ` · +${more} zonage${more > 1 ? 's' : ''} sur ce point`,
      en: (more) => ` · +${more} more ${plural(more, 'zoning', 'zonings', { locale: 'en' })} at this point`,
      note: 'Two municipalities digitize their shared limit independently.',
      sample: [1],
    },
    easements: {
      fr: (count) => ` · ${count} servitude${count > 1 ? 's' : ''}`,
      en: (count) => ` · ${count} ${plural(count, 'easement', 'easements', { locale: 'en' })}`,
      sample: [2],
    },
  },
});
