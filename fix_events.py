import sys

with open('src/components/EventsScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace predicthq with getyourguide throughout
content = content.replace("predicthq", "getyourguide")
content = content.replace("PredictHQ", "GetYourGuide")

# We need to rewrite loadGetYourGuide (formerly loadPredictHQ) to match the GYG API.
old_load = '''  const loadGetYourGuide = async (lat: number, lon: number, searchRadius: number) => {
    logApiCall('getyourguide', 'ricerca_eventi_api');
    setLoadingSources(prev => ({ ...prev, getyourguide: true }));
    setSourceErrors(prev => ({ ...prev, getyourguide: null }));
    
    try {
      const startStr = startDate;
      const endStr = endDate;

      const res = await fetch(`/api/getyourguide?lat=${lat}&lon=${lon}&radius=${searchRadius}&startStr=${startStr}&endStr=${endStr}`);
      
      if (!res.ok) throw new Error("Errore GetYourGuide");
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        const newEvents: EventData[] = data.results.map((e: any) => {
          let macro = "🌟 Altro";
          if (e.category === "concerts") macro = "🎵 Musica";
          else if (e.category === "performing-arts") macro = "🎭 Arte & Teatro";
          else if (e.category === "sports") macro = "⚽ Sport";
          else if (["festivals", "expos"].includes(e.category)) macro = "🎪 Fiere & Sagre";
          
          return {
            id: `phq-${e.id}`,
            name: e.title,
            description: e.description || "Evento locale da GetYourGuide.",
            date: e.start.split('T')[0],
            venueName: e.entities?.[0]?.name || "Varie location",
            url: "https://www.getyourguide.com/",
            imageUrl: "https://images.unsplash.com/photo-1540039155732-6761b5f1e847?auto=format&fit=crop&q=80&w=400",
            source: "getyourguide" as EventSource,
            lat: e.location?.[1],
            lon: e.location?.[0],
            macroCategory: macro
          };
        });
        
        setSourceResults(prev => {
          const combined = [...prev.getyourguide, ...newEvents];
          const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
          return { ...prev, getyourguide: unique };
        });
      } else {
         setSourceErrors(prev => ({ ...prev, getyourguide: "Nessun evento GetYourGuide trovato." }));
      }
    } catch (err: any) {
      setSourceErrors(prev => ({ ...prev, getyourguide: "Impossibile recuperare eventi GetYourGuide" }));
    } finally {
      setLoadingSources(prev => ({ ...prev, getyourguide: false }));
    }
  };'''

new_load = '''  const loadGetYourGuide = async (lat: number, lon: number, searchRadius: number) => {
    logApiCall('getyourguide', 'ricerca_eventi_api');
    setLoadingSources(prev => ({ ...prev, getyourguide: true }));
    setSourceErrors(prev => ({ ...prev, getyourguide: null }));
    
    try {
      const res = await fetch(`/api/getyourguide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radius: searchRadius, cityName })
      });
      
      if (!res.ok) throw new Error("Errore GetYourGuide");
      const data = await res.json();
      
      if (data && data.length > 0) {
        const newEvents: EventData[] = data.map((e: any) => {
          return {
            id: `gyg-${e.id}`,
            name: e.name,
            description: e.description || "Esperienza GetYourGuide.",
            date: startDate,
            venueName: e.duration || "GetYourGuide",
            url: e.url || "https://www.getyourguide.com/",
            imageUrl: e.imageUrl || "https://images.unsplash.com/photo-1540039155732-6761b5f1e847?auto=format&fit=crop&q=80&w=400",
            source: "getyourguide" as EventSource,
            lat: lat + (Math.random() - 0.5) * 0.01, // jitter if no exact location
            lon: lon + (Math.random() - 0.5) * 0.01,
            macroCategory: "🌟 Altro"
          };
        });
        
        setSourceResults(prev => {
          const combined = [...prev.getyourguide, ...newEvents];
          const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
          return { ...prev, getyourguide: unique };
        });
      } else {
         setSourceErrors(prev => ({ ...prev, getyourguide: "Nessun evento GetYourGuide trovato." }));
      }
    } catch (err: any) {
      setSourceErrors(prev => ({ ...prev, getyourguide: "Impossibile recuperare eventi GetYourGuide" }));
    } finally {
      setLoadingSources(prev => ({ ...prev, getyourguide: false }));
    }
  };'''

content = content.replace(old_load, new_load)

with open('src/components/EventsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("EventsScreen.tsx modified successfully")
