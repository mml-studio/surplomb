/**
 * Strings of src/data/powerGridFeed.js — what each voltage tier IS, and what
 * an OpenStreetMap `substation=*` value means on a card.
 *
 * ONE THING TO KNOW BEFORE EDITING THE FRENCH HERE. These rows were written
 * in English by the upstream project and have been printing English on the
 * French globe ever since; their `fr` is that same English, byte for byte,
 * because a translation batch may not change what a French reader sees. They
 * are reported as a defect of their own and belong to whoever rewrites the
 * French wording of this layer. The one row that WAS French — `Poste source`
 * — keeps its French and gains its English.
 *
 * The feed runs on the server (vite.config.js) and in the national build
 * script; nothing here is read there.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The four voltage tiers, named by what they do rather than by a number. */
  tiers: {
    ehv: {
      fr: 'The backbone. In France this is the 400 kV grid RTE runs the country on.',
      en: 'The backbone. In France this is the 400 kV grid RTE runs the country on.',
      note: 'French still reads English here — inherited, see the file header.',
    },
    'hv-high': {
      fr: 'The regional transmission tier — 225 kV in France, 220 kV across much of Europe.',
      en: 'The regional transmission tier — 225 kV in France, 220 kV across much of Europe.',
    },
    'hv-mid': {
      fr: 'Sub-transmission — 150 kV in France, 132 kV in the UK, 110 kV in Germany.',
      en: 'Sub-transmission — 150 kV in France, 132 kV in the UK, 110 kV in Germany.',
    },
    'hv-low': {
      fr: 'The last high-voltage step before distribution — France’s 63 kV and 90 kV network.',
      en: 'The last high-voltage step before distribution — France’s 63 kV and 90 kV network.',
    },
  },

  /**
   * `substation=*` as a card says it. A value this table has never seen is
   * repeated rather than flattened — OSM did say something.
   */
  roles: {
    transmission: { fr: 'Transmission substation', en: 'Transmission substation' },
    distribution: {
      fr: 'Poste source (HV → distribution)',
      en: 'Primary substation (HV → distribution)',
      note: 'The French trade word for the substation where transmission becomes distribution.',
    },
    traction: { fr: 'Railway traction substation', en: 'Railway traction substation' },
    industrial: { fr: 'Industrial / site substation', en: 'Industrial / site substation' },
    generation: { fr: 'Generation switchyard', en: 'Generation switchyard' },
    transition: { fr: 'Overhead ↔ underground transition', en: 'Overhead ↔ underground transition' },
    converter: { fr: 'HVDC converter station', en: 'HVDC converter station' },
    compensation: { fr: 'Reactive-compensation station', en: 'Reactive-compensation station' },
    minor_distribution: {
      fr: 'Tagged minor distribution, at high voltage',
      en: 'Tagged minor distribution, at high voltage',
    },
  },
  /** A tag this build has never seen, repeated as published. */
  roleTagged: {
    fr: (tag) => `Tagged ${tag}`,
    en: (tag) => `Tagged ${tag}`,
    sample: ['minor distribution'],
  },
  /** No `substation` subtype at all — which is not the same as an unknown one. */
  roleUnstated: {
    fr: 'Substation (role not stated)',
    en: 'Substation (role not stated)',
  },
});
