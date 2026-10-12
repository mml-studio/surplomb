// Entry for /confidentialite: wires the « Ne pas être mesuré » button, which
// exists only while something is measured — the first-run A/B test or the
// audience measurement (`measure` in src/legalNotice.js).
import { wireFirstRunOptOut } from './firstRunOptOut.js';

wireFirstRunOptOut(document);
