const q = `[out:json][timeout:25];
(
  nwr["historic"]["name"](47.36,8.52,47.38,8.56);
  nwr["tourism"="attraction"]["name"](47.36,8.52,47.38,8.56);
  nwr["heritage"]["name"](47.36,8.52,47.38,8.56);
);
out center tags;`;

fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), {
  method: 'GET'
})
.then(r => r.text())
.then(data => {
  console.log("Raw response GET:", data.substring(0, 500));
})
.catch(console.error);
