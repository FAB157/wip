import React, { useState, useEffect, Suspense, lazy } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/quotaManager';
import {
  User, Search, Calendar, Check, Shield, Tag, Edit, Trash2, Flag,
  RefreshCw, Award, Key, CheckCircle2, AlertTriangle, Users, BarChart3, Edit3, Activity, Bell, Camera, MapPin, Wallet, Ticket,
  ClipboardList, SlidersHorizontal
} from 'lucide-react';
import { getApiUrl } from '../lib/api';
import AdminCounters from './AdminCounters';
import AdminEditor from './AdminEditor';
import AdminBeniCulturali from './AdminBeniCulturali';
import AdminDiagnostics from './AdminDiagnostics';
import AdminApiStats from './AdminApiStats';
import AdminAffiliateStats from './AdminAffiliateStats';
import AdminEnrichedPois from './AdminEnrichedPois';
import AdminSystemErrors from './AdminSystemErrors';
import AdminReports from './AdminReports';
import AdminVisionCommunity from './AdminVisionCommunity';
import AdminPoiMapEditor from './AdminPoiMapEditor';
import UserManageModal from './admin/UserManageModal';
import CouponForm from './admin/CouponForm';
import CouponList from './admin/CouponList';
import ChallengeForm from './admin/ChallengeForm';
import LevelForm from './admin/LevelForm';
import UserEditModal from './admin/UserEditModal';

// Le tre schermate nuove pesano parecchio (gestione utenti, coda contenuti,
// console operativa): caricate a richiesta, cosi' aprire il pannello resta
// veloce anche per chi usa solo le schede storiche.
const AdminUsersPro = lazy(() => import('./admin/AdminUsersPro'));
const AdminContentQueue = lazy(() => import('./admin/AdminContentQueue'));
const AdminOpsConsole = lazy(() => import('./admin/AdminOpsConsole'));

const CaricamentoScheda = () => (
  <div className="py-16 text-center text-sm font-bold text-on-surface-variant/70">Carico la scheda…</div>
);

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'users' | 'coupons' | 'counters' | 'editor' | 'poi_map' | 'beni_culturali' | 'gamification' | 'health' | 'api_stats' | 'affiliate_stats' | 'enriched_pois' | 'system_errors' | 'reports' | 'vision' | 'content_queue' | 'ops'>('users');
  // La scheda Utenti ora e' quella nuova (ricerca, consumo per utente, azioni
  // tracciate). La vista storica resta raggiungibile con un interruttore:
  // mostra cose che la nuova non ha (storico ascolti, righe dei pass).
  const [vistaUtentiClassica, setVistaUtentiClassica] = useState(false);
  // Utente aperto nella gestione completa (movimenti, rettifiche, sospensione)
  const [managedUser, setManagedUser] = useState<any | null>(null);
  const [pendingReports, setPendingReports] = useState<number>(0);
  const [pendingVisions, setPendingVisions] = useState<number>(0);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [gamificationChallenges, setGamificationChallenges] = useState<any[]>([]);
  const [gamificationLevels, setGamificationLevels] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);

  // Statistiche per utente (Day Pass, audioguide, servizi API) + riga espansa
  const [userStats, setUserStats] = useState<Record<string, any>>({});
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Modal / Editing states
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [editQuotaForm, setEditQuotaForm] = useState<any>({});

  // (Rimossa la "regola di massa sui limiti": la funzione esisteva ma nessun
  // form la richiamava — era codice morto che filtrava per giunta su una
  // colonna `plan_type` di dubbia esistenza. I limiti si cambiano per utente
  // dalla scheda Utenti, che passa dal server e lascia traccia.)

  // Record selezionati dalle tabelle, passati ai form gamification estratti
  const [editingChallenge, setEditingChallenge] = useState<any | null>(null);
  const [editingLevel, setEditingLevel] = useState<any | null>(null);

  useEffect(() => {
    fetchData();
    fetchPendingReports();
    fetchPendingVisions();

    const handleCircuitBreaker = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.open) {
        setCircuitBreakerOpen(true);
      }
    };
    window.addEventListener('enrichment-circuit-breaker', handleCircuitBreaker);
    // Il tab Segnalazioni notifica quando risolve/rigetta: il badge sul tab
    // si aggiorna subito invece di restare al conteggio del mount.
    const handleReportsUpdated = () => fetchPendingReports();
    window.addEventListener('wip-reports-updated', handleReportsUpdated);
    // Badge del tab WIP Community: si riallinea a ogni revisione conclusa.
    const handleVisionUpdated = () => fetchPendingVisions();
    window.addEventListener('wip-vision-review-updated', handleVisionUpdated);
    return () => {
      window.removeEventListener('enrichment-circuit-breaker', handleCircuitBreaker);
      window.removeEventListener('wip-reports-updated', handleReportsUpdated);
      window.removeEventListener('wip-vision-review-updated', handleVisionUpdated);
    };
  }, []);

  const fetchPendingReports = async () => {
    try {
      const { count } = await supabase
        .from('poi_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingReports(count || 0);
    } catch (e) {
      console.error('Error fetching pending reports count', e);
    }
  };

  // La RLS di vision_cards è select-own: il conteggio della coda passa dal
  // server (route admin), non da una count client.
  const fetchPendingVisions = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const res = await fetch(getApiUrl('/api/admin/vision/queue?status=pending'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (json?.counts) setPendingVisions(json.counts.pending || 0);
    } catch (e) {
      console.error('Error fetching pending visions count', e);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setMessage(null);
    let finalUsers: any[] = [];
    try {
      // 1. Fetch Users (ordinati per creazione, con limite esplicito: PostgREST
      // tronca comunque a 1000 — la ricerca per email è server-side, vedi searchUsers)
      const { data: usersData, error: usersErr } = await supabase
        .from('user_profiles').select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (usersErr) throw usersErr;

      finalUsers = [...(usersData || [])];
      // NIENTE seeding di utenti demo nel DB reale: una select vuota o fallita
      // non deve mai creare record fittizi in produzione.
      setUsers(finalUsers);

      // 1b. Statistiche per utente: Day Pass, luoghi ascoltati, servizi usati.
      // Richiedono le policy admin della migration 20260806140000_admin_user_stats:
      // senza, le query tornano vuote e le colonne restano a 0 (nessun errore).
      try {
        const ids = finalUsers.map(u => u.id).filter(Boolean);
        if (ids.length > 0) {
          const [passesRes, listenRes, apiRes, txRes] = await Promise.all([
            supabase.from('user_passes')
              .select('user_id, activated_at, expires_at, guides_used, guides_cap')
              .in('user_id', ids),
            supabase.from('user_listening_history')
              .select('user_id, poi_name, listened_at')
              .in('user_id', ids)
              .order('listened_at', { ascending: false }),
            supabase.from('api_usage_logs')
              .select('user_id, api_name, feature_context')
              .in('user_id', ids)
              .limit(5000),
            supabase.from('credit_transactions')
              .select('user_id, amount, type')
              .in('user_id', ids)
              .limit(10000),
          ]);
          const stats: Record<string, any> = {};
          const ensure = (id: string) => {
            if (!stats[id]) stats[id] = { passes: 0, passRows: [], guides: 0, lastListened: [], services: {}, totPurchased: 0, totConsumed: 0 };
            return stats[id];
          };
          // Cumulato VERO da credit_transactions (purchased_credits è solo un
          // saldo): popolato da webhook e RPC dalla data della migration in poi.
          (txRes.data || []).forEach((t: any) => {
            const s = ensure(t.user_id);
            if (t.type === 'purchase') s.totPurchased += Number(t.amount) || 0;
            if (t.type === 'consume') s.totConsumed += Math.abs(Number(t.amount) || 0);
          });
          (passesRes.data || []).forEach((p: any) => {
            const s = ensure(p.user_id);
            s.passes++;
            s.passRows.push(p);
          });
          (listenRes.data || []).forEach((l: any) => {
            const s = ensure(l.user_id);
            s.guides++;
            if (s.lastListened.length < 5) s.lastListened.push(l);
          });
          (apiRes.data || []).forEach((r: any) => {
            if (!r.user_id) return;
            const s = ensure(r.user_id);
            const key = String(r.feature_context || r.api_name || 'altro').split('|')[0].trim().slice(0, 40) || 'altro';
            s.services[key] = (s.services[key] || 0) + 1;
          });
          setUserStats(stats);
        }
      } catch (statsErr) {
        console.warn('Statistiche utenti non disponibili:', statsErr);
      }

      // 2. Fetch Coupons — stesso principio: nessun seeding di coupon demo
      // riscattabili da utenti veri (CAV2026/AMALFI30 erano coupon REALI).
      // Ordine e limite espliciti: senza `order` PostgREST restituisce le righe
      // in ordine arbitrario, e senza `limit` tronca in silenzio a 1000 —
      // i coupon piu' vecchi sparivano dalla lista senza che nessuno lo sapesse.
      const { data: couponsData, error: couponsErr } = await supabase.from('coupons')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (couponsErr) throw couponsErr;
      setCoupons([...(couponsData || [])]);

      // 5. Fetch Gamification Challenges and Levels
      try {
        const { data: challengesData, error: challengesErr } = await supabase.from('gamification_challenges').select('*').order('created_at', { ascending: true });
        if (!challengesErr && challengesData) {
          setGamificationChallenges(challengesData);
        }
        const { data: levelsData, error: levelsErr } = await supabase.from('gamification_levels').select('*').order('level', { ascending: true });
        if (!levelsErr && levelsData) {
          setGamificationLevels(levelsData);
        }
      } catch (err) {
        console.error("Error loading gamification data", err);
      }
      
    } catch (err: any) {
      console.error("Error loading admin data:", err);
      // Niente utenti mock: salvare un record fittizio sporcherebbe il DB.
      // Si mostra l'errore e si lascia la lista vuota.
      setUsers([]);
      setMessage({ type: 'error', text: 'Impossibile caricare i dati admin. Riprova più tardi.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
  };

  // Apre il modale quote (esisteva ma nessun bottone lo raggiungeva):
  // carica la riga user_quotas dell'utente, o parte da zero se non esiste.
  const openQuotaEditor = async (user: UserProfile) => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('user_quotas').select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      handleEditQuota({ user_id: user.id, ...(data || {}) });
    } catch {
      handleEditQuota({ user_id: user.id });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditQuota = (quota: any) => {
    setEditingQuotaId(quota.user_id);
    setEditQuotaForm({
      itinerari_used: quota.itinerari_used || 0,
      audioguide_used: quota.audioguide_used || 0,
      vision_used: quota.vision_used || 0,
      premium_guide_used: quota.premium_guide_used || 0,
      itinerari_limit: quota.itinerari_limit || 0,
      audioguide_limit: quota.audioguide_limit || 0,
      vision_limit: quota.vision_limit || 0,
      premium_guide_limit: quota.premium_guide_limit || 0
    });
  };

  const handleSaveSingleQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotaId) return;
    setIsLoading(true);
    try {
      // Usa sempre upsert (crea la riga se non esiste, aggiorna se esiste)
      const payload = {
        user_id: editingQuotaId,
        itinerari_used: parseInt(String(editQuotaForm.itinerari_used)) || 0,
        audioguide_used: parseInt(String(editQuotaForm.audioguide_used)) || 0,
        vision_used: parseInt(String(editQuotaForm.vision_used)) || 0,
        premium_guide_used: parseInt(String(editQuotaForm.premium_guide_used)) || 0,
        itinerari_limit: parseInt(String(editQuotaForm.itinerari_limit)) || 0,
        audioguide_limit: parseInt(String(editQuotaForm.audioguide_limit)) || 0,
        vision_limit: parseInt(String(editQuotaForm.vision_limit)) || 0,
        premium_guide_limit: parseInt(String(editQuotaForm.premium_guide_limit)) || 0
      };

      const { error: upsertErr } = await supabase
        .from('user_quotas')
        .upsert(payload, { onConflict: 'user_id' });

      if (upsertErr) {
        console.error('Errore upsert user_quotas:', upsertErr);
        throw new Error(`Impossibile salvare la quota: ${upsertErr.message} (code: ${upsertErr.code})`);
      }

      setEditingQuotaId(null);
      setMessage({ type: 'success', text: 'Limiti personalizzati dell\'utente aggiornati!' });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore nel salvataggio della quota: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserAdmin = async (user: UserProfile) => {
    setIsLoading(true);
    try {
      // Il ruolo admin si cambia SOLO dal server: la scrittura diretta dal
      // client dipendeva interamente dal trigger RLS, e in un ambiente dove
      // quella migration non fosse applicata chiunque potrebbe promuoversi.
      // La rotta verifica il chiamante, impedisce di declassare se stessi e
      // lascia una traccia in system_errors.
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const r = await fetch(getApiUrl('/api/admin/user/set-admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ user_id: user.id, is_admin: !user.is_admin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Errore ${r.status}`);
      setMessage({ type: 'success', text: `Ruolo admin per ${user.email} aggiornato con successo!` });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: "Errore durante l'aggiornamento del ruolo: " + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChallenge = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa sfida?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('gamification_challenges').delete().eq('id', id);
      if (error) throw error;
      setMessage({ type: 'success', text: `Sfida eliminata.` });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore eliminazione sfida: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLevel = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo livello?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('gamification_levels').delete().eq('id', id);
      if (error) throw error;
      setMessage({ type: 'success', text: `Livello eliminato.` });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore eliminazione livello: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Ricerca server-side (debounced): la lista in memoria è limitata a 500
  // profili, quindi il solo filtro client non troverebbe gli utenti oltre
  // il limite. Con 2+ caratteri interroghiamo il DB con ilike.
  const [serverSearchResults, setServerSearchResults] = useState<UserProfile[] | null>(null);
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) { setServerSearchResults(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('user_profiles').select('*')
        .ilike('email', `%${term}%`)
        .limit(50);
      if (!cancelled && !error && data) setServerSearchResults(data as UserProfile[]);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchTerm]);

  const filteredUsers = serverSearchResults ?? users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-3xl p-6 border border-outline-variant/10 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-xl font-black text-primary tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-secondary" />
            Amministrazione & Partner B2B
          </h3>
          <p className="text-xs text-on-surface-variant font-medium opacity-80 mt-1">
            Gestisci i coupon delle strutture ricettive partner e i privilegi degli utenti premium.
          </p>
        </div>
        <button 
          onClick={fetchData} 
          disabled={isLoading}
          className="p-2.5 bg-[#f8f5f0] hover:bg-gray-100 text-primary rounded-xl self-start transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {circuitBreakerOpen && (
        <div className="p-4 rounded-2xl flex items-center gap-3 text-sm font-bold bg-red-600 text-white border border-red-700 shadow-md">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <span>ATTENZIONE CRITICA: L'arricchimento AI è stato DISATTIVATO (Circuit Breaker) per troppi errori consecutivi di salvataggio DB. Previene costi AI continui senza persistenza.</span>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="overflow-x-auto no-scrollbar" data-swipe-ignore="true">
        <div className="flex flex-nowrap md:flex-wrap bg-[#f8f5f0] p-1 rounded-2xl gap-1 min-w-max md:min-w-full">
          {/* WIP COMMUNITY (Vision) CON BADGE */}
          <button
            onClick={() => { setActiveTab('vision'); fetchPendingVisions(); }}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative ${
              activeTab === 'vision' ? 'bg-white text-pink-600 shadow-sm' : 'text-primary/60 hover:text-pink-600'
            }`}
          >
            <Camera className="w-4 h-4" />
            WIP Community
            {pendingVisions > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-pink-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-md animate-pulse">
                {pendingVisions > 99 ? '99+' : pendingVisions}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'users' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Users className="w-4 h-4" />
            Utenti ({users.length})
          </button>
          {/* Coda contenuti: POI da rivedere, itinerari, errori, manutenzione.
              Porta in superficie rotte server che esistevano da mesi senza UI. */}
          <button
            onClick={() => setActiveTab('content_queue')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'content_queue' ? 'bg-white text-amber-600 shadow-sm' : 'text-primary/60 hover:text-amber-600'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Coda contenuti
          </button>
          {/* Console: listino crediti, cache, salute, budget AI. */}
          <button
            onClick={() => setActiveTab('ops')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'ops' ? 'bg-white text-emerald-700 shadow-sm' : 'text-primary/60 hover:text-emerald-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Console
          </button>
          <button
            onClick={() => setActiveTab('health')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'health' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Activity className="w-4 h-4" />
            Diagnostica
          </button>
          <button
            onClick={() => setActiveTab('coupons')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'coupons' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Tag className="w-4 h-4" />
            Coupon ({coupons.length})
          </button>
          <button
            onClick={() => setActiveTab('counters')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'counters' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Statistiche
          </button>
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'editor' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            Editor POI
          </button>
          <button
            onClick={() => setActiveTab('beni_culturali')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'beni_culturali' ? 'bg-white text-stone-700 shadow-sm' : 'text-primary/60 hover:text-stone-700'
            }`}
          >
            <span className="text-sm">🏺</span>
            Beni Culturali
          </button>
          <button
            onClick={() => setActiveTab('poi_map')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'poi_map' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Mappa POI
          </button>
          <button
            onClick={() => setActiveTab('gamification')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'gamification' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Award className="w-4 h-4" />
            Gamification
          </button>
          <button
            onClick={() => setActiveTab('api_stats')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'api_stats' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            API & Costi
          </button>
          <button
            onClick={() => setActiveTab('affiliate_stats')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'affiliate_stats' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Ticket className="w-4 h-4" />
            Affiliazioni
          </button>
          <button
            onClick={() => setActiveTab('enriched_pois')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'enriched_pois' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <Activity className="w-4 h-4" />
            Report POI
          </button>
          <button
            onClick={() => setActiveTab('system_errors')}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeTab === 'system_errors' ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Errori Sistema
          </button>
          {/* SEGNALAZIONI CON BADGE */}
          <button
            onClick={() => { setActiveTab('reports'); fetchPendingReports(); }}
            className={`flex-1 min-w-[120px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative ${
              activeTab === 'reports' ? 'bg-white text-orange-500 shadow-sm' : 'text-primary/60 hover:text-orange-500'
            }`}
          >
            <Flag className="w-4 h-4" />
            Segnalazioni
            {pendingReports > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-md animate-pulse">
                {pendingReports > 99 ? '99+' : pendingReports}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'api_stats' && <AdminApiStats />}
      {activeTab === 'affiliate_stats' && <AdminAffiliateStats />}
      {activeTab === 'enriched_pois' && <AdminEnrichedPois />}
      {activeTab === 'system_errors' && <AdminSystemErrors />}
      {activeTab === 'vision' && <AdminVisionCommunity />}
      {activeTab === 'poi_map' && <AdminPoiMapEditor />}
      {activeTab === 'beni_culturali' && <AdminBeniCulturali />}
      {activeTab === 'content_queue' && (
        <Suspense fallback={<CaricamentoScheda />}><AdminContentQueue /></Suspense>
      )}
      {activeTab === 'ops' && (
        <Suspense fallback={<CaricamentoScheda />}><AdminOpsConsole /></Suspense>
      )}
      {managedUser && <UserManageModal user={managedUser} onClose={() => setManagedUser(null)} onChanged={() => fetchData()} />}

      {/* Utenti: interruttore fra la scheda nuova e quella storica */}
      {activeTab === 'users' && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setVistaUtentiClassica(v => !v)}
            className="px-3 py-1.5 rounded-full text-[11px] font-black border border-outline-variant text-on-surface-variant hover:bg-primary/10 transition-colors"
          >
            {vistaUtentiClassica ? '← Torna alla scheda completa' : 'Vista classica (ascolti e pass) →'}
          </button>
        </div>
      )}
      {activeTab === 'users' && !vistaUtentiClassica && (
        <Suspense fallback={<CaricamentoScheda />}><AdminUsersPro /></Suspense>
      )}

      {activeTab === 'users' && vistaUtentiClassica && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-on-surface-variant/40" />
            <input 
              type="text" 
              placeholder="Cerca utente per email..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#f8f5f0] pl-10 pr-4 py-3 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-[#1e3a8a]/20"
            />
          </div>

          {/* Users List */}
          <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8f5f0] text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
                <tr>
                  <th className="p-4">Utente</th>
                  <th className="p-4 text-center">Crediti Acquistati</th>
                  <th className="p-4 text-center">Crediti Ottenuti</th>
                  <th className="p-4 text-center" title="POI distinti con audioguida ascoltata">Luoghi Ascoltati</th>
                  <th className="p-4 text-center">Day Pass</th>
                  <th className="p-4 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredUsers.map((user) => {
                  const isPremiumNow = user.is_forever_premium || (user.premium_until && new Date() <= new Date(user.premium_until));
                  const stats = userStats[user.id] || { passes: 0, passRows: [], guides: 0, lastListened: [], services: {} };
                  const isExpanded = expandedUserId === user.id;
                  return (
                    <React.Fragment key={user.id}>
                    <tr className="hover:bg-gray-50/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-black shrink-0"
                            title="Dettaglio servizi"
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-black uppercase">
                            {((user as any).display_name?.[0] || user.email?.[0] || 'U')}
                          </div>
                          <div>
                            <p className="font-bold text-primary flex items-center gap-1.5 flex-wrap">
                              {(user as any).display_name || user.email || 'Utente Esploratore'}
                              {user.is_admin && (
                                <span className="text-[8px] font-black uppercase tracking-wider bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">Admin</span>
                              )}
                              {isPremiumNow && (
                                <span className="text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Premium</span>
                              )}
                            </p>
                            {(user as any).display_name && (
                              <p className="text-[10px] text-on-surface-variant/70">{user.email}</p>
                            )}
                            <p className="text-[10px] text-on-surface-variant/50">{user.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-black tracking-widest bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full" title="Saldo residuo dei crediti acquistati (non il totale storico)">
                          {user.purchased_credits || 0}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-black tracking-widest bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full">
                          {user.earned_credits || 0}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-black tracking-widest bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full">
                          🎧 {stats.guides}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-black tracking-widest bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                          🎫 {stats.passes}
                        </span>
                      </td>
                      <td className="p-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleUserAdmin(user)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${
                            user.is_admin ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {user.is_admin ? 'Revoca Admin' : 'Rendi Admin'}
                        </button>
                        <button
                          onClick={() => openQuotaEditor(user)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-black transition-colors"
                          title="Modifica limiti e contatori di consumo"
                        >
                          Quote
                        </button>
                        <button
                          onClick={() => handleEditUser(user)}
                          className="px-3 py-1.5 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-xs font-black transition-colors"
                        >
                          Modifica
                        </button>
                        <button
                          onClick={() => setManagedUser(user)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black transition-colors flex items-center gap-1"
                          title="Movimenti crediti, rettifiche con causale, sospensione account"
                        >
                          <Wallet className="w-3.5 h-3.5" /> Gestione
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[#fafaf7]">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                              <p className="font-black uppercase tracking-wider text-[10px] text-on-surface-variant/60 mb-2">Crediti (storico)</p>
                              <div className="flex justify-between py-0.5">
                                <span className="font-bold text-gray-700">Tot. acquistati</span>
                                <span className="font-black text-blue-600">{stats.totPurchased}</span>
                              </div>
                              <div className="flex justify-between py-0.5">
                                <span className="font-bold text-gray-700">Tot. consumati</span>
                                <span className="font-black text-rose-600">{stats.totConsumed}</span>
                              </div>
                              <p className="text-[9px] text-gray-500 mt-2 leading-snug">Da credit_transactions: copre i movimenti dall'attivazione dello storico in poi.</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                              <p className="font-black uppercase tracking-wider text-[10px] text-on-surface-variant/60 mb-2">Servizi usati (log API)</p>
                              {Object.keys(stats.services).length === 0 ? (
                                <p className="text-gray-500">Nessun servizio registrato</p>
                              ) : (
                                Object.entries(stats.services)
                                  .sort((a: any, b: any) => b[1] - a[1])
                                  .slice(0, 10)
                                  .map(([svc, count]: any) => (
                                    <div key={svc} className="flex justify-between py-0.5">
                                      <span className="font-bold text-gray-700 truncate pr-2">{svc}</span>
                                      <span className="font-black text-primary">{count}</span>
                                    </div>
                                  ))
                              )}
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                              <p className="font-black uppercase tracking-wider text-[10px] text-on-surface-variant/60 mb-2">Day Pass ({stats.passes})</p>
                              {stats.passRows.length === 0 ? (
                                <p className="text-gray-500">Nessun pass acquistato</p>
                              ) : (
                                stats.passRows.map((p: any, i: number) => (
                                  <div key={i} className="flex justify-between py-0.5">
                                    <span className="font-bold text-gray-700">{new Date(p.activated_at).toLocaleDateString()}</span>
                                    <span className={`font-black ${new Date(p.expires_at) > new Date() ? 'text-emerald-600' : 'text-gray-500'}`}>
                                      {p.guides_used}/{p.guides_cap} guide{new Date(p.expires_at) > new Date() ? ' · attivo' : ''}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                              <p className="font-black uppercase tracking-wider text-[10px] text-on-surface-variant/60 mb-2">Ultimi ascolti ({stats.guides} luoghi)</p>
                              {stats.lastListened.length === 0 ? (
                                <p className="text-gray-500">Nessuna audioguida ascoltata</p>
                              ) : (
                                stats.lastListened.map((l: any, i: number) => (
                                  <div key={i} className="flex justify-between py-0.5 gap-2">
                                    <span className="font-bold text-gray-700 truncate">{l.poi_name || '—'}</span>
                                    <span className="text-gray-500 shrink-0">{l.listened_at ? new Date(l.listened_at).toLocaleDateString() : ''}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-xs font-medium text-gray-500">
                      {isLoading
                        ? 'Caricamento utenti...'
                        : searchTerm
                          ? `Nessun utente trovato per "${searchTerm}".`
                          : 'Nessun utente registrato.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {searchTerm && filteredUsers.length > 0 && (
            <p className="text-[11px] text-on-surface-variant/70 font-medium pl-1">
              {filteredUsers.length} {filteredUsers.length === 1 ? 'utente trovato' : 'utenti trovati'}
              {serverSearchResults ? ' (ricerca su tutto il database)' : ''}
            </p>
          )}
        </div>
      )}

      {activeTab === 'coupons' && (
        <div className="space-y-6">
          {/* Coupon Creation Form */}
          <CouponForm
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onMessage={setMessage}
            onCreated={fetchData}
          />

          {/* Coupon Summary Table */}
          <CouponList
            coupons={coupons}
            setIsLoading={setIsLoading}
            onMessage={setMessage}
            onChanged={fetchData}
          />
        </div>
      )}

      

      {activeTab === 'reports' && <AdminReports />}
      {activeTab === 'counters' && <AdminCounters />}

      {activeTab === 'editor' && <AdminEditor />}

      {/* MODAL EDITING MODIFICA UTENTE */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          setIsLoading={setIsLoading}
          onMessage={setMessage}
          onClose={() => setEditingUser(null)}
          onSaved={fetchData}
        />
      )}

      {/* MODAL EDITING SINGLE USER QUOTA OVERRIDE */}
      {editingQuotaId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-gray-100 shadow-2xl space-y-4">
            <div>
              <h4 className="font-black text-lg text-primary">Manutenzione Crediti Utente</h4>
              <p className="text-xs text-on-surface-variant font-medium opacity-80 mt-1">
                Modifica manualmente i contatori di consumo e i limiti massimi concessi all'utente.
              </p>
            </div>
            
            <form onSubmit={handleSaveSingleQuota} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Itinerari Usati</label>
                  <input
                    type="number"
                    value={editQuotaForm.itinerari_used}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, itinerari_used: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Itinerari Limite</label>
                  <input
                    type="number"
                    value={editQuotaForm.itinerari_limit}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, itinerari_limit: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Audioguide Usate</label>
                  <input
                    type="number"
                    value={editQuotaForm.audioguide_used}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, audioguide_used: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Audioguide Limite</label>
                  <input
                    type="number"
                    value={editQuotaForm.audioguide_limit}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, audioguide_limit: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Vision Usate</label>
                  <input
                    type="number"
                    value={editQuotaForm.vision_used}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, vision_used: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Vision Limite</label>
                  <input
                    type="number"
                    value={editQuotaForm.vision_limit}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, vision_limit: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Guide Premium Usate</label>
                  <input
                    type="number"
                    value={editQuotaForm.premium_guide_used}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, premium_guide_used: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Guide Premium Limite</label>
                  <input
                    type="number"
                    value={editQuotaForm.premium_guide_limit}
                    onChange={e => setEditQuotaForm({ ...editQuotaForm, premium_guide_limit: e.target.value })}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-bold focus:ring-[#1e3a8a]/20"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQuotaId(null)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200/70 text-gray-500 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 bg-primary hover:opacity-95 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-colors shadow-md flex items-center justify-center gap-1.5"
                >
                  {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Salva Modifiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {activeTab === 'gamification' && (
        <div className="space-y-6">
          <ChallengeForm
            editingChallenge={editingChallenge}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onMessage={setMessage}
            onSaved={fetchData}
          />

          <div className="space-y-3">
            <h4 className="font-black text-xs text-primary uppercase tracking-wider">Sfide Configurate</h4>
            <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 mb-8">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f8f5f0] text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
                  <tr>
                    <th className="p-4">Sfida</th>
                    <th className="p-4">Regola Sblocco</th>
                    <th className="p-4">Premio</th>
                    <th className="p-4 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {gamificationChallenges.map((challenge) => (
                    <tr key={challenge.id} className="hover:bg-gray-50/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="text-2xl">{challenge.icon}</div>
                          <div>
                            <span className="font-black text-primary">{challenge.name}</span>
                            <div className="text-[10px] text-on-surface-variant/60">{challenge.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold text-on-surface-variant">
                        {challenge.threshold} luoghi ({challenge.category_trigger})
                      </td>
                      <td className="p-4 text-xs font-bold">
                        {challenge.reward_credits > 0 ? (
                          <span className="text-emerald-600">+{challenge.reward_credits} Crediti</span>
                        ) : (
                          <span className="text-gray-500">Nessuno (Solo XP)</span>
                        )}
                      </td>
                      <td className="p-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingChallenge({ ...challenge })}
                          className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                          title="Modifica"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteChallenge(challenge.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                          title="Elimina"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {gamificationChallenges.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500 font-medium text-xs">
                        Nessuna sfida configurata. Creane una col form qui sopra.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Gamification Levels Form */}
            <LevelForm
              editingLevel={editingLevel}
              levels={gamificationLevels}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              onMessage={setMessage}
              onSaved={fetchData}
            />

            <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 mt-4">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f8f5f0] text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
                  <tr>
                    <th className="p-4">Livello</th>
                    <th className="p-4">Status / Titolo</th>
                    <th className="p-4">XP</th>
                    <th className="p-4">Premi (Vision/Audio/Itin)</th>
                    <th className="p-4 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {gamificationLevels.map((lvl) => (
                    <tr key={lvl.id} className="hover:bg-gray-50/50">
                      <td className="p-4 text-center">
                        <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-black">
                          {lvl.level}
                        </span>
                      </td>
                      <td className="p-4 font-black text-primary">{lvl.title}</td>
                      <td className="p-4 text-xs font-bold">{lvl.xp_required} XP</td>
                      <td className="p-4 text-xs font-bold">
                        <span className="text-emerald-600">+{lvl.reward_credits} Crediti</span>
                      </td>
                      <td className="p-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingLevel({ ...lvl })}
                          className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                          title="Modifica"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLevel(lvl.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                          title="Elimina"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {gamificationLevels.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 font-medium text-xs">
                        Nessun livello trovato. Aggiungine uno qui sopra.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
      {activeTab === 'health' && (
        <AdminDiagnostics />
      )}
    </div>
  );
}

