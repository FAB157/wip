/**
 * PACCHETTO OFFLINE DELLA VISITA A UN MUSEO (10/09/2026).
 *
 * Richiesta del committente: «user può scaricare la sera prima dal wifi
 * dell'hotel tutto quello che il giorno dopo farà». Per il museo il pacchetto
 * completo è: il percorso, l'audioguida di OGNI opera, le foto delle opere.
 * Il giorno dopo, dentro le sale dove la rete non arriva, tutto funziona.
 *
 * DUE REGOLE, entrambe volute dal committente:
 * 1. Va nella STESSA scheda dei download (registro unico `downloads`), accanto
 *    a itinerari, zone e audioguide: non un elenco a parte.
 * 2. Quello che è scaricato è dell'utente e NON SI RIPAGA. Le audioguide del
 *    pacchetto si consumano una volta sola, quando si scaricano; riascoltarle
 *    sul posto, anche giorni dopo, non tocca il pass né i crediti.
 */
import { db } from './db';
import { registraDownload, rimuoviDownload, leggiDownload } from './downloadsRegistry';
import { MuseumVisit, VenueTappa, ArtworkGuide, fetchArtworkGuide, tappeAttive, ARCHIVIO_MUSEI_KEY } from './museumVisit';
import { Language } from './i18n';

/** Le audioguide scaricate, per (museo, opera, lingua). La chiave vive in
 *  museumVisit.ts, che la legge per riconoscere la seconda visita. */
const CHIAVE_ARCHIVIO = ARCHIVIO_MUSEI_KEY;

export type ArchivioMuseo = {
  venueKey: string;
  venueName: string;
  language: string;
  guide: MuseumVisit['guide'];
  /** Testo completo per ogni opera, indicizzato per nome normalizzato. */
  opere: Record<string, ArtworkGuide>;
  scaricatoIl: number;
  /** Foto del luogo, per il cerchio nell'elenco delle visite conservate. */
  venuePhotoIcon?: string;
  /** Ultima volta che ci si è stati: ordina l'elenco «le tue visite». */
  visitatoIl?: number;
};

const normalizza = (s: any) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function leggiTutto(): Record<string, ArchivioMuseo> {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_ARCHIVIO) || '{}') || {};
  } catch {
    return {};
  }
}

function scriviTutto(v: Record<string, ArchivioMuseo>) {
  try { localStorage.setItem(CHIAVE_ARCHIVIO, JSON.stringify(v)); } catch { /* storage pieno */ }
}

const chiaveArchivio = (venueKey: string, lang: string) => `${venueKey}::${String(lang).toUpperCase()}`;

/** Il museo è già scaricato in questa lingua? */
export function museoScaricato(venueKey: string, lang: string): ArchivioMuseo | null {
  return leggiTutto()[chiaveArchivio(venueKey, lang)] || null;
}

/**
 * L'audioguida di un'opera dall'archivio, se c'è. È QUESTA la funzione che
 * rende gratuito il riascolto: chi ha scaricato non ripaga, perché non si
 * chiama nemmeno il server.
 */
export function operaDallArchivio(venueKey: string, lang: string, nomeOpera: string): ArtworkGuide | null {
  const a = museoScaricato(venueKey, lang);
  if (!a) return null;
  const k = normalizza(nomeOpera);
  if (a.opere[k]) return a.opere[k];
  // Il titolo può differire di poco fra percorso e scheda.
  const vicino = Object.keys(a.opere).find(x => x === k || (x.length > 6 && k.includes(x)) || (k.length > 6 && x.includes(k)));
  return vicino ? a.opere[vicino] : null;
}

/**
 * TUTTO QUELLO CHE ASCOLTI RESTA (11/09/2026, richiesta del committente:
 * «deve essere tutto salvato e riutilizzabile»).
 *
 * Fino a ieri l'archivio si riempiva solo premendo «scarica tutto». Chi
 * invece visitava e basta — apriva sei audioguide girando per le sale — la
 * sera non aveva più niente: la visita vive in localStorage e scade dopo sei
 * ore. Cento crediti spesi al mattino e in mano nulla.
 *
 * Ora ogni audioguida che si apre finisce nello stesso archivio del
 * pacchetto offline, man mano. Le conseguenze sono tre, e sono il punto:
 *  - riascoltare è gratis per sempre, perché `operaDallArchivio` risponde
 *    prima che si pensi a chiamare il server;
 *  - la visita si riapre anche dopo giorni, quando quella «in corso» è
 *    scaduta da un pezzo;
 *  - chi ha ascoltato mezza collezione si ritrova mezzo pacchetto già
 *    scaricato, e «scarica tutto» finisce il lavoro senza rifarlo.
 * È lo stesso archivio, la stessa scheda dei download: non un secondo posto
 * dove cercare le proprie cose.
 */
export function conservaVisita(visit: MuseumVisit, language: Language): void {
  const archivio = leggiTutto();
  const chiave = chiaveArchivio(visit.venueKey, language);
  const gia = archivio[chiave];
  archivio[chiave] = {
    venueKey: visit.venueKey,
    venueName: visit.venue.name,
    language: String(language).toUpperCase(),
    // Il percorso più ricco vince: se si erano aggiunte opere minori, non si
    // torna indietro a quello di partenza.
    guide: (visit.guide?.tappe?.length || 0) >= (gia?.guide?.tappe?.length || 0) ? visit.guide : gia.guide,
    opere: gia?.opere || {},
    scaricatoIl: gia?.scaricatoIl || Date.now(),
    ...(visit.venuePhotoIcon ? { venuePhotoIcon: visit.venuePhotoIcon } : (gia?.venuePhotoIcon ? { venuePhotoIcon: gia.venuePhotoIcon } : {})),
    visitatoIl: Date.now(),
  };
  scriviTutto(archivio);
}

/** Un'audioguida appena ascoltata entra nell'archivio: non si ripagherà più. */
export function conservaOpera(venueKey: string, language: Language, nomeOpera: string, guida: ArtworkGuide): void {
  const archivio = leggiTutto();
  const chiave = chiaveArchivio(venueKey, language);
  const gia = archivio[chiave];
  if (!gia) return; // La visita si conserva per prima: senza di lei non c'è dove metterla.
  gia.opere = { ...gia.opere, [normalizza(nomeOpera)]: guida };
  gia.visitatoIl = Date.now();
  archivio[chiave] = gia;
  scriviTutto(archivio);
}

/**
 * Le visite conservate, dalla più recente. È l'elenco che si mostra sotto
 * «qui vicino»: sono cose già pagate, si riaprono senza toccare il server.
 */
export function visiteConservate(language?: Language): ArchivioMuseo[] {
  const L = language ? String(language).toUpperCase() : null;
  return Object.values(leggiTutto())
    .filter(a => !L || a.language === L)
    .sort((a, b) => (b.visitatoIl || b.scaricatoIl || 0) - (a.visitatoIl || a.scaricatoIl || 0));
}

/** Quante audioguide di quel museo sono già in archivio (quindi gratis). */
export function opereInArchivio(venueKey: string, language: Language): number {
  const a = museoScaricato(venueKey, language);
  return a ? Object.keys(a.opere || {}).length : 0;
}

/**
 * LE PRIME OPERE, SCARICATE DA SOLE ALL'INGRESSO (11/09/2026, richiesta del
 * committente). All'ingresso il segnale c'è; alla seconda sala no — muri
 * spessi, niente Wi-Fi. Il tasto «scarica tutto» esiste ma nessuno lo preme
 * prima di entrare. Quindi, appena la visita si apre con la rete, si
 * scaricano da sole le prime opere del percorso (testo e foto), nell'ordine
 * in cui si visiteranno, senza chiedere niente.
 *
 * Costa al visitatore solo quello che avrebbe speso comunque: il pass conta
 * una generazione VERA, non un riascolto, e queste sono le opere che
 * ascolterà per prime. Otto e non venti: la coda del percorso la scarica
 * «scarica tutto», che salta quelle già in archivio.
 * Si ferma subito se il pass manca o è esaurito: non insiste e non annoia.
 */
export async function prescaricaPrimeOpere(
  visit: MuseumVisit,
  language: Language,
  quante = 8,
  onProgress?: (fatte: number, totali: number) => void,
  stile: '' | 'bambini' = '',
): Promise<number> {
  const attive = tappeAttive(visit);
  const tappe: VenueTappa[] = (visit.guide?.tappe || []).filter((t, k) => attive.has(k) && !t.soloCollezione).slice(0, quante);
  if (!tappe.length) return 0;
  // La visita deve essere in archivio prima delle sue opere.
  if (!museoScaricato(visit.venueKey, language)) conservaVisita(visit, language);
  let fatte = 0;
  for (let i = 0; i < tappe.length; i++) {
    const t = tappe[i];
    onProgress?.(i, tappe.length);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
    // Già in archivio: gratis, e niente da fare.
    if (!stile && operaDallArchivio(visit.venueKey, language, t.nome)) { fatte++; continue; }
    const resp = await fetchArtworkGuide({
      artwork: t.nomeFonte || t.nome,
      venueName: visit.venue.name,
      artist: t.autore || null,
      room: t.dove || null,
      language,
      ...(stile ? { stile } : {}),
    });
    if (resp && resp.ok === true) {
      if (!stile) conservaOpera(visit.venueKey, language, t.nome, resp.guide);
      fatte++;
    } else if (resp && resp.ok === false && (resp.reason === 'pass_exhausted' || resp.reason === 'needs_pass')) {
      break;
    }
    // Le foto entrano nella cache del browser: si vedono anche senza rete.
    for (const url of [t.fotoIcona, t.foto]) {
      if (!url) continue;
      try { await fetch(url, { mode: 'cors' }); } catch { /* foto saltata */ }
    }
  }
  onProgress?.(tappe.length, tappe.length);
  return fatte;
}

export type EsitoPacchettoMuseo = {
  opere: number;
  opereTotali: number;
  foto: number;
  bytes: number;
  mancanti: string[];
};

/**
 * Scarica il pacchetto completo: tutte le audioguide del percorso e le foto.
 * `onProgress(fatte, totali)` per la barra. Le opere che il server non sa
 * raccontare (senza fonti) vengono elencate in `mancanti`: si scarica quello
 * che c'è, non si blocca tutto per una.
 */
export async function scaricaPacchettoMuseo(
  visit: MuseumVisit,
  language: Language,
  onProgress?: (fatte: number, totali: number) => void,
): Promise<EsitoPacchettoMuseo> {
  const tappe: VenueTappa[] = visit.guide?.tappe || [];
  const esito: EsitoPacchettoMuseo = { opere: 0, opereTotali: tappe.length, foto: 0, bytes: 0, mancanti: [] };
  const archivio = leggiTutto();
  const chiave = chiaveArchivio(visit.venueKey, language);
  const gia = archivio[chiave];
  const opere: Record<string, ArtworkGuide> = { ...(gia?.opere || {}) };

  for (let i = 0; i < tappe.length; i++) {
    const t = tappe[i];
    onProgress?.(i, tappe.length);
    const k = normalizza(t.nome);
    // Già in archivio: non si riscarica e NON si ripaga.
    if (opere[k]) { esito.opere++; continue; }
    const resp = await fetchArtworkGuide({
      artwork: t.nomeFonte || t.nome,
      venueName: visit.venue.name,
      artist: t.autore || null,
      room: t.dove || null,
      language,
    });
    if (resp && resp.ok === true) {
      opere[k] = resp.guide;
      esito.opere++;
      esito.bytes += (resp.guide.testo || '').length * 2;
    } else {
      esito.mancanti.push(t.nome);
      // Pass esaurito o servizio negato: inutile insistere sulle altre.
      if (resp && resp.ok === false && (resp.reason === 'pass_exhausted' || resp.reason === 'needs_pass')) break;
    }
  }
  onProgress?.(tappe.length, tappe.length);

  // Le foto: si scaricano nella cache del browser, così le mostra anche
  // offline. Una foto che non arriva non è un errore.
  for (const t of tappe) {
    for (const url of [t.foto, t.fotoIcona]) {
      if (!url) continue;
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (r.ok) { esito.foto++; esito.bytes += Number(r.headers.get('content-length') || 0) || 40_000; }
      } catch { /* foto saltata */ }
    }
  }

  archivio[chiave] = {
    venueKey: visit.venueKey,
    venueName: visit.venue.name,
    language: String(language).toUpperCase(),
    guide: visit.guide,
    opere,
    scaricatoIl: Date.now(),
  };
  scriviTutto(archivio);

  // Registro unico: la visita compare nella STESSA scheda dei download,
  // accanto a itinerari e zone di mappa.
  const esistente = await leggiDownload('museo', chiave);
  await registraDownload('museo', chiave, {
    nome: visit.venue.name,
    sottotitolo: `${esito.opere} ${esito.opere === 1 ? 'opera' : 'opere'} · ${String(language).toUpperCase()}`,
    bytes: (esistente?.bytes || 0) + esito.bytes,
    parti: {
      poi: true,
      audioguide: { fatte: esito.opere, totali: esito.opereTotali },
    },
    meta: {
      venueKey: visit.venueKey,
      language: String(language).toUpperCase(),
      tappe: esito.opereTotali,
      tipoLuogo: visit.guide?.tipo || 'museo',
    },
  });

  return esito;
}

/** Toglie il pacchetto dall'archivio e dalla scheda dei download. */
export async function eliminaPacchettoMuseo(venueKey: string, lang: string): Promise<void> {
  const archivio = leggiTutto();
  delete archivio[chiaveArchivio(venueKey, lang)];
  scriviTutto(archivio);
  await rimuoviDownload('museo', chiaveArchivio(venueKey, lang));
}

/** Quanti musei ha scaricato l'utente (per la scheda dei download). */
export function elencoMuseiScaricati(): ArchivioMuseo[] {
  return Object.values(leggiTutto()).sort((a, b) => b.scaricatoIl - a.scaricatoIl);
}

/** Le visite scaricate si riaprono anche senza rete. */
export function visitaDallArchivio(venueKey: string, lang: string): MuseumVisit | null {
  const a = museoScaricato(venueKey, lang);
  if (!a) return null;
  return {
    venueKey: a.venueKey,
    venue: { id: null, name: a.venueName, lat: null, lon: null, category: '' },
    guide: a.guide,
    source: null,
    startedAt: a.scaricatoIl,
    updatedAt: a.scaricatoIl,
    seen: [],
  };
}

// Dexie è importato per tenere il file coerente col resto dei pacchetti
// offline (stesso database), anche se qui l'archivio vive in localStorage:
// i testi sono piccoli e devono essere leggibili in modo sincrono mentre si
// cammina, senza attendere una transazione.
void db;
