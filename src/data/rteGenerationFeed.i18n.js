/**
 * Strings of src/data/rteGenerationFeed.js — the thirteen generation classes
 * RTE's units are sorted into, and the caption a raw `production_type` gets.
 *
 * The feed itself runs on the SERVER (vite.config.js) and in the registry
 * build script; nothing here is read there. The browser reads it when it
 * draws the key and a card (`rteGeneration.js`).
 *
 * WHAT STAYS FRENCH: the site captions `composeSiteName()` builds station
 * names out of (`Centrale nucléaire du Bugey`). Those names are written into
 * `units.json` at build time and are the station's name in both languages —
 * see the note there.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * One row per class: the legend label, and the line under it. The figures
   * inside a blurb are the fleet's, measured once and quoted as published.
   */
  classes: {
    nuclear: {
      label: { fr: 'Nucléaire', en: 'Nuclear' },
      blurb: {
        fr: 'Réacteurs de fission. 57 groupes pour 63,0 GW — trois cinquièmes de tout ce qui est raccordé au réseau de transport, dans une seule filière.',
        en: 'Fission reactors. 57 generating units for 63.0 GW — three fifths of everything connected to the transmission grid, in a single generation type.',
      },
    },
    'hydro-reservoir': {
      label: { fr: 'Hydraulique · lac', en: 'Hydro · reservoir' },
      blurb: {
        fr: 'Hydraulique de lac. De l’eau stockée, lâchée sur commande — la plus grosse variation que le parc sache faire vite.',
        en: 'Reservoir hydro. Stored water, released on command — the largest swing the fleet can produce quickly.',
      },
    },
    'hydro-run-of-river': {
      label: { fr: 'Hydraulique · fil de l’eau', en: 'Hydro · run-of-river' },
      blurb: {
        fr: 'Hydraulique au fil de l’eau et par éclusée. Elle suit la rivière, pas le marché.',
        en: 'Run-of-river and pondage hydro. It follows the river, not the market.',
      },
    },
    'hydro-pumped': {
      label: { fr: 'Hydraulique · pompage', en: 'Hydro · pumped storage' },
      blurb: {
        fr: 'Pompage-turbinage. Elle produit ET elle consomme — une valeur négative ici, c’est la machine qui remplit son lac du haut, et pas la consommation propre qu’un groupe à l’arrêt affiche dans toutes les autres filières.',
        en: 'Pumped storage. It generates AND it consumes — a negative value here is the machine filling its upper reservoir, not the house load a stopped unit shows in every other generation type.',
      },
    },
    'fossil-gas': {
      label: { fr: 'Gaz', en: 'Gas' },
      blurb: {
        fr: 'Gaz en cycle combiné, en cycle ouvert et en cogénération. Ce sont les centrales que la couche Réseau gaz dessine comme inventaire.',
        en: 'Combined-cycle, open-cycle and cogeneration gas. These are the plants the Gas network layer draws as an inventory.',
      },
    },
    'fossil-coal': {
      label: { fr: 'Charbon', en: 'Coal' },
      blurb: {
        fr: 'Charbon. Quatre des six groupes restants sont « en retrait provisoire » au registre.',
        en: 'Coal. Four of the six remaining units are “temporarily withdrawn” in the register.',
      },
    },
    'fossil-oil': {
      label: { fr: 'Fioul', en: 'Oil' },
      blurb: {
        fr: 'Turbines à combustion au fioul. Des machines de pointe, à l’arrêt presque toute l’année.',
        en: 'Oil-fired combustion turbines. Peaking machines, stopped almost all year.',
      },
    },
    biomass: {
      label: { fr: 'Bioénergies', en: 'Bioenergy' },
      blurb: {
        fr: 'Biomasse et incinération de déchets, au-dessus du seuil de 100 MW.',
        en: 'Biomass and waste incineration, above the 100 MW threshold.',
      },
    },
    wind: {
      label: { fr: 'Éolien en mer', en: 'Offshore wind' },
      blurb: {
        fr: 'Éolien en mer. Le seul éolien au-dessus du seuil : à terre, aucun parc n’atteint 100 MW.',
        en: 'Offshore wind. The only wind above the threshold: onshore, no farm reaches 100 MW.',
      },
    },
    solar: {
      label: { fr: 'Solaire', en: 'Solar' },
      blurb: {
        fr: 'Photovoltaïque au-dessus du seuil de 100 MW.',
        en: 'Solar PV above the 100 MW threshold.',
      },
    },
    marine: {
      label: { fr: 'Énergies marines', en: 'Marine energy' },
      blurb: {
        fr: 'Marémoteur. Une seule machine en France : l’usine de la Rance, 240 MW, en service depuis 1966.',
        en: 'Tidal. One machine in France: the Rance plant, 240 MW, running since 1966.',
        keep: ['Rance'],
      },
    },
    battery: {
      label: { fr: 'Stockage batterie', en: 'Battery storage' },
      blurb: {
        fr: 'Batteries raccordées au réseau, au-dessus du seuil. Comme le pompage-turbinage, elles affichent une valeur négative pendant la charge.',
        en: 'Grid-connected batteries, above the threshold. Like pumped storage, they show a negative value while charging.',
      },
    },
    other: {
      label: { fr: 'Autre', en: 'Other' },
      blurb: {
        fr: 'Une classe publiée pour laquelle ce build n’a pas de ligne. La valeur d’origine est reprise sur la fiche plutôt que masquée.',
        en: 'A published class this build has no line for. The original value is shown on the card rather than hidden.',
      },
    },
  },

  /** What a card says when RTE publishes no `production_type` at all. */
  unpublishedType: { fr: 'Filière non publiée', en: 'Generation type not published' },
});
