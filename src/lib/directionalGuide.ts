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
 *
 * NOTA: attualmente NON collegata ad alcun componente (nessun import nel
 * codebase). Mantenuta e corretta per un futuro uso (es. bussola AR).
 */
export function getDirectionalPhrase({
  targetName,
  distance,
  targetBearing,
  userBearing,
}: DirectionalInput): string {
  const diff = getNormalizedDifference(targetBearing, userBearing);
  const roundedDist = Math.round(distance);
  // Default = banda frontale [-20, 20]. Le altre bande sono CONTINUE: prima
  // `>=21`/`<=20` lasciavano buchi sugli angoli frazionari (20,5° / 70,4° non
  // ricadevano in nessuna banda → frase senza direzione).
  let directionText = 'Davanti a te';

  // 1. Logica di direzione
  if (diff > 20 && diff <= 70) {
    directionText = 'Alla tua destra';
  } else if (diff > 70 && diff <= 110) {
    directionText = 'Proprio alla tua destra';
  } else if (diff > 110 && diff <= 160) {
    directionText = 'Dietro alla tua destra';
  } else if (diff > 160 || diff <= -160) {
    directionText = 'Alle tue spalle';
  } else if (diff > -160 && diff <= -110) {
    directionText = 'Dietro alla tua sinistra';
  } else if (diff > -110 && diff <= -70) {
    directionText = 'Proprio alla tua sinistra';
  } else if (diff > -70 && diff < -20) {
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
