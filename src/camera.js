import * as Cesium from 'cesium';

// The default view now lives in `defaultView.js`, which is Cesium-free so a
// warmer or a test can read it. Re-exported here because that is where every
// existing caller imports it from.
export { DEFAULT_CITY_VIEW } from './defaultView.js';
import { DEFAULT_CITY_VIEW } from './defaultView.js';

/**
 * Set the camera on the default city at load with a cinematic fly-in.
 * @param {Cesium.Viewer} viewer
 * @param {object} [view] Override target, same shape as DEFAULT_CITY_VIEW.
 */
export function flyToDefaultCity(viewer, view = DEFAULT_CITY_VIEW, { onSettled = null } = {}) {
  // Start from a high altitude, then fly down
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.approachAltitudeM),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });

  // Cinematic fly-in after a brief pause
  setTimeout(() => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.settleAltitudeM),
      orientation: {
        heading: Cesium.Math.toRadians(view.headingDeg),
        pitch: Cesium.Math.toRadians(view.pitchDeg),
        roll: 0.0,
      },
      duration: 4.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      // The app's opening move is finished. Callers use this to tell the
      // reader's own navigation apart from the descent performed FOR them —
      // `src/photorealAdoption.js` buys the 3D globe on the former only.
      // `cancel` fires it too: a reader who interrupted the flight is
      // navigating, which is exactly the case this must not miss.
      complete: () => onSettled?.(),
      cancel: () => onSettled?.(),
    });
  }, 500);
}
