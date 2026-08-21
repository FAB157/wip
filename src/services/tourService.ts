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
 */
import { getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import { saveOfflineAudio, getOfflineAudioUrl } from '../lib/offlineStorage';
import {
  prossimoStato, durataAscolto, durataGiro, raggruppaTappeVicine,
  type TappaGiro, type StatoCorrente, type StatoGiro, type LivelloIngresso,
} from '../lib/tour/tourState';
import { decidi, CodaVoci, VOLUME_ABBASSATO } from '../lib/tour/audioDirector';

/** Il tetto delle tappe: decisione di prodotto, non tecnica. */
export const MAX_TAPPE = 10;

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
}

/**
 * La bozza: le tappe scelte ma non ancora camminate, col percorso d'anteprima.
 * `ordine` e` null finche` il server non ha risposto; `geometria` vuota vuol
 * dire "anteprima non disponibile" e chi disegna tira una linea dritta.
 */
export interface BozzaGiro {
  /** Nell'ordine in cui l'utente le ha scelte. */
  tappe: TappaGiro[];
  /** Ordine di cammino deciso dal server: indici dentro `tappe`. */
  ordine: number[] | null;
  geometria: [number, number][];
  metri: number;
  minutiCammino: number;
  problemi: string[];
  partenza: { lat: number; lon: number } | null;
  calcolando: boolean;
  /** 'PASS_RICHIESTO' | 'POSIZIONE' | altro messaggio; null se tutto bene. */
  errore: string | null;
}

const CHIAVE_RIPRESA = 'wip_giro_in_corso';
const BOZZA_VUOTA: BozzaGiro = {
  tappe: [], ordine: null, geometria: [], metri: 0, minutiCammino: 0,
  problemi: [], partenza: null, calcolando: false, errore: null,
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

  private bozzaStato: BozzaGiro = { ...BOZZA_VUOTA };
  private ascoltatoriBozza = new Set<(b: BozzaGiro) => void>();
  private bozzaVersione = 0;
  private bozzaTimer: ReturnType<typeof setTimeout> | null = null;
  /** Senza pass il server rifiuta l'anteprima: non ha senso richiederla a ogni tocco. */
  private passMancante = false;

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

  bozzaSvuota() {
    this.bozzaVersione++;
    if (this.bozzaTimer) { clearTimeout(this.bozzaTimer); this.bozzaTimer = null; }
    this.bozzaStato = { ...BOZZA_VUOTA };
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
      this.bozzaStato = { ...BOZZA_VUOTA };
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
      this.bozzaStato = { ...this.bozzaStato, partenza: null, ordine: null, geometria: [], calcolando: false, errore: 'POSIZIONE' };
      this.avvisaBozza();
      return;
    }
    // Il giro a piu` tappe e` premium e il cancello sta sul server. Una volta
    // ricevuto il 402 si smette di chiedere: la selezione continua a
    // funzionare, con la linea dritta al posto del percorso.
    if (this.passMancante && tappe.length > 1) {
      this.bozzaStato = { ...this.bozzaStato, partenza, ordine: null, geometria: [], calcolando: false, errore: 'PASS_RICHIESTO' };
      this.avvisaBozza();
      return;
    }
    try {
      const { g, dati } = await this.chiediRotta(tappe, { partenza, anello: true, ordina: true });
      if (mia !== this.bozzaVersione) return;
      this.bozzaStato = {
        ...this.bozzaStato,
        partenza,
        ordine: g.ordine,
        geometria: (dati.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]] as [number, number]),
        metri: g.metri_totali,
        minutiCammino: g.minuti_cammino,
        problemi: g.problemi || [],
        calcolando: false,
        errore: null,
      };
    } catch (e: any) {
      if (mia !== this.bozzaVersione) return;
      const m = String(e?.message || '');
      if (m.startsWith('PASS_RICHIESTO')) this.passMancante = true;
      this.bozzaStato = {
        ...this.bozzaStato, partenza, ordine: null, geometria: [], metri: 0, minutiCammino: 0,
        calcolando: false, errore: m.startsWith('PASS_RICHIESTO') ? 'PASS_RICHIESTO' : (m || 'anteprima non disponibile'),
      };
    }
    this.avvisaBozza();
  }

  /** Dalla bozza al giro vero. La bozza si svuota solo se il giro parte. */
  async avviaDaBozza(): Promise<GiroInCorso> {
    const tappe = this.bozzaStato.tappe;
    if (tappe.length === 0) throw new Error('nessuna tappa');
    const partenza = await this.posizioneAttuale(true);
    if (!partenza) throw new Error('Non riesco a sapere dove sei: serve la posizione per costruire il giro.');
    // Si ritenta sempre il server: il pass puo` essere stato attivato nel frattempo.
    this.passMancante = false;
    const giro = await this.crea(tappe, { partenza, anello: true });
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
    };
    const d = durataGiro(giro.tappe, g.minuti_cammino * 60);
    giro.minutiAscolto = d.ascolto_min;

    this.giro = giro;
    this.stato = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: Date.now() };
    this.salva();
    this.avvisa();
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
      pausaManuale: !!extra?.pausaManuale,
      adesso: Date.now(),
    });
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
   * la corrente — e` la differenza con `salta`.
   */
  async escludi(id: string | number, posizione?: { lat: number; lon: number }) {
    if (!this.giro) return;
    const t = this.giro.tappe.find(x => String(x.id) === String(id));
    if (!t || t.fatta || t.saltata || t.esclusa) return;
    t.esclusa = true;
    const eraCorrente = this.tappaCorrente() === t;
    if (eraCorrente) this.coda.svuota();
    await this.ricalcola(posizione);
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
    const restanti = giro.ordine.map(i => giro.tappe[i]).filter(daFare);

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
        return;
      } catch { /* si continua nell'ordine che c'era, senza la tappa tolta */ }
    }

    // Riserva senza server: stesso ordine, meno la tappa tolta. Le tratte si
    // tengono allineate all'ordine, altrimenti i metri rimanenti mentirebbero.
    const posizioniTenute = giro.ordine.map((i, pos) => (daFare(giro.tappe[i]) ? pos : -1)).filter(p => p >= 0);
    giro.ordine = posizioniTenute.map(p => giro.ordine[p]);
    giro.tratte = posizioniTenute.map(p => giro.tratte[p]).filter(Boolean);
    this.stato = { ...this.stato, tappaCorrente: 0, stato: 'IN_CAMMINO', da: Date.now() };
    this.salva(); this.avvisa();
  }

  termina() {
    this.giro = null;
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
    };
  }

  inCorso() { return !!this.giro; }
  datiGiro() { return this.giro; }
  volumeGuidaAbbassato() { return VOLUME_ABBASSATO; }

  ascolta(fn: (v: VistaGiro) => void) { this.ascoltatori.add(fn); return () => { this.ascoltatori.delete(fn); }; }

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

function metri(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.sqrt(dLat * dLat + dLon * dLon) * R;
}

export const tourService = new TourService();
export { raggruppaTappeVicine };
export type { TappaGiro, LivelloIngresso };
