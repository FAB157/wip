export interface DirectionalInput {
  targetName: string;
  distance: number;
  targetBearing: number;
  userBearing: number;
}

/**
 * Calcola la differenza angolare tra due direzioni, restituendo un valore tra -180 e 180.
 */
function getNormalizedDifference(target: number, current: number): number {
  let diff = target - current;
  // Normalizza tra -180 e +180
  while (diff <= -180) diff += 360;
  while (diff > 180) diff -= 360;
  return diff;
}

/**
 * Genera una frase da "guida turistica" basata sulle indicazioni di direzione e distanza.
 */
export function getDirectionalPhrase({
  targetName,
  distance,
  targetBearing,
  userBearing,
}: DirectionalInput): string {
  const diff = getNormalizedDifference(targetBearing, userBearing);
  const roundedDist = Math.round(distance);
  let directionText = '';

  // 1. Logica di direzione
  if (diff >= -20 && diff <= 20) {
    directionText = 'Davanti a te';
  } else if (diff >= 21 && diff <= 70) {
    directionText = 'Alla tua destra';
  } else if (diff >= 71 && diff <= 110) {
    directionText = 'Proprio alla tua destra';
  } else if (diff >= 111 && diff <= 160) {
    directionText = 'Dietro alla tua destra';
  } else if (diff >= 161 || diff <= -161) {
    directionText = 'Alle tue spalle';
  } else if (diff <= -111 && diff >= -160) {
    directionText = 'Dietro alla tua sinistra';
  } else if (diff <= -71 && diff >= -110) {
    directionText = 'Proprio alla tua sinistra';
  } else if (diff <= -21 && diff >= -70) {
    directionText = 'Alla tua sinistra';
  }

  // Costruzione della frase base
  let phrase = `${targetName} è ${directionText.toLowerCase()}`;

  // 2. Logica di distanza
  if (roundedDist > 50) {
    phrase += ` a circa ${roundedDist} metri`;
  }

  phrase += '.';

  // 3. Suggerimento di movimento
  if (diff > 20) {
    phrase += ' Ruota verso destra per visualizzarlo meglio.';
  } else if (diff < -20) {
    phrase += ' Ruota verso sinistra per visualizzarlo meglio.';
  }

  return phrase;
}
