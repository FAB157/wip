// TASTI DEL COLLAUDO (04/10/2026). Compaiono solo con la modalità collaudo
// accesa dall'admin (Diagnostica › Registro del navigatore).
//  • «🚩 Qui ha sbagliato»: un segno nel registro del telefono con la posizione
//    di quel momento e una nota — riguarda DOVE e QUANDO ha parlato.
//  • «📝 Guida sbagliata»: un segno sul CONTENUTO ascoltato (generico, luogo
//    sbagliato, lingua sbagliata, voce rotta), con il luogo la cui guida stava
//    suonando. Il registro dice dove e quando; questo dice se ha detto la cosa
//    giusta.
// Sul web non fanno nulla (il registro è del servizio nativo).
import { useEffect, useState } from 'react';
import { locationService } from '../services/locationService';

const NOTE_TRIGGER = ['Doveva partire qui', 'Ha parlato tardi', 'Ha parlato presto', 'Svolta sbagliata'];
const NOTE_CONTENUTO = ['Testo generico', 'Luogo sbagliato', 'Lingua sbagliata', 'Voce o audio rotti'];
const acceso = () => { try { return localStorage.getItem('wip_collaudo') === '1'; } catch { return false; } };

/** Il luogo la cui guida sta suonando (o ha appena suonato): dal nativo, altrimenti dall'ultimo trigger della pagina. */
async function luogoInAscolto(): Promise<string> {
  try {
    const { ItaintaBackgroundPoi } = await import('../plugins/ItaintaBackgroundPoi');
    const s: any = await (ItaintaBackgroundPoi as any).getTeaserState?.();
    const id = String(s?.speakingPoiId || s?.lastPoiId || '').trim();
    if (id) return id;
  } catch { /* web o metodo assente */ }
  try { return String((window as any).__wipLastPoiTrigger?.id || '').trim(); } catch { return ''; }
}

export default function TastoCollaudo() {
  const [attivo, setAttivo] = useState(acceso);
  const [aperto, setAperto] = useState<'' | 'trigger' | 'contenuto'>('');
  const [testo, setTesto] = useState('');
  const [esito, setEsito] = useState('');

  useEffect(() => {
    const aggiorna = () => setAttivo(acceso());
    window.addEventListener('wip-collaudo-cambiato', aggiorna);
    return () => window.removeEventListener('wip-collaudo-cambiato', aggiorna);
  }, []);
  if (!attivo) return null;

  const segna = async (nota: string) => {
    const pulita = nota.trim();
    if (!pulita) return;
    const diContenuto = aperto === 'contenuto';
    try {
      const loc = locationService.getLastLocation();
      const { ItaintaBackgroundPoi } = await import('../plugins/ItaintaBackgroundPoi');
      let text = pulita;
      if (diContenuto) {
        const poi = await luogoInAscolto();
        text = `CONTENUTO: ${pulita}${poi ? ` [poi=${poi}]` : ''}`;
      }
      await ItaintaBackgroundPoi.addNavLogNote({
        text,
        ...(loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) ? { lat: loc.latitude, lon: loc.longitude } : {}),
      });
      setEsito('Segnato');
    } catch {
      setEsito('Non segnato: serve l’app aggiornata');
    }
    setTesto('');
    setAperto('');
    setTimeout(() => setEsito(''), 2500);
  };

  const note = aperto === 'contenuto' ? NOTE_CONTENUTO : NOTE_TRIGGER;
  return (
    <div className="fixed left-3 z-[2300] print:hidden" style={{ bottom: 'calc(9.5rem + env(safe-area-inset-bottom))' }}>
      {aperto && (
        <div className="mb-2 w-56 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-gray-200 p-2 flex flex-col gap-1">
          {note.map(n => (
            <button key={n} onClick={() => void segna(n)} className="text-left text-[13px] font-bold text-gray-800 px-3 py-2 rounded-xl bg-gray-100 active:bg-gray-200">{n}</button>
          ))}
          <div className="flex gap-1 pt-1">
            <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Altro…" className="flex-1 min-w-0 text-[13px] border border-gray-300 rounded-xl px-2 py-1.5" />
            <button onClick={() => void segna(testo)} className="px-3 rounded-xl bg-violet-600 text-white text-[13px] font-black">OK</button>
          </div>
        </div>
      )}
      <div className="flex flex-col items-start gap-2">
        <button
          onClick={() => setAperto(v => (v === 'contenuto' ? '' : 'contenuto'))}
          aria-label="Collaudo: guida sbagliata"
          className="h-10 px-3 rounded-full bg-amber-600 text-white text-[12px] font-black shadow-[0_4px_16px_rgba(0,0,0,0.3)] border-2 border-white active:scale-95"
        >
          📝 Guida sbagliata
        </button>
        <button
          onClick={() => setAperto(v => (v === 'trigger' ? '' : 'trigger'))}
          aria-label="Collaudo: qui ha sbagliato"
          className="h-11 px-3 rounded-full bg-violet-600 text-white text-[12px] font-black shadow-[0_4px_16px_rgba(0,0,0,0.3)] border-2 border-white active:scale-95"
        >
          {esito || '🚩 Qui ha sbagliato'}
        </button>
      </div>
    </div>
  );
}
