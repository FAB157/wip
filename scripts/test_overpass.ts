import fetch from "node-fetch";

async function testOverpass() {
  const bbox = "59.90,10.70,59.95,10.80"; // Oslo center

  const layerQueries = {
    monumenti: `
      nwr["historic"]["name"](${bbox});
      nwr["tourism"="attraction"]["name"](${bbox});
      nwr["heritage"]["name"](${bbox});
    `,
    chiese: `
      nwr["amenity"="place_of_worship"]["name"](${bbox});
      nwr["building"~"church|cathedral|chapel|basilica"]["name"](${bbox});
    `,
    panorami: `
      nwr["tourism"="viewpoint"]["name"](${bbox});
      nwr["natural"="peak"]["name"](${bbox});
    `,
    locali: `
      nwr["amenity"~"restaurant|cafe|fast_food|bar|pub|ice_cream"](${bbox});
    `,
    utilita: `
      nwr["amenity"="taxi"](${bbox});
      nwr["railway"="station"]["name"](${bbox});
      nwr["barrier"="toll_booth"](${bbox});
      nwr["amenity"~"hospital|pharmacy|police|library|post_office|drinking_water"](${bbox});
      nwr["railway"="subway_entrance"](${bbox});
    `,
    famiglie: `
      nwr["leisure"="playground"](${bbox});
      nwr["tourism"~"theme_park|aquarium|zoo"](${bbox});
    `,
    musei: `
      nwr["tourism"="museum"]["name"](${bbox});
      nwr["tourism"="gallery"]["name"](${bbox});
    `,
    esperienze_locali: `
      nwr["amenity"="marketplace"](${bbox});
      nwr["shop"~"craft|cheese"](${bbox});
      nwr["craft"](${bbox});
    `
  };

  let query = "";
  const categoriesToIterate = ["monumenti", "chiese", "musei", "panorami", "locali", "utilita", "famiglie", "esperienze_locali"];
  
  categoriesToIterate.forEach(c => {
    query += layerQueries[c];
  });

  const finalQuery = `[out:json][timeout:25];(${query});out center tags;`;

  console.log("Query size:", finalQuery.length);

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `data=${encodeURIComponent(finalQuery)}`
    });

    if (!res.ok) {
      console.error("HTTP Error", res.status, await res.text());
      return;
    }

    const data = await res.json();
    console.log("Total elements returned:", data.elements?.length);
    console.log("First 2 elements:", data.elements?.slice(0, 2));

  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testOverpass();
