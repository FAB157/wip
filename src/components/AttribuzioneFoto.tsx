/**
 * CHI HA SCATTATO QUESTA FOTO
 * ===========================
 * La riga di credito sotto l'immagine. NON e' un dettaglio di cortesia: la
 * gran parte delle nostre fotografie viene da Wikimedia Commons, dove la
 * licenza piu' diffusa e' CC BY-SA. Quella licenza permette anche l'uso
 * commerciale — e WIP vende crediti — ma A CONDIZIONE che l'autore sia citato
 * accanto all'opera. Senza questa riga, quelle foto non le possiamo mostrare.
 *
 * Il testo arriva gia' composto dal database (`shared_pois.image_attribution`,
 * nella forma «Foto: Nome Cognome (CC BY-SA 4.0) via Wikimedia Commons»):
 * si conserva la frase intera e non i pezzi, perche' ricomporla a ogni schermo
 * e' un modo per sbagliarla in un posto solo e non accorgersene.
 *
 * Se l'attribuzione manca non si inventa nulla e non si scrive «autore
 * sconosciuto»: la riga semplicemente non compare. Le foto senza licenza
 * accertata vengono tolte a monte, dalla passata di attribuzione.
 */
import { memo } from 'react';

interface Props {
  /** La frase gia' pronta: shared_pois.image_attribution */
  testo?: string | null;
  /** `sopra` = riga chiara su una foto scura (copertine, hero con sfumatura).
   *  `sotto` = riga grigia sotto l'immagine, su fondo chiaro. */
  posizione?: 'sopra' | 'sotto';
  className?: string;
}

function AttribuzioneFoto({ testo, posizione = 'sopra', className = '' }: Props) {
  const t = String(testo || '').trim();
  if (!t) return null;

  if (posizione === 'sotto') {
    return (
      <p className={`text-[9px] leading-tight text-gray-400 mt-1 ${className}`} title={t}>
        {t}
      </p>
    );
  }

  // Sopra la foto: piccola, in basso a destra, leggibile su qualunque
  // immagine grazie all'ombra — mai un fondo pieno, che coprirebbe la foto.
  return (
    <span
      className={`absolute bottom-1 right-2 z-10 text-[8px] leading-tight text-white/75 max-w-[85%] truncate pointer-events-none ${className}`}
      style={{ textShadow: '0 1px 2px rgba(0,0,0,.9)' }}
      title={t}
    >
      {t}
    </span>
  );
}

export default memo(AttribuzioneFoto);
