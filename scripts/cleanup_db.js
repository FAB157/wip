import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const BLACKLIST_KEYWORDS = [
  'farmacia', 'pharmacy', 'parafarmacia',
  'asl', 'serd', 'ser.d', 'ospedale', 'hospital', 'clinica', 'ambulatorio', 'pronto soccorso',
  'guardia medica', 'consultorio', 'poliambulatorio',
  'supermercato', 'supermarket', 'coop', 'conad', 'lidl', 'eurospin', 'carrefour', 'esselunga', 'penny',
  'tabacchi', 'tabaccheria', 'edicola',
  'benzina', 'distributore', 'stazione di servizio', 'gas station',
  'parcheggio', 'parking', 'autolavaggio', 'car wash',
  'banca', 'bank', 'bancomat', 'atm', 'poste italiane', 'ufficio postale',
  'scuola', 'school', 'liceo', 'istituto comprensivo', 'istituto tecnico',
  'caserma', 'questura', 'commissariato', 'vigili del fuoco', 'pompieri',
  'comune di', 'municipio', 'anagrafe', 'tribunale',
  'centro commerciale', 'shopping center',
  'ferramenta', 'falegnameria', 'carrozzeria', 'officina', 'autofficina',
  'veterinario', 'dentista', 'ottico', 'oculista',
  'palestra', 'gym', 'fitness',
  'autoscuola', 'driving school',
  'lavanderia', 'laundry',
  'agenzia', 'assicurazioni', 'insurance',
];

async function cleanupDB() {
  console.log("Inizio pulizia database per tutte le zone...");
  let count = 0;

  for (const kw of BLACKLIST_KEYWORDS) {
    const { data, error } = await supabase
      .from('shared_pois')
      .update({ category: 'utilita' })
      .ilike('name', `%${kw}%`)
      .in('category', ['monument', 'artwork', 'monumenti', 'attraction', 'viewpoint', 'panorami'])
      .select('id, name');

    if (error) {
      console.error(`Errore per la keyword '${kw}':`, error.message);
    } else if (data && data.length > 0) {
      console.log(`Trovati e rimossi ${data.length} POI con la keyword '${kw}':`);
      data.forEach(p => console.log(` - ${p.name}`));
      count += data.length;
    }
  }

  console.log(`\nPulizia completata! Totale POI "falsi monumenti" rimossi in tutto il mondo: ${count}`);
}

cleanupDB();
