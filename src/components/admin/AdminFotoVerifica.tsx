import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { notify } from '../../lib/toast';
import { RefreshCw, Check, X, ExternalLink, MapPin, ImageOff, LayoutGrid, Rows3, CheckSquare, Square, ZoomIn } from 'lucide-react';

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
 *
 * DUE VISTE (26/09/2026, committente: «20/50/100 miniature per poterle
 * selezionare tutte e approvare o cancellare in bulk; singolarmente si può
 * selezionare/deselezionare»): «Schede» (una alla volta, con tutti i dettagli)
 * e «Miniature» (griglia di 20/50/100 foto, selezione a tocco, approva o rifiuta
 * le selezionate in una volta). Per ogni luogo una sola foto può vincere: se ne
 * scegli due dello stesso luogo, il server ne pubblica una e chiude l'altra.
 */
type Candidata = {
  id: number; poi_id: string; poi_nome: string; foto_url: string; fonte_url: string;
  fonte_dominio: string; fonte_tipo: string; stato: string; creato_at: string;
  luogo: { city?: string | null; country?: string | null; category?: string | null; lat?: number | null; lon?: number | null; image_url?: string | null } | null;
};
type Stato = 'da_verificare' | 'approvata' | 'rifiutata';
type Vista = 'schede' | 'miniature';

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

const PAGINA_SCHEDE = 40;
const DIMENSIONI = [20, 50, 100] as const;
const MAX_LOTTO = 100; // tetto della rotta /decidi-lotto

const leggi = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const scrivi = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* preferenza non salvata */ } };

/**
 * L'anteprima piccola di una foto: da Commons si chiede una versione a 320 px invece dell'originale
 * (una griglia di 100 foto da 5 MB non si carica). Se l'anteprima non si carica si ripiega sull'originale.
 */
function urlMiniatura(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'commons.wikimedia.org' && /\/wiki\/Special:FilePath\//i.test(u.pathname)) {
      u.searchParams.set('width', '320');
      return u.toString();
    }
    const m = u.hostname === 'upload.wikimedia.org' && u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/i);
    if (m && /\.(jpe?g|png|webp|gif)$/i.test(m[2])) return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/320px-${m[2]}`;
  } catch { /* URL non valido: resta com'è */ }
  return url;
}

export default function AdminFotoVerifica() {
  const [stato, setStato] = useState<Stato>('da_verificare');
  const [vista, setVista] = useState<Vista>(() => (leggi('wip_foto_vista') === 'miniature' ? 'miniature' : 'schede'));
  const [perPagina, setPerPagina] = useState<number>(() => { const n = Number(leggi('wip_foto_per_pagina')); return (DIMENSIONI as readonly number[]).includes(n) ? n : 50; });
  const [righe, setRighe] = useState<Candidata[]>([]);
  const [totale, setTotale] = useState(0);
  const [caricando, setCaricando] = useState(false);
  const [inCorso, setInCorso] = useState<number | null>(null);
  const [rotte, setRotte] = useState<Set<number>>(new Set());
  // Anteprima che non si carica: si prova l'originale prima di darla per rotta.
  const [conOriginale, setConOriginale] = useState<Set<number>>(new Set());
  const [selezione, setSelezione] = useState<Set<number>>(new Set());
  const [lottoInCorso, setLottoInCorso] = useState(false);

  const limite = vista === 'miniature' ? perPagina : PAGINA_SCHEDE;

  const carica = async (daCapo: boolean) => {
    setCaricando(true);
    try {
      const offset = daCapo ? 0 : righe.length;
      const r = await fetch(getApiUrl(`/api/admin/foto-da-verificare?stato=${stato}&limit=${limite}&offset=${offset}`), { headers: await adminHeaders() });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setTotale(Number(j.totale) || 0);
      setRighe(prev => daCapo ? j.righe : [...prev, ...j.righe.filter((n: Candidata) => !prev.some(p => p.id === n.id))]);
      if (daCapo) setSelezione(new Set());
    } catch (e: any) {
      notify(`Foto da verificare: ${e?.message || 'errore di caricamento'}`);
    } finally {
      setCaricando(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void carica(true); }, [stato, vista, perPagina]);

  const cambiaVista = (v: Vista) => { setVista(v); scrivi('wip_foto_vista', v); };
  const cambiaPerPagina = (n: number) => { setPerPagina(n); scrivi('wip_foto_per_pagina', String(n)); };

  const decidi = async (c: Candidata, decisione: 'approva' | 'rifiuta') => {
    if (inCorso) return;
    setInCorso(c.id);
    try {
      const r = await fetch(getApiUrl('/api/admin/foto-da-verificare/decidi'), { method: 'POST', headers: await adminHeaders(), body: JSON.stringify({ id: c.id, decisione }) });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // Approvata: spariscono anche le altre candidate dello stesso luogo.
      setRighe(prev => prev.filter(x => x.id !== c.id && !(decisione === 'approva' && x.poi_id === c.poi_id)));
      setSelezione(prev => { const n = new Set(prev); n.delete(c.id); return n; });
      setTotale(t => Math.max(0, t - 1));
      notify(decisione === 'approva' ? `Pubblicata: ${c.poi_nome}` : `Rifiutata: ${c.poi_nome}`);
    } catch (e: any) {
      notify(`Decisione non salvata: ${e?.message || 'errore'}`);
    } finally {
      setInCorso(null);
    }
  };

  // ── Selezione in blocco ──
  const selezionabili = useMemo(() => righe.filter(c => !rotte.has(c.id)), [righe, rotte]);
  const tutteSelezionate = selezionabili.length > 0 && selezionabili.every(c => selezione.has(c.id));
  const alterna = (id: number) => setSelezione(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selezionaTutte = () => setSelezione(new Set(selezionabili.map(c => c.id)));
  const deselezionaTutte = () => setSelezione(new Set());

  const decidiLotto = async (decisione: 'approva' | 'rifiuta') => {
    if (lottoInCorso) return;
    // Le foto che non si caricano non si pubblicano mai; si possono rifiutare.
    const scelte = righe.filter(c => selezione.has(c.id) && (decisione === 'rifiuta' || !rotte.has(c.id)));
    if (!scelte.length) return;
    const saltate = selezione.size - scelte.length;
    const luoghiDoppi = scelte.length - new Set(scelte.map(c => c.poi_id)).size;
    const testo = decisione === 'approva'
      ? `Approvare ${scelte.length} foto e pubblicarle in app?${luoghiDoppi ? `\n\n${luoghiDoppi} sono dello stesso luogo di un'altra selezionata: per ogni luogo se ne pubblica UNA (la prima) e le altre si chiudono.` : ''}${saltate ? `\n\n${saltate} foto che non si caricano restano escluse.` : ''}\n\nAlcune sostituiscono la foto che il luogo ha già.`
      : `Rifiutare ${scelte.length} foto? Non compariranno mai in app.`;
    if (!window.confirm(testo)) return;
    setLottoInCorso(true);
    let fatte = 0, errori = 0, giaDecise = 0;
    try {
      const headers = await adminHeaders();
      for (let i = 0; i < scelte.length; i += MAX_LOTTO) {
        const ids = scelte.slice(i, i + MAX_LOTTO).map(c => c.id);
        const r = await fetch(getApiUrl('/api/admin/foto-da-verificare/decidi-lotto'), { method: 'POST', headers, body: JSON.stringify({ ids, decisione }) });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        fatte += Number(j.fatte) || 0; errori += (j.errori || []).length; giaDecise += Number(j.giaDecise) || 0;
      }
      notify(`${decisione === 'approva' ? 'Pubblicate' : 'Rifiutate'} ${fatte} foto${errori ? ` · ${errori} NON riuscite (restano in coda)` : ''}${giaDecise ? ` · ${giaDecise} già decise` : ''}`);
    } catch (e: any) {
      notify(`Decisione in blocco non completata: ${e?.message || 'errore'} (${fatte} già fatte)`);
    } finally {
      setLottoInCorso(false);
      await carica(true);
    }
  };

  const nSel = selezione.size;

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
        <div className="flex bg-white rounded-xl p-0.5 border border-slate-200 gap-0.5" role="group" aria-label="Vista">
          <button type="button" onClick={() => cambiaVista('schede')} aria-pressed={vista === 'schede'}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black ${vista === 'schede' ? 'bg-primary text-white' : 'text-slate-500'}`}>
            <Rows3 className="w-3.5 h-3.5" /> Schede
          </button>
          <button type="button" onClick={() => cambiaVista('miniature')} aria-pressed={vista === 'miniature'}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black ${vista === 'miniature' ? 'bg-primary text-white' : 'text-slate-500'}`}>
            <LayoutGrid className="w-3.5 h-3.5" /> Miniature
          </button>
        </div>
        {vista === 'miniature' && (
          <div className="flex items-center gap-1" role="group" aria-label="Foto per pagina">
            {DIMENSIONI.map(n => (
              <button key={n} type="button" onClick={() => cambiaPerPagina(n)} aria-pressed={perPagina === n}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border ${perPagina === n ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200'}`}>
                {n}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs font-bold text-slate-500">{totale} foto</span>
        <button type="button" onClick={() => void carica(true)} disabled={caricando || lottoInCorso}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-black text-primary disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${caricando ? 'animate-spin' : ''}`} /> Aggiorna
        </button>
      </div>

      {vista === 'miniature' && stato === 'da_verificare' && righe.length > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
          <button type="button" onClick={tutteSelezionate ? deselezionaTutte : selezionaTutte} disabled={lottoInCorso}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-[11px] font-black text-slate-700 disabled:opacity-50">
            {tutteSelezionate ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {tutteSelezionate ? 'Deseleziona tutte' : `Seleziona tutte (${selezionabili.length})`}
          </button>
          {nSel > 0 && !tutteSelezionate && (
            <button type="button" onClick={deselezionaTutte} disabled={lottoInCorso} className="text-[11px] font-black text-slate-500 underline disabled:opacity-50">Svuota selezione</button>
          )}
          <span className="text-xs font-black text-slate-700">{nSel} selezionate</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => void decidiLotto('approva')} disabled={nSel === 0 || lottoInCorso}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-40">
              <Check className="w-4 h-4" /> {lottoInCorso ? 'Lavoro…' : `Approva selezionate (${nSel})`}
            </button>
            <button type="button" onClick={() => void decidiLotto('rifiuta')} disabled={nSel === 0 || lottoInCorso}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-black disabled:opacity-40">
              <X className="w-4 h-4" /> Rifiuta selezionate ({nSel})
            </button>
          </div>
        </div>
      )}

      {!caricando && righe.length === 0 && (
        <div className="py-16 text-center text-sm font-bold text-slate-500">
          {stato === 'da_verificare' ? 'Nessuna foto in attesa: la coda è vuota.' : 'Niente in questo elenco.'}
        </div>
      )}

      {vista === 'miniature' ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
          {righe.map(c => {
            const scelta = selezione.has(c.id);
            const tipo = ETICHETTA_TIPO[c.fonte_tipo] || ETICHETTA_TIPO.terzi;
            const rotta = rotte.has(c.id);
            const src = conOriginale.has(c.id) ? c.foto_url : urlMiniatura(c.foto_url);
            const selezionabile = stato === 'da_verificare';
            return (
              <div key={c.id} className={`relative group rounded-xl overflow-hidden bg-slate-100 aspect-square border-2 ${scelta ? 'border-emerald-500 ring-2 ring-emerald-300' : 'border-transparent'}`}>
                <button type="button" onClick={() => selezionabile && alterna(c.id)} disabled={!selezionabile}
                  aria-pressed={scelta} aria-label={`${scelta ? 'Togli dalla selezione' : 'Seleziona'}: ${c.poi_nome}`}
                  className="absolute inset-0 w-full h-full text-left">
                  {rotta ? (
                    <div className="w-full h-full grid place-items-center text-slate-400 text-[10px] font-bold px-1 text-center"><span className="flex flex-col items-center gap-1"><ImageOff className="w-5 h-5" />Non si carica</span></div>
                  ) : (
                    <img src={src} alt={c.poi_nome} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                      onError={() => {
                        if (!conOriginale.has(c.id) && src !== c.foto_url) setConOriginale(prev => new Set(prev).add(c.id));
                        else setRotte(prev => new Set(prev).add(c.id));
                      }}
                      className={`w-full h-full object-cover transition-opacity ${scelta ? 'opacity-90' : ''}`} />
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-4 pb-1 text-[10px] font-black leading-tight text-white line-clamp-2">
                    {c.poi_nome}
                  </span>
                </button>
                {selezionabile && (
                  <span className={`absolute top-1 left-1 w-5 h-5 rounded-md grid place-items-center pointer-events-none ${scelta ? 'bg-emerald-600 text-white' : 'bg-white/85 text-transparent border border-slate-300'}`}>
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
                <span className={`absolute top-1 right-7 px-1 rounded text-[8px] font-black uppercase pointer-events-none ${tipo.classe}`}>{c.fonte_tipo}</span>
                {c.luogo?.image_url && stato === 'da_verificare' && (
                  <span title="Il luogo ha già una foto in app: approvando la sostituisci" className="absolute top-6 left-1 px-1 rounded bg-amber-100 text-amber-800 text-[8px] font-black pointer-events-none">sostituisce</span>
                )}
                <a href={c.foto_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Apri la foto intera e la fonte"
                  className="absolute top-1 right-1 w-5 h-5 rounded-md bg-white/85 text-slate-700 grid place-items-center opacity-80 hover:opacity-100">
                  <ZoomIn className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      ) : (
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
      )}

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
