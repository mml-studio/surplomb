# The chronicle — recording what has no archive

> Everything else on the server is a cache: it exists so that the next request
> is cheap, and it is allowed to forget. This is the opposite.

## Why

Almost everything this fork draws over France is already an archive. Filosofi
publishes one year, DVF a decade, the Paris traffic counts a rolling thirteen
months — and it is because someone kept 27.7 million rows that
`comptagesRhythm.js` can state that **83.9% of the counted road links shift
their peak hour at the weekend**.

Five of the feeds this server already reads keep nothing:

| Feed | What it publishes | What is left of it |
|---|---|---|
| GTFS-RT (151 networks, national access point PAN) | Where a bus is now | Overwritten every ~30 s |
| QualiCharge dynamic | 75,427 charge points, free or occupied | Replaced at every publication |
| Bison Futé DATEX II | The color and the flow of a road section | The directory only keeps the current file |
| AISStream, France box | The ships heard | A socket cannot be replayed |
| Vigicrues | The flood-warning level of each river reach | Republished on top, twice a day |

None of them has a public history, and nobody sells one for France. Every hour
this server runs without recording is an hour that cannot be bought back.
Every hour it records is an hour nobody else has.

This is the Flightradar24 and MarineTraffic recipe: public signal, private
accumulation. The inputs stay public and can be downloaded again; what becomes
proprietary is **the accumulated time** — not the data.

## What is kept, and for how long

**The typical week — forever, and tiny.** Every series is folded into 168
hour-of-the-week slots (Monday 00:00 → Sunday 23:00, Paris time), each carrying
a running count, mean and variance (Welford). A slot is five numbers: a series
whose 168 slots are all filled weighs **5,341 bytes**, whether one year or ten
fed it. The file does not grow with time, only with the number of series — 250
full series come to 1.31 MB, and the widest source today has 99.

**The raw ticks — thirty days, one NDJSON file per local day.** They are the
emergency exit, and that is why retention is a month and not a week: **a fold
cannot be undone**. An axis nobody thought of on day one is lost for good,
unless the ticks are still there to rebuild it. Thirty days is four full weeks
— enough to rebuild a first profile on a new axis.

A finished day is compressed in place (`.ndjson` → `.ndjson.gz`). Measured on a
synthetic day of the QualiCharge journal (96 ticks × 5,000 charge points
changing state): **30.2 MB uncompressed, 4.2 MB compressed, a ratio of 7.3** —
the difference between 900 MB and 125 MB of retained month on a small VPS.

## The clock is Paris time, and that is not a detail

Because every rhythm recorded here is **human**. The evening peak is at 18:00
local time in February as in July; in UTC it moves by an hour twice a year,
which would smear two months of every profile across two slots and flatten
precisely the peak the profile exists to find.

The raw files are split on the same local date, so "Tuesday's file" and
"Tuesday's slots" talk about the same Tuesday. And the week ordinal — the one
that lets a slot say "seen over 6 distinct weeks" rather than the much weaker
"seen 312 times" — is derived from the same local calendar date, never from a
division of the epoch: both yearly clock changes pass through it exactly.

## A slot counts WEEKS, not samples

A source polled every five minutes puts 12 samples into a slot in a single
week. A source polled only when an operator is looking at that region puts in
one, or none. Judging "is this hour normal" on the count alone would let one
busy Tuesday certify the Tuesday 08:00 slot forever, on one week of evidence.

So every slot carries `w`, the number of **distinct** weeks that fed it, and the
reading **refuses to score** a value until that number reaches three. Before
that, the honest answer is "not enough history yet", and that is the answer
given.

## Vigicrues declares no typical week

A typical week only makes sense for a periodic phenomenon. Traffic,
punctuality, charge-point occupancy and ship presence are strongly periodic.
**A flood is not**: a warning level answers the rain, not Tuesday. Folding it
into hourly slots would manufacture a seasonality that does not exist, then
score real episodes against it.

So Vigicrues declares `profile: false`: only the raw ticks are kept, and
`/api/chronicle-fr/anomalies?source=vigicrues` **refuses** and gives the reason,
instead of returning an empty list that would read as "nothing unusual on the
rivers tonight". What counts here is the chronology: which reach turned orange,
when, and for how long.

## The bias to measure, not hide

Three of the four passive sources are recorded **only when someone is
looking**: the transit proxy polls per viewport, the road and Vigicrues proxies
refresh on demand. A profile's coverage is therefore a map of where this
server's operators pointed the camera, not of France.

Wishing does not fix it — polling 151 GTFS-RT feeds nationally is a real bill.
So it is **measured**: every slot carries its number of weeks, `/profile`
returns it, and a thin profile reads as thin rather than as a quiet network.

And the bill itself has been priced since 2026-09-07 (#97). The summary comes
down to two numbers — **42.3 GB a year** for national positions deduplicated at
30 s, **11 GB a year** for stop passages, of which only one month and twelve
months respectively need keeping, i.e. **≈ 15 GB at steady state** against
21 GB free on the VPS. What would really be expensive is what will not be done:
342 GB a year to keep whole bodies, and 1,718 GB of inbound traffic a year to
poll the TripUpdates at the same cadence when 88% of positions already name the
stop where the vehicle is.

An accepted corollary for transit: the fleet series is `feed.reported` — the
number of vehicles the **network** published — and never `feed.inView`, which
is the number that fell inside the requester's rectangle. Otherwise one and the
same series would mean "the vehicles TBM is running" while a camera is on
Bordeaux, and "the ones running in a 0.3° box near Lyon" ten minutes later.

## The axes, source by source

The choice of axis is **permanent** beyond the thirty-day window. The five
folds therefore live together in `vite.config.js`, under one heading, so they
can be reread at a glance.

| Source | Cadence | Folded series | Raw journal |
|---|---|---|---|
| `transit-fr` | 5 min / series | `feed:<id>/vehicles`, `/onTimePct`, `/spoken` | the ticks themselves |
| `irve-fr` | 15 min | `fr/*` national, `op:<code>/occupePct` (94 operators, 85 above the 20-charge-point floor) | **every state change of every charge point** |
| `road-status-fr` | 6 min | `fr/*` national, `axis:<A7>/congestedPct` and `/speedKph` (99 measured roads) | every color change of a section |
| `ais-fr` | 5 min | `fr/vessels`, `/moving`, `/knownType`, `/meanSog`, `cell:<lat>,<lon>/vessels` (1° squares) | the ticks themselves |
| `vigicrues` | 30 min | *none* | every level change of a reach |

Two axes were set aside, and they deserve writing down:

- **The road segment** rather than the road. 830 drawn sections × 2 series =
  1,660, against a ceiling of 250. The question worth asking — "is the A7
  slower than on a usual Saturday at 11:00" — is a question about the road. The
  segment level is not lost: it is in the event journal, for thirty days.
- **The department for IRVE.** It would need a weekly join with the static
  QualiCharge file (41.8 MB, 78,405 rows, `code_insee_commune` present). That is
  not expensive, but it is not done here — and since the raw journal is per
  charge point, the departmental axis stays **rebuildable** over the last
  thirty days on the day someone decides it. That is exactly what the raw
  journal is for.

## What recording costs

Nothing upstream, for four sources out of five: `recordChronicle` is called
with a payload the proxy had already downloaded and projected.

The fifth, the QualiCharge poller, is a **new** call: 1.17 MB compressed every
15 minutes, i.e. ~112 MB a day against the transport.data.gouv.fr proxy. That
is why — and the only reason why — it is **opt-in**
(`CHRONICLE_IRVE_DYNAMIC=1`), armed in `deploy/vps/docker-compose.yml` because
that is the deployment with a persistent volume, and so the only one where
accumulation is worth anything.

The first poll after a start logs the inherited state of the 75,427 charge
points (~2.9 MB). That is intended: after an outage nobody knows what changed,
so the baseline is rewritten rather than guessed.

**The real steady state, measured on 2026-09-08 on staging**, once the
baseline has passed:

| | Transitions | Uncompressed | Compressed | Per transition |
|---|---|---|---|---|
| Baseline at startup | 75,456 | 2,831 KB | 751 KB | 38.4 B |
| One steady-state poll (14 min) | **3,295** | **122 KB** | **28 KB** | 37.8 B |

That is ~316,000 transitions and **~12 MB uncompressed a day**, two and a half
times less than the synthetic estimate above, which assumed 5,000 charge points
changing per tick. Thirty days of raw journal therefore fit in about a hundred
megabytes.

**One consequence to know: a restart costs 23 polls**, i.e. nearly six hours of
recording in bytes. On staging, which redeploys on every push to the most
recent open pull request, a day of active development therefore writes more
baselines than transitions. It is not a leak — every baseline is a true, dated
state — but it is why "the journal doubled" is not a sign of anything wrong
until someone has looked at `docker inspect -f {{.State.StartedAt}} gev`.

## The routes

```
GET /api/chronicle-fr/status                     the five sources, their license,
                                                 their cadence, what they hold
GET /api/chronicle-fr/series?source=             the known series, by weight
GET /api/chronicle-fr/profile?source=&series=    one typical week, 168 slots
GET /api/chronicle-fr/anomalies?source=&limit=   the latest value of each
                                                 series, scored against its slot
```

Read-only by construction: no route writes. Recording happens inside the
proxies that already download.

`/anomalies` tells **three** silences apart, because they do not mean the same
thing: `observed: 0` (nothing has been seen since the process started),
`unjudged` (everything seen fell into a slot that is too young), and
`judged > 0` with no band above `typical` (everything was ordinary).

A value is **scored before it is folded**. "Is this normal?" means "in the
light of what was known before it happened"; scoring afterwards puts the value
inside its own expectation and pulls every reading towards `typical`. On a
young slot this is no rounding error: measured on five samples, a value 400
above the mean of the other four scored 1.8 σ instead of the dozens it was
really worth.

## The license line

Four of the five are under Licence Ouverte 2.0 (Etalab Open License 2.0), which
allows a proprietary derivative against attribution alone. The fifth,
AISStream, rebroadcasts a public radio transmission with no formal conditions.

**GTFS-RT is the one to read feed by feed.** The PAN catalog declares Licence
Ouverte 2.0 on most French real-time feeds and **ODbL 1.0 on a substantial
minority** — and ODbL share-alike reaches every **derived database** exposed
publicly, not only the map drawn from it. The declared license therefore
travels with each source in `chronicleSources.js`, and `/status` returns it on
every line: a profile built on an ODbL feed stays share-alike whatever is
stacked on top. It is what a future export path must consult; it is not
decoration.

## Where it is written

| File | What it carries |
|---|---|
| `src/data/chronicle.js` | The clock, the 168-slot fold, the anomaly reading, the retention arithmetic. Pure, tested offline. |
| `src/data/chronicleSources.js` | The five declared sources: license, attribution, cadence, axes, and why nobody keeps their past. |
| `src/data/qualichargeDynamic.js` | The only new upstream source, and the three measured traps of its file. |
| `vite.config.js` | The files, the buffering, the atomic rename, the retention sweep, and the five folds. |
| `scripts/qa-chronicle.mjs` | `npm run qa:chronicle -- --url http://localhost:5173` |
| `scripts/measure-pan-gtfs-rt-cost.mjs` | The national pricing: cost of one sweep, republication cadence, weight of one sample, and `--budget`, which redoes the year without the network. |
| `scripts/measure-gtfs-service-day.mjs` | The service day drawn from the published timetables — the factor that turns a one-hour probe into a year. |

## The trap worth the detour: a third of the IRVE file is not about now

`horodatage` says when the operator last spoke about this charge point, not
when the file was built — and it goes back years. Measured on 2026-09-07 at
16:37 UTC over the 75,427 rows:

| Freshness | Rows | Share |
|---|---|---|
| < 1 h | 17,786 | 23.6% |
| < 6 h | 40,915 | 54.2% |
| < 24 h | 51,230 | 67.9% |
| < 7 d | 62,796 | 83.3% |
| < 30 d | 67,737 | 89.8% |
| oldest | | **862 days** |

And the stale rows are not stale-and-silent, they are stale-and-**assertive**:
of the 24,197 outside the last 24 hours, **18,052 still say `libre`** (free)
and only 858 `occupe` (occupied). Reading the file as it stands gives 58,742
free charge points; counting only what was reasserted within the day gives
40,690. **A naive reading inflates France's free charging capacity by 44.4%**,
and always in the same direction — an operator that goes quiet goes quiet while
its charge points sit idle.
