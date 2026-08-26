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
import { Capacitor } from '@capacitor/core';
import { tourService, metri, primaFrase } from '../../services/tourService';
import { isSpeechActive, speakInstruction } from '../../services/ttsService';
import { locationService } from '../../services/locationService';

/**
 * La guida sta parlando? Due canali: ttsService (teaser, navigatore) e
 * locationService (l'audioguida della scheda, con il suo player). Guardarne
 * uno solo faceva credere al direttore audio che la guida fosse muta mentre
 * raccontava, e un incontro poteva parlarle sopra (segnalato 22/08/2026).
 */
function guidaSuona(): boolean {
  try { if (isSpeechActive()) return true; } catch { /* ok */ }
  try { return !!locationService.getAudioState()?.isPlaying; } catch { return false; }
}
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
/** Manovre gia` dette: una volta "fra N metri", una volta a ridosso. */
let svoltaDettaLontano: string | null = null;
let svoltaDettaVicino: string | null = null;
/** A questi metri dalla manovra la si dice "a ridosso" (come useWalkingNavigation). */
const SVOLTA_VICINO_M = 35;
/** Oltre questi si preannuncia "fra N metri" appena la manovra diventa la prossima. */
const SVOLTA_LONTANO_M = 80;

/** "Fra 120 metri," nella lingua della UI (da i18n, come tutto il resto). */
function fraMetri(m: number, lingua: string): string {
  const n = Math.max(10, Math.round(m / 10) * 10);
  return getTranslation('tour_fra_metri', lingua.toUpperCase() as Language).replace('{n}', String(n));
}

/** Da quando si e' fermi (velocita' ~0) senza che nessuno parli: a 5 s si drena la coda. */
let fermoDaTs: number | null = null;
let timerFermo: ReturnType<typeof setTimeout> | null = null;
/** L'ultimo fix visto: serve a calcolare la velocita' quando il GPS non la da'. */
let ultimoFix: { lat: number; lon: number; ts: number } | null = null;

/**
 * Dice la prossima voce in coda, se c'e' silenzio. Lo chiamano la fine di
 * una frase (evento 'wip-speech-ended'), la fine dell'audioguida
 * ('wip-audio-stopped') e il timer da fermi: prima la coda si drenava SOLO
 * al fix GPS successivo, e da fermi i fix possono non arrivare per un pezzo.
 */
function drenaCoda(): void {
  try {
    if (!tourService.inCorso() || guidaSuona()) return;
    const v = tourService.vista();
    if (!v || v.inPausa || v.suAttraversamento) return;
    const voce = tourService.prossimaVoce();
    if (voce) parla(voce.testo, linguaUi());
  } catch { /* niente */ }
}

/**
 * L'unico punto che fa parlare il navigatore/teaser del giro. Con
 * `abbassa` la guida scende a VOLUME_ABBASSATO per la durata della frase e
 * risale alla fine (evento 'wip-speech-ended'): prima `abbassa_e_parla` era
 * trattato come `parla` e il ducking restava sulla carta.
 */
let duckingAttivo = false;
function parla(testo: string, lingua: string, abbassa = false): void {
  if (abbassa) {
    duckingAttivo = true;
    try { locationService.setDucking(true); } catch { /* solo web */ }
  }
  speakInstruction(testo, lingua);
}
function onSpeechEnded(): void {
  if (duckingAttivo) {
    duckingAttivo = false;
    try { locationService.setDucking(false); } catch { /* solo web */ }
  }
  drenaCoda();
}
function fraseRicalcolo(lingua: string): string {
  switch (lingua) {
    case 'it': return 'Sei fuori percorso: ricalcolo il giro da qui.';
    case 'fr': return 'Vous avez quitté l\'itinéraire : je recalcule depuis ici.';
    case 'es': return 'Te has salido de la ruta: recalculo desde aquí.';
    case 'de': return 'Sie haben die Route verlassen: ich berechne von hier neu.';
    case 'ru': return 'Вы сошли с маршрута: пересчитываю отсюда.';
    case 'zh': return '您已偏离路线：从这里重新规划。';
    default: return 'You are off route: recalculating from here.';
  }
}

/** Idempotente: si chiama una volta dall'app e resta in ascolto per sempre. */
export function avviaGiroDriver(): void {
  if (avviato || typeof window === 'undefined') return;
  avviato = true;
  window.addEventListener('wip-location-update', onFix);
  window.addEventListener('wip-speech-ended', onSpeechEnded);
  window.addEventListener('wip-audio-stopped', () => drenaCoda());
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
    if (giro.id !== giroId) { giroId = giro.id; tappaAnnunciata = null; arrivatoA = null; svoltaDettaLontano = null; svoltaDettaVicino = null; }

    const pos = { lat, lon };
    const lingua = linguaUi();
    tourService.impostaLingua(lingua);
    const parlando = guidaSuona();
    // La velocita': quella del GPS se c'e', altrimenti dai due ultimi fix.
    // Il browser spesso da' speed null (→ 0 in locationService): senza questo
    // calcolo si risulterebbe "fermi" anche camminando, e dopo tre minuti il
    // giro andrebbe in pausa da solo.
    const ts = Number(d.ts) || Date.now();
    let velocitaFix = Number(d.speed);
    if (ultimoFix) {
      const dt = (ts - ultimoFix.ts) / 1000;
      if (dt > 0.5) {
        const calcolata = metri(pos, ultimoFix) / dt;
        if (!Number.isFinite(velocitaFix) || velocitaFix <= 0) velocitaFix = calcolata;
      } else if (!Number.isFinite(velocitaFix)) velocitaFix = NaN;
    }
    ultimoFix = { lat, lon, ts };
    tourService.aggiorna({ lat, lon, velocita: Number.isFinite(velocitaFix) ? velocitaFix : undefined }, { guidaInCorso: parlando });
    const v = tourService.vista();
    if (!v) return;
    const tappa = tourService.tappaAttuale();

    // UNA SOLA VOCE PER FIX, in ordine di precedenza: istruzione del
    // navigatore > incontro lungo la strada > coda. Prima i tre blocchi
    // potevano parlare tutti nello stesso campione e si pestavano i piedi.
    let dettoQualcosa = false;

    // Da fermi (meno di 0,3 m/s) per 5 s senza che nessuno parli: la coda si
    // drena da sola, anche se il GPS smette di mandare fix.
    const velocita = velocitaFix;
    if (Number.isFinite(velocita) && velocita < 0.3) {
      if (fermoDaTs == null) {
        fermoDaTs = Date.now();
        if (timerFermo) clearTimeout(timerFermo);
        timerFermo = setTimeout(() => { timerFermo = null; drenaCoda(); }, 5000);
      }
    } else {
      fermoDaTs = null;
      if (timerFermo) { clearTimeout(timerFermo); timerFermo = null; }
    }

    // 0. Fuori percorso da piu` di 30 s: si ricalcola da qui (una volta al
    //    minuto). Prima lo stato DEVIATO veniva calcolato e non letto da
    //    nessuno: chi sbagliava strada continuava a vedere la linea vecchia.
    if (v.stato === 'DEVIATO') {
      void tourService.ricalcolaDaDeviazione(pos).then(fatto => {
        if (fatto) { svoltaDettaLontano = null; svoltaDettaVicino = null; parla(fraseRicalcolo(lingua), lingua); }
      });
    }

    // 0b. Le istruzioni del navigatore: "fra 120 metri, gira a destra" quando
    //     la manovra diventa la prossima, poi di nuovo a 35 metri. Passa dal
    //     direttore audio come tutto il resto: non parla sopra la guida.
    //     `suAttraversamento` viene dalla manovra OSRM (tourService): a
    //     ridosso di un attraversamento il direttore tace.
    if (v.istruzione && v.metriAllaSvolta != null && v.stato !== 'ALL_INGRESSO' && v.stato !== 'GUIDA_IN_CORSO' && v.stato !== 'IN_PAUSA' && v.stato !== 'FINITO') {
      const chiave = `${giro.id}:${v.tappaCorrente}:${v.istruzione}`;
      let testo: string | null = null;
      if (v.metriAllaSvolta <= SVOLTA_VICINO_M && svoltaDettaVicino !== chiave) { svoltaDettaVicino = chiave; svoltaDettaLontano = chiave; testo = v.istruzione; }
      else if (v.metriAllaSvolta > SVOLTA_LONTANO_M && svoltaDettaLontano !== chiave) { svoltaDettaLontano = chiave; testo = `${fraMetri(v.metriAllaSvolta, lingua)} ${v.istruzione}`; }
      if (testo) {
        const decisione = tourService.chiPuoParlare('navigatore', { guidaInCorso: parlando, metriAllaSvolta: v.metriAllaSvolta, suAttraversamento: v.suAttraversamento });
        if (decisione.azione === 'parla' || decisione.azione === 'abbassa_e_parla') { parla(testo, lingua, decisione.azione === 'abbassa_e_parla'); dettoQualcosa = true; }
        else if (decisione.azione === 'accoda') tourService.accodaVoce('navigatore', testo);
        else if (decisione.azione === 'taci' && v.suAttraversamento) { svoltaDettaVicino = null; svoltaDettaLontano = null; }
      }
    }

    // 1. Arrivo: la prima volta che si e` all'ingresso della tappa corrente.
    if (tappa && v.stato === 'ALL_INGRESSO' && tappaAnnunciata !== String(tappa.id)) {
      tappaAnnunciata = String(tappa.id);
      arrivatoA = tappaAnnunciata;
      const ts = Date.now();
      (window as any).__wipLastPoiTrigger = { id: String(tappa.id), ts };
      // Sul telefono l'arrivo lo dichiara il servizio nativo (geofence +
      // 'poi-arrived' → wip-poi-trigger): se lo emettesse anche questo driver,
      // la stessa tappa si aprirebbe e parlerebbe due volte. Qui si segna solo
      // il dedupe; sul web, dove il nativo non c'e', si emette.
      if (!Capacitor.isNativePlatform()) window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
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

    // 2. Incontri lungo la strada. Solo se l'istruzione non ha gia' parlato:
    //    se ha parlato, l'incontro si accoda e si dira' al primo silenzio.
    if (v.stato !== 'ALL_INGRESSO' && v.stato !== 'GUIDA_IN_CORSO' && v.stato !== 'IN_PAUSA') {
      for (const { poi, id } of tourService.candidatiLungoIlPercorso(INCONTRO_M)) {
        if (tourService.incontroGiaFatto(id)) continue;
        const pLat = Number(poi.lat), pLon = Number(poi.lon);
        if (metri(pos, { lat: pLat, lon: pLon }) > INCONTRO_M) continue;
        const testo = testoIncontro(poi);
        const decisione = tourService.chiPuoParlare('teaser', { guidaInCorso: parlando || dettoQualcosa, metriAllaSvolta: v.metriAllaSvolta, suAttraversamento: v.suAttraversamento });
        if ((decisione.azione === 'parla' || decisione.azione === 'abbassa_e_parla') && !dettoQualcosa) {
          parla(testo, lingua);
          dettoQualcosa = true;
          tourService.segnaIncontro(id);
        } else if (decisione.azione === 'accoda' || decisione.azione === 'parla' || decisione.azione === 'abbassa_e_parla') {
          tourService.accodaVoce('teaser', testo);
          tourService.segnaIncontro(id);
        }
        // 'taci' (pausa, attraversamento): si riprova al prossimo campione.
        break; // uno per campione: due incontri insieme si pestano i piedi
      }
    }

    // 3. La coda: al primo silenzio si dice cio` che era stato rimandato
    //    (anche alla fine di ogni frase e dopo 5 s da fermi, vedi drenaCoda).
    if (!dettoQualcosa && !parlando && !guidaSuona() && !v.suAttraversamento) {
      const voce = tourService.prossimaVoce();
      if (voce) parla(voce.testo, lingua);
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
