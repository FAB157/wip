import fetch from "node-fetch";

const bbox = "59.8,10.4,60.1,10.9"; // Large bbox for Oslo
const LAYER_QUERIES = {
  all: (bbox) => {
    const [south, west, north, east] = bbox.split(",");
    return `
      [out:json][timeout:25];
      (
        nwr["tourism"~"^(museum|gallery|viewpoint|artwork|attraction|theme_park|zoo|winery)$"](${south},${west},${north},${east});
        nwr["historic"](${south},${west},${north},${east});
        nwr["amenity"="place_of_worship"](${south},${west},${north},${east});
        nwr["amenity"~"^(restaurant|cafe|bar|pub|pharmacy|drinking_water|hospital|toilets|marketplace)$"](${south},${west},${north},${east});
        nwr["leisure"~"^(park|playground)$"](${south},${west},${north},${east});
        nwr["railway"="station"](${south},${west},${north},${east});
        nwr["highway"="motorway_junction"](${south},${west},${north},${east});
        nwr["craft"](${south},${west},${north},${east});
        nwr["shop"="bakery"](${south},${west},${north},${east});
      );
      out center tags;
    `;
  },
  monumenti: (bbox) => `
    nwr["historic"]["name"](${bbox});
    nwr["tourism"="attraction"]["name"](${bbox});
    nwr["heritage"]["name"](${bbox});
  `,
  chiese: (bbox) => `
    nwr["amenity"="place_of_worship"]["name"](${bbox});
    nwr["building"~"church|cathedral|chapel|basilica"]["name"](${bbox});
  `,
  panorami: (bbox) => `
    nwr["tourism"="viewpoint"]["name"](${bbox});
    nwr["natural"="peak"]["name"](${bbox});
    nwr["landuse"="quarry"]["wikidata"]["name"](${bbox});
    nwr["landuse"="quarry"]["wikipedia"]["name"](${bbox});
  `,
  locali: (bbox) => `
    nwr["amenity"~"restaurant|cafe|fast_food|bar|pub|ice_cream"](${bbox});
  `,
  utilita: (bbox) => `
    nwr["amenity"="taxi"](${bbox});
    nwr["railway"="station"]["name"](${bbox});
    nwr["barrier"="toll_booth"](${bbox});
    nwr["amenity"~"hospital|pharmacy|police|library|post_office|drinking_water"](${bbox});
    nwr["railway"="subway_entrance"](${bbox});
  `,
  famiglie: (bbox) => `
    nwr["leisure"="playground"](${bbox});
    nwr["tourism"~"theme_park|aquarium|zoo"](${bbox});
  `,
  musei: (bbox) => `
    nwr["tourism"="museum"]["name"](${bbox});
    nwr["tourism"="gallery"]["name"](${bbox});
  `,
  esperienze_locali: (bbox) => `
    nwr["amenity"="marketplace"](${bbox});
    nwr["shop"~"craft|cheese"](${bbox});
    nwr["craft"](${bbox});
  `,
  gemme: (bbox) => `
    nwr["historic"]["wikipedia"]["name"](${bbox});
    nwr["historic"]["wikidata"]["name"](${bbox});
    nwr["tourism"="museum"]["wikipedia"]["name"](${bbox});
    nwr["tourism"="museum"]["wikidata"]["name"](${bbox});
    nwr["tourism"="viewpoint"]["wikipedia"]["name"](${bbox});
    nwr["tourism"="viewpoint"]["wikidata"]["name"](${bbox});
    nwr["natural"="peak"]["wikipedia"]["name"](${bbox});
    nwr["natural"="peak"]["wikidata"]["name"](${bbox});
    nwr["amenity"="place_of_worship"]["wikipedia"]["name"](${bbox});
    nwr["amenity"="place_of_worship"]["wikidata"]["name"](${bbox});
    nwr["heritage"]["name"](${bbox});
  `,
};

const categoriesToIterate = ["monumenti", "chiese", "musei", "panorami", "locali", "utilita", "famiglie", "esperienze_locali", "eventi"];
let query = "";
const queriedCats = new Set();
categoriesToIterate.forEach((cat) => {
  let catsToQuery = [cat];
  catsToQuery.forEach(c => {
    if (!queriedCats.has(c)) {
      queriedCats.add(c);
      const queryFn = LAYER_QUERIES[c];
      if (queryFn) {
        query += queryFn(bbox);
      }
    }
  });
});

const finalQuery = `[out:json][timeout:25];(${query});out center tags;`;

async function test() {
  console.log("Fetching...");
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(finalQuery)}`
    });
    if (!res.ok) {
      console.log("Error HTTP", res.status, await res.text());
      return;
    }
    const data = await res.json();
    console.log("Total elements:", data.elements?.length);
    console.log("First 5:", data.elements?.slice(0, 5).map(e => e.tags?.name));
  } catch(e) {
    console.error(e);
  }
}
test();
