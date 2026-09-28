import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';
import { MapPin, Save, X, Search, RefreshCw, History, Loader2 } from 'lucide-react';
import { MONUMENTI_TYPES, CHIESE_TYPES, MUSEI_TYPES, PANORAMI_TYPES } from '../lib/poiTaxonomy';

/**
 * Editor POI sulla mappa (ondata 2): correggere nome, coordinate (pin
 * trascinabile), categoria, status e contatti direttamente dalla mappa,
 * senza script né SQL editor. Ogni salvataggio passa da
 * POST /api/admin/poi/update, che scrive il diff nello storico
 * (tab "Errori di Sistema" → sorgente poi_editor, livello info).
 */

interface EditablePoi {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string | null;
  status: string | null;
  contact_website: string | null;
  contact_phone: string | null;
  description_short: string | null;
  is_gem: boolean | null;
}

const STATUS_OPTIONS = ['auto', 'verified', 'draft', 'needs_revision', 'banned'];
const CATEGORY_SUGGESTIONS = ['monumenti', 'chiese', 'musei', 'gemme', 'panorami', 'parchi', 'community', 'utilita'];
const STATUS_COLORS: Record<string, string> = {
  verified: '#059669',
  auto: '#64748b',
  draft: '#d97706',
  needs_revision: '#dc2626',
  banned: '#111827',
};

// CATEGORIE CULTURALI come nella mappa principale (25/09/2026, committente: «si possa selezionare i poi
// culturali su quella mappa come nella mappa originale… sapendo cosa sono»). Stessi elenchi di
// poiTaxonomy.ts: una chip filtra il caricamento e ogni pin mostra l'icona della sua categoria.
type CatId = 'gemme' | 'monumenti' | 'chiese' | 'musei' | 'panorami';
const CATEGORIE_CULTURALI: { id: CatId; label: string; emoji: string; tipi: string[] }[] = [
  { id: 'gemme', label: 'Gemme', emoji: '💎', tipi: ['gemme'] },
  { id: 'monumenti', label: 'Monumenti', emoji: '🏛️', tipi: MONUMENTI_TYPES },
  { id: 'chiese', label: 'Chiese', emoji: '⛪', tipi: CHIESE_TYPES },
  { id: 'musei', label: 'Musei', emoji: '🖼️', tipi: MUSEI_TYPES },
  { id: 'panorami', label: 'Panorami', emoji: '🔭', tipi: PANORAMI_TYPES },
];
/** La categoria culturale di un POI (null = non culturale). Una gemma resta gemma qualunque sia la categoria. */
function categoriaCulturale(p: { category: string | null; is_gem: boolean | null }): CatId | null {
  if (p.is_gem === true) return 'gemme';
  const c = String(p.category || '').toLowerCase();
  for (const cat of CATEGORIE_CULTURALI) if (cat.tipi.includes(c)) return cat.id;
  return null;
}
const iconeCategoria: Record<string, L.DivIcon> = {};
/** Pin con l'icona della categoria e il bordo col colore dello stato (la legenda degli stati resta valida). */
function iconaPoi(p: EditablePoi): L.DivIcon {
  const cat = categoriaCulturale(p);
  const emoji = CATEGORIE_CULTURALI.find(c => c.id === cat)?.emoji || '•';
  const bordo = STATUS_COLORS[p.status || 'auto'] || '#64748b';
  const chiave = `${emoji}|${bordo}`;
  if (!iconeCategoria[chiave]) {
    iconeCategoria[chiave] = L.divIcon({
      className: '',
      html: `<div style="width:24px;height:24px;border-radius:50%;background:white;border:3px solid ${bordo};box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1">${emoji}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }
  return iconeCategoria[chiave];
}

// Pin trascinabile del POI selezionato: un divIcon evita i problemi di
// bundling delle icone di default di Leaflet.
const selectedIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#1e3a8a;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

/** Ricarica i POI a ogni spostamento mappa (solo da zoom 13 in su). */
function ViewportLoader({ onViewport }: { onViewport: (bounds: L.LatLngBounds, zoom: number) => void }) {
  const map = useMapEvents({
    moveend: () => onViewport(map.getBounds(), map.getZoom()),
  });
  useEffect(() => { onViewport(map.getBounds(), map.getZoom()); }, []);
  return null;
}

/** Vola su una posizione quando cambia (ricerca per nome). */
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [target?.[0], target?.[1]]);
  return null;
}

export default function AdminPoiMapEditor() {
  const [pois, setPois] = useState<EditablePoi[]>([]);
  const [selected, setSelected] = useState<EditablePoi | null>(null);
  const [form, setForm] = useState<Partial<EditablePoi>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zoomTooLow, setZoomTooLow] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<EditablePoi[]>([]);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  // Categorie culturali accese (tutte all'inizio). Nessuna accesa = tutti i POI della zona, come prima.
  const [categorieAttive, setCategorieAttive] = useState<CatId[]>(CATEGORIE_CULTURALI.map(c => c.id));
  const lastReq = useRef(0);
  const ultimaVista = useRef<{ bounds: L.LatLngBounds; zoom: number } | null>(null);

  const loadViewport = useCallback(async (bounds: L.LatLngBounds, zoom: number) => {
    ultimaVista.current = { bounds, zoom };
    if (zoom < 13) { setZoomTooLow(true); return; }
    setZoomTooLow(false);
    setLoading(true);
    const reqId = ++lastReq.current;
    try {
      let q = supabase
        .from('shared_pois')
        .select('id, name, lat, lon, category, status, contact_website, contact_phone, description_short, is_gem')
        .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
        .gte('lon', bounds.getWest()).lte('lon', bounds.getEast());
      if (categorieAttive.length) {
        const tipi = [...new Set(CATEGORIE_CULTURALI.filter(c => categorieAttive.includes(c.id) && c.id !== 'gemme').flatMap(c => c.tipi))];
        const condizioni: string[] = [];
        if (categorieAttive.includes('gemme')) condizioni.push('is_gem.eq.true', 'category.eq.gemme');
        if (tipi.length) condizioni.push(`category.in.(${tipi.join(',')})`);
        q = q.or(condizioni.join(','));
      }
      const { data, error } = await q.limit(400);
      if (error) throw error;
      if (reqId === lastReq.current) setPois((data || []) as EditablePoi[]);
    } catch (e: any) {
      notify(`Caricamento POI fallito: ${e?.message || e}`);
    } finally {
      if (reqId === lastReq.current) setLoading(false);
    }
  }, [categorieAttive]);

  // Cambiando le chip si ricarica la zona già inquadrata.
  useEffect(() => {
    if (ultimaVista.current) loadViewport(ultimaVista.current.bounds, ultimaVista.current.zoom);
  }, [loadViewport]);

  const commutaCategoria = (id: CatId) =>
    setCategorieAttive(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  // Ricerca per nome (debounce): utile per raggiungere un POI segnalato
  useEffect(() => {
    if (searchTerm.trim().length < 3) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('shared_pois')
        .select('id, name, lat, lon, category, status, contact_website, contact_phone, description_short, is_gem')
        .ilike('name', `%${searchTerm.trim()}%`)
        .limit(8);
      setSearchResults((data || []) as EditablePoi[]);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const openPoi = (p: EditablePoi) => {
    setSelected(p);
    setForm({ ...p });
    setReason('');
    setSearchResults([]);
    setSearchTerm('');
    setFlyTarget([p.lat, p.lon]);
  };

  const setField = (k: keyof EditablePoi, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const doSave = async () => {
    if (!selected) return;
    // Solo i campi davvero cambiati viaggiano verso il server
    const changes: any = {};
    (['name', 'category', 'status', 'lat', 'lon', 'contact_website', 'contact_phone', 'description_short', 'is_gem'] as (keyof EditablePoi)[]).forEach(k => {
      if (form[k] !== undefined && String(form[k] ?? '') !== String(selected[k] ?? '')) changes[k] = form[k];
    });
    if (Object.keys(changes).length === 0) { notify('Nessuna modifica da salvare.'); return; }
    setSaving(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(getApiUrl('/api/admin/poi/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ poiId: selected.id, changes, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const updated = { ...selected, ...changes } as EditablePoi;
      setPois(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelected(updated);
      setForm({ ...updated });
      notify(`POI aggiornato (${Object.keys(changes).join(', ')}). Storico nel tab Errori → sorgente poi_editor.`);
    } catch (e: any) {
      notify(`Salvataggio fallito: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h3 className="font-black text-primary text-sm uppercase tracking-widest flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Editor POI sulla mappa
          </h3>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            Clicca un punto per aprirlo, trascina il pin blu per correggerne la posizione. Ogni salvataggio lascia lo storico modifiche.
          </p>
        </div>
        {/* Ricerca per nome con salto sulla mappa */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cerca POI per nome..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searchResults.length > 0 && (
            <div className="absolute z-[1200] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {searchResults.map(r => (
                <button key={r.id} onClick={() => openPoi(r)}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  {r.name}
                  <span className="block text-[10px] font-medium text-gray-500">{r.category || 'senza categoria'} · {r.status || 'n/d'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chip delle categorie culturali, come nella mappa principale */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORIE_CULTURALI.map(c => {
          const on = categorieAttive.includes(c.id);
          return (
            <button key={c.id} type="button" onClick={() => commutaCategoria(c.id)} aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-[11px] font-black border transition-colors ${on ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}>
              {c.emoji} {c.label}
            </button>
          );
        })}
        <span className="text-[10px] font-bold text-gray-500 ml-1">
          {categorieAttive.length ? `${pois.length} POI culturali nella zona${pois.length >= 400 ? ' (primi 400: avvicinati)' : ''}` : `Tutti i POI della zona (${pois.length})`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Mappa */}
        <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border border-gray-200" style={{ height: 520 }}>
          <MapContainer center={[44.07, 10.1]} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
            <ViewportLoader onViewport={loadViewport} />
            <FlyTo target={flyTarget} />
            {pois.map(p => (
              p.id === selected?.id ? null : (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lon]}
                  icon={iconaPoi(p)}
                  eventHandlers={{ click: () => openPoi(p) }}
                >
                  <Tooltip direction="top" offset={[0, -12]}>
                    {p.name}
                    <br /><span style={{ fontSize: 10, color: '#6b7280' }}>{CATEGORIE_CULTURALI.find(c => c.id === categoriaCulturale(p))?.label || p.category || 'senza categoria'} · {p.status || 'auto'}</span>
                  </Tooltip>
                </Marker>
              )
            ))}
            {selected && form.lat != null && form.lon != null && (
              <Marker
                position={[Number(form.lat), Number(form.lon)]}
                icon={selectedIcon}
                draggable
                eventHandlers={{
                  dragend: (e: any) => {
                    const ll = e.target.getLatLng();
                    setField('lat', Number(ll.lat.toFixed(6)));
                    setField('lon', Number(ll.lng.toFixed(6)));
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} permanent>{form.name || selected.name}</Tooltip>
              </Marker>
            )}
          </MapContainer>
          {(loading || zoomTooLow) && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 border border-gray-200 rounded-xl px-3 py-1.5 text-[11px] font-black text-primary shadow-sm flex items-center gap-1.5">
              {zoomTooLow ? 'Avvicinati (zoom ≥ 13) per vedere i POI' : (<><RefreshCw className="w-3 h-3 animate-spin" /> Carico i POI della zona...</>)}
            </div>
          )}
          {/* Legenda status */}
          <div className="absolute bottom-2 left-2 z-[1000] bg-white/95 border border-gray-200 rounded-xl px-2.5 py-1.5 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(s => (
              <span key={s} className="flex items-center gap-1 text-[9px] font-black uppercase text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: STATUS_COLORS[s] }} /> {s}
              </span>
            ))}
          </div>
        </div>

        {/* Pannello di modifica */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2.5" style={{ minHeight: 520 }}>
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2 py-16">
              <MapPin className="w-8 h-8" />
              <p className="text-sm font-bold">Seleziona un POI sulla mappa<br />o cercalo per nome.</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-black text-primary text-sm leading-tight">{selected.name}</h4>
                <button onClick={() => { setSelected(null); setForm({}); }} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[10px] font-mono text-gray-500 break-all">{selected.id}</p>

              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Nome
                <input value={String(form.name ?? '')} onChange={e => setField('name', e.target.value)}
                  className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Categoria
                  <input list="poi-cats" value={String(form.category ?? '')} onChange={e => setField('category', e.target.value)}
                    className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800" />
                  <datalist id="poi-cats">{CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
                </label>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Status
                  <select value={String(form.status ?? 'auto')} onChange={e => setField('status', e.target.value)}
                    className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Lat
                  <input type="number" step="0.000001" value={String(form.lat ?? '')} onChange={e => setField('lat', Number(e.target.value))}
                    className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800" />
                </label>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Lon
                  <input type="number" step="0.000001" value={String(form.lon ?? '')} onChange={e => setField('lon', Number(e.target.value))}
                    className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800" />
                </label>
              </div>

              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Sito web
                <input value={String(form.contact_website ?? '')} onChange={e => setField('contact_website', e.target.value)} placeholder="https://…"
                  className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Telefono
                <input value={String(form.contact_phone ?? '')} onChange={e => setField('contact_phone', e.target.value)}
                  className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Descrizione breve
                <textarea rows={2} value={String(form.description_short ?? '')} onChange={e => setField('description_short', e.target.value)}
                  className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 resize-none" />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
                <input type="checkbox" checked={form.is_gem === true} onChange={e => setField('is_gem', e.target.checked)} className="w-4 h-4 rounded" />
                💎 Gemma nascosta
              </label>

              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Causale (facoltativa, va nello storico)
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="es. coordinate sbagliate segnalate da utente"
                  className="mt-1 w-full bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800" />
              </label>

              <button onClick={doSave} disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva modifiche
              </button>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <History className="w-3 h-3" /> Il diff finisce in Errori di Sistema (sorgente <b>poi_editor</b>, livello info).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
