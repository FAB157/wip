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
import { getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import { saveOfflineAudio, getOfflineAudioUrl } from '../lib/offlineStorage';
import {
  prossimoStato, durataAscolto, durataGiro, raggruppaTappeVicine,
  type TappaGiro, type StatoCorrente, type StatoGiro, type LivelloIngresso,
} from '../lib/tour/tourState';
import { decidi, CodaVoci, VOLUME_ABBASSATO } from '../lib/tour/audioDirector';
import { poiLungoIlCorridoio, type PoiLungoStrada } from '../lib/tour/corridoio';

/** Il tetto delle tappe: decisione di prodotto, non tecnica. */
export const MAX_TAPPE = 10;

/** Quanto si stima di ascoltare a una tappa di cui non si ha ancora il testo. */
const ASCOLTO_STIMATO_S = 180;
/** Cammino stimato fra due tappe quando il server non ha ancora dato le tratte. */
const CAMMINO_STIMATO_S = 450 / 1.35;
/** Entro questi metri dalla tappa tolta si cerca una sostituta. */
const RAGGIO_SOSTITUTA_M = 250;
/** Una proposta di sostituzione non resta in piedi per sempre. */
const PROPOSTA_VALIDA_MS = 120_000;

export interface GiroInCorso {
  id: string;
  tappe: TappaGiro[];
  /** Ordine deciso dal server: indici dentro `tappe`. Dopo un ricalcolo contiene SOLO le tappe ancora da fare. */
  ordine: number[];
  geometria: [number, number][];
  metri: number;
  minutiCammino: number;
  minutiAscolto: number;
  anello: boolean;
  problemi: string[];
  /** Istruzioni per tratta, come le manda il server (dialetto OSRM). */
  tratte: any[];
  creatoIl: number;
  /** POI incontrati lungo la strada e gia` annunciati: una volta sola per giro. */
  incontri?: string[];
  /** Citta` del giro, se la sappiamo: serve al titolo quando lo si salva. */
  citta?: string | null;
}

export interface PropostaSostituta {
  tolta: TappaGiro;
  sostituta: TappaGiro;
  /** Distanza fra la tappa tolta e la sostituta. */
  metri: number;
  quando: number;
}

export interface VistaGiro {
  stato: StatoGiro;
  tappaCorrente: number;
  tappeFatte: number;
  tappeTotali: number;
  metriTotali: number;
  metriRimanenti: number;
  nomeTappa: string | null;
  istruzione: string | null;
  metriAllaSvolta: number | null;
  inPausa: boolean;
  /** "A 120 m c'e` X, lo metto al suo posto?" — null se non c'e` niente da proporre. */
  proposta: PropostaSostituta | null;
}

/**
 * La bozza: le tappe scelte ma non ancora camminate, col percorso d'anteprima.
 * `ordine` e` null finche` il server non ha risposto; `geometria` vuota vuol
 * dire "anteprima non disponibile" e chi disegna tira una linea dritta.
 */
export interface BozzaGiro {
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
  /** L'utente ha trascinato le tappe: l'ordine e` il suo, il server non lo tocca. */
  ordineManuale: boolean;
  /** "Ho un'ora": il giro si taglia alle tappe che ci stanno. null = nessun limite. */
  minutiDisponibili: number | null;
  /** Quante tappe, in ordine di cammino, stanno nel tempo. null = nessun limite. */
  tappeNelTempo: number | null;
  /** I POI che il giro sfiorerebbe, letti lungo il corridoio del tracciato: candidati ad aggiungersi. */
  lungoLaStrada: PoiLungoStrada[];
  cercandoLungoStrada: boolean;
}

const CHIAVE_RIPRESA = 'wip_giro_in_corso';
const BOZZA_VUOTA: BozzaGiro = {
  tappe: [], ordine: null, geometria: [], metri: 0, minutiCammino: 0, tratteSecondi: [],
  problemi: [], partenza: null, calcolando: false, errore: null,
  ordineManuale: false, minutiDisponibili: null, tappeNelTempo: null,
  lungoLaStrada: [], cercandoLungoStrada: false,
};

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

/** Da un POI qualsiasi (radar, mappa, scheda) alla tappa del giro. */
export function tappaDaPoi(p: any): TappaGiro {
  return {
    id: p.id ?? p.poiId,
    nome: p.name || p.nome || 'Tappa',
    lat: Number(p.lat), lon: Number(p.lon),
    categoria: p.category || p.poiType || p.baseCategory || null,
    citta: p.city || p.citta || null,
    // Se il POI porta gia` un ingresso, e` li` che si arriva: la differenza
    // fra "sei arrivato" davanti a un muro e davanti a una porta.
    ingresso: (p.entrance_lat && p.entrance_lon)
      ? { lat: Number(p.entrance_lat), lon: Number(p.entrance_lon), livello: livelloIngresso(p) }
      : null,
  };
}

class TourService {
  private giro: GiroInCorso | null = null;
  private stato: StatoCorrente = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: 0 };
  private coda = new CodaVoci();
  private ascoltatori = new Set<(v: VistaGiro) => void>();
  private pausaManuale = false;
  private proposta: PropostaSostituta | null = null;

  private bozzaStato: BozzaGiro = { ...BOZZA_VUOTA };
  private ascoltatoriBozza = new Set<(b: BozzaGiro) => void>();
  private bozzaVersione = 0;
  private bozzaTimer: ReturnType<typeof setTimeout> | null = null;
  /** Senza pass il server rifiuta l'anteprima: non ha senso richiederla a ogni tocco. */
  private passMancante = false;

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
  private posizioneCache: { p: { lat: number; lon: number }; ts: number } | null = null;

  // ── BOZZA: la scelta delle tappe ─────────────────────────────────────────

  bozza(): BozzaGiro { return this.bozzaStato; }
  bozzaHa(id: string | number): boolean { return this.bozzaStato.tappe.some(t => String(t.id) === String(id)); }
  bozzaPiena(): boolean { return this.bozzaStato.tappe.length >= MAX_TAPPE; }

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
    const t = tappaDaPoi(poi);
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
    let secondi = 0;
    for (let i = 0; i < sequenza.length; i++) {
      const cammino = b.tratteSecondi[i] ?? CAMMINO_STIMATO_S;
      const ascolto = sequenza[i].durata_ascolto_s ?? durataAscolto(sequenza[i].testo) ?? ASCOLTO_STIMATO_S;
      if (secondi + cammino + (ascolto || ASCOLTO_STIMATO_S) > tetto) return i;
      secondi += cammino + (ascolto || ASCOLTO_STIMATO_S);
    }
    return sequenza.length;
  }

  bozzaSvuota() {
    this.bozzaVersione++;
    if (this.bozzaTimer) { clearTimeout(this.bozzaTimer); this.bozzaTimer = null; }
    // Il tempo scelto si tiene: e` una preferenza, non parte della selezione.
    this.bozzaStato = { ...BOZZA_VUOTA, minutiDisponibili: this.bozzaStato.minutiDisponibili };
    this.avvisaBozza();
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
      this.bozzaStato = { ...BOZZA_VUOTA, minutiDisponibili: this.bozzaStato.minutiDisponibili };
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
    // Il giro a piu` tappe e` premium e il cancello sta sul server. Una volta
    // ricevuto il 402 si smette di chiedere: la selezione continua a
    // funzionare, con la linea dritta al posto del percorso.
    if (this.passMancante && tappe.length > 1) {
      this.bozzaStato = { ...this.bozzaStato, partenza, ordine: null, geometria: [], tratteSecondi: [], calcolando: false, errore: 'PASS_RICHIESTO' };
      this.bozzaStato.tappeNelTempo = this.contaTappeNelTempo(this.bozzaStato);
      this.avvisaBozza();
      return;
    }
    try {
      const { g, dati } = await this.chiediRotta(tappe, { partenza, anello: true, ordina: !this.bozzaStato.ordineManuale });
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
      };
      // Col tracciato in mano si guarda cosa c'e` lungo la strada. In
      // parallelo: l'anteprima non aspetta il database.
      void this.cercaLungoLaStradaBozza(mia);
    } catch (e: any) {
      if (mia !== this.bozzaVersione) return;
      const m = String(e?.message || '');
      if (m.startsWith('PASS_RICHIESTO')) this.passMancante = true;
      this.bozzaStato = {
        ...this.bozzaStato, partenza, ordine: null, geometria: [], metri: 0, minutiCammino: 0, tratteSecondi: [],
        calcolando: false, errore: m.startsWith('PASS_RICHIESTO') ? 'PASS_RICHIESTO' : (m || 'anteprima non disponibile'),
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
    const giro = await this.crea(tappe, { partenza, anello: true, ordina: false });
    this.bozzaSvuota();
    return giro;
  }

  // ── GIRO ─────────────────────────────────────────────────────────────────

  /** Crea il giro: chiede l'ordine al server e prepara le tappe. */
  async crea(tappe: TappaGiro[], opzioni: { anello?: boolean; ordina?: boolean; partenza: { lat: number; lon: number } }): Promise<GiroInCorso> {
    if (tappe.length === 0) throw new Error('nessuna tappa');
    if (tappe.length > MAX_TAPPE) throw new Error('il giro accetta al massimo dieci tappe');

    const { g, dati } = await this.chiediRotta(tappe, opzioni);

    const giro: GiroInCorso = {
      id: `giro-${Date.now()}`,
      tappe: tappe.map(t => ({ ...t, durata_ascolto_s: t.durata_ascolto_s ?? durataAscolto(t.testo) })),
      ordine: g.ordine,
      geometria: (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]]),
      metri: g.metri_totali,
      minutiCammino: g.minuti_cammino,
      minutiAscolto: 0,
      anello: g.anello,
      problemi: g.problemi || [],
      tratte: dati.routes?.[0]?.legs || [],
      creatoIl: Date.now(),
      incontri: [],
      citta: tappe.map(t => t.citta).find(Boolean) || null,
    };
    const d = durataGiro(giro.tappe, g.minuti_cammino * 60);
    giro.minutiAscolto = d.ascolto_min;

    this.giro = giro;
    this.proposta = null;
    this.pausaManuale = false;
    this.corridoio = [];
    this.lungoIlPercorsoCache = null;
    this.stato = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: Date.now() };
    this.salva();
    this.avvisa();
    void this.cercaLungoLaStradaGiro();
    return giro;
  }

  /**
   * La chiamata al server, in un posto solo: la usano il giro, l'anteprima
   * della bozza e il ricalcolo dopo un'esclusione. Tre copie di questa
   * funzione sarebbero tre modi diversi di sbagliare l'intestazione.
   */
  private async chiediRotta(
    tappe: TappaGiro[],
    opzioni: { anello?: boolean; ordina?: boolean; partenza: { lat: number; lon: number } },
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

    const url = getApiUrl(`/api/tour/foot/${coords}?anello=${opzioni.anello ? 'true' : 'false'}&ordina=${opzioni.ordina === false ? 'false' : 'true'}`);
    const r = await fetch(url, { headers: intestazioni });
    if (r.status === 402) {
      const j = await r.json().catch(() => ({}));
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
    lingua = 'it',
  ): Promise<{ testi: number; audio: number; totali: number }> {
    if (!this.giro) return { testi: 0, audio: 0, totali: 0 };
    const tappe = this.giro.tappe;
    let fatte = 0, testi = 0, audio = 0;

    await Promise.all(tappe.map(async (t) => {
      // 1. Il testo. Senza, non c'e` niente da dire alla tappa.
      try {
        if (!t.testo) {
          const r = await fetch(getApiUrl(`/api/poi/audioguide?poi_id=${encodeURIComponent(String(t.id))}&language=${lingua}`));
          if (r.ok) {
            const j = await r.json();
            t.testo = j?.text || j?.testo || j?.audio_script || null;
            t.durata_ascolto_s = durataAscolto(t.testo);
          }
        }
        if (t.testo) testi++;
      } catch { /* si prendera` al momento */ }

      // 2. L'AUDIO. Il testo da solo non basta: senza rete la sintesi vocale
      //    del server non risponde, e il giro premium diventa muto proprio nel
      //    centro storico dove il segnale manca. Si scarica l'MP3 e si mette in
      //    IndexedDB con la stessa chiave che usa gia` la scheda POI, cosi` chi
      //    riproduce lo trova senza sapere che viene da un giro.
      try {
        const chiave = `giro_${this.giro!.id}_${t.id}_${lingua}`;
        const gia = await getOfflineAudioUrl(chiave);
        if (gia) { t.audio = gia; audio++; }
        else if (t.testo) {
          const r = await fetch(getApiUrl('/api/tts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: t.testo, lang: lingua, poi_id: t.id }),
          });
          if (r.ok) {
            const j = await r.json().catch(() => null);
            const url = j?.audioUrl || j?.url || null;
            if (url && await saveOfflineAudio(url, chiave)) {
              t.audio = await getOfflineAudioUrl(chiave);
              audio++;
            }
          }
        }
      } catch { /* l'audio si generera` al momento se la rete c'e` */ }

      fatte++;
      onProgresso?.(fatte, tappe.length);
    }));

    this.salva();
    return { testi, audio, totali: tappe.length };
  }

  /** Un campione di posizione: fa avanzare la macchina a stati. */
  aggiorna(pos: { lat: number; lon: number; velocita?: number }, extra?: { guidaInCorso?: boolean; pausaManuale?: boolean; suAttraversamento?: boolean; metriAllaSvolta?: number | null }) {
    this.ultimaPosizione = { lat: pos.lat, lon: pos.lon };
    if (!this.giro) return;
    const tappa = this.tappaCorrente();
    if (!tappa) { this.stato = { ...this.stato, stato: 'FINITO' }; this.avvisa(); return; }

    const p = tappa.ingresso ?? { lat: tappa.lat, lon: tappa.lon };
    const distanza = metri(pos, p);
    const scostamento = this.scostamentoDalPercorso(pos);

    this.stato = prossimoStato(this.stato, tappa, {
      distanzaTappa: distanza,
      scostamento,
      velocita: pos.velocita ?? 1.3,
      guidaInCorso: !!extra?.guidaInCorso,
      pausaManuale: extra?.pausaManuale ?? this.pausaManuale,
      adesso: Date.now(),
    });
    this.salva();
    this.avvisa();
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
    if (!this.tappaCorrente()) this.stato = { ...this.stato, stato: 'FINITO' };
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
    await this.ricalcola(posizione);
    this.proposta = this.cercaSostituta(t);
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

  /**
   * Rifa` il percorso sulle tappe ancora da fare, partendo dalla posizione
   * data (o dall'ultima nota). `ordine` da qui in poi contiene SOLO le tappe
   * restanti: le fatte restano in `tappe` per il conteggio e per la mappa.
   */
  private async ricalcola(posizione?: { lat: number; lon: number }) {
    const giro = this.giro;
    if (!giro) return;
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
      return;
    }

    const partenza = posizione ?? this.ultimaPosizione ?? await this.posizioneAttuale();
    if (partenza) {
      try {
        const { g, dati } = await this.chiediRotta(restanti, { partenza, anello: giro.anello });
        giro.ordine = (g.ordine as number[]).map(i => giro.tappe.indexOf(restanti[i]));
        giro.geometria = (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]]);
        giro.tratte = dati.routes?.[0]?.legs || [];
        giro.metri = g.metri_totali;
        giro.minutiCammino = g.minuti_cammino;
        giro.problemi = g.problemi || [];
        this.stato = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: Date.now() };
        this.salva(); this.avvisa();
        void this.cercaLungoLaStradaGiro();
        return;
      } catch { /* si continua nell'ordine che c'era, senza la tappa tolta */ }
    }

    // Riserva senza server: stesso ordine, meno la tappa tolta. Le tratte si
    // tengono allineate all'ordine, altrimenti i metri rimanenti mentirebbero.
    const posizioniTenute = giro.ordine.map((i, pos) => (daFare(giro.tappe[i]) ? pos : -1)).filter(p => p >= 0);
    giro.ordine = [...posizioniTenute.map(p => giro.ordine[p]), ...nuove.map(t => giro.tappe.indexOf(t))];
    giro.tratte = posizioniTenute.map(p => giro.tratte[p]).filter(Boolean);
    this.stato = { ...this.stato, tappaCorrente: 0, stato: 'IN_CAMMINO', da: Date.now() };
    this.salva(); this.avvisa();
  }

  termina() {
    this.giro = null;
    this.proposta = null;
    this.pausaManuale = false;
    this.corridoio = [];
    this.lungoIlPercorsoCache = null;
    this.coda.svuota();
    this.stato = { stato: 'FINITO', tappaCorrente: 0, da: Date.now() };
    try { localStorage.removeItem(CHIAVE_RIPRESA); } catch {}
    this.avvisa();
  }

  /** L'app chiusa a meta` giro non deve perdere il giro. */
  riprendi(): GiroInCorso | null {
    try {
      const grezzo = localStorage.getItem(CHIAVE_RIPRESA);
      if (!grezzo) return null;
      const { giro, stato } = JSON.parse(grezzo);
      // Un giro di ieri non si riprende: si e` andati a dormire, non in pausa.
      if (!giro || Date.now() - giro.creatoIl > 12 * 60 * 60 * 1000) { localStorage.removeItem(CHIAVE_RIPRESA); return null; }
      this.giro = giro; this.stato = stato;
      this.avvisa();
      void this.cercaLungoLaStradaGiro();
      return giro;
    } catch { return null; }
  }

  vista(): VistaGiro | null {
    if (!this.giro) return null;
    const t = this.tappaCorrente();
    // Le escluse non contano: non dovevano esserci. Le saltate si`, come fatte.
    const valide = this.giro.tappe.filter(x => !x.esclusa);
    const fatte = valide.filter(x => x.fatta || x.saltata).length;
    const restanti = this.giro.tratte.slice(this.stato.tappaCorrente).reduce((s: number, l: any) => s + (l?.distance || 0), 0);
    const proposta = this.proposta && Date.now() - this.proposta.quando < PROPOSTA_VALIDA_MS ? this.proposta : null;
    return {
      stato: this.stato.stato,
      tappaCorrente: this.stato.tappaCorrente,
      tappeFatte: fatte,
      tappeTotali: valide.length,
      metriTotali: this.giro.metri,
      metriRimanenti: Math.round(restanti),
      nomeTappa: t?.nome ?? null,
      istruzione: null,
      metriAllaSvolta: null,
      inPausa: this.stato.stato === 'IN_PAUSA',
      proposta,
    };
  }

  inCorso() { return !!this.giro; }
  datiGiro() { return this.giro; }
  /** La tappa verso cui si sta andando adesso, o null. */
  tappaAttuale(): TappaGiro | null { return this.tappaCorrente(); }
  eTappaDelGiro(id: string | number): boolean { return !!this.giro?.tappe.some(t => String(t.id) === String(id)); }
  volumeGuidaAbbassato() { return VOLUME_ABBASSATO; }

  ascolta(fn: (v: VistaGiro) => void) { this.ascoltatori.add(fn); return () => { this.ascoltatori.delete(fn); }; }

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
    const chiave = `${giro.geometria.length}|${giro.metri}|${this.candidati.length}|${this.corridoio.length}|${giro.tappe.length}`;
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
        attivita: t.testo ? primaFrase(t.testo, 220) : 'Tappa del giro a piedi con audioguida WIP.',
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
    return {
      id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `giro-${Date.now()}`,
      titolo: `Giro a piedi: ${tappe.length} ${tappe.length === 1 ? 'tappa' : 'tappe'}${citta ? ` a ${citta}` : ''}`,
      destinazione: citta,
      origine: 'dieci_tappe',
      giro: { metri: giro.metri, minuti_cammino: giro.minutiCammino, minuti_ascolto: giro.minutiAscolto, anello: giro.anello },
      info_viaggio: {
        precauzioni: [],
        suggerimenti: [`Percorso ${giro.anello ? 'ad anello ' : ''}di ${km} km: circa ${giro.minutiCammino} minuti a piedi, più l'ascolto delle audioguide.`],
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
  async salvaComeItinerario(): Promise<{ id: string; link: string; titolo: string }> {
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
        const locali = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
        locali.push({ id: piano.id, titolo: piano.titolo, dati_itinerario: piano, created_at: adesso, updated_at: adesso });
        localStorage.setItem('mock_db_user_itineraries', JSON.stringify(locali));
      } catch { /* niente spazio: il link sotto vale comunque se la cache condivisa risponde */ }
    }

    // La cache condivisa e` cio` che apre il link anche a chi non e` l'autore.
    // Best-effort: se fallisce, l'itinerario e` comunque salvato per l'utente.
    try {
      await supabase.from('shared_itinerary_cache').upsert({
        id: piano.id, destination: piano.destinazione || 'Giro a piedi', days: 1, dati_itinerario: piano, created_at: adesso,
      }, { onConflict: 'id' });
    } catch { /* vedi sopra */ }

    return { id: piano.id, link: `https://wip.guide/?giro=${encodeURIComponent(piano.id)}`, titolo: piano.titolo };
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
  private tappaCorrente(): TappaGiro | null {
    if (!this.giro) return null;
    const i = this.giro.ordine[this.stato.tappaCorrente];
    return i == null ? null : this.giro.tappe[i];
  }

  /** Distanza dal percorso: il minimo sui punti della geometria. */
  private scostamentoDalPercorso(pos: { lat: number; lon: number }): number {
    if (!this.giro?.geometria?.length) return 0;
    let min = Infinity;
    // Un campione ogni cinque punti: su una geometria da 400 punti la
    // differenza e` di pochi metri e il costo scende di cinque volte.
    for (let i = 0; i < this.giro.geometria.length; i += 5) {
      const g = this.giro.geometria[i];
      const d = metri(pos, { lat: g[0], lon: g[1] });
      if (d < min) min = d;
    }
    return min === Infinity ? 0 : min;
  }

  private salva() {
    try { localStorage.setItem(CHIAVE_RIPRESA, JSON.stringify({ giro: this.giro, stato: this.stato })); } catch {}
  }

  private avvisa() {
    const v = this.vista();
    if (v) for (const fn of this.ascoltatori) { try { fn(v); } catch {} }
  }

  private avvisaBozza() {
    for (const fn of this.ascoltatoriBozza) { try { fn(this.bozzaStato); } catch {} }
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
export { raggruppaTappeVicine };
export type { TappaGiro, LivelloIngresso, PoiLungoStrada };
