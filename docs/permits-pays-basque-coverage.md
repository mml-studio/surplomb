# Permit completeness in the Pays basque and southern Landes

Audit date: 2026-11-16. Scope: the Basque agglomeration, Maremne Adour
Côte-Sud (MACS), and the Seignanx: 189 municipalities and 432,619 inhabitants.
Population and municipal boundaries use the same snapshot as the previous
coverage calculation, so changes can be compared directly.

## What the percentages mean

| Measure | Municipalities | Population | Share |
| --- | ---: | ---: | ---: |
| Recent local source observed | 24 | 216,558 | 50.1% |
| Recent source or delayed dODu source | 27 | 239,912 | 55.5% |
| Neither identified in this audit | 162 | 192,707 | 44.5% |

The table is the deployed baseline before this pass. Orx's newly verified
reader adds 647 inhabitants: after deployment, recent-source availability
is 25 municipalities / 217,205 inhabitants (50.2%), and availability
including delayed dODu is 28 / 240,559 (55.6%). Bidache, found in a third
pass, adds 1,338 more: 26 / 218,543 (50.5%) and 29 / 241,897 (55.9%). That
leaves 160 municipalities and 190,722 inhabitants without an identified
local feed.

These are **population shares with an identified local source**, not the
percentage of permits collected. The national Sitadel source remains
available in the other municipalities, with its existing publication lag
and limited scope. A registered source can omit families, expose only a
short posting window, or provide scans whose fields have not been read.
Saint-Jean-Pied-de-Port is registered but was excluded from the recent-source
baseline because its archive had no new row in the measured thirty days.

Historical additions within Anglet and Ustaritz do not change the two
population percentages. Nor does completing a pending scan: it improves the
content and placement of dossiers in an already counted municipality.

## Changes made after the first delivery

| Gap | Change | Evidence |
| --- | --- | --- |
| Orx's site missing from the directory used in the first crawl | Add its municipal publications page to `posted-acts`, with OCR and explicit year-first filename dates | Filing receipts and signed orders for 2025–2026, including 2026-11-12 notices; robots allows the files |
| Anglet history omitted because its current board was already registered | Query dODu for Anglet too; current board records win exact overlaps | Export since 2023-11-01: 952 unique dossiers, 952 addresses, 944 with parcel references |
| Ustaritz history omitted because publication-actes.fr already supplied recent notices | Query dODu for Ustaritz too, with the same overlap rule | Same window: 513 unique dossiers, 513 addresses, 512 with parcel references |
| Board protocols marked files for OCR, but the nightly sweep also required a city flag | Pass the runner to the reader; each file still opts in, visits never run OCR | 35 `posted-acts` and nine `sieve-acts` registry entries lacked the city flag; regression test completes 42 cached scans in two bounded passes |
| Bidache's per-family order pages not linked from any page the first crawl followed | Add both pages to `posted-acts`, with OCR and an opt-in day-first reading of its eight-digit decision days | 5 permits and 4 declarations decided 2026-09-02 to 2026-10-12; first local collection: 9 dossiers, 8 addresses, 6 parcel references; robots allows all |
| New sources seeded with only six PDF downloads | Complete the existing archive backlog through the established readers | Targeted collection covers Arbonne, Ayherre, Mauléon-Licharre, Saint-Laurent-de-Gosse and Arcangues |

Orx's first complete local collection read 36 files without failed downloads,
pending OCR or skipped files. After folding receipts and decisions it held
24 building/development/declaration dossiers (20 with a project address,
two with parcel references), plus ten planning certificates. The certificates
are reported separately rather than counted as construction permits.

The Anglet municipal open-data endpoint was compared with dODu over the same
window: it returned the same 952 dossier identities, so querying it as an
additional source would add no dossier. Its latest filing is 2025-12-31;
Ustaritz's latest dODu decision is 2026-05-13. Neither is a substitute for a
current board. The explicit export column selection excludes applicants.

The comparison identity includes the family and the complete dossier key:
PC and DP can share a counter, and an amendment is a separate record.
Historical exports add absent identities and complete missing fields on
matches. A dated decision can complete an older filing notice; it never
replaces an explicit current verdict or current review. Both sources remain
attributed. Existing Sitadel deduplication then runs on the combined records.

Live local API checks against the upstream services used a 36-month window
and a 1,200 m effective radius. Around the sampled Anglet point the response
contained 386 dossiers, including 263 from dODu; around Ustaritz it contained
161, including 114 from dODu. Neither response contained a duplicate
family/dossier key. These are radius samples, not municipality-wide totals.
Ustaritz's current source also reported five filing lists without a readable
text layer and 54 unplaced current-source dossiers; Anglet's current board
reported thirteen unplaced dossiers. Those remaining extraction and
placement gaps are not resolved by adding historical exports.

## Remaining geographical gaps after Orx and Bidache integration

| Instruction area | Municipalities without an identified local source | Population | Share of the whole scope |
| --- | ---: | ---: | ---: |
| Basque agglomeration | 141 | 120,690 | 27.9% |
| MACS | 12 | 40,559 | 9.4% |
| Seignanx | 7 | 29,473 | 6.8% |

The largest remaining municipalities include Saint-Jean-de-Luz, Tarnos,
Capbreton, Soustons, Saint-Vincent-de-Tyrosse, Saint-Pée-sur-Nivelle, Ondres,
Saint-Martin-de-Seignanx, Saint-Pierre-d'Irube and Mouguerre. Their missing
local feeds cannot be filled by declaring their filing portals to be public
registers: the previously checked portals exposed login or filing services,
not an anonymous list of dossiers.

The most actionable route to an additional municipality remains enabling
public e-permis display for MACS's twelve remaining municipalities. Their
neighbours already publish through that protocol. For the Basque and
Seignanx instruction services, a public register or periodic export would
cover more municipalities than another parser for the existing boards.
No request or message to an authority has been sent as part of this audit.

## Limits of the search and the measurement

- The earlier same-day crawl inspected 87 municipal websites that were not
  then covered. Eighty municipalities had no website in the available
  directory and were not crawled. These are unresolved discovery gaps,
  not proof that they publish no permit information.
- This second pass checked the official Basque directory for all 79 Basque
  municipalities in that group and probed the seventeen custom contact
  domains it disclosed, including HTTP and `www` variants. It recovered
  Pagolle's official site over HTTP (its HTTPS certificate is self-signed).
  A crawl of its pages found no permit register or 2025/2026 dossier links.
  The eightieth directory gap, Orx in the Landes, was resolved through its
  official municipal site; unlike Pagolle it publishes individual permits,
  and is integrated in this change.
- A third pass crawled the 86 remaining municipal sites recursively and
  probed each for the template pages of the CMS Bidache uses
  (`/permis-de-construire-exemple`, `/publications/arretes-d-urbanisme`).
  Only Bidache publishes individual permits. Saint-Pée-sur-Nivelle,
  Biriatou, Bassussarry and Saint-Martin-de-Hinx post road and public-domain
  orders only; Ascain's monthly urbanism pages stop at April 2025. The
  Cartelmatic street kiosks of Capbreton and Seignosse have no anonymous web
  view (their API asks for a device token), and the regional PIGMA
  catalogue holds no municipal dossier set for the area.
- PanneauPocket, IntraMuros, publication-actes.fr, the clicmap acts registry,
  Sirap APGL, WordPress media and the regional open-data catalogues were
  checked in the preceding same-day research. A negative result describes
  that inspection, not a permanent absence of a source.
- The first archive dates limit what a short-lived public board can recover.
  Bayonne and Anglet had earlier collection gaps; a successful nightly run
  cannot reconstruct notices the publisher has already removed.
- Comparing dossier counters with the highest published number is only a
  heuristic. Separate numbering series, amendments and unused numbers make
  it unsuitable as a certified completeness percentage.
- An address or parcel reference in the export is not proof of successful
  map placement. Placement and unplaced counts must be checked separately.
- A completed OCR attempt is not proof that all fields were recognized.
  Failed downloads and pending scans are counted by the readers; successful
  OCR can still leave a dossier without an address or parcel reference.
