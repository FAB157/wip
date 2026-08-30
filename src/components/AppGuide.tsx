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
  ChevronDown, Ticket, WifiOff, KeyRound, Users,
  Calendar, PartyPopper
} from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';
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
const FreeBadge = ({ label }: { label: string }) => (
  <span className="inline-flex items-center text-[10px] font-black bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full align-middle">
    {label}
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
  // Come in OfflineMapsTab: `t` accetta placeholder {n}/{h}/{m}/{file}, così le
  // frasi con un numero o un nome file dentro restano UNA sola chiave per
  // lingua invece di essere spezzate in pezzi non ricomponibili.
  const t = (k: string, vars?: Record<string, string | number>) => {
    let s = getTranslation(k, language);
    if (vars) for (const [key, v] of Object.entries(vars)) s = s.split(`{${key}}`).join(String(v));
    return s;
  };
  // Piccoli formattatori di prezzo riusati nei badge: stessa unità "N crediti"
  // in tutte le lingue, con il suffisso giusto (/giorno, /10 messaggi).
  const cr = (n: number) => t('man_u_crediti', { n });
  const crGiorno = (n: number) => t('man_u_crediti_giorno', { n });
  const cr10Msg = (n: number) => t('man_u_crediti_10msg', { n });

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
          setExportMsg(t('man_pdf_unavailable'));
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
          ? t('man_pdf_saved_documents', { file: PDF_FILENAME })
          : t('man_pdf_saved_appfiles'));
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
      setExportMsg(t('man_pdf_export_failed'));
    } finally {
      setIsExporting(false);
    }
  };

  // ── Contenuti del manuale: definiti UNA volta, usati sia dall'accordion
  //    a schermo sia dalla vista di stampa/PDF con tutte le sezioni espanse ──
  const sections: GuideSection[] = [
    {
      id: 'intro',
      title: t('vr_a_guide_sec_intro'),
      icon: BookOpen,
      content: (
        <>
          <P><strong>WIP — World in Pocket</strong> {t('man_intro_p1')}</P>
          <H>{t('man_intro_h_crediti')}</H>
          <P>{t('man_intro_p2a')}<strong>{t('man_intro_p2b')}</strong>{t('man_intro_p2c')}<strong>{t('man_intro_p2d')}</strong>{t('man_intro_p2e')}</P>
          <ul className="mb-2">
            <Li>{t('man_intro_li_map')} <FreeBadge label={t('man_gratis')} /></Li>
            <Li>{t('man_intro_li_audio_1')} <CostBadge cost={cr(PRICING_LIST.audio_guide)} /> {t('man_intro_li_audio_2')}</Li>
            <Li><strong>Day Pass 24h</strong> {t('man_intro_li_daypass', { n: DAY_PASS_GUIDE_CAP })} <CostBadge cost={cr(PRICING_LIST.day_pass)} /></Li>
            <Li>{t('man_intro_li_poidetail')} <CostBadge cost={cr(PRICING_LIST.poi_detail)} /></Li>
            <Li>{t('man_intro_li_itin_1')} <CostBadge cost={crGiorno(PRICING_LIST.itinerary_daily)} /> {t('man_intro_li_itin_2')} <strong>{t('man_intro_li_itin_3')}</strong> {t('man_intro_li_itin_4')} WIP</Li>
            <Li>{t('man_intro_li_chat')} <CostBadge cost={cr10Msg(PRICING_LIST.chat_session)} /></Li>
            <Li>{t('man_intro_li_vision')} <CostBadge cost={cr(PRICING_LIST.photo_search)} /></Li>
            <Li><strong>{t('museum_pass_title')}</strong> {t('man_intro_li_museumpass', { h: MUSEUM_PASS_HOURS })} <CostBadge cost={cr(PRICING_LIST.museum_pass)} /></Li>
            <Li>{t('man_intro_li_library')} <FreeBadge label={t('man_gratis')} /></Li>
            <Li>{t('man_intro_li_community_1')} <strong>WIP Community</strong>{t('man_intro_li_community_2')} <FreeBadge label={t('man_gratis')} /> {t('man_intro_li_community_3')} <strong>{t('man_intro_li_community_4')}</strong></Li>
            <Li>{t('man_intro_li_guidapremium')} <CostBadge cost={crGiorno(PRICING_LIST.premium_guide_daily)} /> · {t('man_intro_li_podcast')} <CostBadge cost={crGiorno(PRICING_LIST.podcast_daily)} /></Li>
            <Li>{t('man_intro_li_offline')} <FreeBadge label={t('man_gratis')} /></Li>
          </ul>
          <P>{t('man_intro_p3')}</P>
        </>
      ),
    },
    {
      id: 'account',
      title: t('vr_a_guide_sec_account'),
      icon: KeyRound,
      content: (
        <>
          <H>{t('man_acc_h_create')}</H>
          <P>{t('man_acc_p_create')}</P>
          <p className="text-xs text-gray-500 -mt-2 mb-3">{t('man_acc_note_login')}</p>
          <H>{t('man_acc_h_forgot')}</H>
          <P>{t('man_acc_p_forgot_1')} <em>{t('man_acc_p_forgot_2')}</em>{t('man_acc_p_forgot_3')}</P>
          <H>{t('man_acc_h_biometric')}</H>
          <P>{t('man_acc_p_biometric')} <strong>{t('man_acc_bc_sicurezza')}</strong>{t('man_acc_p_biometric_2')}</P>
          <H>{t('man_acc_h_change')}</H>
          <ul className="mb-2">
            <Li><strong>{t('man_acc_li_pw_label')}</strong>{t('man_acc_li_pw')}</Li>
            <Li><strong>{t('man_acc_li_name_label')}</strong>{t('man_acc_li_name')}</Li>
          </ul>
          <H>{t('man_acc_h_delete')}</H>
          <P>{t('man_acc_p_delete')}</P>
        </>
      ),
    },
    {
      id: 'navbar',
      title: t('vr_a_guide_sec_navbar'),
      icon: Smartphone,
      content: (
        <>
          <P>{t('man_nav_p_intro')}</P>
          <ul className="mb-2">
            <Li><strong><Map className="w-4 h-4 inline" /> {t('man_nav_li_esplora_label')}</strong> — {t('man_nav_li_esplora_desc')}</Li>
            <Li><strong><Calendar className="w-4 h-4 inline" /> {t('man_nav_li_itin_label')}</strong> — {t('man_nav_li_itin_desc')}</Li>
            <Li><strong><PartyPopper className="w-4 h-4 inline" /> {t('man_nav_li_eventi_label')}</strong> — {t('man_nav_li_eventi_desc')}</Li>
            <Li><strong><Camera className="w-4 h-4 inline" /> {t('man_nav_li_wip_label')}</strong> — {t('man_nav_li_wip_desc')}</Li>
            <Li><strong><Headphones className="w-4 h-4 inline" /> {t('man_nav_li_guida_label')}</strong> — {t('man_nav_li_guida_desc')}</Li>
            <Li><strong><User className="w-4 h-4 inline" /> {t('man_nav_li_profilo_label')}</strong> — {t('man_nav_li_profilo_desc')}</Li>
          </ul>
          <H>{t('man_nav_h_guida')}</H>
          <ul className="mb-2">
            <Li>{t('man_nav_li_switch')}</Li>
            <Li>{t('man_nav_li_mute')}</Li>
            <Li>{t('man_nav_li_pause')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'map',
      title: t('vr_a_guide_sec_map'),
      icon: Map,
      content: (
        <>
          <P>{t('man_map_p_intro')}</P>
          <ul className="mb-2">
            <Li>{t('man_map_li_chips')}</Li>
            <Li>{t('man_map_li_pin')}</Li>
            <Li><Headphones className="w-4 h-4 inline" /> {t('man_map_li_cuffie')}</Li>
            <Li>{t('man_map_li_radar')}</Li>
          </ul>
          <H>{t('man_map_h_giro')}</H>
          <P>{t('man_map_p_giro_1')} <strong>{t('gr_crea_giro')}</strong> {t('man_map_p_giro_2')} <strong>{t('gr_avvia_navigazione')}</strong>{t('man_map_p_giro_3')}</P>
          <H>{t('man_map_h_beni')}</H>
          <P>{t('man_map_p_beni_1')}</P>
          <ul className="mb-2">
            <Li>{t('man_map_li_beni_1')}</Li>
            <Li>{t('man_map_li_beni_2')}</Li>
            <Li>{t('man_map_li_beni_3')}</Li>
          </ul>
          <H>{t('man_map_h_locali')}</H>
          <P>{t('man_map_p_locali')}</P>
        </>
      ),
    },
    {
      id: 'geocontrol',
      title: t('vr_a_guide_sec_geocontrol'),
      icon: Headphones,
      content: (
        <>
          <P>{t('man_geo_p_intro')}</P>
          <H>{t('man_geo_h_avvicini')}</H>
          <ul className="mb-2">
            <Li>{t('man_geo_li_1')} <FreeBadge label={t('man_gratis')} /></Li>
            <Li>{t('man_geo_li_2')} <FreeBadge label={t('man_gratis')} /></Li>
            <Li>{t('man_geo_li_3', { n: PRICING_LIST.audio_guide })}</Li>
          </ul>
          <H>{t('man_geo_h_modalita')}</H>
          <P>{t('man_geo_p_modalita')}</P>
          <H>{t('man_geo_h_trasporto')}</H>
          <P>{t('man_geo_p_trasporto')}</P>
        </>
      ),
    },
    {
      id: 'daypass',
      title: t('vr_a_guide_sec_daypass'),
      icon: Ticket,
      content: (
        <>
          <P>{t('man_dp_p_intro', { n: PRICING_LIST.day_pass })}</P>
          <ul className="mb-2">
            <Li>{t('man_dp_li_1', { n: DAY_PASS_GUIDE_CAP })}</Li>
            <Li>{t('man_dp_li_2')}</Li>
            <Li>{t('man_dp_li_3')}</Li>
            <Li>{t('man_dp_li_4')}</Li>
          </ul>
          <P><em>{t('man_dp_p_footer', { m: Math.floor(PRICING_LIST.day_pass / PRICING_LIST.audio_guide) })}</em></P>
        </>
      ),
    },
    {
      id: 'offline',
      title: t('vr_a_guide_sec_offline'),
      icon: WifiOff,
      content: (
        <>
          <P>{t('man_off_p_intro')}</P>
          <H>{t('man_off_h_cosa')}</H>
          <ul className="mb-2">
            <Li>{t('man_off_li_1')}</Li>
            <Li>{t('man_off_li_2')}</Li>
            <Li>{t('man_off_li_3')}</Li>
            <Li>{t('man_off_li_4')}</Li>
          </ul>
          <H>{t('man_off_h_consigli')}</H>
          <ul className="mb-2">
            <Li>{t('man_off_li_5')}</Li>
            <Li>{t('man_off_li_6').split('⟳')[0]}<RefreshCw className="w-3.5 h-3.5 inline" />{t('man_off_li_6').split('⟳')[1]}</Li>
            <Li>{t('man_off_li_7')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'plan',
      title: t('vr_a_guide_sec_plan'),
      icon: Compass,
      content: (
        <>
          <P>{t('man_plan_p_intro')} <CostBadge cost={crGiorno(PRICING_LIST.itinerary_daily)} /></P>
          <ul className="mb-2">
            <Li>{t('man_plan_li_chat')}</Li>
            <Li>{t('man_plan_li_rigenera')}</Li>
            <Li>{t('man_plan_li_segui')}</Li>
            <Li>{t('man_plan_li_offline', { n: PRICING_LIST.audio_guide + PRICING_LIST.poi_detail })}</Li>
            <Li>{t('man_plan_li_pdf', { n: PRICING_LIST.premium_guide_daily })}</Li>
          </ul>
          <H>{t('man_plan_h_giorno')}</H>
          <P>{t('man_plan_p_giorno')}</P>
          <ul className="mb-2">
            <Li>{t('man_plan_li_piedi')}</Li>
            <Li>{t('man_plan_li_auto')}</Li>
          </ul>
          <H>{t('man_plan_h_mute')}</H>
          <P>{t('man_plan_p_mute_1')}</P>
          <P>{t('man_plan_p_mute_2')}</P>
        </>
      ),
    },
    {
      id: 'library',
      title: t('vr_a_guide_sec_library'),
      icon: Bookmark,
      content: (
        <>
          <P>{t('man_lib_p_intro')} <FreeBadge label={t('man_gratis')} /></P>
          <ul className="mb-2">
            <Li>{t('man_lib_li_1')}</Li>
            <Li>{t('man_lib_li_2')}</Li>
            <Li>{t('man_lib_li_3')}</Li>
            <Li>{t('man_lib_li_4')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'wipnav',
      title: t('vr_a_guide_sec_wipnav'),
      icon: Navigation,
      content: (
        <>
          <P>{t('man_wn_p_intro')} <FreeBadge label={t('man_gratis')} /></P>
          <ul className="mb-2">
            <Li>{t('man_wn_li_1')}</Li>
            <Li>{t('man_wn_li_2')}</Li>
            <Li>{t('man_wn_li_3')}</Li>
            <Li>{t('man_wn_li_4')}</Li>
          </ul>
          <H>{t('man_wn_h_cruscotto')}</H>
          <P>{t('man_wn_p_cruscotto')}</P>
          <ul className="mb-2">
            <Li>{t('man_wn_li_5')}</Li>
            <Li>{t('man_wn_li_6')}</Li>
            <Li>{t('man_wn_li_7')}</Li>
          </ul>
          <P>{t('man_wn_p_auto')}</P>
        </>
      ),
    },
    {
      id: 'trails',
      title: t('vr_a_guide_sec_trails'),
      icon: Compass,
      content: (
        <>
          <H>{t('man_tr_h_cammini')}</H>
          <P>{t('man_tr_p_cammini')}</P>
          <H>{t('man_tr_h_fughe')}</H>
          <P>{t('man_tr_p_fughe')}</P>
          <ul className="mb-2">
            <Li>{t('man_tr_li_1')}</Li>
            <Li>{t('man_tr_li_2')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'events',
      title: t('vr_a_guide_sec_events'),
      icon: Star,
      content: (
        <>
          <P>{t('man_ev_p_intro')} <FreeBadge label={t('man_gratis')} /></P>
          <ul className="mb-2">
            <Li>{t('man_ev_li_switch')}</Li>
            <Li>{t('man_ev_li_1')}</Li>
            <Li>{t('man_ev_li_2')}</Li>
            <Li>{t('man_ev_li_3')}</Li>
          </ul>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-3">{t('man_ev_p_commission')}</p>
        </>
      ),
    },
    {
      id: 'rain',
      title: t('vr_a_guide_sec_rain'),
      icon: ShieldCheck,
      content: (
        <>
          <P>{t('man_rain_p_intro')}</P>
          <ul className="mb-2">
            <Li>{t('man_rain_li_1')}</Li>
            <Li>{t('man_rain_li_2')}</Li>
            <Li>{t('man_rain_li_3')}</Li>
            <Li>{t('man_rain_li_4')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'dashboard',
      title: t('vr_a_guide_sec_dashboard'),
      icon: Target,
      content: (
        <>
          <H>{t('man_db_h_passaporto')}</H>
          <P>{t('man_db_p_passaporto')}</P>
          <H>{t('man_db_h_salute')}</H>
          <P>{t('man_db_p_salute')}</P>
          <H>{t('man_db_h_co2')}</H>
          <P>{t('man_db_p_co2')}</P>
          <H>{t('man_db_h_calendario')}</H>
          <P>{t('man_db_p_calendario')}</P>
        </>
      ),
    },
    {
      id: 'chat',
      title: t('vr_a_guide_sec_chat'),
      icon: MessageSquare,
      content: (
        <>
          <P>{t('man_chat_p_intro')}</P>
          <ul className="mb-2">
            <Li>{t('man_chat_li_1', { n: PRICING_LIST.chat_session })}</Li>
            <Li>{t('man_chat_li_2', { n: PRICING_LIST.chat_session })}</Li>
            <Li>{t('man_chat_li_3')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'vision',
      title: t('vr_a_guide_sec_vision'),
      icon: Camera,
      content: (
        <>
          <P>{t('man_vis_p_1')} <CostBadge cost={cr(PRICING_LIST.photo_search)} /></P>
          <P>{t('man_vis_p_2')}</P>
          <H>{t('man_vis_h_museo')}</H>
          <P>{t('man_vis_p_museo', { h: MUSEUM_PASS_HOURS })} <CostBadge cost={cr(PRICING_LIST.museum_pass)} /></P>
          <ul className="mb-2">
            <Li>{t('man_vis_li_1')}</Li>
            <Li>{t('man_vis_li_2')}</Li>
            <Li>{t('man_vis_li_3', { h: MUSEUM_PASS_HOURS, m: Math.floor(PRICING_LIST.museum_pass / PRICING_LIST.photo_search) })}</Li>
            <Li>{t('man_vis_li_4')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'community',
      title: t('vr_a_guide_sec_community'),
      icon: Users,
      content: (
        <>
          <P>{t('man_com_p_intro')} <FreeBadge label={t('man_gratis')} /></P>
          <H>{t('man_com_h_come')}</H>
          <ul className="mb-2">
            <Li>{t('man_com_li_1')}</Li>
            <Li>{t('man_com_li_2')}</Li>
            <Li>{t('man_com_li_3')}</Li>
            <Li>{t('man_com_li_4')}</Li>
          </ul>
          <H>{t('man_com_h_proposte')}</H>
          <P>{t('man_com_p_proposte')}</P>
          <H>{t('man_com_h_cosa')}</H>
          <ul className="mb-2">
            <Li>{t('man_com_li_5')}</Li>
            <Li>{t('man_com_li_6')}</Li>
            <Li>{t('man_com_li_7')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'journal',
      title: t('vr_a_guide_sec_journal'),
      icon: History,
      content: (
        <>
          <P>{t('man_jr_p_intro')}</P>
          <ul className="mb-2">
            <Li>{t('man_jr_li_1')}</Li>
            <Li><Heart className="w-3.5 h-3.5 inline text-rose-500" /> {t('man_jr_li_2')}</Li>
          </ul>
        </>
      ),
    },
    {
      id: 'livetour',
      title: t('vr_a_guide_sec_livetour'),
      icon: Navigation,
      content: (
        <P>{t('man_lt_p')}</P>
      ),
    },
    {
      id: 'missions',
      title: t('vr_a_guide_sec_missions'),
      icon: Award,
      content: (
        <>
          <P>{t('man_ms_p_1')}</P>
          <P>{t('man_ms_p_2')}</P>
        </>
      ),
    },
    {
      id: 'credits',
      title: t('vr_a_guide_sec_credits'),
      icon: ShoppingCart,
      content: (
        <ul className="mb-2">
          <Li>{t('man_cr_li_1')}</Li>
          <Li>{t('man_cr_li_2')}</Li>
          <Li>{t('man_cr_li_3')}</Li>
          <Li>{t('man_cr_li_4')}</Li>
          <Li>{t('man_cr_li_5')}</Li>
        </ul>
      ),
    },
    {
      id: 'settings',
      title: t('vr_a_guide_sec_settings'),
      icon: Settings,
      content: (
        <ul className="mb-2">
          <Li>{t('man_st_li_1')}</Li>
          <Li>{t('man_st_li_2')}</Li>
          <Li>{t('man_st_li_3')}</Li>
          <Li>{t('man_st_li_4')}</Li>
          <Li>{t('man_st_li_5')}</Li>
          <Li>{t('man_st_li_6')}</Li>
          <Li>{t('man_st_li_7')}</Li>
          <Li>{t('man_st_li_8')}</Li>
          <Li>{t('man_st_li_9')}</Li>
        </ul>
      ),
    },
    {
      id: 'support',
      title: t('vr_a_guide_sec_support'),
      icon: LifeBuoy,
      content: (
        <>
          <H>{t('man_sp_h_contatti')}</H>
          <ul className="mb-2">
            <Li><Mail className="w-3.5 h-3.5 inline" /> {t('man_sp_li_1').split('support@wip.guide')[0]}<a href="mailto:support@wip.guide" className="text-primary font-bold underline">support@wip.guide</a>{t('man_sp_li_1').split('support@wip.guide')[1]}</Li>
            <Li>{t('man_sp_li_2')}</Li>
            <Li>{t('man_sp_li_3')}</Li>
            {/* (28/08/2026) Tolta la voce «Strutture e partner (B2B)»: la sezione
                Hotel/Partner non esiste piu' in nessuna piattaforma. */}
          </ul>
          <H>{t('man_sp_h_privacy')}</H>
          <P>{t('man_sp_p_privacy')}</P>
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
          <h2 className="text-2xl font-black text-gray-900">{t('vr_a_guide_title')}</h2>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('vr_a_guide_subtitle')}</p>
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
              {t('vr_a_guide_title')}
            </h1>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
              {t('vr_a_guide_subtitle')}
              {' · '}
              {new Date().toLocaleDateString(t('pf_locale'))}
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
