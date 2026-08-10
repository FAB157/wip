import { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';

/**
 * Preferenza di visualizzazione condivisa da TUTTE le gallerie dell'app
 * (My Vision, Diario/archivio, ...): griglia o lista, persistita in
 * localStorage così vale ovunque e sopravvive al riavvio.
 */
export type GalleryView = 'grid' | 'list';

const STORAGE_KEY = 'wip_gallery_view';

export function useGalleryView(): [GalleryView, (v: GalleryView) => void] {
  const [view, setViewState] = useState<GalleryView>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setView = (v: GalleryView) => {
    setViewState(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* storage non disponibile */ }
  };
  return [view, setView];
}

export default function GalleryViewToggle({ view, onChange }: { view: GalleryView; onChange: (v: GalleryView) => void }) {
  return (
    <div className="flex bg-white rounded-xl p-1 border border-gray-100 shadow-sm shrink-0">
      <button
        aria-label="Vista griglia"
        onClick={() => onChange('grid')}
        className={`p-1.5 rounded-lg transition-all ${view === 'grid' ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
      <button
        aria-label="Vista lista"
        onClick={() => onChange('list')}
        className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <List className="w-4 h-4" />
      </button>
    </div>
  );
}
