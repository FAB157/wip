export interface MapboxMatchedLocation {
  snappedLat: number;
  snappedLon: number;
  bearing: number; // Direction of the snapped road segment
  confidence: number;
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''; 

export async function matchRouteToRoad(coordinates: {lat: number, lon: number}[]): Promise<MapboxMatchedLocation | null> {
  if (coordinates.length < 2 || !MAPBOX_ACCESS_TOKEN) return null;

  try {
    const coordsStr = coordinates.map(c => `${c.lon},${c.lat}`).join(';');
    // Set radiuses to 50 meters for each point
    const radiuses = coordinates.map(() => '50').join(';');
    
    // We request walking profile for precise pedestrian snapping (parks, plazas, ZTL)
    const url = `https://api.mapbox.com/matching/v5/mapbox/walking/${coordsStr}?radiuses=${radiuses}&geometries=geojson&steps=false&access_token=${MAPBOX_ACCESS_TOKEN}`;
    
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.matchings && data.matchings.length > 0) {
      const match = data.matchings[0];
      const tracepoints = data.tracepoints;
      
      // Get the last valid tracepoint which represents the current location snapped
      const lastValidTp = [...tracepoints].reverse().find(tp => tp !== null);
      if (lastValidTp && lastValidTp.location) {
        // Calculate bearing based on the last segment of the matched geometry
        let bearing = 0;
        if (match.geometry && match.geometry.coordinates.length >= 2) {
           const geomCoords = match.geometry.coordinates;
           const p1 = geomCoords[geomCoords.length - 2];
           const p2 = geomCoords[geomCoords.length - 1];
           // Mapbox coords are [lon, lat]
           bearing = calculateBearing(p1[1], p1[0], p2[1], p2[0]);
        }

        return {
          snappedLat: lastValidTp.location[1],
          snappedLon: lastValidTp.location[0],
          bearing,
          confidence: match.confidence
        };
      }
    }
    return null;
  } catch (err) {
    console.warn("Mapbox map matching failed", err);
    return null;
  }
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (val: number) => (val * Math.PI) / 180;
  const toDeg = (val: number) => (val * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}
