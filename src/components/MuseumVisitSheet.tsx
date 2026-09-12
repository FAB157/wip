import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Check, Volume2, Pause, Play, Loader2, Landmark, Church, MapPin, ExternalLink, Ticket, Plus, Download, SkipForward, Printer, ChevronLeft, ChevronRight, ListMusic, Clock, Users, Bath, Shirt, Coffee, ShoppingBag, DoorOpen, Accessibility, Glasses, Heart, HelpCircle, Map as MapIcon, Share2, ImagePlus, Footprints, Mic, MicOff, Eye } from 'lucide-react';
import { isLiveLeader, hasLiveSession } from '../hooks/useLiveTour';
import { Language, getTranslation } from '../lib/i18n';
import { notify } from '../lib/toast';
import { MuseumVisit, endVisit, countSeen, fetchArtworkGuide, ArtworkGuide, fetchMoreArtworks, fetchEsperienzeMuseo, EsperienzaMuseo, skipStop, unskipStop, markStopListened, prossimaTappa, leggiCartelloSala, impostaSalaCorrente, rimandaTappa, tappeAttive, impostaPersonalizzazione, PERSONALIZZAZIONE_BASE, segnaPrefetchFatto, getLeggiConCalma, setLeggiConCalma, fetchDomani, Domani, togglePreferita, askGuide, fetchBigliettoIngresso, BigliettoIngresso, applicaSaleChiuse, museiAPiediDaQui, MuseumLibraryItem, startVisitByPoi, startVisitByName, OPEN_MUSEUM_VISIT_EVENT, fetchOrariDi, fetchMostre, Mostra, fetchAudioDescription, descrizioneDallArchivio, conservaDescrizione, getAudiodescrizioneAuto, setAudiodescrizioneAuto, leggiCartellino, Cartellino, coppieDaConfrontare, Coppia, fetchConfronto, matchTappa, fetchMuseumMap, MuseumMap, MuseumMapLink, normSalaMappa } from '../lib/museumVisit';
import { avviaAscolto, comandiVocaliDisponibili, ComandoVocale } from '../lib/comandiVocali';
import { componiFotoRicordo, componiCartolina, condividiImmagine } from '../lib/fotoRicordo';
import TargaSala from './TargaSala';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { scaricaPacchettoMuseo, museoScaricato, operaDallArchivio, conservaVisita, conservaOpera, prescaricaPrimeOpere } from '../lib/pacchettoMuseo';
import { speakAudioguide, stopSpeech, pauseSpeech, resumeSpeech, speakWithSystemVoice, setSpeechSpeed } from '../services/ttsService';
import { printScoped } from '../lib/printScoped';
import MuseumPrintView from './MuseumPrintView';
import { getGuideCharacter } from '../lib/guideSettings';
import { formatPassRemaining } from '../lib/museumPass';

interface MuseumVisitSheetProps {
  /** Cambia col museo: la scheda si rimonta quando «E poi?» apre la visita successiva. */
  key?: React.Key;
  visit: MuseumVisit;
  language: Language;
  passExpiresAt: number | null;
  onClose: () => void;
  /** «Inquadra la prossima opera»: chiude la scheda e apre l'obiettivo. */
  onScanNext: () => void;
}

/**
 * Scheda della VISITA GUIDATA: dove sei, il percorso consigliato con le
 * tappe già viste spuntate, l'introduzione da ascoltare. Tema chiaro come
 * la scheda Vision (VisionCardSheet), perché si apre sopra di essa.
 */
export default function MuseumVisitSheet({ visit, language, passExpiresAt, onClose, onScanNext }: MuseumVisitSheetProps) {
  const t = (key: string) => getTranslation(key, language);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  // Audioguida della singola opera: quale tappa sta caricando/parlando e il
  // testo aperto sotto la tappa (250-350 parole, come al museo).
  const [operaAperta, setOperaAperta] = useState<number | null>(null);
  const [operaGuide, setOperaGuide] = useState<Record<number, ArtworkGuide>>({});
  const [operaLoading, setOperaLoading] = useState<number | null>(null);
  const [operaParla, setOperaParla] = useState<number | null>(null);
  /** Quale opera è in PAUSA: riprende da dove era, non da capo. */
  const [operaInPausa, setOperaInPausa] = useState<number | null>(null);
  // Scaricamento per l'uso senza rete e ampliamento del percorso.
  const [scaricando, setScaricando] = useState<{ fatte: number; totali: number } | null>(null);
  const [scaricato, setScaricato] = useState(() => !!museoScaricato(visit.venueKey, language));
  const [aggiungendo, setAggiungendo] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  // La foto dell'opera a tutto schermo: si tiene in mano e si confronta con
  // quello che si ha davanti. È il modo più veloce per trovare un quadro.
  const [fotoGrande, setFotoGrande] = useState<{ url: string; nome: string; dove: string } | null>(null);
  // UNA ALLA VOLTA (11/09/2026): schermo pieno sull'opera corrente — foto
  // grande, sala, play — e si scorre di lato per passare alla prossima. È la
  // differenza fra una playlist e il lettore: con una mano sola, senza
  // cercare nella lista.
  const [lettore, setLettore] = useState<number | null>(null);
  const swipeX = useRef<number | null>(null);
  // MAPPA INTERATTIVA (12/09/2026, regola fissa del committente: sempre la
  // lista E la pianta con i pin delle opere che hanno la guida). La pianta
  // viene dal sito ufficiale; ogni tappa si abbina al pin della sua sala; un
  // tocco sul numero scorre alla tappa e avvia l'audioguida.
  const [vista, setVista] = useState<'lista' | 'mappa'>('lista');
  const [mappe, setMappe] = useState<MuseumMap[]>([]);
  const [mappaLink, setMappaLink] = useState<MuseumMapLink[]>([]);
  const [mappaIndice, setMappaIndice] = useState(0);
  const [mappaCaricata, setMappaCaricata] = useState(false);
  useEffect(() => {
    let vivo = true;
    setMappaCaricata(false);
    fetchMuseumMap(visit.venue.id, visit.venueKey, { name: visit.venue.name, lat: visit.venue.lat ?? null, lon: visit.venue.lon ?? null }).then(({ maps, links }) => { if (!vivo) return; setMappe(maps); setMappaLink(links); setMappaCaricata(true); });
    return () => { vivo = false; };
  }, [visit.venue.id, visit.venueKey]);
  /** Dal pin alla tappa: scorre alla riga e avvia l'audioguida. */
  const apriDalPin = (i: number) => {
    setVista('lista');
    window.setTimeout(() => {
      document.getElementById(`mv-tappa-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      void handleOpera(i);
    }, 60);
  };
  // Il tour di gruppo: si legge una volta per render, così la scheda mostra
  // a chi guida che il gruppo lo segue e a chi segue che sta seguendo.
  const sonoLeader = isLiveLeader();
  const inGruppo = hasLiveSession();
  // IL PERCORSO SU MISURA: quali tappe sono attive col filtro scelto, e il
  // loro ordine. Gli indici restano quelli originali, così le audioguide
  // già aperte (operaGuide[i]) non si spostano quando si cambia filtro.
  const attivi = tappeAttive(visit);
  const ordineAttivo = visit.guide.tappe.map((_, k) => k).filter(k => attivi.has(k));
  const pers = visit.personalizzazione || PERSONALIZZAZIONE_BASE;
  const personalizzato = pers.tempo !== 'tutto' || pers.interessi !== 'tutto' || pers.bambini;
  // Ci sono tipi noti? Se nessuna opera ha un tipo, il filtro per interessi
  // non avrebbe su cosa lavorare e non si mostra.
  const tipiNoti = visit.guide.tappe.some(x => x.tipo === 'dipinto' || x.tipo === 'scultura');
  // IL PROMEMORIA (11/09/2026): finita un'opera, se per un minuto e mezzo
  // non si ascolta, non si inquadra e non si legge un cartello, il telefono
  // vibra una volta e propone di inquadrare il numero della sala. Un
  // promemoria, non un'imposizione: si chiude con un tocco.
  // «IL LEADER È IN SALA 12» (11/09/2026): chi guida manda la sua sala —
  // dal cartello letto o dall'opera in ascolto — e chi segue sa dove
  // raggiungerlo.
  const [salaLeader, setSalaLeader] = useState<string>('');
  useEffect(() => {
    if (sonoLeader) return;
    const onRoom = (e: any) => { const s = String(e?.detail?.sala || ''); if (s) setSalaLeader(s); };
    window.addEventListener('wip-museum-room-from-leader', onRoom);
    return () => window.removeEventListener('wip-museum-room-from-leader', onRoom);
  }, [sonoLeader]);
  useEffect(() => {
    if (sonoLeader && visit.salaCorrente) {
      window.dispatchEvent(new CustomEvent('wip-leader-museum-room', { detail: { sala: visit.salaCorrente } }));
    }
  }, [sonoLeader, visit.salaCorrente]);

  // IL BIGLIETTO D'INGRESSO (12/09/2026): accanto agli orari di domani, il
  // momento giusto per comprarlo. Non è un'esperienza a pagamento: si mostra
  // anche senza pass.
  const [biglietto, setBiglietto] = useState<BigliettoIngresso | null>(null);
  useEffect(() => {
    if (!online) return;
    let vivo = true;
    fetchBigliettoIngresso(visit, language).then(b => { if (vivo) setBiglietto(b); });
    return () => { vivo = false; };
  }, [visit.venueKey, online]);

  // DOMANI: orari, chiusure, biglietto dal sito ufficiale. Si chiede una
  // volta per visita; in cache sul server una settimana.
  const [domani, setDomani] = useState<Domani | null>(null);
  // «CHIUDE FRA 40 MINUTI» (11/09/2026): con gli orari di oggi si sa quanto
  // manca alla chiusura. Sotto l'ora, la scheda lo dice e mette davanti le
  // opere mancanti più vicine — quelle della sala in cui si è — invece di
  // lasciarlo scoprire dalla guardia che spegne le luci. Si ricalcola ogni
  // minuto.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setAdesso(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const minutiAllaChiusura = (() => {
    const o = domani?.oggi;
    if (!o || o.chiuso) return null;
    const m = String(o.chiude).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const chiusura = new Date(adesso); chiusura.setHours(Number(m[1]), Number(m[2]), 0, 0);
    const diff = Math.round((chiusura.getTime() - adesso) / 60_000);
    return diff > 0 && diff <= 60 ? diff : null;
  })();
  useEffect(() => {
    if (!online) return;
    let vivo = true;
    fetchDomani(visit, language).then(d => {
      if (!vivo) return;
      setDomani(d);
      // LE SALE CHIUSE OGGI (12/09/2026): gli avvisi del sito incrociati
      // col percorso, prima di partire. Il testo resta sulla visita.
      if (d?.saleChiuse) applicaSaleChiuse(d.saleChiuse);
    });
    return () => { vivo = false; };
  }, [visit.venueKey, online]);
  const testoSaleChiuse = visit.saleChiuse?.testo || domani?.saleChiuse || '';
  const chiuseOggi = visit.guide.tappe.filter(tp => tp.chiusaOggi).length;
  // «CHIEDI ALLA GUIDA» (12/09/2026): la domanda che resta quando la voce
  // ha finito. Risposta dal materiale di quell'opera, un credito, letta a
  // voce e scritta sotto la tappa.
  const [domanda, setDomanda] = useState('');
  const [risposte, setRisposte] = useState<Record<number, { q: string; a: string }[]>>({});
  const [chiedendo, setChiedendo] = useState(false);
  const chiedi = async (i: number, q: string) => {
    const tappa = visit.guide.tappe[i];
    const testoQ = q.trim();
    if (!tappa || testoQ.length < 3 || chiedendo) return;
    setChiedendo(true);
    const r = await askGuide({ artwork: tappa.nomeFonte || tappa.nome, venueName: visit.venue.name, question: testoQ, language });
    setChiedendo(false);
    if (!r.ok) { notify(r.reason === 'credits' ? t('mv_ask_no_credits') : t('mv_ask_failed')); return; }
    setRisposte(prev => ({ ...prev, [i]: [...(prev[i] || []), { q: testoQ, a: r.risposta || '' }] }));
    setDomanda('');
    stopSpeech(); setOperaParla(null); setOperaInPausa(null);
    void speakWithSystemVoice(r.risposta || '', String(language).toLowerCase(), getGuideCharacter());
  };

  // FOTO RICORDO (12/09/2026): lo scatto della persona davanti all'opera,
  // con in basso nome, autore, museo e data. La foto è sua, la didascalia
  // è nostra.
  const fotoRicordoRef = useRef<HTMLInputElement>(null);
  const [fotoRicordoPer, setFotoRicordoPer] = useState<number | null>(null);
  const handleFotoRicordo = async (file: File | null) => {
    const i = fotoRicordoPer;
    setFotoRicordoPer(null);
    if (fotoRicordoRef.current) fotoRicordoRef.current.value = '';
    if (!file || i === null) return;
    const tappa = visit.guide.tappe[i];
    if (!tappa) return;
    const data = new Date().toLocaleDateString(String(language).toLowerCase(), { day: 'numeric', month: 'long', year: 'numeric' });
    const blob = await componiFotoRicordo(file, [tappa.nome, [tappa.autore, visit.venue.name, data].filter(Boolean).join(' · ')]);
    if (!blob) { notify(t('vis_generic_error')); return; }
    const nomeFile = `wip-${tappa.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.jpg`;
    const esito = await condividiImmagine(blob, nomeFile, `${tappa.nome} · ${visit.venue.name} · wip.guide`);
    if (esito !== 'fallita') notify(t('mv_photo_saved'));
  };

  // LA CARTOLINA DELLA GIORNATA (12/09/2026): «Oggi agli Uffizi», le opere
  // viste, i minuti di racconto, la preferita in grande. Da mandare la
  // sera stessa. Nasce sul telefono: nessun server.
  const [condividendo, setCondividendo] = useState(false);
  const condividiGiornata = async () => {
    if (condividendo) return;
    setCondividendo(true);
    try {
      const viste = visit.guide.tappe.filter(x => x.seenCardId);
      const pref = visit.guide.tappe.find(x => x.preferita) || viste[0] || null;
      const minutiAperti = (Object.values(operaGuide) as ArtworkGuide[]).reduce((s: number, g) => s + Math.max(1, Math.round((g?.parole || 0) / 150)), 0);
      const blob = await componiCartolina({
        titolo: t('mv_postcard_title').replace('{s}', visit.venue.name),
        sottotitolo: t('mv_postcard_seen').replace('{n}', String(viste.length)).replace('{m}', String(Math.max(minutiAperti, viste.length * 3))),
        data: new Date().toLocaleDateString(String(language).toLowerCase(), { day: 'numeric', month: 'long', year: 'numeric' }),
        preferita: pref ? { nome: pref.nome, foto: pref.foto || pref.fotoIcona } : null,
        miniature: viste.filter(x => x !== pref).slice(0, 6).map(x => ({ nome: x.nome, foto: x.fotoIcona || x.foto })),
        etichettaPreferita: t('mv_postcard_fav'),
      });
      if (!blob) { notify(t('vis_generic_error')); return; }
      await condividiImmagine(blob, 'wip-oggi-al-museo.jpg', t('mv_postcard_text'));
    } finally {
      setCondividendo(false);
    }
  };

  // PRESCARICAMENTO all'ingresso: le prime otto opere, mentre c'è segnale.
  const [prefetch, setPrefetch] = useState<{ fatte: number; totali: number } | null>(null);
  // LEGGI CON CALMA: preferenza della persona, non della visita.
  const [calma, setCalma] = useState<boolean>(() => getLeggiConCalma());
  useEffect(() => { setSpeechSpeed(calma ? 0.85 : 1); }, [calma]);
  const fmtData = (s: string) => { try { return new Date(s).toLocaleDateString(String(language).toLowerCase(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };
  // AUDIODESCRIZIONE (12/09/2026): il testo per tappa, chi sta descrivendo,
  // e la preferenza «prima di ogni opera» (accessibilità).
  const [descrizioni, setDescrizioni] = useState<Record<number, string>>({});
  const [descrivendo, setDescrivendo] = useState<number | null>(null);
  const [descrizioneAuto, setDescrizioneAuto] = useState<boolean>(() => getAudiodescrizioneAuto());
  // LE MOSTRE IN CORSO: una lettura per visita, solo online.
  const [mostre, setMostre] = useState<Mostra[]>([]);
  useEffect(() => {
    if (!online) return;
    let vivo = true;
    fetchMostre(visit, language).then(m => { if (vivo) setMostre(m); });
    return () => { vivo = false; };
  }, [visit.venueKey, online]);
  // COMANDI VOCALI: microfono acceso/spento. Le azioni si leggono da un ref
  // aggiornato a ogni render, così il riconoscitore (avviato una volta) non
  // resta legato a una vecchia chiusura con stati vecchi.
  const [ascolto, setAscolto] = useState(false);
  const fermaAscoltoRef = useRef<(() => void) | null>(null);
  const azioniRef = useRef<Partial<Record<ComandoVocale, () => void>>>({});
  useEffect(() => () => { fermaAscoltoRef.current?.(); fermaAscoltoRef.current = null; }, []);
  // INQUADRA IL CARTELLINO (12/09/2026): la didascalia letta e tradotta,
  // agganciata alla tappa del percorso se c'è, altrimenti audioguida al volo.
  const [cartellino, setCartellino] = useState<(Cartellino & { tappa: number | null }) | null>(null);
  const [leggendoCartellino, setLeggendoCartellino] = useState(false);
  const [guidaCartellino, setGuidaCartellino] = useState<ArtworkGuide | null>(null);
  const [caricandoGuidaCartellino, setCaricandoGuidaCartellino] = useState(false);
  const cartellinoRef = useRef<HTMLInputElement>(null);
  // IL CONFRONTO: le coppie del percorso e i testi già ascoltati.
  const [confronti, setConfronti] = useState<Record<string, string>>({});
  const [confrontando, setConfrontando] = useState<string | null>(null);
  const [confrontoParla, setConfrontoParla] = useState<string | null>(null);
  const [promemoria, setPromemoria] = useState(false);
  const promemoriaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const azzeraPromemoria = () => {
    if (promemoriaTimer.current) { clearTimeout(promemoriaTimer.current); promemoriaTimer.current = null; }
    setPromemoria(false);
  };
  const armaPromemoria = () => {
    if (promemoriaTimer.current) clearTimeout(promemoriaTimer.current);
    promemoriaTimer.current = setTimeout(() => {
      setPromemoria(true);
      // Una vibrazione sola: nativo dove c'è, altrimenti il browser.
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {
        try { (navigator as any).vibrate?.(200); } catch { /* niente */ }
      });
    }, 90_000);
  };
  useEffect(() => () => { if (promemoriaTimer.current) clearTimeout(promemoriaTimer.current); }, []);

  useEffect(() => () => { stopSpeech(); }, []);

  // La visita entra in archivio appena si apre, e si aggiorna quando il
  // percorso cambia (opere aggiunte, tappe spuntate o saltate). Senza questo
  // le audioguide ascoltate non avrebbero dove essere conservate, e fra sei
  // ore — quando la visita in corso scade — resterebbe solo il ricordo.
  useEffect(() => {
    conservaVisita(visit, language);
  }, [visit.venueKey, visit.guide?.tappe?.length, visit.updatedAt, language]);

  // TOUR DI GRUPPO: il leader apre una visita e il gruppo riceve lo stesso
  // percorso. Si manda quando cambia il luogo o si allunga il percorso (opere
  // aggiunte). Il modulo del tour ignora l'evento se non si è leader.
  useEffect(() => {
    if (!sonoLeader || visit.dalLeader) return;
    window.dispatchEvent(new CustomEvent('wip-leader-museum-visit', {
      detail: {
        venueKey: visit.venueKey, venue: visit.venue, guide: visit.guide, source: visit.source,
        venuePhoto: visit.venuePhoto || '', venuePhotoIcon: visit.venuePhotoIcon || '',
      },
    }));
  }, [sonoLeader, visit.venueKey, visit.guide?.tappe?.length]);

  // LE PRIME OPERE SI SCARICANO DA SOLE ALL'INGRESSO (11/09/2026). Una volta
  // per visita, solo con la rete, non per chi segue un leader (a lui arriva
  // tutto dal leader). Si ferma da solo se il pass manca. Il conteggio in
  // testata dice cosa sta succedendo; se si cambia museo a metà, si smette.
  useEffect(() => {
    if (!online || visit.dalLeader || visit.prefetchFatto) return;
    let vivo = true;
    prescaricaPrimeOpere(visit, language, 8, (f, t) => { if (vivo) setPrefetch({ fatte: f, totali: t }); }, pers.bambini ? 'bambini' : '')
      .then(() => { if (vivo) { setPrefetch(null); segnaPrefetchFatto(); } })
      .catch(() => { if (vivo) setPrefetch(null); });
    return () => { vivo = false; };
  }, [visit.venueKey, online]);

  // Dalla griglia «è una di queste?» della fotocamera: si apre e parte
  // l'opera scelta con gli occhi.
  useEffect(() => {
    const onPlay = (e: any) => { const i = Number(e?.detail?.index); if (Number.isFinite(i) && visit.guide.tappe[i]) void handleOpera(i); };
    window.addEventListener('wip-museum-play-index', onPlay);
    return () => window.removeEventListener('wip-museum-play-index', onPlay);
  });

  // Follower: il leader ha scelto un'opera. Si apre la stessa tappa col
  // testo, così si legge mentre la voce (che arriva da 'audio-start') parla.
  useEffect(() => {
    if (sonoLeader) return;
    const onStop = (e: any) => {
      const d = e?.detail || {};
      const i = Number(d.index);
      if (!Number.isFinite(i) || !d.guide?.testo) return;
      setOperaGuide(prev => ({ ...prev, [i]: d.guide }));
      setOperaAperta(i);
      setLettore(prev => (prev === null ? prev : i));
    };
    window.addEventListener('wip-museum-stop-from-leader', onStop);
    return () => window.removeEventListener('wip-museum-stop-from-leader', onStop);
  }, [sonoLeader]);

  // DAL TASTO DELLE CUFFIE (11/09/2026): sul web e nella PWA i comandi
  // «traccia successiva» e «play» della schermata di blocco e delle cuffie
  // passano da qui. «Successiva» = ascolta la prossima opera non vista;
  // «play» a voce ferma = idem. Sull'app nativa il lettore di sistema
  // gestisce già play/pausa; il «successiva» nativo richiede un aggiornamento
  // del plugin Kotlin/Swift, annotato a parte.
  useEffect(() => {
    const ms = (typeof navigator !== 'undefined' && (navigator as any).mediaSession) || null;
    if (!ms) return;
    const prossima = () => { const p = prossimaTappa(visit); if (p) void handleOpera(p.indice); };
    try {
      ms.setActionHandler('nexttrack', prossima);
      ms.setActionHandler('play', () => { if (operaInPausa !== null) void handleOpera(operaInPausa); else prossima(); });
      ms.setActionHandler('pause', () => { if (operaParla !== null) void handleOpera(operaParla); });
    } catch { /* browser senza mediaSession completa */ }
    return () => {
      try { ms.setActionHandler('nexttrack', null); ms.setActionHandler('play', null); ms.setActionHandler('pause', null); } catch { /* ok */ }
    };
  });

  useEffect(() => {
    const su = () => setOnline(true);
    const giu = () => setOnline(false);
    window.addEventListener('online', su);
    window.addEventListener('offline', giu);
    return () => { window.removeEventListener('online', su); window.removeEventListener('offline', giu); };
  }, []);

  // Esperienze prenotabili del museo: solo con la rete e solo per chi ha il
  // pass (il server rifiuta agli altri). Best-effort: se non ci sono, la
  // sezione non compare.
  const [esperienze, setEsperienze] = useState<EsperienzaMuseo[]>([]);
  useEffect(() => {
    if (!online) return;
    let vivo = true;
    fetchEsperienzeMuseo(visit, language).then(e => { if (vivo) setEsperienze(e); });
    return () => { vivo = false; };
  }, [visit.venueKey, language, online]);

  /** Scarica tutto: percorso, audioguide di ogni opera, foto. */
  const handleScarica = async () => {
    if (scaricando) return;
    setScaricando({ fatte: 0, totali: visit.guide.tappe.length });
    try {
      const esito = await scaricaPacchettoMuseo(visit, language, (fatte, totali) => setScaricando({ fatte, totali }));
      setScaricato(true);
      notify(
        esito.mancanti.length
          ? t('mv_scaricato_parziale').replace('{n}', String(esito.opere)).replace('{t}', String(esito.opereTotali))
          : t('mv_scaricato').replace('{n}', String(esito.opere)),
        'success'
      );
    } catch {
      notify(t('vis_generic_error'));
    } finally {
      setScaricando(null);
    }
  };

  /** «Aggiungi opere»: l'AI propone le opere minori non ancora nel percorso. */
  const handleAggiungiOpere = async () => {
    if (aggiungendo || !online) return;
    setAggiungendo(true);
    const out = await fetchMoreArtworks(visit, language);
    setAggiungendo(false);
    if (out.ok && out.added.length) {
      notify(t('mv_aggiunte').replace('{n}', String(out.added.length)), 'success');
    } else {
      notify(out.reason === 'needs_tour_pass' ? t('mv_locked_title') : t('mv_niente_altre'));
    }
  };

  const seen = countSeen(visit);
  const total = visit.guide.tappe.length;
  const passActive = passExpiresAt !== null && passExpiresAt > Date.now();
  const isChurch = visit.guide.tipo === 'chiesa';
  const TypeIcon = isChurch ? Church : Landmark;

  // Introduzione + le tappe ancora da vedere, come una guida che accompagna.
  const audioText = () => {
    const next = visit.guide.tappe.filter(x => !x.seenCardId).slice(0, 4);
    const parts = [visit.guide.intro];
    if (visit.guide.consiglio) parts.push(visit.guide.consiglio);
    next.forEach(x => parts.push(`${x.nome}${x.dove ? ` (${x.dove})` : ''}. ${x.perche}`));
    return parts.filter(Boolean).join('\n');
  };

  /**
   * PAUSA VERA, NON SPEGNIMENTO (11/09/2026).
   *
   * Il tasto diceva «Pausa» e chiamava `stopSpeech()`: al tocco successivo
   * il racconto ripartiva dalla prima parola. In un museo si viene
   * interrotti di continuo — un custode, una sala piena, qualcuno che ti
   * chiama — e ogni interruzione costava tre minuti di riascolto. È il
   * gesto più frequente di tutta la visita, ed era l'unico che non
   * funzionava.
   * `pauseSpeech`/`resumeSpeech` esistevano già e coprono tutti i casi
   * (audio registrato, riproduzione nativa in background, voce di sistema):
   * semplicemente qui non erano mai state collegate.
   */
  const [audioInPausa, setAudioInPausa] = useState(false);

  const handleAudio = async () => {
    if (audioLoading) return;
    if (audioPlaying) { pauseSpeech(); setAudioPlaying(false); setAudioInPausa(true); return; }
    if (audioInPausa) { resumeSpeech(); setAudioInPausa(false); setAudioPlaying(true); return; }
    setAudioLoading(true);
    try {
      await speakAudioguide(audioText(), String(visit.guide.language || language).toLowerCase(), getGuideCharacter(), () => { setAudioPlaying(false); setAudioInPausa(false); });
      setAudioPlaying(true);
      setAudioInPausa(false);
    } catch {
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  /**
   * PRIMA DI USCIRE (11/09/2026).
   *
   * Chi esce da un museo non sa mai cosa si è perso: il percorso resta
   * aperto sul telefono, ma nessuno lo rilegge in senso inverso. Al tocco su
   * «termina» si mostra una volta sola quello che manca — le opere non viste
   * e quelle saltate — raggruppato per sala, così la scelta è concreta:
   * «sono tutte al primo piano, dieci minuti» e non «hai visto 12 su 20».
   * Se non manca niente, la visita finisce senza cerimonie.
   */
  const [primaDiUscire, setPrimaDiUscire] = useState(false);
  // «Dove sono»: si inquadra il cartello della sala e il percorso si
  // riordina da lì. È l'unico orientamento indoor possibile senza QR,
  // beacon o accordi con i musei — la scritta sul muro c'è già.
  const [leggendoSala, setLeggendoSala] = useState(false);
  const cartelloRef = useRef<HTMLInputElement>(null);

  /**
   * LA GUIDA SU CARTA. Il nome del file lo decide `document.title` quando si
   * cade sulla stampa del browser: senza questo giro ogni guida stampata si
   * salverebbe con lo stesso nome dell'app, e dieci musei diventerebbero
   * dieci file identici nella cartella dei download.
   */
  const handleStampa = async () => {
    // SUL TELEFONO NON ESISTE window.print() (12/09/2026, committente: «il
    // tasto stampa la guida non funziona»): il WebView non stampa. Come per
    // gli itinerari (PlanScreen) si genera il PDF con html2pdf dalla vista di
    // stampa e lo si salva nei Documenti. La vista è display:none: la si
    // mostra fuori schermo solo per il tempo del rendering.
    const nomeFile = `WIP - ${visit.venue.name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.pdf`;
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const elemento = document.getElementById('museum-print-view') as HTMLElement | null;
        if (!elemento) { notify(t('pf_pdf_non_riuscito')); return; }
        notify(t('pf_pdf_in_corso'));
        const stilePrima = elemento.getAttribute('style') || '';
        elemento.setAttribute('style', 'display:block;position:absolute;top:0;left:-9999px;width:794px;background:#fff;color:#1e1b14');
        try {
          const mod: any = await import('html2pdf.js');
          const html2pdf = mod.default || mod;
          const blob: Blob = await html2pdf().set({
            margin: [10, 12, 15, 12],
            filename: nomeFile,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: {
              scale: 2, useCORS: true, logging: false, allowTaint: true, scrollY: 0, windowWidth: 794,
              onclone: (doc: Document) => {
                const clone = doc.getElementById('museum-print-view') as HTMLElement | null;
                if (clone) clone.setAttribute('style', 'display:block;position:static;width:794px;max-width:none;background:#fff;color:#1e1b14');
              },
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] },
          }).from(elemento).outputPdf('blob');
          const { saveBlobAsFile } = await import('../services/premiumGuideService');
          const ok = await saveBlobAsFile(blob, nomeFile);
          notify(t(ok ? 'pf_pdf_salvato' : 'pf_pdf_non_riuscito'));
        } finally {
          elemento.setAttribute('style', stilePrima);
        }
        return;
      }
    } catch (e) {
      console.error('[MuseumVisitSheet] PDF non riuscito', e);
      notify(t('pf_pdf_non_riuscito'));
      return;
    }
    const titoloPrima = document.title;
    document.title = `WIP - ${visit.venue.name}`;
    printScoped('museum', () => {
      window.print();
      document.title = titoloPrima;
    });
  };

  const handleCartello = async (file: File | null) => {
    if (!file) return;
    setLeggendoSala(true);
    try {
      const b64 = await new Promise<string>((risolvi, rifiuta) => {
        const fr = new FileReader();
        fr.onload = () => risolvi(String(fr.result || ''));
        fr.onerror = () => rifiuta(new Error('lettura fallita'));
        fr.readAsDataURL(file);
      });
      const sale = visit.guide.tappe.map(t => String(t.dove || '').trim()).filter(Boolean);
      const esito = await leggiCartelloSala(b64, [...new Set(sale)]);
      if (esito.ok && esito.sala) {
        impostaSalaCorrente(esito.sala);
        azzeraPromemoria();
        notify(t('mv_room_found').replace('{s}', esito.sala));
      } else {
        notify(t('mv_room_not_read'));
      }
    } catch {
      notify(t('vis_generic_error'));
    } finally {
      setLeggendoSala(false);
      if (cartelloRef.current) cartelloRef.current.value = '';
    }
  };

  const mancanti = visit.guide.tappe.filter((t, k) => attivi.has(k) && !t.seenCardId);
  const mancantiPerSala = (() => {
    const m = new Map<string, typeof mancanti>();
    for (const t of mancanti) {
      const k = String(t.dove || '').trim();
      if (!m.has(k)) m.set(k, [] as any);
      (m.get(k) as any).push(t);
    }
    return [...m.entries()];
  })();

  const handleEnd = () => {
    if (mancanti.length > 0 && !primaDiUscire) { setPrimaDiUscire(true); return; }
    stopSpeech();
    endVisit();
    onClose();
  };

  /**
   * «E POI?» (12/09/2026). Si esce dagli Uffizi alle 12 con mezza giornata
   * davanti: i musei della libreria a piedi da qui, con distanza, orario di
   * chiusura di oggi, opere e durata stimata. Si chiede una volta, quando
   * la visita è finita o si apre «prima di uscire»; un tocco e la visita
   * successiva parte, con quella di adesso messa in archivio.
   */
  const visitaCompleta = total > 0 && seen > 0 && mancanti.length === 0;
  const [prossimi, setProssimi] = useState<MuseumLibraryItem[] | null>(null);
  const [orariProssimi, setOrariProssimi] = useState<Record<string, Domani | null>>({});
  const [avviandoProssimo, setAvviandoProssimo] = useState<string | null>(null);
  const prossimiChiesti = useRef(false);
  useEffect(() => {
    if (!online || prossimiChiesti.current) return;
    if (!primaDiUscire && !visitaCompleta) return;
    prossimiChiesti.current = true;
    museiAPiediDaQui(visit, language, 3).then(async (m) => {
      setProssimi(m);
      const orari: Record<string, Domani | null> = {};
      await Promise.all(m.map(async x => { orari[x.venue_key] = await fetchOrariDi(x.venue_name, x.poi_id, language); }));
      setOrariProssimi(orari);
    });
  }, [primaDiUscire, visitaCompleta, online]);

  const vaiAlProssimo = async (m: MuseumLibraryItem) => {
    if (avviandoProssimo) return;
    setAvviandoProssimo(m.venue_key);
    try {
      stopSpeech();
      conservaVisita(visit, language);
      const out = m.poi_id
        ? await startVisitByPoi(m.poi_id, language, { lat: m.lat, lon: m.lon })
        : await startVisitByName(m.venue_name, { lat: m.lat, lon: m.lon }, language);
      if (out.ok && out.visit) {
        setPrimaDiUscire(false);
        window.dispatchEvent(new CustomEvent(OPEN_MUSEUM_VISIT_EVENT));
      } else {
        notify(out.reason === 'needs_tour_pass' ? t('mv_locked_title') : out.reason === 'network' ? t('vis_generic_error') : t('mv_not_found'));
      }
    } finally {
      setAvviandoProssimo(null);
    }
  };

  const renderEPoi = () => {
    if (!prossimi || prossimi.length === 0) return null;
    return (
      <div className="mt-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1.5">
          <Footprints className="w-3.5 h-3.5" />{t('mv_next_museum')}
        </p>
        <div className="space-y-1.5">
          {prossimi.map(m => {
            const o = orariProssimi[m.venue_key]?.oggi;
            const d = m.distance_m ?? 0;
            const dist = d >= 1000 ? `${(d / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(d)} m`;
            // 80 m al minuto a piedi; tre minuti e mezzo per opera, arrotondati ai 5.
            const camminata = Math.max(1, Math.round(d / 80));
            const durata = Math.max(15, Math.round((m.stops_count * 3.5) / 5) * 5);
            return (
              <button
                key={m.venue_key}
                onClick={() => void vaiAlProssimo(m)}
                disabled={!!avviandoProssimo}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white border border-slate-200 text-left active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {m.venue_photo_icon ? (
                  <img src={m.venue_photo_icon} alt="" loading="lazy" className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Landmark className="w-5 h-5 text-primary" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-slate-900 truncate">{m.venue_name}</p>
                  <p className="text-[11px] font-bold text-slate-500 truncate">
                    {t('mv_next_museum_line').replace('{d}', `${dist} (${camminata} min)`).replace('{n}', String(m.stops_count)).replace('{m}', String(durata))}
                  </p>
                  {o && (
                    <p className={`text-[11px] font-black truncate ${o.chiuso ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {o.chiuso ? t('mv_closed_now') : t('mv_open_until').replace('{h}', o.chiude)}
                    </p>
                  )}
                </div>
                {avviandoProssimo === m.venue_key ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /**
   * Ascolta l'audioguida dettagliata di UNA tappa: la chiede al server la
   * prima volta (poi resta in cache lato server per tutti) e la legge con la
   * voce della guida. Un secondo tocco la ferma.
   */
  /** La descrizione di una tappa: dalla memoria, dall'archivio, dal server. */
  const ottieniDescrizione = async (i: number): Promise<string | null> => {
    const tappa = visit.guide.tappe[i];
    if (!tappa) return null;
    if (descrizioni[i]) return descrizioni[i];
    const locale = descrizioneDallArchivio(visit.venueKey, language, tappa.nome);
    if (locale) { setDescrizioni(prev => ({ ...prev, [i]: locale })); return locale; }
    const foto = tappa.foto || operaGuide[i]?.foto || '';
    if (!foto) { notify(t('mv_describe_no_photo')); return null; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { notify(t('mv_offline_non_scaricata')); return null; }
    setDescrivendo(i);
    const r = await fetchAudioDescription({ artwork: tappa.nomeFonte || tappa.nome, venueName: visit.venue.name, photo: foto, language });
    setDescrivendo(null);
    if (r.ok === false) {
      const motivo = r.reason;
      notify(motivo === 'needs_pass' ? t('mv_art_needs_pass') : motivo === 'pass_exhausted' ? t('mv_art_exhausted') : motivo === 'no_photo' ? t('mv_describe_no_photo') : t('mv_describe_failed'));
      return null;
    }
    // Resta sul telefono: la prossima volta, anche senza rete, non si richiede.
    conservaDescrizione(visit.venueKey, language, tappa.nome, r.testo);
    setDescrizioni(prev => ({ ...prev, [i]: r.testo }));
    return r.testo;
  };

  /** «Descrivimi l'opera»: voce lenta, poi si torna alla velocità scelta. */
  const handleDescrivi = async (i: number) => {
    stopSpeech(); setOperaParla(null); setOperaInPausa(null);
    const testo = await ottieniDescrizione(i);
    if (!testo) return;
    setOperaAperta(i);
    setSpeechSpeed(0.85);
    try {
      await speakAudioguide(testo, String(language).toLowerCase(), getGuideCharacter(), () => { setSpeechSpeed(calma ? 0.85 : 1); setOperaParla(null); });
      setOperaParla(i);
    } catch {
      setSpeechSpeed(calma ? 0.85 : 1);
      setOperaParla(null);
    }
  };

  const handleOpera = async (i: number, opzioni?: { daCapo?: boolean }) => {
    const tappa = visit.guide.tappe[i];
    if (!tappa) return;
    // Pausa vera anche qui — anzi, soprattutto qui: è il tasto che si preme
    // stando in piedi davanti al quadro, con qualcuno che ti passa davanti.
    // «daCapo» (comando vocale «ripeti») salta pausa e ripresa: riparte.
    if (!opzioni?.daCapo) {
      if (operaParla === i) { pauseSpeech(); setOperaParla(null); setOperaInPausa(i); return; }
      if (operaInPausa === i && operaGuide[i]) { resumeSpeech(); setOperaInPausa(null); setOperaParla(i); return; }
    }
    stopSpeech();
    setOperaParla(null);
    setOperaInPausa(null);
    azzeraPromemoria();

    let guida = operaGuide[i];
    // ARCHIVIO: se il museo è stato scaricato, il testo è già nostro. Non si
    // chiama il server e NON si ripaga: quello che hai scaricato è tuo.
    // Coi bambini l'archivio non serve: dentro ci sono i racconti per adulti.
    if (!guida && !pers.bambini) {
      const dallArchivio = operaDallArchivio(visit.venueKey, language, tappa.nome);
      if (dallArchivio) {
        guida = dallArchivio;
        setOperaGuide(prev => ({ ...prev, [i]: dallArchivio }));
      }
    }
    if (!guida) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        notify(t('mv_offline_non_scaricata'));
        return;
      }
      setOperaLoading(i);
      const resp = await fetchArtworkGuide({
        // Si cerca col titolo della FONTE: è quello che Wikipedia e Wikidata
        // conoscono; la traduzione, spesso, no.
        artwork: tappa.nomeFonte || tappa.nome,
        venueName: visit.venue.name,
        artist: tappa.autore || null,
        room: tappa.dove || null,
        language,
        stile: pers.bambini ? 'bambini' : '',
      });
      setOperaLoading(null);
      if (!resp) { notify(t('vis_generic_error')); return; }
      if (resp.ok !== true) {
        notify(
          resp.reason === 'needs_pass' ? t('mv_art_needs_pass')
            : resp.reason === 'pass_exhausted' ? t('mv_art_exhausted')
            : t('mv_art_no_source')
        );
        return;
      }
      guida = resp.guide;
      setOperaGuide(prev => ({ ...prev, [i]: guida }));
      // TUTTO QUELLO CHE ASCOLTI RESTA: l'audioguida appena pagata entra
      // subito nell'archivio. Da adesso in poi il riascolto — stasera, fra
      // un mese, senza rete — non chiama più il server e non costa più nulla.
      // Nell'archivio va solo il racconto per adulti: è quello che si
      // riascolta e si stampa.
      if (!pers.bambini) conservaOpera(visit.venueKey, language, tappa.nome, guida);
    }
    setOperaAperta(i);
    // TOUR DI GRUPPO: chi guida manda l'opera al gruppo PRIMA di ascoltarla,
    // così le voci partono insieme. Il modulo ignora l'evento se non si è
    // leader. Due messaggi: la scheda (testo sotto la tappa giusta) e la voce
    // (stesso testo, stessa lingua, stesso personaggio = stesso MP3 dal
    // server, già pagato dal leader).
    if (sonoLeader) {
      window.dispatchEvent(new CustomEvent('wip-leader-museum-stop', { detail: { index: i, nome: tappa.nome, guide: guida } }));
      window.dispatchEvent(new CustomEvent('wip-leader-audio-start', { detail: { textToSpeak: guida.testo, poiName: tappa.nome, character: getGuideCharacter(), language: String(guida.language || language).toLowerCase() } }));
      // La sala dell'opera in ascolto è dove il leader sta: si dice al gruppo.
      if (tappa.dove) window.dispatchEvent(new CustomEvent('wip-leader-museum-room', { detail: { sala: tappa.dove } }));
    }
    try {
      const lingua = String(guida.language || language).toLowerCase();
      const fineOpera = () => {
        setOperaParla(null);
        setOperaInPausa(null);
        // IL TEASER (11/09/2026, richiesta del committente): finita l'opera,
        // una frase sola dice qual è la prossima e in che sala — «quando sei
        // davanti, premi play». Voce di sistema: gratis, immediata, e non
        // consuma nulla. Chi tiene il telefono in tasca sa dove andare senza
        // tirarlo fuori. I follower del gruppo non lo sentono: a loro parla
        // il leader.
        if (visit.dalLeader) return;
        // Da qui parte il conto del promemoria: se fra un minuto e mezzo non
        // è successo niente, si propone di inquadrare la targa della sala.
        armaPromemoria();
        const p = prossimaTappa(getVisitSnapshot());
        if (!p || p.indice === i) return;
        const frase = (p.tappa.dove ? t('mv_teaser_next').replace('{s}', p.tappa.dove) : t('mv_teaser_next_noroom')).replace('{n}', p.tappa.nome);
        void speakWithSystemVoice(frase, lingua, getGuideCharacter());
      };
      const parlaGuida = async () => {
        await speakAudioguide(guida.testo, lingua, getGuideCharacter(), fineOpera);
        setOperaParla(i);
        // Ascoltata = vista: la spunta parte con l'ascolto, non alla fine.
        markStopListened(i);
      };
      // ACCESSIBILITÀ (12/09/2026): con la preferenza accesa, prima si dice
      // cosa si vede — lentamente — e poi parte il racconto.
      const descr = descrizioneAuto && (tappa.foto || guida.foto) ? await ottieniDescrizione(i) : null;
      if (descr) {
        setSpeechSpeed(0.85);
        await speakAudioguide(descr, String(language).toLowerCase(), getGuideCharacter(), () => { setSpeechSpeed(calma ? 0.85 : 1); void parlaGuida(); });
        setOperaParla(i);
      } else {
        await parlaGuida();
      }
    } catch {
      setSpeechSpeed(calma ? 0.85 : 1);
      setOperaParla(null);
    }
  };

  /** Lo stato più recente della visita, per chi arriva da una callback. */
  const getVisitSnapshot = (): MuseumVisit => visit;

  /** Il cartellino: foto → lettura → traduzione → aggancio al percorso. */
  const handleCartellino = async (file: File | null) => {
    if (!file) return;
    setLeggendoCartellino(true);
    try {
      const b64 = await new Promise<string>((risolvi, rifiuta) => {
        const fr = new FileReader();
        fr.onload = () => risolvi(String(fr.result || ''));
        fr.onerror = () => rifiuta(new Error('lettura fallita'));
        fr.readAsDataURL(file);
      });
      const r = await leggiCartellino(b64, visit.venue.name, language);
      if (r.ok === false) { notify(r.reason === 'nessun_cartellino' ? t('mv_label_not_read') : t('vis_generic_error')); return; }
      const c = r.cartellino;
      const i = c.titolo ? matchTappa(visit.guide, c.titolo) : -1;
      setGuidaCartellino(null);
      setCartellino({ ...c, tappa: i >= 0 ? i : null });
      if (i >= 0) setOperaAperta(i);
    } catch {
      notify(t('vis_generic_error'));
    } finally {
      setLeggendoCartellino(false);
      if (cartellinoRef.current) cartellinoRef.current.value = '';
    }
  };
  /** Dal cartellino all'audioguida: la tappa se c'è, altrimenti al volo dal titolo letto. */
  const ascoltaDalCartellino = async () => {
    if (!cartellino) return;
    if (cartellino.tappa !== null) { void handleOpera(cartellino.tappa, { daCapo: true }); return; }
    if (guidaCartellino) {
      stopSpeech(); setOperaParla(null); setOperaInPausa(null);
      try { await speakAudioguide(guidaCartellino.testo, String(guidaCartellino.language || language).toLowerCase(), getGuideCharacter()); } catch { /* voce assente */ }
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { notify(t('mv_offline_non_scaricata')); return; }
    setCaricandoGuidaCartellino(true);
    const resp = await fetchArtworkGuide({ artwork: cartellino.titolo, venueName: visit.venue.name, artist: cartellino.autore || null, language });
    setCaricandoGuidaCartellino(false);
    if (!resp) { notify(t('vis_generic_error')); return; }
    if (resp.ok !== true) {
      notify(resp.reason === 'needs_pass' ? t('mv_art_needs_pass') : resp.reason === 'pass_exhausted' ? t('mv_art_exhausted') : t('mv_art_no_source'));
      return;
    }
    setGuidaCartellino(resp.guide);
    stopSpeech(); setOperaParla(null); setOperaInPausa(null);
    try { await speakAudioguide(resp.guide.testo, String(resp.guide.language || language).toLowerCase(), getGuideCharacter()); } catch { /* voce assente */ }
  };

  /** Il confronto fra due opere: dal server la prima volta, poi in memoria. */
  const coppie = coppieDaConfrontare(visit, attivi, 3);
  const chiaveCoppia = (c: Coppia) => `${c.a}-${c.b}`;
  const handleConfronto = async (c: Coppia) => {
    const k = chiaveCoppia(c);
    if (confrontoParla === k) { stopSpeech(); setConfrontoParla(null); return; }
    stopSpeech(); setOperaParla(null); setOperaInPausa(null); setConfrontoParla(null);
    let testo: string | undefined = confronti[k];
    if (!testo) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { notify(t('mv_offline_non_scaricata')); return; }
      setConfrontando(k);
      const r = await fetchConfronto({ a: visit.guide.tappe[c.a], b: visit.guide.tappe[c.b], venueName: visit.venue.name, language });
      setConfrontando(null);
      if (r.ok === false) {
        notify(r.reason === 'needs_pass' ? t('mv_art_needs_pass') : r.reason === 'pass_exhausted' ? t('mv_art_exhausted') : t('mv_compare_failed'));
        return;
      }
      testo = r.testo;
      setConfronti(prev => ({ ...prev, [k]: r.testo }));
    }
    try {
      await speakAudioguide(testo, String(language).toLowerCase(), getGuideCharacter(), () => setConfrontoParla(null));
      setConfrontoParla(k);
    } catch {
      setConfrontoParla(null);
    }
  };

  // LE AZIONI DEI COMANDI VOCALI (12/09/2026), riscritte a ogni render così
  // vedono gli stati di adesso. «prossima» e «ripeti» ripartono da capo;
  // «dov'è» dice sala e punto preciso dell'opera in ascolto (o della
  // prossima) con la voce di sistema, gratis.
  azioniRef.current = {
    prossima: () => {
      const p = prossimaTappa(visit);
      if (p) void handleOpera(p.indice, { daCapo: true }); else notify(t('mv_voice_nothing'));
    },
    ripeti: () => {
      const i = operaParla ?? operaInPausa ?? operaAperta;
      if (i === null || i === undefined) { notify(t('mv_voice_nothing')); return; }
      void handleOpera(i, { daCapo: true });
    },
    dove: () => {
      const i = operaParla ?? operaInPausa ?? operaAperta ?? prossimaTappa(visit)?.indice ?? null;
      const tp = i === null ? null : visit.guide.tappe[i];
      if (!tp) { notify(t('mv_voice_nothing')); return; }
      const frase = `${tp.nome}. ${tp.dove ? t('mv_voice_where').replace('{s}', tp.dove) : t('mv_room_unknown')}${tp.puntoPreciso ? `. ${tp.puntoPreciso}` : ''}`;
      void speakWithSystemVoice(frase, String(language).toLowerCase(), getGuideCharacter());
    },
    pausa: () => {
      if (operaParla !== null) { pauseSpeech(); setOperaInPausa(operaParla); setOperaParla(null); }
      else if (audioPlaying) { pauseSpeech(); setAudioPlaying(false); setAudioInPausa(true); }
    },
    riprendi: () => {
      if (operaInPausa !== null) { resumeSpeech(); setOperaParla(operaInPausa); setOperaInPausa(null); }
      else if (audioInPausa) { resumeSpeech(); setAudioInPausa(false); setAudioPlaying(true); }
    },
    stop: () => { stopSpeech(); setOperaParla(null); setOperaInPausa(null); setAudioPlaying(false); setAudioInPausa(false); },
  };
  const toggleAscolto = () => {
    if (fermaAscoltoRef.current) { fermaAscoltoRef.current(); fermaAscoltoRef.current = null; setAscolto(false); return; }
    let acceso = false;
    fermaAscoltoRef.current = avviaAscolto(
      String(language).toLowerCase(),
      (c) => { try { void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); } catch { /* web */ } azioniRef.current[c]?.(); },
      (attivo) => {
        if (attivo) { acceso = true; setAscolto(true); notify(t('mv_voice_on')); return; }
        // Spento senza che sia mai partito: permesso negato.
        if (!acceso && fermaAscoltoRef.current) notify(t('mv_voice_denied'));
        setAscolto(false);
        fermaAscoltoRef.current = null;
      },
    );
  };

  return (
    <>
    {/* Il documento da stampare: invisibile a schermo, acceso solo da
        printScoped('museum'). */}
    <MuseumPrintView
      visit={{ ...visit, guide: { ...visit.guide, tappe: ordineAttivo.map(k => visit.guide.tappe[k]) } }}
      language={language}
      opere={Object.fromEntries(ordineAttivo.map((k, n) => [n, operaGuide[k]]).filter(([, g]) => !!g))}
    />

    {/* UNA ALLA VOLTA: il lettore a schermo pieno. Foto grande, sala, play,
        frecce e scorrimento laterale. Le tappe «della collezione» restano
        nell'elenco ma non nel lettore: non hanno un posto dove andare. */}
    {lettore !== null && (() => {
      const indici = ordineAttivo.filter(k => !visit.guide.tappe[k].soloCollezione);
      if (!indici.length) return null;
      const pos = Math.max(0, indici.indexOf(lettore));
      const i = indici[pos] ?? indici[0];
      const tp = visit.guide.tappe[i];
      const vaiA = (delta: number) => { const n = indici[pos + delta]; if (n !== undefined) setLettore(n); };
      const g = operaGuide[i];
      return (
        <div
          className="fixed inset-0 z-[2700] bg-[#fdfbf7] flex flex-col"
          onTouchStart={(e) => { swipeX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const x0 = swipeX.current; swipeX.current = null;
            const x1 = e.changedTouches[0]?.clientX;
            if (x0 == null || x1 == null) return;
            if (x1 - x0 > 60) vaiA(-1); else if (x0 - x1 > 60) vaiA(1);
          }}
        >
          <div className="px-5 pt-5 pb-2 flex items-center justify-between shrink-0">
            <button onClick={() => setLettore(null)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-slate-200 text-[11px] font-black text-slate-700 active:scale-95 transition-transform">
              <ListMusic className="w-3.5 h-3.5" />{t('mv_player_list')}
            </button>
            <span className="text-[11px] font-black text-slate-500">{t('mv_player_of').replace('{i}', String(pos + 1)).replace('{t}', String(indici.length))}</span>
            <button onClick={onClose} aria-label={t('vis_close')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-900 active:scale-90 transition-transform">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
            {(tp.foto || tp.fotoIcona) ? (
              <img
                src={tp.foto || tp.fotoIcona}
                alt={tp.nome}
                onClick={() => setFotoGrande({ url: tp.foto || tp.fotoIcona || '', nome: tp.nome, dove: tp.dove || '' })}
                className="max-h-[42vh] max-w-full object-contain rounded-3xl border border-slate-200 bg-white cursor-pointer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-40 h-40 rounded-3xl bg-blue-50 flex items-center justify-center"><Landmark className="w-12 h-12 text-primary" /></div>
            )}
            <div className="w-full mt-5 text-center">
              {tp.dove && (
                <p className="text-[11px] font-black text-primary flex items-center justify-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />{tp.dove}{tp.puntoPreciso ? ` · ${tp.puntoPreciso}` : ''}
                </p>
              )}
              <h3 className="text-xl font-black text-slate-900 leading-tight mt-1">{tp.nome}</h3>
              {tp.nomeFonte && <p className="text-[12px] font-bold text-slate-400 mt-0.5">{tp.nomeFonte}</p>}
              {(tp.autore || tp.anno) && <p className="text-[12px] font-bold text-slate-500 mt-0.5">{[tp.autore, tp.anno].filter(Boolean).join(' · ')}</p>}
              {tp.affollata && <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mt-1.5 inline-flex items-center gap-1"><Clock className="w-3 h-3" />{t('mv_crowded_badge')}</p>}
              {tp.seenCardId && <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mt-1.5">{t('mv_seen')}</p>}
              {g?.testo && (operaAperta === i || calma) && (
                <p className={`${calma ? 'text-[17px] leading-[1.65] max-h-[26vh]' : 'text-[12px] leading-relaxed max-h-[16vh]'} text-slate-700 mt-3 overflow-y-auto text-left px-1`}>{g.testo}</p>
              )}
            </div>
          </div>

          <div className="px-6 pb-8 pt-3 shrink-0 flex items-center justify-center gap-6">
            <button onClick={() => vaiA(-1)} disabled={pos === 0} aria-label={t('mv_player_list')} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-transform disabled:opacity-30">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => void handleOpera(i)}
              disabled={operaLoading !== null}
              aria-label={operaParla === i ? t('vis_pause') : t('mv_art_listen')}
              className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_12px_28px_rgba(30,58,138,0.3)] active:scale-95 transition-transform disabled:opacity-60"
            >
              {operaLoading === i ? <Loader2 className="w-8 h-8 animate-spin" /> : operaParla === i ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
            </button>
            <button onClick={() => vaiA(1)} disabled={pos >= indici.length - 1} aria-label={t('mv_next_stop')} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-transform disabled:opacity-30">
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      );
    })()}

    {/* PRIMA DI USCIRE: cosa ti manca, raggruppato per sala */}
    {primaDiUscire && (
      <div className="fixed inset-0 z-[2700] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-0 sm:p-6" onClick={() => setPrimaDiUscire(false)}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#fdfbf7] w-full sm:max-w-sm max-h-[80vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
        >
          <div className="px-5 pt-5 pb-3 shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('mv_before_leaving')}</p>
            <h3 className="text-lg font-black text-slate-900 leading-tight">
              {t('mv_missing_count').replace('{n}', String(mancanti.length))}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3">
            {mancantiPerSala.map(([sala, opere]) => (
              <div key={sala || 'senza-sala'}>
                <p className="text-[11px] font-black text-primary mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {sala || t('mv_room_unknown')}
                  <span className="text-slate-400 font-bold">· {opere.length}</span>
                </p>
                <div className="space-y-1.5">
                  {opere.map((t2, k) => (
                    <div key={`${sala}-${k}`} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-slate-200">
                      {t2.fotoIcona && (
                        <img src={t2.fotoIcona} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <span className="text-[12px] font-bold text-slate-800 truncate flex-1">{t2.nome}</span>
                      {t2.skipped && <span className="text-[9px] font-black uppercase text-slate-400 shrink-0">{t('mv_skipped_badge')}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/* E POI? I musei a piedi da qui, per chi ha ancora mezza giornata */}
            {renderEPoi()}
          </div>
          <div className="px-5 pb-5 pt-2 flex gap-2 shrink-0">
            <button
              onClick={() => setPrimaDiUscire(false)}
              className="flex-1 py-3 rounded-2xl bg-primary text-white font-black text-[13px] active:scale-[0.98] transition-transform"
            >
              {t('mv_keep_visiting')}
            </button>
            {countSeen(visit) > 0 && (
              <button
                onClick={() => void condividiGiornata()}
                disabled={condividendo}
                aria-label={t('mv_share_day')}
                className="w-12 py-3 rounded-2xl bg-white border border-primary/40 text-primary flex items-center justify-center active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {condividendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => { stopSpeech(); endVisit(); onClose(); }}
              className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-[13px] active:scale-[0.98] transition-transform"
            >
              {t('mv_end')}
            </button>
          </div>
        </div>
      </div>
    )}
    {/* CERCA CON GLI OCCHI: la foto a tutto schermo, il titolo e la sala.
        Si alza il telefono e si confronta con la parete. Fondo scuro qui è
        giusto — è l'unico posto dove conta solo l'immagine. */}
    {fotoGrande && (
      <div
        className="fixed inset-0 z-[2700] bg-black/92 flex flex-col items-center justify-center p-4"
        onClick={() => setFotoGrande(null)}
      >
        <img
          src={fotoGrande.url}
          alt={fotoGrande.nome}
          className="max-w-full max-h-[74vh] object-contain rounded-2xl"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="mt-4 text-center px-4">
          <p className="text-white font-black text-base leading-tight">{fotoGrande.nome}</p>
          {fotoGrande.dove && (
            <p className="text-white/70 text-[13px] font-bold mt-1 flex items-center justify-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {fotoGrande.dove}
            </p>
          )}
          <p className="text-white/45 text-[11px] font-bold mt-3">{t('mv_tap_to_close')}</p>
        </div>
        <button
          onClick={() => setFotoGrande(null)}
          aria-label={t('vis_close')}
          className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    )}
    <div className="fixed inset-0 z-[2600] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('mv_title')}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-[#fdfbf7] w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Testata */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 shrink-0">
          {/* La foto DEL LUOGO nel cerchio, accanto al nome: la stessa cosa
              che fanno le opere nel percorso. Senza foto dichiarata resta il
              solo nome — mai l'immagine di un altro museo. */}
          {visit.venuePhotoIcon && (
            <img
              src={visit.venuePhotoIcon}
              alt=""
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('mv_title')}</p>
            <h2 className="text-lg font-black text-primary leading-tight truncate">{visit.venue.name}</h2>
            {visit.gratuita && (
              <p className="text-[10px] font-black text-emerald-700 mt-0.5">{t('mv_gratuita')}</p>
            )}
            {inGruppo && (
              <p className="text-[10px] font-black text-emerald-700 flex items-center gap-1 mt-0.5">
                <Users className="w-3 h-3" />{sonoLeader ? t('mv_group_leader') : t('mv_group_follower')}
              </p>
            )}
            {inGruppo && !sonoLeader && salaLeader && (
              <p className="text-[11px] font-black text-primary flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />{t('mv_leader_room').replace('{s}', salaLeader)}
              </p>
            )}
            {prefetch && prefetch.fatte < prefetch.totali && (
              <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                <Download className="w-3 h-3 shrink-0" />{t('mv_prefetch_progress').replace('{t}', String(prefetch.totali)).replace('{n}', String(prefetch.fatte))}
              </p>
            )}
            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
              <TypeIcon className="w-3.5 h-3.5" />
              {isChurch ? t('mv_type_church') : visit.guide.tipo === 'sito' ? t('mv_type_site') : t('mv_type_museum')}
              <span>·</span>
              {t('mv_seen_count').replace('{n}', String(seen)).replace('{t}', String(total))}
            </p>
          </div>
          <button onClick={onClose} aria-label={t('vis_close')} className="w-10 h-10 shrink-0 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-900 active:scale-90 transition-transform">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* LE SALE CHIUSE OGGI (12/09/2026): l'avviso del sito, e quante
              opere del percorso non si vedono — detto qui, non davanti alla
              porta chiusa. */}
          {testoSaleChiuse && (
            <div className="px-3.5 py-3 rounded-2xl border-2 border-amber-400 bg-amber-50 mb-3">
              <p className="text-[12px] font-black text-amber-900 flex items-start gap-1.5 leading-snug">
                <DoorOpen className="w-4 h-4 shrink-0 mt-px" />
                <span>{t('mv_closed_rooms_today').replace('{s}', testoSaleChiuse)}</span>
              </p>
              {chiuseOggi > 0 && (
                <p className="text-[11px] font-bold text-amber-800 mt-1">{t('mv_closed_rooms_hit').replace('{n}', String(chiuseOggi))}</p>
              )}
            </div>
          )}

          {/* E POI? A visita finita, i musei a piedi da qui */}
          {visitaCompleta && prossimi && prossimi.length > 0 && (
            <div className="px-3.5 py-3 rounded-2xl bg-white border border-slate-200 mb-3 -mt-0.5">
              {renderEPoi()}
            </div>
          )}

          {/* DOMANI (11/09/2026): la sera prima in hotel, una riga sola che
              risponde alla domanda vera — è aperto? a che ora? quanto costa?
              Solo quello che il sito ufficiale dice, con la data in cui lo
              abbiamo letto: un orario sbagliato manda qualcuno davanti a un
              cancello chiuso. */}
          {domani && (domani.domani || domani.biglietto.intero || domani.chiusure) && (
            <div className={`px-3.5 py-3 rounded-2xl border mb-3 ${domani.domani?.chiuso ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />{t('mv_tomorrow')}
              </p>
              {domani.domani?.chiuso && (
                <p className="text-[14px] font-black text-amber-900">{t('mv_closed_tomorrow')}</p>
              )}
              {domani.domani && !domani.domani.chiuso && (
                <p className={`${calma ? 'text-[16px]' : 'text-[13px]'} font-black text-slate-900`}>
                  {t('mv_open_tomorrow').replace('{a}', domani.domani.apre).replace('{c}', domani.domani.chiude)}
                  {domani.ultimoIngresso ? ` · ${t('mv_last_entry').replace('{t}', domani.ultimoIngresso)}` : ''}
                </p>
              )}
              {domani.biglietto.intero && (
                <p className={`${calma ? 'text-[14px]' : 'text-[12px]'} font-bold text-slate-700 mt-0.5`}>
                  {t('mv_ticket')}: {domani.biglietto.intero}
                  {domani.biglietto.ridotto ? ` · ${t('mv_ticket_reduced')} ${domani.biglietto.ridotto}` : ''}
                  {domani.biglietto.gratis ? ` · ${t('mv_ticket_free')}: ${domani.biglietto.gratis}` : ''}
                </p>
              )}
              {domani.chiusure && <p className="text-[11px] font-bold text-slate-500 mt-0.5">{t('mv_closures')}: {domani.chiusure}</p>}
              {domani.nota && <p className="text-[11px] font-bold text-slate-600 mt-0.5">{domani.nota}</p>}
              {domani.consiglio === 'fila_ore_centrali' && (
                <p className="text-[11px] font-bold text-amber-800 mt-1.5 leading-snug">{t('mv_queue_advice')}</p>
              )}
              {domani.fonte && (
                <a href={domani.fonte.url} target="_blank" rel="noopener noreferrer" className="block text-[10px] font-bold text-slate-400 mt-1.5 underline-offset-2 hover:underline">
                  {t('mv_hours_source').replace('{d}', new Date(domani.fonte.lettoIl).toLocaleDateString(String(language).toLowerCase()))}
                </a>
              )}
            </div>
          )}

          {/* COMPRA IL BIGLIETTO D'INGRESSO: la sera prima, accanto agli orari */}
          {biglietto && (
            <a
              href={biglietto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-primary text-white shadow-[0_12px_28px_rgba(30,58,138,0.25)] mb-3 active:scale-[0.99] transition-transform"
            >
              <Ticket className="w-5 h-5 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-black">{t('mv_buy_ticket')}</span>
                <span className="block text-[11px] font-bold text-white/80 truncate">
                  {biglietto.prezzo ? t('mv_ticket_from').replace('{p}', biglietto.prezzo).replace('{f}', biglietto.fonte === 'tiqets' ? 'Tiqets' : biglietto.fonte === 'viator' ? 'Viator' : 'GetYourGuide') : biglietto.titolo}
                </span>
              </span>
              <ExternalLink className="w-4 h-4 shrink-0 text-white/80" />
            </a>
          )}

          {/* LE FASCE ORARIE DI DOMANI (12/09/2026): «alle 8:15 ci sono posti,
              alle 11 è esaurito» — dati del fornitore, non un'opinione. */}
          {biglietto?.disponibilita && (
            <div className="-mt-1 mb-3 px-1">
              {biglietto.disponibilita.fasce.length === 0 ? (
                <p className="text-[11px] font-black text-amber-800">{t('mv_ticket_all_sold_out')}</p>
              ) : (
                <>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('mv_ticket_slots')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {biglietto.disponibilita.fasce.map(f => (
                      f.posti ? (
                        <a key={f.ora} href={biglietto.url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-full text-[11px] font-black border bg-white border-primary/40 text-primary active:scale-95 transition-transform">{f.ora}</a>
                      ) : (
                        <span key={f.ora} className="px-2.5 py-1 rounded-full text-[11px] font-black border bg-slate-100 border-slate-200 text-slate-400 line-through" title={t('mv_ticket_sold_out')}>{f.ora}</span>
                      )
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SEI GIÀ STATO QUI (12/09/2026): la seconda visita non ripete la
              prima. Un tocco e restano solo le opere non viste, più le
              preferite dell'altra volta. */}
          {visit.visitaPrecedente && (
            <div className="px-3.5 py-3 rounded-2xl bg-white border border-slate-200 mb-3">
              <p className="text-[12px] font-black text-slate-900 leading-snug">
                {t('mv_been_here').replace('{d}', new Date(visit.visitaPrecedente.quando).toLocaleDateString(String(language).toLowerCase(), { day: 'numeric', month: 'long' })).replace('{n}', String(visit.visitaPrecedente.viste))}
              </p>
              <button
                onClick={() => impostaPersonalizzazione({ soloNuove: !pers.soloNuove })}
                aria-pressed={!!pers.soloNuove}
                className={`mt-2 w-full py-2 rounded-xl text-[12px] font-black border transition-all ${pers.soloNuove ? 'bg-primary border-primary text-white' : 'bg-white border-primary/40 text-primary'}`}
              >
                {pers.soloNuove ? <Check className="w-4 h-4 inline-block mr-1 -mt-0.5" /> : null}{t('mv_only_new')}
              </button>
            </div>
          )}

          {/* CHIUDE FRA N MINUTI: le mancanti più vicine per prime */}
          {minutiAllaChiusura !== null && mancanti.length > 0 && (() => {
            const salaQui = String(visit.salaCorrente || (() => { for (let i = visit.guide.tappe.length - 1; i >= 0; i--) { if (visit.guide.tappe[i].seenCardId && visit.guide.tappe[i].dove) return visit.guide.tappe[i].dove; } return ''; })() || '').trim();
            const vicine = [...mancanti].sort((a, b) => Number(String(b.dove || '').trim() === salaQui) - Number(String(a.dove || '').trim() === salaQui)).slice(0, 3);
            return (
              <div className="px-3.5 py-3 rounded-2xl border-2 border-amber-400 bg-amber-50 mb-3">
                <p className="text-[13px] font-black text-amber-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />{t('mv_closing_soon').replace('{m}', String(minutiAllaChiusura))}
                </p>
                <p className="text-[11px] font-bold text-amber-800 mt-0.5">{t('mv_closing_missing').replace('{n}', String(mancanti.length))}</p>
                <div className="flex gap-2 mt-2">
                  {vicine.map((x, k) => (
                    <button
                      key={`${k}-${x.nome}`}
                      onClick={() => { const i = visit.guide.tappe.indexOf(x); if (i >= 0) void handleOpera(i); }}
                      className="flex-1 min-w-0 flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-xl bg-white border border-amber-200 active:scale-95 transition-transform"
                    >
                      {x.fotoIcona ? <img src={x.fotoIcona} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center"><Landmark className="w-4 h-4 text-primary" /></div>}
                      <span className="text-[10px] font-black text-slate-800 leading-tight text-center line-clamp-2">{x.nome}</span>
                      {x.dove && <span className="text-[9px] font-bold text-slate-500 truncate max-w-full">{x.dove}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Pass Museo, se attivo */}
          {passActive && passExpiresAt !== null && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-amber-50 border border-amber-300 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-200 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4 text-amber-800" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-amber-900">{getTranslation('museum_pass_active', language)}</p>
                <p className="text-[11px] font-bold text-amber-800/80">{getTranslation('museum_pass_remaining', language)} {formatPassRemaining(passExpiresAt)}</p>
              </div>
            </div>
          )}

          {/* Introduzione: dove sei */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('mv_you_are_at')}</p>
                <p className={`${calma ? 'text-[17px] leading-[1.65]' : 'text-sm leading-relaxed'} text-slate-800`}>{visit.guide.intro}</p>
                {visit.guide.consiglio && (
                  <p className="text-[12px] font-bold text-primary mt-2 leading-snug">{visit.guide.consiglio}</p>
                )}
              </div>
              <button
                onClick={handleAudio}
                aria-label={audioPlaying ? t('vis_pause') : t('mv_listen')}
                className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
              >
                {audioLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : audioPlaying ? <Pause className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* DOVE SONO: si inquadra il cartello della sala. La scritta sul
              muro c'è in ogni museo del mondo, è grande e ad alto contrasto,
              e nessuno la usa: è l'unica infrastruttura di orientamento
              indoor già installata ovunque. */}
          <input
            ref={cartelloRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleCartello(e.target.files?.[0] || null)}
          />
          {/* IL PROMEMORIA: vibrazione fatta, ora la proposta, con la targa
              disegnata così si capisce cosa cercare sopra la porta. */}
          {promemoria && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-blue-50 border-2 border-primary mb-3">
              <TargaSala size={56} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-800 leading-snug">{t('mv_reminder_room')}</p>
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => { setPromemoria(false); cartelloRef.current?.click(); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-white text-[11px] font-black active:scale-95 transition-transform"
                  >
                    <Camera className="w-3.5 h-3.5" />{t('mv_reminder_cta')}
                  </button>
                  <button onClick={azzeraPromemoria} aria-label={t('vis_close')} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => cartelloRef.current?.click()}
            disabled={leggendoSala}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] mb-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            {/* La targa disegnata al posto dell'icona: dice da sola COSA
                inquadrare — il numero sopra la porta, non la targhetta
                dell'opera. */}
            {leggendoSala ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" /> : <TargaSala size={44} />}
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-black text-slate-900">
                {visit.salaCorrente ? t('mv_you_are_in_room').replace('{s}', visit.salaCorrente) : t('mv_where_am_i')}
              </span>
              <span className="block text-[10px] font-bold text-slate-500 leading-snug">{t('mv_room_sign_hint')}</span>
            </span>
            <Camera className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* INQUADRA IL CARTELLINO (12/09/2026): la didascalia accanto
              all'opera, quasi sempre solo nella lingua del posto. Si legge,
              si traduce, e se l'opera è nel percorso si apre la sua tappa;
              altrimenti l'audioguida arriva al volo dal titolo letto. */}
          <input
            ref={cartellinoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleCartellino(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => cartellinoRef.current?.click()}
            disabled={leggendoCartellino}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] mb-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            {/* Il cartellino disegnato: tre righe di testo su una targhetta,
                accanto all'opera — non sopra la porta. */}
            {leggendoCartellino ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" /> : (
              <span className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-300 flex flex-col items-start justify-center gap-1 px-2 shrink-0" aria-hidden="true">
                <span className="block w-6 h-[3px] bg-slate-700 rounded" />
                <span className="block w-4 h-[2px] bg-slate-400 rounded" />
                <span className="block w-5 h-[2px] bg-slate-400 rounded" />
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-black text-slate-900">{t('mv_label_scan')}</span>
              <span className="block text-[10px] font-bold text-slate-500 leading-snug">{t('mv_label_hint')}</span>
            </span>
            <Camera className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
          {cartellino && (
            <div className="px-3.5 py-3 rounded-2xl bg-white border-2 border-primary/40 mb-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t('mv_label_title')}{cartellino.lingua ? ` · ${cartellino.lingua.toUpperCase()}` : ''}
                </p>
                <button onClick={() => { setCartellino(null); setGuidaCartellino(null); }} aria-label={t('vis_close')} className="w-7 h-7 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {cartellino.titolo && <p className="text-[14px] font-black text-slate-900 leading-tight mt-1">{cartellino.titolo}</p>}
              {(cartellino.autore || cartellino.anno || cartellino.tecnica) && (
                <p className="text-[11px] font-bold text-slate-500 mt-0.5">{[cartellino.autore, cartellino.anno, cartellino.tecnica].filter(Boolean).join(' · ')}</p>
              )}
              {cartellino.traduzione && cartellino.traduzione !== cartellino.testoOriginale && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-2">{t('mv_label_translation')}</p>
                  <p className={`${calma ? 'text-[15px] leading-relaxed' : 'text-[12px] leading-relaxed'} text-slate-800`}>{cartellino.traduzione}</p>
                </>
              )}
              {cartellino.testoOriginale && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-2">{t('mv_label_original')}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed italic">{cartellino.testoOriginale}</p>
                </>
              )}
              {cartellino.tappa !== null && (
                <p className="text-[11px] font-black text-primary mt-2 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t('mv_label_in_route').replace('{n}', String((ordineAttivo.indexOf(cartellino.tappa) >= 0 ? ordineAttivo.indexOf(cartellino.tappa) : cartellino.tappa) + 1))}
                </p>
              )}
              {guidaCartellino && (
                <p className={`${calma ? 'text-[16px] leading-[1.65]' : 'text-[12px] leading-relaxed'} text-slate-800 mt-2 whitespace-pre-line`}>{guidaCartellino.testo}</p>
              )}
              {cartellino.titolo && (
                <button
                  onClick={() => void ascoltaDalCartellino()}
                  disabled={caricandoGuidaCartellino || operaLoading !== null}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-[11px] font-black active:scale-95 transition-transform disabled:opacity-60"
                >
                  {caricandoGuidaCartellino ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                  {t('mv_label_listen')}
                </button>
              )}
            </div>
          )}
          {/* Lo scatto della foto ricordo passa da qui */}
          <input
            ref={fotoRicordoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleFotoRicordo(e.target.files?.[0] || null)}
          />

          {/* LA PIANTA UFFICIALE: quella del sito del museo, con un tocco */}
          {visit.guide.pianta && (
            <a
              href={visit.guide.pianta}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] mb-3 text-left active:scale-[0.99] transition-transform"
            >
              <MapIcon className="w-4 h-4 text-primary shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-black text-slate-900">{t('mv_map')}</span>
                <span className="block text-[10px] font-bold text-slate-500 leading-snug">{t('mv_map_hint')}</span>
              </span>
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
            </a>
          )}

          {/* E ADESSO DOVE VADO. La domanda che uno si fa ogni volta che
              finisce di ascoltare, e a cui il percorso non rispondeva mai.
              Da dove sei — il cartello letto, o l'ultima opera inquadrata —
              alla prossima non vista, con quante sale in mezzo. */}
          {(() => {
            const p = prossimaTappa(visit);
            if (!p) return null;
            return (
              <button
                onClick={() => { setOperaAperta(null); void handleOpera(p.indice); }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white border-2 border-primary shadow-[0_12px_28px_rgba(30,58,138,0.12)] mb-3 text-left active:scale-[0.99] transition-transform"
              >
                {p.tappa.fotoIcona ? (
                  <img
                    src={p.tappa.fotoIcona}
                    alt=""
                    loading="lazy"
                    onClick={(e) => { e.stopPropagation(); setFotoGrande({ url: p.tappa.foto || p.tappa.fotoIcona || '', nome: p.tappa.nome, dove: p.tappa.dove || '' }); }}
                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Landmark className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.1em] text-primary">{t('mv_next_stop')}</p>
                  <p className="text-sm font-black text-slate-900 leading-tight truncate">{p.tappa.nome}</p>
                  <p className="text-[11px] font-bold text-slate-500 leading-snug">
                    {p.saleDiDistanza === 0
                      ? t('mv_same_room')
                      : p.saleDiDistanza != null
                        ? t('mv_rooms_away').replace('{n}', String(p.saleDiDistanza))
                        : (p.tappa.dove || t('mv_room_unknown'))}
                    {p.tappa.puntoPreciso ? ` · ${p.tappa.puntoPreciso}` : (p.saleDiDistanza != null && p.tappa.dove ? ` · ${p.tappa.dove}` : '')}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-white text-[11px] font-black">
                  <Play className="w-3.5 h-3.5" />
                  {t('mv_listen_next')}
                </span>
              </button>
            );
          })()}

          {/* AFFOLLATA A QUEST'ORA (11/09/2026): se la prossima è una delle tre
              opere più famose del museo e sono le ore centrali, lo si dice
              prima che la persona si metta in fila, e si offre di rimandarla.
              La regola parte semplice — le tre più famose, dalle 11 alle 15 —
              e i salti raccolti col tempo la affineranno. */}
          {(() => {
            const p = prossimaTappa(visit);
            if (!p?.tappa.affollata || p.tappa.rimandata) return null;
            const ora = new Date().getHours();
            if (ora < 11 || ora >= 15) return null;
            return (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 mb-3">
                <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-amber-900 leading-snug">{t('mv_crowded_now')}</p>
                  <button
                    onClick={() => { if (rimandaTappa(p.indice)) notify(t('mv_postponed')); }}
                    className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-amber-300 text-[11px] font-black text-amber-900 active:scale-95 transition-transform"
                  >
                    {t('mv_postpone')}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Una alla volta · Leggi con calma */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => { const p = prossimaTappa(visit); setLettore(p ? p.indice : 0); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white border border-slate-200 text-[12px] font-black text-slate-700 active:scale-[0.99] transition-transform"
            >
              <ListMusic className="w-4 h-4 text-primary" />
              {t('mv_player_mode')}
            </button>
            {/* LEGGI CON CALMA (11/09/2026): caratteri grandi, voce più lenta,
                testo sempre visibile. Chi visita i musei ha in media più di
                cinquant'anni: questa non è accessibilità, è la funzione. */}
            <button
              onClick={() => { const on = !calma; setCalma(on); setLeggiConCalma(on); }}
              aria-pressed={calma}
              title={t('mv_calma_hint')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl border text-[12px] font-black active:scale-[0.99] transition-all ${calma ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-700'}`}
            >
              <Glasses className={`w-4 h-4 ${calma ? 'text-white' : 'text-primary'}`} />
              {t('mv_calma')}
            </button>
            {/* COMANDI VOCALI (12/09/2026): il telefono in tasca, si parla.
                Solo dove il riconoscimento sul dispositivo esiste. */}
            {comandiVocaliDisponibili() && (
              <button
                onClick={toggleAscolto}
                aria-pressed={ascolto}
                aria-label={t('mv_voice')}
                title={ascolto ? t('mv_voice_on') : t('mv_voice')}
                className={`w-12 flex items-center justify-center rounded-2xl border active:scale-95 transition-all ${ascolto ? 'bg-rose-600 border-rose-600 text-white animate-pulse' : 'bg-white border-slate-200 text-primary'}`}
              >
                {ascolto ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}
          </div>
          {/* ACCESSIBILITÀ: la descrizione di ciò che si vede prima di ogni opera */}
          <button
            onClick={() => { const on = !descrizioneAuto; setDescrizioneAuto(on); setAudiodescrizioneAuto(on); }}
            aria-pressed={descrizioneAuto}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-2xl border text-[11px] font-black mb-3 text-left active:scale-[0.99] transition-all ${descrizioneAuto ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-700'}`}
          >
            <Eye className={`w-4 h-4 shrink-0 ${descrizioneAuto ? 'text-white' : 'text-primary'}`} />
            <span className="flex-1">{t('mv_describe_auto')}</span>
            {descrizioneAuto && <Check className="w-4 h-4 shrink-0" />}
          </button>

          {/* Percorso */}
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('mv_route')}</p>
          {/* IL MIO PERCORSO, NON IL VOSTRO: tre scelte secche. Le opere non
              scelte non spariscono, si mettono da parte — e la riga sotto
              dice quante sono. Solo nei percorsi lunghi abbastanza. */}
          {visit.guide.tappe.filter(x => !x.soloCollezione).length > 6 && (
            <div className="mb-3 p-3 rounded-2xl bg-white border border-slate-200 space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('mv_pers_title')}</p>
              {/* TEMPO */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1">{t('mv_pers_time')}</p>
                <div className="w-full flex bg-[#fdfbf7] rounded-xl p-0.5 border border-slate-200 gap-0.5">
                  {([['tutto', t('mv_filter_all')], ['30', t('mv_filter_short')], ['60', t('mv_filter_60')]] as const).map(([v, etichetta]) => (
                    <button
                      key={v}
                      onClick={() => impostaPersonalizzazione({ tempo: v })}
                      aria-pressed={pers.tempo === v}
                      disabled={pers.bambini}
                      className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all disabled:opacity-40 ${pers.tempo === v ? 'bg-primary text-white' : 'text-slate-500'}`}
                    >
                      {etichetta}
                    </button>
                  ))}
                </div>
              </div>
              {/* INTERESSI: solo se Wikidata sa di che tipo sono le opere */}
              {tipiNoti && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 mb-1">{t('mv_pers_interest')}</p>
                  <div className="w-full flex bg-[#fdfbf7] rounded-xl p-0.5 border border-slate-200 gap-0.5">
                    {([['tutto', t('mv_filter_all')], ['dipinti', t('mv_int_paintings')], ['sculture', t('mv_int_sculptures')], ['altro', t('mv_int_other')]] as const).map(([v, etichetta]) => (
                      <button
                        key={v}
                        onClick={() => impostaPersonalizzazione({ interessi: v })}
                        aria-pressed={pers.interessi === v}
                        className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all ${pers.interessi === v ? 'bg-primary text-white' : 'text-slate-500'}`}
                      >
                        {etichetta}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* CON BAMBINI: sei opere, e le audioguide raccontate a un bambino.
                  Le audioguide già aperte si scaricano di nuovo nel registro
                  giusto: quelle per adulti non vanno bene a un bambino. */}
              <button
                onClick={() => { const b = !pers.bambini; impostaPersonalizzazione({ bambini: b }); setOperaGuide({}); setOperaAperta(null); stopSpeech(); setOperaParla(null); setOperaInPausa(null); }}
                aria-pressed={pers.bambini}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${pers.bambini ? 'bg-amber-50 border-amber-300' : 'bg-[#fdfbf7] border-slate-200'}`}
              >
                <span className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${pers.bambini ? 'bg-primary' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${pers.bambini ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-black text-slate-900">{t('mv_kids')}</span>
                  <span className="block text-[10px] font-bold text-slate-500 leading-snug">{t('mv_kids_hint')}</span>
                </span>
              </button>
              {personalizzato && visit.guide.tappe.length - ordineAttivo.length > 0 && (
                <p className="text-[10px] font-bold text-slate-400 px-1">{t('mv_filter_hidden').replace('{n}', String(visit.guide.tappe.length - ordineAttivo.length))}</p>
              )}
            </div>
          )}
          {/* Se il museo non pubblica le sale lo si dice qui, una volta: senza
              questa riga venti tappe numerate promettono un itinerario che il
              museo non ha mai dichiarato. */}
          {visit.guide.saleDichiarate === false && (
            <p className="text-[11px] font-bold text-slate-500 leading-snug mb-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
              {t('mv_no_rooms')}
            </p>
          )}
          {/* LISTA | MAPPA (12/09/2026, regola fissa): il commutatore compare
              solo se il museo ha una pianta (dal sito ufficiale) o almeno un
              rimando alla pianta ufficiale. Mai una pianta di un altro museo. */}
          {(mappe.length > 0 || mappaLink.length > 0) && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex bg-white rounded-xl p-0.5 border border-slate-200 gap-0.5">
                <button type="button" onClick={() => setVista('lista')} aria-pressed={vista === 'lista'} className={`px-3 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1 ${vista === 'lista' ? 'bg-primary text-white' : 'text-slate-500'}`}>
                  <ListMusic className="w-3.5 h-3.5" />{t('mv_vista_lista')}
                </button>
                <button type="button" onClick={() => setVista('mappa')} aria-pressed={vista === 'mappa'} disabled={mappe.length === 0} className={`px-3 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1 disabled:opacity-40 ${vista === 'mappa' ? 'bg-primary text-white' : 'text-slate-500'}`}>
                  <MapIcon className="w-3.5 h-3.5" />{t('mv_vista_mappa')}
                </button>
              </div>
              {mappe.length > 1 && vista === 'mappa' && (
                <div className="flex gap-1 overflow-x-auto">
                  {mappe.map((m, k) => (
                    <button key={m.indice} type="button" onClick={() => setMappaIndice(k)} className={`px-2 py-1 rounded-lg text-[10px] font-black border ${k === mappaIndice ? 'bg-blue-50 border-primary text-primary' : 'bg-white border-slate-200 text-slate-500'}`}>
                      {m.titolo ? m.titolo.slice(0, 18) : `${t('mv_vista_mappa')} ${k + 1}`}
                    </button>
                  ))}
                </div>
              )}
              {mappaLink[0] && (
                <a href={mappaLink[0].url} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] font-black text-primary flex items-center gap-1 shrink-0">
                  <ExternalLink className="w-3 h-3" />{t('mv_mappa_ufficiale')}
                </a>
              )}
            </div>
          )}
          {vista === 'mappa' && mappe[mappaIndice] && (() => {
            const mappa = mappe[mappaIndice];
            // Ogni pin (sala) raccoglie le tappe attive di quella sala; il
            // numero sul pin è quello della prima tappa nel percorso, con
            // «+n» se nella sala ce ne sono altre. «Sei qui» = l'ultima
            // opera riconosciuta.
            const numeroDi = (i: number) => { const pos = ordineAttivo.indexOf(i); return pos < 0 ? 0 : ordineAttivo.slice(0, pos + 1).filter(k => !visit.guide.tappe[k].soloCollezione).length; };
            const ultimaVista = [...ordineAttivo].reverse().find(k => !!visit.guide.tappe[k].seenCardId);
            // Il codice della sala («Room 32») quando la guida lo ha, altrimenti
            // il nome discorsivo: è il codice che combacia con la pianta.
            const salaDi = (k: number) => { const tp: any = visit.guide.tappe[k]; return normSalaMappa(tp.salaCodice || tp.dove); };
            const salaQui = ultimaVista !== undefined ? salaDi(ultimaVista) : '';
            const pinConTappe = mappa.pins.map(p => {
              const ns = normSalaMappa(p.sala);
              const tappe = ordineAttivo.filter(k => !visit.guide.tappe[k].soloCollezione && (salaDi(k) === ns || normSalaMappa(visit.guide.tappe[k].dove) === ns));
              return { pin: p, tappe, seiQui: !!ns && ns === salaQui };
            }).filter(x => x.tappe.length > 0);
            return (
              <div className="mb-3">
                <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <img src={mappa.url} alt={mappa.titolo || t('mv_vista_mappa')} className="block w-full h-auto select-none" draggable={false} />
                  {pinConTappe.map(({ pin, tappe, seiQui }) => {
                    const primo = tappe[0];
                    const fatte = tappe.every(k => !!visit.guide.tappe[k].seenCardId);
                    return (
                      <button
                        key={`${pin.sala}-${primo}`}
                        type="button"
                        onClick={() => apriDalPin(primo)}
                        aria-label={`${pin.sala}: ${tappe.map(k => visit.guide.tappe[k].nome).join(', ')}`}
                        style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-7 h-7 px-1.5 rounded-full flex items-center justify-center text-[11px] font-black border-2 border-white shadow-[0_2px_8px_rgba(15,23,42,0.35)] active:scale-90 transition-transform ${fatte ? 'bg-emerald-600 text-white' : 'bg-primary text-white'} ${seiQui ? 'ring-4 ring-amber-400' : ''}`}
                      >
                        {numeroDi(primo)}{tappe.length > 1 ? `+${tappe.length - 1}` : ''}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] font-bold text-slate-500 leading-snug mt-1.5 px-1">
                  {pinConTappe.length > 0 ? t('mv_mappa_pin_hint') : t('mv_mappa_senza_pin')}
                  {pinConTappe.some(x => x.seiQui) ? ` · ${t('mv_mappa_sei_qui')}` : ''}
                </p>
                {mappa.fonteUrl && (
                  <a href={mappa.fonteUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-primary px-1 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />{t('mv_mappa_ufficiale')}
                  </a>
                )}
              </div>
            );
          })()}
          <ol className="space-y-2">
            {ordineAttivo.map((i, posizione) => {
              const tappa = visit.guide.tappe[i];
              const done = !!tappa.seenCardId;
              // Il numero conta solo le tappe con una sala dichiarata: quelle
              // «della collezione» non hanno un posto nel percorso, quindi non
              // hanno un numero. E conta solo le tappe ATTIVE col filtro.
              const numero = ordineAttivo.slice(0, posizione + 1).filter(k => !visit.guide.tappe[k].soloCollezione).length;
              // Si visita per stanze: quando cambia la sala si apre un gruppo,
              // così si vede a colpo d'occhio quante opere ci sono in questa
              // stanza prima di spostarsi. Il server le ha già raggruppate.
              const prec = posizione === 0 ? null : visit.guide.tappe[ordineAttivo[posizione - 1]];
              const salaQui = tappa.soloCollezione ? '' : String(tappa.dove || '').trim();
              const salaPrima = prec === null ? null : (prec.soloCollezione ? '' : String(prec.dove || '').trim());
              const apreSala = !!salaQui && salaQui !== salaPrima;
              const quanteQui = apreSala ? ordineAttivo.filter(k => !visit.guide.tappe[k].soloCollezione && String(visit.guide.tappe[k].dove || '').trim() === salaQui).length : 0;
              const primaSenzaSala = !!tappa.soloCollezione && (prec === null || !prec.soloCollezione);
              return (
              <div key={`g-${i}-${tappa.nome}`}>
                {apreSala && (
                  <div className="flex items-center gap-2 px-1 pt-2 pb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-[11px] font-black text-primary truncate">{salaQui}</span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {t('mv_in_room').replace('{n}', String(quanteQui))}
                    </span>
                  </div>
                )}
                {primaSenzaSala && (
                  <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('mv_also_in_collection')}</span>
                  </div>
                )}
                <li id={`mv-tappa-${i}`} key={`${i}-${tappa.nome}`} className={`flex gap-3 px-3.5 py-3 rounded-2xl border transition-opacity ${done ? 'bg-emerald-50 border-emerald-200' : tappa.skipped ? 'bg-white border-slate-200 opacity-60' : 'bg-white border-slate-200'}`}>
                  {/* La foto dell'opera nel cerchio, col numero quando manca.
                      UN TOCCO E SI APRE GRANDE (11/09/2026): dentro una sala
                      affollata l'occhio riconosce un quadro in un secondo,
                      molto prima di leggere «Sala 12, parete di fronte». La
                      foto grande è lo strumento di ricerca più veloce che
                      abbiamo, e stava chiusa dentro un cerchio da 44 px. */}
                  {tappa.fotoIcona ? (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={t('mv_open_photo')}
                      onClick={(e) => { e.stopPropagation(); setFotoGrande({ url: tappa.foto || tappa.fotoIcona || '', nome: tappa.nome, dove: tappa.dove || '' }); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFotoGrande({ url: tappa.foto || tappa.fotoIcona || '', nome: tappa.nome, dove: tappa.dove || '' }); } }}
                      className="relative w-11 h-11 shrink-0 cursor-pointer active:scale-90 transition-transform"
                    >
                      <img
                        src={tappa.fotoIcona}
                        alt=""
                        loading="lazy"
                        className="w-11 h-11 rounded-full object-cover border border-slate-200"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border-2 border-white ${done ? 'bg-emerald-600 text-white' : tappa.soloCollezione ? 'bg-slate-400 text-white' : 'bg-primary text-white'}`}>
                        {done ? <Check className="w-2.5 h-2.5" /> : tappa.soloCollezione ? '·' : numero}
                      </div>
                    </div>
                  ) : (
                    <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${done ? 'bg-emerald-600 text-white' : tappa.soloCollezione ? 'bg-slate-400 text-white' : 'bg-primary text-white'}`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : tappa.soloCollezione ? '·' : numero}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`${calma ? 'text-[17px]' : 'text-sm'} font-black text-slate-900 leading-tight`}>{tappa.nome}</p>
                    {/* Il titolo com'è scritto sul muro: è quello che il
                        visitatore legge davvero mentre cerca l'opera. */}
                    {/* Il titolo com'è nella fonte (di solito inglese): la
                        traduzione sopra, l'originale qui, tutti e due. */}
                    {tappa.nomeFonte && (
                      <p className="text-[11px] font-bold text-slate-400 leading-tight mt-0.5">{tappa.nomeFonte}</p>
                    )}
                    {tappa.nomeOriginale && (
                      <p className="text-[11px] font-bold text-slate-400 italic leading-tight mt-0.5">
                        {t('mv_on_the_label')}: {tappa.nomeOriginale}
                      </p>
                    )}
                    {(tappa.autore || tappa.anno || tappa.dove) && (
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {[tappa.autore, tappa.anno].filter(Boolean).join(' · ')}
                        {tappa.dove ? `${tappa.autore || tappa.anno ? ' · ' : ''}${tappa.dove}` : ''}
                      </p>
                    )}
                    {/* DOVE GUARDARE, dentro la sala. Riga sua, in evidenza:
                        è l'unica informazione che porta il visitatore davanti
                        all'opera invece che dentro la stanza giusta. */}
                    {tappa.puntoPreciso && !done && (
                      <p className="text-[11px] font-black text-primary leading-snug mt-1 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {tappa.puntoPreciso}
                      </p>
                    )}
                    {tappa.perche && <p className={`${calma ? 'text-[15px] leading-relaxed' : 'text-[12px] leading-snug'} text-slate-700 mt-1`}>{tappa.perche}</p>}
                    {/* Sotto ogni spiegazione, sempre una curiosità o un
                        consiglio specifico di QUESTA tappa (richiesta del
                        committente, 12/09/2026): mai la spiegazione da sola. */}
                    {tappa.curiosita && (
                      <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 mb-1">{t('mv_art_curiosity')}</p>
                        <p className={`${calma ? 'text-[13px]' : 'text-[11px]'} text-amber-900 leading-snug`}>{tappa.curiosita}</p>
                      </div>
                    )}
                    {/* Promessa onesta: il museo la possiede, ma non dice dove
                        è esposta — e potrebbe essere in deposito o in prestito. */}
                    {tappa.vistaInPassato && !done && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" />{t('mv_seen_before')}</p>
                    )}
                    {tappa.chiusaOggi && !done && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mt-1 flex items-center gap-1"><DoorOpen className="w-3 h-3" />{t('mv_room_closed_badge')}</p>
                    )}
                    {tappa.affollata && !done && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{t('mv_crowded_badge')}{tappa.rimandata ? ` · ${t('mv_postponed')}` : ''}
                      </p>
                    )}
                    {tappa.soloCollezione && !done && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-1">{t('mv_only_collection')}</p>
                    )}
                    {done && <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mt-1">{t('mv_seen')}</p>}

                    {/* La descrizione, scritta: si legge mentre la voce la dice */}
                    {descrizioni[i] && operaAperta === i && (
                      <div className="mt-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1"><Eye className="w-3 h-3" />{t('mv_describe_title')}</p>
                        <p className={`${calma ? 'text-[16px] leading-[1.65]' : 'text-[12px] leading-relaxed'} text-slate-800`}>{descrizioni[i]}</p>
                      </div>
                    )}

                    {/* Audioguida dettagliata dell'opera: il testo si apre
                        sotto la tappa e viene letto ad alta voce. */}
                    <button
                      onClick={() => void handleOpera(i)}
                      disabled={operaLoading !== null}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-[11px] font-black text-primary active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {operaLoading === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : operaParla === i ? <Pause className="w-3.5 h-3.5" />
                        : operaInPausa === i ? <Play className="w-3.5 h-3.5" />
                        : <Volume2 className="w-3.5 h-3.5" />}
                      {operaParla === i ? t('vis_pause') : operaInPausa === i ? t('mv_art_resume') : t('mv_art_listen')}
                    </button>

                    {/* AUDIODESCRIZIONE: cosa si vede, per chi non vede (e per
                        chi vuole imparare a guardare). Solo con la foto vera. */}
                    {(tappa.foto || operaGuide[i]?.foto) && (
                      <button
                        onClick={() => void handleDescrivi(i)}
                        disabled={descrivendo !== null || operaLoading !== null}
                        aria-label={t('mv_describe')}
                        title={t('mv_describe')}
                        className="mt-2 ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-black text-slate-700 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {descrivendo === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        {t('mv_describe')}
                      </button>
                    )}

                    {/* «Non la trovo»: la sala è chiusa, l'opera è in prestito
                        o c'è la fila. Il percorso prosegue invece di fermarsi
                        qui — e se in tanti saltano la stessa opera, quella
                        tappa è sbagliata e ce lo stanno dicendo dal posto. */}
                    {/* IL CUORE: l'opera che ha colpito. Le viste sono un
                        elenco, le preferite un ricordo — quello che si
                        condivide. */}
                    <button
                      onClick={() => togglePreferita(i)}
                      aria-label={tappa.preferita ? t('mv_fav_remove') : t('mv_fav_add')}
                      aria-pressed={!!tappa.preferita}
                      className={`mt-2 ml-2 inline-flex items-center justify-center w-8 h-8 rounded-full border active:scale-90 transition-transform ${tappa.preferita ? 'bg-rose-50 border-rose-300 text-rose-600' : 'bg-white border-slate-200 text-slate-400'}`}
                    >
                      <Heart className={`w-4 h-4 ${tappa.preferita ? 'fill-current' : ''}`} />
                    </button>
                    {!done && (
                      <button
                        onClick={() => { if (tappa.skipped) unskipStop(i); else skipStop(i); }}
                        className={`mt-2 ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-black active:scale-95 transition-transform ${
                          tappa.skipped
                            ? 'bg-white border-slate-300 text-slate-500'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        {tappa.skipped ? t('mv_unskip') : t('mv_skip')}
                      </button>
                    )}

                    {operaAperta === i && operaGuide[i] && (
                      <div className="mt-2 rounded-2xl bg-[#f8f5f0] border border-slate-200 overflow-hidden">
                        {/* Comandi come su un'audioguida vera: play e pausa
                            sempre visibili mentre si legge il testo. */}
                        <div className="flex items-center gap-3 px-3 py-2.5 bg-white border-b border-slate-200">
                          <button
                            onClick={() => void handleOpera(i)}
                            aria-label={operaParla === i ? t('vis_pause') : t('mv_art_listen')}
                            className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"
                          >
                            {operaLoading === i ? <Loader2 className="w-5 h-5 animate-spin" />
                              : operaParla === i ? <Pause className="w-5 h-5" />
                              : <Play className="w-5 h-5 ml-0.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-900 truncate">{operaGuide[i].titolo || tappa.nome}</p>
                            <p className="text-[10px] font-bold text-slate-500">
                              {operaParla === i ? t('mv_art_playing') : operaInPausa === i ? t('mv_art_paused') : t('mv_art_ready')}
                              {' · '}
                              {Math.max(1, Math.round((operaGuide[i].parole || 0) / 150))} min
                            </p>
                          </div>
                          <button
                            onClick={() => { stopSpeech(); setOperaParla(null); setOperaAperta(null); }}
                            aria-label={t('vis_close')}
                            className="w-8 h-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* La foto dell'opera, grande: si guarda mentre parla */}
                        {(operaGuide[i].foto || tappa.foto) && (
                          <img
                            src={operaGuide[i].foto || tappa.foto}
                            alt={operaGuide[i].titolo || tappa.nome}
                            loading="lazy"
                            className="w-full max-h-56 object-contain bg-slate-100"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="p-3">
                          {(operaGuide[i].tecnica || operaGuide[i].misure) && (
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                              {[operaGuide[i].tecnica, operaGuide[i].misure].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className={`${calma ? 'text-[17px] leading-[1.65]' : 'text-[12px] leading-relaxed'} text-slate-800 whitespace-pre-line`}>{operaGuide[i].testo}</p>
                          {operaGuide[i].daGuardare.length > 0 && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-white border border-slate-200">
                              <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-1">{t('mv_art_look_for')}</p>
                              <ul className="space-y-0.5">
                                {operaGuide[i].daGuardare.map((d, k) => (
                                  <li key={k} className="text-[11px] text-slate-700 leading-snug">· {d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {operaGuide[i].curiosita && (
                            <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                              <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 mb-1">{t('mv_art_curiosity')}</p>
                              <p className="text-[11px] text-amber-900 leading-snug">{operaGuide[i].curiosita}</p>
                            </div>
                          )}

                          {/* CHIEDI ALLA GUIDA: tre domande pronte e una libera */}
                          <div className="mt-3 p-2.5 rounded-xl bg-white border border-slate-200">
                            <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1">
                              <HelpCircle className="w-3.5 h-3.5" />{t('mv_ask')}
                            </p>
                            {(risposte[i] || []).map((r, k) => (
                              <div key={k} className="mb-2">
                                <p className="text-[11px] font-black text-slate-700">{r.q}</p>
                                <p className={`${calma ? 'text-[15px] leading-relaxed' : 'text-[12px] leading-snug'} text-slate-800 mt-0.5`}>{r.a}</p>
                              </div>
                            ))}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {[t('mv_ask_q1'), t('mv_ask_q2'), t('mv_ask_q3')].map(q => (
                                <button
                                  key={q}
                                  onClick={() => void chiedi(i, q)}
                                  disabled={chiedendo}
                                  className="px-2.5 py-1 rounded-full bg-blue-50 border border-[#dbe4f5] text-[11px] font-bold text-primary active:scale-95 transition-transform disabled:opacity-50"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                            <form onSubmit={(e) => { e.preventDefault(); void chiedi(i, domanda); }} className="flex gap-1.5">
                              <input
                                value={domanda}
                                onChange={(e) => setDomanda(e.target.value)}
                                placeholder={t('mv_ask_placeholder')}
                                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#fdfbf7] border border-slate-200 text-[12px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-primary"
                              />
                              <button
                                type="submit"
                                disabled={chiedendo || domanda.trim().length < 3}
                                className="px-3 py-2 rounded-xl bg-primary text-white text-[11px] font-black disabled:opacity-40 whitespace-nowrap"
                              >
                                {chiedendo ? <Loader2 className="w-4 h-4 animate-spin" /> : t('mv_ask_send')}
                              </button>
                            </form>
                          </div>

                          {/* FOTO RICORDO: scatta, e in basso c'è la didascalia */}
                          <button
                            onClick={() => { setFotoRicordoPer(i); fotoRicordoRef.current?.click(); }}
                            className="mt-2 w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-left active:scale-[0.99] transition-transform"
                          >
                            <ImagePlus className="w-4 h-4 text-primary shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-[12px] font-black text-slate-900">{t('mv_photo_memory')}</span>
                              <span className="block text-[10px] font-bold text-slate-500 leading-snug">{t('mv_photo_memory_hint')}</span>
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              </div>
              );
            })}
          </ol>

          {/* LE PREFERITE: con le foto, si toccano per riascoltare. Vivono
              nella guida, quindi restano nell'archivio e vanno in stampa. */}
          {visit.guide.tappe.some(x => x.preferita) && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />{t('mv_favorites')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {visit.guide.tappe.map((x, i) => x.preferita ? (
                  <button
                    key={`fav-${i}`}
                    onClick={() => void handleOpera(i)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border border-rose-200 active:scale-95 transition-transform"
                  >
                    {x.fotoIcona ? (
                      <img src={x.foto || x.fotoIcona} alt="" loading="lazy" className="w-full aspect-square rounded-xl object-cover border border-slate-200" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full aspect-square rounded-xl bg-blue-50 flex items-center justify-center"><Landmark className="w-6 h-6 text-primary" /></div>
                    )}
                    <span className="text-[10px] font-black text-slate-800 leading-tight text-center line-clamp-2">{x.nome}</span>
                  </button>
                ) : null)}
              </div>
            </div>
          )}

          {/* IL CONFRONTO (12/09/2026): due opere una accanto all'altra —
              stesso autore, stesso soggetto, stessa epoca — e la voce che
              dice dove guardare per vedere la differenza. */}
          {coppie.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('mv_compare')}</p>
              <p className="text-[10px] font-bold text-slate-400 mb-2">{t('mv_compare_hint')}</p>
              <div className="space-y-2">
                {coppie.map(c => {
                  const k = chiaveCoppia(c);
                  const A = visit.guide.tappe[c.a];
                  const B = visit.guide.tappe[c.b];
                  return (
                    <div key={k} className="px-3.5 py-3 rounded-2xl bg-white border border-slate-200">
                      <div className="flex items-center gap-2">
                        {[A, B].map((x, n) => (
                          <div key={n} className="flex-1 min-w-0 flex items-center gap-2">
                            {(x.fotoIcona || x.foto) ? (
                              <img src={x.fotoIcona || x.foto} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Landmark className="w-5 h-5 text-primary" /></div>
                            )}
                            <div className="min-w-0">
                              <p className="text-[11px] font-black text-slate-900 leading-tight line-clamp-2">{x.nome}</p>
                              <p className="text-[10px] font-bold text-slate-500 truncate">{[x.autore, x.anno].filter(Boolean).join(' · ')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                          {c.motivo === 'autore' ? t('mv_compare_same_author') : c.motivo === 'soggetto' ? t('mv_compare_same_subject') : t('mv_compare_same_era')}
                        </span>
                        <button
                          onClick={() => void handleConfronto(c)}
                          disabled={confrontando !== null}
                          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-[11px] font-black text-primary active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {confrontando === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confrontoParla === k ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          {confrontoParla === k ? t('vis_pause') : t('mv_compare_listen')}
                        </button>
                      </div>
                      {confronti[k] && (
                        <p className={`${calma ? 'text-[15px] leading-relaxed' : 'text-[12px] leading-relaxed'} text-slate-800 mt-2`}>{confronti[k]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LE MOSTRE IN CORSO (12/09/2026): dal sito ufficiale, ricopiate.
              La mostra c'è e il visitatore non lo sa: qui lo sa. */}
          {mostre.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('mv_exhibitions')}</p>
              <div className="space-y-2">
                {mostre.map((m, k) => (
                  <div key={`${m.titolo}-${k}`} className="px-3.5 py-3 rounded-2xl bg-white border border-slate-200">
                    <p className="text-[13px] font-black text-slate-900 leading-tight">{m.titolo}</p>
                    {(m.dal || m.al) && (
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {[m.dal ? t('mv_exhibition_from').replace('{d}', fmtData(m.dal)) : '', m.al ? t('mv_exhibition_until').replace('{d}', fmtData(m.al)) : ''].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {m.sale && (
                      <p className="text-[11px] font-black text-primary mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{t('mv_exhibition_rooms').replace('{s}', m.sale)}</p>
                    )}
                    {m.biglietto && (
                      <p className={`text-[10px] font-black uppercase tracking-wider mt-1 ${m.biglietto === 'compresa' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {m.biglietto === 'compresa' ? t('mv_exhibition_included') : t('mv_exhibition_separate')}
                      </p>
                    )}
                    {m.riga && <p className={`${calma ? 'text-[15px]' : 'text-[12px]'} text-slate-700 mt-1 leading-snug`}>{m.riga}</p>}
                    {m.opere.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {m.opere.map((o, j) => <span key={j} className="px-2 py-0.5 rounded-full bg-blue-50 text-primary text-[10px] font-bold">{o}</span>)}
                      </div>
                    )}
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 mt-1.5 underline-offset-2 hover:underline">
                      <ExternalLink className="w-3 h-3" />{t('mv_exhibition_source')}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* I SERVIZI (11/09/2026): bagni, guardaroba, caffetteria, bookshop,
              uscita, accessibilità — solo le voci che il sito dichiara. Dopo
              un'ora e mezza dentro un museo è la cosa che serve davvero. */}
          {visit.guide.servizi && Object.keys(visit.guide.servizi).length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('mv_servizi')}</p>
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {([
                  ['bagni', Bath, t('mv_serv_bagni')],
                  ['guardaroba', Shirt, t('mv_serv_guardaroba')],
                  ['caffetteria', Coffee, t('mv_serv_caffetteria')],
                  ['bookshop', ShoppingBag, t('mv_serv_bookshop')],
                  ['uscita', DoorOpen, t('mv_serv_uscita')],
                  ['accessibilita', Accessibility, t('mv_serv_accessibilita')],
                ] as const).map(([k, Icona, etichetta]) => {
                  const v = visit.guide.servizi?.[k];
                  if (!v) return null;
                  return (
                    <div key={k} className="flex items-start gap-3 px-3.5 py-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Icona className="w-4 h-4 text-primary" /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{etichetta}</p>
                        <p className={`${calma ? 'text-[15px]' : 'text-[12px]'} font-bold text-slate-800 leading-snug`}>{v}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Esperienze prenotabili: biglietti e visite guidate col prezzo.
              Compaiono solo a chi ha il pass, e solo se ce ne sono davvero. */}
          {esperienze.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('mv_esperienze')}</p>
              <div className="space-y-2">
                {esperienze.map((e, i) => (
                  <a
                    key={`${i}-${e.titolo}`}
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow sponsored"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white border border-slate-200 active:scale-[0.99] transition-transform"
                  >
                    {e.foto ? (
                      <img src={e.foto} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover shrink-0" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                        <Ticket className="w-5 h-5 text-amber-700" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-black text-slate-900 leading-tight line-clamp-2">{e.titolo}</p>
                      <p className="text-[11px] font-bold text-slate-500">
                        {[e.prezzo, e.durata, e.voto].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                  </a>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">{t('mv_esperienze_nota')}</p>
            </div>
          )}

          {visit.source?.url && (
            <a href={visit.source.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
              <ExternalLink className="w-3 h-3" /> {t('mv_source')}: Wikipedia
            </a>
          )}
          <p className="text-[10px] text-slate-400 mt-2">{t('vis_ai_disclaimer')}</p>
        </div>

        {/* Azioni */}
        <div className="px-5 pb-6 pt-2 shrink-0 space-y-2 bg-[#fdfbf7]">
          <button
            onClick={onScanNext}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-black text-sm shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            {t('mv_next')}
          </button>

          <div className="flex gap-2">
            {/* Aggiungi opere: solo con la rete, come deciso dal committente */}
            {online && (
              <button
                onClick={() => void handleAggiungiOpere()}
                disabled={aggiungendo}
                className="flex-1 py-3 rounded-2xl bg-white border border-primary/40 text-primary font-black text-[13px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {aggiungendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('mv_aggiungi_opere')}
              </button>
            )}
            {/* Scarica tutto: percorso, audioguide, foto */}
            <button
              onClick={() => void handleScarica()}
              disabled={!!scaricando || !online}
              className={`flex-1 py-3 rounded-2xl border font-black text-[13px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60 ${
                scaricato ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {scaricando ? <Loader2 className="w-4 h-4 animate-spin" />
                : scaricato ? <Check className="w-4 h-4" />
                : <Download className="w-4 h-4" />}
              {scaricando
                ? `${scaricando.fatte}/${scaricando.totali}`
                : scaricato ? t('mv_disponibile_offline') : t('mv_scarica_tutto')}
            </button>
          </div>

          {/* La guida su carta: si piega in quattro e sta in tasca anche col
              telefono spento, e si manda agli amici prima di partire. */}
          {/* Stampa e Termina sulla stessa riga (12/09/2026, committente:
              «per avere più spazio»); la cartolina, quando c'è, sotto. */}
          <div className="flex gap-2">
            <button
              onClick={() => void handleStampa()}
              className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              {t('mv_stampa_guida')}
            </button>
            <button onClick={handleEnd} className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
              <MapPin className="w-4 h-4" />
              {t('mv_end')}
            </button>
          </div>
          <div className="flex gap-2">
            {/* LA CARTOLINA: solo quando c'è qualcosa da raccontare */}
            {countSeen(visit) > 0 && (
              <button
                onClick={() => void condividiGiornata()}
                disabled={condividendo}
                className="flex-1 py-3 rounded-2xl bg-white border border-primary/40 text-primary font-black text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {condividendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {t('mv_share_day')}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
    </>
  );
}
