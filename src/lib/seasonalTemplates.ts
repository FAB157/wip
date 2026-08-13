// =====================================================================
// WIP · Template stagionali curati (ondata 6)
// Itinerari pre-curati dalla redazione: un tap pre-compila il form
// (destinazione, giorni, interessi, richieste) e cavalca i picchi di
// ricerca stagionali. La generazione resta all'utente.
// =====================================================================

export interface SeasonalTemplate {
  id: string;
  emoji: string;
  title: string;
  destination: string;
  /** Mesi (1-12) in cui proporre il template. */
  months: number[];
  days: number;
  interests: string[];
  specialRequests: string;
}

export const SEASONAL_TEMPLATES: SeasonalTemplate[] = [
  {
    id: 'natale-roma', emoji: '🎄', title: 'Natale a Roma', destination: 'Roma',
    months: [11, 12], days: 3, interests: ['arte', 'tradizioni'],
    specialRequests: 'Atmosfera natalizia: presepi storici (piazza San Pietro, Sant\'Andrea della Valle), luminarie di via del Corso, mercatino di piazza Navona, messa o visita in basilica.',
  },
  {
    id: 'venezia-carnevale', emoji: '🎭', title: 'Venezia in Carnevale', destination: 'Venezia',
    months: [1, 2], days: 2, interests: ['tradizioni', 'fotografia'],
    specialRequests: 'Periodo di Carnevale: maschere e sfilate in piazza San Marco, atelier di costumi, tramonto fotogenico sui canali; suggerisci orari per evitare la calca dei ponti.',
  },
  {
    id: 'presepi-napoli', emoji: '⭐', title: 'Presepi a Napoli', destination: 'Napoli',
    months: [11, 12], days: 2, interests: ['tradizioni', 'enogastronomia'],
    specialRequests: 'San Gregorio Armeno e l\'arte presepiale, centro storico UNESCO, sfogliatella e pizza fritta: il Natale napoletano autentico.',
  },
  {
    id: 'firenze-agosto', emoji: '🖼️', title: 'Firenze senza code', destination: 'Firenze',
    months: [7, 8], days: 2, interests: ['arte', 'musei'],
    specialRequests: 'Agosto intelligente: ingressi alle prime ore o serali (Uffizi il martedì sera se disponibile), chiese fresche a mezzogiorno, tramonto da San Miniato invece di piazzale Michelangelo.',
  },
  {
    id: 'palio-siena', emoji: '🐎', title: 'Siena e il Palio', destination: 'Siena',
    months: [6, 7, 8], days: 2, interests: ['tradizioni', 'storia'],
    specialRequests: 'La Siena delle contrade: musei di contrada, piazza del Campo e la logica della corsa, cena in contrada se possibile; se non è il giorno del Palio racconta comunque la sua cultura.',
  },
  {
    id: 'laghi-agosto', emoji: '🏞️', title: 'Lago di Como d\'estate', destination: 'Como',
    months: [6, 7, 8], days: 2, interests: ['panorami', 'relax'],
    specialRequests: 'Battelli tra i borghi (Bellagio, Varenna), ville con giardini, bagni al lago la mattina presto; evita le ore di punta della navigazione.',
  },
  {
    id: 'vendemmia-chianti', emoji: '🍇', title: 'Vendemmia nel Chianti', destination: 'Greve in Chianti',
    months: [9, 10], days: 2, interests: ['enogastronomia', 'panorami'],
    specialRequests: 'Periodo di vendemmia: cantine visitabili con degustazione, borghi (Montefioralle, Panzano), macelleria storica a Panzano, strade bianche panoramiche.',
  },
  {
    id: 'tartufo-alba', emoji: '🍄', title: 'Alba e il tartufo', destination: 'Alba',
    months: [10, 11], days: 2, interests: ['enogastronomia'],
    specialRequests: 'Fiera del Tartufo Bianco: mercato del tartufo, degustazioni di Barolo e Barbaresco nelle Langhe, torri medievali di Alba.',
  },
  {
    id: 'sicilia-primavera', emoji: '🌸', title: 'Sicilia barocca', destination: 'Noto',
    months: [3, 4, 5], days: 3, interests: ['arte', 'panorami'],
    specialRequests: 'Primavera nel Val di Noto: Noto, Modica e Ragusa Ibla, infiorata se nel periodo, cioccolato di Modica, temperature ideali per camminare.',
  },
  {
    id: 'mercatini-bolzano', emoji: '🎅', title: 'Mercatini di Bolzano', destination: 'Bolzano',
    months: [11, 12], days: 2, interests: ['tradizioni', 'enogastronomia'],
    specialRequests: 'Mercatini di Natale di piazza Walther, vin brulé e strudel, museo di Ötzi, funivia del Renon per i panorami invernali.',
  },
  {
    id: 'costiera-maggio', emoji: '🍋', title: 'Costiera a maggio', destination: 'Amalfi',
    months: [4, 5, 6], days: 3, interests: ['panorami', 'relax'],
    specialRequests: 'Prima della calca estiva: Sentiero degli Dei al mattino, limoneti e sfusato amalfitano, Ravello e Villa Rufolo, spostamenti via mare quando possibile.',
  },
  {
    id: 'ravenna-mosaici', emoji: '✨', title: 'Ravenna bizantina', destination: 'Ravenna',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], days: 2, interests: ['arte', 'storia'],
    specialRequests: 'I mosaici UNESCO in sequenza intelligente (biglietto cumulativo): San Vitale, Galla Placidia, Sant\'Apollinare Nuovo, la tomba di Dante e la Ravenna meno nota.',
  },
];

/** Template proposti ora: quelli del mese corrente e del prossimo. */
export function templatesForNow(now = new Date()): SeasonalTemplate[] {
  const m = now.getMonth() + 1;
  const next = (m % 12) + 1;
  const list = SEASONAL_TEMPLATES.filter(t => t.months.includes(m) || t.months.includes(next));
  return list.length > 0 ? list : SEASONAL_TEMPLATES.slice(0, 4);
}
