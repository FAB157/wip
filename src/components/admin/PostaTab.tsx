import React, { useCallback, useEffect, useState } from 'react';
import { Mail, MailOpen, RefreshCw, Reply, Send, Archive, ArchiveRestore, Paperclip, Tag, X, PenSquare, Search, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';

/**
 * POSTA (23/10/2026) — la casella marketing@wip.guide dentro il pannello admin.
 * Il server fa da proxy verso il servizio wip-posta su Oracle (IMAP Gmail per leggere, Armada + DKIM per
 * scrivere, firma «WIP Marketing Team», Bcc in wip15775@gmail.com, riga in campagna-risposte.jsonl).
 */

interface Riga { uid: number; da: string; a: string; oggetto: string; data: string; letto: boolean; etichette: string[]; archiviato: boolean; }
interface Allegato { n: number; nome: string; tipo: string; dimensione: number; }
interface Messaggio extends Riga { cc: string; rispondi_a: string; message_id: string; references: string; testo: string; html: string; allegati: Allegato[]; }
interface Bozza { a: string; cc: string; oggetto: string; testo: string; in_reply_to?: string; references?: string; allegati: Array<{ nome: string; tipo: string; base64: string }>; }

const ETICHETTE: Record<string, string> = { enti: 'Enti', hotel: 'Hotel', utenti: 'Utenti' };
const ERRORI: Record<string, string> = {
  posta_non_configurata: 'Il server non ha ancora POSTA_URL e POSTA_SECRET (variabili Vercel).',
  imap_non_configurato: 'Su Oracle mancano GMAIL_IMAP_USER e GMAIL_IMAP_APP_PASSWORD in /root/locale/.env.',
  servizio_posta_irraggiungibile: 'Il servizio posta su Oracle non risponde.',
  non_autorizzato: 'POSTA_SECRET diverso fra Vercel e Oracle.',
  campi_mancanti: 'Servono destinatario, oggetto e testo.',
};

const intestazioni = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const t = s?.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const quando = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const nomeMittente = (s: string) => (s.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || s).trim();
const indirizzo = (s: string) => (s.match(/<([^>]+)>/)?.[1] || s).trim();
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

interface Props { onMessage: (m: { type: 'success' | 'error'; text: string }) => void; }

export default function PostaTab({ onMessage }: Props) {
  const [vista, setVista] = useState<'inbox' | 'archivio' | 'inviate'>('inbox');
  const [etichetta, setEtichetta] = useState('');
  const [cerca, setCerca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [righe, setRighe] = useState<Riga[]>([]);
  const [totale, setTotale] = useState(0);
  const [carica, setCarica] = useState(false);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState<Messaggio | null>(null);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [invio, setInvio] = useState(false);
  // Selezione multipla e filtro «solo non lette» (24/10/2026).
  const [soloNonLette, setSoloNonLette] = useState(false);
  const [scelti, setScelti] = useState<Set<number>>(new Set());
  const PER = 30;

  const chiama = useCallback(async (percorso: string, init?: RequestInit) => {
    const r = await fetch(getApiUrl(`/api/admin/posta/${percorso}`), { ...init, headers: { 'Content-Type': 'application/json', ...(await intestazioni()), ...(init?.headers || {}) } });
    const j = await r.json().catch(() => ({ ok: false, errore: `http_${r.status}` }));
    if (!r.ok || j.ok === false) throw new Error(j.errore || `http_${r.status}`);
    return j;
  }, []);
  const spiega = (e: any) => ERRORI[e?.message] || `Errore: ${e?.message || e}`;

  const elenca = useCallback(async () => {
    setCarica(true); setErrore('');
    try {
      const q = new URLSearchParams({ vista, pagina: String(pagina), per: String(PER) });
      if (etichetta) q.set('etichetta', etichetta);
      if (cerca.trim()) q.set('cerca', cerca.trim());
      if (soloNonLette) q.set('solo', 'non_letti');
      const j = await chiama(`messaggi?${q}`);
      setRighe(j.messaggi || []); setTotale(j.totale || 0); setScelti(new Set());
    } catch (e) { setErrore(spiega(e)); setRighe([]); setTotale(0); }
    finally { setCarica(false); }
  }, [vista, etichetta, pagina, cerca, soloNonLette, chiama]);

  useEffect(() => { elenca(); }, [vista, etichetta, pagina, soloNonLette]); // eslint-disable-line react-hooks/exhaustive-deps

  const tutteScelte = righe.length > 0 && righe.every(r => scelti.has(r.uid));
  const scegli = (uid: number) => setScelti(s => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  const scegliTutte = () => setScelti(tutteScelte ? new Set() : new Set(righe.map(r => r.uid)));
  const scegliNonLette = () => setScelti(new Set(righe.filter(r => !r.letto).map(r => r.uid)));

  const segna = async (azione: 'letto' | 'non_letto' | 'archivia' | 'ripristina') => {
    const uids = [...scelti];
    if (!uids.length) return;
    try {
      await chiama('segna', { method: 'POST', body: JSON.stringify({ uids, azione }) });
      const testi = { letto: 'segnate come lette', non_letto: 'segnate come non lette', archivia: 'archiviate', ripristina: 'riportate in arrivo' };
      onMessage({ type: 'success', text: `${uids.length} ${testi[azione]}` });
      if (azione === 'letto' || azione === 'non_letto') {
        setRighe(rs => rs.map(r => (scelti.has(r.uid) ? { ...r, letto: azione === 'letto' } : r)));
        setScelti(new Set());
        if (soloNonLette && azione === 'letto') elenca();
      } else { setAperto(null); elenca(); }
    } catch (e) { onMessage({ type: 'error', text: spiega(e) }); }
  };

  const apri = async (uid: number) => {
    try {
      const j = await chiama(`messaggio?uid=${uid}`);
      setAperto(j.messaggio); setBozza(null);
      setRighe(rs => rs.map(r => (r.uid === uid ? { ...r, letto: true } : r)));
    } catch (e) { onMessage({ type: 'error', text: spiega(e) }); }
  };

  const archivia = async (m: Riga) => {
    try {
      await chiama('archivia', { method: 'POST', body: JSON.stringify({ uid: m.uid, ripristina: m.archiviato }) });
      onMessage({ type: 'success', text: m.archiviato ? 'Riportata in arrivo' : 'Archiviata' });
      setAperto(null); elenca();
    } catch (e) { onMessage({ type: 'error', text: spiega(e) }); }
  };

  const cambiaEtichetta = async (m: Messaggio, et: string) => {
    const togli = m.etichette.includes(et);
    try {
      await chiama('etichetta', { method: 'POST', body: JSON.stringify({ uid: m.uid, etichetta: et, togli }) });
      const nuove = togli ? m.etichette.filter(x => x !== et) : [...m.etichette, et];
      setAperto({ ...m, etichette: nuove });
      setRighe(rs => rs.map(r => (r.uid === m.uid ? { ...r, etichette: nuove } : r)));
    } catch (e) { onMessage({ type: 'error', text: spiega(e) }); }
  };

  const rispondi = (m: Messaggio) => {
    const citato = (m.testo || '').split('\n').slice(0, 40).map(l => `> ${l}`).join('\n');
    setBozza({
      a: indirizzo(m.rispondi_a || m.da), cc: '',
      oggetto: /^re:/i.test(m.oggetto) ? m.oggetto : `Re: ${m.oggetto}`,
      testo: `\n\n\nIl ${quando(m.data)}, ${nomeMittente(m.da)} ha scritto:\n${citato}`,
      in_reply_to: m.message_id, references: m.references, allegati: [],
    });
  };

  const aggiungiAllegati = async (files: FileList | null) => {
    if (!files || !bozza) return;
    const nuovi: Bozza['allegati'] = [];
    for (const f of Array.from(files)) {
      if (f.size > 2.5 * 1024 * 1024) { onMessage({ type: 'error', text: `${f.name}: massimo 2,5 MB per allegato` }); continue; }
      const b64 = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = ko; r.readAsDataURL(f); });
      nuovi.push({ nome: f.name, tipo: f.type || 'application/octet-stream', base64: b64 });
    }
    setBozza({ ...bozza, allegati: [...bozza.allegati, ...nuovi] });
  };

  const manda = async () => {
    if (!bozza) return;
    setInvio(true);
    try {
      await chiama('invia', { method: 'POST', body: JSON.stringify(bozza) });
      onMessage({ type: 'success', text: `Inviata a ${bozza.a}` });
      setBozza(null);
    } catch (e) { onMessage({ type: 'error', text: spiega(e) }); }
    finally { setInvio(false); }
  };

  const scaricaAllegato = async (m: Messaggio, a: Allegato) => {
    try {
      const r = await fetch(getApiUrl(`/api/admin/posta/allegato?uid=${m.uid}&n=${a.n}`), { headers: await intestazioni() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.errore || `http_${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const el = document.createElement('a'); el.href = url; el.download = a.nome; el.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { onMessage({ type: 'error', text: spiega(e) }); }
  };

  const pagine = Math.max(1, Math.ceil(totale / PER));
  const bottone = 'px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-primary/10 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="font-black text-primary text-lg mr-auto">Posta · marketing@wip.guide</h2>
          <button onClick={() => { setAperto(null); setBozza({ a: '', cc: '', oggetto: '', testo: '', allegati: [] }); }} className={`${bottone} bg-primary text-white`}><PenSquare className="w-4 h-4" />Nuova email</button>
          <button onClick={elenca} className={`${bottone} bg-primary/5 text-primary`}><RefreshCw className={`w-4 h-4 ${carica ? 'animate-spin' : ''}`} />Aggiorna</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([['inbox', 'In arrivo'], ['archivio', 'Archivio'], ['inviate', 'Inviate']] as const).map(([k, t]) => (
            <button key={k} onClick={() => { setVista(k); setPagina(1); }} className={`${bottone} ${vista === k ? 'bg-primary text-white' : 'bg-primary/5 text-primary'}`}>{t}</button>
          ))}
          <span className="w-px h-5 bg-primary/10 mx-1" />
          <Tag className="w-4 h-4 text-primary/50" />
          {[['', 'Tutte'], ...Object.entries(ETICHETTE)].map(([k, t]) => (
            <button key={k || 'tutte'} onClick={() => { setEtichetta(k); setPagina(1); }} className={`${bottone} ${etichetta === k ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700'}`}>{t}</button>
          ))}
          <form className="flex items-center gap-1 ml-auto" onSubmit={e => { e.preventDefault(); setPagina(1); elenca(); }}>
            <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca (sintassi Gmail)" className="px-3 py-1.5 rounded-xl border border-primary/10 text-xs w-48" />
            <button type="submit" className={`${bottone} bg-primary/5 text-primary`}><Search className="w-4 h-4" /></button>
          </form>
        </div>
        {errore && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm font-medium">{errore}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="bg-white rounded-2xl border border-primary/10 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-primary/10 bg-primary/[0.02]">
            <button onClick={scegliTutte} className={`${bottone} bg-primary/5 text-primary`}>{tutteScelte ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}Tutte</button>
            <button onClick={scegliNonLette} className={`${bottone} bg-primary/5 text-primary`}>Non lette</button>
            <button onClick={() => { setSoloNonLette(v => !v); setPagina(1); }} className={`${bottone} ${soloNonLette ? 'bg-sky-500 text-white' : 'bg-sky-50 text-sky-700'}`}>Mostra solo non lette</button>
            {scelti.size > 0 && (
              <>
                <span className="text-[11px] text-primary/60 ml-1">{scelti.size} scelte</span>
                <button onClick={() => segna('letto')} className={`${bottone} bg-primary text-white`}><MailOpen className="w-4 h-4" />Lette</button>
                <button onClick={() => segna('non_letto')} className={`${bottone} bg-primary/5 text-primary`}><Mail className="w-4 h-4" />Non lette</button>
                {vista === 'archivio'
                  ? <button onClick={() => segna('ripristina')} className={`${bottone} bg-primary/5 text-primary`}><ArchiveRestore className="w-4 h-4" />In arrivo</button>
                  : vista === 'inbox' && <button onClick={() => segna('archivia')} className={`${bottone} bg-primary/5 text-primary`}><Archive className="w-4 h-4" />Archivia</button>}
              </>
            )}
          </div>
          {righe.length === 0 && !carica && <div className="p-6 text-center text-sm text-primary/50">Nessun messaggio</div>}
          {righe.map(r => (
            <div key={r.uid} role="button" tabIndex={0} onClick={() => apri(r.uid)} onKeyDown={e => { if (e.key === 'Enter') apri(r.uid); }} className={`w-full text-left px-4 py-3 border-b border-primary/5 hover:bg-primary/5 cursor-pointer ${aperto?.uid === r.uid ? 'bg-primary/5' : ''} ${scelti.has(r.uid) ? 'bg-sky-50' : ''}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={scelti.has(r.uid)} onClick={e => e.stopPropagation()} onChange={() => scegli(r.uid)} className="w-4 h-4 shrink-0 accent-sky-600" />
                {!r.letto && <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />}
                <span className={`truncate text-sm ${r.letto ? 'text-primary/70' : 'font-black text-primary'}`}>{vista === 'inviate' ? r.a : nomeMittente(r.da)}</span>
                <span className="ml-auto text-[11px] text-primary/40 shrink-0">{quando(r.data)}</span>
              </div>
              <div className={`truncate text-xs mt-0.5 ${r.letto ? 'text-primary/60' : 'font-bold text-primary/90'}`}>{r.oggetto}</div>
              {r.etichette.length > 0 && <div className="flex gap-1 mt-1">{r.etichette.map(e => <span key={e} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold">{ETICHETTE[e] || e}</span>)}</div>}
            </div>
          ))}
          {pagine > 1 && (
            <div className="flex items-center justify-between p-3 text-xs text-primary/60">
              <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className={`${bottone} bg-primary/5 disabled:opacity-40`}>‹ Prec.</button>
              <span>Pagina {pagina} di {pagine} · {totale} messaggi</span>
              <button disabled={pagina >= pagine} onClick={() => setPagina(p => p + 1)} className={`${bottone} bg-primary/5 disabled:opacity-40`}>Succ. ›</button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-primary/10 shadow-sm p-4 min-h-[300px]">
          {bozza ? (
            <div className="space-y-2">
              <div className="flex items-center"><h3 className="font-black text-primary mr-auto">{bozza.in_reply_to ? 'Rispondi' : 'Nuova email'}</h3><button onClick={() => setBozza(null)}><X className="w-5 h-5 text-primary/50" /></button></div>
              <input value={bozza.a} onChange={e => setBozza({ ...bozza, a: e.target.value })} placeholder="A (separati da virgola)" className="w-full px-3 py-2 rounded-xl border border-primary/10 text-sm" />
              <input value={bozza.cc} onChange={e => setBozza({ ...bozza, cc: e.target.value })} placeholder="Cc" className="w-full px-3 py-2 rounded-xl border border-primary/10 text-sm" />
              <input value={bozza.oggetto} onChange={e => setBozza({ ...bozza, oggetto: e.target.value })} placeholder="Oggetto" className="w-full px-3 py-2 rounded-xl border border-primary/10 text-sm" />
              <textarea value={bozza.testo} onChange={e => setBozza({ ...bozza, testo: e.target.value })} rows={14} className="w-full px-3 py-2 rounded-xl border border-primary/10 text-sm font-mono" />
              <p className="text-[11px] text-primary/50">Mittente «WIP Marketing Team &lt;marketing@wip.guide&gt;», firma aggiunta se manca, copia nascosta a wip15775@gmail.com.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`${bottone} bg-primary/5 text-primary cursor-pointer`}><Paperclip className="w-4 h-4" />Allega<input type="file" multiple className="hidden" onChange={e => { aggiungiAllegati(e.target.files); e.target.value = ''; }} /></label>
                {bozza.allegati.map((a, i) => <span key={i} className="px-2 py-1 rounded-lg bg-primary/5 text-xs flex items-center gap-1">{a.nome}<button onClick={() => setBozza({ ...bozza, allegati: bozza.allegati.filter((_, j) => j !== i) })}><X className="w-3 h-3" /></button></span>)}
                <button disabled={invio} onClick={manda} className={`${bottone} bg-primary text-white ml-auto disabled:opacity-50`}><Send className="w-4 h-4" />{invio ? 'Invio…' : 'Invia'}</button>
              </div>
            </div>
          ) : aperto ? (
            <div className="space-y-3">
              <div>
                <h3 className="font-black text-primary text-base">{aperto.oggetto}</h3>
                <div className="text-xs text-primary/60 mt-1">Da: {aperto.da}<br />A: {aperto.a}{aperto.cc && <><br />Cc: {aperto.cc}</>}<br />{quando(aperto.data)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => rispondi(aperto)} className={`${bottone} bg-primary text-white`}><Reply className="w-4 h-4" />Rispondi</button>
                <button onClick={() => archivia(aperto)} className={`${bottone} bg-primary/5 text-primary`}>{aperto.archiviato ? <><ArchiveRestore className="w-4 h-4" />Riporta in arrivo</> : <><Archive className="w-4 h-4" />Archivia</>}</button>
                {Object.entries(ETICHETTE).map(([k, t]) => (
                  <button key={k} onClick={() => cambiaEtichetta(aperto, k)} className={`${bottone} ${aperto.etichette.includes(k) ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700'}`}><Tag className="w-3 h-3" />{t}</button>
                ))}
              </div>
              {aperto.allegati.length > 0 && (
                <div className="flex flex-wrap gap-2">{aperto.allegati.map(a => (
                  <button key={a.n} onClick={() => scaricaAllegato(aperto, a)} className={`${bottone} bg-sky-50 text-sky-700`}><Paperclip className="w-3 h-3" />{a.nome} · {kb(a.dimensione)}</button>
                ))}</div>
              )}
              {aperto.html
                ? <iframe title="messaggio" sandbox="" srcDoc={aperto.html} className="w-full h-[480px] rounded-xl border border-primary/10 bg-white" />
                : <pre className="whitespace-pre-wrap text-sm text-primary/90 font-sans">{aperto.testo}</pre>}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-primary/40">Seleziona un messaggio</div>
          )}
        </div>
      </div>
    </div>
  );
}
