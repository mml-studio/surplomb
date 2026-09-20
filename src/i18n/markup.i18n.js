/**
 * English for the static markup of `index.html` — see src/i18n/markup.js.
 *
 * One entry per `data-i18n*` key used in the HTML. `fr` is the French the HTML
 * carries, whitespace collapsed; `markup.test.mjs` fails when the two drift.
 * Group keys by the part of the page they belong to (`loader.*`, `search.*`,
 * `firstRun.*`), and give a `note` wherever the English needs context the key
 * does not give — a button label out of context is the hardest string there is
 * to translate.
 *
 *     loader: {
 *       status: { fr: 'Initialisation du globe…', en: 'Starting the globe…' },
 *     },
 *
 * WHAT IS NOT HERE. The showcase (`#vitrine`) and `<head>`: the landing page
 * gets its own English document later (plan decision D2), and its root carries
 * `lang="fr"` so an English `<html lang>` never mislabels it. Values that are
 * the same word in both languages — a style name (NORMAL, CRT, NVG), a brand,
 * a provider — carry `translate="no"` in the HTML instead of a key they would
 * only echo.
 */
import { defineMessages } from './messages.js';

export default defineMessages({
  overlay: {
    actions: {
      fr: 'Objets visibles sur la carte',
      en: 'Visible map targets',
      note: 'Region holding one button per object the world overlay has drawn, for readers who do not click the canvas.',
    },
  },
  title: {
    tagline: { fr: 'Aucun angle mort.', en: 'No blind spots.', note: 'The product’s slogan, under the logo.' },
  },
  style: {
    activeLabel: { fr: 'STYLE ACTIF', en: 'ACTIVE STYLE', note: 'Label of the chip naming the visual preset in use.' },
  },
  actions: {
    nav: { fr: 'Actions du globe', en: 'Globe actions' },
    clearLayers: { fr: 'Éteindre les couches sélectionnées', en: 'Clear selected data layers' },
    clearLayersTitle: { fr: 'Éteindre toutes les couches sélectionnées', en: 'Turn off all selected data layers' },
    share: { fr: 'Copier le lien de partage', en: 'Copy share link' },
    locate: { fr: 'Autour de moi', en: 'Around me' },
    locateTitle: { fr: 'Centrer la carte sur ma position', en: 'Center the map on my location' },
    resetGlobe: { fr: 'Revenir au globe entier', en: 'Reset to full globe view' },
    resetGlobeTitle: {
      fr: 'Réinitialiser la caméra et revenir au globe entier',
      en: 'Reset camera and return to full globe view',
    },
    stopFollow: { fr: 'Ne plus suivre', en: 'Stop following', note: 'Releases the object the camera is tracking.' },
    stopFollowTitle: { fr: 'Ne plus suivre cet objet', en: 'Stop following this object' },
  },
  status: {
    loading: {
      fr: 'CHARGEMENT DES DONNÉES EN DIRECT',
      en: 'LOADING LIVE DATA',
      note: 'First state of the loading chip; src/loadingFeedback.js writes the ones that follow.',
    },
    trafficSync: {
      fr: 'synchronisation du réseau routier',
      en: 'syncing road network',
      note: 'Lower case on purpose: the traffic chip is a quiet progress line, not a headline.',
    },
    cctvSync: { fr: 'chargement des images', en: 'loading frames', note: 'Camera frames of the public-camera layer.' },
  },
  heading: {
    camera: { fr: 'Cap de la caméra', en: 'Camera heading', note: 'The compass tape above the globe.' },
  },
  // The first-person cockpit: an inherited aviation surface, so its French
  // keeps the flight vocabulary (cap, vitesse sol, contact) and its units
  // (KTS, FT, WX, MM) stay the symbols pilots read in both languages.
  cockpit: {
    view: { fr: 'Vue cockpit de l’avion', en: 'Aircraft cockpit view' },
    level: { fr: 'HORIZON', en: 'LEVEL', note: 'The wings-level mark of the artificial horizon.' },
    routeDirection: { fr: 'Direction estimée de la destination', en: 'Estimated destination direction' },
    opticalPlane: { fr: 'PLAN OPTIQUE · 01', en: 'OPTICAL PLANE · 01' },
    visorLock: { fr: 'VERROU DE VISIÈRE · ACTIF', en: 'VISOR LOCK · ACTIVE' },
    speedRim: { fr: 'VITESSE SOL · KTS', en: 'GROUND SPEED · KTS' },
    altitudeRim: { fr: 'ALTITUDE · FT', en: 'ALTITUDE · FT' },
    firstPerson: { fr: 'VUE PILOTE', en: 'FIRST PERSON' },
    callsign: { fr: 'AVION', en: 'AIRCRAFT', note: 'Stands in until the tracked aircraft gives a callsign.' },
    aircraftMeta: { fr: 'SUIVI EN DIRECT · CAP ALIGNÉ', en: 'LIVE TRACK · COURSE ALIGNED' },
    compass: { fr: 'Cap actuel de l’avion', en: 'Current aircraft heading' },
    groundSpeed: { fr: 'VITESSE SOL', en: 'GROUND SPEED' },
    altitude: { fr: 'ALTITUDE', en: 'ALTITUDE' },
    vision: {
      group: { fr: 'Style de vision du cockpit', en: 'Cockpit vision style' },
      previous: { fr: 'Style de vision précédent', en: 'Previous cockpit vision style' },
      previousTitle: { fr: 'Vision précédente', en: 'Previous vision style' },
      prevShort: { fr: 'PRÉC', en: 'PREV' },
      current: {
        fr: 'Style de vision actuel : NORMAL. Activer pour passer au suivant.',
        en: 'Current cockpit vision style: NORMAL. Activate for next style.',
        note: 'The style name is rewritten by src/ui.js; NORMAL is what the page ships with.',
      },
      currentTitle: { fr: 'Style actuel : NORMAL — cliquer pour le suivant', en: 'Current style: NORMAL — click for next' },
      currentShort: { fr: 'ACTUEL', en: 'CURRENT' },
      next: { fr: 'Style de vision suivant', en: 'Next cockpit vision style' },
      nextTitle: { fr: 'Vision suivante', en: 'Next vision style' },
      nextShort: { fr: 'SUIV', en: 'NEXT' },
    },
    context: {
      summary: { fr: 'Résumé des contacts', en: 'Contact cockpit summary' },
      kicker: { fr: 'CONTACT', en: 'CONTACT' },
      subject: { fr: 'CONTACTS · 250 KM', en: 'CONTACTS · 250 KM' },
      nav: { fr: 'Navigation entre les contacts', en: 'Contact navigation' },
      previous: {
        fr: 'Précédent — contact déjà visité dans la fenêtre de 250 km',
        en: 'Previous — prior visited contact in the 250 km window',
      },
      next: {
        fr: 'Suivant — contact le plus proche jamais visité dans la fenêtre de 250 km',
        en: 'Next — nearest unvisited contact in the 250 km window',
      },
      collapse: { fr: 'Replier le panneau Contacts', en: 'Collapse Contact panel' },
      collapseTitle: { fr: 'Replier le panneau des contacts', en: 'Collapse contact panel' },
      qualifier: {
        fr: 'CONTEXTE SEUL',
        en: 'CONTEXT ONLY',
        note: 'Warns that the panel counts what the feeds published, not everything that is there.',
      },
      cohorts: { fr: 'Effectifs à proximité', en: 'Nearby cohort counts' },
      cohortFlights: { fr: 'VOL', en: 'FLT', note: 'Short for flights; MIL, AIS and SITE read the same in French.' },
      nearest: { fr: 'LE PLUS PROCHE OBSERVÉ / CARTOGRAPHIÉ', en: 'NEAREST OBSERVED / MAPPED' },
      noExample: { fr: 'AUCUN EXEMPLE DISPONIBLE', en: 'NO AVAILABLE EXAMPLE' },
      uncertainty: {
        fr: 'ENTRÉES DISPONIBLES SEULEMENT · PAS UN FEU VERT',
        en: 'AVAILABLE INPUTS ONLY · NOT AN ALL-CLEAR',
        note: 'Says the count is what the feeds report, and that an empty panel proves nothing.',
      },
    },
    weather: {
      enable: { fr: 'Activer les effets météo du cockpit', en: 'Enable cockpit weather effects' },
      off: { fr: 'ÉTEINT', en: 'OFF' },
    },
    route: {
      plan: { fr: 'Plan de vol estimé', en: 'Estimated flight plan' },
      kicker: { fr: 'PLAN DE VOL ESTIMÉ', en: 'ESTIMATED FLIGHT PLAN' },
      unavailable: { fr: 'DONNÉES D’ITINÉRAIRE INDISPONIBLES', en: 'ROUTE DATA UNAVAILABLE' },
      from: { fr: 'DE', en: 'FROM' },
      to: { fr: 'VERS', en: 'TO' },
      unknown: { fr: 'INCONNU', en: 'UNKNOWN', note: 'Airport not resolved yet.' },
    },
    brief: {
      carousel: { fr: 'Carrousel de briefing du cockpit', en: 'Cockpit briefing carousel' },
      signals: { fr: 'SIGNAUX EN DIRECT', en: 'LIVE SIGNALS' },
      signalsSubtitle: { fr: 'ÉCHOS OBSERVÉS / CARTOGRAPHIÉS', en: 'OBSERVED / MAPPED PINGS' },
      controls: { fr: 'Commandes du briefing', en: 'Cockpit briefing controls' },
      previous: { fr: 'Page de briefing précédente', en: 'Previous briefing page' },
      next: { fr: 'Page de briefing suivante', en: 'Next briefing page' },
      cycleOff: { fr: 'DÉFILEMENT ÉTEINT', en: 'CYCLE OFF' },
      cycleTitle: {
        fr: 'Fait défiler les pages du briefing toutes les 9 secondes (Signaux → Actualités → Local). En pause tant que le pointeur ou le clavier est sur le panneau. Les signaux en direct se rafraîchissent dans tous les cas.',
        en: 'Cycle briefing pages automatically every 9 seconds (Signals → News → Local). Pauses while you hover or focus the panel. Live signal data refreshes continuously either way.',
      },
      collapse: { fr: 'Replier le panneau de briefing du cockpit', en: 'Collapse cockpit briefing panel' },
      collapseTitle: { fr: 'Replier le panneau de briefing', en: 'Collapse briefing panel' },
      signalsPage: { fr: 'Signaux en direct', en: 'Live signals' },
      newsPage: { fr: 'Dernières actualités régionales', en: 'Latest regional news' },
      newsAcquiring: { fr: 'RÉCUPÉRATION DES ACTUALITÉS RÉGIONALES', en: 'ACQUIRING REGIONAL NEWS' },
      localPage: { fr: 'Informations sur le lieu', en: 'Location-based information' },
      sourceNote: {
        fr: 'ÉVÉNEMENTS SOURCÉS · AUCUNE ACTUALITÉ SYNTHÉTIQUE',
        en: 'SOURCE-BACKED EVENTS · NO SYNTHETIC NEWS',
      },
      pages: { fr: 'Pages du briefing', en: 'Cockpit briefing pages' },
      showSignals: { fr: 'Afficher les signaux en direct', en: 'Show Live Signals' },
      showNews: { fr: 'Afficher les actualités régionales', en: 'Show Regional News' },
      showLocal: { fr: 'Afficher les infos locales', en: 'Show Local Info' },
      signalsTab: { fr: 'SIG', en: 'SIG', note: 'Tab of the briefing carousel; the abbreviation is the same word in French.' },
      newsTab: { fr: 'ACTU', en: 'NEWS' },
      localTab: { fr: 'LOCAL', en: 'LOCAL' },
    },
    local: {
      resolving: { fr: 'IDENTIFICATION DE LA RÉGION', en: 'RESOLVING REGION' },
      wind: { fr: 'VENT', en: 'WIND' },
      sky: { fr: 'CIEL', en: 'SKY' },
      unknown: { fr: 'INCONNU', en: 'UNKNOWN', note: 'Sky condition not published.' },
      precip: { fr: 'PRÉCIP', en: 'PRECIP' },
      credit: { fr: 'Données météo par Open-Meteo.com', en: 'Weather data by Open-Meteo.com' },
    },
    utility: {
      group: { fr: 'Affichage du cockpit et commandes Radio', en: 'Cockpit display and Radio controls' },
      display: { fr: 'AFFICHAGE', en: 'DISPLAY' },
      displayExpand: { fr: 'Déplier les options d’affichage du cockpit', en: 'Expand Cockpit display options' },
      displayOptions: { fr: 'Options d’affichage du cockpit', en: 'Cockpit display options' },
      radioExpand: { fr: 'Déplier les commandes Radio du cockpit', en: 'Expand Cockpit Radio controls' },
      radioCompact: { fr: 'Commandes Radio compactes du cockpit', en: 'Cockpit compact Radio controls' },
      radioVolume: { fr: 'Volume de la Radio du cockpit', en: 'Cockpit Radio volume' },
    },
    help: {
      exit: { fr: 'ÉCHAP QUITTER', en: 'ESC EXIT', note: 'Keyboard hint at the bottom of the cockpit.' },
      toggle: { fr: 'C BASCULER', en: 'C TOGGLE' },
    },
  },
  // The radio companion: the same three controls appear in the cockpit, in the
  // Context rail and in the full panel, so they share one group of keys.
  radio: {
    ready: { fr: 'PRÊTE', en: 'READY' },
    enable: { fr: 'ACTIVER', en: 'ENABLE' },
    previousStation: { fr: 'Station précédente parmi les stations filtrées', en: 'Previous filtered radio station' },
    playStation: { fr: 'Lire la station sélectionnée', en: 'Play selected radio station' },
    nextStation: { fr: 'Station suivante parmi les stations filtrées', en: 'Next filtered radio station' },
  },
  viewSwitcher: {
    nav: { fr: 'Changement de vue', en: 'View switcher' },
    resetCockpit: { fr: 'Réinitialiser le cockpit et revenir au globe entier', en: 'Reset cockpit to full globe view' },
    resetCockpitTitle: { fr: 'Quitter le cockpit et revenir au globe entier', en: 'Exit cockpit and return to full globe view' },
    reset: { fr: 'RÉINIT.', en: 'RESET' },
    exitCockpit: { fr: 'Quitter la vue cockpit', en: 'Exit cockpit view' },
    exitCockpitLabel: { fr: 'QUITTER LE COCKPIT', en: 'EXIT COCKPIT' },
  },
});
