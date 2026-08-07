import fs from 'fs';

let content = fs.readFileSync('src/components/PlanScreen.tsx', 'utf8');

const renderFn = `
  const renderAdvancedSettings = () => (
    <>
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

      <button
        type="button"
        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
        className="w-full py-3 mt-4 bg-gray-50 text-[#1e3a8a] rounded-2xl font-bold text-sm border border-outline-variant/10 flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <ListChecks className="w-4 h-4" />
        {showAdvancedOptions ? getTranslation("hide_basic_options", language) : getTranslation("show_basic_options", language)}
      </button>

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
    </>
  );
`;

content = content.replace("  return (", renderFn + "\n  return (");

// Step 2: Replace manual advanced options
const manualRegex = /<div className="space-y-2">[\s\S]*?<\/AnimatePresence>/m;
content = content.replace(manualRegex, "{renderAdvancedSettings()}");

// Step 3: Replace radius advanced options
// Starts with: <button \n                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
// Ends with: </AnimatePresence>
const radiusRegex = /<button \s*onClick=\{\(\) => setShowAdvancedOptions\(!showAdvancedOptions\)\}[\s\S]*?<\/AnimatePresence>/m;
content = content.replace(radiusRegex, "{renderAdvancedSettings()}");

// Step 4: Inject into Favorites
const favoritesMarker = /<div className="flex gap-4 pt-4">\s*<button \s*onClick=\{\(\) => setPlannerMode\('selection'\)\}/m;
content = content.replace(favoritesMarker, "{renderAdvancedSettings()}\n\n              <div className=\"flex gap-4 pt-4\">\n                <button \n                  onClick={() => setPlannerMode('selection')}");

fs.writeFileSync('src/components/PlanScreen.tsx', content, 'utf8');

// Also update server.ts
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace(
  'budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY" } = req.body;',
  'budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY", includeEvents, includeTours } = req.body;'
);
serverContent = serverContent.replace(
  'RITMO                 : ${ritmo}',
  'RITMO                 : ${ritmo}\nEVENTI LOCALI         : ${includeEvents ? "Sì (includi concerti, fiere, eventi reali nel periodo)" : "No"}\nTOUR E ESPERIENZE     : ${includeTours ? "Sì (proponi attivamente link a tour e guide esterne)" : "No"}'
);
fs.writeFileSync('server.ts', serverContent, 'utf8');

console.log('UI and API patched.');
