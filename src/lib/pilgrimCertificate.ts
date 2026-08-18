// =====================================================================
// WIP · Attestato del Pellegrino — tracciamento completamento cammini
//
// Un itinerario "cammino" nasce dalla PilgrimWaysSheet ("Prepara il
// cammino ✨"): all'attivazione registriamo qui uno SNAPSHOT del cammino
// (localStorage 'wip_pilgrim_activations') perché il piano generato
// dall'AI non porta con sé l'id del cammino. Il riconoscimento di un
// itinerario-cammino usa, in ordine: il marcatore pilgrimRouteId dentro
// dati_itinerario (se un giorno il planner lo persisterà), poi lo
// snapshot + euristica sui nomi delle tappe.
//
// Completamento per tappa-giorno: (a) check-in utente (campo `visited`
// sulle tappe del giorno, scritto da 'wip-itinerary-checkin'), OPPURE
// (b) le celle del visitedFog coprono l'ARRIVO di tappa entro ~500 m
// (il telefono è fisicamente passato di lì).
//
// A completamento: attestato A4 orizzontale via canvas (pergamena,
// codice di verifica = primi 10 hex di SHA-256(userId+routeId+data))
// + registrazione best-effort su POST /api/pilgrim/certificate.
// =====================================================================
import { PILGRIM_ROUTES, type PilgrimRoute } from './transitCatalog';
import { getVisitedCells, FOG_CELL_DEG } from './visitedFog';
import { getApiUrl } from './api';

const ACTIVATIONS_KEY = 'wip_pilgrim_activations';
const MAX_ACTIVATIONS = 20;
/** Raggio (m) entro cui il fog "copre" l'arrivo di tappa. */
const FOG_MATCH_RADIUS_M = 500;

// ── Tipi ──────────────────────────────────────────────────────────────

export interface PilgrimActivation {
  routeId: string;
  name: string;
  emoji?: string;
  days: number;
  km: number;
  /** Arrivi di tappa (nome + coordinate se curate). */
  stages: Array<{ day: number; to: string; km: number; lat?: number; lon?: number }>;
  activatedAt: string; // ISO
}

export interface PilgrimProgress {
  routeId: string;
  name: string;
  stagesTotal: number;
  stagesDone: number;
  km: number;
  completed: boolean;
  dates: { start?: string; end?: string };
}

// ── Snapshot di attivazione (localStorage) ────────────────────────────

function readActivations(): PilgrimActivation[] {
  try {
    const raw = localStorage.getItem(ACTIVATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(a => a && a.routeId && Array.isArray(a.stages)) : [];
  } catch { return []; }
}

/**
 * Registra l'attivazione di un cammino (chiamata da PilgrimWaysSheet su
 * "Prepara il cammino ✨"). Idempotente per routeId: ri-attivare lo
 * stesso cammino aggiorna lo snapshot (tappe AI possono cambiare).
 */
export function recordPilgrimActivation(r: PilgrimRoute): void {
  try {
    const snap: PilgrimActivation = {
      routeId: r.id,
      name: r.name,
      emoji: r.emoji,
      days: r.days,
      km: r.stages.reduce((acc, s) => acc + (Number(s.km) || 0), 0),
      stages: r.stages.map(s => ({ day: s.day, to: s.to, km: s.km, lat: s.lat, lon: s.lon })),
      activatedAt: new Date().toISOString(),
    };
    const rest = readActivations().filter(a => a.routeId !== r.id);
    rest.unshift(snap);
    localStorage.setItem(ACTIVATIONS_KEY, JSON.stringify(rest.slice(0, MAX_ACTIVATIONS)));
  } catch { /* storage pieno/bloccato: il cammino resta usabile senza attestato */ }
}

/** Snapshot noti: attivazioni locali + seed curato (per route mai attivate qui). */
function knownRoutes(): PilgrimActivation[] {
  const out = readActivations();
  const have = new Set(out.map(a => a.routeId));
  for (const r of PILGRIM_ROUTES) {
    if (have.has(r.id)) continue;
    out.push({
      routeId: r.id, name: r.name, emoji: r.emoji, days: r.days,
      km: r.stages.reduce((acc, s) => acc + (Number(s.km) || 0), 0),
      stages: r.stages.map(s => ({ day: s.day, to: s.to, km: s.km, lat: s.lat, lon: s.lon })),
      activatedAt: '',
    });
  }
  return out;
}

// ── Riconoscimento itinerario → cammino ───────────────────────────────

const norm = (s: unknown) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Testo "impronta" dell'itinerario: titolo + destinazione + titoli giorni/tappe. */
function itineraryText(dati: any): string {
  const parts: string[] = [String(dati?.titolo || ''), String(dati?.destinazione || dati?.destination || '')];
  const giorni = Array.isArray(dati?.giorni) ? dati.giorni : [];
  for (const g of giorni) {
    parts.push(String(g?.titolo_giorno || g?.titolo || g?.citta || ''));
    const tappe = Array.isArray(g?.tappe) ? g.tappe : [];
    for (const t of tappe) parts.push(String(t?.titolo_tappa || t?.nome || ''));
  }
  return norm(parts.join(' · '));
}

/**
 * Riconosce a QUALE cammino appartiene un itinerario utente.
 * 1) marcatore esplicito dati_itinerario.pilgrimRouteId;
 * 2) euristica: nome del cammino nel titolo, oppure abbastanza arrivi
 *    di tappa citati nel piano (con numero giorni compatibile).
 */
export function matchPilgrimRoute(itinerary: any): PilgrimActivation | null {
  const dati = itinerary?.dati_itinerario || itinerary;
  if (!dati) return null;
  const routes = knownRoutes();

  const marked = String(dati.pilgrimRouteId || '').trim();
  if (marked) {
    const hit = routes.find(a => a.routeId === marked);
    if (hit) return hit;
  }

  const text = itineraryText(dati);
  if (!text) return null;
  const giorniN = Array.isArray(dati.giorni) ? dati.giorni.length : 0;

  let best: { a: PilgrimActivation; score: number } | null = null;
  for (const a of routes) {
    const nameHit = a.name.length >= 4 && text.includes(norm(a.name));
    let stageHits = 0;
    for (const s of a.stages) {
      const to = norm(s.to);
      if (to.length >= 4 && text.includes(to)) stageHits++;
    }
    const need = Math.max(2, Math.ceil(a.stages.length / 2));
    const matched = nameHit
      || stageHits >= need
      || (stageHits >= 2 && giorniN > 0 && giorniN === a.days);
    if (!matched) continue;
    const score = (nameHit ? 5 : 0) + stageHits + (giorniN === a.days ? 1 : 0);
    if (!best || score > best.score) best = { a, score };
  }
  return best?.a || null;
}

// ── Verifica di passaggio via visitedFog ──────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}

/** True se una cella del fog (centro) sta entro `radiusM` dal punto. */
export function fogCoversPoint(lat: number, lon: number, radiusM = FOG_MATCH_RADIUS_M): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const dLat = radiusM / 111_320 + FOG_CELL_DEG;
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const dLon = radiusM / (111_320 * cos) + FOG_CELL_DEG;
  const cells = getVisitedCells({ south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon });
  return cells.some(c =>
    haversineM(lat, lon, (c.south + c.north) / 2, (c.west + c.east) / 2) <= radiusM);
}

// ── Stato di completamento ────────────────────────────────────────────

/**
 * Stato di completamento di un itinerario-cammino. Ritorna null se
 * l'itinerario non è riconoscibile come cammino.
 *
 * Una tappa-giorno è completata se:
 *  (a) il giorno corrispondente del piano ha almeno una tappa con
 *      check-in (`visited: true`, evento 'wip-itinerary-checkin'), O
 *  (b) il fog delle zone visitate copre l'arrivo di tappa entro ~500 m.
 */
export function getProgress(itinerary: any): PilgrimProgress | null {
  const route = matchPilgrimRoute(itinerary);
  if (!route || route.stages.length === 0) return null;
  const dati = itinerary?.dati_itinerario || itinerary;
  const giorni = Array.isArray(dati?.giorni) ? dati.giorni : [];

  let done = 0;
  for (let i = 0; i < route.stages.length; i++) {
    const s = route.stages[i];
    // Giorno del piano allineato alla tappa: per numero (day) o indice.
    const g = giorni[(Number(s.day) || i + 1) - 1] || giorni[i];
    const tappe = Array.isArray(g?.tappe) ? g.tappe : [];
    const checkedIn = tappe.some((t: any) => t?.visited === true);
    const walkedThere = Number.isFinite(s.lat as number) && Number.isFinite(s.lon as number)
      && fogCoversPoint(s.lat as number, s.lon as number);
    if (checkedIn || walkedThere) done++;
  }

  const completed = done >= route.stages.length;
  const start = String(itinerary?.created_at || '').slice(0, 10) || undefined;
  const end = completed
    ? (String(itinerary?.updated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10))
    : undefined;
  return {
    routeId: route.routeId,
    name: route.name,
    stagesTotal: route.stages.length,
    stagesDone: done,
    km: Math.round(route.km),
    completed,
    dates: { start, end },
  };
}

// ── Codice di verifica ────────────────────────────────────────────────

/**
 * Codice corto: primi 10 hex di SHA-256(userId+routeId+data), calcolato
 * client-side con crypto.subtle (fallback FNV per contesti non sicuri).
 */
export async function computeCertHash(userId: string, routeId: string, dateISO: string): Promise<string> {
  const input = `${userId}|${routeId}|${dateISO}`;
  try {
    if (crypto?.subtle?.digest) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
    }
  } catch { /* contesto non sicuro (http): fallback sotto */ }
  // Fallback deterministico (FNV-1a a 2 semi): 10 hex, niente crypto.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ input.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 10);
}

// ── Attestato via canvas (A4 orizzontale, pergamena) ──────────────────

export interface CertificateData {
  userName: string;
  routeName: string;
  km: number;
  stages: number;
  dates: { start?: string; end?: string };
  code: string;
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};

/**
 * Disegna l'attestato: A4 orizzontale a 150 dpi (1754×1240), sfondo
 * pergamena chiara, doppio bordo, 🥾, codice di verifica in calce.
 */
export function renderCertificate(data: CertificateData): HTMLCanvasElement {
  const W = 1754, H = 1240;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas non disponibile');

  // Pergamena: gradiente caldo + vignettatura leggera
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdf9ee');
  bg.addColorStop(0.5, '#f8f0da');
  bg.addColorStop(1, '#f1e6c8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, W * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(120,90,40,0.10)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Doppio bordo classico
  ctx.strokeStyle = '#8b6f3e';
  ctx.lineWidth = 7;
  ctx.strokeRect(42, 42, W - 84, H - 84);
  ctx.strokeStyle = 'rgba(139,111,62,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(62, 62, W - 124, H - 124);
  // Rombi decorativi agli angoli del bordo interno
  ctx.fillStyle = '#8b6f3e';
  for (const [cx, cy] of [[62, 62], [W - 62, 62], [62, H - 62], [W - 62, H - 62]] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
  }

  const serif = 'Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';

  // Scarpone in testa
  ctx.font = '96px serif';
  ctx.fillText('🥾', W / 2, 220);

  // Titolo
  ctx.fillStyle = '#7c5c2b';
  ctx.font = `900 64px ${serif}`;
  ctx.fillText('ATTESTATO DEL PELLEGRINO', W / 2, 330);
  // Filetto sotto il titolo
  ctx.strokeStyle = 'rgba(124,92,43,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2 - 330, 362); ctx.lineTo(W / 2 + 330, 362); ctx.stroke();

  // Nome del viaggiatore
  ctx.fillStyle = '#5b6472';
  ctx.font = `italic 34px ${serif}`;
  ctx.fillText('Si attesta che', W / 2, 450);
  ctx.fillStyle = '#1f2937';
  ctx.font = `italic 900 76px ${serif}`;
  const nome = data.userName.length > 28 ? data.userName.slice(0, 27) + '…' : data.userName;
  ctx.fillText(nome, W / 2, 555);

  // Cammino completato
  ctx.fillStyle = '#5b6472';
  ctx.font = `italic 34px ${serif}`;
  ctx.fillText('ha completato a piedi il', W / 2, 640);
  ctx.fillStyle = '#065f46';
  ctx.font = `900 60px ${serif}`;
  const cammino = data.routeName.length > 40 ? data.routeName.slice(0, 39) + '…' : data.routeName;
  ctx.fillText(cammino, W / 2, 725);

  // Numeri del cammino
  ctx.fillStyle = '#374151';
  ctx.font = `700 40px ${serif}`;
  ctx.fillText(`${data.km} km in ${data.stages} ${data.stages === 1 ? 'tappa' : 'tappe'}`, W / 2, 815);

  // Date
  const inizio = fmtDate(data.dates.start);
  const fine = fmtDate(data.dates.end);
  const dateLine = inizio && fine && inizio !== fine
    ? `dal ${inizio} al ${fine}`
    : (fine || inizio ? `completato il ${fine || inizio}` : '');
  if (dateLine) {
    ctx.fillStyle = '#6b7280';
    ctx.font = `italic 32px ${serif}`;
    ctx.fillText(dateLine, W / 2, 880);
  }

  // Codice di verifica + brand
  ctx.strokeStyle = 'rgba(139,111,62,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W / 2 - 260, 960); ctx.lineTo(W / 2 + 260, 960); ctx.stroke();
  ctx.fillStyle = '#7c5c2b';
  ctx.font = '700 30px ui-monospace, Menlo, monospace';
  ctx.fillText(`Codice di verifica  ${data.code}`, W / 2, 1020);
  ctx.fillStyle = '#8b6f3e';
  ctx.font = `700 28px ${serif}`;
  ctx.fillText('Verificabile su wip.guide', W / 2, 1068);
  ctx.fillStyle = 'rgba(31,41,55,0.75)';
  ctx.font = `900 26px ${serif}`;
  ctx.fillText('world in pocket · wip.guide', W / 2, 1140);

  return canvas;
}

/** Condivide il PNG (navigator.share) o, in fallback, lo scarica. */
export async function shareOrDownloadCertificate(canvas: HTMLCanvasElement, data: CertificateData, forceDownload = false): Promise<'shared' | 'downloaded'> {
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('generazione PNG fallita');
  const file = new File([blob], `wip-attestato-${data.code}.png`, { type: 'image/png' });
  const nav: any = navigator;
  if (!forceDownload && nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({
      files: [file],
      title: `Attestato del Pellegrino · ${data.routeName}`,
      text: `Ho completato il ${data.routeName} (${data.km} km) 🥾 — verificabile su wip.guide, codice ${data.code}`,
    });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

// ── Registrazione verificabile (best-effort) ──────────────────────────

/**
 * Registra l'attestato su POST /api/pilgrim/certificate (Bearer utente).
 * Best-effort: un fallimento non blocca la generazione locale.
 */
export async function registerCertificate(progress: PilgrimProgress, code: string, accessToken?: string | null): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch(getApiUrl('/api/pilgrim/certificate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        routeId: progress.routeId,
        routeName: progress.name,
        stages: progress.stagesTotal,
        km: progress.km,
        dates: progress.dates,
        hash: code,
      }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch { return false; }
}
