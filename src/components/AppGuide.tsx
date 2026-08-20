import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Map, Headphones, Camera, Zap,
  Settings, ShieldCheck, Download, ChevronRight,
  Navigation, Bell, Target, Award, Heart, Mail,
  MessageSquare, LifeBuoy, Info, Smartphone,
  Globe, CreditCard, Star, Compass, MapPin,
  Play, Pause, RefreshCw, Plus, CheckCircle,
  History, Bookmark, User, ShoppingCart, Trash2,
  ChevronDown, Ticket, WifiOff, KeyRound, Users
} from 'lucide-react';
import { Language } from '../lib/i18n';
import { PRICING_LIST, DAY_PASS_GUIDE_CAP, MUSEUM_PASS_HOURS } from '../lib/pricing';

interface AppGuideProps {
  language: Language;
}

const PDF_FILENAME = 'WIP_Manuale_Uso.pdf';
const PRINT_VIEW_ID = 'app-guide-print-view';

const AccordionItem = ({ title, icon: Icon, children, isOpen, onClick }: { title: string, icon: any, children: React.ReactNode, isOpen: boolean, onClick: () => void }) => {
  return (
    <div className="border border-gray-100 rounded-3xl overflow-hidden bg-white mb-4 shadow-sm">
      <button
        onClick={onClick}
        className="w-full p-5 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-gray-900">{title}</h3>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 pt-0 border-t border-gray-50 bg-white">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Blocchi tipografici riusabili della guida */
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-gray-600 leading-relaxed mb-3">{children}</p>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-sm font-black text-gray-900 mt-4 mb-2">{children}</h4>
);
const Li = ({ children }: { children: React.ReactNode }) => (
  <li className="text-sm text-gray-600 leading-relaxed mb-1.5 flex gap-2">
    <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
    <span>{children}</span>
  </li>
);
const CostBadge = ({ cost }: { cost: string }) => (
  <span className="inline-flex items-center gap-1 text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full align-middle">
    <CreditCard className="w-3 h-3" /> {cost}
  </span>
);
const FreeBadge = () => (
  <span className="inline-flex items-center text-[10px] font-black bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full align-middle">
    GRATIS
  </span>
);

interface GuideSection {
  id: string;
  title: string;
  icon: any;
  content: React.ReactNode;
}

// ── Helpers export PDF ────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Conversione base64 fallita'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Su Android il download via <a download> di un blob: URL non funziona nel
 * WebView di Capacitor (nessun download listener registrato), quindi il PDF
 * viene scritto su disco con il plugin Filesystem: prima nella cartella
 * pubblica Documenti, in fallback nei file esterni dell'app.
 */
async function writePdfNative(blob: Blob, filename: string): Promise<'documents' | 'app-files'> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const base64 = await blobToBase64(blob);
  try {
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents, recursive: true });
    return 'documents';
  } catch {
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.External, recursive: true });
    return 'app-files';
  }
}

export default function AppGuide({ language }: AppGuideProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>('intro');
  const isItalian = language === 'IT';

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  /**
   * Esporta il manuale COMPLETO. Il vecchio export catturava il contenitore
   * dell'accordion, ma le sezioni chiuse sono smontate dal DOM
   * (AnimatePresence): il PDF conteneva solo i titoli. Ora il rendering
   * avviene sulla vista di stampa nascosta (#app-guide-print-view), che ha
   * TUTTE le sezioni sempre espanse.
   */
  const handleExportPDF = async () => {
    setIsExporting(true);
    setExportMsg(null);
    try {
      const element = document.getElementById(PRINT_VIEW_ID);
      if (!element) throw new Error('Vista di stampa non trovata');

      let html2pdf: any = null;
      try {
        const mod = await import('html2pdf.js');
        html2pdf = (mod as any).default || mod;
      } catch (e) {
        console.warn('[AppGuide] html2pdf.js non disponibile:', e);
      }

      const { Capacitor } = await import('@capacitor/core');
      const isNative = Capacitor.isNativePlatform();

      if (!html2pdf) {
        if (isNative) {
          // window.print() non è supportato dal WebView Android: senza
          // html2pdf non c'è un percorso alternativo sul nativo.
          setExportMsg(isItalian
            ? 'Generazione PDF non disponibile su questo dispositivo. Riprova dal sito web.'
            : 'PDF generation is not available on this device. Please try from the website.');
        } else {
          const { printScoped } = await import('../lib/printScoped');
          printScoped('manual');
        }
        return;
      }

      const opt = {
        margin: [10, 12, 15, 12],
        filename: PDF_FILENAME,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
          scrollY: 0,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      };

      const pdfBlob: Blob = await html2pdf().set(opt).from(element).outputPdf('blob');

      if (isNative) {
        const where = await writePdfNative(pdfBlob, PDF_FILENAME);
        setExportMsg(where === 'documents'
          ? (isItalian
            ? `PDF completo salvato nella cartella "Documenti" del telefono (${PDF_FILENAME}).`
            : `Full PDF saved to your phone's "Documents" folder (${PDF_FILENAME}).`)
          : (isItalian
            ? 'PDF salvato nei file dell\'app (Android/data/com.itaintasca.app/files).'
            : 'PDF saved in the app files (Android/data/com.itaintasca.app/files).'));
      } else {
        const dlUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = PDF_FILENAME;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
      }
    } catch (e) {
      console.error('[AppGuide] PDF Export failed', e);
      setExportMsg(isItalian
        ? 'Esportazione PDF non riuscita. Riprova.'
        : 'PDF export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Contenuti del manuale: definiti UNA volta, usati sia dall'accordion
  //    a schermo sia dalla vista di stampa/PDF con tutte le sezioni espanse ──
  const sections: GuideSection[] = [
    {
      id: 'intro',
      title: isItalian ? "Introduzione e Sistema Crediti" : "Introduction & Credit System",
      icon: BookOpen,
      content: (
        <>
          <P><strong>WIP — World in Pocket</strong> è la tua audioguida intelligente: mentre cammini o guidi, l'app riconosce i luoghi intorno a te e te li racconta a voce, anche con il telefono in tasca e lo schermo spento.</P>
          <H>Come funzionano i crediti</H>
          <P>Alla registrazione ricevi <strong>100 crediti in omaggio</strong>, accreditati appena <strong>confermi l'email</strong> (il link che ti arriva dopo l'iscrizione). Molte funzioni sono gratuite; quelle premium consumano crediti, ricaricabili dallo Shop. Il saldo è sempre visibile in alto nel Profilo.</P>
          <ul className="mb-2">
            <Li>Esplorare la mappa, gli avvisi di vicinanza e i <strong>teaser vocali</strong>: <FreeBadge /></Li>
            <Li>Audioguida completa di un luogo: <CostBadge cost={`${PRICING_LIST.audio_guide} crediti`} /> (una volta acquistata resta tua per sempre)</Li>
            <Li><strong>Day Pass 24h</strong> — tutto automatico, fino a {DAY_PASS_GUIDE_CAP} guide: <CostBadge cost={`${PRICING_LIST.day_pass} crediti`} /></Li>
            <Li>Scheda dettagliata di un luogo: <CostBadge cost={`${PRICING_LIST.poi_detail} crediti`} /></Li>
            <Li>Itinerario AI: <CostBadge cost={`${PRICING_LIST.itinerary_daily} crediti/giorno`} /> — include <strong>10 messaggi di chat gratis</strong> con WIP</Li>
            <Li>Chat WIP oltre i messaggi inclusi: <CostBadge cost={`${PRICING_LIST.chat_session} crediti / 10 messaggi`} /></Li>
            <Li>Riconoscimento foto (Vision): <CostBadge cost={`${PRICING_LIST.photo_search} crediti`} /></Li>
            <Li><strong>Pass Museo</strong> — riconoscimenti Vision illimitati per {MUSEUM_PASS_HOURS} ore: <CostBadge cost={`${PRICING_LIST.museum_pass} crediti`} /></Li>
            <Li>Libreria itinerari già pronti e verificati: <FreeBadge /></Li>
            <Li>Proporre un luogo alla <strong>WIP Community</strong>: <FreeBadge /> — e se approvato <strong>ti fa guadagnare crediti</strong></Li>
            <Li>Guida PDF Premium: <CostBadge cost={`${PRICING_LIST.premium_guide_daily} crediti/giorno`} /> · Podcast: <CostBadge cost={`${PRICING_LIST.podcast_daily} crediti/giorno`} /></Li>
            <Li>Mappe/pacchetti offline: <FreeBadge /></Li>
          </ul>
          <P>Puoi anche <strong>guadagnare crediti gratis</strong> completando le Missioni (vedi sezione dedicata).</P>
        </>
      ),
    },
    {
      id: 'account',
      title: isItalian ? "Account, Accesso e Sicurezza" : "Account, Login & Security",
      icon: KeyRound,
      content: (
        <>
          <H>Creare un account</H>
          <P>Registrati con <strong>email e password</strong>: inserisci il tuo nome (comparirà nel profilo), l'email e una password di almeno 6 caratteri.</P>
          <H>Password dimenticata</H>
          <P>Nella schermata di accesso tocca <em>"Hai dimenticato la password?"</em>, inserisci la tua email e riceverai un link: aprilo, imposta la nuova password e rientra nell'app.</P>
          <H>Sblocco con impronta / volto</H>
          <P>Se il tuo telefono ha il sensore, dopo il primo accesso puoi entrare con l'impronta o il volto senza reinserire la password. Si attiva/disattiva da <strong>Profilo → Impostazioni → Sicurezza</strong>; disattivandolo le credenziali salvate vengono rimosse dal dispositivo.</P>
          <H>Cambiare password, nome e foto</H>
          <ul className="mb-2">
            <Li><strong>Password</strong>: Profilo → Impostazioni → Sicurezza → "Cambia password" (serve la password attuale).</Li>
            <Li><strong>Nome e foto</strong>: Profilo → Impostazioni → Area Personale. Puoi usare un'emoji, un URL o caricare una foto (max 1 MB).</Li>
          </ul>
          <H>Eliminare l'account</H>
          <P>Da Profilo → Impostazioni, in fondo: digita "elimina" per confermare. La cancellazione è definitiva (account e dati profilo).</P>
        </>
      ),
    },
    {
      id: 'navbar',
      title: isItalian ? "Barra di Navigazione Inferiore" : "Bottom Navigation Bar",
      icon: Smartphone,
      content: (
        <ul className="mb-2">
          <Li><strong><Map className="w-4 h-4 inline" /> Mappa</strong> — la schermata principale: luoghi intorno a te, filtri per categoria, radar e audioguida.</Li>
          <Li><strong><Compass className="w-4 h-4 inline" /> Pianifica</strong> — WIP l'Esperto crea itinerari su misura giorno per giorno.</Li>
          <Li><strong><Camera className="w-4 h-4 inline" /> Vision</strong> — fotografa un monumento e scopri cos'è; da qui attivi il <strong>Pass Museo</strong> e proponi luoghi nuovi alla <strong>Community</strong>.</Li>
          <Li><strong><Star className="w-4 h-4 inline" /> Eventi</strong> — concerti, mostre ed esperienze nella zona.</Li>
          <Li><strong><User className="w-4 h-4 inline" /> Profilo</strong> — crediti, missioni, passaporto e diario, <strong>Le mie Vision</strong>, mappe offline, impostazioni, assistenza e questo manuale.</Li>
        </ul>
      ),
    },
    {
      id: 'map',
      title: isItalian ? "Schermata Mappa (Il Radar)" : "Map Screen (The Radar)",
      icon: Map,
      content: (
        <>
          <P>La mappa mostra i luoghi d'interesse intorno a te: monumenti, musei, chiese, panorami, locali e le <strong>Gemme</strong> 💎 (luoghi speciali selezionati).</P>
          <ul className="mb-2">
            <Li><strong>Chips categorie</strong> (in alto): attiva/disattiva le categorie che ti interessano. Valgono anche per gli avvisi vocali.</Li>
            <Li><strong>Tocca un pin</strong>: si apre la scheda del luogo con descrizione, foto e tasto Ascolta.</Li>
            <Li><strong>Tasto cuffie</strong> <Headphones className="w-4 h-4 inline" /> (in basso a sinistra): accende l'audioguida automatica e la vista radar. Con il Day Pass attivo accanto compare il badge 🎫 con le guide rimaste.</Li>
            <Li><strong>Vista radar</strong>: tu al centro, i luoghi intorno ordinati per distanza — è anche la vista usata offline, dove la mappa di sfondo non è disponibile.</Li>
          </ul>
          <H>La chip 🏺 Beni Culturali</H>
          <P>Oltre ai luoghi turistici, WIP contiene l'<strong>atlante dei beni vincolati</strong> e i <strong>musei di tutto il mondo</strong> raccolti dai registri ufficiali dei ministeri e da Wikidata. Sono centinaia di migliaia di voci: chiese minori, ville, torri, aree archeologiche, palazzi storici che non compaiono in nessuna guida.</P>
          <ul className="mb-2">
            <Li>Si accendono con la chip <strong>🏺 Beni Culturali</strong> e compaiono da uno <strong>zoom ravvicinato</strong> in poi: a mappa larga sarebbero migliaia di pin sovrapposti.</Li>
            <Li>Hanno una scheda più essenziale (nome, tipo, vincolo, posizione): sono un livello informativo, non tutti hanno una storia da raccontare.</Li>
            <Li>Quelli più importanti sono anche normali luoghi WIP, con audioguida e foto.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'geocontrol',
      title: isItalian ? "Audioguida Automatica (GeoControl)" : "Automatic Audio Guide (GeoControl)",
      icon: Headphones,
      content: (
        <>
          <P>È il cuore di WIP: attiva le cuffie, metti il telefono in tasca e cammina. Funziona anche a <strong>schermo spento</strong>.</P>
          <H>Cosa succede quando ti avvicini a un luogo</H>
          <ul className="mb-2">
            <Li><strong>1. Avviso di avvicinamento</strong> (~150 m a piedi, ~300 m in auto): vibrazione + "Ti stai avvicinando a…". <FreeBadge /></Li>
            <Li><strong>2. Arrivo + teaser</strong>: un assaggio vocale di ciò che rende speciale il luogo. <FreeBadge /></Li>
            <Li><strong>3. Audioguida completa</strong>: con il <strong>Day Pass</strong> parte da sola (modalità automatica); senza pass tocchi <em>Ascolta</em> e paghi {PRICING_LIST.audio_guide} crediti — solo la prima volta: i luoghi acquistati restano sbloccati per sempre.</Li>
          </ul>
          <H>Modalità automatica vs semiautomatica</H>
          <P>In <strong>automatica</strong> la guida parte da sola all'arrivo (col pass o per i luoghi già acquistati). In <strong>semiautomatica</strong> ricevi avviso e teaser, e decidi tu quando toccare Ascolta. Si sceglie da Profilo → Impostazioni.</P>
          <H>A piedi o in auto</H>
          <P>WIP capisce da solo se cammini o guidi e adatta le distanze di avviso (regolabili in Impostazioni → GeoControl). In auto funziona anche con <strong>Android Auto</strong>.</P>
        </>
      ),
    },
    {
      id: 'daypass',
      title: isItalian ? `WIP Day Pass (24 ore)` : `WIP Day Pass (24 hours)`,
      icon: Ticket,
      content: (
        <>
          <P>Il modo più comodo di visitare: <strong>{PRICING_LIST.day_pass} crediti</strong> e per <strong>24 ore</strong> non devi fare più nulla — solo attivare le cuffie.</P>
          <ul className="mb-2">
            <Li>Avviso, teaser e <strong>audioguida completa automatici</strong> per ogni luogo che incontri, fino a <strong>{DAY_PASS_GUIDE_CAP} guide</strong>.</Li>
            <Li>Funziona <strong>anche offline</strong> (con un pacchetto area scaricato) e a schermo spento.</Li>
            <Li>Include un livello di <strong>informazioni aggiuntive</strong> dopo ogni guida.</Li>
            <Li>Le guide rimaste le vedi nel badge 🎫 accanto alle cuffie e nella notifica dell'audioguida.</Li>
          </ul>
          <P>Si attiva da: Profilo → Mappe Offline, dall'itinerario appena creato, o dal popup che compare quando attivi le cuffie in una zona ricca di luoghi. <em>Conviene dal {Math.floor(PRICING_LIST.day_pass / PRICING_LIST.audio_guide) + 1}° ascolto in poi — se in un giorno visiti più di {Math.floor(PRICING_LIST.day_pass / PRICING_LIST.audio_guide)} luoghi, risparmi.</em></P>
        </>
      ),
    },
    {
      id: 'offline',
      title: isItalian ? "Modalità Offline (Pacchetti Area)" : "Offline Mode (Area Packages)",
      icon: WifiOff,
      content: (
        <>
          <P>Prima di partire per una zona con poca rete, scarica <strong>gratis</strong> il pacchetto dell'area da Profilo → Mappe Offline: cerca la città, scegli il raggio (50/100/200 km) e scarica. Pochi MB, pochi secondi.</P>
          <H>Cosa funziona senza rete</H>
          <ul className="mb-2">
            <Li><strong>Tutto il flusso automatico</strong>: avvisi, teaser e audioguide anche a schermo spento, letti dalla voce di sistema del telefono.</Li>
            <Li><strong>Vista radar</strong> al posto della mappa (la mappa di sfondo richiede rete).</Li>
            <Li><strong>Day Pass</strong>: se attivo, copre anche gli ascolti offline.</Li>
            <Li><strong>Ascolto a crediti</strong>: funziona anche offline — la spesa viene annotata e regolarizzata al ritorno della rete.</Li>
          </ul>
          <H>Consigli</H>
          <ul className="mb-2">
            <Li>Al download l'app verifica che la <strong>voce offline</strong> della tua lingua sia installata e ti aiuta a scaricarla.</Li>
            <Li>I pacchetti si aggiornano col tasto <RefreshCw className="w-3.5 h-3.5 inline" /> (scarica solo le novità, gratis) e si eliminano col cestino.</Li>
            <Li>Puoi scaricare più aree: si attiva da sola quella in cui ti trovi, zero selezioni manuali.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'plan',
      title: isItalian ? "Schermata Pianifica (Itinerari AI)" : "Plan Screen (AI Itineraries)",
      icon: Compass,
      content: (
        <>
          <P>Dì a WIP dove vai, per quanti giorni e cosa ti piace: ricevi un itinerario completo con orari, tappe, pause e spostamenti. <CostBadge cost={`${PRICING_LIST.itinerary_daily} crediti/giorno`} /></P>
          <ul className="mb-2">
            <Li><strong>10 messaggi di chat inclusi</strong> con ogni itinerario: chiedi modifiche ("aggiungi un museo", "e se piove?") direttamente in chat.</Li>
            <Li><strong>Rigenera</strong> ricrea il piano mantenendo le tappe che hai bloccato col lucchetto.</Li>
            <Li><strong>Segui itinerario</strong>: le tappe entrano nel radar con priorità e check-in automatico all'arrivo.</Li>
            <Li><strong>Offline</strong>: salva il testo gratis, oppure scarica il <strong>bundle audio</strong> con la voce premium ({PRICING_LIST.audio_guide + PRICING_LIST.poi_detail} crediti/tappa — file tuoi per sempre).</Li>
            <Li><strong>PDF e stampa</strong>: esporta l'itinerario; la <strong>Guida Premium</strong> ({PRICING_LIST.premium_guide_daily} crediti/giorno) crea un libretto illustrato.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'library',
      title: isItalian ? "Libreria Itinerari (già pronti, gratis)" : "Itinerary Library (ready-made, free)",
      icon: Bookmark,
      content: (
        <>
          <P>Prima di far generare un itinerario da zero, guarda in <strong>📚 Libreria</strong>: contiene itinerari <strong>già costruiti e verificati</strong>, pronti da usare senza spendere crediti. <FreeBadge /></P>
          <ul className="mb-2">
            <Li>Si cerca per <strong>città, porto o tema</strong>, e si filtra per durata: poche ore per una sosta, oppure giorni interi.</Li>
            <Li>Gli itinerari già in libreria portano il bollino <strong>"✓ Verificato"</strong>: sono stati controllati, non generati al momento.</Li>
            <Li>Tocca una scheda per vedere l'anteprima completa (tappe, orari, budget) e poi <strong>"Usa questo itinerario"</strong>: entra nei tuoi piani come se l'avessi creato tu, e da lì lo modifichi.</Li>
            <Li>Se un tema c'è ma l'itinerario non è ancora stato generato, la scheda te lo dice e puoi farlo generare al momento (al costo normale).</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'wipnav',
      title: isItalian ? "WIP Nav (navigatore a piedi)" : "WIP Nav (walking navigator)",
      icon: Navigation,
      content: (
        <>
          <P>Da una scheda o da una tappa dell'itinerario puoi farti <strong>accompagnare a piedi</strong>: WIP Nav disegna il percorso e ti guida con la voce, come un navigatore d'auto ma pensato per chi cammina. <FreeBadge /></P>
          <ul className="mb-2">
            <Li>Freccia della manovra, distanza alla svolta, tempo e <strong>orario di arrivo previsto</strong>.</Li>
            <Li>Le indicazioni vocali usano la <strong>stessa voce dell'audioguida</strong>: non devi guardare lo schermo.</Li>
            <Li>Mentre cammini le audioguide <strong>continuano a funzionare</strong>: se passi davanti a qualcosa di interessante lungo la strada, te lo racconta.</Li>
            <Li>Le tappe del tuo itinerario non costano nulla in più; un luogo trovato per strada segue le regole normali dell'audioguida.</Li>
          </ul>
          <P>In auto WIP non fa da navigatore: apre Google Maps o Apple Mappe, che lo fanno meglio.</P>
        </>
      ),
    },
    {
      id: 'trails',
      title: isItalian ? "Cammini e Fughe da Porto/Aeroporto" : "Trails and Port/Airport Escapes",
      icon: Compass,
      content: (
        <>
          <H>🥾 Cammini storici</H>
          <P>Vie di pellegrinaggio e cammini di tutto il mondo, divisi in <strong>tappe reali</strong>, con i luoghi da vedere lungo il percorso e dove dormire a fine giornata. Utile sia per farli davvero, sia per prendersene un pezzo in giornata.</P>
          <H>⚓ Fughe da porto e aeroporto</H>
          <P>Hai uno scalo o una sosta da crociera e poche ore? Scegli il porto o l'aeroporto e la durata — <strong>4, 6 o 8 ore</strong> — e WIP costruisce un giro che ti riporta indietro in tempo, contando davvero gli spostamenti.</P>
          <ul className="mb-2">
            <Li>Ogni giro ha sempre una <strong>versione a costo zero</strong> accanto a quella con biglietti.</Li>
            <Li>I tempi di rientro sono calcolati con margine: il rischio di perdere la nave o il volo è il motivo per cui questa funzione esiste.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'events',
      title: isItalian ? "Eventi, Biglietti ed Esperienze" : "Events, Tickets and Experiences",
      icon: Star,
      content: (
        <>
          <P>La scheda <strong>Eventi</strong> mostra cosa succede dove ti trovi nei giorni in cui ci sei: concerti, mostre, sagre, spettacoli. <FreeBadge /></P>
          <ul className="mb-2">
            <Li><strong>Biglietti e visite guidate</strong> prenotabili direttamente, spesso con salta-fila.</Li>
            <Li>Accanto a ogni proposta a pagamento trovi sempre, quando esiste, <strong>l'alternativa gratuita</strong>: WIP non nasconde che a una chiesa si entra gratis.</Li>
            <Li>Sui percorsi stagionali (fioriture, foliage, presepi, mercatini) c'è un catalogo dedicato che cambia col periodo dell'anno.</Li>
          </ul>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-3">Se prenoti da WIP, l'app riceve una commissione dal fornitore: il prezzo per te è lo stesso.</p>
        </>
      ),
    },
    {
      id: 'rain',
      title: isItalian ? "Garanzia Pioggia" : "Rain Guarantee",
      icon: ShieldCheck,
      content: (
        <>
          <P>Se il giorno che avevi pianificato è stato rovinato dalla pioggia, <strong>ti restituiamo i crediti di quel giorno</strong>.</P>
          <ul className="mb-2">
            <Li>Vale quando ha piovuto <strong>almeno 6 ore</strong> oppure sono caduti <strong>almeno 20 mm</strong>: non una pioggia passeggera, una giornata persa.</Li>
            <Li>Si richiede entro <strong>7 giorni</strong> dal giorno in questione, dal link sotto l'itinerario nel Profilo.</Li>
            <Li>Il controllo lo fa il server sul <strong>meteo realmente registrato</strong> in quel punto e in quel giorno: non serve allegare niente.</Li>
            <Li>Anche quando la richiesta viene respinta ti mostriamo <strong>quanti mm e quante ore</strong> sono stati misurati, così sai perché.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'dashboard',
      title: isItalian ? "Passaporto, CO₂ e Calendario" : "Passport, CO₂ and Calendar",
      icon: Target,
      content: (
        <>
          <H>Passaporto WIP</H>
          <P>Ogni destinazione visitata lascia un <strong>timbro</strong> nel tuo passaporto, con la data della prima visita. Si costruisce da solo: non c'è niente da attivare.</P>
          <H>Salute del viaggio</H>
          <P>Se lo autorizzi, il Profilo mostra <strong>passi, chilometri e piani saliti</strong> della giornata, letti dal contapassi del telefono. È un dato che resta sul dispositivo.</P>
          <H>Impronta di CO₂</H>
          <P>Ogni itinerario stima le <strong>emissioni degli spostamenti</strong> e confronta le alternative: spesso a piedi o in treno si arriva quasi come in auto, e si vede subito.</P>
          <H>Esporta nel calendario</H>
          <P>Un itinerario può essere <strong>esportato nel calendario del telefono</strong>: ogni tappa diventa un appuntamento con orario e luogo, utile anche per condividerlo con chi viaggia con te.</P>
        </>
      ),
    },
    {
      id: 'chat',
      title: isItalian ? "Chat con WIP (l'Esperto di Viaggi)" : "Chat with WIP (Travel Expert)",
      icon: MessageSquare,
      content: (
        <>
          <P>WIP risponde a domande sui luoghi, la storia, i consigli pratici, e può <strong>modificare il tuo itinerario</strong> in tempo reale (meteo, eventi, alternative).</P>
          <ul className="mb-2">
            <Li><strong>Dall'itinerario</strong>: la chat è in basso nella schermata del piano. <strong>10 messaggi inclusi</strong> con ogni itinerario; finiti quelli, {PRICING_LIST.chat_session} crediti ogni 10 messaggi.</Li>
            <Li><strong>Dalla scheda di un luogo</strong>: tocca 💬 "Chiedi a WIP". Qui non ci sono messaggi inclusi: {PRICING_LIST.chat_session} crediti per 10 messaggi.</Li>
            <Li>Puoi <strong>dettare</strong> i messaggi col microfono.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'vision',
      title: isItalian ? "Vision (Fotocamera)" : "Vision (Camera)",
      icon: Camera,
      content: (
        <>
          <P>Inquadra un monumento, una statua o un dettaglio architettonico: WIP lo riconosce e ti racconta cosa stai guardando. <CostBadge cost={`${PRICING_LIST.photo_search} crediti`} /></P>
          <P>Dal risultato puoi aprire la scheda completa del luogo, ascoltare l'audioguida o chiedere approfondimenti in chat.</P>
          <H>Dentro un museo: il Pass Museo</H>
          <P>Nei musei il GPS non arriva e le opere sono decine: pagare ogni singolo riconoscimento non avrebbe senso. Il <strong>Pass Museo</strong> apre <strong>{MUSEUM_PASS_HOURS} ore di riconoscimenti illimitati</strong>. <CostBadge cost={`${PRICING_LIST.museum_pass} crediti`} /></P>
          <ul className="mb-2">
            <Li>Si attiva <strong>dalla schermata Vision</strong>: quando è attivo vedi in alto il tempo che resta.</Li>
            <Li>Mentre è attivo la posizione non viene usata per il riconoscimento: conta solo quello che inquadri, quindi funziona anche al chiuso.</Li>
            <Li>Conviene dal {Math.floor(PRICING_LIST.museum_pass / PRICING_LIST.photo_search) + 1}° scatto in poi: sotto quella soglia costa meno pagare i singoli riconoscimenti.</Li>
            <Li>Inquadra il <strong>cartellino</strong> dell'opera insieme al quadro: il testo aiuta il riconoscimento più di qualunque altra cosa.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'community',
      title: isItalian ? "WIP Community (proponi un luogo)" : "WIP Community (suggest a place)",
      icon: Users,
      content: (
        <>
          <P>Nessuna mappa è completa. Se trovi una cappella di campagna, un murale, un lavatoio, una fontana storica che su WIP non c'è, <strong>puoi aggiungerlo tu</strong>: fotografalo dalla schermata Vision e proponilo. <FreeBadge /></P>
          <H>Come funziona, passo per passo</H>
          <ul className="mb-2">
            <Li><strong>1. Scatta e proponi</strong>: la foto parte con la posizione del punto in cui ti trovi. Puoi aggiungere un nome e due righe di descrizione, ma non è obbligatorio.</Li>
            <Li><strong>2. Un controllo automatico</strong> scarta subito le foto che non c'entrano (persone, schermi, cibo) e i luoghi già presenti a pochi metri.</Li>
            <Li><strong>3. Una persona approva</strong>: nessuna foto diventa un luogo pubblico senza revisione umana.</Li>
            <Li><strong>4. Diventa un luogo WIP</strong> visibile a tutti, con la tua foto e la tua attribuzione, e <strong>a te tornano crediti</strong>.</Li>
          </ul>
          <H>Le tue proposte</H>
          <P>Le ritrovi in <strong>Profilo → Le mie Vision</strong>, con lo stato di ciascuna (in attesa, approvata, non accettata) e il motivo di un eventuale rifiuto. Le foto restano tue: le usiamo solo dentro WIP per mostrare il luogo che hai proposto, e puoi chiederne la rimozione in qualsiasi momento.</P>
          <H>Cosa conviene fotografare</H>
          <ul className="mb-2">
            <Li>Sì: edicole votive, murales, fontane, lavatoi, ponti, torri, cippi, chiese minori, punti panoramici.</Li>
            <Li>No: interni privati, persone riconoscibili, opere ancora sotto copyright fotografate come soggetto principale, cartelli e insegne commerciali.</Li>
            <Li>Fotografa <strong>di giorno e da lontano abbastanza</strong> da far capire il contesto: è la foto che gli altri vedranno per primi.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'journal',
      title: isItalian ? "Diario di Viaggio" : "Travel Journal",
      icon: History,
      content: (
        <>
          <P>Nel Profilo trovi la cronologia dei luoghi visitati e delle audioguide ascoltate: il tuo diario si costruisce da solo mentre esplori.</P>
          <ul className="mb-2">
            <Li>I luoghi con audioguida acquistata restano <strong>sbloccati per sempre</strong>: riascolti senza ripagare.</Li>
            <Li>I <strong>preferiti</strong> <Heart className="w-3.5 h-3.5 inline text-rose-500" /> salvati dalle schede si ritrovano qui e sulla mappa.</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'livetour',
      title: isItalian ? "Tour di Gruppo (Live Tour)" : "Group Tour (Live Tour)",
      icon: Navigation,
      content: (
        <P>Per visite in compagnia: un capogruppo guida il tour e i partecipanti sentono le stesse audioguide, sincronizzati. Si crea/si entra con un codice dalla schermata dedicata nel Profilo.</P>
      ),
    },
    {
      id: 'missions',
      title: isItalian ? "Missioni, Livelli & Punti XP" : "Missions, Levels & XP",
      icon: Award,
      content: (
        <>
          <P>Esplorare premia: ogni luogo visitato e audioguida ascoltata vale <strong>punti XP</strong> che fanno salire di livello, e le <strong>Missioni</strong> (es. "visita 3 chiese") regalano <strong>crediti gratis</strong> al completamento.</P>
          <P>Trovi missioni, badge e progressi nel Profilo, sotto il riepilogo crediti.</P>
        </>
      ),
    },
    {
      id: 'credits',
      title: isItalian ? "Crediti, WIP Shop & Voucher" : "Credits, WIP Shop & Vouchers",
      icon: ShoppingCart,
      content: (
        <ul className="mb-2">
          <Li><strong>Ricarica</strong>: dal <strong>WIP Shop</strong> nel Profilo, con carta (web) o acquisto in-app (Android). I crediti acquistati non scadono.</Li>
          <Li><strong>Ordine di consumo</strong>: prima i crediti guadagnati (missioni/omaggi), poi quelli acquistati.</Li>
          <Li><strong>Voucher/Coupon</strong>: se hai un codice (es. da una struttura partner), riscattalo nel WIP Shop.</Li>
          <Li><strong>Rimborsi automatici</strong>: se un acquisto in-app non va a buon fine (audio non riprodotto, download fallito), i crediti tornano da soli.</Li>
          <Li><strong>Listino completo</strong>: sempre visibile in Profilo → Listino Servizi.</Li>
        </ul>
      ),
    },
    {
      id: 'settings',
      title: isItalian ? "Impostazioni — voce per voce" : "Settings — item by item",
      icon: Settings,
      content: (
        <ul className="mb-2">
          <Li><strong>Area Personale</strong>: nome mostrato nel profilo e foto/emoji avatar.</Li>
          <Li><strong>Sicurezza</strong>: cambio password e sblocco con impronta/volto.</Li>
          <Li><strong>Lingua</strong>: 7 lingue (IT/EN/FR/ES/DE/RU/ZH) per interfaccia e voce.</Li>
          <Li><strong>Voce narrante</strong>: Nicky (la Guida) o Dante (l'Esploratore).</Li>
          <Li><strong>GeoControl</strong>: modalità automatica/semiautomatica, trasporto (auto-rilevato o forzato), raggi di avviso e arrivo a piedi e in auto.</Li>
          <Li><strong>Categorie attive</strong>: quali tipi di luoghi generano avvisi vocali.</Li>
          <Li><strong>Posizione predefinita</strong>: la città di partenza della mappa.</Li>
          <Li><strong>Permessi</strong>: per l'audioguida a schermo spento servono Posizione "Consenti sempre", Notifiche e l'esenzione dal risparmio batteria — l'app li richiede guidandoti.</Li>
          <Li><strong>Esci / Elimina account</strong>: in fondo alla pagina.</Li>
        </ul>
      ),
    },
    {
      id: 'support',
      title: isItalian ? "Assistenza, Contatti & Privacy" : "Support, Contacts & Privacy",
      icon: LifeBuoy,
      content: (
        <>
          <H>Contatti</H>
          <ul className="mb-2">
            <Li><Mail className="w-3.5 h-3.5 inline" /> <strong>Email assistenza</strong>: <a href="mailto:support@wip.guide" className="text-primary font-bold underline">support@wip.guide</a> — rispondiamo entro 48 ore lavorative.</Li>
            <Li><strong>Segnala un problema tecnico</strong>: da Profilo → Supporto, il tasto dedicato prepara un'email con i dati del dispositivo già compilati.</Li>
            <Li><strong>Segnala un errore su un luogo</strong>: dalla scheda del POI (informazioni errate, luogo chiuso, foto sbagliata).</Li>
            <Li><strong>Strutture e partner (B2B)</strong>: sezione Partner nel Profilo per hotel, guide e attività che vogliono offrire WIP ai propri ospiti.</Li>
          </ul>
          <H>Privacy in breve</H>
          <P>La posizione serve solo a farti da guida (anche in background, se lo autorizzi) e non viene venduta a terzi. I dati del profilo sono protetti da Supabase con crittografia; i pagamenti passano da Stripe/Google Play e non vediamo mai la tua carta. L'informativa completa è in Profilo → Privacy, dove trovi anche i tuoi diritti GDPR (accesso, rettifica, cancellazione).</P>
          <p className="text-[10px] text-gray-500 font-bold mt-2">ItaInta / WIP — World in Pocket · Carrara (MS), Italia</p>
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Regole per il fallback window.print (solo web): stampa SOLO la vista
          completa del manuale, nascondendo il resto dell'app. La classe
          body.printing-manual è messa da printScoped('manual'). */}
      <style>{`
        @media print {
          body.printing-manual * { visibility: hidden !important; }
          body.printing-manual #${PRINT_VIEW_ID},
          body.printing-manual #${PRINT_VIEW_ID} * { visibility: visible !important; }
          body.printing-manual #${PRINT_VIEW_ID} {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">{isItalian ? "Manuale d'Uso Dettagliato" : "Detailed User Manual"}</h2>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{isItalian ? "Tutte le funzioni e i tasti spiegati" : "All features and buttons explained"}</p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={isExporting}
          className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
        >
          {isExporting ? <Zap className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          PDF
        </button>
      </div>

      {exportMsg && (
        <div className="text-xs font-bold text-primary bg-primary/5 border border-primary/10 rounded-xl px-3 py-2">
          {exportMsg}
        </div>
      )}

      {/* Accordion a schermo */}
      <div id="app-user-guide-content" className="space-y-2">
        {sections.map((s) => (
          <React.Fragment key={s.id}>
            <AccordionItem
              title={s.title}
              icon={s.icon}
              isOpen={openSection === s.id}
              onClick={() => toggleSection(s.id)}
            >
              {s.content}
            </AccordionItem>
          </React.Fragment>
        ))}
      </div>

      {/* ── Vista di stampa/PDF: SEMPRE nel DOM, fuori schermo, con TUTTE le
          sezioni espanse. È la sorgente dell'export html2pdf e del fallback
          window.print — mai mostrata nell'interfaccia. ── */}
      <div
        id={PRINT_VIEW_ID}
        aria-hidden="true"
        className="absolute top-0 left-[-10000px] w-[794px] bg-white text-gray-900 px-10 py-8"
      >
        {/* Intestazione del documento */}
        <div style={{ borderBottom: '3px solid #1e3a8a', paddingBottom: 14, marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#0a6c44', textTransform: 'uppercase', marginBottom: 2 }}>
              WIP — World in Pocket
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#1e3a8a', margin: '0 0 4px 0', lineHeight: 1.15 }}>
              {isItalian ? "Manuale d'Uso Dettagliato" : "Detailed User Manual"}
            </h1>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
              {isItalian ? "Tutte le funzioni e i tasti spiegati" : "All features and buttons explained"}
              {' · '}
              {new Date().toLocaleDateString(isItalian ? 'it-IT' : 'en-GB')}
            </div>
          </div>
          <img src="/logo.jpg" alt="World in Pocket" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 12, flexShrink: 0 }} />
        </div>

        {/* Tutte le sezioni, sempre espanse */}
        {sections.map((s, i) => (
          <section key={`print-${s.id}`} style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1e3a8a', borderBottom: '1.5px solid #dbe2ea', paddingBottom: 4, margin: '0 0 10px 0', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
              {i + 1}. {s.title}
            </h3>
            <div>{s.content}</div>
          </section>
        ))}

        {/* Piè di pagina del documento */}
        <div style={{ borderTop: '2px solid #1e3a8a', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#1e3a8a', fontWeight: 700 }}>
          <span>WIP — World in Pocket · Carrara (MS), Italia</span>
          <span>support@wip.guide</span>
        </div>
      </div>
    </div>
  );
}
