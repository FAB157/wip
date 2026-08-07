import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function manageMuseumsGems() {
  const newPOIs = [
    {
      id: uuidv4(),
      name: "Museo Civico del Marmo",
      description: "Il Museo Civico del Marmo documenta la storia della lavorazione del marmo e dell'archeologia industriale locale, offrendo un percorso affascinante sull'estrazione e scultura del marmo di Carrara.",
      lat: 44.06579,
      lon: 10.07339,
      category: "gemme",
      is_gem: true,
      city: "Carrara"
    },
    {
      id: uuidv4(),
      name: "CARMI - Museo Carrara e Michelangelo",
      description: "Ospitato nella splendida Villa Fabbricotti (Parco della Padula), il CARMI è un polo museale dedicato al rapporto tra la città di Carrara e il grande genio di Michelangelo Buonarroti.",
      lat: 44.0841,
      lon: 10.0932,
      category: "gemme",
      is_gem: true,
      city: "Carrara"
    }
  ];

  console.log("Inserimento Museo del Marmo e CARMI...");
  const { data: insertData, error: insertError } = await supabase
    .from('shared_pois')
    .insert(newPOIs);

  if (insertError) {
    console.error("Errore inserimento:", insertError.message);
  } else {
    console.log("Musei inseriti con successo come Gemme!");
  }

  console.log("Aggiornamento Accademia delle Belle Arti a gemma...");
  const { data: updateData, error: updateError } = await supabase
    .from('shared_pois')
    .update({ 
      is_gem: true, 
      category: 'gemme'
    })
    .ilike('name', '%Accademia di Belle Arti%')
    .ilike('city', '%carrara%');
    
  const { error: updateErr2 } = await supabase
    .from('shared_pois')
    .update({ 
      is_gem: true, 
      category: 'gemme'
    })
    .ilike('name', '%Accademia di Belle Arti%')
    .gte('lat', 44.03)
    .lte('lat', 44.12);
    
  if (updateErr2) {
    console.error("Errore aggiornamento Accademia:", updateErr2.message);
  } else {
    console.log("Accademia delle Belle Arti aggiornata con successo come Gemma!");
  }
}

manageMuseumsGems();
