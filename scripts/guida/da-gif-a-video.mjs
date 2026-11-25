// Converte una registrazione GIF (fatta in Chrome sul sito vero) in un video per il centro guida:
//   public/guida/video/<slug>.mp4  (H.264, leggero, avvio rapido)
//   public/guida/video/<slug>.jpg  (copertina = ultimo fotogramma, il risultato)
//   public/guida/video/<slug>.vtt  (sottotitoli italiani: una frase per passo, tempi divisi in parti uguali)
// Uso: node scripts/guida/da-gif-a-video.mjs <file.gif> <slug> "Passo 1|Passo 2|Passo 3"
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const [gif, slug, frasi = ''] = process.argv.slice(2);
if (!gif || !slug) { console.error('Uso: node scripts/guida/da-gif-a-video.mjs <file.gif> <slug> "frase|frase"'); process.exit(1); }
const FF = process.env.FFMPEG || 'C:\\Users\\HP\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffmpeg.exe';
const FP = FF.replace(/ffmpeg\.exe$/i, 'ffprobe.exe');
const out = path.join('public', 'guida', 'video');
fs.mkdirSync(out, { recursive: true });
const mp4 = path.join(out, `${slug}.mp4`), jpg = path.join(out, `${slug}.jpg`), vtt = path.join(out, `${slug}.vtt`);

// Ogni fotogramma della GIF dura almeno 2 s (la registrazione è a scatti: si deve poter leggere).
execFileSync(FF, ['-y', '-loglevel', 'error', '-i', gif, '-vf', "fps=1,setpts=2.2*PTS,scale='min(1280,iw)':-2:flags=lanczos,format=yuv420p", '-r', '15', '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-crf', '26', '-movflags', '+faststart', '-an', mp4]);
const durata = Number(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mp4]).toString().trim()) || 10;
execFileSync(FF, ['-y', '-loglevel', 'error', '-sseof', '-0.5', '-i', mp4, '-frames:v', '1', '-q:v', '4', jpg]);

const passi = frasi.split('|').map(s => s.trim()).filter(Boolean);
if (passi.length) {
  const t = s => { const h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor(s % 3600 / 60)).padStart(2, '0'), x = (s % 60).toFixed(3).padStart(6, '0'); return `${h}:${m}:${x}`; };
  const passo = durata / passi.length;
  fs.writeFileSync(vtt, 'WEBVTT\n\n' + passi.map((p, i) => `${i + 1}\n${t(i * passo)} --> ${t((i + 1) * passo)}\n${p}\n`).join('\n'));
}
const kb = Math.round(fs.statSync(mp4).size / 1024);
console.log(`${mp4} · ${durata.toFixed(1)} s · ${kb} KB · copertina ${jpg}${passi.length ? ` · sottotitoli ${passi.length} frasi` : ''}`);
