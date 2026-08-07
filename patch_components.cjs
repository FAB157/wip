const fs = require('fs');
const path = require('path');

function replaceAll(str, mapObj) {
  let re = new RegExp(Object.keys(mapObj).join("|"), "g");
  return str.replace(re, matched => mapObj[matched]);
}

function processFile(filename, replacements) {
  const p = path.join('src', 'components', filename);
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');
  
  // ensure we have getTranslation imported if needed
  if (!content.includes('getTranslation') && content.includes('react')) {
    // just a heuristic
    content = content.replace(/import\s+{[^}]*}\s+from\s+['"]react['"];/, (m) => m + `\nimport { getTranslation } from "../lib/i18n";`);
  }

  // replace
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.split(search).join(replace);
  }

  fs.writeFileSync(p, content, 'utf8');
  console.log(`Patched ${filename}`);
}

const poiDetailSheetReplacements = {
  '"Senza Glutine Disponibile"': 'getTranslation("gluten_free_available", language)',
  '"Abbiamo rilevato che questo locale offre opzioni per\\n                    celiaci."': 'getTranslation("gluten_free_detected", language)',
  '"Esplora per tipo"': 'getTranslation("explore_by_type", language)',
  '"Stato Disponibilità"': 'getTranslation("availability_status", language)',
  '"Tariffa"': 'getTranslation("fare", language)',
  '"Tipo"': 'getTranslation("type", language)',
  '"Dettagli dell\'Opera"': 'getTranslation("artwork_details", language)',
  '"Autore / Artista"': 'getTranslation("author", language)',
  '"Periodo Storico"': 'getTranslation("period", language)',
  '"Curiosità"': 'getTranslation("curiosity", language)',
  '"MEGAPHONE"': 'getTranslation("megaphone", language)',
  '"Per un\'esperienza ottimale, si consiglia l\'uso di cuffie"': 'getTranslation("use_headphones", language)',
  '"Richiedi più informazioni"': 'getTranslation("more_info", language)',
  '"Salva Audio Offline"': 'getTranslation("save_audio", language)',
  '"💡 Ascolta prima l\'audio (premi Play) per abilitare il salvataggio offline."': 'getTranslation("audio_hint", language)',
  '"Vicino a te"': 'getTranslation("near_you", language)',
  '"Attrazioni nei dintorni"': 'getTranslation("attractions_nearby", language)',
};

const planScreenReplacements = {
  '"Itinerari Offline"': '{getTranslation("offline_mode", language)}',
  '"Nessun itinerario scaricato"': '{getTranslation("no_offline_plans", language)}',
  '"Usa il bottone \'Offline\' dentro un itinerario generato"': '{getTranslation("use_offline_button", language)}',
  '>Apri Offline<': '>{getTranslation("open_offline", language)}<',
  '>Apri in Maps<': '>{getTranslation("open_maps", language)}<',
  '>Aggiungi Tappa<': '>{getTranslation("add_stop", language)}<',
  '"Azione/Visita"': 'getTranslation("action_visit", language)',
  '"Ristorante"': 'getTranslation("action_restaurant", language)',
  '>Pausa<': '>{getTranslation("action_break", language)}<',
  '"Spostamento"': 'getTranslation("action_travel", language)',
  '>Annulla<': '>{getTranslation("cancel", language)}<',
  '>Salva<': '>{getTranslation("save", language)}<',
  '"Aggiungi una tappa manuale..."': 'getTranslation("add_manual_stop", language)',
  '>Budget della Giornata<': '>{getTranslation("daily_budget", language)}<',
  '>Attrazioni<': '>{getTranslation("attractions", language)}<',
  '>Trasporti<': '>{getTranslation("transport", language)}<',
  '>Colazione<': '>{getTranslation("breakfast", language)}<',
  '>Pranzo<': '>{getTranslation("lunch", language)}<',
  '>Cena<': '>{getTranslation("dinner", language)}<',
  '>TOTALE GIORNO<': '>{getTranslation("total_day", language)}<',
  '>Mappa Itinerario<': '>{getTranslation("itinerary_map", language)}<',
  '>Totale Stimato Viaggio<': '>{getTranslation("total_estimated_trip", language)}<',
  '>WIP l\'esperto di viaggi sta lavorando...<': '>{getTranslation("wip_working", language)}<',
  '>Stiamo ottimizzando le tappe del tuo viaggio per minimizzare i tempi di spostamento e massimizzare il divertimento.<': '>{getTranslation("optimizing_stops", language)}<',
  'placeholder="Es: Ristorante vegano, solo musei, ritmo lento..."': 'placeholder={getTranslation("placeholder_interests", language)}',
  'placeholder="Ora (es: 10:00)"': 'placeholder={getTranslation("placeholder_time", language)}',
  'placeholder="Nome della Tappa"': 'placeholder={getTranslation("placeholder_stop_name", language)}',
  'placeholder="Tempo necessario (es. 2 ore)"': 'placeholder={getTranslation("placeholder_duration", language)}',
  'placeholder="Attività / Descrizione"': 'placeholder={getTranslation("placeholder_activity", language)}',
  'placeholder="Latitudine (Opzionale)"': 'placeholder={getTranslation("placeholder_lat", language)}',
  'placeholder="Longitudine (Opzionale)"': 'placeholder={getTranslation("placeholder_lon", language)}',
  'placeholder="Consigli/Note aggiuntive"': 'placeholder={getTranslation("placeholder_notes", language)}'
};

const profileScreenReplacements = {
  '>Itinerari Suggeriti<': '>{getTranslation("suggested_itineraries", language)}<',
  '>Qui appariranno i percorsi personalizzati creati per te dalla nostra Guida AI.<': '>{getTranslation("suggested_itineraries_desc", language)}<',
  '>Offline<': '>{getTranslation("offline_btn", language)}<',
  '>APRI MAPPA<': '>{getTranslation("open_map_caps", language)}<',
  '>LAVORANDO AI TUOI RICORDI...<': '>{getTranslation("working_on_memories", language)}<',
  '>Contatore Limiti Giornalieri<': '>{getTranslation("daily_limits_counter", language)}<',
  '>Monitora i crediti consumati in tempo reale (in base al tuo piano).<': '>{getTranslation("daily_limits_desc", language)}<',
  'label="🏛️ STORIA E CULTURA"': 'label={getTranslation("lbl_history_culture", language)}',
  'label="🌲 PAESAGGIO E NATURA"': 'label={getTranslation("lbl_nature", language)}',
  'label="🍕 FOOD & OSPITALITÀ"': 'label={getTranslation("lbl_food", language)}',
  'label="🛒 SERVIZI"': 'label={getTranslation("lbl_services", language)}',
};

const poiCardReplacements = {
  '>Carico la scheda…<': '>{getTranslation("loading_card", language)}<',
  '>Naviga<': '>{getTranslation("navigate", language)}<',
  'label="Chiudi"': 'label={getTranslation("poi_close", language)}'
};

const poiPopupContentReplacements = {
  '>Carico scheda…<': '>{getTranslation("loading_card", language)}<',
  '>Dati storici<': '>{getTranslation("poi_historical_data", language)}<',
  '>Costruito:<': '>{getTranslation("poi_built", language)}<',
  '>Architetto:<': '>{getTranslation("poi_architect", language)}<',
  '>Stile:<': '>{getTranslation("poi_style", language)}<',
  '>Info pratiche<': '>{getTranslation("poi_practical_info", language)}<',
  '>Leggi su Wikipedia<': '>{getTranslation("poi_read_wikipedia", language)}<',
  '>♿ No Barriere<': '>{getTranslation("poi_no_barriers", language)}<',
  '>💎 Gemma<': '>{getTranslation("poi_gem", language)}<',
  '>Guida<': '>{getTranslation("guide", language)}<',
  '>Naviga<': '>{getTranslation("navigate", language)}<',
  '>Audio<': '>{getTranslation("poi_audio", language)}<',
  'title="Ascolta la scheda"': 'title={getTranslation("poi_listen_card", language)}',
  'title="Condividi"': 'title={getTranslation("poi_share", language)}'
};

processFile('PoiDetailSheet.tsx', poiDetailSheetReplacements);
processFile('PlanScreen.tsx', planScreenReplacements);
processFile('ProfileScreen.tsx', profileScreenReplacements);
processFile('PoiCard.tsx', poiCardReplacements);
processFile('PoiPopupContent.tsx', poiPopupContentReplacements);

console.log("Patching complete!");
