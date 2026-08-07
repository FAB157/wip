async function testPredictHQ() {
  const phqKey = "XpVfpLieYlYH63VwP25TgDqWcbzah_NM2GzUcBUS";
  const lat = 41.8902;
  const lon = 12.4922; // Rome
  const searchRadius = 100;
  const startStr = "2026-06-13";
  const endStr = "2026-07-13";

  try {
    const url = `https://api.predicthq.com/v1/events?location_around.origin=${lat},${lon}&location_around.scale=${searchRadius}km&active.gte=${startStr}&active.lte=${endStr}&sort=-rank&limit=20`;
    console.log("Fetching:", url);
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${phqKey}`, "Accept": "application/json" }
    });

    console.log("Status:", res.status);
    const data = await res.json();
    if (!res.ok) {
      console.error("Error Response:", data);
      return;
    }

    console.log(`Found ${data.results?.length} events.`);
    if (data.results?.length > 0) {
       console.log("First event:", data.results[0].title);
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testPredictHQ();
