import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { notify } from '../../lib/toast';
import { RefreshCw, Landmark, Map as MapIcon, CheckCircle2, AlertTriangle, XCircle, ExternalLink, Wand2, Save, Trash2, Plus } from 'lucide-react';

/**
 * CRUSCOTTO «COMPLETEZZA MUSEI» (12/09/2026, punto 3 del piano del
 * committente): un rigo per museo prioritario con ciò che ha e ciò che
 * manca, e l'EDITOR DEI PIN: la pianta a schermo, i numeri delle sale da
 * trascinare o aggiungere col clic, «Rifai pin» con i modelli, «Salva».
 * Un pin messo a mano vale più di uno dei modelli (origine 'admin').
 */
type Pianta = { poiId: string; indice: number; titolo: string | null; url: string; pins: number; concordi: number; origine: string | null };
type Riga = {
  qid: string; rango: number; nome: string; sito: string | null; paese: string | null; sitelinks: number | null;
  guida: { lingue: string[]; tappe: number; conSala: number; conCodice: number; chiave: string } | null;
  fonti: { wikipedia: number; pdf: number; sito: number; wikivoyage: number; commons: number; pianteVerificate: number; pianteDaVerificare: number };
  piante: Pianta[]; pin: number; pinConcordi: number; stato: 'verde' | 'giallo' | 'rosso';
};
type Pin = { sala: string; x: number; y: number; origine?: string; concordi?: boolean; incerto?: boolean; etichetta?: string };

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

function Semaforo({ stato }: { stato: Riga['stato'] }) {
  if (stato === 'verde') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (stato === 'giallo') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

/** L'editor: pianta + pin trascinabili. Coordinate in frazione 0-1. */
function EditorPin({ riga, pianta, onClose, onSaved }: { riga: Riga; pianta: Pianta; onClose: () => void; onSaved: () => void }) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [sale, setSale] = useState<string[]>([]);
  const [salaNuova, setSalaNuova] = useState('');
  const [caricando, setCaricando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [rifacendo, setRifacendo] = useState(false);
  const [trascino, setTrascino] = useState<number | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(getApiUrl(`/api/museums/map?poiId=${encodeURIComponent(pianta.poiId)}`));
        const j = await r.json();
        const m = (j?.maps || []).find((x: any) => x.url === pianta.url) || (j?.maps || [])[0];
        if (vivo && m) setPins(Array.isArray(m.pins) ? m.pins : []);
      } catch { /* vuoto */ }
      // Le sale della guida: dal codice quando c'è.
      try {
        const { data } = await supabase.from('museum_guides').select('guide').or(`poi_id.like.*-${riga.qid},venue_key.like.*-${riga.qid}`).limit(4);
        const s = new Set<string>();
        for (const g of (data || [])) for (const t of ((g as any)?.guide?.tappe || [])) { if (t?.soloCollezione) continue; const c = String(t?.salaCodice || '').trim(); const d = String(t?.dove || '').trim(); if (c) s.add(c); else if (d) s.add(d); }
        if (vivo) setSale([...s]);
      } catch { /* niente sale */ }
      if (vivo) setCaricando(false);
    })();
    return () => { vivo = false; };
  }, [pianta.poiId, pianta.url, riga.qid]);

  const posizioneDa = (e: React.MouseEvent | MouseEvent) => {
    const el = box.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  useEffect(() => {
    if (trascino === null) return;
    const move = (e: MouseEvent) => { const p = posizioneDa(e); if (!p) return; setPins(prev => prev.map((q, i) => i === trascino ? { ...q, x: p.x, y: p.y, origine: 'admin', concordi: true, incerto: false } : q)); };
    const up = () => setTrascino(null);
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [trascino]);

  const aggiungi = (e: React.MouseEvent) => {
    if (trascino !== null) return;
    const sala = salaNuova.trim(); if (!sala) { notify('Scegli prima la sala da mettere (a destra), poi clicca sulla pianta.'); return; }
    const p = posizioneDa(e); if (!p) return;
    setPins(prev => [...prev.filter(q => q.sala !== sala), { sala, x: p.x, y: p.y, origine: 'admin', concordi: true }]);
  };
  const salva = async () => {
    setSalvando(true);
    try {
      const r = await fetch(getApiUrl('/api/admin/museums/map/pins'), { method: 'POST', headers: await adminHeaders(), body: JSON.stringify({ poiId: pianta.poiId, indice: pianta.indice, pins }) });
      if (!r.ok) throw new Error(String(r.status));
      notify('Pin salvati'); onSaved();
    } catch (e: any) { notify(`Salvataggio fallito (${e?.message})`); }
    setSalvando(false);
  };
  const rifai = async () => {
    setRifacendo(true);
    try {
      const r = await fetch(getApiUrl('/api/admin/museums/map/auto-pins'), { method: 'POST', headers: await adminHeaders(), body: JSON.stringify({ poiId: pianta.poiId, indice: pianta.indice }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || String(r.status));
      setPins(Array.isArray(j?.pins) ? j.pins : []);
      notify(`Trovate ${j?.trovate ?? 0} sale su ${(j?.sale || []).length}`);
    } catch (e: any) { notify(`Pin automatici falliti (${e?.message})`); }
    setRifacendo(false);
  };
  const mancanti = sale.filter(s => !pins.some(p => p.sala === s));

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <MapIcon className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-gray-900 truncate">{riga.nome} · pianta {pianta.indice}{pianta.titolo ? ` · ${pianta.titolo}` : ''}</p>
            <p className="text-[11px] text-gray-500">Trascina un numero per spostarlo. Per aggiungere: scegli la sala a destra e clicca sulla pianta. Pin con bordo ambra = un solo modello, da confermare.</p>
          </div>
          <button onClick={rifai} disabled={rifacendo} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-black flex items-center gap-1 disabled:opacity-50"><Wand2 className="w-4 h-4" />{rifacendo ? 'Sto leggendo la pianta…' : 'Rifai pin coi modelli'}</button>
          <button onClick={salva} disabled={salvando} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1 disabled:opacity-50"><Save className="w-4 h-4" />Salva</button>
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-black text-gray-500">Chiudi</button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-auto bg-gray-50 p-3">
            <div ref={box} className="relative inline-block select-none cursor-crosshair" onClick={aggiungi}>
              <img src={pianta.url} alt="" className="block max-w-full h-auto" draggable={false} />
              {caricando && <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-500 bg-white/60">Carico i pin…</div>}
              {pins.map((p, i) => (
                <button
                  key={`${p.sala}-${i}`}
                  type="button"
                  title={`${p.sala}${p.etichetta ? ` (letto: ${p.etichetta})` : ''}`}
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setTrascino(i); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-7 h-7 px-1.5 rounded-full text-[11px] font-black text-white border-2 shadow cursor-grab active:cursor-grabbing ${p.origine === 'admin' ? 'bg-emerald-600 border-white' : p.concordi ? 'bg-primary border-white' : 'bg-primary border-amber-400'}`}
                >
                  {sale.indexOf(p.sala) >= 0 ? sale.indexOf(p.sala) + 1 : '·'}
                </button>
              ))}
            </div>
          </div>
          <div className="w-72 shrink-0 border-l border-gray-100 overflow-y-auto p-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Sale della guida ({sale.length})</p>
            {sale.length === 0 && <p className="text-xs text-gray-500">La guida non ha sale: i pin non hanno a cosa agganciarsi. Serve una guida con «dove» o «salaCodice».</p>}
            {sale.map((s, i) => {
              const p = pins.find(q => q.sala === s);
              return (
                <div key={s} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${salaNuova === s ? 'border-primary bg-blue-50' : 'border-gray-100'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${p ? (p.origine === 'admin' ? 'bg-emerald-600' : p.concordi ? 'bg-primary' : 'bg-amber-500') : 'bg-gray-300'}`}>{i + 1}</span>
                  <button className="flex-1 min-w-0 text-left truncate font-bold text-gray-800" onClick={() => setSalaNuova(s)} title={s}>{s}</button>
                  {p ? (
                    <button title="Togli il pin" onClick={() => setPins(prev => prev.filter(q => q.sala !== s))} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button title="Metti: poi clicca sulla pianta" onClick={() => setSalaNuova(s)} className="text-gray-400 hover:text-primary"><Plus className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              );
            })}
            {mancanti.length > 0 && <p className="text-[11px] text-amber-700 font-bold pt-1">{mancanti.length} sale senza pin</p>}
            <div className="pt-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1">Sala non in elenco</p>
              <input value={salaNuova} onChange={e => setSalaNuova(e.target.value)} placeholder="es. Room 32" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminMusei() {
  const [dati, setDati] = useState<{ totali: any; righe: Riga[]; generatoIl: string } | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'tutti' | 'verde' | 'giallo' | 'rosso'>('tutti');
  const [cerca, setCerca] = useState('');
  const [editor, setEditor] = useState<{ riga: Riga; pianta: Pianta } | null>(null);

  const carica = async () => {
    setCaricando(true); setErrore(null);
    try {
      const r = await fetch(getApiUrl('/api/admin/museums/completeness?limit=500'), { headers: await adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || String(r.status));
      setDati(j);
    } catch (e: any) { setErrore(e?.message || 'errore'); }
    setCaricando(false);
  };
  useEffect(() => { void carica(); }, []);

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (dati?.righe || []).filter(r => (filtro === 'tutti' || r.stato === filtro) && (!q || r.nome.toLowerCase().includes(q) || r.qid.toLowerCase() === q));
  }, [dati, filtro, cerca]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Landmark className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-[200px]">
          <h3 className="font-black text-sm text-primary uppercase tracking-wider">Completezza musei</h3>
          <p className="text-[11px] text-gray-500">I musei prioritari per notorietà: guida con sale, fonti in archivio, pianta verificata, pin. Verde = guida con sale e pianta con pin; giallo = manca uno dei due; rosso = niente guida.</p>
        </div>
        {dati && (
          <div className="flex gap-2 text-xs font-black">
            {(['tutti', 'verde', 'giallo', 'rosso'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)} className={`px-3 py-1.5 rounded-xl border ${filtro === f ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'}`}>
                {f === 'tutti' ? `Tutti ${dati.totali.musei}` : f === 'verde' ? `Verdi ${dati.totali.verdi}` : f === 'giallo' ? `Gialli ${dati.totali.gialli}` : `Rossi ${dati.totali.rossi}`}
              </button>
            ))}
          </div>
        )}
        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca museo o QID" className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs w-48" />
        <button onClick={carica} disabled={caricando} className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-black flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${caricando ? 'animate-spin' : ''}`} />Aggiorna</button>
      </div>
      {errore && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">Non riesco a leggere il cruscotto: {errore}</div>}
      {dati && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 text-[11px] text-gray-500 flex flex-wrap gap-4">
            <span>Con pianta: <b>{dati.totali.conPianta}</b></span><span>Con pin: <b>{dati.totali.conPin}</b></span><span>Con guida PDF: <b>{dati.totali.conPdf}</b></span>
            <span className="ml-auto">Generato {new Date(dati.generatoIl).toLocaleString('it-IT')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', '', 'Museo', 'Guida', 'Sale', 'Codici', 'Wikipedia', 'PDF', 'Sito', 'Wikivoyage', 'Piante', 'Pin', 'Azioni'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {righe.map(r => (
                  <tr key={r.qid} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-400">{r.rango}</td>
                    <td className="px-3 py-2"><Semaforo stato={r.stato} /></td>
                    <td className="px-3 py-2 font-bold text-gray-900 max-w-[240px]">
                      <div className="truncate" title={r.nome}>{r.nome}</div>
                      <div className="text-[10px] text-gray-400 font-normal flex gap-2">
                        <span>{r.qid}</span>
                        {r.sito && <a href={r.sito} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-0.5"><ExternalLink className="w-3 h-3" />sito</a>}
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.guida ? `${r.guida.tappe} tappe · ${r.guida.lingue.join(',')}` : <span className="text-red-500 font-bold">nessuna</span>}</td>
                    <td className="px-3 py-2">{r.guida ? r.guida.conSala : '–'}</td>
                    <td className="px-3 py-2">{r.guida ? r.guida.conCodice : '–'}</td>
                    <td className="px-3 py-2">{r.fonti.wikipedia}</td>
                    <td className="px-3 py-2">{r.fonti.pdf}</td>
                    <td className="px-3 py-2">{r.fonti.sito}</td>
                    <td className="px-3 py-2">{r.fonti.wikivoyage}</td>
                    <td className="px-3 py-2">{r.piante.length}{r.fonti.pianteDaVerificare ? <span className="text-amber-600"> (+{r.fonti.pianteDaVerificare} da verificare)</span> : ''}</td>
                    <td className="px-3 py-2">{r.pin}{r.pin ? <span className="text-gray-400"> ({r.pinConcordi} certi)</span> : ''}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.piante.map(p => (
                          <button key={`${p.poiId}-${p.indice}`} onClick={() => setEditor({ riga: r, pianta: p })} className="px-2 py-1 rounded-lg border border-gray-200 font-black text-[10px] flex items-center gap-1 hover:border-primary"><MapIcon className="w-3 h-3" />Pin {p.indice}{p.pins ? ` (${p.pins})` : ''}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editor && <EditorPin riga={editor.riga} pianta={editor.pianta} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void carica(); }} />}
    </div>
  );
}
