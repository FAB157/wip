#!/bin/bash
# ROAD TILES «EXTRA»: una regione Geofabrik → pezzi da 1°×1° (vedi strade-extra-celle.mjs).
# Uso: strade-extra-regione.sh <url del .osm.pbf> <cartella di lavoro>
#   es. strade-extra-regione.sh https://download.geofabrik.de/europe/italy-latest.osm.pbf /root/strade-extra/pilota
# Il .pbf e i file intermedi si cancellano appena non servono più: sul disco restano solo i pezzi.
set -euo pipefail
URL="$1"; LAVORO="$2"
QUI="$(cd "$(dirname "$0")" && pwd)"
NOME="$(basename "$URL" .osm.pbf)"
mkdir -p "$LAVORO/pezzi" "$LAVORO/tmp"
cd "$LAVORO/tmp"
echo "[$(date -u +%H:%M)] scarico $NOME"
curl -fsSL --retry 5 --retry-delay 30 -C - -o "$NOME.osm.pbf" "$URL"
echo "[$(date -u +%H:%M)] filtro le classi mancanti"
osmium tags-filter "$NOME.osm.pbf" w/highway=service,cycleway,road,corridor,platform,bridleway -o "$NOME-extra.osm.pbf" --overwrite
rm -f "$NOME.osm.pbf"
echo "[$(date -u +%H:%M)] esporto le vie"
osmium export "$NOME-extra.osm.pbf" -f geojsonseq --geometry-types=linestring -u type_id -o "$NOME-extra.geojsonseq" --overwrite
rm -f "$NOME-extra.osm.pbf"
echo "[$(date -u +%H:%M)] spezzo in pezzi da 1 grado"
node "$QUI/strade-extra-celle.mjs" spezza "$NOME-extra.geojsonseq" "$LAVORO/pezzi"
rm -f "$NOME-extra.geojsonseq"
echo "[$(date -u +%H:%M)] $NOME fatto"
