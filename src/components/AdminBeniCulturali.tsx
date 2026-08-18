import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import {
  Search, RefreshCw, MapPin, Sparkles, Image as ImageIcon, ArrowUpRight,
  Save, AlertTriangle, CheckCircle2, Landmark, ExternalLink
} from 'lucide-react';

/**
 * EDITOR DELL'ATLANTE DEI BENI CULTURALI.
 *
 * `beni_culturali` è l'atlante dei registri del patrimonio (MiC, FAI, registri
 * esteri): un layer informativo, senza scheda completa né audioguida. Questo
 * pannello serve a due cose:
 *   1. correggere i dati del bene (nome, tipologia, fascia, indirizzo, coordinate);
 *   2. PROMUOVERLO a POI turistico vero in shared_pois e arricchirlo con gli
 *      stessi strumenti dell'editor POI (testo AI, ricerca foto).
 *
 * La tabella è scrivibile solo con la service key, quindi ogni modifica passa
 * dalle rotte /api/admin/beni-culturali/*.
 */

interface Bene {
  id: string;
  source: string;
  source_id: string;
  country: string;
  name: string;
  typology: string | null;
  tier: 'A' | 'B' | 'C';
  category_wip: string | null;
  address: string | null;
  comune: string | null;
  region: string | null;
  lat: number | null;
  lon: number | null;
  geocode_source: string | null;
  matched_poi_id: string | null;
  promoted_poi_id: string | null;
  wikidata_id: string | null;
  description: string | null;
  attribution: string;
  poi_collegato_nome?: string | null;
}

interface OpzioneFoto { url: string; source: string; attribution?: string }

const CATEGORIE = ['monumenti', 'musei', 'chiese', 'natura', 'panorami', 'famiglie', 'gemme'];
const FASCE: Array<{ id: 'A' | 'B' | 'C'; testo: string }> = [
  { id: 'A', testo: 'A — turistico' },
  { id: 'B', testo: 'B — da confermare' },
  { id: 'C', testo: 'C — solo atlante' },
];

export default function AdminBeniCulturali() {
  const [beni, setBeni] = useState<Bene[]>([]);
  const [totale, setTotale] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMITE = 50;

  const [ricerca, setRicerca] = useState('');
  const [ricercaDebounce, setRicercaDebounce] = useState('');
  const [paese, setPaese] = useState('');
  const [fascia, setFascia] = useState('');
  const [fonte, setFonte] = useState('');
  const [promossi, setPromossi] = useState<'' | 'si' | 'no'>('');

  const [selezionato, setSelezionato] = useState<Bene | null>(null);
  const [bozza, setBozza] = useState<Partial<Bene>>({});
  const [caricamento, setCaricamento] = useState(false);
  const [operazione, setOperazione] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<{ tipo: 'ok' | 'errore' | 'info'; testo: string } | null>(null);
  const [opzioniFoto, setOpzioniFoto] = useState<OpzioneFoto[] | null>(null);
  const [testoPoi, setTestoPoi] = useState('');
  const [categoriaPromozione, setCategoriaPromozione] = useState('monumenti');

  useEffect(() => {
    const t = setTimeout(() => { setRicercaDebounce(ricerca); setOffset(0); }, 400);
    return () => clearTimeout(t);
  }, [ricerca]);

  const token = async () => {
    const { data } = await supabase.auth.getSession();
    const t = data?.session?.access_token;
    if (!t) throw new Error('Sessione scaduta: rifai il login.');
    return t;
  };

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const p = new URLSearchParams();
      if (ricercaDebounce) p.set('q', ricercaDebounce);
      if (paese) p.set('country', paese);
      if (fascia) p.set('tier', fascia);
      if (fonte) p.set('source', fonte);
      if (promossi) p.set('promoted', promossi);
      p.set('limit', String(LIMITE));
      p.set('offset', String(offset));
      const res = await fetch(getApiUrl(`/api/admin/beni-culturali?${p.toString()}`), {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Caricamento fallito');
      setBeni(j.beni || []);
      setTotale(j.totale || 0);
    } catch (e: any) {
      setMessaggio({ tipo: 'errore', testo: e.message });
    } finally {
      setCaricamento(false);
    }
  }, [ricercaDebounce, paese, fascia, fonte, promossi, offset]);

  useEffect(() => { carica(); }, [carica]);

  const seleziona = (b: Bene) => {
    setSelezionato(b);
    setBozza({ ...b });
    setOpzioniFoto(null);
    setTestoPoi('');
    setMessaggio(null);
    setCategoriaPromozione(b.category_wip || 'monumenti');
  };

  const poiCollegato = (b: Bene | null) => (b?.promoted_poi_id || b?.matched_poi_id) || null;

  const salva = async () => {
    if (!selezionato) return;
    setOperazione('salva');
    setMessaggio(null);
    try {
      const changes: any = {};
      for (const k of ['name', 'typology', 'tier', 'category_wip', 'address', 'comune', 'region', 'lat', 'lon', 'description'] as const) {
        if ((bozza as any)[k] !== (selezionato as any)[k]) changes[k] = (bozza as any)[k];
      }
      if (!Object.keys(changes).length) { setMessaggio({ tipo: 'info', testo: 'Nessuna modifica da salvare.' }); return; }
      const res = await fetch(getApiUrl('/api/admin/beni-culturali/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id: selezionato.id, changes }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Salvataggio fallito');
      setSelezionato(j.bene);
      setBozza({ ...j.bene });
      setBeni(prev => prev.map(b => (b.id === j.bene.id ? { ...b, ...j.bene } : b)));
      setMessaggio({ tipo: 'ok', testo: 'Bene aggiornato.' });
    } catch (e: any) {
      setMessaggio({ tipo: 'errore', testo: e.message });
    } finally { setOperazione(null); }
  };

  /** Il bene diventa un POI turistico: da lì in poi ha scheda e audioguida. */
  const promuovi = async () => {
    if (!selezionato) return;
    if (selezionato.lat == null || selezionato.lon == null) {
      setMessaggio({ tipo: 'errore', testo: 'Senza coordinate non può diventare un POI: geocodificalo prima.' });
      return;
    }
    setOperazione('promuovi');
    setMessaggio(null);
    try {
      const res = await fetch(getApiUrl('/api/admin/beni-culturali/promote'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id: selezionato.id, category: categoriaPromozione }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Promozione fallita');
      const aggiornato = { ...selezionato, promoted_poi_id: j.poiId, poi_collegato_nome: selezionato.name };
      setSelezionato(aggiornato);
      setBozza({ ...aggiornato });
      setBeni(prev => prev.map(b => (b.id === aggiornato.id ? aggiornato : b)));
      setMessaggio({ tipo: 'ok', testo: `Promosso a POI ${j.poiId}. Ora puoi arricchirlo con testo e foto.` });
    } catch (e: any) {
      setMessaggio({ tipo: 'errore', testo: e.message });
    } finally { setOperazione(null); }
  };

  /** Stessi strumenti dell'editor POI: /api/poi/regenerate-content. */
  const arricchisci = async (tipo: 'text' | 'image') => {
    const poiId = poiCollegato(selezionato);
    if (!poiId || !selezionato) return;
    setOperazione(tipo);
    setMessaggio(null);
    try {
      const payload: any = { poiId, type: tipo };
      if (tipo === 'image') {
        payload.name = selezionato.name;
        payload.lat = selezionato.lat;
        payload.lon = selezionato.lon;
      }
      const res = await fetch(getApiUrl('/api/poi/regenerate-content'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Arricchimento fallito');
      if (tipo === 'text' && j.description) {
        setTestoPoi(j.description);
        setMessaggio({ tipo: 'ok', testo: 'Testo generato: rileggilo e salvalo sul POI.' });
      } else if (tipo === 'image') {
        const opz: OpzioneFoto[] = (j.image_options || []).map((o: any) => (typeof o === 'string' ? { url: o, source: 'web' } : o));
        setOpzioniFoto(opz);
        setMessaggio({ tipo: opz.length ? 'ok' : 'info', testo: opz.length ? `${opz.length} foto trovate.` : 'Nessuna foto trovata.' });
      }
    } catch (e: any) {
      setMessaggio({ tipo: 'errore', testo: e.message });
    } finally { setOperazione(null); }
  };

  /** Scrittura diretta sul POI: l'admin ha la policy UPDATE su shared_pois. */
  const scriviSulPoi = async (campi: Record<string, any>, esito: string) => {
    const poiId = poiCollegato(selezionato);
    if (!poiId) return;
    setOperazione('salvaPoi');
    try {
      const { error } = await supabase.from('shared_pois').update(campi).eq('id', poiId);
      if (error) throw error;
      setMessaggio({ tipo: 'ok', testo: esito });
    } catch (e: any) {
      setMessaggio({ tipo: 'errore', testo: e.message });
    } finally { setOperazione(null); }
  };

  const campo = (etichetta: string, chiave: keyof Bene, tipo: 'text' | 'number' = 'text') => (
    <label className="block">
      <span className="text-[11px] font-semibold text-primary/60 uppercase tracking-wide">{etichetta}</span>
      <input
        type={tipo}
        step={tipo === 'number' ? 'any' : undefined}
        value={(bozza as any)[chiave] ?? ''}
        onChange={e => setBozza(p => ({ ...p, [chiave]: tipo === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value }))}
        className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5 text-stone-600" />
        <h2 className="text-lg font-bold text-primary">Atlante Beni Culturali</h2>
        {/* ~1,8 M di righe: il conteggio è la stima del planner, contarle
            davvero manderebbe la query in timeout. */}
        <span className="text-xs text-primary/50">~{totale.toLocaleString('it-IT')} beni</span>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={ricerca}
            onChange={e => setRicerca(e.target.value)}
            placeholder="Cerca per nome o comune…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm"
          />
        </div>
        <select value={fonte} onChange={e => { setFonte(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
          <option value="">Tutte le fonti</option>
          <option value="fai_beni">FAI</option>
          <option value="mic_catalogo">Catalogo MiC</option>
          <option value="de_by_denkmalliste">Baviera</option>
        </select>
        <select value={fascia} onChange={e => { setFascia(e.target.value); setOffset(0); }} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
          <option value="">Tutte le fasce</option>
          {FASCE.map(f => <option key={f.id} value={f.id}>{f.testo}</option>)}
        </select>
        <select value={promossi} onChange={e => { setPromossi(e.target.value as any); setOffset(0); }} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
          <option value="">Promossi e non</option>
          <option value="no">Solo NON promossi</option>
          <option value="si">Solo già POI</option>
        </select>
        <input value={paese} onChange={e => { setPaese(e.target.value.toUpperCase()); setOffset(0); }} placeholder="IT" maxLength={2}
          className="w-16 px-3 py-2 rounded-xl border border-gray-200 text-sm uppercase" />
        <button onClick={carica} className="px-3 py-2 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold flex items-center gap-1">
          <RefreshCw className={`w-4 h-4 ${caricamento ? 'animate-spin' : ''}`} /> Aggiorna
        </button>
      </div>

      {messaggio && (
        <div className={`px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${
          messaggio.tipo === 'ok' ? 'bg-green-50 text-green-700'
            : messaggio.tipo === 'errore' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          {messaggio.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {messaggio.testo}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Elenco */}
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
            {beni.map(b => {
              const collegato = poiCollegato(b);
              return (
                <button key={b.id} onClick={() => seleziona(b)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-stone-50 transition ${selezionato?.id === b.id ? 'bg-stone-100' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary truncate">{b.name}</p>
                      <p className="text-[11px] text-primary/50 truncate">
                        {[b.comune, b.typology].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        b.tier === 'A' ? 'bg-amber-100 text-amber-700' : b.tier === 'B' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>
                        {b.tier}
                      </span>
                      {collegato
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">POI</span>
                        : b.lat == null
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 font-bold">no GPS</span>
                          : null}
                    </div>
                  </div>
                </button>
              );
            })}
            {!beni.length && !caricamento && <p className="p-4 text-sm text-primary/50">Nessun bene con questi filtri.</p>}
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-xs text-primary/60">
            <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMITE))} className="disabled:opacity-30">← Precedenti</button>
            <span>{offset + 1}–{offset + beni.length} di ~{totale.toLocaleString('it-IT')}</span>
            {/* Il totale è stimato: si va avanti finché la pagina è piena. */}
            <button disabled={beni.length < LIMITE} onClick={() => setOffset(o => o + LIMITE)} className="disabled:opacity-30">Successivi →</button>
          </div>
        </div>

        {/* Scheda */}
        <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
          {!selezionato && <p className="text-sm text-primary/50">Scegli un bene dall'elenco per modificarlo o promuoverlo a POI.</p>}

          {selezionato && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-primary/40 uppercase tracking-wide">{selezionato.source} · {selezionato.source_id}</p>
                  <h3 className="font-bold text-primary truncate">{selezionato.name}</h3>
                </div>
                {selezionato.lat != null && (
                  <a href={`https://www.google.com/maps?q=${selezionato.lat},${selezionato.lon}`} target="_blank" rel="noreferrer"
                    className="text-xs text-stone-600 flex items-center gap-1 shrink-0">
                    <MapPin className="w-3.5 h-3.5" /> mappa
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {campo('Nome', 'name')}
                {campo('Tipologia', 'typology')}
                {campo('Comune', 'comune')}
                {campo('Regione', 'region')}
                {campo('Indirizzo', 'address')}
                <label className="block">
                  <span className="text-[11px] font-semibold text-primary/60 uppercase tracking-wide">Fascia</span>
                  <select value={bozza.tier || 'C'} onChange={e => setBozza(p => ({ ...p, tier: e.target.value as any }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm">
                    {FASCE.map(f => <option key={f.id} value={f.id}>{f.testo}</option>)}
                  </select>
                </label>
                {campo('Lat', 'lat', 'number')}
                {campo('Lon', 'lon', 'number')}
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-primary/60 uppercase tracking-wide">Descrizione (atlante)</span>
                <textarea value={bozza.description ?? ''} onChange={e => setBozza(p => ({ ...p, description: e.target.value }))}
                  rows={3} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </label>

              <p className="text-[10px] text-primary/40 leading-snug">{selezionato.attribution}</p>

              <button onClick={salva} disabled={operazione === 'salva'}
                className="w-full py-2 rounded-xl bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> Salva bene
              </button>

              {/* Promozione + arricchimento */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                {!poiCollegato(selezionato) ? (
                  <>
                    <p className="text-xs text-primary/60">
                      Questo bene è solo nell'atlante: nessuna scheda completa, nessuna audioguida.
                      Promuovendolo diventa un POI turistico a tutti gli effetti.
                    </p>
                    <div className="flex gap-2">
                      <select value={categoriaPromozione} onChange={e => setCategoriaPromozione(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
                        {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={promuovi} disabled={operazione === 'promuovi' || selezionato.lat == null}
                        className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                        <ArrowUpRight className="w-4 h-4" /> Promuovi a POI turistico
                      </button>
                    </div>
                    {selezionato.lat == null && (
                      <p className="text-[11px] text-red-500">Manca la coordinata: compilala qui sopra e salva prima di promuovere.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Collegato al POI <code className="bg-green-50 px-1 rounded">{poiCollegato(selezionato)}</code>
                      {selezionato.poi_collegato_nome && selezionato.poi_collegato_nome !== selezionato.name && (
                        <span className="text-amber-600">· attenzione: il POI si chiama "{selezionato.poi_collegato_nome}"</span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => arricchisci('text')} disabled={!!operazione}
                        className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                        <Sparkles className="w-4 h-4" /> {operazione === 'text' ? 'Genero…' : 'Genera testo'}
                      </button>
                      <button onClick={() => arricchisci('image')} disabled={!!operazione}
                        className="flex-1 py-2 rounded-xl bg-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                        <ImageIcon className="w-4 h-4" /> {operazione === 'image' ? 'Cerco…' : 'Cerca foto'}
                      </button>
                    </div>

                    {testoPoi && (
                      <div className="space-y-2">
                        <textarea value={testoPoi} onChange={e => setTestoPoi(e.target.value)} rows={5}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                        <button onClick={() => scriviSulPoi({ description_ai: testoPoi, description_short: testoPoi.slice(0, 400), status: 'verified' }, 'Testo salvato sul POI.')}
                          disabled={!!operazione}
                          className="w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
                          Salva testo sul POI
                        </button>
                      </div>
                    )}

                    {opzioniFoto && opzioniFoto.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {opzioniFoto.map(o => (
                          <button key={o.url} onClick={() => scriviSulPoi({ image_url: o.url, photo_url: o.url }, 'Foto salvata sul POI.')}
                            className="relative rounded-xl overflow-hidden border border-gray-200 hover:ring-2 hover:ring-teal-400">
                            <img src={o.url} alt="" className="w-full h-20 object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] px-1 truncate">{o.source}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <a href={`https://wip.guide/?focus=${encodeURIComponent(poiCollegato(selezionato) || '')}`} target="_blank" rel="noreferrer"
                      className="text-xs text-primary/60 flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" /> apri sulla mappa
                    </a>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
