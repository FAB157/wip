// Nome da mostrare/leggere per un POI: se `name` è in uno script non latino
// (cinese, giapponese, coreano, russo, arabo, thai...) e /api/poi/enrich ha
// già prodotto una traduzione/traslitterazione per la lingua corrente, la
// usa; altrimenti torna al nome originale (mai sostituito, solo aggiunto).
export function displayName(
  poi: { name?: string | null; name_translated?: Record<string, string> | null } | null | undefined,
  lang: string,
): string {
  const name = poi?.name || '';
  const key = String(lang || 'it').toLowerCase().slice(0, 2);
  const tradotto = poi?.name_translated?.[key];
  return (tradotto && tradotto.trim()) ? tradotto : name;
}
