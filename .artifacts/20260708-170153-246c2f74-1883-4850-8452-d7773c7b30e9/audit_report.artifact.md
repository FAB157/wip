# Rapporto di Audit Tecnico e Compliance - ItaInta

Come Senior Developer e Compliance Expert, ho analizzato l'applicazione ItaInta. Di seguito il piano di test "maniacale" e i risultati dell'audit preliminare.

---

## 1. ARCHITETTURA E STABILITÀ (Developer Perspective)

### Checklist Tecnica Passo-Passo
- [ ] **Test di Rotazione (Configuration Change):** Apri l'app sulla mappa, ruota il dispositivo. La mappa mantiene il centro e lo zoom? (Verifica: `onSaveInstanceState`).
- [ ] **Background Stress Test:** Avvia l'audioguida, apri altre 5 app pesanti (Camera, YouTube, Maps). Android uccide il servizio?
    - *Stato:* Abbiamo implementato `START_STICKY` e Notifica Foreground per prevenire la chiusura.
- [ ] **Offline Resilience:** Disattiva il Wi-Fi/Dati. Prova a caricare un itinerario salvato. L'app mostra un errore grazioso o crasha?
- [ ] **Memory Leak Inspection:** Usa *Android Studio Profiler*.
    - *Focus:* Verifica che dopo aver chiuso il `ProfileScreen`, la memoria dedicata alle immagini non rimanga allocata.

### Automazione (ADB & JUnit)
Per testare i Geofence senza camminare per chilometri:
```bash
# Simula spostamento verso un POI (Lat: 44.05, Lon: 10.04)
adb shell geo fix 10.04 44.05
# Forza la chiusura del sistema per testare il ripristino del servizio
adb shell am force-stop com.itaintasca.app
```

---

## 2. UX/UI E DESIGN SYSTEM (Designer Perspective)

### Punti di Controllo Layout Inspector
- **Touch Targets:** Seleziona i pulsanti della `BottomNav`. Assicurati che l'area cliccabile sia almeno **48x48dp** (spesso l'icona è piccola, ma il contenitore deve essere grande).
- **Gerarchia dei Colori:** In Dark Mode, verifica che il contrasto del testo secondario (grigio su nero) sia leggibile (Rapporto > 4.5:1).
- **Stati di Caricamento:**
    - [ ] Verifica che `SkeletonLoader.tsx` appaia istantaneamente durante il fetch da Supabase.
    - [ ] Verifica che il pulsante "Riscatta Premi" diventi `Disabled` con uno spinner dopo il click.

### Accessibilità
- [ ] Esegui **Accessibility Scanner** (App di Google).
- [ ] Controlla i `contentDescription` su `AttractionImage.tsx` (non deve dire "immagine", ma descrivere il monumento o la categoria).

---

## 3. GOOGLE PLAY COMPLIANCE (Expert Perspective)

### Checklist di Pubblicazione
- [x] **Data Safety:** Abbiamo aggiunto il pulsante "Elimina Account". È fondamentale dichiararlo nel modulo Data Safety della console.
- [x] **Background Location:** Abbiamo creato il `PermissionsModal` con la **Prominent Disclosure**.
    - *Nota:* Google richiederà un video in cui mostri questo popup specifico.
- [ ] **Target SDK 34/35:** Verificare nel `build.gradle` che `targetSdkVersion` sia almeno 34.
- [x] **Privacy Policy:** Creata e integrata nell'app. Deve essere identica a quella caricata sulla console.

---

## Strategia di Test Suggerita

| Macro-Blocco | Strumento Consigliato | Cosa cercare |
| :--- | :--- | :--- |
| **Performance** | Android Studio Profiler | Picchi di CPU durante il Text-to-Speech. |
| **UX/UI** | Layout Inspector | Sovrapposizioni di componenti su schermi piccoli (es. iPhone SE / Pixel 4a). |
| **Compliance** | Play Console Pre-launch Report | Errori di compatibilità su dispositivi rari. |

### Esempio Test d'Integrazione (Espresso)
```kotlin
@Test
fun checkPrivacyTabIsReachable() {
    onView(withId(R.id.profile_icon)).perform(click())
    onView(withText("PRIVACY")).perform(click())
    onView(withText("Privacy Policy")).check(matches(isDisplayed()))
}
```

---

### Verdetto Preliminare
L'app è tecnicamente solida. Le recenti correzioni sui **Memory Leak** e sul **Filtraggio Categorie** hanno risolto le criticità principali. La sfida maggiore sarà la revisione umana di Google per la posizione in background: la chiave è il video dimostrativo che caricherai.
