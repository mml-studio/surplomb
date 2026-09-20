/**
 * Strings of `src/data/adsFeed.js` — the four Sitadel datafiles merged with
 * the three métropole ADS portals.
 *
 * ALMOST ALL OF THIS MODULE RUNS ON THE SERVER. `vite.config.js` imports
 * seventeen of its functions for `/api/ads-fr`, and a server has no language
 * by design (docs/i18n/CONVENTIONS.md). So every table below keeps publishing
 * FRENCH into the payload — built from this catalog's definition rather than
 * retyped beside it, as `rnbPivot.js` does — and the browser relabels the KEY
 * at draw time through the readers exported next to each table.
 *
 * THE PURPOSE TABLE IS KEYED BY ITS OWN FRENCH, and that is not an oversight.
 * `purpose` is composed on the server out of three of the publisher's
 * dictionaries and arrives as one ` · `-joined sentence; `adsPermitTarget()`
 * in `adsUrbanisme.js` matches on that sentence, and `adsUrbanisme.test.mjs`
 * pins it. So the French phrase IS the payload's data value — the way a DVF
 * `type_local` is — and `labelFor` translates it by that value. A phrase the
 * table does not know is a portal's own free text and is shown as published.
 */
import { defineMessages } from '../i18n/messages.js';

/** `TYPE_DAU`, and the family letter a portal's free text is folded onto. */
const KINDS = Object.freeze({
  PC: { fr: 'Permis de construire', en: 'Building permit' },
  DP: { fr: 'Déclaration préalable', en: 'Prior declaration' },
  PA: { fr: 'Permis d’aménager', en: 'Development permit' },
  PD: { fr: 'Permis de démolir', en: 'Demolition permit' },
  CU: { fr: 'Certificat d’urbanisme', en: 'Planning certificate' },
});

/**
 * Where a dossier stands, on the one ladder both registers are folded onto.
 *
 * The first four are Sitadel's `ETAT` (the file publishes exactly `[2,4,5,6]`);
 * the last four are what the three portals say, and only one of them —
 * `instruction` — is a thing Sitadel cannot express at all.
 */
const STATES = Object.freeze({
  autorise: { fr: 'Autorisé', en: 'Authorized' },
  annule: { fr: 'Annulé', en: 'Canceled' },
  commence: { fr: 'Chantier ouvert', en: 'Site opened' },
  termine: { fr: 'Travaux achevés', en: 'Work completed' },
  instruction: { fr: 'En cours d’instruction', en: 'Under review' },
  refuse: { fr: 'Refusé', en: 'Refused' },
  accorde: { fr: 'Accordé', en: 'Granted' },
  depose: { fr: 'Déposé', en: 'Filed' },
});

/**
 * The words `sitadelPurpose()` joins, keyed by the French it publishes.
 *
 * Three of the publisher's dictionaries in one table: `NATURE_PROJET_DECLAREE`
 * (two values, both worth saying), `DESTINATION_PRINCIPALE` of a
 * non-residential authorisation, and `ZONE_OP` of a permis d'aménager.
 */
const PURPOSES = Object.freeze({
  'nouvelle construction': { fr: 'nouvelle construction', en: 'new construction' },
  'travaux sur construction existante': {
    fr: 'travaux sur construction existante',
    en: 'work on an existing building',
  },
  logements: { fr: 'logements', en: 'dwellings' },
  bureaux: { fr: 'bureaux', en: 'offices' },
  commerce: { fr: 'commerce', en: 'retail' },
  industrie: { fr: 'industrie', en: 'industry' },
  agriculture: { fr: 'agriculture', en: 'agriculture' },
  entrepôt: { fr: 'entrepôt', en: 'warehouse' },
  'service public': { fr: 'service public', en: 'public service' },
  lotissement: { fr: 'lotissement', en: 'housing subdivision' },
  ZAC: { fr: 'ZAC', en: 'ZAC (mixed development zone)' },
  AFU: { fr: 'AFU', en: 'AFU (urban land consolidation)' },
});

/**
 * What each placement outcome licenses a reader to believe, worst to best.
 *
 * `mere` sits between a house number and a street on purpose: it is a plot
 * that CERTAINLY contains the site, which street level never is, and it is not
 * the lot, which a house number claims to be.
 */
const PRECISIONS = Object.freeze({
  parcelle: { fr: 'parcelle cadastrale', en: 'cadastral parcel' },
  enfant: { fr: 'lot issu de la parcelle citée', en: 'lot split off the parcel named' },
  published: { fr: 'coordonnée publiée', en: 'published coordinate' },
  housenumber: { fr: 'au numéro', en: 'at the street number' },
  mere: { fr: 'parcelle divisée depuis', en: 'parcel divided since' },
  street: { fr: 'à la rue', en: 'to the street' },
  locality: { fr: 'au lieu-dit', en: 'to the locality' },
  municipality: { fr: 'à la commune', en: 'to the municipality' },
});

/**
 * The module's own catalog: the four tables, grouped.
 *
 * Nothing reads it through this shape — each table is used flat, keyed by its
 * data value, through the four accessors below — but it is what makes this
 * file one catalog per module, and what the parity test walks.
 */
export default defineMessages({
  kinds: KINDS,
  states: STATES,
  purposes: PURPOSES,
  precisions: PRECISIONS,
});

/** The four tables, flat, as `labelFor()` needs them. */
export const ADS_KIND_WORDS = defineMessages(KINDS);
export const ADS_STATE_WORDS = defineMessages(STATES);
export const ADS_PURPOSE_WORDS = defineMessages(PURPOSES);
export const ADS_PRECISION_WORDS = defineMessages(PRECISIONS);
