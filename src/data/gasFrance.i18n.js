/**
 * Strings of src/data/gasFrance.js — the Gas network layer: the card of a
 * pipe, a gas-fired plant and a biomethane injection site, the row's own
 * sentence, and the key.
 *
 * LIKE THE POWER GRID, THIS LAYER IS HALF-INHERITED. The cards were written
 * in English and print English on the French globe; the row line and the
 * status messages are French. Every `fr` below is the bytes that row printed
 * before — English where it was English — and the `en` is the English it
 * should read. The mixed rows are reported with the batch.
 *
 * Site names, operators, communes, départements, the register's `statut` and
 * its feedstock word are data and stay as published.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The unit of an annual energy: `GWh/an` is French for "per year", and the
   * English is the `/yr` a reader of an energy table expects.
   */
  units: {
    gwhPerYear: { fr: 'GWh/an', en: 'GWh/yr' },
    twhPerYear: { fr: 'TWh/an', en: 'TWh/yr' },
  },

  /** The card of one selected object. */
  card: {
    pipeTitle: {
      fr: (operator) => `${operator} — réseau de transport`,
      en: (operator) => `${operator} — transmission network`,
      sample: ['NaTran (ex-GRTgaz)'],
    },
    pipeFallbackTitle: { fr: 'Réseau de transport', en: 'Transmission network' },
    pipeLength: {
      fr: (km) => `⌇ ${km} km of published trace`,
      en: (km) => `⌇ ${km} km of published trace`,
      sample: ['12.4'],
    },
    pipeSimplified: {
      fr: 'Tracé simplifié — accurate to about 250 m, by design',
      en: 'Simplified route — accurate to about 250 m, by design',
    },
    plantFallbackTitle: { fr: 'Centrale gaz', en: 'Gas-fired plant' },
    plantInstalled: {
      fr: (power) => `⚡ ${power} installed`,
      en: (power) => `⚡ ${power} installed`,
      sample: ['446 MW'],
    },
    commissioned: {
      fr: (when) => `🗓 mise en service ${when}`,
      en: (when) => `🗓 commissioned ${when}`,
      note: 'The register publishes the date as text; it is shown as published.',
      sample: ['2011'],
    },
    supersededBy: {
      fr: (what) => `↳ earlier editions said: ${what}`,
      en: (what) => `↳ earlier editions said: ${what}`,
      sample: ['425 MW'],
    },
    edition: {
      fr: (edition, of) => `Edition ${edition}${of} — installed capacity, not live output`,
      en: (edition, of) => `Edition ${edition}${of} — installed capacity, not live output`,
      sample: ['2024', ' of 3'],
    },
    editionOf: {
      fr: (count) => ` of ${count}`,
      en: (count) => ` of ${count}`,
      sample: [3],
    },
    injectionFallbackTitle: { fr: 'Site d’injection', en: 'Injection site' },
    injectionCapacity: {
      fr: (energy) => `♻️ ${energy} declared capacity`,
      en: (energy) => `♻️ ${energy} declared capacity`,
      sample: ['24.0 GWh/an'],
    },
    tier: {
      fr: (label, network) => `⌇ ${label}${network}`,
      en: (label, network) => `⌇ ${label}${network}`,
      sample: ['Transmission', ' · NaTran'],
    },
    tierNetwork: {
      fr: (network) => ` · ${network}`,
      en: (network) => ` · ${network}`,
      sample: ['NaTran'],
    },
    distributionNote: {
      fr: '↳ distribution network — not the trace drawn here',
      en: '↳ distribution network — not the trace drawn here',
    },
    expanding: {
      fr: '↗ an increase is declared as planned',
      en: '↗ an increase is declared as planned',
    },
  },

  /** The row's own sentence. */
  row: {
    loadingNetwork: {
      fr: 'chargement du tracé de transport…',
      en: 'loading the transmission route…',
    },
    refreshing: { fr: 'actualisation du registre gaz…', en: 'refreshing the gas register…' },
    unavailable: { fr: 'indisponible', en: 'unavailable' },
    trace: {
      fr: (km) => `${km} de tracé`,
      en: (km) => `${km} of route`,
      sample: ['36,106 km'],
    },
    plants: {
      fr: (count) => `${count} centrales`,
      en: (count) => `${count} gas-fired plants`,
      sample: [24],
    },
    injections: {
      fr: (count) => `${count} sites d’injection`,
      en: (count) => `${count} injection sites`,
      sample: [850],
    },
  },

  /** Row status when one or both ODRÉ datasets are down. */
  errors: {
    bothDown: {
      fr: 'jeux de données gaz ODRÉ indisponibles',
      en: 'ODRÉ gas datasets unavailable',
    },
    network: { fr: 'erreur du réseau gaz ODRÉ', en: 'ODRÉ gas network error' },
    sitesDown: { fr: 'sites unavailable', en: 'sites unavailable' },
    traceDown: { fr: 'network trace unavailable', en: 'network route unavailable' },
  },

  /** The key: two networks, two kinds of site. */
  legend: {
    operator: {
      fr: (km, departements) => `${km} of published trace across ${departements} `
        + 'départements — simplified to about 250 m by the operator, never redrawn here.',
      en: (km, departements) => `${km} of published trace across ${departements} `
        + 'departments — simplified to about 250 m by the operator, never redrawn here.',
      sample: ['32,600 km', 66],
    },
    plantsLabel: { fr: 'Centrales gaz', en: 'Gas-fired plants' },
    plantsBlurb: {
      fr: (power) => `${power} installed, sized by nameplate power. Installed capacity — `
        + 'what these machines are producing right now is the Mix élec layer.',
      en: (power) => `${power} installed, sized by nameplate power. Installed capacity — `
        + 'what these machines are generating right now is the Electricity mix layer.',
      note: 'The English names the sibling layer as the panel names it.',
      sample: ['12.4 GW'],
    },
    injectionTransport: { fr: 'Injection · transport', en: 'Injection · transmission' },
    injectionDistribution: { fr: 'Injection · distribution', en: 'Injection · distribution' },
  },
});
