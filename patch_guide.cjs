const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/PremiumGuideModal.tsx');
let content = fs.readFileSync(file, 'utf8');

const funcsToAdd = `
  const [playingPodcast, setPlayingPodcast] = useState(false);

  const handleShareGuide = async () => {
    if (!guideContent) return;
    const shareText = \`Guarda la mia fantastica Guida Premium per \${guideContent.guida_titolo} creata con Italia in Tasca! 🌍📖\`;
    const shareUrl = window.location.href; // O il link generato del PDF se salvato
    if (navigator.share) {
      try {
        await navigator.share({
          title: guideContent.guida_titolo,
          text: shareText,
          url: shareUrl
        });
      } catch (err) {
        console.error("Errore condivisione:", err);
      }
    } else {
      navigator.clipboard.writeText(shareText + " " + shareUrl);
      alert("Link copiato negli appunti!");
    }
  };

  const handlePlayGuidePodcast = async () => {
    if (!guideContent || playingPodcast) return;
    setPlayingPodcast(true);
    try {
      const tappe = guideContent.giorni.flatMap(g => g.pois).map(p => ({ name: p.titolo, description: p.descrizione_lunga }));
      const res = await fetch('/api/generate-daily-podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: guideContent.guida_titolo,
          dayNum: "Intera Guida",
          tappe: tappe.slice(0, 10), // Limit to top 10 for guide podcast
          language: language || 'it'
        })
      });
      const data = await res.json();
      if (data.text) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(data.text);
          utterance.lang = language === 'en' ? 'en-US' : 'it-IT';
          utterance.onend = () => setPlayingPodcast(false);
          utterance.onerror = () => setPlayingPodcast(false);
          window.speechSynthesis.speak(utterance);
        }
      } else {
        setPlayingPodcast(false);
      }
    } catch (e) {
      console.error(e);
      setPlayingPodcast(false);
      alert("Errore podcast");
    }
  };
`;

const insertPos = content.indexOf('const handleDownloadPdf = async () => {');
if (insertPos !== -1) {
    content = content.substring(0, insertPos) + funcsToAdd + "\\n  " + content.substring(insertPos);
}

const buttonsAnchor = `<button
                      onClick={handleRegenerate}`;
const replacementButtons = `
                    <button
                      onClick={() => handleShareGuide()}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title="Condividi Guida"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    </button>
                    <button
                      onClick={handlePlayGuidePodcast}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black shadow-sm hover:bg-primary/20 transition-all"
                    >
                      {playingPodcast ? "In riproduzione" : "🎧 Podcast"}
                    </button>
                    <button
                      onClick={handleRegenerate}`;

content = content.replace(buttonsAnchor, replacementButtons);

fs.writeFileSync(file, content, 'utf8');
console.log("PremiumGuideModal patched successfully.");
