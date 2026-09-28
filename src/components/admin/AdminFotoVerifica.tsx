import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { notify } from '../../lib/toast';
import { RefreshCw, Check, X, ExternalLink, MapPin, ImageOff } from 'lucide-react';

/**
 * FOTO DA VERIFICARE (18/09/2026, committente: «dove devo verificare le
 * foto?»). Il job delle foto scrive in app solo da fonte verificata (sito
 * ufficiale, Wikipedia, Wikidata, Commons con nome e tipo che combaciano);
 * tutto il resto — blog, social, guide turistiche, file Commons che
 * combaciano solo alla larga — si ferma qui, invisibile in app. Una scheda
 * per candidata: la foto, il luogo, da dove viene. «Approva» la pubblica,
 * «Rifiuta» la chiude. Approvare una foto di un blog o di un social vuol dire
 * pubblicare la foto di qualcun altro: il link alla fonte è lì per deciderlo
 * a ragion veduta.
 */
type Candidata = {
  id: number; poi_id: string; poi_nome: string; foto_url: string; fonte_url: string;
  fonte_dominio: string; fonte_tipo: string; stato: string; creato_at: string;
  luogo: { city?: string | null; country?: string | null; category?: string | null; lat?: number | null; lon?: number | null; image_url?: string | null } | null;
};
type Stato = 'da_verificare' | 'approvata' | 'rifiutata';

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

const ETICHETTA_TIPO: Record<string, { testo: string; classe: string }> = {
  commons: { testo: 'Commons · licenza libera', classe: 'bg-emerald-50 text-emerald-700' },
  guida: { testo: 'Guida turistica', classe: 'bg-amber-50 text-amber-700' },
  blog: { testo: 'Blog', classe: 'bg-amber-50 text-amber-700' },
  social: { testo: 'Social', classe: 'bg-red-50 text-red-600' },
  terzi: { testo: 'Sito di terzi', classe: 'bg-slate-100 text-slate-600' },
};

const PAGINA = 40;

export default function AdminFotoVerifica() {
  const [stato, setStato] = useState<Stato>('da_verificare');
  const [righe, setRighe] = useState<Candidata[]>([]);
  const [totale, setTotale] = useState(0);
  const [caricando, setCaricando] = useState(false);
  const [inCorso, setInCorso] = useState<number | null>(null);
  const [rotte, setRotte] = useState<Set<number>>(new Set());

  const carica = async (daCapo: boolean) => {
    setCaricando(true);
    try {
      const offset = daCapo ? 0 : righe.length;
      const r = await fetch(getApiUrl(`/api/admin/foto-da-verificare?stato=${stato}&limit=${PAGINA}&offset=${offset}`), { headers: await adminHeaders() });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setTotale(Number(j.totale) || 0);
      setRighe(prev => daCapo ? j.righe : [...prev, ...j.righe]);
    } catch (e: any) {
      notify(`Foto da verificare: ${e?.message || 'errore di caricamento'}`);
    } finally {
      setCaricando(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void carica(true); }, [stato]);

  const decidi = async (c: Candidata, decisione: 'approva' | 'rifiuta') => {
    if (inCorso) return;
    setInCorso(c.id);
    try {
      const r = await fetch(getApiUrl('/api/admin/foto-da-verificare/decidi'), { method: 'POST', headers: await adminHeaders(), body: JSON.stringify({ id: c.id, decisione }) });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // Approvata: spariscono anche le altre candidate dello stesso luogo.
      setRighe(prev => prev.filter(x => x.id !== c.id && !(decisione === 'approva' && x.poi_id === c.poi_id)));
      setTotale(t => Math.max(0, t - 1));
      notify(decisione === 'approva' ? `Pubblicata: ${c.poi_nome}` : `Rifiutata: ${c.poi_nome}`);
    } catch (e: any) {
      notify(`Decisione non salvata: ${e?.message || 'errore'}`);
    } finally {
      setInCorso(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-white rounded-xl p-0.5 border border-slate-200 gap-0.5">
          {(['da_verificare', 'approvata', 'rifiutata'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStato(s)} aria-pressed={stato === s}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black ${stato === s ? 'bg-primary text-white' : 'text-slate-500'}`}>
              {s === 'da_verificare' ? 'Da verificare' : s === 'approvata' ? 'Approvate' : 'Rifiutate'}
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-slate-500">{totale} {totale === 1 ? 'foto' : 'foto'}</span>
        <button type="button" onClick={() => void carica(true)} disabled={caricando}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-black text-primary disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${caricando ? 'animate-spin' : ''}`} /> Aggiorna
        </button>
      </div>

      {!caricando && righe.length === 0 && (
        <div className="py-16 text-center text-sm font-bold text-slate-500">
          {stato === 'da_verificare' ? 'Nessuna foto in attesa: la coda è vuota.' : 'Niente in questo elenco.'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {righe.map(c => {
          const tipo = ETICHETTA_TIPO[c.fonte_tipo] || ETICHETTA_TIPO.terzi;
          const dove = [c.luogo?.city, c.luogo?.country].filter(Boolean).join(', ');
          const mappa = c.luogo?.lat != null && c.luogo?.lon != null ? `https://www.google.com/maps?q=${c.luogo.lat},${c.luogo.lon}` : '';
          return (
            <article key={c.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.06)] flex flex-col">
              <a href={c.foto_url} target="_blank" rel="noopener noreferrer" className="block bg-slate-100 aspect-[4/3]">
                {rotte.has(c.id) ? (
                  <div className="w-full h-full grid place-items-center text-slate-400 text-xs font-bold"><span className="flex items-center gap-1.5"><ImageOff className="w-4 h-4" /> La foto non si carica più</span></div>
                ) : (
                  <img src={c.foto_url} alt={c.poi_nome} loading="lazy" referrerPolicy="no-referrer"
                    onError={() => setRotte(prev => new Set(prev).add(c.id))}
                    className="w-full h-full object-cover" />
                )}
              </a>
              <div className="p-3.5 flex-1 flex flex-col gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-900 leading-snug">{c.poi_nome}</h4>
                  <p className="text-[11px] font-bold text-slate-500">{[c.luogo?.category, dove].filter(Boolean).join(' · ') || 'luogo senza dettagli'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${tipo.classe}`}>{tipo.testo}</span>
                  <a href={c.fonte_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-black text-primary break-all">
                    <ExternalLink className="w-3 h-3 shrink-0" />{c.fonte_dominio}
                  </a>
                  {mappa && (
                    <a href={mappa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-black text-slate-500">
                      <MapPin className="w-3 h-3" />mappa
                    </a>
                  )}
                </div>
                {c.luogo?.image_url && stato === 'da_verificare' && (
                  <p className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded-lg px-2 py-1">Il luogo ha già una foto in app: approvando la sostituisci.</p>
                )}
                {stato === 'da_verificare' && (
                  <div className="mt-auto flex gap-2 pt-1">
                    <button type="button" onClick={() => void decidi(c, 'approva')} disabled={inCorso === c.id || rotte.has(c.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-40">
                      <Check className="w-4 h-4" /> Approva
                    </button>
                    <button type="button" onClick={() => void decidi(c, 'rifiuta')} disabled={inCorso === c.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-black disabled:opacity-40">
                      <X className="w-4 h-4" /> Rifiuta
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {righe.length < totale && (
        <div className="text-center">
          <button type="button" onClick={() => void carica(false)} disabled={caricando}
            className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-primary disabled:opacity-50">
            {caricando ? 'Carico…' : `Carica altre (${totale - righe.length} rimaste)`}
          </button>
        </div>
      )}
    </div>
  );
}
