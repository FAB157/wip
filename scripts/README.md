# Script di manutenzione dati

Script una tantum sui POI. Girano da riga di comando con le credenziali di
`.env` / `.env.local` (serve `SUPABASE_SERVICE_ROLE_KEY`).

## Come vengono identificati i POI sulle fonti

Tutto ciò che legge Wikipedia, Wikidata o Commons passa da `lib/wiki.ts`, che
identifica il luogo **partendo dalle sue coordinate** (geosearch attorno al
punto, poi verifica del nome) e non da una ricerca testuale.

La ricerca per testo prendeva il primo risultato senza verifiche: per "Chiesa
di San Giuseppe" o "Museo Civico" restituiva l'omonimo più famoso, magari a
600 km, e i suoi dati finivano nei testi come se fossero di questo POI. Se
tocchi questi script, non tornare indietro su quel metodo.

## Regola sui contenuti: non si inventa

Date, secoli, architetti, artisti ed eventi possono comparire nei testi **solo
se presenti nelle fonti**. Quando un POI non ha fonti verificate si scrive
comunque, ma restando sul contesto reale (territorio, città, tipo di luogo),
senza attribuire all'edificio fatti che nessuno ha verificato. I POI descritti
solo per contesto restano riconoscibili da `enrichment_source =
'agnes_context_only'` e si possono rifare quando compaiono fonti vere.

## Script attivi

| Comando | Che cosa fa |
|---|---|
| `npm run enrich` | Arricchisce i POI mai lavorati (`enriched_at` nullo), regione per regione: testi, teaser, audioguide Nicky/Dante, foto. |
| `npx tsx scripts/wikidata_retro_enrich.ts` | Ripassa i POI già arricchiti e ne riscrive i testi quando trova fonti verificate. Parte in simulazione: serve `--apply`. |
| `npm run fix-photos` | Sostituisce le foto generiche con quelle ufficiali del luogo. Parte in simulazione: serve `--apply`. |

Opzioni utili: `--limit=N`, `--delay=ms`; `fix-photos` accetta anche
`--near=lat,lon,km` e `--probe="lat,lon,nome"` per provare un singolo punto.
`enrich` accetta `--concurrency=N` (default 1) e, per le campagne che lo
richiedono, `--provider=openrouter --model=...` — Agnes resta il predefinito.

## Bonifica del pregresso inventato

I POI arricchiti prima di agosto 2026 con la vecchia regola "INVENTA" portano
date e architetti mai verificati. Il vecchio codice li marcava con
`enrichment_source = 'agnes_free_internal_json'` (nessun testo Wikipedia
trovato), quindi sono individuabili con precisione:

```
npx tsx scripts/wikidata_retro_enrich.ts --redo-invented --limit=50
npx tsx scripts/wikidata_retro_enrich.ts --redo-invented --apply
```

In questa modalità un POI senza fonti **non viene saltato**: viene riscritto
sul solo contesto, perché lasciarlo com'è significherebbe tenersi la scheda
inventata. Le schede così ricostruite restano marcate `agnes_context_only`.

## Script archiviati

`backfill_photos.ts` e `update_poi_photos.ts` sono stati spostati in
`scratch/` con estensione `.disabilitato`. Cercavano le immagini per testo e
prendevano il primo risultato; il primo, se non trovava nulla, salvava una
foto **Unsplash generica** in `photo_url`. Sono la ragione per cui molti POI
hanno una foto che non li ritrae, e rilanciarli disferebbe il lavoro di
`fix-photos`. Usa quello.
