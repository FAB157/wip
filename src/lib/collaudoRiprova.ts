// =====================================================================
// RIPROVA A TAVOLINO (04/10/2026). La traccia di una passeggiata già fatta
// viene rigiocata con le regole DI OGGI: a ogni posizione si misura la distanza
// di strada da ogni luogo (stesso motore dell'app, distanzaStrada.ts, sulle
// road tiles di adesso e sui punti d'arrivo di adesso) e si annota dove
// scatterebbero avviso e guida. Così una correzione — un punto d'arrivo
// spostato, una strada aggiunta, una regola cambiata — si verifica sulla stessa
// passeggiata, senza rifarla.
//
// COSA NON RIGIOCA (va detto a chi legge): il gate di bussola, le attese fra un
// luogo e l'altro, i filtri di categoria, la regola del muro per i luoghi senza
// porta, e il filtro sul GPS impreciso. Dice DOVE scatterebbe per distanza, non
// se l'app avrebbe poi parlato.
// Funzione pura: provabile con scratch/collaudo-riprova.mts.
// =====================================================================
// ATTENZIONE: questo file lo importa server.ts, e su Vercel il server gira come modulo ESM vero:
// gli import relativi DEVONO avere l'estensione `.js`. Senza, l'intera API va giù all'avvio
// (FUNCTION_INVOCATION_FAILED) — successo il 04/10/2026, e il bundle di prova in locale non se ne accorge.
// Controllo prima di ogni deploy: node scratch/verifica-import-server.mjs
import { creaGrafoStrade, distanzaCheDecide } from './geofencing/distanzaStrada.js';
import type { PuntoTraccia, ScattoGuida } from './collaudoRegistro.js';

export interface LuogoRiprova { id: string; nome: string; lat: number; lon: number; fonte?: string }
export interface ScattoRiprova {
  id: string; nome: string; tipo: 'avviso' | 'arrivo';
  ora: string; lat: number; lon: number; puntoLat: number; puntoLon: number;
  strada: number | null; aria: number; raggio: number;
  /** Lo scatto registrato quel giorno per lo stesso luogo e tipo, se c'era, e di quanti metri si è spostato. */
  registrato: { strada: number | null; lat: number; lon: number } | null;
  spostatoM: number | null;
}
export interface EsitoRiprova { scatti: ScattoRiprova[]; luoghi: number; maiScattati: Array<{ id: string; nome: string; minimaStrada: number | null; minimaAria: number }>; conStrade: boolean }

const metri = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const R = 6371000, f = Math.PI / 180, dLa = (bLat - aLat) * f, dLo = (bLon - aLon) * f;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * f) * Math.cos(bLat * f) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export function riprovaTraccia(
  traccia: PuntoTraccia[],
  luoghi: LuogoRiprova[],
  rete: number[][][],
  raggi: { arrivo: number; avviso: number },
  registrati: ScattoGuida[] = [],
): EsitoRiprova {
  const grafo = rete?.length ? creaGrafoStrade(rete) : null;
  const stato = new Map<string, { avvisato: boolean; arrivato: boolean; minStrada: number | null; minAria: number }>();
  for (const l of luoghi) stato.set(l.id, { avvisato: false, arrivato: false, minStrada: null, minAria: Infinity });
  const scatti: ScattoRiprova[] = [];
  const diQuelGiorno = (id: string, tipo: 'avviso' | 'arrivo') =>
    registrati.find(s => s.id === id && (tipo === 'avviso' ? s.tipo === 'avviso' : s.tipo === 'arrivo' || s.tipo === 'arrivo-muro')) || null;

  for (const p of traccia) {
    let sorgente: ReturnType<NonNullable<typeof grafo>['da']> = null;
    let cercata = false;
    for (const l of luoghi) {
      const s = stato.get(l.id)!;
      if (s.arrivato) continue;
      const aria = metri(p.lat, p.lon, l.lat, l.lon);
      if (aria < s.minAria) s.minAria = aria;
      if (aria > raggi.avviso + 50) continue; // di strada non può essere più vicino
      if (!cercata) { cercata = true; try { sorgente = grafo ? grafo.da(p.lat, p.lon, Math.max(450, raggi.avviso + 150)) : null; } catch { sorgente = null; } }
      const strada = sorgente ? sorgente.verso(l.lat, l.lon) : null;
      const d = distanzaCheDecide(aria, strada);
      if (Number.isFinite(d) && (s.minStrada == null || d < s.minStrada)) s.minStrada = d;
      const annota = (tipo: 'avviso' | 'arrivo', raggio: number) => {
        const r = diQuelGiorno(l.id, tipo);
        scatti.push({
          id: l.id, nome: l.nome, tipo, ora: p.ora, lat: p.lat, lon: p.lon, puntoLat: l.lat, puntoLon: l.lon,
          strada: Number.isFinite(d) ? Math.round(d) : null, aria: Math.round(aria), raggio,
          registrato: r ? { strada: r.strada, lat: r.lat, lon: r.lon } : null,
          spostatoM: r ? Math.round(metri(p.lat, p.lon, r.lat, r.lon)) : null,
        });
      };
      if (!s.avvisato && d <= raggi.avviso) { s.avvisato = true; annota('avviso', raggi.avviso); }
      if (d <= raggi.arrivo) { s.arrivato = true; annota('arrivo', raggi.arrivo); }
    }
  }
  const maiScattati = luoghi.filter(l => !stato.get(l.id)!.arrivato).map(l => {
    const s = stato.get(l.id)!;
    return { id: l.id, nome: l.nome, minimaStrada: s.minStrada == null ? null : Math.round(s.minStrada), minimaAria: Math.round(s.minAria) };
  });
  return { scatti, luoghi: luoghi.length, maiScattati, conStrade: !!grafo && grafo.segmenti > 0 };
}
