# KNOWN ISSUES

Updated: September 17, 2026

This file tracks active runtime issues only.

This file records current known issues; historical planning material is not part
of the public release.

---

## Open

### What the phone shell does not carry, and why each one was left out
Status: Intentional, decided 2026-09-16 with the phone shell (volet C)

The phone shell (`phone.css`, `src/phoneSheet.js`) is a **selection**, not a
scaled-down desktop. These are the deliberate holes, each with the reason it is
a hole rather than a bug, so nobody re-opens them by accident:

- **CCTV is hidden entirely.** Its preview frame and its calibration form are
  one panel (`#cctv-panel`), and showing one without the other is a rewrite of
  the panel, not a layout rule. A phone reader gets no camera frames.
- **Cockpit, the scene director, RADIO, DISPLAY, the visual presets, the intel
  HUD, the heading tape and the safe-frame overlay are hidden.** Every one is an
  instrument whose value scales with the room it has; a 390 px column spends its
  room on the globe and the four sheet tabs.
- **The voice cost-tier chip is hidden.** It is a 25 × 12 px switch beside a
  dollar estimate — an instrument for whoever is watching the bill. The tier
  keeps its default; the voice session on iOS is a separate piece of work.
- **The sheet adopts its four panels once, for the session.** `data-shell` is
  resolved from `min(innerWidth, innerHeight)` and a rotation cannot change it,
  so there is no path back to the desktop shell mid-session — and therefore no
  code defending one.
- **Foldables are out of scope.** A device that changes its smaller dimension at
  runtime keeps whichever shell it booted with.
- **A tablet in landscape under 600 px of height** (a rare, very wide window)
  reads as a phone. The threshold is one number on purpose; see
  `src/inputMode.js`.

---

### The ANFR observatoire CSV published on 2026-09-03 is a header and nothing else
Status: Open (upstream), measured 2026-09-09

Context:
- `pickAnfrObservatoire` resolves the catalogue's `file_csv` to
  `https://data.anfr.fr/sites/default/files/dataset/20260903183444_observatoireod_20260903.csv`.
  A `HEAD` on that URL answers **`content-length: 222`** — the 22-column header
  row, no data rows at all.
- The catalogue still advertises `records_count` **826 931** for the resource,
  so the proxy logs `[ANFR Proxy] observatoire short: 0/826931 rows` and caches
  an empty register. `src/data/fixtures/anfr-observatoire-sample.json` records
  the same file on 2026-08-27 at **181 988 412 bytes / 826 418 rows**, so this
  is a regression in the publication, not in the reader.

Consequences in runtime:
- `Antennes mobiles` (folded into the `Infrastructure numérique` row) draws
  nothing anywhere, and `/api/anfr-fr/supports` answers `count: 0` for every
  box.
- The address radiography prints "Le registre ANFR est vide dans cette édition"
  rather than "0 supports", because an empty register is a fact about the
  register and never about the address (`projectAntennes`).

Nothing to fix here: the reader is correct and the cache is short (6 h), so a
republished file is picked up on its own.

---


### Street traffic can be slow/uneven when panning across dense city blocks
Status: Open (partially mitigated)

Context:
- Current traffic loader fetches one clamped viewport tile at a time (major pass, then full pass).
- In dense cores, some visible roads can appear late after city jumps or fast pans.
- Zooming into adjacent streets does not always immediately trigger higher-detail coverage for all visible roads.

Current mitigation in runtime:
- Fair per-road dot budget allocation (reduces hard starvation under global `MAX_DOTS` cap).
- Center-shift threshold (reduces stale overlap lock while panning).

Next iteration candidates:
- Prioritize currently visible road segments inside the active viewport before off-center segments.
- Add neighbor prefetch ring for nearby tiles after jump-to-city actions.
- Add adaptive dot cap by frame time (coverage first, density second).
- Promote sync chip from loading indicator to true multi-phase progress.

---

### CCTV panel can appear "missing" after layout refactors
Status: Open (workaround available)

Context:
- Panel positions are persisted in local storage and can restore off-screen after UI changes.

Workaround:
- In browser console:
  - `localStorage.removeItem('godsEyeView.v6.panelPos.cctv-panel');`
  - `localStorage.removeItem('godsEyeView.v6.panelCollapsed.cctv-panel');`
  - `location.reload();`

Related keys (current versions):
- Panel positions: `godsEyeView.v7.panelPos.<panel-id>` (re-versioned 2026-06-10)
- Panel collapsed state: `godsEyeView.v6.panelCollapsed.<panel-id>`
- CCTV calibration: `godsEyeView.cctv.calibration.v2`

---

### Height-datum residuals
Status: Open (accepted 2026-07-08, documented)

- **Cold-start floor latency:** at a freshly-visited airport, grounded/low aircraft
  float low for ~1–2 poll cycles (30–60 s) and rise as terrain floors resolve;
  a few stragglers take one more poll.
- **Born-grounded first poll:** a contact first seen on the ground with no altitude
  data renders at the geoid for ≤1 poll until its floor cell warms.
- Full context, improvement ideas, and the verification oracle
  (`scripts/qa-floor-verify.mjs`):
  the height-datum section in `docs/CURRENT-STATE.md`.

---

### Le tilt à deux doigts est délié, et c'est une décision
Status: Intentional, décidé 2026-09-16 avec le volet tactile

Le pincement de Cesium fait zoom **et** tangage en même temps, sans zone morte.
Deux doigts pas tout à fait parallèles font donc pivoter la caméra pendant qu'on
s'approche d'une rue, et rien dans la coquille téléphone ne permet d'y revenir.
`src/touchCamera.js` vide `tiltEventTypes` ; le tangage reste accessible par les
presets de vue, et une ligne le remet si les testeurs le réclament.

Conséquence, depuis le 2026-09-17 : l'angle d'arrivée est celui que le lecteur
garde. Un téléphone arrive donc toujours à la verticale, nord en haut
(`src/topDownView.js`) — démarrage, « Autour de moi », lieux, recherche, feu ou
navire cliqué. Deux exceptions : un lien partagé restaure l'angle de son auteur,
et le travelling d'itinéraire comme l'orbite gardent le leur.

Ce que la coquille téléphone ne porte pas — CCTV, cockpit, scène, radio,
DISPLAY, presets visuels, pliables, tablette en paysage sous 600 px — est listé
en tête de ce document, avec la raison de chaque trou.

### Un lien partagé depuis « Autour de moi » révèle où était le lecteur
Status: Open (par construction), livré 2026-09-16

Contexte :
- Le bouton « Autour de moi » vole la caméra sur la position de l'appareil,
  puis `flushHash()` réécrit l'adresse depuis cette caméra — c'est ce qui
  permet à un rechargement de revenir au même endroit. Conséquence directe :
  **le lien copié ou partagé ensuite contient la position**, à quelques
  centaines de mètres près.
- Ce n'est pas un défaut à corriger en silence : c'est le comportement de
  n'importe quelle carte, et le lien ne part que si le lecteur le demande.
  C'est écrit ici pour que personne ne le redécouvre comme une fuite.
- Aucun `watchPosition` : un seul relevé par appui, jamais de suivi continu.

### Trente-sept couches gardent la tolérance de clic de Cesium sur un doigt
Status: Open (borné, sûr dans ce sens), mesuré 2026-09-16

Contexte :
- `ScreenSpaceEventHandler` n'émet `LEFT_CLICK` au relâchement tactile que si
  la distance en ligne droite depuis le contact initial tient dans
  `_clickPixelTolerance` (5 px). Un tap tremblant au-delà **n'arrive jamais**
  jusqu'au comptage de geste.
- Les trois couches qui passent par `bindTrackingClickGesture` (vols civils,
  vols militaires, CCTV) montent cette tolérance à 10 px sous pointeur
  grossier. Les ~37 autres installent leur propre gestionnaire et gardent les
  5 px : un tap tremblant y est **perdu**.
- C'est le sens sûr de la panne : rien n'est sélectionné, et surtout rien n'est
  DÉSÉLECTIONNÉ. Migrer les 37 est un chantier à part.

### Deux choses que le harnais téléphone ne peut pas mesurer
Status: Open (limite de l'outil), mesuré 2026-09-16

Contexte :
- **`-webkit-touch-callout`** est une propriété WebKit : Chromium la jette à
  l'analyse, donc `getComputedStyle` répond `''` quelle que soit la feuille.
  `qa:phone-touch` mesure la moitié qu'il peut (`user-select: none`) et la
  déclaration elle-même est épinglée par
  `src/data/trackingClickGesture.test.mjs`, qui lit `style.css`.
- **« Le tap a sélectionné la borne »** est improuvable en headless : aucune
  entité Cesium ne s'y peint et `scene.pick` ne répond rien pour le globe nu
  sous SwiftShader. Le seam publie donc ses propres nombres
  (`getPickDiagnostics()`), et la sélection est épinglée par
  `src/data/pickAt.test.mjs`.

### À vérifier sur un appareil réel avant de considérer le tactile fini
Status: Open (checklist), ouverte 2026-09-16

Rien de ce qui suit n'est mesurable depuis un Mac. Un iPhone (Safari 17) et un
Android (Chrome) doivent cocher :
- la voix **parle**, et dans quel haut-parleur — iOS route souvent l'audio
  WebRTC vers l'écouteur quand le micro est capté ;
- le prompt `getUserMedia` apparaît bien après l'`await import()` du chargeur
  paresseux, et la permission persiste d'une session à l'autre ;
- la session vocale se coupe quand l'app passe en arrière-plan, et le point
  d'enregistrement s'éteint avec elle ;
- un appui long sur le globe ne fait apparaître ni menu contextuel ni loupe ;
- `(pointer: coarse)` sur un iPad **avec trackpad** répond bien `fine` ;
- le ressenti du pincement (`zoomFactor` 15) et des inerties (0,85 / 0,7 / 0,6) ;
- la touche de retour du clavier logiciel affiche bien « rechercher » ;
- la feuille `navigator.share` s'ouvre et le lien rouvre au même endroit ;
- le prompt de géolocalisation iOS, et « Autour de moi » qui atterrit.

### Une seconde requête `/api/geoid` part avant que la caméra ne soit posée
Status: Open (mineur, antérieur au travail téléphone), mesuré 2026-09-16

Contexte :
- Sur **tout** appareil, le premier tic du HUD lit la caméra avant le `setView`
  d'ouverture et demande `/api/geoid?lat=35.15&lon=-82.5` — la position de
  départ de Cesium, en Caroline du Nord. La cellule est mise en cache et ne
  resservira jamais.
- Coût : un aller-retour `/api` par chargement, sur la connexion où il coûte le
  plus cher. C'est la moitié du budget d'un boot téléphone (2 appels sur 2).
- Non corrigé ici : la correction est dans `src/hud.js`, pas dans le périmètre
  du volet A.

### La carte de première visite pilote la recherche du globe, pas la fiche
Status: Open (décision produit à prendre), constaté 2026-09-17

Contexte :
- Le champ de la variante A (« Qu’est-ce qui est vrai à cette adresse ? »)
  vole sur le globe par `styleManager.flyToAddress`, puis allume
  `dvf-sales`, `ads-fr` et `dpe-fr` à l’arrivée.
- La radiographie d’adresse — dix thématiques, imprimable — vit dans
  `fiche.html`. Depuis le globe, sa seule porte est la pastille RADIOGRAPHIE
  de la ligne « Fiche implantation » (`implantation-fr`,
  `src/data/ficheSheet.js`) : la carte ne l’allume pas et ne la mentionne pas.
  `fiche.html?q=` accepterait pourtant le texte tapé tel quel.

Conséquences à l’exécution :
- Un visiteur qui tape une adresse voit trois couches autour du point, pas la
  fiche de cette adresse : la question du titre reçoit une réponse en
  morceaux, sur la carte.
- Rien ne lui apprend que la fiche existe tant qu’il n’a pas trouvé la ligne
  « Fiche implantation » dans le panneau des couches.

### Le test A/B de la carte de bienvenue se lit à la main dans un JSONL : pas d’outil d’analyse produit
Status: Open (backlog), décidé 2026-09-17

Contexte :
- La carte de premier lancement se teste en A/B/C sur surplomb.app dès que
  `GEV_FIRST_RUN_AB=A,B,C` est posé (éteint par défaut). Le puits est
  volontairement minimal : `POST /api/first-run/events` (`vite.config.js`,
  `firstRunAbPlugin`) ajoute une ligne par rapport dans
  `.gev-cache/first-run-ab/events-YYYY-MM-DD.jsonl`, et
  `scripts/first-run-ab-report.mjs` imprime les totaux par variante, les
  intervalles de Wilson, un test z contre A, la taille d’échantillon manquante
  et la règle d’arrêt. Rien d’autre.
- Décision du mainteneur (2026-09-17) : PostHog viendra plus tard. Ne pas
  l’intégrer dans la PR du test.

Conséquences à l’exécution :
- Pas d’entonnoir entre jours au-delà du couple impression / visite de
  retour ; pas de tableau de bord, pas d’alerte : lire le résultat demande un
  `ssh` et un `docker exec`. Une variante qui s’effondre un mardi n’est vue
  que quand quelqu’un regarde.
- Ajouter une mesure demande quatre modifications : le client
  (`src/firstRunTelemetry.js`), le validateur du serveur
  (`sanitizeFirstRunReport`, `src/firstRunAb.js`), le rapport, et
  `confidentialite.html`, qui énumère chaque champ envoyé.
- Ce que PostHog remplacerait : `src/firstRunTelemetry.js`, la route et son
  validateur, le rapport et son test. `src/firstRunAb.js` (tirage, TTL de
  13 mois) reste : le tirage doit rester côté client pour que `/` reste une
  page statique et cacheable.
- Condition pour garder la dispense de consentement (art. 82 LIL, mesure
  d’audience) : PostHog EU Cloud (Francfort), mode sans cookie
  (`persistence: 'memory'`, pas d’autocapture, pas de session replay), sans
  recoupement avec le cookie `gev_trial`, et le refus déjà en place
  (`src/firstRunOptOut.js`) branché dessus. Sinon, bandeau de consentement.
  `/confidentialite` devra nommer PostHog comme sous-traitant, dans la même PR.

---

## Closed / Intentional (for clarity)

### Proxy SSRF and error-surface hardening gaps
Status: Closed as fixed on `main`

Context:
- Proxy middleware previously allowed broader error/internal surface area and looser upstream handling.
- Current `main` includes hardened proxy behavior in `vite.config.js`:
  - CCTV upstream URL no longer accepted from client query params.
  - Error payloads are sanitized.
  - OpenSky cache stores successful responses only.
  - OpenSky token refresh is coalesced.
  - GBFS/CCTV memory growth is bounded.

Validation target:
- `vite.config.js`

---

### NVG vignette edge color bleed
Status: Closed as fixed in current shader composite

Context:
- Earlier builds leaked original scene colors near the NVG tube edge.
- Current composite now masks NVG output with tube falloff before final blend, removing the color edge bleed.

Validation target:
- `src/styles/surveillance.js`

---

### Wildfires layer unavailable / static bundled snapshot
Status: Closed — live FIRMS integration shipped (2026-07-16)

Context:
- Wildfires (NASA FIRMS) were removed from runtime in v0.5.3, returned June 2026 as a
  bundled-snapshot layer (`local-firms`, 2026-05-25 data, ~58 MB in-repo), and were
  converted to **live NASA FIRMS data** on 2026-07-16: the `/api/firms` proxy merges
  three VIIRS NRT sources (trailing 24 h, 30 min cache, serve-stale-on-failure) and the
  bundled snapshot was deleted. Requires a free server-side `FIRMS_MAP_KEY`; without it
  the layer shows a KEY REQUIRED state.
- Weather radar is still held out of OSS v1 after QA found the previous overlay did not provide reliable visible value.
