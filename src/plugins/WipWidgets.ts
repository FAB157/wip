import { registerPlugin } from '@capacitor/core';

/**
 * WIDGET DELLA HOME (14/09/2026). Il ponte tra l'app e i widget nativi.
 *
 * L'app compone UN solo snapshot JSON (src/lib/widgetDati.ts: crediti e
 * pass, visita museo in corso, itinerario di oggi, luoghi vicini) e lo
 * consegna al nativo con `aggiorna`. Il nativo lo scrive dove i widget
 * possono leggerlo anche ad app chiusa — su iOS nell'App Group
 * `group.com.itaintasca.app` (UserDefaults), su Android in SharedPreferences
 * — e chiede al sistema di ridisegnare i widget (WidgetCenter.reloadAllTimelines
 * / broadcast APPWIDGET_UPDATE). I widget non chiamano mai la rete per i
 * dati: leggono lo snapshot e basta; scaricano solo le miniature.
 *
 * Sul web il plugin non esiste: `aggiorna` non fa nulla.
 */
export interface WipWidgetsPlugin {
  /** Consegna lo snapshot (JSON già serializzato) ai widget. */
  aggiorna(options: { dati: string }): Promise<void>;
}

export const WipWidgets = registerPlugin<WipWidgetsPlugin>('WipWidgets', {
  web: () => Promise.resolve({ aggiorna: async () => { /* niente widget sul web */ } }),
});
