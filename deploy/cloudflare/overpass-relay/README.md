# Relais Overpass (Cloudflare Worker)

Une seconde adresse de sortie pour `/api/overpass`, à utiliser tant que l'IP du
VPS est en haut de l'étranglement de `overpass-api.de`.

Mesuré le 2026-09-16 depuis le conteneur `gev` :

| hôte | verdict |
|---|---|
| `overpass-api.de` | connexion **refusée** en 193 ms (v4 et v6) |
| `lz4.overpass-api.de` | connexion **refusée** en 72 ms |
| `overpass.private.coffee` | 200 en **38,6 s**, données du 2026-07-15 |
| `maps.mail.ru` | 504 en 641 ms |

Ça ressemble à un bannissement, et ça n'en est pas un. Re-mesuré à 20:05, 8
requêtes d'affilée depuis le même conteneur :

```
504/9458ms  504/7985ms  200/263ms  200/346ms  429/10947ms  429/10205ms  ERR/64ms  ERR/62ms
```

Lent, puis correct, puis limité, puis **refusé** — en quarante secondes.
L'étranglement est un escalier qu'on monte en poussant, et il redescend tout
seul. **Ne jamais diagnostiquer ça en le martelant** : trois adresses de sortie
ont été poussées jusqu'au refus en un après-midi, par les sondes qui mesuraient
le problème.

Mesuré le 2026-09-16 à 20:23 : le relais a servi la boîte de Marseille en
**200 / 3,8 s** (`X-Overpass-Upstream` le nomme) pendant que le direct refusait
encore. Les adresses de sortie de Cloudflare sont **partagées** : elles se font
étrangler comme les autres, d'où le plafond de 60 req/min côté Worker.

## Ce que le relais ne fait pas

- **Il ne nous cache pas.** La requête sortante porte le `User-Agent` réel de
  l'application avec son URL de contact, plus un en-tête `X-Surplomb-Relay` qui
  nomme le saut. FOSSGIS peut refuser le relais en une règle.
- **Il ne tourne pas entre miroirs.** Un seul amont, pour que la rotation du
  serveur (`src/data/overpassMirrors.js`) reste le seul endroit qui décide.
- **Il ne met rien en cache.** Le serveur tient déjà 24 h en mémoire et 7 à
  30 jours sur disque.

## Déployer (≈5 min, une seule commande est interactive)

```bash
cd deploy/cloudflare/overpass-relay

# 1. Ouvrir le navigateur pour autoriser le compte Cloudflare (une seule fois).
npx wrangler login

# 2. Publier D'ABORD. La commande imprime l'URL `https://…workers.dev`.
#    `wrangler secret put` échoue sur un Worker qui n'existe pas encore
#    (`script_not_found`), donc cet ordre n'est pas négociable.
npx wrangler deploy

# 3. Poser le secret partagé. Le générer d'abord, et le GARDER :
#      openssl rand -hex 32 | tee >(tr -d '\n' | pbcopy)
#    Poser un secret redéploie le Worker tout seul — rien à relancer.
npx wrangler secret put RELAY_TOKEN
```

**Entre l'étape 2 et l'étape 3 le relais répond 503** à tout le monde, y
compris à nous : `relayVerdict` distingue « ce relais est mal configuré » (503)
de « ton jeton est faux » (401), et sans secret côté Worker c'est le premier.
Ce n'est pas une fenêtre dangereuse — c'est la seule réponse honnête.

Puis sur le VPS, avec l'URL imprimée et le même secret :

```bash
ssh vps
printf 'GEV_OVERPASS_RELAY_URL=%s\n' 'https://surplomb-overpass-relay.<sous-domaine>.workers.dev' >> /opt/gev/.env
printf 'GEV_OVERPASS_RELAY_TOKEN=%s\n' '<le secret>' >> /opt/gev/.env
docker compose -f /opt/gev/docker-compose.yml up -d
```

Ces deux variables sont lues **à l'exécution**, pas au build : pas besoin de
reconstruire l'image, un redémarrage du conteneur suffit. (Contrairement à
`GOOGLE_MAPS_API_KEY` et `CESIUM_ION_TOKEN`, qui sont des `ARG` de build.)

## Vérifier

```bash
# Depuis le VPS — doit rendre 200 et un compte de ways non nul.
ssh vps 'docker exec gev node -e "
const u=process.env.GEV_OVERPASS_RELAY_URL+\"/api/interpreter\";
fetch(u,{method:\"POST\",headers:{\"x-surplomb-relay-token\":process.env.GEV_OVERPASS_RELAY_TOKEN,\"Content-Type\":\"application/x-www-form-urlencoded\"},body:\"data=\"+encodeURIComponent(\"[out:json][timeout:25];way(43.28,5.35,43.32,5.40)[highway~^(motorway|trunk|primary)\$];out count;\")})
  .then(async r=>console.log(r.status, (await r.text()).slice(0,200)));
"'
```

Un `401` = le secret du VPS et celui du Worker diffèrent.
Un `503` = `wrangler secret put RELAY_TOKEN` n'a pas été fait.
Un `404` = l'URL pointe ailleurs que `/api/interpreter`.

## Éteindre le relais

Quand FOSSGIS débloque les deux IP :

```bash
ssh vps "sed -i '/^GEV_OVERPASS_RELAY_/d' /opt/gev/.env && docker compose -f /opt/gev/docker-compose.yml up -d"
npx wrangler delete   # dans ce répertoire
```

Sans URL **ou** sans jeton, la rotation reprend exactement sa liste d'origine —
`withOverpassRelay` exige les deux.
