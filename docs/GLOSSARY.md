# Glossary — French ↔ English

Surplomb is a French product with a bilingual interface. This page fixes how
French public-data vocabulary reads in English, so that the docs, the globe's
English strings and every translation batch use the same words. It is the only
file in the repository where French and English sit side by side on purpose.

**Who uses it:** anyone writing English docs or English UI strings, and every
translation batch (human or agent). A batch that meets a term missing here adds
it to the section of its domain. Terms already listed only change between two
translation waves, never inside one, so that parallel batches stay consistent.

The machine-readable half of this page is [`src/i18n/glossary.js`](../src/i18n/glossary.js):
the proper nouns below, which the French detector must accept inside English
text. `src/i18n/glossary.test.mjs` fails when the two lists drift apart.

## Writing rules

- **US English.** *color, center, meter, neighborhood, license (noun and verb),
  catalog.* Code comments are not rewritten for this; UI strings and docs are.
- **Acronyms stay, glossed once.** Keep the French acronym (DVF, DPE, PLU…) and
  gloss it at its first use on a page, card or legend:
  *property sales (DVF)*. After that, the acronym alone is fine.
- **Proper nouns stay French**, accents included: *Géorisques, Île-de-France,
  Météo-France, Saint-Étienne.* Never anglicize a place or an organization.
- **Data values are not prose.** A commune name, a DVF `type_local`, a crime
  category from the CSV stay as published in the data; only their display label
  is translated (see `labelFor()` in the i18n conventions).
- **Numbers and units:** decimal point, comma for thousands, no space before
  `%`, a space before other units.

  | French | English |
  |---|---|
  | `5,6 s` | `5.6 s` |
  | `12 400 ventes` | `12,400 sales` |
  | `91,3 %` | `91.3%` |
  | `3 200 €/m²` | `€3,200/m²` |
  | `245 000 €` | `€245,000` |
  | `120 km`, `15 m` | `120 km`, `15 m` (metric everywhere, never miles or feet) |
  | `19 sept. 2026` | `Sep 19, 2026` |
  | `14 h 05`, `14:05` | `14:05` (24-hour clock: timetables and data timestamps are French) |
  | `2ᵉ`, `11ᵉ arrondissement` | `2nd`, `11th arrondissement` |

- **Punctuation:** no space before `: ; ? !`; French guillemets « » become
  curly quotes “ ”; apostrophes are typographic (’) in UI strings.
- **Capitalization:** sentence case for layer names and buttons (*Property
  prices*); layer-group headers stay in capitals, as in French (*ENERGY*).
- **Tone:** plain and factual, as in French. No spy or military fiction
  (*intel, target, surveillance*) for public data: a camera is a *public
  camera*, a building is a *building*.

## Product and brand

| French | English | Note |
|---|---|---|
| Surplomb | Surplomb | The product name. Never translated. |
| Belvédère | Belvédère | Name of the visual identity (logo, colors). Internal. |
| La France au rayon X | France, X-rayed | Tagline. |
| Aucun angle mort. | No blind spots. | Slogan. |
| la vitrine, la page d’accueil (`/`) | the landing page | |
| le globe, le cockpit (`/globe`) | the globe | “Cockpit” is a code word; say *globe* to readers. |
| couche | layer | |
| fiche (d’un objet cliqué) | card | The panel that opens on click. |
| Radiographie d’adresse | Address X-ray | `fiche.html`. |
| Fiche implantation | Site report | Where a business could open. |
| Estimation d’un bien | Property valuation | |
| Comparables (sélection conseiller) | Comparables (agent’s selection) | |
| Zone de chalandise | Catchment area | |
| la chronique | the chronicle | Server-side archive of live feeds. |
| essai, liste d’attente | trial, waitlist | |
| Pass propriétaire | owner pass | |

## Administrative and statistical geography

| French | English | Note |
|---|---|---|
| commune | municipality | *commune* allowed in parentheses on first use in docs. |
| arrondissement (Paris, Lyon, Marseille) | arrondissement | *Paris 11th arrondissement*. |
| arrondissement (départemental) | arrondissement (sub-prefecture district) | |
| département | department | *Gironde department*, *department 33*. |
| région | region | |
| EPCI, intercommunalité | intercommunality (EPCI) | |
| métropole, France métropolitaine | mainland France | *Métropole de Lyon* is a proper noun. |
| outre-mer, DROM | overseas France, overseas departments (DROM) | |
| IRIS | IRIS (INSEE neighborhood unit) | |
| carreau, carroyage INSEE | grid cell, INSEE 200 m grid | *Territoire (carroyage INSEE)* → *Territory (INSEE 200 m grid)*. |
| quartier | neighborhood | |
| lieu-dit | locality | |
| préfecture, sous-préfecture | prefecture, sub-prefecture | |
| mairie | town hall | |
| code INSEE, code commune | INSEE code | |
| code postal | postal code | |
| adresse, Base adresse nationale | address, national address database (BAN) | |
| cadastre, parcelle cadastrale | cadastre, cadastral parcel | *Parcelles cadastrales* → *Cadastral parcels*. |
| revenu médian | median income | |
| niveau de vie | standard of living (per consumption unit) | |
| taux de pauvreté | poverty rate | |
| ménage | household | |
| logement (statistique) | dwelling | *housing* in running prose. |
| résidence principale / secondaire | primary residence / second home | |
| logement vacant | vacant dwelling | |
| pour 1 000 habitants | per 1,000 residents | |

## Real estate and housing

| French | English | Note |
|---|---|---|
| DVF (demandes de valeurs foncières) | property sales (DVF) | |
| Prix de l’immobilier | Property prices | |
| vente, mutation | sale | *mutation* is the legal term; readers see *sale*. |
| prix au m² | price per m² | |
| Appartement / Maison / Dépendance | Apartment / House / Outbuilding | DVF `type_local` values. |
| Local industriel, commercial ou assimilé | Commercial or industrial premises | DVF `type_local` value. |
| surface habitable, surface réelle bâtie | living area, built floor area | |
| surface du terrain | land area | |
| nombre de pièces | number of rooms | |
| DPE (diagnostic de performance énergétique) | energy rating (DPE) | *Performance énergétique (DPE)* → *Energy rating (DPE)*. |
| étiquette énergie A à G | energy label A to G | |
| étiquette climat, GES | greenhouse-gas label | |
| passoire thermique | energy-inefficient home (F or G) | |
| loyer, encadrement des loyers | rent, rent control | |
| copropriété | condominium building | |
| logement social, HLM, bailleur social | social housing (HLM), social landlord | |
| ERP (état des risques et pollutions) | risk disclosure statement (ERP) | **Not** the building category below. |
| notaire | notary | |
| estimation | valuation | |

## Urban planning and buildings

| French | English | Note |
|---|---|---|
| Urbanisme | Planning | Layer name. |
| PLU, PLUi | local zoning plan (PLU, PLUi) | |
| zonage, zone U / AU / A / N | zoning, urban / future urban / agricultural / natural zone | |
| Géoportail de l’urbanisme (GPU) | Géoportail de l’urbanisme (GPU) | Proper noun. |
| servitude d’utilité publique (SUP) | public utility easement (SUP) | |
| périmètre des abords (monument historique) | historic monument protection zone | |
| Autorisations d’urbanisme | Planning permits | Layer name. |
| permis de construire / d’aménager / de démolir | building / development / demolition permit | |
| déclaration préalable | prior declaration (minor works) | |
| Sitadel | building permits (Sitadel) | |
| Bâti 3D | 3D buildings | |
| bâti, emprise au sol, hauteur | buildings, footprint, height | |
| RNB (Référentiel national des bâtiments) | national building register (RNB) | |
| établissement recevant du public (ERP) | public-access building (ERP) | **Not** the risk statement above. |
| îlot de fraîcheur / îlot de chaleur | cool island / heat island | *Îlots de fraîcheur* → *Cool islands*. |
| BÂTI & TERRITOIRE | BUILDINGS & LAND | Layer group. |

## Energy

| French | English | Note |
|---|---|---|
| ÉNERGIE | ENERGY | Layer group. |
| Réseau électrique | Power grid | |
| ligne haute tension (HTB), moyenne tension (HTA) | high-voltage line, medium-voltage line | |
| poste électrique, poste source | substation, primary substation | |
| capacité d’accueil | hosting capacity | |
| S3REnR | regional renewable connection scheme (S3REnR) | |
| raccordement | grid connection | |
| Centrales électriques | Power plants | |
| Groupes de production | Generating units | |
| Centrales hydro | Hydro plants | |
| Mix électrique | Electricity mix | |
| nucléaire, éolien, solaire photovoltaïque, hydraulique | nuclear, wind, solar PV, hydro | |
| méthanisation, méthaniseur | anaerobic digestion, biogas plant | |
| Bornes de recharge, point de charge | EV charging, charge point | *Bornes de recharge* → *EV charging stations*. |
| Réseau gaz | Gas network | |

## Transport and mobility

| French | English | Note |
|---|---|---|
| MOBILITÉ TERRESTRE | GROUND MOBILITY | Layer group. |
| Transports en commun | Public transit | |
| réseau, ligne, arrêt, gare | network, line, stop, station | *line* for a GTFS route shown to readers. |
| horaire théorique, temps réel | scheduled time, real time | |
| retard, en avance | delay, early | |
| fréquence, intervalle | frequency, headway | |
| Réseau et fréquence IDFM (Paris) | IDFM network and frequency (Paris) | |
| Trafic routier | Road traffic | |
| bouchon, ralentissement | traffic jam, slowdown | |
| Comptages routiers | Traffic counts | |
| Événements routiers | Road events | |
| chantier, fermeture, déviation | roadworks, closure, detour | |
| État du réseau routier | Road network status | |
| Véhicules partagés, vélos en libre-service | Shared vehicles, bike share | |
| trottinette | e-scooter | |
| Pouls vélo (semaine type) | Cycling pulse (typical week) | |
| compteur vélo | bike counter | |
| Vols en direct, Vols militaires | Live flights, Military flights | |
| Aéroports | Airports | |
| Navires et ports, Ports | Ships and ports, Ports | |
| itinéraire | route | |

## Risks and environment

| French | English | Note |
|---|---|---|
| RISQUES & ENVIRONNEMENT | RISKS & ENVIRONMENT | Layer group. |
| Risques (Géorisques) | Risks (Géorisques) | |
| inondation, zone inondable | flooding, flood zone | |
| TRI (territoire à risque important d’inondation) | high flood-risk area (TRI) | |
| PPR, PPRI | risk prevention plan (PPR), flood risk prevention plan (PPRI) | |
| retrait-gonflement des argiles | clay shrink-swell | |
| zone de sismicité | seismic zone | |
| cavités souterraines, mouvements de terrain | underground cavities, ground movements | |
| ICPE | classified industrial facility (ICPE) | |
| site Seveso | Seveso site | |
| sites et sols pollués (SIS), CASIAS | contaminated sites (SIS), former industrial sites (CASIAS) | |
| Feux actifs (FIRMS) | Active fires (FIRMS) | |
| Mégafeu de Gironde (juil. 2026) | Gironde megafire (Jul. 2026) | |
| Séismes (24 h) | Earthquakes (24 h) | |
| Barrages & digues | Dams & levees | |
| bruit, carte de bruit | noise, noise map | |
| qualité de l’air | air quality | |
| Météo, Stations météo | Weather, Weather stations | |
| vigilance (Météo-France) | weather warning | |
| canicule | heatwave | |
| houle | swell | |
| Bouées marines | Marine buoys | |
| CIEL & MER | SKY & SEA | Layer group. |
| Missions spatiales, Satellites | Space missions, Satellites | |
| Contexte global | Global context | |

## Health, emergency services and education

| French | English | Note |
|---|---|---|
| Santé & secours | Health & emergency services | |
| FINESS | health facility register (FINESS) | |
| médecin généraliste | general practitioner (GP) | |
| pharmacie, officine | pharmacy | |
| urgences | emergency department | |
| centre de santé, maison de santé | health center, multidisciplinary health center | |
| APL (accessibilité potentielle localisée) | local GP accessibility (APL) | |
| désert médical | medical desert | |
| caserne de pompiers, SDIS | fire station, departmental fire service (SDIS) | |
| commissariat, gendarmerie | police station, gendarmerie | |
| défibrillateur | defibrillator (AED) | |
| Enseignement | Schools | Layer name. |
| école maternelle / élémentaire | preschool / elementary school | |
| collège, lycée | middle school, high school | |
| Enseignement supérieur | Higher education | |
| IPS (indice de position sociale) | social position index (IPS) | |
| éducation prioritaire (REP, REP+) | priority education network (REP, REP+) | |
| académie | education authority (académie) | |
| Accueil du jeune enfant, crèche | Early childcare, daycare | |

## Public safety, business and telecoms

| French | English | Note |
|---|---|---|
| Délinquance enregistrée | Recorded crime | |
| cambriolage | burglary | |
| vol avec violence | violent theft | |
| coups et blessures volontaires | assault | |
| Sites militaires | Military sites | |
| Caméras publiques | Public cameras | |
| SIRENE, SIREN, SIRET | SIRENE register, SIREN company number, SIRET establishment number | |
| entreprise, établissement | company, establishment | |
| BODACC | official commercial announcements (BODACC) | |
| DECP, marché public | public contract data (DECP), public contract | |
| acheteur, titulaire | buyer, contractor | |
| Équipements (BPE) | Amenities (BPE) | |
| Antennes mobiles | Mobile antennas | |
| Infrastructure numérique | Digital infrastructure | |
| Câbles sous-marins | Submarine cables | |
| fibre (FTTH) | fiber (FTTH) | |
| RÉSEAUX & CAPTEURS | NETWORKS & SENSORS | Layer group. |

## Interface words

| French | English | Note |
|---|---|---|
| Couches | Layers | Tab and panel. |
| légende | legend | |
| source, crédit, licence | source, credit, license | |
| Licence Ouverte | Licence Ouverte (Etalab Open License 2.0) | Name kept, glossed. |
| fond de carte | basemap | |
| Plan IGN | IGN map (Plan IGN) | |
| photoréaliste | photorealistic 3D | |
| JEUX BRANCHÉS | PLUGGED DATASETS | Layer group. |
| ＋ BRANCHER UN JEU DE DONNÉES | ＋ PLUG IN A DATASET | |
| ACTIF, CHARGEMENT, ÉTEINT | ON, LOADING, OFF | Layer status. |
| Zoomez pour voir | Zoom in to see | |
| Aucun résultat | No results | |
| Rechercher une adresse | Search an address | |
| Partager, Fermer, Ouvrir le globe | Share, Close, Open the globe | |
| non publié, non publiée | not published | |
| mesuré, estimé | measured, estimated | |

## Never translate

Proper nouns: organizations, datasets, services and brands. They stay exactly as
written, accents included, inside English text. Place names (communes,
departments, regions, rivers) follow the same rule without being listed here;
the detector recognizes them from the data. Items are separated by `·`, one
category per line. This list is mirrored in `src/i18n/glossary.js`.

- Product: Surplomb · Belvédère · God’s Eye View
- Public bodies: INSEE · IGN · Etalab · ADEME · BRGM · Cerema · Météo-France · SHOM · ANFR · ARCEP · DGAC · SSMSI · Géorisques · Géoportail · Géoportail de l’urbanisme
- Networks and operators: RTE · Enedis · GRDF · GRTgaz · Teréga · ODRÉ · éCO2mix · SNCF · TER · TGV · RER · Transilien · Île-de-France Mobilités · IDFM · Vélib’ · Bison Futé
- Datasets and registers: data.gouv.fr · BD TOPO · BD ORTHO · LiDAR HD · Filosofi · Sitadel · FINESS · SIRENE · BODACC · DECP · CASIAS · CANDHIS · Licence Ouverte
- Places used as names: Île-de-France · Métropole de Lyon · Gironde
