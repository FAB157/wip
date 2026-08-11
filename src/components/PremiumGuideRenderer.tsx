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

// ─── Cover Page ──────────────────────────────────────────────────────────────
const CoverPage = ({
  content,
  coverImg,
  styleLabel,
  styleMeta,
}: {
  content: any;
  coverImg?: string;
  styleLabel: string;
  styleMeta: any;
}) => (
  <div style={{
    background: C.navy,
    minHeight: '780px',
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
    {/* Top bar */}
    <div style={{
      position: 'relative', zIndex: 2,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '28px 48px',
      borderBottom: `3px solid ${C.gold}`,
    }}>
      {/* WIP Logo text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <img
          src="/logo.jpg"
          alt="WIP Logo"
          style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div>
          <div style={{ color: C.gold, fontWeight: 900, fontSize: '22px', letterSpacing: '2px', lineHeight: 1 }}>
            WIP
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase' }}>
            World in Pocket
          </div>
        </div>
      </div>
      <div style={{
        background: styleMeta.color + '22',
        border: `1px solid ${styleMeta.color}`,
        color: C.gold,
        padding: '6px 18px',
        borderRadius: '30px',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}>
        {styleMeta.emoji} {styleLabel}
      </div>
    </div>

    {/* Main cover content */}
    <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 48px 56px' }}>
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
        marginBottom: '24px',
        width: 'fit-content',
      }}>
        Smart Guide Premium
      </div>
      <h1 style={{
        color: C.white,
        fontSize: '62px',
        fontWeight: 900,
        lineHeight: 1.05,
        letterSpacing: '-1px',
        marginBottom: '16px',
        maxWidth: '700px',
      }}>
        {content.guida_titolo || 'Guida Premium'}
      </h1>
      {content.sottotitolo && (
        <div style={{
          color: C.gold,
          fontSize: '20px',
          fontWeight: 400,
          fontStyle: 'italic',
          marginBottom: '40px',
        }}>
          {content.sottotitolo}
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

    {/* Footer bar */}
    <div style={{
      position: 'relative', zIndex: 2,
      borderTop: `1px solid rgba(255,255,255,0.15)`,
      padding: '14px 48px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '1px' }}>
        wip.guide
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
        {new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long' })}
      </div>
    </div>
  </div>
);

// ─── City Intro Page ─────────────────────────────────────────────────────────
const CityIntroPage = ({
  citta_intro,
  mediaManifest,
}: {
  citta_intro: any;
  mediaManifest: Record<string, string>;
}) => {
  if (!citta_intro) return null;
  const img1 = mediaManifest['citta_intro_1'];
  const img2 = mediaManifest['citta_intro_2'];
  const img3 = mediaManifest['citta_intro_3'];

  return (
    <div style={{
      background: C.white,
      padding: '48px 48px',
      pageBreakBefore: 'always',
      pageBreakAfter: 'always',
    }}>
      <h2 style={{ color: C.navy, fontSize: '38px', fontWeight: 900, marginBottom: '24px', lineHeight: 1.1 }}>
        {citta_intro.titolo || 'Scopri la Destinazione'}
      </h2>

      {/* Hero Image */}
      {img1 && (
        <div style={{ marginBottom: '32px', height: '280px', borderRadius: '12px', overflow: 'hidden' }}>
          <img src={img1} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="City panorama" />
        </div>
      )}

      {/* History & Culture columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '20px' }}>🏛️</span>
            <h3 style={{ color: C.gold, fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              Storia & Identità
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
              Cultura & Tradizioni
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
              Consigli Pratici
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
const DayDivider = ({ giorno, tema }: { giorno: any; tema?: string }) => (
  <div style={{
    background: C.navy,
    padding: '40px 48px 32px',
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
        Giorno {giorno.giorno}
      </div>
      <h2 style={{ color: C.white, fontSize: '32px', fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
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
const PoiBlock: React.FC<{ poi: any; imgUrl?: string }> = ({ poi, imgUrl }) => {
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
        <div style={{ position: 'relative', height: '380px', overflow: 'hidden', background: C.border }}>
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
            {poi.categoria_pdf || 'PUNTO DI INTERESSE'}
          </div>
        </div>
      )}

      {/* Content area */}
      <div style={{ padding: '36px 48px' }}>

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
            {poi.categoria_pdf || 'PUNTO DI INTERESSE'}
          </div>
        )}

        {/* Stars */}
        <div style={{ marginBottom: '8px' }}>{renderStars(poi.valutazione)}</div>

        {/* Title */}
        <h3 style={{
          fontSize: '34px',
          fontWeight: 900,
          color: C.dark,
          margin: '0 0 6px',
          lineHeight: 1.1,
          letterSpacing: '-0.5px',
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
          gridTemplateColumns: '1fr 1fr',
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>📍</span>
              <div><strong style={{ color: C.dark }}>Indirizzo</strong><br />{poi.indirizzo}</div>
            </div>
          )}
          {poi.trasporti && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🚌</span>
              <div><strong style={{ color: C.dark }}>Come arrivare</strong><br />{poi.trasporti}</div>
            </div>
          )}
          {poi.info_utili?.orari && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🕐</span>
              <div><strong style={{ color: C.dark }}>Orari</strong><br />{poi.info_utili.orari}</div>
            </div>
          )}
          {poi.info_utili?.prezzo && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🎫</span>
              <div><strong style={{ color: C.dark }}>Ingresso</strong><br />{poi.info_utili.prezzo}</div>
            </div>
          )}
          {poi.info_utili?.best_time && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>⭐</span>
              <div><strong style={{ color: C.dark }}>Momento ideale</strong><br />{poi.info_utili.best_time}</div>
            </div>
          )}
          {(poi.info_utili?.telefono || poi.info_utili?.sito_web) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>📞</span>
              <div>
                <strong style={{ color: C.dark }}>Contatti</strong><br />
                {poi.info_utili?.telefono && <span>{poi.info_utili.telefono} </span>}
                {poi.info_utili?.sito_web && <span style={{ color: C.blue }}>{poi.info_utili.sito_web}</span>}
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
                Lo sapevi? Curiosità & Segreti
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
            gridTemplateColumns: poi.dettaglio_storico_tecnico && poi.consiglio_insider ? '1fr 1fr' : '1fr',
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
                    Dettaglio Storico & Architettonico
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
                    Consiglio Insider
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
                Da Ordinare Assolutamente
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
        <span>WIP Premium Smart Guide • wip.guide</span>
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
      <CoverPage content={content} coverImg={coverImg} styleLabel={styleLabel} styleMeta={styleMeta} />

      {/* ── CITY INTRO ── */}
      <CityIntroPage citta_intro={content.citta_intro} mediaManifest={mediaManifest} />

      {/* ── DAYS ── */}
      {(content.giorni || []).map((giorno, gIdx) => (
        <React.Fragment key={gIdx}>
          <DayDivider giorno={giorno} tema={(giorno as any).tema_giorno} />

          {(giorno.pois || []).map((poi, pIdx) => {
            const imgUrl = mediaManifest[poi.poi_id] || (poi as any).image_url;
            return (
              <PoiBlock key={poi.poi_id || pIdx} poi={poi} imgUrl={imgUrl} />
            );
          })}
        </React.Fragment>
      ))}

      {/* ── BACK COVER ── */}
      <div style={{
        background: C.navy,
        padding: '60px 48px',
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
          La tua guida di viaggio intelligente.<br />
          Generata con Wikipedia, Wikivoyage, Foursquare e TripAdvisor.
        </div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', marginTop: '20px' }}>
          wip.guide • {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
