/**
 * Strings of `src/data/comptagesParis.js` — see docs/i18n/CONVENTIONS.md.
 *
 * ── THE LAYER'S ONE OBLIGATION ──────────────────────────────────────────────
 *
 * It replays a TYPICAL WEEK the city archived, not what the street is doing
 * now, and every line that carries a number says which hour of that week it
 * belongs to. The English keeps it: `weekday average`, `typical week of …`,
 * `Measured, D-2`.
 *
 * ── AND THE SILENCES IT REFUSES TO MERGE ────────────────────────────────────
 *
 * 724 of the 891 silent arcs are declared invalid by the operator, 26 are
 * closed to traffic — the road is shut, not the sensor — and 141 are declared
 * OPEN and publish nothing anyway. Only the last is genuinely unexplained,
 * and the card says so rather than implying a fault the city never claimed.
 * Four sentences, four claims, in both languages.
 *
 * Street names, junction names and arc ids are data.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  week: {
    sameMonth: {
      fr: (fromDay, toDay, month, year) => `du ${fromDay} au ${toDay} ${month} ${year}`,
      en: (fromDay, toDay, month, year) => `${month} ${fromDay} to ${toDay}, ${year}`,
      note: 'The archived week, from the two ISO dates the pack carries.',
      sample: [24, 30, 'August', '2026'],
    },
    acrossMonths: {
      fr: (fromDay, fromMonth, toDay, toMonth, year) => `du ${fromDay} ${fromMonth} au ${toDay} ${toMonth} ${year}`,
      en: (fromDay, fromMonth, toDay, toMonth, year) => `${fromMonth} ${fromDay} to ${toMonth} ${toDay}, ${year}`,
      sample: [31, 'August', 6, 'September', '2026'],
    },
  },
  legendNote: {
    typicalWeek: {
      fr: (when) => `semaine type ${when}`,
      en: (when) => `typical week of ${when}`,
      sample: ['August 24 to 30, 2026'],
    },
    archived: { fr: 'semaine type archivée', en: 'archived typical week' },
  },

  silence: {
    invalid: {
      fr: (hours) => `Aucune mesure sur ${hours} h — capteur déclaré invalide par la Ville`,
      en: (hours) => `No measurement over ${hours} h — sensor declared invalid by the City`,
      sample: [168],
    },
    closed: {
      fr: (hours) => `Aucune mesure sur ${hours} h — arc déclaré barré à la circulation`,
      en: (hours) => `No measurement over ${hours} h — link declared closed to traffic`,
      note: 'The road is shut, not the sensor.',
      sample: [168],
    },
    openAnyway: {
      fr: (hours) => `Aucune mesure sur ${hours} h — arc pourtant déclaré ouvert`,
      en: (hours) => `No measurement over ${hours} h — yet the link is declared open`,
      note: 'The only genuinely unexplained silence, and the card says so.',
      sample: [168],
    },
    noState: {
      fr: (hours) => `Aucune mesure sur ${hours} h — aucun état publié pour cet arc`,
      en: (hours) => `No measurement over ${hours} h — no state published for this link`,
      sample: [168],
    },
  },

  /** The number that decided the rhythm class, in one parenthesis. */
  evidence: {
    coverage: {
      fr: (weekday, weekend) => ` (${weekday}/24 h en semaine, ${weekend}/24 h le week-end)`,
      en: (weekday, weekend) => ` (${weekday}/24 h on weekdays, ${weekend}/24 h at the weekend)`,
      sample: [19, 8],
    },
    night: {
      fr: (share) => ` (${share} du trafic entre 00 et 04 h)`,
      en: (share) => ` (${share} of traffic between 00:00 and 04:00)`,
      sample: ['34%'],
    },
    weekend: {
      fr: (ratio) => ` (${ratio} l’heure de semaine, le week-end)`,
      en: (ratio) => ` (${ratio} the weekday hour, at the weekend)`,
      sample: ['×1.6'],
    },
    shoulders: {
      fr: (parts) => ` (${parts} le creux de midi)`,
      en: (parts) => ` (${parts} the midday trough)`,
      sample: ['morning ×1.4, evening ×1.8'],
    },
    morning: {
      fr: (ratio) => `matin ${ratio}`,
      en: (ratio) => `morning ${ratio}`,
      sample: ['×1.4'],
    },
    evening: {
      fr: (ratio) => `soir ${ratio}`,
      en: (ratio) => `evening ${ratio}`,
      sample: ['×1.8'],
    },
    percent: {
      fr: (value) => `${value} %`,
      en: (value) => `${value}%`,
      sample: [34],
    },
    times: {
      fr: (value) => `×${value}`,
      en: (value) => `×${value}`,
      sample: ['1.6'],
    },
  },

  card: {
    titleWithName: {
      fr: (name, arc) => `${name} · arc ${arc}`,
      en: (name, arc) => `${name} · link ${arc}`,
      note: '`arc` is the city\'s own link id. `name` is a street name: data.',
      sample: ['Boulevard Saint-Germain', '1234'],
    },
    title: {
      fr: (arc) => `Arc ${arc}`,
      en: (arc) => `Link ${arc}`,
      sample: ['1234'],
    },
    between: {
      fr: (from, to) => `de ${from} à ${to}`,
      en: (from, to) => `from ${from} to ${to}`,
      note: 'The two junction labels: 2,977 links share 892 names, so this is what identifies the stretch.',
      keep: ['Rue', 'du', 'de', 'Solférino'],
      sample: ['Rue du Bac', 'Rue de Solférino'],
    },
    occupancyOnly: {
      fr: (hours) => `Occupation mesurée sur ${hours} h — aucun véhicule compté`,
      en: (hours) => `Occupancy measured over ${hours} h — no vehicle counted`,
      sample: ['168'],
    },
    meanFlow: {
      fr: (flow) => `${flow} véh/h en moyenne, l’heure ouvrée type`,
      en: (flow) => `${flow} veh/h on average, in the typical weekday hour`,
      sample: ['1,240'],
    },
    noCount: {
      fr: (slot) => `Aucun comptage publié — ${slot}`,
      en: (slot) => `No count published — ${slot}`,
      sample: ['typical weekday · 04:00'],
    },
    slotFlow: {
      fr: (flow, slot) => `${flow} véh/h — ${slot}`,
      en: (flow, slot) => `${flow} veh/h — ${slot}`,
      sample: ['1,240', 'typical weekday · 18:00'],
    },
    countedHours: {
      fr: (counted, total) => `${counted} heures comptées sur ${total}`,
      en: (counted, total) => `${counted} hours counted out of ${total}`,
      sample: ['141', '168'],
    },
    rhythm: {
      fr: (rhythm, evidence) => `Rythme : ${rhythm}${evidence}`,
      en: (rhythm, evidence) => `Rhythm: ${rhythm}${evidence}`,
      note: '`rhythm` arrives lower-cased by the caller, as the card prints it.',
      sample: ['commuter', ' (morning ×1.4, evening ×1.8 the midday trough)'],
    },
    weekdayLabel: { fr: 'Sem.', en: 'Wk  ', note: 'Sparkline row label; padded to align with the weekend row.' },
    weekendLabel: { fr: 'W-E ', en: 'We  ' },
    occupancy: {
      fr: (percent, band) => `Occupation ${percent} % — ${band}`,
      en: (percent, band) => `Occupancy ${percent}% — ${band}`,
      note: 'The operator\'s own bands, published on the `k` field itself.',
      sample: ['22', 'near saturation'],
    },
    saturatedHours: {
      fr: (hours) => `${hours} h saturées ou pire`,
      en: (hours) => `${hours} h saturated or worse`,
      sample: [12],
    },
    barre: {
      fr: (state, hours, total) => `Arc ${state} ${hours} h sur ${total}`,
      en: (state, hours, total) => `Link ${state} ${hours} h of ${total}`,
      sample: ['declared closed', '26', '168'],
    },
    noGeometry: {
      fr: '⚠ Aucune géométrie publiée pour cet arc — non tracé',
      en: '⚠ No geometry published for this link — not drawn',
    },
    provenance: {
      fr: (week, slot) => `Mesuré, J-2 · semaine ${week} · ${slot}`,
      en: (week, slot) => `Measured, D-2 · week ${week} · ${slot}`,
      note: 'D-2: the city publishes its counts two days behind.',
      sample: ['August 24 to 30, 2026', 'typical weekday · 18:00'],
    },
    credit: {
      fr: 'Ville de Paris — ODbL',
      en: 'Ville de Paris — ODbL',
      note: 'The publisher\'s own name and the licence: the same line in either language.',
      keep: ['Ville', 'de'],
    },
  },

  detection: {
    flow: {
      fr: (flow) => `${flow} véh/h`,
      en: (flow) => `${flow} veh/h`,
      sample: ['1,240'],
    },
  },

  errors: {
    refresh: {
      fr: 'rafraîchissement des comptages indisponible',
      en: 'counts refresh unavailable',
      note: 'A week-old pack is still the same week: it keeps drawing and says the refresh failed.',
    },
    unavailable: {
      fr: 'comptages routiers de Paris indisponibles',
      en: 'Paris traffic counts unavailable',
    },
  },

  row: {
    loading: { fr: 'lecture de la semaine mesurée...', en: 'reading the measured week...' },
    outOfView: {
      fr: 'Paris intra-muros uniquement — hors de la vue',
      en: 'Paris inner city only — outside this view',
    },
    counted: {
      fr: (count, week) => `${count} arcs comptés${week}`,
      en: (count, week) => `${count} links counted${week}`,
      note: '`week` is already the " · semaine …" tail, or an empty string.',
      sample: ['1,730', ' · week August 24 to 30, 2026'],
    },
    week: {
      fr: (when) => ` · semaine ${when}`,
      en: (when) => ` · week ${when}`,
      sample: ['August 24 to 30, 2026'],
    },
    silent: {
      fr: (count) => `${count} sans aucune mesure`,
      en: (count) => `${count} with no measurement at all`,
      sample: ['891'],
    },
    unplaced: {
      fr: (count) => `${count} arcs mesurés sans géométrie publiée`,
      en: (count) => `${count} measured links with no published geometry`,
      note: 'Stated here because the map cannot state it: there is nothing on screen to click.',
      sample: ['64'],
    },
  },

  chips: {
    followParis: {
      fr: (slot, week) => `Suivre l’horloge de Paris — actuellement ${slot}, lu dans la semaine archivée ${week}`,
      en: (slot, week) => `Follow the Paris clock — now ${slot}, read in the archived week ${week}`,
      sample: ['typical weekday · 18:00', 'August 24 to 30, 2026'],
    },
    pinned: {
      fr: (slot, week) => `${slot} — semaine archivée ${week}`,
      en: (slot, week) => `${slot} — archived week ${week}`,
      sample: ['typical weekday · 04:00', 'August 24 to 30, 2026'],
    },
    alsoMoves: {
      fr: ' · déplace aussi les autres couches de semaine type',
      en: ' · also moves the other typical-week layers',
    },
  },

  legend: {
    width: {
      fr: 'Épaisseur = véhicules par heure',
      en: 'Width = vehicles per hour',
    },
    occupancyBlurb: {
      fr: 'mesure réelle dans une autre unité, hors de l’échelle en véh/h',
      en: 'a real measurement in another unit, off the veh/h scale',
    },
    gapBlurb: {
      fr: 'compte dans la semaine, rien publié pour cette tranche',
      en: 'counts during the week, nothing published for this band',
    },
    silentBlurb: {
      fr: (invalid, closed, open) => `${invalid} invalides, ${closed} barrés, ${open} déclarés ouverts`,
      en: (invalid, closed, open) => `${invalid} invalid, ${closed} closed, ${open} declared open`,
      note: 'The three reasons the City gives, summed by the payload and never by a sentence.',
      sample: ['724', '26', '141'],
    },
  },
});
