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

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

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

# ── OkHttp / Okio ──
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ── Bridge Capacitor ──
# @PluginMethod è invocato dal bridge Capacitor per NOME via reflection
# (chiamata JS→nativo): senza keep, R8 può rimuovere/rinominare metodi mai
# chiamati da codice Kotlin ma in realtà raggiungibili solo dal JS
# (startBackgroundPoiService, setUserContext, playOfflineGuide, ecc.).
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# ── Play Services location / geofencing ──
-keep class com.google.android.gms.location.** { *; }

# ── EncryptedSharedPreferences (androidx.security.crypto) ──
# Usa Tink internamente: alcune classi sono referenziate solo da codice
# nativo/reflection interno alla libreria.
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.errorprone.annotations.**
