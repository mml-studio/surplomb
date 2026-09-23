# README media provenance

## Surplomb captures

The maintainer of this repository filmed the following captures from Surplomb,
for this repository and its project documentation. Every view film except
Lyon's is cut into chapters that play in order; the seconds are those of the
film each chapter comes from. The Roissy and power-grid chapters hold one idea
each under a title burned in for the README, punch in on the app's card or
label at about its real size where it carries that idea, and leave out what
carries none (the grid's pull-back and switch-off); some of their camera travel plays faster and some cards are held
on one frame, as the table says.

| File | Shows | Film seconds | Data drawn |
|---|---|---|---|
| `surplomb-hero.gif` | Paris in photorealistic 3D, live traffic street by street (the head of both READMEs) | — | Road traffic layer |
| `surplomb-roissy-1-airport-live-flights.gif` | Terminal 1 at Paris-Charles de Gaulle, then the run to the threshold of runway 09R under the icons of live flights; title *Paris-CDG in 3D, live flights above it* | 1.8–8.6 (Terminal 1 0.8 s, run ×3 then ×2, threshold held 1 s) | Live flights (OpenSky Network, adsb.lol) |
| `surplomb-roissy-2-live-departure.gif` | Flight LHX27W's take-off in the cockpit view, then a click on it opens its tag, Paris-Charles de Gaulle to Munich; title *A live departure from Paris-CDG* | 8.7–18.5 (roll ×2, pull-back ×3, tag held 2 s) | Live flights (OpenSky Network, adsb.lol); the take-off roll and the speed and altitude on the heads-up display are staged |
| `surplomb-roissy-3-noise-zones.gif` | The climb to the airport's noise exposure plan; title *The noise zones around Paris-CDG* | 19.3–24.5 (climb ×3, last frame held 1.5 s) | DGAC noise exposure plans via the IGN Géoplateforme |
| `surplomb-roissy-4-zone-a-card.gif` | Zone A's card at full size; title *Zone A: 70 dB and above, no new homes* | 24.9–27.4 (card held 1.6 s) | DGAC noise exposure plans via the IGN Géoplateforme |
| `surplomb-lyon-dvf-dpe.gif` | Lyon: property sales (DVF), then the energy ratings (DPE) of the same district | 1.6–8.6 | DVF (DGFiP, via Etalab); DPE (ADEME) |
| `surplomb-grid-1-nuclear-columns.gif` | France's high-voltage grid and nuclear columns light up; title *France's grid and its nuclear plants* | 0.0–3.5 (first frame held 0.5 s) | High-voltage lines (© OpenStreetMap contributors); generating-unit output (RTE); columns drawn wider and three times taller than the app draws them at that scale |
| `surplomb-grid-2-rhone-valley.gif` | The dive into the Rhône valley, then two plant labels at full size; title *Each plant: output now / capacity* | 3.5–7.8 (dive ×1.5, labels held 1.8 s) | The same, plus plant positions (EDF Open Data) |
| `surplomb-grid-3-cruas-card.gif` | The Cruas plant's card, followed at 0.89× its size; title *Cruas: 71% of its maximum this hour* | 7.4–10.1 (card held 1.3 s) | Generating-unit output (RTE); plant position (EDF Open Data) |
| `surplomb-infra-1-antennas.gif` | France's mobile antenna sites light up | 0.0–4.4 | Mobile antenna sites (ANFR) |
| `surplomb-infra-2-no-4g.gif` | The Alps where no operator's 4G reaches | 4.4–9.2 | Simulated 4G coverage (ARCEP, Mon réseau mobile) |
| `surplomb-infra-3-data-centers.gif` | Île-de-France's data centers and their power | 9.2–14.4 | Data centers (© OpenStreetMap contributors, DCWatch); mobile antenna sites (ANFR) |
| `surplomb-infra-4-la-defense.gif` | A mast selected at La Défense and its line of sight | 14.4–19.9 | The mast and its registered height (ANFR); the wave is drawn for the film over the 3D tiles |
| `surplomb-infra-5-line-of-sight.gif` | The pull-up over the ground the mast can see | 19.9–23.65 | The same as chapter 4 |

All of them show Google Photorealistic 3D Tiles, served through Cesium ion.
Camera paths, captions and reveal effects were staged for filming; the table
names the other staged parts. The infrastructure film's last 1.2 s, a
switch-off and zoom-out that joins its end to its start on the landing page,
is not included, nor are the power-grid film's last 3.2 s (the pull-back to
Europe and the switch-off, a film effect) or the Roissy film's first 1.8 s
(the camera drifting slowly over Terminal 1).

The Lyon and infrastructure files are 560 px wide, the Roissy and power-grid
files 640 px (the hero is 480 px). Each chapter plays at the highest of 12,
10 or 8 frames per second that keeps it under 5 MB, and its last 0.3 s
cross-fade into its first frame, so the loop does not jump. Lyon's single GIF
plays at 8 fps without a cross-fade and sits at 6.7 MB. The Roissy and grid
titles are drawn at the GIF's own 640 px and laid over the frame after it is
scaled, so they stay sharp; the crops are area-averaged from the 1920 px film.
Encoded with ffmpeg: `palettegen=stats_mode=diff`, then
`paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, 128 colors.

These files are **not covered by the project's MIT License**. They are project
documentation: Google Photorealistic 3D Tiles remain under the Google Maps
Platform and Cesium ion terms, and every dataset drawn in them under its
provider's terms ([DATA_SOURCES.md](../../DATA_SOURCES.md)). Keep the
attribution printed under each capture in the README, and the in-frame credit
line, with any reuse.

A fifth view is reserved in both READMEs (`<!-- view 5: pending -->`) and
will be recorded here when it is added.

## Upstream capture GIFs — removed

Bilawal Sidhu created and owns 17 capture GIFs that `bilawalsidhu/gods-eye-view`
publishes in its README, and authorized their inclusion and redistribution with
this repository and its project documentation. They showed the original
project's features — the cockpit, public cameras, the ISS, sensor styles, voice
annotation, radio, launch replay, submarine cables. This fork removed all 17 when
its README switched to captures of what the fork adds, made for this repository.
They remain in the upstream repository:

- `hero-open-source-reveal.gif`
- `06-cockpit-ar.gif`
- `start-here/airport-ground-traffic-google-3d.gif`
- `03-austin-cctv.gif`
- `14-iss-over-ukraine.gif`
- `01-style-sweep.gif`
- `12-switch-aircraft-cockpit.gif`
- `start-here/military-cockpit-dense-google-3d.gif`
- `01-voice-annotate-zilker.gif`
- `04-airport-distance.gif`
- `15-global-radio-layer.gif`
- `08-falcon9-replay.gif`
- `09-undersea-cables.gif`
- `07-helicopter-loops.gif`
- `10-walking-route-flythrough.gif`
- `08-boneyard.gif`
- `05-traffic-to-cctv.gif`

They are recorded here so the removal is traceable, not because the files are
still present. Their earlier terms (copyright © Bilawal Sidhu; permission
limited to inclusion with this repository; no standalone reuse or modification)
still apply to copies in this repository's history.

## Public README PNGs — removed

`youtube-popular-videos.png` and `open-source-survey.png` were published by
Bilawal Sidhu in `bilawalsidhu/gods-eye-view` and carried here under his
authorization. This fork removed both when it replaced the upstream header and
the upstream author's first-person closing section with its own. They are
recorded here so the removal is traceable, not because the files are still
present.
