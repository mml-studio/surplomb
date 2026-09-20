/**
 * Strings of src/data/datasetSources.js — what a plugged dataset says when it
 * cannot be read.
 *
 * Every one of these reaches the reader: `datasetLayer.js` puts a
 * `DatasetSourceError`'s message on the row, and `datasetSearch.js` puts it in
 * the dataset box. So they are sentences, not codes — short, and specific
 * enough to act on (a size cap names the number, a relay failure says it tried
 * both ways).
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  tooLargeDeclared: {
    fr: (sizeMb, capMb) => `fichier trop volumineux (${sizeMb} Mo, plafond ${capMb} Mo)`,
    en: (sizeMb, capMb) => `file too large (${sizeMb} MB, cap ${capMb} MB)`,
    note: 'The server declared a Content-Length over the cap: nothing was downloaded.',
    sample: ['48', '25'],
  },
  tooLarge: { fr: 'réponse trop volumineuse', en: 'response too large' },
  noFetch: {
    fr: 'fetch indisponible',
    en: 'fetch unavailable',
    note: 'No `fetch` in this environment at all — a build or test problem, not the source’s.',
  },
  unreachable: { fr: 'source inaccessible', en: 'source unreachable' },
  unreachableBothWays: {
    fr: 'source inaccessible (direct et relais)',
    en: 'source unreachable (direct and through the relay)',
  },
  relayFailed: {
    fr: (detail) => `relais : ${detail}`,
    en: (detail) => `relay: ${detail}`,
    sample: ['403'],
  },
  relayStatus: {
    fr: (status) => `relais HTTP ${status}`,
    en: (status) => `relay HTTP ${status}`,
    sample: ['502'],
  },
  unreadableJson: {
    fr: (what) => `${what} : JSON illisible`,
    en: (what) => `${what}: unreadable JSON`,
    note: '`what` names the endpoint that answered — WFS, data.gouv.fr…',
    sample: ['WFS'],
  },
  notGeoJson: {
    fr: 'pas un GeoJSON (FeatureCollection attendue)',
    en: 'not GeoJSON (a FeatureCollection was expected)',
  },
  wfsException: {
    fr: 'WFS : le service a répondu par une exception (typeName inconnu ?)',
    en: 'WFS: the service answered with an exception (unknown typeName?)',
  },
  unknownSource: {
    fr: (kind) => `source inconnue : ${kind}`,
    en: (kind) => `unknown source: ${kind}`,
    note: 'The manifest named a source kind this module has no loader for.',
    sample: ['wms'],
  },
});
