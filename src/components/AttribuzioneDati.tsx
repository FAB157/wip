/**
 * DA DOVE VENGONO QUESTI DATI
 * ===========================
 * La riga di provenienza in fondo alla scheda del POI. Gemella di
 * `AttribuzioneFoto`, ma per il DATO e non per l'immagine: nome del luogo,
 * coordinate, profondita', sviluppo — le cose che non abbiamo rilevato noi.
 *
 * Perche' esiste (02/09/2026). Wikicaves, l'associazione che gestisce
 * Grottocenter, ci ha scritto contestando l'uso dei loro dati sulle grotte
 * (129.508 POI con `source='grottocenter'`, presi dalle loro API pubbliche).
 * Citare la fonte e' il minimo che qualunque licenza aperta chiede, e mancava.
 *
 * ATTENZIONE, pero': l'obiezione di Wikicaves NON era l'attribuzione, era che
 * il nostro sito richiede il login per accedere. Questa riga e' necessaria ma
 * NON sufficiente a chiudere quella contestazione — vedi la memoria di
 * sessione. Non considerare il caso risolto solo perche' il credito c'e'.
 *
 * Regola di composizione: si cita SOLO cio' che sappiamo. Nessun nome di
 * licenza viene scritto qui se non e' stato verificato sulla fonte: una
 * licenza sbagliata in calce e' peggio di nessuna licenza, perche' afferma un
 * diritto che non abbiamo controllato.
 */
import { memo } from 'react';

/** Fonti riconosciute. La chiave e' il valore di `shared_pois.source`. */
const FONTI: Record<string, { nome: string; url: string; nota?: string }> = {
  grottocenter: {
    nome: 'Grottocenter',
    url: 'https://www.grottocenter.org',
    nota: 'Associazione Wikicaves',
  },
};

interface Props {
  /** shared_pois.source */
  source?: string | null;
  className?: string;
}

function AttribuzioneDati({ source, className = '' }: Props) {
  const chiave = String(source || '').trim().toLowerCase();
  const f = FONTI[chiave];
  // Fonte non in tabella (o assente): nessuna riga. Non si inventa un credito
  // generico tipo "fonti aperte": non direbbe niente a nessuno.
  if (!f) return null;

  return (
    <p className={`text-[10px] leading-snug text-[#1e3a8a]/50 mb-6 px-1 ${className}`}>
      Dati della cavita' da{' '}
      <a
        href={f.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-bold text-[#1e3a8a]/70"
      >
        {f.nome}
      </a>
      {f.nota ? ` (${f.nota})` : ''}
    </p>
  );
}

export default memo(AttribuzioneDati);
