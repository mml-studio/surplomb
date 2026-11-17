#!/usr/bin/env bash
#
# Surplomb — nightly copy and health check of the permit archive.
#
# WHY. The archive (`archive/` in the gev_gev-cache volume: Cart@DS, Sirap,
# e-permis, the cities' lists, Montpellier) is the one thing the service cannot
# rebuild — a notice taken off a board never comes back. Until 2026-11-15 it
# lived in that volume alone, with no copy anywhere, and nothing checked that
# the sweeps still read: that day 736 Cart@DS municipalities had been unread
# for three weeks while every sweep.json said the night's sweep had run.
#
# WHAT, once a night after the sweeps:
#   1. /opt/gev/backups/archive-YYYYMMDD.tar.gz (UTC day), the 7 newest kept.
#      The off-site pull (`offsite-export`, set `gev-archive`) takes it from
#      there, encrypted on the other side.
#   2. /var/lib/gev-archive/health.json — `npm run permits:archive-health`
#      run inside the container (rules in scripts/lib/permitArchiveHealth.mjs).
#   3. /var/lib/gev-archive/backup.json — what step 1 produced.
#
# SAFEGUARD. A copy holding under 90 % of the previous copy's files (archive
# emptied, volume recreated) is kept but marked `suspect`, deletes nothing, and
# fails the unit. Step 2 runs whatever step 1 did.
#
# `gev-archive-nightly.sh health` runs step 2 alone: `gev-archive-health.timer`
# does so at 09:30 Paris, after the morning retry of the boards dark at night
# and after the city lists' sweep (4 h on 2026-11-17, past this copy at 02:00
# UTC). The house's alarm reads that verdict, not the night's.
set -uo pipefail
shopt -s nullglob

DEST=${GEV_ARCHIVE_BACKUPS:-/opt/gev/backups}
STATE=${GEV_ARCHIVE_STATE:-/var/lib/gev-archive}
KEEP=7
FLOOR_PCT=90

mkdir -p "$DEST" "$STATE"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# Copies, newest first. find and not `ls -t "$DEST"/archive-*`: under nullglob
# an empty directory would make `ls` list the working directory instead.
copies() { find "$DEST" -maxdepth 1 -type f -name 'archive-*.tar.gz' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-; }

backup() {
  local src day file prev g rc count prevCount=0 suspect=false bytes deleted=0
  src=$(docker volume inspect gev_gev-cache --format '{{.Mountpoint}}') || return 1
  [ -d "$src/archive" ] || { echo "no archive under $src" >&2; return 1; }
  day=$(date -u +%Y%m%d)
  file="$DEST/archive-$day.tar.gz"
  prev=$(copies | grep -vxF "$file" | head -1)
  # Sweeps write by atomic rename, so tar reads the old or the new file, never
  # half of one; rc=1 ("file changed as we read it") is therefore acceptable.
  tar -C "$src" --exclude='*.tmp' --warning=no-file-changed -czf "$file.part" archive
  rc=$?
  [ "$rc" -le 1 ] || { rm -f "$file.part"; echo "tar rc=$rc" >&2; return 1; }
  gzip -t "$file.part" || { rm -f "$file.part"; return 1; }
  count=$(tar -tzf "$file.part" | grep -c '\.json$')
  [ "$count" -gt 0 ] || { rm -f "$file.part"; echo "empty copy" >&2; return 1; }
  mv "$file.part" "$file"
  bytes=$(stat -c %s "$file")
  if [ -n "$prev" ]; then
    prevCount=$(tar -tzf "$prev" | grep -c '\.json$')
    [ "$prevCount" -gt 0 ] && [ $((count * 100)) -lt $((prevCount * FLOOR_PCT)) ] && suspect=true
  fi
  if [ "$suspect" = false ]; then
    while IFS= read -r g; do
      [ -n "$g" ] && rm -f -- "$g" && deleted=$((deleted + 1))
    done < <(copies | tail -n +$((KEEP + 1)))
  fi
  printf '{"at":"%s","file":"%s","bytes":%s,"jsonFiles":%s,"previousJsonFiles":%s,"suspect":%s,"deleted":%s}\n' \
    "$(now)" "${file##*/}" "$bytes" "$count" "$prevCount" "$suspect" "$deleted" >"$STATE/backup.json.tmp"
  mv "$STATE/backup.json.tmp" "$STATE/backup.json"
  cat "$STATE/backup.json"
  [ "$suspect" = false ] || { echo "SUSPECT copy: $count files against $prevCount" >&2; return 1; }
}

health() {
  if docker exec gev node scripts/permit-archive-health.mjs --json >"$STATE/health.json.tmp" 2>"$STATE/health.err"; then
    mv "$STATE/health.json.tmp" "$STATE/health.json"
    head -c 300 "$STATE/health.json"; echo
  else
    printf '{"at":"%s","error":"%s"}\n' "$(now)" \
      "$(head -c 300 "$STATE/health.err" | tr -d '"\\' | tr '\n' ' ')" >"$STATE/health.json"
    rm -f "$STATE/health.json.tmp"
    cat "$STATE/health.json" >&2
    return 1
  fi
}

if [ "${1:-}" = health ]; then health; exit $?; fi

failed=0
backup || { failed=1; printf '{"at":"%s","error":"backup failed, see journalctl -u gev-archive-nightly"}\n' "$(now)" >"$STATE/backup.json"; }
health || failed=1
exit "$failed"
