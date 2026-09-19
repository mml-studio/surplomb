# `datasets/` — the shipped manifests

One JSON file per dataset, named after its `id`. At build time each manifest
becomes a panel layer (`ds-<id>`): group, source line, credit, card and legend
are derived from the file. The full contract is in
[`docs/DATASETS.md`](../docs/DATASETS.md).

To produce one from an address:

```
npm run dataset:manifest -- <data.gouv.fr page | resource | Opendatasoft portal | WFS | .geojson | .csv>
```

`src/data/datasetsCatalog.test.mjs` rejects any manifest that does not
validate, that names an unknown group, or whose file name does not match its
`id`.

A manifest's license is **read** on the platform and **confirmed** on the
dataset's page before it ships — never on the strength of an API or MCP
answer.
