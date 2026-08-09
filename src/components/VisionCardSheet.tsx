import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, User, CalendarDays, Palette, MapPin, BookOpen, Landmark, Sparkles, Volume2, Pause, Loader2, Download, Share2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Language } from '../lib/i18n';
import { notify } from '../lib/toast';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { getGuideCharacter } from '../lib/guideSettings';

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
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => { stopSpeech(); };
  }, []);

  const photo = card.image || card.photo_url || null;

  const photoFileName = `wip-vision-${String(card.nome || 'foto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto'}.jpg`;

  // La foto può essere un data URL (appena scattata) o l'URL remoto del
  // bucket: in entrambi i casi serve il Blob per scaricare/condividere.
  const getPhotoBlob = async (): Promise<Blob | null> => {
    if (!photo) return null;
    try {
      const res = await fetch(photo);
      return await res.blob();
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
      if (!blob) { notify('Foto non disponibile per il download.'); return; }
      if (Capacitor.isNativePlatform()) {
        // Su app nativa il tag <a download> non salva nulla: si scrive nei
        // Documenti del telefono col plugin Filesystem (già in bundle).
        await Filesystem.writeFile({
          path: `WIP Vision/${photoFileName}`,
          data: await blobToBase64(blob),
          directory: Directory.Documents,
          recursive: true,
        });
        notify('Foto salvata in Documenti/WIP Vision.');
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
      notify('Salvataggio non riuscito, riprova.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleShare = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const shareText = [card.nome, card.citta].filter(Boolean).join(' · ');
      const blob = await getPhotoBlob();
      if (blob && typeof navigator.share === 'function') {
        const file = new File([blob], photoFileName, { type: blob.type || 'image/jpeg' });
        // canShare({files}) è il percorso ricco (foto vera); se il device non
        // lo supporta si condivide testo+link, altrimenti si salva in locale.
        if ((navigator as any).canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: card.nome, text: shareText } as any);
          return;
        }
        await navigator.share({ title: card.nome, text: shareText, url: card.photo_url || undefined });
        return;
      }
      await handleDownload();
    } catch (e: any) {
      // AbortError = utente ha chiuso il foglio di condivisione: silenzio.
      if (e?.name !== 'AbortError') notify('Condivisione non disponibile: foto salvata in locale.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const chips = [
    { icon: User, label: card.autore, hide: !card.autore || card.autore === 'Ignoto' },
    { icon: CalendarDays, label: card.anno_produzione },
    { icon: Palette, label: card.stile, hide: !card.stile || card.stile === 'N/D' },
    { icon: MapPin, label: card.citta },
  ].filter(c => c.label && !c.hide);

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
      await speakAudioguide(text, (language || 'IT').toLowerCase(), getGuideCharacter(), () => setAudioPlaying(false));
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
    <div className="fixed inset-0 z-[2500] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center">
      <motion.div
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
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
          {photo && (
            <div className="absolute top-4 left-4 flex gap-2">
              <button
                onClick={handleDownload}
                disabled={photoBusy}
                title="Salva la foto sul dispositivo"
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50"
              >
                {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              <button
                onClick={handleShare}
                disabled={photoBusy}
                title="Condividi la foto"
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

          {card.descrizione_breve && (
            <p className="text-[15px] text-slate-800 font-medium leading-relaxed mb-5">{card.descrizione_breve}</p>
          )}

          <Section icon={BookOpen} title="Descrizione" text={card.descrizione_dettagliata} />
          <Section icon={Landmark} title="Storia" text={card.storia} />
          <Section icon={Sparkles} title="Curiosità" text={card.curiosita} />

          <p className="text-[10px] text-slate-400 text-center mt-2">
            Scheda generata dall'AI e salvata nella tua collezione.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
