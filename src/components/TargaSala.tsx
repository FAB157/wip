/**
 * LA TARGA DELLA SALA, DISEGNATA (11/09/2026).
 *
 * Il tasto «Dove sono?» chiede di inquadrare «il cartello della sala», ma
 * la domanda del committente — «che cartellino deve inquadrare?» — dice
 * che le parole non bastano: in un museo ci sono targhette ovunque, quelle
 * delle opere, dei divieti, delle uscite. Questa è una targa da sala vista
 * da davanti, col numero grande: si capisce a colpo d'occhio cosa cercare
 * sopra la porta. Nessuna parola da tradurre: il numero è uguale in tutte
 * le lingue.
 */
export default function TargaSala({ size = 44, label = '12' }: { size?: number; label?: string }) {
  const h = Math.round(size * 0.64);
  return (
    <svg width={size} height={h} viewBox="0 0 44 28" aria-hidden="true" className="shrink-0">
      {/* La parete, appena accennata */}
      <rect x="0" y="0" width="44" height="28" rx="3" fill="#f3f4f6" />
      {/* La targa: scura con bordo chiaro, come nei musei */}
      <rect x="6" y="5" width="32" height="18" rx="2" fill="#1e3a8a" stroke="#dbe4f5" strokeWidth="1" />
      <text x="22" y="18.5" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="900" fill="#ffffff" letterSpacing="0.5">
        {label}
      </text>
    </svg>
  );
}
