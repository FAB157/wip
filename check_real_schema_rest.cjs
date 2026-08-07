const axios = require('axios');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

async function checkRestSchema() {
  console.log('Querying PostgREST OpenAPI spec for shared_poi_audio_cache...');
  try {
    const res = await axios.get(supabaseUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });
    
    const pathInfo = res.data.paths['/shared_poi_audio_cache'];
    if (pathInfo) {
      console.log('✅ Found /shared_poi_audio_cache path in OpenAPI spec!');
      
      // Let's get the parameters for POST or GET
      const postParams = pathInfo.post?.parameters || [];
      console.log('POST Parameters/Columns from Supabase schema:');
      postParams.forEach(p => {
        if (p.schema && p.schema.properties) {
          console.log(Object.keys(p.schema.properties));
        } else {
          console.log(p.name, '(', p.type, ')');
        }
      });
      
      const getParams = pathInfo.get?.parameters || [];
      console.log('\nGET Query parameters:');
      getParams.forEach(p => {
        console.log(p.name);
      });
    } else {
      console.log('❌ Could not find /shared_poi_audio_cache in paths:', Object.keys(res.data.paths));
    }
  } catch (err) {
    console.error('❌ OpenAPI Query Failed:', err.message);
  }
}

checkRestSchema();
