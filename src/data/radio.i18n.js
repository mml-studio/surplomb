/**
 * The chip strip of the Radio layer, in both languages.
 *
 * This layer is inherited from upstream and shipped English-only; what it
 * needed was FRENCH, and the English beside it is the original verbatim.
 *
 * TWO KINDS OF CHIP. The first eight are the layer's OWN vocabulary — what a
 * station is FOR — and they are translated. The music genres after them are
 * matched on a station's own tags (`jazz`, `hip hop`, `r&b`), and most of them
 * are the same word in French; the four that are not — classical, oldies,
 * dance, world — get their French name, because a French reader browsing a
 * chip strip is not reading English tags.
 *
 * The keys are the tags and never move: `stationMatchesRadioCategory()`
 * matches on them and a share link carries them.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

/** What a station is FOR — the layer's own eight, plus the two ends. */
export const RADIO_CATEGORY_LABELS = defineMessages({
  all: { fr: 'Toutes', en: 'All' },
  news: { fr: 'Infos', en: 'News' },
  talk: { fr: 'Parole', en: 'Talk' },
  weather: { fr: 'Météo / Urgences', en: 'Weather / Emergency' },
  'public-safety': { fr: 'Sécurité publique', en: 'Public Safety' },
  'aviation-marine': { fr: 'Aviation / Marine', en: 'Aviation / Marine' },
  'traffic-transit': { fr: 'Trafic / Transports', en: 'Traffic / Transit' },
  music: { fr: 'Musique', en: 'Music' },
  other: { fr: 'Autre', en: 'Other' },
});

/** The music genres, keyed on the station tag they are matched by. */
export const RADIO_GENRE_LABELS = defineMessages({
  alternative: { fr: 'Alternatif', en: 'Alternative' },
  ambient: { fr: 'Ambient', en: 'Ambient' },
  blues: { fr: 'Blues', en: 'Blues' },
  classical: { fr: 'Classique', en: 'Classical' },
  country: { fr: 'Country', en: 'Country' },
  dance: { fr: 'Dance', en: 'Dance' },
  electronic: { fr: 'Électronique', en: 'Electronic' },
  folk: { fr: 'Folk', en: 'Folk' },
  funk: { fr: 'Funk', en: 'Funk' },
  'hip hop': { fr: 'Hip-Hop', en: 'Hip-Hop' },
  house: { fr: 'House', en: 'House' },
  indie: { fr: 'Indie', en: 'Indie' },
  jazz: { fr: 'Jazz', en: 'Jazz' },
  latin: { fr: 'Latino', en: 'Latin' },
  metal: { fr: 'Metal', en: 'Metal' },
  oldies: { fr: 'Rétro', en: 'Oldies' },
  pop: { fr: 'Pop', en: 'Pop' },
  punk: { fr: 'Punk', en: 'Punk' },
  'r&b': { fr: 'R&B', en: 'R&B' },
  reggae: { fr: 'Reggae', en: 'Reggae' },
  rock: { fr: 'Rock', en: 'Rock' },
  soul: { fr: 'Soul', en: 'Soul' },
  techno: { fr: 'Techno', en: 'Techno' },
  trance: { fr: 'Trance', en: 'Trance' },
  world: { fr: 'Musiques du monde', en: 'World' },
});

export default RADIO_CATEGORY_LABELS;
