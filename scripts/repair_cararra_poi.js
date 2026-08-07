const fs = require('fs');
const path = require('path');
const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

// Log path relativo alla cartella dello script
const logPath = path.join(__dirname, 'repair_error.log');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(logPath, msg + '\n');
}

async function repair() {
  try {
    fs.writeFileSync(logPath, 'Starting repair test...\n');

    // 1. Force state to 'pending' for Accademia di Belle Arti di Carrara
    log('Forcing status of Carrara Academy to pending...');
    const forceRes = await fetch(`${supabaseUrl}/shared_pois?id=eq.44_0792_10_1000`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'pending',
        is_locked: false
      })
    });
    log('Patch Status: ' + forceRes.status);
    const patchText = await forceRes.text();
    log('Patch Response: ' + patchText);

    // 2. Call the Edge Function directly using manager-poi URL
    const edgeUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/manager-poi';
    log('Triggering Edge Function manager-poi for Carrara Academy...');
    const enrichRes = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        action: 'enrich-now',
        place_id: '44_0792_10_1000',
        name: 'Accademia di Belle Arti di Carrara',
        lat: 44.0792,
        lon: 10.1,
        category: 'monumenti',
        mode: 'premium',
        lang: 'it'
      })
    });

    log('Enrich status: ' + enrichRes.status);
    const dataText = await enrichRes.text();
    log('Enriched Data Output: ' + dataText);

    // 3. Re-query the database row to verify
    const verifyRes = await fetch(`${supabaseUrl}/shared_pois?id=eq.44_0792_10_1000`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const verifyText = await verifyRes.text();
    log('Updated Database Row: ' + verifyText);

  } catch (e) {
    log('EXCEPTION: ' + e.message + '\n' + e.stack);
  }
}

repair();
