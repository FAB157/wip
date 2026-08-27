// =====================================================================
// FIERE, SAGRE E FESTIVAL DEL CIBO E DEL VINO — catalogo mondiale
// =====================================================================
//
// Perché serve un catalogo e non basta la rotta eventi.
// `/api/events/local` copre due cose: i mercati (da Overpass, che da Vercel
// non risponde mai) e le sagre italiane raschiate da eventiesagre.it. Fuori
// dall'Italia non c'è niente, e soprattutto manca la categoria che qui
// conta di più: le GRANDI fiere del gusto, quelle per cui si organizza il
// viaggio mesi prima — la Fiera del Tartufo di Alba, l'Oktoberfest, la
// Tomatina, la Feria del Queso.
//
// Perché sono diverse dagli eventi normali: si ripetono ogni anno nella
// stessa finestra, sono l'unico motivo per cui vale la pena essere in quel
// posto in quella settimana, e cambiano completamente l'itinerario. Una
// data fissa e ricorrente si scrive in un catalogo; un concerto no.
//
// REGOLA SULLE DATE. Qui NON si scrivono date esatte: cambiano ogni anno e
// una data sbagliata in una guida è peggio di nessuna data. Si scrive la
// FINESTRA (mesi e, quando è stabile, la regola: "seconda domenica di
// ottobre") e si dice sempre di verificare sul sito ufficiale. È la stessa
// onestà che il tema "fioriture" applica alle sbocciature.

import { FOOD_FESTIVALS_WORLD } from './foodFestivalsWorld';

export type FestivalKind =
  | 'tartufo' | 'vino' | 'birra' | 'formaggio' | 'olio' | 'cioccolato'
  | 'pesce' | 'carne' | 'dolci' | 'frutta' | 'street-food' | 'mercato-natale'
  | 'raccolto' | 'spezie' | 'caffe' | 'te';

export interface FoodFestival {
  id: string;
  emoji: string;
  name: string;
  kind: FestivalKind;
  city: string;
  country: string;
  continent: 'Europa' | 'Asia' | 'Africa' | 'Nord America' | 'Sud America' | 'Oceania';
  coords: { lat: number; lon: number };
  /** Mesi in cui cade (1-12): serve al filtro "cosa c'è adesso". */
  months: number[];
  /** La regola di calendario, quando è stabile ("primo weekend di ottobre"). */
  when: string;
  /** Cosa si fa e cosa si assaggia, in poche righe. */
  what: string;
  /** Il consiglio pratico che fa la differenza fra andarci bene e male. */
  tip: string;
  /** Da quando esiste, se è un dato noto e verificabile. */
  since?: number;
}

// ─────────────────────────────────────────────────────────────────────
// ITALIA
// ─────────────────────────────────────────────────────────────────────

const ITALIA: FoodFestival[] = [
  {
    id: 'ff-alba-tartufo', emoji: '🍄', name: 'Fiera Internazionale del Tartufo Bianco d\'Alba',
    kind: 'tartufo', city: 'Alba', country: 'Italia', continent: 'Europa',
    coords: { lat: 44.70, lon: 8.04 }, months: [10, 11, 12], since: 1929,
    when: 'Dal secondo weekend di ottobre all\'inizio di dicembre, ogni sabato e domenica.',
    what: 'Il Mercato Mondiale del Tartufo Bianco nel cortile della Maddalena: si annusa, si contratta e si compra davanti ai giudici che certificano ogni pezzo. Attorno, l\'asta mondiale del tartufo, le analisi sensoriali e le Langhe in pieno foliage.',
    tip: 'Il tartufo si paga a peso e il prezzo cambia ogni settimana con la pioggia: si guarda, si annusa e si compra poco. Il weekend Alba è piena — dormi a Bra o a Barbaresco e arriva presto. Il biglietto del mercato si compra online.',
  },
  {
    id: 'ff-vinitaly', emoji: '🍷', name: 'Vinitaly',
    kind: 'vino', city: 'Verona', country: 'Italia', continent: 'Europa',
    coords: { lat: 45.44, lon: 10.99 }, months: [4], since: 1967,
    when: 'Quattro giorni ad aprile.',
    what: 'Il salone del vino italiano: oltre 4.000 espositori. Riservato agli operatori, ma la città in quei giorni diventa un salone diffuso — Vinitaly and the City apre al pubblico piazze e cortili del centro con degustazioni.',
    tip: 'Senza accredito professionale non si entra in fiera: il modo giusto di viverlo è Vinitaly and the City in centro, e i produttori della Valpolicella che in quei giorni aprono le cantine.',
  },
  {
    id: 'ff-cantine-aperte', emoji: '🍇', name: 'Cantine Aperte',
    kind: 'vino', city: 'Tutta Italia', country: 'Italia', continent: 'Europa',
    coords: { lat: 43.00, lon: 12.00 }, months: [5], since: 1993,
    when: 'Ultimo fine settimana di maggio, in tutte le regioni.',
    what: 'Circa mille cantine del Movimento Turismo del Vino aprono i cancelli lo stesso weekend: visite, degustazioni, vendemmiatori per un giorno, musica fra i filari. È il giorno in cui entrare in cantina senza appuntamento è normale.',
    tip: 'L\'unico weekend dell\'anno in cui il problema è scegliere, non prenotare — ma le strade delle zone famose si intasano. Punta su una zona sola e falla a piedi o in bici, e ricorda che chi guida non beve.',
  },
  {
    id: 'ff-calici-stelle', emoji: '✨', name: 'Calici di Stelle',
    kind: 'vino', city: 'Tutta Italia', country: 'Italia', continent: 'Europa',
    coords: { lat: 43.00, lon: 12.00 }, months: [8],
    when: 'Attorno al 10 agosto, la notte di San Lorenzo.',
    what: 'Le piazze dei borghi del vino e le cantine restano aperte di notte: si beve guardando le stelle cadenti, con banchi d\'assaggio nei centri storici. Organizzato da Città del Vino e Movimento Turismo del Vino.',
    tip: 'Nei borghi in collina il cielo è davvero buio: porta una felpa, ad agosto a 500 metri di sera si sta freschi.',
  },
  {
    id: 'ff-eurochocolate', emoji: '🍫', name: 'Eurochocolate',
    kind: 'cioccolato', city: 'Perugia', country: 'Italia', continent: 'Europa',
    coords: { lat: 43.11, lon: 12.39 }, months: [11], since: 1994,
    when: 'Circa dieci giorni fra ottobre e novembre.',
    what: 'Il centro storico di Perugia diventa un\'unica cioccolateria: sculture di cioccolato scolpite in piazza, laboratori, e le "chocolate experience" nei palazzi.',
    tip: 'Nei giorni di punta il corso Vannucci è una calca: vacci infrasettimanale e sali alla Rocca Paolina, dove c\'è più spazio.',
  },
  {
    id: 'ff-cheese-bra', emoji: '🧀', name: 'Cheese — Slow Food',
    kind: 'formaggio', city: 'Bra', country: 'Italia', continent: 'Europa',
    coords: { lat: 44.70, lon: 7.85 }, months: [9], since: 1997,
    when: 'A settembre, negli anni dispari.',
    what: 'La più grande rassegna al mondo dedicata ai formaggi a latte crudo: casari da tutti i continenti, la Piazza della Birra, i Laboratori del Gusto e la Gran Sala dei Formaggi con gli affinatori.',
    tip: 'Si tiene a anni alterni: verifica prima di programmare. I Laboratori del Gusto si esauriscono online settimane prima.',
  },
  {
    id: 'ff-salone-gusto', emoji: '🍴', name: 'Terra Madre Salone del Gusto',
    kind: 'street-food', city: 'Torino', country: 'Italia', continent: 'Europa',
    coords: { lat: 45.07, lon: 7.69 }, months: [9], since: 1996,
    when: 'A settembre, negli anni pari.',
    what: 'Slow Food porta a Torino i produttori dei Presìdi da oltre 150 paesi: è il posto in cui si assaggia in un giorno quello che altrove richiederebbe dieci viaggi.',
    tip: 'Anni pari, alternato a Cheese di Bra. Vale la pena arrivare col taccuino: molti produttori vendono solo lì e spediscono.',
  },
  {
    id: 'ff-ostuni-olio', emoji: '🫒', name: 'Camminate tra gli Olivi',
    kind: 'olio', city: 'Tutta Italia', country: 'Italia', continent: 'Europa',
    coords: { lat: 40.73, lon: 17.58 }, months: [10],
    when: 'L\'ultima domenica di ottobre, nei comuni delle Città dell\'Olio.',
    what: 'Passeggiate guidate negli uliveti secolari durante la raccolta, con visita ai frantoi in piena molitura e assaggio dell\'olio nuovo, torbido e piccante come non lo si trova mai in negozio.',
    tip: 'L\'olio nuovo di frantoio pizzica in gola: non è un difetto, sono i polifenoli. È il momento migliore dell\'anno per comprare olio.',
  },
  {
    id: 'ff-ivrea-arance', emoji: '🍊', name: 'Storico Carnevale di Ivrea — Battaglia delle Arance',
    kind: 'frutta', city: 'Ivrea', country: 'Italia', continent: 'Europa',
    coords: { lat: 45.47, lon: 7.88 }, months: [2, 3],
    when: 'I tre giorni prima del Martedì Grasso (data mobile, fra febbraio e marzo).',
    what: 'Novecento aranceri a piedi contro i carri da getto: la battaglia più famosa d\'Italia, con i fagioli grassi distribuiti la mattina e il polentone.',
    tip: 'Chi non vuole essere colpito indossa il berretto frigio rosso e resta dietro le reti — e le arance fanno male davvero. Non mettere niente di buono addosso.',
  },
  {
    id: 'ff-sagra-vino-marino', emoji: '⛲', name: 'Sagra dell\'Uva di Marino',
    kind: 'vino', city: 'Marino', country: 'Italia', continent: 'Europa',
    coords: { lat: 41.77, lon: 12.66 }, months: [10], since: 1925,
    when: 'La prima domenica di ottobre.',
    what: 'Il "miracolo delle fontane": per qualche ora dalle fontane del centro esce vino bianco invece dell\'acqua. Corteo storico, bande e cantine aperte nei Castelli Romani.',
    tip: 'Mezz\'ora di treno da Roma Termini. Portati un bicchiere: alle fontane si fa la fila e i bicchieri finiscono.',
  },
  {
    id: 'ff-gragnano-pasta', emoji: '🍝', name: 'Festa della Pasta di Gragnano',
    kind: 'dolci', city: 'Gragnano', country: 'Italia', continent: 'Europa',
    coords: { lat: 40.69, lon: 14.52 }, months: [9],
    when: 'Un fine settimana di settembre.',
    what: 'Via Roma, la strada progettata nel Settecento per far asciugare la pasta al vento giusto, si riempie di banchi dei pastifici storici: si mangia pasta di Gragnano IGP cucinata dai produttori.',
    tip: 'A venti minuti da Pompei e dalla costiera: si combina con la Valle dei Mulini, che è dove tutto è cominciato.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// EUROPA
// ─────────────────────────────────────────────────────────────────────

const EUROPA: FoodFestival[] = [
  {
    id: 'ff-oktoberfest', emoji: '🍺', name: 'Oktoberfest',
    kind: 'birra', city: 'Monaco di Baviera', country: 'Germania', continent: 'Europa',
    coords: { lat: 48.13, lon: 11.55 }, months: [9, 10], since: 1810,
    when: 'Sedici-diciotto giorni, da metà settembre alla prima domenica di ottobre.',
    what: 'Sei milioni di visitatori sulla Theresienwiese: quattordici tende grandi, la birra delle sole sei fabbriche di Monaco, la sfilata dei costumi tradizionali la prima domenica.',
    tip: 'Senza prenotazione al tavolo non ti servono da bere: le tende si prenotano a gennaio. In alternativa vacci un martedì mattina, quando i posti liberi ci sono davvero. Il Maß è un litro: comincia piano.',
  },
  {
    id: 'ff-tomatina', emoji: '🍅', name: 'La Tomatina',
    kind: 'frutta', city: 'Buñol', country: 'Spagna', continent: 'Europa',
    coords: { lat: 39.42, lon: -0.79 }, months: [8], since: 1945,
    when: 'L\'ultimo mercoledì di agosto, un\'ora esatta dalle 11.',
    what: 'Ventimila persone e centoventi tonnellate di pomodori maturi in un\'ora di battaglia nelle vie di un paese di novemila abitanti.',
    tip: 'Biglietto obbligatorio e contingentato, si compra mesi prima. Occhiali da nuoto, scarpe chiuse e vestiti da buttare: il pomodoro schiacciato scivola e brucia gli occhi.',
  },
  {
    id: 'ff-batalla-vino', emoji: '🍷', name: 'Batalla del Vino de Haro',
    kind: 'vino', city: 'Haro', country: 'Spagna', continent: 'Europa',
    coords: { lat: 42.58, lon: -2.85 }, months: [6],
    when: 'Il 29 giugno, San Pedro.',
    what: 'All\'alba si sale ai Riscos de Bilibio e ci si annaffia a vicenda con migliaia di litri di vino rosso, poi si scende in paese viola dalla testa ai piedi per la corrida e la festa.',
    tip: 'Vestiti bianchi obbligatori (e da buttare), fazzoletto rosso, e si parte alle sette del mattino. Il vino rosso non esce più dai tessuti.',
  },
  {
    id: 'ff-san-fermin-pintxos', emoji: '🥘', name: 'Semana Grande e i pintxos di San Sebastián',
    kind: 'street-food', city: 'San Sebastián', country: 'Spagna', continent: 'Europa',
    coords: { lat: 43.32, lon: -1.98 }, months: [8],
    when: 'La settimana di Ferragosto (Aste Nagusia), con il concorso internazionale di fuochi d\'artificio.',
    what: 'La Parte Vieja con più stelle Michelin per metro quadrato del pianeta: si mangia in piedi passando di bar in bar, un pintxo e un txakoli per locale.',
    tip: 'La regola è non fermarsi mai più di un pintxo per bar. I banconi si servono da soli e si paga alla fine, dicendo cosa si è preso: è un sistema d\'onore.',
  },
  {
    id: 'ff-fete-citron', emoji: '🍋', name: 'Fête du Citron',
    kind: 'frutta', city: 'Mentone', country: 'Francia', continent: 'Europa',
    coords: { lat: 43.78, lon: 7.50 }, months: [2, 3], since: 1934,
    when: 'Due settimane fra metà febbraio e inizio marzo.',
    what: 'Carri e sculture monumentali costruiti con centoquaranta tonnellate di limoni e arance legati a mano, nei giardini Biovès e in sfilata sul lungomare.',
    tip: 'Alla fine della festa gli agrumi si vendono a poco prezzo: si torna a casa con la borsa piena. Mentone è a venti minuti da Ventimiglia in treno.',
  },
  {
    id: 'ff-braderie-lille', emoji: '🦪', name: 'Braderie de Lille',
    kind: 'pesce', city: 'Lille', country: 'Francia', continent: 'Europa',
    coords: { lat: 50.63, lon: 3.06 }, months: [9],
    when: 'Il primo fine settimana di settembre.',
    what: 'Il più grande mercatino d\'Europa (cento chilometri di bancarelle) e insieme una gara: i ristoranti accatastano davanti alla porta le montagne di gusci delle moules-frites servite, e vince chi ne fa di più.',
    tip: 'Moules-frites obbligatorie, e si mangia in strada. La città è chiusa al traffico: si arriva in treno.',
  },
  {
    id: 'ff-percee-vin-jaune', emoji: '🍾', name: 'Percée du Vin Jaune',
    kind: 'vino', city: 'Giura', country: 'Francia', continent: 'Europa',
    coords: { lat: 46.90, lon: 5.77 }, months: [2], since: 1997,
    when: 'Il primo fine settimana di febbraio, in un paese diverso ogni anno.',
    what: 'Si apre in pubblico la prima botte di vin jaune dell\'annata, dopo sei anni e tre mesi sotto il velo di lieviti. Degustazioni in tutte le cantine del paese ospitante e asta dei millesimi antichi.',
    tip: 'Il paese cambia ogni anno: verifica dove si tiene. Fa freddo davvero, e il vin jaune a 15 gradi non scalda quanto sembra.',
  },
  {
    id: 'ff-mercatini-natale', emoji: '🎄', name: 'Christkindlmarkt — i mercatini di Natale alpini',
    kind: 'mercato-natale', city: 'Norimberga', country: 'Germania', continent: 'Europa',
    coords: { lat: 49.45, lon: 11.08 }, months: [11, 12], since: 1628,
    when: 'Dal venerdì prima della prima domenica d\'Avvento alla vigilia di Natale.',
    what: 'Il Christkindlesmarkt sulla Hauptmarkt: Lebkuchen, salsicce di Norimberga grigliate al fuoco, Glühwein nella tazza col deposito. Attorno, l\'intera Franconia in versione invernale.',
    tip: 'La tazza del vin brulé si paga a deposito: si può riportare o tenere come souvenir, ed è la cosa che ti ricorderai. Bolzano, Vienna, Strasburgo e Colmar hanno mercatini altrettanto seri.',
  },
  {
    id: 'ff-alba-slovenia-martinovanje', emoji: '🍷', name: 'Martinovanje — San Martino',
    kind: 'vino', city: 'Maribor', country: 'Slovenia', continent: 'Europa',
    coords: { lat: 46.56, lon: 15.65 }, months: [11],
    when: 'Attorno all\'11 novembre.',
    what: 'La festa in cui il mosto "diventa vino": si benedice il vino nuovo, si mangia oca e mlinci, e le cantine dell\'intera Stiria slovena aprono. La vite più vecchia del mondo, in città, viene potata in cerimonia.',
    tip: 'La stessa festa esiste in Croazia, Austria e Ungheria nello stesso giorno: è un\'occasione transfrontaliera, e le distanze sono brevi.',
  },
  {
    id: 'ff-rtveli', emoji: '🍇', name: 'Rtveli — la vendemmia georgiana',
    kind: 'raccolto', city: 'Telavi', country: 'Georgia', continent: 'Asia',
    coords: { lat: 41.92, lon: 45.47 }, months: [9, 10],
    when: 'Da fine settembre a ottobre, secondo la maturazione.',
    what: 'Non è una fiera ma una festa collettiva: le famiglie della Kakheti raccolgono, pigiano e riempiono i qvevri, e chi passa viene invitato a tavola. Supra con il tamada che guida i brindisi per ore.',
    tip: 'Molte cantine familiari fanno partecipare gli ospiti alla raccolta: si prenota tramite le guesthouse. La supra dura più di quanto pensi — non prendere impegni la sera.',
  },
  {
    id: 'ff-boqueria-mercati', emoji: '🥬', name: 'La Mercè e i mercati di Barcellona',
    kind: 'mercato-natale', city: 'Barcellona', country: 'Spagna', continent: 'Europa',
    coords: { lat: 41.38, lon: 2.17 }, months: [9],
    when: 'Attorno al 24 settembre.',
    what: 'La festa grande della città: castellers, correfoc e, sul lato gastronomico, le mostre dei mercati storici — la Boqueria, Santa Caterina, Sant Antoni — con degustazioni e cucina dal vivo.',
    tip: 'La Boqueria a mezzogiorno è impraticabile: vacci alle otto del mattino, quando ci vanno i cuochi, ed entra nei banchi in fondo dove si mangia sul serio.',
  },
  {
    id: 'ff-galway-oyster', emoji: '🦪', name: 'Galway International Oyster Festival',
    kind: 'pesce', city: 'Galway', country: 'Irlanda', continent: 'Europa',
    coords: { lat: 53.27, lon: -9.05 }, months: [9], since: 1954,
    when: 'L\'ultimo fine settimana di settembre.',
    what: 'Il più antico festival dell\'ostrica del mondo: campionato mondiale di apertura delle ostriche, ostriche native della baia e stout, e la città che suona per tre giorni.',
    tip: 'Le ostriche native irlandesi hanno stagione da settembre ad aprile, i mesi con la "r": è la ragione per cui il festival cade allora.',
  },
  {
    id: 'ff-lisbona-sardinhas', emoji: '🐟', name: 'Santos Populares — le sardine di Lisbona',
    kind: 'pesce', city: 'Lisbona', country: 'Portogallo', continent: 'Europa',
    coords: { lat: 38.72, lon: -9.14 }, months: [6],
    when: 'Tutto giugno, con il culmine nella notte del 12-13 (Sant\'Antonio).',
    what: 'Alfama, Mouraria e Bica si riempiono di grigliate: sardine arrostite sul pane, vino verde e caldo verde, con le marchas populares che sfilano sull\'Avenida.',
    tip: 'La sardina si mangia col pane sotto, che raccoglie il grasso: quello è il boccone migliore. Il fumo nei vicoli è parte dell\'esperienza — vestiti di conseguenza.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// RESTO DEL MONDO
// ─────────────────────────────────────────────────────────────────────

const MONDO: FoodFestival[] = [
  {
    id: 'ff-vendimia-mendoza', emoji: '🍇', name: 'Fiesta Nacional de la Vendimia',
    kind: 'vino', city: 'Mendoza', country: 'Argentina', continent: 'Sud America',
    coords: { lat: -32.89, lon: -68.85 }, months: [2, 3], since: 1936,
    when: 'La prima settimana di marzo, con la benedizione dei frutti a febbraio.',
    what: 'La festa del vino più grande del Sudamerica: benedizione dei frutti, via blanca de las reinas e l\'Acto Central nel teatro greco Frank Romero Day, davanti a venticinquemila persone, con le Ande dietro.',
    tip: 'Città esaurita da mesi: prenota l\'alloggio con largo anticipo. Nei giorni della vendimia le bodegas fanno visite speciali con la raccolta.',
  },
  {
    id: 'ff-crush-napa', emoji: '🍇', name: 'Crush season — la vendemmia della Napa Valley',
    kind: 'raccolto', city: 'Napa', country: 'Stati Uniti', continent: 'Nord America',
    coords: { lat: 38.30, lon: -122.29 }, months: [8, 9, 10],
    when: 'Da fine agosto a ottobre, secondo l\'annata.',
    what: 'Non un festival ma la stagione: le cantine lavorano giorno e notte, l\'aria sa di mosto, e molte tenute aprono le "crush experience" con pigiatura e assemblaggio.',
    tip: 'È il periodo più bello e più caro dell\'anno in valle. Prenota tutto, comprese le degustazioni, e considera il Wine Train per non guidare.',
  },
  {
    id: 'ff-bourbon-festival', emoji: '🥃', name: 'Kentucky Bourbon Festival',
    kind: 'birra', city: 'Bardstown', country: 'Stati Uniti', continent: 'Nord America',
    coords: { lat: 37.81, lon: -85.47 }, months: [9], since: 1992,
    when: 'A metà settembre, tre giorni.',
    what: 'La capitale mondiale del bourbon apre le distillerie: degustazioni verticali, gara di rotolamento delle botti, e le bottiglie rare che escono solo per l\'occasione.',
    tip: 'I biglietti escono in primavera e finiscono in giorni. Le distillerie danno il "driver\'s dram" da portare a casa a chi guida: chiedilo.',
  },
  {
    id: 'ff-la-mercedes-cusco', emoji: '🌽', name: 'Mistura e la cucina peruviana',
    kind: 'street-food', city: 'Lima', country: 'Perù', continent: 'Sud America',
    coords: { lat: -12.05, lon: -77.04 }, months: [9],
    when: 'A settembre, quando l\'edizione si tiene.',
    what: 'La fiera gastronomica più grande dell\'America Latina: cucinieri di strada, contadini andini con centinaia di varietà di patate e mais, e i cuochi che hanno reso Lima una capitale della cucina.',
    tip: 'Verifica l\'edizione dell\'anno: la manifestazione ha avuto pause. Il ceviche si mangia a mezzogiorno, mai la sera: è la regola locale.',
  },
  {
    id: 'ff-oaxaca-mezcal', emoji: '💀', name: 'Día de Muertos e la Feria del Mezcal',
    kind: 'birra', city: 'Oaxaca', country: 'Messico', continent: 'Nord America',
    coords: { lat: 17.07, lon: -96.73 }, months: [10, 11],
    when: 'Fine ottobre-2 novembre.',
    what: 'La città degli altari e delle comparse, con la Feria del Mezcal che porta in piazza i palenques delle valli: si assaggiano agave rare che non escono mai dallo stato.',
    tip: 'È il periodo più intenso e più affollato dell\'anno a Oaxaca: alloggio prenotato con mesi di anticipo. Nei cimiteri si entra con rispetto, non è uno spettacolo.',
  },
  {
    id: 'ff-songkran-food', emoji: '🌶', name: 'I mercati notturni di Chiang Mai',
    kind: 'street-food', city: 'Chiang Mai', country: 'Thailandia', continent: 'Asia',
    coords: { lat: 18.79, lon: 98.99 }, months: [11, 12, 1, 2],
    when: 'Tutto l\'anno, ma da novembre a febbraio si mangia all\'aperto senza soffrire.',
    what: 'Il Sunday Walking Street e i mercati di Chang Phuak: khao soi, sai ua, larb del nord — la cucina lanna, che con quella di Bangkok c\'entra poco.',
    tip: 'Il khao soi migliore si mangia a pranzo nei banchi vicino alla moschea: alla sera è già finito.',
  },
  {
    id: 'ff-sapporo-food', emoji: '🦀', name: 'Sapporo Autumn Fest',
    kind: 'pesce', city: 'Sapporo', country: 'Giappone', continent: 'Asia',
    coords: { lat: 43.06, lon: 141.35 }, months: [9],
    when: 'Tre settimane a settembre, nel parco Odori.',
    what: 'Hokkaido mette in piazza il suo raccolto: granchio, capesante, mais, latticini, ramen di tutta l\'isola e birra Sapporo alla fonte, in isolati tematici lungo il parco.',
    tip: 'Ogni isolato del parco ha un tema diverso: vale la pena percorrerlo tutto prima di scegliere. A settembre a Sapporo la sera è già fresca.',
  },
  {
    id: 'ff-hong-kong-wine-dine', emoji: '🍷', name: 'Hong Kong Wine & Dine Festival',
    kind: 'vino', city: 'Hong Kong', country: 'Cina', continent: 'Asia',
    coords: { lat: 22.29, lon: 114.17 }, months: [10, 11],
    when: 'Quattro giorni fra fine ottobre e inizio novembre, sul Central Harbourfront.',
    what: 'Centinaia di banchi di vino da tutto il mondo con lo skyline dietro: Hong Kong non ha dazi sul vino e questo l\'ha resa una piazza mondiale.',
    tip: 'Si paga a gettoni, e conviene comprarli online. La vista dal molo al tramonto è metà del motivo per andarci.',
  },
  {
    id: 'ff-stellenbosch-harvest', emoji: '🍇', name: 'Stellenbosch Harvest Season',
    kind: 'raccolto', city: 'Stellenbosch', country: 'Sudafrica', continent: 'Africa',
    coords: { lat: -33.93, lon: 18.86 }, months: [2, 3],
    when: 'Febbraio-marzo, la vendemmia australe.',
    what: 'Le wine farm aprono con harvest festival, pigiature a piedi nudi, cene fra i filari e i mercati contadini del sabato (Root 44, Blaauwklippen).',
    tip: 'È estate piena: si comincia all\'alba e si smette a mezzogiorno. Il Franschhoek Wine Tram in quei giorni si prenota con settimane di anticipo.',
  },
  {
    id: 'ff-melbourne-food-wine', emoji: '🍴', name: 'Melbourne Food and Wine Festival',
    kind: 'street-food', city: 'Melbourne', country: 'Australia', continent: 'Oceania',
    coords: { lat: -37.81, lon: 144.96 }, months: [3], since: 1993,
    when: 'Tre settimane a marzo.',
    what: 'Centinaia di eventi in città e nelle regioni vinicole del Victoria: il World\'s Longest Lunch, i laneway dinners, e la Yarra Valley a un\'ora.',
    tip: 'Gli eventi si prenotano singolarmente e i migliori vanno esauriti in poche ore dall\'apertura delle vendite.',
  },
  {
    id: 'ff-blenheim-wine', emoji: '🍷', name: 'Marlborough Wine & Food Festival',
    kind: 'vino', city: 'Blenheim', country: 'Nuova Zelanda', continent: 'Oceania',
    coords: { lat: -41.51, lon: 173.96 }, months: [2], since: 1985,
    when: 'Il secondo sabato di febbraio.',
    what: 'Il festival del vino più antico della Nuova Zelanda, in una tenuta fra i vigneti: cinquanta produttori di Marlborough, cozze verdi e musica dal vivo.',
    tip: 'Ci sono navette da Blenheim e Picton comprese nel biglietto: nessuno guida, ed è previsto così.',
  },
  {
    id: 'ff-yirga-buna', emoji: '☕', name: 'La cerimonia del caffè etiope',
    kind: 'caffe', city: 'Addis Abeba', country: 'Etiopia', continent: 'Africa',
    coords: { lat: 9.01, lon: 38.76 }, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    when: 'Tutto l\'anno, ogni giorno: non è un evento ma un rito quotidiano.',
    what: 'Tostatura dei chicchi verdi sul braciere davanti agli ospiti, macinatura nel mortaio, tre giri di tazze (abol, tona, baraka) con l\'incenso acceso. Dura circa un\'ora.',
    tip: 'Rifiutare il terzo giro è scortese: è quello della benedizione. Si accompagna con popcorn salato, non con dolci.',
  },
  {
    id: 'ff-marrakech-jemaa', emoji: '🌙', name: 'Jemaa el-Fna dopo il tramonto',
    kind: 'street-food', city: 'Marrakech', country: 'Marocco', continent: 'Africa',
    coords: { lat: 31.63, lon: -7.99 }, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    when: 'Ogni sera, tutto l\'anno: la piazza si trasforma in cucina all\'aperto al calare del sole.',
    what: 'Patrimonio immateriale UNESCO: cento banchi che si montano ogni sera — tanjia, harira, lumache in brodo, teste di agnello — fra cantastorie e incantatori.',
    tip: 'Scegli i banchi dove mangiano i marocchini, non quelli con gli imbonitori in inglese. Il prezzo si concorda PRIMA di sedersi.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// SECONDO GIRO — le feste che si trovano solo cercando nella lingua locale
//
// "Wine festival Germany" non porta al Wurstmarkt, che è la più grande
// festa del vino del mondo dal 1417 e si chiama "mercato delle salsicce".
// "Wine festival Czech Republic" non porta a `vinobraní`. E il gimjang
// coreano non è un festival: è il giorno in cui un intero paese fa il
// kimchi, ed è patrimonio immateriale UNESCO.
// ─────────────────────────────────────────────────────────────────────

const AGGIUNTE: FoodFestival[] = [
  {
    id: 'ff-wurstmarkt', emoji: '🍷', name: 'Dürkheimer Wurstmarkt — la più grande festa del vino del mondo',
    kind: 'vino', city: 'Bad Dürkheim', country: 'Germania', continent: 'Europa',
    coords: { lat: 49.46, lon: 8.17 }, months: [9], since: 1417,
    when: 'Due fine settimana a settembre (il secondo e il terzo).',
    what: 'Seicentomila visitatori, trentasei Schubkarch — i banchi-carriola dei vignaioli del Palatinato — e la botte più grande del mondo, che dentro è un ristorante. Il nome inganna: è una festa del VINO, le salsicce sono il contorno.',
    tip: 'Si beve nello Schoppen da mezzo litro, e i vignaioli versano il proprio vino: il Palatinato in un pomeriggio. Il martedì è il giorno dei residenti, molto più vivibile.',
  },
  {
    id: 'ff-foire-colmar', emoji: '🍇', name: 'Foire aux Vins d\'Alsace',
    kind: 'vino', city: 'Colmar', country: 'Francia', continent: 'Europa',
    coords: { lat: 48.08, lon: 7.36 }, months: [7, 8], since: 1948,
    when: 'Dieci giorni fra fine luglio e inizio agosto.',
    what: 'La più grande fiera del vino di Francia per pubblico: i produttori dell\'intera Route des Vins in un solo padiglione, con concerti serali che riempiono la città.',
    tip: 'Il biglietto della fiera include i concerti: si beve bene e si spende poco. Colmar in quei giorni è piena — dormi a Riquewihr o a Ribeauvillé e prendi la navetta.',
  },
  {
    id: 'ff-vendanges-montmartre', emoji: '🍇', name: 'Fête des Vendanges de Montmartre',
    kind: 'raccolto', city: 'Parigi', country: 'Francia', continent: 'Europa',
    coords: { lat: 48.89, lon: 2.34 }, months: [10], since: 1934,
    when: 'Il secondo fine settimana di ottobre.',
    what: 'Si vendemmia il Clos Montmartre, la vigna comunale dietro il Sacré-Cœur: milleottocento bottiglie l\'anno, vendute all\'asta per beneficenza. Cinque giorni di banchi regionali sulle scalinate.',
    tip: 'L\'unica vendemmia dentro Parigi. La vigna si visita SOLO in quei giorni: il resto dell\'anno è chiusa.',
  },
  {
    id: 'ff-sarlat-truffe', emoji: '🍄', name: 'Fête de la Truffe de Sarlat',
    kind: 'tartufo', city: 'Sarlat-la-Canéda', country: 'Francia', continent: 'Europa',
    coords: { lat: 44.89, lon: 1.22 }, months: [1],
    when: 'Il terzo fine settimana di gennaio.',
    what: 'Il mercato del tartufo NERO del Périgord nella città medievale: dimostrazioni di cavatura col cane, cucina in piazza e il tartufo venduto dai produttori senza intermediari.',
    tip: 'Il nero del Périgord è tutt\'altro prodotto dal bianco d\'Alba: si cuoce, non si grattugia a crudo. Gennaio in Dordogna è freddo e vuoto di turisti: è il momento migliore per vedere la valle.',
  },
  {
    id: 'ff-budapest-bor', emoji: '🍷', name: 'Budapesti Borfesztivál — il festival del vino nel Castello',
    kind: 'vino', city: 'Budapest', country: 'Ungheria', continent: 'Europa',
    coords: { lat: 47.50, lon: 19.04 }, months: [9], since: 1992,
    when: 'Quattro giorni a inizio settembre.',
    what: 'Tutte le 22 regioni vinicole ungheresi nei cortili del Castello di Buda, con il Danubio e il Parlamento sotto. Duecento produttori, dal Tokaji al cabernet franc di Villány.',
    tip: 'Si compra un bicchiere col cordino e si gira: è il modo più veloce per capire il vino ungherese, che fuori dall\'Ungheria non si trova. Il tramonto dal bastione vale il biglietto.',
  },
  {
    id: 'ff-znojmo-vinobrani', emoji: '🍇', name: 'Znojemské historické vinobraní',
    kind: 'raccolto', city: 'Znojmo', country: 'Cechia', continent: 'Europa',
    coords: { lat: 48.86, lon: 16.05 }, months: [9], since: 1966,
    when: 'Il secondo fine settimana di settembre.',
    what: 'La città medievale torna al Trecento: corteo del re Giovanni di Lussemburgo, mercato storico e il burčák, il mosto in fermentazione che si beve solo per poche settimane l\'anno.',
    tip: 'Il burčák è dolce e sembra succo, ma fermenta ancora nello stomaco: è il tranello classico. Si vende per legge solo dal 1° agosto al 30 novembre.',
  },
  {
    id: 'ff-mikulov-palava', emoji: '🍷', name: 'Pálavské vinobraní',
    kind: 'raccolto', city: 'Mikulov', country: 'Cechia', continent: 'Europa',
    coords: { lat: 48.81, lon: 16.64 }, months: [9],
    when: 'Il secondo fine settimana di settembre.',
    what: 'La festa della vendemmia sotto il castello dei Dietrichstein, con le cantine della Moravia meridionale aperte e i vinné sklepy fuori dal paese.',
    tip: 'Si arriva in treno da Brno o in bici sulla Mikulovská vinařská stezka. La botte del castello, del 1643, contiene 1.010 ettolitri: la più grande d\'Europa centrale.',
  },
  {
    id: 'ff-tbilisoba', emoji: '🍇', name: 'Tbilisoba — la festa della città e del mosto',
    kind: 'raccolto', city: 'Tbilisi', country: 'Georgia', continent: 'Asia',
    coords: { lat: 41.72, lon: 44.79 }, months: [10], since: 1979,
    when: 'L\'ultimo fine settimana di ottobre.',
    what: 'La città vecchia si riempie di torchi: si pigia l\'uva in piazza, si fa il churchkhela (noci infilate e immerse nel mosto denso) e si beve il vino nuovo nelle cantine dei quartieri.',
    tip: 'Il churchkhela si fa davanti a te ed è la cosa da portare a casa. Da Tbilisi la Kakheti è a due ore: si combina con la rtveli se le date coincidono.',
  },
  {
    id: 'ff-niigata-sake', emoji: '🍶', name: 'Niigata Sake no Jin — 新潟淡麗 にいがた酒の陣',
    kind: 'birra', city: 'Niigata', country: 'Giappone', continent: 'Asia',
    coords: { lat: 37.92, lon: 139.04 }, months: [3], since: 2004,
    when: 'Due giorni a metà marzo.',
    what: 'Ottanta-novanta kura della prefettura in un padiglione sul porto: con un bicchierino si assaggia il sake di tutta Niigata, che ha più distillerie di ogni altra prefettura giapponese.',
    tip: 'Si compra il bicchiere all\'ingresso e si assaggia liberamente: bevi acqua fra un assaggio e l\'altro (in Giappone si chiama yawaragi-mizu ed è previsto). Biglietti online, si esauriscono.',
  },
  {
    id: 'ff-gimjang', emoji: '🥬', name: 'Gimjang — il giorno in cui la Corea fa il kimchi',
    kind: 'raccolto', city: 'Seul', country: 'Corea del Sud', continent: 'Asia',
    coords: { lat: 37.57, lon: 126.98 }, months: [11],
    when: 'Novembre, nelle settimane prima del gelo.',
    what: 'Non è un festival ma una pratica collettiva iscritta al patrimonio immateriale UNESCO: famiglie e quartieri preparano insieme il kimchi per tutto l\'inverno. A Seul il Kimchi Festival apre la piazza del municipio a migliaia di persone che lo fanno insieme.',
    tip: 'Ci si iscrive online per partecipare al tavolo comune: si porta a casa quello che si è preparato. Serve grembiule e guanti — il peperoncino resta sulle mani per giorni.',
  },
  {
    id: 'ff-phuket-veg', emoji: '🌶', name: 'Phuket Vegetarian Festival — เทศกาลกินเจ',
    kind: 'street-food', city: 'Phuket', country: 'Thailandia', continent: 'Asia',
    coords: { lat: 7.88, lon: 98.39 }, months: [9, 10], since: 1825,
    when: 'Nove giorni nel nono mese lunare cinese, fra fine settembre e ottobre.',
    what: 'Tutta l\'isola mangia jae (vegano stretto) per nove giorni: le bancarelle si segnalano con la bandiera gialla e i templi cinesi ospitano processioni che sono, va detto, molto crude.',
    tip: 'Il cibo di strada in quei giorni è tutto vegano e straordinario. Le processioni includono automutilazioni rituali: informati prima e decidi se vuoi vederle.',
  },
  {
    id: 'ff-blumenau', emoji: '🍺', name: 'Oktoberfest Blumenau',
    kind: 'birra', city: 'Blumenau', country: 'Brasile', continent: 'Sud America',
    coords: { lat: -26.92, lon: -49.07 }, months: [10], since: 1984,
    when: 'Tre settimane a ottobre.',
    what: 'La seconda Oktoberfest del mondo dopo Monaco, in una città fondata da coloni tedeschi nel 1850: birra artigianale di Santa Catarina, marchenfest e costumi tirolesi ai tropici.',
    tip: 'Santa Catarina è oggi il polo brasiliano della birra artigianale: le birrerie della valle dell\'Itajaí valgono più del padiglione.',
  },
  {
    id: 'ff-ensenada-vendimia', emoji: '🍷', name: 'Fiestas de la Vendimia de Ensenada',
    kind: 'vino', city: 'Valle de Guadalupe', country: 'Messico', continent: 'Nord America',
    coords: { lat: 32.09, lon: -116.58 }, months: [8], since: 1991,
    when: 'Tre settimane fra fine luglio e agosto.',
    what: 'Cinquanta eventi sparsi fra le cantine del Valle de Guadalupe: pigiature, cene campestri sotto i pini, concorso di paella e la Muestra del Vino con tutte le cantine baja californiane.',
    tip: 'Gli eventi si prenotano uno per uno e i migliori si esauriscono a giugno. Le strade del valle sono sterrate: auto alta e nessuno che guida dopo le degustazioni.',
  },
  {
    id: 'ff-maine-lobster', emoji: '🦞', name: 'Maine Lobster Festival',
    kind: 'pesce', city: 'Rockland', country: 'Stati Uniti', continent: 'Nord America',
    coords: { lat: 44.10, lon: -69.11 }, months: [7, 8], since: 1947,
    when: 'Cinque giorni a cavallo fra fine luglio e inizio agosto.',
    what: 'Dieci tonnellate di aragoste bollite nella caldaia più grande del mondo, sul porto: si mangia su tavolate di legno con il bavaglino di plastica, come si deve.',
    tip: 'L\'aragosta del Maine si mangia semplice, bollita col burro fuso: chi la serve in salsa la sta nascondendo. Il lobster roll caldo (col burro) e freddo (con la maionese) sono due scuole in guerra.',
  },
  {
    id: 'ff-bluff-oyster', emoji: '🦪', name: 'Bluff Oyster & Food Festival',
    kind: 'pesce', city: 'Bluff', country: 'Nuova Zelanda', continent: 'Oceania',
    coords: { lat: -46.60, lon: 168.33 }, months: [5], since: 1996,
    when: 'A fine maggio, nel punto più a sud della Nuova Zelanda.',
    what: 'Le ostriche di Foveaux Strait, considerate fra le migliori del mondo, aperte e mangiate crude sul molo insieme a paua e whitebait, con vento e pioggia quasi garantiti.',
    tip: 'La stagione delle ostriche di Bluff va da marzo ad agosto: fuori da quella finestra non ci sono, e chi le vende congelate ti sta ingannando. Biglietti a numero chiuso, in vendita a marzo.',
  },
  {
    id: 'ff-trujillo-queso', emoji: '🧀', name: 'Feria Nacional del Queso de Trujillo',
    kind: 'formaggio', city: 'Trujillo', country: 'Spagna', continent: 'Europa',
    coords: { lat: 39.46, lon: -5.88 }, months: [4, 5], since: 1985,
    when: 'Il primo fine settimana di maggio (a volte fine aprile).',
    what: 'La Plaza Mayor rinascimentale piena di banchi: la Torta del Casar e la Torta de la Serena — pecorini cremosi cagliati col cardo, che si aprono col cucchiaio — e duecento caseifici da tutta Spagna.',
    tip: 'La Torta del Casar si serve a temperatura ambiente, si taglia il coperchio e si intinge il pane: se te la danno fredda, aspetta mezz\'ora.',
  },
  {
    id: 'ff-ogrove-marisco', emoji: '🦐', name: 'Festa do Marisco de O Grove',
    kind: 'pesce', city: 'O Grove', country: 'Spagna', continent: 'Europa',
    coords: { lat: 42.49, lon: -8.87 }, months: [10], since: 1963,
    when: 'Dieci giorni a ottobre.',
    what: 'Il porto galiziano mette in piazza il meglio della ria: percebes, vieiras, navajas, centollo e polvo á feira, con l\'albariño delle Rías Baixas accanto.',
    tip: 'I percebes (lepadi) si raccolgono aggrappati agli scogli battuti dalle onde ed è il mestiere più pericoloso di Galizia: il prezzo alto ha un motivo. Si mangiano con le mani.',
  },
  {
    id: 'ff-madeira-vinho', emoji: '🍷', name: 'Festa do Vinho da Madeira',
    kind: 'vino', city: 'Funchal', country: 'Portogallo', continent: 'Europa',
    coords: { lat: 32.65, lon: -16.91 }, months: [8, 9], since: 1980,
    when: 'Fine agosto-inizio settembre.',
    what: 'Rievocazione della vendemmia nei terrazzamenti di Estreito de Câmara de Lobos, pigiatura a piedi nudi nel lagar e degustazioni delle lodges storiche lungo l\'Avenida Arriaga.',
    tip: 'La parte migliore non è a Funchal ma a Câmara de Lobos, dove la vendemmia è vera e non ricostruita: venti minuti di autobus.',
  },
  {
    id: 'ff-camogli-pesce', emoji: '🐟', name: 'Sagra del Pesce di Camogli',
    kind: 'pesce', city: 'Camogli', country: 'Italia', continent: 'Europa',
    coords: { lat: 44.35, lon: 9.16 }, months: [5], since: 1952,
    when: 'La seconda domenica di maggio.',
    what: 'Una padella di quattro metri di diametro sul molo frigge tonnellate di pesce azzurro, distribuito gratis; la sera prima si accendono i falò nei due quartieri del borgo.',
    tip: 'Si mangia in piedi sul lungomare, in una coda lunghissima e allegra. Camogli si raggiunge in treno: in auto non si parcheggia.',
  },
  {
    id: 'ff-acqualagna-tartufo', emoji: '🍄', name: 'Fiera Nazionale del Tartufo Bianco di Acqualagna',
    kind: 'tartufo', city: 'Acqualagna', country: 'Italia', continent: 'Europa',
    coords: { lat: 43.62, lon: 12.67 }, months: [10, 11], since: 1965,
    when: 'I fine settimana fra fine ottobre e metà novembre.',
    what: 'Il secondo mercato italiano del tartufo bianco dopo Alba, in un paese di 4.500 abitanti che ne movimenta i due terzi della produzione nazionale. Prezzi più onesti e molta meno folla.',
    tip: 'Acqualagna ha tartufi tutto l\'anno (nero pregiato in inverno, bianchetto in primavera, nero estivo). La gola del Furlo, a due chilometri, è una delle più belle d\'Italia.',
  },
];

/**
 * Tutte le fiere e i festival del gusto.
 *
 * Le prime quattro liste sono scritte a mano, con il taglio editoriale del
 * progetto. FOOD_FESTIVALS_WORLD arriva invece dalla ricerca multilingue
 * del 21/08/2026 (dieci ricercatori, uno per macro-area, obbligati a citare
 * l'ente organizzatore) ed è generata: copre i paesi che il catalogo scritto
 * a mano non poteva raggiungere.
 *
 * L'ordine conta: in caso di doppione vince la voce curata, che ha il testo
 * migliore. La deduplica è per nome normalizzato + città.
 */
const chiaveFiera = (f: FoodFestival) =>
  `${f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')}|${f.city.toLowerCase()}`;

const CURATE: FoodFestival[] = [...ITALIA, ...EUROPA, ...MONDO, ...AGGIUNTE];
const visteFiere = new Set(CURATE.map(chiaveFiera));

export const FOOD_FESTIVALS: FoodFestival[] = [
  ...CURATE,
  ...FOOD_FESTIVALS_WORLD.filter((f) => !visteFiere.has(chiaveFiera(f))),
];

export const FESTIVAL_KIND_LABELS: Record<FestivalKind, { label: string; emoji: string }> = {
  tartufo: { label: 'Tartufo', emoji: '🍄' },
  vino: { label: 'Vino', emoji: '🍷' },
  birra: { label: 'Birra e distillati', emoji: '🍺' },
  formaggio: { label: 'Formaggi', emoji: '🧀' },
  olio: { label: 'Olio', emoji: '🫒' },
  cioccolato: { label: 'Cioccolato', emoji: '🍫' },
  pesce: { label: 'Pesce', emoji: '🐟' },
  carne: { label: 'Carne', emoji: '🥩' },
  dolci: { label: 'Dolci e pasta', emoji: '🍝' },
  frutta: { label: 'Frutta', emoji: '🍊' },
  'street-food': { label: 'Cucina di strada', emoji: '🍴' },
  'mercato-natale': { label: 'Mercati', emoji: '🎄' },
  raccolto: { label: 'Vendemmia e raccolto', emoji: '🍇' },
  spezie: { label: 'Spezie', emoji: '🌶' },
  caffe: { label: 'Caffè', emoji: '☕' },
  te: { label: 'Tè', emoji: '🍵' },
};

/**
 * Le fiere del mese indicato (1-12), o del mese corrente.
 * Ordinate mettendo davanti quelle che cadono proprio adesso.
 */
export function festivalsInMonth(month?: number): FoodFestival[] {
  const m = month ?? new Date().getMonth() + 1;
  return FOOD_FESTIVALS.filter((f) => f.months.includes(m));
}

const R = 6371;
function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Le fiere entro `km` da un punto, dalla più vicina. */
export function festivalsNear(lat: number, lon: number, km = 250): Array<FoodFestival & { distanceKm: number }> {
  return FOOD_FESTIVALS
    .map((f) => ({ ...f, distanceKm: Math.round(haversine(lat, lon, f.coords.lat, f.coords.lon)) }))
    .filter((f) => f.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Contesto per il generatore di itinerari costruiti attorno a una fiera. */
export function festivalContext(f: FoodFestival): string {
  return [
    `CONTESTO FIERA DEL GUSTO — ${f.name} (${f.city}, ${f.country}).`,
    `Quando: ${f.when}`,
    `Cosa succede: ${f.what}`,
    `Avvertenza pratica da riportare: ${f.tip}`,
    f.since ? `Si tiene dal ${f.since}.` : '',
    'REGOLA SULLE DATE: NON inventare date precise. La finestra è quella indicata, ma il calendario cambia ogni anno: scrivi la finestra e di\' esplicitamente di verificare le date sul sito ufficiale prima di prenotare.',
    'L\'itinerario NON è solo la fiera: costruisci la giornata attorno, con cosa vedere prima e dopo, dove mangiare quando i banchi sono pieni, e un piano B se la fiera è troppo affollata.',
  ].filter(Boolean).join('\n');
}
