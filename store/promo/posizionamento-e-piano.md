# WIP — posizionamento e piano di acquisizione

Scritto il 09/09/2026. Nasce dall'analisi competitiva su Rhyme, Wanderlog,
izi.TRAVEL, Plantrip, Tripomatic, EzyTripz, corretta su due punti dove
sbagliava e completata con la cosa che mancava: la risposta alla domanda
«perché uno dovrebbe scaricare questa e non un'altra».

---

## 1. L'errore da correggere: WIP non è un pianificatore di viaggi

L'analisi confrontava WIP con Wanderlog e Rhyme e chiedeva, tre volte senza
ottenere risposta: *cosa fa la tua app che loro non fanno?*

La domanda non aveva risposta perché era posta nella categoria sbagliata.
Wanderlog e Rhyme si usano **prima** di partire, seduti, per costruire un
itinerario. WIP si usa **mentre** cammini. Non competono: uno prepara la
gita, l'altro ti sta accanto durante la gita.

Il concorrente vero è **izi.TRAVEL**, ed è anche — dice la stessa analisi —
quello con il miglior rapporto rischio/rendimento del tavolo.

| | izi.TRAVEL | WIP |
|---|---|---|
| Cosa fa | audioguida sul posto | audioguida sul posto |
| Copertura | 25.000 tour, 2.500 città | oltre 9 milioni di luoghi, 196 paesi |
| Come nasce un contenuto | un museo lo scrive a mano | lo genera l'AI, su richiesta |
| Dove funziona | dentro i ~3.000 musei aderenti | ovunque ci sia un luogo |
| Costo per aggiungere un luogo | una trattativa | zero |

izi.TRAVEL ha impiegato dieci anni e 15 milioni di euro per arrivare a 2.500
città, perché ogni tour richiede un accordo con un ente. WIP copre 196 paesi
oggi, perché non chiede il permesso a nessuno per raccontare una chiesa.

Questa è la differenza, ed è strutturale: non è una funzione in più, è un
modello di costo diverso.

## 2. La risposta alla domanda

> **Per quale domanda specifica WIP è la risposta giusta?**

*«Sto camminando e vorrei sapere cosa sto guardando, senza fermarmi a
cercare.»*

Il gancio da usare ovunque, in una riga:

> **Metti il telefono in tasca e cammina. Ti racconta lui quello che vedi.**

Regge la prova dei 15 secondi di video: telefono in tasca, schermo spento,
la voce parte da sola davanti al monumento. Non è una promessa astratta, è
una cosa che si filma.

**Cosa dicono gli altri alla stessa domanda:**
- Wanderlog, Rhyme, Plantrip, Tripomatic: niente. Non sono lì con te.
- izi.TRAVEL: «sì, ma solo se sei dentro un museo che ha fatto il tour».
- Google Maps: ti dice il nome, non la storia.

**Tutto verificato nel codice**, non sono claim di marketing:
geofencing nativo Kotlin e Swift che continua a girare a WebView spenta,
audioguida generata dall'AI per luogo/lingua/voce, 7 lingue, pacchetti
offline, Vision (inquadri e te lo racconta), location dei film, gemme
nascoste, community.

## 3. Le tre leve, in ordine di rapporto valore/sforzo

### Leva 1 — Contenuto indicizzabile (la più grande, ed era ferma a zero)

L'analisi ha individuato la mossa vincente di Wanderlog: rendere pubblici i
contenuti e trasformarli in inventario SEO perpetuo, «la mossa che nessuno
degli altri ha replicato bene».

**Verificato il 09/09**: wip.guide non aveva `sitemap.xml`, non aveva
`robots.txt` e nessun URL pubblico oltre la home — ogni indirizzo cadeva
sull'SPA vuota. Per Google il sito era **una pagina sola**. Nel frattempo in
`shared_pois` ci sono milioni di luoghi con descrizione e foto.

Stessa mossa di Wanderlog, ma con un catalogo già scritto invece che
aspettando gli utenti.

Fatto oggi (`server.ts`, `vercel.json`):
- `robots.txt` con sitemap dichiarata
- `sitemap.xml` a indice + sitemap sharded da 5.000 URL
- `/luogo/<nome>-<id>` servita in **HTML vero al primo byte**, con titolo,
  meta description, Open Graph, dati strutturati `TouristAttraction` e la
  chiamata all'azione verso l'app

**Regola di qualità, non di quantità**: non si pubblicano 9,3 milioni di
pagine. Passano solo i luoghi con una descrizione di sostanza (≥180
caratteri) **e** una foto reale. Gli altri rispondono 404 e restano fuori
dalla sitemap. Milioni di pagine sottili sono una penalizzazione, non
traffico — ed è la stessa regola «foto e testi veri» che vale per il resto
del prodotto.

### Leva 2 — Social (già attiva, va solo puntata meglio)

La produzione di spot e fumetti esiste già ed è in mano alla sessione
marketing dedicata. L'unica correzione che serve è il gancio: smettere di
raccontare WIP come «app per organizzare viaggi» (categoria dove ci sono
cinquanta concorrenti e Wanderlog vince) e raccontarla come «la voce che ti
segue mentre cammini» (categoria dove c'è solo izi.TRAVEL, e chiusa dentro i
musei).

### Leva 3 — Enti culturali (lenta, ma nessuno può copiarla)

Un comune o un museo che mette il link a una pagina WIP vale, per
l'autorevolezza del dominio, più di decine di articoli: è un link che non si
può comprare. E il prodotto da offrire esiste già — quello che izi.TRAVEL
vende a 100-1.000 €/mese.

Richiede presenza fisica e pazienza, quindi non è automatizzabile: va decisa
dal committente, non dagli agenti.

## 4. Reddit — sì, ma con un rischio da conoscere

Alta conversione, basso volume: porta duecento utenti veri, non diecimila.

**Il rischio è sul dominio, non sull'account**: Reddit banna `wip.guide` a
livello di sito, su tutti i subreddit, in modo permanente — e da quel momento
non può più menzionarlo nemmeno un utente entusiasta. Gli automoderator
prendono da soli l'account nuovo con poco karma che linka lo stesso dominio
in più subreddit.

Per questo **nessun agente pubblica su Reddit**. È un canale che funziona solo
dall'account personale del committente, con settimane di risposte utili senza
link, e un rapporto di circa una menzione ogni venti commenti. La strada
pulita, che quasi nessuno usa, è scrivere ai moderatori: molti subreddit di
viaggio accettano risorse gratuite nella wiki o nella sidebar.

## 5. Cosa NON si fa

- Nessun account finto, nessuna recensione scritta da noi, nessun commento
  che finge di essere un utente qualsiasi.
- Nessun claim su funzioni che non esistono.
- Mai citare Android Auto (decisione del committente).
- Niente pagine generate a milioni senza contenuto vero.

Non è prudenza morale astratta: su Reddit il camuffamento fa perdere il
dominio, sugli store le recensioni finte fanno rimuovere l'app, e le pagine
sottili fanno perdere il posizionamento. I trucchi costano più di quanto
rendono.

---

**Collegati**: `regole-messaging-marketing` (memoria), `spot-ai-prompts.md`
(stato pubblicazioni social), `settimana1/` (kit contenuti).
