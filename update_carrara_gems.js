import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function manageCarraraGems() {
  const latMin = 44.03;
  const latMax = 44.12;
  const lonMin = 10.02;
  const lonMax = 10.15;

  console.log("Rimozione di Castelpoggio dalle gemme...");
  const { data: updateData, error: updateError } = await supabase
    .from('shared_pois')
    .delete()
    .gte('lat', latMin)
    .lte('lat', latMax)
    .gte('lon', lonMin)
    .lte('lon', lonMax)
    .ilike('name', '%Castelpoggio%');
    
  if (updateError) {
    console.error("Errore eliminazione Castelpoggio:", updateError.message);
  } else {
    console.log("Castelpoggio rimosso.");
  }

  const newGems = [
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
    }
  ];

  console.log("Inserimento Colonnata e Cave di Marmo...");
  const { error: insertError } = await supabase
    .from('shared_pois')
    .insert(newGems);

  if (insertError) {
    console.error("Errore inserimento nuove gemme:", insertError.message);
  } else {
    console.log("Colonnata e Cave di Marmo inserite con successo come Gemme!");
  }
}

manageCarraraGems();
