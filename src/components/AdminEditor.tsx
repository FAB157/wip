import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { 
  Search, RefreshCw, CheckCircle2, AlertTriangle, Sparkles, Volume2,
  Image as ImageIcon, Globe, Check, Edit, HelpCircle, MapPin, Plus, Ban, Info
} from 'lucide-react';

interface POI {
  id: string;
  lat: number;
  lon: number;
  name: string;
  category: string;
  description_ai: string | null;
  image_url: string | null;
  is_gem?: boolean;
  audio_url?: string | null;
  status?: 'draft' | 'verified' | 'needs_revision' | 'auto' | 'banned';
  last_reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at?: string;
  hasPendingEdits?: boolean;
}

/** Opzione foto proposta dal curatore: URL + fonte reale + attribuzione. */
interface ImageOption {
  url: string;
  source: string;
  attribution?: string;
}

export default function AdminEditor() {
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'text' | 'audio' | 'photo'>('text');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'needs_revision'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce per evitare troppe chiamate al server
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // State for curation operations
  const [isLoading, setIsLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [editedText, setEditedText] = useState('');
  const [imageOptions, setImageOptions] = useState<ImageOption[] | null>(null);
  // Cache di sessione delle ricerche foto per POI: evita di ripetere le
  // chiamate a Wikimedia/Wikipedia/Unsplash per un POI già cercato.
  const imageSearchCache = useRef<Record<string, ImageOption[]>>({});
  
  // Audio state
  const [audioLang, setAudioLang] = useState<'IT' | 'EN' | 'FR' | 'DE' | 'ES' | 'ZH'>('IT');
  const [audioVoiceMode, setAudioVoiceMode] = useState<'nicky' | 'dante'>('nicky');

  // Form states for manual POI creation
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPoiForm, setNewPoiForm] = useState({
    lat: '',
    lon: '',
    name: '',
    category: 'monumenti',
    description: '',
    isGem: false,
    imageUrl: ''
  });

  const handleCreatePoi = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const latVal = parseFloat(newPoiForm.lat);
      const lonVal = parseFloat(newPoiForm.lon);
      
      if (isNaN(latVal) || isNaN(lonVal)) {
        throw new Error('Coordinate lat/lon non valide.');
      }
      
      // Logica ID deterministico a precisione 4 decimali
      const latId = latVal.toFixed(4).replace('.', '_');
      const lonId = lonVal.toFixed(4).replace('.', '_');
      const poiId = `${latId}_${lonId}`;

      const { data: { session } } = await supabase.auth.getSession();
      const adminId = session?.user?.id || null;

      const newRecord = {
        id: poiId,
        lat: latVal,
        lon: lonVal,
        name: newPoiForm.name,
        category: newPoiForm.category,
        description_ai: newPoiForm.description,
        is_gem: newPoiForm.isGem,
        image_url: newPoiForm.imageUrl || null,
        verified: false,
        status: 'draft',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('shared_pois').insert([newRecord]);
      
      if (error) {
        throw error;
      }

      setNewPoiForm({
        lat: '',
        lon: '',
        name: '',
        category: 'monumenti',
        description: '',
        isGem: false,
        imageUrl: ''
      });
      
      setShowCreateForm(false);
      setMessage({ type: 'success', text: 'Nuovo POI creato con successo!' });
      
      await fetchPois();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore durante la creazione del POI: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Load POIs on mount and when filter changes
  useEffect(() => {
    fetchPois();
  }, [debouncedSearchTerm, statusFilter]);

  const fetchPois = async () => {
    setListLoading(true);
    setMessage(null);
    try {
      let query = supabase.from('shared_pois').select('*').limit(2000);

      // Ricerca server-side (trova anche i POI oltre i primi 1000). I caratteri
      // virgola/parentesi/asterisco rompono la SINTASSI del filtro .or() di
      // PostgREST — es. "Museo (MART)" o "chiese, musei" facevano fallire la
      // query e comparire il messaggio d'errore. Li neutralizziamo; l'apostrofo
      // resta valido dentro ilike ma lo tolleriamo cercando la parte restante.
      const term = debouncedSearchTerm.trim();
      if (term.length > 0) {
        const safe = term.replace(/[,()*']/g, ' ').replace(/\s+/g, ' ').trim();
        if (safe.length > 0) {
          query = query.or(`name.ilike.%${safe}%,category.ilike.%${safe}%,description_short.ilike.%${safe}%`);
        }
      }

      if (statusFilter === 'draft') {
        query = query.eq('verified', false);
      } else if (statusFilter === 'needs_revision') {
        // Colonna `status`: potrebbe non esistere su tutti i DB → gestita col
        // retry sotto.
        query = query.eq('status', 'needs_revision');
      }

      let poisResponse = await query.order('created_at', { ascending: false });

      // Retry difensivo: se il filtro status/search rompe la query (colonna
      // mancante 42703, sintassi .or), riprova con la SOLA ricerca sul nome
      // così l'editor resta usabile invece di svuotarsi con un errore.
      if (poisResponse.error) {
        console.warn('[AdminEditor] query completa fallita, retry minimale:', poisResponse.error?.message);
        let retry = supabase.from('shared_pois').select('*').limit(2000);
        const t = debouncedSearchTerm.trim().replace(/[,()*']/g, ' ').replace(/\s+/g, ' ').trim();
        if (t.length > 0) retry = retry.ilike('name', `%${t}%`);
        poisResponse = await retry.order('created_at', { ascending: false });
      }
      if (poisResponse.error) throw poisResponse.error;

      const mappedPois = (poisResponse.data || []).map((p: any) => ({
        ...p,
        status: p.status || (p.verified ? 'verified' : 'draft'),
        is_gem: p.is_gem || (p.category === 'gemme') || false
      }));

      setPois(mappedPois);

      // "Nessun risultato" NON è un errore: distinguo per non allarmare l'admin.
      if (mappedPois.length === 0 && debouncedSearchTerm.trim().length > 0) {
        setMessage({ type: 'info', text: `Nessun POI trovato per "${debouncedSearchTerm.trim()}". Prova con meno parole o un termine più breve.` });
      }

      // Auto-select first POI if nothing selected yet
      if (mappedPois.length > 0 && !selectedPoi) {
        selectPoiItem(mappedPois[0]);
      } else if (selectedPoi) {
        // Keep current selected POI updated with fresh DB details
        const updated = mappedPois.find(p => p.id === selectedPoi.id);
        if (updated) {
          selectPoiItem(updated);
        }
      }
    } catch (err: any) {
      console.error('Error fetching POIs:', err);
      // Niente POI demo fittizi: mostrerebbero dati inesistenti nel pannello
      // admin. Meglio uno stato di errore reale con lista vuota.
      setPois([]);
      setSelectedPoi(null);
      setMessage({
        type: 'error',
        text: 'Errore nel caricamento dei POI dal database: ' + (err?.message || 'connessione non disponibile.')
      });
    } finally {
      setListLoading(false);
    }
  };

  const selectPoiItem = (poi: POI) => {
    setShowCreateForm(false);
    setSelectedPoi(poi);
    setEditedText(poi.description_ai || '');
    setMessage(null);
    setImageOptions(null);
  };


  // Perform AI operations via the backend API orchestrator
  const handleRegenerateAction = async (type: 'text' | 'audio' | 'image' | 'translate') => {
    if (!selectedPoi) return;

    // Foto già cercate per questo POI in questa sessione: riusa i risultati
    // senza richiamare il server (le fonti esterne non cambiano in minuti).
    if (type === 'image') {
      const cached = imageSearchCache.current[selectedPoi.id];
      if (cached && cached.length > 0) {
        setImageOptions(cached);
        setMessage({ type: 'success', text: `${cached.length} foto già trovate in questa sessione (cache locale).` });
        return;
      }
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const payload: any = {
        poi_id: selectedPoi.id,
        type
      };

      if (type === 'audio') {
        payload.lang = audioLang;
        payload.guide_mode = audioVoiceMode;
      }

      if (type === 'text') {
        // We can pass current name and category to make it more precise
        payload.name = selectedPoi.name;
        payload.category = selectedPoi.category;
        payload.lat = selectedPoi.lat;
        payload.lon = selectedPoi.lon;
      }

      if (type === 'image') {
        // Il server cerca foto REALI del luogo: serve il nome (Wikimedia
        // Commons / pagina Wikipedia) e le coordinate, usate per ricavare la
        // città nel fallback Unsplash "<nome poi> <città>".
        payload.name = selectedPoi.name;
        payload.lat = selectedPoi.lat;
        payload.lon = selectedPoi.lon;
      }

      // If translating, send the active curated text to translate in parallel
      if (type === 'translate') {
        payload.text = editedText;
      }

      // Il server ora esige un token admin valido: senza Authorization risponde 403.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Sessione scaduta: effettua di nuovo il login.');
      }

      const res = await fetch(getApiUrl('/api/poi/regenerate-content'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Operazione fallita sul server.');
      }

      // Success feedback
      setMessage({ type: 'success', text: result.message || 'Operazione completata con successo!' });

      // Update local state reactively
      if (type === 'text' && result.description) {
        setEditedText(result.description);
        updateLocalPoiState(selectedPoi.id, { 
          description_ai: result.description, 
          status: 'needs_revision' 
        });
      } else if (type === 'image' && result.image_options) {
        // Compat: il server ora restituisce oggetti {url, source, attribution};
        // le risposte legacy erano semplici stringhe URL.
        const normalized: ImageOption[] = (result.image_options as any[]).map((opt: any) =>
          typeof opt === 'string' ? { url: opt, source: 'web' } : opt
        );
        imageSearchCache.current[selectedPoi.id] = normalized;
        setImageOptions(normalized);
      } else if (type === 'translate') {
        updateLocalPoiState(selectedPoi.id, { 
          status: 'needs_revision' 
        });
      } else if (type === 'audio') {
        // Audio generation updates cache, status becomes needs_revision
        updateLocalPoiState(selectedPoi.id, { 
          status: 'needs_revision' 
        });
      }

    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Errore durante la rigenerazione.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Local state helper for real-time reactivity without page reloads
  const updateLocalPoiState = (id: string, updates: Partial<POI>) => {
    setPois(prev => prev.map(p => {
      if (p.id === id) {
        const next = { ...p, ...updates };
        if (selectedPoi && selectedPoi.id === id) {
          setSelectedPoi(next);
        }
        return next;
      }
      return p;
    }));
  };

  // Save changes locally (status becomes needs_revision/draft)
  const saveLocalTextChanges = async () => {
    if (!selectedPoi) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const updates = {
        description_ai: editedText,
        // La foto scelta ("Cerca Foto sul Web") vive solo in selectedPoi finché
        // non la si persiste: senza questo campo non veniva MAI salvata.
        image_url: selectedPoi.image_url,
        verified: false,
        status: 'needs_revision'
      };

      const { error } = await supabase
        .from('shared_pois')
        .update(updates)
        .eq('id', selectedPoi.id);

      if (error) throw error;

      const localUpdates: Partial<POI> = {
        description_ai: editedText,
        status: 'needs_revision'
      };

      updateLocalPoiState(selectedPoi.id, localUpdates);
      setMessage({ type: 'success', text: 'Modifiche salvate in bozza con successo!' });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore nel salvataggio: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // APPROVA E PUBBLICA (status = verified)
  const approveAndPublish = async () => {
    if (!selectedPoi) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const updates = {
        description_ai: editedText,
        // Come sopra: pubblichiamo anche la foto scelta dal curatore.
        image_url: selectedPoi.image_url,
        verified: true,
        status: 'verified',
        is_hidden: false
      };

      const { error } = await supabase
        .from('shared_pois')
        .update(updates)
        .eq('id', selectedPoi.id);

      if (error) throw error;

      const localUpdates: Partial<POI> = {
        description_ai: editedText,
        status: 'verified',
        hasPendingEdits: false
      };
      
      updateLocalPoiState(selectedPoi.id, localUpdates);
      setMessage({ type: 'success', text: 'POI approvato con successo e pubblicato live!' });
      
      // Refresh list to sync filters
      setTimeout(() => fetchPois(), 500);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore durante l\'approvazione: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // BANNA E RIMUOVI (status = banned)
  const banPoi = async () => {
    if (!selectedPoi) return;
    if (!confirm('Sei sicuro di voler bannare questo POI? Verrà nascosto dalla mappa e non verrà più scaricato automaticamente.')) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const updates = {
        status: 'banned',
        verified: false,
        is_hidden: true
      };

      const { error } = await supabase
        .from('shared_pois')
        .update(updates)
        .eq('id', selectedPoi.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'POI bannato con successo!' });
      setTimeout(() => {
        setSelectedPoi(null);
        fetchPois();
      }, 500);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore durante il ban: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState<10 | 50 | 100>(10);

  // Filtro client-side per feedback immediato mentre si digita. Deve essere
  // ALMENO permissivo quanto la ricerca server-side (nome/categoria/descrizione),
  // altrimenti nasconde POI che il server ha già trovato (es. match sulla
  // descrizione). Ignora virgola/parentesi come lato server.
  const cleanTerm = searchTerm.toLowerCase().replace(/[,()*']/g, ' ').trim();
  const filteredPois = pois.filter(p => {
    const hay = `${p.name || ''} ${p.category || ''} ${p.description_short || ''}`.toLowerCase();
    const matchesSearch = cleanTerm.length === 0 || hay.includes(cleanTerm);
    if (statusFilter === 'all') return matchesSearch;
    return p.status === statusFilter && matchesSearch;
  });

  // Reset to page 0 when filters / page size change
  React.useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter, pageSize]);

  // Paginated slice of filtered list
  const totalPages = Math.max(1, Math.ceil(filteredPois.length / pageSize));
  const pagedPois = filteredPois.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <div className="bg-surface-variant rounded-3xl border border-outline-variant p-1 md:p-4 shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
        
        {/* LEFT PANEL: POIs List (40% width / 5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-4 border-r border-outline-variant pr-0 lg:pr-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-primary uppercase tracking-wider">
                POI ({filteredPois.length})
              </h4>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setSelectedPoi(null);
                    setShowCreateForm(true);
                    setMessage(null);
                  }}
                  className="px-2.5 py-1.5 bg-primary hover:opacity-95 text-secondary rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm transition-all active:scale-95"
                  title="Aggiungi Nuovo POI"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuovo POI
                </button>
                <button 
                  onClick={fetchPois}
                  disabled={listLoading}
                  className="p-2 bg-surface-variant hover:bg-outline-variant rounded-xl text-on-surface-variant transition-colors"
                  title="Ricarica lista POI"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-primary/50 uppercase tracking-wider whitespace-nowrap">Mostra:</span>
              <div className="flex bg-surface p-0.5 rounded-xl gap-0.5">
                {([10, 50, 100] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setPageSize(size)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                      pageSize === size
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-primary/50 hover:text-primary'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-primary/40 font-medium ml-auto">
                {filteredPois.length === 0 ? '0' : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filteredPois.length)}`} di {filteredPois.length}
              </span>
            </div>

            {/* Filter Bar */}
            <div className="flex bg-surface p-1 rounded-2xl gap-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  statusFilter === 'all' ? 'bg-surface text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
                }`}
              >
                Tutti
              </button>
              <button
                onClick={() => setStatusFilter('draft')}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  statusFilter === 'draft' ? 'bg-surface text-orange-600 shadow-sm' : 'text-primary/60 hover:text-orange-600'
                }`}
              >
                Bozze
              </button>
              <button
                onClick={() => setStatusFilter('needs_revision')}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  statusFilter === 'needs_revision' ? 'bg-surface text-rose-600 shadow-sm' : 'text-primary/60 hover:text-rose-600'
                }`}
              >
                Revisioni
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-primary/40" />
              <input 
                type="text" 
                placeholder="Filtra per nome o categoria..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-surface pl-10 pr-4 py-2 border-none rounded-xl text-xs font-bold focus:ring-primary/20 focus:bg-surface transition-all"
              />
            </div>
          </div>

          {/* List Scroller */}
          <div className="flex-1 overflow-y-auto no-scrollbar max-h-[500px] space-y-2">
            {listLoading && pois.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-primary/50" />
                <span className="text-xs font-bold">Caricamento POI in corso...</span>
              </div>
            ) : filteredPois.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-2xl border border-dashed border-outline-variant">
                <HelpCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-on-surface-variant">Nessun POI trovato con questi filtri.</p>
              </div>
            ) : (
              pagedPois.map(p => {
                const isSelected = selectedPoi?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => selectPoiItem(p)}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-emerald-50/50 border-primary shadow-sm' 
                        : 'bg-surface border-outline-variant hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="font-black text-primary text-xs leading-tight line-clamp-1">{p.name}</h5>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
                          p.status === 'verified' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : p.status === 'needs_revision' 
                              ? 'bg-rose-100 text-rose-800' 
                              : 'bg-orange-100 text-orange-800'
                        }`}>
                          {p.status === 'verified' ? 'Pubblicato' : p.status === 'needs_revision' ? 'Da Rivedere' : 'Bozza'}
                        </span>
                        {p.hasPendingEdits && (
                          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 bg-blue-100 text-blue-800 animate-pulse">
                            Shadow Edit
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[9px] font-bold text-primary/65 uppercase tracking-wide">
                        {p.category}
                      </span>
                      <span className="text-[8px] font-mono text-on-surface-variant">
                        {Number(p.lat || 0).toFixed(4)}, {Number(p.lon || 0).toFixed(4)}
                      </span>
                    </div>

                    {p.is_gem && (
                      <span className="inline-block text-[8px] font-black tracking-widest bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded mt-1.5">
                        💎 GEMMA
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Workstation Detail (60% width / 7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {showCreateForm ? (
            <div className="bg-surface rounded-3xl border border-outline-variant p-5 space-y-5 shadow-sm h-full flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-outline-variant pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-black text-primary leading-tight">Crea Nuovo POI</h3>
                    <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">Inserisci un nuovo Punto di Interesse partendo dalle coordinate geografiche.</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setMessage(null);
                    }}
                    className="text-xs font-black text-rose-600 hover:underline uppercase"
                  >
                    Annulla
                  </button>
                </div>

                {message && (
                  <div className={`p-3.5 rounded-2xl flex items-center gap-3 text-xs font-bold ${
                    message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                    : message.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-100'
                    : 'bg-red-50 text-red-800 border border-red-100'
                  }`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : message.type === 'info' ? <Info className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{message.text}</span>
                  </div>
                )}

                <form onSubmit={handleCreatePoi} className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">Latitudine *</label>
                      <input
                        type="number"
                        step="any"
                        value={newPoiForm.lat}
                        onChange={e => setNewPoiForm({ ...newPoiForm, lat: e.target.value })}
                        placeholder="es. 44.0792"
                        className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:bg-surface outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">Longitudine *</label>
                      <input
                        type="number"
                        step="any"
                        value={newPoiForm.lon}
                        onChange={e => setNewPoiForm({ ...newPoiForm, lon: e.target.value })}
                        placeholder="es. 10.1000"
                        className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:bg-surface outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">Nome Monumento/Attrazione *</label>
                    <input
                      type="text"
                      value={newPoiForm.name}
                      onChange={e => setNewPoiForm({ ...newPoiForm, name: e.target.value })}
                      placeholder="es. Duomo di Carrara"
                      className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:bg-surface outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-center">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">Categoria *</label>
                      <select
                        value={newPoiForm.category}
                        onChange={e => setNewPoiForm({ ...newPoiForm, category: e.target.value })}
                        className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:bg-surface outline-none"
                      >
                        <option value="monumenti">Monumenti</option>
                        <option value="musei">Musei</option>
                        <option value="chiese">Chiese</option>
                        <option value="panorami">Panorami</option>
                        <option value="locali">Locali</option>
                        <option value="utilita">Utilità</option>
                        <option value="famiglie">Famiglie</option>
                        <option value="gemme">Gemme</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 mt-4 select-none">
                      <input
                        type="checkbox"
                        id="new_is_gem"
                        checked={newPoiForm.isGem}
                        onChange={e => setNewPoiForm({ ...newPoiForm, isGem: e.target.checked })}
                        className="w-4 h-4 accent-[#1e3a8a] border-gray-300 rounded cursor-pointer"
                      />
                      <label htmlFor="new_is_gem" className="text-xs font-bold text-primary cursor-pointer">
                        Marca come Gemma Esclusiva 💎
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">URL Immagine (Opzionale)</label>
                    <input
                      type="text"
                      value={newPoiForm.imageUrl}
                      onChange={e => setNewPoiForm({ ...newPoiForm, imageUrl: e.target.value })}
                      placeholder="es. https://upload.wikimedia.org/..."
                      className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:bg-surface outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">Descrizione Curata / AI *</label>
                    <textarea
                      value={newPoiForm.description}
                      onChange={e => setNewPoiForm({ ...newPoiForm, description: e.target.value })}
                      placeholder="Scrivi qui la descrizione storica dettagliata..."
                      className="w-full bg-surface border-none rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:bg-surface min-h-[100px] outline-none resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-primary hover:opacity-95 text-secondary font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Crea e Registra POI
                  </button>
                </form>
              </div>
            </div>
          ) : selectedPoi ? (
            <div className="bg-surface rounded-3xl border border-outline-variant p-5 space-y-5 shadow-sm h-full flex flex-col justify-between">
              
              {/* Curation Workspace Header */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2 border-b border-outline-variant pb-3">
                  <div>
                    <h3 className="text-lg font-black text-primary leading-tight">{selectedPoi.name}</h3>
                    <p className="text-[10px] text-on-surface-variant font-mono mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary/65" /> {selectedPoi.id}
                    </p>
                  </div>
                  
                  <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                    selectedPoi.status === 'verified' 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : selectedPoi.status === 'needs_revision' 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-orange-100 text-orange-800'
                  }`}>
                    Stato: {selectedPoi.status === 'verified' ? 'Approvato' : selectedPoi.status === 'needs_revision' ? 'In Revisione' : 'Bozza'}
                  </span>
                </div>

                {/* Granular Workstation tabs selector */}
                <div className="flex border-b border-outline-variant gap-1">
                  <button
                    onClick={() => setActiveSubTab('text')}
                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                      activeSubTab === 'text' 
                        ? 'border-primary text-primary' 
                        : 'border-transparent text-on-surface-variant hover:text-on-surface-variant'
                    }`}
                  >
                    Testo (AI/Traduzioni)
                  </button>
                  <button
                    onClick={() => setActiveSubTab('audio')}
                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                      activeSubTab === 'audio' 
                        ? 'border-primary text-primary' 
                        : 'border-transparent text-on-surface-variant hover:text-on-surface-variant'
                    }`}
                  >
                    Audio (Lingue & Personas)
                  </button>
                  <button
                    onClick={() => setActiveSubTab('photo')}
                    className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                      activeSubTab === 'photo' 
                        ? 'border-primary text-primary' 
                        : 'border-transparent text-on-surface-variant hover:text-on-surface-variant'
                    }`}
                  >
                    Foto (Wikimedia)
                  </button>
                </div>
              </div>

              {/* Status Message Alerts inside the panel */}
              {message && (
                <div className={`p-3.5 rounded-2xl flex items-center gap-3 text-xs font-bold ${
                  message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                  : message.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-100'
                  : 'bg-red-50 text-red-800 border border-red-100'
                }`}>
                  {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : message.type === 'info' ? <Info className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Curation Sub-workspace viewport */}
              <div className="flex-1 min-h-[300px] overflow-y-auto no-scrollbar">
                
                {/* 1. TEXT TAB */}
                {activeSubTab === 'text' && (
                  <div className="space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-primary/60">Descrizione del POI Curata</label>
                        <p className="text-[9px] text-on-surface-variant font-medium">Questa descrizione verrà utilizzata per generare le audioguide.</p>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRegenerateAction('text')}
                          disabled={isLoading}
                          className="px-3 py-1.5 bg-surface hover:bg-primary/5 text-primary rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {isLoading ? 'Generazione...' : 'Rigenera Testo'}
                        </button>
                        
                        <button
                          onClick={() => handleRegenerateAction('translate')}
                          disabled={isLoading || !editedText}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                          title="Traduce automaticamente in EN, FR, DE, ES, ZH usando Gemini"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          {isLoading ? 'Traduzione...' : 'Traduzione Multi-lingua'}
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={editedText}
                      onChange={e => setEditedText(e.target.value)}
                      placeholder="Scrivi qui la descrizione geolocalizzata e curata del POI..."
                      className="w-full bg-surface focus:bg-surface border-none rounded-2xl p-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 min-h-[200px] leading-relaxed transition-all"
                    />
                  </div>
                )}

                {/* 2. AUDIO TAB */}
                {activeSubTab === 'audio' && (
                  <div className="space-y-5">
                    <div>
                      <h4 className="text-xs font-black text-primary uppercase tracking-wider">Configuratore Audioguida Curation</h4>
                      <p className="text-[10px] text-on-surface-variant font-medium">Configura la lingua e la voce e rigenera l'audio guida per la cache.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Language dropdown */}
                      <div className="bg-surface p-3.5 rounded-2xl space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block">Lingua Voce</label>
                        <select
                          value={audioLang}
                          onChange={e => setAudioLang(e.target.value as any)}
                          className="w-full bg-surface border-none rounded-xl p-2.5 text-xs font-black text-primary focus:ring-primary/10"
                        >
                          <option value="IT">🇮🇹 Italiano (IT)</option>
                          <option value="EN">🇬🇧 English (EN)</option>
                          <option value="FR">🇫🇷 Français (FR)</option>
                          <option value="DE">🇩🇪 Deutsch (DE)</option>
                          <option value="ES">🇪🇸 Español (ES)</option>
                          <option value="ZH">🇨🇳 中文 (ZH)</option>
                        </select>
                      </div>

                      {/* Character/Persona select */}
                      <div className="bg-surface p-3.5 rounded-2xl space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 block">Persona / Narratore</label>
                        <select
                          value={audioVoiceMode}
                          onChange={e => setAudioVoiceMode(e.target.value as any)}
                          className="w-full bg-surface border-none rounded-xl p-2.5 text-xs font-black text-primary focus:ring-primary/10"
                        >
                          <option value="nicky">Nicky (Moderna Guida Locale)</option>
                          <option value="dante">Dante (Storico Accademico)</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50/30 border border-emerald-100/50 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <Volume2 className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-wider">Generazione Audio Guide Neurali</span>
                      </div>
                      <p className="text-[10px] text-emerald-900/70 font-medium leading-relaxed">
                        Il sistema sintetizzerà il testo della descrizione curata utilizzando le migliori voci neurali locali (es. Azure Conrad/Katja per il Tedesco, Diego/Elsa per l'Italiano) e salverà l'MP3 direttamente nella cache audio del database.
                      </p>
                      
                      <button
                        onClick={() => handleRegenerateAction('audio')}
                        disabled={isLoading || !editedText}
                        className="w-full py-3 bg-primary hover:opacity-95 disabled:opacity-50 text-secondary rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Volume2 className="w-4 h-4 shrink-0" />
                        {isLoading ? 'Sintesi Audio in corso...' : 'Rigenera Audio guida'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. PHOTO TAB */}
                {activeSubTab === 'photo' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-primary uppercase tracking-wider">Curatore Foto & Copertina</h4>
                      <p className="text-[10px] text-on-surface-variant font-medium">Foto reali del luogo da Wikimedia Commons e Wikipedia; Unsplash (cercando "nome + città") solo come ultimo fallback.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="h-44 w-full rounded-2xl overflow-hidden bg-gray-100 border border-outline-variant relative shadow-sm">
                        {selectedPoi.image_url ? (
                          <img 
                            src={selectedPoi.image_url} 
                            alt={selectedPoi.name} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant gap-1">
                            <ImageIcon className="w-8 h-8" />
                            <span className="text-[10px] font-bold">Nessuna foto impostata</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="bg-surface p-3 rounded-xl">
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary/65 block mb-1">URL Immagine Attuale</span>
                          <input 
                            type="text" 
                            value={selectedPoi.image_url || ''}
                            onChange={e => updateLocalPoiState(selectedPoi.id, { image_url: e.target.value })}
                            className="w-full bg-surface border-none rounded-lg p-2 text-[10px] font-mono"
                            placeholder="Nessuna URL"
                          />
                        </div>

                        <button
                          onClick={() => handleRegenerateAction('image')}
                          disabled={isLoading}
                          className="w-full py-2.5 bg-surface hover:bg-primary/5 text-primary rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                          <ImageIcon className="w-4 h-4 shrink-0" />
                          {isLoading ? 'Ricerca in corso...' : 'Cerca Foto sul Web'}
                        </button>
                      </div>
                    </div>

                    {imageOptions && imageOptions.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Seleziona una foto reale del luogo:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {imageOptions.map((opt, i) => (
                            <div
                              key={opt.url}
                              onClick={() => {
                                updateLocalPoiState(selectedPoi.id, { image_url: opt.url, status: 'needs_revision' });
                                setImageOptions(null);
                                setMessage({ type: 'success', text: 'Foto impostata localmente. Salva le modifiche o pubblica per applicarla!' });
                              }}
                              className="h-28 rounded-xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-primary transition-all relative group bg-gray-100"
                              title={opt.attribution || opt.source}
                            >
                              <img src={opt.url} alt={`Opzione ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                              {/* Attribuzione sempre visibile: fonte reale della foto */}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-3 pb-1">
                                <span className="block text-[8px] font-bold text-white truncate">
                                  {opt.attribution || opt.source}
                                </span>
                              </div>
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Check className="w-6 h-6 text-white" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Curation Footer Actions Workspace */}
              <div className="flex flex-col sm:flex-row gap-2 border-t border-outline-variant pt-4 mt-2">
                <button
                  type="button"
                  onClick={banPoi}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
                  title="Nasconde il POI e previene il riscaricamento da OSM"
                >
                  <Ban className="w-4 h-4 shrink-0" />
                  Banna
                </button>
                <button
                  type="button"
                  onClick={saveLocalTextChanges}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-surface hover:bg-outline-variant text-primary font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Salva Modifiche Locale
                </button>
                <button
                  type="button"
                  onClick={approveAndPublish}
                  disabled={isLoading}
                  className="flex-[2] py-3 bg-primary hover:opacity-95 text-secondary font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  Approva e Pubblica live
                </button>
              </div>

            </div>
          ) : (
            <div className="bg-surface rounded-3xl border border-outline-variant p-12 text-center shadow-sm h-full flex flex-col items-center justify-center gap-3">
              <Edit className="w-12 h-12 text-gray-300" />
              <h4 className="font-black text-primary text-sm uppercase tracking-wider">Workstation Curation</h4>
              <p className="text-xs text-on-surface-variant font-bold max-w-sm leading-relaxed">
                Seleziona un POI dalla lista di sinistra per caricare lo studio di rigenerazione, la traduzione multi-lingua e la sintesi vocale neurale.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
