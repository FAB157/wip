import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Users, Share2, RefreshCw, ArrowLeft, Sparkles, Check, Loader2,
  Palette, UtensilsCrossed, Trees, Mountain, ShoppingBag, Camera,
  Building2, Ticket, PartyPopper,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Language, getTranslation } from '../lib/i18n';

// ── Pianificazione di gruppo (ondata 7) ────────────────────────────────────
// L'organizzatore crea una stanza (PIN a 6 cifre, vive in api_cache lato
// server, TTL 7 giorni) e condivide il link; ogni amico vota le sue
// preferenze — anche senza account. WIP fonde i voti in modo deterministico
// (interessi più votati, budget mediano, ritmo più comune, richieste libere
// compilate) e pre-compila il form dell'organizzatore, che genera e paga con
// il flusso normale.

interface GroupMember {
  name: string;
  interests: string[];
  budget: 'economico' | 'standard' | 'lusso';
  ritmo: 'rilassato' | 'standard' | 'intenso';
  mustSee: string;
  noGo: string;
  votedAt: number;
}

interface GroupSession {
  pin: string;
  destination: string;
  days: number;
  mese: string;
  organizerName: string;
  expiresAt: number;
  members: GroupMember[];
}

export interface MergedGroupPrefs {
  destination: string;
  days: number;
  mese: string;
  interests: string[];
  budget: 'economico' | 'standard' | 'lusso';
  ritmo: 'rilassato' | 'standard' | 'intenso';
  specialRequests: string;
}

interface GroupPlanPanelProps {
  language: Language;
  defaultDestination: string;
  defaultDays: number;
  notify: (text: string, tone?: 'error' | 'info' | 'success') => void;
  onApplyGroup: (merged: MergedGroupPrefs) => void;
  onBack: () => void;
}

// `label` è una CHIAVE i18n (vr_a_int_*): si traduce al momento del render.
const INTEREST_OPTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'arte', label: 'vr_a_int_arte', icon: Palette },
  { id: 'gastronomia', label: 'vr_a_int_gastronomia', icon: UtensilsCrossed },
  { id: 'natura', label: 'vr_a_int_natura', icon: Trees },
  { id: 'avventura', label: 'vr_a_int_avventura', icon: Mountain },
  { id: 'shopping', label: 'vr_a_int_shopping', icon: ShoppingBag },
  { id: 'fotografia', label: 'vr_a_int_fotografia', icon: Camera },
];

// Etichette tradotte dei valori dati (budget/ritmo) mostrati nelle righe voti.
const BUDGET_KEY: Record<string, string> = { economico: 'vr_a_gp_budget_eco', standard: 'vr_a_gp_std', lusso: 'vr_a_gp_budget_lux' };
const RITMO_KEY: Record<string, string> = { rilassato: 'vr_a_gp_pace_relax', standard: 'vr_a_gp_std', intenso: 'vr_a_gp_pace_intense' };

const BUDGET_ORDER = ['economico', 'standard', 'lusso'] as const;

// Fusione deterministica dei voti: nessuna AI, il gruppo vede esattamente
// perché una preferenza ha vinto.
export function mergeGroupVotes(session: GroupSession): MergedGroupPrefs {
  const members = session.members || [];
  const count: Record<string, number> = {};
  members.forEach(m => (m.interests || []).forEach(i => { count[i] = (count[i] || 0) + 1; }));
  const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]);
  let interests = ranked.filter(([, c]) => c >= 2).map(([i]) => i);
  if (interests.length < 3) interests = ranked.slice(0, 3).map(([i]) => i);

  const bIdx = members.map(m => BUDGET_ORDER.indexOf(m.budget)).filter(i => i >= 0).sort((a, b) => a - b);
  const budget = bIdx.length ? BUDGET_ORDER[bIdx[Math.floor((bIdx.length - 1) / 2)]] : 'standard';

  const rCount: Record<string, number> = {};
  members.forEach(m => { rCount[m.ritmo] = (rCount[m.ritmo] || 0) + 1; });
  const ritmo = (Object.entries(rCount).sort((a, b) => b[1] - a[1])[0]?.[0] as MergedGroupPrefs['ritmo']) || 'standard';

  const mustSee = members.filter(m => m.mustSee).map(m => `${m.name}: ${m.mustSee}`);
  const noGo = members.filter(m => m.noGo).map(m => `${m.name}: ${m.noGo}`);
  let specialRequests = `Viaggio di GRUPPO: ${members.length} partecipanti hanno votato le preferenze.`;
  if (mustSee.length) specialRequests += ` Da includere assolutamente — ${mustSee.join('; ')}.`;
  if (noGo.length) specialRequests += ` Da evitare — ${noGo.join('; ')}.`;

  return {
    destination: session.destination,
    days: session.days,
    mese: session.mese || '',
    interests,
    budget,
    ritmo,
    specialRequests: specialRequests.slice(0, 900),
  };
}

// Identità stabile del votante (senza account): un uuid per dispositivo che
// il server usa per aggiornare il voto invece di duplicarlo. Non esce mai
// nelle viste della stanza.
function getMemberId(): string {
  try {
    let id = localStorage.getItem('wip_group_member_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('wip_group_member_id', id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function GroupPlanPanel({ language, defaultDestination, defaultDays, notify, onApplyGroup, onBack }: GroupPlanPanelProps) {
  const t = (k: string) => getTranslation(k, language);
  type View = 'home' | 'create' | 'room' | 'join' | 'vote' | 'voted';
  const [view, setView] = useState<View>('home');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<GroupSession | null>(null);

  // Form creazione (organizzatore)
  const [destination, setDestination] = useState(defaultDestination);
  const [days, setDays] = useState(defaultDays || 2);
  const [mese, setMese] = useState('');
  const [organizerName, setOrganizerName] = useState('');

  // Form voto (partecipante)
  const [pinInput, setPinInput] = useState('');
  const [voteName, setVoteName] = useState('');
  const [voteInterests, setVoteInterests] = useState<string[]>([]);
  const [voteBudget, setVoteBudget] = useState<'economico' | 'standard' | 'lusso'>('standard');
  const [voteRitmo, setVoteRitmo] = useState<'rilassato' | 'standard' | 'intenso'>('standard');
  const [voteMustSee, setVoteMustSee] = useState('');
  const [voteNoGo, setVoteNoGo] = useState('');

  const fetchSession = async (pin: string): Promise<GroupSession | null> => {
    try {
      const res = await fetch(getApiUrl(`/api/group-plan/${pin}`));
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 410) notify(t('vr_a_gp_expired'));
        else if (res.status === 404) notify(t('vr_a_gp_not_found'));
        else notify(data?.error || t('vr_a_gp_fetch_err'));
        return null;
      }
      return data as GroupSession;
    } catch {
      notify(t('vr_a_gp_net_err'));
      return null;
    }
  };

  // Deep link (?groupplan=PIN, salvato da App.tsx) o stanza creata in una
  // sessione precedente: si riparte da dove si era rimasti.
  useEffect(() => {
    (async () => {
      try {
        const joinPin = localStorage.getItem('wip_group_plan_join');
        if (joinPin && /^\d{6}$/.test(joinPin)) {
          localStorage.removeItem('wip_group_plan_join');
          setPinInput(joinPin);
          const s = await fetchSession(joinPin);
          if (s) { setSession(s); setView('vote'); }
          return;
        }
        const created = JSON.parse(localStorage.getItem('wip_group_plan_created') || 'null');
        if (created?.pin && Number(created.expiresAt) > Date.now()) {
          const s = await fetchSession(created.pin);
          if (s) { setSession(s); setView('room'); }
        }
      } catch { /* si parte dalla home */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La stanza dell'organizzatore si aggiorna da sola: i voti arrivano mentre
  // il pannello è aperto (poll leggero, il rate limiter server è a 100/min).
  useEffect(() => {
    if (view !== 'room' || !session?.pin) return;
    const t = setInterval(async () => {
      const s = await fetchSession(session.pin);
      if (s) setSession(s);
    }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, session?.pin]);

  const handleCreate = async () => {
    if (busy) return;
    if (!destination.trim()) { notify(t('vr_a_gp_need_dest')); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) { notify(t('vr_a_gp_need_login')); return; }
    setBusy(true);
    try {
      const res = await fetch(getApiUrl('/api/group-plan/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destination: destination.trim(), days, mese, organizerName: organizerName.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.pin) throw new Error(data?.error || t('vr_a_gp_create_fail'));
      try { localStorage.setItem('wip_group_plan_created', JSON.stringify({ pin: data.pin, expiresAt: data.expiresAt })); } catch { /* ok */ }
      const s = await fetchSession(data.pin);
      setSession(s || { pin: data.pin, destination: destination.trim(), days, mese, organizerName, expiresAt: data.expiresAt, members: [] });
      setView('room');
      notify(t('vr_a_gp_created'), 'success');
    } catch (e: any) {
      notify(e?.message || t('vr_a_gp_create_fail'));
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!session) return;
    const url = `https://wip.guide/?groupplan=${session.pin}`;
    const text = `${t('vr_a_gp_share_1')} ${session.destination} ${t('vr_a_gp_share_2')} ${session.pin}):`;
    try {
      if (navigator.share) await navigator.share({ title: t('vr_a_gp_share_title'), text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        notify(t('vr_a_gp_link_copied'), 'success');
      }
    } catch { /* condivisione annullata */ }
  };

  const handleJoin = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(pinInput)) { notify(t('vr_a_gp_pin6')); return; }
    setBusy(true);
    try {
      const s = await fetchSession(pinInput);
      if (s) { setSession(s); setView('vote'); }
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async () => {
    if (busy || !session) return;
    if (!voteName.trim()) { notify(t('vr_a_gp_need_name')); return; }
    if (voteInterests.length === 0) { notify(t('vr_a_gp_need_interest')); return; }
    setBusy(true);
    try {
      const body = JSON.stringify({
        pin: session.pin,
        memberId: getMemberId(),
        name: voteName.trim(),
        interests: voteInterests,
        budget: voteBudget,
        ritmo: voteRitmo,
        mustSee: voteMustSee.trim(),
        noGo: voteNoGo.trim(),
      });
      // Il server rileva un raro conflitto di scrittura quando due amici
      // votano nello stesso istante (409): un solo ritentativo con un breve
      // ritardo casuale risolve praticamente sempre senza che l'utente se ne
      // accorga, invece di mostrargli un errore per un problema temporaneo.
      let res = await fetch(getApiUrl('/api/group-plan/vote'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.status === 409) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
        res = await fetch(getApiUrl('/api/group-plan/vote'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || t('vr_a_gp_vote_fail'));
      const s = await fetchSession(session.pin);
      if (s) setSession(s);
      setView('voted');
      notify(t('vr_a_gp_vote_sent'), 'success');
    } catch (e: any) {
      notify(e?.message || t('vr_a_gp_vote_fail'));
    } finally {
      setBusy(false);
    }
  };

  const merged = useMemo(() => (session && session.members.length > 0 ? mergeGroupVotes(session) : null), [session]);

  const card = 'bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm p-5';
  const label = 'text-[11px] font-black text-primary uppercase tracking-widest pl-1';
  const input = 'w-full px-4 py-3 bg-gray-50 rounded-2xl border border-outline-variant/20 outline-none focus:border-primary font-medium text-on-surface text-sm';

  return (
    <motion.div
      key="group_plan"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-4 pt-4"
    >
      <button type="button" onClick={view === 'home' ? onBack : () => setView('home')} className="flex items-center gap-1.5 text-xs font-black text-primary/60 hover:text-primary px-1">
        <ArrowLeft className="w-4 h-4" /> {t('vr_a_gp_back')}
      </button>

      <div className="flex items-center gap-3 px-1">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-black text-primary leading-tight">{t('vr_a_gp_title')}</h2>
          <p className="text-[11px] font-bold text-gray-400">{t('vr_a_gp_subtitle')}</p>
        </div>
      </div>

      {view === 'home' && (
        <div className="space-y-3">
          <button type="button" onClick={() => setView('create')} className={`${card} w-full text-left hover:border-primary/30 transition-all active:scale-[0.98]`}>
            <div className="mb-1"><Building2 className="w-6 h-6 text-primary" /></div>
            <div className="text-sm font-black text-primary">{t('vr_a_gp_create_room')}</div>
            <div className="text-[11px] font-bold text-gray-400 mt-0.5">{t('vr_a_gp_create_room_desc')}</div>
          </button>
          <button type="button" onClick={() => setView('join')} className={`${card} w-full text-left hover:border-primary/30 transition-all active:scale-[0.98]`}>
            <div className="mb-1"><Ticket className="w-6 h-6 text-primary" /></div>
            <div className="text-sm font-black text-primary">{t('vr_a_gp_have_pin')}</div>
            <div className="text-[11px] font-bold text-gray-400 mt-0.5">{t('vr_a_gp_have_pin_desc')}</div>
          </button>
        </div>
      )}

      {view === 'create' && (
        <div className={`${card} space-y-4`}>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_dest_label')}</label>
            <input className={input} placeholder={t('vr_a_gp_dest_ph')} value={destination} onChange={e => setDestination(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className={label}>{t('vr_a_gp_days_label')}</label>
              <input className={input} type="number" min={1} max={30} value={days} onChange={e => setDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))} />
            </div>
            <div className="space-y-2">
              <label className={label}>{t('vr_a_gp_month_label')}</label>
              <input className={input} placeholder={t('vr_a_gp_month_ph')} value={mese} onChange={e => setMese(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_your_name')}</label>
            <input className={input} placeholder={t('vr_a_gp_name_ph')} value={organizerName} onChange={e => setOrganizerName(e.target.value)} />
          </div>
          <button type="button" onClick={handleCreate} disabled={busy} className="w-full py-3.5 bg-primary text-white font-black text-sm rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('vr_a_gp_create_btn')}
          </button>
          <p className="text-[10px] font-bold text-gray-400 text-center">{t('vr_a_gp_room_note')}</p>
        </div>
      )}

      {view === 'room' && session && (
        <div className="space-y-3">
          <div className={`${card} text-center`}>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('vr_a_gp_room_pin')} · {session.destination} · {session.days} {session.days === 1 ? t('vr_a_gp_day') : t('vr_a_gp_days_pl')}</p>
            <p className="text-4xl font-black text-primary tracking-[0.3em] mb-3">{session.pin}</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white font-black text-xs rounded-2xl active:scale-95 transition-all">
                <Share2 className="w-4 h-4" /> {t('vr_a_gp_invite')}
              </button>
              <button
                type="button"
                onClick={async () => { const s = await fetchSession(session.pin); if (s) { setSession(s); notify(t('vr_a_gp_refreshed'), 'info'); } }}
                aria-label={t('vr_a_gp_refresh')}
                className="min-w-[44px] flex items-center justify-center bg-primary/10 text-primary rounded-2xl active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className={card}>
            <p className="text-xs font-black text-primary mb-3">{t('vr_a_gp_votes_in')} {session.members.length}</p>
            {session.members.length === 0 ? (
              <p className="text-[11px] font-bold text-gray-400">{t('vr_a_gp_no_votes')}</p>
            ) : (
              <div className="space-y-2">
                {session.members.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-on-surface">{m.name} <span className="font-bold text-gray-400">· {BUDGET_KEY[m.budget] ? t(BUDGET_KEY[m.budget]) : m.budget} · {RITMO_KEY[m.ritmo] ? t(RITMO_KEY[m.ritmo]) : m.ritmo}</span></p>
                      <p className="text-[10px] font-bold text-gray-400 break-words">
                        {(m.interests || []).map(id => { const k = INTEREST_OPTIONS.find(o => o.id === id)?.label; return k ? t(k) : id; }).join(' · ')}
                        {m.mustSee ? ` · ${t('vr_a_gp_wants')} ${m.mustSee}` : ''}{m.noGo ? ` · ${t('vr_a_gp_avoids')} ${m.noGo}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {merged && (
            <div className={`${card} border-primary/20`}>
              <p className="text-xs font-black text-primary mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> {t('vr_a_gp_merge_title')}</p>
              <p className="text-[11px] font-bold text-gray-500 leading-relaxed mb-3">
                {t('vr_a_gp_top_interests')} <b>{merged.interests.map(id => { const k = INTEREST_OPTIONS.find(o => o.id === id)?.label; return k ? t(k) : id; }).join(', ') || '—'}</b> · {t('vr_a_gp_budget')} <b>{BUDGET_KEY[merged.budget] ? t(BUDGET_KEY[merged.budget]) : merged.budget}</b> · {t('vr_a_gp_pace')} <b>{RITMO_KEY[merged.ritmo] ? t(RITMO_KEY[merged.ritmo]) : merged.ritmo}</b>
              </p>
              <button type="button" onClick={() => onApplyGroup(merged)} className="w-full py-3.5 bg-primary text-white font-black text-sm rounded-2xl shadow-lg active:scale-95 transition-all">
                {t('vr_a_gp_apply')}
              </button>
              <p className="text-[10px] font-bold text-gray-400 text-center mt-2">{t('vr_a_gp_apply_note')}</p>
            </div>
          )}
        </div>
      )}

      {view === 'join' && (
        <div className={`${card} space-y-4`}>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_room_pin')}</label>
            <input
              className={`${input} text-center text-2xl tracking-[0.4em] font-black`}
              inputMode="numeric"
              maxLength={6}
              placeholder="······"
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <button type="button" onClick={handleJoin} disabled={busy} className="w-full py-3.5 bg-primary text-white font-black text-sm rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('vr_a_gp_enter')}
          </button>
        </div>
      )}

      {view === 'vote' && session && (
        <div className={`${card} space-y-4`}>
          <p className="text-xs font-black text-primary">
            {session.organizerName} {t('vr_a_gp_organizing')} <span className="text-secondary">{session.destination}</span> · {session.days} {session.days === 1 ? t('vr_a_gp_day') : t('vr_a_gp_days_pl')}{session.mese ? ` · ${session.mese}` : ''}
          </p>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_your_name')}</label>
            <input className={input} placeholder={t('vr_a_gp_name_ph2')} value={voteName} onChange={e => setVoteName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_interests_label')}</label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVoteInterests(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}
                  aria-pressed={voteInterests.includes(opt.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${voteInterests.includes(opt.id) ? 'bg-primary text-white shadow' : 'bg-gray-50 text-gray-500 border border-outline-variant/20'}`}
                >
                  <opt.icon className="w-3.5 h-3.5" /> {t(opt.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className={label}>{t('vr_a_gp_budget_label')}</label>
              <select className={input} value={voteBudget} onChange={e => setVoteBudget(e.target.value as any)}>
                <option value="economico">{t('vr_a_gp_budget_eco')}</option>
                <option value="standard">{t('vr_a_gp_std')}</option>
                <option value="lusso">{t('vr_a_gp_budget_lux')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className={label}>{t('vr_a_gp_pace_label')}</label>
              <select className={input} value={voteRitmo} onChange={e => setVoteRitmo(e.target.value as any)}>
                <option value="rilassato">{t('vr_a_gp_pace_relax')}</option>
                <option value="standard">{t('vr_a_gp_std')}</option>
                <option value="intenso">{t('vr_a_gp_pace_intense')}</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_mustsee_label')}</label>
            <input className={input} placeholder={t('vr_a_gp_mustsee_ph')} value={voteMustSee} onChange={e => setVoteMustSee(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className={label}>{t('vr_a_gp_nogo_label')}</label>
            <input className={input} placeholder={t('vr_a_gp_nogo_ph')} value={voteNoGo} onChange={e => setVoteNoGo(e.target.value)} />
          </div>
          <button type="button" onClick={handleVote} disabled={busy} className="w-full py-3.5 bg-primary text-white font-black text-sm rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('vr_a_gp_send_prefs')}
          </button>
        </div>
      )}

      {view === 'voted' && session && (
        <div className={`${card} text-center space-y-3`}>
          <div className="flex justify-center"><PartyPopper className="w-9 h-9 text-primary" /></div>
          <p className="text-sm font-black text-primary">{t('vr_a_gp_prefs_sent')}</p>
          <p className="text-[11px] font-bold text-gray-400">
            {t('vr_a_gp_voted_count')} {session.members.length}. {t('vr_a_gp_voted_when')} {session.organizerName} {t('vr_a_gp_voted_merge')}
          </p>
          <button type="button" onClick={() => setView('vote')} className="w-full py-3 bg-primary/10 text-primary font-black text-xs rounded-2xl active:scale-95 transition-all">
            {t('vr_a_gp_edit_vote')}
          </button>
        </div>
      )}
    </motion.div>
  );
}
