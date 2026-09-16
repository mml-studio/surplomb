# Deploying this fork

Surplomb is **not a static site**. `vite.config.js` carries ~35 middleware
proxies that broker API keys, cache upstream answers on disk and hold the AIS
websocket open, so a deployment has to run a Node process — `vite preview`,
which serves the built bundle *and* those proxies. Anything that only uploads
`dist/` gives you a globe with no live layers.

Two consequences shape everything below:

1. **A reachable origin is a spendable wallet.** `/api/realtime/token` and
   `/api/google/nearby-places` cost real money per call. Set
   `GEV_ACCESS_PASSWORD` before the URL exists, not after.
2. **`GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` are inlined at build time**
   (the `define` block in `vite.config.js`), so they must be present when the
   image is built, not only when it runs.

## The staging deployment

One box, one URL, showing the branch you most recently opened a pull request
for — as long as that branch still contains main. The VPS polls GitHub every
three minutes; nothing on GitHub needs a route back into the VPS, and the box
holds no CI credentials.

```
GitHub (public repo)
   ↑ poll every 3 min: newest open PR if it contains main, else main
/opt/gev/gev-deploy.sh  ──build──▶  docker compose  ──▶  gev container :4173
                                                            ↑            ↑
                                              cloudflared tunnel     tailnet
                                              gev.enerlens.com    100.x.x.x:4173
```

### What the URL is allowed to show

**Whatever is served contains main.** A preview is main plus the pull request,
never main minus a merge. That qualifier is the whole rule, and it exists
because the URL lied on 2026-09-10: PR #155 had been cut at #152, so #153 and
#154 were merged and stayed invisible for the rest of the afternoon while the
box reported a healthy, freshly built container. Nothing was broken — the agent
had faithfully deployed exactly what it was asked to deploy.

So `auto` now measures the candidate before showing it. It asks GitHub how many
commits of main the branch is missing (`/compare/<main>...<head>`, `behind_by`)
and, if the answer is anything but zero, shows **main** instead and says why.
The same applies when the answer cannot be obtained at all — a rate limit, an
outage, a pull request opened from a fork whose branch does not exist here:
main is the ref that cannot be missing merged work, so main is the fallback.
**To get a branch on the URL, rebase it onto main.** That is the only new
obligation this rule creates, and CI asks for it anyway.

The verdict is cached against the exact pair of shas it was computed for, so a
three-minute timer spends **one** API call per push rather than twenty per hour
against the 60/h anonymous quota this IP shares with its neighbours.

An explicit pin (`echo my-branch > /opt/gev/target`) still outranks all of
this — it is a decision, not an accident — but a stale pin now announces itself
in the journal and in `state/selection` instead of being discovered hours later.

`cat /opt/gev/state/selection` answers "why am I looking at this?" in one line:

```
2026-09-10T14:32:11Z auto -> main@2a4163b (PR #155 arrets-idfm-icones-et-fiche is 2 commit(s) behind main)
```

`scripts/gev-deploy-target.test.mjs` runs the real script against a fake GitHub
and holds every branch of that decision, including the refusal to publish a ref
that predates the access gate.

### Layout on the VPS

| Path | What it is |
| --- | --- |
| `/opt/gev/gev-deploy.sh` | the deploy agent (copy of `deploy/vps/gev-deploy.sh`) |
| `/opt/gev/docker-compose.yml` | the stack (copy of `deploy/vps/docker-compose.yml`) |
| `/opt/gev/.env` | keys + `GEV_ACCESS_PASSWORD`, `chmod 600`. **Do not `source` it from bash**. A `.env` is not shell: an unquoted value with an apostrophe or a space kills `. /opt/gev/.env`, which is how `OPENROUTER_APP_NAME` did it under the project's previous name at line 152. Docker's `env_file` parser is not a shell and reads it correctly. |
| `/opt/gev/src` | the source tree the agent swaps out, unpacked from a tarball |
| `/opt/gev/target` | `auto` (default), `main`, or a branch name to pin |
| `/opt/gev/state/deployed` | `branch@sha` currently live |
| `/opt/gev/state/selection` | one line: which ref was chosen this tick, and why it was not the other one |
| `/opt/gev/state/freshness` | `<head> <base> <behind_by>`, the cached verdict for one pair of shas |
| `/opt/gev/gev-health-probe.sh` | availability probe (copy of `deploy/vps/gev-health-probe.sh`) |
| `/opt/gev/src/scripts/warm-default-view.mjs` | weekly Overpass pre-warm, run by `gev-warm-view.timer` — ships with the source, nothing to copy |
| `/opt/gev/state/health.log` | one line per probe, ~7 days |

### The 2021 carroyage pack

The INSEE carroyage the Géoplateforme relays is **millésime 2019**; INSEE
published 2021 on 2026-02-12 and the relay has not moved. Staging draws 2021
only if the pack is built into the container's cache volume:

```bash
ssh vps 'docker exec gev npm run filosofi:pack-2021'   # ~2 min, 91 MB in, 59 MB out
ssh vps 'docker exec gev node scripts/build-filosofi-2021-pack.mjs --check'
```

It writes to `/app/.gev-cache/filosofi-2021`, which is the `gev-cache` named
volume, so it **survives redeploys** and only has to be rebuilt when INSEE ships
a new millésime. Without it the proxy serves the relay and reports
`vintage: 2019` — the year travels with every answer, so staging is never
wrong about which one it is showing, only older.

**Nothing else to do after the build.** The proxy re-checks for a pack once a
minute, and the millésime is part of the viewport cache key, so boxes already
cached under the relay are simply never read again. Neither of those was true
the first time this ran: staging kept answering 2019 until the cache was wiped
*and* the container restarted, in that order, and nothing on the wire said why.

The build streams the three CSVs straight out of the archive: no `unzip` (the
image has none) and no 473 MB of expanded intermediates on the volume.

### The everyday-amenity pack

`amenities-fr` draws 445 380 points folded from the INSEE BPE and FINESS. The
fold peaks around **1.3 GB of RSS**, which does not fit in this container, and
until 2026-09-14 the proxy did it in-process on the first request: measured that
day, memory went 327 → 941 MiB in fourteen seconds and the container died of
`Ineffective mark-compacts near heap limit`, exit 134, and restarted. Switching
the layer on took staging down, for everyone, every time.

So `GEV_AMENITIES_INPROCESS_BUILD=0` is set in the compose file, and the pack is
built in a **throwaway container off the same image**, with its own cgroup and
the cache volume mounted:

```bash
ssh vps '
  docker run --rm -m 3800m --memory-swap 3800m \
    -e NODE_OPTIONS=--max-old-space-size=3072 \
    -v gev_gev-cache:/app/.gev-cache \
    gev:staging npm run amenities:pack &&
  docker restart gev &&
  docker exec gev npm run amenities:pack -- --check
'
```

**3072 is a floor, not a round number.** Measured 2026-09-14 on the real
archive: 2048 and 2560 both die of `Ineffective mark-compacts near heap limit`
partway through the BPE read, 3072 finishes in 40 s at 1 751 MB of peak RSS. The
first try on the VPS used 2048 and aborted at two million rows. Check `free -m`
before running it — the box has ~4.5 GB available and Postgres is on it.

**Not on the host and not with `docker exec`.** The host carries Node 20 and no
`node_modules` — it has never needed either, because everything builds inside
Docker — and `docker exec gev` shares the running container's 1 GiB cgroup,
which is the ceiling this whole section exists to get out from under. A
throwaway `docker run` is the only one of the three that has the image, the
volume and a budget of its own.

The `docker restart` is not optional. The proxy reads the pack once per process
and remembers that it found nothing, so a container that started before the pack
existed keeps answering 503 until it is restarted.

It writes `pack.json` (mesh, rollup, provenance, shard index — ~10 MB) plus 356
gzipped `sites/<cell>.json.gz` shards (~14 MB). The server holds the first and
reads at most four shards per `/sites` request: **405 MB RSS** with the layer
live, against 644 MB of heap for the single-document pack it replaced.

**Rebuild it whenever `AMENITIES_CACHE_VERSION` changes.** That is the other half
of the 2026-09-14 outage: version 2 shipped on 2026-09-08, nobody rebuilt, and
the version-1 file sat in the volume being refused for six days. `--check` reports
the version and the age; `/api/amenities-fr/status` reports `pack: null` when
there is nothing usable, and the proxy now logs *why* it refused a file.

BPE is published once a year and FINESS once a month, so a pack is fresh for 30
days and served stale for 120.

### Day to day

```bash
ssh vps 'cat /opt/gev/state/deployed'          # what is live right now
ssh vps 'cat /opt/gev/state/selection'         # ...and why it, rather than main
ssh vps 'echo my-branch > /opt/gev/target'     # pin staging to one branch
ssh vps 'echo auto      > /opt/gev/target'     # back to newest-open-PR
ssh vps 'systemctl start gev-deploy.service'   # deploy now, do not wait
ssh vps 'journalctl -u gev-deploy -n 50'       # why a deploy did not happen
ssh vps 'docker logs -n 50 gev'                # why the app misbehaves
```

A failed build leaves the previous container running: staging never goes dark
because a PR does not compile. A ref cut before the access gate existed is
refused outright rather than deployed open. A branch that is behind main is not
refused — it is simply not shown, and main takes the URL until the branch is
rebased.

### Why the source arrives as a tarball and not a clone

On 2026-09-02 every deploy started failing with `could not read Username for
'https://github.com'`, three minutes apart, while the repository stayed public
and cloned fine from a laptop. Tracing it with `GIT_CURL_VERBOSE=1` narrowed it
to one request: GitHub answers this box's anonymous ref advertisement — a GET
on `/info/refs` — with **200**, then returns **401** to `POST
/git-upload-pack`. Every pack transfer goes through that POST, so `clone` and
`fetch` are both unavailable here whatever the protocol version. Listing a ref
still works, but only in **protocol v0**, which does not POST; the v2 default
cannot resolve a branch head from this IP at all.

So the agent resolves the head with `git -c protocol.version=0 ls-remote` and
downloads the tree from `codeload.github.com`, a plain GET. Both are anonymous,
which is the point: the alternative was a token, and this box deliberately
holds no credential that GitHub would honour. The costs are real and accepted —
the full tree every time instead of an incremental fetch, and `/opt/gev/src` is
no longer a git repository, so `git -C /opt/gev/src log` no longer answers.
Read `/opt/gev/state/deployed` instead; it carries the sha.

To check the deployment the way a browser meets it — bundle boots, canvas
draws, layer proxies answer from that origin — rather than by trusting a
`200` from `/healthz`:

```bash
node scripts/qa-deployment.mjs --url https://gev.enerlens.com/ --auth gev:<password>
```

### The VPS compose file does not update itself

The deploy agent swaps `/opt/gev/src` on every run, but it calls
`docker compose up -d --build` with **the box's own
`/opt/gev/docker-compose.yml`**, which it never rewrites. So a PR that adds an
environment variable to the repository's compose file is **inert on staging**
until that file is copied over by hand.

Not hypothetical: the chronicle merged on 2026-09-07 carrying
`CHRONICLE_IRVE_DYNAMIC: 1` in `deploy/vps/docker-compose.yml`, the VPS copy
dated from 2026-09-01, and the QualiCharge poller — the **only** source that
records without anyone looking — stayed disarmed for a day with no error and no
log line, `/api/chronicle-fr/status` simply answering `irveDynamic.armed: false`.

```bash
scp deploy/vps/docker-compose.yml vps:/opt/gev/
ssh vps 'cd /opt/gev && docker compose up -d'    # recreates the container; `restart` will not
ssh vps 'set -a; . /opt/gev/.env; set +a; curl -s -u "gev:$GEV_ACCESS_PASSWORD" \
  http://localhost:4173/api/chronicle-fr/status | head -c 200'
```

After any merge meant to change the environment, read `armed` — not GitHub.

### Bounds, because the box is shared

This VPS also carries the **Enerlens production** stack — Postgres, Redis,
Caddy, Next.js — plus gbrain, hermes and clawvisor, on 2 vCPU, 8 GB and
**no swap at all**. Until 2026-09-09 the GEV container had no memory limit,
no CPU limit and no heap ceiling, so an Overpass or AIS cache that ran away,
or a burst of cold boots gzipping 8 MB of JavaScript on the fly, could take
the memory out from under the database. Measured that day, idle: **197 MiB and
~2% CPU**, against 427 MB free and 4.6 GB available on the host.

`deploy/vps/docker-compose.yml` now carries four numbers:

| Setting | Value | What it is for |
| --- | --- | --- |
| `mem_limit` / `memswap_limit` | `1g` / `1g` | 5× the idle footprint. Equal values because the host has no swap, and that is how Docker is told not to start using any. |
| `cpus` | `1.5` | a ceiling on a runaway, not a reservation. |
| `cpu_shares` | `512` | the weight **under contention** — half the default, so GEV yields the core to Postgres when both want it, and still burns 1.5 vCPU when the box is idle. |
| `NODE_OPTIONS` | `--max-old-space-size=768` | Node sizes its heap from the **host's** memory, not the cgroup's. Without this the heap happily grows past `mem_limit` and the kernel OOM-kills the process instead of V8 collecting. |

Applying them is the `scp` from the section above — the deploy agent never
rewrites that file — and then:

```bash
scp deploy/vps/docker-compose.yml vps:/opt/gev/
ssh vps 'cd /opt/gev && docker compose config >/dev/null && docker compose up -d'
ssh vps 'docker inspect gev --format "mem={{.HostConfig.Memory}} cpus={{.HostConfig.NanoCpus}} shares={{.HostConfig.CpuShares}}"'
ssh vps 'docker stats --no-stream gev'
```

`docker inspect` reporting `mem=0` means the compose file was copied but the
container was only restarted, not recreated: `docker compose up -d` is the
verb, `restart` is not.

### Is it still up?

`gev-deploy.timer` knows the container was built and started. It learns
nothing about the tunnel, DNS, an edge rule, or a process that came up and
then wedged — so every outage so far has been found by somebody looking at a
screen. `deploy/vps/gev-health-probe.sh` checks both ends every five minutes
and writes one line per run:

```
2026-09-09T20:14:03Z origin=200 0.004 {"ok":true,...} public=200 0.081 {"ok":true,...}
```

`origin` up with `public` down is the tunnel or DNS; both down is the app. It
runs **from the VPS**, never from a laptop: the Cloudflare rule in front of
this origin is per source address, and the laptop shares its address with the
owner's browser.

```bash
scp deploy/vps/gev-health-probe.sh vps:/opt/gev/
scp deploy/vps/gev-health-probe.{service,timer} vps:/etc/systemd/system/
ssh vps 'chmod +x /opt/gev/gev-health-probe.sh'
ssh vps 'systemctl daemon-reload && systemctl enable --now gev-health-probe.timer'
ssh vps 'tail -5 /opt/gev/state/health.log'
```

### Somebody pays for the first road fetch of the week

A cold Overpass box costs **0.6 to 46 s**; the same query repeated costs
**52 to 78 ms**, and the proxy holds it on disk for **7 days**. Every visitor
lands on the same view, so exactly one of them per week pays that cost — with
nothing on screen while they wait.

`gev-warm-view.timer` makes it be nobody. It runs
`scripts/warm-default-view.mjs`, which derives the default view's Overpass cell
and fires the layer's two passes at it, byte for byte.

Three things about it that are not obvious:

- **It runs against `localhost:4173`, not the public URL.** The cache being
  warmed is the proxy's own, inside the container; and the Cloudflare rule in
  front of this origin is per source address.
- **It uses the HOST's node, not the container's.** The script imports only
  local modules — no `node_modules` — so it needs nothing the container has.
  (The container's bundled Chrome does not run anyway: `libglib-2.0.so.0`
  is missing from the slim image.)
- **It computes the cell instead of observing it**, which would rot silently
  the day `DEFAULT_CITY_VIEW` moves. `src/defaultView.test.mjs` pins the
  derivation against the box captured off the wire by
  `scripts/qa-span-par-viewport.mjs`, so that day fails CI by name instead.

```bash
scp deploy/vps/gev-warm-view.{service,timer} vps:/etc/systemd/system/
ssh vps 'systemctl daemon-reload && systemctl enable --now gev-warm-view.timer'
ssh vps 'systemctl start gev-warm-view.service'    # warm it now, do not wait
ssh vps 'journalctl -u gev-warm-view -n 20'        # what it asked for, and how long it took
```

A run that reports `cache=HIT` on its own first request is not a failure —
somebody warmed the cell before it. A run that reports **0 elements** is: a
cell that answers fast and draws nothing is worse than a cold one, and the
script exits non-zero for it.

### When Overpass stops answering the box altogether

**It is almost never a ban. It is an escalating per-IP throttle, and it
decays.** That distinction cost an afternoon on 2026-09-16, so it is the first
thing written here.

At 17:20 UTC, from inside the `gev` container, both FOSSGIS facades refused the
TCP connection in under 200 ms on every address, v4 and v6, five tries out of
five, while the same query answered 200 in 0.20 s from another network. That
reads exactly like a permanent IP ban, and it was diagnosed as one. It was not:
by 19:57 the same host was answering again from the same container, with nothing
done to it.

What it actually is, measured at 20:05 UTC — 8 back-to-back requests from the
container, same Marseille box, nothing else changed:

```
504/9458ms  504/7985ms  200/263ms  200/346ms  429/10947ms  429/10205ms  ERR/64ms  ERR/62ms
```

Slow, then fine, then rate-limited, then **connection refused** — in forty
seconds. The refusal is the TOP of a ladder you climb by pushing, not a door
that was locked. Which means:

- **Do not diagnose this by hammering it.** Three separate egress addresses
  were pushed into refusal in one afternoon, by the probes that were measuring
  the problem. A probe is load.
- **A control from another machine is what tells you the difference.** Ours ran
  `curl` from a laptop, interleaved, at the same second. When the laptop is
  *also* at 429, the host is not singling you out.
- Sample sizes of one or two say nothing here — the verdict changes between
  consecutive requests.

Why Paris keeps working while Marseille does not: Paris is the default view and
is in the disk cache; anywhere else has no graph, and the TomTom ribbon carries
its own geometry, so the roads still colour in with nobody driving on them. A
coloured road with no cars is an Overpass symptom, not a TomTom one.

Three levers, in the order they were used that day:

1. **Stop earning it.** `main@dcb881bb` took the client from ~4 300 POST/hour to
   26 — a loop where the browser and the proxy re-triggered each other. This is
   the one that matters, and it is what makes the rest optional.
2. **Leave by another address.** `deploy/cloudflare/overpass-relay/` forwards to
   FOSSGIS from Cloudflare's network; set `GEV_OVERPASS_RELAY_URL` and
   `GEV_OVERPASS_RELAY_TOKEN` in `/opt/gev/.env` and restart the container. Both
   are **runtime** variables, so no rebuild — unlike `GOOGLE_MAPS_API_KEY` and
   `CESIUM_ION_TOKEN`. It works: measured 20:23 UTC, the Marseille box came back
   200 in 3.8 s and `X-Overpass-Upstream` named the relay.
3. **Widen the rotation.** `maps.mail.ru` served the Biarritz box the same
   minute — 200, 1 406 ways, 20 s — after the relay and FOSSGIS had both failed.

There is a **fourth lever that was written and then dropped: asking FOSSGIS to
unblock us.** Do not send that mail without re-measuring first. There was no
standing block to lift, and asking for one would have described a problem that
had already decayed on its own.

**Reading the relay's failures.** A Worker that cannot reach its upstream does
not throw — Cloudflare hands it a synthetic **521** response, which this proxy
passes through and scores as `server-error`, parking the relay for 20 s. So a
521 from the relay means "FOSSGIS refused Cloudflare", not "the relay is
broken". Cloudflare's egress addresses are shared and get throttled like any
other; a 521 costs 0.2 s, which is why the relay is cheap to leave in front.

**The VK cost is real, not theoretical.** `maps.mail.ru` is last in the rotation
and is only reached when everything above it has failed — and on 2026-09-16 that
happened, so a genuine visitor viewport went to VK. Removing it is one line in
`OVERPASS_UPSTREAMS`; leaving it is a choice to re-make, not a default.

**Never add a regional instance**, however fast it probes. `overpass.osm.ch`
answered 200 in 0.1 s with `ways=0` at the exact moment every honest host was
failing, and the proxy cannot tell that from "there is genuinely nothing here" —
it would cache the void for the 7-to-30-day disk TTL.

One probe, from the right place, with the right agent string:

```bash
ssh vps 'docker exec gev node -e "fetch(\"https://overpass-api.de/api/interpreter\",{method:\"POST\",headers:{\"User-Agent\":\"surplomb/1.0\"},body:\"data=[out:json];out count;\"}).then(r=>console.log(r.status)).catch(e=>console.log(\"REFUSED\",e.message))"'
```

A `curl` **from the host** answers 200 and lies — the host has its own route and
its own reputation. Test from inside the container, or not at all.

### Installing it somewhere else

```bash
ssh box 'mkdir -p /opt/gev'
scp deploy/vps/docker-compose.yml deploy/vps/gev-deploy.sh deploy/vps/gev-health-probe.sh box:/opt/gev/
scp deploy/vps/gev-deploy.{service,timer} deploy/vps/gev-health-probe.{service,timer} deploy/vps/gev-warm-view.{service,timer} box:/etc/systemd/system/
ssh box 'chmod +x /opt/gev/gev-deploy.sh /opt/gev/gev-health-probe.sh && chmod 600 /opt/gev/.env'
ssh box 'systemctl daemon-reload && systemctl enable --now gev-deploy.timer gev-health-probe.timer gev-warm-view.timer'
```

`/opt/gev/.env` needs at least:

```
GEV_ACCESS_USER=gev
GEV_ACCESS_PASSWORD=<a long random string>
GEV_PUBLIC_HOST=<every hostname the deployment answers on, comma-separated>
GOOGLE_MAPS_API_KEY=...
```

plus whatever optional keys you want the layers to have (see `.env.example`).
`GEV_PUBLIC_HOST` is not decoration: `vite preview` answers `Blocked request`
to a `Host` header it was not told about.

## Why not GitHub Actions / Vercel / Render

- **GitHub Actions cannot host this.** A runner is an ephemeral VM that dies
  with the job (6 h ceiling), so it can *build and ship* the app but never
  *serve* it. It is a fine trigger — the pull-based timer here simply avoids
  handing GitHub an SSH key and opening a path into the VPS.
- **Vercel / Netlify** are static + serverless. The proxies keep in-process
  caches, a disk cache and a long-lived websocket; none of that survives a
  function boundary.
- **Render** hosts the Node process happily on its free tier, but per-PR
  preview environments there are a paid feature, and the free instance cold
  starts for ~a minute after 15 idle minutes.

## Privacy

`GEV_ACCESS_PASSWORD` fronts the whole origin with HTTP Basic, including
`/api/*`, so a stray fetch cannot spend your quota. `/healthz` stays open for
health checks and reports whether the gate is armed.

Two access paths are wired on the Enerlens box:

- **Tailnet** — `http://vps-enerlens.tailc409e8.ts.net:4173`. Nothing public;
  the port is only bound on loopback and the Tailscale address.
- **Cloudflare tunnel** — `https://gev.enerlens.com`, for devices without
  Tailscale. Add a Cloudflare Access policy on that hostname if you want SSO
  in front of the password.

### Where a visitor's bounding boxes go

Every Overpass-backed layer sends the box the camera is looking at to whichever
mirror answers first. Three of the four are run by OSM community
infrastructure; the fourth, `maps.mail.ru`, is operated by VK and is in the
rotation as a **last resort** — reached only after FOSSGIS and private.coffee
have both failed, which in normal operation is never. It is listed last in
`OVERPASS_UPSTREAMS` and removing it is one line. This is written down rather
than assumed because the queries that rotation carries include "where are the
military installations near here".

The Cloudflare relay (above) changes the source address those queries appear to
come from, and nothing else: it forwards our real `User-Agent` and contact URL,
adds no identity, and caches nothing.

### Provider Settings is not on the deployment

The in-app POWER UP panel writes API keys to disk. Its endpoints install
through `configureServer` only and are deliberately left out of the
preview-parity map that mirrors every other proxy onto `vite preview` — so on
this VPS, which runs `vite preview`, they do not exist. `POST /api/setup/keys`
returns 404 there, and the client removes the chip and the dialog from the DOM
rather than showing a surface that cannot work.

Two more layers hold even if that ever changed. The admission gate refuses any
request carrying a proxy header, which is every request that arrives through
the Cloudflare tunnel (`cf-connecting-ip`) or the nginx front — the very header
`GEV_TRUSTED_CLIENT_IP_HEADER` exists to read. And it refuses a `Host` that is
not a local name, which `gev.enerlens.com` is not.

Prove it after a deploy, from the VPS:

```bash
npm run qa:provider-settings -- --url http://localhost:4173 --expect-absent
```

## Rate limits: the app's, and anything in front of it

The app throttles its **key-spending** routes, opt-in, on two axes that answer
different questions (`.env.example` documents all six variables):

| | Variable | What it is for |
| --- | --- | --- |
| per address | `GEV_RATELIMIT_{OPENAI,GOOGLE,VOICE_BRAIN}_PER_MIN` | fairness — one visitor, or one runaway harness, cannot spend the account |
| all callers | `GEV_RATELIMIT_{OPENAI,GOOGLE,VOICE_BRAIN}_GLOBAL_PER_MIN` | **the bill** |

Everything else under `/api/*` is keyless open data with its own upstream
courtesy limits handled in-process.

**The per-address cap is not a spend limit, and reads like one.** A caller
with a hundred addresses has a hundred buckets, and until the global variable
existed the only ceiling was an implied backstop of 20× the per-IP cap — so
the `GEV_RATELIMIT_OPENAI_PER_MIN=20` on this deployment silently authorised
400 billable calls a minute. Behind a password that is theoretical. It stops
being theoretical the moment the password comes off, which is why the opening
checklist below sets the global one first. When the global cap trips everybody
gets a 429 and the page degrades — no HUD summary, no nearby places — instead
of the account draining. That is the intended failure.

Two more things follow for a hosted deployment.

**Behind a proxy, tell the app which header carries the real address.**
Through a Cloudflare tunnel (or any reverse proxy) every request reaches the
container from the proxy, so the socket peer is the same for all visitors and
"per IP" quietly becomes "one bucket for everyone". Set
`GEV_TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` (Cloudflare; `x-real-ip` for
nginx/Caddy) and the throttles key on that header instead. It is opt-in
because a caller who reaches the origin directly can forge it — set it only
when nothing but the proxy can reach the port. Verify with the open health
route, which echoes the address the throttles will use for *you*:

```sh
curl -s https://gev.example.com/healthz   # → {"ok":true,"gated":true,"client":"<your public IP>"}
```

If `client` is a Docker or loopback address, the header is not being trusted.

**Do not put a rate-limiting rule on all of `/api/*` at the edge.** Measured
on the Enerlens staging on 2026-09-09: a Cloudflare rule of 30 requests per
10 s per address on `/api`, blocking for 10 s. A GEV page makes about six
`/api` requests to boot and a handful a minute afterwards, so the page itself
never trips it — but a script, a test harness or a couple of tabs reloading
from the same address does, and for those ten seconds *every* `/api` call
answers 429: the mic reads "Could not reach voice configuration (HTTP 429)",
live layers stall, tiles proxied through `/api` go grey. The app obeys the
`Retry-After` it is sent (the mic waits it out and retries, twice, before
showing the diagnosis), but the rule is still the wrong shape. If you want an
edge rule at all, scope it to the routes that spend a key:

```
(http.request.uri.path in {"/api/voice/brain" "/api/realtime/token" "/api/openai/hud-summary" "/api/google/nearby-places" "/api/google/text-search"})
```

A human cannot produce 30 spoken commands in ten seconds, so the same
threshold is harmless there. With `GEV_ACCESS_PASSWORD` set and the trusted
header above, the in-app throttles already do this job per real address, and
the edge rule can simply be deleted.

`deploy/vps/edge-ratelimit-probe.sh` tells you which shape is live without
guessing. It bursts a **keyless** `/api` route no correct rule would ever
throttle, plus `/` as a control; it spends no key and reads no secret, since a
401 from the Basic gate proves the origin answered just as well as a 200 does.

```
$ ssh vps /opt/gev/edge-ratelimit-probe.sh          # 2026-09-09
  GET /                    40 requests, no 429
  GET /api/voice/config    FIRST 429 at request 31 (~2s)  retry-after=10  error code: 1015
VERDICT: the edge rule still covers ALL of /api — a keyless route was
         throttled at request 31.
```

Run it from the VPS, never from a laptop: the limit is per source address, and
the laptop shares its address with the owner's browser.

## Opening the origin to the public

`GEV_ACCESS_PASSWORD` is the only thing between the open internet and a set of
keys somebody pays for. Removing it is a one-line change with a bill attached,
so it is the LAST step, not the first. In order:

1. **Bound the spend, globally.** Set the three
   `GEV_RATELIMIT_*_GLOBAL_PER_MIN` in `/opt/gev/.env`. Per-address caps alone
   do not bound anything a distributed caller does.
2. **Bound it again at the provider**, because a process-local counter resets
   on restart and knows nothing about a second deployment: OpenAI platform →
   Settings → Limits (usage limits); Google Cloud Console → Billing → Budgets
   & alerts, plus per-API quotas under APIs & Services → Quotas; OpenRouter →
   Keys → edit → credit limit. This is the only hard stop in the list.
3. **Split the Google key in two, because one key cannot be both.** The build
   arg is inlined into a file anyone can read (`Dockerfile:24`, `define` in
   `vite.config.js`); the same variable is also the runtime key the proxies in
   `vite.config.js` spend on Places, Street View and the 2D tile session. An
   HTTP-referrer restriction is the standard guard for the first and is fatal
   to the second — a server sends no `Referer`, so restricting the one shared
   key answers 403 to every `/api/google/*` call. Create a second key,
   referrer-restricted to your hostnames and scoped to **Map Tiles +
   Geocoding**, and pass it as `GOOGLE_MAPS_BROWSER_KEY`; leave
   `GOOGLE_MAPS_API_KEY` as runtime env only and restrict it by **IP** to the
   origin's egress addresses (both v4 and v6 — this box reaches Overpass over
   v6 only) and to **Places + Street View + Map Tiles**. Verify by reading the
   built bundle, not the console:

   ```sh
   ssh vps 'docker exec gev sh -c "grep -rhoE \"AIza[A-Za-z0-9_-]{35}\" /app/dist | sort -u"'
   ```

   Exactly one key must come back, and it must be the browser one. Changing a
   build arg needs `docker compose up -d --build --force-recreate`: a plain
   `up -d` reuses the image and the old key stays in the bundle.
4. **Check "per IP" is per IP.** `curl -s https://<host>/healthz` must report
   `client` as your own public address, not a Docker or loopback one. On this
   deployment `GEV_TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` is set and
   verified.
5. **Know what a visitor costs.** A cold boot spends **nothing**: since the
   engagement gate in `src/hud.js`, every metered call waits for a real gesture
   — pointer, wheel or key — because the intro fly-to settles on its own and
   used to fire five billable calls at t≈6.3 s before a single click. So the
   unit of cost on a public page is the *engaged* visitor, not the arrival,
   and a page loaded in a loop bills nothing. Size the global caps above
   against engaged visitors per minute, not against traffic.
6. **Fix the edge rule** (above), or the first person who shares the link and
   the second person behind the same NAT will both see 429s.
7. **List every public hostname in `GEV_PUBLIC_HOST` — the password is hiding
   whether they work.** `vite preview` refuses a `Host` it was not told about,
   and the access gate's middleware is installed *first*, so a gated origin
   answers **401 before Vite ever checks the host**. A name missing from
   `GEV_PUBLIC_HOST` is therefore indistinguishable from a name that works,
   right up to the moment you open — and then it answers:

   ```
   HTTP 403  Blocked request. This host ("surplomb.app") is not allowed.
   ```

   Measured on 2026-09-16: `surplomb.app` had been live on the tunnel for a day
   and had never once been served. `/healthz` answered `200` the whole time,
   because it is a middleware and never reaches the host check — so the health
   route **cannot** tell you about this. Check it while still gated, with the
   password, against each name:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -u gev:"$PW" https://<each-host>/
   ```

   `401` is a bad answer here, not a good one — it means the gate replied and
   the host question is still open. Send the credentials and require `200`.
   `GEV_PUBLIC_HOST` is comma-separated, read at startup, and needs only
   `docker compose up -d` — no rebuild.
8. **Then, and only then**, remove `GEV_ACCESS_PASSWORD` from `/opt/gev/.env`
   and `docker compose up -d`. `/healthz` reports `"gated": false`, and the
   server logs `[access-gate] GEV_ACCESS_PASSWORD is unset — this origin is
   OPEN` **on the first request through the gate, not at boot** — the warning
   lives in the middleware behind a once-only flag. An empty log right after a
   restart means nobody has asked yet, not that the gate is still up; trust
   `/healthz` for that.

Reversing it is the same two commands with the variable put back, so the risk
is not the switch — it is how long an unbounded key stays reachable before
anyone notices. Steps 1 to 3 are what make that duration not matter.
