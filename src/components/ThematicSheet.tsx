// =====================================================================
// WIP · "Viaggi tematici" (sheet a tutto schermo)
//
// Il terzo fratello di PilgrimWaysSheet e TasteRoutesSheet, ma con una
// differenza di sostanza: lì il percorso esiste già ed è dato, qui esiste
// il LUOGO — una sorgente termale, un set di film, un cielo senza luci —
// e l'itinerario intorno lo compone WIP.
//
// Otto temi, otto cataloghi curati (src/data/tematici/*.json) caricati in
// modo dinamico da lib/tematici.ts: se un catalogo non c'è ancora, la
// sheet mostra lo stato vuoto e non rompe niente.
//
// Due modi di guardarli: "Vicino a me" (raggio 200 km dalla posizione,
// ordine per distanza) e "Nel mondo" (tutti, ordine per fama). Sui temi
// stagionali — mercatini e fioriture — l'interruttore "Solo in stagione"
// parte acceso: un mercatino di Natale a luglio è rumore, non un'opzione.
// =====================================================================
import { X, Search, MapPin, Sparkles, Loader2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  TEMATICI_KEYS, TEMATICI_META, TEMATICI_CON_ACCESSO, TEMATICI_STAGIONALI,
  loadTematico, distanzaKm, mesiAttivi, isInStagione, etichettaTipo, etichettaMesi,
  type ThematicKey, type ThematicPlace,
} from '../lib/tematici';
import { locationService } from '../services/locationService';
import { getTranslation, type Language } from '../lib/i18n';
import type { RoutePrefill } from '../lib/transitCatalog';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Raggio della vista "Vicino a me": un tema si raggiunge anche in giornata. */
const RAGGIO_KM = 200;

/** Interessi del form Piano (PlanScreen.interests) più adatti a ogni tema. */
const INTERESSI_TEMA: Record<ThematicKey, string[]> = {
  terme: ['natura', 'fotografia'],
  cinema: ['arte', 'fotografia'],
  cieli: ['natura', 'fotografia'],
  street_art: ['arte', 'fotografia'],
  mercati: ['shopping', 'gastronomia'],
  fioriture: ['natura', 'fotografia'],
  memoria: ['arte'],
  lento: ['natura', 'fotografia'],
};

/** Chip della Libreria itinerari per ogni tema (KIND_CHIPS in ItineraryLibrarySheet). */
const CHIP_LIBRERIA: Record<ThematicKey, string> = {
  terme: 'tem-terme',
  cinema: 'tem-cinema',
  cieli: 'tem-cieli',
  street_art: 'tem-street-art',
  mercati: 'tem-mercati',
  fioriture: 'tem-fioriture',
  memoria: 'tem-memoria',
  lento: 'tem-lento',
};

/** Come si chiede all'AI un giro costruito INTORNO a un luogo tematico. */
const BRIEF_TEMA: Record<ThematicKey, string> = {
  terme: 'Giornata dedicata alle terme: il bagno è il centro della giornata, intorno solo tappe compatibili col relax (niente marce forzate). Indica orari, se serve prenotare, cosa portare (accappatoio, ciabatte, cuffia) e dove si mangia leggero.',
  cinema: 'Giro sulle tracce di film e serie girati qui: per ogni tappa dì quale scena è stata girata in quel punto e da che angolo si riconosce, poi collega le tappe come farebbe una passeggiata vera.',
  cieli: 'Serata di osservazione del cielo: la parte diurna prepara (cena presto, luogo raggiungibile prima del buio), poi il punto di osservazione. Ricorda torcia rossa, abiti caldi anche d\'estate, orario del tramonto e fase lunare.',
  street_art: 'Passeggiata di street art: le opere in ordine geografico, con l\'autore e l\'anno quando si sanno, e i quartieri attraversati. Ricorda che i muri cambiano: alcune opere potrebbero non esserci più.',
  mercati: 'Giornata di mercato: si comincia dal mercato negli orari in cui è vivo, poi la città intorno. Dì giorni e orari di apertura, cosa vale la pena comprare e se conviene contrattare.',
  fioriture: 'Giro nella fioritura: il punto migliore e l\'ora migliore per vederla (luce del mattino o del tardo pomeriggio), il periodo di picco, e intorno tappe che non tolgano tempo alla fioritura.',
  memoria: 'Percorso della memoria: luoghi da visitare con rispetto e in silenzio, con il contesto storico di ognuno e il tempo giusto per fermarsi. Niente tono turistico.',
  lento: 'Viaggio lento: il mezzo (treno panoramico, funicolare, battello, ciclovia) È la tappa, non il trasferimento. Indica durata, in che direzione sedersi, da che lato è il panorama, e cosa fare alle due estremità.',
};

export default function ThematicSheet({
  language = 'IT' as Language,
  onClose,
  onApply,
  onOpenLibrary,
}: {
  language?: Language;
  onClose: () => void;
  /** Pre-compila il form Piano (PlanScreen.applySpecialRoute). */
  onApply?: (p: RoutePrefill) => void;
  /** 📚 Apre la Libreria itinerari pre-filtrata sul tema (PlanScreen.openLibrary). */
  onOpenLibrary?: (pre: { kind?: string; group?: string; city?: string; query?: string }) => void;
}) {
  const [key, setKey] = useState<ThematicKey>(TEMATICI_KEYS[0]);
  const [vis, setVis] = useState<'vicino' | 'mondo'>('vicino');
  const [accesso, setAccesso] = useState<'tutti' | 'gratis' | 'biglietto'>('tutti');
  const [soloStagione, setSoloStagione] = useState(true);
  const [query, setQuery] = useState('');
  const [luoghi, setLuoghi] = useState<ThematicPlace[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const meta = TEMATICI_META[key];
  const meseCorrente = new Date().getMonth() + 1;
  const stagionale = TEMATICI_STAGIONALI.includes(key);
  const conAccesso = TEMATICI_CON_ACCESSO.includes(key);

  /** Traduzione con ripiego italiano: le chiavi tem_* le sta aggiungendo un'altra sessione. */
  const t = (chiave: string, ripiego: string): string => {
    const v = getTranslation(chiave, language);
    return !v || v === chiave ? ripiego : v;
  };

  // Posizione: prima l'ultima nota al servizio (gratis e istantanea), poi
  // il browser. Senza posizione la vista "Vicino a me" ricade sul mondo.
  useEffect(() => {
    const ultima = locationService.getLastLocation();
    if (ultima && Number.isFinite(ultima.latitude) && Number.isFinite(ultima.longitude)) {
      setCoords({ lat: ultima.latitude, lon: ultima.longitude });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setVis('mondo'); return; }
    let vivo = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (vivo) setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => { if (vivo) setVis('mondo'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
    return () => { vivo = false; };
  }, []);

  // Catalogo del tema scelto: import dinamico + cache in lib/tematici.ts.
  useEffect(() => {
    let vivo = true;
    setCaricando(true);
    setExpandedId(null);
    loadTematico(key)
      .then((v) => { if (vivo) { setLuoghi(v); setCaricando(false); } })
      .catch(() => { if (vivo) { setLuoghi([]); setCaricando(false); } });
    return () => { vivo = false; };
  }, [key]);

  // Filtri sempre nell'ordine: stagione → accesso → testo → distanza.
  const q = norm(query.trim());
  const lista = useMemo(() => {
    const vicino = vis === 'vicino' && !!coords;
    const out = luoghi
      .filter((p) => {
        if (stagionale && soloStagione && !isInStagione(p, meseCorrente)) return false;
        if (conAccesso && accesso !== 'tutti') {
          const gratis = p.extra?.free_access === true;
          if (accesso === 'gratis' && !gratis) return false;
          if (accesso === 'biglietto' && gratis) return false;
        }
        if (q.length >= 2) {
          const testo = `${p.name} ${p.city || ''} ${p.region || ''} ${p.country} ${p.highlights || ''} ${etichettaTipo(p.type)}`;
          if (!norm(testo).includes(q)) return false;
        }
        return true;
      })
      .map((p) => ({
        p,
        d: coords ? distanzaKm(coords.lat, coords.lon, p.lat, p.lon) : null,
      }))
      .filter((r) => !vicino || (r.d !== null && r.d <= RAGGIO_KM));
    // Vicino a me: dal più vicino. Nel mondo: prima i luoghi famosi.
    out.sort((a, b) => (vicino
      ? (a.d! - b.d!)
      : ((b.p.fame || 0) - (a.p.fame || 0)) || a.p.name.localeCompare(b.p.name, 'it')));
    return out;
  }, [luoghi, vis, coords, accesso, soloStagione, stagionale, conAccesso, q, meseCorrente]);

  /** 🗺 Porta il luogo sulla mappa e apre la sua scheda. */
  const vediSullaMappa = (p: ThematicPlace) => {
    window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: p.lat, lon: p.lon, zoom: 14 } }));
    window.dispatchEvent(new CustomEvent('focus-poi', {
      detail: { id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: key },
    }));
    onClose();
  };

  /** Prefill roadtrip di una tappa sola: il luogo tematico e il brief del tema. */
  const buildPrefill = (p: ThematicPlace): RoutePrefill => {
    const dove = p.city || p.region || p.name;
    const mesi = mesiAttivi(p);
    const righe = [
      `Viaggio tematico "${meta.label}" intorno a ${p.name} (${etichettaTipo(p.type)}${p.city ? `, ${p.city}` : ''}${p.country ? `, ${p.country}` : ''}).`,
      BRIEF_TEMA[key],
      `TAPPA OBBLIGATORIA: ${p.name}${p.highlights ? ` — ${p.highlights}` : ''}. Coordinate: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}.`,
      p.best_time ? `Periodo migliore: ${p.best_time}.` : '',
      mesi.length ? `Mesi in cui ha senso: ${etichettaMesi(mesi)}.` : '',
      p.url ? `Sito ufficiale da verificare per orari e prezzi: ${p.url}` : '',
    ].filter(Boolean);
    return {
      legs: [{ city: dove, lat: p.lat, lon: p.lon }],
      days: 1,
      interests: INTERESSI_TEMA[key],
      specialRequests: righe.join('\n'),
      label: `${meta.emoji} ${p.name}`,
    };
  };

  /** ✨ Crea l'itinerario: form del Piano se possibile, altrimenti "da reel a itinerario". */
  const creaItinerario = (p: ThematicPlace) => {
    if (onApply) { onApply(buildPrefill(p)); onClose(); return; }
    // Ripiego: la stessa chiave che PlanScreen consuma all'apertura.
    try {
      localStorage.setItem('wip_reel_to_plan', JSON.stringify({
        city: p.city || p.name,
        places: [{ name: p.name, lat: p.lat, lon: p.lon }],
        ts: Date.now(),
      }));
    } catch { /* storage pieno o negato: si apre comunque il Piano */ }
    window.dispatchEvent(new CustomEvent('wip-itinerary-checkin', { detail: { poiId: 'reel-to-plan' } }));
    onClose();
  };

  /** Badge dei campi `extra` che contano davvero, tema per tema. */
  const badgeExtra = (p: ThematicPlace): string[] => {
    const e = p.extra || {};
    const out: string[] = [];
    if (Number.isFinite(Number(e.water_temp_c))) out.push(`♨️ ${Number(e.water_temp_c)}°C`);
    if (e.natural_source === true) out.push('💧 Sorgente naturale');
    if (e.unesco === true) out.push('🏛 UNESCO');
    if (Number.isFinite(Number(e.bortle))) out.push(`${t('tem_bortle', 'Cielo (scala Bortle)')} ${Number(e.bortle)}`);
    if (e.designation) out.push(`🌌 ${e.designation}`);
    if (e.free_access === true) out.push(`🆓 ${t('tem_free_access', 'Accesso libero')}`);
    else if (e.free_access === false) out.push(`🎟 ${t('tem_paid', 'Con biglietto')}`);
    if (e.visitable === true) out.push('🚪 Visitabile');
    if (Array.isArray(e.artists) && e.artists.length) out.push(`🎨 ${e.artists.slice(0, 3).join(', ')}`);
    if (e.year) out.push(`🗓 ${e.year}`);
    if (e.species) out.push(`🌱 ${e.species}`);
    if (e.peak) out.push(`🌸 Picco: ${e.peak}`);
    if (e.schedule) out.push(`🕒 ${e.schedule}`);
    if (e.person) out.push(`🕯 ${e.person}${e.role ? ` — ${e.role}` : ''}`);
    if (e.operator) out.push(`🚉 ${e.operator}`);
    if (Number.isFinite(Number(e.length_km))) out.push(`📏 ${Number(e.length_km)} km`);
    if (e.duration) out.push(`⏱ ${e.duration}`);
    const mesi = mesiAttivi(p);
    if (mesi.length && mesi.length < 12) out.push(`📅 ${etichettaMesi(mesi)}`);
    return out;
  };

  /** I film/serie girati qui: l'informazione per cui si viene, non un dettaglio. */
  const opere = (p: ThematicPlace): Array<{ title: string; year?: any; kind?: string; scene?: string }> =>
    Array.isArray(p.extra?.works) ? p.extra!.works.slice(0, 4) : [];

  return (
    <div className="fixed inset-0 z-[10002] bg-white flex flex-col">
      {/* Header — prende il colore del tema scelto */}
      <div
        className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0"
        style={{ borderColor: `${meta.colore}33`, background: `${meta.colore}0d` }}
      >
        <h2 className="font-black text-lg leading-tight" style={{ color: meta.colore }}>
          🧭 {t('tem_sheet_title', 'Itinerari tematici')}
        </h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white text-gray-400 hover:bg-gray-100 transition" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Le otto chip: una sola attiva, il catalogo si carica al tap */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 shrink-0 overflow-x-auto no-scrollbar">
        {TEMATICI_KEYS.map((k) => {
          const m = TEMATICI_META[k];
          const attiva = k === key;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKey(k)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                attiva ? 'text-white shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
              style={attiva ? { background: m.colore, borderColor: m.colore } : undefined}
            >
              <span className="text-sm">{m.emoji}</span> {t(m.labelKey, m.label)}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] font-medium text-gray-400 px-4 pb-2 pt-1 shrink-0 leading-snug">
        {t('tem_sheet_desc', 'Terme, set cinematografici, cieli stellati, murales, mercatini, fioriture, luoghi della memoria e viaggi lenti: scegli un tema e un luogo, WIP compone il giro.')}
      </p>

      {/* Ricerca */}
      <div className="px-4 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Cerca fra ${luoghi.length} luoghi: nome, città, paese…`}
            className="w-full pl-9 pr-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 outline-none text-sm font-medium focus:border-gray-400"
          />
        </div>
      </div>

      {/* Filtri: vicino/mondo, accesso, stagione */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 overflow-x-auto no-scrollbar">
        {([
          { id: 'vicino' as const, label: `📍 ${t('tem_near_me', 'Vicino a me')}` },
          { id: 'mondo' as const, label: `🌍 ${t('tem_all_world', 'Nel mondo')}` },
        ]).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVis(v.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              vis === v.id ? 'text-white shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
            style={vis === v.id ? { background: meta.colore, borderColor: meta.colore } : undefined}
          >
            {v.label}
          </button>
        ))}

        {conAccesso && ([
          { id: 'gratis' as const, label: `🆓 ${t('tem_free', 'Gratis')}` },
          { id: 'biglietto' as const, label: `🎟 ${t('tem_paid', 'Con biglietto')}` },
        ]).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAccesso((v) => (v === a.id ? 'tutti' : a.id))}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              accesso === a.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {a.label}
          </button>
        ))}

        {stagionale && (
          <button
            type="button"
            onClick={() => setSoloStagione((v) => !v)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              soloStagione ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
            title="Un mercatino di Natale a luglio non è un'opzione: qui restano solo i luoghi del mese in corso."
          >
            📅 Solo in stagione
          </button>
        )}
      </div>

      {/* Avvisi di contesto: senza posizione la vista vicina non è possibile */}
      {vis === 'vicino' && !coords && !caricando && (
        <p className="px-4 pb-2 text-[10.5px] font-bold text-amber-700 shrink-0">
          Posizione non disponibile: usa 🌍 {t('tem_all_world', 'Nel mondo')} per vedere tutto il catalogo.
        </p>
      )}

      {/* Elenco */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
        {caricando && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-bold">Carico il catalogo…</span>
          </div>
        )}

        {!caricando && lista.length === 0 && (
          <p className="text-center text-xs font-bold text-gray-400 py-10">
            {t('tem_no_data', 'Nessun dato per questa zona')}
            <br />
            <span className="text-[10px] font-medium">
              {vis === 'vicino'
                ? `Nel raggio di ${RAGGIO_KM} km non c'è niente per questo tema: prova 🌍 ${t('tem_all_world', 'Nel mondo')}.`
                : 'Il catalogo di questo tema non è ancora disponibile su questo dispositivo.'}
            </span>
          </p>
        )}

        {!caricando && lista.map(({ p, d }) => {
          const espansa = expandedId === p.id;
          const badge = badgeExtra(p);
          const works = opere(p);
          return (
            <div
              key={p.id}
              className="bg-white border rounded-2xl shadow-sm transition-all"
              style={{ borderColor: espansa ? `${meta.colore}80` : '#e5e7eb' }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(espansa ? null : p.id)}
                className="w-full text-left p-3 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{meta.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-black leading-tight" style={{ color: meta.colore }}>{p.name}</div>
                      <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                        {etichettaTipo(p.type)}
                        {p.city ? ` · ${p.city}` : ''}
                        {p.country ? ` (${p.country})` : ''}
                        {d !== null ? ` · ${d < 10 ? d.toFixed(1) : Math.round(d)} km` : ''}
                      </div>
                    </div>
                  </div>
                  {stagionale && isInStagione(p, meseCorrente) && (
                    <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      ● Adesso
                    </span>
                  )}
                </div>
                {p.highlights && (
                  <p className="text-[11px] text-gray-600 leading-snug mt-2 line-clamp-2">{p.highlights}</p>
                )}
              </button>

              {espansa && (
                <div className="px-3 pb-3 space-y-2.5">
                  {p.best_time && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span className="text-sm leading-none mt-0.5">🗓</span>
                      <p className="text-[11px] font-bold text-amber-900 leading-snug">{p.best_time}</p>
                    </div>
                  )}

                  {badge.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {badge.map((b, i) => (
                        <span
                          key={i}
                          className="text-[9.5px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: `${meta.colore}1a`, color: meta.colore }}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}

                  {works.length > 0 && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 space-y-1">
                      {works.map((w, i) => (
                        <p key={i} className="text-[10.5px] font-bold text-violet-900 leading-snug">
                          🎞 {w.title}{w.year ? ` (${w.year})` : ''}
                          {w.scene ? <span className="font-medium text-violet-700"> — {w.scene}</span> : null}
                        </p>
                      ))}
                    </div>
                  )}

                  {(p.region || p.extra?.booking_url || p.url) && (
                    <p className="text-[10px] font-medium text-gray-500 leading-snug">
                      {p.region ? `${p.region}, ` : ''}{p.country}
                      {p.url && (
                        <>
                          {' · '}
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-black underline" style={{ color: meta.colore }}>
                            sito ufficiale
                          </a>
                        </>
                      )}
                      {p.extra?.booking_url && (
                        <>
                          {' · '}
                          <a href={String(p.extra.booking_url)} target="_blank" rel="noopener noreferrer" className="font-black underline" style={{ color: meta.colore }}>
                            prenotazione
                          </a>
                        </>
                      )}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => vediSullaMappa(p)}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 text-[11px] font-black hover:bg-gray-100 active:scale-95 transition flex items-center justify-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Vedi sulla mappa
                    </button>
                    <button
                      type="button"
                      onClick={() => creaItinerario(p)}
                      className="flex-1 py-2.5 rounded-xl text-white text-[11px] font-black active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                      style={{ background: meta.colore }}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> {t('tem_use_plan', 'Crea l\'itinerario')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* La Libreria: itinerari di questo tema GIÀ generati, gratis */}
        {onOpenLibrary && !caricando && (
          <button
            type="button"
            onClick={() => onOpenLibrary({ kind: CHIP_LIBRERIA[key] })}
            className="w-full py-2.5 mt-1 rounded-xl border border-amber-300/70 bg-amber-50 text-amber-800 text-[11px] font-black hover:bg-amber-100 active:scale-95 transition"
          >
            📚 Cerca in Biblioteca gli itinerari «{t(meta.labelKey, meta.label)}»
          </button>
        )}
      </div>
    </div>
  );
}
