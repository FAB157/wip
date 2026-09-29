import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Language, getTranslation } from "../../lib/i18n";
import type { GlutenSafety } from "../../lib/glutenSafety";

/**
 * Riquadro "Sicurezza per celiaci" nella scheda di un locale.
 * Legge public.poi_gluten_safety. Senza riga, o con livello 'non_verificato',
 * non mostra NULLA: niente "senza glutine" senza una prova.
 */
export default function PoiGlutenSafety({ poiId, language }: { poiId: string | number; language: Language }) {
  const [row, setRow] = useState<GlutenSafety | null>(null);

  useEffect(() => {
    let vivo = true;
    setRow(null);
    // Lo stesso id pulito che usa il resto della scheda (senza suffisso lingua).
    const id = String(poiId).replace(/_[A-Z]{2}$/, "");
    supabase
      .from("poi_gluten_safety")
      .select("*")
      .eq("poi_id", id)
      .maybeSingle()
      .then(({ data }) => { if (vivo && data) setRow(data as GlutenSafety); })
      .catch(() => { /* tabella assente o offline: il riquadro non compare */ });
    return () => { vivo = false; };
  }, [poiId]);

  if (!row || row.level === "non_verificato") return null;

  const t = (k: string) => getTranslation(k, language);
  const titolo = row.level === "solo" ? t("gfs_solo") : row.level === "limitato" ? t("gfs_limitato") : t("gfs_opzioni");
  const fonte = row.source === "sito_locale" ? t("gfs_dichiarato") : row.source === "utenti" ? t("gfs_utenti") : t("gfs_osm");
  const data = row.checked_at ? new Date(row.checked_at).toLocaleDateString(language.toLowerCase()) : "";

  const riga = (etichetta: string, v: boolean | null) => v === null ? null : (
    <div className="flex justify-between text-[12px] font-bold text-slate-700">
      <span>{etichetta}</span><span>{v ? t("gfs_si") : t("gfs_no")}</span>
    </div>
  );

  return (
    <div className="mb-6 p-4 rounded-[2rem] border-2 border-amber-100 bg-amber-50/60" data-testid="poi-gluten-safety">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{row.level === "solo" ? "🌾💯" : "🌾"}</span>
        <div>
          <h4 className="text-[11px] font-black uppercase tracking-tighter text-amber-900/70">{t("gfs_titolo")}</h4>
          <p className="text-[14px] font-black text-amber-950 leading-tight">{titolo}</p>
        </div>
      </div>
      <div className="space-y-1">
        {riga(t("gfs_cucina"), row.dedicated_kitchen)}
        {riga(t("gfs_friggitrice"), row.dedicated_fryer)}
        {row.certification && (
          <div className="flex justify-between text-[12px] font-bold text-slate-700">
            <span>{t("gfs_certificato")}</span>
            {row.certification_url
              ? <a href={row.certification_url} target="_blank" rel="noopener noreferrer" className="underline">{row.certification}</a>
              : <span>{row.certification}</span>}
          </div>
        )}
      </div>
      {row.evidence && (
        <p className="mt-2 text-[11px] italic text-slate-600 leading-snug">«{row.evidence}»</p>
      )}
      <p className="mt-2 text-[10px] font-bold text-slate-500 leading-snug">
        {fonte}{data ? ` · ${t("gfs_ultima_verifica")}: ${data}` : ""}. {t("gfs_verifica")}
      </p>
    </div>
  );
}
