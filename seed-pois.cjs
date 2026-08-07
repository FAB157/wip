const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  try {
    const { data: existing } = await supabase.from('shared_pois').select('id');
    if (existing && existing.length > 0) {
      console.log(`Database already contains ${existing.length} POIs. Skipping seed.`);
      return;
    }

    const testPois = [
      {
        id: '44_0792_10_1000', // Deterministic ID format: 4 decimals replaced by '_'
        lat: 44.0792,
        lon: 10.1000,
        name: 'Accademia di Belle Arti di Carrara',
        category: 'monumenti',
        description_ai: 'L’Accademia di Belle Arti di Carrara è un’istituzione artistica pubblica ospitata nel maestoso Palazzo Cybo-Malaspina.',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/4/41/Palazzo_cybo_malaspina_carrara_03.jpg',
        is_gem: true,
        status: 'draft',
        created_at: new Date().toISOString()
      },
      {
        id: '44_0810_10_0980',
        lat: 44.0810,
        lon: 10.0980,
        name: 'Santuario della Madonna delle Grazie',
        category: 'chiese',
        description_ai: 'Storico santuario di Carrara edificato nel XVII secolo, noto per i pregiati interni in marmo e affreschi barocchi.',
        image_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Massa%2C_santuario_della_madonna_delle_grazie_02.jpg',
        is_gem: false,
        status: 'needs_revision',
        created_at: new Date().toISOString()
      }
    ];

    console.log('Seeding initial curated POIs to database...');
    let { data, error } = await supabase.from('shared_pois').insert(testPois);
    if (error) {
      const isColumnMismatch = error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache');
      if (isColumnMismatch) {
        console.warn('Column mismatch detected, retrying with minimal adaptive schema columns...');
        const minimalPois = testPois.map(poi => ({
          id: poi.id,
          lat: poi.lat,
          lon: poi.lon,
          name: poi.name,
          category: poi.category,
          description_ai: poi.description_ai,
          audio_url: null,
          is_hidden: false,
          verified: true,
          created_at: poi.created_at
        }));
        const retryRes = await supabase.from('shared_pois').insert(minimalPois);
        error = retryRes.error;
      }
    }
    
    if (error) {
      console.error('Failed to seed shared_pois:', error.message);
    } else {
      console.log('Successfully seeded database with curated POIs! ✅');
    }
  } catch (e) {
    console.error('Exception during seeding:', e);
  }
}

seed();
