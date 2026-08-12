#!/usr/bin/env python3
"""
Pipeline offline routing (DuckDB-Only) - BUGFIX version.
"""

import os
import duckdb
import json
import gzip
import argparse
from pathlib import Path

GRID_SIZE = 0.05
SIMPLIFICATION_TOLERANCE = 0.00005
OUT_DIR = Path('road_tiles')

CAR_HIGHWAYS = [
    'motorway', 'trunk', 'primary', 'secondary', 
    'tertiary', 'unclassified', 'residential',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
]

FOOT_HIGHWAYS = [
    'pedestrian', 'footway', 'path', 'steps', 'living_street', 'track'
]

def write_tile(region, grid_id, mode, rows):
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

def process_region(con, region_name, bbox_filter, car_tags, foot_tags):
    print(f"\n--- Elaborazione: {region_name.upper()} ---")
    
    con.execute("DROP TABLE IF EXISTS region_lines;")
    
    query = f"""
    CREATE TEMP TABLE region_lines AS
    SELECT 
        id,
        class,
        oneway,
        ST_Simplify(geom, {SIMPLIFICATION_TOLERANCE}) as geom,
        FLOOR(ST_X(ST_Centroid(geom)) / {GRID_SIZE}) * {GRID_SIZE} AS grid_x,
        FLOOR(ST_Y(ST_Centroid(geom)) / {GRID_SIZE}) * {GRID_SIZE} AS grid_y
    FROM global_highways
    WHERE {bbox_filter}
    """
    con.execute(query)
    
    grids = con.execute("SELECT DISTINCT grid_x, grid_y FROM region_lines").fetchall()
    print(f"[{region_name}] Trovate {len(grids)} celle della griglia. Generazione tile...")
    
    for (gx, gy) in grids:
        grid_id = f"x{gx:.2f}_y{gy:.2f}"
        
        car_data = con.execute(f"""
            SELECT id, class, oneway, ST_AsGeoJSON(geom) 
            FROM region_lines 
            WHERE grid_x = {gx} AND grid_y = {gy} AND class IN ({car_tags})
        """).fetchall()
        if car_data:
            write_tile(region_name, grid_id, 'car', car_data)
            
        foot_data = con.execute(f"""
            SELECT id, class, oneway, ST_AsGeoJSON(geom) 
            FROM region_lines 
            WHERE grid_x = {gx} AND grid_y = {gy} AND class IN ({foot_tags})
        """).fetchall()
        if foot_data:
            write_tile(region_name, grid_id, 'foot', foot_data)
            
    print(f"[{region_name}] Completato!")

def main():
    parser = argparse.ArgumentParser(description="Pipeline Routing DuckDB-Only")
    parser.add_argument('--planet', required=True, help="Percorso del file planet.pbf")
    args = parser.parse_args()
    
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    db_path = "routing_processor.duckdb"
    con = duckdb.connect(database=db_path)
    con.execute("INSTALL spatial; LOAD spatial;")
    
    car_tags_list = ', '.join([f"'{t}'" for t in CAR_HIGHWAYS])
    foot_tags_list = ', '.join([f"'{t}'" for t in FOOT_HIGHWAYS])
    all_tags = car_tags_list + ", " + foot_tags_list
    
    print(f"\n[Fase 1/2] Lettura del file PBF... (Mettiti comodo, ci vorrà molto!)")
    
    # Controlliamo se la tabella esiste ed è vuota
    table_exists = con.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='global_highways'").fetchone()[0] > 0
    if table_exists:
        row_count = con.execute("SELECT count(*) FROM global_highways").fetchone()[0]
        if row_count == 0:
            print("Trovata tabella 'global_highways' VUOTA. La elimino e ricomincio...")
            con.execute("DROP TABLE global_highways")
            table_exists = False
            
    if not table_exists:
        # Usiamo other_tags per estrarre la highway visto che osmconf.ini è inaffidabile su Windows
        # duckdb regex_extract su '"highway"=>"residential"'
        query_import = f"""
        CREATE TABLE global_highways AS 
        SELECT 
            -- Generiamo un ID fittizio progressivo visto che GDAL non espone osm_id di default
            uuid() AS id, 
            regexp_extract(other_tags, '"highway"=>"([^"]+)"', 1) AS class, 
            regexp_extract(other_tags, '"oneway"=>"([^"]+)"', 1) AS oneway, 
            geom 
        FROM ST_Read('{args.planet}', layer='lines') 
        WHERE regexp_extract(other_tags, '"highway"=>"([^"]+)"', 1) IN ({all_tags}) 
          AND geom IS NOT NULL;
        """
        con.execute(query_import)
        print("Importazione globale completata!")
    else:
        row_count = con.execute("SELECT count(*) FROM global_highways").fetchone()[0]
        print(f"Tabella 'global_highways' trovata con {row_count} strade. Salto l'importazione.")

    print("\n[Fase 2/2] Avvio elaborazione spaziale per regioni...")
    
    bbox_italy = "ST_X(ST_Centroid(geom)) BETWEEN 6.6 AND 18.5 AND ST_Y(ST_Centroid(geom)) BETWEEN 35.2 AND 47.1"
    process_region(con, 'italy', bbox_italy, car_tags_list, foot_tags_list)
    
    bbox_europe = "ST_X(ST_Centroid(geom)) BETWEEN -10.0 AND 40.0 AND ST_Y(ST_Centroid(geom)) BETWEEN 34.0 AND 72.0"
    process_region(con, 'europe', bbox_europe, car_tags_list, foot_tags_list)
    
    bbox_row = f"NOT ({bbox_europe})"
    process_region(con, 'row', bbox_row, car_tags_list, foot_tags_list)
    
    print(f"\n🎉 Pipeline Completata! Totale righe elaborate: {con.execute('SELECT count(*) FROM global_highways').fetchone()[0]}")
    con.close()

if __name__ == '__main__':
    main()
