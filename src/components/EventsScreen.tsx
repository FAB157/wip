import { useState, useEffect, useCallback, useRef } from "react";
import { getDistanceFromLatLonInM } from "./MapArea";
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

type EventSource = "virgilio" | "ticketmaster" | "getyourguide" | "viator" | "tiqets" | "local";

interface EventData {
  id: string;
  name: string;
  description: string;
  date: string;
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
  isFree?: boolean;
  isFamily?: boolean;
  isMusic?: boolean;
  macroCategory?: string;
}

import { Language, getTranslation } from "../lib/i18n";

/** Viator: le esperienze hanno senso solo vicino al punto cercato. */
const VIATOR_MAX_RADIUS_KM = 50;

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
  });
  const [loadingSources, setLoadingSources] = useState<Record<EventSource, boolean>>({
    virgilio: false,
    ticketmaster: false,
    getyourguide: false,
    viator: false,
    tiqets: false,
    local: false,
  });
  const [sourceErrors, setSourceErrors] = useState<Record<EventSource, string | null>>({
    virgilio: null,
    ticketmaster: null,
    getyourguide: null,
    viator: null,
    tiqets: null,
    local: null,
  });

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

  // Date filters
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );

  const prevCenterRef = useRef<[number, number] | undefined>(mapCenter);
  const prevDatesRef = useRef<{ start: string; end: string }>({ start: startDate, end: endDate });

  // Timer del geocoding in background: cancellati all'unmount (cambio tab)
  const geocodeTimersRef = useRef<number[]>([]);
  useEffect(() => () => {
    geocodeTimersRef.current.forEach(clearTimeout);
    geocodeTimersRef.current = [];
  }, []);

  const fetchEvents = useCallback(async () => {
    // Determine if we should clear results (if search center moved significantly or dates changed)
    const centerMoved = prevCenterRef.current && searchCenter && (
      Math.abs(prevCenterRef.current[0] - searchCenter[0]) > 0.1 ||
      Math.abs(prevCenterRef.current[1] - searchCenter[1]) > 0.1
    );
    const datesChanged = prevDatesRef.current.start !== startDate || prevDatesRef.current.end !== endDate;

    if (centerMoved || datesChanged) {
      setSourceResults({
        virgilio: [],
        ticketmaster: [],
        getyourguide: [],
        viator: [],
        tiqets: [],
        local: [],
      });
    }
    
    prevCenterRef.current = searchCenter;
    prevDatesRef.current = { start: startDate, end: endDate };

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

      // Load all sources in parallel using the map center and the selected radius
      await Promise.allSettled([
        loadVirgilio(currentLat, currentLon, resolvedCityName),
        loadTicketmaster(currentLat, currentLon, radius, resolvedCityName),
        loadGetYourGuide(currentLat, currentLon, radius, resolvedCityName),
        loadViator(currentLat, currentLon, radius, startDate, endDate, resolvedCityName),
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
  }, [searchCenter?.[0], searchCenter?.[1], startDate, endDate, radius]);

  useEffect(() => {
    fetchEvents();
    
    // Get real device coordinates for distance calculations
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
  }, [fetchEvents]);

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
      
      const vRes = await fetch(getApiUrl(`/api/virgilio?city=${encodeURIComponent(targetCity)}`));
      
      if (!vRes.ok) {
        setSourceResults(prev => ({ ...prev, virgilio: [] }));
        return;
      }
      
      const text = await vRes.text();
      const articles = text.split('<article class="eventi ').slice(1);
      const newEvents: EventData[] = [];

      articles.forEach((articleHtml, idx) => {
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
        const description = descMatch ? descMatch[1].trim() : "Dettagli sulla pagina di Virgilio Eventi.";

        const imgMatch = articleHtml.match(/data-src(?:-[a-z])?="([^"]+)"/i) || 
                         articleHtml.match(/<img[^>]*src="([^"]+)"/i) ||
                         articleHtml.match(/background-image:\s*url\(['"]?([^'"\)]+)['"]?\)/i);
        
        let imgSrc = imgMatch ? imgMatch[1] : "";
        if (!imgSrc || imgSrc.includes("placeholder")) {
           // Better fallback based on common italian event types
           const keywords = (title + " " + description).toLowerCase();
           if (keywords.includes("concerto") || keywords.includes("musica")) imgSrc = "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&q=80&w=400";
           else if (keywords.includes("sagra") || keywords.includes("cibo") || keywords.includes("festa")) imgSrc = "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&q=80&w=400";
           else if (keywords.includes("mostra") || keywords.includes("arte")) imgSrc = "https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb?auto=format&fit=crop&q=80&w=400";
           else if (keywords.includes("teatro")) imgSrc = "https://images.unsplash.com/photo-1503095396549-807fd9908605?auto=format&fit=crop&q=80&w=400";
           else imgSrc = `https://images.unsplash.com/photo-1540039155732-6761b5f1e847?auto=format&fit=crop&q=80&w=400&sig=${idx}`;
        }
        const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"/i);
        let eventDate = new Date().toISOString().split("T")[0];
        if (dateMatch) eventDate = dateMatch[1].split("T")[0];
        const locMatch = articleHtml.match(/<address[^>]*>\s*(.*?)\s*<\/address>/is) || articleHtml.match(/<span[^>]*itemprop="name"[^>]*>\s*(.*?)\s*<\/span>/is);
        const nameMatch = articleHtml.match(/<span[^>]*itemprop="name"[^>]*>\s*(.*?)\s*<\/span>/is);
        const locationAddress = (articleHtml.match(/<address[^>]*>\s*(.*?)\s*<\/address>/is)?.[1] || "").trim();
        const locationName = nameMatch ? nameMatch[1].trim().replace(/<[^>]+>/g, '') : targetCity;
        const checkLower = (title + " " + description).toLowerCase();

        newEvents.push({
          // ID deterministico (titolo+data+luogo): un id casuale generava
          // doppioni nei preferiti a ogni ricaricamento della stessa lista.
          id: `virgilio-${title}-${eventDate}-${locationName}`,
          name: title,
          description: description,
          date: eventDate,
          venueName: locationName,
          venueAddress: locationAddress,
          url: link,
          imageUrl: imgSrc,
          source: "virgilio",
          lat: undefined, // Will populate via geocoding
          lon: undefined,
          isFree: /gratuit|libero|free/.test(checkLower),
          isFamily: /famigli|bambin|kids/.test(checkLower),
          isMusic: /music|concert|live/.test(checkLower),
        });
      });
      setSourceResults(prev => {
        const combined = [...prev.virgilio, ...newEvents];
        // Use name + date + venue as unique key for Virgilio events as they don't have stable IDs from HTML
        const unique = Array.from(new Map(combined.map(e => [`${e.name}-${e.date}-${e.venueName}`, e])).values());
        return { ...prev, virgilio: unique };
      });

      // Background geocoding for events with address
      // I timer vengono tracciati e cancellati all'unmount: il componente viene
      // distrutto a ogni cambio tab e i setTimeout (fino a 30s con 20 eventi)
      // continuavano a fare fetch + setState su componente morto.
      newEvents.forEach((ev, i) => {
        if (ev.venueAddress) {
          const timerId = window.setTimeout(async () => {
            try {
              const geoRes = await fetch(getApiUrl(`/api/nominatim/search?q=${encodeURIComponent(ev.venueAddress)}&format=json&limit=1`));
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                if (geoData && geoData.length > 0) {
                  setSourceResults(prev => {
                    const newList = [...prev.virgilio];
                    const index = newList.findIndex(e => e.id === ev.id);
                    if (index !== -1) {
                      newList[index] = { ...newList[index], lat: parseFloat(geoData[0].lat), lon: parseFloat(geoData[0].lon) };
                    }
                    return { ...prev, virgilio: newList };
                  });
                }
              }
            } catch (e) {
              console.warn("Error geocoding event address", e);
            }
          }, i * 1500); // 1.5s delay to strictly respect Nominatim rate limits
          geocodeTimersRef.current.push(timerId);
        }
      });
    } catch (e) {
      console.error(e);
      setSourceErrors(prev => ({ ...prev, virgilio: "Impossibile caricare eventi da Virgilio." }));
    } finally {
      setLoadingSources(prev => ({ ...prev, virgilio: false }));
    }
  };

  const loadTicketmaster = async (lat: number, lon: number, searchRadius: number, cityName?: string) => {
    logApiCall('ticketmaster', 'ricerca_eventi_api');
    setLoadingSources(prev => ({ ...prev, ticketmaster: true }));
    setSourceErrors(prev => ({ ...prev, ticketmaster: null }));
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const startDateTime = startObj.toISOString().split(".")[0] + "Z";
    const endDateTime = new Date(endObj.getTime() + 86400000).toISOString().split(".")[0] + "Z";

    try {
        const res = await fetch(getApiUrl(`/api/ticketmaster?lat=${lat}&lon=${lon}&radius=${searchRadius}&startDateTime=${startDateTime}&endDateTime=${endDateTime}`));
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
            imageUrl: item.images?.[0]?.url || "https://images.unsplash.com/photo-1540039155732-6761b5f1e847?auto=format&fit=crop&q=80&w=400",
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
      setSourceErrors(prev => ({ ...prev, ticketmaster: "Nessun evento o API key mancante." }));
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
        getApiUrl(`/api/events/local?lat=${lat}&lon=${lon}&radius=${searchRadius}`),
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
        imageUrl: e.imageUrl || (e.kind === 'mercato'
          ? 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&q=80&w=400'
          : 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&q=80&w=400'),
        source: 'local' as EventSource,
        macroCategory: e.kind === 'mercato' ? '🧺 Mercato' : '🍷 Sagra & Festa',
        lat: e.lat,
        lon: e.lon,
        approxCoords: !!e.approx,
        isFree: e.kind === 'mercato' ? true : undefined,
      }));
      setSourceResults(prev => ({ ...prev, local: mapped }));
    } catch (err) {
      console.error('loadLocal Error:', err);
      setSourceErrors(prev => ({ ...prev, local: 'Sagre e mercati non disponibili.' }));
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
        body: JSON.stringify({ lat, lon, radius: searchRadius, lang: (language || 'IT').toLowerCase() })
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
        date: startDate,
        venueName: t.venue ? (t.price ? `${t.venue} · ${t.price}` : t.venue) : (t.price ? `Biglietto · ${t.price}` : "Tiqets"),
        // L'URL arriva dal server GIÀ con ?partner=<brand> (attribuzione
        // Tiqets legata al token): passarla intatta, MAI riscriverla.
        url: t.url,
        imageUrl: t.imageUrl || "https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&fit=crop&q=80&w=400",
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
      setSourceErrors(prev => ({ ...prev, tiqets: "Impossibile recuperare biglietti Tiqets" }));
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
        body: JSON.stringify({ lat, lon, radius: viatorRadius, startDate: start, endDate: end, cityName })
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
        date: start,
        venueName: v.duration ? `Durata: ${v.duration}` : "Tour Viator",
        url: ensureViatorAffiliateUrl(v.url),
        imageUrl: v.imageUrl || "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&q=80&w=400",
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
      setSourceErrors(prev => ({ ...prev, viator: "Impossibile caricare esperienze Viator." }));
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
    if (!currentUserId) return notify("Devi essere loggato per salvare un evento.");

    try {
      // Percorso unico dei preferiti (lib/favorites): prima l'insert diretto
      // su Supabase non aggiornava il mirror locale né emetteva
      // FAVORITES_EVENT, quindi Scoperte/Preferiti non vedevano l'evento
      // salvato finché non si ricaricava tutto.
      if (getLocalFavorites().some((f: any) => String(f.poi_id || f.id) === String(event.id))) {
        notify("Evento già salvato nei preferiti!");
        return;
      }
      const poiData = {
        id: event.id,
        name: event.name,
        category: event.macroCategory || "Altro",
        lat: event.lat || mapCenter?.[0] || 0,
        lon: event.lon || mapCenter?.[1] || 0,
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
        notify("Evento salvato! Ti avviso qui se il prezzo o lo stato dei biglietti cambia.");
        return;
      }
      notify("Evento salvato nei Preferiti! Potrai usarlo per generare itinerari personalizzati.");
    } catch (e: any) {
      console.error(e);
      notify("Errore durante il salvataggio.");
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
        body: JSON.stringify({ lat, lon, radius: searchRadius, cityName })
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
            date: startDate,
            venueName: e.duration || "GetYourGuide",
            url: finalUrl,
            imageUrl: e.imageUrl || "https://images.unsplash.com/photo-1540039155732-6761b5f1e847?auto=format&fit=crop&q=80&w=400",
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
      setSourceErrors(prev => ({ ...prev, getyourguide: "Impossibile recuperare eventi GetYourGuide" }));
    } finally {
      setLoadingSources(prev => ({ ...prev, getyourguide: false }));
    }
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
    if (!ref) return notify("Posizione non disponibile per comporre la serata.");
    if (eveningPlan) { setShowEveningModal(true); return; }
    setEveningLoading(true);
    try {
      const r = await fetch(getApiUrl("/api/evening-plan"), {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: ref[0], lon: ref[1], lang: (language || "IT").toLowerCase() }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(data?.tappe) || data.tappe.length === 0) {
        throw new Error(data?.error || "Proposta non disponibile");
      }
      setEveningPlan(data);
      setShowEveningModal(true);
    } catch (e) {
      console.error("evening-plan error:", e);
      notify("Serata perfetta non disponibile al momento, riprova tra poco.");
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
    ...sourceResults.local
  ];

  const filteredEvents = displayEvents.filter((e) => {
    if (!e.date || e.date === "Data non specificata") return false;
    const dateObj = new Date(e.date);
    if (!isNaN(dateObj.getTime())) {
      const dStart = new Date(startDate);
      dStart.setHours(0, 0, 0, 0);
      const dEnd = new Date(endDate);
      dEnd.setHours(23, 59, 59, 999);
      const inDateRange = dateObj >= dStart && dateObj <= dEnd;
      // Virgilio ha una data vera quando il parsing dell'annuncio riesce: in
      // quel caso il periodo scelto vale anche per lui. Restano esenti solo le
      // esperienze Viator, che sono prenotabili su più date.
      if (!inDateRange && e.source !== "viator") return false;
    }

    // Filtro «Solo gratis»
    if (onlyFree && !isEventFree(e)) return false;

    // Distanza dal CENTRO DI RICERCA (mappa visualizzata o viaggio attivo)
    if (e.lat && e.lon && searchCenter) {
      const distInKm = getDistanceFromLatLonInM(searchCenter[0], searchCenter[1], e.lat, e.lon) / 1000;
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
    if (sortBy === 'relevance') {
      const getScore = (e: EventData) => {
        let score = 0;
        if (e.source === 'ticketmaster') score += 8;
        if (e.id.includes('mock')) score -= 20;
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
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const tonightRef = deviceCoords || searchCenter;
  const tonightEvents = (new Date().getHours() >= 16 && tonightRef)
    ? displayEvents
        .filter(e => ["ticketmaster", "viator", "getyourguide", "tiqets", "local"].includes(e.source))
        .filter(e => e.date === todayLocal && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)))
        .map(e => ({
          ev: e,
          dist: getDistanceFromLatLonInM(tonightRef[0], tonightRef[1], Number(e.lat), Number(e.lon)) / 1000,
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
            Ho capito, nascondi
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
          <span>🎪</span> {getTranslation("events_title", language)}: {city}
        </h1>
        <p className="text-sm text-on-surface-variant font-medium mt-1">
          {getTranslation("events_subtitle", language)}
        </p>
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
              📍 Eventi a {activeTrip.city} (viaggio attivo)
            </button>
            <button
              onClick={() => setUseTripCenter(false)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                !useTripCenter
                  ? 'bg-primary border-primary text-white shadow-md'
                  : 'bg-surface-variant border-outline-variant text-on-surface-variant hover:bg-primary/10'
              }`}
            >
              🧭 Posizione attuale
            </button>
          </div>
        )}

        {/* Serata perfetta in un tap */}
        <button
          onClick={requestEveningPlan}
          disabled={eveningLoading}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md disabled:opacity-60"
        >
          {eveningLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Preparo la tua serata...
            </>
          ) : (
            <>🍸 Serata perfetta in un tap</>
          )}
        </button>

        {/* 🌙 Stasera vicino a te (dalle 16, eventi di oggi entro ~10 km) */}
        {tonightEvents.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-3xl p-4 border border-indigo-800/40">
            <h2 className="text-white font-black text-sm uppercase tracking-wider mb-3">🌙 Stasera vicino a te</h2>
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
                  <img src={ev.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-bold truncate">{ev.name}</div>
                    <div className="text-indigo-300 text-[10px] font-medium">
                      {ev.time ? `ore ${ev.time} · ` : ''}{dist.toFixed(1)} km · {ev.source}
                    </div>
                  </div>
                  {isEventFree(ev) && <span className="text-base shrink-0" title="Gratis">🆓</span>}
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Source Status Badges */}
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.entries(loadingSources).map(([source, isLoading]) => (
            isLoading && (
              <div key={source} className="flex items-center gap-1.5 px-3 py-1 bg-primary/5 text-primary rounded-full text-[10px] font-bold border border-primary/10">
                <Loader2 className="w-3 h-3 animate-spin" />
                LOADING {source.toUpperCase()}
              </div>
            )
          ))}
          <AnimatePresence>
            {Object.entries(sourceErrors).map(([source, err]) => {
              // Mostra errore solo se non ci sono risultati (nemmeno fallback) per quella source
              const hasResults = (sourceResults as any)[source]?.length > 0;
              if (!err || hasResults) return null;
              const sourceLabel = source === 'ticketmaster' ? 'Ticketmaster' : source === 'getyourguide' ? 'GetYourGuide' : source === 'viator' ? 'Viator' : source === 'tiqets' ? 'Tiqets' : source === 'local' ? 'Sagre & Mercati' : source;
              return (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={source} 
                  className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-200"
                >
                  <AlertCircle className="w-3 h-3" />
                  {sourceLabel} non disponibile
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

        {loading && filteredEvents.length === 0 ? (
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
            <div className="text-4xl mb-4">📍</div>
            <p className="font-bold text-on-surface">{getTranslation("events_not_found", language)}</p>
            <p className="text-sm text-on-surface-variant mt-1">
              {getTranslation("events_not_found_desc", language)}
            </p>
            {Object.values(sourceErrors).some(e => e !== null) && (
              <p className="text-xs text-error mt-4 font-bold uppercase tracking-wider">
                {getTranslation("events_source_errors", language)}
              </p>
            )}
          </div>
        ) : (
          filteredEvents.map((event, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={event.id}
              className="bg-surface rounded-3xl overflow-hidden shadow-sm border border-outline-variant flex flex-col sm:flex-row flex-shrink-0 min-h-[380px] sm:min-h-[220px]"
            >
              <div className="h-48 sm:h-auto sm:w-48 shrink-0 relative">
                <img
                  src={event.imageUrl}
                  alt={event.name}
                  className="w-full h-full object-cover"
                />
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
                      🆓 Gratis
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
                    title="Salva nei preferiti"
                  >
                    <Heart className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-primary font-medium text-sm mb-3">
                  <CalendarIcon className="w-4 h-4" />
                  {event.date || getTranslation("events_date_unconfirmed", language)}
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
                          <>Ca. {(getDistanceFromLatLonInM(deviceCoords[0], deviceCoords[1], event.lat, event.lon) / 1000).toFixed(1)} km {getTranslation("events_km_from_you", language)}</>
                        ) : (
                          <>Ca. {(getDistanceFromLatLonInM(searchCenter![0], searchCenter![1], event.lat, event.lon) / 1000).toFixed(1)} km {getTranslation("events_km_from_map", language)}</>
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
                    onClick={() => openNavigation(event)}
                    className="flex-1 bg-surface-variant hover:bg-primary/10 text-on-surface font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <MapPin className="w-4 h-4" /> {getTranslation("events_navigate", language)}
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
                      {event.source === 'viator' ? 'Prenota su Viator'
                        : event.source === 'getyourguide' ? 'Prenota su GetYourGuide'
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
          ))
        )}
      </div>

      {/* Sticky Bottom Functions Bar */}
      <div className="bg-[#1A1D1F]/95 backdrop-blur-xl border-t border-white/10 px-6 py-4 flex flex-col gap-3 flex-shrink-0 shadow-[0_-8px_32px_rgba(0,0,0,0.4)]">
        {/* Date Filters */}
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
            🆓 Solo gratis
          </button>

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
                    <p className="text-xs font-bold text-primary mt-1">💶 Budget stimato: {eveningPlan.budgetStimato}</p>
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
                        {t.tipo !== 'rientro' && mapsQuery && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-black text-primary hover:underline"
                          >
                            <MapPin className="w-3 h-3" /> Apri in mappa
                          </a>
                        )}
                        {t.link && (
                          <a
                            href={getApiUrl(`/api/out?u=${encodeURIComponent(t.link)}&src=ticketmaster`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-black text-secondary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" /> Biglietti
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-on-surface-variant text-center mt-1">
                  Proposta generata con AI su locali ed eventi reali della zona: verifica orari e disponibilità.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
