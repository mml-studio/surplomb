// Entry for /confidentialite: wires the « Ne pas être mesuré » button, which
// exists only while the first-run A/B test runs (src/legalNotice.js).
import { wireFirstRunOptOut } from './firstRunOptOut.js';

wireFirstRunOptOut(document);
