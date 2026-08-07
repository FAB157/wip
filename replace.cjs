const fs = require('fs');
let content = fs.readFileSync('src/components/PoiDetailSheet.tsx', 'utf8');

const regex = /const toggleSpeech = async \(\) => {([\s\S]*?)const regenerateWithGemini = async \(\) => {/;

const replacement = `const playAudioText = async (textToSpeak: string, forceRefresh = false) => {
    if (!textToSpeak) return;

    if (!audioCtxRef.current) {
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
        if (audioPlayerRef.current) {
          const source = audioCtxRef.current.createMediaElementSource(
            audioPlayerRef.current,
          );
          const highpass = audioCtxRef.current.createBiquadFilter();
          highpass.type = "highpass";
          const lowpass = audioCtxRef.current.createBiquadFilter();
          lowpass.type = "lowpass";
          const gain = audioCtxRef.current.createGain();
          source.connect(highpass);
          highpass.connect(lowpass);
          lowpass.connect(gain);
          gain.connect(audioCtxRef.current.destination);
          nodesRef.current = { source, highpass, lowpass, gain };
        }
      } catch (err) {
        console.error("AudioContext error:", err);
      }
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }

    if (
      !forceRefresh &&
      audioPlayerRef.current &&
      audioPlayerRef.current.src.startsWith("blob:")
    ) {
      audioPlayerRef.current.play();
      setIsPlaying(true);
      return;
    }

    setIsPlaying(true);
    try {
      const voice =
        guideMode === "nicky"
          ? "it-IT-ElsaNeural"
          : "it-IT-DiegoNeural";
      const res = await fetch("/api/tts/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voice }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url;
        audioPlayerRef.current.playbackRate = playbackSpeed;

        audioPlayerRef.current.ontimeupdate = () => {
          if (audioPlayerRef.current?.duration) {
            setAudioProgress(
              (audioPlayerRef.current.currentTime /
                audioPlayerRef.current.duration) *
                100,
            );
          }
        };

        audioPlayerRef.current.onended = () => {
          setIsPlaying(false);
          setAudioProgress(100);
          setTimeout(() => setAudioProgress(0), 1000);
        };

        audioPlayerRef.current.play();
      }
    } catch (err) {
      console.warn("TTS fallback activated:", err.message);
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = "it-IT";
        utterance.rate = playbackSpeed;

        utterance.onstart = () => {
          let progress = 0;
          const durationEstimate =
            ((textToSpeak.length / 15) * 1000) / playbackSpeed;
          const interval = setInterval(() => {
            progress += 100 / (durationEstimate / 100);
            if (progress <= 100) setAudioProgress(progress);
          }, 100);

          utterance.onend = () => {
            clearInterval(interval);
            setIsPlaying(false);
            setAudioProgress(100);
            setTimeout(() => setAudioProgress(0), 1000);
          };

          utterance.onerror = () => {
            clearInterval(interval);
            setIsPlaying(false);
            setAudioProgress(0);
          };
        };
        window.speechSynthesis.speak(utterance);
      } else {
        setIsPlaying(false);
      }
    }
  };

  const toggleSpeech = async () => {
    const textToSpeak = generatedText || wikiData?.extract;

    if (isPlaying) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      if (textToSpeak) {
        await playAudioText(textToSpeak, false);
      }
    }
  };

  const regenerateWithGemini = async () => {`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/PoiDetailSheet.tsx', content);
