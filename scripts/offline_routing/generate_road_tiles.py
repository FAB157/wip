#!/usr/bin/env python3
"""
Pipeline offline routing:
planet.pbf -> osmium/DuckDB -> Douglas-Peucker -> griglia ~0,05° -> JSON gzip {car, foot} -> road_tiles/
"""

import os
import subprocess
import duckdb
import json
import gzip
import argparse
from pathlib import Path

# Configurazione
GRID_SIZE = 0.05
SIMPLIFICATION_TOLERANCE = 0.00005 # ~5 metri in gradi
OUT_DIR = Path('road_tiles')

# Classi highway
CAR_HIGHWAYS = [
    'motorway', 'trunk', 'primary', 'secondary', 
    'tertiary', 'unclassified', 'residential',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
]

# Rete pedonale: tutto tranne autostrade/superstrade — a piedi si cammina anche
# lungo le vie normali, quindi lo snap deve funzionare sui marciapiedi delle
# strade comuni, non solo nelle zone pedonali.
FOOT_HIGHWAYS = [
    'pedestrian', 'footway', 'path', 'steps', 'living_street', 'track', 'cycleway',
    'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'service',
    'road', 'tertiary_link', 'secondary_link', 'primary_link'
]

# --- Supabase Storage: upload delle tile ---
# Chiave letta da env o da .env.local alla radice del repo. MAI hardcoded qui
# (è un segreto: finirebbe committato). L'URL del progetto è pubblico.
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL') \
    or 'https://qfxxhzkkrkvbuekfknhh.supabase.co'
BUCKET = 'road_tiles'

def _load_service_key():
    k = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if k:
        return k
    try:
        root = Path(__file__).resolve().parents[2]  # radice repo
        for fname in ('.env.local', '.env'):
            envf = root / fname
            if envf.exists():
                for line in envf.read_text(encoding='utf-8').splitlines():
                    s = line.strip()
                    if s.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                        return s.split('=', 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return ''

SUPABASE_KEY = _load_service_key()
_bucket_checked = False

def _ensure_bucket():
    global _bucket_checked
    if _bucket_checked or not SUPABASE_KEY:
        return
    _bucket_checked = True
    try:
        body = json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode()
        req = urllib.request.Request(f"{SUPABASE_URL}/storage/v1/bucket", data=body, method='POST',
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                     "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=15).read()
        print(f"[storage] bucket '{BUCKET}' creato")
    except urllib.error.HTTPError as e:
        if e.code not in (400, 409):  # 400/409 = esiste gia'
            print(f"[storage] bucket HTTP {e.code}")
    except Exception as e:
        print(f"[storage] bucket err: {e}")

def upload_tile(filepath, name):
    if not SUPABASE_KEY:
        return  # nessuna chiave → resta solo in locale
    _ensure_bucket()
    try:
        data = Path(filepath).read_bytes()
        url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{name}"
        req = urllib.request.Request(url, data=data, method='POST', headers={
            "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/gzip", "x-upsert": "true"})
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        print(f"[storage] upload {name} fallito: {e}")

def run_osmium_extract(input_pbf, region_name, bbox):
    """Estrae una regione e filtra solo le highway (strade)."""
    region_pbf = f"{region_name}_extracted.osm.pbf"
    highways_pbf = f"{region_name}_highways.osm.pbf"
    
    print(f"[{region_name}] 1/2 Estrazione bbox ({bbox})...")
    subprocess.run(['osmium', 'extract', '-b', bbox, input_pbf, '-o', region_pbf, '--overwrite'], check=True)
    
    print(f"[{region_name}] 2/2 Filtraggio tag 'highway'...")
    subprocess.run(['osmium', 'tags-filter', region_pbf, 'w/highway', '-o', highways_pbf, '--overwrite'], check=True)
    
    # Pulizia file temporaneo
    if os.path.exists(region_pbf):
        os.remove(region_pbf)
        
    return highways_pbf

def write_tile(region, grid_id, mode, rows):
    """Scrive i dati della singola cella della griglia in GeoJSON compresso (GZIP)."""
    features = []
    for (fid, fclass, oneway, geojson_str) in rows:
        feat = {
            "type": "Feature",
            "properties": {
                "id": fid,
                "class": fclass,
                "oneway": oneway
            },
            "geometry": json.loads(geojson_str)
        }
        features.append(feat)
        
    fc = {
        "type": "FeatureCollection",
        "features": features
    }
    
    # Nome SENZA prefisso regione: griglia globale, nessun doppione Italia/Europa.
    # L'endpoint /api/roads/tile cerca esattamente "x{gx}_y{gy}_{mode}.json.gz".
    tile_name = f"{grid_id}_{mode}.json.gz"
    filename = OUT_DIR / tile_name
    with gzip.open(filename, 'wt', encoding='utf-8') as f:
        json.dump(fc, f, separators=(',', ':'))
    upload_tile(filename, tile_name)

def process_with_duckdb(highways_pbf, region_name, filter_bbox=None):
    """Elabora le strade in DuckDB: taglia, semplifica e raggruppa per griglia."""
    print(f"[{region_name}] Caricamento in DuckDB Spatial...")
    
    con = duckdb.connect(database=':memory:')
    con.execute("INSTALL spatial; LOAD spatial;")
    
    car_tags = ', '.join([f"'{t}'" for t in CAR_HIGHWAYS])
    foot_tags = ', '.join([f"'{t}'" for t in FOOT_HIGHWAYS])
    
    # Condizione opzionale per escludere aree (es. escludere l'Europa dal Resto del Mondo)
    bbox_filter_sql = ""
    if filter_bbox:
        minx, miny, maxx, maxy = filter_bbox
        bbox_filter_sql = f"AND NOT (ST_X(ST_Centroid(geom)) BETWEEN {minx} AND {maxx} AND ST_Y(ST_Centroid(geom)) BETWEEN {miny} AND {maxy})"

    print(f"[{region_name}] Estrazione geometrie (Douglas-Peucker) e classificazione...")
    query = f"""
    CREATE TEMP TABLE filtered_lines AS
    SELECT 
        osm_id AS id,
        highway AS class,
        oneway,
        ST_Simplify(geom, {SIMPLIFICATION_TOLERANCE}) as geom,
        FLOOR(ST_X(ST_Centroid(geom)) / {GRID_SIZE}) * {GRID_SIZE} AS grid_x,
        FLOOR(ST_Y(ST_Centroid(geom)) / {GRID_SIZE}) * {GRID_SIZE} AS grid_y
    FROM ST_Read('{highways_pbf}', layer='lines')
    WHERE highway IN ({car_tags}, {foot_tags})
      AND geom IS NOT NULL
      {bbox_filter_sql};
    """
    con.execute(query)
    
    print(f"[{region_name}] Generazione e compressione delle tile...")
    grids = con.execute("SELECT DISTINCT grid_x, grid_y FROM filtered_lines").fetchall()
    
    for (gx, gy) in grids:
        grid_id = f"x{gx:.2f}_y{gy:.2f}"
        
        # Tile Veicoli (CAR)
        car_data = con.execute(f"""
            SELECT id, class, oneway, ST_AsGeoJSON(geom) 
            FROM filtered_lines 
            WHERE grid_x = {gx} AND grid_y = {gy} AND highway IN ({car_tags})
        """).fetchall()
        if car_data:
            write_tile(region_name, grid_id, 'car', car_data)
            
        # Tile Pedonali (FOOT)
        foot_data = con.execute(f"""
            SELECT id, class, oneway, ST_AsGeoJSON(geom) 
            FROM filtered_lines 
            WHERE grid_x = {gx} AND grid_y = {gy} AND highway IN ({foot_tags})
        """).fetchall()
        if foot_data:
            write_tile(region_name, grid_id, 'foot', foot_data)

def main():
    parser = argparse.ArgumentParser(description="Pipeline Routing: planet.pbf -> griglia JSON gzip -> Supabase Storage")
    parser.add_argument('--planet', default=r"D:\0MAPPA POI WIP\planet-260518.osm.pbf",
                        help="Percorso del file planet.pbf")
    parser.add_argument('--region', default='italy', choices=['italy', 'europe', 'world', 'all'],
                        help="Area da estrarre (default: italy). 'world' = pesantissimo, ore.")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Planet: {args.planet}")
    print(f"Regione: {args.region}  |  Upload Storage: {'SI' if SUPABASE_KEY else 'NO (chiave assente → solo locale)'}")

    # Bounding Boxes [min_lon, min_lat, max_lon, max_lat]
    bbox_italy_str = "6.6,35.2,18.5,47.1"
    bbox_europe = [-10.0, 34.0, 40.0, 72.0]
    bbox_europe_str = f"{bbox_europe[0]},{bbox_europe[1]},{bbox_europe[2]},{bbox_europe[3]}"

    if args.region in ('italy', 'all'):
        print("\n--- ITALIA ---")
        hw = run_osmium_extract(args.planet, 'italy', bbox_italy_str)
        process_with_duckdb(hw, 'italy')

    if args.region in ('europe', 'all'):
        print("\n--- EUROPA ---")
        hw = run_osmium_extract(args.planet, 'europe', bbox_europe_str)
        process_with_duckdb(hw, 'europe')

    if args.region in ('world', 'all'):
        print("\n--- RESTO DEL MONDO (pesante, ore) ---")
        row_hw = "row_highways.osm.pbf"
        if not os.path.exists(row_hw):
            print("[world] Filtraggio globale delle highway dal planet...")
            subprocess.run(['osmium', 'tags-filter', args.planet, 'w/highway', '-o', row_hw, '--overwrite'], check=True)
        # Filtra via l'Europa (gia' fatta) per non duplicare
        process_with_duckdb(row_hw, 'row', filter_bbox=bbox_europe)

    print("\nCompletata! Tile locali in:", OUT_DIR.absolute(), "| Upload:", 'attivo' if SUPABASE_KEY else 'no')

if __name__ == '__main__':
    main()
