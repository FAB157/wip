const q = `[out:json][timeout:25];
(
  nwr["historic"]["name"](47.36,8.52,47.38,8.56);
  nwr["tourism"="attraction"]["name"](47.36,8.52,47.38,8.56);
  nwr["heritage"]["name"](47.36,8.52,47.38,8.56);
);
out center tags;`;

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  body: 'data=' + encodeURIComponent(q)
})
.then(r => r.json())
.then(data => {
  console.log("Elements returned:", data.elements.length);
  if (data.elements.length > 0) {
    console.log("First element:", data.elements[0].tags);
  }
})
.catch(console.error);
