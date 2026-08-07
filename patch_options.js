import fs from 'fs';

let content = fs.readFileSync('src/components/PlanScreen.tsx', 'utf8');

const advancedOptionsUI = `
                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
                    <input type="checkbox" checked={includeEvents} onChange={e => setIncludeEvents(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[#1e3a8a]">🎵 Includi Eventi Locali</span>
                      <span className="text-xs text-gray-500">Concerti, sport, fiere nelle vicinanze</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
                    <input type="checkbox" checked={includeTours} onChange={e => setIncludeTours(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[#1e3a8a]">🗺️ Includi Tour e Attività</span>
                      <span className="text-xs text-gray-500">Esperienze GetYourGuide</span>
                    </div>
                  </label>
                </div>

                <AnimatePresence>
                  {showAdvancedOptions && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4 overflow-hidden pt-4"
                    >
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">Budget</label>
                          <select 
                            value={budget}
                            onChange={(e) => setBudget(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          >
                            <option value="economico">Economico</option>
                            <option value="standard">Standard</option>
                            <option value="lusso">Lusso</option>
                          </select>
                        </div>
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">Viaggiatori</label>
                          <select 
                            value={viaggiatori}
                            onChange={(e) => setViaggiatori(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          >
                            <option value="solo">Solo</option>
                            <option value="coppia">Coppia</option>
                            <option value="famiglia">Famiglia</option>
                            <option value="gruppo">Gruppo</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">Ritmo</label>
                          <select 
                            value={ritmo}
                            onChange={(e) => setRitmo(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          >
                            <option value="rilassato">Rilassato</option>
                            <option value="standard">Standard</option>
                            <option value="intenso">Intenso</option>
                          </select>
                        </div>
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">Guida</label>
                          <select 
                            value={guida}
                            onChange={(e) => setGuida(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          >
                            <option value="NICKY">Nicky (Locale)</option>
                            <option value="DANTE">Dante (Storico)</option>
                            <option value="ENTRAMBI">Entrambi</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
`;

// Insert into Radius section
// We find `<AnimatePresence>\n                  {showAdvancedOptions && (\n                    <motion.div \n                      initial={{ opacity: 0, height: 0 }}` and replace the entire block up to `</AnimatePresence>` with our new one plus the time inputs.

const radiusAdvancedOld = \`                <AnimatePresence>
                  {showAdvancedOptions && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-hidden"
                    >
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">{getTranslation("start_time", language)}</label>
                          <input 
                            type="time" 
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          />
                        </div>
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">{getTranslation("end_time", language)}</label>
                          <input 
                            type="time" 
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>\`;

const radiusAdvancedNew = \`                <AnimatePresence>
                  {showAdvancedOptions && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-hidden"
                    >
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">{getTranslation("start_time", language)}</label>
                          <input 
                            type="time" 
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          />
                        </div>
                        <div className="flex-1 space-y-3">
                          <label className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest pl-1">{getTranslation("end_time", language)}</label>
                          <input 
                            type="time" 
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
\` + advancedOptionsUI;

// Insert into Favorites section
// Find where to insert in favorites. Favorites mode ends with the button "Genera Itinerario dai Preferiti".
// Let's find "handleGenerateFromFavorites" button.
const favoritesInsertMarker = \`              <div className="p-6">
                <button
                  onClick={handleGenerateFromFavorites}\`;

const favoritesAdvancedNew = \`              <div className="p-6">
                <div className="mb-6 space-y-4">
                  <button 
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="w-full text-xs font-black text-on-surface-variant opacity-60 flex items-center justify-center gap-2 hover:opacity-100 transition-opacity p-2"
                  >
                    {showAdvancedOptions ? (getTranslation('hide_basic_options', language)) : (getTranslation('show_basic_options', language))}
                  </button>
                  \` + advancedOptionsUI + \`
                </div>
                <button
                  onClick={handleGenerateFromFavorites}\`;

let newContent = content;

if (newContent.includes(radiusAdvancedOld)) {
  newContent = newContent.replace(radiusAdvancedOld, radiusAdvancedNew);
  console.log('Radius options updated.');
} else {
  // Try CRLF
  const oldCRLF = radiusAdvancedOld.replace(/\\n/g, '\\r\\n');
  const newCRLF = radiusAdvancedNew.replace(/\\n/g, '\\r\\n');
  if (newContent.includes(oldCRLF)) {
    newContent = newContent.replace(oldCRLF, newCRLF);
    console.log('Radius options updated (CRLF).');
  } else {
    console.error('Could not find Radius options block.');
  }
}

if (newContent.includes(favoritesInsertMarker)) {
  newContent = newContent.replace(favoritesInsertMarker, favoritesAdvancedNew);
  console.log('Favorites options updated.');
} else {
  const fCRLF = favoritesInsertMarker.replace(/\\n/g, '\\r\\n');
  const nfCRLF = favoritesAdvancedNew.replace(/\\n/g, '\\r\\n');
  if (newContent.includes(fCRLF)) {
    newContent = newContent.replace(fCRLF, nfCRLF);
    console.log('Favorites options updated (CRLF).');
  } else {
    console.error('Could not find Favorites insert marker.');
  }
}

fs.writeFileSync('src/components/PlanScreen.tsx', newContent, 'utf8');

// Patch server.ts
let serverContent = fs.readFileSync('server.ts', 'utf8');
const radiusTarget = \`const { baseLocation, radius, days, interests, mese, startTime, endTime, budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY" } = req.body;\`;
const radiusNew = \`const { baseLocation, radius, days, interests, mese, startTime, endTime, budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY", includeEvents, includeTours } = req.body;\`;

if (serverContent.includes(radiusTarget)) {
  serverContent = serverContent.replace(radiusTarget, radiusNew);
  
  const radiusTarget2 = \`BUDGET                : \${budget}
VIAGGIATORI           : \${viaggiatori}
RITMO                 : \${ritmo}\`;
  const radiusNew2 = \`BUDGET                : \${budget}
VIAGGIATORI           : \${viaggiatori}
RITMO                 : \${ritmo}
EVENTI LOCALI         : \${includeEvents ? "Sì (includi concerti, fiere, eventi reali nel periodo)" : "No"}
TOUR E ESPERIENZE     : \${includeTours ? "Sì (proponi attivamente link a tour e guide esterne)" : "No"}\`;
  serverContent = serverContent.replace(radiusTarget2, radiusNew2);
  fs.writeFileSync('server.ts', serverContent, 'utf8');
  console.log('server.ts updated.');
} else {
  console.error('Could not find radius endpoint destructuring in server.ts.');
}
