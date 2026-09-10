import { Language, getTranslation } from '../lib/i18n';
import { MuseumVisit, ArtworkGuide } from '../lib/museumVisit';

/**
 * LA GUIDA DEL MUSEO SU CARTA (11/09/2026, richiesta del committente).
 *
 * Stessa impostazione grafica dell'itinerario e della Guida Premium: navy
 * #1e3a8a per i titoli, filetto oro #d4af37, fascia azzurra per le
 * intestazioni, serif per i testi lunghi. Chi ha già stampato un itinerario
 * riconosce il documento senza doverlo studiare.
 *
 * REGOLE DI STAMPA DEL PROGETTO, rispettate qui una per una:
 * - la pagina si misura in mm, mai in px: A4 meno i margini fa ~272 mm, e un
 *   contenitore fissato in pixel produce una pagina finale quasi vuota;
 * - il TITOLO APRE la pagina: nessuna fascia sopra, margine alto stretto;
 * - il documento dice da dove viene (wip.guide nella testata), perché finisce
 *   in mano a chi l'app non ce l'ha;
 * - si stampa IL DOCUMENTO, non la pagina: `printScoped('museum')` accende
 *   solo questo contenitore e spegne l'applicazione;
 * - il nome del file lo decide `document.title` sul ripiego del browser: si
 *   imposta prima di stampare e si rimette a posto dopo.
 *
 * Perché serve, al di là della richiesta: dentro molti musei il telefono si
 * tiene in tasca — per rispetto, per le regole della sala, o perché la
 * batteria è al 4%. Un foglio piegato in quattro no. E il PDF è la cosa che
 * una persona manda agli amici prima di partire, cioè l'unico pezzo dell'app
 * che viaggia anche senza l'app.
 */
export default function MuseumPrintView({
  visit,
  language,
  opere,
}: {
  visit: MuseumVisit;
  language: Language;
  /** Le audioguide già aperte: chi ha ascoltato, se le porta dietro scritte. */
  opere: Record<number, ArtworkGuide>;
}) {
  const t = (k: string) => getTranslation(k, language);
  const tappe = visit.guide?.tappe || [];
  const conSala = tappe.filter(x => String(x.dove || '').trim()).length;

  return (
    <div id="museum-print-view" style={{ display: 'none' }}>
      <style>{`
        @media print {
          @page { margin: 6mm 12mm 14mm 12mm; size: A4 portrait; }
          body, html, #root {
            background: #ffffff !important;
            color: #1e1b14 !important;
          }
          #museum-print-view { display: block !important; }

          .mp-header {
            display: flex !important;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 2px solid #1e3a8a;
            padding: 0 0 8px 0;
            margin: 0 0 12px 0;
          }
          .mp-eyebrow {
            font-size: 7.5pt;
            color: #b45309;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            margin: 0 0 2px 0;
          }
          .mp-title {
            font-size: 18pt;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0 0 3px 0;
            line-height: 1.12;
            letter-spacing: -0.01em;
          }
          .mp-meta { font-size: 8pt; color: #57534e; margin: 0; font-weight: 600; }
          .mp-from {
            font-size: 7.5pt;
            color: #1e3a8a;
            font-weight: 800;
            text-align: right;
            white-space: nowrap;
          }
          .mp-intro {
            font-family: Georgia, "Times New Roman", serif;
            font-size: 9pt;
            line-height: 1.45;
            color: #44403c;
            margin: 0 0 10px 0;
          }
          .mp-advice {
            background: #eff6ff !important;
            border-left: 4px solid #d4af37;
            border-radius: 0 6px 6px 0;
            padding: 6px 10px;
            margin: 0 0 12px 0;
            font-size: 8.5pt;
            color: #1e3a8a;
            font-weight: 700;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .mp-room {
            page-break-after: avoid !important;
            break-after: avoid !important;
            background: #eff6ff !important;
            border-left: 4px solid #d4af37;
            border-radius: 0 6px 6px 0;
            padding: 5px 10px;
            margin: 14px 0 8px 0;
            font-size: 10.5pt;
            font-weight: 800;
            color: #1e3a8a;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .mp-stop {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border-left: 2px solid #dbe3f5;
            margin: 0 0 10px 4px;
            padding-left: 10px;
            position: relative;
          }
          .mp-stop::before {
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
          .mp-stop-name { font-size: 11pt; font-weight: 800; color: #1c1917; margin: 0; line-height: 1.2; }
          .mp-stop-label { font-size: 8pt; color: #78716c; font-style: italic; margin: 1px 0 0 0; }
          .mp-stop-meta { font-size: 8pt; color: #57534e; font-weight: 700; margin: 2px 0 0 0; }
          .mp-stop-where { font-size: 8pt; color: #1e3a8a; font-weight: 800; margin: 2px 0 0 0; }
          .mp-stop-why {
            font-family: Georgia, "Times New Roman", serif;
            font-size: 8.5pt;
            line-height: 1.4;
            color: #44403c;
            margin: 3px 0 0 0;
          }
          .mp-look {
            margin: 4px 0 0 0;
            padding: 4px 8px;
            border: 1px solid #e7e5e4;
            border-radius: 4px;
            font-size: 8pt;
            color: #44403c;
          }
          .mp-look-title {
            font-size: 7pt;
            font-weight: 800;
            color: #1e3a8a;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin: 0 0 2px 0;
          }
          .mp-note { font-size: 7.5pt; color: #78716c; font-style: italic; margin: 10px 0 0 0; }
          .mp-footer {
            margin-top: 14px;
            padding-top: 6px;
            border-top: 1px solid #e7e5e4;
            font-size: 7.5pt;
            color: #78716c;
            display: flex;
            justify-content: space-between;
          }
        }
      `}</style>

      {/* Il titolo apre la pagina: niente fasce sopra */}
      <div className="mp-header">
        <div>
          <p className="mp-eyebrow">{t('mv_title')}</p>
          <h1 className="mp-title">{visit.venue.name}</h1>
          <p className="mp-meta">
            {t('mv_n_opere').replace('{n}', String(tappe.length))}
            {conSala > 0 ? ` · ${t('mv_con_sale')}` : ''}
          </p>
        </div>
        <div className="mp-from">wip.guide</div>
      </div>

      {visit.guide?.intro && <p className="mp-intro">{visit.guide.intro}</p>}
      {visit.guide?.consiglio && <div className="mp-advice">{visit.guide.consiglio}</div>}

      {/* Il museo non pubblica le sale: si dice anche su carta, dove non
          c'è modo di chiedere spiegazioni all'app. */}
      {visit.guide?.saleDichiarate === false && <p className="mp-note">{t('mv_no_rooms')}</p>}

      {tappe.map((tappa, i) => {
        const salaQui = tappa.soloCollezione ? '' : String(tappa.dove || '').trim();
        const salaPrima = i === 0 ? null : (tappe[i - 1].soloCollezione ? '' : String(tappe[i - 1].dove || '').trim());
        const apreSala = !!salaQui && salaQui !== salaPrima;
        const primaSenzaSala = !!tappa.soloCollezione && (i === 0 || !tappe[i - 1].soloCollezione);
        const numero = tappe.slice(0, i + 1).filter(x => !x.soloCollezione).length;
        const g = opere[i];
        return (
          <div key={`${i}-${tappa.nome}`}>
            {apreSala && <div className="mp-room">{salaQui}</div>}
            {primaSenzaSala && <div className="mp-room">{t('mv_also_in_collection')}</div>}
            <div className="mp-stop">
              <p className="mp-stop-name">
                {tappa.soloCollezione ? '' : `${numero}. `}{tappa.nome}
              </p>
              {tappa.nomeOriginale && (
                <p className="mp-stop-label">{t('mv_on_the_label')}: {tappa.nomeOriginale}</p>
              )}
              {(tappa.autore || tappa.anno) && (
                <p className="mp-stop-meta">{[tappa.autore, tappa.anno].filter(Boolean).join(' · ')}</p>
              )}
              {(tappa.puntoPreciso || tappa.dove) && (
                <p className="mp-stop-where">{[tappa.dove, tappa.puntoPreciso].filter(Boolean).join(' · ')}</p>
              )}
              {tappa.soloCollezione && <p className="mp-stop-meta">{t('mv_only_collection')}</p>}
              {tappa.perche && <p className="mp-stop-why">{tappa.perche}</p>}
              {/* L'audioguida ascoltata finisce sul foglio: chi l'ha pagata
                  se la porta dietro anche col telefono spento. */}
              {g?.testo && <p className="mp-stop-why">{g.testo}</p>}
              {g?.daGuardare?.length > 0 && (
                <div className="mp-look">
                  <p className="mp-look-title">{t('mv_art_look_for')}</p>
                  {g.daGuardare.map((d, k) => (
                    <div key={k}>· {d}</div>
                  ))}
                </div>
              )}
              {g?.curiosita && (
                <div className="mp-look">
                  <p className="mp-look-title">{t('mv_art_curiosity')}</p>
                  <div>{g.curiosita}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="mp-footer">
        <span>wip.guide</span>
        <span>{visit.source?.title || ''}</span>
      </div>
    </div>
  );
}
