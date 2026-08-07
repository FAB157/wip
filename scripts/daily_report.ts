import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Credenziali Supabase mancanti nel file .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateDailyReport() {
  console.log("📊 Generazione Report Giornaliero degli Arricchimenti...");

  // Calcola la data di 24 ore fa
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);
  const sinceISO = yesterday.toISOString();

  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, city, category, enrichment_source, enriched_at, photo_url')
    .gte('enriched_at', sinceISO)
    .order('enriched_at', { ascending: false });

  if (error) {
    console.error("❌ Errore durante il fetch dei POI:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("Nessun POI arricchito nelle ultime 24 ore.");
    return;
  }

  // Statistiche
  const total = data.length;
  const successGroqWiki = data.filter(d => d.enrichment_source === 'groq_bg_wiki').length;
  const successGroqInternal = data.filter(d => d.enrichment_source === 'groq_bg_internal').length;
  const skipped = data.filter(d => d.enrichment_source === 'not_found').length;
  const withPhotos = data.filter(d => !!d.photo_url).length;

  const validPois = data.filter(d => d.enrichment_source?.startsWith('groq'));

  // Generazione File di Report
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `report_arricchimenti_${dateStr}.txt`;
  const filepath = path.join(process.cwd(), filename);

  let reportContent = `====================================================\n`;
  reportContent += `📅 REPORT ARRICCHIMENTI (Ultime 24 Ore)\n`;
  reportContent += `Generato il: ${new Date().toLocaleString('it-IT')}\n`;
  reportContent += `====================================================\n\n`;
  
  reportContent += `📈 STATISTICHE GLOBALI:\n`;
  reportContent += `- Totale POI esaminati: ${total}\n`;
  reportContent += `- POI arricchiti con successo: ${successGroqWiki + successGroqInternal}\n`;
  reportContent += `   ↳ Da dati Wikipedia: ${successGroqWiki}\n`;
  reportContent += `   ↳ Dalla memoria AI (senza Wiki): ${successGroqInternal}\n`;
  reportContent += `- POI dotati di nuove fotografie: ${withPhotos}\n`;
  reportContent += `- POI scartati (Finti/Pizzerie/Non trovati): ${skipped}\n\n`;

  reportContent += `🏆 ULTIMI 100 POI ARRICCHITI CON SUCCESSO:\n`;
  reportContent += `----------------------------------------------------\n`;
  
  const top100 = validPois.slice(0, 100);
  top100.forEach((poi, index) => {
    reportContent += `${index + 1}. ${poi.name} ${poi.city ? '('+poi.city+')' : ''} - [${poi.category}] ${poi.photo_url ? '📸' : ''}\n`;
  });

  if (validPois.length > 100) {
    reportContent += `... e altri ${validPois.length - 100} POI arricchiti.\n`;
  }

  fs.writeFileSync(filepath, reportContent, 'utf-8');

  console.log(`✅ Report generato con successo!`);
  console.log(`📄 Trovi il file salvato in: ${filepath}`);
  console.log(`\nStatistiche Rapide:`);
  console.log(`- Esaminati: ${total}`);
  console.log(`- Arricchiti: ${successGroqWiki + successGroqInternal}`);
  console.log(`- Scartati: ${skipped}`);
}

generateDailyReport();
