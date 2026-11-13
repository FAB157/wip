// =====================================================================
// Confini delle denominazioni d'origine, per il layer Vino e Gusto
//
// Dal nostro /api/denominazioni/aree (tabella denominazioni_geometrie):
// USA = confini ufficiali delle AVA (UC Davis AVA Project, CC0, da 27 CFR
// part 9); UE = aree DERIVATE dai confini dei comuni collegati su Wikidata,
// etichettate come indicative. Geometrie già semplificate a ~100 m.
// Cache in memoria per cella di 0,5° e per sessione: una zona vinicola non
// cambia mentre si naviga.
// =====================================================================
import { getApiUrl } from './api';

export interface AreaDenominazione {
  id: string;
  nome: string;
  tipo: string | null;
  prodotto: string | null;
  /** «Classe 1.3. Formaggi», «Vino», «Peynirler»…: decide il colore della zona. */
  categoria?: string | null;
  /** Gli altri prodotti con lo stesso identico confine (stesso comune o provincia). */
  altri?: Array<{ id: string; nome: string; tipo: string | null; prodotto: string | null; categoria?: string | null; url: string | null }>;
  paese: string | null;
  url: string | null;
  fonte: string;
  qualita: 'ufficiale' | 'derivata';
  attribuzione: string | null;
  area_kmq: number | null;
  geom: any;
}

/**
 * LA FAMIGLIA DI UN PRODOTTO, per il colore della zona (10/10/2026, committente: «le zone colorano tutto di rosso?
 * anche i formaggi?»). Il rosso è del vino; ogni famiglia di cibo ha il suo colore. Si legge dalla categoria del
 * registro (UE, PAT italiani, registro turco) e, dove la categoria è generica, dal nome.
 */
export type FamigliaGusto = 'vino' | 'formaggi' | 'olio' | 'carni' | 'cibo';
export const COLORI_GUSTO: Record<FamigliaGusto, { bordo: string; pieno: string; emoji: string; nome: Record<string, string> }> = {
  vino: { bordo: '#7f1d1d', pieno: '#9f1239', emoji: '🍷', nome: { IT: 'Vino', EN: 'Wine', FR: 'Vin', ES: 'Vino', DE: 'Wein', RU: 'Вино', ZH: '葡萄酒' } },
  formaggi: { bordo: '#a16207', pieno: '#facc15', emoji: '🧀', nome: { IT: 'Formaggio', EN: 'Cheese', FR: 'Fromage', ES: 'Queso', DE: 'Käse', RU: 'Сыр', ZH: '奶酪' } },
  olio: { bordo: '#3f6212', pieno: '#65a30d', emoji: '🫒', nome: { IT: 'Olio', EN: 'Olive oil', FR: 'Huile d’olive', ES: 'Aceite', DE: 'Olivenöl', RU: 'Оливковое масло', ZH: '橄榄油' } },
  carni: { bordo: '#9a3412', pieno: '#ea580c', emoji: '🥓', nome: { IT: 'Salumi e carni', EN: 'Cured meats', FR: 'Charcuterie et viandes', ES: 'Embutidos y carnes', DE: 'Wurst und Fleisch', RU: 'Мясные продукты', ZH: '肉制品' } },
  cibo: { bordo: '#92400e', pieno: '#d97706', emoji: '🍽️', nome: { IT: 'Prodotto tipico', EN: 'Local food', FR: 'Produit du terroir', ES: 'Producto típico', DE: 'Regionale Spezialität', RU: 'Местный продукт', ZH: '地方特产' } },
};
/** «Vino», «Formaggio»… nella lingua dell'utente (inglese se manca). */
export const nomeFamigliaGusto = (f: FamigliaGusto, lingua: string): string => COLORI_GUSTO[f].nome[String(lingua).toUpperCase()] || COLORI_GUSTO[f].nome.EN;
export function famigliaGusto(a: { prodotto?: string | null; categoria?: string | null; nome?: string | null }): FamigliaGusto {
  if (String(a.prodotto || '').toLowerCase() === 'vino') return 'vino';
  const t = `${a.categoria || ''} · ${a.nome || ''}`.toLowerCase();
  if (/formagg|cheese|fromage|queso|queijo|käse|kase|peynir|pecorino|caciotta|casciotta|ricotta|τυρ|φέτα/.test(t)) return 'formaggi';
  if (/\boli\b|olio|olive oil|huile|aceite|azeite|zeytinyağ|ελαι|grassi \(/.test(t)) return 'olio';
  if (/carn[ei]|prosciutto|salam|salum|salsicc|coppa|lardo|speck|mortadella|jam[oó]n|chorizo|et ürün|sucu|meat|viande|wurst/.test(t)) return 'carni';
  return 'cibo';
}

const ORDINE_FAMIGLIE: FamigliaGusto[] = ['vino', 'formaggi', 'olio', 'carni', 'cibo'];

/** Le famiglie presenti in una zona (il suo prodotto e gli `altri` sullo stesso confine), in ordine fisso. */
export function famiglieDellaZona(a: AreaDenominazione): FamigliaGusto[] {
  const viste = new Set<FamigliaGusto>([famigliaGusto(a), ...(a.altri || []).map((x) => famigliaGusto(x))]);
  return ORDINE_FAMIGLIE.filter((f) => viste.has(f));
}

/**
 * IL RIEMPIMENTO DI UNA ZONA (10/10/2026, committente: «quando una zona ha due prodotti, vino e formaggio?»).
 * Una famiglia sola → il suo colore. Più famiglie → STRISCE diagonali, una per famiglia: un comune col vino e
 * col formaggio è rosso e giallo, non del colore di chi capita primo nell'elenco. Le strisce sono un <pattern>
 * SVG messo una volta nel documento (Leaflet scrive `fill="url(#…)"` così com'è); senza documento, o se
 * qualcosa va storto, resta il colore della prima famiglia.
 */
export function riempimentoGusto(famiglie: FamigliaGusto[]): string {
  const prima = COLORI_GUSTO[famiglie[0] || 'cibo'].pieno;
  if (famiglie.length < 2 || typeof document === 'undefined') return prima;
  try {
    const id = `wip-gusto-${famiglie.join('-')}`;
    if (!document.getElementById(id)) {
      const NS = 'http://www.w3.org/2000/svg';
      let svg = document.getElementById('wip-gusto-defs') as unknown as SVGSVGElement | null;
      if (!svg) {
        svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
        svg.setAttribute('id', 'wip-gusto-defs');
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';
        svg.appendChild(document.createElementNS(NS, 'defs'));
        document.body.appendChild(svg);
      }
      const LARGA = 9;   // px di ogni striscia
      const p = document.createElementNS(NS, 'pattern');
      p.setAttribute('id', id);
      p.setAttribute('patternUnits', 'userSpaceOnUse');
      p.setAttribute('width', String(LARGA * famiglie.length));
      p.setAttribute('height', String(LARGA * famiglie.length));
      p.setAttribute('patternTransform', 'rotate(45)');
      famiglie.forEach((f, i) => {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(i * LARGA)); r.setAttribute('y', '0');
        r.setAttribute('width', String(LARGA)); r.setAttribute('height', String(LARGA * famiglie.length));
        r.setAttribute('fill', COLORI_GUSTO[f].pieno);
        p.appendChild(r);
      });
      svg.querySelector('defs')!.appendChild(p);
    }
    return `url(#${id})`;
  } catch {
    return prima;
  }
}

const memoria = new Map<string, AreaDenominazione[]>();

export async function fetchAreeDenominazioni(b: { south: number; west: number; north: number; east: number }): Promise<AreaDenominazione[]> {
  // Cella fissa di 0,5° attorno al centro: la stessa risposta serve a molti pan
  const cLat = Math.round(((b.south + b.north) / 2) * 2) / 2;
  const cLon = Math.round(((b.west + b.east) / 2) * 2) / 2;
  const halfLat = Math.max(0.35, (b.north - b.south) / 2 + 0.05);
  const halfLon = Math.max(0.5, (b.east - b.west) / 2 + 0.05);
  // «v2»: la risposta ora porta categoria e prodotti raggruppati per confine.
  const chiave = `v2_${cLat}_${cLon}_${halfLat.toFixed(1)}_${halfLon.toFixed(1)}`;
  const m = memoria.get(chiave);
  if (m) return m;
  try {
    const p = new URLSearchParams({
      n: (cLat + halfLat).toFixed(3), s: (cLat - halfLat).toFixed(3),
      // (10/10/2026) 60 → 300: la RPC le dà dalla PIÙ PICCOLA, quindi il tetto tagliava proprio le zone
      // grandi (in Emilia 39 su 99: Prosciutto di Parma, Aceto di Modena, Radicchio di Verona…).
      e: (cLon + halfLon).toFixed(3), w: (cLon - halfLon).toFixed(3), limit: '300',
    });
    const r = await fetch(getApiUrl(`/api/denominazioni/aree?${p}`), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const j = await r.json();
    const aree: AreaDenominazione[] = Array.isArray(j?.aree) ? j.aree : [];
    memoria.set(chiave, aree);
    return aree;
  } catch {
    return [];
  }
}
