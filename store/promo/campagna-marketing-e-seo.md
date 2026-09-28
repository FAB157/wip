# WIP — campagna di marketing e SEO

Scritta il 09/09/2026. Unisce il piano SEO a 90 giorni e il calendario
editoriale social in una campagna sola, perché sono la stessa cosa vista da
due lati: le pagine pubbliche danno al social un posto vero dove mandare la
gente, e il social dà alle pagine i primi link e le prime visite.

Presuppone `posizionamento-e-piano.md` (chi siamo, contro chi, le tre leve).

---

## In una riga

**Nei prossimi 90 giorni non si aggiunge niente al catalogo pubblicato: si
collega quello che c'è, lo si rende diverso da Wikipedia, si misura quale
categoria funziona davvero e si butta il resto.** Il social alimenta quelle
pagine, non la home.

## Il vincolo che decide tutte le chiamate all'azione

**L'app non è ancora scaricabile.** Verificato oggi: Play Store e App Store
rispondono entrambi 404. Finché è così, ogni contenuto porta a `wip.guide` o
a una pagina luogo, **mai a un badge store**. Non è un ripiego: la PWA
funziona subito, senza installazione, ed è il modo più corto per far provare
il prodotto a chi arriva da una ricerca.

## Da dove si parte, misurato

- **211.000 pagine pubbliche** `/luogo/<slug>~<id>`, in HTML vero al primo
  byte, con titolo, meta description, Open Graph, JSON-LD `TouristAttraction`
  e la lingua vera del testo in `<html lang>`.
- `robots.txt` e `sitemap.xml` a indice, sitemap da 1.000 URL servite dalla
  cache. Search Console verificata, sitemap accettata.
- Copertura mondiale: USA, Norvegia, Paesi Bassi, Messico, Israele, Giappone.
  Il testo di ogni pagina è nella lingua della sua fonte.
- **Dominio nuovo: autorevolezza zero.** È questo, non il catalogo, il collo
  di bottiglia di tutto ciò che segue.

**La regola di ammissione, aggiornata oggi** (vale anche per decidere quale
pagina linkare in un post): soglia di **100 caratteri di testo proprio**, la
foto **non è richiesta**, e sono esclusi i testi compilati — modelli riempiti
con nome e luogo, segnaposto autodichiarati, rifiuti dell'AI. Chi non passa
risponde 200 con `noindex`.

---

# Parte A — SEO, 90 giorni

**Il fatto da tenere in testa per tutti i 90 giorni: oggi le 211.000 pagine
sono orfane.** L'unico modo per raggiungerle è la sitemap, che è un invito,
non un percorso. Un sito nuovo con 211.000 URL tutti a distanza zero link
dalla home è esattamente il profilo che i sistemi anti-spam classificano come
generazione di massa. Le prime azioni servono a togliere WIP da quel profilo.

## Le sette azioni, in ordine di valore su sforzo

### 1. Link interni fra pagine luogo — la più importante, e non è vicina

Ogni pagina chiude con 8-12 link a luoghi veri e vicini (stesso comune, o i
più prossimi), con l'anchor uguale al nome e una riga di contesto. Più un
breadcrumb visibile e in JSON-LD: Paese → regione → città → luogo.

Trasforma 211.000 pagine isolate in un grafo percorribile, e agisce insieme
su scoperta, rilevanza e sul segnale «questo sito è organizzato», che è la
differenza fra un catalogo e una fabbrica di contenuti. Non richiede una riga
di contenuto nuovo.

**Vincolo tecnico non negoziabile**: i vicini vanno precalcolati e messi in
cache **insieme all'HTML**. Nessuna chiamata al database sulla richiesta del
crawler.

*Sforzo*: 2-3 giorni. *Effetto*: decide se in 90 giorni si indicizzano 8.000
pagine o 35.000. Primi segnali in 10-14 giorni.

### 2. Sitemap divise per categoria e paese

Stesso numero di URL, stessa cache: cambiano solo i nomi
(`sitemap-castelli-1.xml`, `sitemap-beni_culturali-12.xml`).

Serve perché in Search Console il rapporto inviate/indicizzate si legge **per
sitemap**. Oggi la risposta a «cosa sta scartando Google» è un numero solo, e
non è una risposta. Va fatto **prima** che i dati si accumulino, non dopo.

*Sforzo*: mezza giornata. *Effetto*: nessuno diretto; abilita ogni decisione
successiva. Dati leggibili dalla settimana 3-4.

### 3. Hub città (`/citta/<slug>`), versione indice

Una pagina per città con almeno 8 luoghi: H1 «Cosa vedere a \<città\>», un
paragrafo breve **derivato dai dati** (quanti luoghi, di quali tipi, il più
noto), la lista divisa per categoria, i link alle città vicine. Niente testo
generato per riempire: se non c'è materiale, la pagina non esiste.

**Si fanno adesso, ma come infrastruttura, non come scommessa sul traffico.**
Come pagine da posizionare sono un investimento mediocre a 90 giorni: «cosa
vedere a Firenze» è presidiata da TripAdvisor e Lonely Planet, e un dominio
nato ieri non la vede. Ma senza hub il grafo interno non ha radice e le
pagine POI restano a profondità infinita. In più si posizionano su varianti
reali e poco contese («castelli in Valle d'Aosta», «cosa vedere a Sarzana»)
che nei mesi 6-12 diventano l'ingresso naturale.

*Sforzo*: 3-4 giorni. *Effetto*: struttura in 2 settimane, traffico dal mese
4 in avanti.

### 4. Rendere le pagine diverse da Wikipedia

Aggiungere i blocchi che Wikipedia non ha e che sono **già** in `shared_pois`:
ingresso e indirizzo dichiarato, orari e contatti, categoria e tema, foto con
attribuzione, luoghi vicini, e un blocco esplicito sull'audioguida — «*Questo
luogo ha un'audioguida in italiano e inglese: si avvia da sola quando ci
arrivi*». Estendere i dati strutturati oltre `TouristAttraction`: `geo`,
`address`, `image` con licenza, `openingHoursSpecification`.

**Il rischio numero uno non è essere ignorati, è essere classificati come
duplicato.** Se il corpo è la prima parte di un articolo di Wikipedia, Google
ha già l'originale e non ha ragione di indicizzare la copia.

Il blocco audioguida è anche il ponte verso il prodotto: una pagina che porta
traffico ma non fa provare l'app non serve a niente. Il gancio, letterale,
sopra la piega: **«Metti il telefono in tasca e cammina. Ti racconta lui
quello che vedi.»**

*Sforzo*: 2 giorni (i dati ci sono, cambia il template). *Effetto*:
misurabile dalla settimana 4-6 come calo di «Scansionata, non indicizzata».

### 5. Backlink veri, a mano

1. **Enti locali**: 20 email a settimana a comuni, pro loco, musei civici,
   parchi. Non un'offerta commerciale: il link alla pagina WIP del *loro*
   monumento, già pronta. Tasso realistico 5-10% → 2-4 link al mese da domini
   istituzionali, che valgono più di cinquanta articoli.
2. **Schede pubbliche legittime**: Product Hunt, AlternativeTo, Slant. Molti
   sono `nofollow`, e va bene: servono per la scoperta.
3. **Moderatori di subreddit di viaggio**, via messaggio, per l'inserimento
   come risorsa gratuita in wiki o sidebar. Zero post, zero commenti.

*Sforzo*: 2-3 ore a settimana, continuative, **non delegabili a un agente**.
*Effetto*: 10-30 domini referenti in 90 giorni. Sembra poco: su un dominio
nuovo è la differenza fra poche centinaia di URL scansionati al giorno e
alcune migliaia.

### 6. Presidiare il tempo di risposta

TTFB delle pagine e delle sitemap sotto ~500 ms al 95° percentile. Il crawl
budget di Google è espresso in **tempo**, non in pagine: un raddoppio del
tempo di risposta dimezza le pagine viste. E il database è condiviso con
l'app in produzione.

*Sforzo*: 1 giorno + controllo settimanale. *Effetto*: immediato e continuo.

### 7. Potatura, non espansione

Al giorno 60, le categorie che le sitemap divise mostrano sotto il 10% di
indicizzazione si **tolgono dalle sitemap**, lasciandole a 200 + `noindex`.
Candidata numero uno: `beni_culturali` — 82.155 pagine, il 39% del totale,
nomi da scheda di catalogo, la domanda di ricerca più bassa dell'insieme, e
la categoria dove il filtro ha già scartato il 33% dei testi come modello.

Ridurre l'inventario a 120-150.000 pagine forti è **un aumento di traffico,
non una rinuncia**: ogni URL a bassa resa sottrae attenzione a uno buono.

Le pagine `noindex` non devono comparire in nessun link interno né in nessuna
sitemap, altrimenti consumano crawl per essere scartate.

*Sforzo*: mezza giornata. *Effetto*: visibile in 3-4 settimane.

## Cosa NON fare, pur sembrando ovvio

- **Non pubblicare altre pagine.** L'istinto sarà passare da 211.000 a
  500.000 perché il catalogo ha oltre 9 milioni di luoghi. Sarebbe l'errore
  peggiore: il collo di bottiglia non è l'inventario, è l'autorevolezza.
- **Non toccare gli URL.** La tilde è stata scelta perché gli id contengono
  trattini. Cambiare schema a metà azzera quanto Google ha imparato e genera
  211.000 redirect.
- **Niente hreflang** (sotto il perché).

## Quante pagine indicizzerà davvero Google in 90 giorni

**Fra 15.000 e 40.000 (7-19%) se le azioni 1-4 sono fatte entro il giorno 30.
Fra 3.000 e 8.000 (1,5-4%) se le pagine restano orfane.**

Un dominio nuovo senza link entranti parte con un crawl budget nell'ordine di
**centinaia di URL al giorno**. Di ciò che scansiona indicizza una frazione:
su un catalogo geografico con testo derivato da Wikipedia, realisticamente
fra il 20% e il 50%, sotto il 10% per le categorie con nomi burocratici.

Da mettere in conto: **le prime 2-4 settimane un dominio nuovo viene
scansionato pochissimo.** È normale, non è un guasto. La curva si impenna
intorno alla settimana 5-8. Chi giudica al giorno 20 conclude che non
funziona, e sbaglia.

Cosa determina la differenza fra 8.000 e 40.000, in ordine di peso:

1. **Pagine orfane o no** (azione 1) — da sola vale un fattore 3-4, e dipende
   interamente da noi.
2. **Esiste domanda per quel nome.** Un castello con un nome proprio si
   indicizza; la scheda «Complesso edilizio — corpo di fabbrica B» non si
   indicizza mai, per quanti link le si diano.
3. **Somiglianza con Wikipedia** (azione 4).
4. **Backlink** (azione 5) — non alzano il tasso per pagina, alzano il budget.
5. **Tempo di risposta** (azione 6) — silenzioso, ma se degrada tronca tutto.

Il filtro qualità introdotto oggi è la ragione principale per cui la stima
non è più bassa: senza, la classificazione probabile dell'intero dominio
sarebbe stata «contenuto generato di scala», e il numero sarebbe vicino a
zero.

**Ma il numero che conta non è questo.** 20.000 pagine indicizzate che fanno
300 click al mese valgono meno di 5.000 che ne fanno 2.000. Al giorno 90 la
domanda giusta è *quante query distinte hanno prodotto almeno un click*.

## Multilingua: cosa fare e cosa non fare per nessun motivo

**Da fare adesso**, costo quasi nullo:

1. **`<html lang>` corretto** — già fatto oggi, ed è il 70% del beneficio
   disponibile.
2. **Canonical auto-referenziale** su ogni pagina.
3. **Coerenza fra lingua del testo e lingua del contorno**: se il corpo è in
   spagnolo, title, breadcrumb e richiamo all'app devono essere in spagnolo.
   Una pagina bilingue confonde il rilevatore e finisce fuori da entrambi i
   mercati. È lavoro di template su stringhe già presenti nell'i18n.

**Da NON fare: niente hreflang, niente versioni tradotte in massa, niente
`/en/luogo/...` costruito sui teaser.**

È aritmetica. I teaser tradotti coprono il 6-18% dei POI e sono 1-2 frasi:
`hreflang` dichiarerebbe che N pagine quasi identiche e quasi vuote sono «la
stessa cosa in lingue diverse». Google le tratta per quello che sono —
**doorway pages** — e il danno non resta sulle pagine tradotte: è una
valutazione di qualità sul dominio, mentre le 211.000 originali stanno ancora
combattendo per essere indicizzate.

Il caso peggiore è il più tentante: generare le traduzioni con l'AI dal
teaser per «coprire il mercato inglese». Si moltiplicherebbero per sette
pagine sottili — il contrario esatto della regola che ha salvato il progetto
oggi.

**Il percorso corretto, dal mese 4-6**: scegliere **2.000-5.000 pagine
soltanto**, quelle che i dati mostreranno già indicizzate e con impressioni, e
tradurne il **testo completo**, non il teaser. Solo su quel sottoinsieme si
mette hreflang, reciproco e verificato.

C'è anche un fatto che rende tutto meno urgente: **le pagine sono già
multilingua di fatto**, perché ognuna è nella lingua del suo paese. Una pagina
su un tempio giapponese scritta in giapponese è già la versione giusta per chi
la cercherà. Il buco vero non è «manca l'inglese», è «manca l'italiano sui
luoghi esteri» — e quello è un problema di prodotto per il turista italiano,
non di SEO.

## Metriche settimanali in Search Console

Una lettura fissa a settimana, stesso giorno. Giorni contati dal giorno 1.

**Indicizzazione → Pagine**

| Metrica | Funziona | È rotto |
|---|---|---|
| Pagine indicizzate | ≥ +15% a settimana dalla settimana 4 | piatta 3 settimane di fila dopo la 5ª |
| «Rilevata, non indicizzata» | grande: normale con 211.000 URL | cresce mentre le indicizzate sono ferme → crawl saturo: fermare le pubblicazioni |
| «Scansionata, non indicizzata» | < 40% | > 60%: Google guarda e scarta → problema di contenuto (azione 4) |
| «Duplicata, canonica diversa» | < 5% | > 15%: allarme rosso, siamo la copia di Wikipedia |
| 404 / redirect | ≈ 0 | qualunque numero non banale = sitemap disallineata dalle pagine |

**Sitemap** (per singola, dopo l'azione 2)

| Metrica | Funziona | È rotto |
|---|---|---|
| indicizzate / inviate per categoria | ≥ 25% al giorno 60 sulle forti | < 5% al giorno 60 → si toglie dalla sitemap |
| Stato | «Riuscito» | «Impossibile recuperare» anche una volta: la cache non ha risposto |

**Statistiche di scansione**

| Metrica | Funziona | È rotto |
|---|---|---|
| Richieste/giorno | ≥ 2.000 entro il giorno 45 | < 300 al giorno 45 → il sito è invisibile: mancano link |
| Tempo medio di risposta | < 500 ms | > 1.000 ms → il crawl si dimezza da solo |
| % risposte 200 | > 95% | picchi di 5xx: Googlebot sta arrivando al database — **mette a rischio l'app** |

**Rendimento** — la sezione che conta

| Metrica | Funziona | È rotto |
|---|---|---|
| Impressioni | prime entro il giorno 21; ≥ 5.000/settimana al giorno 90 | zero al giorno 30 con pagine indicizzate → indicizzate ma irrilevanti |
| **Query distinte con ≥1 click** | ≥ 100 al giorno 90 | < 10 al giorno 90: è la metrica che dice se il progetto ha senso |
| Click | primi entro il giorno 35-45; ≥ 300/settimana al giorno 90 | impressioni che crescono e click fermi → title e description non invogliano |
| CTR | 1-3% è normale su coda lunga | < 0,3% con posizione < 15: appare bene ma lo snippet respinge |

**Il rapporto da guardare più di ogni altro**: *impressioni ÷ pagine
indicizzate*. Se le pagine raddoppiano e le impressioni no, stiamo
indicizzando spazzatura e la potatura va anticipata.

## I tre errori più probabili

**1. Rispondere alla lentezza pubblicando altre pagine.** Al giorno 30 le
pagine indicizzate saranno poche migliaia e l'istinto dirà che serve più
inventario. È il collo di bottiglia sbagliato. *Sintomo*: «Rilevata, non
indicizzata» che cresce più in fretta delle indicizzate per due settimane.
*Regola*: il numero di URL in sitemap può solo scendere fino al giorno 90.

**2. Essere la copia di Wikipedia senza accorgersene.** Insidioso perché le
pagine risultano scansionate e senza errori: sembra tutto a posto, solo non
compaiono mai. *Sintomi*: «Duplicata» sopra il 10-15%, e pagine indicizzate a
zero impressioni per settimane. *Controprova a mano*: cercare su Google una
frase esatta di 8-10 parole del corpo, fra virgolette. Se esce Wikipedia e non
esce WIP, è confermato.

**3. Far arrivare Googlebot al database.** Nasce da un blocco utile letto dal
vivo: in sviluppo funziona, poi il crawl arriva a decine di richieste al
secondo. È l'unico dei tre che non fa perdere posizionamento — **fa cadere il
servizio**, ed è già successo in questo progetto. *Sintomo*: qualunque 5xx
nelle statistiche di scansione. *Regola senza eccezioni*: se un dato non è
precalcolabile, non va sulla pagina pubblica.

## Calendario SEO

| Giorni | Cosa |
|---|---|
| 1-14 | Sitemap divise → link interni + breadcrumb → baseline TTFB. I backlink partono subito e non si fermano più. |
| 15-30 | Hub città → blocchi propri, dati strutturati estesi, coerenza di lingua. Prima lettura seria alla settimana 4. |
| 31-60 | **Nessuna pubblicazione nuova.** Al giorno 45, riscrittura mirata sulle 500-1.000 pagine con impressioni e senza click. |
| 61-90 | Potatura sotto il 10%. Bilancio al giorno 90 su *query distinte con click*. Decisione sul multilingua selettivo. |

---

# Parte B — Social, 4 settimane

Cadenza: **3 uscite video + 1 testuale a settimana** — ~12 video in 4
settimane, il ritmo che il team ha già dimostrato di reggere. Ogni settimana
almeno un'uscita punta a una pagina luogo reale, non alla home.

## I canali, e le esclusioni

1. **YouTube Shorts — il motore.** È l'unico dove pubblichiamo senza attrito
   e dove **titolo e descrizione sono indicizzabili**: uno Short «Cosa vedere
   a Roma in un giorno» porta visite fra sei mesi, un reel no. È anche
   l'unico dove il link a una pagina luogo è atteso e non penalizzato.
2. **Facebook — secondo, per una ragione demografica.** Il pubblico è chi
   viaggia con i figli o in pensione, cioè chi un'audioguida la pagherebbe. Ed
   è **l'unico canale dove il link nel post funziona davvero**. Costo
   aggiuntivo quasi zero: i video sono già montati.
3. **TikTok — stato da accertare prima di contarci.** La prima stesura lo
   dava «in revisione»: non è verificato. La sessione marketing non ha mai
   tentato un caricamento, quindi non sappiamo se l'account sia utilizzabile.
   Finché non lo sappiamo TikTok **non compare nel calendario**: si fa una
   prova di caricamento con un video già pubblicato altrove, e a seconda
   dell'esito diventa un canale vero o un deposito.
4. **Instagram — 2 uscite a settimana, non di più.** Il caricamento non è
   automatizzabile: serve fisicamente il telefono. Se in una settimana non ci
   sono 10 minuti, si salta senza rimpianti.

**Esclusi, con la ragione**:
- **Reddit** — per gli agenti è escluso e basta: il ban colpisce il
  **dominio**, permanentemente, su tutti i subreddit, e da lì non può
  linkarlo nemmeno un utente entusiasta. Resta canale personale del
  committente, senza link.
- **X/Twitter** — pubblico di viaggio residuo e portata organica nulla per un
  account nuovo.
- **LinkedIn** — ha senso solo per la leva «enti culturali», che è una
  decisione del committente. Rimandato.
- **Pinterest** — rimandato, ma è il primo candidato al reintegro: è l'unico
  canale dove le 211.000 pagine potrebbero diventare inventario visivo
  perpetuo. Prima va verificato che le foto siano ripubblicabili.

## Il calendario

### Settimana 1 (10-16 set) — «Il posto parla da solo»
La dimostrazione nuda del gancio. Nessuna funzione, nessun elenco: solo la
voce che parte mentre cammini. È la settimana da cui si riparte quando un
video non sa cosa dire.

**Ordine rifatto il 09/09 sera, per un vincolo vero: la quota Veo è
esaurita.** Gli spot generati non sono producibili finché non si libera,
quindi in testa vanno i contenuti **girabili col telefono**, che per di più
sono i più convincenti (si vede il prodotto funzionare) e i più economici.
Gli spot generati rientrano appena la quota torna, senza cambiare i temi.

Precedenza assoluta su tutto: **rifare l'audio inglese dello spot di Mosca**,
uscito a sottotitoli invece che con dialogo parlato e bocciato dal
committente. È un difetto su un pezzo già pubblicato, non un contenuto nuovo.

| Giorno | Canale | Formato | Gancio | CTA |
|---|---|---|---|---|
| Gio 11 | YT IT+EN · FB | Schermo reale, 15s, **zero AI** | **Telefono in tasca, schermo spento, e parla lo stesso** — una ripresa sola | wip.guide |
| Sab 13 | YT IT+EN · FB · IG | Fumetto #11, Nic + mamma, 5 tavole | **Barcellona, Sagrada Família** — «perché non è finita?» risposto in fila | wip.guide |
| Lun 15 | YT IT+EN · FB | Registrazione schermo, 15s, **zero AI** | **Scrivi il nome del tuo paese** — esce la pagina con storia e audioguida | pagina luogo |
| Mar 16 | FB testo + 1 foto vera | Post scritto | **Ci passi davanti da dieci anni e non sai cos'è** | pagina luogo |
| *appena torna Veo* | YT IT+EN · FB | Spot 18s, dialogo parlato vero | **Istanbul, Basilica Cisterna** — scende le scale, il telefono in tasca parte da solo: 336 colonne prese da altri templi | pagina luogo |

### Settimana 2 (17-23 set) — «Quello che nessuno ti dice»
I fatti veri e verificabili: il tema più forte che abbiamo, già validato da
Pisa e Mosca. **Il fatto va verificato prima di girare**, mai inventato per la
battuta.

| Giorno | Canale | Formato | Gancio | CTA |
|---|---|---|---|---|
| Gio 18 | YT IT+EN · FB · TikTok | Spot 18s | **Londra, Tower Bridge** — non è il London Bridge, e chi lo compra sbagliando ci mette anni ad accorgersene | pagina luogo |
| Sab 20 | YT IT+EN · FB · IG | Fumetto #12 | **Roma, Pantheon** — piove dentro, e il pavimento ha 22 fori per l'acqua | wip.guide |
| Lun 22 | YT IT+EN · FB · TikTok | Spot 15s | **New York, Grand Central** — la galleria dei sussurri | pagina luogo |
| Mar 23 | FB testo | Post scritto | **Tre cose che il cartello non ti dice** | le tre pagine |

### Settimana 3 (24-30 set) — «Dove gli altri non arrivano»
La copertura: l'unico argomento su cui izi.TRAVEL non può rispondere. **Non
si nomina mai il concorrente: si mostra il vuoto.**

| Giorno | Canale | Formato | Gancio | CTA |
|---|---|---|---|---|
| Gio 25 | YT IT+EN · FB · TikTok | Spot 18s | **Un sentiero senza campo** — nessun museo, nessun cartello, nessuna rete: parla lo stesso, offline | «Scaricalo prima di partire» |
| Sab 27 | YT IT+EN · FB · IG | Fumetto #13 | **Il paese di 800 abitanti** — niente museo, niente guida, una chiesa del 1200: e ha una pagina | wip.guide |
| Lun 29 | YT IT+EN · FB · TikTok | Schermo reale, 15s | **Scrivi il nome del tuo paese** | «Provaci col tuo» |
| Mar 30 | FB testo | Post scritto | **196 paesi. Anche il tuo.** | ricerca |

### Settimana 4 (1-7 ott) — «Non sei solo un turista»
Chi usa WIP **dove abita**. È il segmento che nessuno serve (izi.TRAVEL è
chiuso nei musei, Wanderlog è pre-viaggio), l'unico che genera uso quotidiano
invece di una settimana all'anno, e il tema che regge d'inverno.

| Giorno | Canale | Formato | Gancio | CTA |
|---|---|---|---|---|
| Gio 2 | YT IT+EN · FB · TikTok | Spot 18s | **Il pendolare** — stessa strada da dieci anni, un giorno scopre cos'è quel palazzo | wip.guide |
| Sab 4 | YT IT+EN · FB · IG | Fumetto #14 | **La domenica senza idee** — «dove andiamo?» risolto a due chilometri da casa | wip.guide |
| Lun 6 | YT IT+EN · FB · TikTok | Spot 15s | **Vision** — inquadri un palazzo e te lo racconta | wip.guide |
| Mar 7 | FB + YT Community | Post scritto | **Bilancio del mese** — il luogo più visitato fra le pagine pubbliche | quella pagina |

## Dieci idee girabili domani, con un telefono

Ognuna passa la prova dei 15 secondi: si vede subito cosa succede.

1. **Lo schermo che si spegne.** Una ripresa sola: dito sul tasto di blocco,
   schermo nero, dieci passi, l'audio parte. La dimostrazione più difficile da
   contestare che abbiamo, e non l'abbiamo mai girata nuda.
2. **Il telefono va in tasca.** Traduzione letterale del gancio. 12 secondi.
3. **Digita il tuo paese.** Registrazione schermo: un comune piccolo nella
   barra, esce la pagina con foto vera. Funziona perché lo spettatore pensa
   subito al proprio.
4. **La modalità aereo.** Si attiva davanti alla camera, poi la voce parte lo
   stesso. L'offline in un gesto, senza una parola.
5. **Il cartello contro l'audioguida.** Il cartello turistico (due righe di
   nulla), poi cosa dice WIP dello stesso posto.
6. **Il fatto in 10 secondi.** Un solo fatto vero sopra la ripresa del posto:
   la formula già validata, da replicare su un fatto nuovo a settimana.
7. **Nicky risponde al «perché».** Un bambino chiede, la risposta arriva
   dall'auricolare. La scena è la domanda.
8. **La deviazione.** Si cammina verso una meta, il telefono segnala qualcosa
   a cinquanta metri, si svolta. Una svolta filmata convince più di ogni
   schermata di mappa.
9. **Inquadra e te lo racconta (Vision).** Mai fatto in video reale, solo a
   fumetti: il contenuto più «magico» in canna.
10. **Sette lingue, una passeggiata.** Stessa inquadratura, l'audio cambia
    lingua ogni tre secondi. Si monta in dieci minuti dai file che già
    produciamo.

## Come usare le 211.000 pagine senza fare spam

**Una pagina si linka solo quando è la risposta a una curiosità appena creata
dal video.** Il link non è pubblicità: è il seguito. Se il video non ha
creato una domanda, non c'è niente da linkare e si mette la home.

- **Una pagina per uscita, mai una lista.** Dieci link sono un elenco di
  risultati; un link è un consiglio.
- **La descrizione YouTube è il posto giusto**: lì il link è atteso e
  indicizzato. Riga uno la curiosità, riga due il link.
- **Il luogo del video e quello della pagina devono coincidere.** Vale la
  stessa regola del prodotto: nessuna pagina è meglio della pagina sbagliata.
- **Su Facebook si linka solo la pagina.** L'anteprima fa già il lavoro;
  aggiungere «scarica l'app» la trasforma in inserzione.
- **I luoghi minori valgono più di quelli iconici.** Nessuno cerca «Colosseo»
  e trova noi; la chiesa del paese di 800 abitanti la cerca solo chi ci abita,
  e la trova. «Cerca il tuo comune» è più efficace di venti post sul Colosseo.
- **Mai linkare una pagina senza averla aperta.** Il filtro tecnico esiste, ma
  dieci secondi di controllo prevengono l'unico errore imperdonabile: mandare
  qualcuno su una pagina vuota.

## Come si capisce in 4 settimane se funziona

Il pubblico è quasi da zero: **le metriche non sono i follower**, che si
muovono troppo lentamente per decidere qualcosa in un mese.

| Metrica | Perché | Soglia a 4 settimane |
|---|---|---|
| **Clic verso wip.guide dai social** | l'unica che dice se il messaggio converte, non se piace | **300 sessioni** da YT+FB su ~12 video. Sotto 100: è il messaggio, non la distribuzione |
| **% visualizzazione completa Shorts** | dice se i primi 3 secondi funzionano | media **sopra il 45%**. Sotto il 30% su metà dei video: il gancio arriva troppo tardi |
| **Impression per video a 14 giorni** | separa i video mostrati da quelli ignorati | almeno **3 su 12 sopra 2.000**. Se nessuno ci arriva: i titoli non intercettano nessuna ricerca |

**Se a fine settimana 4 siamo sotto tutte e tre**, il problema non è la
frequenza e non si risolve pubblicando di più. Due mosse, in ordine:

1. **Fermare i fumetti e tenere i video reali.** Costano di più (5 tavole,
   montaggio, sette lingue) e sono l'unico formato dove non si vede mai il
   prodotto funzionare. Se non convertono, sono un investimento in
   un'estetica.
2. **Spostare l'energia sulle pagine pubbliche.** Duecentomila pagine che
   crescono da sole valgono più di tre video a settimana che nessuno vede.

**Un segnale positivo da riconoscere anche se le soglie non passano**: se una
singola pagina luogo comincia a ricevere traffico da Google, quella è la
strada, e il social diventa il canale che la alimenta invece del contrario.

---

## Cosa non si fa mai

- Nessun account finto, nessuna recensione scritta da noi, nessun commento
  che finge di essere un utente qualsiasi.
- Nessun agente pubblica su Reddit.
- Mai citare Android Auto.
- Claim veri: «oltre 9 milioni di luoghi», mai «10 milioni». Mai promettere
  funzioni che non esistono.
- Nessuna foto generica al posto di un luogo reale.
- Niente pagine generate in massa senza contenuto vero.

Non è prudenza astratta: su Reddit il camuffamento fa perdere il dominio,
sugli store le recensioni finte fanno rimuovere l'app, e le pagine sottili
fanno perdere il posizionamento. I trucchi costano più di quanto rendono.

---

**Collegati**: `posizionamento-e-piano.md`, `spot-ai-prompts.md` (stato
pubblicazioni), `regole-messaging-marketing` (memoria).
