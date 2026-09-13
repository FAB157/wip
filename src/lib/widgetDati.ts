/**
 * I DATI DEI WIDGET DELLA HOME (14/09/2026).
 *
 * Richiesta del committente (13/09/2026 sera): «live activity e widget con
 * opzione 2-3-5-1» = itinerario di oggi, continua la visita, crediti e pass,
 * vicino a te. Qui si compone UN solo snapshot con tutto quello che i quattro
 * widget mostrano, e lo si consegna al nativo (src/plugins/WipWidgets.ts).
 *
 * Perché uno snapshot e non quattro: i widget vivono fuori dall'app, non
 * hanno sessione, non hanno Supabase, non hanno GPS. Tutto ciò che sanno
 * glielo dice l'app quando è aperta, e resta valido finché l'app non la
 * riapre. Un JSON solo = una scrittura, un contratto, una data di
 * aggiornamento che il widget può mostrare («aggiornato alle 10:42»).
 *
 * Le ETICHETTE viaggiano dentro lo snapshot, già nella lingua dell'app: i
 * widget nativi non hanno le 7 lingue di i18n.ts e non devono averle.
 *
 * Regole rispettate: le foto sono quelle dei POI in archivio (Commons/sito),
 * mai da ricerca; i luoghi vicini sono le gemme (is_gem) e i POI dell'RPC,
 * mai inventati; nessuna chiamata a pagamento.
 */
import { Capacitor } from '@capacitor/core';
import { WipWidgets } from '../plugins/WipWidgets';
import { getVisit, countSeen, MUSEUM_VISIT_EVENT, OPEN_MUSEUM_VISIT_EVENT } from './museumVisit';
import { getWalletBalance, CREDITS_UPDATED_EVENT } from './pricing';
import { getDayPassState, DAY_PASS_UPDATED_EVENT } from '../services/dayPassService';
import { tourService } from '../services/tourService';
import { locationService } from '../services/locationService';
import { getGemmeVicine, getNearbyPois } from '../services/poiRepository';
import { supabase } from './supabase';
import { linguaCorrente } from './i18n';

/** Versione del contratto: i widget nativi ignorano snapshot di versione diversa. */
const VERSIONE = 1;
const CHIAVE_PIANO = 'wip_widget_piano';
/** Quanto spesso, al massimo, si ricalcolano i vicini per uno spostamento. */
const METRI_PER_RICALCOLO = 300;
const MS_TRA_AGGIORNAMENTI = 20_000;
const MS_INTERVALLO = 10 * 60_000;

type Etichette = Record<'itinerario' | 'prossima' | 'poi' | 'visita' | 'ascoltate' | 'prossimaOpera' | 'crediti' | 'pass' | 'passMuseo' | 'scade' | 'guide' | 'vicini' | 'gemma' | 'nessuno' | 'apri' | 'aggiornato' | 'fatte', string>;

const ETICHETTE: Record<string, Etichette> = {
  it: { itinerario: 'Itinerario di oggi', prossima: 'Prossima tappa', poi: 'Poi', visita: 'Continua la visita', ascoltate: 'ascoltate', prossimaOpera: 'Prossima opera', crediti: 'crediti', pass: 'Day Pass attivo', passMuseo: 'Pass Museo', scade: 'scade alle', guide: 'guide', vicini: 'Vicino a te', gemma: 'Gemma', nessuno: 'Apri WIP per aggiornare', apri: 'Apri WIP', aggiornato: 'agg.', fatte: 'fatte' },
  en: { itinerario: "Today's itinerary", prossima: 'Next stop', poi: 'Then', visita: 'Continue the visit', ascoltate: 'listened', prossimaOpera: 'Next artwork', crediti: 'credits', pass: 'Day Pass active', passMuseo: 'Museum Pass', scade: 'expires at', guide: 'guides', vicini: 'Near you', gemma: 'Gem', nessuno: 'Open WIP to refresh', apri: 'Open WIP', aggiornato: 'upd.', fatte: 'done' },
  fr: { itinerario: "Itinéraire du jour", prossima: 'Prochaine étape', poi: 'Puis', visita: 'Continuer la visite', ascoltate: 'écoutées', prossimaOpera: 'Prochaine œuvre', crediti: 'crédits', pass: 'Day Pass actif', passMuseo: 'Pass Musée', scade: 'expire à', guide: 'guides', vicini: 'Près de vous', gemma: 'Pépite', nessuno: 'Ouvrez WIP pour actualiser', apri: 'Ouvrir WIP', aggiornato: 'màj', fatte: 'faites' },
  es: { itinerario: 'Itinerario de hoy', prossima: 'Próxima parada', poi: 'Luego', visita: 'Continuar la visita', ascoltate: 'escuchadas', prossimaOpera: 'Próxima obra', crediti: 'créditos', pass: 'Day Pass activo', passMuseo: 'Pase Museo', scade: 'caduca a las', guide: 'guías', vicini: 'Cerca de ti', gemma: 'Joya', nessuno: 'Abre WIP para actualizar', apri: 'Abrir WIP', aggiornato: 'act.', fatte: 'hechas' },
  de: { itinerario: 'Route von heute', prossima: 'Nächster Halt', poi: 'Dann', visita: 'Besuch fortsetzen', ascoltate: 'gehört', prossimaOpera: 'Nächstes Werk', crediti: 'Credits', pass: 'Day Pass aktiv', passMuseo: 'Museumspass', scade: 'läuft ab um', guide: 'Guides', vicini: 'In deiner Nähe', gemma: 'Geheimtipp', nessuno: 'WIP öffnen zum Aktualisieren', apri: 'WIP öffnen', aggiornato: 'akt.', fatte: 'erledigt' },
  ru: { itinerario: 'Маршрут на сегодня', prossima: 'Следующая остановка', poi: 'Затем', visita: 'Продолжить визит', ascoltate: 'прослушано', prossimaOpera: 'Следующая работа', crediti: 'кредитов', pass: 'Day Pass активен', passMuseo: 'Музейный пасс', scade: 'до', guide: 'гидов', vicini: 'Рядом с вами', gemma: 'Жемчужина', nessuno: 'Откройте WIP для обновления', apri: 'Открыть WIP', aggiornato: 'обн.', fatte: 'готово' },
  zh: { itinerario: '今日行程', prossima: '下一站', poi: '然后', visita: '继续参观', ascoltate: '已听', prossimaOpera: '下一件作品', crediti: '积分', pass: 'Day Pass 生效中', passMuseo: '博物馆通票', scade: '到期', guide: '导览', vicini: '附近', gemma: '珍宝', nessuno: '打开 WIP 以更新', apri: '打开 WIP', aggiornato: '更新', fatte: '已完成' },
};

export type TappaWidget = { ora: string; titolo: string; tipo: string; lat: number | null; lon: number | null; metri?: number | null };
export type SnapshotWidget = {
  v: number;
  ts: number;
  lingua: string;
  etichette: Etichette;
  crediti: { totale: number; passAttivo: boolean; passScade: number; passUsate: number; passCap: number } | null;
  visita: { museo: string; ascoltate: number; totale: number; prossima: string; sala: string; foto: string } | null;
  itinerario: { titolo: string; fonte: 'giro' | 'piano'; fatte: number; totali: number; prossimaIdx: number; tappe: TappaWidget[] } | null;
  vicini: { id: string; nome: string; metri: number; categoria: string; gemma: boolean; foto: string; lat: number; lon: number }[];
  posizione: { lat: number; lon: number; ts: number } | null;
};

const lingua = (): string => {
  try { return String(linguaCorrente() || 'it').toLowerCase().slice(0, 2); } catch { return 'it'; }
};

// ── Piano generato (PlanScreen) ───────────────────────────────────────────
/**
 * PlanScreen chiama questa funzione a ogni cambio di piano: qui si tiene
 * solo ciò che serve al widget (titolo, giorni, tappe con ora e coordinate).
 * Un piano nullo cancella. Il widget mostra il giorno 1 finché l'utente non
 * ne sceglie un altro sulla mappa (`giorno`).
 */
export function salvaPianoPerWidget(plan: any, giorno?: number): void {
  try {
    if (!plan || !Array.isArray(plan.giorni) || !plan.giorni.length) {
      localStorage.removeItem(CHIAVE_PIANO);
    } else {
      const giorni = plan.giorni.map((g: any) => ({
        giorno: Number(g?.giorno) || 1,
        tappe: (Array.isArray(g?.tappe) ? g.tappe : []).slice(0, 14).map((t: any) => ({
          ora: String(t?.ora || ''),
          titolo: String(t?.titolo_tappa || t?.titolo || ''),
          tipo: String(t?.tipo || ''),
          lat: Number.isFinite(Number(t?.coordinate?.lat)) ? Number(t.coordinate.lat) : null,
          lon: Number.isFinite(Number(t?.coordinate?.lng ?? t?.coordinate?.lon)) ? Number(t.coordinate.lng ?? t.coordinate.lon) : null,
        })).filter((t: TappaWidget) => t.titolo),
      }));
      const precedente = leggiPiano();
      localStorage.setItem(CHIAVE_PIANO, JSON.stringify({
        titolo: String(plan.titolo || ''),
        giorni,
        giorno: giorno ?? precedente?.giorno ?? 1,
        salvatoIl: Date.now(),
      }));
    }
  } catch { /* localStorage pieno o assente: il widget resta com'era */ }
  programma();
}

/** Il giorno scelto sulla mappa dell'itinerario diventa il giorno del widget. */
export function scegliGiornoPerWidget(giorno: number | 'all'): void {
  try {
    const p = leggiPiano();
    if (!p) return;
    localStorage.setItem(CHIAVE_PIANO, JSON.stringify({ ...p, giorno: giorno === 'all' ? 1 : giorno }));
  } catch { /* niente */ }
  programma();
}

type PianoSalvato = { titolo: string; giorni: { giorno: number; tappe: TappaWidget[] }[]; giorno: number; salvatoIl: number };
function leggiPiano(): PianoSalvato | null {
  try {
    const raw = localStorage.getItem(CHIAVE_PIANO);
    if (!raw) return null;
    const p = JSON.parse(raw) as PianoSalvato;
    // Un piano di dieci giorni fa non è «l'itinerario di oggi».
    if (!p?.giorni?.length || Date.now() - (p.salvatoIl || 0) > 10 * 86_400_000) return null;
    return p;
  } catch { return null; }
}

const minutiDi = (hhmm: string): number => {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

function itinerarioPerWidget(): SnapshotWidget['itinerario'] {
  // 1) Il giro con audioguida o il percorso su misura in corso: è la verità
  //    più fresca, con la tappa verso cui si sta camminando.
  try {
    const v = tourService.vista();
    if (v && v.nomeTappa) {
      const tappe: TappaWidget[] = [{ ora: '', titolo: v.nomeTappa, tipo: '', lat: v.tappaLat, lon: v.tappaLon, metri: v.metriAllaTappa }];
      if (v.nomeProssima) tappe.push({ ora: '', titolo: v.nomeProssima, tipo: '', lat: null, lon: null });
      return { titolo: '', fonte: 'giro', fatte: v.tappeFatte, totali: v.tappeTotali, prossimaIdx: 0, tappe };
    }
  } catch { /* nessun giro */ }
  // 2) Il piano generato nella scheda Itinerario.
  const p = leggiPiano();
  if (!p) return null;
  const g = p.giorni.find(x => x.giorno === p.giorno) || p.giorni[0];
  if (!g?.tappe?.length) return null;
  const ora = new Date();
  const adesso = ora.getHours() * 60 + ora.getMinutes();
  let prossimaIdx = g.tappe.findIndex(t => minutiDi(t.ora) >= adesso - 20);
  if (prossimaIdx < 0) prossimaIdx = g.tappe.length - 1;
  return { titolo: p.titolo, fonte: 'piano', fatte: prossimaIdx, totali: g.tappe.length, prossimaIdx, tappe: g.tappe };
}

// ── Visita museo ──────────────────────────────────────────────────────────
function visitaPerWidget(): SnapshotWidget['visita'] {
  const v = getVisit();
  if (!v) return null;
  const tappe = v.guide?.tappe || [];
  const prossima = tappe.find(t => !t.seenCardId) || null;
  return {
    museo: v.venue?.name || '',
    ascoltate: countSeen(v),
    totale: tappe.length,
    prossima: prossima?.nome || '',
    sala: prossima?.dove || '',
    foto: prossima?.fotoIcona || prossima?.foto || v.venuePhotoIcon || v.venuePhoto || '',
  };
}

// ── Crediti e pass ────────────────────────────────────────────────────────
async function creditiPerWidget(): Promise<SnapshotWidget['crediti']> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return null;
    const [saldo, pass] = await Promise.all([
      getWalletBalance(userId).catch(() => null),
      getDayPassState().catch(() => null),
    ]);
    return {
      totale: saldo?.total ?? 0,
      passAttivo: !!pass?.active,
      passScade: pass?.active ? Number(pass.expiresAt) || 0 : 0,
      passUsate: pass?.active ? Number(pass.used) || 0 : 0,
      passCap: pass?.active ? Number(pass.cap) || 0 : 0,
    };
  } catch { return null; }
}

// ── Vicini ────────────────────────────────────────────────────────────────
let ultimaPosVicini: { lat: number; lon: number } | null = null;
let viciniCache: SnapshotWidget['vicini'] = [];

const metriTra = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

async function viciniPerWidget(pos: { lat: number; lon: number } | null): Promise<SnapshotWidget['vicini']> {
  if (!pos) return viciniCache;
  if (ultimaPosVicini && metriTra(ultimaPosVicini, pos) < METRI_PER_RICALCOLO && viciniCache.length) return viciniCache;
  try {
    // Prima le gemme entro 2,5 km (sono ciò per cui vale la pena uscire),
    // poi i POI normali entro 800 m per completare fino a 5.
    const gemme = await getGemmeVicine(pos.lat, pos.lon, 2500, 5).catch(() => []);
    let lista: any[] = [...gemme];
    if (lista.length < 5) {
      const altri = await getNearbyPois(pos.lat, pos.lon, 800).catch(() => []);
      const visti = new Set(lista.map(p => String(p.id)));
      for (const p of (altri || []).sort((a: any, b: any) => (a.distance_meters || 0) - (b.distance_meters || 0))) {
        if (lista.length >= 5) break;
        if (!p?.name || visti.has(String(p.id))) continue;
        lista.push(p);
      }
    }
    viciniCache = lista.slice(0, 5).map((p: any) => ({
      id: String(p.id),
      nome: String(p.name || ''),
      metri: Math.round(Number(p.distance_meters) || metriTra(pos, { lat: Number(p.lat), lon: Number(p.lon) })),
      categoria: String(p.category || p.poi_type || ''),
      gemma: !!(p.is_gem || p.premium),
      foto: String(p.photo_url || p.image_url || ''),
      lat: Number(p.lat), lon: Number(p.lon),
    }));
    ultimaPosVicini = pos;
  } catch { /* si tiene la cache */ }
  return viciniCache;
}

// ── Composizione e consegna ───────────────────────────────────────────────
let inCorso = false;
let ultimoInvio = 0;
let timer: any = null;

async function componi(): Promise<SnapshotWidget> {
  const l = lingua();
  const last = locationService.getLastLocation();
  const pos = last && Number.isFinite(last.latitude) && Number.isFinite(last.longitude) ? { lat: last.latitude, lon: last.longitude } : null;
  const [crediti, vicini] = await Promise.all([creditiPerWidget(), viciniPerWidget(pos)]);
  return {
    v: VERSIONE,
    ts: Date.now(),
    lingua: l,
    etichette: ETICHETTE[l] || ETICHETTE.it,
    crediti,
    visita: visitaPerWidget(),
    itinerario: itinerarioPerWidget(),
    vicini,
    posizione: pos ? { ...pos, ts: last?.timestamp || Date.now() } : null,
  };
}

/** Compone e consegna subito lo snapshot (con un piccolo freno anti-raffica). */
export async function aggiornaWidget(forza = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (inCorso) return;
  if (!forza && Date.now() - ultimoInvio < MS_TRA_AGGIORNAMENTI) { programma(); return; }
  inCorso = true;
  try {
    const dati = await componi();
    await WipWidgets.aggiorna({ dati: JSON.stringify(dati) });
    ultimoInvio = Date.now();
  } catch (e) {
    console.warn('[widget] snapshot non consegnato', e);
  } finally {
    inCorso = false;
  }
}

/** Aggiornamento differito (coalesce di più eventi ravvicinati). */
function programma(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void aggiornaWidget(true); }, 1500);
}

let avviata = false;
/**
 * Da chiamare una volta all'avvio dell'app (App.tsx): ascolta gli eventi
 * che cambiano ciò che i widget mostrano e riconsegna lo snapshot.
 */
export function avviaSincronizzazioneWidget(): void {
  if (avviata || !Capacitor.isNativePlatform()) return;
  avviata = true;
  const eventi = [MUSEUM_VISIT_EVENT, CREDITS_UPDATED_EVENT, DAY_PASS_UPDATED_EVENT, 'wip-giro-avviato', 'wip-giro-ricalcolato', 'wip-giro-terminato', 'wip-settings-updated', 'wip-itinerary-checkin'];
  for (const e of eventi) window.addEventListener(e, programma);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') programma(); });
  setInterval(() => void aggiornaWidget(true), MS_INTERVALLO);
  // Spostamento: i vicini si ricalcolano quando ci si è mossi abbastanza.
  setInterval(() => {
    const last = locationService.getLastLocation();
    if (!last || !ultimaPosVicini) return;
    if (metriTra(ultimaPosVicini, { lat: last.latitude, lon: last.longitude }) >= METRI_PER_RICALCOLO) programma();
  }, 60_000);
  setTimeout(() => void aggiornaWidget(true), 4000);
}

// ── Tocco su un widget ────────────────────────────────────────────────────
export type AzioneWidget =
  | { tipo: 'visita' }
  | { tipo: 'itinerario' }
  | { tipo: 'crediti' }
  | { tipo: 'vicini' }
  | { tipo: 'poi'; id: string }
  | null;

/**
 * I widget aprono l'app con `itainta://widget/<azione>[/<id>]`. App.tsx la
 * traduce nella scheda giusta; qui si riconosce e si emettono gli eventi già
 * esistenti (visita museo, POI).
 */
export function azioneDaWidget(url: URL | string): AzioneWidget {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    if (u.protocol !== 'itainta:' || u.host !== 'widget') return null;
    const parti = u.pathname.split('/').filter(Boolean);
    const azione = parti[0] || '';
    if (azione === 'visita') { try { window.dispatchEvent(new CustomEvent(OPEN_MUSEUM_VISIT_EVENT)); } catch { /* ok */ } return { tipo: 'visita' }; }
    if (azione === 'itinerario') return { tipo: 'itinerario' };
    if (azione === 'crediti') return { tipo: 'crediti' };
    if (azione === 'vicini') return { tipo: 'vicini' };
    if (azione === 'poi' && parti[1] && /^[A-Za-z0-9_.:-]{1,80}$/.test(parti[1])) {
      const id = parti[1];
      try { window.dispatchEvent(new CustomEvent('deep-link-poi', { detail: { poiId: id, guide: 'nicky' } })); } catch { /* ok */ }
      return { tipo: 'poi', id };
    }
    return null;
  } catch { return null; }
}
