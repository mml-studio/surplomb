/**
 * @module pausedLayers
 *
 * Layers the app sets aside WITHOUT deleting them: their code, their share
 * token and their place in the taxonomy stay, and nothing in the app can
 * switch them on — no row, no chip, no share link, no scene, no voice
 * command. `main.js` hands this list to `DataLayerManager.withholdLayers`
 * with `reason: 'paused'`, the mechanism a commercial host already uses for a
 * source it may not serve, so a request for one is refused with a sentence
 * that says the layer is switched off rather than blaming a licence.
 *
 * Bringing one back is deleting its line here.
 */

/**
 * « Fiche implantation » (`implantation-fr`), set aside on 2026-09-24 by the
 * owner when « Zone de chalandise » was redrawn after its approved mock: the
 * mock has no « Fiche » and the owner asked for the chip to stop working
 * from the app, its code kept.
 * @type {ReadonlyArray<string>}
 */
export const PAUSED_LAYER_IDS = Object.freeze(['implantation-fr']);
