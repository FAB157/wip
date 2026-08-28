# La chiave di firma dell'app Android

**Se questa chiave si perde, l'app pubblicata non è più aggiornabile.** Non
esiste recupero: Google non la ricrea, e un'app firmata con una chiave diversa
è per lo Store un'app diversa. Chi ha già installato WIP resterebbe con una
versione che non riceve più aggiornamenti, e il nome sullo Store andrebbe
abbandonato. È l'unico file del progetto con questa proprietà: tutto il resto
si può ricostruire dal codice.

## Dove sta

| | |
|---|---|
| Chiave | `C:\KEYS APP ANDROID STUDIO\itainta` (alias `key0`, 2500 byte) |
| Credenziali | `android/keystore.properties` — **gitignorato**, mai committato |
| Copia di sicurezza | `E:\0 BACKUP WIP AGOSTO26\KEYSTORE-FIRMA-APP\` (29/08/2026) |

Impronta SHA-256 del certificato, quella che finisce in
`public/.well-known/assetlinks.json`:

    99:CD:B6:CC:1A:6E:2B:71:52:15:CA:E4:04:2E:26:67:90:E6:AB:FE:3F:0D:5C:66:3A:41:60:67:3B:01:0F:F7

Per rileggerla:

    keytool -list -v -keystore "C:\KEYS APP ANDROID STUDIO\itainta" -alias key0

## Come è usata nella build

`android/app/build.gradle` legge `keystore.properties` **solo se il file
esiste**. Se manca (altra macchina, CI), la build di release non fallisce: usa
la chiave di *debug* e stampa un avviso. Quindi un APK/AAB prodotto altrove
**sembra** buono ma non è pubblicabile. Prima di caricare qualcosa sullo Store,
verifica di aver buildato su questa macchina, o che il keystore sia presente.

## Cosa manca ancora (da fare a mano)

1. **Una copia fuori da questo PC.** Quella su `E:` protegge da un guasto del
   disco C, non da un furto, un incendio o un ransomware che cifra tutti i
   dischi collegati. Serve una copia altrove: un gestore di password che
   accetta allegati, una chiavetta in un cassetto diverso, un archivio cifrato
   nel cloud. Il file è di 2,5 KB.
2. **Le password non sono nel backup in modo sicuro.** `keystore.properties`
   contiene `storePassword` e `keyPassword` in chiaro, ed è stato copiato
   accanto alla chiave: chi trova la cartella ha entrambi i pezzi. Meglio
   tenere le password in un gestore di password e non accanto al file. In più
   store e chiave usano **la stessa password**: cambiarne almeno una riduce il
   danno di una singola fuga.
3. **Valuta Play App Signing.** Se lo attivi, Google conserva la chiave di
   firma vera e la tua diventa solo la chiave di *upload* — che, se persa, si
   sostituisce con una procedura. È la rete di sicurezza contro esattamente lo
   scenario descritto in cima. Attenzione: in quel caso l'impronta SHA-256 da
   mettere in `assetlinks.json` è quella che Google mostra in Play Console,
   non quella qui sopra (vedi `public/.well-known/README.md`).

## Cosa NON fare

- Non committare `keystore.properties` né il file della chiave (il primo è già
  in `.gitignore`, il secondo sta fuori dal repository: teniamoli così).
- Non rigenerare la chiave per «ripartire puliti» dopo la pubblicazione: si
  perde la continuità dell'app.
