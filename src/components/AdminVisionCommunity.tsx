import { useEffect, useState } from 'react';
import {
  Camera, Loader2, MapPin, CheckCircle2, XCircle, Paperclip, Wand2,
  RefreshCw, ChevronDown, ChevronUp, MessageSquare, Sparkles, Pencil, Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';

type QueueStatus = 'pending' | 'approved' | 'rejected';

/**
 * Tab admin "WIP Community": coda di revisione delle schede Vision.
 * Le foto arrivano ANONIME (il server non espone mai user_id). Azioni:
 * pulizia foto con AI (volti/targhe), approva → nuovo POI community,
 * allega a un POI ufficiale (galleria), rifiuta (resta ricordo privato).
 * All'approvazione l'autore riceve +10 crediti (idempotente lato server).
 */
export default function AdminVisionCommunity() {
  const [status, setStatus] = useState<QueueStatus>('pending');
  const [cards, setCards] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ pending: number; approved: number; rejected: number }>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [cleanPreview, setCleanPreview] = useState<Record<string, string>>({});
  const [attachMode, setAttachMode] = useState<string | null>(null);
  const [attachCandidates, setAttachCandidates] = useState<any[]>([]);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const fetchQueue = async (forStatus: QueueStatus = status) => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/admin/vision/queue?status=${forStatus}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      setCards(Array.isArray(data?.cards) ? data.cards : []);
      if (data?.counts) setCounts(data.counts);
    } catch {
      notify('Caricamento coda Vision non riuscito.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueue(status); }, [status]);

  const notifyReviewed = () => {
    try { window.dispatchEvent(new CustomEvent('wip-vision-review-updated')); } catch {}
  };

  const doReview = async (card: any, action: 'approve' | 'reject' | 'attach', attachPoiId?: string) => {
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id, action, edits: edits[card.id] || {}, attachPoiId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'errore');
      if (action === 'reject') notify('Scheda rifiutata: resta un ricordo privato dell\'utente.');
      else if (action === 'attach') notify(`Foto allegata al POI ufficiale${data?.rewarded ? ` · +${data.rewarded} crediti all'autore` : ''}.`);
      else notify(`POI Community pubblicato${data?.rewarded ? ` · +${data.rewarded} crediti all'autore` : ''}.`);
      setAttachMode(null);
      setExpandedId(null);
      notifyReviewed();
      fetchQueue(status);
    } catch (e: any) {
      notify(`Revisione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  /** Salva le modifiche editoriali di una scheda pubblicata (e del suo POI community). */
  const doUpdate = async (card: any) => {
    const pending = edits[card.id];
    if (!pending || Object.keys(pending).length === 0) {
      notify('Nessuna modifica da salvare.');
      return;
    }
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id, edits: pending }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'errore');
      notify(data?.poi_updated ? 'Modifiche salvate su scheda e POI community.' : 'Modifiche salvate sulla scheda.');
      setExpandedId(null);
      fetchQueue(status);
    } catch (e: any) {
      notify(`Salvataggio non riuscito: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  /** Cancella il POI community nato da questa vision (la scheda torna privata). */
  const doDeletePoi = async (card: any) => {
    if (!window.confirm(`Cancellare il POI community "${card.name}"? La foto pubblica viene rimossa e la scheda torna un ricordo privato dell'utente.`)) return;
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/delete-poi'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      notify('POI community cancellato.');
      notifyReviewed();
      fetchQueue(status);
    } catch (e: any) {
      notify(`Cancellazione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  const doCleanPhoto = async (card: any) => {
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/clean-photo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'errore');
      if (data?.preview) setCleanPreview(prev => ({ ...prev, [card.id]: data.preview }));
      notify('Foto ripulita dall\'AI: verrà pubblicata questa versione.');
    } catch (e: any) {
      notify(`Pulizia AI non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  // Candidati "Allega a POI ufficiale": POI veri (non community) entro ~500m,
  // letti direttamente da shared_pois (SELECT pubblica).
  const loadAttachCandidates = async (card: any) => {
    setAttachMode(card.id);
    setAttachCandidates([]);
    if (card.lat == null || card.lon == null) return;
    try {
      const d = 0.005;
      const { data } = await supabase
        .from('shared_pois')
        .select('id, name, category, lat, lon, image_url')
        .gte('lat', card.lat - d).lte('lat', card.lat + d)
        .gte('lon', card.lon - d).lte('lon', card.lon + d)
        .neq('category', 'community')
        .limit(30);
      const withDist = (data || []).map((p: any) => ({
        ...p,
        _dist: Math.round(Math.hypot((p.lat - card.lat) * 111320, (p.lon - card.lon) * 111320 * Math.cos(card.lat * Math.PI / 180)))
      })).sort((a: any, b: any) => a._dist - b._dist);
      setAttachCandidates(withDist);
    } catch {
      setAttachCandidates([]);
    }
  };

  const setEdit = (cardId: string, field: string, value: string) =>
    setEdits(prev => ({ ...prev, [cardId]: { ...(prev[cardId] || {}), [field]: value } }));

  const editVal = (card: any, field: string) => edits[card.id]?.[field] ?? card[field] ?? '';

  const TILES: { key: QueueStatus; label: string; cls: string }[] = [
    { key: 'pending', label: 'In revisione', cls: 'text-amber-600' },
    { key: 'approved', label: 'Pubblicate', cls: 'text-emerald-600' },
    { key: 'rejected', label: 'Rifiutate', cls: 'text-gray-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-primary text-sm uppercase tracking-widest flex items-center gap-2">
          <Camera className="w-4 h-4" /> WIP Community · Revisione Vision
        </h3>
        <button onClick={() => fetchQueue(status)} className="p-2 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-95 transition-transform">
          <RefreshCw className="w-4 h-4 text-primary" />
        </button>
      </div>

      {/* Tile filtri con conteggi (pattern AdminReports) */}
      <div className="grid grid-cols-3 gap-2">
        {TILES.map(t => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`bg-white rounded-2xl p-3 border shadow-sm text-center transition-all ${status === t.key ? 'border-primary/40 ring-1 ring-primary/20' : 'border-gray-100 hover:border-gray-200'}`}
          >
            <div className={`text-2xl font-black ${t.cls}`}>{counts[t.key]}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t.label}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm font-bold">Caricamento coda…</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm font-bold">
          Nessuna scheda {status === 'pending' ? 'in attesa di revisione' : status === 'approved' ? 'pubblicata' : 'rifiutata'}.
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => {
            const photo = cleanPreview[card.id] || card.clean_signed || card.photo_signed;
            const isOpen = expandedId === card.id;
            const busy = busyId === card.id;
            return (
              <div key={card.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex gap-3 p-3">
                  <div className="w-24 h-24 rounded-2xl bg-gray-100 overflow-hidden shrink-0">
                    {photo ? (
                      <img src={photo} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Camera className="w-7 h-7 text-gray-300" /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-black text-gray-900 text-sm leading-tight line-clamp-2">{card.name}</h4>
                      {card.recognized === false && (
                        <span className="shrink-0 bg-orange-100 text-orange-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md">Non riconosciuta</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {card.city || 'Località sconosciuta'}
                      {card.lat != null && <span>· {Number(card.lat).toFixed(5)}, {Number(card.lon).toFixed(5)}</span>}
                    </p>
                    {card.created_at && (
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                        {new Date(card.created_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {(card.comment_tags?.length > 0 || card.user_comment) && (
                      <div className="mt-1.5 bg-[#f8f5f0] rounded-xl p-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-primary/60 flex items-center gap-1 mb-0.5">
                          <MessageSquare className="w-3 h-3" /> Racconto del viaggiatore
                        </p>
                        {card.comment_tags?.length > 0 && (
                          <p className="text-[10px] font-bold text-primary/80">{card.comment_tags.join(' · ')}</p>
                        )}
                        {card.user_comment && (
                          <p className="text-[10px] text-gray-600 leading-snug line-clamp-3">{card.user_comment}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setExpandedId(isOpen ? null : card.id)} className="self-start p-1.5 text-gray-400 hover:text-primary">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editVal(card, 'name')} onChange={e => setEdit(card.id, 'name', e.target.value)}
                        placeholder="Nome" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                      <input value={editVal(card, 'city')} onChange={e => setEdit(card.id, 'city', e.target.value)}
                        placeholder="Città" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                    </div>
                    <textarea value={editVal(card, 'description_short')} onChange={e => setEdit(card.id, 'description_short', e.target.value)}
                      rows={2} placeholder="Descrizione breve" className="w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
                    <textarea value={editVal(card, 'description_long')} onChange={e => setEdit(card.id, 'description_long', e.target.value)}
                      rows={3} placeholder="Descrizione dettagliata" className="w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
                    <textarea value={editVal(card, 'audio_script')} onChange={e => setEdit(card.id, 'audio_script', e.target.value)}
                      rows={3} placeholder="Testo audioguida (vuoto = composto da descrizione + racconto)" className="w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
                  </div>
                )}

                {status === 'pending' && (
                  <div className="px-3 pb-3 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => doCleanPhoto(card)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      Pulisci foto AI
                    </button>
                    <button disabled={busy} onClick={() => doReview(card, 'approve')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approva → POI Community
                    </button>
                    <button disabled={busy} onClick={() => attachMode === card.id ? setAttachMode(null) : loadAttachCandidates(card)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                      <Paperclip className="w-3.5 h-3.5" />
                      Allega a POI ufficiale
                    </button>
                    <button disabled={busy} onClick={() => doReview(card, 'reject')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                      <XCircle className="w-3.5 h-3.5" />
                      Rifiuta
                    </button>
                  </div>
                )}

                {status === 'approved' && card.published_poi_id && (
                  <div className="px-3 pb-3 space-y-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                      <Sparkles className="w-3 h-3" /> Pubblicata → {card.published_poi_id}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {!isOpen && (
                        <button disabled={busy} onClick={() => setExpandedId(card.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#f8f5f0] text-primary border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                          <Pencil className="w-3.5 h-3.5" />
                          Modifica descrizioni
                        </button>
                      )}
                      {isOpen && (
                        <button disabled={busy} onClick={() => doUpdate(card)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Salva modifiche
                        </button>
                      )}
                      {card.published_poi_id === `vision-${card.id}` && (
                        <button disabled={busy} onClick={() => doDeletePoi(card)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                          Elimina POI
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {attachMode === card.id && (
                  <div className="px-3 pb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">POI ufficiali entro ~500 m (la foto entra nella loro galleria)</p>
                    {attachCandidates.length === 0 ? (
                      <p className="text-[11px] text-gray-400 font-bold">Nessun POI ufficiale nelle vicinanze.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {attachCandidates.map((p: any) => (
                          <button key={p.id} disabled={busy} onClick={() => doReview(card, 'attach', p.id)}
                            className="w-full flex items-center justify-between gap-2 bg-[#f8f5f0] hover:bg-sky-50 border border-gray-200 rounded-xl px-3 py-2 text-left active:scale-[0.99] transition-all disabled:opacity-50">
                            <span className="text-xs font-bold text-gray-800 truncate">{p.name}</span>
                            <span className="text-[9px] font-black text-gray-400 shrink-0">{p._dist} m · {p.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
