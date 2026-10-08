#!/bin/bash
# ROAD TILES «EXTRA» PER TUTTO IL MONDO: un continente Geofabrik alla volta → pezzi, poi le tile, poi il
# caricamento piano nel deposito road_tiles. Riprende da dove si era fermato: ogni continente finito lascia
# un segno in fatto/, il caricamento ha il suo file di stato.
# Uso: nohup ./strade-extra-mondo.sh /root/strade-extra/mondo > /root/strade-extra/mondo.log 2>&1 &
set -uo pipefail
LAVORO="${1:-/root/strade-extra/mondo}"
QUI="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$LAVORO/fatto"
for C in australia-oceania central-america south-america africa antarctica north-america asia europe; do
  if [ -f "$LAVORO/fatto/$C" ]; then echo "$C già fatto"; continue; fi
  if nice -n 15 ionice -c3 "$QUI/strade-extra-regione.sh" "https://download.geofabrik.de/$C-latest.osm.pbf" "$LAVORO"; then
    touch "$LAVORO/fatto/$C"
  else
    echo "!! $C fallito: si prosegue con gli altri, da rilanciare"
    rm -f "$LAVORO"/tmp/*
  fi
done
echo "[$(date -u +%H:%M)] tile"
nice -n 15 node "$QUI/strade-extra-celle.mjs" celle "$LAVORO/pezzi" "$LAVORO/tile"
echo "[$(date -u +%H:%M)] caricamento"
node "$QUI/strade-extra-carica.mjs" "$LAVORO/tile" --al-secondo=6
echo "[$(date -u +%H:%M)] fine"
