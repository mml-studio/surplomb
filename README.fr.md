<div align="center">

[English](README.md) · **Français**

<img src="public/icon.svg" width="88" height="88" alt="" />

# Surplomb

### La France au rayon X. Tout ce que vous n'auriez jamais pensé à chercher.

*Aucun angle mort.*

![Paris en 3D photoréaliste, le trafic en direct rue par rue : ce que montre surplomb.app](docs/media/surplomb-hero.gif)

<sub>Imagerie : Google, via Cesium ion.</sub>

</div>

## Ce que c'est

**59 couches de données publiques sur un globe 3D photoréaliste — dont 44 écrites ici.** Le prix auquel l'appartement d'en face s'est vendu et la parcelle exacte qui allait avec. Les permis de construire accordés dans la rue et ceux dont le chantier est déjà ouvert. Le DPE du bâtiment, l'école de secteur, le médecin le plus proche, la délinquance enregistrée, le bruit des avions au-dessus, les îlots de fraîcheur, ce que produit chaque centrale à cette minute, et où sont les bus.

**56 des 59 ne demandent rien** : pas de clé, pas de compte, pas d'inscription. Ouvrez la page, la France est là.

Presque tout vient de registres que l'État publie déjà et que personne n'avait mis sur la même carte : cadastre, DVF, Sitadel, DPE, PLU, Géorisques, BPE, FINESS, Annuaire santé, ANFR, IRVE, GTFS-RT, Vigicrues, Hub'Eau, Météo-France, ODRÉ, RTE, IGN BD TOPO. Et chaque couche dit ce qu'elle refuse de dessiner : Sitadel affiche son taux de jointure sur chaque fiche (91,3 % à Paris, 7,6 % à Toulouse), et un chiffre qu'on ne peut pas placer honnêtement est compté et dit, jamais posé quelque part de faux.

L'open data français est classé premier par l'[OCDE (2025)](https://www.data.gouv.fr/posts/la-france-a-la-premiere-place-du-classement-de-locde-en-matiere-dopen-data) et par le [rapport Open Data Maturity de l'UE](https://www.data.gouv.fr/posts/la-france-classee-premiere-europeenne-en-matiere-dopen-data-pour-la-5e-annee-consecutive) cinq années de suite : c'est ce qui permet à ce fork de porter 44 couches que l'amont n'a pas.

La version hébergée est [surplomb.app](https://surplomb.app).

## Le lancer

Node.js 24.14.x ou 26.x.

```bash
npm install
npm run dev -- --host localhost --port 4173
```

Ouvrez **`http://localhost:4173/globe`** (`/` est la page d'accueil). Aucune clé, aucun `.env`, aucune inscription : le globe démarre sur OSM et les fonds IGN, avec toutes les couches 🟢.

Les clés optionnelles (Google Maps ou Cesium ion pour la 3D photoréaliste, OpenAI ou OpenRouter pour la voix, AISStream, NASA FIRMS, TomTom, RTE) se collent dans l'application : la pastille **POWER UP** ouvre le panneau des fournisseurs. Le détail et les coûts sont dans [Keys & Costs](README.md#-api-keys).

## Pour tout le reste

Le [README en anglais](README.md) est la référence : le tableau des 59 couches avec leurs sources et leurs limites, l'agent vocal, le cockpit, les clés et ce qu'elles coûtent, les licences des données. Les contributions se font en anglais ([CONTRIBUTING.md](CONTRIBUTING.md)).

## Le socle

Le globe, le cockpit et l'agent vocal viennent de **[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)**, créé et ouvert par [Bilawal Sidhu](https://github.com/bilawalsidhu). Les 44 couches ajoutées ici, les registres qu'elles croisent et la discipline de refus décrite plus haut sont l'apport de ce dépôt, qui renvoie ses correctifs en amont.

Code sous **[licence MIT](LICENSE)** ; chaque jeu de données garde ses propres conditions ([DATA_SOURCES.md](DATA_SOURCES.md)).

---

<div align="center">

**🌐 Surplomb. Aucun angle mort.**

</div>
