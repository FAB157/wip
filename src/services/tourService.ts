/**
 * DIECI TAPPE — l'orchestratore del giro.
 *
 * Tiene insieme tre cose che finora vivevano separate: la rotta multi-tappa
 * del server, la macchina a stati, e il direttore d'orchestra audio.
 *
 * PERCHE' UN SINGLETON E NON UNO STATO REACT. Il giro deve sopravvivere al
 * cambio di scheda e alla chiusura di una sheet — un utente che apre il
 * profilo a meta` percorso non deve perdere il giro. Stessa scelta gia` fatta
 * per locationService, per lo stesso motivo.
 *
 * LA BOZZA. Prima del giro c'e` la scelta delle tappe, e la scelta si fa da
 * due posti — la lista del radar e la mappa — che devono vedere la stessa
 * cosa. Per questo la selezione NON sta nello stato del pannello ma qui: chi
 * spunta dalla lista lo vede sulla mappa, chi toglie con la X sulla mappa lo
 * vede sparire dalla lista. E a ogni modifica il percorso si ricalcola, cosi`
 * si sceglie guardando il giro che ne esce, non un elenco astratto.
 *
 * IL GPS NON STA QUI. `aggiorna()` riceve i campioni da `lib/tour/giroDriver`,
 * che ascolta i fix di locationService: questo file decide, quello sente.
 */
import { Capacitor } from '@capacitor/core';
import { getApiUrl, apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import { saveOfflineAudio, getOfflineAudioUrl } from '../lib/offlineStorage';
import { postForAudioBlob } from '../lib/audioFetch';
import { getGuideCharacter, isCategoryAllowed, CHIAVI_NATIVO_AUDIOGUIDA } from '../lib/guideSettings';
import { getTranslation, linguaCorrente, type Language } from '../lib/i18n';
import {
  prossimoStato, durataAscolto, durataGiro, raggruppaTappeVicine, SOGLIE,
  type TappaGiro, type StatoCorrente, type StatoGiro, type LivelloIngresso,
} from '../lib/tour/tourState';
import { decidi, CodaVoci, VOLUME_ABBASSATO } from '../lib/tour/audioDirector';
import { istruzionePerStep } from './osrmService';
import { poiLungoIlCorridoio, type PoiLungoStrada } from '../lib/tour/corridoio';
import { getOrCreateAudioguideText } from './audioguideService';
import { azureVoiceName } from './ttsService';
import { locationService } from './locationService';

/** Il tetto delle tappe: decisione di prodotto, non tecnica. */
export const MAX_TAPPE = 10;
/**
 * IL PERCORSO DA «TUTTO NEL RAGGIO» (29/08/2026). Committente: le tappe
 * selezionate nel pannello diventano un percorso «senza vincolo delle dieci
 * tappe». Il tetto qui e` tecnico (la matrice OSRM), non di prodotto, ed e`
 * lo stesso del server (TOUR_MAX_TAPPE). Vale solo per le bozze marcate
 * `senzaLimite`; Dieci Tappe resta a dieci.
 */
export const MAX_TAPPE_ESTESO = 30;

/** Quanto si stima di ascoltare a una tappa di cui non si ha ancora il testo. */
const ASCOLTO_STIMATO_S = 180;
/** Cammino stimato fra due tappe quando il server non ha ancora dato le tratte. */
const CAMMINO_STIMATO_S = 450 / 1.35;
/** Entro questi metri dalla tappa tolta si cerca una sostituta. */
const RAGGIO_SOSTITUTA_M = 250;
/** Una proposta di sostituzione non resta in piedi per sempre. */
const PROPOSTA_VALIDA_MS = 120_000;

/**
 * Dove si chiude l'anello: al punto di partenza ORIGINALE (predefinito) o a
 * quello dell'ultimo ricalcolo. Vedi `GiroInCorso.partenzaOriginale`.
 */
export type RientroAnello = 'originale' | 'corrente';

/**
 * DUE FUNZIONI, DUE INGRESSI (03/09/2026, committente: «devono essere 2
 * funzioni diverse e attivate in modo diverso»).
 *  - 'giro'     — Dieci Tappe con audioguida: si compone dal radar (cuffie
 *                 accese), le tappe parlano, il navigatore multi-tappa vuole
 *                 il Day Pass.
 *  - 'percorso' — Percorso su misura: si compone dal tasto «Componi un
 *                 percorso», con i pin di QUALSIASI categoria (monumenti,
 *                 ristoranti, farmacie, parcheggi…); WIP ottimizza l'ordine e
 *                 il navigatore porta da una tappa all'altra. Nessuna
 *                 audioguida, nessun Day Pass: costa PRICING_LIST.custom_route
 *                 crediti, tre modifiche incluse, e NON si sospende quando le
 *                 cuffie sono spente — non ha niente a che fare con loro.
 * La bozza e il giro sono gli stessi oggetti (stessa mappa, stesso
 * navigatore, stesso cruscotto): cambia chi paga, che cosa parla e da dove
 * si entra. Il modo si decide alla composizione e viaggia col giro.
 */
export type ModoGiro = 'giro' | 'percorso';

/**
 * L'esito di «Ricalcola da qui» (03/09/2026): ogni valore ha una risposta
 * diversa — 'pass' apre la cassa, 'posizione' chiede il GPS, 'rete' dice di
 * riprovare, 'niente' = nessun giro o niente da rifare.
 */
export type EsitoRicalcolo = 'ok' | 'rete' | 'pass' | 'posizione' | 'niente';

export interface GiroInCorso {
  id: string;
  /** 'giro' (audioguida, Day Pass) o 'percorso' (su misura, a crediti). Assente = 'giro' (giri salvati prima del 03/09/2026). */
  modo?: ModoGiro;
  /** Id del percorso su misura sul server: e` la chiave con cui il server ricorda l'addebito e conta le modifiche. */
  percorsoId?: string;
  /** Modifiche (aggiungi/togli) gia` usate, come le conta il server. */
  modifiche?: number;
  modificheMax?: number;
  /**
   * METRI GIA` CAMMINATI prima dell'ultimo ricalcolo (03/09/2026). `metri` e`
   * la lunghezza del percorso CORRENTE (da dove si e` a fine giro) e dopo un
   * ricalcolo perdeva la strada fatta: «1,5 km mancanti · 1,5 km in tutto»
   * e barra a zero. Il totale onesto e` metriPercorsi + metri.
   */
  metriPercorsi?: number;
  tappe: TappaGiro[];
  /** Ordine deciso dal server: indici dentro `tappe`. Dopo un ricalcolo contiene SOLO le tappe ancora da fare. */
  ordine: number[];
  geometria: [number, number][];
  metri: number;
  minutiCammino: number;
  minutiAscolto: number;
  anello: boolean;
  /**
   * DUE PARTENZE, PERCHE' AD ANELLO SONO DUE COSE DIVERSE (28/08/2026).
   *
   * `partenzaOriginale` e` dove il giro e` cominciato: si fissa una volta e
   * non si tocca piu`. E` li` che stanno l'auto e l'albergo, ed e` quello che
   * uno intende dicendo «torno da dove parto».
   * `partenzaCorrente` e` il punto dell'ULTIMO ricalcolo — chi ha deviato o
   * saltato una tappa riparte da dove si trova, e puo` volere un anello che
   * si chiude li`.
   * Quale delle due sia la meta` la decide la preferenza dell'utente
   * (`preferenzaRientro`), e il punto scelto viaggia fino al server
   * (`rientro=lon,lat`): cosi` la linea disegnata e la meta` dichiarata dal
   * cruscotto sono sempre lo stesso posto.
   *
   * La tratta di ritorno esiste davvero — il server la calcola, `tratte` ne
   * ha una in piu`, metri e minuti la contano: senza questi campi il giro
   * dichiarava FINITO all'ultima tappa e l'ultimo chilometro restava senza
   * guida.
   */
  partenzaOriginale?: { lat: number; lon: number } | null;
  partenzaCorrente?: { lat: number; lon: number } | null;
  problemi: string[];
  /** Istruzioni per tratta, come le manda il server (dialetto OSRM). */
  tratte: any[];
  creatoIl: number;
  /** POI incontrati lungo la strada e gia` annunciati: una volta sola per giro. */
  incontri?: string[];
  /** Citta` del giro, se la sappiamo: serve al titolo quando lo si salva. */
  citta?: string | null;
  /** Nato da «Tutto nel raggio»: il tetto delle tappe vive e` MAX_TAPPE_ESTESO. */
  senzaLimite?: boolean;
}

export interface PropostaSostituta {
  tolta: TappaGiro;
  sostituta: TappaGiro;
  /** Distanza fra la tappa tolta e la sostituta. */
  metri: number;
  quando: number;
}

/**
 * L'esito del pre-scaricamento, contato davvero: quanti testi e quanti audio
 * sono in tasca, quante tappe restano scoperte. Prima il conteggio esisteva
 * ma non lo leggeva nessuno, e il banner non poteva dire "3 tappe senza
 * audio: riprova".
 */
export interface StatoPrescarico {
  inCorso: boolean;
  fatte: number;
  totali: number;
  testi: number;
  audio: number;
  /** Tappe senza audio (o senza testo): quelle che offline resterebbero mute. */
  mancanti: number;
  /** Quando e' finito l'ultimo giro di pre-scaricamento (0 = mai). */
  finitoIl: number;
}

export interface VistaGiro {
  stato: StatoGiro;
  /** Vedi ModoGiro: il cruscotto nasconde Riascolta e pre-scaricamento a un percorso senza audioguida. */
  modo: ModoGiro;
  modifiche: number;
  modificheMax: number;
  tappaCorrente: number;
  tappeFatte: number;
  tappeTotali: number;
  metriTotali: number;
  metriRimanenti: number;
  nomeTappa: string | null;
  /** La tappa DOPO questa, nell'ordine di cammino ("poi: Battistero"). */
  nomeProssima: string | null;
  /** Metri in linea d'aria dalla posizione nota alla porta della tappa. */
  metriAllaTappa: number | null;
  /** Coordinate della tappa corrente: il banner ci chiede il meteo. */
  tappaLat: number | null;
  tappaLon: number | null;
  /** Foto della tappa corrente (URL) per il cruscotto a display spento. */
  fotoTappa: string | null;
  istruzione: string | null;
  metriAllaSvolta: number | null;
  /** Tipo/verso della manovra OSRM (per la freccia della card in alto). */
  manovra: { type: string; modifier: string } | null;
  /** La prossima manovra e' un attraversamento e siamo a ridosso: il direttore audio tace. */
  suAttraversamento: boolean;
  inPausa: boolean;
  /** false = creato ma non ancora avviato: cruscotto e mappa mostrano «Avvia la navigazione». */
  avviato: boolean;
  /** "A 120 m c'e` X, lo metto al suo posto?" — null se non c'e` niente da proporre. */
  proposta: PropostaSostituta | null;
  prescarico: StatoPrescarico;
}

const PRESCARICO_VUOTO: StatoPrescarico = { inCorso: false, fatte: 0, totali: 0, testi: 0, audio: 0, mancanti: 0, finitoIl: 0 };

/**
 * La chiave dell'MP3 in IndexedDB e' la STESSA che legge PoiDetailSheet
 * (`${poiId}_${personaggio}`): chi apre la scheda di una tappa pre-scaricata
 * trova l'audio "posseduto" e lo suona senza rete e senza sapere che viene
 * da un giro. Prima la chiave era `giro_<id>_<tappa>_<lingua>` e nessuno la
 * leggeva: l'MP3 scaricato restava in IndexedDB e la scheda richiedeva il
 * TTS al server.
 */
export function chiaveAudioTappa(poiId: string | number, personaggio: string): string {
  return `${String(poiId)}_${personaggio}`;
}

/**
 * Il blob in IndexedDB, passando dalla funzione esistente di offlineStorage
 * (che accetta un URL): un object URL del blob e' un URL come un altro.
 */
async function salvaBlobAudio(blob: Blob, chiave: string): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  try { return await saveOfflineAudio(url, chiave); }
  finally { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
}

/** Manovre OSRM che sono un attraversamento (tipo, modificatore o nome della via). */
function stepEAttraversamento(s: any): boolean {
  if (!s) return false;
  const tipo = String(s?.maneuver?.type || '').toLowerCase();
  if (tipo.includes('crossing')) return true;
  const nome = String(s?.name || '').toLowerCase();
  if (/crossing|attraversamento|passage pi[eé]ton|paso de peatones|zebrastreifen|переход|人行横道/.test(nome)) return true;
  const inters: any[] = Array.isArray(s?.intersections) ? s.intersections : [];
  return inters.some(i => Array.isArray(i?.classes) && i.classes.some((c: any) => String(c).toLowerCase().includes('crossing')));
}

/**
 * La bozza: le tappe scelte ma non ancora camminate, col percorso d'anteprima.
 * `ordine` e` null finche` il server non ha risposto; `geometria` vuota vuol
 * dire "anteprima non disponibile" e chi disegna tira una linea dritta.
 */
export interface BozzaGiro {
  /** Giro con audioguida o percorso su misura: vedi ModoGiro. */
  modo: ModoGiro;
  /** Nell'ordine in cui l'utente le ha scelte — o trascinate, se ha riordinato a mano. */
  tappe: TappaGiro[];
  /** Ordine di cammino deciso dal server: indici dentro `tappe`. */
  ordine: number[] | null;
  geometria: [number, number][];
  metri: number;
  minutiCammino: number;
  /** Secondi di cammino per tratta, nell'ordine di cammino. */
  tratteSecondi: number[];
  problemi: string[];
  partenza: { lat: number; lon: number } | null;
  calcolando: boolean;
  /** 'PASS_RICHIESTO' | 'POSIZIONE' | altro messaggio; null se tutto bene. */
  errore: string | null;
  /**
   * Il PERCHE' del 402, come lo dice il server («nessun pass attivo»,
   * «verifica del pass non riuscita»…). Prima si perdeva per strada e il
   * pannello diceva sempre «attiva il Day Pass» — anche a chi il pass lo
   * aveva, verificato sul database (28/08/2026).
   */
  erroreDettaglio: string | null;
  /** L'utente ha trascinato le tappe: l'ordine e` il suo, il server non lo tocca. */
  ordineManuale: boolean;
  /** Bozza nata da «Tutto nel raggio»: tetto MAX_TAPPE_ESTESO invece di dieci. */
  senzaLimite?: boolean;
  /** "Ho un'ora": il giro si taglia alle tappe che ci stanno. null = nessun limite. */
  minutiDisponibili: number | null;
  /** Quante tappe, in ordine di cammino, stanno nel tempo. null = nessun limite. */
  tappeNelTempo: number | null;
  /** I POI che il giro sfiorerebbe, letti lungo il corridoio del tracciato: candidati ad aggiungersi. */
  lungoLaStrada: PoiLungoStrada[];
  cercandoLungoStrada: boolean;
  /**
   * Ad anello (si torna dove si e` partiti) o aperto (si finisce all'ultima
   * tappa). Era fisso ad anello; dal 22/08/2026 lo sceglie l'utente — chi ha
   * l'albergo dall'altra parte della citta` non vuole tornare indietro.
   * Preferenza, non selezione: sopravvive allo svuotamento come il tempo.
   */
  anello: boolean;
  /**
   * Ad anello, DOVE si torna: al punto di partenza originale o a quello
   * dell'ultimo ricalcolo. Sta qui solo perche' la UI possa leggerla dalla
   * bozza come legge `anello`; la verita` e` in `TourService.preferenzaRientro`,
   * che vale anche a giro gia` partito.
   */
  rientro: RientroAnello;
}

const CHIAVE_RIPRESA = 'wip_giro_in_corso';
const CHIAVE_ANELLO = 'wip_giro_anello';
/** 'originale' (predefinita) o 'corrente': dove si chiude l'anello. Vedi metaAnello. */
const CHIAVE_RIENTRO = 'wip_giro_rientro';
/**
 * La BOZZA sopravvive alla chiusura dell'app e allo spegnimento della guida
 * (28/08/2026). Perdere dieci tappe spuntate per un tocco sbagliato sul
 * bottone delle cuffie e` la stessa frustrazione di perdere un giro: si
 * salvano tappe, ordine, anello e tempo — non il percorso calcolato, che si
 * rifa` in mezzo secondo e dipende da dove si e` adesso.
 */
const CHIAVE_BOZZA = 'wip_giro_bozza';
const BOZZA_VUOTA: BozzaGiro = {
  modo: 'giro',
  tappe: [], ordine: null, geometria: [], metri: 0, minutiCammino: 0, tratteSecondi: [],
  problemi: [], partenza: null, calcolando: false, errore: null, erroreDettaglio: null,
  ordineManuale: false, minutiDisponibili: null, tappeNelTempo: null,
  lungoLaStrada: [], cercandoLungoStrada: false,
  anello: true, rientro: 'originale',
};
function leggiPreferenzaAnello(): boolean {
  try { return localStorage.getItem(CHIAVE_ANELLO) !== 'false'; } catch { return true; }
}
/** Predefinita: il punto di partenza ORIGINALE — e` li` che c'e` l'auto. */
function leggiPreferenzaRientro(): RientroAnello {
  try { return localStorage.getItem(CHIAVE_RIENTRO) === 'corrente' ? 'corrente' : 'originale'; } catch { return 'originale'; }
}

/** La bozza salvata, se c'e` ed e` di oggi. Solo la SELEZIONE, mai il percorso. */
function leggiBozzaSalvata(): Partial<BozzaGiro> | null {
  try {
    const grezzo = localStorage.getItem(CHIAVE_BOZZA);
    if (!grezzo) return null;
    const { tappe, minutiDisponibili, ordineManuale, senzaLimite, quando, modo } = JSON.parse(grezzo);
    // Una bozza di ieri non si riprende: si e` cambiata citta`, non idea.
    if (!Array.isArray(tappe) || tappe.length === 0 || Date.now() - Number(quando || 0) > 12 * 60 * 60 * 1000) {
      localStorage.removeItem(CHIAVE_BOZZA);
      return null;
    }
    const percorso = modo === 'percorso';
    return {
      modo: percorso ? 'percorso' : 'giro',
      tappe: tappe.filter((t: any) => t && Number.isFinite(Number(t.lat)) && Number.isFinite(Number(t.lon))).slice(0, senzaLimite || percorso ? MAX_TAPPE_ESTESO : MAX_TAPPE),
      minutiDisponibili: Number.isFinite(Number(minutiDisponibili)) ? Number(minutiDisponibili) : null,
      ordineManuale: !!ordineManuale,
      senzaLimite: !!senzaLimite,
    };
  } catch { return null; }
}

/**
 * QUANTO CI FIDIAMO DEL PUNTO D'INGRESSO.
 * `shared_pois` porta le coordinate dell'ingresso ma NON da dove vengono: la
 * provenienza sta nella tabella affiancata `poi_entrances`, che la RPC
 * `nearby_pois` non tocca (ha la lista colonne fissa). Finche' il livello non
 * viaggia fino al client, l'unica risposta onesta e' quella prudente.
 *
 * Prima qui c'era `'dichiarato'` fisso, e quindi la soglia d'arrivo piu'
 * stretta anche per un punto che potrebbe venire dal civico piu' vicino: si
 * diceva "sei arrivato" con la porta ancora a venti metri. `'civico'` allarga
 * la soglia di dieci metri — dieci metri di pazienza in piu' su un ingresso
 * certo costano nulla, dieci in meno su uno incerto costano l'arrivo sbagliato.
 */
function livelloIngresso(p: any): LivelloIngresso {
  const dichiarato = p?.entrance_level ?? p?.entrance_livello ?? p?.ingresso_livello;
  if (dichiarato === 'dichiarato' || dichiarato === 'civico' || dichiarato === 'indirizzo') return dichiarato;
  return 'civico';
}

/**
 * IL POI PUO` PARLARE? (29/08/2026). Regola del committente per il percorso
 * da «Tutto nel raggio»: «se ha l'audioguida la ascolti (o la paghi al volo
 * o col Day Pass), se non ce l'ha (ristorante ecc.) e` solo una tappa del
 * navigatore». La risposta e` la stessa dell'audioguida in cammino
 * (guideSettings.isCategoryAllowed) con TUTTI gli interruttori accesi: cosi`
 * un ristorante, una fontanella o un murale sono tappe mute, una gemma parla
 * qualunque sia la sua categoria.
 */
const TUTTO_ACCESO: Record<string, boolean> = Object.fromEntries([...CHIAVI_NATIVO_AUDIOGUIDA].map((k) => [k, true]));
export function puoParlare(p: any): boolean {
  return isCategoryAllowed({ category: p?.category || p?.poiType || p?.baseCategory || null, is_gem: p?.is_gem === true, premium: p?.premium === true }, TUTTO_ACCESO);
}

/** Da un POI qualsiasi (radar, mappa, scheda) alla tappa del giro. */
export function tappaDaPoi(p: any): TappaGiro {
  return {
    id: p.id ?? p.poiId,
    nome: p.name || p.nome || getTranslation('tour_tappa', linguaCorrente()),
    lat: Number(p.lat), lon: Number(p.lon),
    categoria: p.category || p.poiType || p.baseCategory || null,
    citta: p.city || p.citta || null,
    // Se il POI porta gia` un ingresso, e` li` che si arriva: la differenza
    // fra "sei arrivato" davanti a un muro e davanti a una porta.
    ingresso: (p.entrance_lat && p.entrance_lon)
      ? { lat: Number(p.entrance_lat), lon: Number(p.entrance_lon), livello: livelloIngresso(p) }
      : null,
    // Pranzo, pausa, trasferimento: tappe del percorso ma senza racconto.
    senzaGuida: p.senzaGuida === true || undefined,
    // La foto del luogo per il cruscotto a display spento. Solo se e' del POI
    // (niente ricerche per parola chiave: regola delle foto in CLAUDE.md).
    foto: (() => {
      const u = p.image_url || p.photo_url || p.imageUrl || p.foto || p.image || null;
      return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
    })(),
  };
}

class TourService {
  private giro: GiroInCorso | null = null;
  private stato: StatoCorrente = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: 0 };
  private coda = new CodaVoci();
  private ascoltatori = new Set<(v: VistaGiro | null) => void>();
  private pausaManuale = false;
  /**
   * AVVIO ESPLICITO (28/08/2026, committente: «deve avere un avvio
   * esplicito»). Il giro nasce PRONTO e fermo: tracciato e tappe sulla mappa,
   * cruscotto visibile, ma niente voce, niente svolte e niente geofence
   * nativi finche` l'utente non tocca «Avvia la navigazione». Chi compone un
   * giro al tavolino non vuole sentirsi dire «gira a sinistra» da seduto.
   */
  private avviato = true;
  private proposta: PropostaSostituta | null = null;

  private preferenzaRientro: RientroAnello = leggiPreferenzaRientro();
  private bozzaStato: BozzaGiro = { ...BOZZA_VUOTA, anello: leggiPreferenzaAnello(), rientro: leggiPreferenzaRientro(), ...(leggiBozzaSalvata() || {}) };
  /**
   * GUIDA SPENTA = GIRO SOSPESO, NON CHIUSO (28/08/2026).
   *
   * Spegnere le cuffie non e` «termina»: e` «adesso non mi seguire». Il giro
   * sparisce dalla mappa e dal cruscotto, non consuma piu` niente (niente
   * campioni GPS, niente ricalcoli, niente voce), ma resta intero — tappe,
   * fatte, ordine, anello, tappa corrente — e riappare identico quando si
   * riaccende la guida. Chi vuole davvero chiudere ha la X rossa: `termina()`.
   */
  private sospeso = false;
  private ascoltatoriBozza = new Set<(b: BozzaGiro) => void>();
  private bozzaVersione = 0;
  private bozzaTimer: ReturnType<typeof setTimeout> | null = null;
  /** Senza pass il server rifiuta l'anteprima: non ha senso richiederla a ogni tocco. */
  private passMancante = false;
  /** Il motivo dell'ultimo 402, per dirlo all'utente invece di «attiva il pass». */
  private passMotivo: string | null = null;

  /**
   * I POI che il radar conosce attorno all'utente. Li passa l'app (sono i
   * radarPois filtrati per le categorie del GeoControl). Servono a due cose:
   * proporre una sostituta quando si toglie una tappa, e annunciare gli
   * incontri lungo la strada.
   */
  private candidati: any[] = [];
  /**
   * I POI letti lungo il corridoio del giro in corso (lib/tour/corridoio):
   * cio` che il radar non vede ancora perche' sta oltre la sua finestra. Si
   * sommano ai candidati per incontri e sostitute.
   */
  private corridoio: PoiLungoStrada[] = [];
  /** Cache dei candidati vicini al percorso: si rifa` quando cambia percorso o lista. */
  private lungoIlPercorsoCache: { chiave: string; lista: { poi: any; id: string }[] } | null = null;

  /** L'ultima posizione vista da `aggiorna`: serve al ricalcolo quando nessuno ne passa una. */
  private ultimaPosizione: { lat: number; lon: number } | null = null;
  /**
   * Percorso su misura: il prossimo ricalcolo e` una modifica voluta
   * dall'utente (aggiungi/togli), da dichiarare al server. Si consuma in
   * `ricalcola`. I ricalcoli da deviazione, da tappa fatta o saltata non lo
   * accendono: non sono modifiche, e non si pagano.
   */
  private modificaPendente = false;
  /**
   * IL NAVIGATORE DEL GIRO. Le tratte OSRM arrivano dal server con gli step
   * (le manovre), ma fino al 22/08/2026 nessuno le leggeva: vista() tornava
   * istruzione null e il giro camminava muto fra una tappa e l'altra.
   * `passoCorrente` e` l'indice dello step della tratta corrente la cui
   * manovra e` la prossima davanti a noi; si azzera a ogni tappa e ricalcolo.
   */
  private lingua = 'it';
  private passoCorrente = 0;
  private tappaDelPasso = -1;
  private navAttuale: { istruzione: string | null; metri: number | null; attraversamento: boolean; manovra: { type: string; modifier: string } | null } = { istruzione: null, metri: null, attraversamento: false, manovra: null };
  private ultimoRicalcoloDeviazione = 0;
  private posizioneCache: { p: { lat: number; lon: number }; ts: number } | null = null;
  private prescarico: StatoPrescarico = { ...PRESCARICO_VUOTO };
  /** L'ultima tappa a cui si e' arrivati (per "Riascolta"), anche dopo averla completata. */
  private ultimaTappaArrivata: TappaGiro | null = null;
  /** Id gia' assegnato dal salvataggio: Salva e Condividi ravvicinati non devono fare due righe. */
  private idSalvato: string | null = null;

  // ── BOZZA: la scelta delle tappe ─────────────────────────────────────────

  /**
   * Sospende (guida spenta) o riprende (guida accesa) il giro e la bozza.
   * Non tocca MAI la selezione: sospendere e` una questione di attenzione,
   * non di contenuto. Riprendendo, se nel frattempo ci si e` spostati lontano
   * dal tracciato, il percorso si rifa` da dove si e` — con le stesse tappe e
   * le stesse fatte, dallo stesso ricalcolo delle deviazioni.
   */
  sospendi(sospeso: boolean) {
    if (this.sospeso === sospeso) return;
    this.sospeso = sospeso;
    if (sospeso) {
      this.coda.svuota();
      // Sul telefono le tappe non devono restare geofence prioritari mentre
      // la guida e` spenta: il servizio nativo si sveglierebbe per niente.
      if (this.giro && Capacitor.isNativePlatform()) {
        try { locationService.unsyncTappeGiroFromNative(); } catch { /* best-effort */ }
      }
    }
    this.avvisa();
    this.avvisaBozza();
    if (!sospeso) {
      if (this.giro && this.avviato) { this.sincronizzaTappeNative(); void this.riallineaDopoLaSospensione(); }
      // Bozza ripescata da localStorage (o rimasta da prima): l'anteprima si
      // rifa` adesso, che c'e` di nuovo qualcuno a guardarla.
      else if (this.bozzaStato.tappe.length > 0 && !this.bozzaStato.ordine) this.programmaAnteprima();
    }
  }
  /**
   * Sospeso = cuffie spente. Ma il PERCORSO SU MISURA con le cuffie non ha
   * niente a che fare (03/09/2026): non ha audioguide da tacere, e chi lo ha
   * pagato lo vuole vedere e seguire anche con la guida spenta. Per lui la
   * sospensione non esiste — ne' per il giro in corso ne' per la bozza.
   */
  eSospeso(): boolean { return this.sospeso && !this.ePercorso(); }

  /** Guida riaccesa lontano dal tracciato: si rifa` la strada, non il giro. */
  private async riallineaDopoLaSospensione() {
    const giro = this.giro;
    if (!giro || this.sospeso) return;
    try {
      const pos = await this.posizioneAttuale();
      if (!pos || !this.giro || this.giro.id !== giro.id || this.sospeso) return;
      // 300 m: sotto, la linea disegnata e` ancora quella giusta e un
      // ricalcolo sarebbe solo una chiamata di rete in piu`.
      if (this.scostamentoDalPercorso(pos) < 300) return;
      await this.ricalcola(pos);
    } catch { /* senza rete si riprende con il percorso che c'era */ }
  }

  bozza(): BozzaGiro { return this.bozzaStato; }
  bozzaHa(id: string | number): boolean { return this.bozzaStato.tappe.some(t => String(t.id) === String(id)); }
  /** Il tetto della bozza: dieci, o trenta se nata da «Tutto nel raggio» o se e` un percorso su misura. */
  bozzaTetto(): number { return this.bozzaStato.senzaLimite || this.bozzaStato.modo === 'percorso' ? MAX_TAPPE_ESTESO : MAX_TAPPE; }
  /** Il tetto delle tappe vive del giro in corso (o della bozza, se non c'e` giro). */
  tettoTappe(): number {
    const g = this.giro;
    if (g) return g.senzaLimite || g.modo === 'percorso' ? MAX_TAPPE_ESTESO : MAX_TAPPE;
    return this.bozzaTetto();
  }
  bozzaPiena(): boolean { return this.bozzaStato.tappe.length >= this.bozzaTetto(); }

  /** Posizione della tappa nel giro (1-based): l'ordine del server se c'e`, altrimenti quello di scelta. */
  bozzaNumero(id: string | number): number | null {
    const b = this.bozzaStato;
    const i = b.tappe.findIndex(t => String(t.id) === String(id));
    if (i < 0) return null;
    if (b.ordine) { const pos = b.ordine.indexOf(i); if (pos >= 0) return pos + 1; }
    return i + 1;
  }

  /** Le tappe della bozza nell'ordine in cui si cammineranno. */
  bozzaSequenza(): TappaGiro[] {
    const b = this.bozzaStato;
    const idx = b.ordine && b.ordine.length === b.tappe.length ? b.ordine : b.tappe.map((_, i) => i);
    return idx.map(i => b.tappe[i]).filter(Boolean);
  }

  /** Aggiunge (o toglie, se c'e` gia`) una tappa. Torna false se il giro e` pieno. */
  bozzaAlterna(poi: any): boolean {
    const id = poi?.id ?? poi?.poiId;
    if (id == null) return false;
    if (this.bozzaHa(id)) { this.bozzaTogli(id); return true; }
    return this.bozzaAggiungi(poi);
  }

  bozzaAggiungi(poi: any): boolean {
    // In un percorso su misura NESSUNA tappa parla: e` un navigatore, non un
    // racconto. Anche un monumento con l'audioguida entra muto.
    const t = tappaDaPoi(this.bozzaStato.modo === 'percorso' ? { ...poi, senzaGuida: true } : poi);
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lon)) return false;
    if (this.bozzaHa(t.id)) return true;
    if (this.bozzaPiena()) return false;
    this.bozzaStato = { ...this.bozzaStato, tappe: [...this.bozzaStato.tappe, t], errore: null };
    this.programmaAnteprima();
    return true;
  }

  /** La X sulla mappa o in lista: la tappa esce e il percorso si rifa`. */
  bozzaTogli(id: string | number) {
    if (!this.bozzaHa(id)) return;
    const tappe = this.bozzaStato.tappe.filter(t => String(t.id) !== String(id));
    this.bozzaStato = { ...this.bozzaStato, tappe, errore: null };
    this.programmaAnteprima();
  }

  /**
   * L'utente ha trascinato le tappe: da qui in poi l'ordine e` il suo. WIP Nav
   * ordina per camminare meno, ma la gente ha ragioni che l'algoritmo non sa
   * ("il museo chiude alle 18, prima quello"). Si passa al server con
   * `ordina=false` e le tratte si calcolano nella sequenza data.
   */
  bozzaRiordina(ids: (string | number)[]) {
    const per = new Map(this.bozzaStato.tappe.map(t => [String(t.id), t]));
    const tappe = ids.map(id => per.get(String(id))).filter(Boolean) as TappaGiro[];
    // Tappe che l'elenco non nomina (non dovrebbe succedere) restano in coda.
    for (const t of this.bozzaStato.tappe) if (!tappe.includes(t)) tappe.push(t);
    this.bozzaStato = { ...this.bozzaStato, tappe, ordineManuale: true, errore: null };
    this.programmaAnteprima();
  }

  /** Ad anello o aperto: si ricalcola l'anteprima e si ricorda la scelta. */
  bozzaImpostaAnello(anello: boolean) {
    if (this.bozzaStato.anello === anello) return;
    this.bozzaStato = { ...this.bozzaStato, anello, errore: null };
    try { localStorage.setItem(CHIAVE_ANELLO, anello ? 'true' : 'false'); } catch {}
    this.programmaAnteprima();
  }

  /**
   * DOVE SI TORNA, ad anello: al punto di partenza originale o a quello
   * dell'ultimo ricalcolo. E` una preferenza come `anello` — sopravvive allo
   * svuotamento e al riavvio — e vale ANCHE A GIRO GIA` PARTITO: cambiandola
   * il rientro cambia meta` senza rifare il giro da capo. Le tappe fatte, le
   * escluse e l'ordine restano quelli.
   */
  impostaRientro(rientro: RientroAnello) {
    if (this.preferenzaRientro === rientro) return;
    this.preferenzaRientro = rientro;
    try { localStorage.setItem(CHIAVE_RIENTRO, rientro); } catch {}
    this.bozzaStato = { ...this.bozzaStato, rientro };
    this.avvisaBozza();
    // Sulla bozza non cambia niente finche` non si e` ricalcolato almeno una
    // volta (partenza originale e corrente coincidono). Sul giro in corso si`.
    const giro = this.giro;
    if (!giro || !giro.anello || this.eSospeso()) { this.avvisa(); return; }
    if (this.tappaCorrente()) void this.ricalcola();
    else void this.ricalcolaRientro();
  }

  /**
   * Tappe tutte fatte, si sta gia` tornando, e l'utente cambia la meta`: non
   * c'e` niente da riordinare, c'e` una tratta sola da rifare. Si chiede al
   * server la strada da dove si e` al nuovo punto di rientro (una tappa =
   * gratis, nessun pass in ballo) e si sostituisce l'ultima tratta, cosi` la
   * linea sulla mappa e i metri rimanenti restano veri.
   */
  private async ricalcolaRientro(posizione?: { lat: number; lon: number }): Promise<boolean> {
    const giro = this.giro;
    if (!giro || !giro.anello) return false;
    const meta = this.puntoDiRientro();
    if (!meta) return false;
    const partenza = posizione ?? this.ultimaPosizione ?? await this.posizioneAttuale();
    if (!partenza || this.giro !== giro) return false;
    try {
      const finta: TappaGiro = { id: '__rientro__', nome: '', lat: meta.lat, lon: meta.lon, categoria: null, citta: null, ingresso: null };
      const { dati } = await this.chiediRotta([finta], { partenza, anello: false, ordina: false });
      if (this.giro !== giro) return false;
      const leg = dati.routes?.[0]?.legs?.[0];
      if (!leg) return false;
      giro.geometria = (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]]);
      this.ultimoIndiceSnap = 0;
      // `tappaCorrente` (indice) e` gia` oltre l'ultima tappa: la tratta di
      // rientro deve stare proprio li`, altrimenti navigatore e metri
      // rimanenti leggerebbero un buco.
      const i = this.stato.tappaCorrente;
      giro.tratte = [...giro.tratte.slice(0, i), leg];
      // `metri` NON si tocca: e` il totale del giro, cioe` il denominatore
      // della barra di avanzamento. Cambiarlo qui farebbe saltare indietro
      // l'avanzamento a giro quasi finito.
      this.passoCorrente = 0; this.tappaDelPasso = -1;
      this.navAttuale = { istruzione: null, metri: null, attraversamento: false, manovra: null };
      this.salva();
      this.avvisa();
      return true;
    } catch { /* senza rete si tiene la linea che c'era; la meta` e` gia` cambiata */ }
    this.avvisa();
    return false;
  }

  /** "Riordina per me": si torna all'ordine che fa camminare meno. */
  bozzaOrdineAutomatico() {
    if (!this.bozzaStato.ordineManuale) return;
    this.bozzaStato = { ...this.bozzaStato, ordineManuale: false, errore: null };
    this.programmaAnteprima();
  }

  /**
   * "Ho un'ora." Il conto e` cammino PIU` ascolto, tappa per tappa nell'ordine
   * di cammino, finche` ci sta. Non si toglie niente dalla bozza: si dice
   * quante ne entrano, e il giro parte con quelle. Nessuna chiamata al server:
   * le tratte ci sono gia`.
   */
  bozzaImpostaTempo(minuti: number | null) {
    const minutiDisponibili = minuti && minuti > 0 ? Math.round(minuti) : null;
    this.bozzaStato = { ...this.bozzaStato, minutiDisponibili };
    this.bozzaStato.tappeNelTempo = this.contaTappeNelTempo(this.bozzaStato);
    this.avvisaBozza();
  }

  private contaTappeNelTempo(b: BozzaGiro): number | null {
    if (!b.minutiDisponibili) return null;
    const sequenza = (b.ordine && b.ordine.length === b.tappe.length ? b.ordine : b.tappe.map((_, i) => i))
      .map(i => b.tappe[i]).filter(Boolean);
    const tetto = b.minutiDisponibili * 60;
    /**
     * AD ANELLO IL RITORNO STA NEL BUDGET (28/08/2026). «Ho due ore» deve
     * comprendere anche la strada per tornare dove si e` partiti: contare
     * solo l'andata vuol dire promettere due ore e consegnarne due e venti.
     * Se si taglia all'ultima tappa il ritorno vero ce l'abbiamo (e` l'ultima
     * tratta che il server ha mandato); tagliando prima non esiste ancora, e
     * si STIMA dalla linea d'aria maggiorata del 30% a 1,35 m/s — la stessa
     * approssimazione che il server usa per le tratte irraggiungibili.
     */
    const rientro = (i: number): number => {
      if (!b.anello || !b.partenza) return 0;
      if (i === sequenza.length - 1 && b.tratteSecondi.length > sequenza.length) return b.tratteSecondi[sequenza.length] || 0;
      const t = sequenza[i];
      const p = t.ingresso ?? { lat: t.lat, lon: t.lon };
      return (metri(b.partenza, p) * 1.3) / 1.35;
    };
    let secondi = 0;
    for (let i = 0; i < sequenza.length; i++) {
      const cammino = b.tratteSecondi[i] ?? CAMMINO_STIMATO_S;
      const ascolto = sequenza[i].durata_ascolto_s ?? durataAscolto(sequenza[i].testo) ?? ASCOLTO_STIMATO_S;
      if (secondi + cammino + (ascolto || ASCOLTO_STIMATO_S) + rientro(i) > tetto) return i;
      secondi += cammino + (ascolto || ASCOLTO_STIMATO_S);
    }
    return sequenza.length;
  }

  bozzaSvuota() {
    this.bozzaVersione++;
    if (this.bozzaTimer) { clearTimeout(this.bozzaTimer); this.bozzaTimer = null; }
    // Il tempo scelto si tiene: e` una preferenza, non parte della selezione.
    // Anche il MODO: svuotare un percorso su misura non lo trasforma in un giro.
    this.bozzaStato = { ...BOZZA_VUOTA, modo: this.bozzaStato.modo, minutiDisponibili: this.bozzaStato.minutiDisponibili, anello: this.bozzaStato.anello, rientro: this.bozzaStato.rientro };
    this.avvisaBozza();
  }

  // ── PERCORSO SU MISURA: il modo della bozza ──────────────────────────────

  /**
   * Da quale tasto si e` entrati: il radar (giro con audioguida) o «Componi
   * un percorso». Le due funzioni condividono la bozza, quindi cambiare modo
   * con dei luoghi gia` scelti li svuota — sono selezioni di due prodotti
   * diversi, con prezzi e regole diverse, e mescolarle sarebbe un inganno.
   * Ritorna false se il cambio avrebbe svuotato una selezione e il chiamante
   * ha chiesto di NON farlo (`senzaSvuotare`): tocca a lui chiedere conferma.
   */
  bozzaImpostaModo(modo: ModoGiro, opzioni: { senzaSvuotare?: boolean } = {}): boolean {
    if (this.bozzaStato.modo === modo) return true;
    if (this.bozzaStato.tappe.length > 0) {
      if (opzioni.senzaSvuotare) return false;
      this.bozzaSvuota();
    }
    this.bozzaStato = { ...this.bozzaStato, modo, errore: null, erroreDettaglio: null };
    this.avvisaBozza();
    return true;
  }

  modoBozza(): ModoGiro { return this.bozzaStato.modo; }

  /** C'e` un percorso su misura in mano (in corso o in composizione)? */
  ePercorso(): boolean {
    if (this.giro) return this.giro.modo === 'percorso';
    return this.bozzaStato.modo === 'percorso';
  }

  /**
   * «Ho delle tappe ma non ho un percorso»: si calcola adesso. Serve alla
   * bozza ripescata da localStorage all'avvio — senza, resterebbe disegnata
   * in linea d'aria per sempre e senza spiegazione, che e` esattamente il
   * caso segnalato dall'utente il 28/08/2026.
   */
  /**
   * «Il pass ce l'ho, riprova» (28/08/2026, collaudo). `passMancante` si
   * accendeva al primo 402 e si spegneva solo su «Crea giro»: se quel 402 era
   * un guasto della VERIFICA (chiave vecchia sul server) e non un pass
   * assente, il pannello restava inchiodato sull'invito ad attivare un pass
   * gia` pagato. Qui si azzera e si richiede l'anteprima.
   */
  riprovaPass() {
    this.passMancante = false;
    this.passMotivo = null;
    this.programmaAnteprima();
  }

  /**
   * UN GIORNO D'ITINERARIO NEL RADAR (28/08/2026). Committente: «dall'itinerario,
   * se si clicca audioguida, si riporta l'itinerario di quel giorno nel radar
   * della mappa come se fosse un giro Dieci Tappe». La bozza si svuota e si
   * riempie con le tappe del giorno, nell'ordine del piano, fino al tetto: da
   * li` in poi e` un giro come gli altri — tracciato, aggiunte lungo la
   * strada, X sui pin, «Crea il giro». Ritorna quante tappe sono entrate.
   */
  bozzaDaTappe(poi: any[], opzioni: { senzaLimite?: boolean; ordinaServer?: boolean } = {}): number {
    this.bozzaSvuota();
    // «Tutto nel raggio» (29/08/2026): niente vincolo delle dieci tappe, e le
    // tappe che non hanno un'audioguida (ristoranti, fontanelle, murales)
    // entrano MUTE — tappe del navigatore, non del racconto.
    if (opzioni.senzaLimite) this.bozzaStato = { ...this.bozzaStato, senzaLimite: true };
    let n = 0;
    const tetto = this.bozzaTetto();
    for (const p of poi) {
      if (n >= tetto) break;
      const conVoce = opzioni.senzaLimite ? puoParlare(p) : p?.senzaGuida !== true;
      if (this.bozzaAggiungi(conVoce ? p : { ...p, senzaGuida: true })) n++;
    }
    // L'ordine del piano e` una scelta dell'autore: il server non lo tocca.
    // Le tappe scelte dal pannello invece non hanno un ordine: lo decide il server.
    if (n > 1 && !opzioni.ordinaServer) this.bozzaStato = { ...this.bozzaStato, ordineManuale: true };
    this.programmaAnteprima();
    return n;
  }

  anteprimaSeManca() {
    const b = this.bozzaStato;
    if (this.sospeso || b.tappe.length === 0 || b.calcolando) return;
    if (b.ordine && b.geometria.length > 1) return;
    this.programmaAnteprima();
  }

  ascoltaBozza(fn: (b: BozzaGiro) => void) { this.ascoltatoriBozza.add(fn); return () => { this.ascoltatoriBozza.delete(fn); }; }

  /**
   * L'anteprima si ricalcola con un piccolo ritardo: chi spunta tre tappe di
   * fila non deve generare tre richieste, e l'ultima e` l'unica che conta.
   */
  private programmaAnteprima() {
    const mia = ++this.bozzaVersione;
    if (this.bozzaTimer) clearTimeout(this.bozzaTimer);
    // Lo stato "in calcolo" si mostra subito, ma il vecchio percorso resta
    // disegnato finche` non arriva il nuovo: una mappa che si svuota e si
    // riempie a ogni tocco sembra rotta.
    this.bozzaStato = { ...this.bozzaStato, calcolando: this.bozzaStato.tappe.length > 0 };
    this.avvisaBozza();
    if (this.bozzaStato.tappe.length === 0) {
      this.bozzaStato = { ...BOZZA_VUOTA, modo: this.bozzaStato.modo, minutiDisponibili: this.bozzaStato.minutiDisponibili, anello: this.bozzaStato.anello, rientro: this.bozzaStato.rientro };
      this.avvisaBozza();
      return;
    }
    this.bozzaTimer = setTimeout(() => { this.bozzaTimer = null; this.calcolaAnteprima(mia); }, 500);
  }

  private async calcolaAnteprima(mia: number) {
    const tappe = this.bozzaStato.tappe;
    const partenza = await this.posizioneAttuale();
    if (mia !== this.bozzaVersione) return;
    if (!partenza) {
      this.bozzaStato = { ...this.bozzaStato, partenza: null, ordine: null, geometria: [], tratteSecondi: [], calcolando: false, errore: 'POSIZIONE' };
      this.bozzaStato.tappeNelTempo = this.contaTappeNelTempo(this.bozzaStato);
      this.avvisaBozza();
      return;
    }
    // Dal 28/08/2026 l'ANTEPRIMA e` gratuita e questo ramo non dovrebbe piu`
    // scattare: il 402 arriva solo su «Crea giro». Resta come rete di
    // sicurezza per i client che parlano con un server non ancora aggiornato
    // (ne girano di installati): li` il 402 torna anche in anteprima, e
    // ricevuto una volta si smette di chiedere — la selezione continua a
    // funzionare, con la linea dritta al posto del percorso e la pillola
    // `gr_linea_stimata_pass` a dire perche'.
    if (this.passMancante && tappe.length > 1 && this.bozzaStato.modo !== 'percorso') {
      this.bozzaStato = { ...this.bozzaStato, partenza, ordine: null, geometria: [], tratteSecondi: [], calcolando: false, errore: 'PASS_RICHIESTO', erroreDettaglio: this.passMotivo };
      this.bozzaStato.tappeNelTempo = this.contaTappeNelTempo(this.bozzaStato);
      this.avvisaBozza();
      return;
    }
    try {
      const { g, dati } = await this.chiediRotta(tappe, { partenza, anello: this.bozzaStato.anello, ordina: !this.bozzaStato.ordineManuale, anteprima: true });
      if (mia !== this.bozzaVersione) return;
      this.bozzaStato = {
        ...this.bozzaStato,
        partenza,
        ordine: g.ordine,
        geometria: (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]] as [number, number]),
        metri: g.metri_totali,
        minutiCammino: g.minuti_cammino,
        tratteSecondi: (dati.routes?.[0]?.legs || []).map((l: any) => Number(l?.duration) || 0),
        problemi: g.problemi || [],
        calcolando: false,
        errore: null,
        erroreDettaglio: null,
      };
      // Col tracciato in mano si guarda cosa c'e` lungo la strada. In
      // parallelo: l'anteprima non aspetta il database.
      void this.cercaLungoLaStradaBozza(mia);
    } catch (e: any) {
      if (mia !== this.bozzaVersione) return;
      const m = String(e?.message || '');
      const pass = m.startsWith('PASS_RICHIESTO');
      if (pass) { this.passMancante = true; this.passMotivo = m.slice('PASS_RICHIESTO:'.length).trim() || null; }
      this.bozzaStato = {
        ...this.bozzaStato, partenza, ordine: null, geometria: [], metri: 0, minutiCammino: 0, tratteSecondi: [],
        calcolando: false, errore: pass ? 'PASS_RICHIESTO' : (m || 'anteprima non disponibile'),
        erroreDettaglio: pass ? this.passMotivo : null,
      };
    }
    this.bozzaStato.tappeNelTempo = this.contaTappeNelTempo(this.bozzaStato);
    this.avvisaBozza();
  }

  /**
   * I POI lungo il corridoio dell'anteprima: quelli che il giro sfiorerebbe
   * senza fermarsi. Si mostrano nel radar con un "+", perche' e` ADESSO —
   * prima di partire, con l'ordine ancora aperto — che ha senso aggiungerli.
   * 80 m e non 40: qui si propone, in cammino si annuncia.
   */
  private async cercaLungoLaStradaBozza(mia: number) {
    const b = this.bozzaStato;
    if (b.geometria.length < 2) return;
    this.bozzaStato = { ...this.bozzaStato, cercandoLungoStrada: true };
    this.avvisaBozza();
    let trovati: PoiLungoStrada[] = [];
    try {
      trovati = await poiLungoIlCorridoio(b.geometria, { entro: 80, escludi: new Set(b.tappe.map(t => String(t.id))) });
    } catch { /* senza rete si resta con quello che il radar vede */ }
    if (mia !== this.bozzaVersione) return;
    this.bozzaStato = { ...this.bozzaStato, lungoLaStrada: trovati, cercandoLungoStrada: false };
    this.avvisaBozza();
  }

  /** Lo stesso per il giro in corso: alimenta incontri e sostitute da subito. */
  private async cercaLungoLaStradaGiro() {
    const giro = this.giro;
    if (!giro || giro.geometria.length < 2) return;
    const id = giro.id, metri = giro.metri;
    try {
      const trovati = await poiLungoIlCorridoio(giro.geometria, { entro: 60, escludi: new Set(giro.tappe.map(t => String(t.id))) });
      // Nel frattempo il giro puo` essere finito o ricalcolato: si scarta.
      if (this.giro?.id !== id || this.giro.metri !== metri) return;
      this.corridoio = trovati;
      this.lungoIlPercorsoCache = null;
    } catch { /* il radar continua a fornire i suoi */ }
  }

  /**
   * Dalla bozza al giro vero. La bozza si svuota solo se il giro parte.
   * Col tempo impostato partono solo le tappe che ci stanno, nell'ordine di
   * cammino: le altre l'utente le ha viste segnate "fuori tempo" sulla mappa.
   */
  async avviaDaBozza(): Promise<GiroInCorso> {
    let tappe = this.bozzaSequenza();
    const n = this.bozzaStato.tappeNelTempo;
    if (n != null && n < tappe.length) tappe = tappe.slice(0, Math.max(1, n));
    if (tappe.length === 0) throw new Error('nessuna tappa');
    const partenza = await this.posizioneAttuale(true);
    if (!partenza) throw new Error('Non riesco a sapere dove sei: serve la posizione per costruire il giro.');
    // Si ritenta sempre il server: il pass puo` essere stato attivato nel frattempo.
    this.passMancante = false;
    // La sequenza e` gia` in ordine di cammino (del server o dell'utente):
    // si passa com'e`, cosi` il giro e` quello che si e` visto in anteprima.
    // CREARE IL GIRO E` GRATIS (29/08/2026, committente: «il crea giro puo'
    // essere gratis e la funzione navigatore solo col Day Pass»). Qui si
    // chiede la rotta in ANTEPRIMA — percorso, ordine, metri, minuti, senza
    // le svolte — che il server da` a chiunque sia loggato. Il Day Pass lo
    // si chiede in avvia(), quando servono le istruzioni: prima, chi non
    // aveva il pass (o a cui il server non lo riconosceva) non vedeva mai
    // il tasto verde e restava con una bozza in mano.
    // PERCORSO SU MISURA: qui si PAGA (03/09/2026). Niente anteprima e niente
    // Day Pass: si chiede subito la rotta completa con le svolte, il server
    // scala i crediti (PRICING_LIST.custom_route) e ricorda l'id del percorso
    // per contare le modifiche. Se i crediti non bastano l'errore
    // CREDITI_INSUFFICIENTI risale al pannello, che offre la ricarica.
    const percorso = this.bozzaStato.modo === 'percorso';
    const giro = await this.crea(tappe, {
      partenza,
      anello: this.bozzaStato.anello,
      ordina: false,
      senzaLimite: !!this.bozzaStato.senzaLimite || percorso,
      anteprima: !percorso,
      percorso: percorso ? { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` } : undefined,
    });
    this.bozzaSvuota();
    // Il percorso ha gia` le svolte: parte subito, senza il secondo tasto.
    if (percorso) await this.avvia();
    return giro;
  }

  // ── GIRO ─────────────────────────────────────────────────────────────────

  /** Crea il giro: chiede l'ordine al server e prepara le tappe. */
  async crea(tappe: TappaGiro[], opzioni: { anello?: boolean; ordina?: boolean; partenza: { lat: number; lon: number }; senzaLimite?: boolean; anteprima?: boolean; percorso?: { id: string } }): Promise<GiroInCorso> {
    if (tappe.length === 0) throw new Error('nessuna tappa');
    const tetto = opzioni.senzaLimite ? MAX_TAPPE_ESTESO : MAX_TAPPE;
    if (tappe.length > tetto) throw new Error(opzioni.senzaLimite ? `il percorso accetta al massimo ${MAX_TAPPE_ESTESO} tappe` : 'il giro accetta al massimo dieci tappe');

    const { g, dati } = await this.chiediRotta(tappe, opzioni);

    const giro: GiroInCorso = {
      id: `giro-${Date.now()}`,
      modo: opzioni.percorso ? 'percorso' : 'giro',
      percorsoId: opzioni.percorso?.id,
      modifiche: Number(g?.percorso?.modifiche) || 0,
      modificheMax: Number(g?.percorso?.max) || undefined,
      tappe: tappe.map(t => ({ ...t, durata_ascolto_s: t.durata_ascolto_s ?? durataAscolto(t.testo) })),
      ordine: g.ordine,
      geometria: (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]]),
      metri: g.metri_totali,
      minutiCammino: g.minuti_cammino,
      minutiAscolto: 0,
      anello: g.anello,
      partenzaOriginale: { lat: opzioni.partenza.lat, lon: opzioni.partenza.lon },
      partenzaCorrente: { lat: opzioni.partenza.lat, lon: opzioni.partenza.lon },
      problemi: g.problemi || [],
      tratte: dati.routes?.[0]?.legs || [],
      creatoIl: Date.now(),
      incontri: [],
      citta: tappe.map(t => t.citta).find(Boolean) || null,
      senzaLimite: !!opzioni.senzaLimite,
    };
    const d = durataGiro(giro.tappe, g.minuti_cammino * 60);
    giro.minutiAscolto = d.ascolto_min;

    this.giro = giro;
    this.ultimoIndiceSnap = 0;
    this.proposta = null;
    this.pausaManuale = false;
    this.corridoio = [];
    this.lungoIlPercorsoCache = null;
    this.prescarico = { ...PRESCARICO_VUOTO };
    this.ultimaTappaArrivata = null;
    this.idSalvato = null;
    // Pronto, non in cammino: si parte con avvia() — vedi `avviato`.
    this.avviato = false;
    this.pausaManuale = true;
    this.stato = { stato: 'IN_PAUSA', tappaCorrente: 0, da: Date.now() };
    this.salva();
    this.avvisa();
    void this.cercaLungoLaStradaGiro();
    return giro;
  }

  /**
   * «Avvia la navigazione»: da PRONTO a IN_CAMMINO. E` qui — non alla
   * creazione — che le tappe entrano nel geofencing nativo e il driver
   * comincia a leggere le svolte.
   */
  async avvia(): Promise<void> {
    if (!this.giro || this.avviato) return;
    // IL NAVIGATORE SI PAGA QUI (29/08/2026). Il giro creato in anteprima ha
    // il percorso ma non le svolte (`steps` vuoti in ogni tratta): sono le
    // istruzioni a essere premium. Si richiede la rotta completa — stesso
    // ordine, stessa partenza — e il server risponde 402 senza Day Pass:
    // l'errore risale al tasto, che lo scrive, e il giro resta «pronto».
    // Un giro ripreso che le svolte le ha gia` non le richiede.
    const senzaSvolte = !(this.giro.tratte || []).some((l: any) => Array.isArray(l?.steps) && l.steps.length > 0);
    if (senzaSvolte) {
      const giro = this.giro;
      const tappe = giro.ordine.map((i: number) => giro.tappe[i]).filter((t: TappaGiro | undefined): t is TappaGiro => !!t && !t.esclusa);
      const { g, dati } = await this.chiediRotta(tappe, {
        partenza: giro.partenzaCorrente,
        anello: giro.anello,
        ordina: false,
        rientro: giro.anello ? this.puntoDiRientro() : null,
      });
      if (this.giro !== giro) return; // chiuso nel frattempo
      giro.tratte = dati.routes?.[0]?.legs || giro.tratte;
      const geometria = (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]]);
      if (geometria.length > 1) giro.geometria = geometria;
      if (Number.isFinite(g?.metri_totali)) giro.metri = g.metri_totali;
      if (Number.isFinite(g?.minuti_cammino)) giro.minutiCammino = g.minuti_cammino;
    }
    this.avviato = true;
    this.pausaManuale = false;
    this.stato = { ...this.stato, stato: 'IN_CAMMINO', da: Date.now(), fermoDa: null };
    // LA PRIMA ISTRUZIONE, SUBITO (03/09/2026, collaudo: «appena creato il
    // percorso, cliccato l'altoparlante, non e' uscita l'istruzione»).
    // aggiornaPasso(pos) calcola la svolta SOLO quando arriva un fix GPS: fra
    // «Avvia» e il primo campione la card e il tasto «Ripeti» restavano
    // muti, e in un percorso su misura (senza audioguide) e' l'unica voce
    // che si sente. Qui si legge lo step iniziale senza aspettare una
    // posizione — stesso principio di useWalkingNavigation, che mostra la
    // prima istruzione appena calcolato il percorso, non al primo passo.
    this.aggiornaPassoIniziale();
    this.salva();
    this.avvisa();
    // Sul telefono l'arrivo lo dichiara il servizio nativo: le tappe entrano
    // nel suo geofencing come tappe d'itinerario (isFromItinerary=true).
    this.sincronizzaTappeNative();
    // Il percorso su misura cammina anche a cuffie spente: il GPS che
    // alimenta il driver (wip-location-update) parte con le cuffie o con chi
    // si iscrive alla posizione — qui ci si assicura che stia gia` andando.
    if (this.giro.modo === 'percorso') { try { void locationService.startWatching(); } catch { /* senza GPS il driver non sente */ } }
  }

  /** Creato ma non ancora avviato: il cruscotto mostra «Avvia». */
  eAvviato(): boolean { return this.avviato; }

  /** Le tappe ancora da fare al geofencing nativo (no-op sul web). */
  private sincronizzaTappeNative() {
    if (!this.giro || !Capacitor.isNativePlatform()) return;
    // Un percorso su misura NON entra nel geofencing nativo: le sue tappe
    // sono mute per definizione, e il servizio in background all'arrivo
    // farebbe partire teaser e audioguida. L'arrivo lo dichiara il driver JS.
    if (this.giro.modo === 'percorso') return;
    try {
      locationService.syncTappeGiroToNative(this.giro.tappe.filter(t => !t.fatta && !t.saltata && !t.esclusa));
    } catch { /* best-effort */ }
  }

  /**
   * La chiamata al server, in un posto solo: la usano il giro, l'anteprima
   * della bozza e il ricalcolo dopo un'esclusione. Tre copie di questa
   * funzione sarebbero tre modi diversi di sbagliare l'intestazione.
   */
  private async chiediRotta(
    tappe: TappaGiro[],
    opzioni: {
      anello?: boolean;
      ordina?: boolean;
      partenza: { lat: number; lon: number };
      /**
       * ANTEPRIMA = GRATIS (28/08/2026). Il server risponde col percorso vero
       * — geometria, metri, minuti, ordine — ma senza le istruzioni
       * passo-passo, e senza chiedere il Day Pass. Si usa mentre si compone
       * la bozza: vedere il giro e` il modo migliore per volerlo. Il 402
       * arriva solo su «Crea giro», che e` il momento giusto per proporre il
       * pass, e li` le istruzioni servono davvero.
       */
      anteprima?: boolean;
      /** Ad anello: dove chiudere il giro, se non e` la partenza (vedi puntoDiRientro). */
      rientro?: { lat: number; lon: number } | null;
      /**
       * PERCORSO SU MISURA (03/09/2026): niente Day Pass, si paga a crediti
       * una volta per `id`; il server conta le modifiche (nuove tappe, o
       * `modifica` esplicito per una tolta) e oltre il tetto risponde
       * MODIFICHE_ESAURITE. Un ricalcolo per deviazione o per tappa fatta
       * non e` una modifica: si manda senza flag.
       */
      percorso?: { id: string; modifica?: boolean };
    },
  ): Promise<{ g: any; dati: any }> {
    // Il punto a cui si arriva e` l'INGRESSO quando lo conosciamo, non il
    // centroide: e` la differenza fra "sei arrivato" davanti a un muro
    // laterale e davanti all'entrata.
    const punto = (t: TappaGiro) => t.ingresso ?? { lat: t.lat, lon: t.lon };
    const coords = [opzioni.partenza, ...tappe.map(punto)]
      .map(p => `${p.lon},${p.lat}`).join(';');

    // Il token va mandato: il giro a piu` tappe e` premium e il cancello sta
    // sul server (provato: senza token risponde 402). Senza questa riga il
    // client si respingerebbe da solo.
    const intestazioni: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      const t = data?.session?.access_token;
      if (t) intestazioni.Authorization = `Bearer ${t}`;
    } catch { /* senza sessione il server rispondera` 402, ed e` giusto cosi` */ }

    const r2 = opzioni.anello && opzioni.rientro ? `&rientro=${opzioni.rientro.lon},${opzioni.rientro.lat}` : '';
    // LA LINGUA DELLE SVOLTE (29/08/2026, committente: «anche il navigatore
    // deve essere nella lingua dell'utente»). Il server la legge da
    // `?language=` (server.ts, /api/tour/foot) e la passa a OSRM per le
    // istruzioni passo-passo — ma qui non gliela mandava NESSUNO: un utente
    // inglese o tedesco si sentiva dire «Gira a destra in Via Carducci».
    // linguaCorrente() PRIMA di this.lingua: quest'ultima nasce 'it' e la
    // imposta il driver del giro, che parte DOPO questa chiamata — usarla per
    // prima avrebbe lasciato tutti in italiano lo stesso.
    const linguaGiro = String(linguaCorrente() || this.lingua || 'it').toLowerCase().slice(0, 2) || 'it';
    const p = opzioni.percorso && !opzioni.anteprima
      ? `&modo=percorso&percorso=${encodeURIComponent(opzioni.percorso.id)}${opzioni.percorso.modifica ? '&modifica=1' : ''}`
      : '';
    const url = getApiUrl(`/api/tour/foot/${coords}?anello=${opzioni.anello ? 'true' : 'false'}&ordina=${opzioni.ordina === false ? 'false' : 'true'}&language=${linguaGiro}${opzioni.anteprima ? '&anteprima=true' : ''}${r2}${p}`);
    // 45 s: il server ottimizza l'ordine e chiede OSRM per ogni tratta; oltre
    // e' rete morta, e prima la promise restava appesa per sempre (ITI-07).
    const r = await apiFetch(url, { headers: intestazioni }, 45000);
    if (r.status === 401) {
      throw new Error('ACCESSO_RICHIESTO');
    }
    if (r.status === 402) {
      const j = await r.json().catch(() => ({}));
      // I tre «no» del server, distinti perche' la risposta giusta e` diversa:
      // il Day Pass (cassa), i crediti (negozio), le modifiche (nuovo percorso).
      if (j?.code === 'CreditiInsufficienti') throw new Error(`CREDITI_INSUFFICIENTI:${Number(j?.costo) || ''}`);
      if (j?.code === 'ModificheEsaurite') throw new Error(`MODIFICHE_ESAURITE:${Number(j?.max) || ''}`);
      throw new Error(`PASS_RICHIESTO:${j?.motivo || 'serve il Day Pass attivo'}`);
    }
    if (!r.ok) {
      const testo = await r.text().catch(() => '');
      throw new Error(`giro non calcolabile: ${r.status} ${testo.slice(0, 120)}`);
    }
    const dati = await r.json();
    if (!dati?.wip_giro) throw new Error('giro non calcolabile: risposta senza wip_giro');
    return { g: dati.wip_giro, dati };
  }

  /**
   * Pre-scaricamento. Il momento in cui il segnale muore e` esattamente quello
   * in cui sei fra i palazzi del centro storico — cioe` dentro il giro. Per una
   * funzione premium questo non e` un extra: e` la differenza fra un prodotto e
   * una dimostrazione.
   * Best-effort e in parallelo: una tappa che non si scarica non ferma il giro,
   * si prendera` al momento se la rete c'e`.
   */
  async prescarica(
    onProgresso?: (fatte: number, totali: number) => void,
    lingua?: string,
    personaggio?: 'nicky' | 'dante',
  ): Promise<{ testi: number; audio: number; totali: number; mancanti: number }> {
    if (!this.giro) return { testi: 0, audio: 0, totali: 0, mancanti: 0 };
    // Un percorso su misura non ha niente da scaricare: nessuna tappa parla.
    if (this.giro.modo === 'percorso') return { testi: 0, audio: 0, totali: 0, mancanti: 0 };
    if (this.prescarico.inCorso) return { testi: this.prescarico.testi, audio: this.prescarico.audio, totali: this.prescarico.totali, mancanti: this.prescarico.mancanti };
    const giroId = this.giro.id;
    // Le tappe «senza guida» (pranzo, pause) non hanno nulla da scaricare:
    // includerle vorrebbe dire generare — e pagare — un'audioguida per un
    // ristorante, e falserebbe il conteggio «N testi, N audio, N mancanti».
    const tappe = this.giro.tappe.filter(t => !t.esclusa && !t.senzaGuida);
    // Lingua e personaggio dal contesto utente (non 'it' fisso come prima):
    // un utente EN si ritrovava testi e voce italiani nel pre-scaricamento.
    // Fallback finale a linguaCorrente() (che al primo avvio rileva la lingua
    // di sistema) invece di 'it' fisso.
    const lang = String(lingua || this.lingua || localStorage.getItem('wip_language') || linguaCorrente()).toLowerCase().slice(0, 2) || 'en';
    const carattere: 'nicky' | 'dante' = personaggio || getGuideCharacter() || 'nicky';
    const voce = azureVoiceName(lang, carattere);
    let fatte = 0, testi = 0, audio = 0;
    this.prescarico = { inCorso: true, fatte: 0, totali: tappe.length, testi: 0, audio: 0, mancanti: 0, finitoIl: 0 };
    this.avvisa();

    await Promise.all(tappe.map(async (t) => {
      // 1. Il testo, dalla stessa catena della scheda (cache poi_audioguides →
      //    get-or-create sul server): incrementPlay:false perche' preparare
      //    non e' ascoltare.
      try {
        if (!t.testo) {
          const poi = { id: String(t.id), name: t.nome, lat: t.lat, lon: t.lon, category: t.categoria || undefined, city: t.citta || undefined } as any;
          t.testo = await getOrCreateAudioguideText(poi, lang, carattere, { incrementPlay: false });
          t.durata_ascolto_s = durataAscolto(t.testo);
        }
        if (t.testo) testi++;
      } catch { /* si prendera` al momento */ }

      // 2. L'AUDIO. Il testo da solo non basta: senza rete la sintesi vocale
      //    del server non risponde, e il giro premium diventa muto proprio nel
      //    centro storico dove il segnale manca. Si scarica l'MP3 (stesso
      //    canale della scheda: /api/tts/smart con Bearer, voce del
      //    personaggio) e si mette in IndexedDB con la chiave che la scheda
      //    POI legge gia' (`${poiId}_${personaggio}`).
      try {
        const chiave = chiaveAudioTappa(t.id, carattere);
        const gia = await getOfflineAudioUrl(chiave);
        if (gia) { t.audio = gia; audio++; }
        else if (t.testo) {
          const { ok, blob } = await postForAudioBlob(getApiUrl('/api/tts/smart'), { text: t.testo, voice: voce, poi_id: t.id, prefetch: true });
          if (ok && blob && blob.size >= 500 && !(blob.type || '').includes('json')) {
            if (await salvaBlobAudio(blob, chiave)) {
              t.audio = await getOfflineAudioUrl(chiave);
              audio++;
            }
          }
        }
      } catch { /* l'audio si generera` al momento se la rete c'e` */ }

      fatte++;
      if (this.giro?.id === giroId) {
        this.prescarico = { ...this.prescarico, fatte, testi, audio, mancanti: tappe.length - audio };
        this.avvisa();
      }
      onProgresso?.(fatte, tappe.length);
    }));

    const esito = { testi, audio, totali: tappe.length, mancanti: tappe.length - audio };
    if (this.giro?.id === giroId) {
      this.prescarico = { inCorso: false, fatte, ...esito, finitoIl: Date.now() };
      this.salva();
      this.avvisa();
    }
    return esito;
  }

  /** Lo stato del pre-scaricamento (per il banner). */
  statoPrescarico(): StatoPrescarico { return this.prescarico; }

  /** Un campione di posizione: fa avanzare la macchina a stati. */
  aggiorna(pos: { lat: number; lon: number; velocita?: number; accuratezza?: number }, extra?: { guidaInCorso?: boolean; pausaManuale?: boolean; suAttraversamento?: boolean; metriAllaSvolta?: number | null }) {
    this.ultimaPosizione = { lat: pos.lat, lon: pos.lon };
    // Guida spenta: la posizione si ricorda (serve alla ripresa) ma la
    // macchina a stati sta ferma — niente arrivi, niente voce, niente ricalcoli.
    // eSospeso(), non sospeso: il percorso su misura cammina a cuffie spente.
    if (!this.giro || this.eSospeso()) return;
    const tappa = this.tappaCorrente();
    if (!tappa) {
      // TUTTE LE TAPPE FATTE, MA AD ANELLO IL GIRO NON E` FINITO (28/08/2026):
      // manca il ritorno al punto di partenza, che e` una tratta del giro a
      // tutti gli effetti — il server la calcola, i metri la contano, la mappa
      // la disegna. Prima si dichiarava FINITO all'ultima tappa e l'ultimo
      // chilometro si camminava senza istruzioni e col cruscotto gia` chiuso.
      // Non e` una tappa: niente audioguida, niente conteggio, solo la strada.
      const rientro = this.puntoDiRientro();
      if (rientro && metri(pos, rientro) > SOGLIE.arrivo_m) {
        if (this.stato.stato !== 'IN_PAUSA') this.stato = { ...this.stato, stato: 'IN_CAMMINO' };
        this.aggiornaPasso(pos);
        // ANCHE IN RIENTRO SI PUO` SBAGLIARE STRADA (03/09/2026): prima
        // l'ultimo chilometro era senza deviazione. Stesse soglie del giro;
        // fuori da abbastanza tempo si rifa` la sola tratta di ritorno.
        if (this.stato.stato !== 'IN_PAUSA') {
          const s = this.scostamentoDalPercorso(pos);
          const soglia = Math.max(SOGLIE.deviazione_m, (pos.accuratezza ?? 0) * 1.5);
          const eraFuori = this.stato.fuoriPercorsoDa != null;
          const fuori = s > soglia || (eraFuori && s > SOGLIE.deviazione_rientro_m);
          const adesso = Date.now();
          this.stato = { ...this.stato, fuoriPercorsoDa: fuori ? (this.stato.fuoriPercorsoDa ?? adesso) : null };
          if (fuori && adesso - (this.stato.fuoriPercorsoDa ?? adesso) > SOGLIE.deviazione_s * 1000 && adesso >= this.prossimoTentativoDeviazione) {
            this.prossimoTentativoDeviazione = adesso + 60_000;
            void this.ricalcolaRientro(pos).then((ok) => { if (ok) this.stato = { ...this.stato, fuoriPercorsoDa: null }; });
          }
        }
        this.salva();
        this.avvisa();
        return;
      }
      this.stato = { ...this.stato, stato: 'FINITO' }; this.avvisa(); return;
    }

    const p = tappa.ingresso ?? { lat: tappa.lat, lon: tappa.lon };
    const distanza = metri(pos, p);
    const scostamento = this.scostamentoDalPercorso(pos);

    this.stato = prossimoStato(this.stato, tappa, {
      distanzaTappa: distanza,
      scostamento,
      accuratezza: pos.accuratezza,
      velocita: pos.velocita ?? 1.3,
      guidaInCorso: !!extra?.guidaInCorso,
      pausaManuale: extra?.pausaManuale ?? this.pausaManuale,
      adesso: Date.now(),
    });
    if (this.stato.stato === 'ALL_INGRESSO') this.ultimaTappaArrivata = tappa;
    this.aggiornaPasso(pos);
    this.salva();
    this.avvisa();
  }

  /**
   * "Riascolta" dal banner: la tappa a cui si e' arrivati per ultima (anche se
   * gia' completata), altrimenti la corrente. Null solo senza giro.
   */
  tappaDaRiascoltare(): TappaGiro | null {
    if (!this.giro) return null;
    return this.ultimaTappaArrivata
      ?? [...this.giro.tappe].reverse().find(t => t.fatta && !t.esclusa)
      ?? this.tappaCorrente();
  }

  /** Lingua delle istruzioni vocali: la imposta il driver dalla UI. */
  impostaLingua(l: string) { this.lingua = String(l || 'it').toLowerCase().slice(0, 2) || 'it'; }

  /**
   * La prossima manovra davanti a noi, sulla tratta corrente.
   * Lo step 0 e` il `depart` (la partenza), l'ultimo e` l'`arrive`; la manovra
   * di uno step sta al suo INIZIO. Si avanza quando si e` passati sopra la
   * manovra (15 m) o quando la successiva e` gia` piu` vicina: cosi` un fix
   * saltato non lascia il navigatore a ripetere una svolta gia` fatta.
   */
  /**
   * La prima istruzione, senza aspettare un fix GPS (03/09/2026). Si legge
   * il primo step della tratta corrente: la distanza resta sconosciuta
   * (nessuna posizione da cui misurarla) ma il TESTO della svolta c'e' gia',
   * ed e' quello che manca fra «Avvia» e il primo campione GPS.
   */
  private aggiornaPassoIniziale() {
    const leg: any = this.giro?.tratte?.[this.stato.tappaCorrente];
    const steps: any[] = Array.isArray(leg?.steps) ? leg.steps : [];
    this.tappaDelPasso = this.stato.tappaCorrente;
    this.passoCorrente = 0;
    if (steps.length < 2) { this.navAttuale = { istruzione: null, metri: null, attraversamento: false, manovra: null }; return; }
    const s = steps[0];
    this.navAttuale = {
      istruzione: istruzionePerStep(s, this.lingua, this.tappaCorrente()?.nome || undefined),
      metri: null,
      attraversamento: false,
      manovra: s?.maneuver ? { type: String(s.maneuver.type || ''), modifier: String(s.maneuver.modifier || '') } : null,
    };
  }

  private aggiornaPasso(pos: { lat: number; lon: number }) {
    const leg: any = this.giro?.tratte?.[this.stato.tappaCorrente];
    const steps: any[] = Array.isArray(leg?.steps) ? leg.steps : [];
    if (this.tappaDelPasso !== this.stato.tappaCorrente) { this.tappaDelPasso = this.stato.tappaCorrente; this.passoCorrente = 0; }
    if (steps.length < 2) { this.navAttuale = { istruzione: null, metri: null, attraversamento: false, manovra: null }; return; }
    const punto = (s: any) => {
      const l = s?.maneuver?.location;
      return Array.isArray(l) && l.length >= 2 ? { lat: Number(l[1]), lon: Number(l[0]) } : null;
    };
    let i = Math.max(this.passoCorrente, 0);
    while (i < steps.length - 1) {
      const qui = punto(steps[i]), dopo = punto(steps[i + 1]);
      if (!qui || !dopo) { i++; continue; }
      const d = metri(pos, qui), dDopo = metri(pos, dopo);
      if (i === 0 || d < 15 || (dDopo < d && dDopo < 40)) i++; else break;
    }
    this.passoCorrente = i;
    const s = steps[i];
    const p = punto(s);
    const m = p ? Math.round(metri(pos, p)) : null;
    this.navAttuale = {
      istruzione: istruzionePerStep(s, this.lingua, this.tappaCorrente()?.nome || undefined),
      metri: m,
      // Attraversamento a ridosso (entro 20 m): il direttore audio tace.
      // OSRM foot non ha un tipo di manovra "crossing" proprio: si legge dal
      // tipo, dal nome della via o dalle classi dell'intersezione, se ci sono.
      attraversamento: m != null && m <= 20 && stepEAttraversamento(s),
      // Tipo e verso della manovra OSRM: la card in alto disegna la freccia
      // giusta (destra, sinistra, rotonda…) invece di un'icona generica.
      manovra: s?.maneuver ? { type: String(s.maneuver.type || ''), modifier: String(s.maneuver.modifier || '') } : null,
    };
  }

  /**
   * Fuori percorso da piu` di 30 s (stato DEVIATO): si rifa` il percorso da
   * dove si e`. Un ricalcolo al minuto al massimo — il GPS in un vicolo puo`
   * oscillare per un po' prima di rientrare.
   */
  /**
   * Ritorna: true = percorso rifatto; false = TENTATO e fallito (rete assente,
   * server giu'): lo stato resta DEVIATO e `fuoriPercorsoDa` non si azzera;
   * null = non era il momento (non deviati, o meno di un minuto dall'ultimo
   * tentativo). Fino al 28/08/2026 tornava true anche a ricalcolo fallito e
   * il driver annunciava «ricalcolo il giro» senza aver ricalcolato nulla.
   */
  async ricalcolaDaDeviazione(pos: { lat: number; lon: number }): Promise<boolean | null> {
    if (!this.giro || this.stato.stato !== 'DEVIATO') return null;
    if (Date.now() < this.prossimoTentativoDeviazione) return null;
    // Il tempo di attesa si decide DOPO il tentativo (03/09/2026): un minuto
    // pieno dopo un ricalcolo riuscito, mezzo dopo un fallimento (rete
    // assente), cosi` senza rete si ritenta prima senza martellare.
    this.prossimoTentativoDeviazione = Date.now() + 60_000;
    const ok = await this.ricalcola(pos, { daDeviazione: true });
    this.prossimoTentativoDeviazione = Date.now() + (ok ? 60_000 : 30_000);
    this.ultimoRicalcoloDeviazione = Date.now();
    return ok;
  }

  /**
   * «RICALCOLA DA QUI» (03/09/2026, collaudo: «ero uscito dal percorso e la
   * mappa mi mostra sempre il percorso originale, ci vuole un tasto di
   * ricalcolo immediato dal punto in cui si clicca, lasciando intatte le
   * tappe e tutto il resto»). Il ricalcolo automatico ha le sue soglie
   * (120 m per 30 s, un fix accurato, un minuto di cooldown): chi vede la
   * linea sbagliata non deve aspettare che l'algoritmo se ne accorga.
   * Stesso `ricalcola` delle deviazioni — tappe fatte, ordine di quelle da
   * fare, anello e punto di rientro restano com'erano — ma senza cooldown e
   * senza stato richiesto. In un percorso su misura NON e` una modifica.
   * Ritorna false se il server non ha risposto (si resta sulla linea vecchia).
   */
  async ricalcolaDaQui(posizione?: { lat: number; lon: number }): Promise<EsitoRicalcolo> {
    const esito = await this.ricalcolaDaQuiInterno(posizione);
    // Chi ha premuto (cruscotto, card blu, lock screen) puo` non avere una
    // riga dove scriverlo: lo dice il driver del giro, a voce, passando dal
    // direttore audio — mai sopra la guida che sta raccontando.
    try { window.dispatchEvent(new CustomEvent('wip-giro-ricalcolato', { detail: { esito } })); } catch { /* SSR */ }
    return esito;
  }

  private async ricalcolaDaQuiInterno(posizione?: { lat: number; lon: number }): Promise<EsitoRicalcolo> {
    if (!this.giro) return 'niente';
    const pos = posizione ?? this.posizioneFresca() ?? await this.posizioneAttuale(true);
    if (!pos) return 'posizione';
    this.modificaPendente = false;
    this.prossimoTentativoDeviazione = Date.now() + 60_000;
    this.ultimoRicalcoloDeviazione = Date.now();
    // In rientro (tutte le tappe fatte, anello) non c'e` un ordine da rifare:
    // si rifa` la sola tratta di ritorno, come fa impostaRientro. Senza
    // questo ramo `ricalcola` con zero tappe restanti dichiarava FINITO.
    if (!this.tappaCorrente()) {
      if (!this.puntoDiRientro()) return 'niente';
      return (await this.ricalcolaRientro(pos)) ? 'ok' : 'rete';
    }
    const inPausa = this.pausaManuale;
    try {
      const ok = await this.ricalcola(pos, { senzaRipiego: true });
      // La pausa e` una scelta dell'utente: il ricalcolo non la toglie.
      if (ok && inPausa) { this.stato = { ...this.stato, stato: 'IN_PAUSA' }; this.salva(); this.avvisa(); }
      return ok ? 'ok' : 'rete';
    } catch (e: any) {
      const m = String(e?.message || '');
      return m.startsWith('PASS_RICHIESTO') || m.startsWith('ACCESSO_RICHIESTO') ? 'pass' : 'rete';
    }
  }

  /** La pausa dal banner: la macchina a stati la vede al prossimo campione. */
  impostaPausa(inPausa: boolean) {
    this.pausaManuale = inPausa;
    if (!this.giro) return;
    if (inPausa) this.stato = { ...this.stato, stato: 'IN_PAUSA', da: Date.now() };
    else if (this.stato.stato === 'IN_PAUSA') this.stato = { ...this.stato, stato: 'IN_CAMMINO', da: Date.now(), fermoDa: null };
    this.salva();
    this.avvisa();
  }

  /** Chi ha la precedenza adesso. Il chiamante esegue, questo decide. */
  chiPuoParlare(richiesta: 'guida' | 'navigatore' | 'teaser', ctx: { guidaInCorso: boolean; metriAllaSvolta: number | null; suAttraversamento: boolean }) {
    return decidi({
      richiesta,
      guidaInCorso: ctx.guidaInCorso,
      metriAllaSvolta: ctx.metriAllaSvolta,
      suAttraversamento: ctx.suAttraversamento,
      inPausa: this.stato.stato === 'IN_PAUSA',
      allIngresso: this.stato.stato === 'ALL_INGRESSO',
    });
  }

  accodaVoce(voce: 'guida' | 'navigatore' | 'teaser', testo: string) { this.coda.accoda(voce, testo); }
  prossimaVoce() { return this.coda.prossimo(); }

  /** Tappa fatta: si passa alla successiva. */
  completaTappa() {
    if (!this.giro) return;
    const t = this.tappaCorrente();
    if (t) t.fatta = true;
    this.stato = { ...this.stato, tappaCorrente: this.stato.tappaCorrente + 1, stato: 'IN_CAMMINO', da: Date.now() };
    // Ad anello dopo l'ultima tappa c'e` il ritorno: non e` finita finche` non
    // si e` tornati dove si e` partiti (vedi puntoDiRientro).
    if (!this.tappaCorrente() && !this.puntoDiRientro()) this.stato = { ...this.stato, stato: 'FINITO' };
    this.coda.svuota();
    this.salva();
    this.avvisa();
  }

  /**
   * Salta la tappa corrente. Le rimanenti si riordinano DA DOVE SI E` ADESSO:
   * non si torna indietro a recuperare, che e` quello che farebbe un elenco
   * fisso. Il giro resta lo stesso (stesso id, stesse tappe fatte): prima si
   * ricreava da zero e il contatore "3 di 10" tornava a "1 di 7".
   */
  async salta(posizione?: { lat: number; lon: number }) {
    if (!this.giro) return;
    const t = this.tappaCorrente();
    if (!t) return;
    t.saltata = true;
    this.coda.svuota();
    await this.ricalcola(posizione);
  }

  /**
   * La X su una tappa della mappa: la tappa esce dal giro e il percorso si
   * rifa` da dove si e`. Vale per qualsiasi tappa ancora da fare, non solo per
   * la corrente — e` la differenza con `salta`. Subito dopo si cerca una
   * sostituta fra i POI vicini: togliere e basta lascia un giro piu` povero,
   * non un giro migliore.
   */
  async escludi(id: string | number, posizione?: { lat: number; lon: number }) {
    if (!this.giro) return;
    const t = this.giro.tappe.find(x => String(x.id) === String(id));
    if (!t || t.fatta || t.saltata || t.esclusa) return;
    t.esclusa = true;
    const eraCorrente = this.tappaCorrente() === t;
    if (eraCorrente) this.coda.svuota();
    this.proposta = null;
    // Togliere da un percorso su misura e` una MODIFICA (la conta il server).
    const percorso = this.giro.modo === 'percorso';
    this.modificaPendente = percorso;
    try {
      await this.ricalcola(posizione);
    } catch (e) {
      // Rifiutata: la tappa resta dov'era.
      t.esclusa = false;
      this.salva(); this.avvisa();
      throw e;
    }
    // La sostituta e` un'idea dell'audioguida («al posto del museo chiuso, un
    // altro museo»): in un percorso su misura ognuno sceglie da se'.
    this.proposta = percorso ? null : this.cercaSostituta(t);
    this.avvisa();
  }

  /**
   * La sostituta: il POI piu` vicino alla tappa tolta, entro 250 m, che non e`
   * gia` nel giro. La stessa categoria vale cento metri di vantaggio: chi
   * toglie un museo chiuso vuole un altro museo, non la chiesa di fronte.
   */
  private cercaSostituta(tolta: TappaGiro): PropostaSostituta | null {
    if (!this.giro) return null;
    const nelGiro = new Set(this.giro.tappe.map(t => String(t.id)));
    const da = tolta.ingresso ?? { lat: tolta.lat, lon: tolta.lon };
    let migliore: { poi: any; d: number; punteggio: number } | null = null;
    for (const c of this.tuttiICandidati()) {
      const id = c?.id ?? c?.poiId;
      if (id == null || nelGiro.has(String(id))) continue;
      const lat = Number(c.lat), lon = Number(c.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const d = metri(da, { lat, lon });
      if (d > RAGGIO_SOSTITUTA_M) continue;
      const stessa = tolta.categoria && (c.category || c.poiType) === tolta.categoria;
      const punteggio = d - (stessa ? 100 : 0);
      if (!migliore || punteggio < migliore.punteggio) migliore = { poi: c, d, punteggio };
    }
    if (!migliore) return null;
    return { tolta, sostituta: tappaDaPoi(migliore.poi), metri: Math.round(migliore.d), quando: Date.now() };
  }

  /** "Si`, mettila al suo posto": entra nel giro e il percorso si rifa`. */
  async accettaSostituta(posizione?: { lat: number; lon: number }) {
    const p = this.proposta;
    if (!p || !this.giro) return;
    this.proposta = null;
    if (this.giro.tappe.some(t => String(t.id) === String(p.sostituta.id))) { this.avvisa(); return; }
    this.giro.tappe.push({ ...p.sostituta, durata_ascolto_s: p.sostituta.durata_ascolto_s ?? durataAscolto(p.sostituta.testo) });
    this.lungoIlPercorsoCache = null;
    await this.ricalcola(posizione);
  }

  rifiutaSostituta() {
    if (!this.proposta) return;
    this.proposta = null;
    this.avvisa();
  }

  /** C'e` un giro in corso e questo POI ne e` gia` una tappa (fatta o da fare)? */
  giroHa(id: string | number): boolean {
    return !!this.giro?.tappe.some(t => String(t.id) === String(id) && !t.esclusa);
  }

  /**
   * "Aggiungi al giro" A GIRO GIA` PARTITO (22/08/2026): la tappa entra fra
   * quelle da fare e il percorso si rifa` da dove si e`, con lo stesso
   * ricalcolo delle deviazioni. Il tetto resta dieci tappe vive. Torna
   * false se non c'e` giro, se e` piena o se la tappa c'e` gia`.
   */
  async aggiungiTappaAlVolo(poi: any): Promise<boolean> {
    const giro = this.giro;
    if (!giro) return false;
    const percorso = giro.modo === 'percorso';
    const t = tappaDaPoi(percorso ? { ...poi, senzaGuida: true } : poi);
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lon)) return false;
    if (this.giroHa(t.id)) return false;
    const vive = giro.tappe.filter(x => !x.esclusa).length;
    if (vive >= this.tettoTappe()) return false;
    giro.tappe.push({ ...t, durata_ascolto_s: t.durata_ascolto_s ?? durataAscolto(t.testo) });
    // Era FINITO (ultima tappa fatta) e si vuole proseguire: si riparte.
    // In un percorso su misura questa e` una MODIFICA: il server la conta.
    this.modificaPendente = percorso;
    try {
      await this.ricalcola();
    } catch (e) {
      // Rifiutata (modifiche finite / crediti): la tappa non entra.
      giro.tappe.pop();
      this.salva(); this.avvisa();
      throw e;
    }
    // Geofence prioritari sul telefono: la lista e` cambiata (mai per il
    // percorso su misura: le sue tappe non entrano nel geofencing nativo).
    if (Capacitor.isNativePlatform() && !percorso) {
      try { locationService.syncTappeGiroToNative(giro.tappe.filter(x => !x.fatta && !x.saltata && !x.esclusa)); } catch { /* best-effort */ }
    }
    return true;
  }

  /**
   * Rifa` il percorso sulle tappe ancora da fare, partendo dalla posizione
   * data (o dall'ultima nota). `ordine` da qui in poi contiene SOLO le tappe
   * restanti: le fatte restano in `tappe` per il conteggio e per la mappa.
   */
  private async ricalcola(
    posizione?: { lat: number; lon: number },
    opzioni: { daDeviazione?: boolean; senzaRipiego?: boolean } = {},
  ): Promise<boolean> {
    const giro = this.giro;
    if (!giro) return false;
    const daFare = (t: TappaGiro) => !t.fatta && !t.saltata && !t.esclusa;
    // Prima quelle gia` in ordine (nell'ordine che avevano), poi le nuove
    // arrivate (una sostituta accettata) che in `ordine` non stanno ancora.
    const inOrdine = giro.ordine.map(i => giro.tappe[i]).filter(daFare);
    const nuove = giro.tappe.filter((t, i) => daFare(t) && !giro.ordine.includes(i));
    const restanti = [...inOrdine, ...nuove];
    this.lungoIlPercorsoCache = null;

    if (restanti.length === 0) {
      giro.ordine = [];
      this.stato = { stato: 'FINITO', tappaCorrente: 0, da: Date.now() };
      this.salva(); this.avvisa();
      return true;
    }

    const partenza = posizione ?? this.ultimaPosizione ?? await this.posizioneAttuale();
    // La modifica esplicita (aggiungi/togli, vedi aggiungiTappaAlVolo ed
    // escludi) si legge e si consuma qui: un solo ricalcolo la porta al server.
    const modifica = this.modificaPendente;
    this.modificaPendente = false;
    // Contabilita` dei metri (03/09/2026): la parte del percorso corrente
    // gia` alle spalle si mette da parte PRIMA di sostituire le tratte, in
    // entrambi i rami (rotta nuova o ripiego). Vedi GiroInCorso.metriPercorsi.
    const restantiPrima = giro.tratte.slice(this.stato.tappaCorrente).reduce((s: number, l: any) => s + (l?.distance || 0), 0);
    const metriPercorsiPrima = (giro.metriPercorsi || 0) + Math.max(0, (giro.metri || 0) - restantiPrima);
    if (partenza) {
      try {
        // Il punto su cui il server deve chiudere l'anello glielo diciamo
        // esplicitamente: e` lo stesso che `puntoDiRientro()` dichiara al
        // cruscotto, quindi linea disegnata e meta` non possono divergere.
        const rientro = this.rientroDaMandare(giro, partenza);
        const { g, dati } = await this.chiediRotta(restanti, {
          partenza, anello: giro.anello, rientro,
          percorso: giro.modo === 'percorso' && giro.percorsoId ? { id: giro.percorsoId, modifica } : undefined,
        });
        if (giro.modo === 'percorso' && g?.percorso) {
          giro.modifiche = Number(g.percorso.modifiche) || 0;
          giro.modificheMax = Number(g.percorso.max) || giro.modificheMax;
        }
        // Solo a rotta ottenuta: la partenza CORRENTE e` quella da cui il
        // percorso appena disegnato comincia davvero. Quella ORIGINALE non si
        // tocca mai (e si ripara se un giro vecchio non ce l'ha).
        giro.partenzaCorrente = { lat: partenza.lat, lon: partenza.lon };
        if (!giro.partenzaOriginale) giro.partenzaOriginale = { lat: partenza.lat, lon: partenza.lon };
        giro.ordine = (g.ordine as number[]).map(i => giro.tappe.indexOf(restanti[i]));
        giro.geometria = (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]]);
        this.ultimoIndiceSnap = 0;
        giro.tratte = dati.routes?.[0]?.legs || [];
        giro.metriPercorsi = metriPercorsiPrima;
        giro.metri = g.metri_totali;
        giro.minutiCammino = g.minuti_cammino;
        giro.problemi = g.problemi || [];
        this.stato = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: Date.now() };
        this.passoCorrente = 0; this.tappaDelPasso = -1;
        // La prima svolta della strada nuova, subito (03/09/2026): stesso
        // buco di avvia(), qui dopo un ricalcolo riuscito.
        this.aggiornaPassoIniziale();
        this.salva(); this.avvisa();
        void this.cercaLungoLaStradaGiro();
        return true;
      } catch (e: any) {
        // Il «no» del server a un percorso su misura (modifiche finite,
        // crediti) NON e` un guasto di rete da assorbire in silenzio: risale
        // a chi ha chiesto la modifica, che la annulla e lo dice.
        const m = String(e?.message || '');
        if (m.startsWith('MODIFICHE_ESAURITE') || m.startsWith('CREDITI_INSUFFICIENTI')) throw e;
        // Dal tasto manuale anche il 402/401 deve arrivare a chi lo ha
        // premuto (cassa del Day Pass, login): non e` «rete assente».
        if (opzioni.senzaRipiego && (m.startsWith('PASS_RICHIESTO') || m.startsWith('ACCESSO_RICHIESTO'))) throw e;
        /* altrimenti si continua nell'ordine che c'era, senza la tappa tolta */
      }
    }

    // Da DEVIAZIONE il ripiego non ha senso: l'ordine e' gia' quello giusto,
    // manca solo la strada nuova. Si lascia lo stato DEVIATO com'e' (con
    // fuoriPercorsoDa) e si ritentera' fra un minuto; il driver avvisa
    // l'utente di seguire la linea sulla mappa. Lo stesso dal tasto
    // «Ricalcola da qui» (senzaRipiego): senza rotta nuova non si tocca niente.
    if (opzioni.daDeviazione || opzioni.senzaRipiego) return false;

    // Riserva senza server: stesso ordine, meno la tappa tolta. Le tratte si
    // tengono allineate all'ordine, altrimenti i metri rimanenti mentirebbero.
    const posizioniTenute = giro.ordine.map((i, pos) => (daFare(giro.tappe[i]) ? pos : -1)).filter(p => p >= 0);
    giro.ordine = [...posizioniTenute.map(p => giro.ordine[p]), ...nuove.map(t => giro.tappe.indexOf(t))];
    // AD ANELLO la tratta di ritorno sta in coda a `tratte` (una in piu` delle
    // tappe) e non ha una posizione in `ordine`: senza questa riga il ripiego
    // senza rete la buttava via, e con lei l'ultimo chilometro del giro.
    const ritorno = giro.anello && giro.tratte.length > giro.ordine.length ? giro.tratte[giro.tratte.length - 1] : null;
    giro.tratte = [...posizioniTenute.map(p => giro.tratte[p]).filter(Boolean), ...(ritorno ? [ritorno] : [])];
    // Anche qui la contabilita`: la tratta della tappa tolta non e` stata
    // camminata, quindi il percorso corrente si riallinea alle tratte tenute.
    giro.metriPercorsi = metriPercorsiPrima;
    giro.metri = Math.round(giro.tratte.reduce((s: number, l: any) => s + (l?.distance || 0), 0)) || giro.metri;
    this.stato = { ...this.stato, tappaCorrente: 0, stato: 'IN_CAMMINO', da: Date.now() };
    this.passoCorrente = 0; this.tappaDelPasso = -1;
    this.aggiornaPassoIniziale();
    this.salva(); this.avvisa();
    // Ordine aggiornato ma SENZA rotta nuova: non e' un ricalcolo riuscito.
    return false;
  }

  termina() {
    const aveva = !!this.giro;
    this.giro = null;
    this.ultimoIndiceSnap = 0;
    this.proposta = null;
    this.pausaManuale = false;
    this.corridoio = [];
    this.lungoIlPercorsoCache = null;
    this.prescarico = { ...PRESCARICO_VUOTO };
    this.ultimaTappaArrivata = null;
    this.idSalvato = null;
    this.coda.svuota();
    this.stato = { stato: 'FINITO', tappaCorrente: 0, da: Date.now() };
    try { localStorage.removeItem(CHIAVE_RIPRESA); } catch {}
    // Le tappe non devono restare geofence prioritari sul telefono.
    if (aveva && Capacitor.isNativePlatform()) { try { locationService.unsyncTappeGiroFromNative(); } catch { /* best-effort */ } }
    this.avvisa();
  }

  /** L'app chiusa a meta` giro non deve perdere il giro. */
  riprendi(): GiroInCorso | null {
    try {
      const grezzo = localStorage.getItem(CHIAVE_RIPRESA);
      if (!grezzo) return null;
      const { giro, stato, prescarico, avviato } = JSON.parse(grezzo);
      // Un giro di ieri non si riprende: si e` andati a dormire, non in pausa.
      if (!giro || Date.now() - giro.creatoIl > 12 * 60 * 60 * 1000) { localStorage.removeItem(CHIAVE_RIPRESA); return null; }
      this.giro = giro;
      this.ultimoIndiceSnap = 0;
      // I timer "da fermo" e "fuori percorso" di PRIMA della chiusura non
      // valgono piu': riaprendo l'app dopo dieci minuti il giro andava
      // dritto in IN_PAUSA (fermoDa vecchio) o in DEVIATO senza averlo mai
      // visto. Si riparte con i contatori azzerati.
      this.stato = { ...stato, fermoDa: null, fuoriPercorsoDa: null, da: Date.now() };
      // Un giro creato e mai avviato si riprende com'era: pronto e fermo. I
      // giri salvati prima di questo campo (28/08/2026) erano gia` partiti.
      this.avviato = avviato !== false;
      this.pausaManuale = !this.avviato;
      if (!this.avviato) this.stato.stato = 'IN_PAUSA';
      else if (this.stato.stato === 'IN_PAUSA' || this.stato.stato === 'DEVIATO') this.stato.stato = 'IN_CAMMINO';
      // Gli object URL salvati non sopravvivono al reload: l'audio si rilegge da IndexedDB.
      for (const t of this.giro.tappe) t.audio = null;
      this.prescarico = prescarico && typeof prescarico === 'object' ? { ...PRESCARICO_VUOTO, ...prescarico, inCorso: false } : { ...PRESCARICO_VUOTO };
      this.idSalvato = null;
      this.avvisa();
      // Con la guida spenta il giro si riprende ma resta fermo: niente rete,
      // niente geofence nativi finche` non lo si riaccende.
      if (!this.eSospeso()) {
        void this.cercaLungoLaStradaGiro();
        if (this.avviato) this.sincronizzaTappeNative();
        if (this.avviato && giro.modo === 'percorso') { try { void locationService.startWatching(); } catch { /* vedi avvia() */ } }
      }
      return giro;
    } catch { return null; }
  }

  vista(): VistaGiro | null {
    // Sospeso = invisibile. Un solo punto di verita`: banner, layer della
    // mappa e tasto di navigazione leggono tutti da qui.
    if (!this.giro || this.eSospeso()) return null;
    const t = this.tappaCorrente();
    // Le escluse non contano: non dovevano esserci. Le saltate si`, come fatte.
    const valide = this.giro.tappe.filter(x => !x.esclusa);
    const fatte = valide.filter(x => x.fatta || x.saltata).length;
    const restanti = this.giro.tratte.slice(this.stato.tappaCorrente).reduce((s: number, l: any) => s + (l?.distance || 0), 0);
    const proposta = this.proposta && Date.now() - this.proposta.quando < PROPOSTA_VALIDA_MS ? this.proposta : null;
    // Il rientro non e` una tappa: non conta nei totali, non ha audioguida.
    // Ma e` la meta` verso cui si sta camminando, e il cruscotto deve dirlo.
    const rientro = this.inRientro() ? this.puntoDiRientro() : null;
    const nomeRientro = getTranslation('tour_ritorno_partenza', (this.lingua || 'it').toUpperCase() as Language);
    return {
      stato: this.stato.stato,
      modo: this.giro.modo === 'percorso' ? 'percorso' : 'giro',
      modifiche: Number(this.giro.modifiche) || 0,
      modificheMax: Number(this.giro.modificheMax) || 3,
      tappaCorrente: this.stato.tappaCorrente,
      tappeFatte: fatte,
      tappeTotali: valide.length,
      // Il totale onesto: strada gia` fatta prima dell'ultimo ricalcolo +
      // percorso corrente. Prima, dopo un ricalcolo, totale = residuo.
      metriTotali: (this.giro.metriPercorsi || 0) + this.giro.metri,
      metriRimanenti: Math.round(restanti),
      nomeTappa: t?.nome ?? (rientro ? nomeRientro : null),
      // "poi: X" — la tappa successiva nell'ordine di cammino, se c'e'.
      nomeProssima: (() => {
        const j = this.giro!.ordine[this.stato.tappaCorrente + 1];
        if (j != null) return this.giro!.tappe[j]?.nome ?? null;
        // Dopo l'ultima tappa, ad anello, viene il ritorno.
        return t && this.metaAnello(this.giro!) ? nomeRientro : null;
      })(),
      // Verso la PORTA della tappa (o verso il punto di partenza, in rientro),
      // dalla posizione nota (linea d'aria).
      metriAllaTappa: (() => {
        if (!this.ultimaPosizione) return null;
        const p = t ? (t.ingresso ?? { lat: t.lat, lon: t.lon }) : rientro;
        return p ? Math.round(metri(this.ultimaPosizione, p)) : null;
      })(),
      tappaLat: t ? (t.ingresso?.lat ?? t.lat) : (rientro?.lat ?? null),
      tappaLon: t ? (t.ingresso?.lon ?? t.lon) : (rientro?.lon ?? null),
      // In rientro non c'e' una tappa: niente foto.
      fotoTappa: t?.foto ?? null,
      istruzione: this.navAttuale.istruzione,
      metriAllaSvolta: this.navAttuale.metri,
      manovra: this.navAttuale.manovra,
      suAttraversamento: this.navAttuale.attraversamento,
      inPausa: this.stato.stato === 'IN_PAUSA',
      avviato: this.avviato,
      proposta,
      prescarico: this.prescarico,
    };
  }

  /**
   * LE TAPPE DA CONSEGNARE AL NAVIGATORE IN AUTO (01/09/2026, committente:
   * «in auto deve comprendere tutte le tappe/POI del giro, come quando si
   * attiva dall'itinerario»). Il tasto del radar consegnava una meta sola: in
   * macchina non serve a niente, si ricomincia da capo a ogni tappa.
   *
   * Giro in corso: quelle che RESTANO, dalla corrente in poi e nell'ordine di
   * cammino — le fatte, le saltate e le escluse non si ripassano. Nessun giro
   * ancora creato: la bozza scelta nel radar, nel suo ordine. Meno di due
   * tappe torna null: e` navigazione singola e la fa NavChoiceSheet com'era.
   *
   * Il punto di arrivo e` la PORTA (`ingresso`) quando la si conosce, come nel
   * resto dell'app; altrimenti il centroide.
   */
  sequenzaPerNavigatore(): { id: string | number; name: string; lat: number; lon: number }[] | null {
    const punto = (t: TappaGiro) => ({
      id: t.id,
      name: t.nome,
      lat: t.ingresso?.lat ?? t.lat,
      lon: t.ingresso?.lon ?? t.lon,
    });
    const giro = this.giro;
    if (giro && !this.eSospeso()) {
      const restanti = giro.ordine
        .slice(this.stato.tappaCorrente)
        .map(i => giro.tappe[i])
        .filter(t => t && !t.esclusa && !t.fatta && !t.saltata);
      return restanti.length > 1 ? restanti.map(punto) : null;
    }
    const bozza = this.bozzaSequenza();
    return bozza.length > 1 ? bozza.map(punto) : null;
  }

  /**
   * IL NUMERO ASSOLUTO DI OGNI TAPPA (03/09/2026, collaudo: alla tappa 3/4
   * il pin sulla mappa diceva «1»). Dopo un ricalcolo `ordine` contiene solo
   * le tappe da fare e la posizione riparte da zero; il cruscotto invece
   * conta in assoluto (fatte + 1). Qui si numera come il cruscotto: prima le
   * fatte uscite da `ordine`, poi quelle in `ordine`, nell'ordine di
   * cammino. Per la tappa corrente viene esattamente tappeFatte + 1.
   */
  numeriTappe(): Map<string, number> {
    const m = new Map<string, number>();
    const g = this.giro;
    if (!g) return m;
    const inOrdine = new Set(g.ordine);
    let n = 0;
    g.tappe.forEach((t, i) => { if (!inOrdine.has(i) && (t.fatta || t.saltata) && !t.esclusa) m.set(String(t.id), ++n); });
    for (const i of g.ordine) { const t = g.tappe[i]; if (t && !t.esclusa) m.set(String(t.id), ++n); }
    return m;
  }

  /** Un giro sospeso non e` "in corso": il driver non deve toccarlo. */
  inCorso() { return !!this.giro && !this.eSospeso(); }
  /** C'e` un giro in memoria, anche se sospeso (per la ripresa e i salvataggi). */
  giroInMemoria() { return !!this.giro; }
  datiGiro() { return this.giro; }
  /** La tappa verso cui si sta andando adesso, o null. */
  tappaAttuale(): TappaGiro | null { return this.tappaCorrente(); }
  eTappaDelGiro(id: string | number): boolean { return !!this.giro?.tappe.some(t => String(t.id) === String(id)); }
  volumeGuidaAbbassato() { return VOLUME_ABBASSATO; }

  ascolta(fn: (v: VistaGiro | null) => void) { this.ascoltatori.add(fn); return () => { this.ascoltatori.delete(fn); }; }

  // ── CANDIDATI: i POI attorno, per sostitute e incontri ───────────────────

  impostaCandidati(lista: any[]) {
    this.candidati = Array.isArray(lista) ? lista : [];
    this.lungoIlPercorsoCache = null;
  }

  /** Radar (la finestra attorno a te) piu` corridoio (tutto il tracciato), senza doppioni. */
  private tuttiICandidati(): any[] {
    if (this.corridoio.length === 0) return this.candidati;
    const visti = new Set(this.candidati.map(c => String(c?.id ?? c?.poiId)));
    return [...this.candidati, ...this.corridoio.filter(c => !visti.has(String(c.id)))];
  }

  /**
   * I POI che stanno a meno di `entro` metri dal percorso e non sono tappe.
   * Sono gli "incontri lungo la strada": fra la tappa 3 e la 4 ci sono
   * trecento metri di citta` con dentro posti che il radar conosce e il giro
   * ignorerebbe. Un campione ogni tre punti della geometria basta: a piedi
   * i punti distano pochi metri.
   */
  candidatiLungoIlPercorso(entro = 40): { poi: any; id: string }[] {
    const giro = this.giro;
    if (!giro || !giro.geometria?.length) return [];
    // `entro` FA PARTE DELLA CHIAVE: il driver chiede 40 m (l'incontro da
    // annunciare), la mappa 80 m (i posti da poter aggiungere). Senza, il
    // primo dei due riempiva la cache e l'altro leggeva la lista sbagliata.
    const chiave = `${entro}|${giro.geometria.length}|${giro.metri}|${this.candidati.length}|${this.corridoio.length}|${giro.tappe.length}`;
    if (this.lungoIlPercorsoCache?.chiave === chiave) return this.lungoIlPercorsoCache.lista;
    const tappe = new Set(giro.tappe.map(t => String(t.id)));
    const lista: { poi: any; id: string }[] = [];
    for (const c of this.tuttiICandidati()) {
      const id = c?.id ?? c?.poiId;
      if (id == null || tappe.has(String(id))) continue;
      const lat = Number(c.lat), lon = Number(c.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      let vicino = false;
      for (let i = 0; i < giro.geometria.length; i += 3) {
        const g = giro.geometria[i];
        if (metri({ lat, lon }, { lat: g[0], lon: g[1] }) <= entro) { vicino = true; break; }
      }
      if (vicino) lista.push({ poi: c, id: String(id) });
    }
    this.lungoIlPercorsoCache = { chiave, lista };
    return lista;
  }

  incontroGiaFatto(id: string | number): boolean { return !!this.giro?.incontri?.includes(String(id)); }
  segnaIncontro(id: string | number) {
    if (!this.giro) return;
    (this.giro.incontri ||= []).push(String(id));
    this.salva();
  }

  // ── SALVARE E CONDIVIDERE ────────────────────────────────────────────────

  /**
   * Il giro come itinerario, nello stesso formato che PlanScreen legge e
   * salva (`giorni[].tappe[]`): cosi` finisce in "I miei itinerari" senza
   * una tabella nuova, e chi lo apre da un link lo vede come un piano.
   * Gli orari sono un'ipotesi ripetibile (partenza 9:30), non quelli di oggi:
   * un giro salvato si rifa` domani, o lo rifa` un amico.
   */
  comeItinerario(): any | null {
    const giro = this.giro;
    if (!giro) return null;
    const fatteDaFare = (t: TappaGiro) => !t.esclusa;
    const nelOrdine = giro.ordine.map(i => giro.tappe[i]).filter(fatteDaFare);
    const fuoriOrdine = giro.tappe.filter((t, i) => fatteDaFare(t) && !giro.ordine.includes(i));
    // Le fatte (fuori da `ordine` dopo un ricalcolo) vengono prima: sono
    // state camminate prima di quelle che restano.
    const sequenza = [...fuoriOrdine, ...nelOrdine];
    if (sequenza.length === 0) return null;

    const L = (this.lingua || 'it').toUpperCase() as Language;
    const tr = (k: string) => getTranslation(k, L);
    let minuti = 9 * 60 + 30;
    const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    const tappe = sequenza.map((t, i) => {
      const tratta = giro.tratte[i - fuoriOrdine.length];
      const cammino = Number(tratta?.duration) || CAMMINO_STIMATO_S;
      minuti += cammino / 60;
      const ascolto = (t.durata_ascolto_s ?? durataAscolto(t.testo)) || ASCOLTO_STIMATO_S;
      const riga = {
        ora: hhmm(minuti),
        titolo_tappa: t.nome,
        attivita: t.testo ? primaFrase(t.testo, 220) : tr('tour_tappa_descrizione'),
        tempo_necessario: `${Math.max(5, Math.round(ascolto / 60))} min`,
        tipo: t.categoria || 'monumenti',
        coordinate: { lat: t.lat, lng: t.lon },
        poi_id: t.id,
        link_info: '',
      };
      minuti += ascolto / 60;
      return riga;
    });

    const km = (giro.metri / 1000).toFixed(1);
    const citta = giro.citta || '';
    const nTappe = tappe.length === 1 ? tr('tour_tappa').toLowerCase() : tr('tour_tappe');
    // L'id resta lo stesso finche' il giro non cambia: Salva e poi Condividi
    // (o due tocchi ravvicinati) non devono creare due righe.
    if (!this.idSalvato) {
      this.idSalvato = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `giro-${Date.now()}`;
    }
    return {
      id: this.idSalvato,
      titolo: `${tr('tour_giro_a_piedi')}: ${tappe.length} ${nTappe}${citta ? ` · ${citta}` : ''}`,
      destinazione: citta,
      origine: 'dieci_tappe',
      giro: { metri: giro.metri, minuti_cammino: giro.minutiCammino, minuti_ascolto: giro.minutiAscolto, anello: giro.anello },
      info_viaggio: {
        precauzioni: [],
        suggerimenti: [
          tr('tour_suggerimento_percorso')
            .replace('{anello}', giro.anello ? tr('tour_ad_anello') : '')
            .replace('{km}', km)
            .replace('{min}', String(giro.minutiCammino))
            .replace(/^\s+/, ''),
        ],
        raccomandazioni: [],
        zone_da_evitare: [],
      },
      giorni: [{ giorno: 1, tappe }],
      totale_viaggio: '',
    };
  }

  /**
   * Salva nei "miei itinerari" e nella cache condivisa (e` quella che rende
   * apribile il link). Senza sessione si salva in locale, come fa PlanScreen.
   */
  async salvaComeItinerario(): Promise<{ id: string; link: string | null; titolo: string }> {
    // Due tocchi ravvicinati (Salva, poi subito Condividi) aspettano lo
    // stesso salvataggio invece di farne due.
    if (this.salvataggioInCorso) return this.salvataggioInCorso;
    this.salvataggioInCorso = this.salvaDavvero().finally(() => { this.salvataggioInCorso = null; });
    return this.salvataggioInCorso;
  }
  private salvataggioInCorso: Promise<{ id: string; link: string | null; titolo: string }> | null = null;

  private async salvaDavvero(): Promise<{ id: string; link: string | null; titolo: string }> {
    const piano = this.comeItinerario();
    if (!piano) throw new Error('niente da salvare');
    const adesso = new Date().toISOString();
    let userId: string | null = null;
    try { const { data } = await supabase.auth.getSession(); userId = data?.session?.user?.id || null; } catch { /* locale */ }

    if (userId) {
      const { error } = await supabase.from('user_itineraries').upsert({
        id: piano.id, user_id: userId, titolo: piano.titolo, dati_itinerario: piano, updated_at: adesso,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    } else {
      try {
        const locali: any[] = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
        const i = locali.findIndex(x => x?.id === piano.id);
        const riga = { id: piano.id, titolo: piano.titolo, dati_itinerario: piano, created_at: adesso, updated_at: adesso };
        if (i >= 0) locali[i] = { ...locali[i], ...riga, created_at: locali[i].created_at || adesso }; else locali.push(riga);
        localStorage.setItem('mock_db_user_itineraries', JSON.stringify(locali));
      } catch { /* niente spazio: il link sotto vale comunque se la cache condivisa risponde */ }
    }

    // La cache condivisa e` cio` che apre il link anche a chi non e` l'autore.
    // Se l'upsert fallisce NON si offre un link: sarebbe un link che apre il
    // nulla. L'itinerario resta comunque salvato per l'utente.
    let link: string | null = null;
    try {
      const { error } = await supabase.from('shared_itinerary_cache').upsert({
        id: piano.id, destination: piano.destinazione || getTranslation('tour_giro_a_piedi', (this.lingua || 'it').toUpperCase() as Language), days: 1, dati_itinerario: piano, created_at: adesso,
      }, { onConflict: 'id' });
      if (!error) link = `https://wip.guide/?giro=${encodeURIComponent(piano.id)}`;
    } catch { /* vedi sopra */ }

    return { id: piano.id, link, titolo: piano.titolo };
  }

  /** Dal link `?giro=ID` al piano, o null se non esiste (o non e` un giro). */
  async apriGiroCondiviso(id: string): Promise<any | null> {
    try {
      const { data, error } = await supabase.from('shared_itinerary_cache').select('dati_itinerario').eq('id', id).single();
      const piano = !error && data?.dati_itinerario;
      if (!piano || !Array.isArray(piano.giorni)) return null;
      // Chi apre un giro altrui ne ha una copia sua: l'id nuovo evita che il
      // salvataggio successivo scriva sulla riga dell'autore.
      return { ...piano, id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `giro-${Date.now()}` };
    } catch { return null; }
  }

  /**
   * La posizione adesso, o null. Con cache di 30 secondi: l'anteprima della
   * bozza si rifa` a ogni tocco e non deve accendere il GPS ogni volta.
   * `fresca` la forza: per far PARTIRE il giro si vuole la posizione vera.
   */
  posizioneAttuale(fresca = false): Promise<{ lat: number; lon: number } | null> {
    const c = this.posizioneCache;
    if (!fresca && c && Date.now() - c.ts < 30_000) return Promise.resolve(c.p);
    return new Promise((res) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return res(this.ultimaPosizione);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
          this.posizioneCache = { p: pos, ts: Date.now() };
          this.ultimaPosizione = pos;
          res(pos);
        },
        () => res(this.ultimaPosizione),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: fresca ? 5000 : 30000 },
      );
    });
  }

  // ── interni ──────────────────────────────────────────────────────────────
  /**
   * DOVE SI CHIUDE L'ANELLO, secondo la preferenza dell'utente.
   * `originale` (predefinita): il punto da cui il giro e` cominciato — li`
   * stanno l'auto e l'albergo. `corrente`: il punto dell'ultimo ricalcolo,
   * per chi ha cambiato base a meta` giornata.
   * Null se il giro non e` ad anello o se il punto non lo sappiamo (giri
   * ripresi da una versione precedente: li` il comportamento resta quello
   * di prima).
   */
  private metaAnello(g: GiroInCorso): { lat: number; lon: number } | null {
    if (!g.anello) return null;
    return this.preferenzaRientro === 'corrente'
      ? (g.partenzaCorrente ?? g.partenzaOriginale ?? null)
      : (g.partenzaOriginale ?? g.partenzaCorrente ?? null);
  }

  /**
   * Il `rientro=` da mandare al server: solo quando la meta` dell'anello e`
   * DIVERSA dal punto da cui si sta ricalcolando (sotto i 30 m sono lo stesso
   * posto e il parametro sporcherebbe solo la cache).
   */
  private rientroDaMandare(g: GiroInCorso, partenza: { lat: number; lon: number }): { lat: number; lon: number } | null {
    const meta = this.metaAnello(g);
    if (!meta) return null;
    return metri(meta, partenza) < 30 ? null : meta;
  }

  /**
   * Il punto a cui si torna ADESSO: la meta` dell'anello, ma solo quando
   * tutte le tappe vere sono state fatte — prima si sta ancora andando a una
   * tappa, non a casa.
   */
  private puntoDiRientro(): { lat: number; lon: number } | null {
    const g = this.giro;
    if (!g || this.tappaCorrente()) return null;
    return this.metaAnello(g);
  }

  /** In rientro: tappe finite, si sta camminando verso il punto di partenza. */
  private inRientro(): boolean { return !!this.giro && !!this.puntoDiRientro() && this.stato.stato !== 'FINITO'; }

  private tappaCorrente(): TappaGiro | null {
    if (!this.giro) return null;
    const i = this.giro.ordine[this.stato.tappaCorrente];
    return i == null ? null : this.giro.tappe[i];
  }

  /**
   * Indice del segmento su cui si e` stati agganciati per ultimo: la ricerca
   * riparte da poco prima. Si azzera quando cambia la geometria.
   */
  private ultimoIndiceSnap = 0;
  /** Prossimo istante in cui un ricalcolo automatico da deviazione e` ammesso. */
  private prossimoTentativoDeviazione = 0;

  /**
   * DISTANZA DAL PERCORSO, PER PROIEZIONE SUL TRATTO DAVANTI (03/09/2026).
   * Prima era il minimo dai VERTICI campionati uno ogni cinque dell'intera
   * geometria: su un anello la strada gia` fatta (o il ritorno) contava come
   * «sul percorso» anche stando su un'altra tratta, e su un rettilineo lungo
   * cinque vertici saltati coprivano 300 m — «fuori percorso» stando
   * esattamente sulla linea. Ora si proietta sul segmento (come
   * useWalkingNavigation.nearestOnRoute) in una finestra IN AVANTI
   * dall'ultimo punto agganciato: la strada alle spalle non rientra.
   */
  private scostamentoDalPercorso(pos: { lat: number; lon: number }): number {
    const g = this.giro?.geometria;
    if (!g || g.length < 2) return 0;
    const cos = Math.cos((pos.lat * Math.PI) / 180) || 1;
    const px = pos.lon * cos, py = pos.lat;
    const da = Math.max(0, Math.min(this.ultimoIndiceSnap, g.length - 2) - 15);
    let min = Infinity, idx = this.ultimoIndiceSnap;
    for (let i = da; i + 1 < g.length; i++) {
      const ax = g[i][1] * cos, ay = g[i][0], bx = g[i + 1][1] * cos, by = g[i + 1][0];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = metri(pos, { lat: ay + t * dy, lon: (ax + t * dx) / cos });
      if (d < min) { min = d; idx = i; }
    }
    if (min <= SOGLIE.deviazione_rientro_m) this.ultimoIndiceSnap = idx;
    return min === Infinity ? 0 : min;
  }

  /** L'ultimo fix del watch condiviso, se e` recente (15 s) e credibile (≤ 100 m). */
  private posizioneFresca(): { lat: number; lon: number } | null {
    try {
      const l = locationService.getLastLocation();
      if (!l || Date.now() - Number(l.timestamp) > 15_000 || !(Number(l.accuracy) <= 100)) return null;
      return { lat: l.latitude, lon: l.longitude };
    } catch { return null; }
  }

  private salva() {
    try { localStorage.setItem(CHIAVE_RIPRESA, JSON.stringify({ giro: this.giro, stato: this.stato, prescarico: this.prescarico, avviato: this.avviato })); } catch {}
  }

  private avvisa() {
    // Anche il `null` va detto (23/08/2026): dopo termina() la vista e` null e
    // prima non si avvisava nessuno — TourRouteLayer e il banner restavano
    // con l'ultimo giro disegnato finche' qualcos'altro non li ridisegnava.
    const v = this.vista();
    for (const fn of this.ascoltatori) { try { fn(v); } catch {} }
  }

  private avvisaBozza() {
    this.salvaBozza();
    for (const fn of this.ascoltatoriBozza) { try { fn(this.bozzaStato); } catch {} }
  }

  /** Solo la SELEZIONE: il percorso calcolato dipende da dove si e` adesso. */
  private salvaBozza() {
    try {
      const b = this.bozzaStato;
      if (b.tappe.length === 0) { localStorage.removeItem(CHIAVE_BOZZA); return; }
      localStorage.setItem(CHIAVE_BOZZA, JSON.stringify({
        modo: b.modo, tappe: b.tappe, minutiDisponibili: b.minutiDisponibili, ordineManuale: b.ordineManuale, senzaLimite: !!b.senzaLimite, quando: Date.now(),
      }));
    } catch { /* niente spazio: la bozza resta comunque in memoria */ }
  }
}

/** La prima frase di un testo, tagliata con garbo se e` troppo lunga. */
function primaFrase(testo: string, max: number): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  const fine = pulito.search(/[.!?](\s|$)/);
  const frase = fine > 20 ? pulito.slice(0, fine + 1) : pulito;
  return frase.length <= max ? frase : frase.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

export function metri(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.sqrt(dLat * dLat + dLon * dLon) * R;
}

export { primaFrase };
export const tourService = new TourService();
// PASS APPENA ATTIVATO → SI RIPROVA DA SOLI (29/08/2026, collaudo Realme).
// `passMancante` si accende al primo 402 e si spegneva solo toccando
// «Riprova» o «Crea il giro»: chi attivava il Day Pass dal pannello stesso
// (evento DAY_PASS_UPDATED_EVENT di dayPassService) si vedeva ancora
// chiedere di attivarlo. Stringa letterale, non l'import: e` un solo nome
// di evento, e tenere i due servizi senza dipendenze reciproche vale piu`
// della costante condivisa.
if (typeof window !== 'undefined') {
  window.addEventListener('wip-daypass-updated', () => tourService.riprovaPass());
}
export { raggruppaTappeVicine };
export type { TappaGiro, LivelloIngresso, PoiLungoStrada };
