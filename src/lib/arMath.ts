// Calcola la distanza in metri tra due coordinate (Formula di Haversine)
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Raggio terrestre in metri
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calcola l'angolo (bearing) dal punto 1 al punto 2 rispetto al Nord (0-360 gradi)
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lon1 * Math.PI) / 180;
  const lambda2 = (lon2 * Math.PI) / 180;

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360; // Normalizza tra 0 e 360
}

// Low-pass filter per stabilizzare i dati della bussola
export function lowPassFilter(currentValue: number, lastValue: number, alpha = 0.15): number {
  if (lastValue === null || lastValue === undefined) return currentValue;
  
  // Gestione dell'attraversamento dello 0/360 gradi per evitare salti improvvisi
  let diff = currentValue - lastValue;
  if (diff < -180) diff += 360;
  else if (diff > 180) diff -= 360;
  
  let smoothed = lastValue + alpha * diff;
  return (smoothed + 360) % 360;
}
