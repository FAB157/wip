import http from 'http';

const query = '[out:json];node(44.0,10.0,44.1,10.1);out;';

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: `data=${encodeURIComponent(query)}`
}).then(async res => {
  console.log(res.status);
  console.log(await res.text());
}).catch(console.error);

