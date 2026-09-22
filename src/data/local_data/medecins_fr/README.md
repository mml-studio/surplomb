# Where doctors practice in France, with a coordinate

Two files, drawn by the `medecins-fr` layer (**Health & emergency services**,
planned as *Médecins (FR)* when this pack was first built):

- `medecins.json` — every address in France where a doctor practices under the
  national health-insurance agreement (*conventionné*), its coordinate, what is
  practiced there, and the DREES's **APL** (local GP accessibility). **No
  names.** A copy lives in this directory, in git;
- `praticiens.jsonl` — the named practitioners, one line per address, in the
  same order as `sites[]`. **Never in git**: each deployment builds it, with a
  fresh `medecins.json` beside it, into its own cache volume
  (`.gev-cache/medecins-fr/pack/`), and the hosted site rebuilds it every week.
  See [the names](#the-names-built-by-each-deployment-never-committed).

They exist for one simple and awkward reason: **the national register of
doctors has no coordinates, and every geocoded copy in circulation is a decade
old.**

Rebuild:

```
npm run medecins:registry                   # both files, into .gev-cache/medecins-fr/pack/
npm run medecins:registry -- --repo         # the name-free medecins.json.gz, into this directory
npm run medecins:registry -- --report       # + the precision / coverage audit
npm run medecins:registry -- --verifier     # + the check against the CNAM headcount
npm run medecins:registry -- --refresh      # re-downloads, ignores the cache
npm run medecins:registry -- --no-cds       # without the health centers
npm run medecins:registry -- --no-apl       # without the accessibility indicator
npm run medecins:registry -- --praticiens   # + the per-practitioner CSV in .gev-cache/
npm run medecins:registry -- --plain        # writes both outputs uncompressed
```

Measured on 2026-09-22 against the 2026-09-21 edition: a full `--refresh`
build takes **6 min 21 s**, nearly all of it waiting on the BAN (24 s of CPU),
downloads 214 MB (the register 159 MB, FINESS 44 MB, the APL workbook and the
commune list) and needs a **heap between 1.25 and 1.5 GB** — it dies at
`--max-old-space-size=1280` and finishes at 1536, 1.76 GB peak footprint; under
the hosted unit's 2048 it took 6 min 11 s and 1.95 GB. It needed more than
2 GB of heap before the CSV reader stopped building each field one character
at a time and holding every row twice. That edition gives 64,297 addresses
located out of 64,691 (99.4%; 64,295 on a second run the same day — the BAN
is not strictly repeatable) and 193,955 named practitioner entries.

## The names: built by each deployment, never committed

Until 2026-09-22 `praticiens.jsonl.gz` was committed here, from the 2026-08-17
edition, and served unchanged. Displaying the names is lawful — the CNAM
publishes them as open data under article L. 1461-2 of the Public Health Code —
but a reuser of published personal data becomes a controller of its own (CNIL
guidance on reuse), owes their accuracy (GDPR art. 5(1)(d)) and must honour an
objection (art. 21). A copy frozen in a public repository can do neither: a
correction made at Ameli never reaches it, and a name cannot be withdrawn from
it. So:

- **The names are built, not shipped.** `npm run medecins:registry` writes the
  pair into `.gev-cache/medecins-fr/pack/` (`GEV_MEDECINS_PACK_DIR`), which the
  hosted stack mounts as a volume. The hosted box rebuilds it **every Monday**
  (`gev-medecins-refresh.timer`, [docs/DEPLOY.md](../../../../docs/DEPLOY.md)),
  so a correction made at Ameli reaches the map within a week. The proxy
  re-checks the pair once a minute; no restart.
- **The pair wins over this directory.** When it exists the proxy serves it;
  when it does not, the layer draws from the `medecins.json.gz` here — every
  address, count, specialty and APL value — and a practice card says the
  names are not available on this server. A fresh clone therefore works with
  no build at all, minus the names.
- **An objection is a line in a file.** `GEV_MEDECINS_SUPPRESS` (default
  `.gev-cache/medecins-fr/suppress.txt`, never in git: it names exactly the
  people who asked not to be named) lists one practitioner per line, as the
  directory spells the name, optionally narrowed to a postal-code prefix:

  ```
  # 2026-09-22, objection received by email
  SURNAME FIRSTNAME
  OTHERSURNAME FIRSTNAME ; 75011
  ```

  Matching ignores accents, case, punctuation and word order, and is exact on
  the words: `SURNAME JEAN` does not hide `SURNAME JEAN PIERRE`. The proxy reads
  the file again whenever it changes and applies it to **every** card, with
  `Cache-Control: no-store`, so the next card anyone opens honours it; the
  weekly build applies it too, so the names file itself no longer holds the
  entry. The whole entry goes (name, title, specialty, sector); the address
  counts stay, because they name nobody. A list that exists but cannot be read
  fails closed: no names at all.
- **A names file only ever joins its own pack.** Line N is `sites[N]`, with no
  key, so a names file from another build would put every name on the wrong
  address. The build declares the file's sha256 in the pack
  (`praticiens: {lignes, sha256}`), the copy here declares `praticiens: null`,
  and the proxy refuses any pair that does not match. Every answer carries a
  `packId`, and `/praticiens` refuses an index from another pack with 409, so a
  tab left open across a weekly rebuild re-reads its sites instead of showing
  this week's names at last week's addresses.
- **One address line was a nameplate.** The register's address block is free
  text, and one practice of 64,232 wrote `CABINET DU DR` followed by its
  doctor's initial and surname. The build now empties an address line that
  carries a title word and the surname of a doctor of that same site, unless
  it starts like a street (three do: streets named after a doctor, with a
  namesake practising there). `stats.voiesMasquees` counts them: 1.

Removing the file from git does not remove it from git's **history**, nor from
forks made before 2026-09-22; rewriting published history was left out on
purpose.

## The state of play, checked 2026-09-01

**The authoritative source is blind.** The CNAM (the national health insurance
fund) publishes the [Annuaire santé
Ameli](https://www.data.gouv.fr/datasets/annuaire-sante-ameli)
(`annuaire-sante-ameli`, Licence Ouverte 2.0, weekly) under article L. 1461-2
of the Public Health Code (*Code de la santé publique*). Edition of 2026-08-17:
**555,249 rows, of which 194,114 are doctors**. Its address block is called
`coordonnees_*`, and the word is a false friend — `coordonnees_voie`,
`coordonnees_code_postal`, `coordonnees_num_tel`: these are *coordonnées* in the
sense of "how to reach you". **There is not a single latitude in the file.**

**Geocoded copies exist, and they must not be used.** Opendatasoft publishes
`medecins` with a real `geo_point_2d` and an Explore v2.1 API that would make
this script unnecessary; a dozen regional and local portals federate it
(Île-de-France, Aix-Marseille, Orléans, Blois, Gers, Soissons…) — checked for
Île-de-France: same processing timestamp, it is the same dataset filtered. All
of them descend from the **previous** CNAM directory, replaced at the end of
2025, and the age shows in their own columns:

- their agreement field still says *“Secteur 2, Signature du contrat d'accès
  aux soins”* (sector 2, signed the care-access contract). The CAS has been
  closed to new signatures since **2016-12-31** and replaced by OPTAM — which is
  what the current file publishes;
- they count **128,721 distinct professionals, all professions combined**
  (dentists and midwives included), against 117,922 doctors named here;
- their `references` field points to
  `data.gouv.fr/fr/datasets/annuaire-sante-de-la-cnam/`, which answers **404**
  (the API redirects to a `-deprecie` slug that does not resolve either).

This is not a mirror running late; it is another decade.

**The only national register geocoded daily is closed.** Atlasanté publishes
the RPPS layer geocoded by the IGN geoservices, with a GeoJSON API. It answers
`HTTP 403 — "Accès interdit aux données en consultation"` (access to the data
forbidden) outside the network of the ARS (regional health agencies).

**The other leads, and why they do not replace this one:**

| Source | What it gives | Why it is not enough |
| --- | --- | --- |
| **ANS — RPPS extract** (LO 2.0, **daily**) | Every professional authorized to practice, salaried ones included. 817 MB | No coordinate either. It is the exhaustive complement, not the shortcut |
| **Annuaire Santé FHIR API** (ANS) | The same directory over REST | Key required, and no coordinate there either |
| **Santé.fr — practice accessibility** (LO 2.0) | RPPS + address + disability access, declared by the practitioner | Self-declared and partial; no coordinate |
| **FINESS — Structures** (ANS, LO 2.0, daily) | Establishments, not practitioners | A university hospital (CHU) is not a practice |
| **OpenStreetMap** (ODbL) | **31,747 `amenity=doctors` nodes** in mainland France (2026-09-01) | A quarter of the truth, with no specialty and no fee sector |

## Are we getting it right?

Yes, and it is measurable, because **the CNAM also publishes its own count of
the same population** — [`demographie-exercices-liberaux`](https://www.data.gouv.fr/datasets/professionnels-de-sante-liberaux-effectif-par-type-dexercice-liberal-et-par-territoire-departement-region)
on `data.ameli.fr`, the exclusive + mixed private-practice headcount, 2024
vintage. It is the ideal check: same publisher, same scope, an aggregation
independent of ours. `--verifier` replays it on demand.

| | CNAM 2024 | us (2026-08-17) | gap |
| --- | ---: | ---: | ---: |
| **All doctors** | **112,159** | **117,922** | **+5.1%** |
| General practitioners | 55,546 | 58,969 | +6.2% |
| Surgeons | 8,003 | 8,418 | +5.2% |
| Psychiatrists | 6,308 | 6,542 | +3.7% |
| Radiologists | 5,677 | 6,015 | +6.0% |
| Cardiologists | 5,018 | 5,247 | +4.6% |
| Ophthalmologists | 4,287 | 4,477 | +4.4% |
| Anesthesiologists and intensivists | 3,946 | 4,136 | +4.8% |
| Hepato-gastroenterologists | 2,020 | 2,042 | +1.1% |
| Rheumatologists | 1,432 | 1,410 | **−1.5%** |

23 professions matched, gaps from **−1.5% to +15.1%**, most of them between +2
and +6%. And above all, the gap is on the right side, for reasons that can be
named:

- **this register is a DIRECTORY, the check is an ACTIVITY count.** The CNAM
  demographics count the doctors who billed; the directory lists those who are
  under the agreement. A directory is always the larger of the two;
- **two years separate them** (2024 vintage against the August 2026 edition);
- **names merge namesakes** — which pulls DOWN, not up, so the true gap is a
  little larger than +5.1%, not smaller;
- conversely, the same doctor spelled differently at two sites (compound name,
  usual name, accent) counts twice.

**The geography holds too**, and that is what matters for a map: against the
CNAM's departmental headcounts, **median gap +2.1%, and 97 departments out of
101 within [−10%, +15%]**. No department is an outlier — so geocoding has not
moved population from one department to another.

**Independent anchor.** The [DREES, on the RPPS at January 1,
2025](https://drees.solidarites-sante.gouv.fr/communique-de-presse/250728_CP-demographie-des-professionnels-de-sante),
counts **237,200 practicing doctors**, of whom 42% are exclusively in private
practice and 13% mixed — that is, ≈ 130,000 doctors with a private practice.
Our 117,922 sit between the CNAM's activity count (112,159) and the DREES's
registration count (≈ 130,000). That is exactly where a directory of doctors
under the agreement should land.

## What is in it

Measured on the 2026-08-17 edition:

- **203,200 doctor entries** — 194,114 from the PS file (private practice) and
  9,086 from the CDS file (2,375 health centers at 2,346 addresses) — reduced
  to **64,625 distinct addresses**.
- **64,232 addresses located, 99.4%.** `sites[]`, one tuple per address:
  `[lat, lon, précision, insee, cp, ville, voie, tél, type, [[spécialité, n], …], nPraticiens, adresseRegistre]`.
  `cp` and `ville` (postal code and town) are the **BAN**'s (national address
  database), not the register's: the register writes `75651 PARIS CEDEX 13`
  where a card must read “75013 Paris”. `adresseRegistre` carries the
  register's spelling when the two diverge — 9.7% of addresses — and an empty
  string otherwise.
- **193,293 named practitioners** in `praticiens.jsonl`, one line per site:
  `[[nom, civilité, spécialité, secteur, option tarifaire], …]` (name, title,
  specialty, fee sector, pricing option).
- **APL 2024 for 34,890 municipalities**, and **64,043 of the 64,232 sites
  matched (99.7%)**.
- **393 addresses not located, 0.6%** — `nonLocalisees[]`, named and not
  erased.
- **Both files are written gzipped**: `medecins.json.gz` 2.0 MB and
  `praticiens.jsonl.gz` 1.5 MB, against 8.9 + 7.3 = **16.2 MB uncompressed**.
  `npm run medecins:registry -- --plain` writes the readable version; the proxy
  and the tests read whichever of the two is present. Only the first is in git.

### Why the names are in a second file

Inlining them in `medecins.json` was measured first: **+4.9 MB on a 7.3 MB
file**, downloaded in full to draw points that never show a name.
`praticiens.jsonl` has one line per site, in `sites[]` order — no join key,
nothing to index, and a byte-offset index stays trivial to build the day the
card goes through a proxy. An empty line `[]` is a health center, which
publishes no names: that is not the same claim as "no doctor here", and it is
why the site's `[[spécialité, n]]` tally counts those lines and the names file
does not.

### Precision is published, because it varies

| Precision | Addresses | What it is |
| --- | ---: | --- |
| `numero` | 53,456 (82.7%) | The exact door |
| `voie` | 9,366 (14.5%) | The street, not the number |
| `lieu-dit` | 682 (1.1%) | A locality |
| `commune` | 728 (1.1%) | **The village center — not a practice** |

A consumer that draws all four the same way claims a precision the source never
gave. Same rule as the schools layer.

### Three geocoding passes, and why three

A BAN pass filtered on the postal code places 60,702 addresses. The failures
are not bad addresses — they are **CEDEX** codes: the register writes
`57085 METZ CEDEX 03` where a postal code goes, and that is a mail-sorting
identity, not a place.

1. `voie` + `ville`, **filtered** on `code_postal` → 60,702.
2. The failures, CEDEX and CS/BP/TSA removed, **postal filter dropped** → 2,983.
3. What is still missing, `ville` alone, municipality center accepted → 547.

Passes 2 and 3 drop the postal filter, so they can match a namesake
municipality four departments away. Each result is checked against the
department of the original postal code and **discarded** when they disagree —
511 in pass 2, 381 in pass 3. Placing a Metz practice in the Var would be worse
than not placing it.

One exception is hard-wired, and only one: **Saint-Martin (977) and
Saint-Barthélemy (978) left Guadeloupe in 2007 but kept their `971xx` postal
codes**, so the register writes `971` where BAN answers `977`/`978`. The three
department codes are declared equivalent. Measured effect: **1 address** — it
fixes correctness, not recall.

### A fourth pass: when BAN follows the postal code against the town

BAN's `postcode` filter is a **hard** filter, and the register's postal code is
not always its municipality's. The line
`1100 RUE DE GENEVE / 01220 / DAGNEUX` names Dagneux, whose postal code is
01120; 01220 is Divonne-les-Bains's. Pass 1 honors the postal code, finds a
rue de Genève in Divonne, and places this doctor **99 km from their practice**
— with `numero` precision and a confident score, because from BAN's point of
view nothing went wrong.

So the build checks every position against the **official list of
municipalities** (`geo.api.gouv.fr`, 34,969 municipalities): if the
municipality found is not the one the register names and lies more than 15 km
from it, the build **asks again** for the address without the postal filter
and accepts the answer only if it falls in the right municipality; otherwise it
brings the point back to the **center of the register's municipality**, at
`commune` precision, rather than display a street number that is a fiction.
Measured: **32 suspect sites, 21 moved to their address, 11 brought back to the
municipality center** — `stats.reparations` publishes them.

## The APL: what the unit really means

The published unit is *“consultations, home visits and teleconsultations
accessible per standardized resident per year”*, and as it stands it tells
nobody anything. Its key is in the DREES methodology note: **one full-time GP =
5,400 consultations per year**. So

- `APL × population ÷ 5 400` = **the number of full-time GPs this municipality
  actually has access to**, neighbors included;
- `APL × 100 000 ÷ 5 400` = the same thing as a density: France at 3.26 means
  **60 full-time-equivalent GPs per 100,000 residents**.

It is **not** a density in the usual sense: the indicator counts the supply of
neighboring municipalities weighted by travel time, caps each doctor's activity
so that only sustainable supply counts, and standardizes the population by age
— a canton of retirees needs more care than a student neighborhood of the same
size. That is precisely why it exists: the DREES built it to replace "distance
to the nearest professional", which in France measures almost nothing (see the
next section).

**The reference figure is the one for doctors aged 65 or under.** It is the
series the DREES publishes and that everyone quotes — *“3.3 consultations per
year per resident in 2024”*. Reading the all-ages column instead answers 3.72
and puts you at odds with every publication. The builder therefore takes
`apl65` as the headline series.

**Checked end to end**: over the workbook's three vintages, this code
reproduces the DREES's official table *“Indicateurs d'APL moyens par dixièmes
de population”* (mean APL by population tenth) — mean 3.34 / 3.29 / 3.26
against 3.34 / 3.29 / 3.26 published, 1st tenth 1.47 / 1.39 / 1.32 against
1.47 / 1.38 / 1.32, within ±0.02 on the last tenth (municipal values rounded to
two decimals).

### Placing a municipality, rather than quoting a number

“2.36 consultations per resident” is not actionable. “This municipality is in
the 3rd tenth — the 30% of France least well served” is. `apl.dixiemes`
publishes the ten population deciles and `apl.bornes` the value that closes
each one, so any municipality can be placed. The thresholds of the ARS zoning
complete the picture: **under-served at 2.5 or less**, well served above 4.

Two weighting rules, both structural and both easy to miss — the DREES note is
explicit: the **mean** is weighted by the **standardized** population, the
**deciles and the counts under a threshold** by the **total** population.
Swapping them changes the answer.

### The retirement cliff

The three recomputed columns are the closest thing there is to an "and in five
years?". France, 2024 vintage:

| | APL | |
| --- | ---: | ---: |
| all GPs | 3.73 | |
| without those ≥ 65 | 3.27 | −12% |
| without those ≥ 62 | 2.91 | **−22%** |
| without those ≥ 60 | 2.70 | −27% |

The departments that would lose most if the GPs aged ≥ 62 left: Yonne
(2.52 → 1.65, −35%), Haute-Corse (−34%), Eure-et-Loir (−33%), Guyane (−33%),
Creuse (−32%), Essonne (−31%).

### Coverage

**189 sites out of 64,232 have no APL**, each one explained: 72 in Marseille,
where BAN answered the municipality code `13055` instead of an arrondissement
(the DREES publishes by arrondissement); 61 in Saint-Martin and
Saint-Barthélemy, out of scope; **54 in Mayotte, which the indicator explicitly
excludes** (“France excluding Mayotte”); 2 isolated cases.

## The questions people actually ask

### “Is there a doctor near me?” — almost always yes

Distance from the center of each municipality to the nearest practitioner,
weighted by population (34,878 municipalities, 68.4 M residents):

| Specialty | Sites | Median distance | > 15 km | > 30 km |
| --- | ---: | ---: | ---: | ---: |
| **General practitioner** | 36,032 | **0.7 km** | **0.2%** | 0.2% |
| Ophthalmologist | 4,873 | 2.4 km | 8.6% | 0.7% |
| Cardiologist | 4,311 | 2.6 km | 10.6% | 1.1% |
| Psychiatrist | 5,838 | 2.8 km | 13.0% | 2.1% |
| Gynecologist / obstetrician | 3,951 | 3.1 km | 14.1% | 2.0% |
| Pediatrician | 2,531 | 3.6 km | 17.2% | 3.9% |
| Dermatologist | 2,478 | 3.8 km | 17.6% | 3.3% |

**5.8% of the population lives more than 5 km from a GP, 0.49% more than
10 km.** The extremes are all in Guyane: Maripasoula, 9,579 residents, 241 km.
In other words, **distance is not France's problem for general practice** — and
that is exactly what the APL exists to say: the problem is not “how far” but
“will there be room”.

For specialists it is the opposite: **one person in six in France lives more
than 15 km from a pediatrician or a dermatologist**. There, distance is the
real answer, and this file carries it.

### “How much will it cost me?”

Share of entries by fee sector (*secteur conventionnel*: sector 1 charges the
agreed fee, sector 2 may bill above it, OPTAM caps what it bills above) —
sector 2 without OPTAM means unregulated fees:

| Specialty | Sector 1 | Sector 2 + OPTAM | **Sector 2 alone** |
| --- | ---: | ---: | ---: |
| General practitioner | 94% | 2% | **2%** |
| Pediatrician | 42% | 30% | **28%** |
| Psychiatrist | 49% | 18% | **32%** |
| Dermatologist | 41% | 14% | **43%** |
| Gynecologist / obstetrician | 16% | 29% | **55%** |
| Ophthalmologist | 18% | 19% | **63%** |
| Orthopedic surgeon | 6% | 28% | **65%** |
| Plastic surgeon | 4% | 6% | **84%** |

For a GP the question hardly arises; for an ophthalmologist, **two
practitioners out of three set their fees freely**. The file carries that
information per practitioner, not only as an average.

### What this file can NOT answer

And it is better to say so than to fake it:

- **“Are they taking new patients?”** — nowhere in the register.
- **“How long is the wait for an appointment?”** — not there either.
- **“Are they really in on Tuesdays?”** — the old CNAM directory carried
  opening hours; the new Ameli file no longer publishes them.

## Four traps, measured

**1. The register has no identifier.** No RPPS, no ADELI, no SIRET — a name, a
specialty, an address. So "how many doctors are there" has no exact answer
here: the file publishes **187,584 (surname, first name, address) tuples** and
**117,922 distinct names**, and the true number lies between the two, closer to
the second. The CNAM check above is there to say by how much.

**2. An entry is not a person, and the gap depends on the specialty.**

All the figures in this README are about **located addresses**, the only base
the map draws — hence 58,969 GPs here and 59,145 when the 393 addresses BAN
did not place are counted too.

| Specialty | Entries | Distinct names | Entries per name |
| --- | ---: | ---: | ---: |
| General practitioner | 69,405 | 58,969 | **1.18** |
| Psychiatrist | 7,592 | 6,487 | 1.17 |
| Cardiologist | 10,549 | 5,247 | 2.01 |
| Ophthalmologist | 10,915 | 4,477 | 2.44 |
| **Radiologist** | 33,270 | 6,015 | **5.53** |

A radiologist is listed at every imaging site they cover. A map that sizes its
points on entries will make radiology France's second specialty, at 16% — it is
not. `nPraticiens`, the next-to-last field of each site, is the count of
distinct names for that reason.

**3. The register spells one specialty several ways.** `01`, `22` and `23` all
three say `Médecin généraliste` — 60,207, 6,897 and 688 rows — with nothing in
the published columns to tell them apart. `33`/`75` are both `Psychiatre`;
`07`/`70`/`77`/`79` are all `Gynécologue / Obstétricien`. Grouping by code —
the obvious move — **loses 7,585 GPs, 11% of them**. The file folds on the label
and publishes the fold in `specialitesAlias`.

**4. One doctor in thirteen practices in several departments.** 9,328 out of
117,922, in up to six departments each. Counting distinct names *within* each
department and summing the columns therefore counts **12,408 of them twice or
more**: the sum gives 130,330 for a country that has 117,922, i.e. +16.2%
instead of +5.1% against the CNAM check — and a median departmental gap of
+15.4% instead of +2.1%. `departements[dep][0]` assigns each doctor to **a
single** department, the one where they have the most entries, and that column
**sums exactly to `stats.medecinsNommes`**. Do not recompute it.

## What this file cannot say

It covers **private practice under the agreement** (*exercice libéral
conventionné*), and that alone. A salaried hospital doctor is not in it —
hence a map that thins out around a university hospital rather than lighting up
there. The exhaustive register of everyone authorized to practice is the ANS's
RPPS extract: daily, 817 MB, and with no coordinate either.

## What the layer costs, measured

Everything is measured over one full session — national view, mesh, city, then
thirty small camera moves — read through the browser's *Resource Timing* API.

| | before | after | |
| --- | ---: | ---: | ---: |
| **Full session, network bytes** | 3,360 KiB | **593 KiB** | 5.7× |
| `/mesh` | 1,445 KiB | **361 KiB** | 4.0× |
| `/sites`, dense box over Paris | 1,451 KiB | **163 KiB** | 8.9× |
| `/national` | 9 KiB | **4 KiB** | 2.1× |
| The two artifacts (only `medecins.json.gz` in git since 2026-09-22) | 16.18 MB | **3.67 MB** | 4.4× |

Four decisions, each with its price:

1. **Everything is gzipped on the wire.** Vite compresses the module graph it
   serves, not the routes added to it: before this, each of them went out
   uncompressed. The two payloads that never vary (`/national`, `/mesh`) are
   serialized and compressed **once** and then served as they are. Below 1 KiB
   compression is skipped — it made a 68-byte response larger than the
   original.
2. **The names left `/sites`.** On a dense Paris box they weighed **40% of
   1,451 KiB**: 16,069 names sent to draw 5,907 points, of which a reader opens
   one. They are now requested through `/praticiens?index=N&pack=…` on click,
   and cached per address.
3. **A view already served costs nothing.** `moveEnd` and `changed` both fire on
   the same gesture, and Cesium's rectangle differs between the two at the
   twelfth decimal — enough to request the same 800 KiB box twice. The view key
   is quantized to 1e-4° (≈ 11 m, a six-thousandth of the narrowest box). A
   superseded request is **aborted**, not left to arrive and be thrown away.
4. **The site sweep goes through a grid** of 0.25°, so it is bounded by what is
   on screen and not by the size of France.

What was **not** optimized, for lack of evidence: selecting the mesh costs
2.5 ms for 64,232 rows, on a camera event that does not arrive every frame — a
client-side spatial index would have added complexity for an invisible gain.
And Cesium rendering measures 0.4 ms per frame with the layer on.

The price of gzip on the artifacts: **15 ms of `gunzipSync` on the proxy's
first call**, once per process, against 12.5 MB on every clone, every CI run
and every container image.

## Attribution

Redistributed under Licence Ouverte 2.0 (Etalab Open License 2.0), attribution
required, including the date of last update:

> Annuaire santé Ameli — Caisse nationale de l'Assurance Maladie
> (data.gouv.fr), edition of 2026-08-17. Licence Ouverte 2.0.
> Accessibilité potentielle localisée (APL) 2024 aux médecins généralistes —
> DREES. Licence Ouverte 2.0.
> Geocoding: Base Adresse Nationale (api-adresse.data.gouv.fr), Licence
> Ouverte 2.0.

A deployment's own build carries its own edition date in `source.ps.modified`,
which `/api/medecins-fr/status` reports as `edition`.

The names file holds personal data about health professionals — name, title,
specialty, fee sector — published as open data under article L. 1461-2 of the
Public Health Code; the practice address and phone number in `medecins.json`
are the ones the CNAM publishes for the practice. Which is why the first is
built by each deployment, refreshed weekly and filtered through a suppression
list, and never committed: see
[the names](#the-names-built-by-each-deployment-never-committed).
