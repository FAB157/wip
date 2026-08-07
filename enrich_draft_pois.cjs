const { createClient } = require('./node_modules/@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseKey);

// Use the service role key from API.txt for admin calls
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y';

async function enrichDrafts() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   📍 ITA IN TAS — Curation & Enrichment Motor   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  let totalSucceeded = 0;
  let totalFailed = 0;

  while (true) {
    const { data: drafts, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon, category')
      .or('status.eq.draft,description_ai.is.null')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('❌ Failed to fetch drafts:', error.message);
      break;
    }

    if (!drafts || drafts.length === 0) {
      console.log('🎉 No pending drafts found! All POIs are fully enriched.');
      break;
    }

    const batch = drafts;
    console.log(`🚀 Starting curation for a safe batch of ${batch.length} POIs...`);
    console.log('');

    let succeeded = 0;
    let failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const poi = batch[i];
    console.log(`[${i + 1}/${batch.length}] Enrolling: "${poi.name}" (${poi.category}) at [${poi.lat}, ${poi.lon}]...`);

    try {
      const response = await axios.post(`https://itainta.vercel.app/api/poi/enrich`, {
        id: poi.id,
        name: poi.name,
        lat: poi.lat,
        lon: poi.lon,
        category: poi.category,
        lang: 'it'
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 45000 // 45s timeout for AI synthesis
      });

      if (response.status === 200 && response.data && !response.data.error) {
        console.log(`  ✅ Successfully enriched! Curation complete.`);
        succeeded++;
      } else {
        console.log(`  ⚠️  Edge function warning:`, response.data?.message || 'Unknown issue');
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ Enrichment failed:`, err.response?.data?.error || err.message);
      failed++;
    }

    // Safe 4.5 seconds delay between POIs to stay under the Gemini 15 RPM limit
    if (i < batch.length - 1) {
      console.log(`  ⏱️  Waiting 4.5 seconds to respect Gemini API limits...`);
      await new Promise(r => setTimeout(r, 4500));
    }
  }

    totalSucceeded += succeeded;
    totalFailed += failed;

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   📊 BATCH CURATION SUMMARY                      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║   Batch Enriched:        ${String(succeeded).padStart(5)}                       ║`);
    console.log(`║   Batch Failed:          ${String(failed).padStart(5)}                       ║`);
    console.log(`║   Total Enriched so far: ${String(totalSucceeded).padStart(5)}                       ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  }
}

enrichDrafts().catch(err => {
  console.error('💥 Fatal error:', err);
});
