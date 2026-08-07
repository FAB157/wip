const url = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1/shared_pois?select=name,category&category=eq.esperienze_locali';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key
  }
})
.then(res => res.json())
.then(data => {
  console.log("ESPERIENZE LOCALI COUNT:", data.length);
  if(data.length > 0) {
    console.log("ESEMPI:");
    data.slice(0, 10).forEach(p => console.log("- " + p.name + " (" + p.category + ")"));
  }
})
.catch(err => console.error(err));
