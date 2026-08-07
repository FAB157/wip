import sys
import re

with open('src/components/PlanScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add States
state_target = '''const [viatorByDay, setViatorByDay] = useState<Record<number, any[]>>({});
  const [viatorLoadingDay, setViatorLoadingDay] = useState<number | null>(null);
  const [viatorExpandedDay, setViatorExpandedDay] = useState<number | null>(null);'''

state_replacement = state_target + '''
  const [gygByDay, setGygByDay] = useState<Record<number, any[]>>({});
  const [gygLoadingDay, setGygLoadingDay] = useState<number | null>(null);
  const [gygExpandedDay, setGygExpandedDay] = useState<number | null>(null);'''

if state_target in content:
    content = content.replace(state_target, state_replacement)
else:
    # Try regex if spacing differs
    state_target_re = r'const \[viatorByDay.*?useState<number \| null>\(null\);'
    content = re.sub(state_target_re, state_replacement, content, flags=re.DOTALL)


# 2. Add load function
load_target = r'(const loadViatorForDay = async \(dayIdx: number\) => \{.*?\n  \};)'
match = re.search(load_target, content, flags=re.DOTALL)
if match:
    load_viator = match.group(1)
    
    # We will build loadGygForDay manually
    load_gyg = '''

  const loadGygForDay = async (dayIdx: number) => {
    if (!generatedPlan || gygByDay[dayIdx]) {
      setGygExpandedDay(prev => prev === dayIdx ? null : dayIdx);
      return;
    }
    setGygLoadingDay(dayIdx);
    setGygExpandedDay(dayIdx);

    try {
      const g = generatedPlan.giorni[dayIdx];
      let lat = generatedPlan.destinazione_lat;
      let lon = generatedPlan.destinazione_lng;
      if (g.pois && g.pois.length > 0) {
        lat = g.pois[0].coordinate?.lat || lat;
        lon = g.pois[0].coordinate?.lng || lon;
      }
      
      const res = await fetch("/api/getyourguide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
          radius: 50,
          cityName: generatedPlan.destinazione
        })
      });
      if (!res.ok) throw new Error("Errore api GYG");
      const experiences = await res.json();
      setGygByDay(prev => ({ ...prev, [dayIdx]: experiences }));
    } catch (err) {
      console.error("[GYG] Error loading experiences for day", dayIdx, err);
      setGygByDay(prev => ({ ...prev, [dayIdx]: [] }));
    } finally {
      setGygLoadingDay(null);
    }
  };'''
    content = content.replace(load_viator, load_viator + load_gyg)


# 3. Add handleAddGygToDay
add_target = r'(const handleAddViatorToDay = \(dayIdx: number, exp: any\) => \{.*?\n  \};)'
match = re.search(add_target, content, flags=re.DOTALL)
if match:
    add_viator = match.group(1)
    add_gyg = '''

  const handleAddGygToDay = (dayIdx: number, exp: any) => {
    const updatedPlan = { ...generatedPlan };
    const newTappa = {
      id_tappa: `gyg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ora: "TBD",
      titolo_tappa: exp.name || "Esperienza GetYourGuide",
      attivita: (exp.description || "") + `\\n\\n[Link GetYourGuide](${exp.url})`,
      consiglio_guida: `Esperienza prenotabile su GetYourGuide: ${exp.price} (${exp.duration})`,
      tipo: "ESPERIENZA",
      coordinate: {
        lat: exp.lat || updatedPlan.destinazione_lat,
        lng: exp.lon || updatedPlan.destinazione_lng
      },
      imageUrl: exp.imageUrl
    };
    updatedPlan.giorni[dayIdx].tappe.push(newTappa);
    setGeneratedPlan(updatedPlan);
    setToastMessage(`Esperienza GYG aggiunta al giorno ${dayIdx + 1}!`);
  };'''
    content = content.replace(add_viator, add_viator + add_gyg)


# 4. Add UI block
ui_target = r'({\/\* ── ESPERIENZE VIATOR.*?}\)\n\s*\]\n\s*:\n\s*null)'
match = re.search(ui_target, content, flags=re.DOTALL)
if match:
    ui_viator = match.group(1)
    
    ui_gyg = '''

                          {/* ── ESPERIENZE GETYOURGUIDE (con link affiliato) ── */}
                          <div className="mt-6 border border-orange-200 rounded-xl overflow-hidden shadow-sm bg-white">
                            <div 
                              className="bg-orange-50 p-4 cursor-pointer flex items-center justify-between transition-colors hover:bg-orange-100"
                              onClick={() => loadGygForDay(gIdx)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                                  <Ticket size={18} />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                                    Tour & Attività GetYourGuide
                                  </h4>
                                  <p className="text-[10px] text-gray-500 font-bold">Powered by GetYourGuide — scopri le migliori attrazioni</p>
                                </div>
                              </div>
                              {gygExpandedDay === gIdx 
                                ? <ChevronUp size={20} className="text-gray-400" />
                                : <ChevronDown size={20} className="text-gray-400" />
                              }
                            </div>
                            
                            <AnimatePresence>
                              {(gygExpandedDay === gIdx) && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4 bg-orange-50/30">
                                    {(gygLoadingDay === gIdx) ? (
                                      <div className="flex flex-col items-center justify-center py-6 gap-3">
                                        <Loader2 size={24} className="text-orange-500 animate-spin" />
                                        <p className="text-sm text-gray-500 font-medium">Ricerca esperienze GYG nei paraggi...</p>
                                      </div>
                                    ) : gygByDay[gIdx] && gygByDay[gIdx].length > 0 ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {gygByDay[gIdx].map((exp: any, eIdx: number) => (
                                          <a 
                                            key={`gyg-${gIdx}-${eIdx}`}
                                            href={exp.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group block bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all hover:border-orange-200"
                                          >
                                            <div className="h-32 w-full overflow-hidden relative">
                                              <img 
                                                src={exp.imageUrl || "https://images.unsplash.com/photo-1540039155732-6761b5f1e847?auto=format&fit=crop&q=80&w=400"} 
                                                alt={exp.name}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                              />
                                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-bold text-gray-800 shadow-sm">
                                                {exp.price}
                                              </div>
                                            </div>
                                            <div className="p-3">
                                              <h5 className="font-bold text-sm text-gray-800 line-clamp-2 leading-tight mb-2 group-hover:text-orange-600 transition-colors">{exp.name}</h5>
                                              
                                              <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                                  <Clock size={12} />
                                                  <span>{exp.duration}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <span className="text-xs font-semibold text-yellow-600">{exp.rating}</span>
                                                </div>
                                              </div>
                                              
                                              <button 
                                                onClick={(e) => { e.preventDefault(); handleAddGygToDay(gIdx, exp); }}
                                                className="mt-3 w-full py-2 bg-orange-50 text-orange-600 text-xs font-bold rounded-lg border border-orange-100 hover:bg-orange-500 hover:text-white transition-colors flex items-center justify-center gap-1"
                                              >
                                                <Plus size={14} />
                                                Aggiungi all'itinerario
                                              </button>
                                            </div>
                                          </a>
                                        ))}
                                      </div>
                                    ) : gygByDay[gIdx] ? (
                                      <p className="text-sm text-gray-500 text-center py-4">Nessuna esperienza GYG trovata per questo giorno.</p>
                                    ) : null}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>'''
    
    content = content.replace(ui_viator, ui_viator + ui_gyg)

with open('src/components/PlanScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("PlanScreen modifications completed successfully.")
