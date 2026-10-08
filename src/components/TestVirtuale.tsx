// BARRA DEL TEST VIRTUALE (04/10/2026). Si apre dall'admin (Diagnostica › Test
// virtuale) e resta sopra la mappa di WIP finché non la si chiude: il primo
// tocco sulla mappa posa il «telefono finto», i tocchi dopo lo mandano a quel
// punto lungo un percorso pedonale vero. L'app sotto è quella vera: pin,
// banner, audioguida, giro e navigatore reagiscono col loro codice.
// Motore e limiti: src/lib/testVirtuale.ts.
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { leggiRegistroCollaudo } from '../lib/collaudoRegistro';
import {
  statoTest, ascoltaTest, avviaTest, vaiA, seguiGiro, pausaTest, riprendiTest, fermaTest,
  impostaTest, segnoTest, azzeraAscolti, righeTest, schermoTest, scenarioCorrente, rilanciaScenario,
  gpsGalleria, gpsSalto, gpsDeriva, gpsDerivaAccesa, filmTest,
  type ModoTest, type ScenarioTest,
} from '../lib/testVirtuale';

const FilmMappaLazy = React.lazy(() => import('./CollaudoMappa').then(m => ({ default: m.FilmMappa })));
const distanzaM = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.hypot((bLat - aLat) * 111_320, (bLon - aLon) * 111_320 * Math.cos((aLat * Math.PI) / 180));

const aperto = () => { try { return localStorage.getItem('wip_test_virtuale') === '1'; } catch { return false; } };

export default function TestVirtuale() {
  const [visibile, setVisibile] = useState(aperto);
  const [, ridisegna] = useState(0);
  const [pagella, setPagella] = useState(false);
  const [esito, setEsito] = useState('');
  const [ridotta, setRidotta] = useState(false);
  const s = statoTest();

  useEffect(() => {
    const cambia = () => setVisibile(aperto());
    window.addEventListener('wip-test-virtuale-cambiato', cambia);
    const via = ascoltaTest(() => ridisegna(n => n + 1));
    return () => { window.removeEventListener('wip-test-virtuale-cambiato', cambia); via(); };
  }, []);

  // Il tocco sulla mappa di WIP: il primo posa il telefono, gli altri sono la meta.
  useEffect(() => {
    if (!visibile) return;
    const suTocco = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const lat = Number(d.lat), lon = Number(d.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const ora = statoTest();
      if (!ora.attivo) avviaTest(lat, lon, ora.modo);
      else void vaiA(lat, lon);
    };
    window.addEventListener('wip-map-click', suTocco);
    return () => window.removeEventListener('wip-map-click', suTocco);
  }, [visibile]);

  // FOLLA DI TELEFONI (04/10/2026): l'admin apre più copie dell'app, una per scenario, ognuna con
  // `?testScenario=<nome>` nell'indirizzo. Qui la copia si accorge del parametro, lancia da sola lo
  // scenario a velocità ×4 e, arrivata, manda la sua pagella alla pagina che l'ha aperta.
  const [folla] = useState(() => { try { return new URLSearchParams(window.location.search).get('testScenario') || ''; } catch { return ''; } });
  useEffect(() => {
    if (!folla) return;
    setVisibile(true); setRidotta(true);
    let finito = false, partito = false;
    const via = ascoltaTest(() => {
      const ora = statoTest();
      if (ora.attivo && ora.inCammino) partito = true;
      if (!finito && partito && ora.attivo && !ora.inCammino) {
        finito = true;
        const l = leggiRegistroCollaudo(righeTest());
        try { window.parent?.postMessage({ tipo: 'wip-test-folla', nome: folla, pagella: l.pagella, scatti: l.scatti.map(x => ({ nome: x.nome, strada: x.strada, raggio: x.raggio, esito: x.esito })) }, window.location.origin); } catch { /* aperta da sola */ }
      }
    });
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        const res = await fetch(getApiUrl('/api/admin/collaudo/scenari'), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const j = await res.json();
        const sc = (Array.isArray(j?.scenari) ? j.scenari : []).find((x: any) => x.nome === folla);
        if (!sc) { window.parent?.postMessage({ tipo: 'wip-test-folla', nome: folla, errore: 'scenario non trovato' }, window.location.origin); return; }
        // un attimo perché mappa e servizi dell'app siano pronti
        setTimeout(() => { impostaTest({ fattore: 4 }); rilanciaScenario(sc); }, 4000);
      } catch (e: any) {
        try { window.parent?.postMessage({ tipo: 'wip-test-folla', nome: folla, errore: e?.message || 'errore' }, window.location.origin); } catch { /* niente */ }
      }
    })();
    return via;
  }, [folla]);

  // FILM DELLA PROVA: il cursore del tempo.
  const [mostraFilm, setMostraFilm] = useState(false);
  const [quadro, setQuadro] = useState(0);

  const chiudi = () => {
    if (statoTest().attivo) fermaTest();
    try { localStorage.removeItem('wip_test_virtuale'); } catch { /* storage assente */ }
    setVisibile(false);
  };
  const invia = async () => {
    const righe = righeTest();
    if (righe.length < 2) { setEsito('Niente da inviare.'); return; }
    setEsito('Invio…');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch(getApiUrl('/api/admin/collaudo/registro'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ righe, dispositivo: 'TEST VIRTUALE · ' + navigator.userAgent, nota: 'test virtuale' }),
      });
      const j = await res.json().catch(() => ({}));
      setEsito(res.ok && j?.ok ? `Inviato fra i collaudi (${j.righe} righe).` : `Non inviato (${j?.error || res.status}).`);
    } catch (e: any) { setEsito(`Non inviato (${e?.message || 'rete'}).`); }
  };

  // SCENARI SALVATI: un cammino con un nome, sul server (valgono su ogni dispositivo dell'admin).
  const [scenari, setScenari] = useState<ScenarioTest[]>([]);
  const [mostraScenari, setMostraScenari] = useState(false);
  const [nomeScenario, setNomeScenario] = useState('');
  const intestazioni = async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const caricaScenari = async () => {
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/scenari'), { headers: await intestazioni() });
      const j = await res.json();
      if (res.ok) setScenari(Array.isArray(j?.scenari) ? j.scenari : []); else setEsito(`Scenari non letti (${j?.error || res.status}).`);
    } catch (e: any) { setEsito(`Scenari non letti (${e?.message || 'rete'}).`); }
  };
  useEffect(() => { if (visibile && mostraScenari) void caricaScenari(); }, [visibile, mostraScenari]);
  const salvaScenario = async () => {
    const sc = scenarioCorrente(nomeScenario);
    if (!sc || !sc.nome) { setEsito('Serve un nome, e un cammino già fatto almeno in parte.'); return; }
    setEsito('Salvo lo scenario…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/scenario'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await intestazioni()) },
        body: JSON.stringify({ scenario: sc, righe: righeTest() }),
      });
      const j = await res.json().catch(() => ({}));
      setEsito(res.ok ? (j.nota || `Scenario «${sc.nome}» salvato e messo nel controllo notturno (voto di partenza ${j.riferimento?.votoBase ?? '—'}%).`) : `Non salvato (${j?.error || res.status}).`);
      if (res.ok) { setNomeScenario(''); void caricaScenari(); }
    } catch (e: any) { setEsito(`Non salvato (${e?.message || 'rete'}).`); }
  };
  const togliScenario = async (nome: string) => {
    try {
      await fetch(getApiUrl('/api/admin/collaudo/scenario'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await intestazioni()) },
        body: JSON.stringify({ nome, togli: true }),
      });
      void caricaScenari();
    } catch { /* resta in elenco */ }
  };

  // Tutti gli hook stanno sopra questa riga: un'uscita anticipata prima di un hook rompe React.
  if (!visibile) return null;

  const letto = pagella ? leggiRegistroCollaudo(righeTest()) : null;
  const tasto = 'px-2.5 py-1.5 rounded-lg text-[12px] font-black active:scale-95';
  const scelta = (attiva: boolean) => `${tasto} ${attiva ? 'bg-[#1e3a8a] text-white' : 'bg-gray-100 text-gray-700'}`;

  return (
    <div className="fixed left-2 right-2 z-[2400] print:hidden pointer-events-none" style={{ top: 'calc(4.5rem + env(safe-area-inset-top))' }}>
      <div className="pointer-events-auto mx-auto max-w-md bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] border-2 border-[#1e3a8a] p-2 space-y-2 text-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-black text-[#1e3a8a]">🧪 TEST VIRTUALE</span>
          <span className="text-[11px] text-gray-500 flex-1 truncate">
            {s.attivo ? `${s.inCammino ? 'in cammino' : 'fermo'} · ${s.metriRimasti} m · ${s.scatti} guide · ${s.voci} voci` : 'tocca la mappa per posare il telefono'}
          </span>
          <button onClick={() => setRidotta(v => !v)} className={`${tasto} bg-gray-100 text-gray-700`}>{ridotta ? 'Apri' : 'Riduci'}</button>
          <button onClick={chiudi} className={`${tasto} bg-red-600 text-white`}>Chiudi</button>
        </div>
        {!ridotta && (
          <>
            {s.messaggio && <p className="text-[12px] text-gray-700">{s.messaggio}</p>}
            <div className="flex flex-wrap gap-1.5">
              {(['piedi', 'auto'] as ModoTest[]).map(m => <button key={m} onClick={() => impostaTest({ modo: m })} className={scelta(s.modo === m)}>{m === 'piedi' ? '🚶 A piedi' : '🚗 In auto'}</button>)}
              {[1, 2, 4, 8].map(f => <button key={f} onClick={() => impostaTest({ fattore: f })} className={scelta(s.fattore === f)}>×{f}</button>)}
              {[0, 4, 12].map(m => <button key={m} onClick={() => impostaTest({ errore: m })} className={scelta(s.errore === m)}>GPS ±{m} m</button>)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.attivo && (s.inCammino
                ? <button onClick={pausaTest} className={`${tasto} bg-amber-500 text-white`}>⏸ Pausa</button>
                : <button onClick={riprendiTest} className={`${tasto} bg-emerald-600 text-white`}>▶ Riprendi</button>)}
              {s.attivo && <button onClick={() => seguiGiro()} className={`${tasto} bg-emerald-600 text-white`}>Segui il giro</button>}
              {s.attivo && <button onClick={() => segnoTest('Qui ha sbagliato')} className={`${tasto} bg-violet-600 text-white`}>🚩 Segna</button>}
              {s.attivo && (
                <button onClick={() => schermoTest(!s.schermoSpento)} className={`${tasto} ${s.schermoSpento ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {s.schermoSpento ? '📴 Riaccendi lo schermo' : '📱 Spegni lo schermo'}
                </button>
              )}
              <button onClick={() => setMostraScenari(v => !v)} className={scelta(mostraScenari)}>Scenari</button>
              <button onClick={() => { setQuadro(Math.max(0, filmTest().length - 1)); setMostraFilm(v => !v); }} className={scelta(mostraFilm)}>🎞 Film</button>
              <button onClick={azzeraAscolti} className={`${tasto} bg-gray-100 text-gray-700`}>Azzera ascolti</button>
              <button onClick={() => setPagella(v => !v)} className={`${tasto} bg-gray-100 text-gray-700`}>Pagella</button>
              <button onClick={invia} className={`${tasto} bg-gray-100 text-gray-700`}>Invia fra i collaudi</button>
            </div>
            {s.attivo && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-gray-500 self-center">GPS difficile:</span>
                <button onClick={() => gpsGalleria(30)} className={`${tasto} bg-gray-100 text-gray-700`}>Galleria 30 s</button>
                <button onClick={() => gpsSalto(100)} className={`${tasto} bg-gray-100 text-gray-700`}>Salto 100 m</button>
                <button onClick={() => gpsDeriva(!gpsDerivaAccesa())} className={scelta(gpsDerivaAccesa())}>Deriva da fermo</button>
              </div>
            )}
            {esito && <p className="text-[12px] text-gray-600">{esito}</p>}
            {mostraFilm && (() => {
              const f = filmTest();
              if (f.length === 0) return <p className="text-[12px] text-gray-500 border-t border-gray-100 pt-2">Il film comincia quando il telefono si muove.</p>;
              const i = Math.min(quadro, f.length - 1);
              const q = f[i];
              // gli eventi dei dieci secondi attorno, per capire cosa è successo senza cercarli uno a uno
              const attorno = f.slice(Math.max(0, i - 10), i + 1).flatMap(x => x.eventi.map(e => `${x.ora} ${e}`));
              return (
                <div className="text-[12px] border-t border-gray-100 pt-2 space-y-1.5">
                  <input type="range" min={0} max={f.length - 1} value={i} onChange={(e) => setQuadro(Number(e.target.value))} className="w-full" aria-label="Tempo della prova" />
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setQuadro(Math.max(0, i - 10))} className={`${tasto} bg-gray-100 text-gray-700`}>−10 s</button>
                    <button onClick={() => setQuadro(Math.max(0, i - 1))} className={`${tasto} bg-gray-100 text-gray-700`}>−1</button>
                    <b className="tabular-nums">{q.ora}</b>
                    <button onClick={() => setQuadro(Math.min(f.length - 1, i + 1))} className={`${tasto} bg-gray-100 text-gray-700`}>+1</button>
                    <button onClick={() => setQuadro(Math.min(f.length - 1, i + 10))} className={`${tasto} bg-gray-100 text-gray-700`}>+10 s</button>
                    <span className="text-gray-500 tabular-nums">{i + 1}/{f.length}</span>
                  </div>
                  <React.Suspense fallback={<p className="text-gray-500">Carico la mappa…</p>}>
                    <FilmMappaLazy film={f} quadro={i} />
                  </React.Suspense>
                  <p>
                    {q.gps ? `L'app vedeva il telefono a ${Math.round(distanzaM(q.lat, q.lon, q.gps[0], q.gps[1]))} m da dov'era davvero.` : <b className="text-orange-600">In questo secondo l'app non ha ricevuto nessuna posizione.</b>}
                  </p>
                  {q.app && <p className="text-gray-700"><b>Giro:</b> {q.app}</p>}
                  {attorno.length > 0
                    ? <ul className="space-y-0.5 max-h-24 overflow-y-auto">{attorno.map((e, k) => <li key={k}>{e}</li>)}</ul>
                    : <p className="text-gray-500">Nessun evento nei dieci secondi prima.</p>}
                </div>
              );
            })()}
            {mostraScenari && (
              <div className="text-[12px] border-t border-gray-100 pt-2 space-y-1.5">
                <div className="flex gap-1.5">
                  <input value={nomeScenario} onChange={(e) => setNomeScenario(e.target.value)} placeholder="Nome (es. Roma, dal Pantheon a Trevi)" className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5" />
                  <button onClick={salvaScenario} className={`${tasto} bg-[#1e3a8a] text-white`}>Salva questo cammino</button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {scenari.length === 0 && <p className="text-gray-500">Nessuno scenario salvato.</p>}
                  {scenari.map((sc: any) => (
                    <div key={sc.nome} className="flex items-center gap-1.5">
                      <button onClick={() => rilanciaScenario(sc)} className={`${tasto} bg-emerald-600 text-white`}>▶</button>
                      <span className={`flex-1 min-w-0 truncate ${sc.riferimento?.peggiorato ? 'text-red-600 font-bold' : ''}`}>
                        {sc.nome} · {sc.modo === 'auto' ? 'auto' : 'a piedi'}
                        {sc.riferimento ? ` · ${sc.riferimento.votoBase ?? '—'}%${sc.riferimento.ultimaVerifica ? ` → ${sc.riferimento.ultimoVoto ?? '—'}%` : ''}${sc.riferimento.peggiorato ? ' PEGGIORATO' : ''}` : ' · fuori dal controllo notturno'}
                      </span>
                      <button onClick={() => void togliScenario(sc.nome)} className={`${tasto} bg-gray-100 text-gray-700`}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {letto && letto.pagella.frasiRipetute > 0 && (
              <p className="text-[12px] text-red-600 font-bold">Frasi del navigatore ripetute: {letto.pagella.frasiRipetute}</p>
            )}
            {letto && (
              <div className="text-[12px] border-t border-gray-100 pt-2 space-y-1">
                <p>
                  <b className="text-[#1e3a8a] text-[15px]">{letto.pagella.voto == null ? '—' : `${letto.pagella.voto}%`}</b> scatti giusti ·
                  guide {letto.pagella.guide.giuste}/{letto.pagella.guide.totali} · svolte {letto.pagella.svolte.giuste}/{letto.pagella.svolte.totali}
                </p>
                {letto.scatti.slice(-6).map((x, i) => (
                  <p key={i} className={x.esito === 'giusto' ? 'text-green-700' : 'text-orange-600'}>
                    {x.nome}: {x.strada == null ? 'strada irraggiungibile' : `${Math.round(x.strada)} m di strada`} (raggio {x.raggio} m) — {x.esito}
                  </p>
                ))}
                {letto.scatti.length === 0 && <p className="text-gray-500">Nessuna guida scattata finora.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
