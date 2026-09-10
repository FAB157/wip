import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, User, CalendarDays, Palette, MapPin, BookOpen, Landmark, Sparkles, Volume2, Pause, Play, Loader2, Download, Share2, MessageCircle, Navigation, Crown, Headphones } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { getTranslation, Language } from '../lib/i18n';
import { notify } from '../lib/toast';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { getGuideCharacter } from '../lib/guideSettings';
import { MuseumVisit, MUSEUM_VISIT_EVENT, OPEN_MUSEUM_VISIT_EVENT, getVisit, countSeen, fetchArtworkGuide, ArtworkGuide } from '../lib/museumVisit';

interface VisionCardSheetProps {
  card: any;           // risultato di /api/vision (+ image base64 lato client)
  language: Language;
  onClose: () => void;
}

/**
 * Scheda enciclopedica del riconoscimento Vision: foto scattata, artista,
 * anno, stile, descrizione, storia e curiosità. Non è un POI: vive in
 * vision_cards (salvata dal server) e questa è la sua vista.
 */
export default function VisionCardSheet({ card, language, onClose }: VisionCardSheetProps) {
  const t = (key: string) => getTranslation(key, language);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => { stopSpeech(); };
  }, []);

  // Visita guidata: se c'è una visita in corso (arriva in sottofondo dopo il
  // riconoscimento dell'opera) la scheda dice DOVE sei e apre il percorso.
  const [visit, setVisit] = useState<MuseumVisit | null>(() => getVisit());
  useEffect(() => {
    const onVisit = () => setVisit(getVisit());
    window.addEventListener(MUSEUM_VISIT_EVENT, onVisit);
    return () => window.removeEventListener(MUSEUM_VISIT_EVENT, onVisit);
  }, []);
  const showVisit = !!visit && (card.categoria === 'musei' || card.category === 'musei' || !!card.luogo_esposizione);
  const handleOpenVisit = () => {
    window.dispatchEvent(new CustomEvent(OPEN_MUSEUM_VISIT_EVENT));
    onClose();
  };

  // ── VERSIONE DA MUSEO (10/09/2026) ──────────────────────────────────────
  // Un'opera inquadrata dentro un museo merita lo stesso racconto di quella
  // ascoltata dal percorso: 250-350 parole che guidano l'occhio, con tecnica,
  // misure e dettagli da cercare. Senza questo tasto la stessa opera veniva
  // raccontata in due modi diversi a seconda di come ci si arrivava.
  const [estesa, setEstesa] = useState<ArtworkGuide | null>(null);
  const [estesaLoading, setEstesaLoading] = useState(false);
  const nomeMuseo = String(card.luogo_esposizione || visit?.venue?.name || '').trim();
  const isOpera = (card.categoria === 'musei' || card.category === 'musei') && !!nomeMuseo && !!card.nome;

  const handleEstesa = async () => {
    if (estesaLoading || !isOpera) return;
    if (estesa) {
      // Già aperta: la si ascolta.
      if (audioPlaying) { stopSpeech(); setAudioPlaying(false); return; }
      setAudioLoading(true);
      try {
        await speakAudioguide(estesa.testo, String(estesa.language || language).toLowerCase(), getGuideCharacter(), () => setAudioPlaying(false));
        setAudioPlaying(true);
      } catch { setAudioPlaying(false); } finally { setAudioLoading(false); }
      return;
    }
    setEstesaLoading(true);
    const resp = await fetchArtworkGuide({
      artwork: String(card.nome),
      venueName: nomeMuseo,
      artist: card.autore && card.autore !== 'Ignoto' ? String(card.autore) : null,
      language,
    });
    setEstesaLoading(false);
    if (!resp) { notify(t('vis_generic_error')); return; }
    if (resp.ok !== true) {
      notify(resp.reason === 'needs_pass' ? t('mv_art_needs_pass') : resp.reason === 'pass_exhausted' ? t('mv_art_exhausted') : t('mv_art_no_source'));
      return;
    }
    setEstesa(resp.guide);
  };

  // A11y: focus trap + ritorno del focus alla chiusura, Esc chiude.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = (): HTMLElement[] =>
      (Array.from(root.querySelectorAll(selector)) as HTMLElement[]).filter(el => el.offsetParent !== null);
    const focusTimer = setTimeout(() => {
      if (!root.contains(document.activeElement)) focusables()[0]?.focus();
    }, 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  const photo = card.image || card.photo_url || null;

  const photoFileName = `wip-vision-${String(card.nome || 'foto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto'}.jpg`;

  /**
   * Watermark per la CONDIVISIONE (il download resta pulito): la foto su
   * canvas + in basso a destra una pill semitrasparente "WIP · wip.guide",
   * font bold al 4% dell'altezza (min 14px). Se qualcosa va storto torna
   * la foto originale: la condivisione non deve mai fallire per il logo.
   */
  const addWatermark = async (blob: Blob): Promise<Blob> => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('immagine non leggibile'));
        el.src = objectUrl as string;
      });
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return blob;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(img, 0, 0, w, h);

      const fontPx = Math.max(14, Math.round(h * 0.04));
      ctx.font = `bold ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = 'middle';
      const text = 'WIP · wip.guide';
      const textW = ctx.measureText(text).width;
      const padX = fontPx * 0.7;
      const padY = fontPx * 0.4;
      const pillW = textW + padX * 2;
      const pillH = fontPx + padY * 2;
      const margin = Math.round(fontPx * 0.6);
      const x = w - pillW - margin;
      const y = h - pillH - margin;
      const r = pillH / 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(x, y, pillW, pillH, r);
      } else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + pillW - r, y);
        ctx.arc(x + pillW - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + pillH);
        ctx.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
        ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillText(text, x + padX, y + pillH / 2);

      const out = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9));
      return out || blob;
    } catch {
      return blob;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  // La foto può essere un data URL (appena scattata) o l'URL remoto del
  // bucket: in entrambi i casi serve il Blob per scaricare/condividere.
  // `withWatermark` solo per la condivisione.
  const getPhotoBlob = async (withWatermark = false): Promise<Blob | null> => {
    if (!photo) return null;
    try {
      const res = await fetch(photo);
      const blob = await res.blob();
      return withWatermark ? await addWatermark(blob) : blob;
    } catch {
      return null;
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('lettura foto fallita'));
      reader.readAsDataURL(blob);
    });

  const handleDownload = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const blob = await getPhotoBlob();
      if (!blob) { notify(t('vis_photo_unavailable')); return; }
      if (Capacitor.isNativePlatform()) {
        // Su app nativa il tag <a download> non salva nulla: si scrive nei
        // Documenti del telefono col plugin Filesystem (già in bundle).
        await Filesystem.writeFile({
          path: `WIP Vision/${photoFileName}`,
          data: await blobToBase64(blob),
          directory: Directory.Documents,
          recursive: true,
        });
        notify(t('vis_saved_docs'));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = photoFileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      notify(t('vis_save_failed'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleShare = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const subject = [card.nome, card.citta].filter(Boolean).join(' · ');
      const shareText = [t('vis_share_text'), subject].filter(Boolean).join('\n');
      // Link al POI pubblicato (solo schede già nella WIP Community).
      const shareUrl = card.published_poi_id ? `https://wip.guide/?poi=${encodeURIComponent(String(card.published_poi_id))}` : undefined;
      const blob = await getPhotoBlob(true);
      if (blob && typeof navigator.share === 'function') {
        const file = new File([blob], photoFileName, { type: blob.type || 'image/jpeg' });
        // canShare({files}) è il percorso ricco (foto vera); se il device non
        // lo supporta si condivide testo+link, altrimenti si salva in locale.
        if ((navigator as any).canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: card.nome, text: shareText, ...(shareUrl ? { url: shareUrl } : {}) } as any);
          return;
        }
        await navigator.share({ title: card.nome, text: shareText, url: shareUrl || card.photo_url || undefined });
        return;
      }
      await handleDownload();
    } catch (e: any) {
      // AbortError = utente ha chiuso il foglio di condivisione: silenzio.
      if (e?.name !== 'AbortError') notify(t('vis_share_fallback'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const chips = [
    { icon: User, label: card.autore, hide: !card.autore || card.autore === 'Ignoto' },
    { icon: CalendarDays, label: card.anno_produzione },
    { icon: Palette, label: card.stile, hide: !card.stile || card.stile === 'N/D' },
    { icon: MapPin, label: card.citta },
    { icon: Crown, label: t('vis_badge_first'), hide: !card.first_discoverer },
  ].filter(c => c.label && !c.hide);

  const canOpenOnMap = !!card.published_poi_id && typeof card.lat === 'number' && typeof card.lon === 'number';

  /** "Vedi sulla mappa": tab mappa + centratura e popup sul POI community pubblicato. */
  const handleOpenOnMap = () => {
    if (!canOpenOnMap) return;
    window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: card.lat, lon: card.lon, zoom: 16 } }));
    window.dispatchEvent(new CustomEvent('focus-poi', {
      detail: { id: card.published_poi_id, name: card.nome, lat: card.lat, lon: card.lon, category: 'community' },
    }));
    onClose();
  };

  /** "Chiedi di più": apre la chat AI col contesto della scheda (App.tsx ascolta wip-open-chat). */
  const handleAskMore = () => {
    const name = String(card.nome || '');
    const context = [
      t('vis_ask_more_context').replace('{name}', name),
      '',
      [card.descrizione_dettagliata, card.storia, card.curiosita].filter(Boolean).join('\n'),
    ].join('\n');
    window.dispatchEvent(new CustomEvent('wip-open-chat', { detail: { poiName: name, context } }));
    onClose();
  };

  const handleAudio = async () => {
    if (audioLoading) return;
    if (audioPlaying) {
      stopSpeech();
      setAudioPlaying(false);
      return;
    }
    const text = card.spiegazione_audio || card.descrizione_dettagliata || card.descrizione_breve;
    if (!text) return;
    setAudioLoading(true);
    try {
      // La voce parla la lingua in cui è stata generata la scheda (non quella
      // dell'interfaccia): schede vecchie senza `language` sono in italiano.
      await speakAudioguide(text, String(card.language || 'IT').toLowerCase(), getGuideCharacter(), () => setAudioPlaying(false));
      setAudioPlaying(true);
    } catch {
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  const Section = ({ icon: Icon, title, text }: { icon: any; title: string; text?: string | null }) => {
    if (!text) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-wider text-primary">{title}</h3>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{text}</p>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[2500] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
      // Tocco fuori dalla scheda = chiudi: su telefono è il gesto che si
      // prova per primo, e l'Escape non esiste.
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={card.nome || t('vis_service_name')}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Hero foto */}
        <div className="relative h-56 shrink-0 bg-slate-200">
          {photo ? (
            <img src={photo} alt={card.nome} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Landmark className="w-14 h-14 text-slate-400" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          {/* Velo scuro in alto: senza, i pulsanti bianchi sparivano sulle
              foto chiare (segnalato su una foto di spiaggia). */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
          {/* Maniglia da bottom sheet: dice a colpo d'occhio che la scheda
              si chiude. */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-white/70 pointer-events-none sm:hidden" />
          <button
            onClick={onClose}
            aria-label={t('vis_close')}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg ring-1 ring-black/10 active:scale-90 transition-transform"
          >
            <X className="w-6 h-6" />
          </button>
          {photo && (
            <div className="absolute top-4 left-4 flex gap-2">
              <button
                onClick={handleDownload}
                disabled={photoBusy}
                title={t('vis_save_photo')}
                aria-label={t('vis_save_photo')}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50"
              >
                {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              <button
                onClick={handleShare}
                disabled={photoBusy}
                title={t('vis_share_photo')}
                aria-label={t('vis_share_photo')}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="absolute bottom-3 left-4 right-16">
            <h2 className="text-white text-xl font-black leading-tight drop-shadow">{card.nome}</h2>
          </div>
          <button
            onClick={handleAudio}
            aria-label={audioPlaying ? t('vis_pause') : t('vis_listen')}
            className="absolute -bottom-0 right-4 translate-y-0 w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            style={{ transform: 'translateY(50%)' }}
          >
            {audioLoading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : audioPlaying
                ? <Pause className="w-5 h-5" />
                : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Contenuto scrollabile */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-8 pb-6">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f5f0] rounded-full text-[11px] font-bold text-primary">
                  <c.icon className="w-3.5 h-3.5" />
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {showVisit && visit && (
            <button
              onClick={handleOpenVisit}
              className="w-full mb-5 flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-[#eff6ff] border border-primary/40 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('mv_you_are_at')}</p>
                <p className="text-sm font-black text-primary truncate">{visit.venue.name}</p>
                <p className="text-[11px] font-bold text-slate-500">
                  {t('mv_seen_count').replace('{n}', String(countSeen(visit))).replace('{t}', String(visit.guide.tappe.length))} · {t('mv_route')}
                </p>
              </div>
              <Navigation className="w-4 h-4 text-primary shrink-0" />
            </button>
          )}

          {card.descrizione_breve && (
            <p className="text-[15px] text-slate-800 font-medium leading-relaxed mb-5">{card.descrizione_breve}</p>
          )}

          <Section icon={BookOpen} title={t('vis_section_desc')} text={card.descrizione_dettagliata} />
          <Section icon={Landmark} title={t('vis_section_history')} text={card.storia} />
          <Section icon={Sparkles} title={t('vis_section_curiosity')} text={card.curiosita} />

          {/* Versione da museo: il racconto lungo dell'opera, come al museo */}
          {isOpera && (
            <div className="mb-5">
              <button
                onClick={handleEstesa}
                disabled={estesaLoading}
                className="w-full py-3 rounded-2xl bg-[#eff6ff] border border-primary/40 text-primary font-black text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {estesaLoading ? <Loader2 className="w-4 h-4 animate-spin" />
                  : estesa ? (audioPlaying ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />)
                  : <Headphones className="w-4 h-4" />}
                {estesa ? (audioPlaying ? t('vis_pause') : t('mv_art_listen')) : t('vis_museum_version')}
              </button>

              {estesa && (
                <div className="mt-3 rounded-2xl bg-[#f8f5f0] border border-slate-200 overflow-hidden">
                  {/* Comandi da audioguida: play e pausa sempre a portata. */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-white border-b border-slate-200">
                    <button
                      onClick={handleEstesa}
                      aria-label={audioPlaying ? t('vis_pause') : t('mv_art_listen')}
                      className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"
                    >
                      {audioLoading ? <Loader2 className="w-5 h-5 animate-spin" />
                        : audioPlaying ? <Pause className="w-5 h-5" />
                        : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-slate-900 truncate">{estesa.titolo || card.nome}</p>
                      <p className="text-[10px] font-bold text-slate-500">
                        {audioPlaying ? t('mv_art_playing') : t('mv_art_ready')} · {Math.max(1, Math.round((estesa.parole || 0) / 150))} min
                      </p>
                    </div>
                  </div>

                  {estesa.foto && (
                    <img
                      src={estesa.foto}
                      alt={estesa.titolo || String(card.nome || '')}
                      loading="lazy"
                      className="w-full max-h-64 object-contain bg-slate-100"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="p-4">
                    {(estesa.tecnica || estesa.misure) && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
                        {[estesa.tecnica, estesa.misure].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-line">{estesa.testo}</p>
                    {estesa.daGuardare.length > 0 && (
                      <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-1">{t('mv_art_look_for')}</p>
                        <ul className="space-y-0.5">
                          {estesa.daGuardare.map((d, k) => (
                            <li key={k} className="text-[12px] text-slate-700 leading-snug">· {d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {estesa.curiosita && (
                      <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 mb-1">{t('mv_art_curiosity')}</p>
                        <p className="text-[12px] text-amber-900 leading-snug">{estesa.curiosita}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* "Chiedi di più" in fondo al testo: chi ha letto tutto ha la
              domanda pronta. Apre la chat AI col contesto della scheda. */}
          <button
            onClick={handleAskMore}
            className="w-full mt-2 py-3.5 rounded-2xl bg-primary text-white font-black text-sm shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            {t('vis_ask_more')}
          </button>

          {canOpenOnMap && (
            <button
              onClick={handleOpenOnMap}
              className="w-full mt-2 py-3.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Navigation className="w-4 h-4" />
              {t('vis_open_on_map')}
            </button>
          )}

          <p className="text-[10px] text-slate-400 text-center mt-4">
            {t('vis_ai_disclaimer')}
          </p>

          {/* Terza via d'uscita, in fondo al testo: chi legge tutta la scheda
              si ritrova il pulsante sotto il pollice invece di dover tornare
              in cima a cercare la X. */}
          <button
            onClick={onClose}
            className="w-full mt-3 py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm active:scale-[0.98] transition-transform"
          >
            {t('vis_close')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
