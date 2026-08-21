/**
 * DOVE SI ARRIVA DAVVERO: la porta, non il centro dell'edificio.
 * ==============================================================
 * La differenza fra i due punti non e' cosmetica. OSRM aggancia la
 * destinazione alla strada percorribile piu' vicina: dal centroide di un
 * palazzo puo' agganciarsi alla via sul RETRO, e allora l'intero percorso gira
 * dalla parte sbagliata. Con l'ingresso si aggancia alla via del portone.
 * Cambia il percorso, non l'ultimo metro.
 *
 * Il nativo lo fa gia' da sempre — `poi.entranceLat ?: poi.lat` in
 * GeofenceManager.kt, WipRadarScreen.kt (Android Auto) e
 * PoiModels.swift::triggerLocation. Il web no: tutti i punti di partenza della
 * navigazione passavano il centroide. Questa funzione e' l'allineamento.
 */
export function puntoArrivo(p: any): { lat: number; lon: number } {
  const eLat = Number(p?.entrance_lat ?? p?.entranceLat);
  const eLon = Number(p?.entrance_lon ?? p?.entranceLon);
  // Lo zero-zero e' escluso di proposito: (0,0) e' il Golfo di Guinea, ed e'
  // il valore che esce da un campo vuoto convertito a numero, non un ingresso.
  if (Number.isFinite(eLat) && Number.isFinite(eLon) && (eLat !== 0 || eLon !== 0)) {
    return { lat: eLat, lon: eLon };
  }
  return { lat: Number(p?.lat), lon: Number(p?.lon) };
}
