import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from("shared_pois")
    .select("name, lat, lon")
    .gte("lat", 59.8)
    .lte("lat", 60.1)
    .gte("lon", 10.4)
    .lte("lon", 10.9);
    
  console.log("DB Oslo POIs:", data?.length);
  console.log("Names:", data?.map(d => d.name));
}
check();
