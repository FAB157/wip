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
import { haCaratteriNonLatini } from './pulisci';

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

type Lang = 'IT' | 'EN' | 'FR' | 'ES' | 'DE';
const lingua = (l: unknown): Lang => {
  const u = String(l || 'IT').toUpperCase().slice(0, 2);
  return (['IT', 'EN', 'FR', 'ES', 'DE'] as Lang[]).includes(u as Lang) ? (u as Lang) : 'IT';
};

const ET_GUIDA: Record<Lang, import('./GuidaPremiumPdf').GuidaPdfEtichette> = {
  IT: { guida: 'Guida Premium', sommario: 'Sommario', giorno: 'Giorno', introduzione: 'Introduzione', storia: 'Storia e identità', cultura: 'Cultura e tradizioni', consigliPratici: 'Consigli pratici', curiosita: 'Curiosità', dettaglio: 'Dettaglio storico e tecnico', consiglioInsider: 'Consiglio insider', infoUtili: 'Info utili', orari: 'Orari', periodoMigliore: 'Periodo migliore', prezzo: 'Prezzo', telefono: 'Telefono', sito: 'Sito web', piatti: 'Da assaggiare', indirizzo: 'Indirizzo', comeArrivare: 'Come arrivare', pagina: 'Pagina', stile: 'Guida Premium' },
  EN: { guida: 'Premium Guide', sommario: 'Contents', giorno: 'Day', introduzione: 'Introduction', storia: 'History and identity', cultura: 'Culture and traditions', consigliPratici: 'Practical tips', curiosita: 'Curiosities', dettaglio: 'Historical and technical detail', consiglioInsider: 'Insider tip', infoUtili: 'Useful info', orari: 'Opening hours', periodoMigliore: 'Best time', prezzo: 'Price', telefono: 'Phone', sito: 'Website', piatti: 'What to taste', indirizzo: 'Address', comeArrivare: 'Getting there', pagina: 'Page', stile: 'Premium Guide' },
  FR: { guida: 'Guide Premium', sommario: 'Sommaire', giorno: 'Jour', introduzione: 'Introduction', storia: 'Histoire et identité', cultura: 'Culture et traditions', consigliPratici: 'Conseils pratiques', curiosita: 'Curiosités', dettaglio: 'Détail historique et technique', consiglioInsider: 'Conseil d’initié', infoUtili: 'Infos utiles', orari: 'Horaires', periodoMigliore: 'Meilleure période', prezzo: 'Prix', telefono: 'Téléphone', sito: 'Site web', piatti: 'À goûter', indirizzo: 'Adresse', comeArrivare: 'Y aller', pagina: 'Page', stile: 'Guide Premium' },
  ES: { guida: 'Guía Premium', sommario: 'Índice', giorno: 'Día', introduzione: 'Introducción', storia: 'Historia e identidad', cultura: 'Cultura y tradiciones', consigliPratici: 'Consejos prácticos', curiosita: 'Curiosidades', dettaglio: 'Detalle histórico y técnico', consiglioInsider: 'Consejo de experto', infoUtili: 'Información útil', orari: 'Horarios', periodoMigliore: 'Mejor época', prezzo: 'Precio', telefono: 'Teléfono', sito: 'Sitio web', piatti: 'Para probar', indirizzo: 'Dirección', comeArrivare: 'Cómo llegar', pagina: 'Página', stile: 'Guía Premium' },
  DE: { guida: 'Premium-Guide', sommario: 'Inhalt', giorno: 'Tag', introduzione: 'Einführung', storia: 'Geschichte und Identität', cultura: 'Kultur und Traditionen', consigliPratici: 'Praktische Tipps', curiosita: 'Wissenswertes', dettaglio: 'Historische und technische Details', consiglioInsider: 'Insider-Tipp', infoUtili: 'Nützliche Infos', orari: 'Öffnungszeiten', periodoMigliore: 'Beste Zeit', prezzo: 'Preis', telefono: 'Telefon', sito: 'Website', piatti: 'Zum Probieren', indirizzo: 'Adresse', comeArrivare: 'Anfahrt', pagina: 'Seite', stile: 'Premium-Guide' },
};

const ET_ITINERARIO: Record<Lang, import('./ItinerarioPdf').ItinerarioPdfEtichette> = {
  IT: { pagina: 'Pagina', giorno: 'Giorno', giorni: 'giorni', giornoSingolo: 'giorno', curatoDa: 'di viaggio curato da World in Pocket', intro: 'Benvenuto nella tua guida di viaggio curata da World in Pocket. Questo itinerario ti condurrà attraverso una selezione speciale di tappe e punti di interesse. Usa l’app «World in Pocket» durante la visita per sbloccare le audioguide interattive e ascoltare la storia di questi luoghi dal vivo.', consiglioGuida: 'Consiglio della guida', tempoVisita: 'Tempo di visita', spostamento: 'Spostamento', budgetGiorno: 'Budget della giornata', totaleGiorno: 'Totale giorno', consigli: 'Consigli', suggerimenti: 'Suggerimenti extra', precauzioni: 'Precauzioni', zoneDaEvitare: 'Zone da evitare', totaleViaggio: 'Totale stimato viaggio', mappa: 'Mappa del percorso' },
  EN: { pagina: 'Page', giorno: 'Day', giorni: 'days', giornoSingolo: 'day', curatoDa: 'trip curated by World in Pocket', intro: 'Welcome to your travel guide curated by World in Pocket. This itinerary leads you through a special selection of stops and points of interest. Use the “World in Pocket” app during your visit to unlock interactive audio guides and hear the story of these places live.', consiglioGuida: 'Guide’s advice', tempoVisita: 'Visit time', spostamento: 'Transfer', budgetGiorno: 'Budget of the day', totaleGiorno: 'Day total', consigli: 'Tips', suggerimenti: 'Extra suggestions', precauzioni: 'Precautions', zoneDaEvitare: 'Areas to avoid', totaleViaggio: 'Estimated trip total', mappa: 'Route map' },
  FR: { pagina: 'Page', giorno: 'Jour', giorni: 'jours', giornoSingolo: 'jour', curatoDa: 'de voyage organisé par World in Pocket', intro: 'Bienvenue dans votre guide de voyage conçu par World in Pocket. Cet itinéraire vous mène à travers une sélection spéciale d’étapes et de points d’intérêt. Utilisez l’application « World in Pocket » pendant votre visite pour débloquer les audioguides interactifs.', consiglioGuida: 'Conseil du guide', tempoVisita: 'Durée de visite', spostamento: 'Déplacement', budgetGiorno: 'Budget de la journée', totaleGiorno: 'Total du jour', consigli: 'Conseils', suggerimenti: 'Suggestions', precauzioni: 'Précautions', zoneDaEvitare: 'Zones à éviter', totaleViaggio: 'Total estimé du voyage', mappa: 'Carte du parcours' },
  ES: { pagina: 'Página', giorno: 'Día', giorni: 'días', giornoSingolo: 'día', curatoDa: 'de viaje seleccionado por World in Pocket', intro: 'Bienvenido a tu guía de viaje seleccionada por World in Pocket. Este itinerario te lleva por una selección especial de paradas y puntos de interés. Usa la aplicación «World in Pocket» durante tu visita para desbloquear las audioguías interactivas.', consiglioGuida: 'Consejo de la guía', tempoVisita: 'Tiempo de visita', spostamento: 'Traslado', budgetGiorno: 'Presupuesto del día', totaleGiorno: 'Total del día', consigli: 'Consejos', suggerimenti: 'Sugerencias', precauzioni: 'Precauciones', zoneDaEvitare: 'Zonas a evitar', totaleViaggio: 'Total estimado del viaje', mappa: 'Mapa del recorrido' },
  DE: { pagina: 'Seite', giorno: 'Tag', giorni: 'Tage', giornoSingolo: 'Tag', curatoDa: 'Reise, kuratiert von World in Pocket', intro: 'Willkommen zu deinem Reiseführer, kuratiert von World in Pocket. Diese Route führt dich zu einer besonderen Auswahl von Stationen und Sehenswürdigkeiten. Nutze die App „World in Pocket“ während des Besuchs, um interaktive Audioguides freizuschalten.', consiglioGuida: 'Tipp des Guides', tempoVisita: 'Besuchsdauer', spostamento: 'Transfer', budgetGiorno: 'Tagesbudget', totaleGiorno: 'Tagessumme', consigli: 'Tipps', suggerimenti: 'Weitere Hinweise', precauzioni: 'Vorsichtsmaßnahmen', zoneDaEvitare: 'Zu meidende Gegenden', totaleViaggio: 'Geschätzte Reisekosten', mappa: 'Routenkarte' },
};

/** Una foto come data URL, o undefined se non arriva entro 12 s / non e' un'immagine. */
async function scaricaImmagine(url?: string | null): Promise<string | undefined> {
  const u = String(url || '').trim();
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

async function ricodifica(b: Blob): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(b);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')?.drawImage(bmp, 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  } catch { return undefined; }
}

const coordTappa = (t: any): { lat: number; lon: number } | null => {
  const lat = Number(t?.coordinate?.lat ?? t?.lat);
  const lon = Number(t?.coordinate?.lng ?? t?.coordinate?.lon ?? t?.lng ?? t?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : null;
};

/** La mappa del percorso: immagine statica Mapbox con i numeri delle tappe. */
async function mappaStatica(plan: any): Promise<string | undefined> {
  const token = (import.meta as any).env?.VITE_MAPBOX_TOKEN;
  if (!token) return undefined;
  const punti: { lat: number; lon: number }[] = [];
  for (const g of plan?.giorni || []) for (const t of g?.tappe || []) { const c = coordTappa(t); if (c) punti.push(c); }
  if (!punti.length) return undefined;
  const pin = punti.slice(0, 40).map((p, i) => `pin-s-${Math.min(i + 1, 99)}+1e3a8a(${p.lon.toFixed(5)},${p.lat.toFixed(5)})`).join(',');
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/auto/1000x760@2x?padding=70&access_token=${encodeURIComponent(token)}`;
  return scaricaImmagine(url);
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
  const cover = mediaManifest?.cover || mediaManifest?.copertina || richieste.find(([, u]) => u)?.[1];
  const scaricate = await Promise.all([...richieste, ['cover', cover] as [string, string | undefined]].map(async ([k, u]) => [k, await scaricaImmagine(u)] as const));
  const immagini: Record<string, string> = {};
  for (const [k, d] of scaricate) if (d) immagini[k] = d;
  const doc = React.createElement(GuidaPremiumPdf, { content, immagini, etichette: ET_GUIDA[l] });
  // Dalla pagina 2: la copertina non porta numero.
  return numeraPagine(await pdf(doc as any).toBlob(), ET_GUIDA[l].pagina, 2);
}
