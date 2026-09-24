/*
 * LAYER FUSIONS — the one place that says which rows are ONE SUBJECT.
 *
 * `layerTaxonomy.js` answers "what is this dataset, and which group does it
 * belong to". It cannot answer the question this file exists for: "are these
 * two rows the same subject seen twice?" That is a statement ABOUT A PAIR, and
 * a per-layer field can only ever hold half of it.
 *
 * The audit that produced this table counted fourteen subjects drawn by two to
 * four rows each — DVF sold three times, the road measured four ways, three
 * registers of power plants, education split across two ministries. Every one
 * of those splits is an artifact of the order the layers merged in, not a
 * distinction a reader asked for. A panel that lists them separately makes the
 * reader do the join.
 *
 * WHAT A FUSION IS, AND WHAT IT IS NOT
 *
 * A fusion is a PRESENTATION decision: one row in the Data Layers panel, whose
 * toggle carries several registered layers, with one chip per companion so the
 * reader can still take the subject apart. It deletes NOTHING — not a module,
 * not a source, not a share token. Every fused layer keeps:
 *
 *   - its own id, module, lifecycle and cache;
 *   - its own share token, so links already sent keep restoring exactly what
 *     they always restored (a companion is enabled by token, with or without
 *     its primary — the row simply reads as partly on);
 *   - its own map legend entry, which `_refreshMapLegend` gathers from
 *     `getAll()` and therefore never went through a row in the first place;
 *   - its own credit line.
 *
 * That is deliberate and it is the whole reason this is a table and not a
 * rewrite: merging two layer MODULES is a data migration with a rollback cost,
 * merging two ROWS is a line in this file. Where a deeper merge is genuinely
 * owed — the 56 power plants held by three registers, the médecins family
 * `amenities-fr` still draws — the note on the entry says so, and the fusion
 * is the first half of that work, not a substitute for it.
 *
 * WHY NOT `showInTogglePanel: false` ON THE COMPANION
 *
 * Because that flag says "you enter this through another surface" — it is what
 * `military-awareness` uses, and it leaves the layer with no control at all in
 * the panel. A companion is not hidden: it is a chip, one click away, showing
 * its own on/off state. The reader who wants Sitadel alone can still have it.
 *
 * EXHAUSTIVENESS IS ENFORCED, NOT DOCUMENTED
 *
 * `validateLayerFusions()` runs at import and cross-checks against
 * REGISTERED_LAYER_IDS: an unknown id, an id claimed twice, a primary that is
 * itself somebody's companion, or a fusion with no companion is a BOOT
 * FAILURE. Same contract, same reason, as the taxonomy next door and the
 * duplicate-token assertion in `layerState.js`.
 */

import { REGISTERED_LAYER_IDS } from './layerState.js';
import { LUCIDE_ICONS, lucideIconMask } from './lucideIcons.js';
import messages from './layerFusions.i18n.js';

/**
 * Marks a row this table built, as opposed to one a test passed in.
 *
 * `validateLayerFusions` runs at import and may not read the page's language
 * (`src/i18n/importSafety.test.mjs`), so for a row of THIS table it reads the
 * catalog's definition — including when the catalog has nothing to say, which
 * is how a fusion with no primary chip stays legal. A synthetic row carries
 * its own strings and is checked exactly as it was.
 */
const FROM_CATALOG = Symbol('surplomb.fusion.catalog');

/**
 * A companion, with its words hung off its id.
 *
 * `chip` and `title` are getters over `layerFusions.i18n.js`, read when the
 * strip is painted: the table states WHICH layers are one subject, the catalog
 * states what they are called, and neither has to know the page's language
 * until something is drawn. A companion with no entry in the catalog fails
 * `validateLayerFusions` at import.
 *
 * @param {{id: string, optIn?: boolean, disabled?: boolean}} companion
 * @returns {object} Frozen companion descriptor.
 */
function fusionCompanion(companion) {
  return Object.freeze({
    ...companion,
    [FROM_CATALOG]: true,
    get chip() { return messages().chips[companion.id]; },
    get title() { return messages().titles[companion.id] ?? ''; },
  });
}

/**
 * A fusion, with its primary's chip hung off the primary's id.
 * @param {{primary: string, primaryToggle?: boolean, companions: object[]}} fusion
 * @returns {object} Frozen fusion.
 */
function fusionRow(fusion) {
  return Object.freeze({
    ...fusion,
    [FROM_CATALOG]: true,
    get primaryChip() { return messages().chips[fusion.primary]; },
    companions: Object.freeze(fusion.companions.map(fusionCompanion)),
    ...(fusion.tiles ? {
      tiles: Object.freeze(fusion.tiles.map((tile) => Object.freeze({
        ...tile,
        ...(tile.on ? { on: Object.freeze({ ...tile.on }) } : {}),
        ...(tile.off ? { off: Object.freeze({ ...tile.off }) } : {}),
      }))),
    } : {}),
    ...(fusion.rowTiles ? {
      rowTiles: Object.freeze(fusion.rowTiles.map((tile) => Object.freeze({
        ...tile,
        ids: Object.freeze([...tile.ids]),
      }))),
    } : {}),
  });
}

/**
 * The chip a row or a companion declares, without resolving a locale.
 *
 * `own` is a THUNK and not a value: a call evaluates its arguments, and
 * `fusion.primaryChip` is a getter that resolves the locale. Reading it to
 * hand it to a function that was going to ignore it is exactly the import-time
 * read this indirection exists to avoid.
 *
 * @param {object} entry A fusion or a companion.
 * @param {string} layerId The layer the chip belongs to.
 * @param {() => string|undefined} own What the entry carries itself, if any.
 * @returns {string|undefined}
 */
function declaredChip(entry, layerId, own) {
  return entry[FROM_CATALOG] ? messages.definition.chips[layerId]?.fr : own();
}

/**
 * The merged subjects.
 *
 * `primary` is the layer that KEEPS the row: its label, its scope chip, its
 * count and its meta line are what the row shows when nothing is expanded.
 * Choosing it is a product decision, not a size contest — where a fusion mixes
 * a world layer with a French one, the world layer is primary, so the row's
 * scope chip never tells a reader outside France that a row with data for them
 * is French-only.
 *
 * `companions[].chip` is the chip label. It is short on purpose: the chip row
 * is a control strip, not a second list of names. `title` is the tooltip, and
 * it is where the honest hedge goes.
 *
 * `primaryChip` is the same thing for the layer that KEEPS the row, and it
 * exists for the MAP KEY rather than for the panel — the primary has no chip
 * because the row's own toggle is its control. When two or more members of a
 * fusion publish a legend at once, `_refreshMapLegend` prints the row name once
 * and then one sub-block per member, titled by its chip; without this field the
 * primary's sub-block would be titled with the row's own name, which says
 * nothing. Measured on « Trafic routier »: four blocks, and the first was
 * called `Trafic routier` under a heading also called `Trafic routier`.
 *
 * It is OPTIONAL, and only the fusions that can currently split their key
 * carry one. A missing `primaryChip` falls back to the layer's display name,
 * and the renderer drops a sub-title that would only repeat the row's — so a
 * fusion whose primary gains a key later degrades to today's rendering rather
 * than to a wrong name. Add one when that happens.
 *
 * `primaryToggle: true` promotes that same label to a CHIP ON THE STRIP, so the
 * primary can be switched off while the row stays on. It requires
 * `primaryChip`, because a chip with no label is a blank button.
 *
 * IT IS THE EXCEPTION, AND THE RULE ABOVE IS STILL THE RULE. On almost every
 * fusion the primary IS the subject and the companions are variants of it — the
 * row's own toggle is the primary's control, and a chip for it would be a
 * second switch for the same thing sitting next to the first. `primaryToggle`
 * is for the fusions where the members are PEERS: « Infrastructure numérique »
 * carries data centres, submarine cables and radio masts, three different
 * objects that happen to share a shelf, and no one of them is the row. Without
 * the flag the reader could add the other two and never subtract the first —
 * measured on that row, where the 4 351 data centres were unswitchable for as
 * long as the reader wanted to look at antennas.
 *
 * `tiles` MOVES A PEER ROW'S CONTROLS INTO THE MAP KEY. Each member becomes a
 * tile in the row's block of the key — its icon, its name and a switch — and
 * the row in the panel keeps its own toggle and nothing else: the fusion chips
 * leave the strip, and so do the members' option chips, which the key prints
 * as segments over the classes they steer. Moved, never copied: two sets of
 * switches for one row is the duplication the key already refused for
 * swatches (see `_syncRowControls` in manager.js).
 *
 * The key is where the reader is already looking while the row is on — it
 * names what each member draws, and since the mock of 2026-09-22 it is where
 * the approved design puts the switches. A reader who came for the antennas
 * sees three tiles and the classes of the one that is lit, instead of eight
 * chips on a 300 px row whose key sits on the other side of the screen.
 *
 * The array lists EVERY member the row offers, primary included, each once,
 * in the order the tiles are laid out — which is a design order and not the
 * strip's: the mock pairs the wired backbone (cables, halls) on one line and
 * the radio network on the next. `icon` names a glyph of `lucideIcons.js`;
 * `color` is the colour that layer draws on the map, so a lit tile's icon is
 * also a swatch. Both are literals because this table is imported at boot and
 * the layer modules that own those colours are not; `layerFusions.test.mjs`
 * pins each one to its module's constant. Requires `primaryToggle`, since the
 * primary's tile needs the primary's chip as its name.
 *
 * A TILE CAN SWITCH PART OF A LAYER (`part`). One layer module can draw two
 * things a reader asks for separately: `anfr-fr` draws the masts AND the ARCEP
 * coverage under them, and the mock gives the coverage a tile of its own —
 * « Couverture 4G » lit with the masts dark is the dead-zone map alone. A
 * member split this way lists one tile per part, never a whole-layer tile
 * beside them. Each part names the layer params that light it (`on`) and put
 * it out (`off`), which must be options the share link already carries, so a
 * link keeps what the tiles say. `lit` says which parts the layer is lit with
 * by default — the state it goes back to when its last lit part is put out, so
 * that the row's toggle then lights it the way it always has; at least one
 * part per layer has it, or that toggle would switch on a layer that draws
 * nothing. (The row's toggle itself restores whatever the reader left: put out
 * and back on, a row showing the coverage alone shows it alone again.) The
 * label and tooltip of a part come from the
 * catalog's `tiles` entry (`<id>:<part>`), and fall back to the member's chip.
 *
 * `exclusive: true` MAKES THE TILES MODES. Pressing a dark tile lights its
 * member and puts every other lit member of the row out, so exactly one is on
 * at a time — « Incendies », whose two tiles are two ways of looking at fire
 * on two different grounds. Only whole-layer tiles, and only with `tiles`:
 * the row's toggle still lights what it always lit (the primary and its
 * followers), and a share link can still carry both, since the rule is about
 * a press and not a state.
 *
 * `rowTiles` PUTS THE SWITCHES UNDER THE ROW INSTEAD, in the Layers panel —
 * where the approved mock of « Urbanisme » (2026-09-23) draws them: two wide
 * tiles side by side, « Permis & travaux » and « Règles d'urbanisme », then the
 * period, then a hint. The key keeps what it is for, the classes and the card
 * of the project the reader clicked. Like `tiles`, it replaces the row's chip
 * strip, and a row has one or the other, never both.
 *
 * A row tile switches a GROUP of members (`ids`), not one: the two permit
 * layers are one subject drawn on two footings, in one palette, and a reader
 * has one question to ask them — show the projects or not. A tile reads lit
 * while any of its members is on; pressed lit it puts them all out, pressed
 * dark it lights them all. Every member the row offers sits in exactly one
 * tile. The words come from the catalog's `rowTiles` entry (`<primary>:<key>`),
 * and a tile may carry a `hint` there — the line the panel prints under the
 * tiles while that tile is lit (« Sélectionnez un projet sur la carte. »).
 *
 * A row whose members share a tile also shares ONE block in the map key: the
 * key merges their classes, which is only honest because they share a palette.
 *
 * A ROW TILE WITH AN `icon` IS A LINE, NOT A SQUARE. The approved mock of
 * « Aéroports » (2026-09-24) stacks its tiles one per line: a glyph, the name,
 * one line saying what it shows (the catalog's `blurb`), and a round light that
 * is lit with the tile. `icon` names a glyph of `lucideIcons.js`, as a key
 * tile's does. A row gives an icon to every tile or to none, since a list half
 * of squares and half of lines would be two layouts in one strip.
 *
 * `optIn: true` means the row's toggle does NOT switch that companion on. It
 * is for a companion whose cost is real and whose value is conditional — the
 * reader asks for it by pressing the chip. Every other companion follows the
 * row, which is the point of the row.
 *
 * There are two shapes of "conditional" here and they are worth telling apart.
 * `comparables-fr` is conditional on the READER: an empty dossier draws nothing
 * until somebody builds one. `comptages-fr` is conditional on the CAMERA: it
 * holds Paris and nothing else, so a row toggle pressed anywhere else was
 * paying for a layer that could not draw. What they share is that the row
 * cannot know the answer and the chip can ask.
 *
 * A companion that fills a HOLE in its primary is never `optIn`, whatever its
 * geography: `idfm-network` is on this row precisely because Île-de-France
 * publishes no live vehicle, and making it opt-in would put the capital back to
 * zero on a row that promises transit. Its territory is declared through
 * `layerCoverage.js` instead, which dims a control without unplugging it.
 *
 * `disabled: true` is the third state, and it is NOT a weaker `optIn`. `optIn`
 * says "the reader asks for this with the chip"; `disabled` says THERE IS NO
 * CHIP — the companion is withdrawn from the interface entirely, while staying
 * a registered layer with its module, its share token, its credit line and its
 * tests intact. `fusionCompanionsFor` drops it, so the row shows no chip for it
 * and `fusionToggleGroupFor` never switches it on; `fusedIntoFor` deliberately
 * still returns the primary, which is what keeps the layer OFF the panel
 * instead of promoting it back to a row of its own. The matching half lives in
 * `layerState.js` (`DISABLED_LAYER_IDS`), which is what stops a stored session
 * or an old share link from bringing it back with no control to switch it off.
 *
 * Deleting the entry would do the panel half and nothing else; this flag is the
 * reversible form of the same decision — take it out to give the chip back.
 */
export const LAYER_FUSIONS = Object.freeze([
  // ── 1. Planning ──────────────────────────────────────────────────────────
  // ONE question in two tenses: what MAY be built on this ground, and what HAS
  // been allowed on it. The PLU zoning draws the rule, Sitadel draws the
  // permits granted under it, and both belong on one row — reading a permit
  // with no way to reach the zoning is reading an answer with the question
  // torn off.
  //
  // `ads-fr` and `sitadel-fr` were already one row before this, for a narrower
  // reason that still holds: they read the SAME four Sitadel files through the
  // same shared module, and what differed was placement — `ads-fr` geocodes
  // through the BAN and lands within ~400 m, `sitadel-fr` lands on the
  // cadastral parcel. That is a precision fact about one subject. This entry
  // keeps that pair intact and puts the zoning above it.
  //
  // THE PERMITS ARE THE ROW, AND THE ZONING IS ASKED FOR (2026-09-23). The
  // approved mock of this row opens on « Permis & travaux » with « Règles
  // d'urbanisme » dark, and the operator asked for exactly that: switching
  // « Urbanisme » on used to wash every plot in view with the PLU's colours,
  // then lay the permits' own colours over them, and a reader who came for a
  // building site read two palettes on one parcel. So `ads-fr` keeps the row
  // (its name, its count, its meta line), `sitadel-fr` follows it, and the
  // zoning is `optIn`: one tile away, never lit by the row's toggle.
  //
  // `ads-fr` rather than `sitadel-fr` as the primary: it owns the period the
  // tiles' select steers (`months`, the share link's `au.w`), and it sat right
  // under the zoning in the taxonomy, so the row does not move in its group.
  //
  // THE MEMBERS ARE TILES UNDER THE ROW (`rowTiles`), as the mock draws them:
  // the two permit layers are ONE tile, since they are one subject drawn on two
  // footings and share one palette (`permitProjects.js`), and the zoning is the
  // other. Eight chips — three members, three windows, two halves — become two
  // tiles and one select.
  fusionRow({
    primary: 'ads-fr',
    companions: [
      { id: 'sitadel-fr' },
      { id: 'urbanisme-gpu', optIn: true },
    ],
    rowTiles: [
      { key: 'permits', ids: ['ads-fr', 'sitadel-fr'] },
      { key: 'rules', ids: ['urbanisme-gpu'] },
    ],
  }),

  // ── 2. Property prices ───────────────────────────────────────────────────
  // Three rows for one question: "combien vaut ce sol". They read the same
  // register — `avis-valeur` already reuses the DVF silhouette — and the
  // comparables dossier is a tool applied to that same selection.
  //
  // THE CHIPS ARE VERBS. `Avis de valeur` is the trade's word for the document
  // and it named the LAYER rather than what pressing the chip does; beside a
  // row called « Prix de l'immobilier » a reader had no way to tell that one
  // of them was about a specific door. The row answers "what does it cost
  // around here"; the chips say what else you can ask.
  //
  // THE ESTIMATE IS OPT-IN since 2026-09-21. It followed the row, so every
  // reader who asked what the street sold for also got a valuation of a 60 m²
  // flat nobody had described — a second block in the key and a second scan
  // of the same editions — and the operator asked for the chip to start
  // unticked. What a property is worth is a question about a door the reader
  // has in mind, so the chip is where it is asked.
  fusionRow({
    primary: 'dvf-sales',
    companions: [
      { id: 'avis-valeur', optIn: true },
      {
        id: 'comparables-fr',
        // Opt-in: the dossier is the reader's OWN selection, and an empty
        // dossier switched on by a row toggle draws nothing while costing a
        // lifecycle. It is a tool, and a tool is picked up.
        optIn: true,
      },
    ],
  }),

  // ── 3. Schools ───────────────────────────────────────────────────────────
  // The taxonomy already stated the problem in prose next to `sup-fr`: "one
  // subject split across two ministries, and the taxonomy should not repeat
  // the split". It repeated it anyway, as two rows. It stops here.
  fusionRow({
    primary: 'schools-fr',
    companions: [
      { id: 'sup-fr' },
    ],
  }),

  // ── 4. Ships and ports ───────────────────────────────────────────────────
  // A port is where the vessels stop. The two rows shared nothing in code and
  // everything in subject; the destination field of an AIS message is a port
  // name, unresolved to this day.
  //
  // THE BUOYS JOIN THEM, and the join is already written: `layerJoins.js`
  // carries vessel → sea state, so a ship's card reads the nearest mooring's
  // wave height today while the mooring sat in a group of its own. What a buoy
  // reports — swell, wind, water temperature — is a fact about the water a
  // vessel is in, and it has no reader outside that question.
  fusionRow({
    primary: 'ais-live-vessels',
    companions: [
      { id: 'local-ports' },
      { id: 'marine-buoys' },
    ],
  }),

  // ── 5. Catchment area ────────────────────────────────────────────────────
  // The fiche IS the card of the ring: `implantation-fr` joins four layers
  // inside the isochrone this row draws, and neither is readable without the
  // other.
  fusionRow({
    primary: 'isochrone-fr',
    companions: [
      { id: 'implantation-fr' },
    ],
  }),

  // ── 6. Airports ──────────────────────────────────────────────────────────
  // `bruit-fr` leaves RISQUES & ENVIRONNEMENT to become a chip here. The
  // taxonomy's objection is on the record — "the polygon is about the
  // aircraft, not about the ground under it" — and that is exactly the
  // argument for filing it with the aircraft. The ground-level reading is
  // owed elsewhere: the address radiography, where a PEB zone is a fact about
  // a door.
  //
  // THE MEMBERS ARE TILES UNDER THE ROW (2026-09-24), one per line as the
  // approved mock draws them: « Les aéroports » and « Bruit & urbanisme ». The
  // mock's third tile, « Aides à l'isolation », was the PGS, which has left the
  // app. The chip strip goes with them, so the airports' display floor is a
  // menu under the tiles, as the permits' period is.
  fusionRow({
    primary: 'local-airports',
    companions: [
      { id: 'bruit-fr' },
    ],
    rowTiles: [
      { key: 'airports', ids: ['local-airports'], icon: 'plane' },
      { key: 'noise', ids: ['bruit-fr'], icon: 'audio-lines' },
    ],
  }),

  // ── 7. Rivers ────────────────────────────────────────────────────────────
  // The two module headers already cite each other in prose. Vigicrues paints
  // the reach, Hub'Eau measures the flow inside it.
  fusionRow({
    primary: 'vigicrues',
    companions: [
      { id: 'hubeau-hydro' },
    ],
  }),

  // ── 8. Weather ───────────────────────────────────────────────────────────
  // An inventory of instruments has value through its readings. The vigilance
  // says what is coming, the stations say what is measured.
  fusionRow({
    primary: 'meteofrance-vigilance',
    companions: [
      { id: 'meteo-stations-fr' },
    ],
  }),

  // ── 9. Electricity: the grid and the plants that feed it ────────────────
  // ONE row since 2026-09-21, asked for by name: « Réseau électrique » and
  // « Centrales électriques » were two rows for the question the landing
  // page's scene already asks as one — « Le réseau électrique et ce qu'il
  // produit ». The scene lit the grid and the RTE output; the row now lights
  // the same pair, so pressing it by hand opens what the link opens.
  //
  // `power-grid` is primary by the rule stated above: it is the WORLD layer
  // (OSM lines everywhere), and a row chipped `FR` would tell a reader in
  // Madrid the grid under them is not for them. The three registers are FR.
  //
  // PEERS, SO THE GRID GETS A CHIP (`primaryToggle`), like « Infrastructure
  // numérique »: a line and a power station are two different objects, and a
  // reader who came for the stations must be able to take the lines away.
  //
  // THE EDF REGISTER AND THE HYDRO REGISTER ARE `optIn`. They followed the old
  // plants row, and on this one they would draw the same stations again: 56
  // plants are held by more than one register, and under the relief columns
  // (`rteGeneration.js`) the EDF register puts a second icon on every nuclear
  // site the column already names. The hydro register adds the whole French
  // fleet — 2 742 plants, down to a 40 kW mill. Both are one chip away, and
  // both stay what they were.
  //
  // What is still owed, as before: the deduplication by EIC and by ODRÉ id.
  // Until it lands, the chips let a reader see the same plant twice on purpose
  // rather than by accident.
  fusionRow({
    primary: 'power-grid',
    primaryToggle: true,
    companions: [
      { id: 'rte-generation' },
      { id: 'edf-power-plants', optIn: true },
      { id: 'fr-hydro-plants', optIn: true },
    ],
  }),

  // ── 10. Public transit ───────────────────────────────────────────────────
  // Vehicles where the operator publishes them, stops with their frequency
  // where it does not. Île-de-France is the second case, which is why the
  // capital had zero vehicles on the row that promised them.
  //
  // ONE IDFM chip and not two. `idfm-frequency` was a second chip on this row
  // until 2026-09-10, drawing the SAME stops — 95.6 % of its 36 502 join
  // `arrets.arrid` — so a reader who wanted "how good is the transport here"
  // had to know to press both, and the frequency half answered a click with a
  // card the network half could not see. The two modules are now one layer and
  // one card; see `idfmNetwork.js` for what the merge kept and what it dropped.
  fusionRow({
    primary: 'transit-fr',
    companions: [
      { id: 'idfm-network' },
    ],
  }),

  // ── 11. Bikes and shared vehicles ────────────────────────────────────────
  // `bikeshare` is primary although it is the smaller set: it is the one with
  // data outside France, and a row that carried the `FR` chip would tell a
  // reader in Montréal that a layer serving them is French-only.
  fusionRow({
    primary: 'bikeshare',
    companions: [
      { id: 'shared-mobility-fr' },
      // WITHDRAWN FROM THE INTERFACE on 2026-09-14, by product decision, and
      // kept here rather than deleted: the module, the shipped pack, the share
      // token `vp`, the credit line and `qa-velo-pulse.mjs` all still work, and
      // this entry is the one line to remove to hand the chip back. While the
      // flag stands there is no « Semaine type » chip on the row and the row's
      // toggle no longer carries the layer.
      { id: 'velo-pulse-fr', disabled: true },
    ],
  }),

  // ── 12. Road traffic ─────────────────────────────────────────────────────
  // The same road measured four ways: a modelled ratio, a declared status, an
  // event list and a loop count. Three of the four already share the RRN
  // centreline pack.
  //
  // Two of them are territorial opposites and the row now shows it. Over Paris
  // `road-status-fr` goes quiet — DIRIF publishes neither stations nor status —
  // and `comptages-fr` is the only control on this globe holding a measured
  // vehicle count. Everywhere else the pair reads the other way round. Neither
  // fact was legible on the strip before `layerCoverage.js`: both chips looked
  // equally alive over a city where exactly one of them had data.
  fusionRow({
    primary: 'traffic',
    companions: [
      { id: 'road-status-fr' },
      { id: 'road-events-fr' },
      {
        id: 'comptages-fr',
        // The territory is IN the label, not only in the tooltip — see the
        // catalog: this chip sits on a row that works everywhere on Earth, and
        // a bare "Comptages" beside "État du réseau" and "Événements" reads as
        // the third national feed rather than as a layer whose entire extent is
        // 12,6 km by 10,0 km.
        // Opt-in: the row toggle used to carry this one, so switching road
        // traffic on over Tokyo switched on a Paris-only layer, fetched its
        // chunk, and contributed SEVEN hour chips to a strip of fifteen — all
        // steering a layer with no payload. Its cost is real and its value is
        // geographic, which is exactly the case `optIn` was written for.
        optIn: true,
      },
    ],
  }),

  // ── 13. Territory ────────────────────────────────────────────────────────
  // Three choropleth engines over the same contours. The row merge is the
  // first half; the shared indicator selector the audit asks for is the
  // second. The delinquance layer's anti-defamation guard travels WITH its
  // chip — it lives in that module and nothing here weakens it.
  fusionRow({
    primary: 'filosofi-fr',
    companions: [
      { id: 'delinquance-fr' },
      { id: 'petite-enfance-fr' },
    ],
  }),

  // ── 14. Digital infrastructure ───────────────────────────────────────────
  // `local-datacenters` is primary for the same reason `bikeshare` is: it has
  // data everywhere. The submarine cables stay — they are already here, they
  // are drawn, and a French focus is a reason to ADD French layers, never a
  // reason to unplug a world one.
  //
  // THREE PEERS, SO THE PRIMARY GETS A CHIP TOO (`primaryToggle`). A hall, a
  // cable and a mast are three different objects; none of them is "the subject
  // the other two qualify", which is the shape every other fusion here has. The
  // row's toggle alone therefore left the data centres forced on under any
  // reader who came for the antennas.
  //
  // THE MEMBERS ARE TILES IN THE KEY since 2026-09-22 (`tiles`), after the
  // approved mock of this row: the strip held three member chips and five
  // coverage chips, and the key that says what each of them draws sat on the
  // other side of the screen.
  //
  // THE 4G COVERAGE IS A FOURTH TILE (lot 3 of that mock), although it is
  // drawn by the antennas' module: the dead zones are read with no mast on
  // them as often as with, and before this the coverage could only be had with
  // 60 000 dots over it. The row's toggle lights the masts and not the
  // coverage, as it always did.
  fusionRow({
    primary: 'local-datacenters',
    primaryToggle: true,
    tiles: [
      { id: 'telegeography-submarine-cables', icon: 'cable', color: '#39d5ff' },
      { id: 'local-datacenters', icon: 'database', color: '#a98bff' },
      {
        id: 'anfr-fr',
        part: 'masts',
        icon: 'radio-tower',
        color: '#ffb238',
        on: { masts: true },
        off: { masts: false },
        lit: true,
      },
      {
        id: 'anfr-fr',
        part: 'coverage',
        icon: 'signal-high',
        // The dead-zone rung, which is what the tile opens on.
        color: '#f0287a',
        on: { coverage: 'gaps' },
        off: { coverage: 'off' },
        lit: false,
      },
    ],
    companions: [
      { id: 'telegeography-submarine-cables' },
      { id: 'anfr-fr' },
    ],
  }),

  // ── 15. Live flights ─────────────────────────────────────────────────────
  // The military register already runs while its row is off — it feeds the
  // CONTACTS roster — and it mirrors `flights` options by explicit registry
  // disposition. It was a second row for the same sky.
  fusionRow({
    primary: 'flights',
    companions: [
      { id: 'military' },
    ],
  }),

  // ── 16. Fires (« Incendies ») ────────────────────────────────────────────
  // The README already says what these two rows are: "what burns now / what
  // burnt". Same sensor (VIIRS through FIRMS), same subject, two tenses — and
  // the past tense was holding a row of its own for an event that ended on
  // 1 August 2026 and cannot change again.
  //
  // NO SEPARATOR IN THE CHIP LABEL, unlike « Comptages · Paris » on the traffic
  // row. Since 2026-09-14 a dark row prints its chips' names as TEXT on the meta
  // line, joined by that same ` · `, so a label carrying one reads there as two
  // entries — measured on this very row.
  //
  // `optIn`, for the reason `comptages-fr` is: the archive is 2,6 MB of frozen
  // detections over ONE department, and a row toggle pressed over California
  // used to be able to fetch it. Its cost is real and its value is
  // geographic — exactly the case the flag was written for.
  //
  // THE KEY ASYMMETRY IS WORTH KNOWING BEFORE READING THE ROW. The row's auth
  // facet comes from the primary, so it will say a FIRMS key is needed; the
  // archive underneath needs none and draws from the repo. That is the honest
  // reading of a row whose live half is gated and whose historical half is
  // not, and the chip title says so rather than leaving a reader to discover
  // that the greyed row still has something to show.
  //
  // TWO MODES, AS TILES IN THE KEY (2026-09-23), after the approved mock of
  // « Incendies »: « Détections récentes » and « Grands incendies » are the
  // row's two ways of looking at fire, so each is a tile, and they are
  // `exclusive` — pressing one puts the other out. The recent world
  // detections and a replayed July fire answer different questions on
  // different grounds (a plain globe, a night map over Gironde), and drawn
  // together they would read as one set of dots.
  fusionRow({
    primary: 'local-firms',
    primaryToggle: true,
    exclusive: true,
    tiles: [
      // The orange of the detections' heat key, and the ember red of the
      // replay's first ring.
      { id: 'local-firms', icon: 'flame', color: '#ffa500' },
      { id: 'gironde-megafire-2026', icon: 'rotate-ccw-clock', color: '#ff4a36' },
    ],
    companions: [
      { id: 'gironde-megafire-2026', optIn: true },
    ],
  }),
]);

/** A tile's colour is the map's, written the way the layer modules write it. */
const TILE_COLOR = /^#[0-9a-f]{6}$/i;

/** A part's `on` or `off`: a plain object of params, at least one. */
function isParamSet(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

/**
 * Check the parts of ONE member split across several tiles.
 * @param {string} id The member.
 * @param {object[]} tiles Its tiles, every one carrying a `part`.
 * @throws {Error} On a malformed part set.
 */
function validateTileParts(id, tiles) {
  if (tiles.length < 2) throw new Error(`Fusion tile part needs a sibling: ${id}`);
  const parts = new Set();
  for (const tile of tiles) {
    if (typeof tile.part !== 'string' || !tile.part) throw new Error(`Fusion tile part must be a name: ${id}`);
    if (parts.has(tile.part)) throw new Error(`Fusion tile listed twice: ${id}:${tile.part}`);
    parts.add(tile.part);
    if (!isParamSet(tile.on) || !isParamSet(tile.off)) {
      throw new Error(`Fusion tile part needs on and off params: ${id}:${tile.part}`);
    }
    // The same params, two values: a part that is lit by one key and put out
    // by another could be both at once.
    const onKeys = Object.keys(tile.on).sort().join();
    if (onKeys !== Object.keys(tile.off).sort().join()) {
      throw new Error(`Fusion tile part must switch the same params on and off: ${id}:${tile.part}`);
    }
    if (typeof tile.lit !== 'boolean') throw new Error(`Fusion tile part lit flag must be a boolean: ${id}:${tile.part}`);
  }
  if (!tiles.some((tile) => tile.lit)) throw new Error(`Fusion tile parts leave the row toggle nothing to light: ${id}`);
}

/**
 * Check a fusion's `tiles`, when it declares any.
 *
 * Every member the row OFFERS gets its tile: a member with no tile would have
 * no switch anywhere, since the strip no longer carries one, and a tile for a
 * withdrawn (`disabled`) companion would switch on a layer the table took out
 * of the interface. A member split into PARTS gets one tile per part and none
 * for the whole.
 * @param {object} fusion
 * @param {string} primary
 * @throws {Error} On any malformed or incomplete tile set.
 */
function validateFusionTiles(fusion, primary) {
  if (fusion.exclusive !== undefined) {
    if (typeof fusion.exclusive !== 'boolean') throw new Error(`Fusion exclusive must be a boolean: ${primary}`);
    if (fusion.exclusive && fusion.tiles === undefined) throw new Error(`Fusion exclusive needs tiles: ${primary}`);
    if (fusion.exclusive && fusion.tiles.some((tile) => tile?.part !== undefined)) {
      throw new Error(`Fusion exclusive tiles must switch whole layers: ${primary}`);
    }
  }
  if (fusion.tiles === undefined) return;
  if (!Array.isArray(fusion.tiles) || fusion.tiles.length === 0) {
    throw new Error(`Fusion tiles must be a non-empty array: ${primary}`);
  }
  if (fusion.primaryToggle !== true) {
    throw new Error(`Fusion tiles need primaryToggle: ${primary}`);
  }
  const offered = [primary, ...fusion.companions
    .filter((companion) => companion.disabled !== true)
    .map((companion) => companion.id)];
  const byMember = new Map();
  for (const tile of fusion.tiles) {
    const id = tile?.id;
    if (!offered.includes(id)) throw new Error(`Fusion tile is not an offered member: ${primary} → ${id}`);
    if (!Object.hasOwn(LUCIDE_ICONS, String(tile.icon))) throw new Error(`Fusion tile has an unknown icon: ${id} → ${tile.icon}`);
    if (typeof tile.color !== 'string' || !TILE_COLOR.test(tile.color)) {
      throw new Error(`Fusion tile colour must be #rrggbb: ${id}`);
    }
    if (!byMember.has(id)) byMember.set(id, []);
    byMember.get(id).push(tile);
  }
  for (const [id, tiles] of byMember) {
    const split = tiles.filter((tile) => tile.part !== undefined);
    if (!split.length) {
      if (tiles.length > 1) throw new Error(`Fusion tile listed twice: ${id}`);
      continue;
    }
    if (split.length !== tiles.length) throw new Error(`Fusion member has a whole tile beside its parts: ${id}`);
    validateTileParts(id, tiles);
  }
  for (const id of offered) {
    if (!byMember.has(id)) throw new Error(`Fusion member has no tile: ${primary} → ${id}`);
  }
}

/**
 * Check a fusion's `rowTiles`, when it declares any.
 *
 * Every member the row offers is in exactly one tile — a member in none would
 * have no switch, since the strip is gone, and a member in two would be lit by
 * one tile and put out by the other. A withdrawn (`disabled`) companion is in
 * none.
 * @param {object} fusion
 * @param {string} primary
 * @throws {Error} On any malformed or incomplete tile set.
 */
function validateFusionRowTiles(fusion, primary) {
  if (fusion.rowTiles === undefined) return;
  if (!Array.isArray(fusion.rowTiles) || fusion.rowTiles.length === 0) {
    throw new Error(`Fusion rowTiles must be a non-empty array: ${primary}`);
  }
  if (fusion.tiles !== undefined) throw new Error(`Fusion has both tiles and rowTiles: ${primary}`);
  const offered = [primary, ...fusion.companions
    .filter((companion) => companion.disabled !== true)
    .map((companion) => companion.id)];
  const placed = new Set();
  const keys = new Set();
  const withIcon = fusion.rowTiles.filter((tile) => tile?.icon !== undefined).length;
  if (withIcon !== 0 && withIcon !== fusion.rowTiles.length) {
    throw new Error(`Fusion row tiles have an icon on some tiles only: ${primary}`);
  }
  for (const tile of fusion.rowTiles) {
    const key = tile?.key;
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(key)) {
      throw new Error(`Fusion row tile key must be a kebab-case name: ${primary}`);
    }
    if (keys.has(key)) throw new Error(`Fusion row tile listed twice: ${primary}:${key}`);
    keys.add(key);
    if (tile.icon !== undefined && !Object.hasOwn(LUCIDE_ICONS, String(tile.icon))) {
      throw new Error(`Fusion row tile has an unknown icon: ${primary}:${key} → ${tile.icon}`);
    }
    if (!Array.isArray(tile.ids) || tile.ids.length === 0) {
      throw new Error(`Fusion row tile has no member: ${primary}:${key}`);
    }
    for (const id of tile.ids) {
      if (!offered.includes(id)) throw new Error(`Fusion row tile is not an offered member: ${primary}:${key} → ${id}`);
      if (placed.has(id)) throw new Error(`Fusion member is in two row tiles: ${id}`);
      placed.add(id);
    }
    // Read from the catalog's French side, never through a getter: this runs
    // at import (`src/i18n/importSafety.test.mjs`). A table a test passes in
    // carries its own label.
    const label = fusion[FROM_CATALOG]
      ? messages.definition.rowTiles?.[`${primary}:${key}`]?.label?.fr
      : tile.label;
    if (typeof label !== 'string' || !label.trim()) {
      throw new Error(`Fusion row tile has no label: ${primary}:${key}`);
    }
  }
  for (const id of offered) {
    if (!placed.has(id)) throw new Error(`Fusion member has no row tile: ${primary} → ${id}`);
  }
}

/**
 * Validate the fusion table against the registered layer set.
 * @param {ReadonlyArray<object>} [fusions] Table under test.
 * @param {ReadonlyArray<string>} [registeredIds] Ids the app actually registers.
 * @returns {true} When valid.
 * @throws {Error} On any unknown id, duplicate claim, or empty fusion.
 */
export function validateLayerFusions(
  fusions = LAYER_FUSIONS,
  registeredIds = REGISTERED_LAYER_IDS,
) {
  if (!Array.isArray(fusions)) throw new Error('Layer fusions must be an array');
  const registered = new Set(registeredIds);
  const claimed = new Map();
  const primaries = new Set();
  for (const fusion of fusions) {
    const primary = fusion?.primary;
    if (typeof primary !== 'string' || !primary) {
      throw new Error('Layer fusion missing primary');
    }
    if (!registered.has(primary)) throw new Error(`Unknown fusion primary: ${primary}`);
    if (primaries.has(primary)) throw new Error(`Duplicate fusion primary: ${primary}`);
    primaries.add(primary);
    if (claimed.has(primary)) {
      throw new Error(`Fusion primary is already a companion: ${primary}`);
    }
    // Optional, but never empty and never a non-string: a blank one would
    // render as a sub-block with a title bar and no title.
    // Read from the CATALOG's French side, never through the getter: this runs
    // at import, where reading the page's language is forbidden
    // (`src/i18n/importSafety.test.mjs`). A table a test passes in carries its
    // own chips and is checked exactly as it was.
    const primaryChip = declaredChip(fusion, primary, () => fusion.primaryChip);
    if (primaryChip !== undefined
        && (typeof primaryChip !== 'string' || !primaryChip.trim())) {
      throw new Error(`Fusion primaryChip must be a non-empty string: ${primary}`);
    }
    // Typed rather than truthy, same reason as `disabled` below: a string
    // `'false'` reads as off to a reviewer and as on to JavaScript.
    if (fusion.primaryToggle !== undefined && typeof fusion.primaryToggle !== 'boolean') {
      throw new Error(`Fusion primaryToggle must be a boolean: ${primary}`);
    }
    // A chip with no label is a blank button, and the fallback `primaryChip`
    // has for the MAP KEY (the layer's display name) is the row's own name —
    // which on the strip would read as a chip for the row inside the row.
    if (fusion.primaryToggle === true && !primaryChip) {
      throw new Error(`Fusion primaryToggle needs a primaryChip: ${primary}`);
    }
    claimed.set(primary, primary);
    const companions = fusion.companions;
    if (!Array.isArray(companions) || companions.length === 0) {
      throw new Error(`Fusion has no companion: ${primary}`);
    }
    for (const companion of companions) {
      const id = companion?.id;
      if (typeof id !== 'string' || !id) throw new Error(`Fusion companion missing id: ${primary}`);
      if (!registered.has(id)) throw new Error(`Unknown fusion companion: ${id}`);
      if (claimed.has(id)) throw new Error(`Layer claimed by two fusions: ${id}`);
      const chip = declaredChip(companion, id, () => companion.chip);
      if (!chip || typeof chip !== 'string') {
        throw new Error(`Fusion companion missing chip label: ${id}`);
      }
      if (chip === primaryChip) {
        throw new Error(`Fusion companion repeats the primary's chip: ${id}`);
      }
      // Typed rather than truthy: `disabled: 'false'` reads as "on" to a
      // reviewer and as "off" to JavaScript, and the whole point of the flag
      // is that a reader of this table can see which layers are offered.
      if (companion.disabled !== undefined && typeof companion.disabled !== 'boolean') {
        throw new Error(`Fusion companion disabled flag must be a boolean: ${id}`);
      }
      claimed.set(id, primary);
    }
    // Row tiles first: a row carrying both kinds is refused as such, before
    // the key tiles' own rules would complain about half of it.
    validateFusionRowTiles(fusion, primary);
    validateFusionTiles(fusion, primary);
  }
  // A companion that is itself a primary would render a row AND a chip for the
  // same layer, which is the exact duplication this table exists to remove.
  for (const [id, owner] of claimed) {
    if (id !== owner && primaries.has(id)) {
      throw new Error(`Fusion companion is also a primary: ${id}`);
    }
  }
  return true;
}

validateLayerFusions();

const FUSION_BY_PRIMARY = new Map(LAYER_FUSIONS.map((fusion) => [fusion.primary, fusion]));
// The offered companions, filtered ONCE at import rather than per call: the
// table is frozen, so the answer cannot change, and `fusionToggleGroupFor` is a
// public entry point a caller is free to put in a loop.
const OFFERED_BY_PRIMARY = new Map(LAYER_FUSIONS.map((fusion) => {
  const offered = fusion.companions.filter((entry) => entry.disabled !== true);
  return [fusion.primary, offered.length ? Object.freeze(offered) : null];
}));
// Frozen once at import, like OFFERED_BY_PRIMARY above and for the same
// reason: the table cannot change, and the panel asks for this on every repaint.
const PRIMARY_CHIP_BY_ID = new Map(LAYER_FUSIONS
  .filter((fusion) => fusion.primaryToggle === true)
  .map((fusion) => [fusion.primary, Object.freeze({
    id: fusion.primary,
    // A getter over the fusion's own: this map is built at import, where the
    // page's language is not readable.
    get chip() { return fusion.primaryChip; },
    title: '',
  })]));
const PRIMARY_BY_COMPANION = new Map();
for (const fusion of LAYER_FUSIONS) {
  for (const companion of fusion.companions) {
    PRIMARY_BY_COMPANION.set(companion.id, fusion.primary);
  }
}

/**
 * The companions a row OFFERS — every companion in the table except the ones
 * withdrawn from the interface with `disabled: true`.
 *
 * This is the single filter, and everything the reader can touch is downstream
 * of it: the chip strip, the row toggle's follower group, and the taxonomy's
 * `companions` facet. `null` rather than `[]` when a row has nothing left to
 * offer, so a fusion whose every companion is withdrawn renders exactly like an
 * unfused row instead of like one with an empty control strip.
 * @param {string} layerId Registered layer id.
 * @returns {ReadonlyArray<object>|null} Companion descriptors, or null.
 */
export function fusionCompanionsFor(layerId) {
  return OFFERED_BY_PRIMARY.get(layerId) || null;
}

/**
 * The row a layer disappeared into.
 *
 * A `disabled` companion still answers with its primary, and that is the point:
 * this is the field the panel reads to decide a layer has no row of its own, so
 * a withdrawn companion that answered `null` here would come BACK as a full row
 * in its category. Withdrawn means "no control", not "promoted".
 * @param {string} layerId Registered layer id.
 * @returns {string|null} Primary layer id, or null when the layer keeps a row.
 */
export function fusedIntoFor(layerId) {
  return PRIMARY_BY_COMPANION.get(layerId) || null;
}

/**
 * What to call ONE MEMBER of a fused row — the word the reader pressed.
 *
 * This is the map key's tier-2 title. It deliberately returns the CHIP label
 * and not the layer's taxonomy label, because the chip is the control that put
 * the block on screen: a reader who pressed `Comptages` should read
 * `Comptages` back, not `Comptages routiers (Paris)`, which appears nowhere in
 * the panel.
 *
 * @param {string} rowId The fusion's primary — the layer that keeps the row.
 * @param {string} memberId The primary itself, or one of its companions.
 * @returns {?string} The chip label, or null when there is none to give.
 */
export function fusionMemberChipFor(rowId, memberId) {
  const fusion = FUSION_BY_PRIMARY.get(rowId);
  if (!fusion) return null;
  if (memberId === rowId) return fusion.primaryChip || null;
  return fusion.companions.find((entry) => entry.id === memberId)?.chip || null;
}

/**
 * The chip a row offers for its OWN primary, or null when it offers none.
 *
 * Shaped like a companion descriptor (`{id, chip, title}`) so the strip builder
 * can run one loop over `[primary, ...companions]` instead of forking, and so a
 * future second peer row is a line in the table rather than a branch in the
 * panel.
 *
 * `title` is deliberately absent rather than invented: the companion tooltips
 * in this table carry a source and a hedge, and a made-up sentence beside them
 * would be the one line in the strip that says nothing.
 *
 * @param {string} layerId Registered layer id.
 * @returns {?{id: string, chip: string, title: string}} Descriptor, or null.
 */
export function fusionPrimaryChipFor(layerId) {
  const fusion = FUSION_BY_PRIMARY.get(layerId);
  if (!fusion || fusion.primaryToggle !== true) return null;
  return PRIMARY_CHIP_BY_ID.get(layerId) || null;
}

/**
 * Every layer a row's toggle switches on — the primary first, then the
 * companions that follow it. `optIn` companions are excluded: the row toggle
 * does not switch them on, their chip does.
 * @param {string} layerId Registered layer id.
 * @returns {string[]} Layer ids, primary first.
 */
export function fusionToggleGroupFor(layerId) {
  const companions = fusionCompanionsFor(layerId);
  if (!companions) return [layerId];
  return [layerId, ...companions.filter((entry) => entry.optIn !== true).map((entry) => entry.id)];
}

// Resolved once at import, like the maps above: the table is frozen, and the
// key asks for its tiles on every repaint. The words stay getters, because
// this runs before the page's language is readable.
const TILES_BY_PRIMARY = new Map(LAYER_FUSIONS
  .filter((fusion) => Array.isArray(fusion.tiles))
  .map((fusion) => [fusion.primary, Object.freeze(fusion.tiles.map((tile) => {
    const companion = fusion.companions.find((entry) => entry.id === tile.id) || null;
    const part = typeof tile.part === 'string' ? tile.part : null;
    const own = () => (part ? messages().tiles[`${tile.id}:${part}`] : null);
    return Object.freeze({
      id: tile.id,
      part,
      color: tile.color,
      icon: lucideIconMask(tile.icon),
      ...(part ? { on: tile.on, off: tile.off, lit: tile.lit } : {}),
      get label() { return own()?.label || (companion ? companion.chip : fusion.primaryChip); },
      get title() { return own()?.title || (companion ? companion.title : ''); },
    });
  }))]));

/**
 * The member tiles a row shows in the map key, or null when its members are
 * chips on the strip — see `tiles` in the table's header. A tile that switches
 * part of its layer carries `part`, its `on` and `off` params and `lit`; every
 * other tile has `part: null` and switches its whole layer.
 * @param {string} layerId The row's primary.
 * @returns {?ReadonlyArray<{id: string, part: ?string, color: string, icon: string,
 *   label: string, title: string, on?: object, off?: object, lit?: boolean}>}
 */
export function fusionTilesFor(layerId) {
  return TILES_BY_PRIMARY.get(layerId) || null;
}

// Resolved once at import, like the tiles above; the words stay getters.
const ROW_TILES_BY_PRIMARY = new Map(LAYER_FUSIONS
  .filter((fusion) => Array.isArray(fusion.rowTiles))
  .map((fusion) => [fusion.primary, Object.freeze(fusion.rowTiles.map((tile) => {
    const words = () => messages().rowTiles[`${fusion.primary}:${tile.key}`] || {};
    return Object.freeze({
      key: tile.key,
      ids: tile.ids,
      icon: tile.icon ? lucideIconMask(tile.icon) : null,
      get label() { return words().label || tile.key; },
      get title() { return words().title || ''; },
      get blurb() { return words().blurb || ''; },
      get hint() { return words().hint || ''; },
    });
  }))]));

/**
 * The tiles a row draws UNDER ITSELF in the Layers panel, or null when it has
 * none — see `rowTiles` in the table's header. Each switches a group of
 * members (`ids`), and is lit while any of them is on.
 * @param {string} layerId The row's primary.
 * @returns {?ReadonlyArray<{key: string, ids: ReadonlyArray<string>, icon: ?string,
 *   label: string, title: string, blurb: string, hint: string}>}
 */
export function fusionRowTilesFor(layerId) {
  return ROW_TILES_BY_PRIMARY.get(layerId) || null;
}

/**
 * The row tile a member belongs to, or null.
 * @param {string} rowId The row's primary.
 * @param {string} memberId
 * @returns {?object}
 */
export function fusionRowTileOf(rowId, memberId) {
  return fusionRowTilesFor(rowId)?.find((tile) => tile.ids.includes(memberId)) || null;
}

/**
 * Whether a row's tiles are MODES — one lit at a time (`exclusive`).
 * @param {string} layerId The row's primary, or any of its members.
 * @returns {boolean}
 */
export function fusionIsExclusive(layerId) {
  const rowId = fusedIntoFor(layerId) || layerId;
  return LAYER_FUSIONS.some((fusion) => fusion.primary === rowId && fusion.exclusive === true);
}

/**
 * Whether a layer's params put one of its tile parts out — every `off` param
 * holds its value.
 * @param {?object} params `getParams()` of the layer.
 * @param {{off: object}} tile A part tile.
 * @returns {boolean}
 */
export function tilePartIsOff(params, tile) {
  return Object.entries(tile.off).every(([key, value]) => Object.is(params?.[key], value));
}

/**
 * The params a split layer returns to when its last lit part is put out: each
 * part as the row's toggle lights it. See `lit` in the table's header.
 * @param {ReadonlyArray<object>} parts Every part tile of ONE layer.
 * @returns {object}
 */
export function tilePartDefaults(parts) {
  return Object.assign({}, ...parts.map((tile) => (tile.lit ? tile.on : tile.off)));
}
