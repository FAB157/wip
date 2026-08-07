import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Semplice parser per CSV con virgolette
function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"' && row[i+1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function importaBorghi() {
  const filePath = 'C:\\\\Users\\\\HP\\\\Desktop\\\\000 wip modifiche\\\\borghi_piu_belli_italia_completato.csv';
  console.log(`📖 Leggo il file: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Salta l'header
  const borghi = lines.slice(1).map(parseCSVRow);
  
  console.log(`✅ Trovati ${borghi.length} borghi nel CSV. Inizio importazione/aggiornamento...`);
  
  let inserted = 0;
  let updated = 0;

  for (const b of borghi) {
    if (b.length < 5) continue;
    
    const [nome, regione, latStr, lonStr, info, link] = b;
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    
    // Cerchiamo se esiste già nel database con questo nome esatto
    const { data: existing, error: errSearch } = await supabase
      .from('shared_pois')
      .select('id, category, is_gem')
      .ilike('name', nome);
      
    // Filtriamo i risultati per evitare di sovrascrivere un "Ristorante [Nome Borgo]"
    // Cerchiamo quello che ha categoria attraction, monument, o castle (o senza nome locale)
    let targetPoi = null;
    if (existing && existing.length > 0) {
       targetPoi = existing.find(p => !['restaurant', 'cafe', 'hotel', 'utilita', 'shop'].includes(p.category));
       if (!targetPoi) targetPoi = existing[0]; // Se non c'è scelta, prendiamo il primo
    }

    if (targetPoi) {
      // Aggiorniamo quello esistente
      const { error: errUp } = await supabase
        .from('shared_pois')
        .update({
          category: 'attraction',
          is_gem: true,
          description_short: info || undefined,
          // Puoi aggiungere il link se hai una colonna apposita, es: website: link
        })
        .eq('id', targetPoi.id);
        
      if (!errUp) updated++;
      console.log(`🔄 AGGIORNATO: ${nome} (impostato come Gemma e Attrazione)`);
    } else {
      // Lo creiamo da zero!
      const { error: errIn } = await supabase
        .from('shared_pois')
        .insert({
          name: nome,
          lat: lat,
          lon: lon,
          category: 'attraction',
          is_gem: true,
          description_short: info || undefined,
          status: 'approved',
          type: 'node'
        });
        
      if (!errIn) inserted++;
      console.log(`✨ INSERITO: ${nome} (Nuovo Borgo Gemma)`);
    }
  }
  
  console.log(`\\n🎉 Importazione completata!`);
  console.log(`- Borghi già presenti aggiornati: ${updated}`);
  console.log(`- Nuovi Borghi aggiunti da zero: ${inserted}`);
}

importaBorghi();
