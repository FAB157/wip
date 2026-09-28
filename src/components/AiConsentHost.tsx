import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { EVENTO_RICHIESTA_CONSENSO_AI, type DecisioneConsensoAi } from '../lib/aiConsent';

// La finestra del consenso AI (App Store 5.1.1(i) / 5.1.2(i), 18/09/2026).
// Il testo dice le tre cose che il rifiuto chiede, in quest'ordine: QUALI dati
// partono, A CHI vanno (per nome), e chiede il permesso PRIMA dell'invio. Le
// stringhe stanno qui e non in i18n.ts perché sono testo legale: si rileggono
// e si cambiano tutte insieme, accanto alla finestra che le mostra.

type Lingua = 'IT' | 'EN' | 'FR' | 'ES' | 'DE' | 'RU' | 'ZH';

/** I fornitori a cui il server può inoltrare la richiesta. Stesso elenco della privacy policy. */
export const FORNITORI_AI = 'OpenAI, Google (Gemini), Groq, DeepSeek, Together AI';

const TESTI: Record<Lingua, { titolo: string; intro: string; cosaTitolo: string; cosa: string[]; chiTitolo: string; chi: string; mai: string; revoca: string; policy: string; consenti: string; nega: string }> = {
  IT: {
    titolo: 'Funzioni AI: serve il tuo permesso',
    intro: 'Le audioguide dei luoghi, la chat «Chiedi a WIP», AI Scan, «Chiedi alla guida» nei musei e la creazione degli itinerari usano servizi di intelligenza artificiale di terze parti. Prima di inviare qualcosa ti chiediamo il permesso.',
    cosaTitolo: 'Quali dati vengono inviati',
    cosa: [
      'per le audioguide: solo il nome del luogo e la lingua (nessun tuo dato)',
      'il testo dei messaggi e delle domande che scrivi o detti',
      'le foto che scatti o carichi in AI Scan',
      'la tua posizione approssimativa e la lingua dell’app, per risposte pertinenti',
      'le preferenze di viaggio che indichi (destinazione, date, interessi)',
    ],
    chiTitolo: 'A chi vengono inviati',
    chi: `Passano dai server di WIP e vengono elaborati da: ${FORNITORI_AI}. Servono solo a generare la risposta.`,
    mai: 'Nome, email, dati di pagamento e identificativi dell’account non vengono mai inviati a questi servizi, e nessun dato è usato per pubblicità.',
    revoca: 'Puoi revocare il permesso quando vuoi da Profilo → Privacy. Se non consenti, il resto dell’app funziona normalmente: restano spente solo le funzioni AI.',
    policy: 'Informativa privacy',
    consenti: 'Consenti',
    nega: 'Non consentire',
  },
  EN: {
    titolo: 'AI features: your permission is needed',
    intro: 'Place audio guides, the “Ask WIP” chat, AI Scan, “Ask the guide” in museums and itinerary creation use third-party artificial intelligence services. Before anything is sent, we ask for your permission.',
    cosaTitolo: 'What data is sent',
    cosa: [
      'for audio guides: only the place name and the language (none of your data)',
      'the text of the messages and questions you type or dictate',
      'the photos you take or upload in AI Scan',
      'your approximate location and the app language, for relevant answers',
      'the travel preferences you enter (destination, dates, interests)',
    ],
    chiTitolo: 'Who it is sent to',
    chi: `It goes through WIP’s servers and is processed by: ${FORNITORI_AI}. It is used only to generate your answer.`,
    mai: 'Your name, email, payment details and account identifiers are never sent to these services, and no data is used for advertising.',
    revoca: 'You can withdraw this permission at any time in Profile → Privacy. If you don’t allow it, the rest of the app works normally: only the AI features stay off.',
    policy: 'Privacy policy',
    consenti: 'Allow',
    nega: 'Don’t allow',
  },
  FR: {
    titolo: 'Fonctions IA : votre autorisation est nécessaire',
    intro: 'Les audioguides des lieux, le chat « Demander à WIP », AI Scan, « Demander au guide » dans les musées et la création d’itinéraires utilisent des services d’intelligence artificielle tiers. Avant tout envoi, nous vous demandons votre autorisation.',
    cosaTitolo: 'Quelles données sont envoyées',
    cosa: [
      'pour les audioguides : uniquement le nom du lieu et la langue (aucune de vos données)',
      'le texte des messages et questions que vous écrivez ou dictez',
      'les photos que vous prenez ou importez dans AI Scan',
      'votre position approximative et la langue de l’app, pour des réponses pertinentes',
      'les préférences de voyage que vous indiquez (destination, dates, centres d’intérêt)',
    ],
    chiTitolo: 'À qui elles sont envoyées',
    chi: `Elles passent par les serveurs de WIP et sont traitées par : ${FORNITORI_AI}. Elles servent uniquement à générer la réponse.`,
    mai: 'Votre nom, e-mail, données de paiement et identifiants de compte ne sont jamais envoyés à ces services, et aucune donnée n’est utilisée pour la publicité.',
    revoca: 'Vous pouvez retirer cette autorisation à tout moment dans Profil → Confidentialité. Si vous refusez, le reste de l’app fonctionne normalement : seules les fonctions IA restent désactivées.',
    policy: 'Politique de confidentialité',
    consenti: 'Autoriser',
    nega: 'Ne pas autoriser',
  },
  ES: {
    titolo: 'Funciones de IA: necesitamos tu permiso',
    intro: 'Las audioguías de los lugares, el chat «Pregunta a WIP», AI Scan, «Pregunta al guía» en los museos y la creación de itinerarios usan servicios de inteligencia artificial de terceros. Antes de enviar nada, te pedimos permiso.',
    cosaTitolo: 'Qué datos se envían',
    cosa: [
      'para las audioguías: solo el nombre del lugar y el idioma (ningún dato tuyo)',
      'el texto de los mensajes y preguntas que escribes o dictas',
      'las fotos que haces o subes en AI Scan',
      'tu ubicación aproximada y el idioma de la app, para respuestas pertinentes',
      'las preferencias de viaje que indicas (destino, fechas, intereses)',
    ],
    chiTitolo: 'A quién se envían',
    chi: `Pasan por los servidores de WIP y los procesan: ${FORNITORI_AI}. Solo sirven para generar la respuesta.`,
    mai: 'Tu nombre, email, datos de pago e identificadores de cuenta nunca se envían a estos servicios, y ningún dato se usa para publicidad.',
    revoca: 'Puedes retirar el permiso cuando quieras en Perfil → Privacidad. Si no lo permites, el resto de la app funciona con normalidad: solo quedan apagadas las funciones de IA.',
    policy: 'Política de privacidad',
    consenti: 'Permitir',
    nega: 'No permitir',
  },
  DE: {
    titolo: 'KI-Funktionen: Deine Erlaubnis ist nötig',
    intro: 'Die Audioguides der Orte, der Chat „WIP fragen“, AI Scan, „Guide fragen“ in Museen und die Erstellung von Reiserouten nutzen KI-Dienste von Drittanbietern. Bevor etwas gesendet wird, bitten wir dich um Erlaubnis.',
    cosaTitolo: 'Welche Daten gesendet werden',
    cosa: [
      'für Audioguides: nur der Name des Ortes und die Sprache (keine deiner Daten)',
      'der Text der Nachrichten und Fragen, die du schreibst oder diktierst',
      'die Fotos, die du in AI Scan aufnimmst oder hochlädst',
      'dein ungefährer Standort und die App-Sprache, für passende Antworten',
      'die Reisevorlieben, die du angibst (Ziel, Daten, Interessen)',
    ],
    chiTitolo: 'An wen sie gesendet werden',
    chi: `Sie laufen über die Server von WIP und werden verarbeitet von: ${FORNITORI_AI}. Sie dienen nur dazu, die Antwort zu erzeugen.`,
    mai: 'Name, E-Mail, Zahlungsdaten und Kontokennungen werden nie an diese Dienste gesendet, und keine Daten werden für Werbung verwendet.',
    revoca: 'Du kannst die Erlaubnis jederzeit unter Profil → Datenschutz widerrufen. Ohne Erlaubnis funktioniert der Rest der App normal: Nur die KI-Funktionen bleiben aus.',
    policy: 'Datenschutzerklärung',
    consenti: 'Erlauben',
    nega: 'Nicht erlauben',
  },
  RU: {
    titolo: 'Функции ИИ: нужно ваше разрешение',
    intro: 'Аудиогиды мест, чат «Спросить WIP», AI Scan, «Спросить гида» в музеях и создание маршрутов используют сторонние сервисы искусственного интеллекта. Прежде чем что-либо отправить, мы просим вашего разрешения.',
    cosaTitolo: 'Какие данные отправляются',
    cosa: [
      'для аудиогидов: только название места и язык (никаких ваших данных)',
      'текст сообщений и вопросов, которые вы пишете или диктуете',
      'фотографии, которые вы снимаете или загружаете в AI Scan',
      'ваше приблизительное местоположение и язык приложения — для уместных ответов',
      'указанные вами предпочтения поездки (направление, даты, интересы)',
    ],
    chiTitolo: 'Кому они отправляются',
    chi: `Данные проходят через серверы WIP и обрабатываются: ${FORNITORI_AI}. Они используются только для формирования ответа.`,
    mai: 'Имя, email, платёжные данные и идентификаторы аккаунта никогда не передаются этим сервисам, и никакие данные не используются для рекламы.',
    revoca: 'Разрешение можно отозвать в любой момент: Профиль → Конфиденциальность. Без разрешения остальное приложение работает как обычно: отключены только функции ИИ.',
    policy: 'Политика конфиденциальности',
    consenti: 'Разрешить',
    nega: 'Не разрешать',
  },
  ZH: {
    titolo: 'AI 功能：需要您的许可',
    intro: '地点语音导览、“问问 WIP”聊天、AI Scan、博物馆中的“问问导览员”和行程创建会使用第三方人工智能服务。在发送任何内容之前，我们先征求您的许可。',
    cosaTitolo: '会发送哪些数据',
    cosa: [
      '语音导览：仅发送地点名称和语言（不含您的任何数据）',
      '您输入或口述的消息和问题的文字',
      '您在 AI Scan 中拍摄或上传的照片',
      '您的大致位置和应用语言，用于提供相关回答',
      '您填写的旅行偏好（目的地、日期、兴趣）',
    ],
    chiTitolo: '发送给谁',
    chi: `数据经由 WIP 的服务器，由以下服务处理：${FORNITORI_AI}。仅用于生成回答。`,
    mai: '您的姓名、电子邮箱、支付信息和账户标识绝不会发送给这些服务，任何数据都不会用于广告。',
    revoca: '您可以随时在“个人资料 → 隐私”中撤回许可。若不允许，应用的其余部分照常使用，仅 AI 功能保持关闭。',
    policy: '隐私政策',
    consenti: '允许',
    nega: '不允许',
  },
};

export function testiConsensoAi(language?: string) {
  const l = String(language || 'IT').toUpperCase().slice(0, 2) as Lingua;
  return TESTI[l] || TESTI.EN;
}

export default function AiConsentHost({ language }: { language?: string }) {
  const [aperta, setAperta] = useState(false);
  const decidiRef = useRef<DecisioneConsensoAi | null>(null);

  useEffect(() => {
    const suRichiesta = (e: Event) => {
      const dettaglio = (e as CustomEvent).detail;
      if (!dettaglio || typeof dettaglio.decidi !== 'function') return;
      dettaglio.preso = true;
      decidiRef.current = dettaglio.decidi;
      setAperta(true);
    };
    window.addEventListener(EVENTO_RICHIESTA_CONSENSO_AI, suRichiesta);
    return () => {
      window.removeEventListener(EVENTO_RICHIESTA_CONSENSO_AI, suRichiesta);
      // Smontato con una richiesta aperta: vale come «no», mai come «sì».
      decidiRef.current?.(false);
      decidiRef.current = null;
    };
  }, []);

  if (!aperta) return null;
  const t = testiConsensoAi(language);

  const chiudi = (concesso: boolean) => {
    setAperta(false);
    const decidi = decidiRef.current;
    decidiRef.current = null;
    decidi?.(concesso);
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wip-ai-consent-titolo"
    >
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h2 id="wip-ai-consent-titolo" className="text-[17px] font-black text-slate-900 leading-tight">{t.titolo}</h2>
        </div>

        <p className="text-[13px] text-slate-700 leading-snug mb-3">{t.intro}</p>

        <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500 mb-1">{t.cosaTitolo}</p>
        <ul className="list-disc pl-5 mb-3 space-y-0.5">
          {t.cosa.map((riga) => (
            <li key={riga} className="text-[13px] text-slate-800 leading-snug">{riga}</li>
          ))}
        </ul>

        <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500 mb-1">{t.chiTitolo}</p>
        <p className="text-[13px] text-slate-800 leading-snug mb-3">{t.chi}</p>

        <p className="text-[12px] text-slate-600 leading-snug mb-2">{t.mai}</p>
        <p className="text-[12px] text-slate-600 leading-snug mb-3">{t.revoca}</p>

        <a
          href="https://wip.guide/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[12px] font-bold text-primary underline mb-4"
        >
          {t.policy}
        </a>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => chiudi(false)}
            className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-800 text-[14px] font-black active:scale-95 transition-all"
          >
            {t.nega}
          </button>
          <button
            type="button"
            onClick={() => chiudi(true)}
            className="flex-1 px-4 py-3 rounded-2xl bg-primary text-white text-[14px] font-black active:scale-95 transition-all"
          >
            {t.consenti}
          </button>
        </div>
      </div>
    </div>
  );
}
