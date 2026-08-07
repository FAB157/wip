const { Client } = require('pg');

const sql = `
-- Drop and Recreate get_nearby_pois with optimized ST_DWithin (geometry index)
CREATE OR REPLACE FUNCTION public.get_nearby_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id TEXT, osm_id TEXT, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category TEXT, city TEXT, region TEXT, country TEXT, description TEXT,
    alert_radius INT, geofence_radius INT, premium BOOLEAN, source TEXT, status TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT p.id, 
           (CASE WHEN p.id LIKE 'osm-%' THEN substring(p.id from 5) ELSE NULL END) AS osm_id, 
           p.name, p.lat, p.lon, p.category, p.city, p.region,
           p.country, p.description_ai AS description, p.alert_radius, p.geofence_radius, p.is_gem AS premium,
           p.source, p.status,
           ST_Distance(
               p.location::geography,
               ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
           ) AS distance_meters
    FROM public.shared_pois p
    WHERE p.status IN ('verified','auto', 'approved')
      AND p.location IS NOT NULL
      AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326),
            radius_meters / 111000.0
          )
    ORDER BY distance_meters ASC;
$$;

-- Drop and Recreate get_geofence_pois with optimized ST_DWithin
CREATE OR REPLACE FUNCTION public.get_geofence_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    p_user_id      UUID DEFAULT NULL,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id TEXT, osm_id TEXT, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category TEXT, city TEXT, premium BOOLEAN, source TEXT, status TEXT,
    eff_alert_radius INT, eff_geofence_radius INT,
    alert_enabled BOOLEAN, audio_enabled BOOLEAN,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT p.id, 
           (CASE WHEN p.id LIKE 'osm-%' THEN substring(p.id from 5) ELSE NULL END) AS osm_id, 
           p.name, p.lat, p.lon, p.category, p.city, p.is_gem AS premium,
           p.source, p.status,
           p.alert_radius AS eff_alert_radius,
           p.geofence_radius AS eff_geofence_radius,
           true AS alert_enabled,
           true AS audio_enabled,
           ST_Distance(
               p.location::geography,
               ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
           ) AS distance_meters
    FROM public.shared_pois p
    WHERE p.status IN ('verified','auto', 'approved')
      AND p.location IS NOT NULL
      AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326),
            radius_meters / 111000.0
          )
    ORDER BY distance_meters ASC;
$$;
`;

async function main() {
  const c = new Client({
    user: 'postgres.qfxxhzkkrkvbuekfknhh',
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    database: 'postgres',
    password: 'Maf,Chj/S.2Jx8x',
    port: 6543
  });
  
  try {
    await c.connect();
    await c.query(sql);
    console.log("SQL executed successfully!");
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    c.end();
  }
}

main();
