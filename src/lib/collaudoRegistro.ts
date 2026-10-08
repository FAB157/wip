// =====================================================================
// REGISTRO DI COLLAUDO — lettura e PAGELLA (04/10/2026).
// Le righe le scrive il telefono (RegistroCollaudo.kt / .swift):
//   MM-dd HH:mm:ss POS lat,lon acc=N
//   MM-dd HH:mm:ss NAV FIX lat,lon acc=N idx=N aria=N strada=N u=N v=N vicino=N JS|NATIVO|PAUSA [DICE[tipo]: frase]
//   MM-dd HH:mm:ss GUIDA <tipo> "<nome>" id=… strada=N|inf aria=N raggio=N acc=N lat,lon punto=lat,lon
//   MM-dd HH:mm:ss SEGNO "<nota>" [lat,lon]
// Qui si trasformano in punti per la mappa e in una pagella: la guida è
// partita entro il raggio di strada? L'avviso? Le svolte sono state dette in
// tempo? Funzione PURA, usata dal server (rotta admin) e provabile senza
// camminare: scratch/collaudo-pagella.mts.
// =====================================================================

export interface PuntoTraccia { lat: number; lon: number; ora: string; acc?: number }
export interface ScattoGuida {
  ora: string; tipo: string; nome: string; id: string;
  strada: number | null; aria: number; raggio: number; acc: number | null;
  lat: number; lon: number; puntoLat: number; puntoLon: number;
  esito: 'giusto' | 'tardi' | 'presto' | 'rinviato' | 'recinto';
  nota: string;
}
export interface SvoltaDetta { ora: string; lat: number; lon: number; tipo: string; frase: string; strada: number | null; vicino: number; chi: string; esito: 'giusta' | 'tardi' | 'presto' }
export interface SegnoCollaudo { ora: string; nota: string; lat: number | null; lon: number | null; /** segno sul testo dell'audioguida, non sul trigger */ contenuto: boolean; /** il luogo la cui guida stava suonando */ poi: string | null }
export interface Pagella {
  guide: { totali: number; giuste: number; tardi: number; presto: number };
  avvisi: { totali: number; giusti: number; tardi: number; presto: number };
  svolte: { totali: number; giuste: number; tardi: number; presto: number };
  /** Frasi del navigatore dette due volte di seguito (o quasi). */
  frasiRipetute: number;
  segni: number;
  /** Segni sul contenuto dell'audioguida («Guida sbagliata»). */
  contenuti: number;
  voto: number | null; // 0-100, null se non c'è niente da giudicare
}
/** Consumo durante il collaudo (righe «BATT», una ogni 5 minuti). `perOra` = punti percentuali persi all'ora. */
export interface Batteria { da: number; a: number; minuti: number; perOra: number | null; fixAlMinuto: number | null; inCarica: boolean }
export interface RegistroLetto { traccia: PuntoTraccia[]; scatti: ScattoGuida[]; svolte: SvoltaDetta[]; segni: SegnoCollaudo[]; pagella: Pagella; batteria: Batteria | null; righeNonLette: number }

/** Quanto può sforare lo scatto prima di contare come «presto»: il GPS sbaglia di qualche metro. */
const TOLLERANZA_M = 10;

const num = (s: string | undefined): number | null => { const v = Number(s); return s != null && s !== '' && Number.isFinite(v) ? v : null; };
const campo = (riga: string, nome: string): string | undefined => riga.match(new RegExp(`(?:^|\\s)${nome}=([^\\s]+)`))?.[1];
const coppia = (s: string | undefined): [number, number] | null => {
  const m = s?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

export function leggiRegistroCollaudo(righe: string[]): RegistroLetto {
  const traccia: PuntoTraccia[] = [], scatti: ScattoGuida[] = [], svolte: SvoltaDetta[] = [], segni: SegnoCollaudo[] = [];
  let nonLette = 0;
  const letture: Array<{ ora: string; livello: number; inCarica: boolean; fix: number }> = [];
  for (const grezza of righe || []) {
    const m = String(grezza).match(/^(\d\d-\d\d \d\d:\d\d:\d\d|\d\d:\d\d:\d\d) (.*)$/);
    if (!m) { nonLette++; continue; }
    const ora = m[1], resto = m[2];

    if (resto.startsWith('POS ')) {
      const c = coppia(resto.split(' ')[1]);
      if (c) traccia.push({ lat: c[0], lon: c[1], ora, acc: num(campo(resto, 'acc')) ?? undefined }); else nonLette++;
      continue;
    }
    if (resto.startsWith('NAV FIX ')) {
      const c = coppia(resto.split(' ')[2]);
      if (!c) { nonLette++; continue; }
      traccia.push({ lat: c[0], lon: c[1], ora, acc: num(campo(resto, 'acc')) ?? undefined });
      const detto = resto.match(/ (JS|NATIVO|PAUSA) DICE\[([^\]]*)\]: (.*)$/);
      if (detto) {
        const strada = num(campo(resto, 'strada'));
        const vicino = num(campo(resto, 'vicino')) ?? 35;
        const tipo = detto[2];
        // Il «gira» (vicino) è giusto fra 5 m e la soglia; sotto i 5 m è tardi, oltre la soglia è presto.
        // Il preavviso (lontano) e le altre frasi non hanno una finestra stretta: contano come giuste.
        let esito: SvoltaDetta['esito'] = 'giusta';
        if (/vicin|near|turn/i.test(tipo) && strada != null) {
          if (strada < 5) esito = 'tardi'; else if (strada > vicino + TOLLERANZA_M) esito = 'presto';
        }
        svolte.push({ ora, lat: c[0], lon: c[1], tipo, frase: detto[3], strada, vicino, chi: detto[1], esito });
      }
      continue;
    }
    if (resto.startsWith('GUIDA ')) {
      const g = resto.match(/^GUIDA (.+?) "(.*?)" (.*)$/);
      if (!g) { nonLette++; continue; }
      const coda = g[3];
      const dove = coppia(coda.match(/(?:^|\s)(-?\d+\.\d+,-?\d+\.\d+)(?:\s|$)/)?.[1]);
      const punto = coppia(campo(coda, 'punto'));
      if (!dove || !punto) { nonLette++; continue; }
      const sStrada = campo(coda, 'strada');
      const strada = sStrada === 'inf' ? null : num(sStrada);
      const raggio = num(campo(coda, 'raggio')) ?? 0;
      const tipo = g[1];
      let esito: ScattoGuida['esito'] = 'giusto', nota = '';
      if (tipo.startsWith('recinto-rinviato')) { esito = 'rinviato'; nota = 'recinto di sistema scattato, ma di strada si era ancora lontani: rinviato'; }
      else if (tipo.startsWith('recinto')) { esito = 'recinto'; nota = 'recinto di sistema accettato'; }
      else if (tipo === 'arrivo-muro') { nota = 'luogo senza porta: scattato sul perimetro'; }
      else if (strada == null) { esito = 'tardi'; nota = 'la strada risultava irraggiungibile: scattato solo per vicinanza (15 m)'; }
      else if (strada > raggio + TOLLERANZA_M) { esito = 'presto'; nota = `scattato a ${Math.round(strada)} m di strada, oltre il raggio di ${raggio} m`; }
      else if (strada < raggio * 0.5) { esito = 'tardi'; nota = `scattato a ${Math.round(strada)} m di strada: meno di metà del raggio di ${raggio} m`; }
      scatti.push({ ora, tipo, nome: g[2], id: campo(coda, 'id') || '', strada, aria: num(campo(coda, 'aria')) ?? 0, raggio, acc: num(campo(coda, 'acc')), lat: dove[0], lon: dove[1], puntoLat: punto[0], puntoLon: punto[1], esito, nota });
      continue;
    }
    if (resto.startsWith('SEGNO ')) {
      const s = resto.match(/^SEGNO "(.*?)"(?: (-?\d+\.\d+,-?\d+\.\d+))?$/);
      if (!s) { nonLette++; continue; }
      const c = coppia(s[2]);
      // «CONTENUTO: <nota> [poi=<id>]» = segno sul TESTO ascoltato (generico,
      // luogo sbagliato, lingua sbagliata), non su dove è scattato.
      const cont = s[1].match(/^CONTENUTO: (.*?)(?: \[poi=([^\]]*)\])?$/);
      segni.push({ ora, nota: cont ? cont[1] : s[1], lat: c ? c[0] : null, lon: c ? c[1] : null, contenuto: !!cont, poi: cont?.[2] || null });
      continue;
    }
    if (resto.startsWith('BATT ')) {
      const livello = num(campo(resto, 'livello'));
      if (livello == null) { nonLette++; continue; }
      letture.push({ ora, livello, inCarica: campo(resto, 'carica') === 'si', fix: num(campo(resto, 'fix')) ?? 0 });
      continue;
    }
    // NAV PERCORSO, COLLAUDO acceso/spento…: righe di contesto, non da disegnare.
  }

  // Consumo: dal primo all'ultimo livello letto. Con il telefono in carica il numero non vale.
  let batteria: Batteria | null = null;
  if (letture.length >= 2) {
    const a = letture[0], b = letture[letture.length - 1];
    const minuti = minutiFra(a.ora, b.ora);
    const persi = a.livello - b.livello;
    const fix = letture.slice(1).reduce((s, l) => s + l.fix, 0);
    batteria = {
      da: a.livello, a: b.livello, minuti,
      perOra: minuti > 0 ? Math.round((persi / minuti) * 60 * 10) / 10 : null,
      fixAlMinuto: minuti > 0 ? Math.round((fix / minuti) * 10) / 10 : null,
      inCarica: letture.some(l => l.inCarica),
    };
  }

  const conta = <T extends { esito: string }>(arr: T[], giusto: string) => ({
    totali: arr.length,
    giuste: arr.filter(x => x.esito === giusto).length,
    tardi: arr.filter(x => x.esito === 'tardi').length,
    presto: arr.filter(x => x.esito === 'presto').length,
  });
  const arrivi = scatti.filter(s => s.tipo === 'arrivo' || s.tipo === 'arrivo-muro');
  const avvisi = scatti.filter(s => s.tipo === 'avviso');
  const g = conta(arrivi, 'giusto'), a = conta(avvisi, 'giusto'), v = conta(svolte, 'giusta');
  const giudicati = g.totali + a.totali + v.totali;
  const pagella: Pagella = {
    guide: g,
    avvisi: { totali: a.totali, giusti: a.giuste, tardi: a.tardi, presto: a.presto },
    svolte: v,
    // La stessa frase ridetta entro le tre precedenti: è il difetto tipico della ripresa dopo lo schermo spento.
    frasiRipetute: svolte.filter((s, i) => svolte.slice(Math.max(0, i - 3), i).some(p => p.frase === s.frase)).length,
    segni: segni.filter(s => !s.contenuto).length,
    contenuti: segni.filter(s => s.contenuto).length,
    voto: giudicati ? Math.round(((g.giuste + a.giuste + v.giuste) / giudicati) * 100) : null,
  };
  return { traccia, scatti, svolte, segni, pagella, batteria, righeNonLette: nonLette };
}

/** Minuti fra due ore del registro («MM-dd HH:mm:ss» o «HH:mm:ss»); regge la mezzanotte, non il cambio d'anno. */
function minutiFra(a: string, b: string): number {
  const sec = (s: string) => {
    const m = s.match(/^(?:(\d\d)-(\d\d) )?(\d\d):(\d\d):(\d\d)$/);
    if (!m) return NaN;
    const giorno = m[1] ? Number(m[1]) * 31 + Number(m[2]) : 0;
    return giorno * 86400 + Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5]);
  };
  const d = (sec(b) - sec(a)) / 60;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
