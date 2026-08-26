import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { RefreshCw, Sparkles, MapPin, Search, CalendarDays, ExternalLink, ImageIcon, CheckCircle2, AlertCircle, Wand2, Camera, ChevronLeft, ChevronRight, X } from 'lucide-react';

// Tetto di righe caricate: shared_pois ha ~2,4 milioni di righe e prima questa
// pagina le scorreva TUTTE a blocchi di 1000, renderizzandole poi in un'unica
// tabella. Con "Sempre" + "Tutti" significava provare a stampare il database.
const MAX_RIGHE_CARICATE = 500;
const RIGHE_PER_PAGINA = 50;
// Il batch lato server e' fisso: /api/poi/batch-enrich non legge alcun
// parametro dalla query string, la limit=50 e' scritta nell'URL REST della
// rotta. Finche' resta cosi', qui il numero si dichiara e basta.
const BATCH_FISSO = 50;

interface EnrichedPoi {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  status: string;
  description_short: string | null;
  description_long: string | null;
  description_ai: string | null;
  audio_script: string | null;
  teaser_text_it: string | null;
  practical_info: string | null;
  image_url: string | null;
  photo_url: string | null;
  created_at: string;
  enriched_at: string | null;
  is_gem: boolean;
}

/** Copertura di ogni campo dell'arricchimento sul periodo selezionato. */
interface FieldStat {
  key: string;
  label: string;
  count: number;
}

export default function AdminEnrichedPois() {
  const [pois, setPois] = useState<EnrichedPoi[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'today' | 'month'>('today');
  const [displayMode, setDisplayMode] = useState<'enriched' | 'seeded' | 'all'>('enriched');
  const [isBatching, setIsBatching] = useState(false);
  const [stats, setStats] = useState({ enriched: 0, seeded: 0, total: 0 });
  const [fieldStats, setFieldStats] = useState<FieldStat[]>([]);
  // Riscontro in pagina al posto degli alert() nativi.
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null);
  // Conferme inline: invece di confirm(), il bottone stesso diventa "Sicuro?".
  const [confermaBatch, setConfermaBatch] = useState(false);
  const [confermaRiga, setConfermaRiga] = useState<string | null>(null);
  // Stato "in corso" per singola riga: chiave `${poiId}:${azione}`.
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);
  const [esitoRiga, setEsitoRiga] = useState<Record<string, { tipo: 'ok' | 'errore'; testo: string }>>({});
  // Foto proposte dal server per un POI: la rotta le restituisce SENZA salvarle,
  // e' l'admin a scegliere quale scrivere sul POI.
  const [fotoProposte, setFotoProposte] = useState<Record<string, { url: string; source?: string; attribution?: string }[]>>({});
  const [pagina, setPagina] = useState(0);
  // Totale STIMATO del periodo (count 'planned': su shared_pois il count esatto
  // e' proibito, il 18/08/2026 ha abbattuto Supabase in produzione).
  const [totaleStimato, setTotaleStimato] = useState<number | null>(null);
  const [troncata, setTroncata] = useState(false);

  useEffect(() => {
    fetchPois();
  }, [filterMode, displayMode]);

  /** Token admin per le rotte protette: stessa forma usata da AdminEditor. */
  const tokenAdmin = async (): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Sessione scaduta: effettua di nuovo il login.');
    return accessToken;
  };

  const triggerBatchEnrich = async () => {
    // La conferma e' inline (il bottone diventa "Sicuro?"), niente confirm().
    setConfermaBatch(false);
    setIsBatching(true);
    setEsito(null);
    try {
      // L'header x-vercel-cron non è più accettato dal server (era spoofabile):
      // il bottone si autentica come admin con il token della sessione.
      const accessToken = await tokenAdmin();
      const res = await fetch(getApiUrl('/api/poi/batch-enrich'), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        // Quando non c'e' nulla da arricchire il server risponde solo con un
        // message, senza processed/enriched: non spacciarlo per "0 su 0".
        setEsito({
          tipo: 'ok',
          testo: typeof data.processed === 'number'
            ? `Arricchimento completato. POI elaborati: ${data.processed}, arricchiti con successo: ${data.enriched}.`
            : (data.message || 'Arricchimento completato.')
        });
        fetchPois();
      } else {
        setEsito({ tipo: 'errore', testo: 'Il server ha rifiutato il batch: ' + (data.error || 'motivo non indicato.') });
      }
    } catch (err: any) {
      setEsito({ tipo: 'errore', testo: 'Errore durante il batch: ' + (err?.message || 'errore imprevisto.') });
    } finally {
      setIsBatching(false);
    }
  };

  /**
   * Arricchisce UN POI: prima i chip dicevano cosa mancava ma non c'era modo di
   * porvi rimedio da qui. Stessa rotta e stesso corpo usati da AdminEditor.
   */
  const arricchisciPoi = async (poi: EnrichedPoi) => {
    const chiave = `${poi.id}:testo`;
    setConfermaRiga(null);
    setAzioneInCorso(chiave);
    setEsitoRiga(prev => { const n = { ...prev }; delete n[poi.id]; return n; });
    try {
      const accessToken = await tokenAdmin();
      const res = await fetch(getApiUrl('/api/poi/regenerate-content'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          poi_id: poi.id,
          type: 'text',
          name: poi.name,
          category: poi.category,
          lat: poi.lat,
          lon: poi.lon
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Operazione fallita sul server.');

      // Il server scrive description_ai e porta il POI in 'needs_revision':
      // si allinea la riga senza ricaricare l'intera tabella.
      setPois(prev => prev.map(p => p.id === poi.id
        ? { ...p, description_ai: result.description || p.description_ai, status: 'needs_revision' }
        : p));
      setEsitoRiga(prev => ({
        ...prev,
        [poi.id]: { tipo: 'ok', testo: result.message || 'Testo rigenerato: il POI è ora in revisione.' }
      }));
    } catch (err: any) {
      setEsitoRiga(prev => ({
        ...prev,
        [poi.id]: { tipo: 'errore', testo: err?.message || 'Arricchimento fallito.' }
      }));
    } finally {
      setAzioneInCorso(null);
    }
  };

  /**
   * Cerca foto REALI (Wikimedia Commons → Wikipedia → Unsplash come ultimo
   * fallback). La rotta restituisce le opzioni ma NON le salva: la scelta e
   * la scrittura sul POI restano all'admin.
   */
  const cercaFoto = async (poi: EnrichedPoi) => {
    const chiave = `${poi.id}:foto`;
    setConfermaRiga(null);
    setAzioneInCorso(chiave);
    setEsitoRiga(prev => { const n = { ...prev }; delete n[poi.id]; return n; });
    try {
      const accessToken = await tokenAdmin();
      const res = await fetch(getApiUrl('/api/poi/regenerate-content'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          poi_id: poi.id,
          type: 'image',
          name: poi.name,
          lat: poi.lat,
          lon: poi.lon
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Nessuna foto trovata.');

      // Compat: le risposte legacy erano stringhe, oggi sono {url, source, attribution}.
      const opzioni = (result.image_options || []).map((opt: any) =>
        typeof opt === 'string' ? { url: opt } : opt
      );
      setFotoProposte(prev => ({ ...prev, [poi.id]: opzioni }));
      setEsitoRiga(prev => ({
        ...prev,
        [poi.id]: { tipo: 'ok', testo: result.message || `Trovate ${opzioni.length} foto: scegli quale salvare.` }
      }));
    } catch (err: any) {
      setEsitoRiga(prev => ({
        ...prev,
        [poi.id]: { tipo: 'errore', testo: err?.message || 'Ricerca foto fallita.' }
      }));
    } finally {
      setAzioneInCorso(null);
    }
  };

  /** Salva sul POI la foto scelta fra quelle proposte. */
  const applicaFoto = async (poi: EnrichedPoi, url: string) => {
    const chiave = `${poi.id}:salvafoto`;
    setAzioneInCorso(chiave);
    try {
      const { error } = await supabase
        .from('shared_pois')
        .update({ image_url: url, photo_url: url })
        .eq('id', poi.id);
      if (error) throw error;

      setPois(prev => prev.map(p => p.id === poi.id ? { ...p, image_url: url, photo_url: url } : p));
      setFotoProposte(prev => { const n = { ...prev }; delete n[poi.id]; return n; });
      setEsitoRiga(prev => ({ ...prev, [poi.id]: { tipo: 'ok', testo: 'Foto salvata sul POI.' } }));
    } catch (err: any) {
      setEsitoRiga(prev => ({
        ...prev,
        [poi.id]: { tipo: 'errore', testo: 'Impossibile salvare la foto: ' + (err?.message || 'permesso negato o errore DB.') }
      }));
    } finally {
      setAzioneInCorso(null);
    }
  };

  const fetchPois = async () => {
    setIsLoading(true);
    setPagina(0);
    try {
      // Una sola query con un tetto, non piu' un ciclo che scorreva tutta la
      // tabella a blocchi di 1000. count 'planned' e non 'exact': su
      // shared_pois (~2,4 milioni di righe) il conteggio esatto e' una
      // scansione completa e il 18/08/2026 ha messo in ginocchio Supabase in
      // produzione. Il totale e' quindi una stima, e la UI lo dichiara.
      let query = supabase
        .from('shared_pois')
        .select('*', { count: 'planned' })
        .order('created_at', { ascending: false })
        .limit(MAX_RIGHE_CARICATE);

      if (filterMode === 'today') {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const iso = startOfToday.toISOString();
        query = query.or(`enriched_at.gte.${iso},created_at.gte.${iso}`);
      } else if (filterMode === 'month') {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const iso = startOfMonth.toISOString();
        query = query.or(`enriched_at.gte.${iso},created_at.gte.${iso}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const allData = (data || []) as EnrichedPoi[];
      setTotaleStimato(typeof count === 'number' ? count : null);
      setTroncata(allData.length >= MAX_RIGHE_CARICATE);
      let statEnriched = 0;
      let statSeeded = 0;
      allData.forEach(p => {
        if (p.description_ai || p.description_long) statEnriched++;
        else statSeeded++;
      });
      setStats({ enriched: statEnriched, seeded: statSeeded, total: allData.length });

      // Copertura per campo: quanti POI del periodo hanno OGNI pezzo
      // dell'arricchimento (non solo il generico "arricchito sì/no").
      const has = (v: any) => typeof v === 'string' ? v.trim().length > 0 : !!v;
      setFieldStats([
        { key: 'short', label: 'Descrizione breve', count: allData.filter(p => has(p.description_short)).length },
        { key: 'long', label: 'Descrizione lunga', count: allData.filter(p => has(p.description_long) || has(p.description_ai)).length },
        { key: 'audio', label: 'Copione audio', count: allData.filter(p => has(p.audio_script)).length },
        { key: 'teaser', label: 'Teaser vocale', count: allData.filter(p => has(p.teaser_text_it)).length },
        { key: 'foto', label: 'Foto reale', count: allData.filter(p => has(p.image_url) || has(p.photo_url)).length },
        { key: 'gemme', label: 'Gemme', count: allData.filter(p => p.is_gem).length },
      ]);
      
      let filtered = allData;
      
      if (displayMode === 'enriched') {
        filtered = filtered.filter(p => p.description_ai || p.description_long);
      } else if (displayMode === 'seeded') {
        filtered = filtered.filter(p => !p.description_ai && !p.description_long);
      }
      
      setPois(filtered);
    } catch (err: any) {
      console.error("Error fetching enriched pois:", err);
      setPois([]);
      setTotaleStimato(null);
      setTroncata(false);
      setEsito({ tipo: 'errore', testo: 'Caricamento POI fallito: ' + (err?.message || 'errore imprevisto.') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPhoto = async (id: string, _name: string) => {
    // Conferma inline (il bottone diventa "Sicuro?"), non piu' confirm().
    setConfermaRiga(null);
    setAzioneInCorso(`${id}:azzera`);
    setEsitoRiga(prev => { const n = { ...prev }; delete n[id]; return n; });

    try {
      // Supabase non lancia: l'errore (es. RLS che nega l'update) torna in
      // `error`. Prima non veniva controllato e l'alert dava sempre "successo"
      // anche quando nessuna riga era stata modificata.
      const { error } = await supabase
        .from('shared_pois')
        .update({ image_url: '', photo_url: '' })
        .eq('id', id);

      if (error) {
        console.error("Error resetting photo", error);
        setEsitoRiga(prev => ({
          ...prev,
          [id]: { tipo: 'errore', testo: 'Impossibile azzerare la foto: ' + (error.message || 'permesso negato o errore DB.') }
        }));
        return;
      }

      // Si aggiorna la riga in locale invece di ricaricare tutta la tabella.
      setPois(prev => prev.map(p => p.id === id ? { ...p, image_url: '', photo_url: '' } : p));
      setEsitoRiga(prev => ({
        ...prev,
        [id]: { tipo: 'ok', testo: 'Foto azzerata. Usa "Cerca foto" per trovarne una reale.' }
      }));
    } catch (err: any) {
      console.error("Error resetting photo", err);
      setEsitoRiga(prev => ({
        ...prev,
        [id]: { tipo: 'errore', testo: 'Impossibile azzerare la foto: ' + (err?.message || 'errore imprevisto.') }
      }));
    } finally {
      setAzioneInCorso(null);
    }
  };

  const filteredPois = pois.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Paginazione client: prima venivano stampate in tabella TUTTE le righe filtrate.
  const totalePagine = Math.max(1, Math.ceil(filteredPois.length / RIGHE_PER_PAGINA));
  const paginaCorrente = Math.min(pagina, totalePagine - 1);
  const poisPagina = filteredPois.slice(paginaCorrente * RIGHE_PER_PAGINA, (paginaCorrente + 1) * RIGHE_PER_PAGINA);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-primary flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-secondary" />
            Report POI Arricchiti
          </h2>
          <p className="text-sm text-on-surface-variant font-medium mt-1">
            Visualizza tutti i luoghi che sono stati arricchiti dall'AI, verifica le descrizioni lunghe e le foto associate.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
           <select 
             value={displayMode} 
             onChange={(e) => setDisplayMode(e.target.value as any)}
             className="px-4 py-2.5 bg-surface border-none rounded-xl text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20"
           >
             <option value="enriched">Mostra: Solo Arricchiti</option>
             <option value="seeded">Mostra: Solo Grezzi (Seeding)</option>
             <option value="all">Mostra: Tutti</option>
           </select>
           <select 
             value={filterMode} 
             onChange={(e) => setFilterMode(e.target.value as any)}
             className="px-4 py-2.5 bg-surface border-none rounded-xl text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20"
           >
             <option value="today">Oggi</option>
             <option value="month">Questo Mese</option>
             <option value="all">Sempre</option>
           </select>
           <button 
            onClick={fetchPois} 
            disabled={isLoading}
            className="p-2.5 bg-surface hover:bg-outline-variant text-primary rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 font-bold text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Aggiorna
          </button>
          <button 
            onClick={triggerBatchEnrich} 
            disabled={isBatching}
            className="p-2.5 bg-primary hover:bg-primary/90 text-secondary rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 font-bold text-sm shadow-sm"
            title="Arricchisce automaticamente 50 POI grezzi usando l'IA"
          >
            <Sparkles className={`w-4 h-4 ${isBatching ? 'animate-pulse' : ''}`} />
            {isBatching ? 'Elaborazione in corso...' : 'Avvia Arricchimento (50)'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 p-4 bg-surface rounded-2xl border border-outline-variant">
        <div className="flex-1 text-center">
          <div className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Totale Periodo</div>
          <div className="text-2xl font-black text-primary">{stats.total}</div>
        </div>
        <div className="w-px bg-gray-200"></div>
        <div className="flex-1 text-center">
          <div className="text-sm font-bold text-emerald-600 uppercase tracking-wider">POI Arricchiti</div>
          <div className="text-2xl font-black text-emerald-700">{stats.enriched}</div>
          <div className="text-xs text-emerald-600/70 font-medium">con AI / Wiki</div>
        </div>
        <div className="w-px bg-gray-200"></div>
        <div className="flex-1 text-center">
          <div className="text-sm font-bold text-amber-600 uppercase tracking-wider">POI Grezzi (Seeding)</div>
          <div className="text-2xl font-black text-amber-700">{stats.seeded}</div>
          <div className="text-xs text-amber-600/70 font-medium">da arricchire</div>
        </div>
      </div>

      {/* Copertura per campo: il "sì/no arricchito" nasconde i buchi (es. POI
          con descrizione ma senza copione audio o senza foto). */}
      {stats.total > 0 && (
        <div className="p-4 bg-surface rounded-2xl border border-outline-variant">
          <div className="text-xs font-black text-primary uppercase tracking-wider mb-3">
            Copertura campi sul periodo ({stats.total} POI)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {fieldStats.map(f => {
              const pct = Math.round((f.count / stats.total) * 100);
              const tone = pct >= 80 ? 'emerald' : pct >= 40 ? 'amber' : 'red';
              return (
                <div key={f.key} className="bg-white rounded-xl p-3 border border-outline-variant/40">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-bold text-on-surface-variant">{f.label}</span>
                    <span className={`text-sm font-black ${tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-red-700'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-on-surface-variant/70 font-medium">
                    {f.count.toLocaleString('it-IT')} su {stats.total.toLocaleString('it-IT')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-on-surface-variant/40" />
        <input 
          type="text" 
          placeholder="Cerca POI per nome o categoria..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-surface pl-10 pr-4 py-3 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-outline-variant">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
            <tr>
              <th className="p-4">Luogo</th>
              <th className="p-4">Foto Reale</th>
              <th className="p-4">Stato Arricchimento</th>
              <th className="p-4">Aggiornato Il</th>
              <th className="p-4 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium">
            {filteredPois.map((poi) => {
              const photo = poi.image_url || poi.photo_url;
              const hasUnsplash = photo && photo.includes('unsplash');
              
              return (
                <tr key={poi.id} className="hover:bg-surface-variant/50">
                  <td className="p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                        {poi.is_gem ? <Sparkles className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-bold text-primary line-clamp-1">{poi.name}</p>
                        <p className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest">{poi.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {photo ? (
                        <>
                          <img src={photo} alt={poi.name} className="w-10 h-10 object-cover rounded-lg border border-outline-variant" />
                          {hasUnsplash && <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">UNSPLASH</span>}
                        </>
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 flex items-center justify-center rounded-lg text-on-surface-variant">
                           <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    {/* Un chip per ogni campo: a colpo d'occhio si vede COSA manca */}
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {[
                        { label: 'Short', ok: !!poi.description_short?.trim() },
                        { label: 'Long', ok: !!(poi.description_long?.trim() || poi.description_ai?.trim()) },
                        { label: 'Audio', ok: !!poi.audio_script?.trim() },
                        { label: 'Teaser', ok: !!poi.teaser_text_it?.trim() },
                      ].map(chip => (
                        <span
                          key={chip.label}
                          title={`${chip.label}: ${chip.ok ? 'presente' : 'mancante'}`}
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
                            chip.ok ? 'text-emerald-700 bg-emerald-50' : 'text-gray-400 bg-gray-100 line-through'
                          }`}
                        >
                          {chip.ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                     <span className="text-xs text-on-surface-variant flex items-center gap-1.5 whitespace-nowrap">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {new Date(poi.enriched_at || poi.created_at || Date.now()).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                     </span>
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                     <button 
                       onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`, '_blank')}
                       className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                       title="Vedi su Mappa"
                     >
                       <ExternalLink className="w-4 h-4" />
                     </button>
                     <button 
                       onClick={() => handleResetPhoto(poi.id, poi.name)}
                       className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                     >
                       Azzera Foto
                     </button>
                  </td>
                </tr>
              );
            })}
            
            {filteredPois.length === 0 && !isLoading && (
               <tr>
                 <td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">
                   Nessun POI trovato con i filtri attuali.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
