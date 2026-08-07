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
    page: { IT: "Pagina", EN: "Page", FR: "Page", ES: "Página", RU: "Страница", ZH: "页" },
    day: { IT: "Giorno", EN: "Day", FR: "Jour", ES: "Día", RU: "День", ZH: "天" },
    days: { IT: "giorni", EN: "days", FR: "jours", ES: "días", RU: "дней", ZH: "天" },
    single_day: { IT: "giorno", EN: "day", FR: "jour", ES: "día", RU: "день", ZH: "天" },
    itinerary_by: { IT: "di viaggio curato da World in Pocket", EN: "trip curated by World in Pocket", FR: "de voyage organisé par World in Pocket", ES: "de viaje curado por World in Pocket", RU: "поездки от World in Pocket", ZH: "旅行路线（由 World in Pocket 策划）" },
    intro: {
      IT: "Benvenuto nella tua guida di viaggio curata da World in Pocket. Questo itinerario ti condurrà attraverso una selezione speciale di tappe e punti di interesse storici, artistici e culturali. Usa l'app \"World in Pocket\" durante la visita per sbloccare le audioguide interattive e ascoltare la storia di questi luoghi dal vivo.",
      EN: "Welcome to your travel guide curated by World in Pocket. This itinerary will lead you through a special selection of historic, artistic, and cultural points of interest. Use the \"World in Pocket\" app during your visit to unlock interactive audio guides and listen to the history of these locations live.",
      FR: "Bienvenue dans votre guide de voyage conçu par World in Pocket. Cet itinéraire vous mènera à travers une sélection spéciale de points d'intérêt historiques, artistiques et culturels. Utilisez l'application \"World in Pocket\" pendant votre visite pour débloquer des audioguides interactifs.",
      ES: "Bienvenido a tu guía de viaje seleccionada por World in Pocket. Este itinerario te llevará a través de una selección especial de puntos de interés históricos, artísticos y culturales. Utiliza la aplicación \"World in Pocket\" durante tu visita para desbloquear audioguías interactivas.",
      RU: "Добро пожаловать в путеводитель от World in Pocket. Этот маршрут проведет вас по лучшим историческим, художественным и культурным местам. Используйте приложение «World in Pocket» во время визита, чтобы слушать аудиогиды.",
      ZH: "欢迎使用由 World in Pocket 策划的旅行指南。此路线将带您领略精选的历史、艺术和文化景点。在游览期间使用 \"World in Pocket\" 应用程序，可解锁互动式语音导览，聆听这些景点的生动历史。"
    },
    guide_advice: { IT: "Consiglio della Guida", EN: "Guide's Advice", FR: "Conseil du Guide", ES: "Consejo de la Guía", RU: "Совет гида", ZH: "导游建议" },
    visit_time: { IT: "Tempo di visita", EN: "Duration", FR: "Durée de visite", ES: "Tiempo de visita", RU: "Время визита", ZH: "游览时间" },
    movement: { IT: "Spostamento", EN: "Transfer", FR: "Déplacement", ES: "Traslado", RU: "Перемещение", ZH: "交通" }
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
          @page {
            margin: 10mm 12mm 15mm 12mm;
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

          /* Elegant Branding Header */
          .print-header {
            display: flex !important;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            border-bottom: 3px solid #1e3a8a;
            padding-bottom: 16px;
            margin-bottom: 24px;
            gap: 24px;
          }

          .print-title {
            font-size: 17pt;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0 0 2px 0;
            line-height: 1.15;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .print-subtitle {
            font-size: 8.5pt;
            color: #0a6c44;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin: 0 0 6px 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .print-intro-desc {
            font-size: 9pt;
            color: #4a5554;
            line-height: 1.35;
            margin: 6px 0 0 0;
            font-style: italic;
            text-align: justify;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* Daily Schedule Flow (Avoiding forced page breaks, consecutive only) */
          .print-day-container {
            page-break-before: auto !important;
            break-before: auto !important;
            margin-top: 18px;
            margin-bottom: 12px;
          }

          .print-day-title {
            page-break-after: avoid !important;
            break-after: avoid !important;
            border-bottom: 1.5px solid #bdc9c6;
            padding-bottom: 3px;
            margin-bottom: 10px;
            display: block !important;
          }

          .print-day-text {
            font-size: 11pt;
            font-weight: 700;
            color: #1e3a8a;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* POI / Activity Blocks */
          .print-activity-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border-left: 2px solid #1e3a8a;
            margin-left: 4px;
            padding-left: 10px;
            margin-bottom: 12px;
            position: relative;
          }

          .print-activity-title {
            font-size: 10.5pt;
            font-weight: 700;
            color: #1e3a8a;
            margin: 0 0 2px 0;
            line-height: 1.2;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* Duration / Transfer Info - Minimal and clean */
          .print-activity-duration {
            font-size: 8pt;
            color: #0a6c44;
            margin-bottom: 4px;
            font-weight: 600;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* Description (Strict max 10pt for high density) */
          .print-activity-description {
            font-size: 9.5pt;
            color: #2e3534;
            line-height: 1.35;
            margin: 0 0 4px 0;
            text-align: justify;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          /* Guide Advice (Gold accent block, distinct and attention-grabbing) */
          .print-curiosity-box {
            background: #fbfaf7 !important;
            border-left: 3px solid #0a6c44 !important;
            padding: 6px 10px;
            border-radius: 0 6px 6px 0;
            font-size: 8.5pt;
            font-weight: 600;
            font-style: italic;
            color: #1e3a8a;
            line-height: 1.35;
            margin-top: 4px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
            border: 2px solid #1e3a8a;
            pointer-events: none;
            z-index: 9000;
          }
        }
      `}</style>

      {/* PRINT-ONLY RESILIENT TRAVEL GUIDE */}
      <div className="absolute top-0 left-[-9999px] w-[800px] print:relative print:left-0 print:w-full text-black p-0 print-optimized-view">
        <div className="print-page-frame"></div>
        {/* Elegant Header */}
        <div className="print-header">
          <div style={{ flex: 1 }}>
            <h1 className="print-title" style={{ fontSize: '24pt', marginBottom: '8px' }}>{plan.titolo}</h1>
            <p className="print-subtitle" style={{ fontSize: '10pt', color: '#1e3a8a' }}>
              {plan.giorni.length} {plan.giorni.length === 1 ? getPrintTranslation('single_day', langStr) : getPrintTranslation('days', langStr)} {getPrintTranslation('itinerary_by', langStr)}
            </p>
            <p className="print-intro-desc" style={{ fontSize: '10pt', marginTop: '12px', borderLeft: '3px solid #eab308', paddingLeft: '12px' }}>
              {getPrintTranslation('intro', langStr)}
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <img src="/logo.jpg" alt="World in Pocket" style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: '16px' }} />
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
                  <h4 className="print-activity-title">{tappa.titolo_tappa}</h4>
                  
                  {/* Duration and Spostamento (Technical Hours and Activity type tags are completely omitted!) */}
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
              <div style={{ marginTop: '12px', marginBottom: '16px', borderTop: '1px solid #eee', paddingTop: '8px', fontSize: '9pt', fontFamily: 'sans-serif', breakInside: 'avoid' }}>
                <strong style={{ display: 'block', color: '#1e3a8a', marginBottom: '4px' }}>Budget della Giornata</strong>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#2e3534' }}>
                  <tbody>
                    {(giorno as any).tabella_budget.attrazioni && (
                      <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '2px 0', fontWeight: 'bold', width: '25%' }}>Attrazioni</td>
                        <td style={{ padding: '2px 0', width: '50%' }}>{(giorno as any).tabella_budget.attrazioni.dettaglio || (giorno as any).tabella_budget.attrazioni}</td>
                        <td style={{ padding: '2px 0', width: '25%' }}>{(giorno as any).tabella_budget.attrazioni.stima_pp || ''}</td>
                      </tr>
                    )}
                    {(giorno as any).tabella_budget.trasporti && (
                      <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '2px 0', fontWeight: 'bold' }}>Trasporti</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.trasporti.dettaglio || (giorno as any).tabella_budget.trasporti}</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.trasporti.stima_pp || ''}</td>
                      </tr>
                    )}
                    {(giorno as any).tabella_budget.colazione && (
                      <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '2px 0', fontWeight: 'bold' }}>Colazione</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.colazione.dettaglio || (giorno as any).tabella_budget.colazione}</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.colazione.stima_pp || ''}</td>
                      </tr>
                    )}
                    {(giorno as any).tabella_budget.pranzo && (
                      <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '2px 0', fontWeight: 'bold' }}>Pranzo</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.pranzo.dettaglio || (giorno as any).tabella_budget.pranzo}</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.pranzo.stima_pp || ''}</td>
                      </tr>
                    )}
                    {(giorno as any).tabella_budget.cena && (
                      <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '2px 0', fontWeight: 'bold' }}>Cena</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.cena.dettaglio || (giorno as any).tabella_budget.cena}</td>
                        <td style={{ padding: '2px 0' }}>{(giorno as any).tabella_budget.cena.stima_pp || ''}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2} style={{ padding: '4px 0', fontWeight: 'bold', color: '#1e3a8a' }}>TOTALE GIORNO</td>
                      <td style={{ padding: '4px 0', fontWeight: 'bold', color: '#1e3a8a' }}>{(giorno as any).tabella_budget.totale_giorno}</td>
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
              <div style={{ marginBottom: '16px' }}>
                <h3 className="print-title" style={{ fontSize: '14pt' }}>Consigli</h3>
                <ul style={{ paddingLeft: '20px', margin: '8px 0', fontSize: '9.5pt', color: '#2e3534' }}>
                  {plan.info_viaggio.raccomandazioni.map((r, i) => (
                    <li key={`racc-${i}`} style={{ marginBottom: '4px' }}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {plan.info_viaggio.suggerimenti && plan.info_viaggio.suggerimenti.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h3 className="print-title" style={{ fontSize: '14pt' }}>Suggerimenti Extra</h3>
                <ul style={{ paddingLeft: '20px', margin: '8px 0', fontSize: '9.5pt', color: '#2e3534' }}>
                  {plan.info_viaggio.suggerimenti.map((s, i) => (
                    <li key={`sugg-${i}`} style={{ marginBottom: '4px' }}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.info_viaggio.precauzioni && plan.info_viaggio.precauzioni.length > 0 && (
              <div style={{ marginBottom: '16px', breakInside: 'avoid' }}>
                <h3 className="print-title" style={{ fontSize: '14pt', color: '#e11d48' }}>Precauzioni</h3>
                <ul style={{ paddingLeft: '20px', margin: '8px 0', fontSize: '9.5pt', color: '#2e3534' }}>
                  {plan.info_viaggio.precauzioni.map((p, i) => (
                    <li key={`prec-${i}`} style={{ marginBottom: '4px' }}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Zone da evitare: generate dall'AI e mostrate a schermo, ma
                prima non venivano mai stampate */}
            {(plan.info_viaggio as any).zone_da_evitare && (plan.info_viaggio as any).zone_da_evitare.length > 0 && (
              <div style={{ marginBottom: '16px', breakInside: 'avoid' }}>
                <h3 className="print-title" style={{ fontSize: '14pt', color: '#b45309' }}>Zone da evitare</h3>
                <ul style={{ paddingLeft: '20px', margin: '8px 0', fontSize: '9.5pt', color: '#2e3534' }}>
                  {(plan.info_viaggio as any).zone_da_evitare.map((z: string, i: number) => (
                    <li key={`zona-${i}`} style={{ marginBottom: '4px' }}>{z}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Totale Viaggio */}
        {(plan as any).totale_viaggio && (
          <div className="print-day-container" style={{ marginTop: '20px', padding: '16px', border: '2px solid #1e3a8a', borderRadius: '8px', backgroundColor: '#f8f5f0' }}>
            <h3 style={{ margin: 0, fontSize: '14pt', color: '#1e3a8a', fontWeight: 'bold', textAlign: 'center' }}>
              TOTALE STIMATO VIAGGIO
            </h3>
            <p style={{ margin: '8px 0 0 0', fontSize: '16pt', color: '#1e3a8a', fontWeight: 'black', textAlign: 'center', fontFamily: 'monospace' }}>
              {(plan as any).totale_viaggio}
            </p>
          </div>
        )}

        {/* Mappa del percorso (Pagina a sé stante) */}
        <div className="print-day-container" style={{ marginTop: '40px', marginBottom: '30px', height: '850px', pageBreakBefore: 'always', breakBefore: 'page', border: '2px solid #1e3a8a', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
            <h3 style={{ position: 'absolute', top: 10, left: 20, zIndex: 1000, margin: 0, fontSize: '18pt', color: '#1e3a8a', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>Mappa del Percorso</h3>
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
