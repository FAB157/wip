/**
 * DIECI TAPPE — il driver: l'unico punto in cui il giro SENTE il GPS.
 *
 * Prima di questo file il giro si disegnava ma non sapeva dove fossi:
 * `tourService.aggiorna()` non lo chiamava nessuno. Qui si ascoltano i fix che
 * locationService emette gia` ('wip-location-update') e si fa girare la
 * macchina a stati. Niente watch proprio: un secondo watchPosition costa
 * batteria e produce due verita` sulla posizione.
 *
 * Tre mestieri:
 *  1. ARRIVO ALLA TAPPA: al primo ALL_INGRESSO si emette lo stesso
 *     'wip-poi-trigger' del geofencing, cosi` tutto quello che sta a valle
 *     (scheda, pass, crediti, modalita` silenziosa) resta com'e`. Quando ci si
 *     allontana e la guida ha finito, la tappa e` fatta.
 *  2. INCONTRI LUNGO LA STRADA: fra la tappa 3 e la 4 ci sono trecento metri
 *     di citta` con dentro POI che il radar conosce. Entro 40 m dal percorso
 *     e 40 m da te: un teaser breve, niente deviazione, niente conteggio, una
 *     volta sola per giro. Il direttore audio decide se parlare o accodare.
 *  3. LA CODA: le voci rimandate si dicono al primo silenzio utile.
 *
 * Su web i trigger di prossimita` normali (foregroundTriggers) tacciono
 * durante il giro: l'audio del giro lo governa questo file, altrimenti la
 * stessa tappa parlerebbe due volte.
 */
import { tourService, metri, primaFrase } from '../../services/tourService';
import { isSpeechActive, speakInstruction } from '../../services/ttsService';
import { getTranslation, type Language } from '../i18n';
import { SOGLIE } from './tourState';

const ACCURACY_MAX_M = 50;
/** Entro questi metri da te (e dal percorso) un POI e` un incontro. */
const INCONTRO_M = 40;
/** Oltre la soglia d'arrivo di questi metri = ci si e` allontanati dalla tappa. */
const LASCIATA_M = 20;

let avviato = false;
let giroId: string | null = null;
let tappaAnnunciata: string | null = null;
let arrivatoA: string | null = null;

/** Idempotente: si chiama una volta dall'app e resta in ascolto per sempre. */
export function avviaGiroDriver(): void {
  if (avviato || typeof window === 'undefined') return;
  avviato = true;
  window.addEventListener('wip-location-update', onFix);
}

function linguaUi(): string {
  try {
    const l = localStorage.getItem('wip_language') || localStorage.getItem('language') || document.documentElement.lang || 'it';
    return l.toLowerCase().slice(0, 2) || 'it';
  } catch { return 'it'; }
}

function onFix(e: Event): void {
  try {
    if (!tourService.inCorso()) { giroId = null; return; }
    const d = (e as CustomEvent).detail || {};
    const lat = Number(d.lat), lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const accuracy = Number(d.accuracy);
    if (Number.isFinite(accuracy) && accuracy > ACCURACY_MAX_M) return;

    const giro = tourService.datiGiro()!;
    if (giro.id !== giroId) { giroId = giro.id; tappaAnnunciata = null; arrivatoA = null; }

    const pos = { lat, lon };
    const parlando = isSpeechActive();
    tourService.aggiorna(pos, { guidaInCorso: parlando });
    const v = tourService.vista();
    if (!v) return;
    const tappa = tourService.tappaAttuale();

    // 1. Arrivo: la prima volta che si e` all'ingresso della tappa corrente.
    if (tappa && v.stato === 'ALL_INGRESSO' && tappaAnnunciata !== String(tappa.id)) {
      tappaAnnunciata = String(tappa.id);
      arrivatoA = tappaAnnunciata;
      const ts = Date.now();
      (window as any).__wipLastPoiTrigger = { id: String(tappa.id), ts };
      window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
        detail: {
          poiId: tappa.id,
          poi: { id: tappa.id, name: tappa.nome, lat: tappa.lat, lon: tappa.lon, category: tappa.categoria || undefined, city: tappa.citta || undefined },
          alreadyPaid: false,
          autoPlay: true,
          ts,
          fromTour: true,
        },
      }));
    }

    // Tappa fatta: ci si era arrivati, ora si e` lontani e la guida tace.
    if (tappa && arrivatoA === String(tappa.id)) {
      const p = tappa.ingresso ?? { lat: tappa.lat, lon: tappa.lon };
      if (metri(pos, p) > SOGLIE.arrivo_m + LASCIATA_M && !parlando) {
        arrivatoA = null;
        tourService.completaTappa();
      }
    }

    // 2. Incontri lungo la strada.
    if (v.stato !== 'ALL_INGRESSO' && v.stato !== 'GUIDA_IN_CORSO' && v.stato !== 'IN_PAUSA') {
      for (const { poi, id } of tourService.candidatiLungoIlPercorso(INCONTRO_M)) {
        if (tourService.incontroGiaFatto(id)) continue;
        const pLat = Number(poi.lat), pLon = Number(poi.lon);
        if (metri(pos, { lat: pLat, lon: pLon }) > INCONTRO_M) continue;
        const testo = testoIncontro(poi);
        const decisione = tourService.chiPuoParlare('teaser', { guidaInCorso: parlando, metriAllaSvolta: null, suAttraversamento: false });
        if (decisione.azione === 'parla' || decisione.azione === 'abbassa_e_parla') {
          speakInstruction(testo, linguaUi());
          tourService.segnaIncontro(id);
        } else if (decisione.azione === 'accoda') {
          tourService.accodaVoce('teaser', testo);
          tourService.segnaIncontro(id);
        }
        // 'taci' (pausa, attraversamento): si riprova al prossimo campione.
        break; // uno per campione: due incontri insieme si pestano i piedi
      }
    }

    // 3. La coda: al primo silenzio si dice cio` che era stato rimandato.
    if (!parlando && !isSpeechActive()) {
      const voce = tourService.prossimaVoce();
      if (voce) speakInstruction(voce.testo, linguaUi());
    }
  } catch { /* un campione sbagliato non deve fermare il giro */ }
}

/** "Sulla tua strada: Palazzo X. Prima frase della descrizione." */
function testoIncontro(poi: any): string {
  const lang = linguaUi().toUpperCase() as Language;
  const nome = poi.name || poi.nome || '';
  const breve = poi.description_short || poi.descrizione_breve || poi.short_description || poi.description || '';
  const testa = `${getTranslation('tour_incontro', lang)}: ${nome}.`;
  return breve ? `${testa} ${primaFrase(String(breve), 160)}` : testa;
}
