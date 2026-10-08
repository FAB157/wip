/**
 * DIZIONARI AGGIUNTIVI (24/08/2026) — la bonifica "tutto nella lingua
 * dell'utente" ha portato centinaia di chiavi nuove: tenerle in i18n.ts
 * (già ~5000 righe) rendeva il file ingestibile e impediva di lavorare
 * in parallelo su aree diverse. Ogni area ha il suo file in traduzioni/;
 * getTranslation li consulta tutti. Le chiavi devono restare UNICHE.
 */
import type { Language } from './i18n';
import { TRAD_PROFILO } from './traduzioni/profilo';
import { TRAD_GIRO } from './traduzioni/giro';
import { TRAD_SCHEDA } from './traduzioni/scheda';
import { TRAD_MAPPA } from './traduzioni/mappa';
import { TRAD_VARI } from './traduzioni/vari';
import { TRAD_MANUALE } from './traduzioni/manuale';
import { TRAD_PERCORSO } from './traduzioni/percorso';

export const DIZIONARI_EXTRA: Record<string, Partial<Record<Language, string>>>[] = [
  TRAD_PROFILO,
  TRAD_GIRO,
  TRAD_SCHEDA,
  TRAD_MAPPA,
  TRAD_VARI,
  TRAD_MANUALE,
  TRAD_PERCORSO,
];
