import React from 'react';
import { PremiumGuideContent, GUIDE_STYLE_META } from '../services/premiumGuideService';
import { Language, getTranslation } from '../lib/i18n';

interface PremiumGuideRendererProps {
  content: PremiumGuideContent;
  mediaManifest: Record<string, string>;
  language: Language;
  containerId?: string;
  onClose?: () => void;
}

// ─── Brand Palette ────────────────────────────────────────────────────────────
const C = {
  navy:    '#1a3a6c',
  blue:    '#2563a8',
  gold:    '#f5a623',
  orange:  '#e8611a',
  dark:    '#1c1c1c',
  mid:     '#444444',
  light:   '#777777',
  bg:      '#f7f8fa',
  white:   '#ffffff',
  border:  '#e2e6ea',
};

const renderStars = (rating: number) => {
  const full = Math.round(rating || 4);
  return (
    <span style={{ color: C.gold, fontSize: '16px', letterSpacing: '2px' }}>
      {'★'.repeat(Math.min(full, 5))}{'☆'.repeat(Math.max(0, 5 - full))}
    </span>
  );
};

// ─── Misure di pagina ────────────────────────────────────────────────────────
// A4 = 297 mm; html2pdf stampa con margini 10+15 mm → ~272 mm utili. Le
// pagine «intere» (copertina) si misurano in mm, MAI in px: i 780px fissi
// di prima sfondavano la pagina e producevano un foglio finale quasi vuoto.
const PAGE_H = '250mm';
const HERO_H = '95mm';

/** Etichetta della guida nella lingua UI (chiavi `pg_*` in i18n.ts). */
const mkT = (language: Language) => (key: string) => getTranslation(`pg_${key}`, language);
type T = (key: string) => string;

// ─── Cover Page ──────────────────────────────────────────────────────────────
// IL TITOLO APRE LA PAGINA: prima c'era una banda logo + pill di stile sopra,
// e la riga più preziosa del documento era occupata dal marchio. Logo, stile
// e «wip.guide» stanno nel piede della copertina.
const CoverPage = ({
  content,
  coverImg,
  styleLabel,
  styleMeta,
  language,
  t,
}: {
  content: any;
  coverImg?: string;
  styleLabel: string;
  styleMeta: any;
  language: Language;
  t: T;
}) => (
  <div style={{
    background: C.navy,
    minHeight: PAGE_H,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    pageBreakAfter: 'always',
    overflow: 'hidden',
  }}>
    {/* Background hero photo */}
    {coverImg && (
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${coverImg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.28,
      }} />
    )}

    {/* Main cover content: il titolo è la prima riga del foglio */}
    <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '10mm 12mm 12mm' }}>
      {/* IL TITOLO, RIDIMENSIONATO.
          Era 62px fissi: un titolo lungo come «La Spezia e le Cinque Terre:
          tra mare e borghi» occupava mezza copertina e schiacciava tutto il
          resto in fondo. Ora la misura segue la lunghezza — i titoli corti
          restano grandi, quelli lunghi rientrano — e il tetto è 44px. */}
      {/* SCALA TIPOGRAFICA UNICA (30/08/2026, richiesta del committente:
          «titoli un po' piu' piccoli, armonizzare tutte le scritte»).
          Quattro gradi soli, gli stessi in tutta la guida — copertina, indice,
          intro, giorno, POI — cosi' il documento resta coerente anche una
          volta convertito in EPUB, dove i corpi in px vengono riscalati dal
          lettore e una scala disordinata si nota subito.
            H1 copertina  clamp(24, 5.6vw, 36)
            H2 sezione    clamp(20, 5.2vw, 28)
            H3 POI        clamp(19, 5vw,   26)
          Il minimo tiene la riga leggibile su un telefono, il massimo vale in
          stampa e su schermo grande. */}
      <h1 style={{
        color: C.white,
        fontSize: (content.guida_titolo || '').length > 44 ? 'clamp(22px, 5vw, 28px)'
          : (content.guida_titolo || '').length > 26 ? 'clamp(23px, 5.4vw, 32px)'
          : 'clamp(24px, 5.6vw, 36px)',
        fontWeight: 900,
        lineHeight: 1.1,
        letterSpacing: '-0.5px',
        margin: '0 0 12px',
        maxWidth: '680px',
        overflowWrap: 'break-word',
      }}>
        {content.guida_titolo || t('premium_guide')}
      </h1>
      <div style={{
        display: 'inline-block',
        background: C.gold,
        color: C.navy,
        fontWeight: 900,
        fontSize: '11px',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        padding: '5px 16px',
        borderRadius: '4px',
        margin: '0 0 24px',
        width: 'fit-content',
      }}>
        {styleMeta.emoji} {styleLabel}
      </div>
      {content.sottotitolo && (
        <div style={{
          color: C.gold,
          fontSize: '16px',
          fontWeight: 400,
          fontStyle: 'italic',
          marginBottom: '28px',
          maxWidth: '620px',
        }}>
          {content.sottotitolo}
        </div>
      )}

      {/* Dedica regalo (opzionale): stile elegante da prima pagina */}
      {content.dedica && (
        <div style={{
          borderTop: `1px solid ${C.gold}`,
          borderBottom: `1px solid ${C.gold}`,
          padding: '18px 28px',
          margin: '0 0 28px',
          maxWidth: '560px',
          textAlign: 'center',
        }}>
          <div style={{ color: C.gold, fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>
            🎁 {t('dedication')}
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.95)',
            fontSize: '18px',
            fontStyle: 'italic',
            lineHeight: 1.6,
            margin: 0,
          }}>
            {content.dedica}
          </p>
        </div>
      )}

      {/* Intro box */}
      <div style={{
        background: 'rgba(255,255,255,0.10)',
        backdropFilter: 'blur(4px)',
        border: `1px solid rgba(255,255,255,0.15)`,
        borderLeft: `4px solid ${C.gold}`,
        padding: '24px 28px',
        maxWidth: '680px',
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.90)',
          fontSize: '15px',
          lineHeight: 1.85,
          margin: 0,
        }}>
          {content.introduzione}
        </p>
      </div>
    </div>

    {/* Piede della copertina: marchio, provenienza (wip.guide) e data */}
    <div style={{
      position: 'relative', zIndex: 2,
      borderTop: `3px solid ${C.gold}`,
      padding: '6mm 12mm',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img
          src="/logo.jpg"
          alt="WIP"
          style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div>
          <div style={{ color: C.gold, fontWeight: 900, fontSize: '18px', letterSpacing: '2px', lineHeight: 1 }}>WIP</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase' }}>World in Pocket</div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: C.gold, fontSize: '12px', letterSpacing: '1px', fontWeight: 700 }}>wip.guide</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>
          {new Date().toLocaleDateString(LOCALE[language] || 'it-IT', { year: 'numeric', month: 'long' })}
        </div>
      </div>
    </div>
  </div>
);

const LOCALE: Record<string, string> = { IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN' };

// ─── Sommario cliccabile ─────────────────────────────────────────────────────
// Indice per giorno e per POI con anchor interni: nel visualizzatore i link
// scorrono alla sezione; nei viewer PDF/HTML che supportano i link interni
// restano navigabili. Zero costi AI: è solo impaginazione.
const TocPage = ({ giorni, anchorPrefix, t }: { giorni: any[]; anchorPrefix: string; t: T }) => {
  const goTo = (e: React.MouseEvent, id: string) => {
    // Nel viewer (SPA senza router) l'href "#id" non deve toccare la history
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (!giorni?.length) return null;
  return (
    <div style={{
      background: C.white,
      padding: 'clamp(20px, 5vw, 48px)',
      pageBreakBefore: 'always',
      pageBreakAfter: 'always',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', borderBottom: `3px solid ${C.gold}`, paddingBottom: '14px', marginBottom: '28px' }}>
        <h2 style={{ color: C.navy, fontSize: 'clamp(20px, 5.2vw, 28px)', fontWeight: 900, margin: 0 }}>{t('toc')}</h2>
        <span style={{ color: C.light, fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}>{t('toc_sub')}</span>
      </div>
      {giorni.map((giorno: any, gIdx: number) => {
        const dayId = `${anchorPrefix}-day-${gIdx}`;
        return (
          <div key={gIdx} style={{ marginBottom: '22px', pageBreakInside: 'avoid' }}>
            <a
              href={`#${dayId}`}
              onClick={(e) => goTo(e, dayId)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', marginBottom: '10px' }}
            >
              <span style={{
                background: C.navy, color: C.gold, fontWeight: 900, fontSize: '11px',
                letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '4px', flexShrink: 0,
              }}>
                {t('day')} {giorno.giorno ?? gIdx + 1}
              </span>
              <span style={{ color: C.navy, fontWeight: 900, fontSize: '17px' }}>
                {giorno.titolo_giorno || `${t('day')} ${giorno.giorno ?? gIdx + 1}`}
              </span>
            </a>
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(giorno.pois || []).map((poi: any, pIdx: number) => {
                const poiId = `${anchorPrefix}-poi-${gIdx}-${pIdx}`;
                return (
                  <li key={pIdx}>
                    <a
                      href={`#${poiId}`}
                      onClick={(e) => goTo(e, poiId)}
                      style={{ display: 'flex', alignItems: 'baseline', gap: '10px', textDecoration: 'none' }}
                    >
                      <span style={{ color: C.gold, fontWeight: 900, fontSize: '12px', flexShrink: 0, width: '34px' }}>
                        {(giorno.giorno ?? gIdx + 1)}.{pIdx + 1}
                      </span>
                      <span style={{ color: C.mid, fontSize: '14px', borderBottom: `1px dotted ${C.border}`, flex: 1 }}>
                        {poi.titolo || t('poi')}
                      </span>
                      {poi.categoria_pdf && (
                        <span style={{ color: C.light, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>
                          {poi.categoria_pdf}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

// ─── City Intro Page ─────────────────────────────────────────────────────────
const CityIntroPage = ({
  citta_intro,
  mediaManifest,
  t,
}: {
  citta_intro: any;
  mediaManifest: Record<string, string>;
  t: T;
}) => {
  if (!citta_intro) return null;
  const img1 = mediaManifest['citta_intro_1'];
  const img2 = mediaManifest['citta_intro_2'];
  const img3 = mediaManifest['citta_intro_3'];

  return (
    <div style={{
      background: C.white,
      // clamp e non 48px fissi (30/08/2026): su un telefono da 360 px i due
      // padding da 48 lasciavano 264 px di colonna, e il titolo si spezzava a
      // meta' parola («sorprender / e»). In stampa il vw e' grande, quindi
      // clamp resta bloccato su 48px: il PDF non cambia di un millimetro.
      padding: 'clamp(20px, 5vw, 48px)',
      pageBreakBefore: 'always',
      pageBreakAfter: 'always',
    }}>
      <h2 style={{ color: C.navy, fontSize: 'clamp(20px, 5.2vw, 28px)', fontWeight: 900, marginBottom: '24px', lineHeight: 1.15, overflowWrap: 'break-word' }}>
        {citta_intro.titolo || t('discover_destination')}
      </h2>

      {/* Hero Image */}
      {img1 && (
        <div style={{ marginBottom: '32px', height: '70mm', borderRadius: '12px', overflow: 'hidden' }}>
          <img src={img1} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="City panorama" />
        </div>
      )}

      {/* History & Culture columns */}
      {/* auto-fit e non '1fr 1fr' (30/08/2026): due colonne fisse su un
          telefono davano tre parole per riga, illeggibili. Con auto-fit la
          seconda colonna scende sotto quando non ci sta; in stampa, dove la
          pagina e' larga, restano affiancate come prima. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '32px', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '20px' }}>🏛️</span>
            <h3 style={{ color: C.gold, fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              {t('history')}
            </h3>
          </div>
          <p style={{ color: C.mid, fontSize: '14px', lineHeight: 1.8, margin: 0 }}>
            {citta_intro.storia}
          </p>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '20px' }}>🎨</span>
            <h3 style={{ color: C.gold, fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              {t('culture')}
            </h3>
          </div>
          <p style={{ color: C.mid, fontSize: '14px', lineHeight: 1.8, margin: 0 }}>
            {citta_intro.cultura_tradizioni}
          </p>
          {img2 && (
            <div style={{ marginTop: '24px', height: '160px', borderRadius: '8px', overflow: 'hidden' }}>
              <img src={img2} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="City culture" />
            </div>
          )}
        </div>
      </div>

      {/* Practical Info */}
      <div style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: '12px',
        padding: '24px 32px',
        display: 'flex',
        gap: '24px',
      }}>
        {img3 && (
          <div style={{ width: '180px', height: '100%', minHeight: '140px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
            <img src={img3} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Practical guide" />
          </div>
        )}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '20px' }}>📌</span>
            <h3 style={{ color: C.blue, fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              {t('practical_tips')}
            </h3>
          </div>
          <p style={{ color: C.dark, fontSize: '13.5px', lineHeight: 1.75, margin: 0 }}>
            {citta_intro.consigli_pratici}
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Day Divider ─────────────────────────────────────────────────────────────
const DayDivider = ({ giorno, tema, t }: { giorno: any; tema?: string; t: T }) => (
  <div style={{
    background: C.navy,
    padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 48px) clamp(20px, 4vw, 32px)',
    pageBreakBefore: 'always',
    pageBreakAfter: 'avoid',
    borderBottom: `4px solid ${C.gold}`,
  }}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      marginBottom: tema ? '12px' : 0,
    }}>
      <div style={{
        background: C.gold,
        color: C.navy,
        fontWeight: 900,
        fontSize: '13px',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        padding: '6px 18px',
        borderRadius: '4px',
        flexShrink: 0,
      }}>
        {t('day')} {giorno.giorno}
      </div>
      <h2 style={{ color: C.white, fontSize: 'clamp(20px, 5.2vw, 28px)', fontWeight: 900, margin: 0, lineHeight: 1.15, overflowWrap: 'break-word' }}>
        {giorno.titolo_giorno}
      </h2>
    </div>
    {tema && (
      <p style={{
        color: C.gold,
        fontSize: '15px',
        fontStyle: 'italic',
        margin: '0 0 0 106px',
        lineHeight: 1.5,
      }}>
        {tema}
      </p>
    )}
  </div>
);

// ─── POI Block ───────────────────────────────────────────────────────────────
const PoiBlock: React.FC<{ poi: any; imgUrl?: string; t: T }> = ({ poi, imgUrl, t }) => {
  const curiosita: string[] = Array.isArray(poi.curiosita) ? poi.curiosita : [];
  const piatti: string[] = Array.isArray(poi.migliori_piatti) ? poi.migliori_piatti : [];

  return (
    <div style={{
      pageBreakInside: 'avoid',
      marginBottom: '0',
      borderBottom: `3px solid ${C.bg}`,
    }}>
      {/* Hero image full-width */}
      {imgUrl && (
        <div style={{ position: 'relative', height: HERO_H, overflow: 'hidden', background: C.border }}>
          <img
            src={imgUrl}
            alt={poi.titolo}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.style.display = 'none';
            }}
          />
          {/* Category badge over image */}
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: C.navy + 'ee',
            color: C.gold,
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            padding: '6px 14px',
            borderRadius: '4px',
          }}>
            {poi.categoria_pdf || t('poi')}
          </div>
        </div>
      )}

      {/* Content area */}
      <div style={{ padding: 'clamp(20px, 5vw, 36px) clamp(18px, 5vw, 48px)' }}>

        {/* Without image: category pill shown here */}
        {!imgUrl && (
          <div style={{
            display: 'inline-block',
            background: C.navy,
            color: C.gold,
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            padding: '5px 14px',
            borderRadius: '4px',
            marginBottom: '14px',
          }}>
            {poi.categoria_pdf || t('poi')}
          </div>
        )}

        {/* Stars */}
        <div style={{ marginBottom: '8px' }}>{renderStars(poi.valutazione)}</div>

        {/* Title */}
        <h3 style={{
          fontSize: 'clamp(19px, 5vw, 26px)',
          fontWeight: 900,
          color: C.dark,
          margin: '0 0 6px',
          lineHeight: 1.15,
          letterSpacing: '-0.3px',
          overflowWrap: 'break-word',
        }}>
          {poi.titolo}
        </h3>

        {/* Orario visita */}
        {poi.orario_visita && (
          <div style={{
            display: 'inline-block',
            background: C.bg,
            border: `1px solid ${C.border}`,
            color: C.blue,
            fontSize: '12px',
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: '20px',
            marginBottom: '20px',
          }}>
            🕐 {poi.orario_visita}
          </div>
        )}

        {/* Practical info bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '28px',
          fontSize: '13px',
          color: C.mid,
        }}>
          {poi.indirizzo && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>📍</span>
              <div><strong style={{ color: C.dark }}>{t('address')}</strong><br />{poi.indirizzo}</div>
            </div>
          )}
          {poi.trasporti && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🚌</span>
              <div><strong style={{ color: C.dark }}>{t('how_to_get')}</strong><br />{poi.trasporti}</div>
            </div>
          )}
          {/* Gli orari NON si ripetono (30/08/2026): l'AI riempie sia
              `orario_visita` (la pillola qui sopra) sia `info_utili.orari`, e
              nella guida di Parigi la stessa frase compariva due volte a
              quattro righe di distanza — la seconda incolonnata su undici
              righe strettissime. Se dicono la stessa cosa, si stampa una
              volta sola. */}
          {poi.info_utili?.orari &&
           String(poi.info_utili.orari).trim() !== String(poi.orario_visita || '').trim() && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🕐</span>
              <div><strong style={{ color: C.dark }}>{t('hours')}</strong><br />{poi.info_utili.orari}</div>
            </div>
          )}
          {poi.info_utili?.prezzo && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🎫</span>
              <div><strong style={{ color: C.dark }}>{t('admission')}</strong><br />{poi.info_utili.prezzo}</div>
            </div>
          )}
          {poi.info_utili?.best_time && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>⭐</span>
              <div><strong style={{ color: C.dark }}>{t('best_time')}</strong><br />{poi.info_utili.best_time}</div>
            </div>
          )}
          {(poi.info_utili?.telefono || poi.info_utili?.sito_web) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>📞</span>
              <div>
                <strong style={{ color: C.dark }}>{t('contacts')}</strong><br />
                {poi.info_utili?.telefono && <span>{poi.info_utili.telefono} </span>}
                {/* Prima era un <span> di solo testo: nel PDF da "stampa del
                    browser" i confini fra blocchi (qui e il paragrafo
                    successivo) non lasciano un carattere di spazio nel testo
                    incorporato, solo uno scarto di posizione — un lettore PDF
                    che rileva i link automaticamente unisce il sito al primo
                    termine del paragrafo dopo, ottenendo un link sbagliato
                    (es. "louvre.frIl" invece di "louvre.fr"). Un <a href> vero
                    porta il proprio URL preciso: Chrome lo incorpora come
                    annotazione di link nel PDF, immune all'ambiguità del
                    testo adiacente. */}
                {poi.info_utili?.sito_web && (
                  <a
                    href={poi.info_utili.sito_web.startsWith('http') ? poi.info_utili.sito_web : `https://${poi.info_utili.sito_web}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: C.blue }}
                  >
                    {poi.info_utili.sito_web}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main description */}
        <div style={{
          fontSize: '15px',
          color: C.dark,
          lineHeight: 1.90,
          textAlign: 'justify' as const,
          marginBottom: '32px',
          whiteSpace: 'pre-wrap',
        }}>
          {poi.descrizione_lunga}
        </div>

        {/* Curiosità box */}
        {curiosita.length > 0 && (
          <div style={{
            background: '#fffbf0',
            border: `2px solid ${C.gold}`,
            borderRadius: '10px',
            padding: '22px 26px',
            marginBottom: '24px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
            }}>
              <span style={{ fontSize: '22px' }}>💡</span>
              <h4 style={{ color: C.orange, fontWeight: 900, fontSize: '14px', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>
                {t('curiosities')}
              </h4>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {curiosita.map((c, i) => (
                <li key={i} style={{
                  fontSize: '13.5px',
                  color: C.mid,
                  lineHeight: 1.7,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}>
                  <span style={{
                    background: C.gold,
                    color: C.white,
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 900,
                    flexShrink: 0,
                    marginTop: '2px',
                  }}>
                    {i + 1}
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Two-column: Storico-Tecnico + Insider */}
        {(poi.dettaglio_storico_tecnico || poi.consiglio_insider) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: poi.dettaglio_storico_tecnico && poi.consiglio_insider
              ? 'repeat(auto-fit, minmax(240px, 1fr))'
              : '1fr',
            gap: '20px',
            marginBottom: '24px',
          }}>
            {poi.dettaglio_storico_tecnico && (
              <div style={{
                background: '#f0f4ff',
                border: `1px solid #c7d7f5`,
                borderTop: `4px solid ${C.blue}`,
                borderRadius: '8px',
                padding: '20px 22px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}>
                  <span style={{ fontSize: '18px' }}>🏛️</span>
                  <h4 style={{ color: C.navy, fontWeight: 900, fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>
                    {t('historical_detail')}
                  </h4>
                </div>
                <p style={{ fontSize: '13.5px', color: C.mid, lineHeight: 1.75, margin: 0 }}>
                  {poi.dettaglio_storico_tecnico}
                </p>
              </div>
            )}
            {poi.consiglio_insider && (
              <div style={{
                background: '#f0fff4',
                border: `1px solid #a7dfc0`,
                borderTop: `4px solid #16a34a`,
                borderRadius: '8px',
                padding: '20px 22px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}>
                  <span style={{ fontSize: '18px' }}>🗝️</span>
                  <h4 style={{ color: '#166534', fontWeight: 900, fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>
                    {t('insider_tip')}
                  </h4>
                </div>
                <p style={{ fontSize: '13.5px', color: C.mid, lineHeight: 1.75, margin: 0 }}>
                  {poi.consiglio_insider}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Migliori piatti (ristoranti) */}
        {piatti.length > 0 && (
          <div style={{
            background: '#fff5f0',
            border: `2px solid ${C.orange}`,
            borderRadius: '10px',
            padding: '20px 24px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '20px' }}>🍽️</span>
              <h4 style={{ color: C.orange, fontWeight: 900, fontSize: '13px', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>
                {t('must_order')}
              </h4>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {piatti.map((p: any, i: number) => (
                <div key={i} style={{
                  fontSize: '13.5px',
                  color: C.mid,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  lineHeight: 1.6,
                }}>
                  <span style={{ color: C.orange, fontWeight: 900, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{typeof p === 'string' ? p : (p.nome ? `${p.nome}${p.descrizione ? ` – ${p.descrizione}` : ''}${p.prezzo ? ` (${p.prezzo})` : ''}` : JSON.stringify(p))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Page footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 48px',
        background: C.bg,
        borderTop: `1px solid ${C.border}`,
        fontSize: '10px',
        color: C.light,
      }}>
        <span>WIP {t('premium_guide')} • wip.guide</span>
        <span>{poi.titolo}</span>
      </div>
    </div>
  );
};

// ─── Main Renderer ───────────────────────────────────────────────────────────
export default function PremiumGuideRenderer({
  content,
  mediaManifest,
  language,
  containerId = 'premium-guide-pdf-container',
}: PremiumGuideRendererProps) {
  const styleMeta = GUIDE_STYLE_META[content.stile] || GUIDE_STYLE_META.essential;
  const styleLabel = getTranslation(`premium_guide_style_${content.stile}`, language) || content.stile;
  const t = mkT(language);

  // Use the first image available as cover photo
  const coverImg = Object.values(mediaManifest)[0] || undefined;

  return (
    <div
      id={containerId}
      style={{
        fontFamily: "'Georgia', 'Times New Roman', serif",
        background: C.white,
        color: C.dark,
        maxWidth: '860px',
        margin: '0 auto',
        padding: 0,
        lineHeight: 1.6,
        boxShadow: '0 4px 40px rgba(0,0,0,0.12)',
      }}
    >
      {/* ── COVER ── */}
      <CoverPage content={content} coverImg={coverImg} styleLabel={styleLabel} styleMeta={styleMeta} language={language} t={t} />

      {/* ── SOMMARIO CLICCABILE ── */}
      <TocPage giorni={content.giorni || []} anchorPrefix={containerId} t={t} />

      {/* ── CITY INTRO ── */}
      <CityIntroPage citta_intro={content.citta_intro} mediaManifest={mediaManifest} t={t} />

      {/* ── DAYS ── */}
      {(content.giorni || []).map((giorno, gIdx) => (
        <React.Fragment key={gIdx}>
          {/* Anchor del giorno per i link del sommario */}
          <div id={`${containerId}-day-${gIdx}`}>
            <DayDivider giorno={giorno} tema={(giorno as any).tema_giorno} t={t} />
          </div>

          {(giorno.pois || []).map((poi, pIdx) => {
            const imgUrl = mediaManifest[poi.poi_id] || (poi as any).image_url;
            return (
              <div key={poi.poi_id || pIdx} id={`${containerId}-poi-${gIdx}-${pIdx}`}>
                <PoiBlock poi={poi} imgUrl={imgUrl} t={t} />
              </div>
            );
          })}
        </React.Fragment>
      ))}

      {/* ── BACK COVER ── */}
      <div style={{
        background: C.navy,
        padding: 'clamp(28px, 6vw, 60px) clamp(20px, 5vw, 48px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '20px',
        pageBreakBefore: 'always',
      }}>
        <img
          src="/logo.jpg"
          alt="WIP"
          style={{ width: '90px', height: '90px', borderRadius: '20px', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div style={{ color: C.gold, fontSize: '30px', fontWeight: 900, letterSpacing: '2px' }}>WIP</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', letterSpacing: '3px', textTransform: 'uppercase' }}>
          World in Pocket
        </div>
        <div style={{ width: '60px', height: '3px', background: C.gold, margin: '10px 0' }} />
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', maxWidth: '400px', lineHeight: 1.8 }}>
          {t('back_cover_tagline')}<br />
          {t('back_cover_sources')}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', marginTop: '20px' }}>
          wip.guide • {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
