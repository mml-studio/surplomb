/**
 * Everything `src/ui.js` writes into the shell — see src/ui.js.
 *
 * `index.html` carries the shell's FIRST state (src/i18n/markup.i18n.js); this
 * catalog carries every state after it: the cockpit's readouts, the radio, the
 * cameras, the toasts, and the labels the panels rewrite as the reader acts.
 * Where a string exists in both files it is worded identically on purpose — a
 * button must not change its wording the first time it is pressed.
 *
 * Grouped the way the interface is: `cockpit.*`, `radio.*`, `cctv.*`,
 * `toast.*`, `actions.*`, `detection.*`, `legend.*`, `context.*`.
 */
import { defineMessages } from './i18n/messages.js';
import { countNoun } from './i18n/format.js';

export default defineMessages({
  cockpit: {
    // ── the briefing carousel ────────────────────────────────────────────
    brief: {
      cycleOffHelp: {
        fr: 'Fait défiler les pages du briefing toutes les 9 secondes (Signaux → Actualités → Local). En pause tant que le pointeur ou le clavier est sur le panneau. Les signaux en direct se rafraîchissent dans tous les cas.',
        en: 'Cycle briefing pages automatically every 9 seconds (Signals → News → Local). Pauses while you hover or focus the panel. Live signal data refreshes continuously either way.',
      },
      cycleOnHelp: {
        fr: 'Arrêter le défilement automatique. Précédent, Suivant et les onglets SIG/ACTU/LOCAL restent disponibles.',
        en: 'Stop automatic page cycling. Previous, Next, and the SIG/NEWS/LOCAL tabs stay available.',
      },
      cycleOn: { fr: 'DÉFILEMENT ACTIF', en: 'CYCLE ON' },
      cycleOff: { fr: 'DÉFILEMENT ÉTEINT', en: 'CYCLE OFF' },
      signalsKicker: { fr: 'SIGNAUX EN DIRECT', en: 'LIVE SIGNALS' },
      signalsSubtitle: { fr: 'ÉCHOS OBSERVÉS / CARTOGRAPHIÉS', en: 'OBSERVED / MAPPED PINGS' },
      signalsSource: { fr: 'ÉVÉNEMENTS SOURCÉS · AUCUNE ACTUALITÉ SYNTHÉTIQUE', en: 'SOURCE-BACKED EVENTS · NO SYNTHETIC NEWS' },
      newsKicker: { fr: 'ACTUALITÉS RÉGIONALES', en: 'REGIONAL NEWS' },
      newsSubtitle: { fr: 'DERNIERS ARTICLES SITUÉS ICI', en: 'LATEST LOCATION-MATCHED REPORTING' },
      newsSource: { fr: 'GOOGLE NEWS RSS · REQUÊTE PAR LIEU · RÉCENT', en: 'GOOGLE NEWS RSS · LOCATION QUERY · RECENT' },
      newsSourceGdeltOnly: {
        fr: 'GDELT · REQUÊTE PAR LIEU · RÉCENT',
        en: 'GDELT · LOCATION QUERY · RECENT',
        note: 'Regional News source line on a deployment that does not use Google News (GEV_NONCOMMERCIAL_SOURCES=off).',
      },
      localKicker: { fr: 'INFOS LOCALES', en: 'LOCAL INFO' },
      localSubtitle: { fr: 'LIEU / CONDITIONS / POSITION', en: 'PLACE / CONDITIONS / POSITION' },
      localSource: { fr: 'OPENSTREETMAP · OPEN-METEO · UTC', en: 'OPENSTREETMAP · OPEN-METEO · UTC' },
      localSubtitlePlaceOnly: {
        fr: 'LIEU / POSITION',
        en: 'PLACE / POSITION',
        note: 'Local Info page on a deployment without a weather source (GEV_NONCOMMERCIAL_SOURCES=off).',
      },
      localSourcePlaceOnly: {
        fr: 'OPENSTREETMAP · UTC',
        en: 'OPENSTREETMAP · UTC',
        note: 'Source line of the same page: the place comes from OpenStreetMap, the time is UTC.',
      },
      newsAcquiring: { fr: 'RÉCUPÉRATION DES ACTUALITÉS RÉGIONALES', en: 'ACQUIRING REGIONAL NEWS' },
      newsUnavailable: { fr: 'ACTUALITÉS RÉGIONALES INDISPONIBLES', en: 'REGIONAL NEWS UNAVAILABLE' },
      newsNoMatch: { fr: 'AUCUN ARTICLE RÉCENT SITUÉ ICI', en: 'NO RECENT LOCATION MATCHES' },
      regionResolving: { fr: 'IDENTIFICATION DE LA RÉGION', en: 'RESOLVING REGION' },
      regionUnavailable: { fr: 'RÉGION INDISPONIBLE', en: 'REGION UNAVAILABLE' },
      positionUnavailable: { fr: 'POSITION INDISPONIBLE', en: 'POSITION UNAVAILABLE' },
      source: { fr: 'SOURCE', en: 'SOURCE' },
      locationQuery: {
        fr: (place) => `${place} · REQUÊTE PAR LIEU`,
        en: (place) => `${place} · LOCATION QUERY`,
        sample: ['BORDEAUX'],
      },
      selectFlight: {
        fr: (label) => `Choisir le vol ${label}`,
        en: (label) => `Select flight ${label}`,
        sample: ['AF1234'],
      },
      previous: { fr: 'Page de briefing précédente', en: 'Previous briefing page' },
      next: { fr: 'Page de briefing suivante', en: 'Next briefing page' },
      collapse: { fr: 'Replier le panneau de briefing du cockpit', en: 'Collapse cockpit briefing panel' },
      expand: { fr: 'Déplier le panneau de briefing du cockpit', en: 'Expand cockpit briefing panel' },
      collapseTitle: { fr: 'Replier le panneau de briefing', en: 'Collapse briefing panel' },
      expandTitle: { fr: 'Déplier le panneau de briefing', en: 'Expand briefing panel' },
    },
    // ── times, headings and units the readouts print ─────────────────────
    timeUnknown: { fr: 'HEURE INCONNUE', en: 'TIME UNKNOWN' },
    minutesAgo: { fr: (n) => `IL Y A ${n} MIN`, en: (n) => `${n}M AGO`, sample: [12] },
    hoursAgo: { fr: (n) => `IL Y A ${n} H`, en: (n) => `${n}H AGO`, sample: [3] },
    daysAgo: { fr: (n) => `IL Y A ${n} J`, en: (n) => `${n}D AGO`, sample: [2] },
    directionUnknown: { fr: 'DIR INCONNUE', en: 'DIR UNKNOWN' },
    compass: {
      fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
      en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
      note: 'Eight points, clockwise from north. French writes O for west and S-O for south-west.',
    },
    // ── the aircraft and its route ───────────────────────────────────────
    callsignFallback: { fr: 'AVION', en: 'AIRCRAFT', note: 'Until the tracked aircraft gives a callsign.' },
    trackAcquired: { fr: 'SUIVI ACQUIS', en: 'TRACK ACQUIRED' },
    trackCourse: {
      fr: (label, heading) => `${label} · CAP ${heading}°`,
      en: (label, heading) => `${label} · COURSE ${heading}°`,
      sample: ['AF1234', '275'],
    },
    surfaceAcquiring: { fr: 'ACQUISITION DU SOL', en: 'ACQUIRING SURFACE' },
    surfaceFallback: { fr: 'SOL DE SECOURS', en: 'SURFACE FALLBACK' },
    staleFeed: { fr: 'FLUX EN RETARD', en: 'STALE FEED' },
    liveTrack: { fr: 'SUIVI EN DIRECT', en: 'LIVE TRACK' },
    military: { fr: 'MILITAIRE', en: 'MILITARY' },
    commercial: { fr: 'COMMERCIAL', en: 'COMMERCIAL' },
    aircraftMeta: {
      fr: (kind, feedState) => `${kind} · ${feedState} · CAP ALIGNÉ`,
      en: (kind, feedState) => `${kind} · ${feedState} · COURSE ALIGNED`,
      sample: ['COMMERCIAL', 'LIVE TRACK'],
    },
    route: {
      unknown: { fr: 'INCONNU', en: 'UNKNOWN', note: 'Airport not resolved.' },
      estimatedDirection: { fr: 'FLÈCHE · DIRECTION ESTIMÉE', en: 'ARROW · ESTIMATED DIRECTION' },
      unavailable: { fr: 'DONNÉES D’ITINÉRAIRE INDISPONIBLES', en: 'ROUTE DATA UNAVAILABLE' },
      destination: { fr: (bearing) => `DEST ${bearing}°`, en: (bearing) => `DEST ${bearing}°`, sample: ['275'] },
      show: { fr: 'AFFICHER L’ITINÉRAIRE', en: 'SHOW ROUTE' },
      hide: { fr: 'MASQUER L’ITINÉRAIRE', en: 'HIDE ROUTE' },
      hideTitle: {
        fr: 'Masquer le plan de vol estimé et revenir au suivi rapproché',
        en: 'Hide the estimated flight plan and return to the close follow view',
      },
      fitsTitle: {
        fr: (origin, destination) => `Reculer pour tenir ${origin} et ${destination} dans une seule vue`,
        en: (origin, destination) => `Pull back to hold ${origin} and ${destination} in one view`,
        sample: ['CDG', 'JFK'],
      },
      tooLongTitle: {
        fr: (origin, destination) => `${origin} → ${destination} est trop long pour une seule vue du globe — l’arc montre quand même par où il passe`,
        en: (origin, destination) => `${origin} → ${destination} is too long for one view of the globe — the arc still shows where it runs`,
        sample: ['CDG', 'SYD'],
      },
      originFallback: { fr: 'le départ', en: 'origin', note: 'Inside the “pull back to hold … and …” sentence.' },
      destinationFallback: { fr: 'l’arrivée', en: 'destination' },
      originCapitalized: { fr: 'Départ', en: 'Origin', note: 'Starts the “too long for one view” sentence.' },
    },
    tr3bRestore: { fr: 'Rendre l’avion réel', en: 'Restore real aircraft' },
    tr3bConvert: { fr: 'Reclasser en TR-3B', en: 'Reclassify as TR-3B' },
    // ── vision styles ────────────────────────────────────────────────────
    vision: {
      nightVision: { fr: 'Vision nocturne', en: 'Night vision' },
      thermal: { fr: 'Thermique', en: 'Thermal' },
      current: {
        fr: (name) => `Style de vision actuel : ${name}. Activer pour passer au suivant.`,
        en: (name) => `Current cockpit vision style: ${name}. Activate for next style.`,
        sample: ['NORMAL'],
      },
      currentTitle: {
        fr: (name) => `Style actuel : ${name} — cliquer pour le suivant`,
        en: (name) => `Current style: ${name} — click for next`,
        sample: ['NORMAL'],
      },
    },
    // ── weather effects ──────────────────────────────────────────────────
    weather: {
      enable: { fr: 'Activer les effets météo du cockpit', en: 'Enable cockpit weather effects' },
      disable: { fr: 'Éteindre les effets météo du cockpit', en: 'Disable cockpit weather effects' },
      on: { fr: 'ACTIF', en: 'ON' },
      off: { fr: 'ÉTEINT', en: 'OFF' },
    },
    // ── the contact panel ────────────────────────────────────────────────
    context: {
      standby: { fr: 'CONTEXTE EN VEILLE', en: 'CONTEXT STANDBY' },
      standbyBody: {
        fr: 'ACTIVER LE CONTEXTE GLOBAL POUR LES ÉCHOS DE PROXIMITÉ',
        en: 'ENABLE GLOBAL CONTEXT FOR PROXIMITY PINGS',
      },
      lost: { fr: 'CONTACT PERDU · DERNIER RELEVÉ CONNU · PAS UN FEU VERT', en: 'CONTACT LOST · LAST KNOWN READOUT · NOT AN ALL-CLEAR' },
      lostSubject: { fr: 'SUJET', en: 'SUBJECT' },
      lostSignal: {
        fr: (subject) => `CONTACT PERDU · ${subject}`,
        en: (subject) => `CONTACT LOST · ${subject}`,
        sample: ['AF1234'],
      },
      lostSignalBody: {
        fr: 'LE SUJET A QUITTÉ SON FLUX · LE RELEVÉ RESTE SUR LE DERNIER CONNU',
        en: 'SUBJECT LEFT ITS FEED · READOUT HOLDING LAST KNOWN',
      },
      noExample: { fr: 'AUCUN EXEMPLE DISPONIBLE', en: 'NO AVAILABLE EXAMPLE' },
      unavailable: { fr: 'Indisponible', en: 'Unavailable' },
      cohortUnavailable: {
        fr: (cohort) => `${cohort}, indisponible`,
        en: (cohort) => `${cohort}, Unavailable`,
        sample: ['Vols'],
      },
      nearest: {
        fr: (cohort, label) => `${cohort} · ${label}`,
        en: (cohort, label) => `${cohort} · ${label}`,
        sample: ['VOLS', 'AF1234'],
      },
      bearingUnknown: { fr: 'REL —', en: 'BRG —', note: 'Bearing relative to the aircraft’s nose; French says relèvement.' },
      ahead: { fr: 'DEVANT', en: 'AHEAD' },
      bearing: {
        fr: (side, degrees) => `${side} ${degrees}°`,
        en: (side, degrees) => `${side} ${degrees}°`,
        sample: ['D', '045'],
      },
      bearingLeft: { fr: 'G', en: 'L', note: 'Left of the nose: gauche.' },
      bearingRight: { fr: 'D', en: 'R', note: 'Right of the nose: droite.' },
      inputsUnknown: {
        fr: (count) => `${count} ENTRÉE${count === 1 ? '' : 'S'} INCONNUE${count === 1 ? '' : 'S'} · PAS UN FEU VERT`,
        en: (count) => `${count} INPUT${count === 1 ? '' : 'S'} UNKNOWN · NOT AN ALL-CLEAR`,
        sample: [2],
      },
      inputsCurrent: { fr: 'ENTRÉES DISPONIBLES À JOUR · PAS UN FEU VERT', en: 'AVAILABLE INPUTS CURRENT · NOT AN ALL-CLEAR' },
      inputsUnknownShort: {
        fr: (count) => `${count} ENTRÉE${count === 1 ? '' : 'S'} INCONNUE${count === 1 ? '' : 'S'}`,
        en: (count) => `${count} INPUT${count === 1 ? '' : 'S'} UNKNOWN`,
        sample: [2],
      },
      sourceStatusUnavailable: { fr: 'ÉTAT DES SOURCES INDISPONIBLE', en: 'SOURCE STATUS UNAVAILABLE' },
      distanceKm: { fr: (km) => `${km} KM`, en: (km) => `${km} KM`, sample: ['12.4'] },
      distanceUnknown: { fr: 'DISTANCE INCONNUE', en: 'DISTANCE UNKNOWN' },
      militaryFlight: { fr: 'VOL MILITAIRE', en: 'MILITARY FLIGHT' },
      commercialFlight: { fr: 'VOL COMMERCIAL', en: 'COMMERCIAL FLIGHT' },
      current: { fr: (kind) => `${kind} · ACTUEL`, en: (kind) => `${kind} · CURRENT`, sample: ['VOL MILITAIRE'] },
      collapse: { fr: 'Replier le panneau Contacts', en: 'Collapse Contact panel' },
      expand: { fr: 'Déplier le panneau Contacts', en: 'Expand Contact panel' },
      collapseTitle: { fr: 'Replier le panneau des contacts', en: 'Collapse contact panel' },
      expandTitle: { fr: 'Déplier le panneau des contacts', en: 'Expand contact panel' },
    },
    // ── local weather page ───────────────────────────────────────────────
    local: {
      windSpeed: { fr: (kmh) => `${kmh} KM/H`, en: (kmh) => `${kmh} KM/H`, sample: ['24'] },
      cloud: { fr: (percent) => `NUAGES ${percent} %`, en: (percent) => `CLOUD ${percent}%`, sample: ['40'] },
      cloudUnknown: { fr: 'NUAGES INCONNUS', en: 'CLOUD UNKNOWN' },
    },
    // ── the display and radio launchers ──────────────────────────────────
    utility: {
      displayCollapse: { fr: 'Replier les options d’affichage du cockpit', en: 'Collapse Cockpit display options' },
      displayExpand: { fr: 'Déplier les options d’affichage du cockpit', en: 'Expand Cockpit display options' },
      radioCollapse: { fr: 'Replier les commandes Radio du cockpit', en: 'Collapse Cockpit Radio controls' },
      radioExpand: { fr: 'Déplier les commandes Radio du cockpit', en: 'Expand Cockpit Radio controls' },
    },
  },
  // ── the radio companion ────────────────────────────────────────────────
  //
  // Three surfaces share these strings — the full panel, the compact controls
  // in the Context header, and the cockpit's own popover — so a control never
  // changes its wording depending on where it is pressed.
  radio: {
    channel: {
      fr: (index, total) => `CH ${index} / ${total}`,
      en: (index, total) => `CH ${index} / ${total}`,
      sample: ['03', '42'],
      note: 'The tuner’s readout: channel index over the number of stations in the band.',
    },
    noStations: { fr: 'AUCUNE STATION', en: 'NO STATIONS' },
    noStationAvailable: { fr: 'AUCUNE STATION DISPONIBLE', en: 'NO STATION AVAILABLE' },
    tunerValueText: {
      fr: (name, index, total) => `${name}, station ${index} sur ${total}`,
      en: (name, index, total) => `${name}, station ${index} of ${total}`,
      sample: ['FIP', 3, 42],
    },
    noStationValueText: { fr: 'Aucune station disponible', en: 'No station available' },
    offAir: { fr: 'HORS ANTENNE', en: 'OFF AIR' },
    stationUnavailable: { fr: 'STATION INDISPONIBLE', en: 'STATION UNAVAILABLE' },
    stationUnavailableAfterRefresh: {
      fr: 'Station indisponible après rafraîchissement de l’annuaire',
      en: 'Station unavailable after directory refresh',
    },
    goToExpanded: { fr: 'Aller à la section Radio dépliée', en: 'Go to expanded Radio section' },
    expandInContext: { fr: 'Déplier la section Radio dans Contexte', en: 'Expand Radio section in Context' },
    closeCompact: { fr: 'Fermer les commandes Radio compactes', en: 'Close compact Radio controls' },
    openCompact: { fr: 'Ouvrir les commandes Radio compactes', en: 'Open compact Radio controls' },
    uncertain: { fr: 'INCERTAIN', en: 'UNCERTAIN' },
    sync: { fr: 'SYNC', en: 'SYNC' },
    off: { fr: 'ÉTEINTE', en: 'OFF' },
    reconcile: { fr: 'RÉCONCILIER', en: 'RECONCILE' },
    disable: { fr: 'ÉTEINDRE', en: 'DISABLE' },
    enable: { fr: 'ACTIVER', en: 'ENABLE' },
    reconcileAria: { fr: 'Réconcilier la Radio — cycle de vie incertain', en: 'Reconcile Radio — lifecycle uncertain' },
    disableAria: { fr: 'Éteindre la Radio', en: 'Disable Radio' },
    enableAria: { fr: 'Activer la Radio', en: 'Enable Radio' },
    directoryBand: { fr: 'BANDE DE L’ANNUAIRE', en: 'DIRECTORY BAND' },
    band: { fr: (name) => `BANDE ${name}`, en: (name) => `${name} BAND`, sample: ['JAZZ'] },
    noStationSelected: { fr: 'AUCUNE STATION SÉLECTIONNÉE', en: 'NO STATION SELECTED' },
    metadataOnly: { fr: 'Métadonnées d’annuaire seulement', en: 'Directory metadata only' },
    loadingDirectory: { fr: 'Chargement de l’annuaire…', en: 'Loading station directory…' },
    chooseMarker: { fr: 'Choisissez un repère sur le globe ou passez à la suivante.', en: 'Choose a globe marker or use next.' },
    tags: { fr: (tags) => `ÉTIQUETTES · ${tags}`, en: (tags) => `TAGS · ${tags}`, sample: ['jazz · news'] },
    pause: { fr: 'Pause', en: 'Pause' },
    resume: { fr: 'Reprendre', en: 'Resume' },
    play: { fr: 'Lire', en: 'Play' },
    playSelected: {
      fr: (action) => `${action} la station sélectionnée`,
      en: (action) => `${action} selected radio station`,
      sample: ['Lire'],
    },
    playNearest: {
      fr: (action) => `${action} la station la plus proche`,
      en: (action) => `${action} nearest radio station`,
      sample: ['Lire'],
    },
    stateUncertain: { fr: 'ÉTAT RADIO INCERTAIN', en: 'RADIO STATE UNCERTAIN' },
    syncingDirectory: { fr: 'SYNCHRONISATION DE L’ANNUAIRE', en: 'SYNCING DIRECTORY' },
    ready: { fr: 'RADIO PRÊTE', en: 'RADIO READY' },
    syncingShort: { fr: 'SYNCHRO', en: 'SYNCING' },
    readyShort: { fr: 'PRÊTE', en: 'READY' },
    // The playback line is one sentence plus up to four appended clauses,
    // each of which is a fact of its own; they are separate messages because
    // they combine, never because a sentence was cut up.
    directoryStaleDegraded: { fr: ' · annuaire périmé et dégradé', en: ' · stale/degraded directory' },
    directoryDegraded: { fr: ' · annuaire dégradé', en: ' · degraded directory' },
    directoryStale: { fr: ' · annuaire périmé', en: ' · stale directory' },
    outsideFilter: { fr: ' · hors du filtre actuel', en: ' · outside current filter' },
    playbackReady: { fr: 'Prête — la lecture ne part que de votre geste', en: 'Ready — playback starts only from your action' },
    playbackOff: { fr: 'Radio éteinte', en: 'Radio off' },
    playbackConnecting: { fr: 'Connexion directe au diffuseur…', en: 'Connecting directly to broadcaster…' },
    playbackBuffering: { fr: 'Mise en mémoire du flux du diffuseur…', en: 'Buffering broadcaster stream…' },
    playbackPlaying: { fr: (station) => `Lecture de ${station}`, en: (station) => `Playing ${station}`, sample: ['FIP'] },
    playbackPaused: { fr: (station) => `${station} en pause`, en: (station) => `Paused ${station}`, sample: ['FIP'] },
    playbackStation: { fr: 'la station', en: 'station', note: 'Stands in when the station has no name.' },
    playbackError: { fr: 'Flux du diffuseur indisponible', en: 'Broadcaster stream unavailable' },
    voiceDucked: { fr: ' · coupée pendant la voix', en: ' · muted during voice interaction' },
    voiceRestoring: { fr: ' · volume rétabli après la voix', en: ' · restoring volume after voice' },
    tuningStaticError: { fr: ' · le souffle indique qu’aucun son n’arrive', en: ' · static indicates no broadcaster audio' },
    tuningStatic: { fr: ' · souffle d’accord jusqu’au démarrage du diffuseur', en: ' · tuning static until broadcaster starts' },
    tuningUnavailable: {
      fr: 'Station indisponible après rafraîchissement de l’annuaire — choisissez-en une autre',
      en: 'Station unavailable after directory refresh — choose another channel',
    },
    enabling: { fr: 'La Radio s’allume…', en: 'Radio is enabling…' },
    disabling: { fr: 'La Radio s’éteint…', en: 'Radio is disabling…' },
    lifecycleUncertain: {
      fr: 'Cycle de vie de la Radio incertain — utilisez Activer ou Éteindre pour réconcilier',
      en: 'Radio lifecycle is uncertain — use Enable or Disable to reconcile',
    },
    fallback: { fr: 'Prête', en: 'Ready', note: 'Last resort when no state matched.' },
    expandPanel: { fr: 'Déplier la Radio', en: 'Expand Radio' },
    collapsePanel: { fr: 'Replier la Radio', en: 'Collapse Radio' },
    expandSection: { fr: 'Déplier la section Radio', en: 'Expand Radio section' },
    collapseSection: { fr: 'Replier la section Radio', en: 'Collapse Radio section' },
    couldNot: {
      fr: (action) => `La Radio n’a pas pu ${action} proprement`,
      en: (action) => `Radio could not ${action} cleanly`,
      sample: ['start'],
    },
    start: { fr: 's’allumer', en: 'start' },
    stop: { fr: 's’éteindre', en: 'stop' },
  },
  // ── what the globe says in a toast or a status chip ────────────────────
  toast: {
    panelLayoutReset: {
      fr: 'Disposition des panneaux mise à jour — positions remises aux nouveaux réglages',
      en: 'Panel layout updated — positions reset to new defaults',
    },
    noSelectedLayers: { fr: 'Aucune couche sélectionnée', en: 'No selected data layers' },
    notCleared: {
      fr: (count) => `${count} couche${count === 1 ? '' : 's'} n’a${count === 1 ? '' : 'ont'} pas pu être éteinte${count === 1 ? '' : 's'}`,
      en: (count) => `${count} data layer${count === 1 ? '' : 's'} could not be cleared`,
      sample: [2],
    },
    cleared: {
      fr: (count) => `${count} couche${count === 1 ? '' : 's'} éteinte${count === 1 ? '' : 's'}`,
      en: (count) => `Cleared ${count} data layer${count === 1 ? '' : 's'}`,
      sample: [3],
    },
    clearFailed: { fr: 'Les couches sélectionnées n’ont pas pu être éteintes', en: 'Selected data layers could not be cleared' },
    linkCopied: { fr: 'Lien copié !', en: 'Link copied!' },
    copyFailed: { fr: 'La copie a échoué', en: 'Copy failed' },
    locationNotFound: { fr: 'Lieu introuvable', en: 'Location not found' },
    searchFailed: { fr: 'La recherche a échoué', en: 'Search failed' },
    flyToPoiFirst: { fr: 'Volez d’abord vers un point de repère', en: 'Fly to a POI first' },
    cctvCalibrationSaved: { fr: 'Calibrage de la caméra enregistré', en: 'CCTV calibration saved' },
    cctvCalibrationReset: { fr: 'Calibrage de la caméra réinitialisé', en: 'CCTV calibration reset' },
    cctvUnavailable: { fr: 'Couche Caméras indisponible', en: 'CCTV layer unavailable' },
    layerBlocked: {
      fr: 'Cette couche est indisponible dans le mode Contexte actuel',
      en: 'That layer is unavailable in the current Context mode',
    },
    layerFailed: {
      fr: (layerId, action) => `${layerId} n’a pas pu ${action} proprement`,
      en: (layerId, action) => `${layerId} could not ${action} cleanly`,
      sample: ['flights', 'start'],
    },
    layerStart: { fr: 's’allumer', en: 'start' },
    layerStop: { fr: 's’éteindre', en: 'stop' },
    contactsFailed: {
      fr: 'Contacts n’a pas pu terminer la transition demandée ; réessayez',
      en: 'Contacts could not complete the requested transition; try again',
    },
    missionsFailed: {
      fr: 'Missions spatiales n’a pas pu terminer la transition demandée ; réessayez',
      en: 'Space Missions could not complete the requested transition; try again',
    },
    contextFailed: {
      fr: 'Contexte n’a pas pu restaurer toutes les couches ; réessayez',
      en: 'Context could not restore every layer; try again',
    },
    reload: { fr: 'RECHARGER', en: 'RELOAD' },
    cancel: { fr: 'ANNULER', en: 'CANCEL' },
  },
  // ── a shared view that is still being restored ─────────────────────────
  share: {
    acquiring: { fr: 'ACQUISITION', en: 'ACQUIRING' },
    acquiringSubject: { fr: (subject) => `PARTAGÉ ${subject}`, en: (subject) => `SHARED ${subject}`, sample: ['AF1234'] },
    subjectFallback: { fr: 'SUJET', en: 'SUBJECT' },
    entityFallback: { fr: 'objet', en: 'entity' },
    followExpired: {
      fr: (subject) => `Le suivi partagé de ${subject} a expiré`,
      en: (subject) => `Shared ${subject} follow expired`,
      sample: ['AF1234'],
    },
    feedUnavailable: {
      fr: (subject) => `${subject} n’a pas pu être restauré — flux indisponible`,
      en: (subject) => `Shared ${subject} could not be restored — feed unavailable`,
      sample: ['AF1234'],
    },
    unavailable: {
      fr: (subject) => `${subject} partagé est indisponible`,
      en: (subject) => `Shared ${subject} is unavailable`,
      sample: ['AF1234'],
    },
  },
  // ── the globe's own actions ────────────────────────────────────────────
  actions: {
    clearingLayers: { fr: 'Extinction des couches sélectionnées', en: 'Clearing selected data layers' },
    clearLayers: { fr: 'Éteindre les couches sélectionnées', en: 'Clear selected data layers' },
    resetGlobe: { fr: 'Revenir au globe entier', en: 'Reset to full globe view' },
    resetCockpit: { fr: 'Réinitialiser le cockpit et revenir au globe entier', en: 'Reset cockpit to full globe view' },
    resettingGlobe: { fr: 'Retour au globe entier…', en: 'Resetting to full globe view' },
    resettingCockpit: { fr: 'Retour du cockpit au globe entier…', en: 'Resetting cockpit to full globe view' },
    aroundMe: { fr: 'Autour de moi', en: 'Around me', note: 'The label the LOCATION readout keeps after a geolocation flight.' },
    orbit: { fr: 'ORBITE', en: 'ORBIT' },
  },
  // ── the detection overlay ──────────────────────────────────────────────
  detection: {
    overlay: {
      fr: (mode) => `Surcouche de détection : ${mode}`,
      en: (mode) => `Detection overlay: ${mode}`,
      sample: ['dense'],
    },
    overlayOff: { fr: 'Surcouche de détection : éteinte', en: 'Detection overlay: off' },
    sparse: { fr: 'ÉPARSE', en: 'SPARSE' },
    balanced: { fr: 'ÉQUILIBRÉE', en: 'BALANCED' },
    dense: { fr: 'DENSE', en: 'DENSE' },
    detect: { fr: 'DÉTECT', en: 'DETECT' },
  },
  // ── the map key when a sensor pass is repainting the frame ─────────────
  legend: {
    keyInvalid: {
      fr: (style) => `${style} repeint toute l’image — les couleurs ci-dessous ne correspondent plus à la carte. Revenez à NORMAL pour lire la légende.`,
      en: (style) => `${style} repaints the whole frame — the colours below no longer match the map. Return to NORMAL to read the key.`,
      sample: ['FLIR'],
    },
  },
  // ── the celestial ring ─────────────────────────────────────────────────
  celestial: {
    reveal: { fr: 'Anneau céleste — révéler le globe entier', en: 'Celestial ring — reveal the full globe' },
    normalOnly: { fr: 'Anneau céleste — disponible dans le style Normal', en: 'Celestial ring — available in Normal style' },
  },
  // ── panels ─────────────────────────────────────────────────────────────
  panel: {
    fallbackName: { fr: 'panneau', en: 'panel', note: 'When a panel has no visible title to name.' },
    collapseNamed: {
      fr: (name) => `Replier ${name}`,
      en: (name) => `Collapse ${name}`,
      sample: ['LAYERS'],
      note: 'The name is the panel’s own heading, already in the page’s language.',
    },
    expandNamed: { fr: (name) => `Déplier ${name}`, en: (name) => `Expand ${name}`, sample: ['LAYERS'] },
  },
  // ── the public cameras ─────────────────────────────────────────────────
  cctv: {
    fallbackTitle: { fr: 'CAMÉRA', en: 'CCTV', note: 'Lightbox title when the camera has no name of its own.' },
    sourceUnknown: { fr: 'SOURCE · INCONNUE', en: 'SOURCE · UNKNOWN' },
    frameLoading: { fr: 'IMAGE · CHARGEMENT', en: 'FRAME · LOADING' },
    frameUnavailable: { fr: 'IMAGE · INDISPONIBLE', en: 'FRAME · UNAVAILABLE' },
    adjustOn: { fr: 'RÉGLAGE ACTIF', en: 'ADJUST ON' },
    adjust: { fr: 'RÉGLER', en: 'ADJUST' },
    on: { fr: 'CAMÉRAS ACTIVES', en: 'CCTV ON' },
    off: { fr: 'CAMÉRAS ÉTEINTES', en: 'CCTV OFF' },
    viewshedOn: { fr: 'CHAMP DE VUE ACTIF', en: 'VIEWSHED ON', note: 'Third state of the coverage button: the volume each camera actually sees.' },
    coverageOn: { fr: 'COUVERTURE ACTIVE', en: 'COVERAGE ON' },
    coverageOff: { fr: 'COUVERTURE ÉTEINTE', en: 'COVERAGE OFF' },
    autoHopOn: { fr: 'SAUT AUTO ACTIF', en: 'AUTO HOP ON' },
    autoHopOff: { fr: 'SAUT AUTO ÉTEINT', en: 'AUTO HOP OFF' },
    projectionOn: { fr: 'PROJECTION ACTIVE', en: 'PROJECTION ON' },
    projectionOff: { fr: 'PROJECTION ÉTEINTE', en: 'PROJECTION OFF' },
    calEdited: { fr: 'CAL · MODIFIÉ (NON ENREGISTRÉ)', en: 'CAL · EDITED (UNSAVED)' },
    calBadge: { fr: (badge) => `CAL · ${badge}`, en: (badge) => `CAL · ${badge}`, sample: ['CALIBRATED'] },
    badgeCalibrated: { fr: 'CALIBRÉE', en: 'CALIBRATED' },
    badgeCurated: { fr: 'VÉRIFIÉE', en: 'CURATED', note: 'Pose checked by hand at the catalog, not measured on site.' },
    badgeRawPrior: { fr: 'POSE BRUTE', en: 'RAW PRIOR' },
    configuredSource: { fr: 'Source configurée', en: 'Configured Source' },
    loadedClick: {
      fr: (count) => `${count} caméras sur la carte · cliquez-en une pour voir son image`,
      en: (count) => `${count} cameras on the map · click one to see its picture`,
      sample: [128],
    },
    // The panel in plain words (2026-09-23): what the picture is, who
    // publishes it, and whether the cone's direction is real. Pose numbers
    // and CAL badges stay out of sight.
    live: { fr: 'EN DIRECT', en: 'LIVE', note: 'Badge over a still the camera re-publishes about once a minute.' },
    timelapseBadge: { fr: 'ACCÉLÉRÉ', en: 'TIMELAPSE', note: 'Badge while the panel plays the recorded last hour.' },
    streetView: {
      fr: 'STREET VIEW · PAS D’IMAGE PUBLIQUE',
      en: 'STREET VIEW · NO PUBLIC FEED',
      note: 'The camera publishes no picture; Google Street View shows the place instead.',
    },
    osmProvider: { fr: 'Repérée sur OpenStreetMap', en: 'Mapped on OpenStreetMap' },
    directionKnown: { fr: 'direction connue', en: 'known direction' },
    directionUnknown: { fr: 'direction inconnue (cône en pointillé)', en: 'unknown direction (dashed cone)' },
    plainMeta: {
      fr: (provider, direction) => `${provider} · ${direction}`,
      en: (provider, direction) => `${provider} · ${direction}`,
      sample: ['Métropole de Lyon (Criter)', 'direction connue'],
    },
    timelapsePlay: { fr: 'Lire l’accéléré', en: 'Play the timelapse' },
    timelapsePause: { fr: 'Mettre l’accéléré en pause', en: 'Pause the timelapse' },
    timelapseReady: {
      fr: (minutes, count) => `${minutes >= 55 ? 'La dernière heure' : `Les ${countNoun(minutes, 'dernière minute', 'dernières minutes')}`} en accéléré · ${countNoun(count, 'image', 'images')}`,
      en: (minutes, count) => `${minutes >= 55 ? 'The last hour' : `The last ${countNoun(minutes, 'minute', 'minutes')}`} sped up · ${countNoun(count, 'frame', 'frames')}`,
      sample: [60, 58],
    },
    timelapseBuilding: {
      fr: (count, from) => (count
        ? `Accéléré en préparation : ${countNoun(count, 'image', 'images')} depuis ${from}`
        : 'Accéléré en préparation : première image dans une minute'),
      en: (count, from) => (count
        ? `Timelapse building: ${countNoun(count, 'frame', 'frames')} since ${from}`
        : 'Timelapse building: first frame within a minute'),
      sample: [3, '11:23'],
    },
    timelapseLoading: {
      fr: (loaded, total) => `Chargement de l’accéléré… ${loaded}/${total}`,
      en: (loaded, total) => `Loading the timelapse… ${loaded}/${total}`,
      sample: [12, 60],
    },
    loadedEnable: {
      fr: (count) => `${count} caméras chargées · activez les caméras pour en choisir une`,
      en: (count) => `${count} cameras loaded · enable CCTV to activate`,
      sample: [128],
    },
    enableToLoad: {
      fr: 'Activez les caméras pour charger les carrefours équipés',
      en: 'Enable CCTV to load camera intersections',
    },
    cal: {
      heading: { fr: 'CAP', en: 'HDG' },
      pitch: { fr: 'TANGAGE', en: 'PITCH' },
      fov: { fr: 'CHAMP', en: 'FOV' },
      range: { fr: 'PORTÉE', en: 'RANGE' },
      height: { fr: 'HAUT', en: 'HGT' },
      north: { fr: 'ΔN', en: 'ΔN' },
      east: { fr: 'ΔE', en: 'ΔE' },
    },
  },
});
