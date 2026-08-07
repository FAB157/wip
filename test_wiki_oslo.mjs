import fetch from "node-fetch";

async function testWiki() {
  const lat = 59.91;
  const lon = 10.75;
  const radius = 2000;
  // This is what MapArea does through the proxy:
  const url = `https://it.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${radius}&ggslimit=50&prop=coordinates|pageimages|description&piprop=thumbnail&pithumbsize=600&format=json`;
  
  const res = await fetch(url);
  const data = await res.json();
  const pages = data.query?.pages ? Object.values(data.query.pages) : [];
  console.log("Wikipedia POIs:", pages.length);
  console.log("First few:", pages.slice(0,5).map((p) => p.title));
}
testWiki();
