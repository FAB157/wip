/**
 * Verifica il controllo di ancoraggio dei testi (scripts/lib/ancoraggio.ts).
 * Logica pura, nessuna rete. Casi reali: Terme Redi (Montecatini), il cui testo
 * inventato — "panorami, colline, vigneti" per uno stabilimento termale di
 * citta' — e' stato trovato in produzione il 30/09/2026.
 *
 *   npx tsx scripts/tests/ancoraggio.test.ts
 */
import { valutaAncoraggio as v } from '../lib/ancoraggio';

const fonti = [
  `Le terme nuove Redi sono uno dei più recenti stabilimenti termali di Montecatini Terme. Lo stabilimento è dedicato a Francesco Redi, medico e letterato del XVII secolo, che consigliava ai suoi pazienti le acque di Montecatini. Fu creato nel 1963 su progetto di Gian Luigi Giordani e Ippolito Malaguzzi Valeri, completamente rinnovato e ampliato dall'architetto Oreste Ruggiero e inaugurato nella primavera 2010. Si estende su più piani per una superficie complessiva di circa 8 000 metri quadrati. Il reparto inalatorio ha 154 apparecchi computerizzati di cui 10 pediatrici. Il Tettuccio e il Redi sono gli stabilimenti aperti. Dal 2021 UNESCO.`,
];
const ctx = { name: 'Terme Redi', city: 'Montecatini Terme', region: 'Toscana', fonti };

const vecchio = `Le Terme Redi offrono uno dei punti panoramici più suggestivi della Toscana, con viste mozzafiato sulle colline verdissime e i vigneti che si estendono all'orizzonte. Un luogo perfetto per chi cerca tranquillità e bellezza naturale, lontano dal caos delle città.`;
const nicky = `✨ Qui ti senti come in un sogno: aria fresca, colori vivaci e un panorama che ti fa dimenticare il tempo. Scatta il selfie perfetto tra i vigneti e goditi la pace della campagna toscana.`;
const nuovo = `Le Terme Redi, note anche come Terme nuove Redi, sono uno degli stabilimenti termali di Montecatini Terme e prendono il nome da Francesco Redi, medico e letterato del Seicento. Lo stabilimento fu creato nel 1963 su progetto di Gian Luigi Giordani e Ippolito Malaguzzi Valeri; è stato poi rinnovato e ampliato dall'architetto Oreste Ruggiero e inaugurato nella primavera del 2010. Oggi si sviluppa su più piani per circa 8.000 metri quadrati. Il reparto inalatorio conta 154 apparecchi computerizzati. Oggi sono aperti soprattutto il Tettuccio e il Redi. La città è dal 2021 patrimonio UNESCO.`;
const inventato = `La chiesa fu costruita nel 1342 dall'architetto Giovanni Bellini in stile gotico, con un campanile alto 40 metri.`;
const vago = `Un luogo che racconta la storia della città e invita alla scoperta, tra tradizione e modernità, da non perdere per chi vuole conoscere davvero il territorio e la sua gente che da sempre vive qui con passione e orgoglio per le proprie radici e per la propria comunità.`;

let passed = 0, failed = 0;
const check = (nome: string, got: string, atteso: string) => {
  if (got === atteso) { passed++; console.log(`  ✅ ${nome} -> ${got}`); }
  else { failed++; console.log(`  ❌ ${nome}: atteso ${atteso}, ottenuto ${got}`); }
};

console.log('=== Ancoraggio dei testi ===');
check('descrizione sbagliata di Terme Redi (con fonti)', v(vecchio, ctx).verdetto, 'non_ancorato');
check('audioguida Nicky sbagliata (con fonti)', v(nicky, ctx).verdetto, 'non_ancorato');
check('descrizione sbagliata SENZA fonti', v(vecchio, { ...ctx, fonti: [] }).verdetto, 'non_ancorato');
check('testo corretto di Terme Redi', v(nuovo, ctx).verdetto, 'ancorato');
check('anno, architetto e stile inventati', v(inventato, { name: 'Chiesa di San Pietro', city: 'Lucca', fonti: [] }).verdetto, 'non_ancorato');
check('testo vago senza specifiche', v(vago, { name: 'Museo Civico', city: 'Lucca', fonti: [] }).verdetto, 'generico');
check('testo vuoto', v('', ctx).verdetto, 'vuoto');
check('"Seicento" equivale a "XVII secolo"', v('Il medico visse e lavorò nel Seicento in città.', { name: 'X', fonti: ['medico del XVII secolo in città'] }).verdetto, 'ancorato');
check('"8.000" equivale a "8 000"', v('Lo stabilimento copre circa 8.000 metri quadrati.', { name: 'X', fonti: ['superficie di circa 8 000 metri quadrati'] }).verdetto, 'ancorato');

console.log(`\n──────── RISULTATO: ${passed} superati, ${failed} falliti ────────`);
process.exit(failed > 0 ? 1 : 0);
