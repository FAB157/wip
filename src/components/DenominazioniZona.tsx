// =====================================================================
// «Denominazioni della zona» — DOP/IGP/STG agganciate a un POI del gusto
//
// Fonte: registro eAmbrosia della Commissione europea (CC BY 4.0), tabella
// `denominazioni`, rotta /api/denominazioni. L'aggancio è per PAROLE (le
// parole di luogo del nome della denominazione contro nome, città e
// regione del POI): è un'indicazione di zona, non una certificazione del
// produttore, e l'etichetta lo dice. Se la tabella non c'è o non c'è nulla
// che combaci, il blocco non si vede.
// =====================================================================
import { useEffect, useState } from 'react';
import { getApiUrl } from '../lib/api';
import { getTranslation } from '../lib/i18n';
import type { Language } from '../lib/i18n';

interface Denominazione {
  id: string; nome: string; tipo: string; prodotto: string; categoria: string | null;
  paese: string | null; paese_nome: string | null; url: string | null;
}

interface Props {
  nome: string;
  citta?: string | null;
  regione?: string | null;
  paese?: string | null;
  language: Language;
}

const EMOJI: Record<string, string> = { vino: '🍷', cibo: '🧀', spiriti: '🥃' };
const memoria = new Map<string, Denominazione[]>();

export default function DenominazioniZona({ nome, citta, regione, paese, language }: Props) {
  const [lista, setLista] = useState<Denominazione[]>([]);

  useEffect(() => {
    let attivo = true;
    const p = new URLSearchParams({ nome: nome || '', limit: '6' });
    if (citta) p.set('citta', citta);
    if (regione) p.set('regione', regione);
    if (paese) p.set('paese', String(paese).slice(0, 2));
    const chiave = p.toString();
    const m = memoria.get(chiave);
    if (m) { setLista(m); return; }
    fetch(getApiUrl(`/api/denominazioni?${chiave}`), { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d: Denominazione[] = Array.isArray(j?.denominazioni) ? j.denominazioni : [];
        memoria.set(chiave, d);
        if (attivo) setLista(d);
      })
      .catch(() => { /* rotta assente o rete giù: blocco invisibile */ });
    return () => { attivo = false; };
  }, [nome, citta, regione, paese]);

  if (!lista.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
      <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">
        {getTranslation('poi_denominazioni_zona', language)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {lista.map((d) => (
          <a
            key={d.id}
            href={d.url || '#'}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 rounded-full bg-white border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
          >
            <span>{EMOJI[d.prodotto] || '🏷'}</span>
            <span>{d.nome}</span>
            <span className="text-[9px] font-black text-amber-600">{d.tipo}</span>
          </a>
        ))}
      </div>
      <div className="mt-1.5 text-[9px] leading-snug text-amber-700/80">
        {getTranslation('poi_denominazioni_nota', language)}
      </div>
    </div>
  );
}
