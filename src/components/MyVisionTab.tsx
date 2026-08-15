import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Loader2, MapPin, Sparkles, Trash2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Language } from '../lib/i18n';
import { getApiUrl } from '../lib/api';
import { resolveVisionPhotoUrl } from '../lib/visionPhotos';
import { notify } from '../lib/toast';
import GalleryViewToggle, { useGalleryView } from './GalleryViewToggle';
import VisionCardSheet from './VisionCardSheet';

interface MyVisionTabProps {
  language: Language;
}

/**
 * "My Vision": l'album personale delle foto scansionate con la Visione AI.
 * Ogni scatto (riconosciuto o no) diventa una scheda vision_cards con data,
 * luogo e foto originale — il ricordo resta SOLO nell'account dell'utente
 * (bucket privato, URL firmati). Le schede approvate dall'admin diventano
 * luoghi WIP Community sulla mappa. La sottopagina "WIP Community" mostra
 * le Vision approvate di tutti, in forma anonima.
 * Layout: stesso schema per data + griglia dell'ARCHIVIO (cronologia).
 */
export default function MyVisionTab({ language }: MyVisionTabProps) {
  const [view, setView] = useState<'mine' | 'community'>('mine');
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [communityCards, setCommunityCards] = useState<any[] | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [openCard, setOpenCard] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [galleryView, setGalleryView] = useGalleryView();

  /** Cancella un PROPRIO scatto dall'album (il POI community eventuale resta). */
  const deleteCard = async (c: any) => {
    if (deletingId) return;
    if (!window.confirm(`Cancellare "${c.name}" dal tuo album? L'operazione non si può annullare.`)) return;
    setDeletingId(c.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(getApiUrl('/api/vision/delete-card'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: c.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'errore');
      setCards(prev => prev.filter(x => x.id !== c.id));
      notify('Scatto cancellato dal tuo album.');
    } catch (e: any) {
      notify(`Cancellazione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const fetchCards = async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) {
        setCards([]);
        return;
      }
      const { data } = await supabase
        .from('vision_cards')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      // Bucket privato: photo_url è un path → si firma per la visualizzazione
      const resolved = await Promise.all(
        (data || []).map(async (c: any) => ({ ...c, _photo: await resolveVisionPhotoUrl(c.photo_url) }))
      );
      setCards(resolved);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunity = async () => {
    setCommunityLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/vision/community?limit=60'));
      const data = await res.json().catch(() => null);
      setCommunityCards(Array.isArray(data?.cards) ? data.cards : []);
    } catch {
      setCommunityCards([]);
    } finally {
      setCommunityLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
    // Nuova scansione dalla camera → l'album si aggiorna subito.
    const onUpdated = () => fetchCards();
    window.addEventListener('wip-vision-updated', onUpdated);
    return () => window.removeEventListener('wip-vision-updated', onUpdated);
  }, []);

  useEffect(() => {
    if (view === 'community' && communityCards === null) fetchCommunity();
  }, [view]);

  const statusBadge = (c: any) => {
    if (c.review_status === 'approved') return { label: 'WIP Community', cls: 'bg-emerald-500/90 text-white' };
    if (c.review_status === 'rejected') return { label: 'Ricordo', cls: 'bg-gray-500/80 text-white' };
    return { label: 'In revisione', cls: 'bg-amber-500/90 text-white' };
  };

  // La scheda in DB usa nomi inglesi; VisionCardSheet parla il JSON di /api/vision.
  const toSheet = (c: any, photo: string | null) => ({
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
  });

  const groupByDate = (list: any[]) => list.reduce((acc: Record<string, any[]>, c: any) => {
    const d = c.created_at ? new Date(c.created_at) : new Date();
    const key = d.toDateString() === new Date().toDateString()
      ? (language === 'IT' ? 'Oggi' : 'Today')
      : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {});

  /** Cestino sovrapposto alla card (solo album personale). */
  const renderTrash = (c: any) => (
    <button
      onClick={(e) => { e.stopPropagation(); deleteCard(c); }}
      disabled={deletingId === c.id}
      title="Cancella dal tuo album"
      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50 z-10"
    >
      {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
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
                return (
                  <div
                    key={c.id}
                    className="relative bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center gap-3 p-2 pr-10"
                    onClick={() => setOpenCard(toSheet(c, photo))}
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
                        {c.created_at ? new Date(c.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                      {badge && (
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
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
              return (
                <div
                  key={c.id}
                  className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col"
                  onClick={() => setOpenCard(toSheet(c, photo))}
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
                    {badge && (
                      <span className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm backdrop-blur-md ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
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
                    <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                      <p className="text-[10px] font-bold text-gray-500">
                        {c.created_at
                          ? new Date(c.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </p>
                      {(isMine ? c.review_status === 'approved' : true) && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                          <Sparkles className="w-3 h-3" />
                          {isMine ? 'Pubblicata' : 'Community'}
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
            My Vision · {cards.length} {cards.length === 1 ? 'scatto' : 'scatti'}
          </h3>
          <p className="text-[10px] text-gray-500 font-medium leading-snug">
            Ogni foto approvata diventa un luogo WIP Community e ti premia in crediti.
          </p>
        </div>
        <GalleryViewToggle view={galleryView} onChange={setGalleryView} />
      </div>

      {/* Sottopagine: il mio album / le Vision (anonime) di tutti */}
      <div className="flex bg-white rounded-2xl p-1 border border-gray-100 shadow-sm">
        <button
          onClick={() => setView('mine')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${view === 'mine' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Camera className="w-3.5 h-3.5" />
          Le mie Vision
        </button>
        <button
          onClick={() => setView('community')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${view === 'community' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Users className="w-3.5 h-3.5" />
          WIP Community
        </button>
      </div>

      {view === 'mine' ? (
        loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="font-bold text-sm tracking-tight">Caricamento delle tue Vision…</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <Camera className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="font-black text-gray-900 text-xl mb-2">Nessuna Vision</h3>
            <p className="text-sm text-gray-500 font-bold max-w-xs">
              Scatta una foto a un monumento, un panorama o un'opera d'arte dalla
              fotocamera: l'AI la riconosce e la scheda arriva qui.
            </p>
          </div>
        ) : (
          renderGrid(cards, true)
        )
      ) : communityLoading || communityCards === null ? (
        <div className="py-20 flex flex-col items-center justify-center text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin mb-4" />
          <p className="font-bold text-sm tracking-tight">Caricamento WIP Community…</p>
        </div>
      ) : communityCards.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="font-black text-gray-900 text-xl mb-2">Ancora nessuna Vision pubblicata</h3>
          <p className="text-sm text-gray-500 font-bold max-w-xs">
            Qui compaiono, in forma anonima, le foto approvate dei viaggiatori WIP.
            La prossima potrebbe essere la tua!
          </p>
        </div>
      ) : (
        renderGrid(communityCards, false)
      )}

      {openCard && (
        <VisionCardSheet card={openCard} language={language} onClose={() => setOpenCard(null)} />
      )}
    </motion.div>
  );
}
