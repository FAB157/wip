const q = `[out:json][timeout:25];
(
  nwr["historic"]["name"](47.36,8.52,47.38,8.56);
  nwr["tourism"="attraction"]["name"](47.36,8.52,47.38,8.56);
  nwr["heritage"]["name"](47.36,8.52,47.38,8.56);
);
out center tags;`;

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json"
  },
  body: 'data=' + encodeURIComponent(q)
})
.then(r => r.text())
.then(data => {
  console.log("Raw response length:", data.length);
  if (data.startsWith('{')) console.log("Starts with { -> JSON");
  else console.log(data.substring(0,200));
})
.catch(console.error);
