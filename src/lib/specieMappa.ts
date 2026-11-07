// =====================================================================
// Specie sulla mappa — i tondini con la foto nel punto dell'avvistamento
//
// (11/10/2026, committente: «le specie devono apparire dove sono: se ci sono aree protette bene, altrimenti
// devono essere mostrate lo stesso»). Con il livello «aree protette» acceso ogni specie avvistata nel riquadro
// compare come un pin con la sua foto, DENTRO O FUORI dalle aree colorate, in tutto il mondo.
//
// Fonte: GBIF occurrence search (API pubblica, CORS aperto: si chiama dal browser, come l'EEA). Le licenze
// sono riga per riga e foto per foto — stessa regola di /api/biodiversita/vicino (server.ts): l'avvistamento E
// la sua foto devono essere CC0 / CC BY / CC BY-SA, mai NC. Senza foto sicura la specie non compare.
// Una specie = un pin (il primo avvistamento buono del riquadro): la mappa mostra CHE COSA vive lì, non ogni
// singola osservazione.
// =====================================================================

import { getApiUrl } from './api';

/** «Foto della specie» (non di questo avvistamento), per la riga dell'autore nella foto grande. */
export const FOTO_DELLA_SPECIE: Record<string, string> = {
  IT: 'foto della specie', EN: 'photo of the species', FR: "photo de l'espèce", ES: 'foto de la especie', DE: 'Foto der Art', RU: 'фото вида', ZH: '物种照片',
};

/**
 * LISTA ROSSA IUCN (11/10/2026, committente: «metti lista rossa»). GBIF porta la categoria dentro ogni avvistamento
 * (`iucnRedListCategory`), nella stessa risposta delle foto: nessuna chiamata in più. Si mostra solo quando dice
 * qualcosa — minacciata o quasi; «minor preoccupazione», «dati insufficienti» e «non valutata» restano senza
 * etichetta, altrimenti ogni passero avrebbe il suo bollino. Fonte da citare: IUCN Red List, via GBIF.
 */
export const LISTA_ROSSA: Record<string, { colore: string; nome: Record<string, string> }> = {
  EX: { colore: '#111827', nome: { IT: 'Estinta', EN: 'Extinct', FR: 'Éteinte', ES: 'Extinta', DE: 'Ausgestorben', RU: 'Исчезнувший вид', ZH: '灭绝' } },
  EW: { colore: '#4b5563', nome: { IT: 'Estinta in natura', EN: 'Extinct in the wild', FR: "Éteinte à l'état sauvage", ES: 'Extinta en estado silvestre', DE: 'In der Natur ausgestorben', RU: 'Исчезнувший в дикой природе', ZH: '野外灭绝' } },
  CR: { colore: '#b91c1c', nome: { IT: 'In pericolo critico', EN: 'Critically endangered', FR: 'En danger critique', ES: 'En peligro crítico', DE: 'Vom Aussterben bedroht', RU: 'На грани исчезновения', ZH: '极危' } },
  EN: { colore: '#dc2626', nome: { IT: 'In pericolo', EN: 'Endangered', FR: 'En danger', ES: 'En peligro', DE: 'Stark gefährdet', RU: 'Вымирающий вид', ZH: '濒危' } },
  VU: { colore: '#d97706', nome: { IT: 'Vulnerabile', EN: 'Vulnerable', FR: 'Vulnérable', ES: 'Vulnerable', DE: 'Gefährdet', RU: 'Уязвимый вид', ZH: '易危' } },
  NT: { colore: '#ca8a04', nome: { IT: 'Quasi minacciata', EN: 'Near threatened', FR: 'Quasi menacée', ES: 'Casi amenazada', DE: 'Potenziell gefährdet', RU: 'Близок к уязвимому положению', ZH: '近危' } },
};
/** Etichetta e colore della categoria, o null se non c'è niente da dire (LC, DD, NE, assente). */
export function listaRossa(categoria: string | null | undefined, lingua: string): { sigla: string; nome: string; colore: string } | null {
  const sigla = String(categoria || '').toUpperCase();
  const v = LISTA_ROSSA[sigla];
  if (!v) return null;
  return { sigla, nome: v.nome[String(lingua).toUpperCase()] || v.nome.EN, colore: v.colore };
}
const GRAVITA: Record<string, number> = { EX: 0, EW: 1, CR: 2, EN: 3, VU: 4, NT: 5 };

export interface SpecieSullaMappa {
  /** Categoria della Lista Rossa IUCN come la dà GBIF (CR, EN, VU, NT, LC…), null se assente. */
  lista_rossa: string | null;
  specie: string;
  regno: string | null;
  lat: number;
  lon: number;
  foto_url: string;
  /** Miniatura leggera per il pin quando la fonte la offre (iNaturalist), altrimenti la foto stessa. */
  foto_piccola: string;
  foto_autore: string | null;
  foto_fonte: string | null;
  data_avvistamento: string | null;
  /** true = la foto è della SPECIE (Wikimedia Commons), non di questo avvistamento. */
  foto_della_specie?: boolean;
}

interface MapBounds { south: number; west: number; north: number; east: number; }

const MAX_SPECIE = 90; // «cerca sempre di più»: erano 40, poi 60
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const memoria = new Map<string, { ts: number; specie: SpecieSullaMappa[] }>();
/** Categoria Lista Rossa per specie GBIF, ricordata per la sessione (null = chiesta, nessuna risposta). */
const categorie = new Map<number, string | null>();

function licenzaOk(url?: string | null): boolean {
  if (!url) return false;
  const s = String(url).toLowerCase();
  return s.includes('creativecommons.org/publicdomain') ||
    s.includes('creativecommons.org/licenses/by/') ||
    s.includes('creativecommons.org/licenses/by-sa/');
}

/**
 * I TAGLI DELLE FOTO (11/10/2026: sul telefono le foto del fumetto non comparivano — erano gli ORIGINALI di
 * iNaturalist, 1,4 MB l'uno in un riquadro di 50 px). iNaturalist serve la stessa foto in più tagli e Wikimedia
 * la ridimensiona nell'indirizzo: per un tondino o una miniatura basta il taglio piccolo, per la foto grande
 * quello da ~1.000 px. Mai l'originale.
 */
export function miniatura(url: string): string {
  const u = String(url || '').split('?utm_')[0]; // Wikimedia accoda il suo tracciamento: via
  if (/inaturalist/i.test(u)) return u.replace(/\/(original|large|medium)\.(jpe?g|png)/i, '/small.$2');
  if (/wikimedia\.org\/.*\/\d+px-/i.test(u)) return u.replace(/\/\d+px-/, '/160px-');
  return u;
}
export function fotoGrande(url: string): string {
  const u = String(url || '').split('?utm_')[0];
  return /inaturalist/i.test(u) ? u.replace(/\/original\.(jpe?g|png)/i, '/large.$1') : u;
}

/**
 * Le specie con foto libera avvistate nel riquadro, una per specie. Il riquadro è arrotondato a una griglia
 * (un ventesimo di grado) perché due viste quasi uguali usino la stessa risposta. Lancia se GBIF non risponde.
 */
export async function fetchSpecieSullaMappa(bounds: MapBounds): Promise<SpecieSullaMappa[]> {
  const g = 0.05;
  const s = Math.floor(bounds.south / g) * g, n = Math.ceil(bounds.north / g) * g;
  const w = Math.floor(bounds.west / g) * g, e = Math.ceil(bounds.east / g) * g;
  const chiave = `${s.toFixed(2)}_${w.toFixed(2)}_${n.toFixed(2)}_${e.toFixed(2)}`;
  const m = memoria.get(chiave);
  if (m && Date.now() - m.ts < CACHE_TTL_MS) return m.specie;

  const url = 'https://api.gbif.org/v1/occurrence/search'
    + `?decimalLatitude=${s.toFixed(4)},${n.toFixed(4)}&decimalLongitude=${w.toFixed(4)},${e.toFixed(4)}`
    + '&hasCoordinate=true&hasGeospatialIssue=false&mediaType=StillImage'
    + '&license=CC0_1_0&license=CC_BY_4_0&limit=300';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let risultati: any[] = [];
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`GBIF HTTP ${r.status}`);
    risultati = (await r.json())?.results || [];
  } finally {
    clearTimeout(timer);
  }

  const perSpecie = new Map<string, SpecieSullaMappa>();
  const chiavi = new Map<string, number>();
  for (const occ of risultati) {
    const lat = Number(occ.decimalLatitude), lon = Number(occ.decimalLongitude);
    if (!occ.species || !licenzaOk(occ.license) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (perSpecie.has(occ.species)) continue;
    // Un avvistamento con incertezza di chilometri non è «qui»: il pin starebbe nel posto sbagliato.
    if (Number(occ.coordinateUncertaintyInMeters) > 2000) continue;
    const foto = (occ.media || []).find((x: any) => x.type === 'StillImage' && x.identifier && licenzaOk(x.license));
    if (!foto) continue;
    if (occ.speciesKey) chiavi.set(occ.species, Number(occ.speciesKey));
    const grande = String(foto.identifier).replace(/^http:\/\//, 'https://');
    perSpecie.set(occ.species, {
      specie: occ.species, regno: occ.kingdom || null, lat, lon,
      foto_url: grande, foto_piccola: miniatura(grande),
      foto_autore: foto.creator || foto.rightsHolder || null,
      foto_fonte: foto.publisher || 'GBIF',
      data_avvistamento: occ.eventDate || null,
      lista_rossa: occ.iucnRedListCategory ? String(occ.iucnRedListCategory) : null,
    });
    if (perSpecie.size >= MAX_SPECIE) break;
  }
  // PIÙ SPECIE POSSIBILE (11/10/2026, committente: «prendi foto su internet», «di più specie che puoi»). Fuori da
  // Europa e Nord America le foto degli avvistamenti sono quasi tutte «non commerciale» e non si usano. Allora: gli
  // avvistamenti dei dati liberi (CC0 / CC BY: eBird, musei, monitoraggi) danno specie e punto, e la foto è quella
  // DELLA SPECIE da Wikimedia Commons (via Wikidata, licenza libera letta dal server). Senza foto, niente pin.
  if (perSpecie.size < MAX_SPECIE) {
    try {
      const c2 = new AbortController(); const t2 = setTimeout(() => c2.abort(), 20000);
      const r2 = await fetch('https://api.gbif.org/v1/occurrence/search'
        + `?decimalLatitude=${s.toFixed(4)},${n.toFixed(4)}&decimalLongitude=${w.toFixed(4)},${e.toFixed(4)}`
        + '&hasCoordinate=true&hasGeospatialIssue=false&license=CC0_1_0&license=CC_BY_4_0&limit=300', { signal: c2.signal });
      clearTimeout(t2);
      const altre = new Map<number, any>();
      for (const occ of ((r2.ok ? (await r2.json())?.results : []) || [])) {
        const lat = Number(occ.decimalLatitude), lon = Number(occ.decimalLongitude);
        const k = Number(occ.speciesKey);
        if (!occ.species || !k || perSpecie.has(occ.species) || altre.has(k) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (!licenzaOk(occ.license) || Number(occ.coordinateUncertaintyInMeters) > 2000 || !/^[A-Za-zÀ-ÿ×.\- ]{3,80}$/.test(occ.species)) continue;
        altre.set(k, occ);
        if (altre.size >= 110) break;
      }
      if (altre.size) {
        const elenco = [...altre.entries()].map(([k, occ]) => `${k}:${occ.species}`).join('|');
        const rf = await fetch(getApiUrl(`/api/biodiversita/foto-specie?s=${encodeURIComponent(elenco)}`));
        const foto = rf.ok ? ((await rf.json())?.foto || {}) : {};
        for (const [k, occ] of altre) {
          const f = foto[String(k)];
          if (!f?.foto_url || perSpecie.size >= MAX_SPECIE) continue;
          chiavi.set(occ.species, k);
          perSpecie.set(occ.species, {
            specie: occ.species, regno: occ.kingdom || null, lat: Number(occ.decimalLatitude), lon: Number(occ.decimalLongitude),
            foto_url: f.foto_url, foto_piccola: f.foto_piccola || f.foto_url, foto_autore: f.foto_autore || null,
            foto_fonte: 'Wikimedia Commons', data_avvistamento: occ.eventDate || null,
            lista_rossa: occ.iucnRedListCategory ? String(occ.iucnRedListCategory) : null, foto_della_specie: true,
          });
        }
      }
    } catch { /* GBIF o il server giù: restano le specie con la foto dell'avvistamento */ }
  }
  // Molti avvistamenti arrivano SENZA la categoria (il ghepardo del Masai Mara, VU, usciva vuoto): per quelli si
  // chiede la scheda della specie a GBIF, in parallelo, con un tetto di tempo, e ci si ricorda la risposta.
  await Promise.all([...perSpecie.values()].filter((s) => !s.lista_rossa && chiavi.get(s.specie)).slice(0, MAX_SPECIE).map(async (s) => {
    const k = chiavi.get(s.specie) as number;
    if (!categorie.has(k)) {
      try {
        const c = new AbortController(); const tm = setTimeout(() => c.abort(), 6000);
        const r = await fetch(`https://api.gbif.org/v1/species/${k}/iucnRedListCategory`, { signal: c.signal });
        clearTimeout(tm);
        categorie.set(k, r.ok ? String((await r.json())?.code || '') || null : null);
      } catch { categorie.set(k, null); }
    }
    s.lista_rossa = categorie.get(k) || null;
  }));
  // Le minacciate per prime: se nel riquadro ci sono più specie del tetto, non devono essere loro a restare fuori.
  const specie = [...perSpecie.values()]
    .sort((a, b) => (GRAVITA[String(a.lista_rossa)] ?? 9) - (GRAVITA[String(b.lista_rossa)] ?? 9))
    .slice(0, MAX_SPECIE);
  memoria.set(chiave, { ts: Date.now(), specie });
  return specie;
}
