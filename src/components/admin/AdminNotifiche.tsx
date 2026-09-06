/**
 * Pannello admin «Notifiche» (06/09/2026): invio di push/email ai clienti
 * (un utente, un segmento, tutti) e registro degli invii. Le promozionali
 * vanno solo a chi ha dato il consenso e al massimo una a settimana: lo
 * applica il server (/api/admin/notifiche/invia), qui si vede l'esito.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { Bell, Send, RefreshCw, CheckCircle2, AlertTriangle, Smartphone, Mail } from 'lucide-react';

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

interface RigaNotifica { id: string; user_id: string; tipo: string; titolo: string; corpo: string; canali: string[]; esito: any; inviata_da: string | null; letta_at: string | null; created_at: string; }

export default function AdminNotifiche() {
  const [registro, setRegistro] = useState<RigaNotifica[]>([]);
  const [dispositivi, setDispositivi] = useState<Record<string, number>>({});
  const [configurato, setConfigurato] = useState<{ email: boolean; push: boolean }>({ email: false, push: false });
  const [caricamento, setCaricamento] = useState(false);
  // Form
  const [destTipo, setDestTipo] = useState<'utente' | 'segmento' | 'tutti'>('utente');
  const [destEmail, setDestEmail] = useState('');
  const [segmento, setSegmento] = useState('lingua:IT');
  const [titolo, setTitolo] = useState('');
  const [corpo, setCorpo] = useState('');
  const [tipo, setTipo] = useState<'servizio' | 'promo'>('servizio');
  const [azione, setAzione] = useState('');
  const [ancheEmail, setAncheEmail] = useState(false);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState<any>(null);

  const carica = async () => {
    setCaricamento(true);
    try {
      const r = await fetch(getApiUrl('/api/admin/notifiche'), { headers: await adminHeaders() });
      const j = await r.json();
      if (r.ok) { setRegistro(j.notifiche || []); setDispositivi(j.dispositivi || {}); setConfigurato(j.configurato || { email: false, push: false }); }
    } catch { /* niente */ }
    setCaricamento(false);
  };
  useEffect(() => { void carica(); }, []);

  const invia = async () => {
    if (!titolo.trim() || !corpo.trim()) return;
    const n = destTipo === 'utente' ? 1 : Object.values(dispositivi).reduce((s: number, x: number) => s + x, 0);
    if (destTipo !== 'utente' && !window.confirm(`Invio a ${destTipo === 'tutti' ? 'TUTTI' : `segmento ${segmento}`} (fino a ${n} dispositivi). Confermi?`)) return;
    setInvio(true); setEsito(null);
    try {
      const r = await fetch(getApiUrl('/api/admin/notifiche/invia'), {
        method: 'POST', headers: await adminHeaders(),
        body: JSON.stringify({ destinatario: { tipo: destTipo, email: destEmail, segmento }, titolo, corpo, tipo, azione: azione || undefined, email: ancheEmail }),
      });
      const j = await r.json();
      setEsito(r.ok ? j : { error: j?.error || `HTTP ${r.status}` });
      if (r.ok) { setTitolo(''); setCorpo(''); void carica(); }
    } catch (e: any) { setEsito({ error: e?.message }); }
    setInvio(false);
  };

  const totDisp = Object.values(dispositivi).reduce((s: number, x: number) => s + x, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-100 px-4 py-2 text-sm"><Smartphone className="w-4 h-4 text-primary" /> <b>{totDisp}</b> dispositivi {Object.entries(dispositivi).map(([k, v]) => <span key={k} className="text-gray-500">· {k} {v}</span>)}</div>
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm ${configurato.push ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>{configurato.push ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} Push FCM {configurato.push ? 'configurate' : 'NON configurate (FIREBASE_SERVICE_ACCOUNT)'}</div>
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm ${configurato.email ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>{configurato.email ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} Email {configurato.email ? 'configurate' : 'NON configurate (RESEND_API_KEY)'}</div>
        <button onClick={carica} className="ml-auto flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary/70 hover:text-primary"><RefreshCw className={`w-4 h-4 ${caricamento ? 'animate-spin' : ''}`} /> Aggiorna</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2"><Bell className="w-4 h-4" /> Nuova notifica</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-gray-600">Destinatario
            <select value={destTipo} onChange={e => setDestTipo(e.target.value as any)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="utente">Un utente (email)</option>
              <option value="segmento">Un segmento</option>
              <option value="tutti">Tutti con dispositivo</option>
            </select>
          </label>
          {destTipo === 'utente' && (
            <label className="text-xs font-bold text-gray-600 md:col-span-2">Email dell'utente
              <input value={destEmail} onChange={e => setDestEmail(e.target.value)} placeholder="nome@esempio.it" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </label>
          )}
          {destTipo === 'segmento' && (
            <label className="text-xs font-bold text-gray-600 md:col-span-2">Segmento
              <select value={segmento} onChange={e => setSegmento(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                {['IT', 'EN', 'FR', 'ES', 'DE', 'RU', 'ZH'].map(l => <option key={l} value={`lingua:${l}`}>Lingua {l}</option>)}
                <option value="inattivi_30">Inattivi da 30 giorni</option>
              </select>
            </label>
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-gray-600 md:col-span-2">Titolo
            <input value={titolo} onChange={e => setTitolo(e.target.value)} maxLength={120} placeholder="🎉 Novità in WIP" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-gray-600">Tipo
            <select value={tipo} onChange={e => setTipo(e.target.value as any)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="servizio">Servizio (sempre)</option>
              <option value="promo">Promozionale (solo consenso, max 1/settimana)</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-bold text-gray-600">Testo
          <textarea value={corpo} onChange={e => setCorpo(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <label className="text-xs font-bold text-gray-600">Azione all'apertura
            <select value={azione} onChange={e => setAzione(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="">Apri l'app</option>
              <option value="archivio">Archivio</option>
              <option value="shop">Shop crediti</option>
              <option value="coupon">Coupon</option>
              <option value="itinerario">Itinerario</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 pb-2"><input type="checkbox" checked={ancheEmail} onChange={e => setAncheEmail(e.target.checked)} /> <Mail className="w-4 h-4" /> Manda anche via email</label>
          <button onClick={invia} disabled={invio || !titolo.trim() || !corpo.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-black text-sm px-4 py-2.5 disabled:opacity-40"><Send className="w-4 h-4" /> {invio ? 'Invio…' : 'Invia'}</button>
        </div>
        {esito && (
          <div className={`rounded-xl px-4 py-3 text-sm ${esito.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {esito.error ? `Errore: ${esito.error}` : `Destinatari ${esito.destinatari} · raggiunti ${esito.inviate} · senza canale ${esito.senza_canale}${esito.saltati_tetto_promo ? ` · saltati per tetto promo ${esito.saltati_tetto_promo}` : ''}`}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2"><h3 className="font-black text-sm text-primary uppercase tracking-wider">Registro invii (ultime 200)</h3></div>
        {registro.length === 0 ? <div className="p-6 text-center text-sm text-gray-500">Ancora nessuna notifica.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-primary/60">
                <th className="px-4 py-3">Quando</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Titolo</th><th className="px-4 py-3">Canali</th><th className="px-4 py-3">Esito</th><th className="px-4 py-3">Letta</th>
              </tr></thead>
              <tbody>
                {registro.map(r => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">{new Date(r.created_at).toLocaleString('it-IT')}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${r.tipo === 'promo' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{r.tipo}</span>{r.inviata_da ? <span className="ml-1 text-[10px] text-gray-400">admin</span> : null}</td>
                    <td className="px-4 py-2 max-w-[320px]"><div className="font-bold text-gray-900 truncate">{r.titolo}</div><div className="text-xs text-gray-500 truncate">{r.corpo}</div></td>
                    <td className="px-4 py-2 text-xs text-gray-600">{(r.canali || []).join(', ') || '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.esito?.push?.inviate != null ? `push ${r.esito.push.inviate}${r.esito.push.errore ? ` (${r.esito.push.errore})` : ''}` : ''}{r.esito?.email ? ` · email ${r.esito.email.ok ? 'ok' : r.esito.email.errore}` : ''}</td>
                    <td className="px-4 py-2 text-xs">{r.letta_at ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
