# Overpass relay (Cloudflare Worker)

A second egress address for `/api/overpass`, to use while the VPS's IP sits at
the top of `overpass-api.de`'s throttling.

Measured on 2026-09-16 from the `gev` container:

| host | verdict |
|---|---|
| `overpass-api.de` | connection **refused** in 193 ms (v4 and v6) |
| `lz4.overpass-api.de` | connection **refused** in 72 ms |
| `overpass.private.coffee` | 200 in **38.6 s**, data from 2026-07-15 |
| `maps.mail.ru` | 504 in 641 ms |

It looks like a ban, and it is not one. Re-measured at 20:05, 8 requests in a
row from the same container:

```
504/9458ms  504/7985ms  200/263ms  200/346ms  429/10947ms  429/10205ms  ERR/64ms  ERR/62ms
```

Slow, then fine, then rate-limited, then **refused** — within forty seconds.
The throttling is a staircase you climb by pushing, and it comes back down on
its own. **Never diagnose this by hammering it**: three egress addresses were
pushed all the way to refusal in one afternoon, by the very probes that were
measuring the problem.

Measured on 2026-09-16 at 20:23: the relay served the Marseille box in
**200 / 3.8 s** (`X-Overpass-Upstream` names it) while the direct route was
still refusing. Cloudflare's egress addresses are **shared**: they get
throttled like any others, hence the 60 req/min ceiling on the Worker side.

## What the relay does not do

- **It does not hide us.** The outgoing request carries the application's real
  `User-Agent` with its contact URL, plus an `X-Surplomb-Relay` header that
  names the hop. FOSSGIS can refuse the relay with a single rule.
- **It does not rotate between mirrors.** One upstream only, so that the
  server's rotation (`src/data/overpassMirrors.js`) stays the only place that
  decides.
- **It caches nothing.** The server already keeps 24 h in memory and 7 to
  30 days on disk.

## Deploy (≈5 min, only one command is interactive)

```bash
cd deploy/cloudflare/overpass-relay

# 1. Open the browser to authorize the Cloudflare account (once only).
npx wrangler login

# 2. Publish FIRST. The command prints the `https://…workers.dev` URL.
#    `wrangler secret put` fails on a Worker that does not exist yet
#    (`script_not_found`), so this order is not negotiable.
npx wrangler deploy

# 3. Set the shared secret. Generate it first, and KEEP it:
#      openssl rand -hex 32 | tee >(tr -d '\n' | pbcopy)
#    Setting a secret redeploys the Worker by itself — nothing to restart.
npx wrangler secret put RELAY_TOKEN
```

**Between step 2 and step 3 the relay answers 503** to everyone, us included:
`relayVerdict` tells “this relay is misconfigured” (503) apart from “your token
is wrong” (401), and with no secret on the Worker side it is the former. This
is not a dangerous window — it is the only honest answer.

Then on the VPS, with the printed URL and the same secret:

```bash
ssh vps
printf 'GEV_OVERPASS_RELAY_URL=%s\n' 'https://surplomb-overpass-relay.<subdomain>.workers.dev' >> /opt/gev/.env
printf 'GEV_OVERPASS_RELAY_TOKEN=%s\n' '<the secret>' >> /opt/gev/.env
docker compose -f /opt/gev/docker-compose.yml up -d
```

These two variables are read **at runtime**, not at build time: no need to
rebuild the image, restarting the container is enough. (Unlike
`GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN`, which are build-time `ARG`s.)

## Check

```bash
# From the VPS — must return 200 and a non-zero count of ways.
ssh vps 'docker exec gev node -e "
const u=process.env.GEV_OVERPASS_RELAY_URL+\"/api/interpreter\";
fetch(u,{method:\"POST\",headers:{\"x-surplomb-relay-token\":process.env.GEV_OVERPASS_RELAY_TOKEN,\"Content-Type\":\"application/x-www-form-urlencoded\"},body:\"data=\"+encodeURIComponent(\"[out:json][timeout:25];way(43.28,5.35,43.32,5.40)[highway~^(motorway|trunk|primary)\$];out count;\")})
  .then(async r=>console.log(r.status, (await r.text()).slice(0,200)));
"'
```

A `401` = the VPS's secret and the Worker's differ.
A `503` = `wrangler secret put RELAY_TOKEN` was never run.
A `404` = the URL points somewhere other than `/api/interpreter`.

## Turn the relay off

When FOSSGIS unblocks both IPs:

```bash
ssh vps "sed -i '/^GEV_OVERPASS_RELAY_/d' /opt/gev/.env && docker compose -f /opt/gev/docker-compose.yml up -d"
npx wrangler delete   # in this directory
```

Without a URL **or** without a token, the rotation goes back to exactly its
original list — `withOverpassRelay` requires both.
