/**
 * Strings of src/scenes/director.js — see docs/i18n/CONVENTIONS.md.
 *
 * The scene panel is the camera-move recorder: a reader picks a scene, saves
 * shots, and plays them back to record a clip. Its BUTTONS live in
 * `index.html` (src/i18n/markup.i18n.js, `scenes.*`); everything the panel
 * writes afterwards is here, worded identically to them — *CAPTURER UN PLAN*
 * / *CAPTURE SHOT*, so a shot is a « plan » in French wherever it is named.
 *
 * The panel came from upstream in English, so here the ENGLISH is the
 * original, kept verbatim, and the French is what is new.
 *
 * A DEFAULT TITLE IS THE READER'S, ONCE IT IS WRITTEN. `Shot 3` and
 * `Scene 2` are generated the way a file manager names a new folder: in the
 * language of the moment, and renameable on a double-click or a long press.
 * They are then stored in the project and exported with it, so a reader who
 * switches language keeps the titles they already had — which is the right
 * answer for a name they own.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  ready: { fr: 'Prêt', en: 'Ready', note: 'Same words as scenes.ready in index.html.' },
  shotTitle: {
    fr: (index) => `Plan ${index}`,
    en: (index) => `Shot ${index}`,
    note: 'Default title of a captured shot. `index` is 1-based.',
    sample: [3],
  },
  sceneTitle: {
    fr: (index) => `Scène ${index}`,
    en: (index) => `Scene ${index}`,
    sample: [2],
  },
  untitledScene: { fr: 'Scène sans titre', en: 'Untitled Scene' },
  noShots: {
    fr: 'Aucun plan pour l’instant. Utilisez CAPTURER UN PLAN pour enregistrer la vue actuelle.',
    en: 'No shots yet. Use CAPTURE SHOT to save current look.',
    note: 'The button it names is scenes.capture in index.html.',
  },
  load: { fr: 'CHARGER', en: 'LOAD' },
  delete: { fr: 'SUPPR', en: 'DEL', note: 'Same abbreviation as scenes.delete in index.html.' },
  shotMeta: {
    fr: (style, mode, duration, hold) => `${style} · ${mode} · ${duration} s + ${hold} s`,
    en: (style, mode, duration, hold) => `${style} · ${mode} · ${duration}s + ${hold}s`,
    note: 'Under a shot: its visual style, its detection mode, its flight time '
      + 'and the hold after it. `style` and `mode` are the stored values, in capitals.',
    sample: ['RETRO', 'OFF', '4.0', '0.9'],
  },
  renameShot: { fr: 'Titre du plan', en: 'Shot title', note: 'window.prompt on a double-click or a long press.' },
  newScene: { fr: 'Nom de la nouvelle scène', en: 'New scene name' },
  confirmDeleteScene: {
    fr: (title) => `Supprimer la scène « ${title} » et tous ses plans ?`,
    en: (title) => `Delete scene “${title}” and all shots?`,
    sample: ['Orbital Watch'],
  },
  confirmDeleteShot: {
    fr: (title) => `Supprimer le plan « ${title} » ?`,
    en: (title) => `Delete shot “${title}”?`,
    sample: ['Shot 3'],
  },
  // ── the status line ──────────────────────────────────────────────────────
  cameraNotReady: { fr: 'Capture impossible : la caméra n’est pas prête', en: 'Cannot capture shot: camera not ready' },
  cameraUnavailable: {
    fr: 'Caméra indisponible — quittez d’abord le cockpit',
    en: 'Camera unavailable — exit cockpit first',
    note: '“Cockpit” is the inherited word for the immersive mode; the buttons say it too.',
  },
  captured: {
    fr: (scene, shot) => `Capturé : ${scene} / ${shot}`,
    en: (scene, shot) => `Captured: ${scene} / ${shot}`,
    sample: ['Orbital Watch', 'Shot 3'],
  },
  updated: {
    fr: (scene, shot) => `Mis à jour : ${scene} / ${shot}`,
    en: (scene, shot) => `Updated: ${scene} / ${shot}`,
    sample: ['Orbital Watch', 'Shot 3'],
  },
  loaded: {
    fr: (scene, shot) => `Chargé : ${scene} / ${shot}`,
    en: (scene, shot) => `Loaded: ${scene} / ${shot}`,
    sample: ['Orbital Watch', 'Shot 3'],
  },
  selectShotFirst: { fr: 'Choisissez d’abord un plan', en: 'Select a shot first' },
  noShotsToRun: { fr: 'Aucun plan à jouer', en: 'No shots to run' },
  running: {
    fr: (index, total, scene, shot) => `Lecture ${index}/${total} : ${scene} / ${shot}`,
    en: (index, total, scene, shot) => `Running ${index}/${total}: ${scene} / ${shot}`,
    sample: ['2', '5', 'Orbital Watch', 'Shot 3'],
  },
  runtime: {
    fr: (scene, shot) => `${scene} · ${shot}`,
    en: (scene, shot) => `${scene} · ${shot}`,
    note: 'The label over the globe while a run plays.',
    sample: ['Orbital Watch', 'Shot 3'],
  },
  runComplete: { fr: 'Lecture de la scène terminée', en: 'Scene run complete' },
  runError: {
    fr: (message) => `Erreur : ${message}`,
    en: (message) => `Error: ${message}`,
    note: '`message` is the thrown error’s own text, which nothing here rewrites.',
    sample: ['run failed'],
  },
  runFailed: { fr: 'la lecture a échoué', en: 'run failed', note: 'Fallback when the error carried no message.' },
  stopped: { fr: 'Arrêté', en: 'Stopped' },
  stoppedEsc: { fr: 'Arrêté (Échap)', en: 'Stopped (Esc)' },
  imported: {
    fr: (name) => `${name} importé`,
    en: (name) => `Imported ${name}`,
    note: '`name` is the file the reader chose.',
    sample: ['scene-presets-2026-09-20.json'],
  },
  importFailed: { fr: 'Import impossible (JSON invalide)', en: 'Import failed (invalid JSON)' },
  layersRefused: {
    fr: (layers) => `Couches refusées : ${layers}`,
    en: (layers) => `Layers refused: ${layers}`,
    note: '`layers` is an already-joined list of layer ids.',
    sample: ['flights, satellites'],
  },
  noAircraft: {
    fr: 'Aucun avion à suivre dans la zone de la scène — le plan garde sa caméra',
    en: 'No aircraft to follow where the scene looks — the shot keeps its camera',
    note: 'A scene shot follows a live aircraft; none was in the area when it played.',
  },
  cockpitRefused: {
    fr: (reason) => `Cockpit refusé : ${reason}`,
    en: (reason) => `Cockpit refused: ${reason}`,
    note: '`reason` is the cockpit controller’s own sentence, already in the reader’s language or English.',
    sample: ['Contacts must be active to enter Cockpit'],
  },
  contextExitFailed: {
    fr: (mode) => `Impossible de quitter ${mode} — les couches de la scène risquent d’être refusées`,
    en: (mode) => `Could not exit ${mode} — scene layers may be refused`,
    note: '`mode` is a Context mode id (`missions`).',
    sample: ['missions'],
  },
  notSaved: {
    fr: 'Scène non enregistrée — le stockage du navigateur est indisponible',
    en: 'Scene not saved — browser storage unavailable',
    note: 'Private browsing, blocked cookies, a full quota.',
  },
  progress: {
    fr: (percent) => `${percent} %`,
    en: (percent) => `${percent}%`,
    note: 'Inside the progress bar. `percent` is already a whole number as text.',
    sample: ['45'],
  },
});
