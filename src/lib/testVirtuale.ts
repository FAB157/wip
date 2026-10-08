// =====================================================================
// TEST VIRTUALE (04/10/2026, committente: «un test virtuale… quando vogliamo,
// con la mappa come fosse WIP, o itinerario o percorso; sempre pronto,
// nell'admin»).
//
// Un «telefono finto» che cammina DENTRO l'app vera: le posizioni entrano
// dallo stesso ingresso di quelle del GPS (locationService.injectMockLocation
// + evento 'wip-location-update', come il GPS Replay), quindi mappa, banner,
// audioguida, giro e navigatore reagiscono col loro codice di produzione. Non
// è una simulazione a parte: è l'app, con un GPS finto.
//
//  • Esplorazione: si tocca la mappa di WIP e il telefono finto ci va,
//    seguendo un percorso pedonale vero.
//  • Itinerario / giro / percorso: si avvia il giro come sempre e si preme
//    «Segui il giro»: cammina lungo il suo tracciato.
//  • Navigatore: si avvia la navigazione verso una meta e si tocca la meta.
//
// Durante il cammino tiene un REGISTRO nello stesso formato del telefono
// (righe POS / GUIDA / NAV / SEGNO, vedi collaudoRegistro.ts): si può leggere
// la pagella sul posto o inviarlo fra i collaudi.
//
// LIMITI, da sapere: gira il codice WEB (browser / PWA). Dentro l'app Android
// e iOS i trigger dell'audioguida li decide il servizio NATIVO, che il GPS
// finto non raggiunge: lì serve la prova sul telefono col registro di
// collaudo. Le attese misurate sull'orologio vero (un minuto fra due scatti
// dello stesso luogo, 24 ore per un luogo già ascoltato) non si accelerano:
// per questo c'è «Azzera ascolti».
// =====================================================================
import { locationService } from '../services/locationService';
import { tourService } from '../services/tourService';
import { supabase } from './supabase';
import { getApiUrl } from './api';
import { metriDiStrada } from './roadSnap';
import { puntoArrivo } from './puntoArrivo';
import { radiiForTransport, isCategoryAllowed, isPlayed } from './guideSettings';
import { linguaCorrente } from './i18n';

export type ModoTest = 'piedi' | 'auto';
/** Un cammino salvato: da dove parte e la linea da percorrere, per rifarlo identico con un tocco. */
export interface ScenarioTest { nome: string; modo: ModoTest; partenza: [number, number]; linea: number[][]; salvatoIl?: string }

export interface StatoTest {
  /** Schermo spento simulato: il telefono finto continua a camminare, la pagina non riceve posizioni. */
  schermoSpento: boolean;
  attivo: boolean; inCammino: boolean; modo: ModoTest; fattore: number; errore: number;
  lat: number | null; lon: number | null; metriRimasti: number; scatti: number; voci: number; messaggio: string;
}

const VELOCITA: Record<ModoTest, number> = { piedi: 1.4, auto: 11 };
const R = 6371000, rad = Math.PI / 180;
const metri = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const x = (bLat - aLat) * rad, y = (bLon - aLon) * rad;
  const h = Math.sin(x / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const rotta = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const y = Math.sin((bLon - aLon) * rad) * Math.cos(bLat * rad);
  const x = Math.cos(aLat * rad) * Math.sin(bLat * rad) - Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLon - aLon) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
};
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-9))) * Math.cos(2 * Math.PI * Math.random());
const due = (n: number) => String(n).padStart(2, '0');

let partenza: [number, number] | null = null; // dove è stato posato il telefono
let percorsa: number[][] = [];                // tutta la linea assegnata da allora (per salvare lo scenario)
let stato: StatoTest = { schermoSpento: false, attivo: false, inCammino: false, modo: 'piedi', fattore: 1, errore: 4, lat: null, lon: null, metriRimasti: 0, scatti: 0, voci: 0, messaggio: '' };
let linea: number[][] = [];       // [lat, lon] ancora da percorrere
let timer: ReturnType<typeof setTimeout> | null = null;
let orologio = 0;                 // orologio simulato (ms)
let ultimaPos = 0;
let registro: string[] = [];
const ascoltatori = new Set<() => void>();
const avvisa = () => { ascoltatori.forEach(f => { try { f(); } catch { /* UI */ } }); };
const ora = () => { const d = new Date(orologio || Date.now()); return `${due(d.getMonth() + 1)}-${due(d.getDate())} ${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`; };
const scrivi = (riga: string) => { registro.push(`${ora()} ${riga}`); if (registro.length > 4000) registro.splice(0, registro.length - 4000); };

export const statoTest = (): StatoTest => stato;
export const righeTest = (): string[] => registro.slice();
export function ascoltaTest(f: () => void): () => void { ascoltatori.add(f); return () => { ascoltatori.delete(f); }; }

// ── FILM DELLA PROVA ────────────────────────────────────────────────────
// Un fotogramma al secondo simulato: dove era il telefono DAVVERO, dove l'app
// credeva che fosse (col GPS che sbaglia), in che stato era il giro e cosa è
// successo in quel secondo. Si rivede dopo, avanti e indietro, senza rifare il
// cammino. Resta finché non si avvia un altro test.
export interface Fotogramma {
  t: number; ora: string; lat: number; lon: number;
  /** La posizione consegnata all'app; null se in quel secondo non ne ha ricevute (galleria, schermo spento). */
  gps: [number, number] | null;
  /** Stato del giro / navigatore in quel momento, se c'è. */
  app: string;
  eventi: string[];
}
let film: Fotogramma[] = [];
let eventiDelSecondo: string[] = [];
export const filmTest = (): Fotogramma[] => film;
// Un evento va sul fotogramma appena scattato: l'app reagisce DOPO aver ricevuto la posizione.
const evento = (testo: string) => { const f = film[film.length - 1]; if (f) f.eventi.push(testo); else eventiDelSecondo.push(testo); };
function fotografa(lat: number, lon: number, gps: [number, number] | null) {
  let app = '';
  try {
    const v: any = tourService.vista();
    if (v) app = `${v.stato}${v.nomeTappa ? ` · tappa: ${v.nomeTappa}` : ''}${v.metriAllaTappa != null ? ` (${v.metriAllaTappa} m)` : ''}${v.istruzione ? ` · ${v.istruzione}${v.metriAllaSvolta != null ? ` fra ${v.metriAllaSvolta} m` : ''}` : ''}`;
  } catch { /* nessun giro */ }
  film.push({ t: orologio, ora: ora().slice(6), lat, lon, gps, app, eventi: eventiDelSecondo });
  eventiDelSecondo = [];
  if (film.length > 7200) film.splice(0, film.length - 7200); // due ore
}

// ── GPS DIFFICILE ───────────────────────────────────────────────────────
// Le tre situazioni che in strada fanno sbagliare: il segnale che sparisce
// (galleria, portici), il salto di cento metri fra i palazzi, il telefono
// fermo che «deriva». Si accendono dalla barra mentre il telefono cammina.
let galleriaFinoA = 0;                 // orologio simulato fino a cui non arrivano posizioni
let saltoProssimo = 0;                 // metri di salto da applicare al prossimo fix
let derivaOn = false;
let derivaTimer: ReturnType<typeof setTimeout> | null = null;
let derivaX = 0, derivaY = 0;          // metri di deriva accumulati

/** Niente posizioni per N secondi (di tempo simulato): il telefono cammina, l'app non lo sa. */
export function gpsGalleria(secondi = 30) {
  if (!stato.attivo) return;
  galleriaFinoA = orologio + secondi * 1000;
  scrivi(`GPS galleria ${secondi}s`); evento(`segnale perso per ${secondi} s`);
  stato = { ...stato, messaggio: `Segnale GPS perso per ${secondi} secondi.` }; avvisa();
}
/** Un fix sbagliato di N metri in una direzione a caso, dichiarato «preciso»: il rimbalzo fra i palazzi. */
export function gpsSalto(metriSalto = 100) {
  if (!stato.attivo) return;
  saltoProssimo = metriSalto;
  scrivi(`GPS salto ${metriSalto}m`); evento(`salto di ${metriSalto} m`);
  stato = { ...stato, messaggio: `Salto di ${metriSalto} m al prossimo fix.` }; avvisa();
  if (!stato.inCammino && stato.lat != null && stato.lon != null) { orologio += 1000; inietta(stato.lat, stato.lon, 0, 0); avvisa(); }
}
/** Da fermi, la posizione scivola di mezzo metro al secondo in direzioni a caso. */
export function gpsDeriva(on: boolean) {
  derivaOn = on; derivaX = 0; derivaY = 0;
  if (derivaTimer) { clearTimeout(derivaTimer); derivaTimer = null; }
  if (stato.attivo) { scrivi(`GPS deriva ${on ? 'on' : 'off'}`); evento(on ? 'deriva accesa' : 'deriva spenta'); }
  stato = { ...stato, messaggio: on ? 'Deriva accesa: da fermo il GPS scivola piano.' : 'Deriva spenta.' }; avvisa();
  const giro = () => {
    derivaTimer = null;
    if (!derivaOn || !stato.attivo) return;
    if (!stato.inCammino && stato.lat != null && stato.lon != null) {
      orologio += 1000;
      derivaX += gauss() * 0.6; derivaY += gauss() * 0.6;
      inietta(stato.lat, stato.lon, 0, 0);
      avvisa();
    }
    derivaTimer = setTimeout(giro, 1000 / Math.max(1, stato.fattore));
  };
  if (on) derivaTimer = setTimeout(giro, 500);
}
export const gpsDerivaAccesa = () => derivaOn;

// ── LE VOCI DEL TEST (04/10/2026, committente: «il test deve far ascoltare») ──
// Sul web, fuori da un giro, l'avviso a 150 m e il teaser NON hanno voce: sul
// telefono sono del servizio nativo (notifica + voce di sistema). Qui il test
// li fa sentire lui, con la voce del browser, nello stesso ordine del telefono:
// avviso → all'arrivo il teaser salvato del luogo → poi la guida vera dell'app
// (PoiDetailSheet aspetta 'wip-teaser-finished' quando il test è acceso).
// Non tocca la logica di produzione: tutto questo esiste solo a test acceso.
const VOCE_LINGUA: Record<string, string> = { IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN' };
const pausa = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
function parla(testo: string): Promise<void> {
  return new Promise(fine => {
    try {
      const ss = window.speechSynthesis;
      if (!ss || !testo) { fine(); return; }
      const u = new SpeechSynthesisUtterance(testo);
      u.lang = VOCE_LINGUA[String(linguaCorrente()).toUpperCase()] || 'it-IT';
      let fatto = false;
      const chiudi = () => { if (!fatto) { fatto = true; fine(); } };
      u.onend = chiudi; u.onerror = chiudi;
      setTimeout(chiudi, 4000 + testo.length * 90); // una voce che non segnala la fine non blocca la guida
      ss.speak(u);
    } catch { fine(); }
  });
}

let seguendoGiro = false;
let geometriaSeguita: number[][] | null = null;
// Rotta del navigatore a tappa singola (Itinerario › Naviga › WipNav, `useWalkingNavigation`): non passa da
// tourService, la si riceve da `wip-nav-route` e «Segui il giro» la usa quando non c'è un giro (07/10/2026).
let rottaNavigatore: number[][] | null = null;
const suRottaNavigatore = (e: any) => {
  const g = e?.detail?.geometry;
  rottaNavigatore = Array.isArray(g) && g.length >= 2 ? g.map((p: number[]) => [Number(p[0]), Number(p[1])]) : null;
};
let luoghi: any[] = [];
let luoghiA: { ts: number; lat: number; lon: number } | null = null;
let luoghiInVolo = false;
const avvisati = new Set<string>();
let dettoSpenta = false;
let teaserInCorso = false;

async function aggiornaLuoghi(lat: number, lon: number) {
  if (luoghiInVolo) return;
  if (luoghiA && Date.now() - luoghiA.ts < 60_000 && metri(lat, lon, luoghiA.lat, luoghiA.lon) < 250) return;
  luoghiInVolo = true; luoghiA = { ts: Date.now(), lat, lon };
  try {
    const { getGeofencePois } = await import('../services/poiRepository');
    let userId: string | null = null;
    try { const { data } = await supabase.auth.getSession(); userId = data?.session?.user?.id || null; } catch { /* anonimo */ }
    let sub: Record<string, boolean> = {};
    try { sub = JSON.parse(localStorage.getItem('wip_active_subcategories') || '{}') || {}; } catch { /* default */ }
    luoghi = (await getGeofencePois(lat, lon, userId, 900)).filter((p: any) => isCategoryAllowed(p, sub));
  } catch { /* si riprova al prossimo giro */ }
  finally { luoghiInVolo = false; }
}

/** L'avviso di avvicinamento: una volta per luogo, in metri di strada dal punto d'arrivo. */
function controllaAvvisi(lat: number, lon: number) {
  let accesa = true, inGiro = false;
  try { accesa = locationService.getIsTourActive(); inGiro = tourService.inCorso(); } catch { /* si prosegue */ }
  if (!accesa) {
    if (!dettoSpenta) { dettoSpenta = true; stato = { ...stato, messaggio: 'AUDIOGUIDA SPENTA: accendila (le cuffie), altrimenti l’app non fa scattare niente.' }; scrivi('SEGNO "audioguida spenta durante il test"'); }
    return;
  }
  dettoSpenta = false;
  if (inGiro) return; // nel giro avvisi e incontri li dice il giro stesso
  void aggiornaLuoghi(lat, lon);
  const modoApp = stato.modo === 'auto' ? 'car' : 'walk';
  let alert = stato.modo === 'auto' ? 300 : 150, trigger = stato.modo === 'auto' ? 50 : 30;
  try { const r = radiiForTransport(modoApp as any, null, null); alert = r.alert || alert; trigger = r.trigger || trigger; } catch { /* default */ }
  for (const poi of luoghi) {
    const id = String(poi?.id ?? '');
    if (!id || avvisati.has(id) || poi.audio_enabled === false || isPlayed(id)) continue;
    let punto = { lat: Number(poi.lat), lon: Number(poi.lon) };
    try { const p = puntoArrivo(poi); if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) punto = { lat: p.lat, lon: p.lon }; } catch { /* centro */ }
    if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lon)) continue;
    const aria = metri(lat, lon, punto.lat, punto.lon);
    if (aria > alert) continue; // la strada non è mai più corta della linea d'aria
    const strada = metriDiStrada(lat, lon, punto.lat, punto.lon, modoApp);
    const d = Number.isFinite(strada) ? strada : aria;
    if (d > alert) continue;
    avvisati.add(id);
    if (d <= trigger) continue; // già all'arrivo: parla il teaser, non l'avviso
    const nome = String(poi.name || poi.nome || id).replace(/"/g, "'");
    scrivi(`GUIDA avviso "${nome}" id=${id} strada=${Number.isFinite(strada) ? Math.round(strada) : 'inf'} aria=${Math.round(aria)} raggio=${alert} acc=${Math.round(stato.errore * 1.5)} ${lat.toFixed(5)},${lon.toFixed(5)} punto=${punto.lat.toFixed(5)},${punto.lon.toFixed(5)}`);
    evento(`AVVISO: ${nome} a ${Math.round(d)} m`);
    stato = { ...stato, messaggio: `Avviso: ${nome} a ${Math.round(d)} m di strada` };
    const it = String(linguaCorrente()).toUpperCase() === 'IT';
    // Mai sopra un teaser o una guida che sta parlando (né sopra un altro avviso): resta scritto nel registro.
    let occupato = teaserInCorso;
    try { occupato = occupato || locationService.getAudioState().isPlaying || window.speechSynthesis.speaking; } catch { /* si parla */ }
    if (!occupato) void parla(it ? `${nome}, a circa ${Math.round(d / 10) * 10} metri.` : `${nome}, about ${Math.round(d / 10) * 10} metres away.`);
    break; // un avviso per fix
  }
}

/** All'arrivo: il teaser salvato del luogo, detto prima della guida. Poi il via alla guida. */
async function diTeaser(id: string, nome: string) {
  let testo = '';
  try {
    const col = `teaser_text_${String(linguaCorrente()).toLowerCase()}`;
    const { data } = await supabase.from('shared_pois').select(col).eq('id', id).maybeSingle();
    testo = String((data as any)?.[col] || '').trim();
  } catch { /* senza teaser */ }
  let silenziosa = false;
  try { silenziosa = locationService.isSilentModeEnabled(); } catch { /* no */ }
  await pausa(1200); // la scheda del luogo si apre un attimo dopo lo scatto
  if (silenziosa) {
    scrivi(`SEGNO "modalità silenziosa accesa: niente voce per ${nome}"`);
    stato = { ...stato, messaggio: 'MODALITÀ SILENZIOSA accesa: l’app non parla. Spegnila per ascoltare.' }; avvisa();
  } else if (!testo) {
    scrivi(`TEASER assente "${nome}" id=${id}`); evento(`TEASER assente: ${nome}`);
  } else {
    scrivi(`TEASER "${nome}" id=${id}`); evento(`TEASER: ${testo.slice(0, 90)}`);
    try { window.dispatchEvent(new CustomEvent('wip-teaser-started', { detail: { poiId: id } })); } catch { /* niente */ }
    teaserInCorso = true;
    try { window.speechSynthesis.cancel(); } catch { /* niente da zittire */ } // un avviso a metà lascia il posto al teaser
    await parla(testo);
    teaserInCorso = false;
  }
  try { window.dispatchEvent(new CustomEvent('wip-teaser-finished', { detail: { poiId: id } })); } catch { /* niente */ }
}

// ── LA POSIZIONE FINTA VALE PER TUTTA L'APP (04/10/2026) ────────────────
// Trovato provando un percorso a Milano dal PC di Carrara: «Gemme intorno a
// me», l'avvio del percorso e la scheda del luogo chiedono la posizione
// direttamente al browser (navigator.geolocation) e ricevevano quella VERA —
// il percorso «di Milano» nasceva attorno a Carrara. A test acceso le due
// chiamate del browser rispondono con la posizione del telefono finto; a test
// spento tornano quelle vere.
let geoFinta = false;
const ascoltatoriGeo = new Map<number, (p: any) => void>();
let prossimoWatch = 900_000;
const posizioneFinta = () => ({
  coords: {
    latitude: stato.lat as number, longitude: stato.lon as number, accuracy: Math.max(3, Math.round(stato.errore * 1.5)),
    altitude: null, altitudeAccuracy: null, heading: null, speed: stato.inCammino ? VELOCITA[stato.modo] : 0,
  },
  timestamp: Date.now(),
});
function fingiGeolocalizzazione(accendi: boolean) {
  try {
    const g: any = typeof navigator !== 'undefined' ? navigator.geolocation : null;
    if (!g) return;
    if (accendi && !geoFinta) {
      Object.defineProperty(g, 'getCurrentPosition', { configurable: true, value: (ok: (p: any) => void) => { if (stato.lat != null) setTimeout(() => { try { ok(posizioneFinta()); } catch { /* chi ascolta */ } }, 0); } });
      Object.defineProperty(g, 'watchPosition', { configurable: true, value: (ok: (p: any) => void) => { const id = prossimoWatch++; ascoltatoriGeo.set(id, ok); if (stato.lat != null) setTimeout(() => { try { ok(posizioneFinta()); } catch { /* chi ascolta */ } }, 0); return id; } });
      Object.defineProperty(g, 'clearWatch', { configurable: true, value: (id: number) => { ascoltatoriGeo.delete(id); } });
      geoFinta = true;
    } else if (!accendi && geoFinta) {
      // tolte le proprietà finte tornano i metodi veri del browser
      delete g.getCurrentPosition; delete g.watchPosition; delete g.clearWatch;
      ascoltatoriGeo.clear();
      geoFinta = false;
    }
  } catch { /* browser che non lo permette: resta l'iniezione diretta */ }
}

function inietta(lat: number, lon: number, heading: number, speed: number) {
  let eLat = lat + (gauss() * stato.errore) / 111_320;
  let eLon = lon + (gauss() * stato.errore) / (111_320 * Math.cos(lat * rad));
  const accuracy = Math.max(3, Math.round(stato.errore * 1.5));
  if (derivaOn && speed === 0) { eLat += derivaY / 111_320; eLon += derivaX / (111_320 * Math.cos(lat * rad)); }
  if (saltoProssimo > 0) {
    const dir = Math.random() * 2 * Math.PI;
    eLat += (saltoProssimo * Math.cos(dir)) / 111_320; eLon += (saltoProssimo * Math.sin(dir)) / (111_320 * Math.cos(lat * rad));
    saltoProssimo = 0;
  }
  // A schermo spento o in galleria la pagina non riceve nulla: il telefono cammina, la traccia si registra lo stesso.
  if (stato.schermoSpento || orologio < galleriaFinoA) {
    if (orologio - ultimaPos >= 4000) { ultimaPos = orologio; scrivi(`POS ${lat.toFixed(5)},${lon.toFixed(5)} acc=${accuracy}`); }
    fotografa(lat, lon, null);
    return;
  }
  fotografa(lat, lon, [eLat, eLon]);
  try {
    locationService.injectMockLocation(eLat, eLon, { speed, heading, accuracy });
    window.dispatchEvent(new CustomEvent('wip-location-update', { detail: { lat: eLat, lon: eLon, heading, accuracy, speed } }));
  } catch { /* un punto rotto non ferma il cammino */ }
  try { controllaAvvisi(eLat, eLon); } catch { /* le voci del test non fermano il cammino */ }
  if (orologio - ultimaPos >= 4000) { ultimaPos = orologio; scrivi(`POS ${eLat.toFixed(5)},${eLon.toFixed(5)} acc=${accuracy}`); }
}

function passo() {
  timer = null;
  if (!stato.attivo || !stato.inCammino || stato.lat == null || stato.lon == null) return;
  orologio += 1000;
  // IL GIRO HA RIFATTO LA STRADA (dopo una tappa, o per una modifica): il telefono
  // finto deve seguire quella nuova, non il tracciato di quando è partito —
  // altrimenti esce di strada da solo e fa scattare un «fuori percorso» finto
  // (visto a Milano il 04/10/2026).
  if (seguendoGiro) {
    try {
      const geo: number[][] | undefined = (tourService.datiGiro() as any)?.geometria;
      if (Array.isArray(geo) && geo.length >= 2 && geo !== geometriaSeguita) {
        geometriaSeguita = geo;
        let iMin = 0, dMin = Infinity;
        geo.forEach((p, i) => { const d = metri(stato.lat as number, stato.lon as number, p[0], p[1]); if (d < dMin) { dMin = d; iMin = i; } });
        linea = geo.slice(iMin).map(p => [p[0], p[1]]);
        percorsa.push(...linea.map(p => [p[0], p[1]]));
      }
    } catch { /* nessun giro: si prosegue sulla linea che c'è */ }
  }
  let daFare = VELOCITA[stato.modo]; // metri in un secondo simulato
  let lat = stato.lat, lon = stato.lon, heading = 0;
  while (daFare > 0 && linea.length) {
    const [nLat, nLon] = linea[0];
    const d = metri(lat, lon, nLat, nLon);
    heading = rotta(lat, lon, nLat, nLon);
    if (d <= daFare) { lat = nLat; lon = nLon; daFare -= d; linea.shift(); }
    else { const t = daFare / d; lat += (nLat - lat) * t; lon += (nLon - lon) * t; daFare = 0; }
  }
  let rimasti = 0, pLat = lat, pLon = lon;
  for (const [a, b] of linea) { rimasti += metri(pLat, pLon, a, b); pLat = a; pLon = b; }
  const arrivato = linea.length === 0;
  // (06/10/2026, prova Madrid) Finita la linea mentre si segue un giro ancora aperto, il
  // telefono finto restava «fermo» per sempre: il giro aveva rifatto la strada DOPO che la
  // linea era finita e nessuno la rileggeva. Si resta in cammino a passo zero e ogni 3 s si
  // guarda se il giro ha una strada nuova (il blocco in cima a passo() la raccoglie).
  let giroAperto = false;
  if (arrivato && seguendoGiro) { try { giroAperto = !!tourService.datiGiro() && tourService.inCorso(); } catch { giroAperto = false; } }
  const inAttesaDelGiro = arrivato && giroAperto;
  stato = { ...stato, lat, lon, metriRimasti: Math.round(rimasti), inCammino: !arrivato || inAttesaDelGiro, messaggio: inAttesaDelGiro ? 'Aspetto che il giro rifaccia la strada…' : arrivato ? 'Arrivato: tocca un altro punto o «Segui il giro».' : stato.messaggio };
  inietta(lat, lon, heading, arrivato ? 0 : VELOCITA[stato.modo]);
  avvisa();
  if (!arrivato) timer = setTimeout(passo, 1000 / Math.max(1, stato.fattore));
  else if (inAttesaDelGiro) timer = setTimeout(passo, 3000);
}

// ── Cosa fa l'app mentre si cammina: gli stessi eventi che muovono schede e voce ──
function suTrigger(e: Event) {
  if (!stato.attivo || stato.lat == null || stato.lon == null) return;
  const d: any = (e as CustomEvent).detail || {};
  const poi = d.poi || {};
  let punto = { lat: Number(poi.lat), lon: Number(poi.lon) };
  try { const p = puntoArrivo(poi); if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) punto = { lat: p.lat, lon: p.lon }; } catch { /* centro */ }
  if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lon)) {
    // L'arrivo del navigatore manda solo l'id del luogo: resta scritto lo stesso, senza metri.
    const idSolo = String(d.poiId ?? '');
    if (idSolo) {
      scrivi(`ARRIVO-NAV id=${idSolo} ${stato.lat.toFixed(5)},${stato.lon.toFixed(5)}`); evento(`GUIDA della meta: ${idSolo}`);
      stato = { ...stato, scatti: stato.scatti + 1, messaggio: `Arrivo del navigatore: parte la guida della meta (${idSolo})` }; avvisa();
      if (!d.manual && d.autoPlay !== false) { avvisati.add(idSolo); void diTeaser(idSolo, idSolo); }
    }
    return;
  }
  const modoApp = stato.modo === 'auto' ? 'car' : 'walk';
  const strada = metriDiStrada(stato.lat, stato.lon, punto.lat, punto.lon, modoApp);
  const aria = metri(stato.lat, stato.lon, punto.lat, punto.lon);
  let raggio = stato.modo === 'auto' ? 50 : 30;
  try { raggio = Math.round(radiiForTransport(modoApp as any, poi.category, { geofenceRadius: null, alertRadius: null, hasEntrance: false } as any).trigger) || raggio; } catch { /* default */ }
  const nome = String(poi.name || d.poiId || '?').replace(/"/g, "'");
  scrivi(`GUIDA ${d.fromTour ? 'arrivo' : 'arrivo'} "${nome}" id=${d.poiId ?? poi.id ?? ''} strada=${Number.isFinite(strada) ? Math.round(strada) : 'inf'} aria=${Math.round(aria)} raggio=${raggio} acc=${Math.round(stato.errore * 1.5)} ${stato.lat.toFixed(5)},${stato.lon.toFixed(5)} punto=${punto.lat.toFixed(5)},${punto.lon.toFixed(5)}`);
  evento(`GUIDA: ${nome} a ${Number.isFinite(strada) ? Math.round(strada) + ' m di strada' : 'strada irraggiungibile'}`);
  stato = { ...stato, scatti: stato.scatti + 1, messaggio: `Guida scattata: ${nome} a ${Number.isFinite(strada) ? Math.round(strada) + ' m di strada' : 'strada irraggiungibile'}` };
  avvisa();
  // Il teaser prima della guida, come sul telefono. Nel giro lo dice il giro; un tocco manuale non ha teaser.
  const idLuogo = String(d.poiId ?? poi.id ?? '');
  if (idLuogo && !d.manual && !d.fromTour && d.autoPlay !== false) { avvisati.add(idLuogo); void diTeaser(idLuogo, nome); }
}
function suVoce(e: Event) {
  if (!stato.attivo || stato.lat == null || stato.lon == null) return;
  const testo = String((e as CustomEvent).detail?.text || '').replace(/\s+/g, ' ').trim();
  if (!testo) return;
  let metriSvolta = '-';
  try { const v: any = tourService.vista(); if (v?.metriAllaSvolta != null) metriSvolta = String(Math.round(v.metriAllaSvolta)); } catch { /* nessun giro */ }
  let vicino = 35;
  try { vicino = Math.round(tourService.sogliaSvoltaVicina()); } catch { /* default */ }
  // Stesso formato della riga del follower nativo: la pagella giudica il «gira» sui metri alla svolta.
  const tipo = /^(fra|tra|in |dans|en |nach|через)\b/i.test(testo) ? 'lontano' : 'vicino';
  scrivi(`NAV FIX ${stato.lat.toFixed(5)},${stato.lon.toFixed(5)} acc=${Math.round(stato.errore * 1.5)} idx=0 aria=- strada=${metriSvolta} u=0 v=${VELOCITA[stato.modo].toFixed(1)} vicino=${vicino} JS DICE[${tipo}]: ${testo}`);
  evento(`VOCE: ${testo}`);
  stato = { ...stato, voci: stato.voci + 1, messaggio: `Voce: ${testo.slice(0, 70)}` };
  avvisa();
}

/** Accende il test: ferma il GPS vero e mette il telefono finto in un punto. */
export function avviaTest(lat: number, lon: number, modo: ModoTest = 'piedi') {
  if (!stato.attivo) {
    try { locationService.stopWatching(); } catch { /* nessun watch */ }
    window.addEventListener('wip-poi-trigger', suTrigger);
    window.addEventListener('wip-nav-instruction', suVoce);
    window.addEventListener('wip-nav-route', suRottaNavigatore);
    registro = []; orologio = Date.now(); ultimaPos = 0;
    film = []; eventiDelSecondo = []; galleriaFinoA = 0; saltoProssimo = 0;
    avvisati.clear(); luoghi = []; luoghiA = null; dettoSpenta = false;
    // Dice alla scheda del luogo che c'è un teaser da aspettare e (solo per l'admin) che l'ascolto è di prova.
    (window as any).__wipTestVirtuale = true;
    fingiGeolocalizzazione(true);
    scrivi('COLLAUDO acceso (test virtuale)');
  }
  if (timer) { clearTimeout(timer); timer = null; }
  linea = [];
  seguendoGiro = false; geometriaSeguita = null;
  partenza = [lat, lon]; percorsa = [];
  stato = { ...stato, attivo: true, inCammino: false, modo, lat, lon, metriRimasti: 0, messaggio: 'Telefono finto posato. Tocca la mappa per mandarlo a un punto.' };
  inietta(lat, lon, 0, 0);
  avvisa();
}

export function impostaTest(p: Partial<Pick<StatoTest, 'modo' | 'fattore' | 'errore'>>) {
  stato = { ...stato, ...p };
  avvisa();
}

/** Cammina fino a un punto lungo un percorso pedonale vero (linea retta se il percorso non arriva). */
export async function vaiA(lat: number, lon: number): Promise<void> {
  if (!stato.attivo || stato.lat == null || stato.lon == null) return;
  // (06/10/2026) Un tocco a più di 50 km (da Madrid a Lisbona) non è una camminata: il
  // telefono finto si POSA lì (prima calcolava un percorso a piedi di 2.200 km).
  if (metri(stato.lat, stato.lon, lat, lon) > 50_000) { avviaTest(lat, lon, stato.modo); return; }
  stato = { ...stato, messaggio: 'Calcolo il percorso…' }; avvisa();
  let nuova: number[][] = [];
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const res = await fetch(getApiUrl(`/api/route/foot/${stato.lon},${stato.lat};${lon},${lat}?overview=full&geometries=geojson`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const j: any = res.ok ? await res.json() : null;
    const c = j?.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(c) && c.length >= 2) nuova = c.map((p: number[]) => [p[1], p[0]]);
  } catch { /* linea retta */ }
  const diretto = nuova.length < 2;
  if (diretto) nuova = [[lat, lon]];
  else nuova.push([lat, lon]); // gli ultimi metri dalla strada al punto toccato
  seguendoGiro = false; geometriaSeguita = null; // un tocco sulla mappa comanda sul giro
  linea = nuova;
  percorsa.push(...nuova.map(p => [p[0], p[1]]));
  stato = { ...stato, inCammino: true, messaggio: diretto ? 'Percorso non disponibile: vado in linea retta.' : 'In cammino.' };
  avvisa();
  if (!timer) timer = setTimeout(passo, 200);
}

/** Cammina lungo il tracciato del giro / percorso attivo, dal punto più vicino a dove si è. */
export function seguiGiro(): boolean {
  if (!stato.attivo || stato.lat == null || stato.lon == null) return false;
  const g: any = tourService.datiGiro();
  let geo: number[][] = Array.isArray(g?.geometria) ? g.geometria : [];
  if (geo.length < 2 && rottaNavigatore && rottaNavigatore.length >= 2) geo = rottaNavigatore;
  if (geo.length < 2) { stato = { ...stato, messaggio: 'Nessun giro o percorso attivo: avvialo dall’app, poi premi di nuovo.' }; avvisa(); return false; }
  let iMin = 0, dMin = Infinity;
  geo.forEach((p, i) => { const d = metri(stato.lat as number, stato.lon as number, p[0], p[1]); if (d < dMin) { dMin = d; iMin = i; } });
  linea = geo.slice(iMin).map(p => [p[0], p[1]]);
  percorsa.push(...linea.map(p => [p[0], p[1]]));
  seguendoGiro = true; geometriaSeguita = geo;
  stato = { ...stato, inCammino: true, messaggio: 'Seguo il tracciato del giro.' };
  avvisa();
  if (!timer) timer = setTimeout(passo, 200);
  return true;
}

export function pausaTest() {
  if (timer) { clearTimeout(timer); timer = null; }
  stato = { ...stato, inCammino: false, messaggio: 'In pausa.' };
  avvisa();
}
export function riprendiTest() {
  if (!stato.attivo || !linea.length) return;
  stato = { ...stato, inCammino: true, messaggio: 'In cammino.' };
  avvisa();
  if (!timer) timer = setTimeout(passo, 200);
}

// ── SCENARI SALVATI ─────────────────────────────────────────────────────
/** Il cammino fatto finora, pronto da salvare: partenza e linea, sfoltita a 600 punti al massimo. */
export function scenarioCorrente(nome: string): ScenarioTest | null {
  if (!partenza || percorsa.length < 2) return null;
  const ogni = Math.max(1, Math.ceil(percorsa.length / 600));
  const sfoltita = percorsa.filter((_, i) => i % ogni === 0 || i === percorsa.length - 1).map(p => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]);
  return { nome: nome.trim().slice(0, 80), modo: stato.modo, partenza: [Number(partenza[0].toFixed(6)), Number(partenza[1].toFixed(6))], linea: sfoltita };
}
/** Rifà un cammino salvato, identico: stessa partenza, stessa linea, stesso modo. */
export function rilanciaScenario(s: ScenarioTest) {
  if (!s?.partenza || !Array.isArray(s.linea) || s.linea.length < 2) return;
  if (stato.attivo) fermaTest();
  avviaTest(s.partenza[0], s.partenza[1], s.modo === 'auto' ? 'auto' : 'piedi');
  linea = s.linea.map(p => [p[0], p[1]]);
  percorsa = linea.map(p => [p[0], p[1]]);
  scrivi(`SCENARIO "${s.nome.replace(/"/g, "'")}"`);
  stato = { ...stato, inCammino: true, messaggio: `Scenario «${s.nome}»: in cammino.` };
  avvisa();
  if (!timer) timer = setTimeout(passo, 300);
}

// ── SCHERMO SPENTO SIMULATO ─────────────────────────────────────────────
// Sul telefono, a schermo spento, la pagina è congelata: non riceve posizioni
// e alla riaccensione si ritrova «teletrasportata» più avanti. Qui: la pagina
// si vede dire che è nascosta (visibilityState = 'hidden' + evento
// 'visibilitychange'), il telefono finto continua a camminare senza passarle
// nulla, e alla riaccensione le arriva la posizione di quel momento. Serve a
// vedere se giro e navigatore riprendono dal punto giusto o ripetono le frasi.
// LIMITE: i timer della pagina NON si fermano davvero, come invece fa il
// telefono; e la parte nativa (che a schermo spento parla lei) qui non c'è.
export function schermoTest(spento: boolean) {
  if (!stato.attivo || stato.schermoSpento === spento) return;
  try {
    if (spento) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    } else {
      // togliere le proprietà finte riporta quelle vere del browser
      delete (document as any).visibilityState;
      delete (document as any).hidden;
    }
  } catch { /* browser che non lo permette: resta la sola sospensione delle posizioni */ }
  scrivi(spento ? 'SCHERMO spento' : 'SCHERMO acceso'); evento(spento ? 'schermo spento' : 'schermo riacceso');
  stato = { ...stato, schermoSpento: spento, voci: spento ? stato.voci : stato.voci, messaggio: spento ? 'Schermo spento: il telefono cammina, la pagina non riceve posizioni.' : 'Schermo riacceso: guarda se riprende dal punto giusto senza ripetere frasi.' };
  try { document.dispatchEvent(new Event('visibilitychange')); } catch { /* niente */ }
  if (!spento && stato.lat != null && stato.lon != null) inietta(stato.lat, stato.lon, 0, stato.inCammino ? VELOCITA[stato.modo] : 0);
  avvisa();
}

/** Il segno di chi guarda («qui ha sbagliato»), nel registro del test. */
export function segnoTest(nota: string) {
  if (!stato.attivo) return;
  const dove = stato.lat != null && stato.lon != null ? ` ${stato.lat.toFixed(5)},${stato.lon.toFixed(5)}` : '';
  scrivi(`SEGNO "${nota.replace(/"/g, "'").slice(0, 200)}"${dove}`); evento(`SEGNO: ${nota}`);
  avvisa();
}

/** Un luogo già ascoltato non riparte per 24 ore: per ripetere una prova si azzera lo storico (solo di questo browser). */
export function azzeraAscolti() {
  try { localStorage.removeItem('wip_played_pois'); localStorage.removeItem('wip_web_trigger_history'); } catch { /* storage assente */ }
  try { delete (window as any).__wipLastPoiTrigger; } catch { /* niente */ }
  stato = { ...stato, messaggio: 'Storico degli ascolti azzerato: ricarica la pagina perché valga per tutti i moduli.' };
  avvisa();
}

/** Spegne il test e riaccende il GPS vero. Il registro resta leggibile finché non se ne avvia un altro. */
export function fermaTest() {
  if (stato.schermoSpento) schermoTest(false);
  if (derivaOn) gpsDeriva(false);
  if (timer) { clearTimeout(timer); timer = null; }
  window.removeEventListener('wip-poi-trigger', suTrigger);
  window.removeEventListener('wip-nav-instruction', suVoce);
  window.removeEventListener('wip-nav-route', suRottaNavigatore); rottaNavigatore = null;
  try { delete (window as any).__wipTestVirtuale; window.speechSynthesis?.cancel(); } catch { /* niente */ }
  fingiGeolocalizzazione(false);
  linea = [];
  stato = { ...stato, attivo: false, inCammino: false, messaggio: 'Test finito: GPS vero riacceso.' };
  try { locationService.startWatching().catch(() => { /* permessi o ambiente senza GPS */ }); } catch { /* niente */ }
  avvisa();
}
