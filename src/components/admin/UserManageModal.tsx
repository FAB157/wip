import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { notify } from '../../lib/toast';
import {
  X, Wallet, ShieldOff, ShieldCheck, Loader2, RefreshCw, ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';

/**
 * Gestione completa di un utente (ondata 2): movimenti crediti dal libro
 * mastro credit_transactions, rettifica manuale con causale OBBLIGATORIA
 * e sospensione/riattivazione (ban a livello auth). Ogni azione lascia un
 * audit in system_errors (sorgente user_admin, livello info).
 */
export default function UserManageModal({ user, onClose, onChanged }: { user: any; onClose: () => void; onChanged: () => void }) {
  const [transactions, setTransactions] = useState<any[] | null>(null);
  const [txError, setTxError] = useState('');
  const [authStatus, setAuthStatus] = useState<any | null>(null);

  // Rettifica crediti
  const [wallet, setWallet] = useState<'purchased' | 'earned'>('purchased');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [banning, setBanning] = useState(false);
  const [balances, setBalances] = useState<{ purchased: number; earned: number }>({
    purchased: Number(user.purchased_credits) || 0,
    earned: Number(user.earned_credits) || 0,
  });

  const adminHeaders = async (): Promise<Record<string, string>> => {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadTransactions = async () => {
    setTxError('');
    try {
      // RLS "select own or admin": l'admin legge il libro mastro direttamente
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setTransactions(data || []);
    } catch (e: any) {
      setTransactions([]);
      setTxError(e?.code === '42P01' || e?.code === 'PGRST205'
        ? 'Libro mastro assente: applicare la migration credit_transactions.'
        : `Movimenti non leggibili: ${e?.message || e}`);
    }
  };

  const loadAuthStatus = async () => {
    try {
      const res = await fetch(getApiUrl(`/api/admin/user/status?userId=${encodeURIComponent(user.id)}`), { headers: await adminHeaders() });
      if (res.ok) setAuthStatus(await res.json());
    } catch { /* la sezione sospensione resta in caricamento */ }
  };

  useEffect(() => { loadTransactions(); loadAuthStatus(); }, [user.id]);

  const doAdjust = async () => {
    const amt = Math.trunc(Number(amount));
    if (!amt) { notify('Inserisci un importo diverso da zero (negativo per togliere).'); return; }
    if (reason.trim().length < 5) { notify('Causale obbligatoria (minimo 5 caratteri).'); return; }
    setAdjusting(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/user/credit-adjust'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminHeaders()) },
        body: JSON.stringify({ userId: user.id, wallet, amount: amt, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setBalances(prev => ({ ...prev, [wallet]: data.balance }));
      setAmount('');
      setReason('');
      notify(`Rettifica applicata: ${data.applied >= 0 ? '+' : ''}${data.applied} crediti ${wallet === 'purchased' ? 'acquistati' : 'ottenuti'}.${data.ledgerLogged ? '' : ' (libro mastro assente: tracciata solo nell\'audit)'}`);
      loadTransactions();
      onChanged();
    } catch (e: any) {
      notify(`Rettifica fallita: ${e?.message || e}`);
    } finally {
      setAdjusting(false);
    }
  };

  const doBan = async (banned: boolean) => {
    let banReason = '';
    if (banned) {
      banReason = window.prompt('Causale della sospensione (obbligatoria, minimo 5 caratteri):') || '';
      if (banReason.trim().length < 5) { notify('Sospensione annullata: causale mancante.'); return; }
      if (!window.confirm(`Sospendere ${user.email || user.id}? Non potrà più accedere finché non viene riattivato.`)) return;
    }
    setBanning(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/user/ban'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminHeaders()) },
        body: JSON.stringify({ userId: user.id, banned, reason: banReason.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      notify(banned ? 'Utente sospeso.' : 'Utente riattivato.');
      loadAuthStatus();
    } catch (e: any) {
      notify(`Operazione fallita: ${e?.message || e}`);
    } finally {
      setBanning(false);
    }
  };

  const isBanned = !!authStatus?.banned;

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-primary text-base flex items-center gap-2">
              <Wallet className="w-5 h-5" /> Gestione utente
            </h3>
            <p className="text-xs font-bold text-gray-600 mt-0.5">{user.email || 'senza email'}</p>
            <p className="text-[10px] font-mono text-gray-500">{user.id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Saldo + stato account */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 border border-blue-200/60 rounded-2xl p-3 text-center">
            <div className="text-xl font-black text-blue-700 tabular-nums">{balances.purchased}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-blue-500">Acquistati</div>
          </div>
          <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-3 text-center">
            <div className="text-xl font-black text-amber-700 tabular-nums">{balances.earned}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-amber-500">Ottenuti</div>
          </div>
          <div className={`rounded-2xl p-3 text-center border ${isBanned ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200/60'}`}>
            <div className={`text-xl font-black ${isBanned ? 'text-red-600' : 'text-emerald-700'}`}>{authStatus ? (isBanned ? 'SOSPESO' : 'ATTIVO') : '…'}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">
              {authStatus?.last_sign_in_at ? `ultimo accesso ${new Date(authStatus.last_sign_in_at).toLocaleDateString('it-IT')}` : 'Stato account'}
            </div>
          </div>
        </div>

        {/* Rettifica crediti con causale */}
        <div className="bg-[#f8f5f0] rounded-2xl p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Rettifica crediti (causale obbligatoria)</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={wallet} onChange={e => setWallet(e.target.value as any)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold">
              <option value="purchased">Acquistati</option>
              <option value="earned">Ottenuti</option>
            </select>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="+50 / -20"
              className="w-28 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold tabular-nums" />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Causale (es. crediti non accreditati, ordine #123)"
              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs" />
            <button onClick={doAdjust} disabled={adjusting}
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-black disabled:opacity-50 shrink-0">
              {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Applica'}
            </button>
          </div>
          <p className="text-[10px] text-gray-500">Ogni rettifica lascia una riga nel libro mastro e nell'audit (Errori di Sistema → user_admin).</p>
        </div>

        {/* Sospensione */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl p-3">
          <div className="text-xs font-bold text-gray-700">
            {isBanned
              ? <>Account sospeso {authStatus?.banned_until ? `fino al ${new Date(authStatus.banned_until).toLocaleDateString('it-IT')}` : ''}</>
              : 'Account attivo: può accedere e usare i crediti.'}
          </div>
          <button
            onClick={() => doBan(!isBanned)}
            disabled={banning || !authStatus}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black disabled:opacity-50 ${
              isBanned ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
            }`}
          >
            {banning ? <Loader2 className="w-4 h-4 animate-spin" /> : isBanned ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            {isBanned ? 'Riattiva' : 'Sospendi'}
          </button>
        </div>

        {/* Movimenti crediti */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Movimenti crediti (ultimi 100)</p>
            <button onClick={loadTransactions} className="p-1.5 text-gray-400 hover:text-primary"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          {txError && <p className="text-[11px] font-bold text-amber-600">{txError}</p>}
          {transactions === null ? (
            <div className="py-6 text-center text-gray-500 text-xs font-bold">Caricamento…</div>
          ) : transactions.length === 0 ? (
            !txError && <div className="py-6 text-center text-gray-500 text-xs font-bold">Nessun movimento registrato.</div>
          ) : (
            <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-3 py-2 bg-white">
                  {Number(tx.amount) >= 0
                    ? <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    : <ArrowDownCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800 truncate">{tx.description || tx.type || 'movimento'}</p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(tx.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {tx.source ? ` · ${tx.source}` : ''}
                    </p>
                  </div>
                  <span className={`text-sm font-black tabular-nums ${Number(tx.amount) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
