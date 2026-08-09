import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen, Star, Compass, Play, Pause, ChevronDown, ChevronUp,
  MapPin, Clock, Globe, Phone, Camera, Sparkles, X, ExternalLink,
  Share2, Heart, Loader2, Volume2, Navigation
} from "lucide-react";
import {
  CATEGORY_HEX,
  CATEGORY_GRADIENT,
  CATEGORY_EMOJIS,
} from "../lib/mapConstants";
import { getCachedPoiDetails, setCachedPoiDetails } from "../lib/poiCache";
import { fetchCityNameQueued } from "../lib/nominatimQueue";
import { Language, getTranslation } from "../lib/i18n";
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getApiUrl } from '../lib/api';
import { getGuideCharacter } from '../lib/guideSettings';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { useFavorites } from '../lib/favorites';
import { supabase } from '../lib/supabase';

const ItaintaBackgroundPoiPlugin = (typeof window !== 'undefined' && Capacitor.isNativePlatform())
  ? registerPlugin<any>('ItaintaBackgroundPoiPlugin') 
  : null;

interface PoiPopupContentProps {
  poi: any;
  onGuideClick: () => void;
  language: Language;
  setMarkers?: any;
}

/** Verifica accessibilità (duplicate for safety) */
function checkPoiAccessibility(poi: any): boolean {
  if (!poi.name) return false;
  const n = poi.name.toLowerCase();
  return n.includes("accessib") || n.includes("disabil") || n.includes("wheelchair") || n.includes("scivolo") || n.includes("rampa");
}

// I POI di servizio (utility_pois) hanno solo la card leggera:
// niente scheda dettagliata, niente enrichment AI, niente audioguida.
const UTILITY_CATEGORIES = ["locali", "utilita", "famiglie", "esperienze_locali"];
function isUtilityPoi(poi: any): boolean {
  return UTILITY_CATEGORIES.includes(poi.category || poi.baseCategory);
}

export default function PoiPopupContent({ poi, onGuideClick, language, setMarkers }: PoiPopupContentProps) {
  const [data, setData] = useState<any>(getCachedPoiDetails(poi.id));
  const [loading, setLoading] = useState(!getCachedPoiDetails(poi.id));
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [shared, setShared] = useState(false);
  const [displayedDesc, setDisplayedDesc] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Effetto macchina da scrivere SOLO sul primo testo. Prima girava a 5ms e
  // ripartiva da zero a ogni aggiornamento della descrizione (dato immediato →
  // DB → Groq): il testo si svuotava e si riscriveva più volte e il popup
  // cambiava altezza di continuo — era una delle cause dello sfarfallio.
  const typedOnceRef = useRef(false);
  useEffect(() => {
    const textToType = data?.description;
    if (!textToType) return;
    if (data?.isGroqEnriched || typedOnceRef.current) {
      setDisplayedDesc(textToType);
      return;
    }
    typedOnceRef.current = true;
    let i = 0;
    const interval = setInterval(() => {
      i += 12;
      if (i >= textToType.length) {
        setDisplayedDesc(textToType);
        clearInterval(interval);
      } else {
        setDisplayedDesc(textToType.substring(0, i));
      }
    }, 30);
    return () => clearInterval(interval);
  }, [data?.description, data?.isGroqEnriched]);

  // Se l'URL della foto cambia (dato immediato → DB → Wikipedia), l'errore
  // della foto precedente non deve nascondere anche quella nuova.
  const heroSrc = data?.imageUrl || poi.image_url || poi.photo_url || null;
  useEffect(() => { setImgError(false); }, [heroSrc]);

  const { toggleFavorite, isFavorite: checkFavorite } = useFavorites();
  const isFavorite = checkFavorite(String(poi.id));

  const handleFavoriteToggle = async () => {
    await toggleFavorite(poi);
  };

  // ── Fetch dati ─────────────────────────────────────────────────────
  // Logica: CACHE-FIRST → Supabase shared_pois → Groq on-the-fly
  useEffect(() => {
    // Se già in cache, mostra subito senza re-fetch
    const cached = getCachedPoiDetails(String(poi.id));
    if (cached) { setData(cached); setLoading(false); return; }

    let isMounted = true;

    async function fetchData() {
      if (typeof poi.lat !== "number" || isNaN(poi.lat)) { setLoading(false); return; }

      // ── STEP 0: Mostra SUBITO foto+desc già presenti nel POI object ──
      // (dai campi che shared_pois ritorna via RPC o discovery)
      const immediateImage = poi.image_url || poi.photo_url || null;
      const immediateDesc = poi.description_short || poi.description_ai || poi.description || null;

      const baseData: any = {
        imageUrl: immediateImage,
        description: immediateDesc || "",
        descriptionLong: poi.description_long || poi.full_description || "",
        fullDescription: poi.full_description || "",
        audioScript: poi.audio_script || (poi as any).audioScript || "",
        practicalInfo: poi.practical_info || "",
        technicalData: (poi as any).technical_data || null,
        tags: (poi as any).technical_data?.tags || [],
        rating: poi.rating || null,
        subtext: "",
        wikiUrl: (poi as any).technical_data?.wikipedia_url || null,
        website: null,
      };

      // Mostra subito i dati iniziali (anche vuoti)
      if (isMounted) { setData({ ...baseData }); setLoading(false); }

      // Se ha già tutto (img + desc lunga), cachea e stop
      if (immediateImage && immediateDesc && (poi.description_long || poi.full_description)) {
        setCachedPoiDetails(String(poi.id), baseData);
        return;
      }

      // ── UTILITY: stop qui. La card leggera non ha bisogno né di
      // /api/poi/details (le utility non stanno in shared_pois) né dello
      // stream Groq: apertura istantanea con nome+foto+città.
      if (isUtilityPoi(poi)) {
        const cityName = await fetchCityNameQueued(poi.lat, poi.lon).catch(() => "");
        const utilData = {
          ...baseData,
          description: baseData.description || `${poi.name || "Servizio"} disponibile${cityName ? " a " + cityName : ""}.`,
          tags: ["servizi"],
        };
        if (isMounted) { setData(utilData); setLoading(false); setCachedPoiDetails(String(poi.id), utilData); }
        return;
      }

      try {
        // ── STEP 1: Cerca in shared_pois via /api/poi/details ──────────
        if (poi.id) {
          const dbRes = await fetch(
            getApiUrl(`/api/poi/details?id=${encodeURIComponent(String(poi.id))}&lat=${poi.lat}&lon=${poi.lon}`)
          ).catch(() => null);

          if (dbRes?.ok) {
            const dbData = await dbRes.json();
            const hasDesc = dbData?.description_ai || dbData?.description_long || dbData?.description_short;
            const hasImg = dbData?.image_url || dbData?.photo_url;

            if (hasDesc || hasImg) {
              const enriched: any = {
                imageUrl: dbData.image_url || dbData.photo_url || immediateImage || null,
                description: dbData.description_short || dbData.description_ai || immediateDesc || "",
                descriptionLong: dbData.description_long || dbData.full_description || "",
                fullDescription: dbData.full_description || "",
                audioScript: dbData.audio_script || "",
                practicalInfo: dbData.practical_info || "",
                technicalData: dbData.technical_data || null,
                tags: dbData.technical_data?.tags || ["cultura", "storia"],
                rating: dbData.rating || null,
                subtext: "",
                wikiUrl: dbData.technical_data?.wikipedia_url || null,
                website: dbData.practical_info?.match(/Web: ([^\s|]+)/)?.[1] || null,
                isGroqEnriched: false,
              };
              if (isMounted) { setData(enriched); setCachedPoiDetails(String(poi.id), enriched); }
              // Se ha dati nel DB, stop — CACHE FIRST: non usiamo Groq se abbiamo già qualcosa
              if (hasDesc) return;
            }
          }
        }

        // ── STEP 2: Geolocalizzazione inversa per subtext ──────────────
        // (coda globale Nominatim: cache + throttle 1 req/1.2s)
        const cityName = await fetchCityNameQueued(poi.lat, poi.lon).catch(() => "");

        const mainCat = getTranslation(poi.category, language) || poi.category;
        const subCat = (poi as any).subCategory || (poi as any).originalCategory;
        const subLabel = subCat ? (getTranslation(subCat, language) || subCat.replace(/_/g, " ")) : mainCat;
        const subtext = [cityName, subLabel].filter(Boolean).join(" · ");

        // ── STEP 3: Groq on-the-fly (SOLO GROQ IN STREAMING) ──────────
        // L'utente vuole SOLO Groq. Niente fetch "fast" da Wikipedia intermedio.
        const preGroqData = { ...baseData, subtext };
        if (isMounted) setData({ ...preGroqData });

        try {
          const userId = (await supabase.auth.getSession()).data?.session?.user?.id || "mock-user-id";
          
          // Inizializza l'oggetto vuoto per lo stream
          const groqData: any = { ...preGroqData, subtext, isGroqEnriched: true };
          // Nessun rating inventato: prima si generava 4.0-4.9 da un hash
          // dell'id e si mostravano 5 stelline dorate false. Il rating appare
          // solo se arriva da una fonte reale (es. Foursquare).
          if (!groqData.tags?.length) groqData.tags = poi.category === "locali" ? ["cibo", "ristorazione"] : ["cultura", "storia", "turismo"];
          
          if (isMounted) setData(groqData);

          // ── STEP 3.1: Ricerca immagine Wikipedia in background (non-bloccante) ──
          let wikiImagePromise = fetch(`https://it.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(poi.name)}&origin=*`)
            .then(res => res.json())
            .then(data => {
              const pages = data.query?.pages;
              if (pages) {
                const pageId = Object.keys(pages)[0];
                if (pageId !== "-1" && pages[pageId].original?.source) {
                  const img = pages[pageId].original.source;
                  groqData.imageUrl = img;
                  if (isMounted) setData({...groqData});
                  return img;
                }
              }
              return null;
            }).catch(err => {
              console.warn("PoiPopupContent: Wikipedia image fetch failed", err);
              return null;
            });

          // Watchdog anti-stallo: se lo stream resta muto per 25s abortiamo
          // e scatta il fallback elegante (mai UI bloccata).
          const streamCtrl = new AbortController();
          let streamWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => streamCtrl.abort(), 25000);
          const resetStreamWatchdog = () => {
            if (streamWatchdog) clearTimeout(streamWatchdog);
            streamWatchdog = setTimeout(() => streamCtrl.abort(), 25000);
          };

          // Avvia lo stream Groq
          const streamRes = await fetch(getApiUrl(`/api/poi/enrich-stream`), {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             signal: streamCtrl.signal,
             body: JSON.stringify({
               id: poi.id,
               name: poi.name,
               lat: poi.lat,
               lon: poi.lon,
               category: poi.category,
               subCategory: (poi as any).subCategory || (poi as any).originalCategory,
               lang: language?.toLowerCase() || "it",
               extract: "", // Niente Wikipedia, Groq fa tutto
               userId
             })
          });

          if (streamRes.body) {
              const reader = streamRes.body.getReader();
              const decoder = new TextDecoder("utf-8");
              let accumulatedJson = "";
              
              while (true) {
                 if (!isMounted) break;
                 const { done, value } = await reader.read();
                 if (done) break;
                 resetStreamWatchdog();
                 const chunkStr = decoder.decode(value);
                 const lines = chunkStr.split("\n");
                 
                 for (const line of lines) {
                    if (line.startsWith("data: ")) {
                       const dataStr = line.substring(6);
                       if (dataStr === "[DONE]") continue;
                       try {
                          const parsedChunk = JSON.parse(dataStr);
                          if (parsedChunk.text) {
                            accumulatedJson += parsedChunk.text;
                            
                            // Aggiorna la UI live durante lo streaming di Groq
                            let rawText = accumulatedJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
                            const firstBrace = rawText.indexOf('{');
                            
                            if (firstBrace !== -1) {
                               // Cerca di estrarre la description_short o description_long live
                               const shortKey = '"description_short"';
                               const longKey = '"description_long"';
                               
                               let liveDesc = "";
                               let shortIdx = rawText.indexOf(shortKey, firstBrace);
                               let longIdx = rawText.indexOf(longKey, firstBrace);
                               
                               // Mostra preferibilmente la short, altrimenti un pezzo della long
                               if (shortIdx !== -1) {
                                  let partial = rawText.substring(shortIdx + shortKey.length);
                                  partial = partial.replace(/^\s*[:]\s*"/, '');
                                  const endIdx = partial.indexOf('",');
                                  if (endIdx !== -1) liveDesc = partial.substring(0, endIdx);
                                  else liveDesc = partial.replace(/"\s*}?$/, '');
                               } else if (longIdx !== -1) {
                                  let partial = rawText.substring(longIdx + longKey.length);
                                  partial = partial.replace(/^\s*[:]\s*"/, '');
                                  const endIdx = partial.indexOf('",');
                                  if (endIdx !== -1) liveDesc = partial.substring(0, endIdx);
                                  else liveDesc = partial.replace(/"\s*}?$/, '');
                               }
                               
                               if (liveDesc) {
                                  groqData.description = liveDesc.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                                  if (isMounted) setData({...groqData});
                               }
                            }
                          }
                       } catch(e) {}
                    }
                 }
              }
              
              if (streamWatchdog) { clearTimeout(streamWatchdog); streamWatchdog = null; }

              // Finito lo streaming! Salva i dati ricchi
              try {
                 let finalJson = accumulatedJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
                 const fb = finalJson.indexOf('{');
                 const lb = finalJson.lastIndexOf('}');
                 if (fb !== -1 && lb > fb) finalJson = finalJson.slice(fb, lb + 1);
                 const parsedFinal = JSON.parse(finalJson);

                 // Attendi (se non ha già finito) la ricerca immagine Wikipedia;
                 // altrimenti usa la foto già presente nel DB (cache-hit server).
                 const foundImage = (await wikiImagePromise) || parsedFinal.image_url || null;
                 if (foundImage) {
                    parsedFinal.image_url = foundImage;
                    groqData.imageUrl = foundImage;
                 }
                 
                 if (parsedFinal.description_long || parsedFinal.description_short) {
                    groqData.description = parsedFinal.description_short || parsedFinal.description_long;
                    groqData.descriptionLong = parsedFinal.description_long;
                    groqData.audioScript = parsedFinal.audio_script;
                    if (parsedFinal.is_gem) groqData.isGem = true;
                    
                    if (isMounted) { setData({...groqData}); setCachedPoiDetails(poi.id, groqData); }
                    
                    // Prepara update object
                    const updateObj: any = {
                       description_long: parsedFinal.description_long,
                       description_ai: parsedFinal.description_long,
                       description_short: parsedFinal.description_short,
                       audio_script: parsedFinal.audio_script,
                       is_gem: parsedFinal.is_gem ?? poi.is_gem
                    };
                    if (foundImage) {
                       updateObj.image_url = foundImage;
                       updateObj.photo_url = foundImage;
                    }

                    // Salva nel DB principale (Supabase)
                    supabase.from('shared_pois').update(updateObj).eq('id', poi.id).then(({error}) => {
                       if (error) console.error("Error saving Groq stream POI:", error);
                       else console.log(`✅ Groq stream completed and saved to DB for ${poi.name}`);
                    });
                    
                    // Evento globale
                    window.dispatchEvent(new CustomEvent('poi-enriched', { detail: {
                       ...poi,
                       description: parsedFinal.description_short || parsedFinal.description_long,
                       description_long: parsedFinal.description_long,
                       audio_script: parsedFinal.audio_script,
                       image_url: foundImage || poi.image_url
                    }}));
                 }
              } catch(e) {}
          } else {
             // Gestione errori API
             throw new Error("Stream API non accessibile");
          }
        } catch (enrichErr) {
          console.warn("PoiPopupContent: Groq stream failed", enrichErr);
          const fallback = { ...preGroqData, subtext, description: preGroqData.description || `${poi.name}${cityName ? " a " + cityName : ""}.`, tags: ["turismo"] };
          if (isMounted) { setData(fallback); setCachedPoiDetails(poi.id, fallback); }
        }
      } catch (err) {
        console.error("PoiPopup fetch error:", err);
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => { isMounted = false; };
  }, [poi.id, poi.name, poi.lat, poi.lon, poi.category]);

  // ── Audio TTS ─────────────────────────────────────────────────────
  const handlePlayAudio = async () => {
    if (audioLoading) return;
    if (audioPlaying) {
      stopSpeech();
      setAudioPlaying(false);
      return;
    }
    const text = data?.audioScript || data?.descriptionLong || data?.description;
    if (!text) return;

    // Spinner finché la sintesi non parte davvero (speakAudioguide risolve
    // all'avvio della riproduzione), poi icona Pausa. Personaggio dalle
    // impostazioni globali, non più hardcoded a nicky.
    setAudioLoading(true);
    try {
      await speakAudioguide(text, language?.toLowerCase() || "it", getGuideCharacter(), () => {
        setAudioPlaying(false);
      });
      setAudioPlaying(true);
    } catch {
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  // ── Share ─────────────────────────────────────────────────────────
  const handleShare = async () => {
    const shareText = `${poi.name}\n${data?.description || ""}\n🗺️ https://maps.google.com/maps?q=${poi.lat},${poi.lon}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: poi.name, text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {}
  };

  // ── Navigazione Nativa o Web ──────────────────────────────────────
  const handleNavigate = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (ItaintaBackgroundPoiPlugin) {
      ItaintaBackgroundPoiPlugin.openSystemNavigator({ lat: poi.lat, lon: poi.lon, name: poi.name }).catch(() => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}`, '_blank');
      });
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}`, '_blank');
    }
  };

  // ── Deriva categorie per styling ──────────────────────────────────
  const effectiveCat = poi.baseCategory || poi.subCategory || poi.category;
  const catHex = CATEGORY_HEX[effectiveCat] || CATEGORY_HEX[poi.category] || "#1e3a8a";
  const catGrad = CATEGORY_GRADIENT[effectiveCat] || CATEGORY_GRADIENT[poi.category] || "from-emerald-900 via-emerald-800 to-green-700";
  const catEmoji = CATEGORY_EMOJIS[effectiveCat] || CATEGORY_EMOJIS[poi.category] || "📍";
  const isGem = !!(poi.is_gem || poi.category === "gemme");
  const accessible = checkPoiAccessibility(poi);

  // Technical data parsed
  const techData = data?.technicalData || {};
  const hasTechData = techData.inception || techData.architect || techData.style || techData.wikidata_id;

  // Utility Categories use a simplified card
  const isUtility = isUtilityPoi(poi);

  if (isUtility) {
    return (
      <div className="w-[280px] -m-3 overflow-hidden rounded-2xl font-sans shadow-2xl bg-white flex flex-col max-h-[60vh]">
        <div className="w-full flex justify-center py-1.5 bg-white/80 absolute top-0 z-50 rounded-t-2xl pointer-events-none">
          <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="relative h-36 w-full flex-shrink-0 overflow-hidden bg-gray-100">
          {data?.imageUrl && !imgError ? (
            <img src={data.imageUrl} alt={poi.name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${catGrad} flex items-center justify-center`}>
              <span className="text-4xl opacity-80">{catEmoji}</span>
            </div>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-start gap-2 mb-2">
            <div className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catHex }} />
            <h3 className="font-bold text-[15px] text-gray-900 leading-tight">{poi.name}</h3>
          </div>
          <p className="text-[12px] text-gray-600 line-clamp-3 mb-4">
            {data?.description || poi.description || `${getTranslation(poi.category, language)}`}
          </p>
          <button 
            onClick={handleNavigate}
            className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-bold text-sm shadow-md transition-all active:scale-95"
            style={{ background: `linear-gradient(135deg, ${catHex}, #000)` }}
          >
            <Navigation className="w-4 h-4" /> Naviga
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[300px] -m-3 overflow-hidden rounded-2xl font-sans shadow-2xl bg-white flex flex-col max-h-[60vh]">
      {/* Tasto tendina in alto (drag handle) per agevolare chiusura */}
      <div className="w-full flex justify-center py-1.5 bg-white/80 absolute top-0 z-50 rounded-t-2xl pointer-events-none">
        <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
      </div>

      {/* ── HERO IMAGE ── */}
      {/* La foto del pin (poi.image_url) va mostrata SUBITO, anche mentre il
          resto dei dati carica: prima si vedeva spinner → foto (flash) pure
          quando l'immagine era già disponibile nel POI. */}
      <div className="relative h-40 w-full flex-shrink-0 overflow-hidden">
        {(() => {
          const heroImage = !imgError ? heroSrc : null;
          if (heroImage) {
            return (
              <>
                <img
                  src={heroImage}
                  alt={poi.name}
                  className="w-full h-full object-cover"
                  onError={() => setImgError(true)}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              </>
            );
          }
          if (loading) {
            return (
              <div className={`w-full h-full bg-gradient-to-br ${catGrad} flex items-center justify-center`}>
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs">{getTranslation("loading_card", language)}</span>
                </div>
              </div>
            );
          }
          return (
            <div className={`w-full h-full bg-gradient-to-br ${catGrad} flex items-center justify-center`}>
              <span className="text-5xl opacity-80">{catEmoji}</span>
            </div>
          );
        })()}

        {/* Badge gemma */}
        {isGem && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-400/95 backdrop-blur-sm text-amber-900 text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg">
            💎 GEMMA
          </div>
        )}

        {/* Badge accessibile */}
        {accessible && (
          <div className="absolute top-2 right-2 bg-blue-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            ♿
          </div>
        )}

        {/* Bottoni azione sovrapposti sull'immagine */}
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button
            onClick={handlePlayAudio}
            title={getTranslation("poi_listen_card", language)}
            className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-all active:scale-95"
          >
            {audioLoading
              ? <Loader2 className="w-3.5 h-3.5 text-gray-800 animate-spin" />
              : audioPlaying
                ? <Pause className="w-3.5 h-3.5 text-gray-800" />
                : <Volume2 className="w-3.5 h-3.5 text-gray-800" />
            }
          </button>
          <button
            onClick={handleShare}
            title={getTranslation("poi_share", language)}
            className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-all active:scale-95"
          >
            {shared ? <span className="text-[9px] text-green-600 font-bold">OK</span> : <Share2 className="w-3.5 h-3.5 text-gray-800" />}
          </button>
          <button
            onClick={handleFavoriteToggle}
            title={isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            className={`w-7 h-7 rounded-full backdrop-blur-sm flex items-center justify-center shadow-md transition-all active:scale-95 ${isFavorite ? "bg-rose-500 text-white" : "bg-white/90 text-gray-800 hover:bg-white"}`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? "fill-white" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── CORPO SCHEDA ── */}
      <div className="p-3.5 overflow-y-auto flex-1 custom-scrollbar">

        {/* Titolo + categoria */}
        <div className="flex items-start gap-2 mb-1">
          {/* Dot categoria colorato */}
          <div
            className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: catHex }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[15px] text-gray-900 leading-tight break-words">
              {poi.name}
            </h3>
            {data?.subtext && (
              <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                {data.subtext}
              </p>
            )}
          </div>
        </div>

        {/* Rating stelline */}
        {data?.rating && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => {
                const r = parseFloat(String(data.rating));
                return (
                  <span key={i} className={`text-[10px] ${i <= Math.round(r) ? "text-amber-400" : "text-gray-200"}`}>★</span>
                );
              })}
            </div>
            <span className="text-[10px] font-bold text-amber-500">{data.rating}</span>
          </div>
        )}

        {/* ── DESCRIZIONE ── */}
        {loading ? (
          <div className="space-y-1.5 mb-3">
            <div className="h-2.5 bg-gray-100 rounded animate-pulse w-full" />
            <div className="h-2.5 bg-gray-100 rounded animate-pulse w-5/6" />
            <div className="h-2.5 bg-gray-100 rounded animate-pulse w-4/6" />
          </div>
        ) : (
          <div className="mb-2">
            <p className="text-[11.5px] text-gray-700 leading-relaxed relative">
              {displayedDesc || (!loading && !data?.description ? getTranslation("no_description", language) : "")}
              {displayedDesc !== data?.description && !data?.isGroqEnriched && <span className="inline-block w-1 h-3 ml-0.5 bg-gray-400 animate-pulse align-middle"></span>}
            </p>

            {/* Espandibile: descrizione lunga + dati tecnici */}
            {(data?.descriptionLong || data?.fullDescription || hasTechData || data?.practicalInfo) && (
              <>
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="flex items-center gap-1 mt-1.5 text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded ? getTranslation("show_less", language) : getTranslation("show_more", language)}
                </button>

                {expanded && (
                  <div className="mt-2 space-y-2">
                    {/* Descrizione estesa */}
                    {(data.descriptionLong || data.fullDescription) && (
                      <p className="text-[11px] text-gray-600 leading-relaxed border-l-2 pl-2"
                         style={{ borderColor: catHex }}>
                        {data.fullDescription || data.descriptionLong}
                      </p>
                    )}

                    {/* Dati tecnici (da Wikidata) */}
                    {hasTechData && (
                      <div className="bg-gray-50 rounded-xl p-2.5 space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">{getTranslation("poi_historical_data", language)}</p>
                        {techData.inception && (
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
                            <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>{getTranslation("built_in", language)} <strong>{techData.inception}</strong></span>
                          </div>
                        )}
                        {techData.architect && (
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
                            <span className="w-3 h-3 text-center text-gray-400 flex-shrink-0">✏️</span>
                            <span>{getTranslation("architect_label", language)} <strong>{techData.architect}</strong></span>
                          </div>
                        )}
                        {techData.style && (
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
                            <span className="w-3 h-3 text-center text-gray-400 flex-shrink-0">🎨</span>
                            <span>{getTranslation("style_label", language)} <strong>{techData.style}</strong></span>
                          </div>
                        )}
                        {techData.wikivoyage && (
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-700">
                            <span className="w-3 h-3 text-center text-gray-400 flex-shrink-0">🗺️</span>
                            <span>WikiVoyage: <strong>{techData.wikivoyage}</strong></span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Informazioni pratiche */}
                    {data.practicalInfo && (
                      <div className="bg-gray-50 rounded-xl p-2.5">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">{getTranslation("poi_practical_info", language)}</p>
                        <p className="text-[10px] text-gray-600 leading-relaxed">{data.practicalInfo}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tags */}
        {!loading && data?.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {accessible && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-bold border border-blue-200">
                ♿ No Barriere
              </span>
            )}
            {isGem && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[9px] font-bold border border-amber-200">
                💎 Gemma
              </span>
            )}
            {data.tags.slice(0, 3).map((tag: string, i: number) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                style={{ background: catHex + "18", color: catHex }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── CTA BUTTONS ── */}
        <div className="grid grid-cols-3 gap-1.5">
          {/* Guida AI */}
          <button
            onClick={onGuideClick}
            onTouchEnd={(e) => { e.preventDefault(); onGuideClick(); }}
            className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-white text-[10px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ background: catHex }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {getTranslation("guide", language)}
          </button>

          {/* Naviga */}
          <button
            onClick={handleNavigate}
            onTouchEnd={handleNavigate}
            className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[10px] font-bold hover:bg-blue-700 transition-colors active:scale-95 text-center"
            style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
          >
            <Navigation className="w-3.5 h-3.5" />
            {getTranslation("navigate", language)}
          </button>

          {/* Audio */}
          <button
            onClick={handlePlayAudio}
            onTouchEnd={(e) => { e.preventDefault(); handlePlayAudio(); }}
            className="flex flex-col items-center justify-center gap-0.5 py-2 bg-gray-800 text-white rounded-xl text-[10px] font-bold hover:bg-gray-700 transition-colors active:scale-95"
          >
            {audioLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />…</>
              : audioPlaying
                ? <><Pause className="w-3.5 h-3.5" />Stop</>
                : <><Volume2 className="w-3.5 h-3.5" />{getTranslation("poi_audio", language)}</>
            }
          </button>
        </div>

        {/* Preferiti separato sotto */}
        <button
          onClick={handleFavoriteToggle}
          onTouchEnd={(e) => { e.preventDefault(); handleFavoriteToggle(); }}
          className={`mt-1.5 w-full py-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 border ${
            isFavorite
              ? "bg-rose-500 text-white border-rose-500"
              : "bg-white text-gray-500 border-gray-200 hover:border-rose-300 hover:text-rose-500"
          }`}
        >
          <Heart className={`w-3 h-3 ${isFavorite ? "fill-white" : ""}`} />
          {isFavorite ? getTranslation("removed_from_favorites", language) : getTranslation("add_to_favorites", language)}
        </button>
      </div>
    </div>
  );
}
