/**
 * Strings of `src/data/isochroneRings.js` — the catchment area.
 * See docs/i18n/CONVENTIONS.md.
 *
 * ── THE ONE THING THIS LAYER MUST NOT LET A READER BELIEVE ──────────────────
 *
 * Two of the three rings are exact polygons cut by Valhalla on IGN's BD TOPO;
 * the cycling ring is an ENVELOPE measured on 36 bearings, because IGN
 * publishes no cycling profile. An envelope drawn beside two exact polygons is
 * the one thing here that could quietly mislead, so every sentence that
 * carries the difference is translated as a caveat and not as a decoration:
 * `surface majorée` is an upper bound, `enveloppe` is not a boundary, and the
 * measured reach is a floor when a spoke ran past the sampling.
 *
 * The other refusal is the circle: the card prints the radius of the circle
 * with the SAME AREA and then says it is not a circle, because a reader who
 * remembers one number remembers a radius.
 *
 * Areas and distances arrive already formatted.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  modes: {
    foot: {
      label: { fr: 'À pied', en: 'On foot' },
      blurb: {
        fr: 'Marche, sur le réseau piéton et routier de la BD TOPO. Polygone exact.',
        en: 'Walking, on BD TOPO’s pedestrian and road network. Exact polygon.',
      },
    },
    car: {
      label: { fr: 'Voiture', en: 'Car' },
      blurb: {
        fr: 'Voiture, sur le réseau routier de la BD TOPO. Polygone exact.',
        en: 'Driving, on BD TOPO’s road network. Exact polygon.',
      },
    },
    bike: {
      label: { fr: 'Vélo', en: 'Bike' },
      blurb: {
        fr: 'Vélo, sur le réseau cyclable OSM (OSRM) : IGN ne publie aucun profil vélo. '
          + 'Enveloppe mesurée sur 36 directions — chaque sommet est un temps réel, '
          + 'le trait entre deux sommets ne l’est pas. Surface majorée.',
        en: 'Cycling, on the OSM cycle network (OSRM): IGN publishes no cycling profile. '
          + 'Envelope measured on 36 bearings — every vertex is a real travel time, '
          + 'the line between two vertices is not. Upper-bound area.',
      },
    },
  },

  /** The verb that goes with the mode, inside a sentence. */
  verbs: {
    car: { fr: 'en voiture', en: 'by car' },
    bike: { fr: 'à vélo', en: 'by bike' },
    foot: { fr: 'à pied', en: 'on foot' },
  },

  minutes: {
    fr: (minutes) => `${minutes} min`,
    en: (minutes) => `${minutes} min`,
    sample: [15],
  },

  expansion: {
    opens: {
      fr: (from, to, share) => `${from} → ${to} : ${share} % de l’expansion libre — le réseau s’ouvre au-delà`,
      en: (from, to, share) => `${from} → ${to}: ${share}% of free expansion — the network opens up beyond`,
      note: 'Free expansion is what an unobstructed plane would give: ×4 for twice the time.',
      sample: ['10 min', '15 min', 112],
    },
    brakes: {
      fr: (from, to, share, ratio, freeRatio) => `${from} → ${to} : ${share} % de l’expansion libre `
        + `(×${ratio} au lieu de ×${freeRatio}) — le réseau freine`,
      en: (from, to, share, ratio, freeRatio) => `${from} → ${to}: ${share}% of free expansion `
        + `(×${ratio} instead of ×${freeRatio}) — the network holds it back`,
      sample: ['5 min', '10 min', 84, '3.4', '4'],
    },
    digest: {
      fr: (shares, verdict) => `${shares} de l’expansion libre — le réseau ${verdict}`,
      en: (shares, verdict) => `${shares} of free expansion — the network ${verdict}`,
      note: 'Both readings on one line, for the card that has six.',
      sample: ['84% then 112%', 'opens up'],
    },
    share: {
      fr: (share) => `${share} %`,
      en: (share) => `${share}%`,
      sample: [84],
    },
    shareSeparator: { fr: ' puis ', en: ' then ' },
    opensVerdict: { fr: 's’ouvre', en: 'opens up' },
    brakesVerdict: { fr: 'freine', en: 'holds it back' },
  },

  centre: {
    title: {
      fr: (verb) => `Zone de chalandise ${verb} autour de ce point`,
      en: (verb) => `Catchment area ${verb} around this point`,
      sample: ['on foot'],
    },
    ring: {
      fr: (minutes, area) => `${minutes} ${area} km²`,
      en: (minutes, area) => `${minutes} ${area} km²`,
      sample: ['15 min', '2.16'],
    },
    noRings: {
      fr: 'aucun anneau renvoyé par le service',
      en: 'no ring returned by the service',
    },
    equivalentCircle: {
      fr: (radius) => `même surface qu’un disque de ${radius} m de rayon`,
      en: (radius) => `the same area as a disc of ${radius} m radius`,
      note: 'The circle this layer exists to refuse, printed beside the shape that refutes it.',
      sample: [830],
    },
    farAddress: {
      fr: (metres) => `première adresse à ${metres} m — le point n’en a pas`,
      en: (metres) => `nearest address ${metres} m away — the point has none`,
      sample: ['1,200'],
    },
    missingRings: {
      fr: (count) => `${count} anneau${count > 1 ? 'x' : ''} non renvoyé${count > 1 ? 's' : ''} par le service`,
      en: (count) => `${count} ${plural(count, 'ring', 'rings', { locale: 'en' })} not returned by the service`,
      sample: [1],
    },
    envelopeWarning: {
      fr: (bearings) => `enveloppe OSM, ${bearings} directions — surface majorée`,
      en: (bearings) => `OSM envelope, ${bearings} bearings — upper-bound area`,
      sample: [36],
    },
    pinned: {
      fr: 'point fixé par ce clic — « Suivre la vue » le relâche',
      en: 'point pinned by this click — “Follow the view” releases it',
    },
    following: {
      fr: 'centre suivi par la caméra — cliquez pour le figer',
      en: 'center follows the camera — click to pin it',
    },
  },

  ring: {
    envelopeArea: {
      fr: (area) => `${area} km² au plus — enveloppe, majorant`,
      en: (area) => `${area} km² at most — envelope, upper bound`,
      sample: ['5.4'],
    },
    exactArea: {
      fr: (area) => `${area} km² réellement atteignables`,
      en: (area) => `${area} km² actually reachable`,
      sample: ['2.16'],
    },
    equivalentCircle: {
      fr: (radius) => `soit un cercle équivalent de ${radius} m — mais ce n’est pas un cercle`,
      en: (radius) => `an equivalent circle of ${radius} m — but it is not a circle`,
      sample: [830],
    },
    snapped: {
      fr: (metres) => `point rattaché au réseau à ${metres} m — la mesure part de là`,
      en: (metres) => `point snapped to the network ${metres} m away — the measurement starts there`,
      sample: [42],
    },
    name: {
      fr: (minutes, verb) => `${minutes} ${verb}`,
      en: (minutes, verb) => `${minutes} ${verb}`,
      sample: ['15 min', 'on foot'],
    },
  },

  envelope: {
    bearings: {
      fr: (bearings) => `enveloppe sur ${bearings} directions — surface majorée, pas la surface exacte`,
      en: (bearings) => `envelope over ${bearings} bearings — upper-bound area, not the exact one`,
      sample: [36],
    },
    reach: {
      fr: (min, max, median) => `portée mesurée de ${min} à ${max} km (médiane ${median} km)`,
      en: (min, max, median) => `measured reach from ${min} to ${max} km (median ${median} km)`,
      sample: ['1.2', '4.1', '2.8'],
    },
    clipped: {
      fr: (count) => `${count} direction${count > 1 ? 's' : ''} au-delà de l’échantillonnage — cette portée est un plancher`,
      en: (count) => `${count} ${plural(count, 'bearing', 'bearings', { locale: 'en' })} beyond the sampling — that reach is a floor`,
      sample: [3],
    },
    network: {
      fr: 'réseau cyclable OpenStreetMap via OSRM (FOSSGIS) — pas la BD TOPO',
      en: 'OpenStreetMap cycle network through OSRM (FOSSGIS) — not BD TOPO',
    },
  },

  holes: {
    several: {
      fr: (count) => `${count} poches intérieures non atteignables, déjà retirées de la surface`,
      en: (count) => `${count} unreachable inner pockets, already subtracted from the area`,
      sample: [3],
    },
    one: {
      fr: 'une poche intérieure non atteignable, déjà retirée de la surface',
      en: 'one unreachable inner pocket, already subtracted from the area',
    },
  },
  parts: {
    fr: (count) => `${count} morceaux disjoints — la surface est leur somme`,
    en: (count) => `${count} disconnected pieces — the area is their sum`,
    sample: [2],
  },

  release: {
    title: {
      fr: (lat, lon) => `Centre fixé à ${lat}, ${lon} — relâcher pour resuivre la caméra.`,
      en: (lat, lon) => `Center pinned at ${lat}, ${lon} — release to follow the camera again.`,
      sample: ['48.85661', '2.35222'],
    },
  },

  /**
   * The row's form — the approved mock of 2026-09-24: where the measure
   * starts, how one travels, how long, how it was computed, how it is drawn.
   */
  panel: {
    place: {
      pinned: { fr: 'Depuis ce point', en: 'From this point' },
      following: {
        fr: 'Depuis le centre de la vue',
        en: 'From the center of the view',
        note: 'Caption over the address while no point is pinned and the measure follows the camera.',
      },
      change: { fr: 'Changer le point', en: 'Change the point' },
      choose: { fr: 'Choisir un point', en: 'Choose a point' },
      pickTitle: {
        fr: 'Puis touchez la carte à l’endroit voulu',
        en: 'Then tap the map where you want it',
      },
      hint: {
        fr: 'Touchez la carte à l’endroit voulu.',
        en: 'Tap the map where you want it.',
        note: 'Shown under the button while it waits for the click on the map.',
      },
      follow: {
        fr: 'Suivre la vue',
        en: 'Follow the view',
        note: 'Releases the pinned point: the measure then starts from the center of the view again.',
      },
    },
    modeCaption: { fr: 'Se déplacer', en: 'Getting around' },
    maxCaption: {
      fr: 'Durée maximale',
      en: 'Maximum time',
      note: 'How many of the three rings (5, 10, 15 min) are drawn.',
    },
    about: {
      caption: { fr: 'Sources et calcul', en: 'Sources and method' },
      ign: {
        fr: 'Temps calculés par l’IGN (Géoplateforme) sur les routes et les chemins de la BD TOPO®.',
        en: 'Times computed by IGN (Géoplateforme) on the roads and paths of BD TOPO®.',
      },
      bike: {
        fr: 'L’IGN ne calcule pas le vélo : temps mesurés sur les pistes et les rues d’OpenStreetMap '
          + '(OSRM), dans 36 directions. Le contour relie ces mesures, la surface est donc un maximum.',
        en: 'IGN does not compute cycling: times measured on OpenStreetMap’s cycle paths and streets '
          + '(OSRM), in 36 directions. The outline joins those measurements, so the area is a maximum.',
      },
      circle: {
        fr: (minutes, verb, radius) => `${minutes} ${verb} couvrent autant qu’un disque de ${radius} m de rayon, `
          + 'mais la forme suit les rues.',
        en: (minutes, verb, radius) => `${minutes} ${verb} cover as much as a disc of ${radius} m radius, `
          + 'but the shape follows the streets.',
        sample: ['15 min', 'on foot', 800],
      },
      brakes: {
        fr: (from) => `Après ${from}, la zone grandit moins vite qu’en terrain dégagé : `
          + 'une rivière, une voie ferrée ou des impasses freinent.',
        en: (from) => `After ${from}, the area grows more slowly than on open ground: `
          + 'a river, a railway or dead ends hold it back.',
        sample: ['10 min'],
      },
      opens: {
        fr: (from) => `Après ${from}, la zone grandit plus vite qu’en terrain dégagé : le réseau s’ouvre.`,
        en: (from) => `After ${from}, the area grows faster than on open ground: the network opens up.`,
        sample: ['10 min'],
      },
      edition: {
        fr: (version) => `Réseau BD TOPO® du ${version}.`,
        en: (version) => `BD TOPO® network as of ${version}.`,
        sample: ['August 25, 2026'],
      },
    },
    view: {
      caption: { fr: 'Vue :', en: 'View:' },
      zones: { fr: 'Zones', en: 'Areas', note: 'The reachable areas washed in their colour.' },
      contours: { fr: 'Contours', en: 'Outlines', note: 'Only the outlines, the map left unwashed.' },
    },
  },

  /** The key, drawn as the mock's card. */
  key: {
    title: {
      fr: (mode, minutes) => `${mode} · jusqu’à ${minutes}`,
      en: (mode, minutes) => `${mode} · up to ${minutes}`,
      sample: ['On foot', '15 min'],
    },
    cumulative: {
      fr: 'Surface cumulée',
      en: 'Cumulative area',
      note: 'The rings are nested: the 15-minute area contains the 5-minute one.',
    },
    cumulativeAtMost: { fr: 'Surface cumulée, au plus', en: 'Cumulative area, at most' },
    area: {
      fr: (area) => `${area} km²`,
      en: (area) => `${area} km²`,
      sample: ['0.29'],
    },
    note: { fr: 'Temps de trajet estimés', en: 'Estimated travel times' },
    noteBike: {
      fr: 'Temps estimés · contour approché',
      en: 'Estimated times · approximate outline',
    },
  },

  row: {
    dormant: {
      fr: (ceilingKm) => `Zoome sous ${ceilingKm} km, ou clique un point pour l’y fixer`,
      en: (ceilingKm) => `Zoom in below ${ceilingKm} km, or click a point to pin it there`,
      sample: [8],
    },
    ringsMissing: {
      fr: (count) => `${count} anneau(x) non renvoyé(s) par le service`,
      en: (count) => `${count} ${plural(count, 'ring', 'rings', { locale: 'en' })} not returned by the service`,
      sample: [1],
    },
  },
});
