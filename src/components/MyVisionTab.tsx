import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, CheckCircle2, Clock, Crown, Loader2, MapPin, Navigation, Sparkles, Trash2, Users, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTranslation, Language } from '../lib/i18n';
import { getApiUrl } from '../lib/api';
import { resolveVisionPhotoUrls } from '../lib/visionPhotos';
import { fetchVisionUpdates, markVisionUpdatesSeen, notifyVisionUpdatesNative, visionRejectReasonLabel, VisionStats, VisionUpdates } from '../lib/visionUpdates';
import { notify } from '../lib/toast';
import { locationService } from '../services/locationService';
import GalleryViewToggle, { useGalleryView } from './GalleryViewToggle';
import VisionCardSheet from './VisionCardSheet';

interface MyVisionTabProps {
  language: Language;
}

/** Schede per pagina (album personale) e per richiesta (feed community). */
const PAGE_SIZE = 30;
const FEED_LIMIT = 40;
const FEED_RADIUS_KM = 50;

/** Solo le colonne che la tab usa davvero (niente select('*'): le schede portano jsonb pesanti). */
const CARD_FIELDS = [
  'id', 'name', 'city', 'artist', 'year', 'style', 'curiosity', 'description_short', 'description_long',
  'history', 'audio_script', 'photo_url', 'created_at', 'lat', 'lon',
  'language', 'reject_reason', 'reject_note', 'first_discoverer', 'reward_credits',
  'published_poi_id', 'published_photo_url', 'review_status', 'recognized',
].join(', ');

const DATE_LOCALE: Record<string, string> = {
  IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN',
};

type FeedMode = 'near' | 'recent';

/**
 * "My Vision": l'album personale delle foto scansionate con la Visione AI.
 * Ogni scatto (riconosciuto o no) diventa una scheda vision_cards con data,
 * luogo e foto originale — il ricordo resta SOLO nell'account dell'utente
 * (bucket privato, URL firmati). Le schede approvate dall'admin diventano
 * luoghi WIP Community sulla mappa. La sottopagina "WIP Community" mostra
 * le Vision approvate di tutti: profili e nomi sono SEMPRE anonimi.
 * Layout: stesso schema per data + griglia dell'ARCHIVIO (cronologia).
 */
export default function MyVisionTab({ language }: MyVisionTabProps) {
  const t = (key: string) => getTranslation(key, language);

  const [view, setView] = useState<'mine' | 'community'>('mine');
  const [cards, setCards] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);

  const [feedMode, setFeedMode] = useState<FeedMode>('recent');
  const [communityCards, setCommunityCards] = useState<any[] | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityLoadingMore, setCommunityLoadingMore] = useState(false);
  const [communityCursor, setCommunityCursor] = useState<string | null>(null);
  const communityPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const feedReqRef = useRef(0);

  const [updates, setUpdates] = useState<VisionUpdates | null>(null);
  const [stats, setStats] = useState<VisionStats | null>(null);

  const [openCard, setOpenCard] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [galleryView, setGalleryView] = useGalleryView();

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  /**
   * Cancella un PROPRIO scatto dall'album. Se la scheda era pubblicata il
   * server ritira anche il POI community ({ retracted: true }) e il feed va
   * ricaricato.
   */
  const deleteCard = async (c: any) => {
    if (deletingId) return;
    const isPublished = c.review_status === 'approved';
    const msg = t('vis_delete_confirm').replace('{name}', c.name || '') + (isPublished ? `\n\n${t('vis_delete_retract')}` : '');
    if (!window.confirm(msg)) return;
    setDeletingId(c.id);
    try {
      const res = await fetch(getApiUrl('/api/vision/delete-card'), {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ cardId: c.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'errore');
      setCards(prev => prev.filter(x => x.id !== c.id));
      setTotal(prev => (prev == null ? prev : Math.max(0, prev - 1)));
      offsetRef.current = Math.max(0, offsetRef.current - 1);
      if (data?.retracted) {
        // Il POI non c'è più nella community: il feed si ricarica alla prossima apertura.
        setCommunityCards(null);
        setCommunityCursor(null);
      }
      notify(t('vis_deleted'));
    } catch {
      notify(t('vis_delete_failed'));
    } finally {
      setDeletingId(null);
    }
  };

  /** Album personale, paginato a 30: `reset` riparte da zero, altrimenti accoda. */
  const fetchCards = async (reset = true) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) {
        setCards([]);
        setTotal(0);
        setHasMore(false);
        return;
      }
      const from = reset ? 0 : offsetRef.current;
      // Il conteggio esatto serve solo alla prima pagina (righe del solo utente: pochissime).
      const { data, error, count } = await supabase
        .from('vision_cards')
        .select(CARD_FIELDS, reset ? { count: 'exact' } : undefined)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows: any[] = data || [];
      // Bucket privato: photo_url è un path → si firma per la visualizzazione
      const photos = await resolveVisionPhotoUrls(rows.map(r => r.photo_url));
      const resolved = rows.map((r, i) => ({ ...r, _photo: photos[i] }));
      setCards(prev => (reset ? resolved : [...prev, ...resolved]));
      offsetRef.current = from + rows.length;
      if (reset) setTotal(typeof count === 'number' ? count : rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      if (reset) { setCards([]); setTotal(0); }
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  /** Posizione per "Vicino a me": prima l'ultima nota del servizio, poi il browser (4 s max). */
  const getPosition = async (): Promise<{ lat: number; lon: number } | null> => {
    try {
      const last = locationService.getLastLocation?.();
      if (last && Number.isFinite(last.latitude) && Number.isFinite(last.longitude)) {
        return { lat: last.latitude, lon: last.longitude };
      }
    } catch { /* servizio non pronto */ }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise(resolve => {
      let done = false;
      const finish = (v: { lat: number; lon: number } | null) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 4000);
      try {
        navigator.geolocation.getCurrentPosition(
          p => { clearTimeout(timer); finish({ lat: p.coords.latitude, lon: p.coords.longitude }); },
          () => { clearTimeout(timer); finish(null); },
          { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 }
        );
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  };

  /**
   * Feed community: "vicino a me" (raggio 50 km) o "più recenti"; pagina
   * successiva col cursore `nextCursor` → `before=`. Se la posizione non
   * arriva, "vicino a me" mostra comunque i recenti senza filtro.
   */
  const fetchCommunity = async (mode: FeedMode, reset: boolean, cursor: string | null = null) => {
    const reqId = ++feedReqRef.current;
    if (reset) setCommunityLoading(true); else setCommunityLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(FEED_LIMIT) });
      if (mode === 'near') {
        const pos = reset ? await getPosition() : communityPosRef.current;
        communityPosRef.current = pos;
        if (pos) {
          params.set('lat', String(pos.lat));
          params.set('lon', String(pos.lon));
          params.set('radiusKm', String(FEED_RADIUS_KM));
        }
      }
      if (!reset && cursor) params.set('before', cursor);
      const res = await fetch(getApiUrl(`/api/vision/community?${params.toString()}`));
      const data = await res.json().catch(() => null);
      if (reqId !== feedReqRef.current) return; // l'utente ha cambiato chip nel frattempo
      const list: any[] = Array.isArray(data?.cards) ? data.cards : [];
      setCommunityCards(prev => (reset || !prev ? list : [...prev, ...list]));
      setCommunityCursor(typeof data?.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null);
    } catch {
      if (reqId !== feedReqRef.current) return;
      if (reset) setCommunityCards([]);
      setCommunityCursor(null);
    } finally {
      if (reqId === feedReqRef.current) {
        setCommunityLoading(false);
        setCommunityLoadingMore(false);
      }
    }
  };

  const changeFeedMode = (mode: FeedMode) => {
    if (mode === feedMode && communityCards !== null) return;
    setFeedMode(mode);
    setCommunityCards(null);
    setCommunityCursor(null);
    fetchCommunity(mode, true);
  };

  /** Novità (approvate/rifiutate dall'ultima volta) + statistica personale anonima. */
  const loadUpdates = async () => {
    const u = await fetchVisionUpdates();
    if (!u) return;
    setStats(u.stats);
    if (u.approved.length > 0 || u.rejected.length > 0) {
      setUpdates(u);
      notifyVisionUpdatesNative(u, language).catch(() => {});
    } else {
      setUpdates(null);
    }
  };

  const dismissUpdates = () => {
    if (updates) markVisionUpdatesSeen(updates.now);
    setUpdates(null);
  };

  useEffect(() => {
    fetchCards(true);
    loadUpdates();
    // Nuova scansione dalla camera → l'album si aggiorna subito.
    const onUpdated = () => { fetchCards(true); loadUpdates(); };
    window.addEventListener('wip-vision-updated', onUpdated);
    return () => window.removeEventListener('wip-vision-updated', onUpdated);
  }, []);

  useEffect(() => {
    if (view === 'community' && communityCards === null && !communityLoading) fetchCommunity(feedMode, true);
  }, [view]);

  const statusBadge = (c: any) => {
    if (c.review_status === 'approved') return { label: t('vis_badge_published'), cls: 'bg-emerald-500/90 text-white' };
    if (c.review_status === 'rejected') return { label: t('vis_badge_rejected'), cls: 'bg-gray-500/80 text-white' };
    return { label: t('vis_badge_pending'), cls: 'bg-amber-500/90 text-white' };
  };

  /** "Motivo: …" sotto il badge di una scheda rifiutata (+ nota dell'admin se c'è). */
  const rejectReasonText = (c: any): string | null => {
    if (c.review_status !== 'rejected' || !c.reject_reason) return null;
    const note = typeof c.reject_note === 'string' && c.reject_note.trim() ? ` — ${c.reject_note.trim()}` : '';
    return `${t('vis_reason_label')}: ${visionRejectReasonLabel(c.reject_reason, language)}${note}`;
  };

  // La scheda in DB usa nomi inglesi; VisionCardSheet parla il JSON di /api/vision.
  const toSheet = (c: any, photo: string | null, isMine: boolean) => ({
    card_id: c.id,
    nome: c.name,
    autore: c.artist,
    anno_produzione: c.year,
    stile: c.style,
    citta: c.city,
    curiosita: c.curiosity,
    descrizione_breve: c.description_short,
    descrizione_dettagliata: c.description_long,
    storia: c.history,
    spiegazione_audio: c.audio_script,
    photo_url: photo,
    // Le schede vecchie (prima della colonna language) sono in italiano: la
    // sheet ricade su 'IT' se il campo manca.
    language: c.language || null,
    _isMine: isMine,
    published_poi_id: c.published_poi_id || null,
    lat: typeof c.lat === 'number' ? c.lat : null,
    lon: typeof c.lon === 'number' ? c.lon : null,
    first_discoverer: !!c.first_discoverer,
  });

  const groupByDate = (list: any[]) => list.reduce((acc: Record<string, any[]>, c: any) => {
    const d = c.created_at ? new Date(c.created_at) : new Date();
    const key = d.toDateString() === new Date().toDateString()
      ? t('vis_today')
      : d.toLocaleDateString(DATE_LOCALE[language] || 'it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {});

  const timeLabel = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString(DATE_LOCALE[language] || 'it-IT', { hour: '2-digit', minute: '2-digit' }) : '';

  // Tooltip del cestino: nessuna chiave vis_* dedicata nella spec → IT con fallback EN.
  const deleteLabel = language === 'IT' ? 'Cancella dal tuo album' : 'Delete from your album';

  /** Cestino sovrapposto alla card (solo album personale). */
  const renderTrash = (c: any) => (
    <button
      onClick={(e) => { e.stopPropagation(); deleteCard(c); }}
      disabled={deletingId === c.id}
      title={deleteLabel}
      aria-label={deleteLabel}
      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50 z-10"
    >
      {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );

  /** Chip dorata "Primo scopritore" (album e feed). */
  const renderFirstChip = (compact = false) => (
    <span className={`inline-flex items-center gap-1 rounded-md font-black uppercase tracking-wider bg-gradient-to-r from-amber-300 to-yellow-400 text-amber-950 shadow-sm ${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[9px]'}`}>
      <Crown className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {t('vis_badge_first')}
    </span>
  );

  const renderLoadMore = (busy: boolean, onClick: () => void) => (
    <div className="flex justify-center pt-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="px-5 py-2.5 rounded-2xl bg-white border border-gray-200 text-xs font-black text-gray-700 shadow-sm hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {t('vis_load_more')}
      </button>
    </div>
  );

  const renderGrid = (list: any[], isMine: boolean) => (
    <div className="space-y-6">
      {Object.entries(groupByDate(list)).map(([date, items]) => (
        <div key={date}>
          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3 sticky top-0 bg-[#f8f5f0] py-2 z-10">{date}</h4>
          {galleryView === 'list' ? (
            <div className="flex flex-col gap-2">
              {(items as any[]).map((c: any) => {
                const photo = isMine ? c._photo : c.published_photo_url;
                const badge = isMine ? statusBadge(c) : null;
                const reason = isMine ? rejectReasonText(c) : null;
                return (
                  <div
                    key={c.id}
                    className="relative bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center gap-3 p-2 pr-10"
                    onClick={() => setOpenCard(toSheet(c, photo, isMine))}
                  >
                    <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {photo ? (
                        <img src={photo} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Camera className="w-6 h-6 text-gray-300" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 title={c.name} className="font-black text-gray-900 line-clamp-1 text-sm leading-tight">{c.name}</h4>
                      <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1 mt-0.5">
                        {c.city && (<><MapPin className="w-2.5 h-2.5" />{c.city} · </>)}
                        {timeLabel(c.created_at)}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {badge && (
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                        {c.first_discoverer && renderFirstChip(true)}
                      </div>
                      {reason && <p className="text-[9px] text-gray-500 font-medium mt-1 line-clamp-2">{reason}</p>}
                    </div>
                    {isMine && renderTrash(c)}
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-3">
            {(items as any[]).map((c: any) => {
              const photo = isMine ? c._photo : c.published_photo_url;
              const badge = isMine ? statusBadge(c) : null;
              const reason = isMine ? rejectReasonText(c) : null;
              return (
                <div
                  key={c.id}
                  className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col"
                  onClick={() => setOpenCard(toSheet(c, photo, isMine))}
                >
                  {isMine && renderTrash(c)}
                  <div className="relative h-28 shrink-0 bg-gray-100 overflow-hidden">
                    {photo ? (
                      <img
                        src={photo}
                        alt={c.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <Camera className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                    <div className="absolute top-2 left-2 flex flex-col items-start gap-1 max-w-[80%]">
                      {badge && (
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm backdrop-blur-md ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                      {c.first_discoverer && renderFirstChip()}
                    </div>
                    {c.city && (
                      <span className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-gray-900 shadow-sm flex items-center gap-1 truncate max-w-[85%]">
                        <MapPin className="w-2.5 h-2.5" />
                        {c.city}
                      </span>
                    )}
                  </div>
                  <div className="p-3 bg-white flex-1 flex flex-col">
                    <h4 title={c.name} className="font-black text-gray-900 line-clamp-2 text-sm leading-tight">{c.name}</h4>
                    {c.description_short && (
                      <p className="text-[10px] text-gray-500 leading-snug line-clamp-3 mt-1">{c.description_short}</p>
                    )}
                    {reason && <p className="text-[9px] text-gray-500 font-medium mt-1 line-clamp-2">{reason}</p>}
                    <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                      <p className="text-[10px] font-bold text-gray-500">{timeLabel(c.created_at)}</p>
                      {(isMine ? c.review_status === 'approved' : true) && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                          <Sparkles className="w-3 h-3" />
                          {isMine ? t('vis_published_label') : t('vis_community_label')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      ))}
    </div>
  );

  /** Banner delle novità: approvate (verde, con i crediti) e rifiutate (grigio, con il motivo). */
  const renderUpdates = () => {
    if (!updates) return null;
    const nA = updates.approved.length;
    const nR = updates.rejected.length;
    const credits = updates.approved.reduce((sum, a) => sum + (Number(a.rewarded) || 0), 0);
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        {nA > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-emerald-900 leading-snug">
                {t('vis_updates_approved').replace('{n}', String(nA)).replace('{credits}', String(credits))}
              </p>
              <p className="text-[10px] text-emerald-800/80 font-medium mt-0.5 line-clamp-2">
                {updates.approved.map(a => a.name).filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        )}
        {nR > 0 && (
          <div className="bg-gray-100 border border-gray-200 rounded-2xl p-3 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-gray-800 leading-snug">
                {t('vis_updates_rejected').replace('{n}', String(nR))}
              </p>
              <ul className="mt-1 space-y-0.5">
                {updates.rejected.map(r => (
                  <li key={r.id} className="text-[10px] text-gray-600 font-medium leading-snug">
                    <span className="font-bold text-gray-800">{r.name}</span>
                    {' — '}
                    {visionRejectReasonLabel(r.reject_reason, language)}
                    {r.reject_note ? ` (${r.reject_note})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={dismissUpdates}
            className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-black shadow-sm active:scale-95 transition-transform"
          >
            {t('vis_updates_dismiss')}
          </button>
        </div>
      </motion.div>
    );
  };

  /**
   * Statistica personale e anonima del mese: nessun nome, nessuna classifica
   * con altri utenti. Testo IT fisso con fallback EN (per scelta: niente
   * chiavi i18n per nomi/classifiche).
   */
  const renderStats = () => {
    if (!stats || (stats.my_published === 0 && !stats.my_rank)) return null;
    const n = stats.my_published;
    const isIt = language === 'IT';
    const published = isIt
      ? `Questo mese: ${n} ${n === 1 ? 'foto pubblicata' : 'foto pubblicate'}`
      : `This month: ${n} ${n === 1 ? 'photo published' : 'photos published'}`;
    const rank = stats.my_rank && stats.total_contributors > 0
      ? (isIt
          ? ` · sei ${stats.my_rank}° su ${stats.total_contributors} ${stats.total_contributors === 1 ? 'scopritore' : 'scopritori'}`
          : ` · you rank #${stats.my_rank} of ${stats.total_contributors} ${stats.total_contributors === 1 ? 'discoverer' : 'discoverers'}`)
      : '';
    return (
      <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5 px-1">
        <Crown className="w-3 h-3 text-amber-500" />
        {published}{rank}
      </p>
    );
  };

  const countLabel = total ?? cards.length;

  return (
    <motion.div
      key="myvision"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4"
    >
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Camera className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-gray-900 text-sm leading-tight">
            {t('vis_my_title')} · {countLabel} {countLabel === 1 ? t('vis_shot_one') : t('vis_shot_many')}
          </h3>
          <p className="text-[10px] text-gray-500 font-medium leading-snug">
            {t('vis_my_sub')}
          </p>
        </div>
        <GalleryViewToggle view={galleryView} onChange={setGalleryView} />
      </div>

      {renderStats()}

      {/* Novità dalla revisione: sopra i tab, finché l'utente non preme Ok */}
      {renderUpdates()}

      {/* Sottopagine: il mio album / le Vision (anonime) di tutti */}
      <div className="flex bg-white rounded-2xl p-1 border border-gray-100 shadow-sm">
        <button
          onClick={() => setView('mine')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${view === 'mine' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Camera className="w-3.5 h-3.5" />
          {t('vis_tab_mine')}
        </button>
        <button
          onClick={() => setView('community')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${view === 'community' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Users className="w-3.5 h-3.5" />
          {t('vis_tab_community')}
        </button>
      </div>

      {view === 'mine' ? (
        loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="font-bold text-sm tracking-tight">{t('vis_loading')}</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <Camera className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="font-black text-gray-900 text-xl mb-2">{t('vis_empty_title')}</h3>
            <p className="text-sm text-gray-500 font-bold max-w-xs">{t('vis_empty_desc')}</p>
          </div>
        ) : (
          <>
            {renderGrid(cards, true)}
            {hasMore && renderLoadMore(loadingMore, () => fetchCards(false))}
          </>
        )
      ) : (
        <>
          {/* Chip del feed: vicino a me (50 km) / più recenti */}
          <div className="flex gap-2">
            <button
              onClick={() => changeFeedMode('near')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${feedMode === 'near' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              <Navigation className="w-3.5 h-3.5" />
              {t('vis_feed_near')}
            </button>
            <button
              onClick={() => changeFeedMode('recent')}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${feedMode === 'recent' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              {t('vis_feed_recent')}
            </button>
          </div>

          {communityLoading || communityCards === null ? (
            <div className="py-20 flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="font-bold text-sm tracking-tight">{t('vis_loading_community')}</p>
            </div>
          ) : communityCards.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                <Users className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="font-black text-gray-900 text-xl mb-2">{t('vis_comm_empty_title')}</h3>
              <p className="text-sm text-gray-500 font-bold max-w-xs">{t('vis_comm_empty_desc')}</p>
            </div>
          ) : (
            <>
              {renderGrid(communityCards, false)}
              {communityCursor && renderLoadMore(communityLoadingMore, () => fetchCommunity(feedMode, false, communityCursor))}
            </>
          )}
        </>
      )}

      {openCard && (
        <VisionCardSheet card={openCard} language={language} onClose={() => setOpenCard(null)} />
      )}
    </motion.div>
  );
}
