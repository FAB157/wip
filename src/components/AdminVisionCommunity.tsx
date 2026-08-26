import { useEffect, useState, type ReactNode } from 'react';
import {
  Camera, Loader2, MapPin, CheckCircle2, XCircle, Paperclip, Wand2,
  RefreshCw, ChevronDown, ChevronUp, MessageSquare, Sparkles, Pencil, Trash2,
  Flag, ShieldAlert, Users, Car, Image as ImageIcon, BadgeCheck, Compass, Coins,
  CheckSquare, Square, ExternalLink, RotateCcw, EyeOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';

type QueueStatus = 'pending' | 'approved' | 'rejected';
/** Quarto tile: segnalazioni della community sui POI pubblicati. */
type AdminTab = QueueStatus | 'reports';
type QueueFilter = 'all' | 'recognized' | 'unrecognized' | 'comment';
type ReportsFilter = 'pending' | 'reviewed' | 'dismissed' | 'all';

/** Motivi di rifiuto (enum condiviso col server: vision_cards.reject_reason). */
const REJECT_REASONS: { key: string; label: string }[] = [
  { key: 'duplicate', label: 'Luogo già presente' },
  { key: 'not_a_place', label: 'Non è un luogo' },
  { key: 'photo_quality', label: 'Foto di bassa qualità' },
  { key: 'people', label: 'Persone riconoscibili' },
  { key: 'inappropriate', label: 'Contenuto non adatto' },
  { key: 'other', label: 'Altro' },
];
const rejectLabel = (key?: string | null) =>
  REJECT_REASONS.find(r => r.key === key)?.label || key || '';

/** Motivi delle segnalazioni utente (/api/community/report). */
const REPORT_REASON_LABEL: Record<string, string> = {
  offensive: 'Offensivo',
  inappropriate: 'Non adatto',
  spam: 'Spam',
  copyright: 'Copyright',
  other: 'Altro',
};

const COORDS_SOURCE_LABEL: Record<string, string> = {
  exif: 'GPS foto',
  user_pin: 'Pin utente',
  none: 'Senza posizione',
  device: 'GPS telefono',
};

const BULK_MAX = 50;
const BULK_SCORE_MIN = 80;

// La pre-moderazione automatica parte una sola volta per sessione (flag di
// modulo: sopravvive a smontaggio/rimontaggio della tab admin).
let autoPremoderated = false;

/** Badge piccolo della riga (stesso stile dei badge "Duplicato?"/"Non riconosciuta"). */
const Badge = ({ cls, title, children }: { cls: string; title?: string; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${cls}`} title={title}>{children}</span>
);

/**
 * Tab admin "WIP Community": coda di revisione delle schede Vision.
 * Le foto arrivano ANONIME (il server non espone mai user_id). Azioni:
 * pulizia foto con AI (volti/targhe), approva → nuovo POI community,
 * allega a un POI ufficiale (galleria), rifiuta (resta ricordo privato).
 * All'approvazione l'autore riceve +10 crediti (idempotente lato server).
 */
export default function AdminVisionCommunity() {
  const [status, setStatus] = useState<AdminTab>('pending');
  const [cards, setCards] = useState<any[]>([]);
  // Filtro della coda (solo tab "In revisione"): riconosciute / non / con racconto.
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  // Selezione per l'approvazione in blocco.
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  // Rifiuto con motivo: card con il popover aperto + motivo + nota.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectNote, setRejectNote] = useState<string>('');
  // Tab "Segnalate".
  const [reports, setReports] = useState<any[]>([]);
  const [reportsFilter, setReportsFilter] = useState<ReportsFilter>('pending');
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPendingCount, setReportsPendingCount] = useState(0);
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ pending: number; approved: number; rejected: number }>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [cleanPreview, setCleanPreview] = useState<Record<string, string>>({});
  const [attachMode, setAttachMode] = useState<string | null>(null);
  const [attachCandidates, setAttachCandidates] = useState<any[]>([]);
  // Pre-moderazione AI: punteggio 0-100 per card (plausibilità + completezza
  // + duplicati). La coda si riordina dal punteggio più alto: l'admin approva
  // a raffica dall'alto e ispeziona solo la coda bassa.
  const [aiScores, setAiScores] = useState<Record<string, any> | null>(null);
  const [premoderating, setPremoderating] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const doPreModerate = async () => {
    setPremoderating(true);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/pre-moderate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'errore');
      setAiScores(data?.scores || {});
      notify(`Coda ordinata: ${data?.scored || 0} card valutate ora, ${data?.fromCache || 0} dalla cache.`);
    } catch (e: any) {
      notify(`Pre-moderazione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setPremoderating(false);
    }
  };

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    let session = data?.session;
    // Su nativo (Android/iOS) il timer di auto-refresh di supabase-js si
    // ferma quando l'app va in background: al rientro la sessione è ancora
    // in storage ma l'access_token può essere scaduto. getSession() non lo
    // rinnova da sola, quindi lo forziamo qui se manca meno di 60s alla
    // scadenza — altrimenti ogni fetch admin fallisce con 403 in silenzio.
    const expiresAt = session?.expires_at;
    if (session && expiresAt && expiresAt * 1000 < Date.now() + 60000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed?.session || session;
    }
    return session?.access_token || null;
  };

  const fetchQueue = async (forStatus: AdminTab = status, forFilter: QueueFilter = queueFilter) => {
    if (forStatus === 'reports') return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ status: forStatus });
      // I filtri valgono solo sulla coda in revisione.
      if (forStatus === 'pending') {
        if (forFilter === 'recognized') params.set('recognized', 'true');
        else if (forFilter === 'unrecognized') params.set('recognized', 'false');
        else if (forFilter === 'comment') params.set('withComment', '1');
      }
      const res = await fetch(getApiUrl(`/api/admin/vision/queue?${params.toString()}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error === 'admin_required' ? 'sessione admin scaduta, rientra e riprova' : (data?.error || 'errore'));
      const list = Array.isArray(data?.cards) ? data.cards : [];
      setCards(list);
      setSelected({});
      if (data?.counts) setCounts(data.counts);
      // Pre-moderazione automatica: al primo caricamento della coda in
      // revisione, se ci sono almeno 5 card, una sola volta per sessione.
      if (forStatus === 'pending' && list.length >= 5 && !autoPremoderated) {
        autoPremoderated = true;
        doPreModerate();
      }
    } catch (e: any) {
      notify(`Caricamento coda Vision non riuscito: ${e?.message || 'riprova'}.`);
    } finally {
      setLoading(false);
    }
  };

  /** Conteggio segnalazioni aperte per il tile (GET reports?status=pending → items.length). */
  const fetchReportsCount = async () => {
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/community/reports?status=pending'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.items)) setReportsPendingCount(data.items.length);
    } catch {}
  };

  const fetchReports = async (forFilter: ReportsFilter = reportsFilter) => {
    setReportsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl(`/api/admin/community/reports?status=${forFilter}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error === 'admin_required' ? 'sessione admin scaduta, rientra e riprova' : (data?.error || 'errore'));
      const items = Array.isArray(data?.items) ? data.items : [];
      setReports(items);
      if (forFilter === 'pending') setReportsPendingCount(items.length);
    } catch (e: any) {
      notify(`Caricamento segnalazioni non riuscito: ${e?.message || 'riprova'}.`);
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'reports') fetchReports(reportsFilter);
    else fetchQueue(status, queueFilter);
  }, [status, queueFilter, reportsFilter]);

  // Il tile "Segnalate" mostra il conteggio anche quando si sta su un'altra tab.
  useEffect(() => { fetchReportsCount(); }, []);

  const notifyReviewed = () => {
    try { window.dispatchEvent(new CustomEvent('wip-vision-review-updated')); } catch {}
  };

  const doReview = async (
    card: any,
    action: 'approve' | 'reject' | 'attach',
    attachPoiId?: string,
    rejectOpts?: { reason: string; reasonText?: string },
  ) => {
    if (action === 'reject' && !rejectOpts?.reason) {
      notify('Scegli un motivo per il rifiuto.');
      return;
    }
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          cardId: card.id,
          action,
          edits: edits[card.id] || {},
          attachPoiId,
          ...(action === 'reject' ? { reason: rejectOpts!.reason, reasonText: (rejectOpts!.reasonText || '').trim() || undefined } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      const bonus = data?.first_discoverer ? ' (incluso bonus zona nuova)' : '';
      if (action === 'reject') notify(`Scheda rifiutata (${rejectLabel(rejectOpts!.reason)}): resta un ricordo privato dell'utente.`);
      else if (action === 'attach') notify(`Foto allegata al POI ufficiale${data?.rewarded ? ` · +${data.rewarded} crediti all'autore` : ''}.`);
      else if (data?.merged) notify(`Stesso posto già pubblicato: foto accorpata nella galleria di ${data?.published_poi_id || 'quel POI'}${data?.rewarded ? ` · +${data.rewarded} crediti all'autore` : ''}.`);
      else notify(`POI Community pubblicato${data?.rewarded ? ` · +${data.rewarded} crediti all'autore${bonus}` : ''}.`);
      setAttachMode(null);
      setExpandedId(null);
      setRejectingId(null);
      setRejectReason('');
      setRejectNote('');
      notifyReviewed();
      fetchQueue(status);
    } catch (e: any) {
      notify(`Revisione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  /** Salva le modifiche editoriali di una scheda pubblicata (e del suo POI community). */
  const doUpdate = async (card: any) => {
    const pending = edits[card.id];
    if (!pending || Object.keys(pending).length === 0) {
      notify('Nessuna modifica da salvare.');
      return;
    }
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id, edits: pending }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'errore');
      notify(data?.poi_updated ? 'Modifiche salvate su scheda e POI community.' : 'Modifiche salvate sulla scheda.');
      setExpandedId(null);
      fetchQueue(status);
    } catch (e: any) {
      notify(`Salvataggio non riuscito: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  /** Cancella il POI community nato da questa vision (la scheda torna privata). */
  const doDeletePoi = async (card: any) => {
    if (!window.confirm(`Cancellare il POI community "${card.name}"? La foto pubblica viene rimossa e la scheda torna un ricordo privato dell'utente.`)) return;
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/delete-poi'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      notify('POI community cancellato.');
      notifyReviewed();
      fetchQueue(status);
    } catch (e: any) {
      notify(`Cancellazione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  const doCleanPhoto = async (card: any) => {
    setBusyId(card.id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/clean-photo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      if (data?.preview) setCleanPreview(prev => ({ ...prev, [card.id]: data.preview }));
      notify('Foto ripulita dall\'AI: verrà pubblicata questa versione.');
    } catch (e: any) {
      notify(`Pulizia AI non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Compila i campi della scheda con Agnes (Groq, solo testo): il server usa
   * posizione GPS + reverse geocoding + POI vicini + racconto del viaggiatore
   * + eventuali note già digitate dall'admin nei campi. I risultati riempiono
   * il form di modifica: l'admin controlla e poi approva.
   */
  const doAiFill = async (card: any) => {
    setBusyId(card.id);
    try {
      const token = await getToken();
      const pending = edits[card.id] || {};
      const adminHint = [pending.description_short, pending.description_long]
        .filter(Boolean).join(' — ');
      // Il nome digitato dall'admin è AUTORITATIVO: viaggia in un campo suo,
      // il server lo impone all'AI come nome vero del luogo (caso "svizzerino"
      // → "Statua della Foca": tutte le descrizioni nascono dal nome giusto).
      const adminName = String(pending.name || '').trim();
      const res = await fetch(getApiUrl('/api/admin/vision/ai-fill'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardId: card.id, adminHint, adminName: adminName || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      const f = data?.fields || {};
      setEdits(prev => ({
        ...prev,
        [card.id]: {
          ...(prev[card.id] || {}),
          // Il nome scritto dall'admin non si tocca: l'AI lo rimpiazza solo
          // se il campo era vuoto.
          ...(f.name && !adminName ? { name: f.name } : {}),
          ...(f.city ? { city: f.city } : {}),
          ...(f.poi_type ? { poi_type: f.poi_type } : {}),
          ...(f.artist ? { artist: f.artist } : {}),
          ...(f.year ? { year: f.year } : {}),
          ...(f.style ? { style: f.style } : {}),
          ...(f.description_short ? { description_short: f.description_short } : {}),
          ...(f.description_long ? { description_long: f.description_long } : {}),
          ...(f.history ? { history: f.history } : {}),
          ...(f.audio_script ? { audio_script: f.audio_script } : {}),
        },
      }));
      setExpandedId(card.id);
      notify('Campi compilati dall\'AI: controlla, correggi e approva.');
    } catch (e: any) {
      notify(`Compilazione AI non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBusyId(null);
    }
  };

  // Candidati "Allega a POI": sia POI ufficiali che POI Community (altre
  // schede Vision già pubblicate) entro ~500m, letti da shared_pois (SELECT
  // pubblica). Il badge nella riga mostra quale dei due tipi è.
  const loadAttachCandidates = async (card: any) => {
    setAttachMode(card.id);
    setAttachCandidates([]);
    setRejectingId(null);
    if (card.lat == null || card.lon == null) return;
    try {
      const d = 0.005;
      const { data } = await supabase
        .from('shared_pois')
        .select('id, name, category, lat, lon, image_url')
        .gte('lat', card.lat - d).lte('lat', card.lat + d)
        .gte('lon', card.lon - d).lte('lon', card.lon + d)
        .neq('id', card.published_poi_id || '')
        .limit(30);
      const withDist = (data || []).map((p: any) => ({
        ...p,
        _dist: Math.round(Math.hypot((p.lat - card.lat) * 111320, (p.lon - card.lon) * 111320 * Math.cos(card.lat * Math.PI / 180)))
      })).sort((a: any, b: any) => a._dist - b._dist);
      setAttachCandidates(withDist);
    } catch {
      setAttachCandidates([]);
    }
  };

  /** Apre il popover di rifiuto per una card (motivo obbligatorio, nota facoltativa). */
  const openReject = (card: any) => {
    if (rejectingId === card.id) { setRejectingId(null); return; }
    setRejectingId(card.id);
    setRejectReason('');
    setRejectNote('');
    setAttachMode(null);
  };

  // ----- Approvazione in blocco -------------------------------------------
  const selectedIds = Object.keys(selected).filter(id => selected[id]);

  const toggleSelected = (cardId: string) =>
    setSelected(prev => ({ ...prev, [cardId]: !prev[cardId] }));

  /** Seleziona le card "sicure": punteggio AI ≥ 80, non segnalate dal filtro, non duplicate. */
  const selectHighScore = () => {
    if (!aiScores) { notify('Prima lancia la pre-moderazione AI.'); return; }
    const next: Record<string, boolean> = {};
    for (const c of cards) {
      const ai = aiScores[c.id];
      if (!ai || (ai.score ?? -1) < BULK_SCORE_MIN) continue;
      if (c.moderation_json?.flagged === true) continue;
      if (ai.duplicateOf) continue;
      next[c.id] = true;
    }
    const n = Object.keys(next).length;
    setSelected(next);
    notify(n === 0 ? `Nessuna card con punteggio ≥ ${BULK_SCORE_MIN} senza segnalazioni o duplicati.` : `${n} card selezionate (punteggio ≥ ${BULK_SCORE_MIN}).`);
  };

  const doBulkApprove = async () => {
    let ids = selectedIds;
    if (ids.length === 0) return;
    if (ids.length > BULK_MAX) {
      notify(`Massimo ${BULK_MAX} card per volta: approvo le prime ${BULK_MAX}.`);
      ids = ids.slice(0, BULK_MAX);
    }
    if (!window.confirm(`Approvare ${ids.length} schede e pubblicarle come POI Community?`)) return;
    setBulkBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/vision/bulk-approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cardIds: ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      const ok = results.filter(r => r?.ok);
      const ko = results.filter(r => !r?.ok);
      const merged = ok.filter(r => r?.merged).length;
      const credits = ok.reduce((s, r) => s + (Number(r?.rewarded) || 0), 0);
      let msg = `Approvate ${ok.length}/${results.length || ids.length}`;
      if (merged) msg += ` (${merged} accorpate)`;
      if (credits) msg += ` · +${credits} crediti agli autori`;
      if (ko.length) {
        const sample = ko.slice(0, 3).map(r => `${String(r?.cardId || '').slice(0, 8)}: ${r?.error || 'errore'}`).join('; ');
        msg += ` · ${ko.length} errori (${sample}${ko.length > 3 ? '…' : ''})`;
      }
      notify(`${msg}.`);
      setSelected({});
      notifyReviewed();
      fetchQueue(status);
    } catch (e: any) {
      notify(`Approvazione in blocco non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setBulkBusy(false);
    }
  };

  // ----- Segnalazioni community ------------------------------------------
  const doResolveReport = async (item: any, action: 'restore' | 'remove') => {
    if (action === 'remove' && !window.confirm(`Rimuovere il POI community "${item.poi_name || item.poi_id}"? Viene nascosto dalla mappa, la scheda Vision passa a rifiutata e la foto pubblica viene tolta.`)) return;
    setReportBusy(item.poi_id);
    try {
      const token = await getToken();
      const res = await fetch(getApiUrl('/api/admin/community/reports/resolve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ poiId: item.poi_id, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || 'errore');
      notify(action === 'restore' ? 'POI ripristinato: segnalazioni archiviate.' : 'POI rimosso dalla community.');
      notifyReviewed();
      fetchReports(reportsFilter);
      if (reportsFilter !== 'pending') fetchReportsCount();
    } catch (e: any) {
      notify(`Operazione non riuscita: ${e?.message || 'riprova'}`);
    } finally {
      setReportBusy(null);
    }
  };

  const setEdit = (cardId: string, field: string, value: string) =>
    setEdits(prev => ({ ...prev, [cardId]: { ...(prev[cardId] || {}), [field]: value } }));

  const editVal = (card: any, field: string) => edits[card.id]?.[field] ?? card[field] ?? '';

  const TILES: { key: AdminTab; label: string; cls: string; count: number }[] = [
    { key: 'pending', label: 'In revisione', cls: 'text-amber-600', count: counts.pending },
    { key: 'approved', label: 'Pubblicate', cls: 'text-emerald-600', count: counts.approved },
    { key: 'rejected', label: 'Rifiutate', cls: 'text-gray-500', count: counts.rejected },
    { key: 'reports', label: 'Segnalate', cls: 'text-red-600', count: reportsPendingCount },
  ];

  const QUEUE_FILTERS: { key: QueueFilter; label: string }[] = [
    { key: 'all', label: 'Tutte' },
    { key: 'recognized', label: 'Riconosciute' },
    { key: 'unrecognized', label: 'Non riconosciute' },
    { key: 'comment', label: 'Con racconto' },
  ];

  const REPORT_FILTERS: { key: ReportsFilter; label: string }[] = [
    { key: 'pending', label: 'Aperte' },
    { key: 'reviewed', label: 'Gestite' },
    { key: 'dismissed', label: 'Archiviate' },
    { key: 'all', label: 'Tutte' },
  ];

  // Ordine di default: per punteggio AI se c'è la pre-moderazione, altrimenti
  // per data (più recenti in alto).
  const orderedCards = (() => {
    if (status === 'pending' && aiScores) {
      return [...cards].sort((a, b) => ((aiScores[b.id]?.score ?? -1) - (aiScores[a.id]?.score ?? -1)));
    }
    return [...cards].sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-primary text-sm uppercase tracking-widest flex items-center gap-2">
          <Camera className="w-4 h-4" /> WIP Community · Revisione Vision
        </h3>
        <div className="flex items-center gap-2">
          {status === 'pending' && (
            <button
              onClick={doPreModerate}
              disabled={premoderating || loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50"
              title="Punteggio AI per ogni card (plausibilità, completezza, duplicati) e coda riordinata dal migliore"
            >
              {premoderating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Pre-modera AI
            </button>
          )}
          <button
            onClick={() => status === 'reports' ? fetchReports(reportsFilter) : fetchQueue(status, queueFilter)}
            className="p-2 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-95 transition-transform"
          >
            <RefreshCw className="w-4 h-4 text-primary" />
          </button>
        </div>
      </div>

      {/* Tile filtri con conteggi (pattern AdminReports) */}
      <div className="grid grid-cols-4 gap-2">
        {TILES.map(t => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`bg-white rounded-2xl p-3 border shadow-sm text-center transition-all ${status === t.key ? 'border-primary/40 ring-1 ring-primary/20' : 'border-gray-100 hover:border-gray-200'}`}
          >
            <div className={`text-2xl font-black ${t.cls}`}>{t.count}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Filtri coda + barra di approvazione in blocco (solo "In revisione") */}
      {status === 'pending' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUEUE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setQueueFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${queueFilter === f.key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {cards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2">
              <button
                onClick={selectHighScore}
                disabled={bulkBusy || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
                title={`Seleziona le card con punteggio AI ≥ ${BULK_SCORE_MIN}, non segnalate dal filtro e senza sospetto duplicato`}
              >
                <CheckSquare className="w-3.5 h-3.5" /> Seleziona ≥{BULK_SCORE_MIN}
              </button>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelected({})}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
                >
                  <Square className="w-3.5 h-3.5" /> Deseleziona
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={doBulkApprove}
                disabled={bulkBusy || selectedIds.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50"
              >
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approva selezionate ({Math.min(selectedIds.length, BULK_MAX)})
              </button>
            </div>
          )}
        </div>
      )}

      {status === 'reports' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setReportsFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${reportsFilter === f.key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {reportsLoading ? (
            <div className="py-16 flex flex-col items-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm font-bold">Caricamento segnalazioni…</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm font-bold">
              Nessuna segnalazione {reportsFilter === 'pending' ? 'aperta' : reportsFilter === 'reviewed' ? 'gestita' : reportsFilter === 'dismissed' ? 'archiviata' : ''}.
            </div>
          ) : (
            reports.map((item: any) => {
              const rb = reportBusy === item.poi_id;
              const openCount = (item.reports || []).filter((r: any) => r?.status === 'pending').length;
              return (
                <div key={item.poi_id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex gap-3 p-3">
                    <div
                      className={`w-24 h-24 rounded-2xl bg-gray-100 overflow-hidden shrink-0 ${item.photo_url ? 'cursor-pointer' : ''}`}
                      onClick={() => item.photo_url && setLightbox(item.photo_url)}
                    >
                      {item.photo_url ? (
                        <img src={item.photo_url} alt={item.poi_name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Camera className="w-7 h-7 text-gray-300" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-black text-gray-900 text-sm leading-tight line-clamp-2">{item.poi_name || item.card_name || item.poi_id}</h4>
                        <div className="shrink-0 flex items-center gap-1">
                          <Badge cls="bg-red-100 text-red-600" title="Utenti distinti che hanno segnalato">
                            <Flag className="w-2.5 h-2.5" /> {item.distinct_reporters ?? (item.reports || []).length} segnalant{(item.distinct_reporters ?? 1) === 1 ? 'e' : 'i'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.is_hidden ? (
                          <Badge cls="bg-gray-200 text-gray-700"><EyeOff className="w-2.5 h-2.5" /> Nascosto</Badge>
                        ) : (
                          <Badge cls="bg-emerald-100 text-emerald-700">Visibile</Badge>
                        )}
                        {item.poi_status && <Badge cls="bg-gray-100 text-gray-600" title="Stato del POI">{item.poi_status}</Badge>}
                        {openCount > 0 && <Badge cls="bg-amber-100 text-amber-700">{openCount} apert{openCount === 1 ? 'a' : 'e'}</Badge>}
                      </div>
                      <button
                        onClick={() => window.open('/?poi=' + encodeURIComponent(item.poi_id), '_blank')}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> {item.poi_id}
                      </button>
                      <div className="mt-1.5 bg-[#f8f5f0] rounded-xl p-2 space-y-1">
                        {(item.reports || []).map((r: any, i: number) => (
                          <div key={i} className="text-[10px] leading-snug">
                            <span className="font-black text-red-600">{REPORT_REASON_LABEL[r?.reason] || r?.reason || 'Motivo non indicato'}</span>
                            {r?.status && r.status !== 'pending' && (
                              <span className="ml-1 text-gray-400 font-bold">({r.status === 'reviewed' ? 'gestita' : r.status === 'dismissed' ? 'archiviata' : r.status})</span>
                            )}
                            {r?.created_at && (
                              <span className="ml-1 text-gray-400 font-medium">
                                · {new Date(r.created_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {r?.details && <p className="text-gray-600">{r.details}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="px-3 pb-3 flex flex-wrap gap-2">
                    <button disabled={rb} onClick={() => doResolveReport(item, 'restore')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50"
                      title="Il POI torna verificato e le segnalazioni vengono archiviate">
                      {rb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Ripristina
                    </button>
                    <button disabled={rb} onClick={() => doResolveReport(item, 'remove')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
                      title="Nasconde il POI, rifiuta la scheda e toglie la foto pubblica">
                      <Trash2 className="w-3.5 h-3.5" />
                      Rimuovi
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : loading ? (
        <div className="py-16 flex flex-col items-center text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm font-bold">Caricamento coda…</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm font-bold">
          Nessuna scheda {status === 'pending' ? (queueFilter === 'all' ? 'in attesa di revisione' : 'con questo filtro') : status === 'approved' ? 'pubblicata' : 'rifiutata'}.
        </div>
      ) : (
        <div className="space-y-3">
          {orderedCards.map(card => {
            const photo = cleanPreview[card.id] || card.clean_signed || card.photo_signed;
            // Lightbox: la versione ripulita se appena generata, altrimenti la hi-res.
            const lightboxSrc = cleanPreview[card.id] || card.hires_signed || photo;
            const isOpen = expandedId === card.id;
            const busy = busyId === card.id;
            const ai = status === 'pending' ? aiScores?.[card.id] : null;
            const mod = card.moderation_json || null;
            const hasFaces = mod?.privacy?.volti === true;
            const hasPlates = mod?.privacy?.targhe === true;
            const flagged = mod?.flagged === true;
            const conf = card.confidence == null ? null : Number(card.confidence);
            const isSelected = !!selected[card.id];
            const isRejecting = rejectingId === card.id;
            return (
              <div key={card.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${isSelected ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100'}`}>
                <div className="flex gap-3 p-3">
                  {status === 'pending' && (
                    <button
                      onClick={() => toggleSelected(card.id)}
                      className={`self-start p-1 -ml-1 ${isSelected ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-500'}`}
                      title={isSelected ? 'Togli dalla selezione' : 'Seleziona per l\'approvazione in blocco'}
                    >
                      {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                  )}
                  <div
                    className={`w-24 h-24 rounded-2xl bg-gray-100 overflow-hidden shrink-0 ${photo ? 'cursor-pointer' : ''}`}
                    onClick={() => photo && setLightbox(lightboxSrc)}
                    title={card.hires_signed ? 'Apri la foto in alta risoluzione' : undefined}
                  >
                    {photo ? (
                      <img src={photo} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Camera className="w-7 h-7 text-gray-300" /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-black text-gray-900 text-sm leading-tight line-clamp-2">{card.name}</h4>
                      <div className="shrink-0 flex items-center gap-1">
                        {ai && (
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${ai.score >= 70 ? 'bg-emerald-100 text-emerald-700' : ai.score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}
                            title={`Pre-moderazione: ${(ai.reasons || []).join(' · ')}`}
                          >
                            Pre-mod {ai.score}
                          </span>
                        )}
                        {ai?.duplicateOf && (
                          <span className="bg-red-100 text-red-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md" title={`Possibile duplicato di "${ai.duplicateOf.name}"`}>Duplicato?</span>
                        )}
                        {card.recognized === false && (
                          <span className="bg-orange-100 text-orange-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md">Non riconosciuta</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {card.city || 'Località sconosciuta'}
                      {card.lat != null && <span>· {Number(card.lat).toFixed(5)}, {Number(card.lon).toFixed(5)}</span>}
                    </p>
                    {card.created_at && (
                      <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                        {new Date(card.created_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {card.photo_taken_at && (
                          <span className="text-gray-400"> · scattata {new Date(card.photo_taken_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        )}
                      </p>
                    )}
                    {/* Badge v2: confidenza, lingua, filtro/privacy, origine foto, nome confermato, zona nuova, crediti */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {conf != null && !Number.isNaN(conf) && (
                        <Badge
                          cls={conf >= 70 ? 'bg-emerald-100 text-emerald-700' : conf >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}
                          title="Confidenza del riconoscimento AI"
                        >
                          AI {Math.round(conf)}%
                        </Badge>
                      )}
                      {card.language && (
                        <Badge cls="bg-gray-100 text-gray-600" title="Lingua dei testi della scheda">{String(card.language).toUpperCase()}</Badge>
                      )}
                      {flagged && (
                        <Badge cls="bg-red-500 text-white" title={`Filtro contenuti: ${(mod?.categories || []).join(', ') || 'segnalata'}`}>
                          <ShieldAlert className="w-2.5 h-2.5" /> Segnalata dal filtro
                        </Badge>
                      )}
                      {hasFaces && (
                        <Badge cls="bg-orange-100 text-orange-700" title="Volti riconoscibili: consigliata la pulizia AI prima di pubblicare">
                          <Users className="w-2.5 h-2.5" /> Persone
                        </Badge>
                      )}
                      {hasPlates && (
                        <Badge cls="bg-orange-100 text-orange-700" title="Targhe leggibili nella foto">
                          <Car className="w-2.5 h-2.5" /> Targhe
                        </Badge>
                      )}
                      {card.photo_source === 'gallery' && (
                        <Badge cls="bg-sky-100 text-sky-700" title="Foto caricata dalla galleria (coordinate del telefono ignorate)">
                          <ImageIcon className="w-2.5 h-2.5" /> Galleria · {COORDS_SOURCE_LABEL[card.coords_source] || 'Senza posizione'}
                        </Badge>
                      )}
                      {card.user_confirmed_name && (
                        <Badge cls="bg-violet-100 text-violet-700" title={`L'utente ha scelto "${card.user_confirmed_name}" tra i candidati`}>
                          <BadgeCheck className="w-2.5 h-2.5" /> Nome confermato dall'utente
                        </Badge>
                      )}
                      {card.first_discoverer === true && (
                        <Badge cls="bg-primary/10 text-primary" title="Nessun POI entro 500 m: bonus zona nuova all'autore">
                          <Compass className="w-2.5 h-2.5" /> Zona nuova
                        </Badge>
                      )}
                      {status === 'approved' && card.reward_credits != null && Number(card.reward_credits) > 0 && (
                        <Badge cls="bg-amber-100 text-amber-700" title="Crediti accreditati all'autore">
                          <Coins className="w-2.5 h-2.5" /> +{card.reward_credits} crediti
                        </Badge>
                      )}
                    </div>
                    {status === 'rejected' && (card.reject_reason || card.reject_note) && (
                      <div className="mt-1.5 bg-red-50 border border-red-100 rounded-xl p-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-red-600 flex items-center gap-1 mb-0.5">
                          <XCircle className="w-3 h-3" /> Motivo del rifiuto
                        </p>
                        <p className="text-[10px] font-bold text-red-700">{rejectLabel(card.reject_reason) || 'Non indicato'}</p>
                        {card.reject_note && <p className="text-[10px] text-gray-600 leading-snug">{card.reject_note}</p>}
                      </div>
                    )}
                    {(card.comment_tags?.length > 0 || card.user_comment) && (
                      <div className="mt-1.5 bg-[#f8f5f0] rounded-xl p-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-primary/60 flex items-center gap-1 mb-0.5">
                          <MessageSquare className="w-3 h-3" /> Racconto del viaggiatore
                        </p>
                        {card.comment_tags?.length > 0 && (
                          <p className="text-[10px] font-bold text-primary/80">{card.comment_tags.join(' · ')}</p>
                        )}
                        {card.user_comment && (
                          <p className="text-[10px] text-gray-600 leading-snug line-clamp-3">{card.user_comment}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setExpandedId(isOpen ? null : card.id)} className="self-start p-1.5 text-gray-400 hover:text-primary">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editVal(card, 'name')} onChange={e => setEdit(card.id, 'name', e.target.value)}
                        placeholder="Nome" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                      <input value={editVal(card, 'city')} onChange={e => setEdit(card.id, 'city', e.target.value)}
                        placeholder="Città" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input value={editVal(card, 'artist')} onChange={e => setEdit(card.id, 'artist', e.target.value)}
                        placeholder="Artista" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                      <input value={editVal(card, 'year')} onChange={e => setEdit(card.id, 'year', e.target.value)}
                        placeholder="Anno" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                      <input value={editVal(card, 'style')} onChange={e => setEdit(card.id, 'style', e.target.value)}
                        placeholder="Stile" className="bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                    </div>
                    <textarea value={editVal(card, 'description_short')} onChange={e => setEdit(card.id, 'description_short', e.target.value)}
                      rows={2} placeholder="Descrizione breve" className="w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
                    <textarea value={editVal(card, 'description_long')} onChange={e => setEdit(card.id, 'description_long', e.target.value)}
                      rows={3} placeholder="Descrizione dettagliata" className="w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
                    <textarea value={editVal(card, 'audio_script')} onChange={e => setEdit(card.id, 'audio_script', e.target.value)}
                      rows={3} placeholder="Testo audioguida (vuoto = composto da descrizione + racconto)" className="w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
                  </div>
                )}

                {status === 'pending' && (
                  <div className="px-3 pb-3 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => doCleanPhoto(card)}
                      title={hasFaces ? 'Volti riconoscibili nella foto: la pulizia AI è consigliata prima di pubblicare' : undefined}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50 ${hasFaces && !cleanPreview[card.id] ? 'bg-violet-600 text-white border border-violet-600 shadow-md ring-2 ring-violet-300' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      Pulisci foto AI{hasFaces && !cleanPreview[card.id] ? ' · consigliata' : ''}
                    </button>
                    <button disabled={busy} onClick={() => doAiFill(card)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Compila con AI
                    </button>
                    <button disabled={busy} onClick={() => doReview(card, 'approve')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approva → POI Community
                    </button>
                    <button disabled={busy} onClick={() => attachMode === card.id ? setAttachMode(null) : loadAttachCandidates(card)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                      <Paperclip className="w-3.5 h-3.5" />
                      Allega a POI esistente
                    </button>
                    <button disabled={busy} onClick={() => openReject(card)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50 ${isRejecting ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <XCircle className="w-3.5 h-3.5" />
                      Rifiuta
                    </button>
                  </div>
                )}

                {/* Popover inline di rifiuto: motivo obbligatorio + nota facoltativa */}
                {status === 'pending' && isRejecting && (
                  <div className="mx-3 mb-3 bg-[#f8f5f0] border border-gray-200 rounded-2xl p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Motivo del rifiuto (l'utente lo vedrà in My Vision)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {REJECT_REASONS.map(r => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => setRejectReason(r.key)}
                          className={`px-2.5 py-1.5 rounded-full text-[10px] font-black border transition-all ${rejectReason === r.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value.slice(0, 300))}
                      rows={2}
                      placeholder="Nota facoltativa per l'autore (max 300 caratteri)"
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none"
                    />
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { setRejectingId(null); setRejectReason(''); setRejectNote(''); }}
                        className="px-3 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        disabled={busy || !rejectReason}
                        onClick={() => doReview(card, 'reject', undefined, { reason: rejectReason, reasonText: rejectNote })}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        Conferma rifiuto
                      </button>
                    </div>
                  </div>
                )}

                {status === 'approved' && card.published_poi_id && (
                  <div className="px-3 pb-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => window.open('/?poi=' + encodeURIComponent(card.published_poi_id), '_blank')}
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:underline"
                      title="Apri il POI nell'app"
                    >
                      <Sparkles className="w-3 h-3" /> Pubblicata → {card.published_poi_id}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    <div className="flex flex-wrap gap-2">
                      {!isOpen && (
                        <button disabled={busy} onClick={() => setExpandedId(card.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#f8f5f0] text-primary border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                          <Pencil className="w-3.5 h-3.5" />
                          Modifica descrizioni
                        </button>
                      )}
                      {isOpen && (
                        <>
                          {/* Rigenera i testi sul nome corretto (es. riconoscimento
                              Vision sbagliato): compila il form, poi "Salva
                              modifiche" propaga anche al POI community. */}
                          <button disabled={busy} onClick={() => doAiFill(card)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Compila con AI
                          </button>
                          <button disabled={busy} onClick={() => doUpdate(card)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all disabled:opacity-50">
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Salva modifiche
                          </button>
                        </>
                      )}
                      {card.published_poi_id === `vision-${card.id}` && (
                        <button disabled={busy} onClick={() => doDeletePoi(card)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                          Elimina POI
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {attachMode === card.id && (
                  <div className="px-3 pb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">POI entro ~500 m, ufficiali o Community (la foto entra nella loro galleria)</p>
                    {attachCandidates.length === 0 ? (
                      <p className="text-[11px] text-gray-500 font-bold">Nessun POI nelle vicinanze.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {attachCandidates.map((p: any) => (
                          <button key={p.id} disabled={busy} onClick={() => doReview(card, 'attach', p.id)}
                            className="w-full flex items-center justify-between gap-2 bg-[#f8f5f0] hover:bg-sky-50 border border-gray-200 rounded-xl px-3 py-2 text-left active:scale-[0.99] transition-all disabled:opacity-50">
                            <span className="text-xs font-bold text-gray-800 truncate">{p.name}</span>
                            <span className="flex items-center gap-1 shrink-0">
                              {p.category === 'community' && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700">Community</span>
                              )}
                              <span className="text-[9px] font-black text-gray-500">{p._dist} m · {p.category === 'community' ? 'community' : p.category}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
          >
            <XCircle className="w-7 h-7" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
