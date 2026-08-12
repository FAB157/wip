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

FOOT_HIGHWAYS = [
    'pedestrian', 'footway', 'path', 'steps', 'living_street', 'track'
]

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
    
    filename = OUT_DIR / f"{region}_{grid_id}_{mode}.json.gz"
    with gzip.open(filename, 'wt', encoding='utf-8') as f:
        json.dump(fc, f, separators=(',', ':'))

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
    parser = argparse.ArgumentParser(description="Pipeline Routing: planet.pbf -> griglia JSON gzip")
    parser.add_argument('--planet', required=True, help="Percorso del file planet.pbf")
    args = parser.parse_args()
    
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Bounding Boxes [min_lon, min_lat, max_lon, max_lat]
    bbox_italy_str = "6.6,35.2,18.5,47.1"
    bbox_europe = [-10.0, 34.0, 40.0, 72.0]
    bbox_europe_str = f"{bbox_europe[0]},{bbox_europe[1]},{bbox_europe[2]},{bbox_europe[3]}"

    # --- 1. ITALIA ---
    print("\n--- STEP 1: ITALIA ---")
    hw_italy = run_osmium_extract(args.planet, 'italy', bbox_italy_str)
    process_with_duckdb(hw_italy, 'italy')

    # --- 2. EUROPA ---
    print("\n--- STEP 2: EUROPA ---")
    hw_europe = run_osmium_extract(args.planet, 'europe', bbox_europe_str)
    process_with_duckdb(hw_europe, 'europe')

    # --- 3. RESTO DEL MONDO (RoW) ---
    print("\n--- STEP 3: RESTO DEL MONDO ---")
    row_hw = "row_highways.osm.pbf"
    if not os.path.exists(row_hw):
        print("[row] Filtraggio globale delle highway dal planet (richiederà tempo)...")
        subprocess.run(['osmium', 'tags-filter', args.planet, 'w/highway', '-o', row_hw, '--overwrite'], check=True)
    
    # Processiamo filtrando via l'Europa dal resto del mondo per evitare duplicati
    process_with_duckdb(row_hw, 'row', filter_bbox=bbox_europe)
    
    print("\nPipeline Completata! Trovi tutte le tile in:", OUT_DIR.absolute())

if __name__ == '__main__':
    main()
