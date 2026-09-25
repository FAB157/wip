/**
 * Genera i PDF «come un libro» (vedi base.tsx). Tutto e' caricato al momento
 * dell'export con import dinamici: @react-pdf/renderer pesa e serve solo qui.
 * Le immagini si scaricano PRIMA di impaginare, come data URL: una foto che
 * non risponde viene lasciata fuori invece di far fallire il documento — e
 * «nessuna foto e' meglio della foto sbagliata» (CLAUDE.md): qui entrano solo
 * le foto del POI stesso (image_url del POI o il manifest della guida), mai
 * una ricerca per parola chiave.
 *
 * Ritorna null quando questa via non e' adatta (lingue non latine: i font
 * incorporati non hanno cirillico/CJK): chi chiama ripiega su html2pdf.
 */
import type { PremiumGuideContent } from '../../services/premiumGuideService';
import { haCaratteriNonLatini } from './pulisci.js';
import { tappeMappa } from './tappeMappa.js';

/**
 * «Pagina x / y» su ogni pagina, con pdf-lib, dopo l'impaginazione: il
 * `render` di react-pdf oltre ~15 pagine in una Page sola da' coordinate
 * assurde o sparisce (vedi base.tsx). Stesso punto e carattere del piede.
 * `daPagina` = prima pagina da numerare (1-based): la copertina non si numera.
 */
async function numeraPagine(blob: Blob, etichetta: string, daPagina = 1): Promise<Blob> {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pagine = doc.getPages();
    const tot = pagine.length;
    const X = 18 * 2.835, Y = 9 * 2.835, DIM = 7.5;
    pagine.forEach((p, i) => {
      if (i + 1 < daPagina) return;
      const testo = `${etichetta} ${i + 1} / ${tot}`;
      const w = font.widthOfTextAtSize(testo, DIM);
      p.drawText(testo, { x: p.getWidth() - X - w, y: Y + 1, size: DIM, font, color: rgb(0.47, 0.47, 0.47) });
    });
    const bytes = await doc.save();
    return new Blob([bytes as any], { type: 'application/pdf' });
  } catch (e) {
    console.warn('[pdf] numerazione pagine non riuscita, PDF senza numeri:', e);
    return blob;
  }
}

export type Lang = 'IT' | 'EN' | 'FR' | 'ES' | 'DE';
export const lingua = (l: unknown): Lang => {
  const u = String(l || 'IT').toUpperCase().slice(0, 2);
  return (['IT', 'EN', 'FR', 'ES', 'DE'] as Lang[]).includes(u as Lang) ? (u as Lang) : 'IT';
};

export const ET_GUIDA: Record<Lang, import('./GuidaPremiumPdf').GuidaPdfEtichette> = {
  IT: { guida: 'Guida Premium', sommario: 'Sommario', giorno: 'Giorno', introduzione: 'Introduzione', storia: 'Storia e identità', cultura: 'Cultura e tradizioni', consigliPratici: 'Consigli pratici', curiosita: 'Curiosità', dettaglio: 'Dettaglio storico e tecnico', consiglioInsider: 'Consiglio insider', infoUtili: 'Info utili', orari: 'Orari', periodoMigliore: 'Periodo migliore', prezzo: 'Prezzo', telefono: 'Telefono', sito: 'Sito web', piatti: 'Da assaggiare', indirizzo: 'Indirizzo', comeArrivare: 'Come arrivare', pagina: 'Pagina', stile: 'Guida Premium' },
  EN: { guida: 'Premium Guide', sommario: 'Contents', giorno: 'Day', introduzione: 'Introduction', storia: 'History and identity', cultura: 'Culture and traditions', consigliPratici: 'Practical tips', curiosita: 'Curiosities', dettaglio: 'Historical and technical detail', consiglioInsider: 'Insider tip', infoUtili: 'Useful info', orari: 'Opening hours', periodoMigliore: 'Best time', prezzo: 'Price', telefono: 'Phone', sito: 'Website', piatti: 'What to taste', indirizzo: 'Address', comeArrivare: 'Getting there', pagina: 'Page', stile: 'Premium Guide' },
  FR: { guida: 'Guide Premium', sommario: 'Sommaire', giorno: 'Jour', introduzione: 'Introduction', storia: 'Histoire et identité', cultura: 'Culture et traditions', consigliPratici: 'Conseils pratiques', curiosita: 'Curiosités', dettaglio: 'Détail historique et technique', consiglioInsider: 'Conseil d’initié', infoUtili: 'Infos utiles', orari: 'Horaires', periodoMigliore: 'Meilleure période', prezzo: 'Prix', telefono: 'Téléphone', sito: 'Site web', piatti: 'À goûter', indirizzo: 'Adresse', comeArrivare: 'Y aller', pagina: 'Page', stile: 'Guide Premium' },
  ES: { guida: 'Guía Premium', sommario: 'Índice', giorno: 'Día', introduzione: 'Introducción', storia: 'Historia e identidad', cultura: 'Cultura y tradiciones', consigliPratici: 'Consejos prácticos', curiosita: 'Curiosidades', dettaglio: 'Detalle histórico y técnico', consiglioInsider: 'Consejo de experto', infoUtili: 'Información útil', orari: 'Horarios', periodoMigliore: 'Mejor época', prezzo: 'Precio', telefono: 'Teléfono', sito: 'Sitio web', piatti: 'Para probar', indirizzo: 'Dirección', comeArrivare: 'Cómo llegar', pagina: 'Página', stile: 'Guía Premium' },
  DE: { guida: 'Premium-Guide', sommario: 'Inhalt', giorno: 'Tag', introduzione: 'Einführung', storia: 'Geschichte und Identität', cultura: 'Kultur und Traditionen', consigliPratici: 'Praktische Tipps', curiosita: 'Wissenswertes', dettaglio: 'Historische und technische Details', consiglioInsider: 'Insider-Tipp', infoUtili: 'Nützliche Infos', orari: 'Öffnungszeiten', periodoMigliore: 'Beste Zeit', prezzo: 'Preis', telefono: 'Telefon', sito: 'Website', piatti: 'Zum Probieren', indirizzo: 'Adresse', comeArrivare: 'Anfahrt', pagina: 'Seite', stile: 'Premium-Guide' },
};

export const ET_ITINERARIO: Record<Lang, import('./ItinerarioPdf').ItinerarioPdfEtichette> = {
  IT: { pagina: 'Pagina', giorno: 'Giorno', giorni: 'giorni', giornoSingolo: 'giorno', curatoDa: 'di viaggio curato da World in Pocket', intro: 'Benvenuto nella tua guida di viaggio curata da World in Pocket. Questo itinerario ti condurrà attraverso una selezione speciale di tappe e punti di interesse. Usa l’app «World in Pocket» durante la visita per sbloccare le audioguide interattive e ascoltare la storia di questi luoghi dal vivo.', consiglioGuida: 'Consiglio della guida', tempoVisita: 'Tempo di visita', spostamento: 'Spostamento', budgetGiorno: 'Budget della giornata', totaleGiorno: 'Totale giorno', consigli: 'Consigli', suggerimenti: 'Suggerimenti extra', precauzioni: 'Precauzioni', zoneDaEvitare: 'Zone da evitare', totaleViaggio: 'Totale stimato viaggio', mappa: 'Mappa del percorso' },
  EN: { pagina: 'Page', giorno: 'Day', giorni: 'days', giornoSingolo: 'day', curatoDa: 'trip curated by World in Pocket', intro: 'Welcome to your travel guide curated by World in Pocket. This itinerary leads you through a special selection of stops and points of interest. Use the “World in Pocket” app during your visit to unlock interactive audio guides and hear the story of these places live.', consiglioGuida: 'Guide’s advice', tempoVisita: 'Visit time', spostamento: 'Transfer', budgetGiorno: 'Budget of the day', totaleGiorno: 'Day total', consigli: 'Tips', suggerimenti: 'Extra suggestions', precauzioni: 'Precautions', zoneDaEvitare: 'Areas to avoid', totaleViaggio: 'Estimated trip total', mappa: 'Route map' },
  FR: { pagina: 'Page', giorno: 'Jour', giorni: 'jours', giornoSingolo: 'jour', curatoDa: 'de voyage organisé par World in Pocket', intro: 'Bienvenue dans votre guide de voyage conçu par World in Pocket. Cet itinéraire vous mène à travers une sélection spéciale d’étapes et de points d’intérêt. Utilisez l’application « World in Pocket » pendant votre visite pour débloquer les audioguides interactifs.', consiglioGuida: 'Conseil du guide', tempoVisita: 'Durée de visite', spostamento: 'Déplacement', budgetGiorno: 'Budget de la journée', totaleGiorno: 'Total du jour', consigli: 'Conseils', suggerimenti: 'Suggestions', precauzioni: 'Précautions', zoneDaEvitare: 'Zones à éviter', totaleViaggio: 'Total estimé du voyage', mappa: 'Carte du parcours' },
  ES: { pagina: 'Página', giorno: 'Día', giorni: 'días', giornoSingolo: 'día', curatoDa: 'de viaje seleccionado por World in Pocket', intro: 'Bienvenido a tu guía de viaje seleccionada por World in Pocket. Este itinerario te lleva por una selección especial de paradas y puntos de interés. Usa la aplicación «World in Pocket» durante tu visita para desbloquear las audioguías interactivas.', consiglioGuida: 'Consejo de la guía', tempoVisita: 'Tiempo de visita', spostamento: 'Traslado', budgetGiorno: 'Presupuesto del día', totaleGiorno: 'Total del día', consigli: 'Consejos', suggerimenti: 'Sugerencias', precauzioni: 'Precauciones', zoneDaEvitare: 'Zonas a evitar', totaleViaggio: 'Total estimado del viaje', mappa: 'Mapa del recorrido' },
  DE: { pagina: 'Seite', giorno: 'Tag', giorni: 'Tage', giornoSingolo: 'Tag', curatoDa: 'Reise, kuratiert von World in Pocket', intro: 'Willkommen zu deinem Reiseführer, kuratiert von World in Pocket. Diese Route führt dich zu einer besonderen Auswahl von Stationen und Sehenswürdigkeiten. Nutze die App „World in Pocket“ während des Besuchs, um interaktive Audioguides freizuschalten.', consiglioGuida: 'Tipp des Guides', tempoVisita: 'Besuchsdauer', spostamento: 'Transfer', budgetGiorno: 'Tagesbudget', totaleGiorno: 'Tagessumme', consigli: 'Tipps', suggerimenti: 'Weitere Hinweise', precauzioni: 'Vorsichtsmaßnahmen', zoneDaEvitare: 'Zu meidende Gegenden', totaleViaggio: 'Geschätzte Reisekosten', mappa: 'Routenkarte' },
};

/**
 * COMMONS «Special:FilePath» NON SI SCARICA DAL BROWSER (20/09/2026, collaudo in
 * Chrome: le Guide Premium uscivano in PDF SENZA NEMMENO UNA FOTO, 0,1 MB).
 * Gli indirizzi del manifest hanno la forma
 * `commons.wikimedia.org/w/index.php?title=Special:FilePath/<file>&width=…`
 * (o `/wiki/Special:FilePath/…`, `Special:Redirect/file/…`): rispondono con un
 * reindirizzamento SENZA intestazioni CORS, e `fetch` lo rifiuta («Failed to
 * fetch»). In un <img> si vedono — per questo la guida a schermo le ha e il
 * PDF no. L'API di Commons (con `origin=*`) restituisce la miniatura vera su
 * upload.wikimedia.org, che il CORS lo concede. Gratis, nessuna chiave.
 */
async function risolviCommons(u: string): Promise<string> {
  try {
    const url = new URL(u);
    if (!/(^|\.)wikimedia\.org$|(^|\.)wikipedia\.org$/i.test(url.host) || /^upload\./i.test(url.host)) return u;
    const titolo = url.searchParams.get('title') || decodeURIComponent(url.pathname);
    const m = titolo.match(/Special:(?:FilePath|Redirect\/file)\/(.+)$/i);
    if (!m) return u;
    const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + m[1].replace(/_/g, ' '))}`
      + `&prop=imageinfo&iiprop=url&iiurlwidth=${LATO_MASSIMO}&format=json&origin=*`;
    const r = await fetch(api, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return u;
    const pagine = (await r.json())?.query?.pages || {};
    const info: any = (Object.values(pagine)[0] as any)?.imageinfo?.[0];
    return info?.thumburl || info?.url || u;
  } catch { return u; }
}

/** Una foto come data URL, o undefined se non arriva entro 12 s / non e' un'immagine. */
async function scaricaImmagine(url?: string | null): Promise<string | undefined> {
  let u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) u = await risolviCommons(u);
  if (!/^https?:\/\//i.test(u) && !u.startsWith('data:')) return undefined;
  if (u.startsWith('data:image/')) return u;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000), mode: 'cors' });
    if (!r.ok) return undefined;
    const b = await r.blob();
    if (!/^image\/(jpeg|png|webp|gif)/i.test(b.type) || b.size > 8 * 1024 * 1024) return undefined;
    // WebP: react-pdf legge JPEG e PNG. Si ridisegna su canvas.
    if (/webp|gif/i.test(b.type)) return await ricodifica(b);
    return await new Promise<string>((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ko(fr.error); fr.readAsDataURL(b); });
  } catch { return undefined; }
}

/**
 * La foto GIA' MISURATA e alleggerita (20/09/2026). Due motivi:
 * - le misure servono a impaginarla intera (base.tsx › FotoIntera): senza,
 *   finiva ritagliata in una fascia;
 * - gli originali di Commons arrivano a 4-8 MB l'uno: sedici foto cosi'
 *   facevano un PDF da 7 MB e, su un telefono, potevano far cadere il motore
 *   — e allora la guida usciva dalla stampa del browser, senza foto. Sopra i
 *   1600 px di lato si ridisegna in JPEG: in stampa non si vede differenza.
 */
const LATO_MASSIMO = 1600;
async function scaricaFoto(url?: string | null): Promise<{ src: string; w: number; h: number } | undefined> {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u) && !u.startsWith('data:image/')) return undefined;
  if (!u.startsWith('data:')) u = await risolviCommons(u);
  try {
    const r = await fetch(u, u.startsWith('data:') ? {} : { signal: AbortSignal.timeout(12000), mode: 'cors' });
    if (!r.ok) return undefined;
    const b = await r.blob();
    if (!/^image\/(jpeg|png|webp|gif)/i.test(b.type) || b.size > 12 * 1024 * 1024) return undefined;
    const bmp = await createImageBitmap(b);
    const w = bmp.width, h = bmp.height;
    if (!(w > 0) || !(h > 0)) return undefined;
    const scala = Math.min(1, LATO_MASSIMO / Math.max(w, h));
    if (scala === 1 && /jpeg|png/i.test(b.type) && b.size < 900 * 1024) {
      const src = await new Promise<string>((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ko(fr.error); fr.readAsDataURL(b); });
      return { src, w, h };
    }
    const c = document.createElement('canvas');
    c.width = Math.round(w * scala); c.height = Math.round(h * scala);
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    // Fondo bianco: un PNG trasparente in JPEG diventerebbe nero.
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return { src: c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height };
  } catch {
    // createImageBitmap assente o foto illeggibile: la via vecchia, senza misure.
    const src = await scaricaImmagine(u);
    return src ? { src, w: 0, h: 0 } : undefined;
  }
}

async function ricodifica(b: Blob): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(b);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')?.drawImage(bmp, 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  } catch { return undefined; }
}

/**
 * URL della mappa statica Mapbox del percorso, con i numeri delle tappe.
 * Condiviso fra il PDF del client e quello del server (allegato email):
 * la stessa mappa in entrambi. I numeri sono quelli di tappeMappa(), gli
 * stessi della legenda sotto la mappa. undefined senza token o coordinate.
 */
export function urlMappaStatica(plan: any, token: string | undefined): string | undefined {
  if (!token) return undefined;
  const punti = tappeMappa(plan);
  if (!punti.length) return undefined;
  const pin = punti.map((p) => `pin-s-${Math.min(p.n, 99)}+1e3a8a(${p.lon.toFixed(5)},${p.lat.toFixed(5)})`).join(',');
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/auto/1000x760@2x?padding=70&access_token=${encodeURIComponent(token)}`;
}

/** La mappa del percorso: immagine statica Mapbox con i numeri delle tappe. */
async function mappaStatica(plan: any): Promise<string | undefined> {
  const url = urlMappaStatica(plan, (import.meta as any).env?.VITE_MAPBOX_TOKEN);
  return url ? scaricaImmagine(url) : undefined;
}

export async function generaPdfItinerario(plan: any, language: unknown): Promise<Blob | null> {
  const l = lingua(language);
  if (haCaratteriNonLatini(String(plan?.titolo || '') + (plan?.giorni?.[0]?.tappe?.[0]?.attivita || ''))) return null;
  const [{ pdf }, { default: ItinerarioPdf }, React] = await Promise.all([
    import('@react-pdf/renderer'), import('./ItinerarioPdf'), import('react'),
  ]);
  const mappa = await mappaStatica(plan);
  const doc = React.createElement(ItinerarioPdf, { plan, etichette: ET_ITINERARIO[l], mappa });
  return numeraPagine(await pdf(doc as any).toBlob(), ET_ITINERARIO[l].pagina, 1);
}

export const ET_MUSEO: Record<Lang, import('./MuseumGuidaPdf').MuseumPdfEtichette> = {
  IT: { pagina: 'Pagina', museo: 'Guida al museo', nOpere: '{n} opere', conSale: 'con le sale', mappa: 'Pianta del museo', ancheCollezione: 'Anche nella collezione', nessunaSala: 'Il museo non pubblica le sale: chiedi in biglietteria.', guardaAnche: 'Guarda anche', curiosita: 'Curiosità', soloCollezione: 'Nella collezione, fuori dal percorso principale', suEtichetta: 'Sull\'etichetta' },
  EN: { pagina: 'Page', museo: 'Museum guide', nOpere: '{n} artworks', conSale: 'with rooms', mappa: 'Museum map', ancheCollezione: 'Also in the collection', nessunaSala: 'The museum does not publish room numbers: ask at the ticket desk.', guardaAnche: 'Look for', curiosita: 'Curiosity', soloCollezione: 'In the collection, off the main route', suEtichetta: 'On the label' },
  FR: { pagina: 'Page', museo: 'Guide du musée', nOpere: '{n} œuvres', conSale: 'avec les salles', mappa: 'Plan du musée', ancheCollezione: 'Également dans la collection', nessunaSala: 'Le musée ne publie pas les numéros de salle : demandez à la billetterie.', guardaAnche: 'À regarder', curiosita: 'Curiosité', soloCollezione: 'Dans la collection, hors du parcours principal', suEtichetta: 'Sur l\'étiquette' },
  ES: { pagina: 'Página', museo: 'Guía del museo', nOpere: '{n} obras', conSale: 'con salas', mappa: 'Plano del museo', ancheCollezione: 'También en la colección', nessunaSala: 'El museo no publica los números de sala: pregunta en taquilla.', guardaAnche: 'Fíjate en', curiosita: 'Curiosidad', soloCollezione: 'En la colección, fuera del recorrido principal', suEtichetta: 'En la etiqueta' },
  DE: { pagina: 'Seite', museo: 'Museumsführer', nOpere: '{n} Werke', conSale: 'mit Sälen', mappa: 'Museumsplan', ancheCollezione: 'Auch in der Sammlung', nessunaSala: 'Das Museum veröffentlicht keine Saalnummern: fragen Sie an der Kasse.', guardaAnche: 'Achten Sie auf', curiosita: 'Wissenswertes', soloCollezione: 'In der Sammlung, außerhalb der Hauptroute', suEtichetta: 'Auf dem Schild' },
};

export const ET_CLIMA: Record<Lang, import('./ClimaPdf').ClimaPdfEtichette> = {
  IT: { pagina: 'Pagina', titolo: 'Quando visitare', numeri: 'In numeri', mese: 'Mese', temp: 'Min / max', pioggia: 'Pioggia', sole: 'Sole', umidita: 'Umidità', voto: 'Voto', migliore: 'Periodo migliore', evitare: 'Da evitare', panoramica: 'Panoramica', web: 'Consigli e suggerimenti dal web', esperienze: 'Esperienze dei viaggiatori', mesi: 'Mese per mese', portare: 'Cosa portare', orari: 'Orari migliori', avvertenze: 'Avvertenze', statistiche: 'Statistiche', conclusioni: 'Conclusioni dell\'AI', fonti: 'Fonti', aspettarsi: 'Cosa aspettarsi', eventi: 'Cosa succede in questo mese', alternativa: 'Se non è il mese giusto', mare: 'Temperatura del mare', tendenza: 'Ultimi anni rispetto alla media 2001-2020', generato: 'Generato il' },
  EN: { pagina: 'Page', titolo: 'When to visit', numeri: 'In numbers', mese: 'Month', temp: 'Min / max', pioggia: 'Rain', sole: 'Sun', umidita: 'Humidity', voto: 'Score', migliore: 'Best time', evitare: 'Avoid', panoramica: 'Overview', web: 'Tips and advice from the web', esperienze: 'Travellers\' experiences', mesi: 'Month by month', portare: 'What to pack', orari: 'Best hours', avvertenze: 'Warnings', statistiche: 'Statistics', conclusioni: 'AI conclusions', fonti: 'Sources', aspettarsi: 'What to expect', eventi: 'What happens this month', alternativa: 'If it\'s not the right month', mare: 'Sea temperature', tendenza: 'Recent years vs the 2001-2020 average', generato: 'Generated on' },
  FR: { pagina: 'Page', titolo: 'Quand visiter', numeri: 'En chiffres', mese: 'Mois', temp: 'Min / max', pioggia: 'Pluie', sole: 'Soleil', umidita: 'Humidité', voto: 'Note', migliore: 'Meilleure période', evitare: 'À éviter', panoramica: 'Aperçu', web: 'Conseils et suggestions du web', esperienze: 'Expériences de voyageurs', mesi: 'Mois par mois', portare: 'Quoi emporter', orari: 'Meilleures heures', avvertenze: 'Avertissements', statistiche: 'Statistiques', conclusioni: 'Conclusions de l\'IA', fonti: 'Sources', aspettarsi: 'À quoi s\'attendre', eventi: 'Ce qui se passe ce mois-ci', alternativa: 'Si ce n\'est pas le bon mois', mare: 'Température de la mer', tendenza: 'Dernières années vs la moyenne 2001-2020', generato: 'Généré le' },
  ES: { pagina: 'Página', titolo: 'Cuándo visitar', numeri: 'En cifras', mese: 'Mes', temp: 'Mín / máx', pioggia: 'Lluvia', sole: 'Sol', umidita: 'Humedad', voto: 'Nota', migliore: 'Mejor época', evitare: 'A evitar', panoramica: 'Panorámica', web: 'Consejos y sugerencias de la web', esperienze: 'Experiencias de viajeros', mesi: 'Mes a mes', portare: 'Qué llevar', orari: 'Mejores horas', avvertenze: 'Advertencias', statistiche: 'Estadísticas', conclusioni: 'Conclusiones de la IA', fonti: 'Fuentes', aspettarsi: 'Qué esperar', eventi: 'Qué pasa este mes', alternativa: 'Si no es el mes adecuado', mare: 'Temperatura del mar', tendenza: 'Últimos años frente a la media 2001-2020', generato: 'Generado el' },
  DE: { pagina: 'Seite', titolo: 'Wann reisen', numeri: 'In Zahlen', mese: 'Monat', temp: 'Min / max', pioggia: 'Regen', sole: 'Sonne', umidita: 'Luftfeuchte', voto: 'Wert', migliore: 'Beste Zeit', evitare: 'Vermeiden', panoramica: 'Überblick', web: 'Tipps und Hinweise aus dem Web', esperienze: 'Erfahrungen von Reisenden', mesi: 'Monat für Monat', portare: 'Was mitnehmen', orari: 'Beste Tageszeiten', avvertenze: 'Hinweise', statistiche: 'Statistiken', conclusioni: 'Fazit der KI', fonti: 'Quellen', aspettarsi: 'Was zu erwarten ist', eventi: 'Was in diesem Monat los ist', alternativa: 'Falls es nicht der richtige Monat ist', mare: 'Meerestemperatur', tendenza: 'Letzte Jahre gegenüber dem Mittel 2001-2020', generato: 'Erstellt am' },
};

/** Il report «Quando visitare» (annuale o di un mese) come PDF; null se la lingua non è latina (niente glifi). */
export async function generaPdfClima(
  citta: string,
  dati: import('../climaIndex').DatiClima,
  report: import('../climaIndex').ReportClima | null,
  mese: import('../climaIndex').ReportMese | null,
  language: unknown,
): Promise<Blob | null> {
  const l = lingua(language);
  const campione = citta + (report?.sezioni.panoramica || '') + (mese?.sezioni.cosa_aspettarsi || '');
  if (haCaratteriNonLatini(campione)) return null;
  const [{ pdf }, { default: ClimaPdf }, React] = await Promise.all([
    import('@react-pdf/renderer'), import('./ClimaPdf'), import('react'),
  ]);
  const nomiMesi = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(l.toLowerCase(), { month: 'long' }).format(new Date(2000, i, 1)));
  const doc = React.createElement(ClimaPdf, { citta, dati, report, mese, nomiMesi, etichette: ET_CLIMA[l] });
  return numeraPagine(await pdf(doc as any).toBlob(), ET_CLIMA[l].pagina, 2);
}

export async function generaPdfMuseo(
  visit: import('../museumVisit').MuseumVisit,
  opere: Record<number, import('../museumVisit').ArtworkGuide>,
  mappe: import('../museumVisit').MuseumMap[] | undefined,
  language: unknown,
): Promise<Blob | null> {
  const l = lingua(language);
  const tappe = visit.guide?.tappe || [];
  const primaOpera = Object.values(opere)[0];
  const campione = String(visit.venue?.name || '') + String(tappe[0]?.perche || '') + String(primaOpera?.testo || '');
  if (haCaratteriNonLatini(campione)) return null;
  const [{ pdf }, { default: MuseumGuidaPdf }, React] = await Promise.all([
    import('@react-pdf/renderer'), import('./MuseumGuidaPdf'), import('react'),
  ]);
  const mappeConImmagine = (mappe || []).filter((m) => m.url);
  const immaginiMappe: Record<number, string> = {};
  const immaginiTappe: Record<number, string> = {};
  const misureTappe: Record<number, { w: number; h: number }> = {};
  let copertina: string | undefined;
  await Promise.all([
    ...mappeConImmagine.map(async (m) => {
      const d = await scaricaImmagine(m.url);
      if (d) immaginiMappe[m.indice] = d;
    }),
    ...tappe.map(async (t, i) => {
      const d = await scaricaFoto(t.foto);
      if (!d) return;
      immaginiTappe[i] = d.src;
      if (d.w > 0 && d.h > 0) misureTappe[i] = { w: d.w, h: d.h };
    }),
    (async () => { copertina = (await scaricaFoto(visit.venuePhoto))?.src; })(),
  ]);
  // LA GUIDA ESCE SEMPRE DA QUI (20/09/2026, committente: le guide dei musei
  // «DEVONO ESSERE graficamente e come contenuti uguali» al PDF impaginato).
  // Se una foto manda in errore il motore non si cade sulla stampa del
  // browser (un elenco senza foto, con pagine bianche in coda): si riprova
  // senza le foto delle opere, poi senza nessuna immagine. Stessa veste.
  const tentativi: Array<Partial<import('./MuseumGuidaPdf').MuseumPdfProps>> = [
    { immaginiMappe, immaginiTappe, misureTappe, copertina },
    { immaginiMappe, immaginiTappe: {}, misureTappe: {}, copertina },
    { immaginiMappe: {}, immaginiTappe: {}, misureTappe: {}, copertina: undefined },
  ];
  let ultimoErrore: unknown = null;
  for (let n = 0; n < tentativi.length; n++) {
    const immagini = tentativi[n];
    try {
      const doc = React.createElement(MuseumGuidaPdf, { visit, opere, mappe: mappeConImmagine, etichette: ET_MUSEO[l], ...immagini });
      // Dalla pagina 2: la copertina non porta numero (stesso schema della Guida Premium).
      return await numeraPagine(await pdf(doc as any).toBlob(), ET_MUSEO[l].pagina, 2);
    } catch (e) {
      ultimoErrore = e;
      console.warn(`[pdf] guida museo: tentativo ${n + 1} non riuscito`, e);
    }
  }
  throw ultimoErrore;
}

export async function generaPdfGuida(content: PremiumGuideContent, mediaManifest: Record<string, string>, language: unknown): Promise<Blob | null> {
  const l = lingua(language);
  if (haCaratteriNonLatini(String(content?.guida_titolo || '') + String(content?.introduzione || '').slice(0, 400))) return null;
  const [{ pdf }, { default: GuidaPremiumPdf }, React] = await Promise.all([
    import('@react-pdf/renderer'), import('./GuidaPremiumPdf'), import('react'),
  ]);
  // Solo foto del luogo: manifest della guida (per poi_id) o image_url del POI.
  const richieste: [string, string | undefined][] = [];
  for (const g of content.giorni || []) for (const p of g.pois || []) {
    richieste.push([p.poi_id, mediaManifest?.[p.poi_id] || p.image_url]);
  }
  // COPERTINA: la foto della CITTA' (committente 20/09/2026: «deve essere Londra, non un logo»). Mai la foto del
  // primo luogo che ne ha una (poteva essere un logo, una via qualunque): senza foto della citta' la copertina esce senza.
  const introValida = (u?: string) => (u && !/\.svg|flag|bandiera|logo|icon|locator|stripe|hex-/i.test(decodeURIComponent(u)) ? u : undefined);
  const cover = mediaManifest?.cover || mediaManifest?.copertina || introValida(mediaManifest?.citta_intro_1);
  const scaricate = await Promise.all([...richieste, ['cover', cover] as [string, string | undefined]].map(async ([k, u]) => [k, await scaricaFoto(u)] as const));
  const immagini: Record<string, string> = {};
  const misure: Record<string, { w: number; h: number }> = {};
  for (const [k, d] of scaricate) if (d) { immagini[k] = d.src; if (d.w > 0 && d.h > 0) misure[k] = { w: d.w, h: d.h }; }
  const doc = React.createElement(GuidaPremiumPdf, { content, immagini, misure, etichette: ET_GUIDA[l] });
  // Dalla pagina 2: la copertina non porta numero.
  return numeraPagine(await pdf(doc as any).toBlob(), ET_GUIDA[l].pagina, 2);
}
