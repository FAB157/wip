import React from 'react';
import { Language } from '../lib/i18n';
import PlanMap from './PlanMap';

interface Tappa {
  id_tappa: string;
  ora: string;
  titolo_tappa: string;
  attivita: string;
  consiglio_guida: string;
  tempo_necessario?: string;
  spostamento_precedente?: string | null;
  tipo: string;
}

interface Giorno {
  giorno: number;
  tappe: Tappa[];
}

interface Plan {
  titolo: string;
  giorni: Giorno[];
  info_viaggio?: {
    raccomandazioni?: string[];
    suggerimenti?: string[];
    precauzioni?: string[];
  };
}

interface PrintViewProps {
  plan: Plan;
  language: Language;
}

const getPrintTranslation = (key: string, lang: string) => {
  const dict: Record<string, Record<string, string>> = {
    page: { IT: "Pagina", EN: "Page", FR: "Page", ES: "Página", DE: "Seite", RU: "Страница", ZH: "页" },
    day: { IT: "Giorno", EN: "Day", FR: "Jour", ES: "Día", DE: "Tag", RU: "День", ZH: "天" },
    days: { IT: "giorni", EN: "days", FR: "jours", ES: "días", DE: "Tage", RU: "дней", ZH: "天" },
    single_day: { IT: "giorno", EN: "day", FR: "jour", ES: "día", DE: "Tag", RU: "день", ZH: "天" },
    itinerary_by: { IT: "di viaggio curato da World in Pocket", EN: "trip curated by World in Pocket", FR: "de voyage organisé par World in Pocket", ES: "de viaje curado por World in Pocket", DE: "Reise, kuratiert von World in Pocket", RU: "поездки от World in Pocket", ZH: "旅行路线（由 World in Pocket 策划）" },
    intro: {
      IT: "Benvenuto nella tua guida di viaggio curata da World in Pocket. Questo itinerario ti condurrà attraverso una selezione speciale di tappe e punti di interesse storici, artistici e culturali. Usa l'app \"World in Pocket\" durante la visita per sbloccare le audioguide interattive e ascoltare la storia di questi luoghi dal vivo.",
      EN: "Welcome to your travel guide curated by World in Pocket. This itinerary will lead you through a special selection of historic, artistic, and cultural points of interest. Use the \"World in Pocket\" app during your visit to unlock interactive audio guides and listen to the history of these locations live.",
      FR: "Bienvenue dans votre guide de voyage conçu par World in Pocket. Cet itinéraire vous mènera à travers une sélection spéciale de points d'intérêt historiques, artistiques et culturels. Utilisez l'application \"World in Pocket\" pendant votre visite pour débloquer des audioguides interactifs.",
      ES: "Bienvenido a tu guía de viaje seleccionada por World in Pocket. Este itinerario te llevará a través de una selección especial de puntos de interés históricos, artísticos y culturales. Utiliza la aplicación \"World in Pocket\" durante tu visita para desbloquear audioguías interactivas.",
      DE: "Willkommen zu deinem Reiseführer, kuratiert von World in Pocket. Diese Route führt dich zu einer besonderen Auswahl historischer, künstlerischer und kultureller Sehenswürdigkeiten. Nutze die App \"World in Pocket\" während des Besuchs, um interaktive Audioguides freizuschalten und die Geschichte dieser Orte live zu hören.",
      RU: "Добро пожаловать в путеводитель от World in Pocket. Этот маршрут проведет вас по лучшим историческим, художественным и культурным местам. Используйте приложение «World in Pocket» во время визита, чтобы слушать аудиогиды.",
      ZH: "欢迎使用由 World in Pocket 策划的旅行指南。此路线将带您领略精选的历史、艺术和文化景点。在游览期间使用 \"World in Pocket\" 应用程序，可解锁互动式语音导览，聆听这些景点的生动历史。"
    },
    guide_advice: { IT: "Consiglio della Guida", EN: "Guide's Advice", FR: "Conseil du Guide", ES: "Consejo de la Guía", DE: "Tipp des Guides", RU: "Совет гида", ZH: "导游建议" },
    visit_time: { IT: "Tempo di visita", EN: "Duration", FR: "Durée de visite", ES: "Tiempo de visita", DE: "Besuchsdauer", RU: "Время визита", ZH: "游览时间" },
    movement: { IT: "Spostamento", EN: "Transfer", FR: "Déplacement", ES: "Traslado", DE: "Transfer", RU: "Перемещение", ZH: "交通" }
  };
  
  const l = (lang || 'IT').toUpperCase();
  const translations = dict[key] || {};
  return translations[l] || translations['IT'] || '';
};

export default function PrintView({ plan, language }: PrintViewProps) {
  const langStr = language || 'IT';
  
  return (
    <>
      <style>{`
        @media print {
          /* Setup the print environment */
          /* Margine superiore stretto: il titolo deve stare IN ALTO.
             A 10 mm più il margine del contenitore restava una fascia
             bianca che mangiava la prima riga utile della pagina.
             Il margine inferiore resta più largo dei laterali perché ci
             vive il piè di pagina fisso. */
          @page {
            margin: 6mm 12mm 14mm 12mm;
            size: A4 portrait;
          }

          body, html, #root {
            background: #ffffff !important;
            color: #1e1b14 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          }

          /* Visibile SOLO quando la stampa è dell'itinerario (printScoped):
             la vecchia regola incondizionata stampava l'itinerario su
             qualsiasi window.print() dell'app. */
          body.printing-itinerary .print-optimized-view {
            display: block !important;
            background: #ffffff !important;
            color: #1e1b14 !important;
          }

          /* ── Header compatto ─────────────────────────────────────────
             Prima: logo 120px + titolo 24pt + margini larghi = un terzo di
             pagina bruciato prima della prima tappa. Ora: fascia snella,
             logo 58px, gerarchia tipografica netta. */
          .print-header {
            display: flex !important;
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
            border-bottom: 2px solid #1e3a8a;
            padding-top: 0;
            margin-top: 0;
            padding-bottom: 8px;
            margin-bottom: 12px;
            gap: 16px;
          }

          .print-title {
            font-size: 18pt;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0 0 3px 0;
            line-height: 1.12;
            letter-spacing: -0.01em;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .print-subtitle {
            font-size: 7.5pt;
            color: #b45309;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .print-intro-desc {
            font-size: 8pt;
            color: #57534e;
            line-height: 1.4;
            margin: 5px 0 0 0;
            font-style: italic;
            text-align: left;
            max-width: 92%;
            font-family: Georgia, "Times New Roman", serif;
          }

          .print-logo {
            width: 58px;
            height: 58px;
            object-fit: contain;
            border-radius: 10px;
          }

          /* Daily Schedule Flow (Avoiding forced page breaks, consecutive only) */
          .print-day-container {
            page-break-before: auto !important;
            break-before: auto !important;
            margin-top: 14px;
            margin-bottom: 10px;
          }

          /* Fascia giorno: banda leggera navy con filetto oro, si distingue
             a colpo d'occhio sfogliando la guida */
          .print-day-title {
            page-break-after: avoid !important;
            break-after: avoid !important;
            background: #eff6ff !important;
            border-left: 4px solid #d4af37;
            border-radius: 0 6px 6px 0;
            padding: 5px 10px;
            margin-bottom: 10px;
            display: block !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-day-text {
            font-size: 10.5pt;
            font-weight: 800;
            color: #1e3a8a;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* POI / Activity Blocks */
          .print-activity-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border-left: 2px solid #dbe3f5;
            margin-left: 4px;
            padding-left: 10px;
            margin-bottom: 10px;
            position: relative;
          }

          /* Pallino sulla timeline: raccorda visivamente le tappe del giorno */
          .print-activity-block::before {
            content: "";
            position: absolute;
            left: -5px;
            top: 3px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #1e3a8a;
            border: 1.5px solid #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-activity-title {
            font-size: 10.5pt;
            font-weight: 700;
            color: #111827;
            margin: 0 0 2px 0;
            line-height: 1.2;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .print-activity-time {
            display: inline-block;
            font-size: 8pt;
            font-weight: 800;
            color: #1e3a8a;
            margin-right: 6px;
            font-variant-numeric: tabular-nums;
          }

          /* Duration / Transfer Info - Minimal and clean */
          .print-activity-duration {
            font-size: 7.5pt;
            color: #6b7280;
            margin-bottom: 3px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* Description (Strict max 10pt for high density) */
          .print-activity-description {
            font-size: 9pt;
            color: #374151;
            line-height: 1.42;
            margin: 0 0 4px 0;
            text-align: left;
            font-family: Georgia, "Times New Roman", serif;
          }

          /* Guide Advice (Gold accent block, distinct and attention-grabbing) */
          .print-curiosity-box {
            background: #fdfaf3 !important;
            border-left: 3px solid #d4af37 !important;
            padding: 5px 9px;
            border-radius: 0 6px 6px 0;
            font-size: 8pt;
            font-weight: 500;
            font-style: italic;
            color: #44403c;
            line-height: 1.4;
            margin-top: 3px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-family: Georgia, "Times New Roman", serif;
          }

          .print-curiosity-box strong {
            color: #1e3a8a;
            font-style: normal;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 7.5pt;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          /* Sezioni finali (consigli, precauzioni…): titoli coerenti */
          .print-section-title {
            font-size: 12pt;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0 0 4px 0;
            padding-bottom: 2px;
            border-bottom: 1.5px solid #d4af37;
            display: inline-block;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .print-section-list {
            padding-left: 16px;
            margin: 6px 0;
            font-size: 8.5pt;
            color: #374151;
            line-height: 1.45;
            font-family: Georgia, "Times New Roman", serif;
          }

          /* Tabella budget: righe leggibili e cifre allineate a destra */
          .print-budget {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
            color: #374151;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .print-budget td {
            padding: 3px 6px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: top;
          }
          .print-budget td:first-child {
            font-weight: 700;
            color: #1e3a8a;
            width: 22%;
            white-space: nowrap;
          }
          .print-budget td:last-child {
            text-align: right;
            font-variant-numeric: tabular-nums;
            width: 18%;
            white-space: nowrap;
          }
          .print-budget tr.total td {
            border-top: 1.5px solid #1e3a8a;
            border-bottom: none;
            font-weight: 800;
            color: #1e3a8a;
            padding-top: 5px;
          }

          /* Professional Fixed Footer */
          .print-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid #1e3a8a;
            padding-top: 6px;
            background: #ffffff !important;
            page-break-inside: avoid;
            break-inside: avoid;
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-page-number {
            font-size: 8pt;
            color: #1e3a8a;
            font-weight: 700;
          }

          .print-page-number::after {
            content: " " counter(page);
          }

          .print-footer-brand {
            font-size: 8pt;
            color: #1e3a8a;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          
          .print-page-frame {
            position: fixed;
            top: 5mm;
            bottom: 5mm;
            left: 5mm;
            right: 5mm;
            border: 1px solid #1e3a8a;
            border-radius: 2mm;
            pointer-events: none;
            z-index: 9000;
          }
        }
      `}</style>

      {/* PRINT-ONLY RESILIENT TRAVEL GUIDE */}
      {/* id: serve al PDF nativo (html2pdf lavora sull'elemento, non sulla
          stampa del browser, che il WebView Android non ha — vedi PlanScreen). */}
      <div id="itinerary-print-view" className="absolute top-0 left-[-9999px] w-[800px] print:relative print:left-0 print:w-full text-black p-0 print-optimized-view">
        <div className="print-page-frame"></div>
        {/* Header compatto: titolo + eyebrow + intro breve, logo discreto */}
        <div className="print-header">
          <div style={{ flex: 1 }}>
            {/* IL TITOLO È LA PRIMA COSA. L'occhiello sopra al titolo lo
                spingeva giù e sprecava la riga più preziosa del foglio: ora
                il titolo apre la pagina e il resto lo segue.
                Accanto, il dominio: un PDF stampato gira per le mani di chi
                non ha l'app, e deve dire da dove viene. */}
            <h1 className="print-title">{plan.titolo}</h1>
            <p className="print-subtitle">
              wip.guide · {plan.giorni.length} {plan.giorni.length === 1 ? getPrintTranslation('single_day', langStr) : getPrintTranslation('days', langStr)} {getPrintTranslation('itinerary_by', langStr)}
            </p>
            <p className="print-intro-desc">
              {getPrintTranslation('intro', langStr)}
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <img src="/logo.jpg" alt="World in Pocket" className="print-logo" />
          </div>
        </div>

        {/* Mappa spostata in fondo al documento */}

        {/* Days Iteration */}
        {plan.giorni.map((giorno) => (
          <div key={`print-day-${giorno.giorno}`} className="print-day-container">
            <div className="print-day-title">
              <span className="print-day-text">
                {/* Tema della giornata = prima tappa culturale, non "Colazione al bar" */}
                {getPrintTranslation('day', langStr)} {giorno.giorno}: {(giorno.tappe.find(t => !['colazione', 'pranzo', 'cena', 'pausa', 'ristorante', 'spostamento'].includes((t.tipo || '').toLowerCase())) || giorno.tappe[0])?.titolo_tappa || "Esplorazione"}
              </span>
            </div>

            <div className="space-y-3">
              {giorno.tappe.map((tappa, tIdx) => (
                <div key={`print-tappa-${tappa.id_tappa}-${tIdx}`} className="print-activity-block">
                  <h4 className="print-activity-title">
                    {/* L'orario c'era a schermo ma non in stampa: su carta è
                        l'informazione più consultata */}
                    {tappa.ora && <span className="print-activity-time">{tappa.ora}</span>}
                    {tappa.titolo_tappa}
                  </h4>

                  {(tappa.tempo_necessario || (tappa.spostamento_precedente && tappa.spostamento_precedente !== "null")) && (
                    <div className="print-activity-duration">
                      {tappa.tempo_necessario && (
                        <span>
                          {getPrintTranslation('visit_time', langStr)}: {tappa.tempo_necessario}
                        </span>
                      )}
                      {tappa.tempo_necessario && tappa.spostamento_precedente && tappa.spostamento_precedente !== "null" && (
                        <span> • </span>
                      )}
                      {tappa.spostamento_precedente && tappa.spostamento_precedente !== "null" && (
                        <span>
                          {getPrintTranslation('movement', langStr)}: {tappa.spostamento_precedente}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Description */}
                  <p className="print-activity-description">{tappa.attivita}</p>
                  
                  {/* Guide Advice */}
                  {tappa.consiglio_guida && (
                    <div className="print-curiosity-box">
                      <strong>{getPrintTranslation('guide_advice', langStr)}: </strong>
                      <span>"{tappa.consiglio_guida}"</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tabella Budget Print */}
            {(giorno as any).tabella_budget && (
              <div style={{ marginTop: '10px', marginBottom: '14px', breakInside: 'avoid' }}>
                <strong style={{ display: 'block', color: '#1e3a8a', marginBottom: '3px', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'sans-serif' }}>Budget della Giornata</strong>
                <table className="print-budget">
                  <tbody>
                    {(['attrazioni', 'trasporti', 'colazione', 'pranzo', 'cena'] as const).map((voce) => {
                      const riga = (giorno as any).tabella_budget[voce];
                      if (!riga) return null;
                      return (
                        <tr key={voce}>
                          <td style={{ textTransform: 'capitalize' }}>{voce}</td>
                          <td>{riga.dettaglio || riga}</td>
                          <td>{riga.stima_pp || ''}</td>
                        </tr>
                      );
                    })}
                    <tr className="total">
                      <td colSpan={2}>TOTALE GIORNO</td>
                      <td>{(giorno as any).tabella_budget.totale_giorno}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {/* Mappa spostata in fondo */}

        {/* Consigli e Precauzioni */}
        {plan.info_viaggio && (
          <div className="print-day-container" style={{ marginTop: '20px' }}>
            {plan.info_viaggio.raccomandazioni && plan.info_viaggio.raccomandazioni.length > 0 && (
              <div style={{ marginBottom: '12px', breakInside: 'avoid' }}>
                <h3 className="print-section-title">Consigli</h3>
                <ul className="print-section-list">
                  {plan.info_viaggio.raccomandazioni.map((r, i) => (
                    <li key={`racc-${i}`} style={{ marginBottom: '3px' }}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.info_viaggio.suggerimenti && plan.info_viaggio.suggerimenti.length > 0 && (
              <div style={{ marginBottom: '12px', breakInside: 'avoid' }}>
                <h3 className="print-section-title">Suggerimenti Extra</h3>
                <ul className="print-section-list">
                  {plan.info_viaggio.suggerimenti.map((s, i) => (
                    <li key={`sugg-${i}`} style={{ marginBottom: '3px' }}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.info_viaggio.precauzioni && plan.info_viaggio.precauzioni.length > 0 && (
              <div style={{ marginBottom: '12px', breakInside: 'avoid' }}>
                <h3 className="print-section-title" style={{ color: '#be123c', borderBottomColor: '#be123c' }}>Precauzioni</h3>
                <ul className="print-section-list">
                  {plan.info_viaggio.precauzioni.map((p, i) => (
                    <li key={`prec-${i}`} style={{ marginBottom: '3px' }}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Zone da evitare: generate dall'AI e mostrate a schermo, ma
                prima non venivano mai stampate */}
            {(plan.info_viaggio as any).zone_da_evitare && (plan.info_viaggio as any).zone_da_evitare.length > 0 && (
              <div style={{ marginBottom: '12px', breakInside: 'avoid' }}>
                <h3 className="print-section-title" style={{ color: '#b45309', borderBottomColor: '#b45309' }}>Zone da evitare</h3>
                <ul className="print-section-list">
                  {(plan.info_viaggio as any).zone_da_evitare.map((z: string, i: number) => (
                    <li key={`zona-${i}`} style={{ marginBottom: '3px' }}>{z}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Totale Viaggio */}
        {(plan as any).totale_viaggio && (
          <div className="print-day-container" style={{ marginTop: '14px', padding: '10px 16px', border: '1.5px solid #1e3a8a', borderLeft: '5px solid #d4af37', borderRadius: '8px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', breakInside: 'avoid', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
            <h3 style={{ margin: 0, fontSize: '10pt', color: '#1e3a8a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'sans-serif' }}>
              Totale stimato viaggio
            </h3>
            <p style={{ margin: 0, fontSize: '14pt', color: '#1e3a8a', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: 'sans-serif' }}>
              {(plan as any).totale_viaggio}
            </p>
          </div>
        )}

        {/* Mappa del percorso (Pagina a sé stante) */}
        {/* LA MAPPA, alta quanto la pagina e non un pixel di più.
            Prima era `height: 850px` con margine sotto di 24px: su A4 la
            zona stampabile è 272 mm (297 meno i margini) e 850 px + 24 px
            la superano, così l'ultimo pezzo di riquadro scivolava su un
            foglio nuovo — è l'ULTIMA PAGINA VUOTA del PDF del 22/08/2026.
            In stampa i millimetri sono affidabili, i pixel no: si misura in
            mm, si lascia spazio al piè di pagina fisso, e si vieta qualsiasi
            interruzione dentro e dopo. */}
        <div className="print-day-container print-map-page" style={{ marginTop: '18px', marginBottom: 0, height: '245mm', pageBreakBefore: 'always', breakBefore: 'page', pageBreakAfter: 'avoid', breakAfter: 'avoid', pageBreakInside: 'avoid', breakInside: 'avoid', border: '1.5px solid #1e3a8a', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
            <h3 style={{ position: 'absolute', top: 44, left: 12, zIndex: 1000, margin: 0, fontSize: '11pt', color: '#1e3a8a', fontWeight: 800, background: 'white', padding: '4px 12px', borderRadius: '999px', border: '1px solid #1e3a8a', fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mappa del Percorso</h3>
            <PlanMap giorni={plan.giorni} isPrint={true} />
        </div>

        {/* Professional Brand Footer */}
        <div className="print-footer">
          <span className="print-page-number">{getPrintTranslation('page', langStr)}</span>
          <span className="print-footer-brand">WIP - World in Pocket</span>
        </div>
      </div>
    </>
  );
}
