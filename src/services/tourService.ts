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
 */
import { getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import {
  prossimoStato, durataAscolto, durataGiro, raggruppaTappeVicine,
  type TappaGiro, type StatoCorrente, type StatoGiro, type LivelloIngresso,
} from '../lib/tour/tourState';
import { decidi, CodaVoci, VOLUME_ABBASSATO } from '../lib/tour/audioDirector';

export interface GiroInCorso {
  id: string;
  tappe: TappaGiro[];
  /** Ordine deciso dal server: indici dentro `tappe`. */
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

const CHIAVE_RIPRESA = 'wip_giro_in_corso';

class TourService {
  private giro: GiroInCorso | null = null;
  private stato: StatoCorrente = { stato: 'IN_CAMMINO', tappaCorrente: 0, da: 0 };
  private coda = new CodaVoci();
  private ascoltatori = new Set<(v: VistaGiro) => void>();

  /** Crea il giro: chiede l'ordine al server e prepara le tappe. */
  async crea(tappe: TappaGiro[], opzioni: { anello?: boolean; ordina?: boolean; partenza: { lat: number; lon: number } }): Promise<GiroInCorso> {
    if (tappe.length === 0) throw new Error('nessuna tappa');
    if (tappe.length > 10) throw new Error('il giro accetta al massimo dieci tappe');

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
    const g = dati.wip_giro;

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
   * Pre-scaricamento. Il momento in cui il segnale muore e` esattamente quello
   * in cui sei fra i palazzi del centro storico — cioe` dentro il giro. Per una
   * funzione premium questo non e` un extra: e` la differenza fra un prodotto e
   * una dimostrazione.
   * Best-effort e in parallelo: una tappa che non si scarica non ferma il giro,
   * si prendera` al momento se la rete c'e`.
   */
  async prescarica(onProgresso?: (fatte: number, totali: number) => void): Promise<{ fatte: number; totali: number }> {
    if (!this.giro) return { fatte: 0, totali: 0 };
    const tappe = this.giro.tappe;
    let fatte = 0;
    await Promise.all(tappe.map(async (t) => {
      try {
        if (!t.testo) {
          const r = await fetch(getApiUrl(`/api/poi/audioguide?poi_id=${encodeURIComponent(String(t.id))}&language=it`));
          if (r.ok) {
            const j = await r.json();
            t.testo = j?.text || j?.testo || null;
            t.durata_ascolto_s = durataAscolto(t.testo);
          }
        }
      } catch { /* si prendera` al momento */ }
      fatte++;
      onProgresso?.(fatte, tappe.length);
    }));
    this.salva();
    return { fatte, totali: tappe.length };
  }

  /** Un campione di posizione: fa avanzare la macchina a stati. */
  aggiorna(pos: { lat: number; lon: number; velocita?: number }, extra?: { guidaInCorso?: boolean; pausaManuale?: boolean; suAttraversamento?: boolean; metriAllaSvolta?: number | null }) {
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
   * Salta una tappa. Le rimanenti si riordinano DA DOVE SI E` ADESSO: non si
   * torna indietro a recuperare, che e` quello che farebbe un elenco fisso.
   */
  async salta(posizione?: { lat: number; lon: number }) {
    if (!this.giro) return;
    const t = this.tappaCorrente();
    if (t) t.saltata = true;
    const restanti = this.giro.ordine.slice(this.stato.tappaCorrente + 1);
    if (restanti.length > 1 && posizione) {
      try {
        const tappe = restanti.map(i => this.giro!.tappe[i]);
        await this.crea(tappe, { partenza: posizione, anello: this.giro.anello });
        return;
      } catch { /* si continua nell'ordine che c'era */ }
    }
    this.completaTappa();
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
    const fatte = this.giro.tappe.filter(x => x.fatta || x.saltata).length;
    const restanti = this.giro.tratte.slice(this.stato.tappaCorrente).reduce((s: number, l: any) => s + (l.distance || 0), 0);
    return {
      stato: this.stato.stato,
      tappaCorrente: this.stato.tappaCorrente,
      tappeFatte: fatte,
      tappeTotali: this.giro.ordine.length,
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
