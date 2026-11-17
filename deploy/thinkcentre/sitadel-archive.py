#!/usr/bin/env python3
"""Surplomb — keep every monthly edition of the Sitadel permit lists.

WHY. The SDES republishes its four national lists of urbanism authorisations
(DiDo) every month and keeps no earlier edition: asking DiDo for millésime
2024-01 or 2026-08 answers 404 (2026-11-17). A row the SDES corrects,
reclassifies or withdraws is gone from the public record the day the next
edition lands. Keeping each edition whole is the only way to know what the
register said, and when.

WHAT. Once a day, the four datafiles' metadata are read (four small
requests). When a file's (millésime, date de diffusion) is one this archive
does not hold, the CSV is streamed from DiDo straight into zstd -19, never
written raw: one edition is 1.40 GB of CSV and 111 MB compressed (measured on
millésime 2026-10, 3 063 819 rows). Each file lands as

    <dest>/<millésime>_<diffusion day>/<name>.csv.zst
    <dest>/<millésime>_<diffusion day>/<name>.json   (manifest)

written atomically, the manifest last: a file without its manifest is not
archived and is fetched again. A republication of the same millésime with a
new diffusion date is a new directory, so a silent correction is kept too.

CHECKS. The raw byte count, line count and SHA-256 are taken on the stream.
A file whose CSV holds fewer data lines than DiDo's own `rows`, or whose
first line is not a header of at least 30 columns, is discarded and
reported. Quoted cells can hold
line breaks, so the line count may exceed `rows` (17 more on 1 941 999 rows
of the housing list); it can never fall short.

RETENTION. Editions older than SITADEL_KEEP_YEARS (10, the SDES's own
retention for Sitadel) are deleted. The lists keep the works' address and
parcels — personal data when the applicant is a person — so the archive has
a purpose (the history of the register), a term, and stays off any public
host.

REPORTING. One line per event in the house inbox (`~/boite/messages.jsonl`,
source `sitadel-archive`): a new edition kept, a failure, or — on Mondays —
no new edition for more than 40 days.

Licence Ouverte 2.0: the source and each edition's date are kept with it
(README.md and every manifest), as CRPA art. L.322-1 requires of a reuse.

Standard library only; `zstd` must be on the PATH.
"""

import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

API = 'https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles'
FILES = (
    ('logements', '8b35affb-55fc-4c1f-915b-7750f974446a'),
    ('locaux', 'f8f0700f-806c-40a7-83b1-f21cf507e7c4'),
    ('amenager', '96883f50-538b-41f9-a059-c6eb97e6a23a'),
    ('demolir', '1a9a2f0c-56fe-4e69-84a7-fbbda2121f02'),
)
USER_AGENT = 'surplomb-sitadel-archive (+https://surplomb.app)'
DEST = os.environ.get('SITADEL_ARCHIVE_DIR', os.path.expanduser('~/sitadel-archive/data'))
INBOX = os.environ.get('SITADEL_INBOX', os.path.expanduser('~/boite/messages.jsonl'))
KEEP_YEARS = int(os.environ.get('SITADEL_KEEP_YEARS', '10'))
STALE_DAYS = 40
ZSTD = ['zstd', '-19', '--long=27', '-T2', '-q']
CHUNK = 1 << 20
SOURCE = ('Sitadel — Service des données et études statistiques (SDES), ministère '
          'chargé du logement. Licence Ouverte 2.0.')


def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def say(text):
    """One line in the house inbox; stdout too, for the journal."""
    print(text, flush=True)
    try:
        os.makedirs(os.path.dirname(INBOX), exist_ok=True)
        with open(INBOX, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'at': now().isoformat(), 'source': 'sitadel-archive', 'texte': text},
                               ensure_ascii=False) + '\n')
    except OSError as error:
        print(f'inbox unwritable: {error}', file=sys.stderr)


def get(url, timeout=60):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    return urllib.request.urlopen(request, timeout=timeout)


def metadata(rid):
    """DiDo's description of the current edition of one datafile."""
    for attempt in range(3):
        try:
            with get(f'{API}/{rid}') as response:
                meta = json.load(response)
            return {
                'millesime': str(meta['millesime']),
                'date_diffusion': str(meta['date_diffusion']),
                'rows': int(meta['rows']),
                'title': meta.get('title'),
            }
        except Exception as error:  # noqa: BLE001 — any failure is retried, then reported
            last = error
            time.sleep(30 * (attempt + 1))
    raise RuntimeError(f'metadata {rid}: {last}')


def edition_dir(meta):
    return os.path.join(DEST, f"{meta['millesime']}_{meta['date_diffusion'][:10]}")


def fetch(name, rid, meta):
    """Stream one CSV into zstd; return its manifest, or raise."""
    folder = edition_dir(meta)
    os.makedirs(folder, exist_ok=True)
    final = os.path.join(folder, f'{name}.csv.zst')
    temp = f'{final}.part'
    url = (f"{API}/{rid}/csv?millesime={meta['millesime']}"
           '&withColumnName=true&withColumnDescription=false&withColumnUnit=false')
    digest = hashlib.sha256()
    raw = lines = 0
    head = b''
    started = time.time()
    with open(temp, 'wb') as out:
        zstd = subprocess.Popen(ZSTD + ['-c'], stdin=subprocess.PIPE, stdout=out)
        try:
            with get(url, timeout=600) as response:
                while True:
                    chunk = response.read(CHUNK)
                    if not chunk:
                        break
                    if len(head) < 4096:
                        head += chunk[:4096]
                    digest.update(chunk)
                    raw += len(chunk)
                    lines += chunk.count(b'\n')
                    zstd.stdin.write(chunk)
        finally:
            zstd.stdin.close()
            code = zstd.wait()
    if code != 0:
        os.remove(temp)
        raise RuntimeError(f'{name}: zstd exited {code}')
    header = head.split(b'\n', 1)[0].decode('utf-8', 'replace')
    data_lines = lines - 1
    # Every list opens on a quoted header of 40 to 142 columns.
    if not header.startswith('"') or header.count(';') < 30 or data_lines < meta['rows']:
        os.remove(temp)
        raise RuntimeError(f"{name}: {data_lines} data lines for {meta['rows']} rows announced, "
                           f'header {header[:40]!r}')
    os.replace(temp, final)
    manifest = {
        'file': name,
        'rid': rid,
        'title': meta['title'],
        'millesime': meta['millesime'],
        'date_diffusion': meta['date_diffusion'],
        'rows': meta['rows'],
        'lines': lines,
        'bytes_raw': raw,
        'sha256_raw': digest.hexdigest(),
        'bytes_zst': os.path.getsize(final),
        'downloaded_at': now().isoformat(),
        'seconds': round(time.time() - started),
        'source': SOURCE,
        'url': url,
    }
    with open(os.path.join(folder, f'{name}.json.part'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    os.replace(os.path.join(folder, f'{name}.json.part'), os.path.join(folder, f'{name}.json'))
    return manifest


def editions():
    """Archived edition directories, oldest first."""
    if not os.path.isdir(DEST):
        return []
    return sorted(d for d in os.listdir(DEST) if os.path.isdir(os.path.join(DEST, d)) and '_' in d)


def prune():
    """Delete editions older than KEEP_YEARS, by millésime."""
    limit = dt.date.today().replace(day=1)
    limit = limit.replace(year=limit.year - KEEP_YEARS).strftime('%Y-%m')
    removed = []
    for folder in editions():
        if folder.split('_', 1)[0] < limit:
            shutil.rmtree(os.path.join(DEST, folder))
            removed.append(folder)
    return removed


def write_readme():
    path = os.path.join(DEST, 'README.md')
    if os.path.exists(path):
        return
    os.makedirs(DEST, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(
            '# Sitadel — monthly editions\n\n'
            f'Source: {SOURCE}\n\n'
            'Each directory is one edition as DiDo served it (`<millésime>_<diffusion day>`), '
            'one zstd CSV and one manifest per list. The SDES keeps no earlier edition; this '
            'archive does, for the history of the register.\n\n'
            f'Kept {KEEP_YEARS} years, then deleted. The lists hold the works\' address and '
            'parcels, personal data when the applicant is a person: not to be published as is.\n\n'
            'Read one: `zstd -dc <dir>/logements.csv.zst | head`.\n')


def main():
    write_readme()
    kept, failed = [], []
    for name, rid in FILES:
        try:
            meta = metadata(rid)
        except RuntimeError as error:
            failed.append(str(error))
            continue
        if os.path.exists(os.path.join(edition_dir(meta), f'{name}.json')):
            continue
        try:
            kept.append(fetch(name, rid, meta))
        except Exception as error:  # noqa: BLE001 — reported, retried tomorrow
            failed.append(f'{name}: {error}')
    removed = prune()
    if kept:
        total = sum(m['bytes_zst'] for m in kept)
        rows = sum(m['rows'] for m in kept)
        editions_kept = sorted({f"{m['millesime']} (diffusée le {m['date_diffusion'][:10]})" for m in kept})
        rows_text = f'{rows:_}'.replace('_', ' ')
        say(f"Sitadel : édition {', '.join(editions_kept)} archivée — {len(kept)} fichier(s), "
            f'{rows_text} lignes, {total / 1e6:.0f} Mo. Rien à faire.')
    if failed:
        say('⚠️ Sitadel : archivage en échec, nouvel essai demain. ' + ' | '.join(failed)[:600])
    if removed:
        say(f"Sitadel : {len(removed)} édition(s) de plus de {KEEP_YEARS} ans supprimée(s) : "
            f"{', '.join(removed)}.")
    folders = editions()
    if folders and dt.date.today().weekday() == 0:
        newest = max(folders, key=lambda d: d.split('_', 1)[1])
        age = (dt.date.today() - dt.date.fromisoformat(newest.split('_', 1)[1])).days
        if age > STALE_DAYS:
            say(f'⚠️ Sitadel : aucune nouvelle édition depuis {age} jours (dernière : {newest}). '
                'Vérifier que DiDo publie toujours.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
