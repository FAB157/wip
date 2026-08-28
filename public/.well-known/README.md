# Associazione dominio ↔ app (App Links e Universal Links)

Questi due file dicono ad Android e a iOS che `wip.guide` e l'app sono la
stessa cosa. Servono a una cosa concreta: quando Supabase manda la mail di
**conferma registrazione** o di **reset password**, il link deve riaprire
l'app invece del browser. Senza, chi si registra dal telefono finisce su una
pagina web e resta lì — ed è il primo percorso che vive anche chi recensisce
l'app per gli store.

Vanno serviti da `https://wip.guide/.well-known/…` con `Content-Type:
application/json`, senza redirect e senza autenticazione (li scarica il
sistema operativo, non il browser dell'utente).

---

## `assetlinks.json` (Android) — COMPILATO

L'impronta presente è quella del keystore di release del progetto
(`C:\KEYS APP ANDROID STUDIO\itainta`, alias `key0`), estratta il 29/08/2026:

    99:CD:B6:CC:1A:6E:2B:71:52:15:CA:E4:04:2E:26:67:90:E6:AB:FE:3F:0D:5C:66:3A:41:60:67:3B:01:0F:F7

Per rileggerla:

    keytool -list -v -keystore "C:\KEYS APP ANDROID STUDIO\itainta" -alias key0

### ATTENZIONE, se attivi Play App Signing

Google Play, per impostazione predefinita, **rifirma l'app con una propria
chiave**: quella locale diventa solo la chiave di *upload*. In quel caso
l'impronta qui sopra è **sbagliata** e i link non verranno verificati.

L'impronta giusta la trovi in Play Console →
**Release → Configurazione → Integrità dell'app → Certificato della chiave di
firma dell'app → SHA-256**. Va sostituita a quella attuale (o aggiunta
accanto: il campo è un array e accettarne due è legittimo — utile proprio nel
periodo di transizione).

Verifica dopo il deploy:
https://developers.google.com/digital-asset-links/tools/generator

---

## `apple-app-site-association` (iOS) — INCOMPLETO

Manca il **Team ID** Apple: nel file c'è ancora il segnaposto `TEAMID`.
Il valore è una stringa di 10 caratteri che si legge in
developer.apple.com → **Membership details → Team ID**.

`appID` si scrive come `<TeamID>.<bundle id>`, quindi diventerà:

    ABCDE12345.com.itaintasca.app

Il file **non deve avere estensione** `.json` e va servito come
`application/json`.

### Non basta il file: serve anche l'entitlement

Perché iOS lo legga, il target Xcode deve dichiarare il dominio associato:

1. Xcode → target **App** → Signing & Capabilities → **+ Capability** →
   *Associated Domains*
2. aggiungere: `applinks:wip.guide` e `applinks:www.wip.guide`

Senza questo passaggio gli Universal Links non funzionano, anche con il file
corretto online.

Verifica dopo il deploy:
https://search.developer.apple.com/appsearch-validation-tool/
