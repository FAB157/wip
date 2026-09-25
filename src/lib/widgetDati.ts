/**
 * I DATI DEI WIDGET DELLA HOME (14/09/2026).
 *
 * Richiesta del committente (13/09/2026 sera): «live activity e widget con
 * opzione 2-3-5-1» = itinerario di oggi, continua la visita, crediti e pass,
 * vicino a te. Qui si compone UN solo snapshot con tutto quello che i quattro
 * widget mostrano, e lo si consegna al nativo (src/plugins/WipWidgets.ts).
 *
 * Perché uno snapshot e non quattro: i widget vivono fuori dall'app, non
 * hanno sessione, non hanno Supabase, non hanno GPS. Tutto ciò che sanno
 * glielo dice l'app quando è aperta, e resta valido finché l'app non la
 * riapre. Un JSON solo = una scrittura, un contratto, una data di
 * aggiornamento che il widget può mostrare («aggiornato alle 10:42»).
 *
 * Le ETICHETTE viaggiano dentro lo snapshot, già nella lingua dell'app: i
 * widget nativi non hanno le 7 lingue di i18n.ts e non devono averle.
 *
 * Regole rispettate: le foto sono quelle dei POI in archivio (Commons/sito),
 * mai da ricerca; i luoghi vicini sono le gemme (is_gem) e i POI dell'RPC,
 * mai inventati; nessuna chiamata a pagamento.
 */
import { Capacitor } from '@capacitor/core';
import { WipWidgets } from '../plugins/WipWidgets';
import { getVisit, countSeen, coppieDaConfrontare, MUSEUM_VISIT_EVENT } from './museumVisit';
import { getWalletBalance, CREDITS_UPDATED_EVENT } from './pricing';
import { getDayPassState, DAY_PASS_UPDATED_EVENT } from '../services/dayPassService';
import { tourService } from '../services/tourService';
import { locationService } from '../services/locationService';
import { getGemmeVicine, getNearbyPois, getPoiById } from '../services/poiRepository';
import { leggiTestoInCache } from '../services/audioguideService';
import { supabase } from './supabase';
import { linguaCorrente } from './i18n';
import { migliorFoto } from './fotoHttps';
import { fotoLarga } from './fotoUrl';
import { getApiUrl, apiFetch } from './api';
import { ensureAffiliateUrl } from './affiliates';
import { getGuideCharacter, isCategoryAllowed, SENZA_AUDIOGUIDA } from './guideSettings';
import { getBlockedCommunityPoiIds } from './communityModeration';
import { LISTENING_HISTORY_EVENT } from './listeningHistory';
import { EVENTO_DOWNLOADS } from './downloadsRegistry';
import { operaDallArchivio } from './pacchettoMuseo';
import { elencoPdf } from './pdfArchivio';
import { coppieVotate, chiaveCoppia, giornoLocale, VOTO_OPERA_EVENT, type OperaAscoltata } from './gustiOpere';

/** Versione del contratto: i widget nativi ignorano snapshot di versione diversa. */
const VERSIONE = 1;
const CHIAVE_PIANO = 'wip_widget_piano';
/** Quanto spesso, al massimo, si ricalcolano i vicini per uno spostamento. */
const METRI_PER_RICALCOLO = 300;
const MS_TRA_AGGIORNAMENTI = 20_000;
const MS_INTERVALLO = 10 * 60_000;
/** A pagina nascosta il giro periodico si fa al massimo ogni 30 min (voce 21). */
const MS_NASCOSTA = 30 * 60_000;

type ChiaviBase = 'itinerario' | 'prossima' | 'poi' | 'visita' | 'ascoltate' | 'prossimaOpera' | 'crediti' | 'pass' | 'passMuseo' | 'scade' | 'guide' | 'vicini' | 'gemma' | 'nessuno' | 'apri' | 'aggiornato' | 'fatte';
/** Chiavi degli 11 widget nuovi (23/09/2026): il Record sotto le impone in tutte e 7 le lingue. */
type ChiaviNuove = 'ultimoAscolto' | 'riascolta' | 'riprendi' | 'nessunAscolto' | 'altraLingua' | 'nonDisponibileIn'
  | 'luogoGiorno' | 'cosaVedo' | 'inquadra' | 'meteo' | 'oraMigliore' | 'tuttoIlGiorno' | 'giornoMusei' | 'garanzia'
  | 'attivaFino' | 'rimborsabile' | 'ascoltaOra' | 'accedi' | 'nessunVicino' | 'eventi' | 'biglietti' | 'nessunEvento'
  | 'gemmaRegione' | 'confronto' | 'qualeTiPiace' | 'nessunConfronto' | 'votoSalvato' | 'guidaStampata' | 'riapri'
  | 'condividi' | 'nessunaGuida' | 'fotoCommunity' | 'verificata' | 'nessunaFoto';
type Etichette = Record<ChiaviBase | ChiaviNuove, string>;
type Lingua7 = 'it' | 'en' | 'fr' | 'es' | 'de' | 'ru' | 'zh';

const ETICHETTE_NUOVE: Record<Lingua7, Record<ChiaviNuove, string>> = {
  it: { ultimoAscolto: 'Ultima audioguida', riascolta: 'Riascolta', riprendi: 'Riprendi', nessunAscolto: 'Nessun ascolto ancora', altraLingua: 'Ascolta in', nonDisponibileIn: 'Non ancora disponibile in', luogoGiorno: 'Luogo del giorno', cosaVedo: 'Cosa vedo?', inquadra: 'Inquadra e scopri', meteo: 'Meteo', oraMigliore: 'Ora migliore', tuttoIlGiorno: 'Bel tempo tutto il giorno', giornoMusei: 'Giornata da musei', garanzia: 'Garanzia pioggia', attivaFino: 'attiva fino al', rimborsabile: 'Puoi chiedere il rimborso', ascoltaOra: 'Ascolta ora', accedi: 'Accedi per ascoltare', nessunVicino: 'Nessuna audioguida qui vicino', eventi: 'Eventi vicino a te', biglietti: 'Biglietti', nessunEvento: 'Nessun evento nei prossimi giorni', gemmaRegione: 'Gemma della regione', confronto: 'Confronto opere', qualeTiPiace: 'Quale ti è piaciuta di più?', nessunConfronto: 'Ascolta due opere per confrontarle', votoSalvato: 'Voto salvato', guidaStampata: 'Guida stampata', riapri: 'Apri', condividi: 'Condividi', nessunaGuida: 'Nessuna guida stampata', fotoCommunity: 'Foto dalla community', verificata: 'verificata', nessunaFoto: 'Nessuna foto verificata qui vicino' },
  en: { ultimoAscolto: 'Last audio guide', riascolta: 'Listen again', riprendi: 'Resume', nessunAscolto: 'Nothing listened yet', altraLingua: 'Listen in', nonDisponibileIn: 'Not yet available in', luogoGiorno: 'Place of the day', cosaVedo: 'What am I seeing?', inquadra: 'Point and discover', meteo: 'Weather', oraMigliore: 'Best time', tuttoIlGiorno: 'Fine all day', giornoMusei: 'Museum day', garanzia: 'Rain guarantee', attivaFino: 'active until', rimborsabile: 'You can claim a refund', ascoltaOra: 'Listen now', accedi: 'Sign in to listen', nessunVicino: 'No audio guide nearby', eventi: 'Events near you', biglietti: 'Tickets', nessunEvento: 'No events in the coming days', gemmaRegione: 'Gem of the region', confronto: 'Compare artworks', qualeTiPiace: 'Which did you like more?', nessunConfronto: 'Listen to two artworks to compare them', votoSalvato: 'Vote saved', guidaStampata: 'Printed guide', riapri: 'Open', condividi: 'Share', nessunaGuida: 'No printed guide', fotoCommunity: 'Community photo', verificata: 'verified', nessunaFoto: 'No verified photo nearby' },
  fr: { ultimoAscolto: 'Dernier audioguide', riascolta: 'Réécouter', riprendi: 'Reprendre', nessunAscolto: "Aucune écoute pour l'instant", altraLingua: 'Écouter en', nonDisponibileIn: 'Pas encore disponible en', luogoGiorno: 'Lieu du jour', cosaVedo: "Qu'est-ce que je vois ?", inquadra: 'Visez et découvrez', meteo: 'Météo', oraMigliore: 'Meilleur moment', tuttoIlGiorno: 'Beau toute la journée', giornoMusei: 'Journée musées', garanzia: 'Garantie pluie', attivaFino: "active jusqu'au", rimborsabile: 'Remboursement possible', ascoltaOra: 'Écouter maintenant', accedi: 'Connectez-vous pour écouter', nessunVicino: 'Aucun audioguide à proximité', eventi: 'Événements près de vous', biglietti: 'Billets', nessunEvento: 'Aucun événement ces prochains jours', gemmaRegione: 'Pépite de la région', confronto: 'Comparer les œuvres', qualeTiPiace: 'Laquelle avez-vous préférée ?', nessunConfronto: 'Écoutez deux œuvres pour les comparer', votoSalvato: 'Vote enregistré', guidaStampata: 'Guide imprimé', riapri: 'Ouvrir', condividi: 'Partager', nessunaGuida: 'Aucun guide imprimé', fotoCommunity: 'Photo de la communauté', verificata: 'vérifiée', nessunaFoto: 'Aucune photo vérifiée à proximité' },
  es: { ultimoAscolto: 'Última audioguía', riascolta: 'Volver a escuchar', riprendi: 'Reanudar', nessunAscolto: 'Aún no has escuchado nada', altraLingua: 'Escuchar en', nonDisponibileIn: 'Aún no disponible en', luogoGiorno: 'Lugar del día', cosaVedo: '¿Qué estoy viendo?', inquadra: 'Enfoca y descubre', meteo: 'Tiempo', oraMigliore: 'Mejor hora', tuttoIlGiorno: 'Buen tiempo todo el día', giornoMusei: 'Día de museos', garanzia: 'Garantía lluvia', attivaFino: 'activa hasta el', rimborsabile: 'Puedes pedir el reembolso', ascoltaOra: 'Escuchar ahora', accedi: 'Inicia sesión para escuchar', nessunVicino: 'Ninguna audioguía cerca', eventi: 'Eventos cerca de ti', biglietti: 'Entradas', nessunEvento: 'Sin eventos en los próximos días', gemmaRegione: 'Joya de la región', confronto: 'Comparar obras', qualeTiPiace: '¿Cuál te gustó más?', nessunConfronto: 'Escucha dos obras para compararlas', votoSalvato: 'Voto guardado', guidaStampata: 'Guía impresa', riapri: 'Abrir', condividi: 'Compartir', nessunaGuida: 'Ninguna guía impresa', fotoCommunity: 'Foto de la comunidad', verificata: 'verificada', nessunaFoto: 'Ninguna foto verificada cerca' },
  de: { ultimoAscolto: 'Letzter Audioguide', riascolta: 'Nochmal hören', riprendi: 'Fortsetzen', nessunAscolto: 'Noch nichts gehört', altraLingua: 'Hören auf', nonDisponibileIn: 'Noch nicht verfügbar auf', luogoGiorno: 'Ort des Tages', cosaVedo: 'Was sehe ich?', inquadra: 'Anvisieren und entdecken', meteo: 'Wetter', oraMigliore: 'Beste Zeit', tuttoIlGiorno: 'Den ganzen Tag schön', giornoMusei: 'Museumstag', garanzia: 'Regengarantie', attivaFino: 'aktiv bis', rimborsabile: 'Erstattung möglich', ascoltaOra: 'Jetzt hören', accedi: 'Anmelden zum Hören', nessunVicino: 'Kein Audioguide in der Nähe', eventi: 'Events in der Nähe', biglietti: 'Tickets', nessunEvento: 'Keine Events in den nächsten Tagen', gemmaRegione: 'Juwel der Region', confronto: 'Werke vergleichen', qualeTiPiace: 'Welches gefiel dir besser?', nessunConfronto: 'Hör zwei Werke, um sie zu vergleichen', votoSalvato: 'Stimme gespeichert', guidaStampata: 'Gedruckter Guide', riapri: 'Öffnen', condividi: 'Teilen', nessunaGuida: 'Kein gedruckter Guide', fotoCommunity: 'Community-Foto', verificata: 'geprüft', nessunaFoto: 'Kein geprüftes Foto in der Nähe' },
  ru: { ultimoAscolto: 'Последний аудиогид', riascolta: 'Слушать снова', riprendi: 'Продолжить', nessunAscolto: 'Пока ничего не прослушано', altraLingua: 'Слушать на', nonDisponibileIn: 'Пока недоступно на', luogoGiorno: 'Место дня', cosaVedo: 'Что я вижу?', inquadra: 'Наведите и узнайте', meteo: 'Погода', oraMigliore: 'Лучшее время', tuttoIlGiorno: 'Хорошо весь день', giornoMusei: 'День для музеев', garanzia: 'Гарантия от дождя', attivaFino: 'действует до', rimborsabile: 'Можно запросить возврат', ascoltaOra: 'Слушать сейчас', accedi: 'Войдите, чтобы слушать', nessunVicino: 'Рядом нет аудиогидов', eventi: 'События рядом', biglietti: 'Билеты', nessunEvento: 'Нет событий в ближайшие дни', gemmaRegione: 'Жемчужина региона', confronto: 'Сравнить работы', qualeTiPiace: 'Какая понравилась больше?', nessunConfronto: 'Прослушайте две работы для сравнения', votoSalvato: 'Голос сохранён', guidaStampata: 'Печатный гид', riapri: 'Открыть', condividi: 'Поделиться', nessunaGuida: 'Нет печатных гидов', fotoCommunity: 'Фото сообщества', verificata: 'проверено', nessunaFoto: 'Рядом нет проверенных фото' },
  zh: { ultimoAscolto: '最近的导览', riascolta: '重听', riprendi: '继续', nessunAscolto: '暂无收听记录', altraLingua: '收听语言', nonDisponibileIn: '暂未提供', luogoGiorno: '今日地点', cosaVedo: '我看到的是什么？', inquadra: '对准即可了解', meteo: '天气', oraMigliore: '最佳时间', tuttoIlGiorno: '全天好天气', giornoMusei: '适合逛博物馆', garanzia: '雨天保障', attivaFino: '有效期至', rimborsabile: '可申请退还', ascoltaOra: '立即收听', accedi: '登录后收听', nessunVicino: '附近暂无导览', eventi: '附近活动', biglietti: '门票', nessunEvento: '近期无活动', gemmaRegione: '地区珍宝', confronto: '作品对比', qualeTiPiace: '你更喜欢哪一件？', nessunConfronto: '收听两件作品即可对比', votoSalvato: '已保存投票', guidaStampata: '打印版导览', riapri: '打开', condividi: '分享', nessunaGuida: '暂无打印版导览', fotoCommunity: '社区照片', verificata: '已验证', nessunaFoto: '附近暂无已验证照片' },
};

/**
 * Nomi dei codici meteo WMO (gli stessi che server.ts ricava dai simboli di
 * MET Norway): servono solo a comporre `meteo.descr`, fuori da Etichette.
 */
const WMO_CODICI = [0, 1, 2, 3, 45, 61, 63, 65, 67, 73, 80, 95] as const;
const WMO_NOMI: Record<Lingua7, string[]> = {
  it: ['Sereno', 'Poco nuvoloso', 'Parz. nuvoloso', 'Coperto', 'Nebbia', 'Pioggia debole', 'Pioggia', 'Pioggia forte', 'Nevischio', 'Neve', 'Rovesci', 'Temporale'],
  en: ['Clear', 'Mostly clear', 'Partly cloudy', 'Overcast', 'Fog', 'Light rain', 'Rain', 'Heavy rain', 'Sleet', 'Snow', 'Showers', 'Thunderstorm'],
  fr: ['Dégagé', 'Peu nuageux', 'Partiellement nuageux', 'Couvert', 'Brouillard', 'Pluie faible', 'Pluie', 'Forte pluie', 'Neige fondue', 'Neige', 'Averses', 'Orage'],
  es: ['Despejado', 'Poco nuboso', 'Parcialmente nuboso', 'Cubierto', 'Niebla', 'Lluvia débil', 'Lluvia', 'Lluvia fuerte', 'Aguanieve', 'Nieve', 'Chubascos', 'Tormenta'],
  de: ['Klar', 'Leicht bewölkt', 'Teilweise bewölkt', 'Bedeckt', 'Nebel', 'Leichter Regen', 'Regen', 'Starker Regen', 'Schneeregen', 'Schnee', 'Schauer', 'Gewitter'],
  ru: ['Ясно', 'Малооблачно', 'Переменная облачность', 'Пасмурно', 'Туман', 'Небольшой дождь', 'Дождь', 'Сильный дождь', 'Мокрый снег', 'Снег', 'Ливни', 'Гроза'],
  zh: ['晴', '少云', '多云', '阴', '雾', '小雨', '雨', '大雨', '雨夹雪', '雪', '阵雨', '雷暴'],
};
function nomeWmo(code: number, l: string): string {
  const nomi = WMO_NOMI[(l as Lingua7)] || WMO_NOMI.it;
  let i = WMO_CODICI.indexOf(code as any);
  if (i < 0) {
    // Codice fuori elenco: il più vicino per famiglia (nuvole, pioggia, neve…).
    i = code < 45 ? 3 : code < 60 ? 4 : code < 67 ? 6 : code < 80 ? 9 : code < 95 ? 10 : 11;
  }
  return nomi[i] || '';
}

const ETICHETTE_BASE: Record<Lingua7, Record<ChiaviBase, string>> = {
  it: { itinerario: 'Itinerario di oggi', prossima: 'Prossima tappa', poi: 'Poi', visita: 'Continua la visita', ascoltate: 'ascoltate', prossimaOpera: 'Prossima opera', crediti: 'crediti', pass: 'Day Pass attivo', passMuseo: 'Pass Museo', scade: 'scade alle', guide: 'guide', vicini: 'Vicino a te', gemma: 'Gemma', nessuno: 'Apri WIP per aggiornare', apri: 'Apri WIP', aggiornato: 'agg.', fatte: 'fatte' },
  en: { itinerario: "Today's itinerary", prossima: 'Next stop', poi: 'Then', visita: 'Continue the visit', ascoltate: 'listened', prossimaOpera: 'Next artwork', crediti: 'credits', pass: 'Day Pass active', passMuseo: 'Museum Pass', scade: 'expires at', guide: 'guides', vicini: 'Near you', gemma: 'Gem', nessuno: 'Open WIP to refresh', apri: 'Open WIP', aggiornato: 'upd.', fatte: 'done' },
  fr: { itinerario: "Itinéraire du jour", prossima: 'Prochaine étape', poi: 'Puis', visita: 'Continuer la visite', ascoltate: 'écoutées', prossimaOpera: 'Prochaine œuvre', crediti: 'crédits', pass: 'Day Pass actif', passMuseo: 'Pass Musée', scade: 'expire à', guide: 'guides', vicini: 'Près de vous', gemma: 'Pépite', nessuno: 'Ouvrez WIP pour actualiser', apri: 'Ouvrir WIP', aggiornato: 'màj', fatte: 'faites' },
  es: { itinerario: 'Itinerario de hoy', prossima: 'Próxima parada', poi: 'Luego', visita: 'Continuar la visita', ascoltate: 'escuchadas', prossimaOpera: 'Próxima obra', crediti: 'créditos', pass: 'Day Pass activo', passMuseo: 'Pase Museo', scade: 'caduca a las', guide: 'guías', vicini: 'Cerca de ti', gemma: 'Joya', nessuno: 'Abre WIP para actualizar', apri: 'Abrir WIP', aggiornato: 'act.', fatte: 'hechas' },
  de: { itinerario: 'Route von heute', prossima: 'Nächster Halt', poi: 'Dann', visita: 'Besuch fortsetzen', ascoltate: 'gehört', prossimaOpera: 'Nächstes Werk', crediti: 'Credits', pass: 'Day Pass aktiv', passMuseo: 'Museumspass', scade: 'läuft ab um', guide: 'Guides', vicini: 'In deiner Nähe', gemma: 'Geheimtipp', nessuno: 'WIP öffnen zum Aktualisieren', apri: 'WIP öffnen', aggiornato: 'akt.', fatte: 'erledigt' },
  ru: { itinerario: 'Маршрут на сегодня', prossima: 'Следующая остановка', poi: 'Затем', visita: 'Продолжить визит', ascoltate: 'прослушано', prossimaOpera: 'Следующая работа', crediti: 'кредитов', pass: 'Day Pass активен', passMuseo: 'Музейный пасс', scade: 'до', guide: 'гидов', vicini: 'Рядом с вами', gemma: 'Жемчужина', nessuno: 'Откройте WIP для обновления', apri: 'Открыть WIP', aggiornato: 'обн.', fatte: 'готово' },
  zh: { itinerario: '今日行程', prossima: '下一站', poi: '然后', visita: '继续参观', ascoltate: '已听', prossimaOpera: '下一件作品', crediti: '积分', pass: 'Day Pass 生效中', passMuseo: '博物馆通票', scade: '到期', guide: '导览', vicini: '附近', gemma: '珍宝', nessuno: '打开 WIP 以更新', apri: '打开 WIP', aggiornato: '更新', fatte: '已完成' },
};

const ETICHETTE: Record<string, Etichette> = Object.fromEntries(
  (Object.keys(ETICHETTE_BASE) as Lingua7[]).map(l => [l, { ...ETICHETTE_BASE[l], ...ETICHETTE_NUOVE[l] }]),
) as Record<string, Etichette>;

/** Un'etichetta dei widget nella lingua dell'app (App.tsx la usa per i toast delle azioni). */
export function etichettaWidget(k: ChiaviBase | ChiaviNuove): string {
  return (ETICHETTE[lingua()] || ETICHETTE.it)[k] || ETICHETTE.it[k] || '';
}

export type TappaWidget = { ora: string; titolo: string; tipo: string; lat: number | null; lon: number | null; metri?: number | null };
export type SnapshotWidget = {
  v: number;
  ts: number;
  lingua: string;
  etichette: Etichette;
  crediti: { totale: number; passAttivo: boolean; passScade: number; passUsate: number; passCap: number } | null;
  visita: { museo: string; ascoltate: number; totale: number; prossima: string; sala: string; foto: string } | null;
  itinerario: { titolo: string; fonte: 'giro' | 'piano'; fatte: number; totali: number; prossimaIdx: number; tappe: TappaWidget[] } | null;
  vicini: { id: string; nome: string; metri: number; categoria: string; gemma: boolean; foto: string; lat: number; lon: number }[];
  posizione: { lat: number; lon: number; ts: number } | null;
  // ── Campi degli 11 widget nuovi (23/09/2026), tutti opzionali: v resta 1
  //    e i 4 widget esistenti non se ne accorgono. `rev` è solo informativo.
  rev?: 2;
  sessione?: boolean;
  ultimoAscolto?: { tipo: 'poi' | 'opera'; id: string; nome: string; luogo: string; foto: string; ts: number; quando: string; posSec: number; durSec: number; lingua: string } | null;
  linguaAlt?: { codice: string; nome: string; disponibile: boolean | null } | null;
  luogoGiorno?: { giorno: string; id: string; nome: string; citta: string; foto: string; attribuzione: string; metri: number | null; lat: number; lon: number }[];
  meteo?: {
    luogo: string; fonte: 'tappa' | 'posizione'; temp: number; code: number; descr: string; pioggiaProb: number;
    ore: { ts: number; ora: string; temp: number; code: number; pioggia: number }[];
    oraMigliore: { da: number; a: number; testo: string } | null;
    esito: 'finestra' | 'tuttoIlGiorno' | 'musei'; attribuzione: string; ts: number;
  } | null;
  garanzia?: { stato: 'attiva' | 'reclamabile'; finoAl: number; testo: string } | null;
  ascoltaOra?: { id: string; nome: string; metri: number; foto: string; categoria: string; pronta: boolean } | null;
  /** categoria: 'musica' | 'mostra' | 'teatro' | 'festa' (il nativo ne fa un simbolo). */
  eventi?: { k: string; titolo: string; quando: string; ts: number; luogo: string; metri: number | null; biglietto: boolean; categoria: string }[];
  gemmaRegione?: { id: string; nome: string; regione: string; citta: string; foto: string; attribuzione: string; metri: number } | null;
  confronto?: { giorno: string; museo: string; a: { k: string; nome: string; autore: string; foto: string }; b: { k: string; nome: string; autore: string; foto: string } } | null;
  guidaStampata?: { k: string; tipo: 'itinerario' | 'guida' | 'museo'; nome: string; quando: string; ts: number } | null;
  fotoCommunity?: { poiId: string; nome: string; citta: string; foto: string; metri: number; quando: string } | null;
};

const lingua = (): string => {
  try { return String(linguaCorrente() || 'it').toLowerCase().slice(0, 2); } catch { return 'it'; }
};

// ── Piano generato (PlanScreen) ───────────────────────────────────────────
/**
 * PlanScreen chiama questa funzione a ogni cambio di piano: qui si tiene
 * solo ciò che serve al widget (titolo, giorni, tappe con ora e coordinate).
 * Un piano nullo cancella. Il widget mostra il giorno 1 finché l'utente non
 * ne sceglie un altro sulla mappa (`giorno`).
 */
export function salvaPianoPerWidget(plan: any, giorno?: number): void {
  try {
    if (!plan || !Array.isArray(plan.giorni) || !plan.giorni.length) {
      localStorage.removeItem(CHIAVE_PIANO);
    } else {
      const giorni = plan.giorni.map((g: any) => ({
        giorno: Number(g?.giorno) || 1,
        tappe: (Array.isArray(g?.tappe) ? g.tappe : []).slice(0, 14).map((t: any) => ({
          ora: String(t?.ora || ''),
          titolo: String(t?.titolo_tappa || t?.titolo || ''),
          tipo: String(t?.tipo || ''),
          lat: Number.isFinite(Number(t?.coordinate?.lat)) ? Number(t.coordinate.lat) : null,
          lon: Number.isFinite(Number(t?.coordinate?.lng ?? t?.coordinate?.lon)) ? Number(t.coordinate.lng ?? t.coordinate.lon) : null,
        })).filter((t: TappaWidget) => t.titolo),
      }));
      const precedente = leggiPiano();
      localStorage.setItem(CHIAVE_PIANO, JSON.stringify({
        // L'id della riga user_itineraries: serve alla garanzia pioggia (23/09/2026).
        id: plan.id != null && plan.id !== '' ? String(plan.id) : null,
        titolo: String(plan.titolo || ''),
        giorni,
        giorno: giorno ?? precedente?.giorno ?? 1,
        salvatoIl: Date.now(),
      }));
    }
  } catch { /* localStorage pieno o assente: il widget resta com'era */ }
  programma();
}

/** Il giorno scelto sulla mappa dell'itinerario diventa il giorno del widget. */
export function scegliGiornoPerWidget(giorno: number | 'all'): void {
  try {
    const p = leggiPiano();
    if (!p) return;
    localStorage.setItem(CHIAVE_PIANO, JSON.stringify({ ...p, giorno: giorno === 'all' ? 1 : giorno }));
  } catch { /* niente */ }
  programma();
}

type PianoSalvato = { id?: string | null; titolo: string; giorni: { giorno: number; tappe: TappaWidget[] }[]; giorno: number; salvatoIl: number };
function leggiPiano(): PianoSalvato | null {
  try {
    const raw = localStorage.getItem(CHIAVE_PIANO);
    if (!raw) return null;
    const p = JSON.parse(raw) as PianoSalvato;
    // Un piano di dieci giorni fa non è «l'itinerario di oggi».
    if (!p?.giorni?.length || Date.now() - (p.salvatoIl || 0) > 10 * 86_400_000) return null;
    return p;
  } catch { return null; }
}

const minutiDi = (hhmm: string): number => {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

function itinerarioPerWidget(): SnapshotWidget['itinerario'] {
  // 1) Il giro con audioguida o il percorso su misura in corso: è la verità
  //    più fresca, con la tappa verso cui si sta camminando.
  try {
    const v = tourService.vista();
    if (v && v.nomeTappa) {
      const tappe: TappaWidget[] = [{ ora: '', titolo: v.nomeTappa, tipo: '', lat: v.tappaLat, lon: v.tappaLon, metri: v.metriAllaTappa }];
      if (v.nomeProssima) tappe.push({ ora: '', titolo: v.nomeProssima, tipo: '', lat: null, lon: null });
      return { titolo: '', fonte: 'giro', fatte: v.tappeFatte, totali: v.tappeTotali, prossimaIdx: 0, tappe };
    }
  } catch { /* nessun giro */ }
  // 2) Il piano generato nella scheda Itinerario.
  const p = leggiPiano();
  if (!p) return null;
  const g = p.giorni.find(x => x.giorno === p.giorno) || p.giorni[0];
  if (!g?.tappe?.length) return null;
  const ora = new Date();
  const adesso = ora.getHours() * 60 + ora.getMinutes();
  let prossimaIdx = g.tappe.findIndex(t => minutiDi(t.ora) >= adesso - 20);
  if (prossimaIdx < 0) prossimaIdx = g.tappe.length - 1;
  return { titolo: p.titolo, fonte: 'piano', fatte: prossimaIdx, totali: g.tappe.length, prossimaIdx, tappe: g.tappe };
}

// ── Visita museo ──────────────────────────────────────────────────────────
function visitaPerWidget(): SnapshotWidget['visita'] {
  const v = getVisit();
  if (!v) return null;
  const tappe = v.guide?.tappe || [];
  const prossima = tappe.find(t => !t.seenCardId) || null;
  return {
    museo: v.venue?.name || '',
    ascoltate: countSeen(v),
    totale: tappe.length,
    prossima: prossima?.nome || '',
    sala: prossima?.dove || '',
    foto: prossima?.fotoIcona || prossima?.foto || v.venuePhotoIcon || v.venuePhoto || '',
  };
}

// ── Crediti e pass ────────────────────────────────────────────────────────
// (23/09/2026) Cache di 60 s: con gli eventi nuovi (ascolti, museo, download)
// lo snapshot si ricompone spesso, e ogni volta si rileggevano saldo e Day
// Pass in rete. Gli eventi dei crediti e del pass la azzerano (vedi sotto).
let creditiCache: { userId: string; ts: number; valore: SnapshotWidget['crediti'] } | null = null;
const MS_CACHE_CREDITI = 60_000;

async function creditiPerWidget(userId: string | null): Promise<SnapshotWidget['crediti']> {
  try {
    if (!userId) return null;
    if (creditiCache && creditiCache.userId === userId && Date.now() - creditiCache.ts < MS_CACHE_CREDITI) return creditiCache.valore;
    const valore = await leggiCrediti(userId);
    if (valore) creditiCache = { userId, ts: Date.now(), valore };
    return valore;
  } catch { return null; }
}

async function leggiCrediti(userId: string): Promise<SnapshotWidget['crediti']> {
  try {
    const [saldo, pass] = await Promise.all([
      getWalletBalance(userId).catch(() => null),
      getDayPassState().catch(() => null),
    ]);
    return {
      totale: saldo?.total ?? 0,
      passAttivo: !!pass?.active,
      passScade: pass?.active ? Number(pass.expiresAt) || 0 : 0,
      passUsate: pass?.active ? Number(pass.used) || 0 : 0,
      passCap: pass?.active ? Number(pass.cap) || 0 : 0,
    };
  } catch { return null; }
}

// ── Vicini ────────────────────────────────────────────────────────────────
let ultimaPosVicini: { lat: number; lon: number } | null = null;
let viciniCache: SnapshotWidget['vicini'] = [];

const metriTra = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

async function viciniPerWidget(pos: { lat: number; lon: number } | null): Promise<SnapshotWidget['vicini']> {
  if (!pos) return viciniCache;
  if (ultimaPosVicini && metriTra(ultimaPosVicini, pos) < METRI_PER_RICALCOLO && viciniCache.length) return viciniCache;
  try {
    // Prima le gemme entro 2,5 km (sono ciò per cui vale la pena uscire),
    // poi i POI normali entro 800 m per completare fino a 5.
    const gemme = await getGemmeVicine(pos.lat, pos.lon, 2500, 5).catch(() => []);
    let lista: any[] = [...gemme];
    if (lista.length < 5) {
      const altri = await getNearbyPois(pos.lat, pos.lon, 800).catch(() => []);
      const visti = new Set(lista.map(p => String(p.id)));
      for (const p of (altri || []).sort((a: any, b: any) => (a.distance_meters || 0) - (b.distance_meters || 0))) {
        if (lista.length >= 5) break;
        if (!p?.name || visti.has(String(p.id))) continue;
        lista.push(p);
      }
    }
    viciniCache = lista.slice(0, 5).map((p: any) => ({
      id: String(p.id),
      nome: String(p.name || ''),
      metri: Math.round(Number(p.distance_meters) || metriTra(pos, { lat: Number(p.lat), lon: Number(p.lon) })),
      categoria: String(p.category || p.poi_type || ''),
      gemma: !!(p.is_gem || p.premium),
      foto: String(p.photo_url || p.image_url || ''),
      lat: Number(p.lat), lon: Number(p.lon),
    }));
    ultimaPosVicini = pos;
  } catch { /* si tiene la cache */ }
  return viciniCache;
}

// ══ GLI 11 WIDGET NUOVI (23/09/2026) ══════════════════════════════════════
// Regole: foto solo da migliorFoto → fotoLarga, solo https (mai stock); id
// nei deep link solo se POI puliti, altrimenti una chiave corta `k`
// (hash8); nessuna generazione (niente /api/regenerate, /api/tts/smart,
// /api/poi/audioguide, /api/museums/*, /api/mostre, /api/events/portali,
// /claim): i dati sono cache, archivio o rotte senza AI.

const RE_ID_POI = /^[A-Za-z0-9_.:-]{1,80}$/;
const RE_K = /^[0-9a-f]{8}$/;

function leggiJson<T>(chiave: string): T | null {
  try { const r = localStorage.getItem(chiave); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
}
function scriviJson(chiave: string, valore: unknown): void {
  try { localStorage.setItem(chiave, JSON.stringify(valore)); } catch { /* storage pieno o bloccato */ }
}

/** FNV-1a a 32 bit, 8 caratteri esadecimali: la chiave corta dei deep link. */
export function hash8(s: string): string {
  const str = String(s ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Foto per il widget: la migliore reale, ridotta al lato chiesto, solo https. '' se non c'è. */
function fotoWidget(url: string | null | undefined, lato: number): string {
  const f = fotoLarga(migliorFoto({ image_url: url || null }), lato);
  return f && /^https:\/\//i.test(f) ? f : '';
}

const cellaDi = (pos: { lat: number; lon: number }, passo: number): string =>
  `${(Math.round(pos.lat / passo) * passo).toFixed(2)}_${(Math.round(pos.lon / passo) * passo).toFixed(2)}`;

const giornoTra = (giorni: number): string => { const d = new Date(); d.setDate(d.getDate() + giorni); return giornoLocale(d); };
const inizioGiorno = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Data breve nella lingua dell'app, già pronta per il nativo: «oggi 10:42»,
 * «ieri», «domani 21:00», «sab 27», «12 set». `conOra` = aggiungere l'ora
 * quando il giorno è oggi o domani.
 */
function quandoBreve(ts: number, l: string, conOra = true): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try {
    const d = new Date(ts);
    const giorni = Math.round((inizioGiorno(d) - inizioGiorno(new Date())) / 86_400_000);
    const ora = new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit' }).format(d);
    const rel = new Intl.RelativeTimeFormat(l, { numeric: 'auto' });
    if (giorni === 0) return conOra ? `${rel.format(0, 'day')} ${ora}` : rel.format(0, 'day');
    if (giorni === 1) return conOra ? `${rel.format(1, 'day')} ${ora}` : rel.format(1, 'day');
    if (giorni === -1) return rel.format(-1, 'day');
    if (giorni > 1 && giorni < 7) return new Intl.DateTimeFormat(l, { weekday: 'short', day: 'numeric' }).format(d);
    return new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short' }).format(d);
  } catch { return ''; }
}

// ── 7 e 48: ultimo ascolto ────────────────────────────────────────────────
const CHIAVE_ULTIMO = 'wip_ultimo_ascolto';
export type UltimoAscolto = {
  tipo: 'poi' | 'opera'; id: string; poiId?: string; venueKey?: string; museo?: string; nomeFonte?: string;
  nome: string; luogo: string; foto: string; categoria?: string; lingua: string; personaggio: string;
  ts: number; posSec: number; durSec: number;
};

/** POI (locationService.recordPlaybackStart) e opera (MuseumVisitSheet.parlaGuida): un record solo, l'ultimo. */
export function registraUltimoAscolto(x: Omit<UltimoAscolto, 'ts' | 'posSec' | 'durSec'>): void {
  if (!x?.id || !x.nome) return;
  scriviJson(CHIAVE_ULTIMO, {
    ...x,
    poiId: x.tipo === 'poi' ? x.id : x.poiId,
    lingua: String(x.lingua || lingua()).toLowerCase().slice(0, 2),
    ts: Date.now(), posSec: 0, durSec: 0,
  });
  programma();
}

/** Il punto a cui si è arrivati (solo POI: per le opere non c'è una sorgente stabile). */
export function aggiornaPosizioneAscolto(poiId: string, pos: number, dur: number): void {
  const u = leggiJson<UltimoAscolto>(CHIAVE_ULTIMO);
  if (!u || u.tipo !== 'poi' || u.id !== poiId) return;
  if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return;
  scriviJson(CHIAVE_ULTIMO, { ...u, posSec: Math.max(0, Math.round(pos)), durSec: Math.round(dur) });
}

/** L'ultimo ascolto, con ripiego sullo storico dei POI (listeningHistory). */
export function leggiUltimoAscolto(): UltimoAscolto | null {
  const u = leggiJson<UltimoAscolto>(CHIAVE_ULTIMO);
  if (u?.id && u.nome) return u;
  const storico = leggiJson<any[]>('mock_db_listening_history');
  const s = Array.isArray(storico) ? storico[0] : null;
  if (!s?.poi_id || !s.poi_name) return null;
  return {
    tipo: 'poi', id: String(s.poi_id), poiId: String(s.poi_id), nome: String(s.poi_name), luogo: '',
    foto: String(s.image_url || ''), categoria: String(s.category || ''), lingua: lingua(),
    personaggio: getGuideCharacter(), ts: Date.parse(s.listened_at) || 0, posSec: 0, durSec: 0,
  };
}

function ultimoAscoltoPerWidget(l: string): SnapshotWidget['ultimoAscolto'] {
  const u = leggiUltimoAscolto();
  if (!u) return null;
  if (u.tipo === 'poi' ? !RE_ID_POI.test(u.id) : !RE_K.test(u.id)) return null;
  return {
    tipo: u.tipo, id: u.id, nome: u.nome, luogo: u.luogo || u.museo || '',
    foto: fotoWidget(u.foto, 640), ts: u.ts, quando: quandoBreve(u.ts, l),
    posSec: u.tipo === 'poi' ? Number(u.posSec) || 0 : 0,
    durSec: u.tipo === 'poi' ? Number(u.durSec) || 0 : 0,
    lingua: u.lingua,
  };
}

/** La lingua «altra»: inglese, o italiano se l'app è già in inglese (non esiste una lingua del compagno). */
export function linguaAltDi(l: string): { codice: string; nome: string } {
  const codice = l === 'en' ? 'it' : 'en';
  let nome = codice === 'en' ? 'English' : 'Italiano';
  try { nome = new Intl.DisplayNames([l], { type: 'language' }).of(codice) || nome; } catch { /* Intl.DisplayNames assente */ }
  return { codice, nome };
}

const disponibilitaCache = new Map<string, boolean>();
async function linguaAltPerWidget(l: string): Promise<SnapshotWidget['linguaAlt']> {
  const u = leggiUltimoAscolto();
  if (!u) return null;
  const { codice, nome } = linguaAltDi(l);
  const chiave = `${u.tipo}|${u.id}|${codice}|${u.personaggio}`;
  let disponibile: boolean | null = disponibilitaCache.has(chiave) ? !!disponibilitaCache.get(chiave) : null;
  if (disponibile === null) {
    try {
      if (u.tipo === 'poi') {
        const pers = u.personaggio === 'dante' ? 'dante' : 'nicky';
        disponibile = !!(await leggiTestoInCache(u.id, codice.toUpperCase(), pers));
      } else if (u.venueKey) {
        disponibile = !!(operaDallArchivio(u.venueKey, codice, u.nome) || (u.nomeFonte ? operaDallArchivio(u.venueKey, codice, u.nomeFonte) : null));
      }
      if (disponibile !== null) disponibilitaCache.set(chiave, disponibile);
    } catch { disponibile = null; }
  }
  return { codice, nome, disponibile };
}

// ── 5: luogo del giorno ───────────────────────────────────────────────────
const CHIAVE_LUOGO = 'wip_widget_luogo_giorno';
type VoceLuogo = NonNullable<SnapshotWidget['luogoGiorno']>[number];

async function luogoGiornoPerWidget(pos: { lat: number; lon: number } | null): Promise<NonNullable<SnapshotWidget['luogoGiorno']>> {
  const oggi = giornoLocale();
  const cache = leggiJson<{ cella: string; giorno: string; lista: VoceLuogo[]; ts?: number }>(CHIAVE_LUOGO);
  const conMetri = (lista: VoceLuogo[]) => lista
    .filter(x => x.giorno >= oggi)
    .map(x => ({ ...x, metri: pos ? Math.round(metriTra(pos, { lat: x.lat, lon: x.lon })) : x.metri }));
  if (!pos) return cache?.lista ? conMetri(cache.lista) : [];
  const cella = cellaDi(pos, 0.1);
  // Una lista vuota (nessuna gemma, o rete assente: getGemmeVicine dà [] in
  // tutti e due i casi) si riprova dopo un'ora, non il giorno dopo.
  if (cache && cache.cella === cella && cache.giorno === oggi && Array.isArray(cache.lista)
    && (cache.lista.length || Date.now() - (cache.ts || 0) < 3_600_000)) return conMetri(cache.lista);
  const grezze = await getGemmeVicine(pos.lat, pos.lon, 15000, 30);
  const candidate = (grezze || [])
    .filter((p: any) => {
      const id = String(p?.id || '');
      if (!id || id.startsWith('iti-') || id.startsWith('vision-') || !RE_ID_POI.test(id)) return false;
      if (String(p.category || '') === 'community') return false;
      if (!(p.description_short || p.description_ai)) return false;
      return !!fotoWidget(migliorFoto(p), 640);
    })
    .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  const n = candidate.length;
  const lista: VoceLuogo[] = [];
  if (n) {
    // Scelta deterministica per giorno e cella; mai la stessa del giorno prima.
    const scegli = (giorno: string, prima: string | null): any => {
      let i = parseInt(hash8(`${giorno}|${cella}`), 16) % n;
      if (n > 1 && String(candidate[i].id) === prima) i = (i + 1) % n;
      return candidate[i];
    };
    let prima: string | null = String(scegli(giornoTra(-1), null).id);
    for (let k = 0; k < 3; k++) {
      const giorno = giornoTra(k);
      const p: any = scegli(giorno, prima);
      prima = String(p.id);
      lista.push({
        giorno, id: String(p.id), nome: String(p.name || ''), citta: String(p.city || ''),
        foto: fotoWidget(migliorFoto(p), 640), attribuzione: String(p.image_attribution || ''),
        metri: Math.round(metriTra(pos, { lat: Number(p.lat), lon: Number(p.lon) })),
        lat: Number(p.lat), lon: Number(p.lon),
      });
    }
  }
  scriviJson(CHIAVE_LUOGO, { cella, giorno: oggi, lista, ts: Date.now() });
  return lista;
}

// ── 10: meteo e garanzia pioggia ──────────────────────────────────────────
const CHIAVE_METEO = 'wip_widget_meteo';
const MS_METEO = 30 * 60_000;
type CacheMeteo = { cella: string; ts: number; lat: number; lon: number; citta: string; lingua: string; dati: any };

/** Il punto dell'ultimo meteo mostrato (azione «meteo» del widget: la mappa si centra lì). */
export function puntoMeteoWidget(): { lat: number; lon: number } | null {
  const c = leggiJson<CacheMeteo>(CHIAVE_METEO);
  return c && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? { lat: c.lat, lon: c.lon } : null;
}

function puntoDelMeteo(pos: { lat: number; lon: number } | null): { lat: number; lon: number; fonte: 'tappa' | 'posizione'; luogo: string } | null {
  try {
    const it = itinerarioPerWidget();
    if (it?.tappe?.length) {
      const da = it.fonte === 'giro' ? 0 : Math.max(0, it.prossimaIdx);
      const t = it.tappe.slice(da).find(x => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon)) && Number(x.lat) !== 0 && Number(x.lon) !== 0);
      if (t) return { lat: Number(t.lat), lon: Number(t.lon), fonte: 'tappa', luogo: t.titolo };
    }
  } catch { /* nessun itinerario */ }
  return pos ? { ...pos, fonte: 'posizione', luogo: '' } : null;
}

const minutiOra = (hhmm: string): number => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const hhmm = (min: number): string => { const x = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/**
 * L'ora migliore fra adesso e le 21 (ora locale del punto, come la manda il
 * server): finestre di due ore consecutive, punteggio = pioggia×2 + mm×20
 * (+30 se fa troppo caldo o troppo freddo). Tutte asciutte → tutto il giorno;
 * tutte bagnate → giornata da musei.
 */
function oraMiglioreDi(ore: any[], rainProb: number): { esito: 'finestra' | 'tuttoIlGiorno' | 'musei'; finestra: { da: number; a: number; testo: string } | null } {
  const adesso = Date.now();
  const utili: any[] = [];
  let ultimoMin = -1;
  for (const o of ore) {
    const ts = Number(o?.ts);
    if (!Number.isFinite(ts) || ts < adesso - 3_600_000) continue;
    const min = minutiOra(o?.ora);
    if (min < 0 || min < ultimoMin) break; // passata la mezzanotte
    ultimoMin = min;
    if (min > 20 * 60) break; // la finestra deve chiudersi entro le 21
    utili.push(o);
  }
  const finestre: { i: number; punti: number; max: number; min: number }[] = [];
  for (let i = 0; i + 1 < utili.length; i++) {
    const due = [utili[i], utili[i + 1]];
    const punti = due.reduce((s, o) => {
      const t = Number(o.percepita ?? o.temp);
      return s + (Number(o.pioggia) || 0) * 2 + (Number(o.mm) || 0) * 20 + (Number.isFinite(t) && (t >= 32 || t <= 5) ? 30 : 0);
    }, 0);
    const pioggie = due.map(o => Number(o.pioggia) || 0);
    finestre.push({ i, punti, max: Math.max(...pioggie), min: Math.min(...pioggie) });
  }
  if (!finestre.length) {
    // Ore non disponibili (server senza oreMeteo) o sera inoltrata: si dice
    // solo quello che la probabilità delle prossime ore consente.
    return { esito: rainProb < 20 ? 'tuttoIlGiorno' : rainProb >= 60 ? 'musei' : 'finestra', finestra: null };
  }
  if (finestre.every(f => f.max < 20)) return { esito: 'tuttoIlGiorno', finestra: null };
  if (finestre.every(f => f.min >= 60)) return { esito: 'musei', finestra: null };
  const migliore = finestre.reduce((a, b) => (b.punti < a.punti ? b : a));
  const a = utili[migliore.i], b = utili[migliore.i + 1];
  return {
    esito: 'finestra',
    finestra: { da: Number(a.ts), a: Number(b.ts) + 3_600_000, testo: `${hhmm(minutiOra(a.ora))}–${hhmm(minutiOra(b.ora) + 60)}` },
  };
}

async function meteoPerWidget(pos: { lat: number; lon: number } | null, l: string): Promise<SnapshotWidget['meteo']> {
  const punto = puntoDelMeteo(pos);
  if (!punto) return null;
  const cella = cellaDi(punto, 0.1);
  let cache = leggiJson<CacheMeteo>(CHIAVE_METEO);
  if (!cache || cache.cella !== cella || Date.now() - cache.ts > MS_METEO || (punto.fonte === 'posizione' && cache.lingua !== l)) {
    try {
      const r = await fetch(getApiUrl(`/api/meteo/punto?lat=${punto.lat.toFixed(4)}&lon=${punto.lon.toFixed(4)}`), { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`meteo ${r.status}`);
      const dati = await r.json();
      let citta = '';
      if (punto.fonte === 'posizione') {
        // Il nome del posto nella lingua dell'utente: rotta senza AI, in cache 30 giorni sul server.
        try {
          const g = await fetch(getApiUrl(`/api/geo/citta?lat=${punto.lat.toFixed(4)}&lon=${punto.lon.toFixed(4)}&lang=${l}`), { signal: AbortSignal.timeout(8000) });
          if (g.ok) { const j = await g.json(); citta = String(j?.utente || j?.en || ''); }
        } catch { /* senza nome */ }
      }
      cache = { cella, ts: Date.now(), lat: punto.lat, lon: punto.lon, citta, lingua: l, dati };
      scriviJson(CHIAVE_METEO, cache);
    } catch {
      if (!cache || cache.cella !== cella) return null; // meglio nessun meteo che quello di un altro posto
    }
  }
  if (!cache) return null;
  const d = cache.dati || {};
  const temp = Number(d.temp);
  if (!Number.isFinite(temp)) return null;
  const code = Number(d.code) || 0;
  const oreGrezze: any[] = Array.isArray(d.oreMeteo) ? d.oreMeteo : [];
  const rainProb = Math.round(Number(d.rainProb) || 0);
  const { esito, finestra } = oraMiglioreDi(oreGrezze, rainProb);
  return {
    luogo: punto.fonte === 'tappa' ? punto.luogo : cache.citta || '',
    fonte: punto.fonte,
    temp: Math.round(temp), code, descr: nomeWmo(code, l), pioggiaProb: rainProb,
    ore: oreGrezze
      .filter(o => Number(o?.ts) >= Date.now() - 3_600_000)
      .slice(0, 12)
      .map(o => ({ ts: Number(o.ts), ora: String(o.ora || ''), temp: Math.round(Number(o.temp) || 0), code: Number(o.code) || 0, pioggia: Math.round(Number(o.pioggia) || 0) })),
    oraMigliore: finestra, esito,
    attribuzione: String(d.attribuzione || 'MET Norway (NLOD / CC BY 4.0)'),
    ts: cache.ts,
  };
}

// Garanzia: solo con l'account e con un piano salvato che ha l'id. Mai una
// promessa di rimborso se il server non la conferma; mai /claim.
let garanziaCache: { id: string; ts: number; valore: SnapshotWidget['garanzia'] } | null = null;
async function garanziaPerWidget(sessione: boolean, l: string): Promise<SnapshotWidget['garanzia']> {
  const id = leggiPiano()?.id;
  if (!sessione || !id) return null;
  if (garanziaCache && garanziaCache.id === id && Date.now() - garanziaCache.ts < 3_600_000) return garanziaCache.valore;
  let valore: SnapshotWidget['garanzia'] = null;
  try {
    const r = await apiFetch(getApiUrl(`/api/rain-guarantee/stato?itineraryId=${encodeURIComponent(id)}`), undefined, 10000);
    if (r.ok) {
      const j = await r.json();
      const finoAl = typeof j?.finoAl === 'number' ? j.finoAl : Date.parse(String(j?.finoAl || ''));
      if (j?.ok !== false && j?.coperta === true && Number.isFinite(finoAl) && finoAl > Date.now() - 86_400_000) {
        const reclamabile = Array.isArray(j.giorniReclamabili) && j.giorniReclamabili.length > 0;
        const et = ETICHETTE[l] || ETICHETTE.it;
        let data = '';
        try { data = new Intl.DateTimeFormat(l, { day: '2-digit', month: '2-digit' }).format(new Date(finoAl)); } catch { /* niente */ }
        valore = { stato: reclamabile ? 'reclamabile' : 'attiva', finoAl, testo: reclamabile ? et.rimborsabile : `${et.attivaFino} ${data}`.trim() };
      }
    }
  } catch { valore = null; }
  garanziaCache = { id, ts: Date.now(), valore };
  return valore;
}

// ── 38: ascolta ora ───────────────────────────────────────────────────────
let ultimaPosAscolta: { lat: number; lon: number } | null = null;
let ascoltaCache: (NonNullable<SnapshotWidget['ascoltaOra']> & { lat: number; lon: number }) | null = null;
const prontaCache = new Map<string, boolean>();
const RE_COMMERCIALE = /restaurant|ristorant|trattoria|pizzeria|\bbar\b|cafe|caff|pub|hotel|albergo|hostel|b&b|motel|shop|negozi|store|supermarket|mall|charg|ricaric|parking|parcheggi|beach_club|stabiliment|fuel|carburant|pharmac|farmac|bank|banca/i;

async function ascoltaOraPerWidget(pos: { lat: number; lon: number } | null, l: string): Promise<SnapshotWidget['ascoltaOra']> {
  const conMetri = () => {
    if (!ascoltaCache) return null;
    const { lat, lon, ...resto } = ascoltaCache;
    return { ...resto, metri: pos ? Math.round(metriTra(pos, { lat, lon })) : resto.metri };
  };
  if (!pos) return conMetri();
  if (ultimaPosAscolta && metriTra(ultimaPosAscolta, pos) < METRI_PER_RICALCOLO) return conMetri();
  try {
    let subcats: Record<string, boolean> | null = null;
    try { const raw = localStorage.getItem('wip_active_subcategories'); subcats = raw ? JSON.parse(raw) : null; } catch { subcats = null; }
    const grezzi = await getNearbyPois(pos.lat, pos.lon, 500).catch(() => []);
    const ordinati = (grezzi || [])
      .filter((p: any) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon)))
      .map((p: any) => ({ p, m: metriTra(pos, { lat: Number(p.lat), lon: Number(p.lon) }) }))
      .sort((a, b) => a.m - b.m);
    let scelto: { p: any; m: number } | null = null;
    for (const c of ordinati) {
      const p = c.p;
      const id = String(p.id || '');
      const cat = String(p.category || '').toLowerCase();
      if (!p.name || !RE_ID_POI.test(id) || id.startsWith('iti-') || id.startsWith('vision-') || id.startsWith('ov-')) continue;
      if (SENZA_AUDIOGUIDA.has(cat)) continue;
      if (subcats && typeof subcats === 'object' && !isCategoryAllowed(p, subcats)) continue;
      if (String(p.source || '') === 'overture' && RE_COMMERCIALE.test(`${cat} ${p.poi_type || ''}`)) continue;
      scelto = c;
      break;
    }
    if (!scelto) { ascoltaCache = null; ultimaPosAscolta = pos; return null; }
    const p = scelto.p;
    const id = String(p.id);
    const pers = getGuideCharacter() === 'dante' ? 'dante' : 'nicky';
    const chiave = `${id}|${l}|${pers}`;
    let pronta = prontaCache.get(chiave);
    if (pronta === undefined) {
      pronta = !!(await leggiTestoInCache(id, l.toUpperCase(), pers));
      prontaCache.set(chiave, pronta);
    }
    ascoltaCache = {
      id, nome: String(p.name), metri: Math.round(scelto.m), foto: fotoWidget(migliorFoto(p), 320),
      categoria: String(p.category || p.poi_type || ''), pronta, lat: Number(p.lat), lon: Number(p.lon),
    };
    ultimaPosAscolta = pos;
  } catch { /* si tiene la cache */ }
  return conMetri();
}

// ── 6: eventi e mostre ────────────────────────────────────────────────────
const CHIAVE_EVENTI = 'wip_widget_eventi';
export const EVENTI_WIDGET_SALVATI = 'wip-widget-eventi-salvati';
type VoceEvento = { k: string; titolo: string; ts: number; conOra: boolean; luogo: string; lat: number | null; lon: number | null; categoria: string; link: string };
type CacheEventi = { ts: number; lat: number | null; lon: number | null; lista: VoceEvento[] };

/** Quello che serve di un evento di EventsScreen (EventData) o delle due rotte di ripiego. */
export type EventoPerWidget = {
  id?: string; name: string; date: string; time?: string; endDate?: string; venueName?: string;
  lat?: number | null; lon?: number | null; source: string; macroCategory?: string; isMusic?: boolean;
  url?: string; link?: string; approxCoords?: boolean;
};

const AFFIL_OUT_HOST_RE = /(^|\.)((ticketmaster|livenation|getyourguide|gyg)\.[a-z]{2,3}(\.[a-z]{2})?|viator\.com|vi\.me|tiqets\.com|klook\.com|trip\.com|eventiesagre\.it|openstreetmap\.org)$/i;
/**
 * Il link d'uscita verso un partner, passando da /api/out (conta i clic).
 * Stessa regola di EventsScreen.outUrl, che ora chiama questa.
 */
export function linkUscitaEvento(url: string, source: string): string {
  const finalUrl = ensureAffiliateUrl(String(url || ''));
  try {
    const host = new URL(finalUrl).hostname;
    const src = source === 'tiqets_mostre' ? 'tiqets' : source;
    if (['ticketmaster', 'viator', 'getyourguide', 'tiqets', 'klook', 'tripcom', 'local', 'mostre'].includes(src) && AFFIL_OUT_HOST_RE.test(host)) {
      return getApiUrl(`/api/out?u=${encodeURIComponent(finalUrl)}&src=${src}`);
    }
  } catch { /* URL malformato: link diretto */ }
  return finalUrl;
}

function categoriaEvento(e: EventoPerWidget): string {
  const m = String(e.macroCategory || '').toLowerCase();
  if (/teatr|spettacol|theat|danza|opera/.test(m)) return 'teatro';
  if (e.source === 'tiqets_mostre' || e.source === 'mostre' || /mostr|exhib/.test(m)) return 'mostra';
  if (e.isMusic || e.source === 'ticketmaster' || /concert|music/.test(m)) return 'musica';
  return 'festa';
}

/**
 * Tiene al massimo 4 eventi con una data vera (Ticketmaster, mostre Tiqets,
 * feste locali) fra oggi e 7 giorni, entro 25 km quando si sa dove sono,
 * senza doppioni, per data e poi per distanza. Le foto dei partner restano
 * fuori: non sono foto di un luogo (il nativo mostra un simbolo).
 */
export function salvaEventiPerWidget(lista: EventoPerWidget[], pos?: { lat: number; lon: number } | null): void {
  try {
    const qui = pos || (() => { const l = locationService.getLastLocation(); return l ? { lat: l.latitude, lon: l.longitude } : null; })();
    const oggi = giornoLocale(), fine = giornoTra(7);
    const visti = new Set<string>();
    const scelti: (VoceEvento & { m: number })[] = [];
    for (const e of lista || []) {
      if (!e?.name || !['ticketmaster', 'tiqets_mostre', 'local'].includes(e.source)) continue;
      const dal = String(e.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dal)) continue;
      let giorno = dal;
      if (e.source === 'tiqets_mostre') {
        // Una mostra è un periodo: vale se è aperta in almeno un giorno della settimana.
        const al = String(e.endDate || '').slice(0, 10);
        if (dal > fine || (al && al < oggi)) continue;
        if (giorno < oggi) giorno = oggi;
      } else if (giorno < oggi || giorno > fine) continue;
      const conOra = e.source === 'ticketmaster' && /^\d{2}:\d{2}/.test(String(e.time || ''));
      const ts = new Date(`${giorno}T${conOra ? String(e.time).slice(0, 5) : '12:00'}:00`).getTime();
      if (!Number.isFinite(ts)) continue;
      const lat = Number.isFinite(Number(e.lat)) && Number(e.lat) !== 0 ? Number(e.lat) : null;
      const lon = Number.isFinite(Number(e.lon)) && Number(e.lon) !== 0 ? Number(e.lon) : null;
      const m = qui && lat !== null && lon !== null && !e.approxCoords ? metriTra(qui, { lat, lon }) : Infinity;
      if (m !== Infinity && m > 25_000) continue;
      const titolo = String(e.name).trim();
      const doppio = `${titolo.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 40)}|${giorno}`;
      if (visti.has(doppio)) continue;
      visti.add(doppio);
      const link = String(e.link || (e.url ? linkUscitaEvento(e.url, e.source) : ''));
      scelti.push({
        k: hash8(String(e.id || '') || `${titolo}|${giorno}`), titolo, ts, conOra,
        luogo: String(e.venueName || ''), lat: e.approxCoords ? null : lat, lon: e.approxCoords ? null : lon,
        categoria: categoriaEvento(e), link, m,
      });
    }
    scelti.sort((a, b) => (a.ts - b.ts) || (a.m - b.m));
    const salvati: VoceEvento[] = scelti.slice(0, 4).map(({ m: _m, ...v }) => v);
    // Una ricerca su un'altra città (la scheda Eventi segue la mappa) non
    // deve cancellare gli eventi di qui: una lista vuota non sovrascrive una
    // lista piena salvata qui vicino.
    const prima = leggiJson<CacheEventi>(CHIAVE_EVENTI);
    if (!salvati.length && prima?.lista?.length && qui && prima.lat !== null && prima.lon !== null && metriTra(qui, { lat: prima.lat, lon: prima.lon }) < 5000) return;
    scriviJson(CHIAVE_EVENTI, { ts: Date.now(), lat: qui?.lat ?? null, lon: qui?.lon ?? null, lista: salvati } as CacheEventi);
  } catch { /* il widget resta com'era */ }
  try { window.dispatchEvent(new CustomEvent(EVENTI_WIDGET_SALVATI)); } catch { /* niente */ }
}

/** Il link del biglietto di un evento del widget (mai un URL dal deep link). */
export function trovaEventoWidget(k: string): { link: string; titolo: string } | null {
  if (!RE_K.test(String(k || ''))) return null;
  const c = leggiJson<CacheEventi>(CHIAVE_EVENTI);
  const e = c?.lista?.find(x => x.k === k);
  return e && e.link ? { link: e.link, titolo: e.titolo } : null;
}

let eventiTentativo: { ts: number; lat: number; lon: number } | null = null;
/** Senza aprire la scheda Eventi: Ticketmaster e mostre Tiqets (niente AI, cache condivisa sul server). */
async function ricaricaEventiDiRipiego(pos: { lat: number; lon: number }, l: string): Promise<void> {
  const oggi = giornoLocale();
  const lista: EventoPerWidget[] = [];
  const inizio = new Date(oggi).toISOString().split('.')[0] + 'Z';
  const fine = new Date(new Date(giornoTra(7)).getTime() + 86_400_000).toISOString().split('.')[0] + 'Z';
  const [tm, tq] = await Promise.allSettled([
    fetch(getApiUrl(`/api/ticketmaster?lat=${pos.lat}&lon=${pos.lon}&radius=25&startDateTime=${inizio}&endDateTime=${fine}&lang=${l}`), { signal: AbortSignal.timeout(15000) }).then(r => (r.ok ? r.json() : null)),
    fetch(getApiUrl(`/api/tiqets/mostre?lat=${pos.lat}&lon=${pos.lon}&radius_km=25&lang=${l}`), { signal: AbortSignal.timeout(15000) }).then(r => (r.ok ? r.json() : null)),
  ]);
  if (tm.status === 'fulfilled' && tm.value) {
    for (const item of (tm.value?._embedded?.events || []) as any[]) {
      const testo = `${item?.name || ''} ${item?.info || item?.description || ''}`.toLowerCase();
      lista.push({
        id: String(item?.id || ''), name: String(item?.name || ''),
        date: item?.dates?.start?.localDate || '',
        time: item?.dates?.start?.localTime ? String(item.dates.start.localTime).slice(0, 5) : undefined,
        venueName: item?._embedded?.venues?.[0]?.name || '',
        lat: Number(item?._embedded?.venues?.[0]?.location?.latitude) || null,
        lon: Number(item?._embedded?.venues?.[0]?.location?.longitude) || null,
        source: 'ticketmaster', isMusic: /music|concert/.test(testo), url: String(item?.url || ''),
      });
    }
  }
  if (tq.status === 'fulfilled' && tq.value) {
    for (const m of (tq.value?.mostre || []) as any[]) {
      const lat = Number(m?.lat), lon = Number(m?.lon);
      // Prodotto senza coordinate: il server mette il centro della ricerca → distanza ignota.
      const alCentro = Math.abs(lat - pos.lat) < 1e-6 && Math.abs(lon - pos.lon) < 1e-6;
      lista.push({
        id: String(m?.id || ''), name: String(m?.titolo || ''), date: String(m?.dal || oggi), endDate: String(m?.al || ''),
        venueName: String(m?.luogo || ''), lat: alCentro ? null : lat || null, lon: alCentro ? null : lon || null,
        source: 'tiqets_mostre', macroCategory: m?.tipo_evento === 'exhibition' ? 'mostra' : '', url: String(m?.sito || ''),
      });
    }
  }
  if (tm.status === 'rejected' && tq.status === 'rejected') return;
  salvaEventiPerWidget(lista, pos);
}

function eventiPerWidget(pos: { lat: number; lon: number } | null, l: string): NonNullable<SnapshotWidget['eventi']> {
  const c = leggiJson<CacheEventi>(CHIAVE_EVENTI);
  if (pos && (!c || Date.now() - (c.ts || 0) > 12 * 3_600_000)) {
    const lontano = eventiTentativo ? metriTra(eventiTentativo, pos) > 5000 : true;
    if (!eventiTentativo || Date.now() - eventiTentativo.ts > 3 * 3_600_000 || lontano) {
      eventiTentativo = { ts: Date.now(), ...pos };
      void ricaricaEventiDiRipiego(pos, l).catch(() => {});
    }
  }
  if (!c?.lista?.length) return [];
  const oggi = giornoLocale();
  return c.lista
    .filter(e => (e.conOra ? e.ts >= Date.now() - 3 * 3_600_000 : giornoLocale(new Date(e.ts)) >= oggi) && RE_K.test(e.k))
    .slice(0, 4)
    .map(e => ({
      k: e.k, titolo: e.titolo, quando: quandoBreve(e.ts, l, e.conOra), ts: e.ts, luogo: e.luogo,
      metri: pos && e.lat !== null && e.lon !== null ? Math.round(metriTra(pos, { lat: e.lat, lon: e.lon })) : null,
      biglietto: !!e.link, categoria: e.categoria,
    }));
}

// ── 60: gemma della regione ───────────────────────────────────────────────
const CHIAVE_REGIONE = 'wip_widget_regione';
type GemmaSalvata = { id: string; nome: string; regione: string; citta: string; foto: string; attribuzione: string; lat: number; lon: number };
async function gemmaRegionePerWidget(pos: { lat: number; lon: number } | null, l: string): Promise<SnapshotWidget['gemmaRegione']> {
  const cache = leggiJson<{ cella: string; lingua: string; ts: number; gemma: GemmaSalvata | null }>(CHIAVE_REGIONE);
  const esci = (g: GemmaSalvata | null | undefined): SnapshotWidget['gemmaRegione'] => {
    if (!g || !g.foto || !RE_ID_POI.test(g.id)) return null;
    return { id: g.id, nome: g.nome, regione: g.regione, citta: g.citta, foto: g.foto, attribuzione: g.attribuzione, metri: pos ? Math.round(metriTra(pos, { lat: g.lat, lon: g.lon })) : 0 };
  };
  if (!pos) return esci(cache?.gemma);
  const cella = cellaDi(pos, 0.5);
  if (cache && cache.cella === cella && cache.lingua === l && Date.now() - cache.ts < 86_400_000) return esci(cache.gemma);
  let gemma: GemmaSalvata | null = null;
  try {
    const r = await fetch(getApiUrl(`/api/gemme/regione?lat=${pos.lat.toFixed(4)}&lon=${pos.lon.toFixed(4)}&lang=${l}`), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) {
      // Rotta non ancora pubblicata o in errore: niente gemma, si riprova fra un'ora.
      scriviJson(CHIAVE_REGIONE, { cella, lingua: l, ts: Date.now() - 23 * 3_600_000, gemma: null });
      return null;
    }
    const g = (await r.json())?.gemma;
    if (g?.id) {
      const foto = fotoWidget(g.foto, 640);
      const lat = Number(g.lat), lon = Number(g.lon);
      if (foto && Number.isFinite(lat) && Number.isFinite(lon)) {
        gemma = { id: String(g.id), nome: String(g.nome || ''), regione: String(g.regione || ''), citta: String(g.citta || ''), foto, attribuzione: String(g.attribuzione || ''), lat, lon };
      }
    }
  } catch { return esci(cache?.cella === cella ? cache.gemma : null); }
  scriviJson(CHIAVE_REGIONE, { cella, lingua: l, ts: Date.now(), gemma });
  return esci(gemma);
}

// ── 13: foto dalla community ──────────────────────────────────────────────
const CHIAVE_COMMUNITY = 'wip_widget_community';
type FotoSalvata = { poiId: string; cardId: string; nome: string; citta: string; foto: string; lat: number; lon: number; quandoTs: number };
async function fotoCommunityPerWidget(pos: { lat: number; lon: number } | null, l: string): Promise<SnapshotWidget['fotoCommunity']> {
  const bloccati = (() => { try { return getBlockedCommunityPoiIds(); } catch { return new Set<string>(); } })();
  const esci = (f: FotoSalvata | null | undefined): SnapshotWidget['fotoCommunity'] => {
    if (!f || bloccati.has(f.poiId) || bloccati.has(`vision-${f.cardId}`) || !RE_ID_POI.test(f.poiId)) return null;
    return { poiId: f.poiId, nome: f.nome, citta: f.citta, foto: f.foto, metri: pos ? Math.round(metriTra(pos, { lat: f.lat, lon: f.lon })) : 0, quando: quandoBreve(f.quandoTs, l, false) };
  };
  const cache = leggiJson<{ cella: string; ts: number; foto: FotoSalvata | null }>(CHIAVE_COMMUNITY);
  if (!pos) return esci(cache?.foto);
  const cella = cellaDi(pos, 0.05);
  if (cache && cache.cella === cella && Date.now() - cache.ts < 45 * 60_000) return esci(cache.foto);
  let scelta: FotoSalvata | null = null;
  try {
    const leggi = async (km: number): Promise<any[]> => {
      const r = await fetch(getApiUrl(`/api/vision/community?lat=${pos.lat.toFixed(4)}&lon=${pos.lon.toFixed(4)}&radiusKm=${km}&limit=10&ordine=verifica`), { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`community ${r.status}`);
      const j = await r.json();
      return Array.isArray(j?.cards) ? j.cards : [];
    };
    let carte = await leggi(15);
    if (!carte.length) carte = await leggi(50);
    let verifiche = 0;
    for (const c of carte) {
      const foto = /^https:\/\//i.test(String(c?.published_photo_url || '')) ? fotoWidget(c.published_photo_url, 640) : '';
      const poiId = String(c?.published_poi_id || '');
      if (!foto || !poiId || !RE_ID_POI.test(poiId)) continue;
      if (bloccati.has(`vision-${c.id}`) || bloccati.has(poiId)) continue;
      if (verifiche >= 3) break;
      verifiche++;
      // Il luogo è sospeso (segnalazioni) o nascosto? La scheda resta
      // «approved» ma il POI no: si passa alla foto dopo.
      const poi: any = await getPoiById(poiId).catch(() => null);
      if (poi && (poi.is_hidden || poi.status === 'needs_revision')) continue;
      const lat = Number(c.lat), lon = Number(c.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      scelta = {
        poiId, cardId: String(c.id || ''), nome: String(poi?.name || c.name || ''), citta: String(c.city || poi?.city || ''),
        foto, lat, lon, quandoTs: Date.parse(c.reviewed_at || c.created_at || '') || 0,
      };
      break;
    }
  } catch { return esci(cache?.cella === cella ? cache.foto : null); }
  scriviJson(CHIAVE_COMMUNITY, { cella, ts: Date.now(), foto: scelta });
  return esci(scelta);
}

// ── 59: guida stampata ────────────────────────────────────────────────────
async function guidaStampataPerWidget(l: string): Promise<SnapshotWidget['guidaStampata']> {
  const v = (await elencoPdf())[0];
  if (!v?.id) return null;
  return { k: hash8(v.id), tipo: v.tipo, nome: v.nome, quando: quandoBreve(v.data, l, false), ts: v.data };
}

// ── 33: confronto opere ───────────────────────────────────────────────────
const CHIAVE_OPERE = 'wip_widget_opere_oggi';
type RegistroOpere = { giorno: string; opere: OperaAscoltata[] };

/** Scritta da MuseumVisitSheet.parlaGuida: le opere ascoltate oggi (al massimo 20). */
export function registraOperaAscoltata(x: OperaAscoltata): void {
  if (!x?.k || !x.nome) return;
  const oggi = giornoLocale();
  const reg = leggiJson<RegistroOpere>(CHIAVE_OPERE);
  const opere = reg && reg.giorno === oggi && Array.isArray(reg.opere) ? reg.opere.filter(o => o.k !== x.k) : [];
  opere.push({ ...x, ts: x.ts || Date.now() });
  scriviJson(CHIAVE_OPERE, { giorno: oggi, opere: opere.slice(-20) });
  programma();
}

/** Un'opera del widget dalla sua chiave: registro di oggi, poi l'ultimo ascolto. */
export function trovaOperaWidget(k: string): OperaAscoltata | null {
  if (!RE_K.test(String(k || ''))) return null;
  const reg = leggiJson<RegistroOpere>(CHIAVE_OPERE);
  const o = reg?.opere?.find(x => x.k === k);
  if (o) return o;
  const u = leggiJson<UltimoAscolto>(CHIAVE_ULTIMO);
  if (u?.tipo === 'opera' && u.id === k) return { k, venueKey: u.venueKey || '', museo: u.museo || u.luogo || '', nome: u.nome, nomeFonte: u.nomeFonte, foto: u.foto, ts: u.ts };
  return null;
}

function confrontoPerWidget(): SnapshotWidget['confronto'] {
  const oggi = giornoLocale();
  const reg = leggiJson<RegistroOpere>(CHIAVE_OPERE);
  if (!reg || reg.giorno !== oggi || !Array.isArray(reg.opere) || reg.opere.length < 2) return null;
  const votate = coppieVotate();
  const perK = new Map<string, OperaAscoltata>(reg.opere.map(o => [o.k, o] as [string, OperaAscoltata]));
  const conFoto = (o?: OperaAscoltata) => !!o && !!fotoWidget(o.foto, 320);
  let coppia: [OperaAscoltata, OperaAscoltata] | null = null;
  // 1) La visita di oggi: coppie per stesso autore, soggetto o epoca.
  try {
    const v = getVisit();
    if (v && giornoLocale(new Date(v.startedAt || 0)) === oggi) {
      const kDi = (i: number) => hash8(`${v.venueKey}|${v.guide.tappe[i].nomeFonte || v.guide.tappe[i].nome}`);
      const attivi = new Set<number>();
      v.guide.tappe.forEach((_, i) => { if (perK.has(kDi(i))) attivi.add(i); });
      if (attivi.size >= 2) {
        for (const c of coppieDaConfrontare(v, attivi, 3)) {
          const a = perK.get(kDi(c.a)), b = perK.get(kDi(c.b));
          if (a && b && conFoto(a) && conFoto(b) && !votate.has(chiaveCoppia(a.k, b.k))) { coppia = [a, b]; break; }
        }
      }
    }
  } catch { /* nessuna visita */ }
  // 2) Altrimenti le ultime due ascoltate con foto, non ancora votate.
  if (!coppia) {
    const lista = reg.opere.filter(o => conFoto(o)).reverse();
    for (let i = 0; i < lista.length && !coppia; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (lista[i].k !== lista[j].k && !votate.has(chiaveCoppia(lista[i].k, lista[j].k))) { coppia = [lista[j], lista[i]]; break; }
      }
    }
  }
  if (!coppia) return null;
  const [a, b] = coppia;
  const lato = (o: OperaAscoltata) => ({ k: o.k, nome: o.nome, autore: String(o.autore || ''), foto: fotoWidget(o.foto, 320) });
  return { giorno: oggi, museo: a.museo || b.museo || '', a: lato(a), b: lato(b) };
}

// ── Composizione e consegna ───────────────────────────────────────────────
let inCorso = false;
let daRifare = false;
let ultimoInvio = 0;
let timer: any = null;

async function componi(): Promise<SnapshotWidget> {
  const l = lingua();
  const last = locationService.getLastLocation();
  const pos = last && Number.isFinite(last.latitude) && Number.isFinite(last.longitude) ? { lat: last.latitude, lon: last.longitude } : null;
  // Una sola lettura della sessione, condivisa fra crediti e widget nuovi.
  let userId: string | null = null;
  try { const { data } = await supabase.auth.getSession(); userId = data?.session?.user?.id || null; } catch { userId = null; }
  const sessione = !!userId;
  // Ogni fonte nuova è protetta: un errore dà il suo valore «vuoto», mai uno snapshot perso.
  const [crediti, vicini, luogoGiorno, meteo, garanzia, ascoltaOra, gemmaRegione, fotoCommunity, guidaStampata, linguaAlt] = await Promise.all([
    creditiPerWidget(userId),
    viciniPerWidget(pos),
    luogoGiornoPerWidget(pos).catch(() => [] as NonNullable<SnapshotWidget['luogoGiorno']>),
    meteoPerWidget(pos, l).catch(() => null),
    garanziaPerWidget(sessione, l).catch(() => null),
    ascoltaOraPerWidget(pos, l).catch(() => null),
    gemmaRegionePerWidget(pos, l).catch(() => null),
    fotoCommunityPerWidget(pos, l).catch(() => null),
    guidaStampataPerWidget(l).catch(() => null),
    linguaAltPerWidget(l).catch(() => null),
  ]);
  const sicuro = <T,>(f: () => T, vuoto: T): T => { try { return f(); } catch { return vuoto; } };
  const ultimoAscolto = sicuro(() => ultimoAscoltoPerWidget(l), null);
  const dati: SnapshotWidget = {
    v: VERSIONE,
    ts: Date.now(),
    lingua: l,
    etichette: ETICHETTE[l] || ETICHETTE.it,
    crediti,
    visita: visitaPerWidget(),
    itinerario: itinerarioPerWidget(),
    vicini,
    posizione: pos ? { ...pos, ts: last?.timestamp || Date.now() } : null,
    rev: 2,
    sessione,
    ultimoAscolto,
    linguaAlt: ultimoAscolto ? linguaAlt : null,
    luogoGiorno,
    meteo,
    garanzia,
    ascoltaOra,
    eventi: sicuro(() => eventiPerWidget(pos, l), []),
    gemmaRegione,
    confronto: sicuro(() => confrontoPerWidget(), null),
    guidaStampata,
    fotoCommunity,
  };
  // Tetto di dimensione (UserDefaults/SharedPreferences e Binder): si
  // alleggerisce nell'ordine eventi, luoghi dei giorni dopo, ore del meteo.
  const tetto = 60_000;
  if (JSON.stringify(dati).length > tetto) dati.eventi = [];
  if (JSON.stringify(dati).length > tetto) dati.luogoGiorno = (dati.luogoGiorno || []).filter(x => x.giorno === giornoLocale());
  if (JSON.stringify(dati).length > tetto && dati.meteo) dati.meteo = { ...dati.meteo, ore: dati.meteo.ore.slice(0, 6) };
  return dati;
}

/**
 * Compone e consegna subito lo snapshot (con un piccolo freno anti-raffica).
 * Una richiesta che arriva durante una consegna non si perde più: si segna
 * `daRifare` e si riparte alla fine (23/09/2026).
 */
export async function aggiornaWidget(forza = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (inCorso) { daRifare = true; return; }
  if (!forza && Date.now() - ultimoInvio < MS_TRA_AGGIORNAMENTI) { programma(); return; }
  inCorso = true;
  try {
    const dati = await componi();
    await WipWidgets.aggiorna({ dati: JSON.stringify(dati) });
    ultimoInvio = Date.now();
  } catch (e) {
    console.warn('[widget] snapshot non consegnato', e);
  } finally {
    inCorso = false;
    if (daRifare) { daRifare = false; programma(); }
  }
}

/** Aggiornamento differito (coalesce di più eventi ravvicinati). */
function programma(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void aggiornaWidget(true); }, 1500);
}

let avviata = false;
/**
 * Da chiamare una volta all'avvio dell'app (App.tsx): ascolta gli eventi
 * che cambiano ciò che i widget mostrano e riconsegna lo snapshot.
 */
export function avviaSincronizzazioneWidget(): void {
  if (avviata || !Capacitor.isNativePlatform()) return;
  avviata = true;
  const eventi = [MUSEUM_VISIT_EVENT, 'wip-giro-avviato', 'wip-giro-ricalcolato', 'wip-giro-terminato', 'wip-settings-updated', 'wip-itinerary-checkin',
    // (23/09/2026) widget nuovi: ascolti, PDF in archivio, eventi salvati, voti.
    LISTENING_HISTORY_EVENT, EVENTO_DOWNLOADS, EVENTI_WIDGET_SALVATI, VOTO_OPERA_EVENT];
  for (const e of eventi) window.addEventListener(e, programma);
  // Crediti e Day Pass: la cache di 60 s si salta, il saldo nuovo va subito.
  for (const e of [CREDITS_UPDATED_EVENT, DAY_PASS_UPDATED_EVENT]) {
    window.addEventListener(e, () => { creditiCache = null; garanziaCache = null; programma(); });
  }
  // Il lettore del museo emette a ogni avanzamento: si aggiorna solo quando parte un'opera.
  let museoSuonava = false;
  window.addEventListener('wip-museum-player', (e: Event) => {
    const suona = !!(e as CustomEvent).detail?.playing;
    if (suona && !museoSuonava) programma();
    museoSuonava = suona;
  });
  // «Riprendi»: il secondo a cui è arrivato l'ascolto del POI, al massimo
  // ogni 10 s e subito alla pausa (è lì che si consegna lo snapshot).
  let ultimoSalvataggio = 0;
  let suonava = false;
  locationService.observeAudioState((s) => {
    try {
      if (s.poiId && s.duration > 0) {
        const ora = Date.now();
        if (s.isPlaying && ora - ultimoSalvataggio >= 10_000) {
          ultimoSalvataggio = ora;
          aggiornaPosizioneAscolto(s.poiId, s.currentTime, s.duration);
        } else if (!s.isPlaying && suonava) {
          ultimoSalvataggio = ora;
          aggiornaPosizioneAscolto(s.poiId, s.currentTime, s.duration);
          programma();
        }
      }
      suonava = !!s.isPlaying;
    } catch { /* il widget resta com'era */ }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') programma(); });
  // (23/09/2026, batteria, voce 21) A pagina nascosta (schermo spento, WebView
  // viva col servizio in primo piano) il giro periodico faceva 3-4 richieste
  // di rete ogni 10 min senza che nessuno guardasse: da nascosta si riconsegna
  // solo se l'ultimo invio ha più di 30 min. Eventi e spostamento come prima.
  setInterval(() => {
    if (document.visibilityState !== 'visible' && Date.now() - ultimoInvio < MS_NASCOSTA) return;
    void aggiornaWidget(true);
  }, MS_INTERVALLO);
  // Spostamento: i vicini si ricalcolano quando ci si è mossi abbastanza.
  setInterval(() => {
    const last = locationService.getLastLocation();
    if (!last || !ultimaPosVicini) return;
    if (metriTra(ultimaPosVicini, { lat: last.latitude, lon: last.longitude }) >= METRI_PER_RICALCOLO) programma();
  }, 60_000);
  setTimeout(() => void aggiornaWidget(true), 4000);
}

// ── Tocco su un widget ────────────────────────────────────────────────────
export type AzioneWidget =
  | { tipo: 'visita' } | { tipo: 'itinerario' } | { tipo: 'crediti' } | { tipo: 'vicini' }
  | { tipo: 'poi' | 'luogo' | 'ascolta'; id: string }
  | { tipo: 'riascolta' | 'riprendi' | 'lingua' | 'vision' | 'meteo' | 'garanzia' | 'eventi' | 'confronto' | 'archivio' }
  | { tipo: 'evento'; k: string } | { tipo: 'voto'; vince: string; perde: string }
  | { tipo: 'pdf'; k: string; condividi: boolean }
  | null;

const AZIONI_SEMPLICI = ['visita', 'itinerario', 'crediti', 'vicini', 'riascolta', 'riprendi', 'lingua', 'vision', 'meteo', 'garanzia', 'eventi', 'confronto', 'archivio'] as const;

/**
 * I widget aprono l'app con `itainta://widget/<azione>[/<id>]`. Qui si
 * RICONOSCE soltanto (23/09/2026: funzione pura, nessun evento): esegue
 * App.eseguiAzioneWidget, dopo il gate d'accesso e con il dedupe del doppio
 * arrivo iOS. Id dei POI con la regex dei POI; opere, PDF ed eventi con la
 * chiave corta di 8 cifre esadecimali, mai un id o un URL grezzo.
 */
export function azioneDaWidget(url: URL | string): AzioneWidget {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    if (u.protocol !== 'itainta:' || u.host !== 'widget') return null;
    const parti = u.pathname.split('/').filter(Boolean);
    const azione = parti[0] || '';
    if ((AZIONI_SEMPLICI as readonly string[]).includes(azione)) return { tipo: azione as typeof AZIONI_SEMPLICI[number] };
    if ((azione === 'poi' || azione === 'luogo' || azione === 'ascolta') && parti[1] && RE_ID_POI.test(parti[1])) {
      return { tipo: azione, id: parti[1] };
    }
    if (azione === 'evento' && RE_K.test(parti[1] || '')) return { tipo: 'evento', k: parti[1] };
    if (azione === 'voto' && RE_K.test(parti[1] || '') && RE_K.test(parti[2] || '') && parti[1] !== parti[2]) {
      return { tipo: 'voto', vince: parti[1], perde: parti[2] };
    }
    if (azione === 'pdf' && RE_K.test(parti[1] || '')) return { tipo: 'pdf', k: parti[1], condividi: parti[2] === 'condividi' };
    return null;
  } catch { return null; }
}
