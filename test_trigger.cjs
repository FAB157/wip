const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y';

async function main() {
  const testId = 'test_trigger_poi_01';

  const headers = {
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  console.log('🧹 Pulizia vecchio test POI se esiste...');
  await fetch(`${supabaseUrl}/shared_pois?id=eq.${testId}`, { method: 'DELETE', headers });

  console.log('🚀 Inserimento POI di test (Colosseo) senza descrizione...');
  const payload = {
    id: testId,
    name: 'Colosseo',
    lat: 41.8902,
    lon: 12.4922,
    category: 'monumenti',
    status: 'draft'
  };

  const insertRes = await fetch(`${supabaseUrl}/shared_pois`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  
  if (!insertRes.ok) {
    console.error("❌ Errore durante l'inserimento:", await insertRes.text());
    return;
  }

  console.log('✅ Inserimento completato. Il trigger dovrebbe aver avviato la Edge Function.');
  console.log("⏳ Attendo 15 secondi per lasciare il tempo alla Edge Function di completare l'arricchimento...");
  
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('🔍 Controllo se il POI è stato aggiornato...');
  const getRes = await fetch(`${supabaseUrl}/shared_pois?id=eq.${testId}&select=description_ai,full_description,status`, {
    headers
  });
  
  const rows = await getRes.json();
  if (rows && rows.length > 0) {
    const poi = rows[0];
    console.log('📝 Dati attuali del POI nel DB:');
    console.log('- Status:', poi.status);
    console.log('- Description AI:', poi.description_ai ? (poi.description_ai.substring(0, 100) + '...') : 'NULL');
    console.log('- Full Description:', poi.full_description ? (poi.full_description.substring(0, 100) + '...') : 'NULL');
    
    if (poi.description_ai || poi.full_description) {
      console.log("🎉 IL TRIGGER FUNZIONA! L'Edge Function ha aggiornato i campi del POI.");
    } else {
      console.log('⚠️ IL TRIGGER POTREBBE NON AVER FUNZIONATO. I campi description sono ancora NULL.');
      console.log('Controlla i log della Edge Function "manager-poi" sulla dashboard di Supabase.');
    }
  } else {
    console.log('❌ POI non trovato. Qualcosa è andato storto.');
  }

  console.log('🧹 Pulizia del POI di test...');
  await fetch(`${supabaseUrl}/shared_pois?id=eq.${testId}`, { method: 'DELETE', headers });
}

main().catch(console.error);
