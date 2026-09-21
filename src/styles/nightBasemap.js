/**
 * @module styles/nightBasemap
 *
 * The dark ground of the night atlas: the basemap dimmed and desaturated INSIDE
 * the scene, so that nothing drawn over it changes colour.
 *
 * ── Why not in the post-process pass, where the other presets live ──────────
 *
 * A `PostProcessStage` sees the composed frame and nothing else. It cannot
 * tell a pixel of orthophoto from a pixel of a 400 kV line, so darkening
 * there darkens the grid with the fields it crosses — which is what the old
 * Noir did, and why `ui.js` had to say the key stopped decoding the map. The
 * basemap is two known objects, and both have a knob of their own:
 *
 *   - the globe's IMAGERY layers (IGN, Bing, OSM, the world base under IGN):
 *     `ImageryLayer.brightness` and `.saturation`, applied per layer in the
 *     globe shader. Only the layers the map-stack controller owns are
 *     touched; an overlay a data layer adds (a WMS, a choropleth raster) is
 *     data and keeps its colour.
 *   - the photorealistic TILESET: a `CustomShader` that desaturates and
 *     scales `material.diffuse`. It is attached only while the preset is
 *     visible, because swapping a tileset's shader recompiles every loaded
 *     tile and a no-op shader would still cost that.
 *
 * Ground polylines and ground polygons are CLASSIFICATION primitives: they
 * paint in their own pass, over whatever the tileset or the globe wrote, in
 * their own colour. So the grid stays as bright as it was on a daylight map
 * while the ground under it goes to night.
 *
 * ── Driven by the stage, not by the button ─────────────────────────────────
 *
 * The controller reads the Noir stage's `intensity` every frame instead of
 * listening to `setStyle`. That one number already carries the 500 ms
 * crossfade in and out, a restore from a share link, and Cockpit's vision
 * override (which writes intensities directly, see `cockpitVisionPolicy.js`).
 * Following it means the ground dims on exactly the frames the vignette and
 * the bloom fade in, whichever path turned them on.
 */
import * as Cesium from 'cesium';

/** Darkness at full intensity: the basemap keeps this share of its brightness. */
export const NIGHT_BRIGHTNESS_FLOOR = 0.18;

/**
 * Default slider positions. At `dim` 0.7 the basemap keeps 43 % of its
 * brightness — dark enough that a snowfield (luma ≈ 0.9) lands under the
 * bloom's threshold in `noir.js`, light enough that the Rhône and the relief
 * stay readable under the grid.
 */
export const NIGHT_BASEMAP_DEFAULTS = Object.freeze({ dim: 0.7, desat: 0.6 });

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * What the basemap's two knobs should read for one frame. Pure.
 *
 * @param {number} intensity Noir stage intensity, 0 → 1 across the crossfade.
 * @param {number} dim Darkness slider, 0 → 1.
 * @param {number} desat Desaturation slider, 0 → 1.
 * @returns {{brightness: number, saturation: number}} Multipliers, 1 = untouched.
 */
export function nightBasemapAdjustment(intensity, dim, desat) {
  const k = clamp01(intensity);
  return {
    brightness: 1 - k * clamp01(dim) * (1 - NIGHT_BRIGHTNESS_FLOOR),
    saturation: 1 - k * clamp01(desat),
  };
}

const TILESET_SHADER = /* glsl */ `
  void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    vec3 color = material.diffuse;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, u_nightSaturation);
    material.diffuse = color * u_nightBrightness;
  }
`;

function createTilesetShader() {
  return new Cesium.CustomShader({
    uniforms: {
      u_nightBrightness: { type: Cesium.UniformType.FLOAT, value: 1 },
      u_nightSaturation: { type: Cesium.UniformType.FLOAT, value: 1 },
    },
    fragmentShaderText: TILESET_SHADER,
  });
}

/**
 * Dim the basemap while the night atlas is visible.
 *
 * @param {object} options
 * @param {Cesium.Scene} options.scene
 * @param {() => {intensity: number, dim: number, desat: number}} options.readState
 *   The Noir stage's live values.
 * @param {() => ?Cesium.Cesium3DTileset} [options.getTileset] The photoreal
 *   tileset, or null while another stack is active.
 * @param {() => ReadonlyArray<Cesium.ImageryLayer>} [options.getImageryLayers]
 *   The imagery layers of the active globe stack.
 * @returns {{apply: () => void, destroy: () => void}}
 */
export function createNightBasemap({ scene, readState, getTileset, getImageryLayers }) {
  let shader = null;
  let shaderTileset = null;
  /** @type {Map<Cesium.ImageryLayer, {brightness: number, saturation: number}>} */
  const originals = new Map();

  const detachShader = () => {
    if (shaderTileset && !shaderTileset.isDestroyed?.() && shaderTileset.customShader === shader) {
      shaderTileset.customShader = undefined;
    }
    shaderTileset = null;
  };

  const restoreLayer = (layer, original) => {
    if (layer.isDestroyed?.()) return;
    layer.brightness = original.brightness;
    layer.saturation = original.saturation;
  };

  function apply() {
    const state = readState?.() || {};
    const active = Number(state.intensity) > 0.001;
    const { brightness, saturation } = nightBasemapAdjustment(state.intensity, state.dim, state.desat);

    const tileset = getTileset?.() || null;
    if (shaderTileset && shaderTileset !== tileset) detachShader();
    if (active && tileset && !tileset.isDestroyed?.()) {
      shader ||= createTilesetShader();
      shader.setUniform('u_nightBrightness', brightness);
      shader.setUniform('u_nightSaturation', saturation);
      if (tileset.customShader !== shader) {
        tileset.customShader = shader;
        shaderTileset = tileset;
      }
    } else if (shaderTileset) {
      detachShader();
    }

    const layers = getImageryLayers?.() || [];
    for (const [layer, original] of originals) {
      // A stack switch destroys and rebuilds its layers: a layer that left the
      // stack is not restored (nobody will draw it again), only forgotten.
      if (!layers.includes(layer)) originals.delete(layer);
      else if (!active) {
        restoreLayer(layer, original);
        originals.delete(layer);
      }
    }
    if (!active) return;
    for (const layer of layers) {
      if (!layer || layer.isDestroyed?.()) continue;
      let original = originals.get(layer);
      if (!original) {
        original = { brightness: layer.brightness, saturation: layer.saturation };
        originals.set(layer, original);
      }
      const nextBrightness = original.brightness * brightness;
      const nextSaturation = original.saturation * saturation;
      if (layer.brightness !== nextBrightness) layer.brightness = nextBrightness;
      if (layer.saturation !== nextSaturation) layer.saturation = nextSaturation;
    }
  }

  const removeListener = scene?.preRender?.addEventListener?.(apply) || null;

  return {
    apply,
    destroy() {
      removeListener?.();
      detachShader();
      for (const [layer, original] of originals) restoreLayer(layer, original);
      originals.clear();
      shader?.destroy?.();
      shader = null;
    },
  };
}
