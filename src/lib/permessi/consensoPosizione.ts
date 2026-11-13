/**
 * CONSENSO PRIMA DEL PERMESSO (07/11/2026, rifiuto Google Play «Inadequate
 * Prominent Disclosure» sulla 1.3.10).
 *
 * Lo screenshot del revisore mostrava la schermata dei permessi
 * (PermissionsModal, con la disclosure in cima) e SOPRA di essa, nello stesso
 * istante, il dialogo di sistema «Allow WIP to access this device's location?»
 * — prima che l'utente toccasse «Attiva». Lo chiedeva la mappa: MapArea si
 * monta sotto la schermata, si iscrive a locationService, e startWatching
 * chiamava Geolocation.requestPermissions() da solo. Per la policy User Data
 * la richiesta di runtime deve essere «immediately preceded» dalla
 * disclosure e dal consenso dell'utente: un dialogo che compare insieme alla
 * spiegazione non lo è.
 *
 * Regola, per TUTTA l'app: il permesso di posizione lo chiede al sistema solo
 * chi ha già il consenso dato nella schermata dei permessi
 * (`wip_location_disclosure_accepted`, scritto dal tasto «Attiva» di
 * PermissionsModal e dalla ProminentDisclosure del Profilo). Senza consenso
 * non si chiede nulla: si apre (o si lascia aperta) la schermata dei permessi
 * e si risponde null. Nessun altro file chiama Geolocation.requestPermissions
 * direttamente.
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation, type PermissionStatus } from '@capacitor/geolocation';

export const CHIAVE_CONSENSO_POSIZIONE = 'wip_location_disclosure_accepted';

export function consensoPosizioneDato(): boolean {
  try { return localStorage.getItem(CHIAVE_CONSENSO_POSIZIONE) === 'true'; } catch { return false; }
}

/** Apre la schermata dei permessi (PermissionsModal ascolta; solo nativo). */
export function apriSchermataPermessi(): void {
  try { window.dispatchEvent(new CustomEvent('wip-apri-permessi')); } catch { /* niente */ }
}

/**
 * GUARDIA SU navigator.geolocation (solo app nativa). Una trentina di punti
 * dell'app (eventi, piano, fotocamera, scheda luogo…) chiamano
 * navigator.geolocation.getCurrentPosition direttamente; su Android il
 * WebView di Capacitor (BridgeWebChromeClient.onGeolocationPermissionsShowPrompt)
 * risponde chiedendo LUI il permesso di runtime, senza nessuna spiegazione
 * davanti. Finché il consenso non è dato e il permesso manca, qui la chiamata
 * finisce nel callback d'errore con PERMISSION_DENIED (code 1), com'è già
 * gestito ovunque, e si apre la schermata dei permessi. Installata una volta
 * all'avvio (main.tsx), prima di React.
 */
export function installaGuardiaGeolocation(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !Capacitor.isNativePlatform()) return;
  const geo = navigator.geolocation;
  if ((geo as any).__wipGuardia) return;
  const originali = { get: geo.getCurrentPosition.bind(geo), watch: geo.watchPosition.bind(geo) };
  const bloccato = (): boolean => !consensoPosizioneDato();
  const errore = (onError?: PositionErrorCallback | null) => {
    apriSchermataPermessi();
    try { onError?.({ code: 1, message: 'consenso posizione non dato', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); } catch { /* niente */ }
  };
  // Il permesso di sistema concesso rende la guardia inutile: una volta visto
  // «granted» si lascia passare tutto, consenso o no (è già stato dato dove si
  // è ottenuto il permesso).
  let permessoVisto = false;
  const passa = async (): Promise<boolean> => {
    if (permessoVisto || !bloccato()) return true;
    try {
      const s = await Geolocation.checkPermissions();
      if (concesso(s)) { permessoVisto = true; return true; }
    } catch { /* si resta bloccati */ }
    return false;
  };
  geo.getCurrentPosition = (ok, err, opts) => {
    void passa().then((si) => { if (si) originali.get(ok, err ?? undefined, opts); else errore(err); });
  };
  geo.watchPosition = (ok, err, opts) => {
    // L'id si restituisce subito; se la guardia blocca, resta un id vuoto.
    let id = -1;
    void passa().then((si) => { if (si) id = originali.watch(ok, err ?? undefined, opts); else errore(err); });
    return id;
  };
  (geo as any).__wipGuardia = true;
}

const concesso = (p: PermissionStatus | null | undefined) =>
  !!p && (p.location === 'granted' || p.coarseLocation === 'granted');

/**
 * Permesso di posizione (foreground) con la regola sopra.
 * - già concesso → lo stato, senza dialogo;
 * - consenso dato → il dialogo di sistema, e lo stato che ne esce;
 * - consenso NON dato → nessun dialogo, si apre la schermata dei permessi, null.
 * Sul web (browser) non c'è policy Play: si chiede come prima.
 * `precisa`: su Android con la sola approssimativa si chiede di nuovo la precisa.
 */
export async function chiediPermessoPosizione(opzioni: { precisa?: boolean } = {}): Promise<PermissionStatus | null> {
  let stato: PermissionStatus | null = null;
  try { stato = await Geolocation.checkPermissions(); } catch { stato = null; }
  const soloApprossimativa = !!stato && stato.coarseLocation === 'granted' && stato.location !== 'granted';
  const serve = !concesso(stato) || (opzioni.precisa && soloApprossimativa);
  if (!serve) return stato;
  if (Capacitor.isNativePlatform() && !consensoPosizioneDato()) {
    apriSchermataPermessi();
    return null;
  }
  try { return await Geolocation.requestPermissions({ permissions: ['location'] }); } catch { return stato; }
}
