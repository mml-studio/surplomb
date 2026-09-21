/**
 * @module scenes/director
 *
 * Deterministic cinematic scene playback engine for social-media clip capture.
 *
 * Manages a persistent project of scenes, each containing an ordered shot list.
 * Each shot stores camera position, visual style, post-processing state, HUD mode,
 * detection overlay, and data-layer toggles. During playback the director sequences
 * through shots with timed camera flights, hold pauses, and visual-state transitions,
 * while recording telemetry events for post-run metadata export.
 *
 * State is persisted to localStorage and can be exported/imported as JSON.
 */

import * as Cesium from 'cesium';
import { SCENE_RECIPES } from './recipes.js';
import messages from './director.i18n.js';
import { formatDecimal, formatInteger } from '../i18n/format.js';
import { sceneLayerPlan, sceneRequiresContextModeExit } from './scenePolicy.js';
import { bindLongPress } from '../panelDrag.js';

/** @constant {string} Key code used to abort a running scene */
const ESCAPE_KEY = 'Escape';
/** @constant {string} localStorage key for the serialized project */
const STORAGE_KEY = 'godsEyeView.sceneProject.v2';
/** @constant {number} Current schema version for project migration */
const PROJECT_VERSION = 3;
/** @constant {number} Fallback camera flight duration per shot (seconds) */
const DEFAULT_SHOT_DURATION_SEC = 4;
/** @constant {number} Default hold/pause after a shot completes (seconds) */
const DEFAULT_HOLD_SEC = 0.9;

/**
 * How a shot's flight accelerates, by the Cesium easing it maps to. `inOut`
 * is the historical default: every shot leaves and arrives at rest, which
 * reads as a stop between two shots. A single continuous move needs its joins
 * to keep their speed — `in` leaves at rest and arrives at speed, `out` the
 * reverse, `linear` holds its speed through both ends.
 * @constant {Object.<string, string>}
 */
const SHOT_EASINGS = Object.freeze({
  inOut: 'CUBIC_IN_OUT',
  in: 'CUBIC_IN',
  out: 'CUBIC_OUT',
  linear: 'LINEAR_NONE',
});

/**
 * A slow turn during the hold, in degrees per second, around the ground at
 * the centre of the frame: what keeps a still frame alive. Bounded so a typo
 * cannot spin the globe.
 * @constant {number}
 */
const MAX_ORBIT_DEG_PER_SEC = 20;

/** @constant {number} Aircraft read from a layer when a shot picks one to follow. */
const AIRCRAFT_PICK_LIMIT = 20000;

/** @constant {number} Retries while Contacts is still coming up before Cockpit entry. */
const COCKPIT_ENTRY_RETRIES = 8;

/** @constant {string} Body class that keeps the map key visible in recording mode (style.css). */
const SCENE_LEGEND_CLASS = 'scene-legend-visible';

/**
 * Clamp a numeric value to the [0, 1] range.
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Generate a short random identifier with the given prefix.
 * @param {string} prefix - e.g. 'shot', 'scene'
 * @returns {string} Identifier like "shot-a1b2c3d4"
 */
function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Deep-clone a JSON-serializable value via round-trip stringify/parse.
 * @param {*} value
 * @returns {*}
 */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normalize a raw layer state entry into a canonical { enabled, params? } shape.
 * Accepts both boolean shorthand and full object forms.
 * @param {boolean|Object} entry - Raw layer state (boolean or { enabled, params })
 * @returns {{ enabled: boolean, params?: Object }}
 */
function normalizeLayerEntry(entry) {
  if (entry && typeof entry === 'object') {
    return {
      enabled: !!entry.enabled,
      params: entry.params && typeof entry.params === 'object' ? deepClone(entry.params) : undefined,
    };
  }
  return { enabled: !!entry };
}

/**
 * A shot's motion: the flight's easing and ceiling, and the hold's slow turn.
 *
 * `maxHeightM` exists because Cesium arcs every flight it judges long for its
 * altitude: a 2.3 km hop between two poses 120 m above an apron climbed to
 * about 1.5 km and came back down (measured at Roissy, 2026-09-21), which
 * reads as a jump, not as a move across the ground.
 * @param {Object} [raw] - `{ easing, orbitDegPerSec, maxHeightM }` from a keyframe or a stored shot
 * @returns {{ easing: string, orbitDegPerSec: number, maxHeightM: ?number }}
 */
function normalizeMotion(raw) {
  const easing = Object.hasOwn(SHOT_EASINGS, raw?.easing) ? raw.easing : 'inOut';
  const orbit = Number(raw?.orbitDegPerSec);
  const ceiling = raw?.maxHeightM === null || raw?.maxHeightM === undefined ? NaN : Number(raw.maxHeightM);
  return {
    easing,
    orbitDegPerSec: Number.isFinite(orbit)
      ? Math.max(-MAX_ORBIT_DEG_PER_SEC, Math.min(MAX_ORBIT_DEG_PER_SEC, orbit))
      : 0,
    maxHeightM: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : null,
  };
}

/**
 * What a shot does instead of flying to its camera, if anything.
 *
 * `still` does nothing to the camera at all, so a slow turn carries on
 * across two shots while the second one changes something else — the key
 * appearing, say.
 * `track` follows a live aircraft picked where the shot looks — nearest to
 * `near` within `radiusKm`, inside an altitude band — through the layer's own
 * follow camera. `cockpit` enters the upstream Cockpit on the aircraft being
 * followed. Both exist because live traffic cannot be written as a pose: the
 * recipe says WHERE to look for an aircraft, the playback finds WHICH.
 * @param {Object} [raw]
 * @returns {?Object} Normalized action, or null for a plain camera flight
 */
function normalizeAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'cockpit') return { kind: 'cockpit' };
  // The camera stays where the previous shot left it: a hold continued, its
  // slow turn included, while the shot changes something else.
  if (raw.kind === 'still') return { kind: 'still' };
  if (raw.kind !== 'track') return null;
  const finite = (value) => (value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null);
  return {
    kind: 'track',
    layer: typeof raw.layer === 'string' && raw.layer ? raw.layer : 'flights',
    near: { lat: finite(raw.near?.lat) ?? 0, lon: finite(raw.near?.lon) ?? 0 },
    radiusKm: Math.max(0.1, finite(raw.radiusKm) ?? 5),
    minAltM: finite(raw.minAltM),
    maxAltM: finite(raw.maxAltM),
    origin: typeof raw.origin === 'string' && raw.origin ? raw.origin : null,
    leadInSec: Math.max(0, finite(raw.leadInSec) ?? 0),
  };
}

/**
 * The aircraft a `track` action follows: the one nearest `near`, within the
 * radius and the altitude band, among the positions the layer is DRAWING.
 * @param {Array<{id: string, label?: string, latitude: number, longitude: number, altitudeM: number, origin?: string}>} positions
 * @param {Object} action - A normalized `track` action
 * @returns {?{id: string, label: ?string, km: number, altitudeM: number}}
 */
export function pickAircraft(positions, action) {
  const { near, radiusKm, minAltM = null, maxAltM = null, origin = null } = action || {};
  if (!near) return null;
  const kmPerDegLat = 111.2;
  const kmPerDegLon = 111.2 * Math.cos((near.lat * Math.PI) / 180);
  let best = null;
  for (const position of positions || []) {
    const lat = Number(position?.latitude);
    const lon = Number(position?.longitude);
    const alt = Number(position?.altitudeM);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (minAltM !== null && !(alt >= minAltM)) continue;
    if (maxAltM !== null && !(alt <= maxAltM)) continue;
    if (origin && position.origin !== origin) continue;
    const km = Math.hypot((lat - near.lat) * kmPerDegLat, (lon - near.lon) * kmPerDegLon);
    if (km > radiusKm) continue;
    if (!best || km < best.km) best = { id: String(position.id), label: position.label ?? null, km, altitudeM: alt };
  }
  return best;
}

/**
 * Convert a static scene recipe (from recipes.js) into a mutable scene object
 * with fully normalized shots. Each keyframe in the recipe's cameraPath becomes
 * one shot, inheriting the recipe's style, post, and layer configuration.
 *
 * A keyframe may carry its own `layers`, merged over the recipe's: that is
 * how a layer switches on mid-scene instead of being there from the first
 * frame. Captured shots always could; a recipe could not. It may also carry
 * `easing`, `orbitDegPerSec`, `maxHeightM` and an `action` (see
 * normalizeMotion and normalizeAction), and `legend: true` to keep the map
 * key on screen through recording mode for that shot.
 * @param {Object} recipe - A SCENE_RECIPES entry
 * @returns {{ id: string, title: string, shots: Object[] }}
 */
export function recipeToScene(recipe) {
  const post = recipe.post || {};
  const ui = recipe.ui || {};
  const styleParams = post.styleParams && typeof post.styleParams === 'object'
    ? deepClone(post.styleParams)
    : {};

  // Normalize layer targets from the recipe into canonical form
  const layers = {};
  for (const [layerId, target] of Object.entries(recipe.layers || {})) {
    layers[layerId] = normalizeLayerEntry(target);
  }

  // Derive HUD visibility/variant from recipe's ui.hudMode string
  const hudMode = ui.hudMode || 'minimal';
  const hudVisible = hudMode !== 'off';
  const hudVariant = hudMode === 'minimal' ? 'minimal' : 'tactical';

  // Convert each cameraPath keyframe into a shot with shared visual state
  const path = recipe.cameraPath || [];
  const shots = path.map((keyframe, idx) => ({
    id: uid('shot'),
    title: messages().shotTitle(idx + 1),
    durationSec: Math.max(0.2, keyframe.duration || DEFAULT_SHOT_DURATION_SEC),
    holdSec: Math.max(0, keyframe.hold || 0),
    camera: {
      lat: keyframe.lat,
      lon: keyframe.lon,
      alt: keyframe.alt,
      heading: keyframe.heading || 0,
      pitch: keyframe.pitch || -40,
      roll: keyframe.roll || 0,
    },
    visual: {
      style: recipe.style || 'normal',
      sharpen: {
        enabled: typeof post.sharpen === 'boolean' ? post.sharpen : !!post.sharpen,
        intensity: 65,
      },
      hud: {
        visible: hudVisible,
        variant: hudVariant,
      },
      detection: {
        mode: post.detectionMode || 'OFF',
        density: 35,
      },
      styleParams,
    },
    layers: {
      ...deepClone(layers),
      ...Object.fromEntries(
        Object.entries(keyframe.layers || {}).map(([layerId, target]) => [layerId, normalizeLayerEntry(target)])
      ),
    },
    motion: normalizeMotion(keyframe),
    action: normalizeAction(keyframe.action),
    legend: keyframe.legend === true,
  }));

  return {
    id: recipe.id || uid('scene'),
    title: recipe.title || messages().untitledScene,
    shots,
  };
}

/**
 * Create a fresh default project by converting all built-in SCENE_RECIPES.
 * @returns {Object} A new project object with version, timestamps, and scenes
 */
function createDefaultProject() {
  return {
    version: PROJECT_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenes: SCENE_RECIPES.map(recipeToScene),
  };
}

/**
 * Normalize a raw shot object from storage or capture into a fully validated
 * shape with safe defaults for every field. Coerces all numeric fields.
 * @param {Object} rawShot - Raw shot data (may be incomplete or from an older schema)
 * @param {number} [index=0] - Positional index used for fallback title
 * @returns {Object} Fully normalized shot
 */
function normalizeShot(rawShot, index = 0) {
  const camera = rawShot?.camera || {};
  const visual = rawShot?.visual || {};
  const sharpen = visual.sharpen || {};
  const hud = visual.hud || {};
  const detection = visual.detection || {};

  return {
    id: rawShot?.id || uid('shot'),
    title: rawShot?.title || messages().shotTitle(index + 1),
    durationSec: Math.max(0.2, Number(rawShot?.durationSec) || DEFAULT_SHOT_DURATION_SEC),
    holdSec: Math.max(0, Number(rawShot?.holdSec) || 0),
    camera: {
      lat: Number(camera.lat) || 0,
      lon: Number(camera.lon) || 0,
      alt: Math.max(100, Number(camera.alt) || 800),
      heading: Number(camera.heading) || 0,
      pitch: Number(camera.pitch) || -35,
      roll: Number(camera.roll) || 0,
    },
    visual: {
      style: visual.style || 'normal',
      sharpen: {
        enabled: !!sharpen.enabled,
        intensity: Math.max(0, Math.min(100, Number.isFinite(Number(sharpen.intensity)) ? Number(sharpen.intensity) : 65)),
      },
      hud: {
        visible: typeof hud.visible === 'boolean' ? hud.visible : true,
        variant: typeof hud.variant === 'string' ? hud.variant : 'tactical',
      },
      detection: {
        mode: typeof detection.mode === 'string' ? detection.mode : 'OFF',
        density: Math.max(0, Math.min(100, Number.isFinite(Number(detection.density)) ? Number(detection.density) : 35)),
      },
      styleParams: visual.styleParams && typeof visual.styleParams === 'object' ? deepClone(visual.styleParams) : {},
    },
    layers: Object.fromEntries(
      Object.entries(rawShot?.layers || {}).map(([layerId, value]) => [layerId, normalizeLayerEntry(value)])
    ),
    motion: normalizeMotion(rawShot?.motion),
    action: normalizeAction(rawShot?.action),
    legend: rawShot?.legend === true,
  };
}

/**
 * Normalize and migrate an entire project object loaded from storage or import.
 * Falls back to the default recipe-based project when input is invalid or empty.
 * @param {Object|null} rawProject - Raw project data (potentially from an older schema)
 * @returns {Object} Fully normalized project at the current PROJECT_VERSION
 */
function normalizeProject(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') return createDefaultProject();

  const scenesRaw = Array.isArray(rawProject.scenes) ? rawProject.scenes : [];
  const scenes = scenesRaw
    .map((scene, sceneIdx) => {
      const shotsRaw = Array.isArray(scene?.shots) ? scene.shots : [];
      const shots = shotsRaw.map((shot, shotIdx) => normalizeShot(shot, shotIdx));
      return {
        id: scene?.id || uid('scene'),
        title: scene?.title || messages().sceneTitle(sceneIdx + 1),
        shots,
      };
    })
    // Keep scenes that have shots or at least a title
    .filter((scene) => scene.shots.length > 0 || scene.title);

  if (!scenes.length) {
    return createDefaultProject();
  }

  return {
    version: PROJECT_VERSION,
    createdAt: rawProject.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenes,
  };
}

/**
 * Orchestrates deterministic cinematic scene playback.
 *
 * The director owns a mutable project (persisted in localStorage) containing
 * scenes and shots. It drives camera flights via Cesium, applies visual/style
 * state through the styleManager, toggles data layers via the dataManager, and
 * records timestamped telemetry events during each run for later export.
 */
export class SceneDirector {
  /**
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance
   * @param {Object} styleManager - Controls visual state (sharpen, HUD, detection, style presets)
   * @param {Object} dataManager - Manages data layer enable/disable and per-layer params
   */
  constructor(viewer, styleManager, dataManager) {
    this.viewer = viewer;
    this.styleManager = styleManager;
    this.dataManager = dataManager;

    /** @type {boolean} True while a scene run is in progress */
    this._running = false;
    /** @type {{ cancelled: boolean }|null} Cancellation token for the active run */
    this._runToken = null;
    /** @type {number} Monotonic LOAD counter — only the newest LOAD may land */
    this._loadGeneration = 0;
    /** @type {AbortController|null} Aborts the active run's layer transitions */
    this._runAbort = null;
    /** @type {AbortController|null} Aborts the in-flight LOAD's layer transitions */
    this._loadAbort = null;
    /** @type {boolean} A shot of this run handed the camera to a follow camera or Cockpit */
    this._actionCamera = false;
    /** @type {boolean} A shot of this run entered Cockpit and has not left it */
    this._inCockpit = false;
    /** @type {string[]} Aircraft ids the run's `track` shots follow first */
    this._runTargets = [];
    /** @type {number|null} setInterval ID for the progress bar ticker */
    this._progressTimer = null;
    /** @type {Object|null} Telemetry accumulator for the current run */
    this._activeRun = null;
    /** @type {Object|null} Telemetry from the most recent completed run */
    this._lastRun = null;
    /** @type {string} JSON string of _lastRun for download */
    this._lastRunJson = '';
    this._onKeyDown = this._onKeyDown.bind(this);

    this._project = this._loadProject();
    this._selectedSceneId = this._project.scenes[0]?.id || null;
    this._selectedShotId = this._project.scenes[0]?.shots[0]?.id || null;

    // Cache DOM element references for the scene panel UI
    this._scenePanel = document.getElementById('scene-panel');
    this._sceneSelect = document.getElementById('scene-select');
    this._sceneNewBtn = document.getElementById('scene-new-btn');
    this._sceneDeleteBtn = document.getElementById('scene-delete-btn');
    this._sceneCaptureBtn = document.getElementById('scene-capture-btn');
    this._sceneUpdateShotBtn = document.getElementById('scene-update-shot-btn');
    this._sceneShotList = document.getElementById('scene-shot-list');
    this._sceneStartBtn = document.getElementById('scene-start-btn');
    this._sceneStopBtn = document.getElementById('scene-stop-btn');
    this._sceneNextBtn = document.getElementById('scene-next-btn');
    this._sceneExportBtn = document.getElementById('scene-export-btn');
    this._sceneImportBtn = document.getElementById('scene-import-btn');
    this._sceneImportFile = document.getElementById('scene-import-file');
    this._sceneDownloadBtn = document.getElementById('scene-download-btn');
    this._sceneStatus = document.getElementById('scene-status');
    this._sceneProgressFill = document.getElementById('scene-progress-fill');
    this._sceneRuntime = document.getElementById('scene-runtime');

    this._initUI();
  }

  /**
   * Load and normalize the project from localStorage.
   * Returns the default recipe-based project on missing or corrupt data.
   * @returns {Object} Normalized project
   */
  _loadProject() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultProject();
      return normalizeProject(JSON.parse(raw));
    } catch {
      return createDefaultProject();
    }
  }

  /** Persist the current project state to localStorage with an updated timestamp. */
  _saveProject() {
    this._project.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._project));
    } catch (e) {
      // Private browsing / block-all-cookies / quota-exceeded throws here. The
      // in-memory project stays usable this session, but persistence failed —
      // tell the user instead of crashing the caller (M11).
      console.warn('[Scenes] Could not persist project (storage unavailable):', e);
      this._toastStorageError();
    }
  }

  /** Surface a "scene not saved" notice via the global toast + scene status line. */
  _toastStorageError() {
    const message = messages().notSaved;
    this._updateStatus(message);
    try {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = message;
        toast.classList.add('visible');
        clearTimeout(this._storageToastTimer);
        this._storageToastTimer = setTimeout(() => {
          toast.classList.remove('visible');
        }, 2600);
      }
    } catch { /* toast is best-effort */ }
  }

  /**
   * Wire up all scene-panel DOM event listeners and render the initial UI state.
   * Exits silently if the scene-select element is missing (headless/test mode).
   */
  _initUI() {
    if (!this._sceneSelect) return;

    this._renderSceneSelect();
    this._renderShotList();

    this._sceneSelect.addEventListener('change', () => {
      this._selectedSceneId = this._sceneSelect.value;
      const scene = this._getSelectedScene();
      this._selectedShotId = scene?.shots[0]?.id || null;
      this._renderShotList();
    });

    this._sceneNewBtn?.addEventListener('click', () => this._createScene());
    this._sceneDeleteBtn?.addEventListener('click', () => this._deleteSelectedScene());
    this._sceneCaptureBtn?.addEventListener('click', () => this.captureShot());
    this._sceneUpdateShotBtn?.addEventListener('click', () => this.updateSelectedShot());

    this._sceneStartBtn?.addEventListener('click', () => {
      this.startScene(this._selectedSceneId);
    });

    this._sceneStopBtn?.addEventListener('click', () => {
      this.stopScene(messages().stopped);
    });

    this._sceneNextBtn?.addEventListener('click', () => {
      this.runNextScene();
    });

    this._sceneExportBtn?.addEventListener('click', () => {
      this.exportProject();
    });

    this._sceneImportBtn?.addEventListener('click', () => {
      this._sceneImportFile?.click();
    });

    this._sceneImportFile?.addEventListener('change', async () => {
      const file = this._sceneImportFile?.files?.[0];
      if (!file) return;
      await this.importProjectFile(file);
      this._sceneImportFile.value = '';
    });

    this._sceneDownloadBtn?.addEventListener('click', () => {
      this.downloadLastRunMetadata();
    });

    this._updateStatus(messages().ready);
    this._setProgress(0);
    this._setButtons(false);
  }

  /** Rebuild the scene dropdown options and sync the selected value. */
  _renderSceneSelect() {
    if (!this._sceneSelect) return;

    this._sceneSelect.innerHTML = '';
    for (const scene of this._project.scenes) {
      const option = document.createElement('option');
      option.value = scene.id;
      option.textContent = scene.title;
      this._sceneSelect.appendChild(option);
    }

    // Reset selection if the previously selected scene no longer exists
    if (!this._project.scenes.some((scene) => scene.id === this._selectedSceneId)) {
      this._selectedSceneId = this._project.scenes[0]?.id || null;
    }

    if (this._selectedSceneId) {
      this._sceneSelect.value = this._selectedSceneId;
    }
  }

  /**
   * Rebuild the shot list DOM for the currently selected scene.
   * Each shot row shows title, style/detection/duration metadata, and
   * LOAD/DEL action buttons. Supports click-to-select and double-click rename.
   */
  _renderShotList() {
    if (!this._sceneShotList) return;

    const scene = this._getSelectedScene();
    this._sceneShotList.innerHTML = '';

    if (!scene || scene.shots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'scene-shot-empty';
      empty.textContent = messages().noShots;
      this._sceneShotList.appendChild(empty);
      return;
    }

    // Auto-select first shot if current selection is stale
    if (!scene.shots.some((shot) => shot.id === this._selectedShotId)) {
      this._selectedShotId = scene.shots[0].id;
    }

    for (const shot of scene.shots) {
      const row = document.createElement('div');
      row.className = 'scene-shot-row';
      row.classList.toggle('active', shot.id === this._selectedShotId);

      const top = document.createElement('div');
      top.className = 'scene-shot-top';

      const label = document.createElement('div');
      label.className = 'scene-shot-label';
      label.textContent = shot.title;
      label.addEventListener('click', () => {
        this._selectedShotId = shot.id;
        this._renderShotList();
      });
      // Renaming a shot is behind a double-click, which a touchscreen cannot
      // produce. Same verb, second gesture — a finger holds the label instead.
      const renameShot = () => {
        const nextTitle = window.prompt(messages().renameShot, shot.title);
        if (!nextTitle) return;
        shot.title = nextTitle.trim() || shot.title;
        this._saveProject();
        this._renderShotList();
      };
      label.addEventListener('dblclick', renameShot);
      bindLongPress(label, renameShot);

      const actions = document.createElement('div');
      actions.className = 'scene-shot-actions';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'scene-shot-btn';
      loadBtn.textContent = messages().load;
      loadBtn.addEventListener('click', () => {
        this.loadShot(scene.id, shot.id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'scene-shot-btn scene-shot-danger';
      deleteBtn.textContent = messages().delete;
      deleteBtn.addEventListener('click', () => {
        this.deleteShot(scene.id, shot.id);
      });

      actions.appendChild(loadBtn);
      actions.appendChild(deleteBtn);
      top.appendChild(label);
      top.appendChild(actions);

      const meta = document.createElement('div');
      meta.className = 'scene-shot-meta';
      const mode = shot.visual?.detection?.mode || 'OFF';
      const style = shot.visual?.style || 'normal';
      const seconds = (value) => formatDecimal(value, 1, { minimumFractionDigits: 1 });
      meta.textContent = messages().shotMeta(style.toUpperCase(), mode, seconds(shot.durationSec), seconds(shot.holdSec));

      row.appendChild(top);
      row.appendChild(meta);
      this._sceneShotList.appendChild(row);
    }
  }

  /**
   * Look up the currently selected scene object.
   * @returns {Object|null} The scene, or null if no valid selection
   */
  _getSelectedScene() {
    return this._project.scenes.find((scene) => scene.id === this._selectedSceneId) || null;
  }

  /**
   * Resolve a scene and shot by their IDs.
   * @param {string} sceneId
   * @param {string} shotId
   * @returns {{ scene: Object|undefined, shot: Object|undefined }}
   */
  _getShot(sceneId, shotId) {
    const scene = this._project.scenes.find((item) => item.id === sceneId);
    const shot = scene?.shots.find((item) => item.id === shotId);
    return { scene, shot };
  }

  /** Prompt the user for a name and append a new empty scene to the project. */
  _createScene() {
    const fallbackName = messages().sceneTitle(this._project.scenes.length + 1);
    const sceneName = window.prompt(messages().newScene, fallbackName);
    if (!sceneName) return;

    const scene = {
      id: uid('scene'),
      title: sceneName.trim() || fallbackName,
      shots: [],
    };

    this._project.scenes.push(scene);
    this._selectedSceneId = scene.id;
    this._selectedShotId = null;
    this._saveProject();
    this._renderSceneSelect();
    this._renderShotList();
  }

  /** Delete the currently selected scene after user confirmation. Resets to defaults if empty. */
  _deleteSelectedScene() {
    const scene = this._getSelectedScene();
    if (!scene) return;

    const ok = window.confirm(messages().confirmDeleteScene(scene.title));
    if (!ok) return;

    this._project.scenes = this._project.scenes.filter((item) => item.id !== scene.id);
    // Restore default recipes if the user deleted all scenes
    if (!this._project.scenes.length) {
      this._project = createDefaultProject();
    }

    this._selectedSceneId = this._project.scenes[0]?.id || null;
    this._selectedShotId = this._project.scenes[0]?.shots[0]?.id || null;
    this._saveProject();
    this._renderSceneSelect();
    this._renderShotList();
  }

  /**
   * Snapshot the current enabled/params state of every registered data layer.
   * @returns {Object.<string, { enabled: boolean, params?: Object }>}
   */
  _captureLayerStates() {
    const layers = {};
    for (const layer of this.dataManager.getAll()) {
      const params = this.dataManager.getLayerParams(layer.id);
      layers[layer.id] = {
        enabled: !!layer.enabled,
        ...(params ? { params } : {}),
      };
    }
    return layers;
  }

  /**
   * Capture the current camera position, visual state, and layer states as a
   * new shot appended to the selected scene. No-op if no scene is selected.
   */
  captureShot() {
    const scene = this._getSelectedScene();
    if (!scene) return;

    const camera = this.styleManager.getCameraState();
    if (!camera) {
      this._updateStatus(messages().cameraNotReady);
      return;
    }

    const shot = normalizeShot({
      id: uid('shot'),
      title: messages().shotTitle(scene.shots.length + 1),
      durationSec: DEFAULT_SHOT_DURATION_SEC,
      holdSec: DEFAULT_HOLD_SEC,
      camera,
      visual: this.styleManager.getVisualState(),
      layers: this._captureLayerStates(),
    }, scene.shots.length);

    scene.shots.push(shot);
    this._selectedShotId = shot.id;
    this._saveProject();
    this._renderShotList();
    this._updateStatus(messages().captured(scene.title, shot.title));
  }

  /**
   * Overwrite the currently selected shot's camera, visual, and layer states
   * with the live viewport state. Useful for fine-tuning a shot in-place.
   */
  updateSelectedShot() {
    const scene = this._getSelectedScene();
    if (!scene) return;

    const shot = scene.shots.find((item) => item.id === this._selectedShotId);
    if (!shot) {
      this._updateStatus(messages().selectShotFirst);
      return;
    }

    const camera = this.styleManager.getCameraState();
    if (!camera) return;

    shot.camera = camera;
    shot.visual = this.styleManager.getVisualState();
    shot.layers = this._captureLayerStates();

    this._saveProject();
    this._renderShotList();
    this._updateStatus(messages().updated(scene.title, shot.title));
  }

  /**
   * Delete a specific shot from a scene after user confirmation.
   * @param {string} sceneId
   * @param {string} shotId
   */
  deleteShot(sceneId, shotId) {
    const { scene, shot } = this._getShot(sceneId, shotId);
    if (!scene || !shot) return;

    const ok = window.confirm(messages().confirmDeleteShot(shot.title));
    if (!ok) return;

    scene.shots = scene.shots.filter((item) => item.id !== shot.id);
    this._selectedShotId = scene.shots[0]?.id || null;
    this._saveProject();
    this._renderShotList();
  }

  /**
   * Load a single shot: apply its visual state, enable/disable layers, and fly
   * the camera to the shot's position. Blocked while a scene run is active.
   *
   * The newest LOAD wins. Two shot rows clicked in quick succession (or a
   * voice load landing on top of a click) both suspend on the visual and layer
   * awaits below; without a generation the OLDER request can complete second
   * and overwrite the operator's newer intent — the camera ends on shot A
   * while the panel reads shot B.
   *
   * @param {string} sceneId
   * @param {string} shotId
   * @param {Object} [options]
   * @param {number} [options.flyDuration=2.2] - Camera flight duration in seconds
   */
  async loadShot(sceneId, shotId, { flyDuration = 2.2 } = {}) {
    if (this._running) return;
    const { scene, shot } = this._getShot(sceneId, shotId);
    if (!scene || !shot) return;

    if (!this._claimCameraOwnership()) return;

    // Supersede the previous LOAD before reserving this one: aborting first
    // means an in-flight layer transition is cancelled (and rolled back by the
    // manager) rather than merely ignored once it has already committed.
    this._loadAbort?.abort();
    const controller = new AbortController();
    this._loadAbort = controller;
    const token = this._loadToken(++this._loadGeneration, controller.signal);

    this._selectedSceneId = scene.id;
    this._selectedShotId = shot.id;
    this._renderSceneSelect();
    this._renderShotList();

    await this.styleManager.applyVisualState(shot.visual, { isCurrent: () => !token.cancelled });
    if (token.cancelled) return;
    await this._applyLayerStates(shot.layers || {}, token);
    if (token.cancelled) return;
    await this._flyCamera(shot.camera, flyDuration, token, shot.motion);
    if (token.cancelled) return;

    if (this._loadAbort === controller) this._loadAbort = null;
    this._updateStatus(messages().loaded(scene.title, shot.title));
    this._updateRuntime('');
  }

  /**
   * Cancellation token for one LOAD, reading "a newer LOAD (or a scene run)
   * has since been requested". Live rather than latched, so a supersession
   * that happens mid-await is seen the moment the await resolves; the signal
   * lets the awaited work itself be cancelled instead of merely disowned.
   * @param {number} generation - The generation this LOAD reserved
   * @param {AbortSignal} [signal] - Abort signal for this LOAD's manager calls
   * @returns {{ cancelled: boolean, signal: AbortSignal|undefined }}
   */
  _loadToken(generation, signal = undefined) {
    const director = this;
    return {
      signal,
      get cancelled() {
        return director._loadGeneration !== generation;
      },
    };
  }

  /**
   * Claim camera ownership for a scene flight through the shared navigation
   * policy, releasing any tracked contact, voice orbit, or in-flight tween
   * first. Two writers on the camera is the documented jitter failure mode
   * (see src/data/trackedCamera.js and the orbit refusal in src/cameraVerbs.js),
   * and the policy is also where Cockpit gets to refuse.
   * @returns {boolean} False when the camera is unavailable (Cockpit/disposed).
   */
  _claimCameraOwnership() {
    // Older/headless style managers may predate the facade — proceed then.
    if (typeof this.styleManager?.runImmediateNavigation !== 'function') return true;
    const claimed = this.styleManager.runImmediateNavigation('scene', () => true);
    if (claimed === false) {
      this._updateStatus(messages().cameraUnavailable);
      return false;
    }
    return true;
  }

  /**
   * Build a flat playback queue of { scene, shot } pairs starting from the
   * given scene and wrapping around through all remaining scenes (round-robin).
   * @param {string} startSceneId - Scene to begin playback from
   * @returns {Array<{ scene: Object, shot: Object }>}
   */
  _buildPlaybackQueue(startSceneId, { single = false } = {}) {
    if (!this._project.scenes.length) return [];

    // Rotate the scene list so startSceneId comes first
    const startIdx = Math.max(0, this._project.scenes.findIndex((scene) => scene.id === startSceneId));
    const ordered = single
      ? this._project.scenes.slice(startIdx, startIdx + 1)
      : [
        ...this._project.scenes.slice(startIdx),
        ...this._project.scenes.slice(0, startIdx),
      ];

    // Flatten scenes into a sequential shot queue
    const queue = [];
    for (const scene of ordered) {
      for (const shot of scene.shots) {
        queue.push({ scene, shot });
      }
    }
    return queue;
  }

  /**
   * Lists scenes for voice/scripting consumers.
   * @returns {Array<{id: string, title: string, shots: number}>}
   */
  listScenes() {
    return this._project.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      shots: scene.shots.length,
    }));
  }

  /**
   * Finds a scene by id, exact title, or case-insensitive title substring.
   * @param {string} query - Scene id or (partial) title.
   * @returns {{id: string, title: string, shots: number}|null}
   */
  findSceneByQuery(query) {
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return null;
    const scene = this._project.scenes.find((item) => item.id === query)
      || this._project.scenes.find((item) => item.title.toLowerCase() === q)
      || this._project.scenes.find((item) => item.title.toLowerCase().includes(q));
    return scene ? { id: scene.id, title: scene.title, shots: scene.shots.length } : null;
  }

  /**
   * Playback status snapshot for voice read-back.
   * @returns {{running: boolean, selectedSceneId: string|null, sceneCount: number}}
   */
  getPlaybackStatus() {
    return {
      running: this._running,
      selectedSceneId: this._selectedSceneId,
      sceneCount: this._project.scenes.length,
    };
  }

  /** @returns {boolean} Whether a scene run is currently in progress */
  get running() {
    return this._running;
  }

  /**
   * Start a full scene run beginning at the given scene.
   *
   * Enters recording mode (hides panels, enables safe frame), then iterates
   * through the playback queue applying each shot's visual state, toggling
   * layers, flying the camera, and pausing for the hold duration. Each shot
   * transition is logged as a telemetry event. The run can be cancelled via
   * Escape or the stop button (checked between shots and during sleeps).
   *
   * @param {string} [sceneId] - Scene to start from; defaults to the current selection
   * @param {object} [options]
   * @param {boolean} [options.single=false] - Play only the named scene instead of
   *   round-robining through the whole project (voice playback uses this).
   * @param {string[]} [options.targets] - The aircraft the run's `track` shots
   *   follow, in order, when the caller already knows which — a filming
   *   harness that waited for a departure to roll. A target no longer drawn
   *   falls back to the shot's own pick.
   * @returns {Promise<{started: boolean, reason?: string, shots?: number}>}
   */
  async startScene(sceneId, { single = false, targets = [] } = {}) {
    if (this._running) return { started: false, reason: 'already-running' };

    const queue = this._buildPlaybackQueue(sceneId || this._selectedSceneId || this._project.scenes[0]?.id, { single });
    if (!queue.length) {
      this._updateStatus(messages().noShotsToRun);
      return { started: false, reason: 'no-shots' };
    }

    // Playback owns the camera for the whole run, so claim it the way every
    // other camera consumer does. Without this the follow camera keeps writing
    // the tracked contact's frame while each shot flies, and the run ends with
    // trackedEntity still set half a world from where the camera actually is.
    if (!this._claimCameraOwnership()) {
      return { started: false, reason: 'camera-unavailable' };
    }

    // A run supersedes any LOAD still suspended on its own awaits, so that
    // load cannot land a stale shot's layers on top of the run's first shot.
    // Aborting cancels a layer transition already in flight; bumping the
    // generation disowns everything the load has not yet started.
    this._loadAbort?.abort();
    this._loadAbort = null;
    this._loadGeneration++;

    // Transition to running state
    this._running = true;
    document.body.classList.add('scene-playback-mode');
    this._runTargets = Array.isArray(targets) ? targets.map(String) : [];
    this._setButtons(true);
    this._setProgress(0);

    // Create a cancellation token shared across async steps. Held in a local
    // as well: _finishRun() clears this._runToken, so the loop must not read
    // cancellation off the instance after cleanup has started. Its signal is
    // what actually stops in-flight manager work when STOP arrives — the
    // boolean alone only stops the NEXT step.
    this._runAbort = new AbortController();
    this._runToken = { cancelled: false, signal: this._runAbort.signal };
    const token = this._runToken;
    this.styleManager.setRecordingMode(true, {
      hidePanels: true,
      hudMode: 'full',
      safeFrame: '16:9',
    });

    // Pre-compute total duration for the progress bar
    const estimatedDurationSec = queue.reduce((sum, item) => {
      return sum + (item.shot.durationSec || 0) + (item.shot.holdSec || 0);
    }, 0);

    // Initialize telemetry accumulator for this run
    this._activeRun = {
      recipeId: `project-${PROJECT_VERSION}`,
      // i18n-ignore-next-line — a key in the exported run log, not a label.
      title: 'Editable Scene Run',
      startedAt: new Date().toISOString(),
      estimatedDurationSec,
      scenesRun: queue.length,
      events: [],
    };

    this._startProgressTicker(estimatedDurationSec || 1);
    this._logEvent('scene_run_start', { count: queue.length });
    document.addEventListener('keydown', this._onKeyDown);

    try {
      // Main shot sequencing loop
      for (let idx = 0; idx < queue.length; idx++) {
        if (token.cancelled) break;
        const { scene, shot } = queue[idx];

        // Update UI selection to track the active shot
        this._selectedSceneId = scene.id;
        this._selectedShotId = shot.id;
        this._renderSceneSelect();
        this._renderShotList();

        this._updateStatus(messages().running(formatInteger(idx + 1), formatInteger(queue.length), scene.title, shot.title));
        this._updateRuntime(messages().runtime(scene.title, shot.title));

        this._logEvent('shot_start', {
          sceneId: scene.id,
          shotId: shot.id,
          title: shot.title,
          index: idx,
        });

        // Apply visual state (style, sharpen, HUD, detection) then layers, then fly.
        // Awaited: applyVisualState suspends on a map-stack switch, and a shot
        // captured by the operator carries one — un-awaited, its shader uniforms
        // land after the NEXT shot has already been applied.
        //
        // Every await is a place STOP/Esc can arrive. A suspended map-stack
        // switch can hold this shot for seconds; without a re-check the layer
        // pass below still runs and the operator watches layers keep toggling
        // after they hit Stop. Cancellation is re-read after each one.
        await this.styleManager.applyVisualState(shot.visual || {}, {
          isCurrent: () => !token.cancelled,
        });
        if (token.cancelled) break;
        await this._applyLayerStates(shot.layers || {}, token);
        if (token.cancelled) break;
        // Recording mode hides the map key; a shot that names a layer's
        // meaning can ask for it back.
        document.body.classList.toggle(SCENE_LEGEND_CLASS, shot.legend === true);
        const durationSec = shot.durationSec || DEFAULT_SHOT_DURATION_SEC;
        if (shot.action?.kind === 'still') {
          // No flight: the previous shot's pose, turn and all, carries on.
        } else if (shot.action?.kind === 'track') {
          // The layer's follow camera flies this shot; its duration is how
          // long the aircraft is followed.
          await this._trackAircraft(shot.action, token);
          if (token.cancelled) break;
          await this._sleep(durationSec * 1000, token);
        } else if (shot.action?.kind === 'cockpit') {
          await this._enterCockpit(token);
          if (token.cancelled) break;
          await this._sleep(durationSec * 1000, token);
          if (token.cancelled) break;
          await this._leaveCockpit();
        } else {
          await this._releaseActionCamera();
          if (token.cancelled) break;
          await this._flyCamera(shot.camera, durationSec, token, shot.motion);
        }
        if (token.cancelled) break;
        // Hold on the final frame before transitioning to the next shot
        await this._hold((shot.holdSec || 0) * 1000, token, shot.motion);
        if (token.cancelled) break;

        this._logEvent('shot_end', {
          sceneId: scene.id,
          shotId: shot.id,
          index: idx,
        });
      }

      if (!token.cancelled) {
        this._setProgress(1);
        this._updateStatus(messages().runComplete);
        this._logEvent('scene_run_complete', {});
      }
    } catch (error) {
      this._updateStatus(messages().runError(error.message || messages().runFailed));
      // i18n-ignore-next-line — a value in the exported run log, not a label.
      this._logEvent('scene_run_error', { message: error.message || 'unknown error' });
    } finally {
      this._finishRun();
    }
  }

  /**
   * Advance to the next shot in the playback queue (wrapping around) and load
   * it without starting a full run. Used for manual step-through navigation.
   */
  async runNextScene() {
    if (this._running) return;

    const queue = this._buildPlaybackQueue(this._selectedSceneId || this._project.scenes[0]?.id);
    if (!queue.length) return;

    // Find the shot after the current selection, wrapping to the start
    let next = queue[0];
    if (this._selectedShotId) {
      const idx = queue.findIndex((item) => item.shot.id === this._selectedShotId);
      if (idx >= 0) next = queue[(idx + 1) % queue.length];
    }

    await this.loadShot(next.scene.id, next.shot.id);
  }

  /**
   * Cancel the active scene run. Sets the cancellation token, aborts the
   * run's in-flight layer transitions and Cesium camera flight, and logs a
   * stop event.
   *
   * The abort is the part that stops work already under way: a layer
   * transition awaited by _applyLayerStates cannot see a boolean, and without
   * the signal it commits after the operator has stopped — leaving the layer
   * enabled while the post-await check skips its params. The manager rolls an
   * aborted enable back through the module's own disable().
   *
   * @param {?string} [reason] - Human-readable cancellation reason; the
   *   module's own « Arrêté » / « Stopped » when none is given.
   */
  stopScene(reason = null) {
    if (!this._running || !this._runToken) return;
    const why = reason || messages().stopped;
    this._runToken.cancelled = true;
    this._runAbort?.abort();
    this.viewer.camera.cancelFlight();
    this._updateStatus(why);
    this._logEvent('scene_stopped', { reason: why });
  }

  /** Export the entire project as a timestamped JSON file download. */
  exportProject() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `scene-presets-${stamp}.json`;
    const payload = JSON.stringify(this._project, null, 2);
    // Trigger a browser download via a temporary anchor element
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Import a project from a user-selected JSON file, replacing the current project.
   * The file is normalized/migrated on load; invalid JSON shows an error status.
   * @param {File} file - Browser File object from an <input type="file">
   */
  async importProjectFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      this._project = normalizeProject(parsed);
      this._selectedSceneId = this._project.scenes[0]?.id || null;
      this._selectedShotId = this._project.scenes[0]?.shots[0]?.id || null;
      this._saveProject();
      this._renderSceneSelect();
      this._renderShotList();
      this._updateStatus(messages().imported(file.name));
    } catch {
      this._updateStatus(messages().importFailed);
    }
  }

  /** Download the telemetry metadata from the most recent completed run as JSON. */
  downloadLastRunMetadata() {
    if (!this._lastRunJson) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `scene-run-${stamp}.json`;
    const blob = new Blob([this._lastRunJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Reconcile data layer states to match the shot's target configuration.
   * Only layers the shot declares are touched — see src/scenes/scenePolicy.js
   * for why undeclared layers are left alone.
   *
   * Two things this pass owes the operator:
   *  - An isolating Context mode is left FIRST. Space Missions refuses every
   *    unrelated enable, so a shot applied inside it composes a scene nobody
   *    authored (see _exitIsolatingContextMode).
   *  - A refused layer is reported. setEnabled() answers false when a guard
   *    vetoes the transition; swallowing that answer is how playback came to
   *    claim success over a scene it never assembled.
   *
   * The token's signal is handed to every transition, so a stop or a newer
   * request cancels the layer that is CURRENTLY moving rather than only the
   * ones not started yet. Checking the boolean after the await is a backstop:
   * by then an un-aborted transition has already committed, and the pass would
   * return without its params — the layer left on with stale ones.
   *
   * Cancellation is read BEFORE the refusal branch on purpose: an aborted
   * transition also answers false, and reporting the operator's own stop as a
   * refused layer would be a lie.
   *
   * @param {Object.<string, { enabled: boolean, params?: Object }>} targetStates
   * @param {{ cancelled: boolean, signal?: AbortSignal }|null} [token]
   *   Cancellation token — a stop or a newer request ends the pass and aborts
   *   the transition in flight.
   * @returns {Promise<{ applied: string[], refused: string[], cancelled: boolean }>}
   */
  async _applyLayerStates(targetStates, token = null) {
    const applied = [];
    const refused = [];
    const abort = () => ({ applied, refused, cancelled: true });
    if (token?.cancelled) return abort();

    // Deliberately NOT aborted: leaving an isolating mode IS the restore to
    // the operator's pre-mode state, which is exactly where a stopped scene
    // should come to rest. Tearing that transaction in half would strand
    // Context, so it completes and cancellation is honoured immediately after.
    await this._exitIsolatingContextMode();
    if (token?.cancelled) return abort();

    const signal = token?.signal;
    const registered = new Set(this.dataManager.getAll().map((layer) => layer.id));
    for (const { id, enabled, params } of sceneLayerPlan(targetStates, registered)) {
      const settled = await this.dataManager.setEnabled(id, enabled, signal ? { signal } : undefined);
      if (token?.cancelled) return abort();
      if (settled === false) {
        refused.push(id);
        console.warn(`[Scenes] Layer refused: ${id} → ${enabled ? 'on' : 'off'}`);
        continue;
      }
      applied.push(id);
      if (params) {
        this.dataManager.setLayerParams(id, params);
      }
    }

    if (refused.length) {
      this._updateStatus(messages().layersRefused(refused.join(', ')));
      this._logEvent('shot_layers_refused', { layerIds: [...refused] });
    }
    return { applied, refused, cancelled: false };
  }

  /**
   * Leave a Context mode that isolates the globe, before a shot's layers land.
   *
   * Space Missions is the shipped case. It is a destructive-exclusive mode: a
   * guard refuses every enable outside its own replay bundle, so a recipe that
   * declares flights/satellites/earthquakes/traffic gets all four refused —
   * and Orbital Watch, whose satellites the guard does permit, would still
   * play over the mode's rocket-launches replay it never declared. Either way
   * the shot is not the composition it describes.
   *
   * The old full-registry reconcile dismantled the mode by accident, as part
   * of forcing every undeclared layer off. Declaring the exit is the honest
   * version of that: the decision is read off the policy guard itself, so a
   * future isolating mode is covered without being named here.
   *
   * @returns {Promise<boolean>} Whether a mode was exited.
   */
  async _exitIsolatingContextMode() {
    // Older/headless style managers may predate the Context facade.
    if (typeof this.styleManager?.getContextModeState !== 'function') return false;
    if (typeof this.styleManager?.setContextMode !== 'function') return false;

    const state = this.styleManager.getContextModeState() || {};
    // A mode still being entered already owns the guard, so it counts.
    const mode = state.entering || state.mode || null;
    if (!sceneRequiresContextModeExit(mode)) return false;

    const result = await this.styleManager.setContextMode('off');
    if (result && result.ok === false) {
      console.warn(`[Scenes] Could not exit ${mode}:`, result.error || 'unknown reason');
      this._updateStatus(messages().contextExitFailed(mode));
      this._logEvent('context_mode_exit_failed', { mode, error: result.error || null });
      return false;
    }
    this._logEvent('context_mode_exited', { mode });
    return true;
  }

  /**
   * Fly the Cesium camera to the given position over the specified duration
   * using cubic ease-in-out. Resolves when the flight completes, is cancelled,
   * or a safety timeout fires (duration + 0.6s).
   * @param {Object} cameraState - Target { lat, lon, alt, heading, pitch, roll }
   * @param {number} durationSec - Flight duration in seconds
   * @param {{ cancelled: boolean }} token - Cancellation token checked before starting
   * @param {?{ easing?: string, maxHeightM?: ?number }} [motion] - The shot's motion: its
   *   easing shapes the flight, its ceiling caps Cesium's arc
   */
  async _flyCamera(cameraState, durationSec, token, motion = null) {
    if (!cameraState || token.cancelled) return;

    // Scene playback drives the camera itself rather than through the shared
    // navigation seam, so the LOCATION readout would otherwise keep reporting
    // a free-text search the shot has already flown away from.
    this.styleManager?.clearSearchedLocation?.();

    const duration = Math.max(0.2, Number(durationSec) || DEFAULT_SHOT_DURATION_SEC);
    const destination = Cesium.Cartesian3.fromDegrees(
      cameraState.lon,
      cameraState.lat,
      cameraState.alt
    );

    await new Promise((resolve) => {
      // Guard against double-resolve from both callback and timeout
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      this.viewer.camera.flyTo({
        destination,
        orientation: {
          heading: Cesium.Math.toRadians(cameraState.heading || 0),
          pitch: Cesium.Math.toRadians(cameraState.pitch || -35),
          roll: Cesium.Math.toRadians(cameraState.roll || 0),
        },
        duration,
        ...(motion?.maxHeightM ? { maximumHeight: motion.maxHeightM } : {}),
        easingFunction: Cesium.EasingFunction[SHOT_EASINGS[motion?.easing] || SHOT_EASINGS.inOut],
        complete: finish,
        cancel: finish,
      });

      // Safety timeout in case Cesium callbacks fail to fire
      setTimeout(finish, (duration + 0.6) * 1000);
    });
  }

  /**
   * Hold on the shot's last frame, turning slowly if the shot asks for it.
   * @param {number} ms - Hold length in milliseconds
   * @param {{ cancelled: boolean }} token - Cancellation token
   * @param {?{ orbitDegPerSec?: number }} [motion] - The shot's motion
   */
  async _hold(ms, token, motion = null) {
    const rate = Number(motion?.orbitDegPerSec) || 0;
    if (ms <= 0 || token.cancelled) return;
    if (!rate) {
      await this._sleep(ms, token);
      return;
    }
    await this._orbit(ms, rate, token);
  }

  /**
   * Turn the camera around the ground at the centre of the frame, at a
   * constant rate, for `ms`. Positive is clockwise seen from above: the
   * heading grows. The pose is recomputed from the hold's first frame every
   * time, so nothing accumulates.
   *
   * The pivot is read from the depth buffer where the photorealistic mesh
   * answers, and from the ellipsoid otherwise; with neither, the hold is a
   * plain wait.
   * @param {number} ms
   * @param {number} degPerSec
   * @param {{ cancelled: boolean }} token
   */
  async _orbit(ms, degPerSec, token) {
    const scene = this.viewer?.scene;
    const camera = this.viewer?.camera;
    const canvas = this.viewer?.canvas;
    if (!scene || !camera || !canvas || typeof camera.setView !== 'function') {
      await this._sleep(ms, token);
      return;
    }
    const centre = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    let pivot = null;
    try {
      if (scene.pickPositionSupported) pivot = scene.pickPosition(centre);
    } catch { pivot = null; }
    if (!pivot) {
      try { pivot = camera.pickEllipsoid(centre); } catch { pivot = null; }
    }
    if (!pivot) {
      await this._sleep(ms, token);
      return;
    }
    const axis = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pivot, new Cesium.Cartesian3());
    const offset = Cesium.Cartesian3.subtract(camera.positionWC, pivot, new Cesium.Cartesian3());
    const direction = Cesium.Cartesian3.clone(camera.directionWC);
    const up = Cesium.Cartesian3.clone(camera.upWC);
    const rotation = new Cesium.Matrix3();
    const quaternion = new Cesium.Quaternion();
    const position = new Cesium.Cartesian3();
    const nextDirection = new Cesium.Cartesian3();
    const nextUp = new Cesium.Cartesian3();
    const frame = globalThis.requestAnimationFrame
      ? (fn) => globalThis.requestAnimationFrame(fn)
      : (fn) => setTimeout(fn, 16);
    const startedAt = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        if (token.cancelled) { resolve(); return; }
        const elapsed = Math.min(ms, performance.now() - startedAt);
        // Right-hand rule about the local up: a NEGATIVE angle is clockwise.
        const angle = -Cesium.Math.toRadians((degPerSec * elapsed) / 1000);
        Cesium.Quaternion.fromAxisAngle(axis, angle, quaternion);
        Cesium.Matrix3.fromQuaternion(quaternion, rotation);
        Cesium.Cartesian3.add(pivot, Cesium.Matrix3.multiplyByVector(rotation, offset, position), position);
        camera.setView({
          destination: position,
          orientation: {
            direction: Cesium.Matrix3.multiplyByVector(rotation, direction, nextDirection),
            up: Cesium.Matrix3.multiplyByVector(rotation, up, nextUp),
          },
        });
        scene.requestRender?.();
        if (elapsed >= ms) { resolve(); return; }
        frame(step);
      };
      frame(step);
    });
  }

  /**
   * Follow the live aircraft a `track` shot asks for, through the layer's own
   * follow camera. Announced first (`shot_action_pending`) and taken after
   * `leadInSec`, so whatever films the scene can point at it before it is
   * followed — the gesture a reader makes is a click on the aircraft.
   * @param {Object} action - A normalized `track` action
   * @param {{ cancelled: boolean }} token
   * @returns {Promise<boolean>} Whether an aircraft is being followed
   */
  async _trackAircraft(action, token) {
    const module = this.dataManager.layers?.get?.(action.layer)?.module;
    const positions = typeof module?.getAllPositions === 'function'
      ? module.getAllPositions(AIRCRAFT_PICK_LIMIT)
      : [];
    const wanted = this._runTargets?.shift?.() ?? null;
    const named = wanted && positions.find((position) => String(position.id) === wanted);
    const pick = typeof module?.trackById !== 'function' ? null
      : named ? { id: String(named.id), label: named.label ?? null }
        : pickAircraft(positions, action);
    if (!pick) {
      this._updateStatus(messages().noAircraft);
      this._logEvent('shot_action_failed', { kind: 'track', layer: action.layer, reason: 'no-aircraft' });
      return false;
    }
    this._logEvent('shot_action_pending', {
      kind: 'track', layer: action.layer, id: pick.id, label: pick.label, leadInSec: action.leadInSec,
    });
    await this._sleep(action.leadInSec * 1000, token);
    if (token.cancelled) return false;
    const followed = Boolean(module.trackById(pick.id));
    if (followed) this._actionCamera = true;
    this._logEvent('shot_action', { kind: 'track', layer: action.layer, id: pick.id, label: pick.label, followed });
    return followed;
  }

  /**
   * Enter the upstream Cockpit on the aircraft being followed. Cockpit only
   * opens inside Contacts, so Contacts is entered first; a refusal is
   * reported with the controller's own reason and the shot plays on.
   * @param {{ cancelled: boolean }} token
   * @returns {Promise<boolean>} Whether Cockpit is active
   */
  async _enterCockpit(token) {
    const manager = this.styleManager;
    if (typeof manager?.controlCockpit !== 'function') return false;
    if (typeof manager.setContextMode === 'function') {
      const context = await manager.setContextMode('contacts');
      if (token.cancelled) return false;
      if (context && context.ok === false) {
        this._updateStatus(messages().cockpitRefused(context.error || 'contacts'));
        this._logEvent('shot_action_failed', { kind: 'cockpit', reason: context.error || 'contacts' });
        return false;
      }
    }
    let entry = null;
    for (let attempt = 0; attempt <= COCKPIT_ENTRY_RETRIES; attempt++) {
      entry = manager.controlCockpit('enter');
      if (entry?.ok || token.cancelled) break;
      await this._sleep(250, token);
    }
    if (!entry?.ok) {
      this._updateStatus(messages().cockpitRefused(entry?.error || 'cockpit'));
      this._logEvent('shot_action_failed', { kind: 'cockpit', reason: entry?.error || null });
      return false;
    }
    this._inCockpit = true;
    this._actionCamera = true;
    this._logEvent('shot_action', { kind: 'cockpit' });
    return true;
  }

  /** Leave Cockpit, and the Contacts mode entered for it. */
  async _leaveCockpit() {
    if (!this._inCockpit) return;
    this._inCockpit = false;
    this.styleManager.controlCockpit?.('exit');
    await this.styleManager.setContextMode?.('off');
  }

  /**
   * Take the camera back from a follow camera or Cockpit before a shot flies
   * again: two writers on the camera is the documented jitter failure mode.
   */
  async _releaseActionCamera() {
    if (!this._actionCamera) return;
    await this._leaveCockpit();
    this._actionCamera = false;
    this._claimCameraOwnership();
  }

  /**
   * Cancellable sleep that polls the token every ~70ms, allowing prompt
   * interruption without waiting for the full duration.
   * @param {number} ms - Total sleep time in milliseconds
   * @param {{ cancelled: boolean }} token - Cancellation token
   */
  async _sleep(ms, token) {
    if (ms <= 0 || token.cancelled) return;
    const endAt = Date.now() + ms;
    while (Date.now() < endAt) {
      if (token.cancelled) return;
      await new Promise((resolve) => setTimeout(resolve, 70));
    }
  }

  /**
   * Start an interval that updates the progress bar based on wall-clock
   * elapsed time relative to the estimated total run duration.
   * @param {number} totalSec - Estimated total duration in seconds
   */
  _startProgressTicker(totalSec) {
    clearInterval(this._progressTimer);
    const startMs = Date.now();
    const totalMs = Math.max(1000, totalSec * 1000);
    this._progressTimer = setInterval(() => {
      if (!this._running) return;
      const elapsedMs = Date.now() - startMs;
      this._setProgress(elapsedMs / totalMs);
    }, 100);
  }

  /**
   * Clean up after a scene run (whether completed, errored, or cancelled).
   * Stops the progress ticker, exits recording mode, finalizes telemetry,
   * and resets UI buttons to the idle state.
   */
  _finishRun() {
    clearInterval(this._progressTimer);
    this._progressTimer = null;
    document.removeEventListener('keydown', this._onKeyDown);
    // Covers the error path too: a run that threw mid-shot must not leave a
    // layer transition running against a director that has stopped watching.
    this._runAbort?.abort();
    this._runAbort = null;

    // A run that ended inside Cockpit or behind a follow camera hands the
    // camera back, as a run that ended on a flight already has.
    if (this._actionCamera) void this._releaseActionCamera();

    this.styleManager.setRecordingMode(false);
    document.body.classList.remove('scene-playback-mode');
    document.body.classList.remove(SCENE_LEGEND_CLASS);
    this._updateRuntime('');
    this._running = false;

    // Finalize telemetry and archive it for download
    if (this._activeRun) {
      this._activeRun.endedAt = new Date().toISOString();
      this._activeRun.wasCancelled = this._runToken?.cancelled || false;
      this._lastRun = this._activeRun;
      this._lastRunJson = JSON.stringify(this._activeRun, null, 2);
      this._activeRun = null;
    }

    this._runToken = null;
    this._setButtons(false);
  }

  /**
   * Toggle disabled state on all scene panel buttons based on run state.
   * Editing controls are disabled during a run; stop is disabled when idle.
   * @param {boolean} isRunning
   */
  _setButtons(isRunning) {
    if (this._sceneStartBtn) this._sceneStartBtn.disabled = isRunning;
    if (this._sceneNextBtn) this._sceneNextBtn.disabled = isRunning;
    if (this._sceneSelect) this._sceneSelect.disabled = isRunning;

    if (this._sceneNewBtn) this._sceneNewBtn.disabled = isRunning;
    if (this._sceneDeleteBtn) this._sceneDeleteBtn.disabled = isRunning;
    if (this._sceneCaptureBtn) this._sceneCaptureBtn.disabled = isRunning;
    if (this._sceneUpdateShotBtn) this._sceneUpdateShotBtn.disabled = isRunning;
    if (this._sceneExportBtn) this._sceneExportBtn.disabled = isRunning;
    if (this._sceneImportBtn) this._sceneImportBtn.disabled = isRunning;

    if (this._sceneStopBtn) this._sceneStopBtn.disabled = !isRunning;
    if (this._sceneDownloadBtn) this._sceneDownloadBtn.disabled = !this._lastRunJson;
    if (this._scenePanel) this._scenePanel.classList.toggle('running', isRunning);
  }

  /**
   * Update the progress bar fill width and label.
   * @param {number} progress - Value in [0, 1]
   */
  _setProgress(progress) {
    if (!this._sceneProgressFill) return;
    const pct = Math.round(clamp01(progress) * 100);
    this._sceneProgressFill.style.width = `${pct}%`;
    this._sceneProgressFill.textContent = messages().progress(formatInteger(pct));
  }

  /**
   * Set the status line text in the scene panel.
   * @param {string} text
   */
  _updateStatus(text) {
    if (this._sceneStatus) this._sceneStatus.textContent = text;
  }

  /**
   * Set the runtime label (scene/shot name) and toggle its active class.
   * @param {string} text - Empty string hides the label
   */
  _updateRuntime(text) {
    if (!this._sceneRuntime) return;
    this._sceneRuntime.textContent = text;
    this._sceneRuntime.classList.toggle('active', !!text);
  }

  /**
   * Append a timestamped telemetry event to the active run log.
   * @param {string} type - Event type identifier (e.g. 'shot_start', 'scene_stopped')
   * @param {Object|null} payload - Arbitrary event data
   */
  _logEvent(type, payload) {
    if (!this._activeRun) return;
    this._activeRun.events.push({
      t: new Date().toISOString(),
      type,
      payload: payload || null,
    });
  }

  /**
   * Global keydown handler registered during a run. Escape cancels the run.
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    if (event.key === ESCAPE_KEY && this._running) {
      this.stopScene(messages().stoppedEsc);
    }
  }
}
