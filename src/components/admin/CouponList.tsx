import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Hotel, Trash2, Copy, Pencil, Check, X, Search, Download,
  ChevronLeft, ChevronRight, AlertTriangle, CalendarClock
} from 'lucide-react';
import { SCORCIATOIE_CREDITI, CREDITI_MIN, CREDITI_MAX, isErroreColonnaMancante, AVVISO_SCADENZA_ASSENTE } from './CouponForm';

interface Props {
  coupons: any[];
  setIsLoading: (loading: boolean) => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  /** Chiamata dopo ogni mutazione per far rifetchare i coupon al parent */
  onChanged: () => void;
}

/** Quanti coupon per pagina: oltre questa soglia la tabella diventa illeggibile. */
const PER_PAGINA = 50;

type Filtro = 'tutti' | 'attivi' | 'sospesi' | 'esauriti' | 'scaduti';
type Ordine = 'recenti' | 'utilizzi';

/** Scaduto = ha una data di scadenza ed è passata. Senza colonna sul DB è sempre false. */
const isScaduto = (c: any): boolean => {
  if (!c?.expires_at) return false;
  const t = new Date(c.expires_at).getTime();
  return Number.isFinite(t) && t < Date.now();
};

/** Esaurito = riscatti arrivati al tetto. max_uses a 0/null significa "nessun tetto". */
const isEsaurito = (c: any): boolean => {
  const max = Number(c?.max_uses || 0);
  return max > 0 && Number(c?.uses_count || 0) >= max;
};

/** Da ISO a YYYY-MM-DD per l'input date (che non digerisce altri formati). */
const isoAInputDate = (iso: any): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

export default function CouponList({ coupons, setIsLoading, onMessage, onChanged }: Props) {
  // --- Filtri, ordinamento e paginazione: il parent legge la tabella intera
  // senza limit né order, quindi la lista se la governa da sé qui. ---
  const [ricerca, setRicerca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [ordine, setOrdine] = useState<Ordine>('recenti');
  const [pagina, setPagina] = useState(0);

  // --- Modifica inline: id della riga aperta + bozza dei campi editabili. ---
  const [idInModifica, setIdInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState<{ reward_credits: string; max_uses: string; is_active: boolean; expires_at: string }>({
    reward_credits: '', max_uses: '', is_active: true, expires_at: ''
  });
  // Conferma eliminazione inline (niente confirm() nativo).
  const [idDaEliminare, setIdDaEliminare] = useState<string | null>(null);
  // Avviso onesto quando il DB non ha ancora la colonna expires_at.
  const [avvisoScadenza, setAvvisoScadenza] = useState(false);

  const listaFiltrata = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    const filtrati = (coupons || []).filter((c) => {
      if (q && !`${c.code || ''} ${c.structure_name || ''}`.toLowerCase().includes(q)) return false;
      switch (filtro) {
        case 'attivi': return !!c.is_active && !isEsaurito(c) && !isScaduto(c);
        case 'sospesi': return !c.is_active;
        case 'esauriti': return isEsaurito(c);
        case 'scaduti': return isScaduto(c);
        default: return true;
      }
    });
    return filtrati.sort((a, b) => {
      if (ordine === 'utilizzi') return Number(b.uses_count || 0) - Number(a.uses_count || 0);
      // "recenti": created_at potrebbe mancare su righe vecchie, si ripiega sul codice.
      const ta = new Date(a.created_at || 0).getTime() || 0;
      const tb = new Date(b.created_at || 0).getTime() || 0;
      if (tb !== ta) return tb - ta;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });
  }, [coupons, ricerca, filtro, ordine]);

  const totalePagine = Math.max(1, Math.ceil(listaFiltrata.length / PER_PAGINA));
  const paginaCorrente = Math.min(pagina, totalePagine - 1);
  const visibili = listaFiltrata.slice(paginaCorrente * PER_PAGINA, (paginaCorrente + 1) * PER_PAGINA);

  const apriModifica = (coupon: any) => {
    setIdDaEliminare(null);
    setIdInModifica(coupon.id);
    setBozza({
      reward_credits: String(coupon.reward_credits ?? 0),
      max_uses: String(coupon.max_uses ?? 0),
      is_active: !!coupon.is_active,
      expires_at: isoAInputDate(coupon.expires_at)
    });
  };

  const salvaModifica = async (coupon: any) => {
    const credits = parseInt(bozza.reward_credits, 10);
    const max = parseInt(bozza.max_uses, 10);
    if (!Number.isFinite(credits) || credits < CREDITI_MIN || credits > CREDITI_MAX) {
      onMessage({ type: 'error', text: `I crediti regalo devono essere un numero fra ${CREDITI_MIN} e ${CREDITI_MAX}.` });
      return;
    }
    if (!Number.isFinite(max) || max < 1) {
      onMessage({ type: 'error', text: 'I riscatti massimi devono essere almeno 1.' });
      return;
    }
    // Abbassare il tetto sotto i riscatti già fatti equivale a esaurire il coupon:
    // meglio dirlo prima che scoprirlo dal partner che si lamenta.
    const giaUsati = Number(coupon.uses_count || 0);

    setIsLoading(true);
    setAvvisoScadenza(false);
    try {
      const patch: Record<string, any> = { reward_credits: credits, max_uses: max, is_active: bozza.is_active };
      const scadenzaIso = bozza.expires_at ? new Date(`${bozza.expires_at}T23:59:59`).toISOString() : null;

      let { error } = await supabase.from('coupons').update({ ...patch, expires_at: scadenzaIso }).eq('id', coupon.id);
      if (error && isErroreColonnaMancante(error, 'expires_at')) {
        // Il DB non ha la colonna: gli altri campi devono comunque salvarsi.
        const secondoTentativo = await supabase.from('coupons').update(patch).eq('id', coupon.id);
        error = secondoTentativo.error;
        if (!error) setAvvisoScadenza(true);
      }
      if (error) throw error;

      onMessage({
        type: 'success',
        text: max <= giaUsati
          ? `Coupon ${coupon.code} aggiornato: attenzione, il tetto (${max}) è già raggiunto dai ${giaUsati} riscatti fatti.`
          : `Coupon ${coupon.code} aggiornato!`
      });
      setIdInModifica(null);
      onChanged();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore modifica coupon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const esportaCsv = () => {
    const header = 'Codice,Partner,Crediti Regalo,Riscatti,Tetto,Stato,Scadenza,Creato';
    const righe = listaFiltrata.map((c) => {
      const stato = !c.is_active ? 'sospeso' : isScaduto(c) ? 'scaduto' : isEsaurito(c) ? 'esaurito' : 'attivo';
      const scad = c.expires_at ? new Date(c.expires_at).toLocaleDateString('it-IT') : '';
      const creato = c.created_at ? new Date(c.created_at).toLocaleDateString('it-IT') : '';
      // Doppi apici raddoppiati: un nome struttura con le virgolette spaccherebbe il CSV.
      const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [c.code, c.structure_name, c.reward_credits ?? 0, c.uses_count ?? 0, c.max_uses ?? 0, stato, scad, creato].map(q).join(',');
    });
    const blob = new Blob([header + '\n' + righe.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coupon-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCouponStatus = async (coupon: any) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.from('coupons')
        .update({ is_active: !coupon.is_active })
        .eq('id', coupon.id);
      if (error) throw error;
      onMessage({ type: 'success', text: `Stato coupon ${coupon.code} aggiornato!` });
      onChanged();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore aggiornamento coupon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // La conferma è inline nella riga (vedi idDaEliminare): qui si elimina e basta.
  const deleteCoupon = async (id: string) => {
    setIdDaEliminare(null);
    setIsLoading(true);
    try {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
      onMessage({ type: 'success', text: `Coupon rimosso definitivamente.` });
      onChanged();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore eliminazione coupon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h4 className="font-black text-xs text-primary uppercase tracking-wider">
                Coupon nel Sistema
                <span className="ml-2 text-on-surface-variant/60 normal-case tracking-normal font-bold">
                  {listaFiltrata.length} su {coupons.length}
                </span>
              </h4>
              <button
                onClick={esportaCsv}
                disabled={listaFiltrata.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black hover:bg-emerald-100 transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>

            {avvisoScadenza && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-[11px] font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{AVVISO_SCADENZA_ASSENTE}</span>
              </div>
            )}

            {/* Barra filtri: ricerca per codice/partner, stato, ordinamento */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                <input
                  type="text"
                  value={ricerca}
                  onChange={e => { setRicerca(e.target.value); setPagina(0); }}
                  placeholder="Cerca per codice o struttura..."
                  className="w-full bg-[#f8f5f0] border-none rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(['tutti', 'attivi', 'sospesi', 'esauriti', 'scaduti'] as Filtro[]).map(f => (
                  <button
                    key={f}
                    onClick={() => { setFiltro(f); setPagina(0); }}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                      filtro === f ? 'bg-primary text-white' : 'bg-[#f8f5f0] text-on-surface-variant hover:bg-gray-100'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <select
                value={ordine}
                onChange={e => setOrdine(e.target.value as Ordine)}
                className="bg-[#f8f5f0] border-none rounded-xl py-2.5 px-3 text-[10px] font-black uppercase tracking-wider text-on-surface-variant"
              >
                <option value="recenti">Più recenti</option>
                <option value="utilizzi">Più utilizzati</option>
              </select>
            </div>

            <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f8f5f0] text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
                  <tr>
                    <th className="p-4">Codice / Partner</th>
                    <th className="p-4">Crediti Regalo</th>
                    <th className="p-4">Utilizzi Riscattati</th>
                    <th className="p-4">Scadenza</th>
                    <th className="p-4">Stato</th>
                    <th className="p-4 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {visibili.map((coupon) => (
                    <React.Fragment key={coupon.id}>
                    <tr className="hover:bg-gray-50/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-primary/5 text-primary flex items-center justify-center">
                            <Hotel className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-black text-primary bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md text-[11px] uppercase tracking-wider mr-2">{coupon.code}</span>
                            <span className="text-xs text-on-surface-variant opacity-80">{coupon.structure_name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold text-on-surface-variant">
                        {coupon.reward_credits || (coupon.duration_days * 10)} Crediti
                      </td>
                      <td className="p-4 text-xs font-medium">
                        <div className="w-full bg-gray-100 rounded-full h-2 max-w-[120px] mb-1.5 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${isEsaurito(coupon) ? 'bg-red-500' : 'bg-primary'}`}
                            style={{ width: `${Math.min(100, (Number(coupon.uses_count || 0) / Math.max(1, Number(coupon.max_uses || 0))) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-black ${isEsaurito(coupon) ? 'text-red-500' : 'text-primary'}`}>
                            {coupon.uses_count || 0}
                          </span>
                          <span className="text-on-surface-variant/60 font-bold">/</span>
                          <span className="text-on-surface-variant font-bold">{coupon.max_uses}</span>
                          {isEsaurito(coupon) && (
                            <span className="ml-1 text-[9px] font-black uppercase text-red-500 tracking-wider bg-red-50 px-1.5 py-0.5 rounded">Esaurito</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold">
                        {coupon.expires_at ? (
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className={`w-3.5 h-3.5 ${isScaduto(coupon) ? 'text-red-500' : 'text-on-surface-variant/50'}`} />
                            <span className={isScaduto(coupon) ? 'text-red-500' : 'text-on-surface-variant'}>
                              {new Date(coupon.expires_at).toLocaleDateString('it-IT')}
                            </span>
                            {isScaduto(coupon) && (
                              <span className="text-[9px] font-black uppercase text-red-500 tracking-wider bg-red-50 px-1.5 py-0.5 rounded">Scaduto</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant/40 font-medium">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleCouponStatus(coupon)}
                          className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                            coupon.is_active 
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {coupon.is_active ? 'Attivo' : 'Sospeso'}
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        {idDaEliminare === coupon.id ? (
                          /* Conferma inline: niente confirm() nativo, che su PWA/WebView
                             a volte non compare nemmeno. */
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] font-black uppercase text-red-600 tracking-wider">Eliminare {coupon.code}?</span>
                            <button
                              onClick={() => deleteCoupon(coupon.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black uppercase transition-colors"
                            >
                              Sì, elimina
                            </button>
                            <button
                              onClick={() => setIdDaEliminare(null)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-on-surface-variant rounded-lg text-[10px] font-black uppercase transition-colors"
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => (idInModifica === coupon.id ? setIdInModifica(null) : apriModifica(coupon))}
                            className={`p-1.5 rounded-lg transition-colors ${
                              idInModifica === coupon.id
                                ? 'bg-primary text-white'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                            }`}
                            title="Modifica crediti, tetto riscatti, stato e scadenza"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(coupon.code);
                                onMessage({ type: 'success', text: `Codice ${coupon.code} copiato negli appunti.` });
                              } catch {
                                onMessage({ type: 'error', text: 'Copia non riuscita: seleziona e copia il codice a mano.' });
                              }
                            }}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                            title="Copia il codice (da inviare alla struttura)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setIdInModifica(null); setIdDaEliminare(coupon.id); }}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                            title="Elimina coupon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        )}
                      </td>
                    </tr>

                    {/* Riga di modifica: si apre sotto il coupon così la tabella
                        non cambia larghezza e resta chiaro chi si sta modificando. */}
                    {idInModifica === coupon.id && (
                      <tr className="bg-[#f8f5f0]">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Crediti Regalo</label>
                              <input
                                type="number"
                                min={CREDITI_MIN}
                                max={CREDITI_MAX}
                                step={10}
                                value={bozza.reward_credits}
                                onChange={e => setBozza({ ...bozza, reward_credits: e.target.value })}
                                className="w-full bg-white border-none rounded-xl p-2.5 text-xs font-bold"
                              />
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {SCORCIATOIE_CREDITI.map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => setBozza({ ...bozza, reward_credits: String(v) })}
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors ${
                                      bozza.reward_credits === String(v) ? 'bg-primary text-white' : 'bg-white text-primary/70 hover:bg-primary/10'
                                    }`}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Riscatti Massimi</label>
                              <input
                                type="number"
                                min={1}
                                value={bozza.max_uses}
                                onChange={e => setBozza({ ...bozza, max_uses: e.target.value })}
                                className="w-full bg-white border-none rounded-xl p-2.5 text-xs font-bold"
                              />
                              <p className="text-[9px] text-primary/50 font-bold mt-1">Già riscattati: {coupon.uses_count || 0}</p>
                            </div>
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Scadenza</label>
                              <input
                                type="date"
                                value={bozza.expires_at}
                                onChange={e => setBozza({ ...bozza, expires_at: e.target.value })}
                                className="w-full bg-white border-none rounded-xl p-2.5 text-xs font-bold"
                              />
                              {bozza.expires_at && (
                                <button
                                  type="button"
                                  onClick={() => setBozza({ ...bozza, expires_at: '' })}
                                  className="text-[9px] font-black uppercase text-primary/60 hover:text-primary mt-1"
                                >
                                  Togli scadenza
                                </button>
                              )}
                            </div>
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Stato</label>
                              <button
                                type="button"
                                onClick={() => setBozza({ ...bozza, is_active: !bozza.is_active })}
                                className={`w-full rounded-xl p-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                                  bozza.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100'
                                }`}
                              >
                                {bozza.is_active ? 'Attivo' : 'Sospeso'}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-3">
                            <button
                              onClick={() => setIdInModifica(null)}
                              className="flex items-center gap-1.5 px-3 py-2 bg-white text-on-surface-variant rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-gray-100 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" /> Annulla
                            </button>
                            <button
                              onClick={() => salvaModifica(coupon)}
                              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:opacity-95 transition-all"
                            >
                              <Check className="w-3.5 h-3.5" /> Salva modifiche
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {visibili.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500 font-medium text-xs">
                        {coupons.length === 0
                          ? 'Nessun coupon nel sistema. Creane uno col form qui sopra.'
                          : 'Nessun coupon corrisponde a ricerca e filtri.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginazione client: il parent carica tutta la tabella in un colpo solo */}
            {totalePagine > 1 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
                  Pagina {paginaCorrente + 1} di {totalePagine}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagina(Math.max(0, paginaCorrente - 1))}
                    disabled={paginaCorrente === 0}
                    className="p-2 bg-[#f8f5f0] rounded-xl text-on-surface-variant hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPagina(Math.min(totalePagine - 1, paginaCorrente + 1))}
                    disabled={paginaCorrente >= totalePagine - 1}
                    className="p-2 bg-[#f8f5f0] rounded-xl text-on-surface-variant hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
  );
}
