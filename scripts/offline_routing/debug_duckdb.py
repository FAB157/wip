import duckdb

def main():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    print("Cerco 3 righe che contengono 'highway'...")
    
    query = """
    SELECT other_tags 
    FROM ST_Read('planet-260518.osm.pbf', layer='lines') 
    WHERE other_tags LIKE '%highway%'
    LIMIT 3;
    """
    
    try:
        rows = con.execute(query).fetchall()
        for i, row in enumerate(rows):
            print(f"RIGA {i+1}:")
            print(row[0])
            print("-" * 50)
    except Exception as e:
        print("Errore:", e)

if __name__ == "__main__":
    main()
