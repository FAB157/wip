const { Client } = require('pg');

const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

async function run() {
  try {
    await client.connect();
    console.log('✅ Connected to database.');

    // 1. Add columns (fast operation, doesn't lock the table for long)
    console.log('⏳ Adding alert_radius and geofence_radius to shared_pois...');
    await client.query(`
      ALTER TABLE public.shared_pois 
      ADD COLUMN IF NOT EXISTS alert_radius INT,
      ADD COLUMN IF NOT EXISTS geofence_radius INT;
    `);
    console.log('✅ Columns added.');

    // 2. Create the trigger function
    console.log('⏳ Creating assign_geofence_radii function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.assign_geofence_radii()
      RETURNS TRIGGER AS $$
      BEGIN
          -- Only apply logic if the radii are not explicitly provided
          IF NEW.alert_radius IS NULL OR NEW.geofence_radius IS NULL THEN
              IF NEW.is_gem = true THEN
                  NEW.alert_radius := 250;
                  NEW.geofence_radius := 120;
              ELSIF NEW.category IN ('museum', 'castle', 'archaeological_site') THEN
                  NEW.alert_radius := 200;
                  NEW.geofence_radius := 100;
              ELSIF NEW.category IN ('monument', 'church', 'ruins') THEN
                  NEW.alert_radius := 150;
                  NEW.geofence_radius := 80;
              ELSIF NEW.category IN ('artwork', 'viewpoint', 'attraction') THEN
                  NEW.alert_radius := 100;
                  NEW.geofence_radius := 50;
              ELSE
                  -- Tutti gli altri / Default
                  NEW.alert_radius := 100;
                  NEW.geofence_radius := 50;
              END IF;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Function created.');

    // 3. Bind the trigger
    console.log('⏳ Binding trigger to shared_pois...');
    await client.query(`
      DROP TRIGGER IF EXISTS trg_assign_geofence_radii ON public.shared_pois;
      CREATE TRIGGER trg_assign_geofence_radii
      BEFORE INSERT OR UPDATE ON public.shared_pois
      FOR EACH ROW
      EXECUTE FUNCTION public.assign_geofence_radii();
    `);
    console.log('✅ Trigger bound successfully. All NEW imports will now be automatically tagged!');

    await client.end();
  } catch (error) {
    console.error('❌ Error applying schema updates:', error);
    process.exit(1);
  }
}

run();
