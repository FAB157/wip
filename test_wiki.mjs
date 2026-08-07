(async () => {
  const lat = 43.722;
  const lon = 10.396;
  const res = await fetch(`http://localhost:3000/api/wiki/pois?lat=${lat}&lon=${lon}&radius=1000&limit=20`);
  const data = await res.json();
  if (data.query && data.query.pages) {
    const pages = Object.values(data.query.pages);
    const dynamicPoints = pages.map(p => ({
      id: `wiki-${p.pageid}`,
      name: p.title,
      lat: p.coordinates?.[0]?.lat,
      lon: p.coordinates?.[0]?.lon,
      category: "monumenti",
      description: p.description || p.extract,
      thumbnail: p.thumbnail?.source
    }));
    console.log(JSON.stringify(dynamicPoints, null, 2));
    
    // Check if Torre di Pisa is here
    const torre = dynamicPoints.find(p => p.name.includes("Torre"));
    console.log("Torre di Pisa present?", !!torre);
    if (torre) {
      const distance = getDistanceInMeters(lat, lon, torre.lat, torre.lon);
      console.log("Distance to Torre at start:", distance);
    }
  } else {
    console.log("No pages returned");
  }

  function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
})();
