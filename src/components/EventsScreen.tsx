import { useState, useEffect, useCallback, useRef } from "react";
// Una sola haversine per tutto il client (src/lib/geo): prima questa
// schermata importava la copia di MapArea.
import { haversineMeters } from "../lib/geo";
import { notify } from "../lib/toast";
import {
  MapPin,
  Phone,
  ExternalLink,
  Calendar as CalendarIcon,
  Loader2,
  X,
  AlertCircle,
  RefreshCcw,
  Heart
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { get as idbGet } from "idb-keyval";
import { logApiCall } from "../lib/apiLogger";
import { supabase } from "../lib/supabase";
import { getApiUrl } from "../lib/api";
import { ensureAffiliateUrl, ensureGygAffiliateUrl, ensureViatorAffiliateUrl, trackAffiliateClick } from "../lib/affiliates";
import { getLocalFavorites, toggleFavoritePoi } from "../lib/favorites";

type EventSource = "virgilio" | "ticketmaster" | "getyourguide" | "viator" | "tiqets" | "local" | "mostre" | "permanenti";

interface EventData {
  id: string;
  name: string;
  description: string;
  date: string;
  /** Mostre: ultimo giorno (AAAA-MM-GG). La card e' un periodo, non una data. */
  endDate?: string;
  /** Collezione permanente: un museo del catalogo, senza date (id POI = id senza prefisso). */
  permanent?: boolean;
  /** Orario di inizio (HH:MM) quando la fonte lo espone (Ticketmaster). */
  time?: string;
  venueName: string;
  venueAddress?: string;
  url: string;
  imageUrl: string;
  phone?: string;
  source: EventSource;
  lat?: number;
  lon?: number;
  /** Sagre: coordinate del capoluogo di provincia, non del paese esatto. */
  approxCoords?: boolean;
  /**
   * Prenotabile su più date (Tiqets/Viator/GYG): non ha UNA data, quindi
   * date resta '' e il filtro per periodo lo lascia passare.
   */
  bookable?: boolean;
  isFree?: boolean;
  isFamily?: boolean;
  isMusic?: boolean;
  macroCategory?: string;
}

import { Language, getTranslation } from "../lib/i18n";

/** Viator: le esperienze hanno senso solo vicino al punto cercato. */
const VIATOR_MAX_RADIUS_KM = 50;

/** Oggi in ora locale, AAAA-MM-GG (toISOString slitterebbe di un giorno la sera). */
const isoOggiLocale = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "12 set" / "12 set 2027": la data di una mostra, nella lingua dell'app. */
const fmtGiorno = (iso: string, lang: Language): string => {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return iso;
  const locale = ({ IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN' } as Record<string, string>)[lang] || 'it-IT';
  return d.toLocaleDateString(locale, {
    day: 'numeric', month: 'short',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
};

const giorniA = (iso: string): number =>
  Math.round((new Date(`${iso}T12:00:00`).getTime() - Date.now()) / 86400_000);

/** Quante card per pagina: il resto arriva con «Mostra altri 20». */
const PAGINA_EVENTI = 20;

/**
 * Emoji della categoria quando la fonte NON dà una foto: un blocco colorato
 * con l'emoji, mai una foto di ripiego presa da un archivio stock (regola
 * del progetto: la foto sbagliata è peggio di nessuna foto).
 */
const emojiCategoria = (e: { macroCategory?: string; source: EventSource; isMusic?: boolean }): string => {
  const m = e.macroCategory || '';
  if (m) {
    const prima = Array.from(m)[0];
    if (prima && /\p{Extended_Pictographic}/u.test(prima)) return prima;
  }
  if (e.isMusic || e.source === 'ticketmaster') return '🎵';
  if (e.source === 'mostre' || e.source === 'permanenti') return '🖼️';
  return '🎪';
};

/** Cache locale del geocoding indirizzo → [lat, lon] (Virgilio non dà coordinate). */
const GEO_CACHE_KEY = 'wip_events_geo_cache';
const leggiGeoCache = (): Record<string, [number, number]> => {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}') || {}; } catch { return {}; }
};
const scriviGeoCache = (addr: string, coords: [number, number]) => {
  try {
    const c = leggiGeoCache();
    c[addr] = coords;
    const chiavi = Object.keys(c);
    // Tetto a 300 indirizzi: si scartano i più vecchi (ordine d'inserimento).
    for (const k of chiavi.slice(0, Math.max(0, chiavi.length - 300))) delete c[k];
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(c));
  } catch { /* storage pieno o assente: si fa senza cache */ }
};

/** Esegue i task al massimo `n` per volta. */
const inParallelo = async <T,>(tasks: (() => Promise<T>)[], n: number): Promise<void> => {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; try { await t(); } catch { /* gestito dal task */ } } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
};

/** Tipo di evento per le chip (basato su macroCategory/flag già presenti). */
type TipoEvento = 'tutti' | 'concerti' | 'sagre' | 'mercati' | 'tour' | 'biglietti';
const tipoDi = (e: EventData): Exclude<TipoEvento, 'tutti'> | null => {
  const m = (e.macroCategory || '').toLowerCase();
  if (m.includes('mercato')) return 'mercati';
  if (m.includes('sagra') || m.includes('fiera')) return 'sagre';
  if (m.includes('tour')) return 'tour';
  if (e.source === 'tiqets' || m.includes('musei & attrazioni')) return 'biglietti';
  if (e.isMusic || e.source === 'ticketmaster') return 'concerti';
  return null;
};

interface EventsScreenProps {
  /** Centro della mappa VISUALIZZATA: riferimento di tutte le ricerche. */
  mapCenter?: [number, number];
  /** Raggio del riquadro visibile: proposto come raggio di ricerca iniziale. */
  mapRadiusKm?: number;
  onClose?: () => void;
  language: Language;
}

export default function EventsScreen({ mapCenter, mapRadiusKm, onClose, language }: EventsScreenProps) {
  const [sourceResults, setSourceResults] = useState<Record<EventSource, EventData[]>>({
    virgilio: [],
    ticketmaster: [],
    getyourguide: [],
    viator: [],
    tiqets: [],
    local: [],
    mostre: [],
    permanenti: [],
  });
  const [loadingSources, setLoadingSources] = useState<Record<EventSource, boolean>>({
    virgilio: false,
    ticketmaster: false,
    getyourguide: false,
    viator: false,
    tiqets: false,
    local: false,
    mostre: false,
    permanenti: false,
  });
  const [sourceErrors, setSourceErrors] = useState<Record<EventSource, string | null>>({
    virgilio: null,
    ticketmaster: null,
    getyourguide: null,
    viator: null,
    tiqets: null,
    local: null,
    mostre: null,
    permanenti: null,
  });

  // Tre viste separate, mai mescolate: «Eventi» (le sei fonti storiche),
  // «Mostre» e «Stagionali». Dentro Mostre un sotto-interruttore: «In corso»
  // (le temporanee lette dai siti dei musei + Wikidata) e «Permanenti» (i
  // musei della zona). «Stagionali» è la vista dei verticali tematici: cosa
  // c'è STANOTTE o QUESTA SETTIMANA e non ci sarà fra un mese (stelle,
  // mercatini, fioriture), quindi non ha né date né ordinamento propri.
  // Stessi filtri per le altre: centro di ricerca, raggio, date, gratis, ordine.
  const [view, setView] = useState<'eventi' | 'mostre' | 'stagionali'>('eventi');
  const [subView, setSubView] = useState<'in_corso' | 'permanenti'>('in_corso');
  // Chiave (centro/raggio/lingua) dell'ultima lettura: evita di rileggere
  // dodici siti (o il DB) per un re-render.
  const mostreKeyRef = useRef<string>('');
  const permanentiKeyRef = useRef<string>('');
  const stagionaliKeyRef = useRef<string>('');
  // Stagionali: { stelle, mercatini, fioriture } da /api/tematici/eventi.
  // La rotta può non esistere ancora: in quel caso lo stato resta null e la
  // vista mostra «Nessun dato per questa zona», mai un errore rosso.
  const [stagionali, setStagionali] = useState<any | null>(null);
  const [stagionaliLoading, setStagionaliLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState("Italia");
  const [sortBy, setSortBy] = useState<'date' | 'relevance'>('date');
  const [deviceCoords, setDeviceCoords] = useState<[number, number] | null>(null);
  // Raggio iniziale = quello del riquadro visibile sulla mappa, così la prima
  // ricerca copre esattamente ciò che l'utente sta guardando. I chip di
  // distanza restano sovrani: una volta scelti, comandano loro.
  const [radius, setRadius] = useState(() =>
    Math.min(Math.max(Math.round(mapRadiusKm ?? 100), 10), 500),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Filtro «Solo gratis» (badge 🆓 sulle card)
  const [onlyFree, setOnlyFree] = useState(false);
  // Filtro per tipo (concerti / sagre / mercati / tour / biglietti), accanto a
  // «Solo gratis»: un filtro client sulle card già caricate.
  const [tipoFiltro, setTipoFiltro] = useState<TipoEvento>('tutti');
  // Paginazione: quante card sono visibili («Mostra altri 20»).
  const [visibili, setVisibili] = useState(PAGINA_EVENTI);

  // Viaggio attivo: destinazione dell'itinerario più recente (Supabase o
  // copia locale wip_last_plan). Se presente, la ricerca eventi parte da lì
  // con un chip visibile e un toggle per tornare alla posizione attuale.
  const [activeTrip, setActiveTrip] = useState<{ city: string; lat: number; lon: number } | null>(null);
  const [useTripCenter, setUseTripCenter] = useState(false);

  // «Serata perfetta»: proposta AI aperitivo+cena+evento+rientro
  const [eveningPlan, setEveningPlan] = useState<any | null>(null);
  const [eveningLoading, setEveningLoading] = useState(false);
  const [showEveningModal, setShowEveningModal] = useState(false);

  // Centro effettivo di TUTTE le ricerche: la destinazione del viaggio attivo
  // (se scelta) oppure il centro della mappa visualizzata (default invariato).
  const searchCenter: [number, number] | undefined =
    useTripCenter && activeTrip ? [activeTrip.lat, activeTrip.lon] : mapCenter;

  // Date filters: oggi in ora LOCALE (toISOString slitta di un giorno la sera)
  const [startDate, setStartDate] = useState<string>(() => isoOggiLocale());
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const prevCenterRef = useRef<[number, number] | undefined>(mapCenter);
  // Date e città correnti, lette dai loader per evitare closure stantie
  // quando il rilancio parte da un effetto diverso da fetchEvents.
  const datesRef = useRef<{ start: string; end: string }>({ start: startDate, end: endDate });
  datesRef.current = { start: startDate, end: endDate };
  const cityRef = useRef<string>("Italia");
  // Montato? Il geocoding in background non deve fare setState su un
  // componente distrutto (cambio tab).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const langParam = String(language || 'IT').toLowerCase();

  // Lettura di TUTTE le fonti: solo quando cambiano centro o raggio. Le date
  // non stanno fra le dipendenze: un cambio di periodo rilancia soltanto le
  // fonti che dipendono dal periodo (effetto separato più sotto).
  const fetchEvents = useCallback(async () => {
    // Determine if we should clear results (if search center moved significantly)
    const centerMoved = prevCenterRef.current && searchCenter && (
      Math.abs(prevCenterRef.current[0] - searchCenter[0]) > 0.1 ||
      Math.abs(prevCenterRef.current[1] - searchCenter[1]) > 0.1
    );

    if (centerMoved) {
      setSourceResults({
        virgilio: [],
        ticketmaster: [],
        getyourguide: [],
        viator: [],
        tiqets: [],
        local: [],
        mostre: [],
        permanenti: [],
      });
      mostreKeyRef.current = '';
      permanentiKeyRef.current = '';
    }

    prevCenterRef.current = searchCenter;

    setLoading(true);
    setError(null);

    let currentLat = searchCenter?.[0] || 44.0792;
    let currentLon = searchCenter?.[1] || 10.1;

    try {
      // Reverse geocoding to get city name for sources that need it (like Virgilio)
      let resolvedCityName = "Italia";
      try {
        const geocodeRes = await fetch(
          getApiUrl(`/api/nominatim/reverse?lat=${currentLat}&lon=${currentLon}`)
        );
        if (geocodeRes.ok) {
          const geocodeData = await geocodeRes.json();
          // Prefer city, then town, then village, then county
          resolvedCityName = geocodeData.address?.city ||
            geocodeData.address?.town ||
            geocodeData.address?.village ||
            geocodeData.address?.county ||
            "Italia";
          setCity(resolvedCityName);
        }
      } catch (e) {
        console.warn("Geocoding failed", e);
      }
      cityRef.current = resolvedCityName;

      // Load all sources in parallel using the map center and the selected radius
      const { start, end } = datesRef.current;
      await Promise.allSettled([
        loadVirgilio(currentLat, currentLon, resolvedCityName),
        loadTicketmaster(currentLat, currentLon, radius, resolvedCityName),
        loadGetYourGuide(currentLat, currentLon, radius, resolvedCityName),
        loadViator(currentLat, currentLon, radius, start, end, resolvedCityName),
        loadTiqets(currentLat, currentLon, radius),
        loadLocal(currentLat, currentLon, radius),
      ]);

    } catch (err) {
      console.error(err);
      setError(getTranslation("events_error_load", language));
    } finally {
      setLoading(false);
    }
  // Dipendenze per VALORE (lat/lon), non per reference: un array inline nel
  // parent ricreava fetchEvents a ogni render e rilanciava le 4 API a pagamento.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCenter?.[0], searchCenter?.[1], radius, langParam]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Cambio di PERIODO: solo Ticketmaster e Viator hanno le date nella query.
  // Tiqets, GetYourGuide, Virgilio e sagre/mercati si filtrano lato client e
  // non vengono rilette (prima un cambio di data rifaceva tutte le fonti).
  const primoPeriodoRef = useRef(true);
  useEffect(() => {
    if (primoPeriodoRef.current) { primoPeriodoRef.current = false; return; }
    const lat = searchCenter?.[0] || 44.0792;
    const lon = searchCenter?.[1] || 10.1;
    setSourceResults(prev => ({ ...prev, ticketmaster: [], viator: [] }));
    Promise.allSettled([
      loadTicketmaster(lat, lon, radius, cityRef.current),
      loadViator(lat, lon, radius, startDate, endDate, cityRef.current),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // Bootstrap una volta sola: posizione del dispositivo (per le distanze) e
  // sessione utente (per i preferiti). Prima stava nell'effetto di
  // fetchEvents e ripartiva a ogni cambio di centro/raggio/date.
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setDeviceCoords([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.warn("EventsScreen: Geolocation failed", err),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) {
        setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  // La pagina riparte da capo quando cambia qualunque filtro o vista.
  useEffect(() => {
    setVisibili(PAGINA_EVENTI);
  }, [view, subView, startDate, endDate, radius, onlyFree, tipoFiltro, sortBy, useTripCenter]);

  // ── Viaggio attivo: pre-imposta la destinazione dell'itinerario recente ──
  // Fonti (le stesse di PlanScreen/ProfileScreen): user_itineraries su
  // Supabase (il più recente, max 14 giorni) e la copia locale wip_last_plan
  // in IndexedDB. Senza viaggio il comportamento resta quello di default.
  useEffect(() => {
    (async () => {
      try {
        const derive = (plan: any): { city: string; lat: number; lon: number } | null => {
          if (!plan) return null;
          const cityName = String(plan.destinazione || plan.destination || (plan.titolo || '').split(':')[0] || '').trim();
          for (const g of (plan.giorni || [])) {
            for (const t of (g?.tappe || [])) {
              const tLat = Number(t?.coordinate?.lat ?? t?.lat);
              const tLon = Number(t?.coordinate?.lng ?? t?.coordinate?.lon ?? t?.lon);
              if (Number.isFinite(tLat) && Number.isFinite(tLon) && tLat !== 0) {
                return { city: cityName || 'destinazione del viaggio', lat: tLat, lon: tLon };
              }
            }
          }
          return null;
        };

        let trip: { city: string; lat: number; lon: number } | null = null;
        // 1. Itinerario più recente su Supabase (solo se aggiornato di recente)
        try {
          const { data: s } = await supabase.auth.getSession();
          if (s?.session?.user?.id) {
            const { data } = await supabase
              .from('user_itineraries')
              .select('dati_itinerario, updated_at')
              .eq('user_id', s.session.user.id)
              .order('updated_at', { ascending: false })
              .limit(1);
            const row: any = data?.[0];
            if (row?.updated_at && Date.now() - new Date(row.updated_at).getTime() < 14 * 86400_000) {
              trip = derive(row.dati_itinerario);
            }
          }
        } catch { /* si passa alla copia locale */ }
        // 2. Copia locale dell'ultimo piano generato (PlanScreen la aggiorna a ogni salvataggio)
        if (!trip) trip = derive(await idbGet('wip_last_plan').catch(() => null));
        if (trip) {
          setActiveTrip(trip);
          setUseTripCenter(true);
        }
      } catch { /* nessun viaggio attivo: default invariato */ }
    })();
  }, []);

  const loadVirgilio = async (lat: number, lon: number, cityName?: string) => {
    logApiCall('virgilio', 'ricerca_eventi_scraping');
    setLoadingSources(prev => ({ ...prev, virgilio: true }));
    setSourceErrors(prev => ({ ...prev, virgilio: null }));
    try {
      const activeCity = cityName || city;
      const targetCity = activeCity === "Italia" ? "roma" : activeCity;
      if (!targetCity) {
        setSourceResults(prev => ({ ...prev, virgilio: [] }));
        return;
      }
      
      const vRes = await fetch(
        getApiUrl(`/api/virgilio?city=${encodeURIComponent(targetCity)}&lang=${langParam}`),
        { signal: AbortSignal.timeout(20000) }
      );

      if (!vRes.ok) {
        setSourceResults(prev => ({ ...prev, virgilio: [] }));
        return;
      }

      const text = await vRes.text();
      const newEvents: EventData[] = [];
      const costruisci = (args: {
        title: string; link: string; description: string; imgSrc: string; eventDate: string;
        locationName: string; locationAddress: string; lat?: number; lon?: number;
      }): EventData => {
        const checkLower = (args.title + " " + args.description).toLowerCase();
        return {
          // ID deterministico (titolo+data+luogo): un id casuale generava
          // doppioni nei preferiti a ogni ricaricamento della stessa lista.
          id: `virgilio-${args.title}-${args.eventDate}-${args.locationName}`,
          name: args.title,
          description: args.description,
          // '' quando la fonte non la dà: la card mostra «Data non confermata»
          // invece di una data di oggi inventata.
          date: args.eventDate,
          venueName: args.locationName,
          venueAddress: args.locationAddress || undefined,
          url: args.link,
          imageUrl: args.imgSrc,
          source: "virgilio",
          lat: Number.isFinite(args.lat) ? args.lat : undefined,
          lon: Number.isFinite(args.lon) ? args.lon : undefined,
          isFree: /gratuit|libero|free/.test(checkLower),
          isFamily: /famigli|bambin|kids/.test(checkLower),
          isMusic: /music|concert|live/.test(checkLower),
        };
      };

      // Nuovo proxy: JSON {events:[{title,date,venue,address,url,imageUrl,lat?,lon?}]}.
      let json: any = null;
      try { json = JSON.parse(text); } catch { json = null; }

      if (json && Array.isArray(json.events)) {
        for (const ev of json.events) {
          const title = String(ev.title || '').trim();
          if (!title) continue;
          newEvents.push(costruisci({
            title,
            link: String(ev.url || `https://www.virgilio.it/italia/${targetCity.toLowerCase()}/eventi/`),
            description: String(ev.description || '').trim(),
            imgSrc: String(ev.imageUrl || '').includes('placeholder') ? '' : String(ev.imageUrl || ''),
            eventDate: String(ev.date || '').split('T')[0],
            locationName: String(ev.venue || '').trim() || targetCity,
            locationAddress: String(ev.address || '').trim(),
            lat: ev.lat != null ? Number(ev.lat) : undefined,
            lon: ev.lon != null ? Number(ev.lon) : undefined,
          }));
        }
      } else {
        // Transizione: il server risponde ancora con l'HTML della pagina.
        const articles = text.split('<article class="eventi ').slice(1);
        articles.forEach((articleHtml) => {
          const titleMatch = articleHtml.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/i) ||
                             articleHtml.match(/<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>/i);
          let title = `Evento a ${targetCity}`;
          let link = `https://www.virgilio.it/italia/${targetCity.toLowerCase()}/eventi/`;
          if (titleMatch) {
            let href = titleMatch[1].replace(/&amp;/g, '&');
            link = href.startsWith("http") ? href : `https://www.virgilio.it${href}`;
            title = titleMatch[2].trim();
          }
          const descMatch = articleHtml.match(/<p[^>]*description[^>]*>\s*<a[^>]*>\s*(.*?)\s*<\/a>\s*<\/p>/is);
          const description = descMatch ? descMatch[1].trim() : "";

          const imgMatch = articleHtml.match(/data-src(?:-[a-z])?="([^"]+)"/i) ||
                           articleHtml.match(/<img[^>]*src="([^"]+)"/i) ||
                           articleHtml.match(/background-image:\s*url\(['"]?([^'"\)]+)['"]?\)/i);
          let imgSrc = imgMatch ? imgMatch[1] : "";
          // Niente foto di ripiego: senza immagine la card mostra l'emoji.
          if (imgSrc.includes("placeholder")) imgSrc = "";

          const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"/i);
          const eventDate = dateMatch ? dateMatch[1].split("T")[0] : "";
          const nameMatch = articleHtml.match(/<span[^>]*itemprop="name"[^>]*>\s*(.*?)\s*<\/span>/is);
          const locationAddress = (articleHtml.match(/<address[^>]*>\s*(.*?)\s*<\/address>/is)?.[1] || "").trim();
          const locationName = nameMatch ? nameMatch[1].trim().replace(/<[^>]+>/g, '') : targetCity;
          newEvents.push(costruisci({ title, link, description, imgSrc, eventDate, locationName, locationAddress }));
        });
      }

      setSourceResults(prev => {
        const combined = [...prev.virgilio, ...newEvents];
        // Use name + date + venue as unique key for Virgilio events as they don't have stable IDs from HTML
        const unique = Array.from(new Map(combined.map(e => [`${e.name}-${e.date}-${e.venueName}`, e])).values());
        return { ...prev, virgilio: unique };
      });

      // Geocoding in background SOLO per chi non ha coordinate dal server:
      // prima cache locale per indirizzo, poi Nominatim al massimo 5 alla
      // volta (niente più timer i*1500 ms: con 20 eventi erano 30 secondi).
      const geoCache = leggiGeoCache();
      const aggiorna = (id: string, coords: [number, number]) => {
        if (!mountedRef.current) return;
        setSourceResults(prev => {
          const newList = [...prev.virgilio];
          const index = newList.findIndex(e => e.id === id);
          if (index !== -1) newList[index] = { ...newList[index], lat: coords[0], lon: coords[1] };
          return { ...prev, virgilio: newList };
        });
      };
      const daGeocodificare: (() => Promise<void>)[] = [];
      for (const ev of newEvents) {
        if (ev.lat != null && ev.lon != null) continue;
        const addr = (ev.venueAddress || '').trim();
        if (!addr) continue;
        const inCache = geoCache[addr];
        if (inCache) { aggiorna(ev.id, inCache); continue; }
        daGeocodificare.push(async () => {
          if (!mountedRef.current) return;
          try {
            const geoRes = await fetch(
              getApiUrl(`/api/nominatim/search?q=${encodeURIComponent(addr)}&format=json&limit=1`),
              { signal: AbortSignal.timeout(10000) }
            );
            if (!geoRes.ok) return;
            const geoData = await geoRes.json();
            const la = parseFloat(geoData?.[0]?.lat), lo = parseFloat(geoData?.[0]?.lon);
            if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
            scriviGeoCache(addr, [la, lo]);
            aggiorna(ev.id, [la, lo]);
          } catch (e) {
            console.warn("Error geocoding event address", e);
          }
        });
      }
      if (daGeocodificare.length) void inParallelo(daGeocodificare, 5);
    } catch (e) {
      console.error(e);
      setSourceErrors(prev => ({ ...prev, virgilio: getTranslation("events_err_virgilio", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, virgilio: false }));
    }
  };

  const loadTicketmaster = async (lat: number, lon: number, searchRadius: number, cityName?: string) => {
    logApiCall('ticketmaster', 'ricerca_eventi_api');
    setLoadingSources(prev => ({ ...prev, ticketmaster: true }));
    setSourceErrors(prev => ({ ...prev, ticketmaster: null }));
    // Date dal ref: il loader può partire da un effetto che non vede lo
    // stato aggiornato (closure stantia).
    const startObj = new Date(datesRef.current.start);
    const endObj = new Date(datesRef.current.end);
    const startDateTime = startObj.toISOString().split(".")[0] + "Z";
    const endDateTime = new Date(endObj.getTime() + 86400000).toISOString().split(".")[0] + "Z";

    try {
        const res = await fetch(
          getApiUrl(`/api/ticketmaster?lat=${lat}&lon=${lon}&radius=${searchRadius}&startDateTime=${startDateTime}&endDateTime=${endDateTime}&lang=${langParam}`),
          { signal: AbortSignal.timeout(20000) }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Errore Ticketmaster Proxy");
        }
        const data = await res.json();
        const items = data._embedded?.events || [];
        const newEvents: EventData[] = items.map((item: any) => {
          const checkLower = (item.name + " " + (item.info || item.description || "")).toLowerCase();
          return {
            id: item.id,
            name: item.name,
            description: item.info || item.description || "Dettagli sulla pagina ufficiale.",
            date: item.dates?.start?.localDate || "",
            time: item.dates?.start?.localTime ? String(item.dates.start.localTime).slice(0, 5) : undefined,
            venueName: item._embedded?.venues?.[0]?.name || "Località non specificata",
            url: item.url,
            imageUrl: item.images?.[0]?.url || "",
            source: "ticketmaster" as EventSource,
            lat: item._embedded?.venues?.[0]?.location?.latitude,
            lon: item._embedded?.venues?.[0]?.location?.longitude,
            // Gratis se dichiarato nel testo O se il prezzo minimo listino è 0
            isFree: /gratuit|libero/.test(checkLower) || item.priceRanges?.[0]?.min === 0,
            isFamily: /famigli|bambin/.test(checkLower),
            isMusic: /music|concert/.test(checkLower),
          };
        });
        
        setSourceResults(prev => {
          // Merge to avoid duplicates and ensure additive feel
          const combined = [...prev.ticketmaster, ...newEvents];
          const unique = Array.from(new Map(combined.map(e => [e.id, e])).values());
          return { ...prev, ticketmaster: unique };
        });
    } catch (e) {
      // Nessun evento finto di ripiego: mostriamo solo l'errore reale della
      // source, così l'utente non scambia un placeholder per un evento vero.
      setSourceErrors(prev => ({ ...prev, ticketmaster: getTranslation("events_err_ticketmaster", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, ticketmaster: false }));
    }
  };

  const retrySource = (source: EventSource) => {
    const lat = searchCenter?.[0] || 44.0792;
    const lon = searchCenter?.[1] || 10.1;
    if (source === "virgilio") loadVirgilio(lat, lon, city);
    if (source === "ticketmaster") loadTicketmaster(lat, lon, radius, city);
    if (source === "getyourguide") loadGetYourGuide(lat, lon, radius, city);
    if (source === "viator") loadViator(lat, lon, radius, startDate, endDate, city);
    if (source === "tiqets") loadTiqets(lat, lon, radius);
    if (source === "local") loadLocal(lat, lon, radius);
    if (source === "mostre") { mostreKeyRef.current = ''; loadMostre(lat, lon, radius); }
    if (source === "permanenti") { permanentiKeyRef.current = ''; loadPermanenti(lat, lon, radius); }
  };

  // ── Sagre e mercati locali (ondata 6) ──────────────────────────────────
  // /api/events/local: mercati settimanali da OpenStreetMap (mondiali) e
  // sagre/feste di paese da eventiesagre.it (Italia). Le sagre hanno le
  // coordinate del capoluogo di provincia: approxCoords allarga il filtro.
  const loadLocal = async (lat: number, lon: number, searchRadius: number) => {
    logApiCall('local_events', 'sagre_mercati');
    setLoadingSources(prev => ({ ...prev, local: true }));
    setSourceErrors(prev => ({ ...prev, local: null }));
    try {
      const r = await fetch(
        getApiUrl(`/api/events/local?lat=${lat}&lon=${lon}&radius=${searchRadius}&lang=${langParam}`),
        { signal: AbortSignal.timeout(20000) }
      );
      if (!r.ok) throw new Error(`Errore sagre/mercati (${r.status})`);
      const data = await r.json();
      const mapped: EventData[] = (data?.events || []).map((e: any) => ({
        id: `local-${e.id}`,
        name: e.name,
        description: e.description || '',
        date: e.date,
        venueName: e.venueName || '',
        url: e.url || '',
        imageUrl: e.imageUrl || '',
        source: 'local' as EventSource,
        macroCategory: e.kind === 'mercato' ? '🧺 Mercato' : '🍷 Sagra & Festa',
        lat: e.lat,
        lon: e.lon,
        approxCoords: !!e.approx,
        isFree: e.kind === 'mercato' ? true : undefined,
      }));
      // ── LE GRANDI FIERE DEL GUSTO ────────────────────────────────────
      // Non arrivano da nessuna API: sono un catalogo curato
      // (foodFestivalsCatalog.ts) perché si ripetono ogni anno nella stessa
      // finestra e nessun aggregatore le tiene. La Fiera del Tartufo di
      // Alba, l'Oktoberfest, la Tomatina: non sono "eventi in zona", sono
      // il motivo per cui si parte in quella settimana.
      // Vengono PRIMA delle sagre di paese, e senza rete: funzionano anche
      // offline, quando tutto il resto di questa schermata non risponde.
      const { festivalsNear, FESTIVAL_KIND_LABELS } = await import('../lib/foodFestivalsCatalog');
      const meseOra = new Date().getMonth() + 1;
      const fiere: EventData[] = festivalsNear(lat, lon, Math.max(searchRadius, 250))
        // Prima quelle che cadono ADESSO, poi le altre per distanza: è
        // l'unico ordine utile in una schermata eventi.
        .sort((a, b) => {
          const oraA = a.months.includes(meseOra) ? 0 : 1;
          const oraB = b.months.includes(meseOra) ? 0 : 1;
          return oraA - oraB || a.distanceKm - b.distanceKm;
        })
        .map((f) => ({
          id: `fiera-${f.id}`,
          name: `${f.months.includes(meseOra) ? '● ' : ''}${f.name}`,
          // La data esatta NON si scrive mai: cambia ogni anno, e una data
          // sbagliata in una guida è peggio di nessuna data.
          description: `${f.when} — ${f.what} · ${f.tip}`,
          date: '',
          venueName: `${f.city}, ${f.country} · a ${f.distanceKm} km`,
          url: '',
          imageUrl: '',
          source: 'local' as EventSource,
          macroCategory: `${FESTIVAL_KIND_LABELS[f.kind].emoji} Fiera del gusto`,
          lat: f.coords.lat,
          lon: f.coords.lon,
          approxCoords: false,
          isFree: undefined,
        }));

      setSourceResults(prev => ({ ...prev, local: [...fiere, ...mapped] }));
    } catch (err) {
      console.error('loadLocal Error:', err);
      // Anche se l'API cade, le fiere del catalogo si mostrano lo stesso:
      // stanno nel codice, non in rete.
      try {
        const { festivalsNear, FESTIVAL_KIND_LABELS } = await import('../lib/foodFestivalsCatalog');
        const fiere: EventData[] = festivalsNear(lat, lon, Math.max(searchRadius, 250)).map((f) => ({
          id: `fiera-${f.id}`,
          name: f.name,
          description: `${f.when} — ${f.what}`,
          date: '',
          venueName: `${f.city}, ${f.country}`,
          url: '',
          imageUrl: '',
          source: 'local' as EventSource,
          macroCategory: `${FESTIVAL_KIND_LABELS[f.kind].emoji} Fiera del gusto`,
          lat: f.coords.lat,
          lon: f.coords.lon,
          approxCoords: false,
          isFree: undefined,
        }));
        setSourceResults(prev => ({ ...prev, local: fiere }));
        if (!fiere.length) setSourceErrors(prev => ({ ...prev, local: getTranslation("events_err_local", language) }));
      } catch {
        setSourceErrors(prev => ({ ...prev, local: getTranslation("events_err_local", language) }));
      }
    } finally {
      setLoadingSources(prev => ({ ...prev, local: false }));
    }
  };

  const loadTiqets = async (lat: number, lon: number, searchRadius: number) => {
    logApiCall('tiqets', 'fetch_tickets');
    setLoadingSources(prev => ({ ...prev, tiqets: true }));
    setSourceErrors(prev => ({ ...prev, tiqets: null }));

    try {
      const res = await fetch(getApiUrl("/api/tiqets"), {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radius: searchRadius, lang: langParam, language: langParam })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Errore API Tiqets (${res.status})`);
      }

      const data = await res.json();
      const parsedData = Array.isArray(data) ? data : [];

      const mappedEvents: EventData[] = parsedData.map((t: any) => ({
        id: `tiqets-${t.id}`,
        name: t.name,
        description: t.description || "Biglietto d'ingresso per questa attrazione.",
        // Un biglietto vale su più date: niente data finta, è «prenotabile».
        date: '',
        bookable: true,
        venueName: t.venue ? (t.price ? `${t.venue} · ${t.price}` : t.venue) : (t.price ? `${getTranslation("events_type_tickets", language)} · ${t.price}` : "Tiqets"),
        // L'URL arriva dal server GIÀ con ?partner=<brand> (attribuzione
        // Tiqets legata al token): passarla intatta, MAI riscriverla.
        url: t.url,
        imageUrl: t.imageUrl || "",
        source: "tiqets" as EventSource,
        lat: t.lat || lat,
        lon: t.lon || lon,
        macroCategory: "🎫 Musei & Attrazioni"
      }));

      setSourceResults(prev => {
        const combined = [...prev.tiqets, ...mappedEvents];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return { ...prev, tiqets: unique };
      });
    } catch (err: any) {
      console.error("loadTiqets error:", err);
      setSourceErrors(prev => ({ ...prev, tiqets: getTranslation("events_err_tiqets", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, tiqets: false }));
    }
  };

  const loadViator = async (lat: number, lon: number, r: number, start: string, end: string, cityName: string) => {
    logApiCall('viator', 'fetch_experiences');
    setLoadingSources(prev => ({ ...prev, viator: true }));
    setSourceErrors(prev => ({ ...prev, viator: null }));
    
    try {
      // getApiUrl: su Capacitor i path relativi puntano agli asset locali e la
      // fetch fallirebbe sempre (zero esperienze = zero commissioni su nativo).
      // Timeout esplicito: il fallimento resta confinato alla card Viator.
      // Viator: raggio massimo 50 km dal centro della mappa visualizzata.
      // I chip di distanza arrivano fino a 500 km, ma per le esperienze un
      // raggio così ampio restituirebbe tour di un'altra regione.
      const viatorRadius = Math.min(r || VIATOR_MAX_RADIUS_KM, VIATOR_MAX_RADIUS_KM);
      const res = await fetch(getApiUrl("/api/viator"), {
        signal: AbortSignal.timeout(12000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radius: viatorRadius, startDate: start, endDate: end, cityName, lang: langParam, language: langParam })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Errore API Viator (${res.status})`);
      }
      
      const data = await res.json();
      const parsedData = Array.isArray(data) ? data : [];
      
      const mappedEvents: EventData[] = parsedData.map((v: any, i: number) => ({
        id: `viator-${i}-${lat}-${lon}`,
        name: v.name,
        description: v.description,
        // Esperienza prenotabile su più date: niente data finta.
        date: '',
        bookable: true,
        venueName: v.duration ? `⏱ ${v.duration}` : "Viator",
        url: ensureViatorAffiliateUrl(v.url),
        imageUrl: v.imageUrl || "",
        source: "viator" as EventSource,
        macroCategory: "🎟️ Tour & Esperienze",
        // Le esperienze Viator sono di area, non hanno un punto esatto: le
        // ancoriamo al centro dell'area cercata. Prima un Math.random le
        // spargeva a caso, inventando pin e distanze false.
        lat,
        lon
      }));
      
      setSourceResults(prev => ({ ...prev, viator: mappedEvents }));
    } catch (err: any) {
      console.error("loadViator Error:", err);
      setSourceErrors(prev => ({ ...prev, viator: getTranslation("events_err_viator", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, viator: false }));
    }
  };

  // ── Alert su eventi salvati (ondata 6) ─────────────────────────────────
  // Gli eventi Ticketmaster salvati nei preferiti finiscono anche in una
  // watchlist locale: al ritorno nella tab (max ogni 6 ore) si ricontrollano
  // prezzo minimo e stato vendita, e le variazioni compaiono in un banner.
  const [eventAlerts, setEventAlerts] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const raw = JSON.parse(localStorage.getItem('wip_watched_events') || '[]');
        if (!Array.isArray(raw) || raw.length === 0) return;
        const lastCheck = Number(localStorage.getItem('wip_watched_events_checked_at') || 0);
        if (Date.now() - lastCheck < 6 * 3600_000) return;
        localStorage.setItem('wip_watched_events_checked_at', String(Date.now()));

        // Pulizia: eventi osservati da più di 6 mesi escono da soli
        const watched = raw.filter((w: any) => Date.now() - (w.savedAt || 0) < 180 * 86400_000).slice(0, 10);
        const alerts: string[] = [];
        for (const w of watched) {
          try {
            const r = await fetch(getApiUrl(`/api/ticketmaster?id=${encodeURIComponent(w.id)}`));
            if (!r.ok) continue;
            const ev = await r.json();
            const status = ev?.dates?.status?.code || null;
            const price = ev?.priceRanges?.[0]?.min ?? null;
            if (w.status && status && status !== w.status) {
              alerts.push(status === 'offsale' || status === 'cancelled'
                ? `⚠️ "${w.name}": vendite ${status === 'cancelled' ? 'ANNULLATE' : 'chiuse'} — se ti interessa muoviti sul mercato secondario.`
                : `ℹ️ "${w.name}": stato biglietti cambiato (${w.status} → ${status}).`);
            }
            if (w.price != null && price != null && price !== w.price) {
              alerts.push(price > w.price
                ? `📈 "${w.name}": il prezzo minimo è salito da ${w.price}€ a ${price}€.`
                : `📉 "${w.name}": il prezzo minimo è sceso da ${w.price}€ a ${price}€!`);
            }
            w.status = status ?? w.status;
            w.price = price ?? w.price;
          } catch { /* un evento irraggiungibile non blocca gli altri */ }
        }
        localStorage.setItem('wip_watched_events', JSON.stringify(watched));
        if (alerts.length) setEventAlerts(alerts);
      } catch { /* watchlist corrotta: silenzio */ }
    })();
  }, []);

  const saveEventAsPoi = async (event: EventData) => {
    if (!currentUserId) return notify(getTranslation("events_save_login", language));

    try {
      // Percorso unico dei preferiti (lib/favorites): prima l'insert diretto
      // su Supabase non aggiornava il mirror locale né emetteva
      // FAVORITES_EVENT, quindi Scoperte/Preferiti non vedevano l'evento
      // salvato finché non si ricaricava tutto.
      if (getLocalFavorites().some((f: any) => String(f.poi_id || f.id) === String(event.id))) {
        notify(getTranslation("events_save_already", language));
        return;
      }
      // Coordinate vere solo se la fonte le ha date: altrimenti si salva il
      // centro di ricerca marcato approxCoords, così nessuno lo scambia per
      // la posizione dell'evento.
      const coordReali = Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lon)) && Number(event.lat) !== 0 && !event.approxCoords;
      const poiData = {
        id: event.id,
        name: event.name,
        // Categoria canonica dei preferiti: «eventi» (il tipo resta in subcategory).
        category: "eventi",
        subcategory: event.macroCategory || undefined,
        lat: coordReali ? Number(event.lat) : (searchCenter?.[0] || mapCenter?.[0] || 0),
        lon: coordReali ? Number(event.lon) : (searchCenter?.[1] || mapCenter?.[1] || 0),
        approxCoords: !coordReali,
        description_short: event.description,
        is_gem: false,
        source: event.source,
        url: event.url,
        imageUrl: event.imageUrl
      };
      await toggleFavoritePoi(poiData);
      // Watchlist per gli alert (solo Ticketmaster: ha id ricontrollabili)
      if (event.source === 'ticketmaster') {
        try {
          const watched = JSON.parse(localStorage.getItem('wip_watched_events') || '[]');
          if (!watched.some((w: any) => w.id === event.id)) {
            watched.unshift({ id: event.id, name: event.name, price: null, status: null, savedAt: Date.now() });
            localStorage.setItem('wip_watched_events', JSON.stringify(watched.slice(0, 10)));
          }
        } catch { /* watchlist best-effort */ }
        notify(getTranslation("events_save_watch", language));
        return;
      }
      notify(getTranslation("events_save_done", language));
    } catch (e: any) {
      console.error(e);
      notify(getTranslation("events_save_error", language));
    }
  };

  const loadGetYourGuide = async (lat: number, lon: number, searchRadius: number, cityName: string) => {
    logApiCall('getyourguide', 'ricerca_eventi_api');
    setLoadingSources(prev => ({ ...prev, getyourguide: true }));
    setSourceErrors(prev => ({ ...prev, getyourguide: null }));
    
    try {
      const res = await fetch(getApiUrl(`/api/getyourguide`), {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radius: searchRadius, cityName, lang: langParam, language: langParam })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Errore GetYourGuide");
      }

      const data = await res.json();
      
      if (data && Array.isArray(data) && data.length > 0) {
        const newEvents: EventData[] = data.map((e: any) => {
          // Iniezione partner_id centralizzata (niente più logica inline duplicata)
          const finalUrl = ensureGygAffiliateUrl(e.url);

          return {
            id: `gyg-${e.id}`,
            name: e.name,
            description: e.description || "Esperienza GetYourGuide.",
            // Attività prenotabile su più date: niente data finta.
            date: '',
            bookable: true,
            venueName: e.duration || "GetYourGuide",
            url: finalUrl,
            imageUrl: e.imageUrl || "",
            source: "getyourguide" as EventSource,
            // Coordinata reale se disponibile, altrimenti il centro area:
            // niente più posizioni random che falsificavano le distanze.
            lat: e.lat || lat,
            lon: e.lon || lon,
            macroCategory: "🌍 Tour & Attività"
          };
        });
        
        setSourceResults(prev => {
          const combined = [...prev.getyourguide, ...newEvents];
          const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
          return { ...prev, getyourguide: unique };
        });
      } else {
        console.log('[GYG] Nessun risultato per questa zona.');
      }
    } catch (err: any) {
      console.error("loadGetYourGuide error:", err);
      setSourceErrors(prev => ({ ...prev, getyourguide: getTranslation("events_err_gyg", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, getyourguide: false }));
    }
  };

  // ── Mostre: la vista gemella degli eventi ──────────────────────────────
  // /api/mostre legge i siti dei musei di shared_pois nel raggio (+ Wikidata)
  // e ne estrae le mostre temporanee con l'AI; il server le tiene in cache
  // 12 ore e un cron le rinfresca ogni 4. Si caricano SOLO con la vista
  // Mostre aperta: la prima lettura di una zona nuova puo' durare un minuto.
  const loadMostre = async (lat: number, lon: number, searchRadius: number) => {
    const key = `${lat.toFixed(2)}_${lon.toFixed(2)}_${searchRadius}_${language}`;
    if (mostreKeyRef.current === key) return;
    mostreKeyRef.current = key;
    logApiCall('mostre', 'mostre_musei_wikidata');
    setLoadingSources(prev => ({ ...prev, mostre: true }));
    setSourceErrors(prev => ({ ...prev, mostre: null }));
    try {
      const r = await fetch(
        getApiUrl(`/api/mostre?lat=${lat}&lon=${lon}&radius_km=${searchRadius}&language=${String(language || 'IT').toLowerCase()}`),
        { signal: AbortSignal.timeout(120000) }
      );
      if (!r.ok) throw new Error(`Errore mostre (${r.status})`);
      const data = await r.json();
      const oggi = isoOggiLocale();
      const mapped: EventData[] = (data?.mostre || []).map((m: any) => {
        const titolo = String(m.titolo || '').trim();
        const artista = String(m.artista || '').trim();
        const prezzo = String(m.prezzo || '').trim();
        return {
          id: String(m.id),
          name: artista && !titolo.toLowerCase().includes(artista.toLowerCase()) ? `${titolo} — ${artista}` : titolo,
          description: [m.sottotitolo, m.descrizione, prezzo ? `💶 ${prezzo}` : ''].filter(Boolean).join(' · '),
          // Senza data di apertura e' in corso: si parte da oggi.
          date: m.dal || oggi,
          endDate: m.al || '',
          venueName: m.luogo || '',
          venueAddress: [m.indirizzo, m.citta].filter(Boolean).join(', ') || undefined,
          url: m.sito || '',
          imageUrl: m.immagine || '',
          source: 'mostre' as EventSource,
          macroCategory: m.fonte === 'wikidata' ? '🖼️ Mostra · Wikidata' : '🖼️ Mostra',
          lat: Number(m.lat) || undefined,
          lon: Number(m.lon) || undefined,
          approxCoords: false,
          isFree: /gratuit|gratis|\bfree\b|libero|libre|kostenlos/i.test(prezzo) ? true : undefined,
        };
      });
      setSourceResults(prev => ({ ...prev, mostre: mapped }));
    } catch (err) {
      console.error('loadMostre Error:', err);
      mostreKeyRef.current = '';   // cosi' «riprova» rilegge davvero
      setSourceErrors(prev => ({ ...prev, mostre: getTranslation("events_err_mostre", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, mostre: false }));
    }
  };

  // ── Collezioni permanenti: i musei della zona ──────────────────────────
  // /api/mostre/permanenti legge shared_pois ad anelli dal piu' vicino, senza
  // AI: istantaneo. La collezione permanente e' il museo stesso, quindi la
  // card porta alla scheda POI sulla mappa (audioguida, Pass Museo).
  const loadPermanenti = async (lat: number, lon: number, searchRadius: number) => {
    const key = `${lat.toFixed(2)}_${lon.toFixed(2)}_${searchRadius}`;
    if (permanentiKeyRef.current === key) return;
    permanentiKeyRef.current = key;
    setLoadingSources(prev => ({ ...prev, permanenti: true }));
    setSourceErrors(prev => ({ ...prev, permanenti: null }));
    try {
      const r = await fetch(
        getApiUrl(`/api/mostre/permanenti?lat=${lat}&lon=${lon}&radius_km=${searchRadius}`),
        { signal: AbortSignal.timeout(30000) }
      );
      if (!r.ok) throw new Error(`Errore collezioni permanenti (${r.status})`);
      const data = await r.json();
      const oggi = isoOggiLocale();
      const mapped: EventData[] = (data?.musei || []).map((m: any) => ({
        id: `perm-${m.id}`,
        name: String(m.nome || ''),
        description: String(m.descrizione || ''),
        date: oggi,          // sempre "in corso": il filtro date la lascia passare
        endDate: '',
        permanent: true,
        venueName: [m.indirizzo, m.citta].filter(Boolean).join(', ') || String(m.nome || ''),
        url: m.sito || '',
        imageUrl: m.immagine || '',
        phone: m.telefono || undefined,
        source: 'permanenti' as EventSource,
        macroCategory: '🏛️ Museo',
        lat: Number(m.lat) || undefined,
        lon: Number(m.lon) || undefined,
        approxCoords: false,
        isFree: undefined,
      }));
      setSourceResults(prev => ({ ...prev, permanenti: mapped }));
    } catch (err) {
      console.error('loadPermanenti Error:', err);
      permanentiKeyRef.current = '';
      setSourceErrors(prev => ({ ...prev, permanenti: getTranslation("events_err_permanenti", language) }));
    } finally {
      setLoadingSources(prev => ({ ...prev, permanenti: false }));
    }
  };

  // ── Stagionali: i verticali tematici che hanno una finestra ────────────
  // /api/tematici/eventi incrocia i cataloghi (cieli, mercati, fioriture)
  // con la data di oggi e il meteo: cosa si vede STANOTTE, quali mercatini
  // sono aperti ora, quali fioriture sono in corso o in arrivo.
  // La rotta e' facoltativa: 404/500/timeout = stato vuoto, mai un errore.
  const loadStagionali = async (lat: number, lon: number, searchRadius: number) => {
    const key = `${lat.toFixed(2)}_${lon.toFixed(2)}_${searchRadius}_${language}`;
    if (stagionaliKeyRef.current === key) return;
    stagionaliKeyRef.current = key;
    setStagionaliLoading(true);
    try {
      const r = await fetch(
        getApiUrl(`/api/tematici/eventi?lat=${lat}&lon=${lon}&radius_km=${searchRadius}&language=${String(language || 'IT').toLowerCase()}`),
        { signal: AbortSignal.timeout(30000) }
      );
      if (!r.ok) throw new Error(`stagionali ${r.status}`);
      const data = await r.json();
      setStagionali(data && typeof data === 'object' ? data : null);
    } catch (err) {
      // Nessun rosso in pagina: la vista dice semplicemente che non c'e' nulla.
      console.warn('loadStagionali non disponibile:', err);
      stagionaliKeyRef.current = '';   // cosi' un cambio di raggio riprova
      setStagionali(null);
    } finally {
      setStagionaliLoading(false);
    }
  };

  // Mostre, permanenti e stagionali seguono centro e raggio come le altre
  // fonti, ma solo quando la loro lista e' aperta (le date si filtrano
  // lato client).
  useEffect(() => {
    if (view === 'stagionali') {
      const lat = searchCenter?.[0] || 44.0792;
      const lon = searchCenter?.[1] || 10.1;
      loadStagionali(lat, lon, radius);
      return;
    }
    if (view !== 'mostre') return;
    const lat = searchCenter?.[0] || 44.0792;
    const lon = searchCenter?.[1] || 10.1;
    if (subView === 'in_corso') loadMostre(lat, lon, radius);
    else loadPermanenti(lat, lon, radius);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, subView, searchCenter?.[0], searchCenter?.[1], radius, language]);

  /** A quale lista appartiene una fonte: eventi, mostre in corso o permanenti. */
  const vistaDi = (s: EventSource): string =>
    s === 'mostre' ? 'mostre:in_corso' : s === 'permanenti' ? 'mostre:permanenti' : 'eventi';
  // In «Stagionali» nessuna fonte eventi e' pertinente: badge, errori e
  // lista degli eventi restano fuori (vistaDi non torna mai 'stagionali').
  const vistaAttiva = view === 'mostre' ? `mostre:${subView}` : view;

  /** getTranslation con ripiego italiano: le chiavi tem_* arrivano da un'altra sessione. */
  const tt = (chiave: string, ripiego: string): string => {
    const v = getTranslation(chiave, language);
    return !v || v === chiave ? ripiego : v;
  };

  /** Apre un luogo tematico sulla mappa (scheda POI con audioguida). */
  const apriLuogoSullaMappa = (l: any, categoria: string) => {
    const lat = Number(l?.lat); const lon = Number(l?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat, lon, zoom: 14 } }));
    window.dispatchEvent(new CustomEvent('focus-poi', {
      detail: { id: String(l.id || l.name || ''), name: String(l.name || l.nome || ''), lat, lon, category: categoria },
    }));
    onClose?.();
  };

  /** Le liste del server arrivano come array o come oggetto con una lista dentro. */
  const comeLista = (v: any, ...chiavi: string[]): any[] => {
    if (Array.isArray(v)) return v;
    for (const k of chiavi) if (Array.isArray(v?.[k])) return v[k];
    return [];
  };

  /** Distanza mostrata sulle card stagionali: quella del server o calcolata. */
  const kmDa = (l: any): string => {
    const d = Number(l?.distanza_km ?? l?.distance_km);
    if (Number.isFinite(d)) return `${d < 10 ? d.toFixed(1) : Math.round(d)} km`;
    const rif = deviceCoords || searchCenter;
    if (!rif || !Number.isFinite(Number(l?.lat)) || !Number.isFinite(Number(l?.lon))) return '';
    const km = haversineMeters(rif[0], rif[1], Number(l.lat), Number(l.lon)) / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  };

  /** Card di un luogo stagionale: stesso peso visivo delle card evento, formato compatto. */
  const cardTematica = (l: any, categoria: string, emoji: string, extra?: string) => {
    const nome = String(l?.name || l?.nome || '');
    const dove = [l?.city || l?.citta, l?.country || l?.paese].filter(Boolean).join(', ');
    const km = kmDa(l);
    const testo = String(l?.highlights || l?.descrizione || l?.description || '');
    return (
      <button
        key={`${categoria}-${l?.id || nome}`}
        onClick={() => apriLuogoSullaMappa(l, categoria)}
        className="w-full text-left bg-surface rounded-2xl border border-outline-variant px-4 py-3 hover:border-primary/40 transition-colors flex items-start gap-3"
      >
        <span className="text-xl shrink-0 leading-none mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-on-surface leading-tight">{nome}</div>
          <div className="text-[11px] font-bold text-on-surface-variant mt-0.5">
            {[dove, km].filter(Boolean).join(' · ')}
          </div>
          {testo && <p className="text-[11px] text-on-surface-variant mt-1 leading-snug line-clamp-2">{testo}</p>}
          {(extra || l?.best_time) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {extra && <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{extra}</span>}
              {l?.best_time && <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">🗓 {String(l.best_time)}</span>}
            </div>
          )}
        </div>
        <MapPin className="w-4 h-4 text-on-surface-variant shrink-0 mt-1" />
      </button>
    );
  };

  /** La vista «Stagionali»: tre blocchi, nell'ordine in cui scadono. */
  const renderStagionali = () => {
    const st = stagionali?.stelle;
    const luoghiStelle = comeLista(st, 'luoghi', 'places', 'spots', 'lista');
    const meteo = st?.meteo || {};
    const luna = st?.luna || st?.moon || null;
    const sciami = comeLista(st?.sciami ?? st?.meteor_showers, 'sciami', 'lista', 'list');
    const mercatini = comeLista(stagionali?.mercatini, 'lista', 'aperti', 'items');
    const fior = stagionali?.fioriture;
    const fiorInCorso = comeLista(fior?.in_corso ?? (Array.isArray(fior) ? fior : null), 'lista');
    const fiorInArrivo = comeLista(fior?.in_arrivo, 'lista');
    const nulla = !luoghiStelle.length && !mercatini.length && !fiorInCorso.length && !fiorInArrivo.length;

    if (stagionaliLoading && nulla) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-primary">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p className="font-semibold text-on-surface-variant">{getTranslation("events_loading", language)}</p>
        </div>
      );
    }
    if (nulla) {
      return (
        <div className="p-12 text-center flex flex-col items-center opacity-60">
          <div className="text-4xl mb-4">🌸</div>
          <p className="font-bold text-on-surface">{tt("tem_no_data", "Nessun dato per questa zona")}</p>
          <p className="text-sm text-on-surface-variant mt-1">
            Cieli bui, mercatini e fioriture cambiano con la stagione: allarga il raggio o riprova più avanti.
          </p>
        </div>
      );
    }

    const nuvole = Number(meteo?.nuvoleNotte ?? meteo?.nuvole);
    return (
      <div className="flex flex-col gap-5">
        {/* 🌌 Stanotte sotto le stelle: cielo, luna e sciami valgono per
            TUTTA la zona, quindi stanno in testa una volta sola. */}
        {(luoghiStelle.length > 0 || luna || sciami.length > 0) && (
          <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-3xl p-4 border border-indigo-800/40">
            <h2 className="text-white font-black text-sm uppercase tracking-wider mb-3">
              🌌 {tt("tem_stelle_tonight", "Stanotte sotto le stelle")}
            </h2>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Number.isFinite(nuvole) && (
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-white/10 text-indigo-200">
                  ☁️ {tt("tem_stelle_clouds", "Nuvolosità prevista")}: {Math.round(nuvole)}%
                </span>
              )}
              {luna && (
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-white/10 text-indigo-200">
                  🌙 {tt("tem_stelle_moon", "Luna")}: {String(luna.nome || luna.fase || luna.name || '')}
                  {Number.isFinite(Number(luna.illuminazione ?? luna.illumination))
                    ? ` · ${Math.round(Number(luna.illuminazione ?? luna.illumination))}%`
                    : ''}
                </span>
              )}
              {sciami.map((s: any, i: number) => (
                <span key={i} className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-400/20 text-amber-200">
                  ☄️ {tt("tem_stelle_meteor", "Sciame meteorico")}: {String(s?.nome || s?.name || s)}
                  {s?.picco || s?.peak ? ` · ${String(s.picco || s.peak)}` : ''}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {luoghiStelle.map((l: any) => {
                const bortle = Number(l?.bortle ?? l?.extra?.bortle);
                const desig = l?.designation || l?.extra?.designation;
                return (
                  <button
                    key={`stelle-${l?.id || l?.name}`}
                    onClick={() => apriLuogoSullaMappa(l, 'cieli')}
                    className="w-full text-left flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-2xl px-3 py-2.5 transition-colors"
                  >
                    <span className="text-lg shrink-0">🔭</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{String(l?.name || l?.nome || '')}</div>
                      <div className="text-indigo-300 text-[10px] font-medium truncate">
                        {[
                          Number.isFinite(bortle) ? `${tt("tem_bortle", "Cielo (scala Bortle)")} ${bortle}` : '',
                          desig ? String(desig) : '',
                          kmDa(l),
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <MapPin className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 🛍️ Mercatini aperti ora */}
        {mercatini.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-on-surface font-black text-sm uppercase tracking-wider">
              🛍️ {tt("tem_mercatini_open", "Mercatini aperti ora")}
            </h2>
            {mercatini.map((m: any) => cardTematica(
              m, 'mercati', '🛍️',
              m?.schedule || m?.extra?.schedule ? `🕒 ${String(m.schedule || m.extra.schedule)}` : undefined,
            ))}
          </div>
        )}

        {/* 🌸 Fioriture: prima quelle in corso, poi quelle che stanno per aprire */}
        {fiorInCorso.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-on-surface font-black text-sm uppercase tracking-wider">
              🌸 {tt("tem_fioriture_now", "Fioriture in corso")}
            </h2>
            {fiorInCorso.map((f: any) => cardTematica(
              f, 'fioriture', '🌸',
              f?.species || f?.extra?.species ? `🌱 ${String(f.species || f.extra.species)}` : undefined,
            ))}
          </div>
        )}
        {fiorInArrivo.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-on-surface-variant font-black text-sm uppercase tracking-wider">
              ⏳ {tt("tem_fioriture_soon", "In arrivo")}
            </h2>
            {fiorInArrivo.map((f: any) => cardTematica(
              f, 'fioriture', '🌱',
              f?.peak || f?.extra?.peak ? `🌸 ${String(f.peak || f.extra.peak)}` : undefined,
            ))}
          </div>
        )}
      </div>
    );
  };

  /** Apre il museo sulla mappa (scheda POI con audioguida): eventi gia' usati da Camera/Vision. */
  const apriMuseoSullaMappa = (event: EventData) => {
    if (!event.lat || !event.lon) return openNavigation(event);
    window.dispatchEvent(new CustomEvent('wip-open-map-area'));
    window.dispatchEvent(new CustomEvent('focus-poi', {
      detail: { id: event.id.replace(/^perm-/, ''), name: event.name, lat: event.lat, lon: event.lon, category: 'musei' },
    }));
    onClose?.();
  };

  // ── Rilevamento «gratis» ───────────────────────────────────────────────
  // Flag dalla source (mercati locali, priceRanges min 0) oppure testo
  // esplicito; le frasi "cancellazione gratuita"/"free cancellation" dei
  // tour NON contano come ingresso gratuito.
  const isEventFree = (e: EventData): boolean => {
    if (e.isFree) return true;
    const txt = `${e.name} ${e.description}`.toLowerCase()
      .replace(/cancellazione gratuita|annullamento gratuito|free cancellation/g, '');
    return /ingresso (libero|gratuito)|entrata (libera|gratuita)|evento gratuito|\bgratis\b|\bgratuito\b|free (entry|admission|event)/.test(txt);
  };

  // ── Link affiliati via /api/out (tracking click server-side) ───────────
  // Solo per le fonti partner e solo se l'host è nella whitelist del server:
  // così un URL fuori whitelist resta un link diretto e non finisce in 400.
  const AFFIL_OUT_HOST_RE = /(^|\.)((ticketmaster|livenation|getyourguide|gyg)\.[a-z]{2,3}(\.[a-z]{2})?|viator\.com|tiqets\.com|eventiesagre\.it|openstreetmap\.org)$/i;
  const outUrl = (ev: EventData): string => {
    const finalUrl = ensureAffiliateUrl(ev.url);
    try {
      const host = new URL(finalUrl).hostname;
      if (["ticketmaster", "viator", "getyourguide", "tiqets", "local"].includes(ev.source) && AFFIL_OUT_HOST_RE.test(host)) {
        return getApiUrl(`/api/out?u=${encodeURIComponent(finalUrl)}&src=${ev.source}`);
      }
    } catch { /* URL malformato: link diretto */ }
    return finalUrl;
  };

  // ── «Serata perfetta» in un tap ────────────────────────────────────────
  const requestEveningPlan = async () => {
    const ref = deviceCoords || searchCenter;
    if (!ref) return notify(getTranslation("events_evening_no_position", language));
    if (eveningPlan) { setShowEveningModal(true); return; }
    setEveningLoading(true);
    try {
      const r = await fetch(getApiUrl("/api/evening-plan"), {
        method: "POST",
        signal: AbortSignal.timeout(45000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: ref[0], lon: ref[1], lang: langParam, language: langParam }),
      });
      const data = await r.json().catch(() => null);
      // 503 serata_non_componibile: il server non ha locali REALI in zona e
      // non inventa nulla. Messaggio chiaro, non un errore generico.
      if (r.status === 503 && data?.error === 'serata_non_componibile') {
        notify(getTranslation("events_evening_not_composable", language));
        return;
      }
      if (!r.ok || !Array.isArray(data?.tappe) || data.tappe.length === 0) {
        throw new Error(data?.error || "Proposta non disponibile");
      }
      setEveningPlan(data);
      setShowEveningModal(true);
    } catch (e: any) {
      console.error("evening-plan error:", e);
      notify(getTranslation(e?.name === 'TimeoutError' ? "events_evening_timeout" : "events_evening_unavailable", language));
    } finally {
      setEveningLoading(false);
    }
  };

  // Solo eventi REALI dalle cinque sorgenti: niente più mock di riempimento.
  // Se non c'è nulla si mostra lo stato "nessun evento trovato".
  const displayEvents = [
    ...sourceResults.virgilio,
    ...sourceResults.ticketmaster,
    ...sourceResults.getyourguide,
    ...sourceResults.viator,
    ...sourceResults.tiqets,
    ...sourceResults.local,
    ...sourceResults.mostre,
    ...sourceResults.permanenti,
  ];

  const oggiLocale = isoOggiLocale();

  const filteredEvents = displayEvents.filter((e) => {
    // Eventi, mostre in corso o permanenti: una lista alla volta, mai insieme.
    if (vistaDi(e.source) !== vistaAttiva) return false;
    // Senza data (prenotabile, fiera annuale, annuncio Virgilio senza <time>)
    // la card passa e mostra «Data non confermata»: non si inventa una data.
    const dateObj = new Date(e.date || 'x');
    // Una collezione permanente non ha date: il periodo scelto non la tocca.
    if (!isNaN(dateObj.getTime()) && !e.permanent) {
      const dStart = new Date(startDate);
      dStart.setHours(0, 0, 0, 0);
      const dEnd = new Date(endDate);
      dEnd.setHours(23, 59, 59, 999);
      let inDateRange: boolean;
      if (e.source === 'mostre') {
        // Una mostra e' un periodo: basta che si sovrapponga alle date scelte.
        // Senza data di chiusura si considera aperta.
        const endObj = e.endDate ? new Date(`${e.endDate}T23:59:59`) : null;
        inDateRange = dateObj <= dEnd && (!endObj || isNaN(endObj.getTime()) || endObj >= dStart);
      } else {
        inDateRange = dateObj >= dStart && dateObj <= dEnd;
      }
      // Virgilio ha una data vera quando il parsing dell'annuncio riesce: in
      // quel caso il periodo scelto vale anche per lui. Restano esenti le
      // card prenotabili su più date (Tiqets/Viator/GYG).
      if (!inDateRange && !e.bookable) return false;
    }

    // Filtro «Solo gratis»
    if (onlyFree && !isEventFree(e)) return false;
    // Filtro per tipo (solo nella vista Eventi)
    if (view === 'eventi' && tipoFiltro !== 'tutti' && tipoDi(e) !== tipoFiltro) return false;

    // Distanza dal CENTRO DI RICERCA (mappa visualizzata o viaggio attivo)
    if (e.lat && e.lon && searchCenter) {
      const distInKm = haversineMeters(searchCenter[0], searchCenter[1], e.lat, e.lon) / 1000;
      // Viator ha il suo tetto: le esperienze oltre i 50 km non riguardano
      // il luogo che l'utente sta guardando.
      // Le sagre hanno coordinate approssimate (capoluogo di provincia):
      // il raggio si allarga per non perdere la sagra del paese accanto.
      const maxKm = e.source === "viator" ? Math.min(radius, VIATOR_MAX_RADIUS_KM)
        : e.approxCoords ? radius + 70
        : radius;
      if (distInKm > maxKm) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if ((a.source === 'mostre' || a.source === 'permanenti') && a.source === b.source) {
      const dist = (e: EventData) => (searchCenter && e.lat && e.lon)
        ? haversineMeters(searchCenter[0], searchCenter[1], e.lat, e.lon) : Infinity;
      // Le permanenti non hanno date: conta solo la vicinanza.
      if (sortBy === 'relevance' || a.source === 'permanenti') return dist(a) - dist(b);
      // Per data: prima quelle in corso (chiude prima = piu' urgente), poi le
      // prossime per giorno di apertura; a parita', la piu' vicina.
      const inCorsoA = a.date <= oggiLocale, inCorsoB = b.date <= oggiLocale;
      if (inCorsoA !== inCorsoB) return inCorsoA ? -1 : 1;
      if (inCorsoA) {
        const fa = a.endDate || '9999', fb = b.endDate || '9999';
        if (fa !== fb) return fa < fb ? -1 : 1;
      } else if (a.date !== b.date) {
        return a.date < b.date ? -1 : 1;
      }
      return dist(a) - dist(b);
    }
    if (sortBy === 'relevance') {
      const getScore = (e: EventData) => {
        let score = 0;
        if (e.source === 'ticketmaster') score += 8;
        if (e.isFree) score += 2;
        return score;
      };
      return getScore(b) - getScore(a);
    }
    
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (isNaN(dateA)) return 1;
    if (isNaN(dateB)) return -1;
    
    if (dateA !== dateB) return dateA - dateB;
    
    // Secondary sort: Source priority (Ticketmaster > Virgilio)
    const sourcePriority: Record<string, number> = { ticketmaster: 0, virgilio: 1 };
    return (sourcePriority[a.source] || 0) - (sourcePriority[b.source] || 0);
  });

  // ── «Stasera vicino a te» ──────────────────────────────────────────────
  // Dalle 16 locali: 2-3 eventi di OGGI (dalle fonti già caricate) entro
  // ~10 km dal punto di riferimento (GPS o centro di ricerca), ordinati per
  // distanza. Solo filtro client dei dati già fetchati, nessuna nuova fonte.
  // Solo fonti con una data VERA (Ticketmaster, sagre/mercati): i biglietti
  // e i tour prenotabili non sono «stasera», sono sempre.
  const tonightRef = deviceCoords || searchCenter;
  const tonightEvents = (new Date().getHours() >= 16 && tonightRef)
    ? displayEvents
        .filter(e => ["ticketmaster", "local"].includes(e.source) && !e.bookable)
        .filter(e => e.date === oggiLocale && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)))
        .map(e => ({
          ev: e,
          dist: haversineMeters(tonightRef[0], tonightRef[1], Number(e.lat), Number(e.lon)) / 1000,
        }))
        .filter(x => x.dist <= 10)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
    : [];

  const openNavigation = (event: EventData) => {
    if (event.lat && event.lon) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lon}`,
        "_blank",
      );
    } else if (event.venueAddress) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.venueAddress)}`,
        "_blank",
      );
    } else if (
      event.venueName &&
      event.venueName !== "Località non specificata"
    ) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.venueName)}`,
        "_blank",
      );
    } else {
      notify(getTranslation("events_error_nav", language));
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-surface h-full overflow-hidden relative">
      {/* Alert eventi salvati (ondata 6): variazioni di prezzo o vendite */}
      {eventAlerts.length > 0 && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 space-y-1">
          {eventAlerts.map((a, i) => (
            <p key={i} className="text-[11px] font-bold text-amber-800 leading-snug">{a}</p>
          ))}
          <button onClick={() => setEventAlerts([])} className="text-[10px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-800">
            {getTranslation("events_alert_dismiss", language)}
          </button>
        </div>
      )}
      {/* Header */}
      <div className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 px-6 py-4 flex flex-col relative flex-shrink-0">
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-surface-variant rounded-full transition-colors z-50 text-on-surface-variant hover:text-primary"
          >
            <X className="w-6 h-6" />
          </button>
        )}
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent flex items-center gap-2 pr-10">
          <span>{view === 'stagionali' ? '🌸' : view === 'mostre' ? '🖼️' : '🎪'}</span>{' '}
          {view === 'stagionali'
            ? tt("tem_stagionali", "Stagionali")
            : getTranslation(view === 'mostre' ? "events_view_exhibitions" : "events_title", language)}: {city}
        </h1>
        <p className="text-sm text-on-surface-variant font-medium mt-1">
          {view === 'stagionali'
            ? 'Cieli, mercatini e fioriture: quello che c\'è adesso e fra un mese non c\'è più.'
            : view === 'mostre'
              ? getTranslation("events_exhibitions_subtitle", language)
              : getTranslation("events_subtitle", language)}
        </p>
        {/* Eventi | Mostre | Stagionali: tre viste separate, stessi filtri */}
        <div className="mt-3 inline-flex self-start bg-surface-variant rounded-full p-1 border border-outline-variant/40">
          {([
            { id: 'eventi', label: `🎪 ${getTranslation("events_title", language)}` },
            { id: 'mostre', label: `🖼️ ${getTranslation("events_view_exhibitions", language)}` },
            { id: 'stagionali', label: `🌸 ${tt("tem_stagionali", "Stagionali")}` },
          ] as { id: 'eventi' | 'mostre' | 'stagionali'; label: string }[]).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
                view === v.id
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view === 'mostre' && (
          <>
            {/* Sotto-interruttore: temporanee in corso | collezioni permanenti */}
            <div className="mt-2 flex items-center gap-2">
              {([
                { id: 'in_corso', label: `🖼️ ${getTranslation("events_exh_current", language)}` },
                { id: 'permanenti', label: `🏛️ ${getTranslation("events_exh_permanent", language)}` },
              ] as { id: 'in_corso' | 'permanenti'; label: string }[]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubView(s.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-all border ${
                    subView === s.id
                      ? 'bg-secondary border-secondary text-white shadow-md'
                      : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:bg-secondary/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {subView === 'in_corso' && (
              <p className="text-[11px] text-on-surface-variant mt-2 leading-snug">
                {getTranslation("events_exhibitions_note", language)}
              </p>
            )}
          </>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-4">
        {/* Viaggio attivo: chip destinazione + toggle posizione attuale */}
        {activeTrip && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setUseTripCenter(true)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                useTripCenter
                  ? 'bg-primary border-primary text-white shadow-md'
                  : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:bg-primary/10'
              }`}
            >
              📍 {getTranslation("events_trip_active", language).replace('{city}', activeTrip.city)}
            </button>
            <button
              onClick={() => setUseTripCenter(false)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                !useTripCenter
                  ? 'bg-primary border-primary text-white shadow-md'
                  : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:bg-primary/10'
              }`}
            >
              🧭 {getTranslation("events_current_position", language)}
            </button>
          </div>
        )}

        {/* Serata perfetta in un tap (solo nella vista Eventi) */}
        {view === 'eventi' && (
        <button
          onClick={requestEveningPlan}
          disabled={eveningLoading}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md disabled:opacity-60"
        >
          {eveningLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> {getTranslation("events_evening_preparing", language)}
            </>
          ) : (
            <>🍸 {getTranslation("events_evening_cta", language)}</>
          )}
        </button>
        )}

        {/* 🌙 Stasera vicino a te (dalle 16, eventi di oggi entro ~10 km) */}
        {view === 'eventi' && tonightEvents.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-3xl p-4 border border-indigo-800/40">
            <h2 className="text-white font-black text-sm uppercase tracking-wider mb-3">🌙 {getTranslation("events_tonight_title", language)}</h2>
            <div className="flex flex-col gap-2">
              {tonightEvents.map(({ ev, dist }) => (
                <a
                  key={`tonight-${ev.id}`}
                  href={ev.url && ev.url !== '#' ? outUrl(ev) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => ev.url && trackAffiliateClick(ev.url, ev.name, city, 'events_tonight')}
                  className="flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-2xl px-3 py-2.5 transition-colors"
                >
                  {ev.imageUrl ? (
                    <img src={ev.imageUrl} alt="" loading="lazy" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg shrink-0">{emojiCategoria(ev)}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-bold truncate">{ev.name}</div>
                    <div className="text-indigo-300 text-[10px] font-medium">
                      {ev.time ? `${getTranslation("events_tonight_at", language)} ${ev.time} · ` : ''}{dist.toFixed(1)} km · {ev.source}
                    </div>
                  </div>
                  {isEventFree(ev) && <span className="text-base shrink-0" title={getTranslation("events_free_badge", language)}>🆓</span>}
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Source Status Badges */}
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.entries(loadingSources).map(([source, isLoading]) => (
            isLoading && vistaDi(source as EventSource) === vistaAttiva && (
              <div key={source} className="flex items-center gap-1.5 px-3 py-1 bg-primary/5 text-primary rounded-full text-[10px] font-bold border border-primary/10">
                <Loader2 className="w-3 h-3 animate-spin" />
                {getTranslation("events_loading_source", language)} {source.toUpperCase()}
              </div>
            )
          ))}
          <AnimatePresence>
            {Object.entries(sourceErrors).map(([source, err]) => {
              // Mostra errore solo se non ci sono risultati (nemmeno fallback) per quella source
              const hasResults = (sourceResults as any)[source]?.length > 0;
              if (!err || hasResults) return null;
              if (vistaDi(source as EventSource) !== vistaAttiva) return null;
              const sourceLabel = source === 'ticketmaster' ? 'Ticketmaster' : source === 'getyourguide' ? 'GetYourGuide' : source === 'viator' ? 'Viator' : source === 'tiqets' ? 'Tiqets' : source === 'local' ? getTranslation("events_source_local_label", language) : source === 'mostre' ? getTranslation("events_view_exhibitions", language) : source === 'permanenti' ? getTranslation("events_exh_permanent", language) : source;
              return (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={source} 
                  className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-200"
                >
                  <AlertCircle className="w-3 h-3" />
                  {sourceLabel} {getTranslation("events_source_unavailable", language)}
                  <button 
                    onClick={() => retrySource(source as EventSource)}
                    className="ml-1 p-0.5 hover:bg-amber-100 rounded-full transition-colors"
                  >
                    <RefreshCcw className="w-3 h-3" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* «Stagionali» ha un contenuto suo: niente lista eventi, niente
            filtro date (una fioritura non si prenota per il mese scorso). */}
        {view === 'stagionali' ? (
          renderStagionali()
        ) : loading && filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-primary">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="font-semibold text-on-surface-variant">
              {getTranslation("events_loading", language)}
            </p>
          </div>
        ) : error ? (
          <div className="p-6 bg-error/10 text-error rounded-3xl font-bold text-center border border-error/20">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
            {error}
            <button 
              onClick={() => fetchEvents()}
              className="mt-4 block w-full bg-error text-white py-3 rounded-2xl text-sm"
            >
              {getTranslation("events_retry", language)}
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center opacity-60">
            <div className="text-4xl mb-4">{vistaAttiva === 'mostre:permanenti' ? '🏛️' : view === 'mostre' ? '🖼️' : '📍'}</div>
            <p className="font-bold text-on-surface">
              {getTranslation(vistaAttiva === 'mostre:permanenti' ? "events_permanent_none" : view === 'mostre' ? "events_exhibitions_none" : "events_not_found", language)}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              {getTranslation(vistaAttiva === 'mostre:permanenti' ? "events_permanent_none_desc" : view === 'mostre' ? "events_exhibitions_none_desc" : "events_not_found_desc", language)}
            </p>
            {Object.values(sourceErrors).some(e => e !== null) && (
              <p className="text-xs text-error mt-4 font-bold uppercase tracking-wider">
                {getTranslation("events_source_errors", language)}
              </p>
            )}
          </div>
        ) : (<>
          {filteredEvents.slice(0, visibili).map((event, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              // Tetto allo scalino: la ventesima card non può aspettare un secondo.
              transition={{ delay: Math.min(idx, 10) * 0.05 }}
              key={event.id}
              className="bg-surface rounded-3xl overflow-hidden shadow-sm border border-outline-variant flex flex-col sm:flex-row flex-shrink-0 min-h-[380px] sm:min-h-[220px]"
            >
              <div className="h-48 sm:h-auto sm:w-48 shrink-0 relative">
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt={event.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // Nessuna foto dalla fonte: blocco colorato con l'emoji della
                  // categoria. Mai una foto stock di un altro posto.
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-6xl select-none" aria-hidden="true">
                    {emojiCategoria(event)}
                  </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1">
                  <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
                    {event.source}
                  </div>
                  {event.macroCategory && (
                    <div className="bg-primary/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
                      {event.macroCategory}
                    </div>
                  )}
                  {isEventFree(event) && (
                    <div className="bg-emerald-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
                      🆓 {getTranslation("events_free_badge", language)}
                    </div>
                  )}
                  {event.source === 'mostre' && event.endDate && giorniA(event.endDate) <= 7 && (
                    <div className="bg-amber-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
                      ⏳ {getTranslation("events_last_days", language)}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <h3 className="text-lg font-bold text-on-surface leading-tight">
                    {event.name}
                  </h3>
                  <button 
                    onClick={() => saveEventAsPoi(event)}
                    className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-colors flex-shrink-0"
                    title={getTranslation("events_save_title", language)}
                  >
                    <Heart className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-primary font-medium text-sm mb-3">
                  <CalendarIcon className="w-4 h-4" />
                  {event.permanent ? (
                    `🏛️ ${getTranslation("events_permanent_label", language)}`
                  ) : event.source === 'mostre' ? (
                    // Periodo, non data: «apre il 3 ott · fino al 10 gen» oppure «fino al 30 set»
                    event.date > oggiLocale
                      ? `${getTranslation("events_opens_on", language)} ${fmtGiorno(event.date, language)}${event.endDate ? ` · ${getTranslation("events_until", language)} ${fmtGiorno(event.endDate, language)}` : ''}`
                      : event.endDate
                        ? `${getTranslation("events_until", language)} ${fmtGiorno(event.endDate, language)}`
                        : `${getTranslation("events_from", language)} ${fmtGiorno(event.date, language)}`
                  ) : (
                    event.date || getTranslation("events_date_unconfirmed", language)
                  )}
                </div>

                <p className="text-sm text-on-surface-variant line-clamp-2 mb-4 leading-relaxed">
                  {event.description}
                </p>

                <div className="flex flex-col gap-2 mt-auto">
                  <div className="flex items-start gap-2 text-sm text-on-surface-variant font-medium">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{event.venueName}</span>
                      {event.venueAddress && event.venueAddress !== event.venueName && (
                        <span className="text-xs opacity-70 mt-0.5 truncate">{event.venueAddress}</span>
                      )}
                    </div>
                  </div>
                  {(deviceCoords || searchCenter) && event.lat && event.lon && (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
                      <span className="w-4 h-4 shrink-0 flex items-center justify-center">🚶</span>
                      <span>
                        {deviceCoords ? (
                          <>Ca. {(haversineMeters(deviceCoords[0], deviceCoords[1], event.lat, event.lon) / 1000).toFixed(1)} km {getTranslation("events_km_from_you", language)}</>
                        ) : (
                          <>Ca. {(haversineMeters(searchCenter![0], searchCenter![1], event.lat, event.lon) / 1000).toFixed(1)} km {getTranslation("events_km_from_map", language)}</>
                        )}
                      </span>
                    </div>
                  )}
                  {event.phone && (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
                      <Phone className="w-4 h-4 shrink-0" />
                      <a
                        href={`tel:${event.phone}`}
                        className="hover:text-primary transition-colors"
                      >
                        {event.phone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-outline-variant/20 flex gap-3">
                  <button
                    onClick={() => event.permanent ? apriMuseoSullaMappa(event) : openNavigation(event)}
                    className="flex-1 bg-surface-variant hover:bg-primary/10 text-on-surface font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <MapPin className="w-4 h-4" /> {getTranslation(event.permanent ? "events_open_on_map" : "events_navigate", language)}
                  </button>
                  {event.url && event.url !== "#" ? (
                    <a
                      href={outUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackAffiliateClick(event.url, event.name, city, 'events_screen')}
                      className="flex-1 bg-primary hover:bg-primary/90 text-on-primary font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {/* Brand esplicito del partner: aumenta fiducia e CTR */}
                      {event.source === 'viator' ? getTranslation("events_book_viator", language)
                        : event.source === 'getyourguide' ? getTranslation("events_book_gyg", language)
                        : (event.source === 'mostre' || event.source === 'permanenti') ? getTranslation("events_exhibition_site", language)
                        : getTranslation("events_info_tickets", language)}
                    </a>
                  ) : (
                    <button
                      disabled
                      className="flex-1 bg-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm opacity-70"
                    >
                      <ExternalLink className="w-4 h-4" /> {getTranslation("events_info_unavailable", language)}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {filteredEvents.length > visibili && (
            <button
              onClick={() => setVisibili(v => v + PAGINA_EVENTI)}
              className="w-full bg-surface-variant hover:bg-primary/10 text-on-surface font-bold py-3 rounded-2xl text-sm transition-colors"
            >
              {getTranslation("events_show_more", language)} · {filteredEvents.length - visibili}
            </button>
          )}
        </>)}
      </div>

      {/* Sticky Bottom Functions Bar */}
      <div className="bg-[#1A1D1F]/95 backdrop-blur-xl border-t border-white/10 px-6 py-4 flex flex-col gap-3 flex-shrink-0 shadow-[0_-8px_32px_rgba(0,0,0,0.4)]">
        {/* Date Filters — in «Stagionali» non esistono: contano solo il
            punto e il raggio, la stagione la decide il calendario. */}
        {view !== 'stagionali' && (
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              <CalendarIcon className="w-3 h-3 text-primary" /> {getTranslation("events_from", language)}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-primary transition-colors w-full"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              <CalendarIcon className="w-3 h-3 text-primary" /> {getTranslation("events_to", language)}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-primary transition-colors w-full"
            />
          </div>
        </div>
        )}

        {/* Radius and Sorting Selection (Combined in one row) */}
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-0.5">
          {/* Radius */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest mr-1 shrink-0">{getTranslation("events_distance", language)}</span>
            {[100, 300, 500].map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`px-3 py-1 rounded-full text-[9px] font-black transition-all flex items-center gap-1 whitespace-nowrap border ${
                  radius === r 
                    ? 'bg-primary border-primary text-white shadow-md' 
                    : 'bg-white/5 border-white/10 text-on-surface-variant hover:bg-white/10'
                }`}
              >
                {r} km
              </button>
            ))}
          </div>

          {/* «Solo gratis» e l'ordinamento non hanno presa sulle stagionali:
              lì l'ordine è la distanza e l'ingresso lo dice la card. */}
          {view !== 'stagionali' && (<>
          <div className="w-px h-5 bg-white/10 shrink-0"></div>

          {/* Solo gratis */}
          <button
            onClick={() => setOnlyFree(v => !v)}
            className={`px-3 py-1 rounded-full text-[9px] font-black transition-all flex items-center gap-1 whitespace-nowrap border shrink-0 ${
              onlyFree
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                : 'bg-white/5 border-white/10 text-on-surface-variant hover:bg-white/10'
            }`}
          >
            🆓 {getTranslation("events_only_free", language)}
          </button>

          {/* Filtro per tipo: chip semplici su macroCategory (solo vista Eventi) */}
          {view === 'eventi' && ([
            { id: 'tutti', emoji: '✨', key: 'events_type_all' },
            { id: 'concerti', emoji: '🎵', key: 'events_type_concerts' },
            { id: 'sagre', emoji: '🍷', key: 'events_type_fairs' },
            { id: 'mercati', emoji: '🧺', key: 'events_type_markets' },
            { id: 'tour', emoji: '🎟️', key: 'events_type_tours' },
            { id: 'biglietti', emoji: '🎫', key: 'events_type_tickets' },
          ] as { id: TipoEvento; emoji: string; key: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTipoFiltro(t.id)}
              className={`px-3 py-1 rounded-full text-[9px] font-black transition-all flex items-center gap-1 whitespace-nowrap border shrink-0 ${
                tipoFiltro === t.id
                  ? 'bg-primary border-primary text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-on-surface-variant hover:bg-white/10'
              }`}
            >
              {t.emoji} {getTranslation(t.key, language)}
            </button>
          ))}

          <div className="w-px h-5 bg-white/10 shrink-0"></div>

          {/* Sorting */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest mr-1 shrink-0">{getTranslation("events_sort", language)}</span>
            {[
              { id: 'date', label: getTranslation("events_sort_date", language), emoji: '📅' },
              { id: 'relevance', label: getTranslation("events_sort_relevance", language), emoji: '✨' }
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSortBy(s.id as 'date' | 'relevance')}
                className={`px-3 py-1 rounded-full text-[9px] font-black transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                  sortBy === s.id 
                    ? 'bg-secondary border-secondary text-white shadow-md' 
                    : 'bg-white/5 border-white/10 text-on-surface-variant hover:bg-white/10'
                }`}
              >
                <span>{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
          </>)}
        </div>
      </div>

      {/* Modale «Serata perfetta» */}
      <AnimatePresence>
        {showEveningModal && eveningPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowEveningModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-md max-h-[85%] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-surface/95 backdrop-blur-xl border-b border-outline-variant/20 px-5 py-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-on-surface leading-tight">🍸 {eveningPlan.titolo}</h2>
                  {eveningPlan.budgetStimato && (
                    <p className="text-xs font-bold text-primary mt-1">💶 {getTranslation("events_evening_budget", language)}: {eveningPlan.budgetStimato}</p>
                  )}
                </div>
                <button
                  onClick={() => setShowEveningModal(false)}
                  className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {(eveningPlan.tappe || []).map((t: any, i: number) => {
                  const emoji = t.tipo === 'aperitivo' ? '🥂' : t.tipo === 'cena' ? '🍽️' : t.tipo === 'evento' ? '🎫' : '🚕';
                  const mapsQuery = [t.nome, t.indirizzo].filter(Boolean).join(' ');
                  return (
                    <div key={i} className="bg-surface-variant/40 border border-outline-variant/40 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{emoji}</span>
                        <span className="text-xs font-black text-primary tabular-nums">{t.ora}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">{t.tipo}</span>
                      </div>
                      <div className="text-sm font-bold text-on-surface">{t.nome}</div>
                      {t.indirizzo && <div className="text-xs text-on-surface-variant mt-0.5">{t.indirizzo}</div>}
                      {t.nota && <div className="text-xs text-on-surface-variant mt-1.5 leading-snug italic">{t.nota}</div>}
                      <div className="flex gap-2 mt-2.5">
                        {/* Una tappa «generica» (nessun locale reale dietro) non si
                            apre in mappa: non c'è un posto vero da cercare. */}
                        {t.tipo !== 'rientro' && mapsQuery && !t.generica && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-black text-primary hover:underline"
                          >
                            <MapPin className="w-3 h-3" /> {getTranslation("events_evening_open_map", language)}
                          </a>
                        )}
                        {t.link && (
                          <a
                            href={getApiUrl(`/api/out?u=${encodeURIComponent(t.link)}&src=ticketmaster`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-black text-secondary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" /> {getTranslation("events_evening_tickets", language)}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-on-surface-variant text-center mt-1">
                  {getTranslation("events_evening_disclaimer", language)}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
