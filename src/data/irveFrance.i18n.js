/**
 * Strings of src/data/irveFrance.js — the EV charging layer: the card of a
 * station, of a lattice cell and of a department, the power-floor chips, the
 * key and the row's sentence in each of its three regimes.
 *
 * The five power classes are named next door, in `irveFeed.i18n.js`, beside
 * the table that holds them. Station names, operator names, communes and the
 * register's enumerated values (`Accès libre`, `Voirie`, `Réservé PMR`…) are
 * DATA: they are published that way, travel on the record that way, and are
 * labelled here by `access`, `implantation` and `pmr` below.
 *
 * THE SENTENCE THIS LAYER CANNOT LOSE: a charge point in this register is
 * INSTALLED CAPACITY, and the file says nothing about whether it is free
 * right now. QualiCharge answers that, on its own line, for the plugs it
 * actually spoke for.
 */
import { defineMessages } from '../i18n/messages.js';
import { monthName } from '../i18n/format.js';

export default defineMessages({
  /** The one clause behind each power swatch in the key. */
  bandBlurbs: {
    lente: { fr: 'Une charge de nuit.', en: 'An overnight charge.' },
    normale: { fr: 'Voirie et parking.', en: 'Street and car park.' },
    accelere: { fr: 'Le temps d’une course.', en: 'While you run an errand.' },
    rapide: { fr: 'Aires d’autoroute.', en: 'Motorway services.' },
    hpc: { fr: 'Jusqu’à 400 kW.', en: 'Up to 400 kW.' },
    inconnue: { fr: 'Mal publiée, jamais corrigée.', en: 'Badly published, never corrected.' },
  },

  /** The register's enumerated values, labelled for the card. */
  access: {
    'Accès libre': { fr: 'Accès libre', en: 'Open access' },
    'Accès réservé': { fr: 'Accès réservé', en: 'Restricted access' },
  },
  implantation: {
    Voirie: { fr: 'Voirie', en: 'On-street' },
    'Parking public': { fr: 'Parking public', en: 'Public car park' },
    'Parking privé à usage public': {
      fr: 'Parking privé à usage public',
      en: 'Private car park open to the public',
    },
    'Parking privé réservé à la clientèle': {
      fr: 'Parking privé réservé à la clientèle',
      en: 'Private car park for customers',
    },
    'Station dédiée à la recharge rapide': {
      fr: 'Station dédiée à la recharge rapide',
      en: 'Dedicated fast-charging station',
    },
  },
  pmr: {
    'Réservé PMR': {
      fr: 'Réservé PMR',
      en: 'Reserved for drivers with reduced mobility',
      note: 'PMR is the French administrative term; English says what it means.',
    },
    'Accessible mais non réservé PMR': {
      fr: 'Accessible mais non réservé PMR',
      en: 'Accessible but not reserved for reduced mobility',
    },
    'Non accessible': { fr: 'Non accessible', en: 'Not accessible' },
    'Accessibilité inconnue': { fr: 'Accessibilité inconnue', en: 'Accessibility unknown' },
  },

  /** The card of a station the register places. */
  card: {
    fallbackTitle: { fr: 'Station de recharge', en: 'Charging station' },
    chargePoints: {
      fr: (count, n) => `🔌 ${count} point${n === 1 ? '' : 's'} de charge`,
      en: (count, n) => `🔌 ${count} charge point${n === 1 ? '' : 's'}`,
      sample: ['6', 6],
    },
    duplicates: {
      fr: (published, duplicated) => `↳ ${published} publiés — ${duplicated} en double`,
      en: (published, duplicated) => `↳ ${published} published — ${duplicated} duplicated`,
      sample: ['8', '2'],
    },
    bandSplit: {
      fr: (count, band) => `${count} × ${band}`,
      en: (count, band) => `${count} × ${band}`,
      note: 'The band name is lowercased by the caller, its kW range stripped.',
      sample: ['4', 'fast'],
    },
    peak: {
      fr: (kw) => `⚡ ${kw} kW max`,
      en: (kw) => `⚡ ${kw} kW max`,
      sample: ['300'],
    },
    outOfEnvelope: {
      fr: '⚠️ Puissance publiée hors gabarit — non convertie',
      en: '⚠️ Published power outside the envelope — not converted',
    },
    duplicateOperators: {
      fr: (operators) => `↳ publié aussi par ${operators} — fusionné`,
      en: (operators) => `↳ also published by ${operators} — merged`,
      sample: ['Izivia'],
    },
    unverifiedPosition: {
      fr: '📍 Position non vérifiée contre une commune',
      en: '📍 Position not checked against a municipality',
    },
    free: { fr: '💶 Gratuit', en: '💶 Free' },
    paid: { fr: '💶 Payant', en: '💶 Paid' },
    filedRange: {
      fr: (from, to) => `🗓 déclaré ${from} → ${to}`,
      en: (from, to) => `🗓 filed ${from} → ${to}`,
      note: 'The freshness of the DECLARATION, not of the poll.',
      sample: ['Mar 4, 2023', 'Sep 1, 2026'],
    },
    filed: {
      fr: (day) => `🗓 déclaré ${day}`,
      en: (day) => `🗓 filed ${day}`,
      sample: ['Sep 1, 2026'],
    },
    beamCapped: {
      fr: (domain) => `▮ Le trait mesure les points de charge — au-delà de ${domain}, il plafonne`,
      en: (domain) => `▮ The beam measures charge points — past ${domain} it caps`,
      sample: ['24'],
    },
    beam: {
      fr: (domain) => `▮ Le trait mesure les points de charge (${domain} au maximum)`,
      en: (domain) => `▮ The beam measures charge points (${domain} at most)`,
      sample: ['24'],
    },
    installedOnly: {
      fr: 'Capacité installée — ce fichier ne publie pas la disponibilité',
      en: 'Installed capacity — this file does not publish availability',
    },
    live: {
      fr: (line) => `⚡ QualiCharge — ${line}`,
      en: (line) => `⚡ QualiCharge — ${line}`,
      sample: ['3 free of 4'],
    },
  },

  /** The card of a mark that stands for a whole lattice cell. */
  mesh: {
    title: { fr: 'Maillage des bornes', en: 'Charge-point lattice' },
    cell: {
      fr: (step, latKm, lonKm) => `▦ Cellule de ${step}° — ${latKm} × ${lonKm} km`,
      en: (step, latKm, lonKm) => `▦ ${step}° cell — ${latKm} × ${lonKm} km`,
      sample: ['0.25', '27.8', '18.4'],
    },
    cellTotals: {
      fr: (pdc, n, sites, s) => `🔌 ${pdc} point${n === 1 ? '' : 's'} de charge sur ${sites} site${s === 1 ? '' : 's'}`,
      en: (pdc, n, sites, s) => `🔌 ${pdc} charge point${n === 1 ? '' : 's'} across ${sites} site${s === 1 ? '' : 's'}`,
      sample: ['412', 412, '96', 96],
    },
    representative: {
      fr: (pdc, n, band) => `📍 Marque posée sur un site réel de la cellule — ${pdc} point${n === 1 ? '' : 's'} de charge, ${band}`,
      en: (pdc, n, band) => `📍 Mark placed on a real site inside the cell — ${pdc} charge point${n === 1 ? '' : 's'}, ${band}`,
      sample: ['6', 6, 'fast (≤ 150 kw)'],
    },
    zoomForDetail: {
      fr: 'Zoomez pour l’opérateur, les prises et les conditions d’accès',
      en: 'Zoom in for the operator, the connectors and the access conditions',
    },
  },

  /** The card of a department prism. */
  departement: {
    chargePoints: {
      fr: (count, n) => `🔌 ${count} point${n === 1 ? '' : 's'} de charge — la hauteur du prisme`,
      en: (count, n) => `🔌 ${count} charge point${n === 1 ? '' : 's'} — the prism’s height`,
      sample: ['10,240', 10_240],
    },
    sites: {
      fr: (count, n) => `📍 ${count} site${n === 1 ? '' : 's'}`,
      en: (count, n) => `📍 ${count} site${n === 1 ? '' : 's'}`,
      sample: ['3,127', 3127],
    },
    density: {
      fr: (per1000, area) => `▦ ${per1000} pour 1 000 km² — la couleur (${area} km²)`,
      en: (per1000, area) => `▦ ${per1000} per 1,000 km² — the color (${area} km²)`,
      sample: ['84.2', '12,011'],
    },
    noDensity: {
      fr: '▦ densité non calculable — le prisme est hachuré, sa hauteur reste mesurée',
      en: '▦ density cannot be computed — the prism is hatched, its height is still measured',
    },
  },

  /** The power-floor chips on the row strip. */
  chips: {
    all: { fr: 'TOUT', en: 'ALL' },
    floorTitle: {
      fr: (threshold) => `Ne garder que les sites dont la charge la plus rapide dépasse ${threshold}`,
      en: (threshold) => `Keep only sites whose fastest charging is above ${threshold}`,
      sample: ['50 kW'],
    },
    allTitle: {
      fr: 'Tout le registre, y compris les puissances inconnues',
      en: 'The whole register, unknown powers included',
    },
  },

  /** The key: the channel it reads, then one row per class drawn. */
  legend: {
    headingMesh: { fr: 'Vitesse de charge dominante', en: 'Dominant charging speed' },
    heading: { fr: 'Vitesse de charge', en: 'Charging speed' },
    cellsInView: {
      fr: (cells, c, sites, s) => `${cells} cellule${c === 1 ? '' : 's'} pour ${sites} site${s === 1 ? '' : 's'} en vue.`,
      en: (cells, c, sites, s) => `${cells} cell${c === 1 ? '' : 's'} for ${sites} site${s === 1 ? '' : 's'} in view.`,
      sample: ['240', 240, '3,747', 3747],
    },
    hiddenByFilter: {
      fr: (count, n) => `${count} site${n === 1 ? '' : 's'} masqué${n === 1 ? '' : 's'} par le filtre — un site retenu compte aussi ses bornes lentes.`,
      en: (count, n) => `${count} site${n === 1 ? '' : 's'} hidden by the filter — a site that clears it still counts its slow points.`,
      note: 'Why slower classes survive a high floor: the floor keeps a SITE by its fastest charging.',
      sample: ['1,306', 1306],
    },
  },

  /** The row's sentence, per regime. */
  row: {
    loadingMesh: { fr: 'lecture du maillage national…', en: 'reading the national lattice…' },
    emptyView: { fr: 'aucune borne publiée dans la vue', en: 'no charge point published in this view' },
    cellsThinned: {
      fr: (cells, sites) => `${cells} cellules pour ${sites} sites en vue`,
      en: (cells, sites) => `${cells} cells for ${sites} sites in view`,
      sample: ['240', '3,747'],
    },
    cellsAll: {
      fr: (cells, sites) => `${cells} cellules · ${sites} sites, tous comptés`,
      en: (cells, sites) => `${cells} cells · ${sites} sites, all counted`,
      sample: ['240', '3,747'],
    },
    meshStep: {
      fr: (step) => `maille ${step}° verrouillée sur le monde`,
      en: (step) => `${step}° lattice locked to the world`,
      sample: ['0.25'],
    },
    hidden: {
      fr: (count) => `${count} masqués par le filtre`,
      en: (count) => `${count} hidden by the filter`,
      sample: ['1,306'],
    },
    zoomForDetail: { fr: 'zoomez pour le détail', en: 'zoom in for the detail' },
    loadingNational: { fr: 'lecture du registre national…', en: 'reading the national register…' },
    nationalTotals: {
      fr: (pdc, departements) => `${pdc} points de charge · ${departements} départements`,
      en: (pdc, departements) => `${pdc} charge points · ${departements} departments`,
      sample: ['148,300', '96'],
    },
    overseas: {
      fr: (count) => `${count} outre-mer non cartographiés`,
      en: (count) => `${count} overseas, not mapped`,
      sample: ['2,410'],
    },
    partialSweep: { fr: 'balayage partiel', en: 'partial sweep' },
    cached: { fr: 'en cache', en: 'cached' },
    zoomForSites: { fr: 'zoomez pour les sites', en: 'zoom in for the sites' },
    refreshing: { fr: 'rafraîchissement du registre…', en: 'refreshing the register…' },
    loading: { fr: 'lecture du registre IRVE…', en: 'reading the IRVE register…' },
    empty: { fr: 'aucune borne publiée ici', en: 'no charge point published here' },
    chargePoints: {
      fr: (count) => `${count} points de charge`,
      en: (count) => `${count} charge points`,
      sample: ['1,240'],
    },
    merged: {
      fr: (count) => `${count} doublons fusionnés`,
      en: (count) => `${count} duplicates merged`,
      sample: ['18'],
    },
    misplaced: {
      fr: (count) => `${count} mal placés écartés`,
      en: (count) => `${count} misplaced, set aside`,
      sample: ['4'],
    },
    hiddenSites: {
      fr: (count) => `${count} sites masqués par le filtre`,
      en: (count) => `${count} sites hidden by the filter`,
      sample: ['312'],
    },
    capped: { fr: 'écrêté', en: 'capped' },
  },

  /** Row status when the bundled department outlines cannot be read. */
  errors: {
    shapes: {
      fr: 'département polygons unavailable',
      en: 'department polygons unavailable',
      note: 'Inherited English; the French row printed this too.',
    },
  },

  /**
   * A filing date as each language writes it: `04/03/2023`, `Mar 4, 2023`.
   * The parts arrive zero-padded, as the register publishes them.
   */
  day: {
    fr: (year, month, day) => `${day}/${month}/${year}`,
    en: (year, month, day) => `${monthName(Number(month) - 1, { style: 'short', locale: 'en' })} ${Number(day)}, ${year}`,
    sample: ['2023', '03', '04'],
  },
});
