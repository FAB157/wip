const { Client } = require('pg');
const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
};
async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();

  console.log("Updating get_geofence_pois to return raw alert_radius / geofence_radius...");

  await client.query(`
    CREATE OR REPLACE FUNCTION get_geofence_pois(
        user_lat double precision,
        user_lon double precision,
        p_user_id uuid DEFAULT NULL,
        radius_meters double precision DEFAULT 600
    )
    RETURNS TABLE (
        id text,
        osm_id text,
        name text,
        lat double precision,
        lon double precision,
        category text,
        city text,
        premium boolean,
        source text,
        status text,
        eff_alert_radius integer,
        eff_geofence_radius integer,
        alert_enabled boolean,
        audio_enabled boolean,
        distance_meters double precision
    )
    LANGUAGE sql
    STABLE
    AS $$
        SELECT 
            sp.id::text,
            NULL::text AS osm_id,
            sp.name,
            sp.lat,
            sp.lon,
            sp.category,
            NULL::text AS city,
            COALESCE(sp.is_gem, false) AS premium,
            'shared'::text AS source,
            sp.status,
            sp.alert_radius AS eff_alert_radius,
            sp.geofence_radius AS eff_geofence_radius,
            true AS alert_enabled,
            true AS audio_enabled,
            ST_Distance(
                ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
            ) AS distance_meters
        FROM public.shared_pois sp
        WHERE sp.status IN ('verified', 'auto', 'approved', 'draft')
          AND sp.lat IS NOT NULL
          AND sp.lon IS NOT NULL
          AND sp.name IS NOT NULL
          AND LENGTH(TRIM(sp.name)) > 1
          AND sp.category IS NOT NULL
          AND sp.category NOT IN (
            'restaurant', 'bar', 'fast_food', 'cafe', 'pub', 'ice_cream',
            'bakery', 'supermarket', 'convenience', 'pharmacy', 'bank', 'atm',
            'fuel', 'parking', 'taxi', 'station', 'subway_entrance', 'hospital',
            'hotel', 'hostel', 'motel', 'bus_stop', 'locali'
          )
          AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(sp.lon, sp.lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
                radius_meters
              )
        ORDER BY distance_meters ASC
        LIMIT 100;
    $$;
  `);
  
  console.log("✅ get_geofence_pois updated to return raw radii!");
  await client.end();
}
main().catch(console.error);
