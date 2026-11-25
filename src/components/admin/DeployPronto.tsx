// DEPLOY · REPORT E CORREZIONI (22/11/2026, committente: «il file mettilo nella tab con report e correzioni»).
// Ogni mattina, dopo il collaudo notturno, le regole nuove diventano codice + casi nel banco; il resoconto si scrive
// nella riga della notte (`api_cache` `collaudo_notte_<data>`, campo `deploy_pronto`) e si legge qui. Il deploy lo
// decide il committente: o con una frase in chat, o con un doppio clic su deploy-sicuro.cmd (scaricabile qui sotto),
// che rifà i controlli, chiede «SI», pubblica e torna da solo alla versione di prima se la produzione non risponde.
import React from 'react';

const SCRIPT_CMD = [
  '@echo off',
  'rem DEPLOY SICURO: banco, import, prova di caricamento, conferma SI, deploy, controllo, ritorno indietro automatico.',
  'cd /d C:\\progetti\\itainta || (echo Cartella C:\\progetti\\itainta non trovata & pause & exit /b 1)',
  'node scripts\\deploy-sicuro.mjs %*',
  'echo.',
  'pause',
  '',
].join('\r\n');

function scaricaCmd() {
  const url = URL.createObjectURL(new Blob([SCRIPT_CMD], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'deploy-sicuro.cmd';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const testo = (x: any) => typeof x === 'string' ? x : (x?.descrizione || x?.regola || x?.testo || JSON.stringify(x));

const STATI: Record<string, { etichetta: string; colore: string }> = {
  pronto: { etichetta: 'PRONTO PER IL DEPLOY', colore: 'bg-green-100 text-green-800' },
  non_pronto: { etichetta: 'NON PRONTO', colore: 'bg-red-100 text-red-800' },
  fatto: { etichetta: 'DEPLOY FATTO', colore: 'bg-primary/10 text-primary' },
  niente: { etichetta: 'NIENTE DA PUBBLICARE', colore: 'bg-surface-variant text-on-surface-variant' },
};

const DeployPronto: React.FC<{ notti: any[] }> = ({ notti }) => {
  const conDeploy = (notti || []).filter((n) => n?.deploy_pronto);
  const ultima = (notti || [])[0];
  return (
    <section className="space-y-3">
      <div className="p-4 rounded-2xl bg-white border border-outline-variant/10 space-y-2">
        <p className="text-sm font-black text-on-surface">Deploy sicuro (dal PC)</p>
        <p className="text-[12px] text-on-surface-variant/80 leading-snug">
          Doppio clic sul file: rifà banco di prova, controllo import e prova di caricamento del server; se tutto è verde chiede
          «SI», pubblica, controlla la produzione e, se non risponde, torna da solo alla versione di prima.
          Si può tenere sul desktop: lavora sempre in C:\progetti\itainta.
        </p>
        <button onClick={scaricaCmd} className="px-3 py-2 rounded-xl bg-primary text-on-primary text-xs font-black">Scarica deploy-sicuro.cmd</button>
        <p className="text-[11px] text-on-surface-variant/60">Solo controlli, senza pubblicare: <code>deploy-sicuro.cmd --solo-controlli</code></p>
      </div>

      {ultima?.coda_dati && (
        <div className="p-3 rounded-2xl bg-white border border-outline-variant/10 text-[12px]">
          <p className="font-black text-on-surface">Dati mancanti del collaudo · {ultima.data || ''}</p>
          <p className="text-on-surface-variant/80">
            in coda {ultima.coda_dati.in_coda_inizio ?? '?'} · lavorati {ultima.coda_dati.lavorate ?? '?'} · riempiti {ultima.coda_dati.riempiti ?? '?'}
            {' '}· ancora mancanti {ultima.coda_dati.ancora_mancanti ?? '?'} · riparazioni bloccate {ultima.coda_dati.danni_bloccati ?? 0}
          </p>
        </div>
      )}

      {conDeploy.length === 0 && (
        <p className="text-sm font-bold text-on-surface-variant/60 px-1">Ancora nessun resoconto di deploy: compare qui la mattina dopo il collaudo.</p>
      )}
      {conDeploy.map((n, i) => {
        const d = n.deploy_pronto || {};
        const st = STATI[d.stato] || STATI.non_pronto;
        return (
          <div key={`d${i}`} className="p-3 rounded-2xl bg-white border border-outline-variant/10 text-[12px] space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-on-surface">{n.data}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${st.colore}`}>{st.etichetta}</span>
              {d.quando && <span className="text-on-surface-variant/60">{d.quando}</span>}
            </div>
            <p className="text-on-surface-variant/80">
              {d.banco && <>banco {d.banco.passati ?? '?'}/{d.banco.totale ?? '?'} · </>}
              {d.tsc != null && <>tsc {d.tsc ? 'ok' : 'NO'} · </>}
              {d.caricamento != null && <>server {d.caricamento ? 'si carica' : 'NON si carica'}</>}
            </p>
            {Array.isArray(d.correzioni) && d.correzioni.length > 0 && (
              <>
                <p className="font-black text-on-surface pt-1">Correzioni ({d.correzioni.length})</p>
                <ul className="list-disc pl-4 text-on-surface-variant/90">{d.correzioni.map((c: any, j: number) => <li key={j}>{testo(c)}{c?.file ? <span className="text-on-surface-variant/50"> · {c.file}</span> : null}</li>)}</ul>
              </>
            )}
            {Array.isArray(d.cambia) && d.cambia.length > 0 && (
              <>
                <p className="font-black text-on-surface pt-1">Cosa cambia per l'utente</p>
                <ul className="list-disc pl-4 text-on-surface-variant/90">{d.cambia.map((c: any, j: number) => <li key={j}>{testo(c)}</li>)}</ul>
              </>
            )}
            {Array.isArray(d.aperti) && d.aperti.length > 0 && (
              <>
                <p className="font-black text-amber-800 pt-1">Rimandati / aperti</p>
                <ul className="list-disc pl-4 text-amber-800">{d.aperti.map((c: any, j: number) => <li key={j}>{testo(c)}</li>)}</ul>
              </>
            )}
            {d.deploy_url && <p className="text-on-surface-variant/70">Pubblicato: <code>{d.deploy_url}</code></p>}
            {d.rollback && <p className="text-on-surface-variant/70">Per tornare indietro: <code>npx vercel promote {d.rollback} --yes</code></p>}
            {d.note && <p className="text-on-surface-variant/70">{d.note}</p>}
          </div>
        );
      })}
    </section>
  );
};

export default DeployPronto;
