const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/PlanScreen.tsx');
let content = fs.readFileSync(file, 'utf8');

const shareItineraryFunc = `
  const [playingDay, setPlayingDay] = useState<number | null>(null);

  const handleShare = async (type: string, title: string, text: string) => {
    const url = window.location.href;
    const shareText = text + " Scopri di più su Italia in Tasca! 🌍✈️";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url });
      } catch (err) {
        console.error("Errore condivisione:", err);
      }
    } else {
      navigator.clipboard.writeText(shareText + " " + url);
      alert("Link copiato negli appunti! Puoi incollarlo su WhatsApp o Email.");
    }
  };

  const handlePlayDailyPodcast = async (dayNum: number, tappe: any[]) => {
    if (playingDay === dayNum) return; // already playing
    setPlayingDay(dayNum);
    try {
      const res = await fetch('/api/generate-daily-podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: generatedPlan?.titolo || "la tua destinazione",
          dayNum,
          tappe,
          language: language || 'it'
        })
      });
      const data = await res.json();
      if (data.text) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(data.text);
          utterance.lang = language === 'en' ? 'en-US' : 'it-IT';
          utterance.onend = () => setPlayingDay(null);
          utterance.onerror = () => setPlayingDay(null);
          window.speechSynthesis.speak(utterance);
        } else {
          alert("Sintesi vocale non supportata sul tuo browser.");
          setPlayingDay(null);
        }
      } else {
        setPlayingDay(null);
      }
    } catch (e) {
      console.error(e);
      setPlayingDay(null);
      alert("Errore durante la generazione del podcast.");
    }
  };
`;

const anchorFunc = "const savePlanToSupabase = async";
const posFunc = content.indexOf(anchorFunc);
if (posFunc !== -1) {
    content = content.substring(0, posFunc) + shareItineraryFunc + "\\n" + content.substring(posFunc);
}

// Share button for itinerary header
const headerRegex = /<h2 className="text-2xl font-black text-primary leading-tight pr-8">\{generatedPlan\.titolo[^<]+<\/h2>/;
const headerReplacement = `<div className="flex justify-between items-start mb-4">
  <h2 className="text-2xl font-black text-primary leading-tight pr-4 flex-1">{generatedPlan.titolo || \`Itinerario\`}</h2>
  <button onClick={() => handleShare('itinerario', generatedPlan.titolo || 'Itinerario', 'Dai un occhiata a questo fantastico itinerario!')} className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center hover:bg-primary/20 shrink-0">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
  </button>
</div>`;
content = content.replace(headerRegex, headerReplacement);

// Replace the day rendering for the podcast and share buttons
content = content.replace(/<div className="flex items-center gap-4 mb-4 relative z-10">[\s\S]*?<\/div>\s*<\/div>/g, (match) => {
   if (match.includes("tappe previste")) {
       return `<div className="flex justify-between items-center mb-6 relative z-10">
  <div className="flex items-center gap-4">
    <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center">
      <span className="font-black text-secondary text-xl">{gIdx + 1}</span>
    </div>
    <div>
      <h3 className="font-black text-[#1e3a8a] text-lg leading-tight tracking-tight">Giorno {gIdx + 1}</h3>
      <p className="text-xs font-bold text-secondary uppercase tracking-widest">{giorno.tappe?.length || 0} tappe previste</p>
    </div>
  </div>
  <div className="flex gap-2">
    <button 
      onClick={() => handleShare('podcast_itinerario', \`Podcast Giorno \${gIdx + 1}\`, \`Ascolta il podcast del giorno \${gIdx + 1} del mio viaggio!\`)}
      className="p-2 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary/20"
      title="Condividi Podcast"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    </button>
    <button 
      onClick={() => handlePlayDailyPodcast(gIdx + 1, giorno.tappe || [])}
      className="px-3 py-2 bg-primary text-white rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-primary-hover shadow-md transition-all active:scale-95"
    >
      {playingDay === gIdx + 1 ? (
         <>In riproduzione</>
      ) : (
         <><span className="text-base">🎧</span> Podcast</>
      )}
    </button>
  </div>
</div>`;
   }
   return match;
});

fs.writeFileSync(file, content, 'utf8');
console.log("PlanScreen patched successfully.");
