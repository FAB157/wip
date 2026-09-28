/**
 * FOTO RICORDO E CARTOLINA DELLA GIORNATA (12/09/2026, richiesta del
 * committente).
 *
 * Due immagini che nascono sul telefono, senza server:
 *  - la FOTO RICORDO: lo scatto della persona davanti all'opera, con in
 *    basso una fascia sottile che dice cos'è — «Nascita di Venere ·
 *    Botticelli · Uffizi · 12 settembre 2026 · wip.guide». La foto è sua,
 *    la didascalia è nostra: è così che una visita finisce sui social col
 *    nostro nome sopra, e la foto smette di restare senza nome nel rullino;
 *  - la CARTOLINA: «Oggi agli Uffizi», le opere viste, i minuti di racconto,
 *    la preferita in grande. Non una notifica: una cosa da mandare la sera
 *    stessa alla chat di famiglia.
 *
 * Le foto delle opere vengono da Wikimedia Commons, che manda le intestazioni
 * CORS: si possono disegnare su un canvas senza «sporcarlo». Se una non
 * arriva, la cartolina si fa senza — mai bloccare la condivisione per una
 * foto.
 *
 * La condivisione usa il foglio di sistema (navigator.share con file) —
 * WebView iOS e Android lo supportano — e ripiega sul download.
 */

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function caricaImmagine(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function leggiFile(file: File): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function aCapo(ctx: CanvasRenderingContext2D, testo: string, maxW: number): string[] {
  const parole = testo.split(/\s+/);
  const righe: string[] = [];
  let riga = '';
  for (const p of parole) {
    const prova = riga ? `${riga} ${p}` : p;
    if (ctx.measureText(prova).width > maxW && riga) { righe.push(riga); riga = p; } else riga = prova;
  }
  if (riga) righe.push(riga);
  return righe;
}

/** Lo scatto con la fascia in basso. Massimo 1600 px sul lato lungo. */
export async function componiFotoRicordo(file: File, didascalia: string[]): Promise<Blob | null> {
  const img = await leggiFile(file);
  if (!img) return null;
  const scala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scala);
  const h = Math.round(img.height * scala);
  const canvas = document.createElement('canvas');
  const fascia = Math.round(Math.max(64, w * 0.09));
  canvas.width = w;
  canvas.height = h + fascia;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  // La fascia: panna come l'app, filetto navy sopra.
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, h, w, fascia);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(0, h, w, Math.max(2, Math.round(fascia * 0.05)));
  const base = Math.round(fascia * 0.34);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${base}px ${FONT}`;
  const [titolo, ...resto] = didascalia;
  const margine = Math.round(w * 0.035);
  ctx.fillText(titolo || '', margine, h + fascia * 0.36, w - margine * 2 - Math.round(base * 4.2));
  ctx.fillStyle = '#64748b';
  ctx.font = `700 ${Math.round(base * 0.68)}px ${FONT}`;
  ctx.fillText(resto.filter(Boolean).join(' · '), margine, h + fascia * 0.72, w - margine * 2 - Math.round(base * 4.2));
  // La firma, a destra.
  ctx.fillStyle = '#1e3a8a';
  ctx.font = `900 ${Math.round(base * 0.75)}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('wip.guide', w - margine, h + fascia * 0.54);
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9));
}

export type DatiCartolina = {
  titolo: string;      // «Oggi agli Uffizi»
  sottotitolo: string; // «12 opere · 48 minuti di racconto»
  data: string;
  preferita?: { nome: string; foto?: string } | null;
  miniature: { nome: string; foto?: string }[]; // fino a 6
  etichettaPreferita: string;
};

/** La cartolina 1080×1350 (formato verticale dei social). */
export async function componiCartolina(d: DatiCartolina): Promise<Blob | null> {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, 0, W, H);
  // Testata
  ctx.fillStyle = '#b45309';
  ctx.font = `800 26px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(d.data.toUpperCase(), 72, 72);
  ctx.fillStyle = '#1e3a8a';
  ctx.font = `900 64px ${FONT}`;
  const righeTitolo = aCapo(ctx, d.titolo, W - 144).slice(0, 2);
  righeTitolo.forEach((r, i) => ctx.fillText(r, 72, 112 + i * 74));
  let y = 112 + righeTitolo.length * 74 + 12;
  ctx.fillStyle = '#64748b';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(d.sottotitolo, 72, y);
  y += 70;

  // La preferita, grande
  const disegnaTondo = (x: number, yy: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, yy); ctx.arcTo(x + w, yy, x + w, yy + h, r); ctx.arcTo(x + w, yy + h, x, yy + h, r);
    ctx.arcTo(x, yy + h, x, yy, r); ctx.arcTo(x, yy, x + w, yy, r); ctx.closePath();
  };
  if (d.preferita) {
    const img = d.preferita.foto ? await caricaImmagine(d.preferita.foto) : null;
    const boxH = 620;
    ctx.save();
    disegnaTondo(72, y, W - 144, boxH, 28);
    ctx.clip();
    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(72, y, W - 144, boxH);
    if (img) {
      const s = Math.max((W - 144) / img.width, boxH / img.height);
      const iw = img.width * s, ih = img.height * s;
      ctx.drawImage(img, 72 + ((W - 144) - iw) / 2, y + (boxH - ih) / 2, iw, ih);
    }
    // Velo in basso col nome
    const grad = ctx.createLinearGradient(0, y + boxH - 200, 0, y + boxH);
    grad.addColorStop(0, 'rgba(15,23,42,0)'); grad.addColorStop(1, 'rgba(15,23,42,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(72, y + boxH - 200, W - 144, 200);
    ctx.fillStyle = '#fde68a';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(d.etichettaPreferita.toUpperCase(), 104, y + boxH - 118);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 44px ${FONT}`;
    const rn = aCapo(ctx, d.preferita.nome, W - 208).slice(0, 2);
    rn.forEach((r, i) => ctx.fillText(r, 104, y + boxH - 84 + i * 48 - (rn.length - 1) * 24));
    ctx.restore();
    y += boxH + 36;
  }

  // Le miniature delle altre
  const mini = d.miniature.slice(0, 6);
  if (mini.length) {
    const cols = Math.min(6, mini.length);
    const gap = 18;
    const cw = Math.floor(((W - 144) - gap * (cols - 1)) / cols);
    const imgs = await Promise.all(mini.map(m => (m.foto ? caricaImmagine(m.foto) : Promise.resolve(null))));
    mini.forEach((m, i) => {
      const x = 72 + i * (cw + gap);
      ctx.save();
      disegnaTondo(x, y, cw, cw, 18);
      ctx.clip();
      ctx.fillStyle = '#eff6ff';
      ctx.fillRect(x, y, cw, cw);
      const img = imgs[i];
      if (img) {
        const s = Math.max(cw / img.width, cw / img.height);
        ctx.drawImage(img, x + (cw - img.width * s) / 2, y + (cw - img.height * s) / 2, img.width * s, img.height * s);
      }
      ctx.restore();
    });
    y += cw + 20;
  }

  // Firma
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(72, H - 110, W - 144, 3);
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('wip.guide', 72, H - 86);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText('World in Pocket', W - 72, H - 82);
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92));
}

/** Foglio di condivisione di sistema, altrimenti download. */
export async function condividiImmagine(blob: Blob, nomeFile: string, testo: string): Promise<'condivisa' | 'scaricata' | 'fallita'> {
  const file = new File([blob], nomeFile, { type: blob.type || 'image/jpeg' });
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  try {
    if (nav?.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], text: testo });
      return 'condivisa';
    }
  } catch (e: any) {
    // L'utente ha annullato: non è un errore da mostrare.
    if (String(e?.name) === 'AbortError') return 'fallita';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeFile;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'scaricata';
  } catch {
    return 'fallita';
  }
}
