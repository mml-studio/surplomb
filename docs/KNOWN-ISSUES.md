# KNOWN ISSUES

Updated: September 22, 2026

This file tracks active runtime issues only.

This file records current known issues; historical planning material is not part
of the public release.

---

## Open

### A plugged dataset speaks one language, whichever globe you are on
Status: Open (by design, for now), found 2026-09-20 translating the amenities batch

`datasets/*.json` has one field per label — `label`, `fusion.chip`,
`fusion.title`, the detail labels, the filter chips — so a dataset plugged in
by its manifest shows the same words to a French and to an English reader. The
visible case today is the GeoDAE defibrillators chip, `CNAM + DREES ·
Défibrillateurs`, which stays French on the English globe.

Widening the schema is a product decision, not a translation: a manifest would
gain an optional `{ fr, en }` shape for the six text fields, the generator
(`scripts/dataset-manifest.mjs`) would have to write it, and
`docs/DATASETS.md` would have to describe it. Until then, a contributor who
wants an English chip writes it in English. The core layers are unaffected —
they carry catalogs.

### The premium badge overflows its box on a narrow phone when a trial is configured
Status: Open, found 2026-09-20 by `qa:phone-shell` with `GEV_TRIAL_LIMIT=5`

`span.gev-premium-badge` sits outside its container at 360 px wide when the
hosted trial is on; the harness drops from 25/26 to 23/26. It is a layout bug
in the voice dock, not a string, and it does not reproduce without a trial
limit — which is why the phone work never saw it.

### The voice speaks English on request, but no bench has heard it
Status: Open (blocked on credit), 2026-09-20

The realtime session and the OpenRouter path are now told which language to
speak, and the minted session config proves the instruction is sent
(`SPEAK ENGLISH …`). What no test can say is whether the models OBEY it in
every spoken confirmation, and whether *"show me the doctors"* routes through
the model to `medecins-fr` — only `npm run qa:voice-bench` can, and the
OpenRouter key is at its ceiling (`Key limit exceeded`). Run the bench in both
languages the day there is credit.

### What the phone shell does not carry, and why each one was left out
Status: Intentional, decided 2026-09-16 with the phone shell (part C of the phone work)

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
- The Address X-ray prints *Le registre ANFR est vide dans cette édition*
  (“The ANFR register is empty in this edition”) rather than “0 supports”,
  because an empty register is a fact about the register and never about the
  address (`projectAntennes`).

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

### Two-finger tilt is unbound, and that is a decision
Status: Intentional, decided 2026-09-16 with the touch work

Cesium's pinch zooms **and** tilts at the same time, with no dead zone. Two
fingers that are not quite parallel therefore pitch the camera while the reader
closes in on a street, and nothing in the phone shell offers a way back.
`src/touchCamera.js` empties `tiltEventTypes`; tilt stays reachable through the
view presets, and one line brings it back if testers ask for it.

Consequence, since 2026-09-17: the arrival angle is the one the reader keeps. A
phone therefore always arrives looking straight down, north up
(`src/topDownView.js`) — startup, *Autour de moi* (Around me), places, search,
a clicked fire or ship. Two exceptions: a shared link restores its author's
angle, and the route tracking shot and the orbit keep their own.

What the phone shell does not carry — CCTV, cockpit, scene, radio, DISPLAY,
visual presets, foldables, a tablet in landscape under 600 px — is listed at
the top of this document, with the reason for each hole.

### A link shared from *Autour de moi* (Around me) reveals where the reader was
Status: Open (by construction), shipped 2026-09-16

Context:
- The *Autour de moi* button flies the camera to the device's position, then
  `flushHash()` rewrites the address from that camera — which is what lets a
  reload come back to the same place. Direct consequence: **the link copied or
  shared afterwards contains the position**, to within a few hundred meters.
- This is not a defect to fix quietly: it is how any map behaves, and the link
  only leaves if the reader asks for it. It is written here so that nobody
  rediscovers it as a leak.
- No `watchPosition`: one fix per press, never continuous tracking.

### Thirty-seven layers keep Cesium's click tolerance under a finger
Status: Open (bounded, safe in this direction), measured 2026-09-16

Context:
- `ScreenSpaceEventHandler` only emits `LEFT_CLICK` on a touch release if the
  straight-line distance from the first contact stays within
  `_clickPixelTolerance` (5 px). A trembling tap beyond that **never reaches**
  the gesture count.
- The three layers that go through `bindTrackingClickGesture` (civil flights,
  military flights, CCTV) raise that tolerance to 10 px under a coarse
  pointer. The ~37 others install their own handler and keep the 5 px: a
  trembling tap is **lost** there.
- It is the safe direction of failure: nothing is selected, and above all
  nothing is DESELECTED. Migrating the 37 is a separate piece of work.

### Two things the phone harness cannot measure
Status: Open (tool limit), measured 2026-09-16

Context:
- **`-webkit-touch-callout`** is a WebKit property: Chromium drops it at parse
  time, so `getComputedStyle` answers `''` whatever the stylesheet says.
  `qa:phone-touch` measures the half it can (`user-select: none`) and the
  declaration itself is pinned by `src/data/trackingClickGesture.test.mjs`,
  which reads `style.css`.
- **"The tap selected the charging station"** cannot be proven headless: no
  Cesium entity paints there, and `scene.pick` answers nothing for the bare
  globe under SwiftShader. The seam therefore publishes its own numbers
  (`getPickDiagnostics()`), and the selection is pinned by
  `src/data/pickAt.test.mjs`.

### To check on a real device before calling touch done
Status: Open (checklist), opened 2026-09-16

Nothing below can be measured from a Mac. An iPhone (Safari 17) and an
Android phone (Chrome) must tick:
- the voice **speaks**, and through which speaker — iOS often routes WebRTC
  audio to the earpiece when the microphone is captured;
- the `getUserMedia` prompt does appear after the lazy loader's
  `await import()`, and the permission persists from one session to the next;
- the voice session cuts out when the app goes to the background, and the
  recording dot goes out with it;
- a long press on the globe brings up neither a context menu nor a magnifier;
- `(pointer: coarse)` on an iPad **with a trackpad** does answer `fine`;
- the feel of the pinch (`zoomFactor` 15) and of the inertias (0.85 / 0.7 /
  0.6);
- the soft keyboard's return key does read *rechercher* (search);
- the `navigator.share` sheet opens and the link reopens at the same place;
- the iOS geolocation prompt, and *Autour de moi* (Around me) landing.

### A second `/api/geoid` request leaves before the camera is set
Status: Open (minor, predates the phone work), measured 2026-09-16

Context:
- On **every** device, the HUD's first tick reads the camera before the opening
  `setView` and requests `/api/geoid?lat=35.15&lon=-82.5` — Cesium's starting
  position, in North Carolina. The cell is cached and will never serve again.
- Cost: one `/api` round trip per load, on the connection where it costs the
  most. That is half of a phone boot's budget (2 calls out of 2).
- Not fixed here: the fix belongs in `src/hud.js`, outside the scope of part A
  of the phone work.

### The first-run card drives the globe's search, not the Address X-ray
Status: Open (product decision pending), noted 2026-09-17

Context:
- Variant A's field (*Qu’est-ce qui est vrai à cette adresse ?*, “What is true
  at this address?”) flies over the globe through `styleManager.flyToAddress`,
  then switches on `dvf-sales`, `ads-fr` and `dpe-fr` on arrival.
- The Address X-ray — ten themes, printable — lives in `fiche.html`. From the
  globe, its only door is the RADIOGRAPHIE (X-RAY) pill on the *Fiche
  implantation* (Site report) row (`implantation-fr`,
  `src/data/ficheSheet.js`): the card neither switches it on nor mentions it.
  Yet `fiche.html?q=` would accept the typed text as it is.

Consequences in runtime:
- A visitor who types an address sees three layers around the point, not that
  address's X-ray: the title's question gets an answer in pieces, on the map.
- Nothing tells them the X-ray exists until they find the *Fiche
  implantation* row in the layers panel.

### The first-run card's A/B test is read by hand from a JSONL file: no product analytics tool
Status: Open (backlog), decided 2026-09-17

Context:
- The first-run card is A/B/C tested on surplomb.app as soon as
  `GEV_FIRST_RUN_AB=A,B,C` is set (off by default). The sink is deliberately
  minimal: `POST /api/first-run/events` (`vite.config.js`,
  `firstRunAbPlugin`) appends one line per report to
  `.gev-cache/first-run-ab/events-YYYY-MM-DD.jsonl`, and
  `scripts/first-run-ab-report.mjs` prints the totals per variant, the Wilson
  intervals, a z-test against A, the missing sample size and the stopping
  rule. Nothing else.
- Maintainer's decision (2026-09-17): PostHog will come later. Do not
  integrate it in the test's pull request.

Consequences in runtime:
- No funnel across days beyond the impression / return-visit pair; no
  dashboard, no alert: reading the result takes an `ssh` and a `docker exec`.
  A variant that collapses on a Tuesday is only seen when someone looks.
- Adding a measure takes four changes: the client
  (`src/firstRunTelemetry.js`), the server validator
  (`sanitizeFirstRunReport`, `src/firstRunAb.js`), the report, and
  `confidentialite.html`, which lists every field sent.
- What PostHog would replace: `src/firstRunTelemetry.js`, the route and its
  validator, the report and its test. `src/firstRunAb.js` (the draw, 13-month
  TTL) stays: the draw must stay client-side so that `/` remains a static,
  cacheable page.
- Condition for keeping the consent exemption (article 82 of the French data
  protection act, LIL, audience measurement): PostHog EU Cloud (Frankfurt),
  cookieless mode (`persistence: 'memory'`, no autocapture, no session
  replay), no cross-referencing with the `gev_trial` cookie, and the refusal
  already in place (`src/firstRunOptOut.js`) wired to it. Otherwise, a consent
  banner. `/confidentialite` will have to name PostHog as a processor, in the
  same pull request.

### The world satellite imagery comes from an Esri endpoint closed to commercial use
Status: Open (backlog), decided 2026-09-22

Context:
- Outside France, the `Satellite` stack's photography, and the globe seen from
  space at boot, is Esri World Imagery, fetched without a key from
  `services.arcgisonline.com` (`src/data/worldImagery.js`). Esri's
  documentation for these legacy tile services: *"this service is not
  available for commercial use."* The endpoint still answers everyone; the
  limit is in the terms, not in the network.
- Maintainer's decision (2026-09-22): keep the keyless endpoint while the
  product is free, and switch the day surplomb.app gains traction.
- Crediting Esri does not license it. The imagery is already credited on
  screen (`Imagerie © Esri, Maxar, Earthstar Geographics`) and in the
  attribution popover (`src/data/dataCredits.js`); a credit meets an
  attribution duty, it does not lift a non-commercial one.

Consequences in runtime:
- None visible: surplomb.app and every fork show the same imagery. The
  exposure is contractual, and it grows with the product. Once surplomb.app
  charges for anything, every world view it draws breaks Esri's terms.

What the switch takes (2 to 3 hours, plus an ArcGIS Location Platform account):
- The same pixels through the licensed path: an API key with the
  `premium:user:basemaps` privilege, tiles from `ibasemaps-api.arcgis.com`,
  which answers `Token Required` without one (probed 2026-09-22). The pinned
  CesiumJS (1.138) loads it natively:
  `ArcGisMapServerImageryProvider.fromBasemapType(ArcGisBaseMapType.SATELLITE)`
  with `ArcGisMapService.defaultAccessToken`. The ceiling stays z19, so the
  composite under the IGN orthophoto and the base's sleep over France
  (`_syncWorldBaseVisibility`) do not change.
- The world base follows a key the way `photoreal` does: a configured build
  gets the licensed layer, a keyless build (every fork) keeps today's
  endpoint. `src/mapStackController.test.mjs` asserts the keyless URL and
  moves with it.
- Price, checked 2026-09-22: 2 million tiles free a month, then $0.15 per
  1,000, so $150 per extra million. At about 90 tiles a view the free tier
  covers some 22,000 views, and a view over France costs about one tile since
  the base sleeps under the IGN layer. The session model (1,000 free, then $4
  per 1,000) is documented for the Basemap Styles service only; it has not
  been verified for raw imagery tiles.
- The key is readable in the browser: restrict it to the surplomb.app
  referrer, and read on the account what happens past the free tier (service
  cut or bill) before switching. Check whether Esri's attribution rules for
  the licensed path add "Powered by Esri" to the on-screen credit.
- The other options and their prices are in `DATA_SOURCES.md`, *The imagery
  replacement, if that day comes*.

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
