/**
 * DIECI TAPPE — la macchina a stati del giro.
 *
 * Tutto il comportamento del giro, audio compreso, si deriva da qui invece di
 * essere sparso in condizioni per il codice. E' la lezione del geofencing:
 * la stessa logica scritta in tre punti diversi (web, Android, iOS) ci ha gia'
 * morso, e ogni volta che si aggiungeva un caso se ne dimenticava uno.
 *
 * Sei stati, e le soglie sono numeri con un motivo:
 *   IN_ARRIVO a 80 m   — il teaser deve arrivare mentre il posto e` in vista,
 *                        non quando ci sei gia` addosso
 *   ALL_INGRESSO a 25 m — la distanza a cui si riconosce una porta
 *   IN_PAUSA a 3 min   — sotto, e` un semaforo; sopra, e` un caffe`
 *   DEVIATO a 120 m per 30 s — sotto, e` un marciapiede sbagliato; il tempo
 *                        serve a non ricalcolare per un rimbalzo del GPS
 */

export type StatoGiro =
  | 'IN_CAMMINO'
  | 'IN_ARRIVO'
  | 'ALL_INGRESSO'
  | 'GUIDA_IN_CORSO'
  | 'IN_PAUSA'
  | 'DEVIATO'
  | 'FINITO';

export const SOGLIE = {
  /** Sotto questa distanza dall'ingresso parte il teaser breve. */
  arrivo_m: 80,
  /** Sotto questa si e` arrivati: parte l'audioguida. */
  ingresso_m: 25,
  /** Oltre questa, fuori percorso. */
  deviazione_m: 120,
  /** Per quanto bisogna restare fuori percorso prima di ricalcolare. */
  deviazione_s: 30,
  /** Fermo piu` di cosi` = pausa vera, non un semaforo. */
  pausa_s: 180,
  /** Sotto questa velocita` si e` considerati fermi (m/s). */
  fermo_ms: 0.4,
  /** Due tappe piu` vicine di cosi` si trattano come una sola sosta. */
  tappe_unite_m: 60,
} as const;

export interface TappaGiro {
  id: string | number;
  nome: string;
  lat: number;
  lon: number;
  /** Categoria del POI (musei, chiese…): serve a proporre una sostituta dello stesso tipo. */
  categoria?: string | null;
  /** Citta`, se il POI la porta: da` il titolo al giro quando lo si salva. */
  citta?: string | null;
  /** Punto d'ingresso, se lo conosciamo: e` li` che si arriva davvero. */
  ingresso?: { lat: number; lon: number; livello: LivelloIngresso } | null;
  /** Testo dell'audioguida, pre-scaricato all'avvio del giro. */
  testo?: string | null;
  /** Audio gia` scaricato (URL locale o oggetto), se disponibile offline. */
  audio?: string | null;
  /** Secondi stimati di ascolto: serve per la durata onesta del giro. */
  durata_ascolto_s?: number;
  fatta?: boolean;
  saltata?: boolean;
  /**
   * Tolta dall'utente con la X sulla mappa. Diversa da `saltata`: una tappa
   * saltata e` stata raggiunta e lasciata perdere (conta come fatta), una
   * esclusa non doveva proprio esserci — sparisce dal conteggio e dalla mappa.
   */
  esclusa?: boolean;
  /**
   * TAPPA CHE NON PARLA (29/08/2026). Il pranzo, la pausa caffe`, il
   * trasferimento: fanno parte della giornata e del tracciato — hanno un
   * orario e delle coordinate, e un giro che li salta non e` piu` il giorno
   * che l'utente ha pianificato — ma non hanno una storia da raccontare.
   * Restano tappe a tutti gli effetti: si vedono sulla mappa, il percorso ci
   * passa, l'arrivo viene annunciato col nome. Solo, niente audioguida: ne'
   * pre-scaricata, ne' letta all'arrivo, ne' pagata.
   */
  senzaGuida?: boolean;
  /**
   * Foto del luogo (URL), se il POI ce l'ha. Va nel cruscotto a display
   * spento (icona grande della notifica Android, miniatura della Live
   * Activity iOS). Assente = cruscotto solo testo, mai una foto di ripiego.
   */
  foto?: string | null;
}

/**
 * Da dove viene il punto d'ingresso. Il client NON deve trattarli allo stesso
 * modo: con `centroide` la soglia d'arrivo va allargata, perche' il punto e`
 * il centro dell'edificio e la porta puo` essere cinquanta metri piu` in la`.
 */
export type LivelloIngresso = 'dichiarato' | 'civico' | 'indirizzo' | 'centroide';

/** Soglia d'arrivo adattata alla fiducia che abbiamo nel punto. */
export function sogliaArrivo(livello: LivelloIngresso | undefined, raggioEdificio?: number | null): number {
  if (livello === 'dichiarato') return SOGLIE.ingresso_m;
  if (livello === 'civico') return SOGLIE.ingresso_m + 10;
  if (livello === 'indirizzo') return SOGLIE.ingresso_m + 25;
  // Centroide: senza sapere quanto e` grande l'edificio si tira a indovinare.
  // Col perimetro invece la soglia diventa "quando sei addosso all'edificio",
  // che e` il massimo ottenibile senza conoscere la porta.
  return raggioEdificio ? Math.max(SOGLIE.ingresso_m, raggioEdificio + 15) : 70;
}

export interface StatoCorrente {
  stato: StatoGiro;
  /** Indice nella sequenza ordinata, non nell'ordine di selezione. */
  tappaCorrente: number;
  /** Da quando siamo in questo stato (ms epoch). */
  da: number;
  /** Da quando siamo fuori percorso, per la soglia dei 30 secondi. */
  fuoriPercorsoDa?: number | null;
  /** Da quando siamo fermi, per distinguere il semaforo dal caffe`. */
  fermoDa?: number | null;
}

export interface Osservazione {
  /** Distanza dall'ingresso della tappa corrente, in metri. */
  distanzaTappa: number;
  /** Distanza dal percorso tracciato, in metri. */
  scostamento: number;
  /** Velocita` corrente in m/s (dal GPS o calcolata). */
  velocita: number;
  /** La guida della tappa corrente sta parlando? */
  guidaInCorso: boolean;
  /** L'utente ha messo in pausa a mano. */
  pausaManuale: boolean;
  adesso: number;
}

/**
 * La transizione. Funzione PURA: nessun accesso al GPS, all'audio o al DOM.
 * Cosi` si puo` provare senza camminare per Roma — che e` esattamente il
 * motivo per cui la logica del geofencing e` stata difficile da correggere.
 */
export function prossimoStato(
  corrente: StatoCorrente,
  tappa: TappaGiro | null,
  o: Osservazione,
  raggioEdificio?: number | null,
): StatoCorrente {
  const cambia = (s: StatoGiro, extra: Partial<StatoCorrente> = {}): StatoCorrente =>
    s === corrente.stato ? { ...corrente, ...extra } : { ...corrente, ...extra, stato: s, da: o.adesso };

  if (!tappa) return cambia('FINITO');

  // La pausa manuale vince su tutto: e` l'utente che ha deciso.
  if (o.pausaManuale) return cambia('IN_PAUSA');

  // La guida in corso vince sul resto: non si cambia stato mentre parla, o si
  // troncherebbe il racconto per una soglia superata di mezzo metro.
  if (o.guidaInCorso) return cambia('GUIDA_IN_CORSO');

  // Fermi da un pezzo: pausa. Il conteggio parte al primo campione fermo.
  const fermoDa = o.velocita < SOGLIE.fermo_ms ? (corrente.fermoDa ?? o.adesso) : null;
  if (fermoDa && o.adesso - fermoDa > SOGLIE.pausa_s * 1000) {
    return cambia('IN_PAUSA', { fermoDa });
  }

  // Fuori percorso, ma solo se ci si resta: un rimbalzo del GPS non deve far
  // ricalcolare il giro.
  const fuoriDa = o.scostamento > SOGLIE.deviazione_m ? (corrente.fuoriPercorsoDa ?? o.adesso) : null;
  if (fuoriDa && o.adesso - fuoriDa > SOGLIE.deviazione_s * 1000) {
    return cambia('DEVIATO', { fuoriPercorsoDa: fuoriDa, fermoDa });
  }

  const soglia = sogliaArrivo(tappa.ingresso?.livello, raggioEdificio);
  if (o.distanzaTappa <= soglia) return cambia('ALL_INGRESSO', { fermoDa, fuoriPercorsoDa: null });
  if (o.distanzaTappa <= SOGLIE.arrivo_m) return cambia('IN_ARRIVO', { fermoDa, fuoriPercorsoDa: null });
  return cambia('IN_CAMMINO', { fermoDa, fuoriPercorsoDa: fuoriDa });
}

/**
 * Durata onesta del giro: cammino PIU` ascolto.
 *
 * Dire solo il cammino sarebbe una bugia che si scopre alla terza tappa: 2 km
 * con dieci guide da tre minuti sono 25 minuti di passi e 30 di ascolto.
 * L'ascolto si stima dal testo a 150 parole al minuto, che e` il ritmo del
 * parlato calmo di una guida — non quello della lettura veloce.
 */
export const PAROLE_AL_MINUTO = 150;

export function durataAscolto(testo?: string | null): number {
  if (!testo) return 0;
  const parole = testo.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((parole / PAROLE_AL_MINUTO) * 60);
}

export function durataGiro(tappe: TappaGiro[], secondiCammino: number): {
  cammino_min: number; ascolto_min: number; totale_min: number;
} {
  const ascolto = tappe.reduce((s, t) => s + (t.durata_ascolto_s ?? durataAscolto(t.testo)), 0);
  return {
    cammino_min: Math.round(secondiCammino / 60),
    ascolto_min: Math.round(ascolto / 60),
    totale_min: Math.round((secondiCammino + ascolto) / 60),
  };
}

/**
 * Quante tappe stanno nel tempo che l'utente ha davvero.
 * E` la domanda rovesciata: invece di scegliere dieci tappe e scoprire che
 * servono tre ore, si dice "ho un'ora" e il giro si adatta.
 * Si aggiunge una tappa per volta finche` ci sta, tenendo conto del fatto che
 * ogni tappa aggiunge sia cammino sia ascolto.
 */
export function tappeCheCiStanno(
  tappe: TappaGiro[],
  minutiDisponibili: number,
  metriPerTappa = 450,
  velocitaMs = 1.35,
): number {
  let secondi = 0;
  for (let i = 0; i < tappe.length; i++) {
    const ascolto = tappe[i].durata_ascolto_s ?? durataAscolto(tappe[i].testo) ?? 180;
    const cammino = metriPerTappa / velocitaMs;
    if ((secondi + cammino + ascolto) / 60 > minutiDisponibili) return i;
    secondi += cammino + ascolto;
  }
  return tappe.length;
}

/**
 * Due tappe a pochi metri l'una dall'altra non sono due navigazioni: ci si
 * arriva una volta e si concatenano le guide. Senza questo, il navigatore
 * annuncerebbe un arrivo, poi una partenza e un altro arrivo nel giro di
 * quaranta metri — che dal vivo sembra un difetto, non una funzione.
 */
export function raggruppaTappeVicine(tappe: TappaGiro[]): TappaGiro[][] {
  const gruppi: TappaGiro[][] = [];
  for (const t of tappe) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo) {
      const p = ultimo[ultimo.length - 1];
      const pa = p.ingresso ?? p, ta = t.ingresso ?? t;
      const R = 6371000, rad = Math.PI / 180;
      const dLat = (ta.lat - pa.lat) * rad;
      const dLon = (ta.lon - pa.lon) * rad * Math.cos(((ta.lat + pa.lat) / 2) * rad);
      if (Math.sqrt(dLat * dLat + dLon * dLon) * R <= SOGLIE.tappe_unite_m) { ultimo.push(t); continue; }
    }
    gruppi.push([t]);
  }
  return gruppi;
}
