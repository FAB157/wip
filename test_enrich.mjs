const res = await fetch('http://localhost:3000/api/poi/enrich', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: 'test-123',
    name: 'Torre di Pisa',
    lat: 43.722952,
    lon: 10.396597,
    category: 'monumenti',
    lang: 'it'
  })
});
const text = await res.text();
console.log('STATUS:', res.status);
console.log('RESPONSE:', text);
