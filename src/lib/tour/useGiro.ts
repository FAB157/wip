/**
 * DIECI TAPPE — i ganci React sul servizio.
 *
 * Il giro e la bozza vivono nel singleton `tourService`, non nello stato di
 * un componente: lista del radar, scheda POI e mappa devono vedere la stessa
 * selezione senza passarsi props attraverso mezza app. Questi due hook sono
 * l'unico modo con cui un componente la legge.
 */
import { useEffect, useState } from 'react';
import { tourService, type BozzaGiro, type VistaGiro } from '../../services/tourService';

export function useBozzaGiro(): BozzaGiro {
  const [b, setB] = useState<BozzaGiro>(tourService.bozza());
  useEffect(() => tourService.ascoltaBozza(setB), []);
  return b;
}

export function useVistaGiro(): VistaGiro | null {
  const [v, setV] = useState<VistaGiro | null>(tourService.vista());
  useEffect(() => tourService.ascolta(setV), []);
  return v;
}
