import { useEffect, useState } from 'react';
import { Clock, Ticket, ExternalLink } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import type { Language } from '../lib/i18n';
import { fetchOrariDi, type Domani, type BigliettoIngresso, type Esperienza } from '../lib/museumVisit';

/**
 * ATTRAZIONI A PAGAMENTO PER FAMIGLIE (23/11/2026, committente: «per quelli a pagamento, crea scheda con
 * audioguida e link per biglietti dai partner e tutte le info — aperto, costo biglietto ecc. — come per i musei»).
 * Zoo, acquari, parchi divertimento e parchi acquatici ricevono nella scheda ciò che finora aveva solo la visita
 * museo: orari di oggi e di domani e prezzo del biglietto letti dal SITO UFFICIALE (`/api/museums/tomorrow`),
 * e il biglietto d'ingresso con le esperienze dei partner col nostro codice (`/api/museums/entrance-ticket`:
 * Tiqets, Viator, GetYourGuide). Le due rotte lavorano per nome e coordinate: non serve una visita museo.
 * Niente di inventato: ciò che il sito o i partner non danno non compare; se non c'è nulla, il blocco non esiste.
 */

const TIPI_ATTRAZIONE = new Set(['theme_park', 'zoo', 'aquarium', 'water_park', 'amusement_park', 'roller_coaster']);

export function eAttrazioneFamiglie(category?: string | null, poiType?: string | null): boolean {
  const n = (x: any) => String(x || '').toLowerCase().trim();
  return TIPI_ATTRAZIONE.has(n(category)) || TIPI_ATTRAZIONE.has(n(poiType));
}

const TESTI: Record<string, { oggi: string; domani: string; chiuso: string; ultimo: string; biglietto: string; intero: string; ridotto: string; gratis: string; sito: string; prenota: string; altre: string }> = {
  IT: { oggi: 'Oggi', domani: 'Domani', chiuso: 'chiuso', ultimo: 'Ultimo ingresso', biglietto: 'Biglietto', intero: 'intero', ridotto: 'ridotto', gratis: 'Gratis', sito: 'dal sito ufficiale', prenota: 'Prenota', altre: 'Altre esperienze' },
  EN: { oggi: 'Today', domani: 'Tomorrow', chiuso: 'closed', ultimo: 'Last entry', biglietto: 'Ticket', intero: 'full', ridotto: 'reduced', gratis: 'Free', sito: 'from the official website', prenota: 'Book', altre: 'More experiences' },
  FR: { oggi: "Aujourd'hui", domani: 'Demain', chiuso: 'fermé', ultimo: 'Dernière entrée', biglietto: 'Billet', intero: 'plein tarif', ridotto: 'réduit', gratis: 'Gratuit', sito: 'du site officiel', prenota: 'Réserver', altre: "D'autres expériences" },
  ES: { oggi: 'Hoy', domani: 'Mañana', chiuso: 'cerrado', ultimo: 'Última entrada', biglietto: 'Entrada', intero: 'general', ridotto: 'reducida', gratis: 'Gratis', sito: 'del sitio oficial', prenota: 'Reservar', altre: 'Más experiencias' },
  DE: { oggi: 'Heute', domani: 'Morgen', chiuso: 'geschlossen', ultimo: 'Letzter Einlass', biglietto: 'Ticket', intero: 'regulär', ridotto: 'ermäßigt', gratis: 'Kostenlos', sito: 'von der offiziellen Website', prenota: 'Buchen', altre: 'Weitere Erlebnisse' },
  RU: { oggi: 'Сегодня', domani: 'Завтра', chiuso: 'закрыто', ultimo: 'Последний вход', biglietto: 'Билет', intero: 'полный', ridotto: 'льготный', gratis: 'Бесплатно', sito: 'с официального сайта', prenota: 'Забронировать', altre: 'Другие впечатления' },
  ZH: { oggi: '今天', domani: '明天', chiuso: '闭馆', ultimo: '最晚入场', biglietto: '门票', intero: '全价', ridotto: '优惠', gratis: '免费', sito: '来自官方网站', prenota: '预订', altre: '更多体验' },
};

const NOME_FONTE: Record<string, string> = { tiqets: 'Tiqets', viator: 'Viator', getyourguide: 'GetYourGuide' };

interface Props {
  poi: { id: string; lat?: number; lon?: number; name?: string; category?: string | null; poiType?: string | null };
  language: Language;
}

export default function PoiAttrazioneInfo({ poi, language }: Props) {
  const attrazione = eAttrazioneFamiglie(poi.category, poi.poiType);
  const [orari, setOrari] = useState<Domani | null>(null);
  const [ticket, setTicket] = useState<BigliettoIngresso | null>(null);
  const [esperienze, setEsperienze] = useState<Esperienza[]>([]);

  useEffect(() => {
    setOrari(null); setTicket(null); setEsperienze([]);
    if (!attrazione || !poi.name || poi.name.trim().length < 3) return;
    let annullato = false;
    // Un luogo nato da una tappa (`tappa-…`) non è una riga del database: gli orari si cercano solo per nome.
    const idVero = /^(tappa-|iti-)/.test(poi.id) ? null : poi.id;
    fetchOrariDi(poi.name, idVero, language).then((d) => { if (!annullato) setOrari(d); });
    (async () => {
      try {
        const p = new URLSearchParams({ language, venueName: poi.name as string });
        if (poi.lat != null && poi.lon != null) { p.set('lat', String(poi.lat)); p.set('lon', String(poi.lon)); }
        const res = await fetch(getApiUrl(`/api/museums/entrance-ticket?${p.toString()}`));
        if (!res.ok || annullato) return;
        const d = await res.json();
        if (annullato || d?.ok !== true) return;
        if (d.ticket?.url) setTicket(d.ticket as BigliettoIngresso);
        if (Array.isArray(d.esperienze)) setEsperienze(d.esperienze as Esperienza[]);
      } catch { /* la scheda vive anche senza biglietti */ }
    })();
    return () => { annullato = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi.id, language]);

  if (!attrazione) return null;
  const t = TESTI[String(language || 'IT').toUpperCase()] || TESTI.EN;
  const giorno = (g: Domani['oggi']) => !g ? '' : g.chiuso ? t.chiuso : `${g.apre}–${g.chiude}`;
  const oggi = giorno(orari?.oggi), domani = giorno(orari?.domani);
  const b = orari?.biglietto;
  const haOrari = !!(oggi || domani || orari?.ultimoIngresso || orari?.chiusure);
  const haPrezzo = !!(b && (b.intero || b.ridotto || b.gratis));
  // Il biglietto scelto sta già nel suo bottone: fra le altre carte non si ripete.
  const altre = esperienze.filter((e) => e.url && e.url !== ticket?.url).slice(0, 3);
  if (!haOrari && !haPrezzo && !ticket && altre.length === 0) return null;

  return (
    <div className="my-3 flex flex-col gap-2">
      {(haOrari || haPrezzo) && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          {haOrari && (
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
              <div className="min-w-0">
                {oggi && <div><span className="font-bold">{t.oggi}:</span> {oggi}</div>}
                {domani && <div><span className="font-bold">{t.domani}:</span> {domani}</div>}
                {orari?.ultimoIngresso && <div className="text-xs text-slate-600">{t.ultimo}: {orari.ultimoIngresso}</div>}
                {orari?.chiusure && <div className="text-xs text-slate-600">{orari.chiusure}</div>}
              </div>
            </div>
          )}
          {haPrezzo && b && (
            <div className={`flex items-start gap-2 ${haOrari ? 'mt-2' : ''}`}>
              <Ticket className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <span className="font-bold">{t.biglietto}:</span>{' '}
                {[b.intero && `${b.intero} ${t.intero}`, b.ridotto && `${b.ridotto} ${t.ridotto}`].filter(Boolean).join(' · ')}
                {b.gratis && <div className="text-xs text-slate-600">{t.gratis}: {b.gratis}</div>}
              </div>
            </div>
          )}
          {orari?.nota && <div className="mt-2 text-xs text-slate-600">{orari.nota}</div>}
          {orari?.fonte?.url && (
            <a href={orari.fonte.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800">
              <ExternalLink className="w-3 h-3" />{t.sito}{orari.fonte.lettoIl ? ` · ${orari.fonte.lettoIl}` : ''}
            </a>
          )}
        </div>
      )}
      {ticket && (
        <a href={ticket.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-violet-600 text-white shadow-sm shadow-violet-600/20 active:scale-[0.98] transition-transform">
          <Ticket className="w-5 h-5 shrink-0" />
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-bold leading-tight truncate">{ticket.titolo}</span>
            <span className="block text-[11px] font-semibold text-violet-100/90">
              {[ticket.prezzo, NOME_FONTE[ticket.fonte] || ticket.fonte].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="text-xs font-black uppercase tracking-wide shrink-0">{t.prenota}</span>
        </a>
      )}
      {altre.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t.altre}</div>
          {altre.map((e) => (
            <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-xl border border-violet-200 bg-white text-slate-800 active:scale-[0.98] transition-transform">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold leading-tight truncate">{e.titolo}</span>
                <span className="block text-[11px] text-slate-500">
                  {[e.prezzo, e.durata, e.voto, NOME_FONTE[e.fonte] || e.fonte].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-[11px] font-black uppercase text-violet-700 shrink-0">{t.prenota}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
