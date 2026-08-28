// =====================================================================
// WIP · Catalogo ispirazioni di stagione (sheet a tutto schermo)
// Griglia completa dei template curati del periodo (chips + paginazione)
// con in coda le proposte AI di /api/seasonal-catalog (curati SEMPRE
// prima, badge "✦ Redazione" vs "🤖 AI"). Il tap su una card la espande
// e carica best-effort 2-3 "Esperienze prenotabili" dalle rotte affiliate
// (Tiqets prima, poi Viator/GYG) con cache client 6h; "Usa questo
// template" pre-compila il form del planner e chiude lo sheet.
// =====================================================================
import { X, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { templatesForNow, loadTemplateTranslations, SEASONAL_THEMES, type SeasonalTemplate, type SeasonalTheme, type TemplateI18nMap } from '../lib/seasonalTemplates';
import { getApiUrl, apiFetch } from '../lib/api';

/** Template col marcatore di provenienza (i curati non ce l'hanno). */
type CatalogTemplate = SeasonalTemplate & { aiGenerated?: boolean };

type TplFilter = 'tutti' | 'nascosti' | SeasonalTheme;

interface Esperienza { name: string; price: string; url: string; source: string }

const EXP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 ore
const PAGE_SIZE = 8;
const MESI_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Etichetta compatta dei mesi di un template (es. "mar · apr"). */
function mesiLabel(months: number[]): string {
  if (!Array.isArray(months) || months.length === 0 || months.length >= 12) return 'tutto l\'anno';
  return months.slice(0, 4).map(m => MESI_SHORT[(m - 1 + 12) % 12]).join(' · ');
}

/**
 * Esperienze prenotabili per una destinazione: Tiqets prima (link già
 * affiliati dal server: mai riscriverli), poi Viator e GetYourGuide.
 * Cache 6h in localStorage; qualunque fallimento restituisce lista vuota
 * e la card continua a funzionare come prima.
 */
async function loadEsperienze(destination: string, lang: string): Promise<Esperienza[]> {
  const cacheKey = `wip_tpl_exp_${destination.trim().toLowerCase()}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && Array.isArray(c.items) && Date.now() - (c.ts || 0) < EXP_CACHE_TTL_MS) return c.items;
    }
  } catch { /* cache corrotta: si rigenera */ }

  const items: Esperienza[] = [];
  let almenoUnaRispostaOk = false;
  const sorgenti: Array<[string, any]> = [
    ['/api/tiqets', { cityName: destination, lang }],
    ['/api/viator', { cityName: destination }],
    ['/api/getyourguide', { cityName: destination }],
  ];
  for (const [path, body] of sorgenti) {
    if (items.length >= 3) break;
    try {
      const res = await fetch(getApiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      almenoUnaRispostaOk = true;
      for (const e of data) {
        if (items.length >= 3) break;
        // I fallback "pagina di ricerca" di GYG non sono esperienze reali.
        if (!e?.url || e?.isFallback) continue;
        items.push({
          name: String(e.name || '').slice(0, 90),
          price: String(e.price || ''),
          url: String(e.url),
          source: String(e.source || 'tiqets'),
        });
      }
    } catch { /* best-effort: si passa alla sorgente dopo */ }
  }
  // In cache solo se almeno una sorgente ha risposto: un fallimento di rete
  // non deve congelare "zero esperienze" per 6 ore.
  if (almenoUnaRispostaOk) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items })); } catch { /* quota piena */ }
  }
  return items;
}

/** Link tracciato via /api/out (whitelist host lato server). */
function outUrl(e: Esperienza): string {
  return getApiUrl(`/api/out?u=${encodeURIComponent(e.url)}&src=${encodeURIComponent(e.source)}`);
}

export default function SeasonalCatalogSheet({
  language = 'IT',
  onApply,
  onClose,
}: {
  language?: string;
  onApply: (t: SeasonalTemplate) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<TplFilter>('tutti');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expByDest, setExpByDest] = useState<Record<string, { loading: boolean; items: Esperienza[] }>>({});
  // Catalogo AI: 0 = mai chiesto, 1 = fatto giro 'Italia', 2 = fatto anche 'Europa'
  const [aiStage, setAiStage] = useState<0 | 1 | 2>(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTemplates, setAiTemplates] = useState<CatalogTemplate[]>([]);

  const filterOpts = useMemo(() => ({
    theme: filter !== 'tutti' && filter !== 'nascosti' ? filter : undefined,
    soloNascosti: filter === 'nascosti',
  }), [filter]);

  const curati: CatalogTemplate[] = useMemo(
    () => templatesForNow(new Date(), filterOpts),
    [filterOpts]
  );

  // UI non italiana: traduzioni di title/specialRequests dei curati
  // (batch alla prima apertura, cache client 7gg in loadTemplateTranslations,
  // fallback silenzioso all'italiano). Con UI in italiano: zero chiamate.
  const uiLang = (language || 'IT').toLowerCase().slice(0, 2);
  const [i18nMap, setI18nMap] = useState<TemplateI18nMap>({});
  useEffect(() => {
    if (uiLang === 'it') { setI18nMap({}); return; }
    let vivo = true;
    // Tutti i curati del periodo (senza filtro): copre anche i cambi chips.
    loadTemplateTranslations(uiLang, templatesForNow(new Date()))
      .then(m => { if (vivo) setI18nMap(m); })
      .catch(() => { /* fallback: italiano */ });
    return () => { vivo = false; };
  }, [uiLang]);
  /** Testi mostrati per una card: tradotti se curata e traduzione presente. */
  const testi = (t: CatalogTemplate) => {
    const tr = !t.aiGenerated ? i18nMap[t.id] : undefined;
    return { title: tr?.title || t.title, specialRequests: tr?.specialRequests || t.specialRequests };
  };

  // Curati SEMPRE prima, poi le proposte AI (dedupe per destinazione).
  const lista: CatalogTemplate[] = useMemo(() => {
    const viste = new Set(curati.map(t => t.destination.trim().toLowerCase()));
    const extra = aiTemplates.filter(t => {
      const k = t.destination.trim().toLowerCase();
      if (viste.has(k)) return false;
      viste.add(k);
      return true;
    });
    return [...curati, ...extra];
  }, [curati, aiTemplates]);

  const cambiaFiltro = (f: TplFilter) => {
    setFilter(f);
    setShown(PAGE_SIZE);
    setExpandedId(null);
    // Le proposte AI sono generate per il filtro attivo: al cambio si riparte.
    setAiTemplates([]);
    setAiStage(0);
  };

  const fetchAiCatalog = async (area: 'Italia' | 'Europa') => {
    setAiLoading(true);
    try {
      const params = new URLSearchParams({ area });
      if (filterOpts.theme) params.set('theme', filterOpts.theme);
      if (filterOpts.soloNascosti) params.set('hidden', '1');
      // Proposte AI direttamente nella lingua della UI (default it: niente parametro).
      if (uiLang !== 'it') params.set('lang', uiLang);
      // Dedupe lato server contro i curati già in griglia (lista corta).
      const exclude = curati.slice(0, 20).map(t => t.destination).join(',');
      if (exclude) params.set('exclude', exclude);
      // apiFetch: Bearer automatico (senza, il server non genera proposte AI).
      const res = await apiFetch(getApiUrl(`/api/seasonal-catalog?${params.toString()}`), undefined, 60000);
      const data = await res.json().catch(() => null);
      const nuovi: CatalogTemplate[] = Array.isArray(data?.templates)
        ? data.templates.filter((t: any) => t?.id && t?.destination && t?.title)
        : [];
      setAiTemplates(prev => [...prev, ...nuovi]);
    } catch { /* niente spinner infinito: il catalogo curato basta */ }
    finally {
      setAiLoading(false);
      setShown(s => s + PAGE_SIZE);
    }
  };

  const mostraAltre = () => {
    if (shown < lista.length) { setShown(s => s + PAGE_SIZE); return; }
    if (aiLoading) return;
    if (aiStage === 0) { setAiStage(1); fetchAiCatalog('Italia'); return; }
    if (aiStage === 1) { setAiStage(2); fetchAiCatalog('Europa'); }
  };

  const apriCard = (t: CatalogTemplate) => {
    if (expandedId === t.id) { setExpandedId(null); return; }
    setExpandedId(t.id);
    // Fetch SOLO all'apertura della card, mai al render della lista.
    const dest = t.destination.trim().toLowerCase();
    if (!expByDest[dest]) {
      setExpByDest(prev => ({ ...prev, [dest]: { loading: true, items: [] } }));
      loadEsperienze(t.destination, (language || 'IT').toLowerCase())
        .then(items => setExpByDest(prev => ({ ...prev, [dest]: { loading: false, items } })))
        .catch(() => setExpByDest(prev => ({ ...prev, [dest]: { loading: false, items: [] } })));
    }
  };

  const fineCatalogo = shown >= lista.length && aiStage >= 2 && !aiLoading;

  return (
    <div className="fixed inset-0 z-[10002] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <h2 className="font-black text-primary text-lg">✨ Ispirazioni di stagione</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chips filtro */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 shrink-0">
        {([
          { id: 'tutti' as TplFilter, label: 'Tutti', emoji: '' },
          { id: 'nascosti' as TplFilter, label: 'Nascosti', emoji: '💎' },
          ...SEASONAL_THEMES.map(t => ({ id: t.id as TplFilter, label: t.label, emoji: t.emoji })),
        ]).map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => cambiaFiltro(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              filter === c.id
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-500 border-outline-variant/30 hover:border-primary/30'
            }`}
          >
            {c.emoji ? `${c.emoji} ` : ''}{c.label}
          </button>
        ))}
      </div>

      {/* Griglia */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {lista.length === 0 && (
          <p className="text-center text-xs font-bold text-gray-400 py-10">
            Nessuna ispirazione per questo filtro nel periodo. Prova un altro tema.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {lista.slice(0, shown).map(t => {
            const espansa = expandedId === t.id;
            const exp = expByDest[t.destination.trim().toLowerCase()];
            return (
              <div
                key={t.id}
                className={`text-left bg-white border rounded-2xl shadow-sm transition-all ${
                  espansa ? 'col-span-2 border-primary/40 shadow-md' : 'border-outline-variant/20 hover:border-primary/30'
                }`}
              >
                <button type="button" onClick={() => apriCard(t)} className="w-full text-left p-3 active:scale-[0.99] transition-transform">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-2xl">{t.emoji}</div>
                    <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                      t.aiGenerated ? 'bg-gray-100 text-gray-500' : 'bg-primary/10 text-primary'
                    }`}>
                      {t.aiGenerated ? '🤖 AI' : '✦ Redazione'}
                    </span>
                  </div>
                  <div className="text-xs font-black text-primary leading-tight mt-1">{testi(t).title}</div>
                  <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                    {t.destination}{t.country && t.country !== 'Italia' ? ` · ${t.country}` : ''} · {t.days} {t.days === 1 ? 'giorno' : 'giorni'}
                  </div>
                  <div className="text-[10px] font-medium text-gray-400 mt-0.5">
                    {t.hiddenGem ? '💎 ' : ''}{mesiLabel(t.months)}
                  </div>
                </button>

                {espansa && (
                  <div className="px-3 pb-3 space-y-3">
                    <p className="text-[11px] text-gray-600 leading-relaxed">{testi(t).specialRequests}</p>

                    {/* Esperienze prenotabili (best-effort, solo all'apertura) */}
                    {exp?.loading && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Cerco esperienze prenotabili…
                      </div>
                    )}
                    {!exp?.loading && (exp?.items?.length || 0) > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">🎟 Esperienze prenotabili</p>
                        {exp!.items.map((e, i) => (
                          <a
                            key={i}
                            href={outUrl(e)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={ev => ev.stopPropagation()}
                            className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2 hover:bg-gray-100 transition"
                          >
                            <span className="text-[11px] font-bold text-gray-700 truncate">{e.name}</span>
                            <span className="shrink-0 flex items-center gap-1 text-[10px] font-black text-primary">
                              {e.price}<ExternalLink className="w-3 h-3" />
                            </span>
                          </a>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onApply({ ...t, ...testi(t) })}
                      className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-black active:scale-95 transition-transform"
                    >
                      Usa questo template ✨
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Paginazione + catalogo AI in coda */}
        <div className="pt-4 flex justify-center">
          {aiLoading ? (
            <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> La redazione AI cerca altre mete…
            </div>
          ) : fineCatalogo ? (
            <p className="text-[10px] font-bold text-gray-300 py-2">Fine del catalogo per questo periodo.</p>
          ) : (
            <button
              type="button"
              onClick={mostraAltre}
              className="px-5 py-2.5 rounded-full border border-primary/30 text-primary text-xs font-black hover:bg-primary/5 active:scale-95 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Mostra altre ✨
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
