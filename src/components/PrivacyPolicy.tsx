import React from 'react';
import { motion } from 'motion/react';
import { Shield, FileText } from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';

interface PrivacyPolicyProps {
  language: Language;
}

export default function PrivacyPolicy({ language }: PrivacyPolicyProps) {
  return (
    <motion.div
      key="privacy"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 max-w-3xl mx-auto pb-10"
    >
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">Privacy Policy</h2>
            <p className="text-xs text-gray-500 font-bold tracking-widest uppercase mt-1">Ultimo aggiornamento: Agosto 2026</p>
          </div>
        </div>

        <div className="prose prose-sm prose-blue max-w-none text-gray-600 space-y-6">
          <section>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              1. Raccolta dei Dati
            </h3>
            <p>
              WIP raccoglie dati personali (nome, email, avatar) necessari per il funzionamento dell'account,
              il tracking dell'esperienza utente (XP, itinerari salvati) e il sistema di pagamenti. Raccogliamo dati sulla
              posizione (GPS) in tempo reale per fornire le funzionalità core: audioguide basate sulla prossimità e navigazione.
            </p>
            <p className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 font-bold">
              Specifiche Posizione: L'app accede alla posizione in background anche quando chiusa o non in uso per far scattare le notifiche audio dei monumenti tramite Geofencing.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              2. Uso della Posizione (Foreground e Background)
            </h3>
            <p>
              Per garantire che le audioguide si attivino automaticamente quando ti avvicini a un punto di interesse (geofencing) 
              anche quando tieni lo schermo spento, l'app richiede l'accesso alla <strong>Posizione in Background</strong> ("Consenti Sempre").
            </p>
            <p>
              Questi dati di posizione <strong>non vengono mai venduti</strong> né usati per pubblicità. La posizione viene
              inviata ai nostri server per trovare i punti di interesse vicini e generare i contenuti; puoi revocare il
              permesso in background in qualsiasi momento dalle impostazioni del dispositivo e l'app continuerà a
              funzionare con la sola posizione in primo piano.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              3. Servizi di Terze Parti
            </h3>
            <p>
              Per funzionare, l'app si appoggia a fornitori esterni che trattano alcuni dati per nostro conto:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase</strong> (database e autenticazione): conserva account, preferiti, cronologia ascolti e crediti.</li>
              <li><strong>Stripe</strong> (pagamenti web) e <strong>Google Play / App Store con RevenueCat</strong> (acquisti in-app): gestiscono i pagamenti; noi <strong>non</strong> vediamo né conserviamo i dati della tua carta.</li>
              <li><strong>Fornitori AI</strong> (generazione testi e voci delle audioguide): ricevono il nome del luogo e la lingua, mai la tua identità.</li>
              <li><strong>Servizi mappe e luoghi</strong> (OpenStreetMap, Mapbox, Wikipedia e simili): ricevono le coordinate dell'area visualizzata per mostrarti mappa e punti di interesse.</li>
            </ul>
            <p>
              Tutte le chiamate a questi servizi passano dai nostri server: nessuna chiave o credenziale di terze parti è presente sul tuo dispositivo.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              4. Sicurezza e Conservazione
            </h3>
            <p>
              Utilizziamo standard di crittografia per proteggere i tuoi dati durante il transito (HTTPS) e a riposo (database Supabase crittografati).
              I dati vengono conservati finché il tuo account rimane attivo.
              Puoi richiedere la cancellazione totale del tuo account tramite il pulsante "Elimina Account" nelle Impostazioni.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Sblocco biometrico</strong> (facoltativo): impronta e volto sono verificati dal sistema operativo; le credenziali sono salvate nel keystore sicuro del tuo dispositivo e <strong>non lasciano mai il telefono</strong>. Disattivando l'opzione vengono eliminate.</li>
              <li><strong>Dati offline</strong>: i pacchetti area (testi dei luoghi), il contatore del Day Pass e le annotazioni degli ascolti a crediti effettuati senza rete sono salvati localmente sul dispositivo e sincronizzati con il tuo account al ritorno della connessione. Eliminando un pacchetto o l'app vengono rimossi.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              5. I Tuoi Diritti (GDPR)
            </h3>
            <p>
              In conformità al Regolamento UE 2016/679 (GDPR) hai diritto di: accedere ai tuoi dati, chiederne la rettifica o la
              cancellazione, limitarne od opporti al trattamento, e riceverne una copia in formato portabile.
              Il titolare del trattamento è <strong>Davide Musetti</strong> (WIP &mdash; World in Pocket), Via Vignaletto 50, 54033 Carrara (MS).
              Per esercitare questi diritti scrivi a <a href="mailto:support@wip.guide" className="text-blue-600 font-bold">support@wip.guide</a>:
              rispondiamo entro 30 giorni. Hai inoltre il diritto di proporre reclamo al Garante per la Protezione dei Dati Personali.
            </p>
            <p>
              La versione completa e sempre aggiornata di questa informativa è pubblicata su{' '}
              <a href="https://wip.guide/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold">wip.guide/privacy</a>;
              i termini completi su <a href="https://wip.guide/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold">wip.guide/terms</a>.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              6. Termini d'Uso Essenziali
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>I crediti acquistati non hanno scadenza e non sono trasferibili ad altri account; quelli bonus/omaggio possono essere revocati in caso di abuso.</li>
              <li>I contenuti delle audioguide sono generati con l'ausilio dell'AI a scopo informativo/turistico: verifica sempre orari, prezzi e accessibilità dei luoghi prima di visitarli.</li>
              <li>Durante la guida usa l'app solo tramite audio: non interagire con lo schermo alla guida.</li>
              <li>È vietato l'uso automatizzato o massivo del servizio (scraping, resale delle audioguide).</li>
            </ul>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
