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
| Anglet history omitted because its current board was already registered | Query dODu for Anglet too; current board records win exact overlaps | Export since 2023-11-01: 952 unique dossiers, 952 addresses, 944 with parcel references |
| Ustaritz history omitted because publication-actes.fr already supplied recent notices | Query dODu for Ustaritz too, with the same overlap rule | Same window: 513 unique dossiers, 513 addresses, 512 with parcel references |
| Board protocols marked files for OCR, but the nightly sweep also required a city flag | Pass the runner to the reader; each file still opts in, visits never run OCR | 35 `posted-acts` and nine `sieve-acts` registry entries lacked the city flag; regression test completes 42 cached scans in two bounded passes |
| New sources seeded with only six PDF downloads | Complete the existing archive backlog through the established readers | Targeted collection covers Arbonne, Ayherre, Mauléon-Licharre, Saint-Laurent-de-Gosse and Arcangues |

The Anglet municipal open-data endpoint was compared with dODu over the same
window: it returned the same 952 dossier identities, so querying it as an
additional source would add no dossier. Its latest filing is 2025-12-31;
Ustaritz's latest dODu decision is 2026-05-13. Neither is a substitute for a
current board. The explicit export column selection excludes applicants.

The comparison identity includes the family and the complete dossier key:
PC and DP can share a counter, and an amendment is a separate record.
Historical exports supplement only absent identities. Existing Sitadel
deduplication then runs on the combined local records.

## Remaining geographical gaps

| Instruction area | Municipalities without an identified local source | Population | Share of the whole scope |
| --- | ---: | ---: | ---: |
| Basque agglomeration | 142 | 122,028 | 28.2% |
| MACS | 13 | 41,206 | 9.5% |
| Seignanx | 7 | 29,473 | 6.8% |

The largest remaining municipalities include Saint-Jean-de-Luz, Tarnos,
Capbreton, Soustons, Saint-Vincent-de-Tyrosse, Saint-Pée-sur-Nivelle, Ondres,
Saint-Martin-de-Seignanx, Saint-Pierre-d'Irube and Mouguerre. Their missing
local feeds cannot be filled by declaring their filing portals to be public
registers: the previously checked portals exposed login or filing services,
not an anonymous list of dossiers.

The most actionable route to an additional municipality remains enabling
public e-permis display for MACS's thirteen remaining municipalities. Their
neighbours already publish through that protocol. For the Basque and
Seignanx instruction services, a public register or periodic export would
cover more municipalities than another parser for the existing boards.
No request or message to an authority has been sent as part of this audit.

## Limits of the search and the measurement

- The earlier same-day crawl inspected 87 municipal websites that were not
  then covered. Eighty municipalities had no website in the available
  directory and were not crawled. These are unresolved discovery gaps,
  not proof that they publish no permit information.
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
