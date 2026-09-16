# Relais Overpass (Cloudflare Worker)

Une sortie réseau de secours pour `/api/overpass`, à utiliser **uniquement**
tant que l'IP du VPS est bannie par `overpass-api.de`.

Mesuré le 2026-09-16 depuis le conteneur `gev` :

| hôte | verdict |
|---|---|
| `overpass-api.de` | connexion **refusée** en 193 ms (v4 et v6) |
| `lz4.overpass-api.de` | connexion **refusée** en 72 ms |
| `overpass.private.coffee` | 200 en **38,6 s**, données du 2026-07-15 |
| `maps.mail.ru` | 504 en 641 ms |

Un refus TCP sous 200 ms sur toutes les adresses d'un hôte est un
bannissement, pas une panne : la même requête depuis un Mac sur un autre réseau
a répondu 200 en 0,20 s à la même seconde. IP bannies : `72.61.194.137` et
`2a02:4780:28:f502::1`.

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

# 2. Poser le secret partagé. Le générer d'abord, et le GARDER :
#      openssl rand -hex 32
npx wrangler secret put RELAY_TOKEN

# 3. Publier. La commande imprime l'URL `https://…workers.dev`.
npx wrangler deploy
```

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
