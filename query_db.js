const url = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1/shared_pois?select=name,category&category=eq.esperienze_locali';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
