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
      localKicker: { fr: 'INFOS LOCALES', en: 'LOCAL INFO' },
      localSubtitle: { fr: 'LIEU / CONDITIONS / POSITION', en: 'PLACE / CONDITIONS / POSITION' },
      localSource: { fr: 'OPENSTREETMAP · OPEN-METEO · UTC', en: 'OPENSTREETMAP · OPEN-METEO · UTC' },
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
      noir: { fr: 'Noir', en: 'Noir' },
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
  // ── the CCTV calibration chips ─────────────────────────────────────────
  cctv: {
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
