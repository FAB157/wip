// TOTALE DEL VIAGGIO = SOMMA DEI GIORNI (18/11/2026, Malta 4 giorni).
// `totale_viaggio` lo scrive il modello nel PRIMO blocco della generazione, quando esistono solo i giorni 1–2:
// a Malta diceva «144 € (stima per persona per i primi 2 giorni; il totale dei 4 giorni sarà aggiornato)» e
// nessuno lo aggiornava mai. Ogni giorno ha già il suo `tabella_budget.totale_giorno`: il totale si ricava da
// quelli, nella valuta dei giorni (€, $, £, CHF — New York è in dollari). Se un giorno non ha una cifra leggibile o
// le valute non coincidono resta il testo del modello (mai un totale che sembra completo e non lo è).
// Stessa regola sul server: ricalcolaTotaleViaggio in server.ts. Usato dall'app, dalla stampa e dal PDF.

const A_PERSONA: Record<string, string> = {
  IT: 'a persona', EN: 'per person', FR: 'par personne', ES: 'por persona',
  DE: 'pro Person', RU: 'на человека', ZH: '每人',
};

function valutaDelTesto(s: string): string | null {
  const trovate = new Set<string>();
  if (/€|\beur\b|euro/i.test(s)) trovate.add('€');
  if (/\$|\busd\b|dollar/i.test(s)) trovate.add('$');
  if (/£|\bgbp\b|sterlin/i.test(s)) trovate.add('£');
  if (/\bchf\b|franch/i.test(s)) trovate.add('CHF');
  return trovate.size === 1 ? [...trovate][0] : null;
}

function numeroDelTesto(s: string): number {
  const t = String(s || '').replace(/[.,]$/, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return parseFloat(t.replace(/[.,]/g, ''));
  return parseFloat(t.replace(',', '.'));
}

export function totaleViaggioDaGiorni(plan: any, lingua: string): string {
  const originale = String(plan?.totale_viaggio || '').trim();
  const giorni: any[] = Array.isArray(plan?.giorni) ? plan.giorni : [];
  if (!giorni.length) return originale;
  let somma = 0;
  let valuta: string | null = null;
  for (const g of giorni) {
    const s = String(g?.tabella_budget?.totale_giorno ?? g?.totale_giorno ?? '').replace(/\s+/g, ' ');
    const v = valutaDelTesto(s);
    if (!v || (valuta && v !== valuta)) return originale;
    valuta = v;
    const m = s.match(/(\d[\d.,]*)\s*(?:[-–]\s*(\d[\d.,]*))?/);
    if (!m) return originale;
    const a = numeroDelTesto(m[1]);
    const b = m[2] ? numeroDelTesto(m[2]) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return originale;
    somma += (a + b) / 2;
  }
  if (somma <= 0 || !valuta) return originale;
  const n = Math.round(somma);
  const importo = valuta === '$' || valuta === '£' ? `${valuta}${n}` : `${n} ${valuta}`;
  const etichetta = A_PERSONA[String(lingua || 'IT').toUpperCase()] || A_PERSONA.EN;
  return `${importo} ${etichetta}`;
}
