import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function insertAll() {
  const newPOIs = [
    {
      id: uuidv4(),
      name: "Borgo di Colonnata",
      lat: 44.0875,
      lon: 10.1547,
      category: "gemme",
      is_gem: true,
      city: "Carrara"
    },
    {
      id: uuidv4(),
      name: "Cave di Marmo (Fantiscritti)",
      lat: 44.0846,
      lon: 10.1170,
      category: "gemme",
      is_gem: true,
      city: "Carrara"
    },
    {
      id: uuidv4(),
      name: "Museo Civico del Marmo",
      lat: 44.06579,
      lon: 10.07339,
      category: "gemme",
      is_gem: true,
      city: "Carrara"
    },
    {
      id: uuidv4(),
      name: "CARMI - Museo Carrara e Michelangelo",
      lat: 44.0841,
      lon: 10.0932,
      category: "gemme",
      is_gem: true,
      city: "Carrara"
    }
  ];

  console.log("Tentativo di inserimento dei 4 nuovi POI...");
  const { error: insertError } = await supabase
    .from('shared_pois')
    .insert(newPOIs);

  if (insertError) {
    console.error("Errore inserimento:", insertError.message);
  } else {
    console.log("I 4 POI sono stati inseriti con successo come Gemme!");
  }
}

insertAll();
