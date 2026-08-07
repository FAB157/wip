const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

async function checkOsmTags() {
  try {
    const res = await fetch(`${supabaseUrl}/shared_pois?select=id,name,category,data&limit=20`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    if (res.ok) {
      const items = await res.json();
      console.log(`Retrieved ${items.length} items from shared_pois:`);
      items.forEach((item, idx) => {
        const d = item.data || {};
        console.log(`${idx + 1}. "${item.name}" (ID: ${item.id})`);
        console.log(`   - wikidata: ${d.wikidata || 'undefined'}`);
        console.log(`   - wikipedia: ${d.wikipedia || 'undefined'}`);
        console.log(`   - category: ${item.category}`);
      });
    } else {
      console.error('Failed to fetch:', await res.text());
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

checkOsmTags();
