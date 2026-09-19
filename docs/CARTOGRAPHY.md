# Surplomb's cartographic doctrine

*Drawn from Boris Mericskay's teaching material, tested against what GEV really is: a real-time 3D globe.*

---

## Why this document

Boris Mericskay is a senior lecturer (*maître de conférences*) in geography and geomatics at Université Rennes 2, co-director of the SIGAT master's program in geomatics, and a member of the UMR ESO research unit. Within the GdR MAGIS research network he coordinates the research action “(Carto)graphies et (Géo)visualisations de données” ((carto)graphies and (geo)visualizations of data). His work is about exactly the object GEV has become: web mapping, the geovisualization of massive data, and the regime of representation specific to the Geoweb.

This document extracts from his teaching what holds for GEV, after putting it through three critiques: that of a real-time 3D engine, that of the 2026 state of the art, and that of the product and its audience. **It is not a summary of Mericskay.** A rule that did not survive the critique is moved to the end of the document, with its reason.

Every rule carries a **conformance test**: one must be able to look at a GEV layer and answer yes or no.

### What was actually read

27 of 28 sources were reachable. The details are in the [bibliography](#bibliography). The essentials:

- **`CM_SemiologieGraphique_2020.pdf`** — 116 slides, read in full, including the image-only slides, rendered to PNG at up to 260 dpi to check the quotations word for word.
- **`Intro_Dataviz.pdf`** (101 slides), **`geoviz2018.pdf`**, **`Spatiotemporel.pdf`**, **`AnalysespatialeM1.pdf`**, **`Leaflet.pdf`**, **`Cours_MapboxGL.pdf`**, **`Intro_Overpass.pdf`**, **`OverpassTurbo_SOTM_2022.pdf`**.
- **“La géovisualisation de données massives sur le Web”** (geovisualizing massive data on the Web), *Mappemonde* 131, 2021 — the article most directly relevant to GEV.
- **“La cartographie à l'heure du Géoweb”** (cartography in the age of the Geoweb) (HAL, halshs-01468314).
- **`Communication cartographique`** (ISTE, 2022), which he edited — foreword and introduction read in full.
- His two **Geotribu** tutorials on MapLibre and vector tiles.

Only one source stayed closed: the index of the SIGAT master's `Cours/` directory (403), which cost no material — every course was reached by its direct URL.

Quotations from these French sources are given here in English translation; the originals are behind the links in the bibliography. Quotations that were in English to begin with are left as written.

---

## The frame: rules and seduction

Mericskay opens the book he edited on the question that is exactly GEV's — chapter 1 is titled “Les facettes du cartographe : une communication entre **règles et séduction**” (the cartographer's facets: communication between **rules and seduction**). He does not settle it in favor of the rules.

> “A map, whatever its medium, its form, its designer or the context in which it is used, always serves the same purpose: to simplify reality in order to convey information, to communicate a message.”
> — Mericskay, *Communication cartographique*, introduction, 2022

His conclusion on the Geoweb is sharper still, and it absolves GEV's stance:

> “A vast undertaking thus opens up for map ‘professionals’, **not in order to keep control of it**, but above all so that the map on the Internet keeps its specific character and a certain rigor.”
> — “La cartographie à l'heure du Géoweb”

Spectacle, then, does not disqualify. What disqualifies is his diagnosis of the “new cartographers” — and GEV has to ask itself whether it is one of them:

> “No culture of the ‘map’ and of its construction ‘rules’ • **Little critical distance from the data (quality, updates, integrity, completeness…)** • Emphasis on the visual, on design, on graphics”

And his charge against the drift:

> “Online maps are indeed heavily centered on dataviz, where the aim is to offer aesthetic and attractive visualizations, **often at the expense of the ‘conventional rules’ of thematic cartography**.”

Finally, the sentence that describes GEV without knowing it — written in 2016, it describes the product:

> “**The real semiotic challenge of the Geoweb lies in how to represent graphically new forms of real-time digital data** relating, for example, to mobility, to social networks or to measurements from ever more numerous connected sensors. For now, online solutions largely reuse existing graphic means, trying to transpose them onto these new data.”

ADS-B, AIS, TLE, USGS, FIRMS, DATEX2, GBFS, GTFS-RT, Météo-France, CANDHIS: GEV is the case in point. Mericskay says that recycling static signs onto these feeds is a failure — and that the work is still open.

### One thing the corpus cannot see

Mericskay writes for a 2D map: fixed framing, a single scale, a declared projection, the whole population visible, frozen time, no Z axis, no per-frame budget. GEV is the opposite on every count. **Almost all of his rules stay true in their intent and false in their form.** The scale bar, white for missing data, proportional circles, screen-radius clustering, 2 frames per second: applied to the letter, they would produce false maps on a globe that stutters.

Hence the structure of this document: **basis** (what the corpus says), then **transposition** (what the rule becomes here).

---

## A. Honesty — the non-negotiable foundation

> A violation in this section misleads the user. It is treated as a bug, not as a design trade-off.

### A1 · Never the same sign for a measured value and a default value — **P0**

**Basis.** The corpus demands it for missing data (“The absence of information is indicated in the legend and shown in white on the map”), and for critical distance from the data: integrity and completeness.

**Transposition.** On GEV the question is not the empty cell of a table; it is the fallback value injected so that rendering does not break. Any fallback constant that reaches the screen must be marked — ghost glyph, dashed outline, explicit mention — or not reach the screen at all.

**Test.** For every field shown on a card or carried by a visual variable: is there a fallback value in the code? If so, can a user tell the two cases apart on screen?

### A2 · The age of the measurement is a visual variable — **P0**

**Basis.** This is Mericskay's explicit demand: design “new sign systems suited at once to the information to be represented, **to its temporalities**, to the intended audiences and to the devices used”.

**Transposition.** A moving object whose last real measurement is 90 s old keeps gliding at 60 fps by dead reckoning: rendering manufactures data in 59 frames out of 60. Age must be carried by the sign itself — decreasing alpha, a trail that fades, a dashed outline past a threshold, then removal — and **not only by a text badge in a panel**. It is the cheapest encoding there is if it goes through the color attribute already present in the batch.

**Test.** On a moving layer, are an object seen 5 s ago and an object seen 3 min ago graphically different without opening a panel?

### A3 · One channel, one piece of information — **P0**

**Basis.** “This language must be clear and consistent: avoid excessive redundancy, overload…”

**Transposition.** If opacity carries both freshness and distance to the limb, the reader can read neither: a distant object and a stale object land on the same alpha. Every visual variable carries one piece of information and only one; if two must coexist, they need two orthogonal channels.

**Test.** For each layer, list the visual variables used and the information each one carries. A variable that appears twice is a defect.

### A4 · Emptiness has three causes, and they do not look alike — **P0**

**Basis.** Absent from the corpus, which has neither depth nor a rendering budget — a blind spot identified by the critique.

**Transposition.** An area with no symbols on GEV can mean: (a) no data published, (b) data capped by a display ceiling, (c) objects hidden by terrain or buildings. These three voids are indistinguishable today. The source/freshness badge covers none of them.

**Test.** Facing an empty area, does the interface let one decide between the three causes?

### A5 · Every cap is declared — **P1**

**Basis.** “Despite an effective visual rendering, this form of data generalization should nevertheless be **used with caution**, insofar as the underlying graphic transformation is more aesthetic than rigorous.” Sampling, clustering and making a heatmap are **cartographic acts**, not optimizations.

**Transposition.** Every capped layer shows `n shown / N known` and the selection criterion (most recent? nearest? most intense?).

*The repository already keeps this rule in places*: `src/data/amenitiesFrance.js:165-171` documents that the 12,000 ceiling does not bite in production, that the payload arrives sorted rarest-family-first, and that “whatever is dropped is counted and printed under the toggle”. That is the pattern to generalize.

**Test.** For every constant of the `MAX_RENDERED_*` / `*_CAP` / grid-budget kind: does the user see the capped count and the criterion?

### A6 · The basemap is a layer, not scenery — **P1**

**Basis.** This is one of Mericskay's head-on critiques: on the Geoweb, geographic space shrinks to “**a mere basemap, a neutral backdrop**”. The basemap is never neutral.

**Transposition.** BD ORTHO has a vintage, 3D Tiles have a provenance and a capture date, and photorealism suggests a freshness the imagery does not have. The source/freshness strip shown per layer must cover the basemap too.

**Test.** Can the user know when the image they are looking at was taken?

---

## B. Graphic semiology

### B1 · Absolute → size. Relative → value. Never a fill on a raw count — **P0**

**Basis.** This is the rule the corpus hammers hardest, stated twice in the course and repeated in the article:

> “The only possible variable for absolute quantitative data is size.”
> “Absolute continuous data is the total number of observations in a given area (population, headcount, number of something) ◦ To represent it, prefer a variation in size. / Relative continuous data is the ratio of an absolute figure to a reference (density, rate,…) ◦ Prefer a variation in color (gradient)”
> “An absolute quantitative variable shown as color fills — **NOPE!!!!**”
> “**One of the most common semiological errors to be found on the Geoweb** is the representation of absolute quantitative data as color fills.”

**Transposition.** It is the act of **normalization** that licenses the choropleth, not the other way round. The rule is wired as a guard: every quantitative layer declares its unit, `ratio` (rate, density, price per m², share) or `count` (number of charge points, of doctors, of sales). `count` forbids the fill.

**Nuance from the product critique**: painting a raw count *can* be defended when the user's question is “where is there a lot of it”, provided this is **written on the map**. What cannot be defended is doing it silently.

**Test.** For every `GroundPrimitive` or polygon filled by a value: is the classified value a ratio? If not, does the legend say explicitly that it is a count and that the area of the spatial unit is not neutralized?

### B2 · On a globe, screen size is already taken by depth — **P0**

**Basis.** The corpus prescribes the proportional circle. Bertin has no Z axis.

**Transposition.** A billboard already undergoes a ~1/z factor. Wiring “radius ∝ magnitude” on top multiplies the two: a distant M7 earthquake becomes smaller than a nearby M3 — the exact inversion of the message, **with a legend that claims the opposite**. That is worse than the undifferentiated pin, because it gives the reader a reason to believe what they see.

Quantity has to move to a channel **orthogonal to depth**: a ring of fixed pixel radius over the glyph, value/luminance, or an extrusion height read against a vertical guide. If screen radius is used, it must be computed in constant pixels (independent of `scaleByDistance`), not in world units.

**Test.** Place two objects of very different values at very different distances. Does the visual hierarchy match the hierarchy of values?

### B3 · Six declared classes do not make six perceived classes — **P1**

**Basis.** The hardest numeric threshold in the corpus:

> “The number of distinguishable steps is 6 to 7 gray values, **white and black included**.”

**Transposition.** On GEV the perceived color is the end of a chain: alpha blended over a textured orthophoto — so the same class renders differently over a white roof and over a forest —, then HDR, then the sensor post-process, then the screen's gamma. Counting six bands because the course says six, and believing oneself compliant, is a mistake.

Two operational corollaries: do not rely on alpha alone under an areal layer (lay down a desaturated opaque background, or encode with isolines / patterns); and validate the number of classes by **measuring** the perceptual gap between composited colors over a set of reference backgrounds — this can be automated.

**Test.** Offscreen render over three contrasting backgrounds (water, forest, light urban): do two adjacent classes stay separable? Do two distant classes stay ordered?

### B4 · Hue does not order, but it carries codes — **P1**

**Basis.**
> “Color variation is only differentiating; it is used to represent qualitative characteristics […] **The eye cannot establish an order!**”
> “But it refers to familiar color codes!” (land cover: red = built-up, yellow = arable land, green = forest, blue = water)
> “Mixed color variation = incomprehension”

**Transposition.** An ordered scale must vary in **value** (lightness), not only in hue. When a cultural code exists and is strong — green/amber/red for road congestion, the Météo-France scale — it takes precedence over Bertinian purity, provided it stays within a single register.

Addition from the state of the art: the current recommendation (Jégou, AR9 webinar #16, June 2024) is to **fit the gradient's lightness to the progression of the data** rather than take a preset. “Data is more legible when the gradient is fitted to it.”

**Test.** Convert the ramp to grayscale. Does the order survive? Simulate deuteranopia. Does the order survive?

> **Amendment of 2026-09-14 — a ramp ordered by lightness has a FLOOR problem, and the test above does not see it.** A scale that varies in value has, by definition, a dark bottom. On a photographic background that bottom disappears — and both of the rule's tests declare it compliant, because they measure ORDER and never VISIBILITY.
>
> Measured on `irve-fr`: the ramp shipped on 2026-09-10 ran from L\* 30.6 to 83.0, steps of 10 to 18, order intact in grayscale and under deuteranopia — and a reader said the dots were too dark to find one's way by. They were right, and the number that proves it is not in the ramp but in the data: the two bottom rungs (`lente` 6.7% and `normale` 39.3%) make up **46% of the sites of a French city**. A dark dot in a dark ring on an orthophoto is a dark smudge, whatever its hue.
>
> **Rule.** On a photographic background, an ordered ramp spends its order in the LIGHT HALF. Between L\* ≈ 54 — the darkest that still reads on a dark background — and L\* ≈ 91 — the lightest before white — 37 points remain: for five classes that means steps of 9.2 instead of 13, which is tighter and sufficient. The gain shows on both sides: floor raised by 23.5 L\*, and composited separation up from ΔE 21.4 to **35.5**. The cost is a class ceiling lower than one thinks — B3 already said six to seven; the light half allows five comfortably.
>
> **Added test.** Is the ramp's darkest rung above L\* 52? And does the most frequent class in the data fall on a light rung or at the bottom of the scale?

### B5 · Shape and size do not lie about an unknown type — **P0**

**Basis.** “Shape: qualitative only, 5 to 7 shapes at most.”

**Transposition.** A textbook case in GEV: an aircraft silhouette and a size scale encode a class. When the classifier falls back to a default for lack of a type code, the glyph **asserts** a type that was never measured. That is A1 applied to shape. It needs an “unknown” silhouette and a neutral scale.

**Test.** Does the shape set contain an explicit sign for “unclassified”?

---

## C. Classification, spatial units and method

### C1 · Classify the phenomenon, not the sample — **P0**

**Basis.**
> “The choice of classification method is a delicate problem, since it **determines how the map looks and conditions how it is interpreted**.”
> “A classification is satisfactory when it creates classes that are homogeneous and distinct from one another.”
> “One must be able to explain the choices made.”

**Transposition — this is the rule 2D could not state.** The corpus classifies a closed, still series. GEV classifies feeds whose population changes with every poll, in a framing that changes with every frame. Classifying “the series” then makes an object's color depend on which other objects are in the field of view: the same cell changes color when the camera moves, although no data changed.

**The correct real-time rule: constant domain thresholds**, expressed in the phenomenon's unit (magnitude, FRP in MW, knots, national €/m²), frozen, published in the panel, **never recomputed from the visible sample or from the framing**.

**Test.** Frame an area, capture. Widen the framing to bring in extreme values from another continent. Did the initial area change color?

### C2 · The spatial unit is a reading hypothesis, not a fact — **P1**

**Basis.** The MAUP, to which the course devotes a whole section before any exercise:

> “A spatial aggregation problem (MAUP) is a source of statistical bias that can **radically affect** results […] The resulting summaries (e.g. totals, rates, proportions) are influenced by the choice of zone boundaries.”
> “An administrative boundary rarely corresponds to a spatial discontinuity.”

**Transposition.** The same layer seen by municipality and then by department is not the same map. The panel must name the active spatial unit and, when two regimes coexist, say that the ranking would change with a different zoning.

**Test.** Does the panel name the spatial unit? Does the legend say what units it counts?

### C3 · On a sphere, a grid in degrees is not equal-area — **P1**

**Basis.** “The cell size is THE question of gridding”; the corpus condemns non-metric grids.

**Transposition.** Its fix — grid in meters — does not transpose as such: there is no regular equal-area lat/lon tiling, and the `cos(lat)` correction lets polar cells degenerate. On a globe: a quasi-equal-area tiling (H3, S2, HEALPix), or failing that **the cell's true area as the denominator**, with cells merged beyond 60°.

Otherwise, at equal counts, high latitudes are painted twice as dense as the equator — a gridding artifact that, on a thermal-anomaly layer, produces a geopolitically loaded result.

**Test.** Two cells with identical counts, one at the equator, the other at 60°: do they render the same color? If yes, that is a defect.

### C4 · A rate does not aggregate like a count — **P1**

**Basis.** “Never sum a relative value.” “A rate is computed as a ratio of deduplicated sums, never as an average of rates.” “After a spatial join by distance or buffer, the GROUP BY is not optional.”

**Test.** Does every roll-up from municipality to department recompute the numerator and the denominator separately?

---

## D. Legend

### D1 · Where color carries a value, the legend is mandatory — and visible with the map — **P0**

**Basis.** Mericskay observes that the popup has replaced the legend, and states a clear exception:

> “Legends are nevertheless **still necessary** and present in some cases, such as choropleth maps, where the information about the variation in value has to be legible on the map to give meaning to the information represented.”

And among the seven bad practices he lists: never writing the word “legend”.

**Transposition.** Popup-only is defensible for flights, ships, cameras — nominal objects one queries one at a time. It is at fault as soon as a color encodes a value. And a legend folded into a panel that covers the map is not a legend: it is interface debt.

**Test.** Without opening any panel, can the user translate a color into a value?

### D2 · A two-tier legend on a moving frame — **P1**

**Basis.** The course's five positive rules: rounded class limits that are easy to read, **the series' minimum and maximum values always shown**, reading keys, significant statistical values, missing data announced.

**Transposition.** The min/max rule “of the series” no longer has a single referent when the reader sees a sub-population that changes with every camera move. Showing world extremes next to a view of Gironde is misleading; showing those of the view makes two captures non-comparable and **breaks the reproducibility of the share link**.

Hence two tiers: a **frozen absolute scale** per layer (published domain limits, never derived from the view), overlaid with a **moving histogram** of the visible sub-population and an `n visible / N known` counter.

**Test.** Do two users opening the same share link read the same legend?

### D3 · Missing data is coded by a pattern, not a hue — **P1**

**Basis.** “The absence of information is indicated in the legend and **shown in white** on the map.”

**Transposition — the white rule cannot apply here, and following it would be dangerous.** On a photorealistic globe there is no neutral background: white is a color of the world (roofs, snow, cloud) and emptiness is orthophoto. Worse, on a ramp designed for a dark background, white reads as the **top** class — GEV would display “maximum value” where it has no data at all.

A geometric pattern (hatching, grid) is the right answer, and it has a second advantage: **a pattern survives NVG and FLIR; a hue is destroyed**.

**Test.** On an areal layer, can a unit with no data be told apart from the top class? And does that stay true under every sensor mode?

---

## E. Time

### E1 · The instant represented is displayed on the map — **P0**

**Basis.** Twice in the spatio-temporal course: “Display frame start time on map”, “Add the time on each map”. An animated map with no date shown cannot be interpreted.

**Transposition.** The display must carry the instant **represented by the data**, not the client's local time nor an undifferentiated “N seconds ago”. Two consequences: every entity card carries the timestamp of the measurement; and the share link serializes the instant, otherwise it replays the same view with other data.

**Test.** Is a screenshot of GEV enough to know when the data it shows dates from?

> **Amendment of 2026-09-14 — a layer's clock can live on the card, provided it is there PER OBJECT.** The `irve-fr` key carried the provenance sentence and the latest operator upload in the view. Measured in Chrome on a city view: 13 lines, 301 words, **717 px of content in a 355 px window** — the reader saw half of it, and never the last sentence. The reader of that key is looking for a charger to plug into; the file date is an author's question.
>
> So the clock moved down to the **card**, and it is there **per site** (`🗓 déclaré 15/11/2025 → 30/07/2026`, declared Nov 15, 2025 → Jul 30, 2026) instead of being the view's maximum. This does not weaken E1; it does the opposite: a tenth of this register has not moved since 2023, and “the most recent upload in the view” said nothing about the station the reader had just clicked — it even needed a guard against the 56 rows out of 227,007 dated Dec 30, 2026 before it meant anything.
>
> **The condition, and it is strict.** A view clock may leave the map if (1) every object carries its own on its card, (2) the publisher is named in the attribution surface (`dataCredits.js`), and (3) the data is an **inventory**, not a feed. A feed — flights, ships, GTFS-RT — is not entitled to this exit: its freshness IS the data, and a capture without it cannot be interpreted. E1's test becomes: *is a capture enough, or is a click enough, to know when the data dates from?* — and for a feed the answer must remain “a capture”.

### E2 · Three temporal concepts, three treatments — **P1**

**Basis.** “Event: represents a precise instant on the timeline. Time interval: of modeling / representation. Period: represents a set of intervals.” And the basic distinction: “spatio-temporal data is spatial data whose **shape and/or position** changes over time”.

**Transposition.** GEV mixes two regimes without saying so. **Moving position**: flights, ships, satellites, GTFS-RT. **Fixed position, changing attribute**: bike-share stations, road segments, weather stations, buoys, cameras. A trail behind a billboard makes sense for an A320; it makes none for a Vélib' station. These two families must not share the same animation treatment.

**Test.** Does the layer registry declare, next to source and freshness, the temporal regime (event / interval / period) and the variation regime (position / attribute)?

### E3 · The time window is a named parameter, calibrated in screen length — **P1**

**Basis.** The course's central parameter is neither speed nor date; it is the **“duration of a map”**: the width of the window whose entities are shown together. Set to 1 minute for a hiking GPS track, 30 to 60 minutes for crime over a day.

**Transposition.** Trail persistence must be exposed as a setting, not buried in a module. And the value must differ per layer according to how fast the objects move: an aircraft at 250 m/s crosses a one-minute window in 15 km, a freighter at 10 knots in 300 m. **Set the window so that the trail has a comparable screen length across layers, not an identical duration.**

**Test.** Do the trails of the different moving layers have comparable lengths on screen?

### E4 · Three clocks, not to be confused — **P1**

**Basis.** The corpus puts a number on the pace: “Show one map every 500 milliseconds”, “set how long each map is displayed (0.5 or 1 second)”. That is 1 to 2 frames per second — very far from cinema's 24. The slowness is deliberate: every state must be readable before it is replaced.

**Transposition.** 2D could conflate cadences because it had only one clock. A globe has three, independent of one another:

| Clock | Constraint | Order of magnitude |
|---|---|---|
| **Rendering** | the camera and interaction | 60 fps, or it stutters |
| **Data** | the upstream poll | from a few seconds to 10 minutes |
| **Playback** | the step of a timelapse | **1 to 2 steps/s — the corpus's figure applies here, and only here** |

Applying “2 frames/s” to rendering breaks the camera. Applying it to the data breaks the timelapse.

And the question the corpus does not ask: **between two measurements, what does 60 fps rendering do?** It extrapolates. See A2.

**Test.** Does a future timelapse mode run at 1–2 steps per second, and not “as smooth as possible”?

---

## F. What the globe changes — the section the corpus cannot write

### F1 · An occlusion policy declared per layer — **P0**

**Basis.** Absent from the corpus: a 2D map has no depth. But the corpus states the problem this is the 3D version of:

> “Some elements of the map may be obstructed by extruded features, which limits a complete reading of the data. […] Too many extruded units end up producing a very fragmented image.”

**Transposition.** On GEV the occluder is not the data; it is **the city** — the photorealistic buildings. The question “what hides what” dominates a globe's legibility, and today it is settled by default in a direction that produces an X-ray image no sensor produces.

Three regimes, to be declared per layer:
- **(a) occluded** — the object is in the world, depth test on;
- **(b) occluded by terrain, not by buildings** — ellipsoidal horizon test plus a terrain sample;
- **(c) always visible, but marked as guessed** — ghost, dashed outline, reduced alpha.

**Never the same sign for “I see” and “I guess”.**

**Test.** Stand at ground level in a city. How many symbols show through buildings without being marked?

### F2 · Anchor the measurement; do not lay down a scale bar — **P0**

**Basis.** Mericskay's critique, written in 2016, describes GEV in advance:

> “[WebGL] will allow more flexibility, for example in changing the orientation of the map, such as its tilt, thereby allowing new ways of representing the world **free from the classic two-dimensional, north-up top-down view**.”

He notes that north orientation is never indicated, and that scale, when present, is reduced to its graphic form, abandoning its numeric side, “fundamental though it is”.

**Transposition — and this is where the letter of the corpus has to be disobeyed.** A scale bar assumes a constant pixel-to-meter ratio across the whole sheet. In perspective that ratio varies continuously **within a single image**: at 45° of pitch, the ground at the bottom of the screen is at roughly ten times the ground resolution near the horizon. A single bar would be wrong everywhere but along one line — and wrong **silently**. A user measuring the separation of two aircraft would be off by a factor of 3 to 10 without ever knowing it, and their screenshot would become a false, quotable measurement.

The correct rule is to **anchor the measurement**: ground footprint under the reticle, camera altitude, heading — recomputed every frame, and explicitly invalidated when the camera ray grazes the horizon.

**Test.** Does the user have a metric reference whose validity is guaranteed at the point they are looking at?

### F3 · Restore the heading — **P1**

**Basis.** Same passage: north orientation is implicit and never shown.

**Transposition.** In a military HUD, a heading tape and an altitude-linked scale are not cockpit decoration: they are **the two pieces of map furniture that 3D destroys and that must be restored**. It is the rare case where spectacle and geomatics ask for exactly the same thing.

**Test.** Outside cockpit mode, does the user know where north is?

### F4 · A choropleth is not a layer; it is a scene mode — **P1**

**Basis.** “A plain basemap is mandatory under an animation.” “Before showing 3D, clear the basemap.”

**Transposition — corrected version, after checking.** A first draft of this rule asserted that an areal fill seen in perspective becomes incomparable because its apparent area shrinks as 1/z². **That is false, and it has to be said.** A choropleth's visual variable is the **fill hue**, and perspective does not distort it: two departments have exactly the same color at the top and at the bottom of the frame. What varies is their **apparent area**, and in a choropleth area carries no data. The decoded value is intact; only the visual weight changes, which is a known salience effect and not a reading error.

The real defect is narrower and much more serious: **the thematic hue is draped over façades**. When the photorealistic stack is on, classification switches to `CESIUM_3D_TILE`, and the fill climbs up the buildings. There, building shading really does modulate the perceived color — and therefore the value read. It is B3's compositing, applied to a vertical surface nobody planned for.

The right answer is therefore not to turn the camera away — an intrusive move that costs more immersion than it corrects — but to **not drape a thematic layer over buildings**, and to pin `verticalExaggeration = 1` while an areal layer is on, which nothing guarantees today.

**Test.** On an areal layer, does the hue climb up façades when the photorealistic stack is on?

### F5 · Sensor shaders stop before the layers where color is the data — **P0**

**Basis.** “An attractive aesthetic rendering at the expense of conventional rules.”

**Transposition.** A full-screen post-process applies to the composited image, so it also repaints choropleths, ramps and glyphs. Under FLIR or NVG, the legend on screen **is no longer a valid decoding key** — the application displays false data while claiming the truthfulness of its sources.

This requires an explicit pass order: thematic layers are composited **after** the sensor filter. Failing that, sensor mode turns off the layers where color carries the value, and says so.

**Test.** Turn on FLIR over a colored areal layer. Is the legend still exact?

### F6 · No layer is displayed at every altitude — **P1**

**Basis.** In all his demonstrators, no symbology is a fixed value: radius, width and opacity are (zoom, value) pairs — circle radius 2 px at zoom 13 → 60 px at zoom 22; every layer has its `minzoom`/`maxzoom` (cadastre 16-19, municipal boundaries maxzoom 14). And his critique:

> “in many applications, symbology is set for a single zoom level only, which can cause representation problems if the user changes scale.”

**Transposition.** A continuous 3D camera **worsens** the problem: there is no step at which to calibrate symbology. The existing detail governor defines a GPU-load policy; the same is needed for **semiological load** — entry and exit thresholds declared per layer in the registry, not left to chance.

**Test.** Does every layer declare a display altitude range?

### F7 · A height declares its register and its domain — **P0** *(added by the “Representation” workstream, 2026-09-03)*

> **Amendment.** This rule was not in the document's first draft. It was written afterwards, because applying track 1 of the representation audit (#78) put **ten layers** on the Z axis where there had been one, and created an ambiguity B2 does not cover: B2 says *where* to put quantity, not *how to read two vertical lengths that do not speak the same language*.

**Basis.** None. The corpus has no Z axis: it cannot ask the question. This is the most “globe-native” rule in the document, and it comes from a measurement, not from a reading.

**Transposition.** A vertical length on GEV belongs to one of **three registers**, and nothing on screen tells them apart:

| Register | What the length is worth | Layers |
|---|---|---|
| **(1) World height** | 1 m drawn = 1 m measured, in its place | `bdtopo-buildings` (BD TOPO volumes), `anfr-fr` (antenna mast), `local-datacenters` (extruded halls), `ais-live-vessels` (hull at beam and length overall) |
| **(2) True length, conventional position** | the length is the measurement at 1:1, but it is **not** where the phenomenon is | `earthquakes` — focal depth, raised **above** the ground because an opaque globe cannot draw beneath itself without lying |
| **(3) Scale height** | the length is a **published convention**: a factor, or a frozen domain | `marine-buoys` (×10,000: 1 m of swell = 10 km), the four department/region prisms `irve-fr`, `schools-fr`, `sup-fr`, `france-energy` (frozen domain → 4 km … 120 km), `sitadel-fr` (1 dwelling = 1 m, ceiling 200 m) |

**Three obligations.**

- **a) The register is named** — in the module header *and* in the legend, in plain words. *ÉCHELLE DE LECTURE* (READING SCALE) and *hauteur réelle* (true height) are not the same phrase and must never be left to guesswork.
- **b) Two registers do not overlap in amplitude at the same place.** This is what makes the ambiguity materially impossible rather than merely discouraged. Measured: the highest world height in France is Mont Blanc at 4,810 m, the tallest ANFR mast 343.3 m, a BD TOPO building in a city ≤ ~200 m; the prisms start at 4 km and the swell stems at 2 km. No world height can reach a register (3), and that is the argument — already written in `choroplethPrism.js` without being named as a rule — that licenses 120 km: *“25× the highest ground in France means no reader can mistake a thematic volume for terrain”*.
- **c) A height domain is comparable only within its own layer.** Two layers share a vertical rule only if they share a **unit**. As long as they do not, each writes in its legend that its peak measures only itself.

**The edge case that defines the rule, and is accepted.** `sitadel-fr` extrudes a permit at **1 meter per authorized dwelling**, ceiling 200 m — that is, squarely within the range of real BD TOPO volumes, and its header says this is deliberate: *“The unit is chosen so the column can be read against the city it stands in”*. A 27 m column next to a 27 m building is twice the same length and twice something else. It is tolerated because obligation (a) is met — the legend says `Hauteur = logements autorisés · 1 logement = 1 m` (Height = authorized dwellings · 1 dwelling = 1 m) — but it is the only layer in the repository where reading rests on the legend alone, and not on the geometry.

> **Amendment of 2026-09-14 — a scale height is not set on a variable base.** `sitadel-fr` extruded the **parcel** by the number of dwellings. A prism is a volume and a volume is base × height: the ink on screen was therefore the dwelling count **multiplied by the size of the plot**, which the register does not claim to measure. Measured on the parcels actually extruded: base p50 403 m² / max 40,400 m² in Paris, p50 395 m² / max 153,173 m² in Nantes (**388× the median**), p50 637 m² / max 24,955 m² in Ustaritz. Two one-dwelling permits drew masses in a ratio of 388, and the biggest mark in Nantes weighed **25,426,754 m³** for a single application. The report came from Ustaritz: 45 dwellings on three adjoining parcels, 404,000 m³ of opaque orange above a village of 8 m houses. Height is now carried by a **column 12 m on a side per application**, planted on the permit's anchor; the parcel keeps its fill, its outline and its card. Volume is again proportional to the count alone — option (b), “normalize the base”, of `choroplethPrism.js`, which that module rules out for departments because there the polygon *is* the map, and which costs nothing here since the polygon stays drawn under the mark.

**What the rule forbids from tomorrow.** Track 1 of the representation audit (#78) proposes an **altitude stem** for flights. An altitude stem belongs to register (1) and spans 0–13 km; the earthquake depth rule belongs to register (2) and spans 1–700 km, with **the same shape, the same foot on the ground and the same vertical**. Below 13 km the two are indistinguishable. The altitude stem therefore cannot ship with the same sign as the earthquake stem: it needs two signs, or only one of the two.

> **Amendment of 2026-09-07 — there was a fourth register, and it was already on screen.** The table above counts only *thematic* heights. Yet the four grouped local layers (`local-airports`, `local-ports`, `local-dams`, `local-datacenters`) hold their dot at the end of a **leader stem** of constant screen height — 65 px — which makes its height in meters a function of camera distance: `0.0695 × d`. That is 695 m at 10 km, 3,475 m at 50 km, 13,900 m at 200 km. It is a fourth register, *“screen length, incidental height”*, which measures nothing at all and was never declared.
>
> It is harmless above a dam. Above an **airport** it is not: the flight layers draw aircraft at their real altitude above the same runways, so the dot floated at FL114 in the middle of approach traffic and at FL228 above it. Two vertical lengths, two registers, one column of pixels — exactly obligation (b), and not hypothetical this time. Fixed by capping the stem **in meters** on that layer alone (`stemMaxHeightM: 150`, below the 300 m traffic pattern) rather than removing the device, which stays useful up close.
>
> The general lesson: **a screen length becomes a world length as soon as a measured object shares its vertical.** The other three layers have no such neighbor; the day they do, the cap is already a layer option.

> **Amendment of 2026-09-10 — `irve-fr` now carries data on register (4), and declares it.** The IRVE layer's beam was register (4) without saying so, and it measured nothing: its length was the NUMBER OF MARKERS on screen, hence 960 identical 55.8 px beams on a view of the Pays basque. It now carries the **site's charge points**, square-rooted over a frozen domain of 24 (98.1% of sites), and the legend writes the sentence obligation (a) calls for: *Échelle d'écran gelée, en racine carrée — 24 points de charge remplissent la hauteur* (frozen screen scale, square root — 24 charge points fill the height). Two consequences to keep in mind:
>
> - **A screen length must be corrected for pitch, otherwise the published rule is wrong as soon as the view tilts.** A beam is vertical in the WORLD: its screen length is `L · cos(pitch)` — 87% at −30° (the opening view), 50% at −60°, **zero at nadir**, where a vertical projects to a point. The `1/cos` correction is capped at −70°, and past that the legend stops promising a rule. The four leader-stem layers have the same defect, uncorrected.
> - **Register (4)'s cap in meters is what keeps it from invading register (3).** At a camera distance of 1,400 km, 64 px are worth **129 km** of beam — above the 120 km top of the frozen prisms, which can be on at the same time. `irve-fr`'s 40 km cap is therefore structural, not cosmetic, and it is what rules out extending height-as-quantity to the grid: a cell aggregate would be capped there before it could be read.

> **Amendment of 2026-09-14 — a height cannot carry LEGIBILITY, and that is a geometric property.** B2 says that on a globe screen size is already taken by depth, so quantity goes on the vertical. The corollary was written nowhere: **the vertical, in turn, is taken by pitch.** A world-vertical beam projects to `L · cos(pitch)`, so **to a point at nadir** — and nadir is the most common attitude for reading a map.
>
> The case that established it: `irve-fr` had moved its count from the diameter to the beam (2026-09-10) and, in the same stroke, frozen the dot at 7 px since “the beam makes it visible”. Measured over Bordeaux at 12,653 m, looking straight down: **318 marks nobody could find**, and the shortest beam on screen was **1.1 px**. Beams survive at the EDGES of the frame, where the local vertical departs from the line of sight, and die in the MIDDLE, where the eye lands. The proof of the defect came from the reader in the most economical way possible: the author could not find the marks in their own screenshot.
>
> **Rule.** A height channel is a QUANTITY channel and never a PRESENCE channel. The mark must stay findable flat, without its beam, at every camera attitude — which points back to the rule already established elsewhere in the repository (`militarySiteIcons.js`, `plantFiliereIcons.js`): **marks of PLACES carry a dot**, since a bare silhouette cannot be found below 18 px on an orthophoto. And that dot's size keeps to an ink budget in AREA, not in count: a rule linear in count overflows in the middle of the range, where most views live (measured: 602 marks covered 28.1% of the frame; with an area budget, 15.6%).

> **Amendment of 2026-09-10 — G1 has a second case, G2 has two implementations, G3 is settled on `irve-fr`.**
>
> - **G1.** Four power-floor chips (`TOUT · > 22 · > 50 · > 150 kW`, *TOUT* = ALL) on the IRVE layer, set at the **limits of the band scale itself** rather than at round numbers: “≥ 22 kW” would be undecidable, since a point at 11 kW is `normale`, whose ceiling IS 22.
> - **G2.** The layer's two regimes apply the filter differently, and this is argued rather than suffered. The exact regime toggles a `filteredOut` flag and **never touches the collection**; `sweepBeams` remains the only writer of `show`, which is exactly the rule's architectural corollary. The grid **re-picks**, because the floor changes which site represents a cell and what the cell totals — measured at **1 to 12 ms** on the 40,028 national tuples, against a camera pose that already re-picks behind a 450 ms debounce.
> - **G3.** The IRVE grid now aggregates on a **world-locked grid** (`floor(lat/step)`), with a step frozen per zoom level and nested as a quadtree, so a change of level subdivides instead of reshuffling. Measured on a France view panned by 0.05°: **179 marks out of 1,100 survived**, against **1,050 out of 1,057** today. The rule's test — orbit without changing altitude and see whether the counters move — passes.

> **Amendment of 2026-09-14 — obligation (a) is met by the CARD when the reading rule sits next to the number it decodes.** The `irve-fr` key declared its register in 68 words, then graduated it with four steps **dimensioned in pixels** (*64 px de haut*, 64 px tall). That is the costliest possible phrasing of a rule that interests only the reader who has already noticed a beam — and that reader clicks on it. So the sentence is on the card, next to the exact number of charge points: *▮ Le trait mesure les points de charge (24 au maximum)* (▮ the bar measures charge points, 24 at most), and *au-delà de 24, il plafonne* (beyond 24, it caps) when the site exceeds the domain, which settles A5 in the same place and on the only object concerned.
>
> **What the amendment does not allow.** Moving the declaration to the card is legitimate only if the card also carries **the value**: it is the juxtaposition that teaches the rule, not the sentence alone. A height whose card does not publish the number keeps its declaration in the legend; otherwise no surface is left where the length becomes a number again.

**Test.** ① Does the legend — or the object's card, next to the value — say whether the length is a measurement or a convention, and with what factor? ② Two height layers on together: can a reader believe that two peaks at the same altitude say the same thing?

**Status on 2026-09-03: ② fails.** `irve-fr` and `france-energy` have height rules that are **identical pixel for pixel** — same `domainMax` (12,000), same mode (linear), same graduations (10,000 / 5,000 / 1,000), same legend bars — for charge points on one side and megawatts on the other. And `irve-fr`, `schools-fr` and `sup-fr` extrude **the same 96 polygons from the same ellipsoidal base**: two of them on together give two coincident translucent volumes (composited α 0.86 in the overlap), and no legend says that the two peaks do not compare.

---

## G. Interaction

### G1 · Shneiderman's mantra, and the missing link — **P1**

**Basis.** It is the only rule cited in two different courses, which makes it the corpus's prescriptive axis. Mericskay does not merely cite it; he translates it into components:

> “**Overview**: an overall view of the data / **Zoom & filter**: change scale, filter the data / **Details on demand**: contextual information window”
> “The purpose of visualization is **insight, not pictures**.”

**Transposition.** GEV has the overview, the zoom and the details on demand. **The filter is the missing link** — and it is the most profitable component the corpus points to.

**Test.** Can the user reduce a layer to a subset without turning it off?

### G2 · A filter never destroys the batch — **P0** *(feasibility condition for G1)*

**Basis.** The corpus prescribes “filter client-side on a source that is already loaded”, because it thinks in MapLibre, where `setFilter` is consumed by the shader.

**Transposition.** The danger is real, but it is not where one expects it, and the right culprit has to be named — checked in the bundled Cesium source:

- **`show` is safe.** `EntityCluster.removePoint` puts the primitive **in reserve** (`point.show = false`, index pushed onto `_unusedPointIndices`) without ever calling `remove` — `node_modules/cesium/Build/CesiumUnminified/index.js:151282-151293`. And on static geometry, a change of `isShowing` becomes a **per-instance** write of the `show` attribute. The batch survives.
- **`removeAll()` is the destroyer.** It sets `this._createVertexArray = true` — `index.js:149904-149910` — and so rebuilds the vertex array on the next frame.

The rule is therefore: **a filter never calls `removeAll()` and then rebuilds the collection.** It toggles `show`, writes a per-instance attribute, or goes through `translucencyByDistance`. A layer that empties and refills its collection at every notch of the filter freezes the globe **during exactly the gesture the filter is meant to make smooth**.

Architectural corollary, learned from the repository itself: on a globe, filtering and occlusion are two distinct reasons for not being visible, and they cannot share the same field. Two writers on `show` fight, and a filtered symbol reappears at the next camera move. An intermediate state (`filteredOut`) and a single final writer are needed.

**Test.** Does the filter hold 60 fps while the slider is dragged? And: does the filter path call `removeAll()`?

### G3 · Aggregate in world space, not in screen space — **P1**

**Basis.** The corpus teaches screen-radius clustering (“aggregation slider, less / more”).

**Transposition.** A screen-radius cluster recomposes on every frame of a rotation: the number shown in a badge changes while the camera turns, **although no object moved**. An unstable aggregate is false data. The corpus cannot see this problem because a 2D map has discrete zoom levels and a camera that does not rotate.

Aggregate on a tiling that is **stable in world space**, with hysteresis on the altitude bands and a crossfade over an overlap band rather than a hard switch.

**Test.** Orbit the camera without changing altitude. Do the aggregate counters move?

### G4 · Choose cluster, grid or heatmap according to what one must be able to do — **P1**

**Basis.** The nine-criterion comparison table of the *Mappemonde* article, which is the corpus's hardest decision grid. The **grid** wins on parameterization, weighting, statistical aggregation, quantification and reading structures. The **cluster** is the only one that shows individuals. The **heatmap** loses on almost everything: no parameterization, no statistical aggregation, no quantification, no individual, no symbology, no interaction.

> “Despite an effective visual rendering, this form of data generalization should nevertheless be used with caution.”

**Transposition.** The heatmap is therefore the worst choice as soon as one wants to click an entity to open its card. The only legitimate candidates are layers where GEV offers **no** per-entity interaction. And a heatmap must always declare its radius and its method — otherwise it is decoration.

**Test.** For each aggregated layer: does the chosen mode allow what the interface offers?

---

## H. Data

### H1 · Know what the data does not contain — **P0**

**Basis.** The fourth criterion is the corpus's most demanding: “quality, updates, integrity, **completeness**”.

**Transposition.** The source/freshness display, already present, says nothing about completeness. Yet ADS-B coverage is not exhaustive, AIS sees only cooperative ships, and a FIRMS constellation missing a satellite does not cover the same area. **Showing a layer's incompleteness explicitly is what separates geovisualization from visual fiction.**

**Test.** Does every layer declare its coverage domain and its known blind spots?

### H2 · Check crowdsourced data before using it — **P1**

**Basis.** The Overpass course is built entirely on this: count tags before extracting (`out count`), map completeness instead of assuming it by styling on whether the attribute is filled in, query freshness (`newer:`, `changed:`), compare OSM with reference data over a test area. And: “A folksonomy is a classification by non-specialists — and it moves.”

**Test.** For each OSM layer, is the attribute the layer relies on checked for fill rate, and is that rate visible?

### H3 · The GeoJSON / tiles boundary lies between 20,000 and 30,000 features — **P1**

**Basis.** Measurable thresholds in his own work: he loads without a second thought a GeoJSON of 19,428 buildings (12.3 MB) for 3D extrusion, protected by a `minZoom` of 14.5; and 31,409 DVF sales (7.1 MB) for clustering. At the scale of a whole city (359,884 parcels in Paris), he switches to hosted vector tiles.

The orders of magnitude he cites as running in production are far above that: 90 million cadastral parcels and 15 million DVF transactions at Etalab, 45 million BD TOPO buildings, 70 million 3D objects for the Swiss geoportal.

**Transposition.** GEV operates several orders of magnitude below these thresholds, which **validates** client-side rendering — and makes it indefensible to load a national reference dataset the same way. Below ~30,000 features, an altitude-bounded GeoJSON is enough; beyond that, vector tiles or 3D Tiles.

**Test.** Does every static layer know its maximum volume and the transport mode that goes with it?

---

## Irreducible tensions

These conflicts have no solution, only a trade-off. Better that it be written down.

| Tension | Academic position | Product position | Trade-off chosen |
|---|---|---|---|
| **Density vs legibility** | A saturated point scatter no longer says anything; aggregate | Saturation *is* the message: “the world is already broadcasting” | Keep the scatter as the entry view, offer the aggregate as an analysis mode. Never show both. |
| **Legend vs immersion** | Mandatory as soon as a color encodes a value | A permanent legend breaks the cockpit | A legend is mounted **only** for layers that declare a value scale, and it is collapsible — never absent. |
| **Spectacle vs measurement** | The success criterion cannot be seduction | Awe is the way in | Spectacle is welcome **wherever it does not manufacture a number**. A shader that stylizes: yes. A shader that shows a temperature in degrees: no. |
| **Smoothness vs deliberate slowness** | 1 to 2 frames/s, every state readable | 60 fps or immersion collapses | Three separate clocks (E4). Slowness applies to the timelapse, never to rendering. |
| **Rigor vs frame budget** | The corpus ignores rendering cost | Every prescription has a measurable price | Semiology is **optimization under constraint**, not a hierarchy of rules. Every layer declares its budget and picks its style within it. |

---

## What we do not take, and why

| Element of the corpus | Reason |
|---|---|
| **The graphic scale bar** | Silently wrong in perspective. Replaced by F2. |
| **White for missing data** | No neutral background on a photorealistic globe; on a dark ramp white reads as the top class. Replaced by a pattern (D3). |
| **The proportional circle in world units** | The size channel is already taken by depth. Replaced by an orthogonal channel (B2). |
| **Cesium's `EntityCluster` and screen-radius clustering** | Unstable under rotation, and incompatible with the batched collections of dense layers. Replaced by G3. |
| **~~“Filtering = toggling `show` destroys the batch”~~** | *Correction: this was an error in this document, not in the corpus.* Checked in the bundled Cesium source: `show` preserves the batch; the destroyer is `removeAll()`. See G2, rewritten. |
| **“2 frames per second” applied to rendering** | A confusion of three distinct clocks. Framed by E4. |
| **“A plain basemap under an animation”** | The basemap is geometry, not an image. Replaced by F4. |
| **The regular metric grid** | No equal-area lat/lon tiling exists. Replaced by C3. |
| **The min/max “of the series”** | No single referent on a moving frame. Replaced by the two-tier legend (D2). |
| **Six classes as a target** | Six declared ≠ six perceived after compositing. Becomes a measurement, not a constant (B3). |

---

## Bibliography

French titles are kept as published, with an English gloss in parentheses.

### Book
- **Mericskay, B. (ed.), *Communication cartographique : Sémiologie graphique, sémiotique et géovisualisation*, ISTE Éditions, 2022, 264 p.** — He wrote its introduction and chapter 6, “Repenser la cartographie sur le Géoweb : principes, outils et modes de représentation” (rethinking cartography on the Geoweb: principles, tools and modes of representation). [Foreword and introduction, open access](https://www.istegroup.com/wp-content/uploads/2019/11/091_Communication-cartographique_avnat-propos-et-introduction.pdf) · [HAL record](https://hal.science/hal-03901325/) · [chapter 6 in English, Wiley](https://onlinelibrary.wiley.com/doi/10.1002/9781394265022.ch6) *(not read — 403)*

### Articles
- [“La géovisualisation de données massives sur le Web : entre avancées technologiques et évolutions cartographiques”](https://journals.openedition.org/mappemonde/5595?lang=fr) (geovisualizing massive data on the Web: between technological advances and cartographic change), *Mappemonde* 131, 2021.
- [“La cartographie à l'heure du Géoweb : retour sur les nouveaux modes de représentation spatiale des données numériques”](https://shs.hal.science/halshs-01468314v1) (cartography in the age of the Geoweb: a look back at the new modes of spatial representation of digital data), HAL-SHS.
- [“Visualiser les données spatiales sur le Web”](https://medium.com/@BorisMericskay/visualiser-les-donn%C3%A9es-spatiales-sur-le-web-f983e9e147d0) (visualizing spatial data on the Web), Medium.
- Full HAL CV: [cv.hal.science/boris-mericskay-r2](https://cv.hal.science/boris-mericskay-r2) — 78 documents, 90% open access. ORCID 0000-0002-4613-1597.

### Course material — SIGAT master's program, Université Rennes 2
Directory: `https://sites-formations.univ-rennes2.fr/mastersigat/Cours/`
- [`CM_SemiologieGraphique_2020.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/CM_SemiologieGraphique_2020.pdf) — 116 slides, CC BY-SA license
- [`Intro_Dataviz.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/Intro_Dataviz.pdf) — 101 slides
- [`geoviz2018.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/geoviz2018.pdf) · [`Spatiotemporel.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/Spatiotemporel.pdf) · [`AnalysespatialeM1.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/AnalysespatialeM1.pdf)
- [`Leaflet.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/Leaflet.pdf) · [`Cours_MapboxGL.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/Cours_MapboxGL.pdf)
- [`Intro_Overpass.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/Intro_Overpass.pdf) · [`OverpassTurbo_SOTM_2022.pdf`](https://sites-formations.univ-rennes2.fr/mastersigat/Cours/OverpassTurbo_SOTM_2022.pdf)
- Index of the course material: [bmericskay.github.io/portfolio/cours.html](https://bmericskay.github.io/portfolio/cours.html)

### Talks
- [CartoStats](https://cartosta.sciencesconf.org/data/pages/CartoStats_B_Mericskay.pdf) — “(géo)Visualisation de données statistiques sur le Web” ((geo)visualization of statistical data on the Web)
- [GeoViz](https://geoviz.sciencesconf.org/data/pages/Visualisation_de_donnees_spatiales_sur_le_Web.pdf) — “Géovisualisation de données sur le Web” (geovisualization of data on the Web)
- [FOSS4G-fr 2016](https://osgeo-fr.github.io/presentations_foss4gfr/2016/J1/Foss4G_Communication-enseignement-BMericskay.pdf) — “Enseigner la géomatique à l'université” (teaching geomatics at university)

### Tutorials
- [“Faire de la cartographie thématique sur le Web avec MapLibreGL”](https://geotribu.fr/articles/2021/2021-04-20_maplibre_site_ressource/) (thematic web mapping with MapLibreGL), Geotribu, 2021.
- [“Faire une carte en ligne (tuiles vectorielles + WebGL) 100 % libre”](https://geotribu.fr/articles/2021/2021-02-23_carte_ligne_libre/) (making a 100% free and open web map: vector tiles + WebGL), Geotribu, 2021.

### “Carte blanche” webinars — GdR MAGIS, research action AR9, which he co-leads
Index: [magisar9.github.io/webinaires](https://magisar9.github.io/webinaires/) — monthly, a 30 min filmed talk plus 30 min of discussion, slides published.
- **#22** (Jan 21, 2026) — Trémélo & Zanin, “La sémiologie graphique est-elle obsolète ?” (is graphic semiology obsolete?) — 2024 survey
- **#23** (Feb 12, 2026) — Thollot, “micmap : géovisualisation 3D stylisée” (micmap: stylized 3D geovisualization) — expressive rendering applied to the 3D map
- **#28** (Jul 8, 2026) — Pillot, “Cartographier l'incertitude” (mapping uncertainty) — four sources of uncertainty, a composite confidence score ([audio](https://pod.unistra.fr/video/63277-cartographier-lincertitude/))
- **#16** (Jun 25, 2024) — Jégou, “Des cartes et des couleurs : enquête sur les gradients” (maps and colors: an inquiry into gradients) — fit the gradient's lightness to the progression of the data ([preprint](https://hal.science/hal-04270875))
- **#4** (Apr 2023) — Douet, “na.rm=TRUE — requête, interactivité et gestion des données manquantes” (querying, interactivity and handling missing data)
- **#8** (Oct 2023) — Gaffuri, “Gridviz : cartographie en ligne de données carroyées” (Gridviz: web mapping of gridded data)

### Code
- [github.com/bmericskay](https://github.com/bmericskay) · [gitlab.huma-num.fr/bmericskay](https://gitlab.huma-num.fr/bmericskay) · [portfolio](https://bmericskay.github.io/portfolio/)
