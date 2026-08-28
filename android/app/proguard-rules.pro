# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Stack trace leggibili in produzione. Costano pochi KB sull'APK e senza di
# esse ogni crash di release arriva come "Unknown Source" senza numero di riga:
# un ANR o una NPE nel Service di geofencing diventa impossibile da localizzare.
# renamesourcefileattribute nasconde comunque il nome del file sorgente reale.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ──────────────────────────────────────────────────────────────────────────
# minifyEnabled/shrinkResources abilitati (build.gradle, hardening release):
# regole aggiunte per le librerie che usano reflection o round-trip JSON e
# che altrimenti si romperebbero SILENZIOSAMENTE sotto R8 (nomi di campo/
# metodo rinominati, classi rimosse perché "mai referenziate" da codice Kotlin
# ma in realtà chiamate via reflection dal bridge Capacitor o da Gson).
# ──────────────────────────────────────────────────────────────────────────

# ── Gson (regole ufficiali del progetto Gson) ──
# Usato in SupabaseClient.parsePoiList (TypeToken<List<Map<String,Any>>>) e in
# ItaintaBackgroundPoiService per il round-trip di PoiEntity verso il plugin
# Capacitor (syncManualSelection / sendEventToPlugin("poisDownloaded", ...)):
# senza queste attribute R8 rimuove le info generiche necessarie a TypeToken.
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses
-dontwarn sun.misc.**
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}
-keep,allowobfuscation,allowshrinking class com.google.gson.reflect.TypeToken
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.reflect.TypeToken

# Entity Room passate per Gson: nessuna @SerializedName in uso, quindi i nomi
# dei campi DEVONO restare identici alle chiavi JSON scambiate col JS
# (id, nome, lat, lon, poiType, ...) e al payload di syncManualSelection.
-keep class com.itaintasca.app.db.** { *; }

# ── Room ──
# Le entity sono referenziate da codice generato in compilazione (kapt), non
# via reflection a runtime: R8 le traccia dagli entry point. Le regole sopra
# su db.** coprono comunque anche questo caso.
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
# Room istanzia la sottoclasse generata (AppDatabase_Impl) via
# Class.forName(nomeDellaClasse + "_Impl"): se R8 rinomina o rimuove la classe
# astratta @Database, Room.databaseBuilder fallisce a runtime con
# "cannot find implementation for ...AppDatabase" — e il Service di geofencing
# in background non parte affatto, solo in release.
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Database class * { *; }
# I DAO sono interfacce/classi astratte la cui implementazione e' generata:
# vanno tenute insieme ai loro metodi.
-keep @androidx.room.Dao class * { *; }
-keep class androidx.room.RoomDatabase { *; }
-dontwarn androidx.room.**

# ── androidx.media3 (ExoPlayer + MediaSession) ──
# WipBackgroundAudioService usa media3. La libreria referenzia in modo
# opzionale moduli non inclusi (IMA, Cast, decoder extension): senza dontwarn
# R8 puo' interrompere la build della release con warning su classi mancanti.
-dontwarn androidx.media3.**

# ── Android Auto / androidx.car.app ──
# I template (Screen, ListTemplate, ItemList, Action...) NON sono usati
# direttamente dalla nostra app: sono serializzati e deserializzati per
# REFLECTION dall'host Android Auto attraverso il bundler della libreria
# (androidx.car.app.serialization). R8 non vede quelle chiamate, quindi
# rinomina campi e classi e l'host non riesce piu' a ricostruire i template:
# risultato, Android Auto crasha o mostra schermo vuoto SOLO in release.
# Sono le regole consumer raccomandate dalla libreria.
-keep class androidx.car.app.** { *; }
-keep interface androidx.car.app.** { *; }
-dontwarn androidx.car.app.**
# I nostri CarAppService/Session/Screen sono istanziati per nome dall'host
# tramite il manifest: vanno tenuti con i costruttori.
-keep class * extends androidx.car.app.CarAppService { *; }
-keep class * extends androidx.car.app.Session { *; }
-keep class * extends androidx.car.app.Screen { *; }

# ── RevenueCat (revenuecat-purchases-capacitor) ──
# L'SDK serializza/deserializza con Gson e kotlinx e usa reflection sui
# modelli di acquisto (Package, StoreProduct, CustomerInfo, EntitlementInfo,
# Offering...). Se R8 rinomina i campi, le risposte del backend RevenueCat e
# di Play Billing non si mappano piu': i crediti acquistati non arrivano
# all'utente e l'acquisto sembra fallito — bug che esiste solo in release.
-keep class com.revenuecat.purchases.** { *; }
-keep interface com.revenuecat.purchases.** { *; }
-keepclassmembers class com.revenuecat.purchases.** {
    <fields>;
    <init>(...);
}
-dontwarn com.revenuecat.purchases.**
# Play Billing: l'SDK RevenueCat ci parla via AIDL/callback, i modelli sono
# creati a partire da JSON restituito dal Play Store.
-keep class com.android.billingclient.api.** { *; }
-dontwarn com.android.billingclient.**

# ── OkHttp / Okio ──
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ── Bridge Capacitor ──
# @PluginMethod è invocato dal bridge Capacitor per NOME via reflection
# (chiamata JS→nativo): senza keep, R8 può rimuovere/rinominare metodi mai
# chiamati da codice Kotlin ma in realtà raggiungibili solo dal JS
# (startBackgroundPoiService, setUserContext, playOfflineGuide, ecc.).
# Regola larga, VALUTATA E LASCIATA COM'E': il bridge risolve plugin, metodi e
# JSObject per nome a runtime, quindi non esiste un sottoinsieme "sicuro" da
# tenere calcolabile staticamente. Restringerla romperebbe un plugin a caso
# solo in release, e il sintomo (una call JS che non torna mai) e' fra i piu'
# difficili da diagnosticare in mano all'utente.
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# ── Play Services location / geofencing ──
# Regola larga, VALUTATA E LASCIATA COM'E': GeofencingEvent.fromIntent()
# ricostruisce Geofence/GeofencingRequest a partire da un Intent che arriva dal
# processo di Play Services (SafeParcel, creator letti per reflection).
# Restringerla ai soli tipi che nominiamo nel codice Kotlin farebbe fuori i
# CREATOR e le classi interne usate dal parcelling, e il
# GeofenceBroadcastReceiver riceverebbe eventi con errore -1 senza spiegazione.
# Costa qualche centinaio di KB: meglio del geofencing muto in release.
-keep class com.google.android.gms.location.** { *; }

# ── EncryptedSharedPreferences (androidx.security.crypto) ──
# Usa Tink internamente: alcune classi sono referenziate solo da codice
# nativo/reflection interno alla libreria.
# Regola larga, VALUTATA E LASCIATA COM'E': Tink registra i suoi KeyManager in
# un catalogo per nome di tipo (stringhe "type.googleapis.com/...") e usa i
# protobuf generati. Restringerla significherebbe rompere la decifratura delle
# EncryptedSharedPreferences: l'utente perderebbe userId/accessToken salvati e
# verrebbe sloggato dal servizio in background, senza alcun errore visibile.
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.errorprone.annotations.**
