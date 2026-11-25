// LOG DEI COLLAUDI NATIVI (22/11/2026, committente: «voglio un log dei collaudi nativi più dettagliato» + «va aggiunto
// nella tab test»). Legge il campo `nativi_log` della riga della notte (`api_cache` `collaudo_notte_<data>`), che il
// collaudo su Oracle aggiorna alla fine di OGNI modulo nativo (Kotlin, Swift, Test Lab Android e iOS, batteria, app
// vera) e anche quando systemd lo ferma: per modulo inizio/fine, voto, motivo, ogni riga scritta e il dettaglio
// (frasi del navigatore, difetti, giudizio di background/schermo spento/doze). Copia completa su Oracle:
// /root/collaudo-notte/nativi/<data>.jsonl.
import React, { useState } from 'react';

const NOMI: Record<string, string> = {
  nativo_android: 'Nativo Android (Kotlin, simulato)',
  nativo_ios: 'Nativo iOS (Swift, simulato)',
  nativo_android_testlab: 'Test Lab Android (telefono vero)',
  nativo_ios_testlab: 'Test Lab iPhone (telefono vero)',
  app_vera: 'App vera (WipNav, giro, auto)',
  testlab2_batteria: 'Batteria',
  batteria: 'Batteria',
};
const ESITI: Record<string, { etichetta: string; colore: string }> = {
  ok: { etichetta: 'FATTO', colore: 'bg-green-100 text-green-800' },
  senza_voto: { etichetta: 'SENZA VOTO', colore: 'bg-amber-100 text-amber-800' },
  interrotto: { etichetta: 'INTERROTTO', colore: 'bg-red-100 text-red-800' },
  in_corso: { etichetta: 'IN CORSO / NON CHIUSO', colore: 'bg-amber-100 text-amber-800' },
  ricostruito: { etichetta: 'RICOSTRUITO DAL LOG', colore: 'bg-surface-variant text-on-surface-variant' },
};
const ora = (ts?: string | null) => {
  if (!ts) return '–';
  try { return new Date(ts).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ts; }
};
const durata = (s?: number | null) => s == null ? '' : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;

// Frasi del navigatore e difetti, dove il modulo li dà (Test Lab: sezione.corse.<tipo>.frasi/difetti; iOS: frasi/difetti).
function righeDettaglio(d: any): { frasi: any[]; difetti: any[]; giudizi: [string, any][] } {
  const frasi: any[] = [], difetti: any[] = [], giudizi: [string, any][] = [];
  const visita = (x: any, dove: string) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x.frasi)) frasi.push(...x.frasi.map((f: any) => ({ ...(typeof f === 'object' ? f : { testo: f }), dove })));
    if (Array.isArray(x.difetti)) difetti.push(...x.difetti.map((f: any) => ({ ...(typeof f === 'object' ? f : { testo: f }), dove })));
    if (x.giudizio && typeof x.giudizio === 'object') giudizi.push([dove, x.giudizio]);
    for (const [k, v] of Object.entries(x)) if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'giudizio') visita(v, dove ? `${dove} › ${k}` : k);
  };
  visita(d, '');
  return { frasi, difetti, giudizi };
}

const Modulo: React.FC<{ m: any }> = ({ m }) => {
  const [aperto, setAperto] = useState(m.esito !== 'ok');
  const [grezzo, setGrezzo] = useState(false);
  const e = ESITI[m.esito] || ESITI.in_corso;
  const { frasi, difetti, giudizi } = righeDettaglio(m.dettaglio);
  return (
    <div className="p-3 rounded-2xl bg-white border border-outline-variant/10 space-y-2">
      <button onClick={() => setAperto(!aperto)} className="w-full text-left space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${e.colore}`}>{e.etichetta}</span>
          <span className="text-sm font-black text-on-surface">{NOMI[m.modulo] || m.modulo}</span>
          {m.voto != null && <span className="text-sm font-black text-primary">voto {Number(m.voto).toFixed(1)}</span>}
        </div>
        <p className="text-[11px] font-semibold text-on-surface-variant/70">
          {ora(m.inizio)} → {ora(m.fine)}{m.secondi != null ? ` · ${durata(m.secondi)}` : ''}{m.citta ? ` · ${m.citta}` : ''}
          {frasi.length ? ` · ${frasi.length} frasi` : ''}{difetti.length ? ` · ${difetti.length} difetti` : ''}
        </p>
        {m.motivo && <p className="text-[11px] font-bold text-red-700">{m.motivo}</p>}
      </button>
      {aperto && (
        <div className="space-y-2 text-[11px]">
          {Array.isArray(m.passi) && m.passi.length > 0 && (
            <div>
              <p className="font-black text-on-surface-variant mb-1">Passi</p>
              <ul className="space-y-0.5 font-mono">
                {m.passi.map((p: any, i: number) => <li key={i} className="break-words"><span className="text-on-surface-variant/60">{ora(p.ts)}</span> {p.testo}</li>)}
              </ul>
            </div>
          )}
          {giudizi.length > 0 && (
            <div>
              <p className="font-black text-on-surface-variant mb-1">Giudizio</p>
              {giudizi.map(([dove, g], i) => (
                <p key={i} className="break-words">{dove && <b>{dove}: </b>}{Object.entries(g).map(([k, v]) => `${k.replace(/_/g, ' ')} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</p>
              ))}
            </div>
          )}
          {difetti.length > 0 && (
            <div>
              <p className="font-black text-red-700 mb-1">Difetti</p>
              <ul className="space-y-0.5">
                {difetti.map((d, i) => <li key={i} className="break-words">• {d.dove && <span className="text-on-surface-variant/60">[{d.dove}] </span>}{d.testo || d.codice || d.dettaglio || JSON.stringify(d)}{d.dettaglio && d.testo ? ` — ${d.dettaglio}` : ''}</li>)}
              </ul>
            </div>
          )}
          {frasi.length > 0 && (
            <div>
              <p className="font-black text-on-surface-variant mb-1">Frasi dette</p>
              <ul className="space-y-0.5">
                {frasi.map((f, i) => (
                  <li key={i} className="break-words">
                    {f.s != null && <span className="text-on-surface-variant/60">{Math.round(Number(f.s))} s · </span>}
                    «{f.testo || '?'}»
                    {f.manovra_m != null && <span className="text-on-surface-variant/60"> · a {Math.round(Number(f.manovra_m))} m dalla manovra</span>}
                    {f.fuori_linea_m != null && Number(f.fuori_linea_m) > 15 && <span className="text-red-700"> · {Math.round(Number(f.fuori_linea_m))} m fuori linea</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(m.problemi) && m.problemi.length > 0 && (
            <div>
              <p className="font-black text-red-700 mb-1">Problemi segnalati</p>
              <ul className="space-y-0.5">{m.problemi.map((p: any, i: number) => <li key={i} className="break-words">• {p.grave ? 'GRAVE · ' : ''}{p.codice || ''} {p.dettaglio || ''}</li>)}</ul>
            </div>
          )}
          {m.dettaglio && (
            <div>
              <button onClick={() => setGrezzo(!grezzo)} className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-black">{grezzo ? 'Nascondi' : 'Mostra'} dati completi</button>
              {grezzo && <pre className="mt-1 p-2 rounded-xl bg-surface-variant/40 text-[10px] whitespace-pre-wrap break-words max-h-96 overflow-auto">{JSON.stringify(m.dettaglio, null, 1)}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const LogNativi: React.FC<{ notti: any[] }> = ({ notti }) => {
  const conLog = (notti || []).filter((n) => n?.nativi_log?.moduli?.length);
  const [scelta, setScelta] = useState(0);
  if (!conLog.length) return <p className="text-sm font-bold text-on-surface-variant/60 px-1">Nessun log nativo ancora: si scrive dalla notte del 22→23/11 (prima solo le righe ricostruite).</p>;
  const n = conLog[Math.min(scelta, conLog.length - 1)];
  const L = n.nativi_log;
  return (
    <section className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {conLog.slice(0, 10).map((x, i) => (
          <button key={x.data || i} onClick={() => setScelta(i)} className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${i === scelta ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>{x.data}</button>
        ))}
      </div>
      {n.interrotto && (
        <p className="p-3 rounded-2xl bg-red-50 text-red-800 text-[11px] font-bold">Notte interrotta{n.interrotto.modulo_in_corso ? ` durante ${NOMI[n.interrotto.modulo_in_corso] || n.interrotto.modulo_in_corso}` : ''}: {n.interrotto.motivo}</p>
      )}
      {n.parziale && <p className="text-[11px] font-semibold text-amber-800 px-1">Report della notte parziale: la chiusura del collaudo non è stata scritta.</p>}
      {L.ricostruito_da && <p className="text-[11px] font-semibold text-on-surface-variant/70 px-1">Ricostruito da {L.ricostruito_da}.</p>}
      {L.moduli.map((m: any) => <Modulo key={m.modulo} m={m} />)}
      <p className="text-[10px] font-semibold text-on-surface-variant/50 px-1">Aggiornato {ora(L.aggiornato)} · copia completa su Oracle: {L.file || '/root/collaudo-notte/nativi/'}</p>
    </section>
  );
};

export default LogNativi;
