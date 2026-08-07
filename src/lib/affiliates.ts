// Unica fonte di verità per i link di affiliazione (GetYourGuide / Viator /
// Ticketmaster). Usata da EventsScreen, PlanScreen e ItineraryStop: ogni URL
// in uscita DEVE passare da qui, altrimenti il click non viene attribuito e
// la commissione va persa.

/** Partner ID GetYourGuide (override via VITE_GYG_PARTNER_ID). */
export const GYG_PARTNER_ID = import.meta.env.VITE_GYG_PARTNER_ID || 'KYSFZYF';

/**
 * Partner ID Viator (formato "P00123456"), da configurare in
 * VITE_VIATOR_PARTNER_ID. Senza questo valore il link resta valido ma NON
 * genera commissione.
 */
export const VIATOR_PARTNER_ID = import.meta.env.VITE_VIATOR_PARTNER_ID || '';

/** Campaign id del programma Viator per i link diretti (valore standard). */
export const VIATOR_MCID = import.meta.env.VITE_VIATOR_MCID || '42383';

/**
 * Vecchio metodo di tracciamento: shortlink unico per tutti i prodotti.
 * Mantenuto solo come ripiego se manca VIATOR_PARTNER_ID.
 */
export const VIATOR_TRACKING_PREFIX = 'https://vi.me/vNn2S?url=';

/** Parametro di tracking Ticketmaster (programma Impact), se configurato. */
export const TICKETMASTER_CLICKREF = import.meta.env.VITE_TICKETMASTER_CLICKREF || '';

/** Garantisce partner_id su ogni URL getyourguide.* (senza duplicarlo). */
export function ensureGygAffiliateUrl(url: string): string {
  if (!url || !url.includes('getyourguide.')) return url;
  try {
    const u = new URL(url);
    // partner_id sempre nostro: se un URL arriva con un partner diverso
    // (scraping, cache), la commissione andrebbe a qualcun altro.
    u.searchParams.set('partner_id', GYG_PARTNER_ID);
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'online_publisher');
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'itaintasca');
    return u.toString();
  } catch {
    // URL malformata: fallback a concatenazione prudente
    if (url.includes('partner_id=')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}partner_id=${GYG_PARTNER_ID}&utm_medium=online_publisher&utm_source=itaintasca`;
  }
}

/**
 * Applica il tracciamento Viator secondo il formato ufficiale del programma
 * (?pid=…&mcid=…&medium=link) direttamente sull'URL del prodotto.
 *
 * Il metodo precedente incapsulava ogni prodotto in un unico shortlink
 * (vi.me/vNn2S?url=…): un solo codice per l'intero catalogo, con un parametro
 * `url` non previsto dal programma — con ogni probabilità ignorato in
 * redirect, quindi commissioni non attribuite. Ora lo shortlink resta solo
 * come ripiego finché VITE_VIATOR_PARTNER_ID non è configurato.
 */
export function ensureViatorAffiliateUrl(url: string): string {
  if (!url) return '';

  // URL già passato dal vecchio shortlink: si estrae il prodotto reale così
  // anche i link in cache vengono normalizzati al formato corretto.
  let target = url;
  if (url.startsWith(VIATOR_TRACKING_PREFIX)) {
    try {
      target = decodeURIComponent(url.slice(VIATOR_TRACKING_PREFIX.length));
    } catch {
      return url;
    }
  } else if (url.includes('vi.me/')) {
    return url; // shortlink diverso, creato altrove: non toccarlo
  }

  if (!target.includes('viator.com')) return url;

  // Se l'URL arriva dall'API già tracciato (alcune chiavi affiliate
  // restituiscono productUrl con il pid incluso), non va toccato: sovrascrivere
  // o incapsulare romperebbe un'attribuzione già corretta.
  if (/[?&]pid=/i.test(target)) return target;

  if (!VIATOR_PARTNER_ID) {
    // Nessun partner id configurato: si conserva il comportamento storico
    return url.startsWith(VIATOR_TRACKING_PREFIX)
      ? url
      : VIATOR_TRACKING_PREFIX + encodeURIComponent(target);
  }

  try {
    const u = new URL(target);
    u.searchParams.set('pid', VIATOR_PARTNER_ID);
    u.searchParams.set('mcid', VIATOR_MCID);
    u.searchParams.set('medium', 'link');
    return u.toString();
  } catch {
    const sep = target.includes('?') ? '&' : '?';
    return `${target}${sep}pid=${VIATOR_PARTNER_ID}&mcid=${VIATOR_MCID}&medium=link`;
  }
}

/** Aggiunge il riferimento di tracking Ticketmaster, se configurato. */
export function ensureTicketmasterAffiliateUrl(url: string): string {
  if (!url || !TICKETMASTER_CLICKREF) return url;
  if (!url.includes('ticketmaster.')) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('clickref')) u.searchParams.set('clickref', TICKETMASTER_CLICKREF);
    return u.toString();
  } catch {
    return url;
  }
}

/** Da applicare SEMPRE all'href finale: copre tutti i partner, è idempotente. */
export function ensureAffiliateUrl(url: string): string {
  return ensureTicketmasterAffiliateUrl(
    ensureViatorAffiliateUrl(ensureGygAffiliateUrl(url))
  );
}

// ── TRACKING CLICK AFFILIATI ────────────────────────────────────────────
// Registra il click in uscita nella tabella affiliate_clicks (letta dal
// pannello admin "Statistiche Affiliazione"). Best-effort: NON deve mai
// bloccare o ritardare l'apertura del link — chiamare senza await.

export type AffiliateProvider = 'gyg' | 'viator' | 'ticketmaster' | 'other';

/** Deduce il provider dall'URL di destinazione. */
export function providerFromUrl(url: string): AffiliateProvider {
  const u = (url || '').toLowerCase();
  if (u.includes('getyourguide.')) return 'gyg';
  if (u.includes('viator') || u.includes('vi.me')) return 'viator';
  if (u.includes('ticketmaster.')) return 'ticketmaster';
  return 'other';
}

/**
 * Traccia l'apertura di un link affiliato in `affiliate_clicks` (statistiche
 * admin). Fire-and-forget: mai bloccante per l'utente. Il provider viene
 * dedotto dall'URL e codificato anche nel source_page ("gyg:EventsScreen"),
 * così le statistiche per provider funzionano pure se la colonna dedicata
 * `provider` non esiste ancora (migrazione 20260807120000 non applicata:
 * in quel caso si ritenta l'insert senza).
 */
export function trackAffiliateClick(url: string, name: string, city: string, sourcePage: string): void {
  try {
    const provider = providerFromUrl(url);
    // import dinamico: evita di trascinare supabase nei bundle che usano
    // solo gli helper URL di questo modulo.
    import('./supabase').then(({ supabase }) => {
      const row: any = {
        poi_name: name || provider,
        poi_city: city || '',
        source_page: `${provider}:${sourcePage}`,
        provider
      };
      supabase.from('affiliate_clicks').insert(row).then(({ error }: any) => {
        if (error) {
          const { provider: _p, ...base } = row;
          supabase.from('affiliate_clicks').insert(base).then(() => {});
        }
      });
    }).catch(() => {});
  } catch { /* telemetria: mai bloccante */ }
}

/** Pagina di ricerca GetYourGuide con la città già nel campo, tracciata. */
export function gygSearchUrl(city: string): string {
  return ensureGygAffiliateUrl(
    `https://www.getyourguide.it/s/?q=${encodeURIComponent(city)}`
  );
}

/** Pagina di ricerca Viator con la città già nel campo, tracciata. */
export function viatorSearchUrl(city: string): string {
  return ensureViatorAffiliateUrl(
    `https://www.viator.com/searchResults/all?text=${encodeURIComponent(city)}`
  );
}
