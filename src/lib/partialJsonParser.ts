/**
 * Utility per fare il parsing di stringhe JSON incomplete provenienti da stream AI.
 * Chiude parentesi e virgolette aperte al volo per restituire un oggetto valido.
 */
export function parsePartialJSON(jsonString: string): any {
  if (!jsonString || typeof jsonString !== 'string') return null;
  
  let fixedStr = jsonString.trim();
  
  // Se finisce con uno slash di escape, togliamolo
  if (fixedStr.endsWith('\\')) fixedStr = fixedStr.slice(0, -1);
  
  let inString = false;
  let escapeNext = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (let i = 0; i < fixedStr.length; i++) {
    const char = fixedStr[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces = Math.max(0, openBraces - 1);
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets = Math.max(0, openBrackets - 1);
    }
  }

  // Se siamo dentro una stringa, la chiudiamo
  if (inString) fixedStr += '"';

  // Rimuovi virgole o due punti pendenti prima di chiudere parentesi
  fixedStr = fixedStr.replace(/([,:]\s*)$/, '');

  // Chiudi array e oggetti aperti
  for (let i = 0; i < openBrackets; i++) fixedStr += ']';
  for (let i = 0; i < openBraces; i++) fixedStr += '}';

  try {
    return JSON.parse(fixedStr);
  } catch (e) {
    // In alcuni casi (es. stringhe parziali interne con caratteri non validi), JSON.parse fallisce ancora.
    // Ritorniamo null, al prossimo chunk probabilmente sarà un JSON valido o correggibile.
    return null;
  }
}
