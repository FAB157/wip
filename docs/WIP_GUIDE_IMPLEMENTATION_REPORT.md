# WIP Guide — centro guida `/guida` — report di implementazione (aggiornato 17/11/2026)

Stato: **online** su https://www.wip.guide/guida/ (deploy 1, 2 e 3 lanciati dal committente il 16 e 17/11, verificati su produzione). Il deploy lo lancia sempre il committente (`npm run deploy` dalla root).
`/scopri` (landing di marketing) è intatta: la guida vive sotto `/guida`.

## Come è fatto
- `scripts/guida/contenuti.mjs` — tutto il testo (66 pagine) e le regole di ricerca («Cosa vuoi fare oggi?», «Chiedi a WIP come fare»).
- `scripts/guida/build.mjs` — genera `public/guida/**/index.html`, `indice.json` (ricerca), `sitemap-guida.xml`, `media-mancanti.txt`. Multilingua: italiano in `/guida/`, le altre lingue in `/guida/<lingua>/`.
- `scripts/guida/i18n.mjs` — le 7 lingue dell'app, i testi fissi dell'interfaccia scritti a mano in 7 lingue (`ui()`), `mappaTesti()` che sa quali campi sono testo e quali no.
- `scripts/guida/traduci.mjs <en|fr|es|de|ru|zh|tutte> [--prova]` — traduce ogni frase italiana una volta sola, cache in `scripts/guida/traduzioni/<lingua>.json` (chiave = frase italiana esatta: una frase cambiata si ritraduce da sola, le altre no). Glossario preso dalle traduzioni dell'app (`src/lib/i18n.ts`, `src/lib/traduzioni/*.ts`, ~1.900 voci) perché i tasti abbiano lo stesso nome che si vede sullo schermo. Motori gratuiti (Gemini pool `_1`–`_3`, Groq 1/2/3/5; mai le chiavi dei revisori né quelle on-the-fly); `--gonka` usa Gonka con tetto 3 M token. Si riprende da dove si era fermato.
- **Una lingua si pubblica solo se tradotta ≥ 97%** (`SOGLIA_LINGUA` in build.mjs): mai una pagina «in inglese» piena di italiano. Ogni pagina tradotta ha `hreflang`, selettore lingua in testa e in fondo, avviso «tradotta automaticamente; screenshot e video in italiano», sitemap con le alternate.
- `scripts/guida/controlla.mjs` — link interni, un solo H1, JSON-LD, meta description, immagini/video/audio esistenti.
- Numeri: `public/guida/numeri.json` (da `scratch/guida-numeri.mjs`), `public/guida/verticali.json` (8 cataloghi), aree protette per fonte da `scratch/guida-numeri-aree.mjs`.
- Media: `img/<slug>-<n>` con didascalia in `media.json`; video `video/<slug>.mp4` + `.jpg` + `.vtt`; **esempi veri** in `esempi/` elencati in `esempi.json` (riquadro «Ecco cosa ricevi»).
- Service worker (`vite.config.ts`): le pagine statiche di `public/` (ogni cartella con `index.html` e ogni `*.html`) sono calcolate da sole ed escluse dalla navigazione dell'app e dal precache: chi ha l'app installata apre la guida, non l'app. Collaudo `node scratch/collaudo-sw-esclusioni.mjs`; tutte le pagine statiche: `node scratch/collaudo-pagine-statiche.mjs` (88/88 il 16/11).

## Contenuto (17/11/2026)
- **66 pagine**: 7+1 tutorial principali, Setup, Archivio/download/punti/quiz, come si compra, prezzi e crediti, 12 livelli della mappa, 8 cataloghi verticali, Beni culturali, Famiglie, Utilità, Borghi, Natura, Eventi passo per passo, FAQ, **Tour di gruppo (Live Tour)** (nuova il 17/11).
- **48 immagini reali**, **5 video** con sottotitoli italiani.
- **Esempi veri «Ecco cosa ricevi»** (grande città + centro piccolo):
  · Itinerario: Bruxelles, Rimini (schermata + PDF);
  · Guida d'Autore: Bruxelles, Rimini (PDF + schermate);
  · Podcast del giorno: Bruxelles e Rimini;
  · Audioguida (Nicky): Grand-Place, Domus del Chirurgo + trascrizioni;
  · Guida museo: Duomo di Milano, Luni (PDF + schermate) e **«Ascolta l'opera» con la voce**: la Madonnina e l'Anfiteatro di Luni (MP3 già in cache, `scratch/guida-esempi-museo-voce.mjs`, nessuna spesa).
- **Aree protette nel mondo** (pagina `livello-natura2000`, riscritta il 16/11): 236.172 aree con confini — Agenzia europea dell'ambiente 118.791, Canada 21.666, USA 13.600, Australia 12.058, Nuova Zelanda 6.843, Brasile 3.121, Argentina 506, Russia 459, Cile 124, Taiwan 54, Corea 23, Singapore 7, OpenStreetMap 58.920. Le **specie** del fumetto (GBIF, foto Wikimedia) con il badge della **Lista Rossa IUCN**; le specie a rischio vengono per prime (CR > EN > VU > NT) con la riga «🛡️ N specie a rischio qui». Limiti dichiarati: sono avvistamenti, non un censimento.

## Correzioni all'app fatte lungo la strada (tutte deployate)
- `server.ts` · podcast del giorno senza formule (`podcastSenzaFormule`, anche sulla cache); consiglio «fila» solo con P1174 ≥ 1 milione; borghi gemme non bloccati da `eEntitaAmministrativa`; `robots.txt` e `sitemap-pagine.xml` citano la guida e le pagine statiche.
- `MapArea.tsx` · specie a rischio prima nel fumetto delle aree protette (`mp_specie_a_rischio`, 7 lingue); `mappa.ts` · il livello cita le specie.
- `ProfileScreen.tsx` · Profilo › Centro assistenza: «Guida completa con video ed esempi» (web subito, app native alla prossima build).
- `vite.config.ts` · esclusioni automatiche del service worker.

## Ancora aperto
- **Traduzioni**: inglese in corso con i motori gratuiti (il 16/11 Gonka ha dato solo risposte vuote/502: abbandonato). Poi FR, ES, DE, RU, ZH, una alla volta. Quando una lingua supera il 97%: `build.mjs`, `controlla.mjs`, link del Profilo verso `/guida/<lingua>/`, deploy.
- **Vision** e **audio delle svolte**: servono una registrazione dello schermo dell'iPhone con l'audio (e una foto/Vision fatta dal telefono).
- Numeri per «Tutte le categorie» e «Beni culturali» (`scratch/guida-numeri-categorie.mjs` mai finito per memoria).
- Dati visti e non toccati: riquadro Pantheon senza foto, Sant'Ivo doppione, stringa «Mappa 3D», «Podcast AI (1 giorni)».

## Pubblicare (solo con ordine esplicito)
1. `node scripts/guida/build.mjs` e `node scripts/guida/controlla.mjs` (0 link rotti).
2. `node scratch/verifica-import-server.mjs` e `npm run lint` (tsc: `$env:NODE_OPTIONS='--max-old-space-size=6144'`).
3. `npm run deploy`. I file statici sono serviti prima dei rewrite di `vercel.json`; rollback con `vercel promote`.
