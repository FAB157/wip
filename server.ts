// @ts-nocheck
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import dns from "node:dns";
import axios from "axios";
import Groq from "groq-sdk";
import * as agentTools from "./agentTools.js";
import Stripe from 'stripe';

const StripeConstructor = (Stripe as any).default || Stripe;
const stripeClient = process.env.STRIPE_SECRET_KEY ? new (StripeConstructor as any)(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any }) : null;

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore dns error
}

try {
  const dotenvObj = (dotenv as any).default || dotenv;
  if (dotenvObj && dotenvObj.config) dotenvObj.config();
} catch (e) {
  // Ignore dotenv error
}

function isGenericUtilityName(name?: string | null): boolean {
  if (!name) return true;
  const lower = name.trim().toLowerCase();
  
  // Generic single words
  const genericWords = [
    "parcheggio", "parco", "giardino", "giardinetti", "giardinetto", "villa",
    "parking", "park", "garden", "playground", "posteggio", "sosta", "stazionamento",
    "luogo d'interesse", "luogo d interesse", "area camper", "area sosta", "area di sosta", "sito", "punto"
  ];
  
  if (genericWords.includes(lower)) return true;

  // Generic combinations (starts with or is composed of generic terms)
  const genericRegex = /^(parcheggio|parco|giardino|giardini|giardinetto|giardinetti|parking|park|garden|area verde|area di sosta|area sosta|posteggio|sosta)\b/i;
  
  if (genericRegex.test(lower)) {
    const genericDescriptors = [
      "pubblico", "pubblici", "comunale", "comunali", "gratuito", "gratuiti", "pagamento", "privato", "privati",
      "riservato", "riservati", "clienti", "coperto", "scoperto", "cittadino", "cittadini", "auto", "camper",
      "moto", "disabili", "residenti", "gratis", "free", "public", "private", "custodito", "interrato", "multipiano"
    ];
    
    const words = lower.split(/\s+/);
    if (words.length <= 4) {
      const isAllGeneric = words.slice(1).every(w => genericDescriptors.includes(w) || w === "a" || w === "di" || w === "per" || w === "e");
      if (isAllGeneric) {
        return true;
      }
    }
  }

  return false;
}

// --- CENTRAL AI HELPER WITH FALLBACK & TOKEN TRACKING ---
// Rotazione delle chiavi Agnes AI (load balancing come nello script di
// enrichment massivo). Si resetta a ogni cold start serverless: va bene.
let agnesKeyCounter = 0;

async function callUniversalAi(
  primaryEngine: "agnes" | "deepseek" | "groq" | "together",
  messages: any[],
  options: any = {},
  featureContext: string = "general",
  supabaseUrl: string,
  supabaseServiceKey: string,
  groqInstance: any,
  userId?: string
) {
  let finalModel = "";
  let responseData: any;
  let tokensUsed = 0;
  let textContent = "";

  const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY || process.env.VITE_TOGETHER_API_KEY;

  async function tryEngine(engine: string) {
    if (engine === "agnes") {
      // Tollera anche la variante AGNES_AI_API_KEY: su Vercel la chiave può
      // essere stata configurata con quel nome e senza questa riga Agnes
      // veniva saltato in silenzio.
      const agnesKeys = [process.env.AGNES_API_KEY, process.env.AGNES_API_KEY_2, process.env.AGNES_AI_API_KEY, process.env.AGNES_AI_API_KEY2].filter(Boolean);
      if (agnesKeys.length === 0) return false;
      const agnesKey = agnesKeys[agnesKeyCounter++ % agnesKeys.length];
      finalModel = (options.model || "").startsWith("agnes") ? options.model : "agnes-2.5-flash";
      // API OpenAI-compatibile (stessa usata da scripts/mass_enrich_background.ts)
      const res = await axios.post("https://apihub.agnes-ai.com/v1/chat/completions", {
        model: finalModel,
        messages,
        response_format: options.response_format,
        temperature: options.temperature || 0.7
      }, { headers: { "Authorization": `Bearer ${agnesKey}` }, timeout: 60000 });
      textContent = res.data.choices?.[0]?.message?.content || "";
      responseData = res.data;
      tokensUsed = res.data.usage?.total_tokens || 0;
      return true;
    }

    if (engine === "deepseek" && deepseekKey) {
      finalModel = "deepseek-chat";
      const res = await axios.post("https://api.deepseek.com/chat/completions", {
        model: "deepseek-chat",
        messages,
        response_format: options.response_format,
        temperature: options.temperature || 0.7,
        // Senza tetto esplicito deepseek-chat si ferma al default (4096) e
        // tronca in silenzio gli output lunghi (guide premium, itinerari).
        max_tokens: options.max_tokens || 8192
      }, { headers: { "Authorization": `Bearer ${deepseekKey}` }, timeout: 120000 });
      textContent = res.data.choices?.[0]?.message?.content || "";
      responseData = res.data;
      tokensUsed = res.data.usage?.total_tokens || 0;
      return true;
    }

    if (engine === "groq") {
      const groqInstance = getGroqClient();
      if (!groqInstance) return false;
      finalModel = options.model || "llama-3.3-70b-versatile";
      const r = await groqInstance.chat.completions.create({
        messages,
        model: finalModel,
        ...options
      });
      textContent = r.choices?.[0]?.message?.content || "";
      responseData = r;
      tokensUsed = r.usage?.total_tokens || 0;
      return true;
    }

    if (engine === "together" && togetherKey) {
      finalModel = options.model || "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";
      const togetherOptions: any = {
        model: finalModel,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 8000
      };
      if (options.response_format?.type === "json_object") {
        togetherOptions.response_format = { type: "json_object" };
      }
      const res = await axios.post("https://api.together.xyz/v1/chat/completions", togetherOptions, {
        headers: { "Authorization": `Bearer ${togetherKey}` }, timeout: 15000
      });
      textContent = res.data.choices?.[0]?.message?.content || "";
      responseData = res.data;
      tokensUsed = res.data.usage?.total_tokens || 0;
      return true;
    }

    return false;
  }

  // ENGINE QUEUE CON FALLBACK DINAMICO
  // Se il primario fallisce, prova gli altri in ordine.
  // options.strictEngine = true → nessun fallback: il contenuto viene prodotto
  // dal motore richiesto o non viene prodotto affatto (usato dove il modello
  // fa parte della promessa al cliente, es. podcast e guide d'autore).
  // "gemini" è escluso dalle code: tryEngine non lo gestisce e restituiva
  // sempre false, mascherando la catena reale nei log.
  const engineQueue = options.strictEngine
    ? [primaryEngine]
    : primaryEngine === "agnes"
      ? ["agnes", "groq", "deepseek"]
      : primaryEngine === "deepseek"
        ? ["deepseek", "agnes", "groq"]
        // Groq (arricchimento POI, teaser, contenuti brevi): fallback su
        // Agnes come richiesto, DeepSeek solo come ultima rete di sicurezza.
        : ["groq", "agnes", "deepseek"];

  let success = false;
  let lastError = null;

  for (const eng of engineQueue) {
    try {
      success = await tryEngine(eng);
      if (success) {
        console.log(`[Universal AI] Success with ${eng} (Requested: ${primaryEngine})`);
        break;
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`[Universal AI] ${eng} failed: ${e.message}. Trying next...`);
    }
  }

  // Logica specifica per Gemini (Fallback di emergenza se non gestito sopra)
  if (!success && ai) {
    try {
      console.log("[Universal AI] Final Fallback: Attempting Gemini 1.5 Flash...");
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

      const genRes = await model.generateContent(prompt);
      textContent = genRes.response.text();
      finalModel = "gemini-1.5-flash";
      success = true;
    } catch (gemErr) {
      console.error("[Universal AI] Critical: Gemini fallback failed too.");
    }
  }

  if (!success) {
    throw new Error(`Tutti i motori AI sono saturi. Ultimo errore: ${lastError?.message}`);
  }

  // Telemetry precisa al centesimo
  try {
    const apiName = finalModel.includes('agnes') ? 'agnes_flash' : (finalModel.includes('deepseek') ? 'deepseek_v4_flash' : (finalModel.includes('llama') ? 'groq_llama' : (finalModel.includes('gemini') ? 'gemini_flash' : 'together_ai')));

    // Calcolo costo reale DeepSeek V4 Flash: $0.14/1M input, $0.28/1M output
    let realCost = 0;
    if (finalModel.includes('deepseek')) {
      const inputTokens = responseData.usage?.prompt_tokens || 0;
      const outputTokens = responseData.usage?.completion_tokens || 0;
      realCost = (inputTokens * (0.14 / 1000000)) + (outputTokens * (0.28 / 1000000));
    } else {
      // Fallback per altri motori (stima generica; 0 per i gratuiti Groq/Agnes)
      realCost = (finalModel.includes('llama') || finalModel.includes('agnes')) ? 0 : 0.005;
    }

    const userPart = userId ? ` | User: ${userId}` : '';
    // user_id in colonna dedicata (il pannello admin lo usa per la ricerca
    // per email); resta anche nel context per i tool che parsano il testo.
    const realUserId = userId && userId !== 'mock-user-id' && userId !== 'anonymous' ? userId : null;
    await insertApiUsageLog({
      api_name: apiName,
      feature_context: `${featureContext} | Token: ${tokensUsed}${userPart}`,
      user_id: realUserId,
      cost_estimation: realCost,
      tokens_used: tokensUsed,
      prompt_tokens: responseData.usage?.prompt_tokens || 0,
      completion_tokens: responseData.usage?.completion_tokens || 0,
      success: true
    });
  } catch (e: any) {}

  return { ...responseData, data: textContent };
}

// ── TELEMETRIA API RESILIENTE ──────────────────────────────────────────
// Il DB live è rimasto senza le colonne estese di api_usage_logs
// (cost_estimation, user_id, prompt_tokens, completion_tokens, success):
// l'insert completo falliva in silenzio da mesi → zero log e pannello
// "API e costi" vuoto. Finché la migrazione
// supabase/migrations/20260807120000_admin_observability.sql non viene
// applicata, si ripiega automaticamente sulle sole colonne base.
async function insertApiUsageLog(payload: any) {
  const headers = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };
  try {
    await axios.post(`${supabaseUrl}/rest/v1/api_usage_logs`, payload, { headers });
  } catch (e: any) {
    try {
      await axios.post(`${supabaseUrl}/rest/v1/api_usage_logs`, {
        api_name: payload.api_name,
        feature_context: payload.feature_context,
        tokens_used: payload.tokens_used ?? 0
      }, { headers });
    } catch (e2: any) { /* telemetria: mai bloccante */ }
  }
}

// ── LOG ERRORI DI SISTEMA ──────────────────────────────────────────────
// Scrive in system_errors (tab admin "Errori di Sistema"). La tabella nasce
// con la migrazione 20260807120000_admin_observability.sql: finché non è
// applicata (o su errore qualsiasi) fallisce IN SILENZIO — mai bloccare la
// richiesta che sta loggando. `context` finisce nel jsonb `context`; source/
// error_message/details vengono duplicati per compatibilità col pannello.
async function logSystemError(level: 'critical' | 'error' | 'warning' | 'info', message: string, context: any = {}) {
  try {
    const headers = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: 'return=minimal' };
    const msg = String(message || 'Errore sconosciuto').slice(0, 2000);
    const source = context?.source || 'server';
    const payload: any = {
      level,
      message: msg,
      stack: context?.stack ? String(context.stack).slice(0, 4000) : null,
      context,
      source
    };
    try {
      await axios.post(`${supabaseUrl}/rest/v1/system_errors`, payload, { headers });
    } catch {
      // Schema legacy (source/error_message/details, creato da batch-ensure):
      // secondo tentativo con le sole colonne storiche.
      await axios.post(`${supabaseUrl}/rest/v1/system_errors`, {
        source,
        error_message: msg,
        details: JSON.stringify(context || {}).slice(0, 2000)
      }, { headers });
    }
  } catch { /* logging best-effort: mai propagare */ }
}

// ── ANTI-ALLUCINAZIONE ─────────────────────────────────────────────────
// Blocco di regole condiviso tra itinerari (tutte le modalità) e guida
// premium d'autore. Il generatore (DeepSeek) riceve queste istruzioni
// vincolanti; poi /api/itinerary/verify fa il cross-check con un motore
// DIVERSO (Agnes, fallback Groq) per intercettare le allucinazioni residue.
const ANTI_HALLUCINATION_RULES = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE ANTI-ALLUCINAZIONE E FONTI (VINCOLANTI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SOLO LUOGHI REALI: proponi esclusivamente luoghi, ristoranti e attrazioni di cui sei CERTO che esistano con quel nome esatto in quella città. Se hai il minimo dubbio, NON proporli: scegli un'alternativa più nota di cui sei certo. Una sola tappa inventata rende l'itinerario un fallimento totale.
2. TAPPE DA FONTI AUTOREVOLI: scegli le tappe attingendo a ciò che segnalano guide, riviste e blog di viaggio autorevoli che conosci (Lonely Planet, Guida Michelin, Gambero Rosso, 50 Top Pizza, Time Out, Touring Club, Condé Nast Traveller, blog gastronomici e di viaggio noti): mescola i classici tradizionali imperdibili con le tendenze più recenti segnalate da queste fonti.
3. CAMPO "fonte" OBBLIGATORIO in ogni tappa: indica la fonte o il motivo della scelta (es. "Guida Michelin", "Gambero Rosso", "classico tradizionale", "50 Top Pizza"). MAI inventare citazioni: se non ricordi una fonte precisa scrivi "conoscenza locale".
4. VINCOLI DELL'UTENTE = FILTRO ASSOLUTO: se l'utente specifica esigenze (es. "pranzo gluten free", "vegetariano", "senza barriere", budget), OGNI tappa interessata DEVE rispettarle realmente (es. locali con menu senza glutine noto o certificazione AIC). Se non conosci con certezza un locale conforme, dichiaralo esplicitamente nel testo della tappa e proponi la scelta più sicura: è VIETATO fingere conformità.
5. NIENTE DATI INVENTATI: date storiche, prezzi e orari solo se li conosci davvero; altrimenti usa formule prudenti ("circa", un range) invece di numeri precisi falsi.
6. LINK SOLO VERIFICATI: inserisci "link_info" SOLO se sei CERTO del dominio ufficiale del luogo. Nel dubbio lascia il campo VUOTO: i link vengono verificati automaticamente dopo la generazione e quelli inventati o morti vengono rimossi, quindi inventarli è inutile oltre che vietato.`;

// Estrae le tappe sia dal formato itinerario (giorni[].tappe[]) sia dal
// formato guida premium (giorni[].pois[]).
function extractItineraryStops(obj: any): any[] {
  const stops: any[] = [];
  (obj?.giorni || []).forEach((g: any, gi: number) => {
    (g?.tappe || g?.pois || []).forEach((t: any) => {
      if (t && typeof t === 'object') stops.push({ giorno: g?.giorno ?? gi + 1, ref: t });
    });
  });
  return stops;
}

// Cross-check anti-allucinazione: un motore DIVERSO dal generatore rilegge
// le tappe e segnala luoghi inesistenti/dubbi o non conformi ai vincoli
// espliciti dell'utente. MUTA l'oggetto: aggiunge per tappa "verifica"
// ('verificata' | 'da_verificare' | 'non_conforme') e "nota_verifica".
// Fail-open: qualsiasi errore lascia l'itinerario com'è.
async function verifyItineraryAntiHallucination(itineraryObj: any, opts: any) {
  const { destination, lat, lon, radiusKm, specialRequests, interests, language } = opts || {};
  const stops = extractItineraryStops(itineraryObj).slice(0, 60);
  if (stops.length === 0) return { checked: 0, flagged: 0 };

  // Nota "chicca" nella lingua dell'utente: tono da consiglio, NON da allarme.
  // Il verdetto "dubbio" = luogo vero ma poco famoso; il vecchio "⚠ Luogo poco
  // documentato: verifica prima di andare" faceva sembrare la tappa inventata.
  const HIDDEN_GEM_NOTES: Record<string, string> = {
    IT: "💎 Gemma fuori dai circuiti più battuti: ti consigliamo di controllare orari e giorni di apertura prima della visita.",
    EN: "💎 A gem off the beaten path: we recommend checking opening days and hours before your visit.",
    FR: "💎 Une pépite hors des sentiers battus : nous vous conseillons de vérifier les horaires d'ouverture avant votre visite.",
    ES: "💎 Una joya fuera de las rutas más frecuentadas: te recomendamos comprobar los horarios de apertura antes de tu visita.",
    DE: "💎 Ein Geheimtipp abseits der üblichen Routen: Wir empfehlen, die Öffnungszeiten vor dem Besuch zu prüfen.",
    RU: "💎 Скрытая жемчужина вдали от туристических маршрутов: советуем уточнить часы работы перед посещением.",
    ZH: "💎 小众宝藏景点：建议出发前确认开放时间。"
  };
  const hiddenGemNote = HIDDEN_GEM_NOTES[String(language || 'IT').toUpperCase()] || HIDDEN_GEM_NOTES.IT;

  // 1) Controllo geografico deterministico: tappe lontane dalla destinazione
  //    = probabile luogo omonimo in un'altra città o coordinate inventate.
  let flagged = 0;
  if (typeof lat === 'number' && typeof lon === 'number') {
    const maxKm = Math.max(Number(radiusKm) || 100, 30) * 1.5;
    stops.forEach((s) => {
      const c = s.ref?.coordinate;
      const slat = Number(c?.lat), slng = Number(c?.lng ?? c?.lon);
      if (isFinite(slat) && isFinite(slng) && slat !== 0 && slng !== 0) {
        const dKm = Math.sqrt(
          Math.pow((slat - lat) * 111, 2) +
          Math.pow((slng - lon) * 111 * Math.cos(lat * Math.PI / 180), 2)
        );
        if (dKm > maxKm) {
          s.ref.verifica = 'da_verificare';
          s.ref.nota_verifica = `⚠ Coordinate a ~${Math.round(dKm)} km dalla destinazione: possibile luogo omonimo o coordinate errate.`;
          flagged++;
        }
      }
    });
  }

  // 2) Verifica REALE dei link (parte SUBITO, in parallelo col cross-check
  //    AI del punto 3): un link_info che non risponde viene RIMOSSO invece
  //    di mandare l'utente su un sito inventato. 401/403/405 = il dominio
  //    esiste (bot-block): il link viene tenuto.
  const okStatus = (st: number) => st < 500 && st !== 404 && st !== 410;
  const linkChecksPromise = Promise.all(
    stops
      .filter((s) => typeof s.ref?.link_info === 'string' && /^https?:\/\//i.test(s.ref.link_info))
      .slice(0, 24)
      .map(async (s) => {
        const url = s.ref.link_info;
        try {
          await axios.head(url, { timeout: 4000, maxRedirects: 3, validateStatus: okStatus });
        } catch (_headErr) {
          try {
            // Alcuni siti rifiutano HEAD: ultimo tentativo con GET leggero
            const r = await axios.get(url, { timeout: 4000, maxRedirects: 3, responseType: 'stream', validateStatus: okStatus });
            try { (r.data as any)?.destroy?.(); } catch (_e) {}
          } catch (_getErr) {
            s.ref.link_info = '';
            s.ref.nota_verifica = [s.ref.nota_verifica, 'Link al sito rimosso: non raggiungibile o inesistente.'].filter(Boolean).join(' ');
            flagged++;
          }
        }
      })
  ).catch(() => {});

  // 3) Cross-check AI con motore diverso (Agnes primario, fallback Groq)
  const compact = stops.map((s, i) => ({
    n: i,
    titolo: s.ref.titolo_tappa || s.ref.titolo || '',
    tipo: s.ref.tipo || s.ref.categoria_pdf || '',
    fonte: s.ref.fonte || '',
    giorno: s.giorno,
  }));
  const constraints = [specialRequests, (Array.isArray(interests) ? interests : []).join(', ')].filter(Boolean).join(' | ') || 'nessuno';

  const verifierPrompt = `Sei il revisore anti-allucinazioni di un'app di viaggi. Un ALTRO modello ha generato un itinerario per "${destination}". Il tuo compito è SOLO verificare, non riscrivere.
Per OGNI tappa dell'elenco valuta:
- "esiste": "si" se sei certo che il luogo esista con quel nome in quella città; "no" se sei certo che NON esista o che sia in un'altra città; "dubbio" se non ne hai mai sentito parlare.
- "conforme": "si" o "no" rispetto ai vincoli espliciti dell'utente: ${constraints}. (Es.: se il vincolo è "pranzo gluten free", un locale per i pasti senza opzioni senza glutine note è "no".)
- "motivo": max 15 parole, solo se esiste è diverso da "si" oppure conforme è "no".
- "alternativa": SOLO se esiste="no", il nome di un luogo REALE e famoso equivalente nella stessa città; altrimenti null.
Sii severo sulle invenzioni ma non bocciare luoghi veri poco famosi: in quel caso usa "dubbio".
Rispondi SOLO con JSON: {"verdetti":[{"n":0,"esiste":"si","conforme":"si","motivo":null,"alternativa":null}]}

TAPPE:
${JSON.stringify(compact)}`;

  const vSupabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const vServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const aiRes = await callUniversalAi('agnes', [
    { role: 'user', content: verifierPrompt }
  ], { temperature: 0.1, response_format: { type: 'json_object' } }, 'itinerary_verify', vSupabaseUrl, vServiceKey, null);

  let verdicts: any[] = [];
  try {
    const cleaned = String(aiRes.data || '').replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    verdicts = parsed.verdetti || parsed.verdicts || [];
  } catch (e) {
    await linkChecksPromise;
    return { checked: stops.length, flagged, note: 'verifier_parse_failed' };
  }

  verdicts.forEach((v: any) => {
    const s = stops[Number(v.n)];
    if (!s) return;
    if (v.esiste === 'no') {
      s.ref.verifica = 'da_verificare';
      s.ref.nota_verifica = `⚠ Tappa non confermata${v.motivo ? `: ${v.motivo}` : ''}${v.alternativa ? `. Alternativa sicura: ${v.alternativa}` : ''}`;
      flagged++;
    } else if (v.conforme === 'no') {
      s.ref.verifica = 'non_conforme';
      s.ref.nota_verifica = `⚠ Potrebbe non rispettare le tue richieste${v.motivo ? `: ${v.motivo}` : ''}`;
      flagged++;
    } else if (v.esiste === 'dubbio') {
      if (!s.ref.verifica) {
        // 'poco_noto' e non 'da_verificare': il client lo mostra come
        // consiglio (stile info), non come allarme ambra.
        s.ref.verifica = 'poco_noto';
        s.ref.nota_verifica = hiddenGemNote;
        flagged++;
      }
    } else if (!s.ref.verifica) {
      s.ref.verifica = 'verificata';
    }
  });

  // I controlli link corrono in parallelo alla chiamata AI: qui di norma
  // sono già finiti, l'await è solo la garanzia di completezza.
  await linkChecksPromise;

  return { checked: stops.length, flagged };
}

// ── RETRIEVAL PASTI REALI (TripAdvisor + Foursquare) ────────────────────
// Ancora colazione/pranzo/cena a locali REALI: lista compatta di ristoranti
// verificati vicino alla destinazione, iniettata nel prompt del generatore.
// Le due API partono in parallelo; fail-open: senza chiavi o su errore
// restituisce stringa vuota e il prompt resta quello di prima.
async function fetchRealDiningContext(lat: number, lon: number): Promise<string> {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';

  const fsqKey = process.env.FOURSQUARE_API_KEY || process.env.VITE_FOURSQUARE_API_KEY;
  const taKey = process.env.TRIPADVISOR_API_KEY || process.env.VITE_TRIPADVISOR_API_KEY;

  const fsqPromise = fsqKey ? axios.get(
    // Solo categoria Food (4d4b7105d754a06374d81259), raggio 4 km dal centro
    `https://places-api.foursquare.com/places/search?ll=${lat},${lon}&radius=4000&fsq_category_ids=4d4b7105d754a06374d81259&limit=25`,
    { timeout: 5000, headers: { Authorization: `Bearer ${fsqKey}`, "X-Places-Api-Version": "2025-06-17", Accept: "application/json" } }
  ).then(r => (r.data.results || []).map((p: any) => {
    const cat = (p.categories || []).map((c: any) => c.name).filter(Boolean).slice(0, 2).join("/");
    const addr = p.location?.formatted_address || p.location?.address || "";
    return `- ${p.name}${cat ? ` (${cat})` : ""}${addr ? ` — ${addr}` : ""} [Foursquare]`;
  })).catch(() => []) : Promise.resolve([]);

  const taAllowed = taKey ? await tripAdvisorBudgetOk() : false;
  const taPromise = taAllowed ? axios.get(
    `https://api.content.tripadvisor.com/api/v1/location/search?searchQuery=${encodeURIComponent("restaurant")}&latLong=${lat},${lon}&category=restaurants&language=it&key=${taKey}`,
    { timeout: 5000, headers: { Accept: "application/json" } }
  ).then(r => (r.data.data || []).slice(0, 15).map((p: any) => {
    const addr = p.address_obj?.address_string || "";
    return `- ${p.name}${addr ? ` — ${addr}` : ""} [TripAdvisor]`;
  })).catch(() => []) : Promise.resolve([]);

  const [fsq, ta] = await Promise.all([fsqPromise, taPromise]);

  // Dedup per nome (stesso locale presente su entrambe le piattaforme)
  const seen = new Set<string>();
  const results: string[] = [];
  [...ta, ...fsq].forEach((line: string) => {
    const nameKey = line.slice(2).split(" — ")[0].split(" (")[0].trim().toLowerCase();
    if (nameKey && !seen.has(nameKey)) { seen.add(nameKey); results.push(line); }
  });

  if (results.length < 3) return '';
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RISTORANTI E LOCALI REALI VERIFICATI (TripAdvisor + Foursquare, vicino alla destinazione)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Per le tappe COLAZIONE, PRANZO e CENA scegli PREFERIBILMENTE da questo elenco di locali reali, rispettando SEMPRE i vincoli dell'utente (es. gluten free): se nessun locale dell'elenco è adatto ai vincoli, puoi proporre un locale fuori elenco di cui sei CERTO che esista. Nel campo "fonte" della tappa riporta la piattaforma tra parentesi quadre del locale scelto (es. "TripAdvisor").
${results.slice(0, 30).join("\n")}`;
}

// ── GYG SCRAPING (stile Virgilio) + ESTRAZIONE AGNES ────────────────────
// L'API ufficiale GetYourGuide richiede una chiave partner spesso non
// disponibile: come per Virgilio si scarica la pagina di ricerca pubblica,
// si isolano i link profondi delle attività (finiscono con -t<id>) e Agnes
// estrae titolo/prezzo dai frammenti HTML. Link già con partner_id
// affiliato. Cache per città in api_cache (lo scraping+AI costa ~5-10s la
// prima volta, poi è istantaneo).
async function fetchGygExperiencesScraped(city: string, language: string = 'it'): Promise<any[]> {
  const cityKey = String(city || '').trim().toLowerCase();
  if (!cityKey) return [];
  const cacheKey = `gyg_scrape_${cityKey}_${language}`;
  const cached = await getFromCache(cacheKey);
  if (cached?.text_content) {
    try {
      const arr = JSON.parse(cached.text_content);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (e) {}
  }

  try {
    // getyourguide.it risponde 403 al fetch diretto (bot-protection):
    // si passa da DuckDuckGo HTML (scrapabile), che indicizza i link
    // profondi -t<id> delle attività GYG con i loro titoli. Verificato:
    // "site:getyourguide.it roma" → ~11 attività reali.
    const domain = language.toLowerCase().startsWith('it') ? 'getyourguide.it' : 'getyourguide.com';
    const q = `site:${domain} ${city}`;
    const pageRes = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
      }
    });
    const html = String(pageRes.data || '');

    // Risultati DDG: <a class="result__a" href="//duckduckgo.com/l/?uddg=<url-encoded>">Titolo</a>
    const anchorRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const found = new Map<string, { url: string; titleRaw: string }>();
    let m: any;
    while ((m = anchorRe.exec(html)) !== null && found.size < 25) {
      let target = m[1];
      const uddg = target.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try { target = decodeURIComponent(uddg[1]); } catch (e) { continue; }
      }
      if (!/getyourguide\./.test(target)) continue;
      const idm = target.match(/-t(\d{4,})/);
      if (!idm) continue;
      const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!found.has(idm[1])) found.set(idm[1], { url: target.split('?')[0].split('#')[0], titleRaw: title });
    }
    if (found.size === 0) {
      console.warn(`[GYG Scrape] Nessun link attività trovato per "${city}"`);
      return [];
    }

    // Agnes: pulizia titoli (via suffissi "| GetYourGuide" ecc.), scarto dei
    // non-tour, selezione delle 8 esperienze migliori per un turista
    const snippets = Array.from(found.entries()).slice(0, 20).map(([id, v]) => ({ id, titolo_raw: v.titleRaw }));
    const aiRes = await callUniversalAi('agnes', [{
      role: 'user',
      content: `Questi sono titoli di pagine GetYourGuide di esperienze a "${city}". Per ognuna che è una VERA esperienza turistica (tour, biglietto, attività guidata): restituisci "titolo" pulito e leggibile (senza suffissi tipo "| GetYourGuide" o "${city}:"), e "id" INVARIATO. Scarta duplicati e voci che non sono esperienze (pagine categoria, blog, FAQ). Massimo 8, le più rilevanti per un turista.
Rispondi SOLO JSON: {"esperienze":[{"id":"...","titolo":"..."}]}

TITOLI:
${JSON.stringify(snippets)}`
    }], { temperature: 0.1, response_format: { type: 'json_object' } }, 'gyg_scraping',
      process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', null);

    let items: any[] = [];
    try {
      const parsed = JSON.parse(String(aiRes.data || '').replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
      items = parsed.esperienze || [];
    } catch (e) {
      // Agnes non parsabile: fallback sui titoli grezzi (meglio di niente)
      items = snippets.slice(0, 8).map(s => ({ id: s.id, titolo: s.titolo_raw }));
    }

    const gygPartner = process.env.VITE_GYG_PARTNER_ID || 'KYSFZYF';
    const results = items.slice(0, 8).map((it: any) => {
      const entry = found.get(String(it.id));
      if (!entry) return null;
      const sep = entry.url.includes('?') ? '&' : '?';
      return {
        id: String(it.id),
        name: it.titolo,
        price: '',
        url: `${entry.url}${sep}partner_id=${gygPartner}&utm_medium=online_publisher&utm_source=itaintasca`,
        source: 'getyourguide'
      };
    }).filter((r: any) => r && r.name && r.url.includes('getyourguide'));

    if (results.length > 0) {
      saveToCache(cacheKey, 'gyg_scrape', JSON.stringify(results));
      console.log(`[GYG Scrape] ✅ ${results.length} esperienze reali estratte per "${city}"`);
    }
    return results;
  } catch (e: any) {
    console.warn('[GYG Scrape] fallito:', e.message);
    return [];
  }
}

// stream helper per SSE (Server-Sent Events)
// onComplete: callback awaited PRIMA di scrivere [DONE] — usato per salvare il
// risultato su Supabase lato server (service role) senza rischiare che la
// serverless function venga congelata dopo res.end().
async function streamUniversalAi(
  primaryEngine: "deepseek" | "deepseek_native" | "groq" | "together",
  messages: any[],
  options: any = {},
  res: any,
  _unused: any = null,
  featureContext: string = "streaming_enrichment",
  userId?: string,
  onComplete?: (fullText: string) => Promise<void>
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const groqInstance = getGroqClient();

  let totalContent = "";
  let finalUsedModel = primaryEngine;

  try {
    // Catena di fallback: il motore richiesto per primo, poi l'altro.
    // Il fallback scatta solo se il primario fallisce PRIMA di aver emesso
    // contenuto (altrimenti mischieremmo due output nello stesso stream).
    // Groq primario (arricchimento POI e contenuti brevi) → Agnes come
    // fallback richiesto → DeepSeek come ultima rete di sicurezza.
    const wantsGroqFirst = primaryEngine === "groq";
    const engineQueue = wantsGroqFirst
      ? ["groq", "agnes", "deepseek"]
      : ["deepseek", "agnes", "groq"];
    let lastErr: any = null;

    for (const eng of engineQueue) {
      try {
        if (eng === "groq") {
          if (!groqInstance) throw new Error("Groq instance missing");
          const model = options.model || "llama-3.3-70b-versatile";
          finalUsedModel = "groq-" + model;
          totalContent = await _streamGroq(groqInstance, messages, { ...options, model }, res);
        } else if (eng === "agnes") {
          finalUsedModel = "agnes-2.5-flash";
          totalContent = await _streamAgnes(messages, options, res);
        } else {
          finalUsedModel = "deepseek-chat";
          totalContent = await _streamDeepSeekNative(messages, options, res);
        }
        lastErr = null;
        break;
      } catch (engErr: any) {
        console.error(`[streamUniversalAi] ${eng} failed:`, engErr?.message || engErr);
        lastErr = engErr;
        if (totalContent) break; // già emesso contenuto parziale: non mischiare motori
      }
    }
    if (lastErr && !totalContent) throw lastErr;

    // Telemetry per Streaming (stima al termine)
    try {
      const promptText = messages.map(m => m.content).join(" ");
      const promptTokens = Math.ceil(promptText.length / 4);
      const completionTokens = Math.ceil(totalContent.length / 4);

      let realCost = 0;
      if (finalUsedModel.includes('deepseek')) {
        realCost = (promptTokens * (0.14 / 1000000)) + (completionTokens * (0.28 / 1000000));
      } else if (finalUsedModel.includes('gemini')) {
        realCost = 0.005; // Stima flat per Gemini
      }

      const userPart = userId ? ` | User: ${userId}` : '';
      const realUserId = userId && userId !== 'mock-user-id' && userId !== 'anonymous' ? userId : null;
      await insertApiUsageLog({
        api_name: finalUsedModel,
        feature_context: `${featureContext} | Token: ${promptTokens + completionTokens}${userPart}`,
        user_id: realUserId,
        cost_estimation: realCost,
        tokens_used: promptTokens + completionTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        success: true
      });
    } catch(telErr) {}

  } catch (err: any) {
    console.error("[streamUniversalAi] All engines failed:", err.message);
    res.write(`data: ${JSON.stringify({ error: "Il servizio è temporaneamente sovraccarico. Riprova tra un istante." })}\n\n`);
  }
  if (onComplete && totalContent) {
    try { await onComplete(totalContent); } catch (e: any) {
      console.error("[streamUniversalAi] onComplete failed:", e?.message || e);
    }
  }
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function _streamGroq(groqInstance: any, messages: any[], options: any, res: any) {
  let fullText = "";
  const { response_format: _rf, ...streamOptions } = options;
  const stream = await groqInstance.chat.completions.create({
    messages,
    model: options.model || "llama-3.3-70b-versatile",
    stream: true,
    ...streamOptions
  });
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullText += content;
      res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
    }
  }
  return fullText;
}

async function _streamGemini(messages: any[], res: any) {
  if (!ai) throw new Error("Gemini safety net not available");
  let fullText = "";
  console.log("[Safety Net] Streaming via Gemini 2.5 Flash...");
  const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = messages.map(m => `${m.role === 'user' ? 'UTENTE' : 'SISTEMA'}: ${m.content}`).join("\n");
  const result = await model.generateContentStream(prompt);
  for await (const chunk of result.stream) {
    const content = chunk.text();
    if (content) {
      fullText += content;
      res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
    }
  }
  return fullText;
}

/**
 * Helper: streaming Agnes (API OpenAI-compatibile, stesso formato SSE di
 * DeepSeek). Serve come fallback di Groq sull'arricchimento POI in streaming:
 * prima la catena in streaming conosceva solo groq/deepseek, quindi Agnes —
 * pur configurato e gratuito — non veniva mai usato su questo percorso.
 */
async function _streamAgnes(messages: any[], options: any, res: any) {
  const agnesKeys = [
    process.env.AGNES_API_KEY,
    process.env.AGNES_API_KEY_2,
    process.env.AGNES_AI_API_KEY,
    process.env.AGNES_AI_API_KEY2
  ].filter(Boolean);
  if (agnesKeys.length === 0) throw new Error("AGNES_API_KEY mancante");
  const agnesKey = agnesKeys[agnesKeyCounter++ % agnesKeys.length];

  let fullText = "";
  const { response_format, temperature = 0.7, model, ...rest } = options;
  const body: any = {
    model: String(model || "").startsWith("agnes") ? model : "agnes-2.5-flash",
    messages,
    stream: true,
    temperature,
    max_tokens: options.max_tokens || 8192,
    ...rest
  };
  if (response_format) body.response_format = response_format;

  const agnesRes = await axios.post(
    "https://apihub.agnes-ai.com/v1/chat/completions",
    body,
    {
      headers: { Authorization: `Bearer ${agnesKey}`, "Content-Type": "application/json" },
      responseType: "stream",
      timeout: 60000
    }
  );

  let buffer = "";
  await new Promise<void>((resolve, reject) => {
    agnesRes.data.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              fullText += content;
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } catch (_) { }
        }
      }
    });
    agnesRes.data.on("end", resolve);
    agnesRes.data.on("error", reject);
  });
  return fullText;
}

// Helper: streaming DeepSeek nativo (supporta response_format + stream)
async function _streamDeepSeekNative(messages: any[], options: any, res: any) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
  if (!deepseekKey) throw new Error("DEEPSEEK_API_KEY mancante");

  let fullText = "";
  const { response_format, temperature = 0.7, model: _m, ...rest } = options;
  const dsBody: any = {
    model: "deepseek-chat",
    messages,
    stream: true,
    temperature,
    // Stesso tetto esplicito del ramo non-stream: senza, il default (4096)
    // troncava le guide a metà introduzione senza alcun errore.
    max_tokens: options.max_tokens || 8192,
    ...rest
  };
  if (response_format) dsBody.response_format = response_format;

  const dsRes = await axios.post(
    "https://api.deepseek.com/chat/completions",
    dsBody,
    {
      headers: { Authorization: `Bearer ${deepseekKey}`, "Content-Type": "application/json" },
      responseType: "stream"
    }
  );

  let buffer = "";
  await new Promise<void>((resolve, reject) => {
    dsRes.data.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              fullText += content;
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } catch (_) {}
        }
      }
    });
    dsRes.data.on("end", resolve);
    dsRes.data.on("error", reject);
  });
  return fullText;
}

// Wrapper for backward compatibility with existing Groq routes
async function callGroqWithFallback(
  groqInstance: any,
  messages: any[],
  baseModel: string = "llama-3.3-70b-versatile",
  fallbackModel: string = "mixtral-8x7b-32768",
  options: any = {},
  featureContext: string = "general",
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  return callUniversalAi("groq", messages, { ...options, model: baseModel }, featureContext, supabaseUrl, supabaseServiceKey, groqInstance);
}

// --- CACHE HELPERS ---
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// --- HELPER FOR SAAS USER QUOTA CHECK & CIRCUIT BREAKER ---
async function checkAndIncrementQuota(req: any, feature: 'itinerari' | 'audioguide' | 'vision' | 'premium_guide'): Promise<{ allowed: boolean; error?: string; limit?: number; userId?: string }> {
  const authHeader = req.headers.authorization;
  let userId: string | undefined;

  // IL TOKEN VINCE SUL BODY: prima l'identità si prendeva da req.body.userId
  // e il token era solo un ripiego → bastava uno UUID random per chiamata per
  // aggirare la quota (o consumare quella altrui). Ora il token verificato è
  // l'autorità; il body resta solo come fallback per le chiamate interne
  // senza sessione.
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseServiceKey, Authorization: authHeader }
      });
      if (userRes.data && userRes.data.id) {
        userId = userRes.data.id;
      }
    } catch (e: any) {
      console.warn("Quota auth user retrieval failed:", e.message);
    }
  }
  if (!userId) {
    userId = req.body?.userId || req.body?.user_id;
  }

  // Fallback: se proprio manca lo userId (es. test locali), NON usiamo l'ID
  // admin per evitare collisioni di quota e privilegi tra utenti diversi.
  if (!userId) {
    userId = "anonymous-fallback-" + (req.ip || "local");
  }

  try {
    // ── LIMITE UNICO ANTI-FRODE ─────────────────────────────────────────
    // Non esistono più tier free/premium: l'accesso si paga in crediti, il
    // limite serve SOLO a fermare bot/script/loop che brucerebbero le API.
    // È GIORNALIERO (reset via colonna quota_date, vedi migrazione
    // 20260806_unified_quota_daily.sql). Finché la colonna non esiste il
    // codice degrada a un tetto cumulativo alto, per non bloccare nessuno.
    const UNIFIED_DAILY_LIMITS: Record<string, number> = {
      itinerari: 30,
      audioguide: 500,
      vision: 300,
      premium_guide: 20,
    };
    const LEGACY_CUMULATIVE_CAP = 5000;

    // 1. Fetch user quota record
    const res = await axios.get(`${supabaseUrl}/rest/v1/user_quotas?user_id=eq.${userId}&select=*`, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
    });

    let quotaRecord = res.data && res.data.length > 0 ? res.data[0] : null;

    // 2. If no record, create a default one (limiti unici, nessun lookup tier)
    if (!quotaRecord) {
      quotaRecord = {
        user_id: userId,
        plan_type: "unified",
        itinerari_used: 0,
        audioguide_used: 0,
        vision_used: 0,
        premium_guide_used: 0,
        itinerari_limit: UNIFIED_DAILY_LIMITS.itinerari,
        audioguide_limit: UNIFIED_DAILY_LIMITS.audioguide,
        vision_limit: UNIFIED_DAILY_LIMITS.vision,
        premium_guide_limit: UNIFIED_DAILY_LIMITS.premium_guide
      };

      await axios.post(`${supabaseUrl}/rest/v1/user_quotas`, quotaRecord, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          Prefer: 'resolution=merge-duplicates'
        }
      });
    }

    // 3. Reset giornaliero: se il record è di un giorno passato, azzera i
    //    contatori. 'quota_date' esiste solo dopo la migrazione — prima di
    //    allora hasDailyReset è false e si usa il tetto cumulativo alto.
    const today = new Date().toISOString().slice(0, 10);
    const hasDailyReset = Object.prototype.hasOwnProperty.call(quotaRecord, 'quota_date');
    if (hasDailyReset && quotaRecord.quota_date && String(quotaRecord.quota_date).slice(0, 10) !== today) {
      quotaRecord.itinerari_used = 0;
      quotaRecord.audioguide_used = 0;
      quotaRecord.vision_used = 0;
      quotaRecord.premium_guide_used = 0;
      try {
        await axios.patch(`${supabaseUrl}/rest/v1/user_quotas?user_id=eq.${userId}`, {
          itinerari_used: 0, audioguide_used: 0, vision_used: 0, premium_guide_used: 0, quota_date: today
        }, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
        });
      } catch (e) {}
    }

    const usedField = `${feature}_used`;
    const used = quotaRecord[usedField] || 0;
    const limit = hasDailyReset ? (UNIFIED_DAILY_LIMITS[feature] ?? 100) : LEGACY_CUMULATIVE_CAP;

    if (used >= limit) {
      return {
        allowed: false,
        error: `Limite anti-abuso giornaliero raggiunto per '${feature}' (${used}/${limit}). Riprova domani; se sei un utente reale contatta l'assistenza.`,
        limit,
        userId
      };
    }

    return { allowed: true, userId };
  } catch (err: any) {
    console.error("[Quota Helper] Error checking quota, bypassing to ensure dev resilience:", err.message);
    return { allowed: true, userId };
  }
}

// --- HELPER TO INCREMENT USER QUOTA ---
async function incrementQuotaCount(userId: string, feature: 'itinerari' | 'audioguide' | 'vision') {
  try {
    const usedField = `${feature}_used`;
    const res = await axios.get(`${supabaseUrl}/rest/v1/user_quotas?user_id=eq.${userId}&select=*`, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
    });
    
    if (res.data && res.data.length > 0) {
      const record = res.data[0];
      const nextUsed = (record[usedField] || 0) + 1;
      
      await axios.patch(`${supabaseUrl}/rest/v1/user_quotas?user_id=eq.${userId}`, {
        [usedField]: nextUsed
      }, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`
        }
      });
      console.log(`[Quota Manager] Incremented ${usedField} for user ${userId} to ${nextUsed}`);
    }
  } catch (err: any) {
    console.error("[Quota Helper] Failed to increment quota counter:", err.message);
  }
}

// PredictHQ rimosso (ago 2026): chiave revocata (401) e nessun rinnovo
// previsto. Gli eventi reali arrivano da Ticketmaster/Viator/GYG.

async function fetchGeographicContext(destination: string): Promise<{context: string, hasDbPois: boolean} | null> {
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&countrycodes=it,sm,va&format=json&limit=1`;
    const nomRes = await axios.get(nomUrl, { headers: { "User-Agent": "WorldInPocket/1.0" } });
    
    if (!nomRes.data || nomRes.data.length === 0) return null;
    
    const { lat, lon } = nomRes.data[0];
    const nLat = parseFloat(lat);
    const nLon = parseFloat(lon);

    let dbPoisString = "";
    let hasDbPois = false;
    try {
      const diff = 0.1;
      const { data } = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?lat=gte.${nLat - diff}&lat=lte.${nLat + diff}&lon=gte.${nLon - diff}&lon=lte.${nLon + diff}&status=eq.verified&select=id,name,category,lat,lon,description_short,is_gem`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      });
      if (data && data.length > 0) {
        const culturalCats = ['monument', 'museum', 'church', 'viewpoint', 'castle', 'archaeological_site', 'artwork', 'monumenti', 'musei', 'chiese', 'panorami', 'gemme'];
        const dbCultural = data.filter((p: any) => culturalCats.includes(p.category) || p.is_gem === true);
        
        if (dbCultural.length > 0) {
           dbPoisString = dbCultural.map((p: any) => `- ${p.name} (Cat: ${p.category}, Coordinate: ${p.lat}, ${p.lon}) - ${p.description_short || ''}`).join("\n");
           hasDbPois = true;
        }
      }
    } catch(e) {
      console.error("DB Fetch Error in Geocontext:", e);
    }

    if (hasDbPois) {
      return { 
        context: `I SEGUENTI LUOGHI SONO CERTIFICATI E HANNO UN'AUDIOGUIDA NEL NOSTRO SISTEMA. DEVI ASSOLUTAMENTE INCLUDERLI COME TAPPE PRINCIPALI DELL'ITINERARIO:\n${dbPoisString}`,
        hasDbPois: true 
      };
    }

    // Overpass API fallback (gratis, senza key) al posto di Google Places
    try {
      const overpassQuery = `[out:json][timeout:15];
(
  node(around:5000,${nLat},${nLon})["tourism"~"attraction|museum|artwork|viewpoint|gallery"];
  node(around:5000,${nLat},${nLon})["historic"~"monument|castle|church|memorial|archaeological_site|ruins"];
  node(around:5000,${nLat},${nLon})["amenity"~"restaurant|cafe|bar"];
  node(around:5000,${nLat},${nLon})["place"="square"];
  way(around:5000,${nLat},${nLon})["tourism"~"attraction|museum|artwork|viewpoint|gallery"];
  way(around:5000,${nLat},${nLon})["historic"~"monument|castle|church|memorial|archaeological_site|ruins"];
  way(around:5000,${nLat},${nLon})["place"="square"];
  way(around:5000,${nLat},${nLon})["highway"="pedestrian"]["area"="yes"];
);
out tags center 60;`;
      const overpassRes = await axios.post(
        'https://overpass-api.de/api/interpreter',
        `data=${encodeURIComponent(overpassQuery)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
      );
      const elements = overpassRes.data?.elements || [];
      const pois = elements
        .filter((e: any) => e.tags?.name)
        .map((e: any) => {
          const elLat = e.lat || e.center?.lat;
          const elLon = e.lon || e.center?.lon;
          const type = e.tags.tourism || e.tags.historic || e.tags.amenity || 'attrazione';
          return `- ${e.tags.name} (Tipo: ${type}, Coordinate: ${elLat}, ${elLon})`;
        })
        .slice(0, 60);

      if (pois.length > 0) return { context: pois.join("\n"), hasDbPois: false };
    } catch (overpassErr) {
      console.warn("fetchGeographicContext Overpass fallback failed, trying Geoapify...");
      try {
        const apiKey = process.env.GEOAPIFY_API_KEY;
        const geoUrl = `https://api.geoapify.com/v2/places?categories=tourism,heritage,entertainment.culture,catering.restaurant&filter=circle:${nLon},${nLat},5000&limit=50&apiKey=${apiKey}`;
        const geoRes = await axios.get(geoUrl);
        const features = geoRes.data?.features || [];
        const pois = features
          .map((f: any) => `- ${f.properties.name} (Tipo: ${f.properties.categories[0]}, Coordinate: ${f.properties.lat}, ${f.properties.lon})`)
          .filter((s: string) => !s.includes("undefined"));

        if (pois.length > 0) return { context: pois.join("\n"), hasDbPois: false };
      } catch (geoErr) {
        console.error("fetchGeographicContext Geoapify fallback failed too:", geoErr);
      }
    }
  } catch (e) {
    console.error("fetchGeographicContext Error:", e);
  }
  return null;
}

async function getFromCache(cacheKey: string) {
  try {
     const res = await axios.get(`${supabaseUrl}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=*`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
     });
     return res.data && res.data.length > 0 ? res.data[0] : null;
  } catch(e) {
     console.error("Cache get error:", e);
     return null;
  }
}

async function saveToCache(cacheKey: string, contentType: string, textContent: any, audioUrl: string | null = null) {
  try {
     await axios.post(`${supabaseUrl}/rest/v1/api_cache`, {
        cache_key: cacheKey,
        content_type: contentType,
        text_content: textContent,
        audio_url: audioUrl
     }, {
        headers: {
           apikey: supabaseServiceKey,
           Authorization: `Bearer ${supabaseServiceKey}`,
           Prefer: 'resolution=merge-duplicates'
        }
     });
  } catch(e) {
     console.error("Cache save error:", e);
  }
}

// ── BUDGET MENSILE TRIPADVISOR ──
// Contatore persistito in api_cache così sopravvive ai cold start serverless.
// Tetto unico mensile (chiave per YYYY-MM): 1.000 chiamate, ben sotto il
// limite free di 5.000/mese.
// Fail-open: se il contatore non è leggibile la chiamata passa comunque.
const TRIPADVISOR_MONTHLY_BUDGET = 1000;
async function tripAdvisorBudgetOk(): Promise<boolean> {
  try {
    const key = `tripadvisor_budget_${new Date().toISOString().slice(0, 7)}`;
    const row = await getFromCache(key);
    const count = Number(row?.text_content) || 0;
    if (count >= TRIPADVISOR_MONTHLY_BUDGET) {
      console.warn(`[TripAdvisor] Budget mensile esaurito (${count}/${TRIPADVISOR_MONTHLY_BUDGET})`);
      return false;
    }
    saveToCache(key, 'counter', String(count + 1));
    return true;
  } catch (e) {
    return true;
  }
}

async function saveAudioToStorageAndCache(cacheKey: string, audioBuffer: Buffer) {
  try {
     const fileName = `${cacheKey}.mp3`;
     const uploadUrl = `${supabaseUrl}/storage/v1/object/audio_cache/${fileName}`;
     await axios.post(uploadUrl, audioBuffer, {
        headers: {
           apikey: supabaseServiceKey,
           Authorization: `Bearer ${supabaseServiceKey}`,
           'Content-Type': 'audio/mpeg'
        }
     });
     const publicUrl = `${supabaseUrl}/storage/v1/object/public/audio_cache/${fileName}`;
     await saveToCache(cacheKey, 'audio_guide', null, publicUrl);
  } catch(e: any) {
     console.error("Audio cache upload error:", e.response?.data || e.message);
  }
}

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // --- CORS CON ALLOWLIST DINAMICA ---
  // Prima vercel.json rispondeva Access-Control-Allow-Origin: * a tutti: un
  // qualsiasi sito poteva bruciare le API (Groq/DeepSeek/Azure/Unsplash) dal
  // browser dei suoi visitatori. Non si può però mettere un origin FISSO:
  // romperebbe le app native (WebView Capacitor con origin capacitor://localhost
  // o https://localhost). Si riflette quindi l'origin SOLO se in allowlist;
  // le richieste senza Origin (server-to-server, Stripe/RevenueCat, curl) non
  // sono soggette a CORS e passano comunque. L'header statico è stato tolto da
  // vercel.json (questo middleware è l'unica autorità).
  const CORS_ALLOWLIST = new Set([
    'https://wip.guide',
    'https://www.wip.guide',
    'https://itainta.vercel.app',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
  ]);
  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return false; // nessun Origin = non una richiesta browser CORS
    if (CORS_ALLOWLIST.has(origin)) return true;
    // localhost con porta (dev: 3000/5173) e preview *.vercel.app del progetto
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
    if (/^https:\/\/itainta[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
    return false;
  };
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin as string);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, apikey, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });

  // --- STRIPE WEBHOOK (Must be before express.json) ---
  // Prezzario autorevole lato server: il client NON deve poter dettare
  // quanti crediti riceve per quanti euro. `cents` = importo Stripe reale,
  // `credits` = crediti accreditati. Prima unit_amount era limitato a 3 casi
  // ma metadata.amount (il valore accreditato) veniva dal body → amount:100000
  // costava 19,99€ e accreditava 100.000 crediti. Tenere allineato a
  // src/lib/pricing.ts e al mapping RevenueCat.
  const CREDIT_PACKS: Record<string, { credits: number; cents: number }> = {
    package_500:  { credits: 500,  cents: 499 },
    package_1100: { credits: 1100, cents: 999 },
    package_2600: { credits: 2600, cents: 1999 },
    package_2500: { credits: 2500, cents: 1999 }, // storico Google Play
  };
  const packFromAmount = (amt: number) =>
    Object.values(CREDIT_PACKS).find(p => p.credits === amt);

  // Accredito atomico e idempotente (RPC credit_purchase): rimpiazza il
  // GET purchased_credits + PATCH (current+amount) che era soggetto a lost
  // update contro i consumi concorrenti. L'idempotenza vive nell'unique
  // index (source, event_id), non più nel marker su api_cache.
  const creditPurchase = async (userId: string, amount: number, source: string, eventId: string | null, description?: string): Promise<boolean> => {
    const rpc = await axios.post(
      `${supabaseUrl}/rest/v1/rpc/credit_purchase`,
      { p_user_id: userId, p_amount: amount, p_source: source, p_event_id: eventId, p_description: description || null },
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' } }
    );
    return rpc.data === true;
  };

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeClient || !webhookSecret) {
      return res.status(400).send('Stripe non configurato');
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed.', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotenza a due livelli: l'accredito crediti è protetto atomicamente
    // dall'unique index (source, event_id) dentro credit_purchase; per i rami
    // NON-crediti (coupon B2B, subscription) resta il marker su api_cache, ma
    // scritto SOLO a fine elaborazione riuscita (vedi in coda) così un
    // fallimento non blocca per sempre il retry di Stripe.
    const evtKey = `stripe_evt_${event.id}`;
    if (await getFromCache(evtKey)) {
      return res.json({ received: true, duplicate: true });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = session.client_reference_id;
      const amountStr = session.metadata?.amount;

      if (session.metadata?.b2b === "true") {
        // Acquisto B2B: generazione coupon per la struttura (logica migrata dal
        // vecchio /api/webhook non firmato, ora dismesso).
        const codeCount = parseInt(session.metadata.codeCount || "0");
        const structureName = session.metadata.structureName || "Struttura Sconosciuta";
        const durationDays = parseInt(session.metadata.durationDays || "7");
        // I pacchetti B2B sono voucher CREDITI: ogni coupon regala crediti
        // all'ospite (non giorni premium). duration_days resta per compat.
        const creditsPerVoucher = parseInt(session.metadata.creditsPerVoucher || "500");
        if (codeCount > 0) {
          try {
            const coupons = Array.from({ length: codeCount }).map(() => ({
              code: crypto.randomBytes(4).toString('hex').toUpperCase(),
              duration_days: durationDays,
              reward_credits: creditsPerVoucher,
              max_uses: 1,
              structure_name: structureName,
              is_active: true
            }));
            await axios.post(`${supabaseUrl}/rest/v1/coupons`, coupons, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: 'return=minimal' }
            });
            console.log(`[Stripe Webhook] Generated ${codeCount} coupons for ${structureName}`);
          } catch (e: any) {
            console.error('[Stripe Webhook] Error generating coupons:', e.message);
            await logSystemError('critical', `Stripe B2B: generazione coupon fallita dopo il pagamento: ${e.message}`, {
              source: 'stripe-webhook', structureName, codeCount, stack: e.stack
            });
          }
        }
      } else if (userId && amountStr) {
        const amount = parseInt(amountStr, 10);
        try {
          // Accredito atomico e idempotente. Non serve marker: il retry di
          // Stripe che rientra qui trova la riga (source,event_id) già scritta
          // e credit_purchase ritorna true senza raddoppiare.
          const ok = await creditPurchase(userId, amount, 'stripe', event.id, `Checkout ${session.id || ''}`.trim());
          if (!ok) throw new Error('credit_purchase returned false');
          console.log(`[Stripe] Credited ${amount} to user ${userId}`);
        } catch (e: any) {
          console.error('[Stripe Webhook] Error updating credits:', e.message);
          // Pagamento riuscito ma accredito fallito: NON scrivere il marker e
          // rispondere 500, così Stripe ritenta (l'accredito è idempotente).
          await logSystemError('critical', `Stripe: pagamento OK ma accredito crediti fallito: ${e.message}`, {
            source: 'stripe-webhook', userId, amount: amountStr, sessionId: session?.id, stack: e.stack
          });
          return res.status(500).json({ error: 'credit_grant_failed' });
        }
      } else if (userId) {
        // Abbonamento premium (checkout senza metadata.amount): attivazione profilo.
        try {
          let currentPeriodEnd = new Date();
          currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
          if (session.subscription) {
            const sub = await stripeClient.subscriptions.retrieve(session.subscription as string);
            currentPeriodEnd = new Date((sub as any).current_period_end * 1000);
          }
          await axios.post(`${supabaseUrl}/rest/v1/user_profiles`, {
            id: userId,
            subscription_status: 'active',
            subscription_tier: 'premium',
            current_period_end: currentPeriodEnd.toISOString(),
            stripe_customer_id: session.customer
          }, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: 'resolution=merge-duplicates' }
          });
        } catch (e: any) {
          console.error('[Stripe Webhook] Error activating subscription:', e.message);
          await logSystemError('critical', `Stripe: attivazione abbonamento fallita: ${e.message}`, {
            source: 'stripe-webhook', userId, sessionId: session?.id, stack: e.stack
          });
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const session = event.data.object as any;
      try {
        await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?stripe_customer_id=eq.${session.customer}`, {
          subscription_status: 'canceled',
          subscription_tier: 'free',
          current_period_end: null
        }, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
        });
      } catch (e: any) {
        console.error('[Stripe Webhook] Error canceling subscription:', e.message);
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const session = event.data.object as any;
      try {
        if (session.subscription) {
          const sub = await stripeClient.subscriptions.retrieve(session.subscription as string);
          await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?stripe_customer_id=eq.${session.customer}`, {
            subscription_status: 'active',
            current_period_end: new Date((sub as any).current_period_end * 1000).toISOString()
          }, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
          });
        }
      } catch (e: any) {
        console.error('[Stripe Webhook] Error renewing subscription:', e.message);
      }
    }

    // Marker scritto SOLO ora, a elaborazione riuscita: il ramo crediti che
    // fallisce è già uscito con 500 sopra, quindi il retry di Stripe non lo
    // trova e riprova (l'accredito è comunque idempotente lato RPC).
    await saveToCache(evtKey, 'webhook_event', event.type);
    res.json({ received: true });
  });

  // --- REVENUECAT WEBHOOK (JSON) ---
  app.post('/api/revenuecat/webhook', express.json(), async (req, res) => {
    try {
      // Auth obbligatoria: senza questo check chiunque poteva accreditarsi
      // crediti con un semplice POST. Il valore va impostato sia qui
      // (REVENUECAT_WEBHOOK_SECRET) sia nella dashboard RevenueCat come
      // Authorization header del webhook.
      const expectedAuth = process.env.REVENUECAT_WEBHOOK_SECRET;
      if (!expectedAuth) {
        console.error('[RevenueCat Webhook] REVENUECAT_WEBHOOK_SECRET non configurato: webhook rifiutato');
        return res.status(503).json({ error: 'Webhook not configured' });
      }
      const authHeader = req.headers.authorization || '';
      if (authHeader !== expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
        console.warn('[RevenueCat Webhook] Tentativo con Authorization non valida');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const event = req.body?.event;
      
      // We only care about new non-renewing purchases (consumables)
      if (!event || (event.type !== 'NON_RENEWING_PURCHASE' && event.type !== 'INITIAL_PURCHASE')) {
        return res.json({ received: true, ignored: true });
      }

      const userId = event.app_user_id;
      // Google Play può inoltrare il product id col suffisso base plan
      // ("package_2600:base"): senza lo split il mapping sotto non matcha e
      // l'acquisto verrebbe ricevuto ma accreditato 0.
      const productId = String(event.product_id || '').split(':')[0];

      // Prezzario autorevole (stesso di Stripe): mai fidarsi del prodotto per
      // dedurre l'importo se non è mappato.
      const rcAmount = CREDIT_PACKS[productId]?.credits
        ?? (productId === 'crediti_500' ? 500 : 0);

      if (userId && rcAmount > 0) {
        try {
          // Accredito atomico e idempotente su (source='revenuecat', event_id).
          const ok = await creditPurchase(userId, rcAmount, 'revenuecat', event.id || null, `IAP ${productId || ''}`.trim());
          if (!ok) throw new Error('credit_purchase returned false');
          console.log(`[RevenueCat Webhook] Accreditati ${rcAmount} crediti all'utente ${userId} per acquisto Android di ${productId}`);
        } catch (e: any) {
          // Pagato su Google Play ma accredito fallito: 500 → RevenueCat ritenta.
          await logSystemError('critical', `RevenueCat: acquisto OK ma accredito fallito: ${e.message}`, {
            source: 'revenuecat-webhook', userId, productId, amount: rcAmount, stack: e.stack
          });
          return res.status(500).json({ error: 'credit_grant_failed' });
        }
      } else if (userId && event.type !== 'INITIAL_PURCHASE') {
        // Prodotto non mappato incassato: prima veniva accreditato 0 in
        // silenzio. Ora lascia traccia per l'admin (non blocca il 2xx).
        await logSystemError('warning', `RevenueCat: product_id non mappato, accredito 0`, {
          source: 'revenuecat-webhook', userId, productId
        });
      }

      res.json({ received: true });
    } catch (e: any) {
      console.error('[RevenueCat Webhook] Errore critico:', e.message);
      await logSystemError('critical', `RevenueCat: errore critico nel webhook acquisti Android: ${e.message}`, {
        source: 'revenuecat-webhook', eventType: req.body?.event?.type, productId: req.body?.event?.product_id, stack: e.stack
      });
      res.status(500).send('Error processing webhook');
    }
  });

  app.use(express.json({ limit: "50mb" }));

  // --- STRIPE CREATE CHECKOUT ---
  app.post('/api/stripe/create-checkout', async (req, res) => {
    try {
      const { userId, amount, priceId } = req.body;
      if (!stripeClient) {
        return res.status(500).json({ error: "Stripe non è configurato sul server" });
      }

      // Un Price ID Stripe vero inizia con 'price_'. Lo shop passa gli ID
      // pacchetto RevenueCat ('package_500' ecc.), che Stripe non conosce:
      // prima finivano in `line_items: [{ price: 'package_500' }]` e la
      // creazione della sessione falliva SEMPRE ("No such price").
      //
      // PREZZO E CREDITI DAL SERVER, MAI DAL BODY: prima unit_amount era
      // limitato a 3 casi ma metadata.amount (ciò che il webhook accredita)
      // veniva da req.body.amount → amount:100000 costava 19,99€ e dava
      // 100.000 crediti. Ora si deriva tutto dal pacchetto autorevole.
      let line_items = [];
      let creditedAmount: number;
      if (priceId && String(priceId).startsWith('price_') && priceId !== 'price_test') {
        // Price Stripe reale: i crediti restano quelli del pacchetto noto (se
        // riconducibile), altrimenti si rifiuta invece di indovinare.
        const pack = CREDIT_PACKS[String(priceId)] || packFromAmount(Number(amount));
        if (!pack) return res.status(400).json({ error: 'Pacchetto non valido' });
        creditedAmount = pack.credits;
        line_items = [{ price: priceId, quantity: 1 }];
      } else {
        const pack = CREDIT_PACKS[String(priceId)] || packFromAmount(Number(amount));
        if (!pack) return res.status(400).json({ error: 'Pacchetto non valido' });
        creditedAmount = pack.credits;
        line_items = [{
          price_data: {
            currency: 'eur',
            product_data: { name: `Pacchetto ${pack.credits} Crediti` },
            unit_amount: pack.cents,
          },
          quantity: 1,
        }];
      }

      const host = req.headers.host || 'localhost:3000';
      const protocol = req.protocol || 'http';

      const session = await stripeClient.checkout.sessions.create({
        // Solo 'card': Apple Pay / Google Pay NON sono payment_method_types
        // validi (Stripe rifiutava l'intera richiesta); i wallet compaiono
        // comunque automaticamente nella pagina di Checkout.
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        success_url: `${protocol}://${host}/?payment=success`,
        cancel_url: `${protocol}://${host}/?payment=cancel`,
        client_reference_id: userId,
        metadata: {
          // Valore AUTOREVOLE derivato dal pacchetto, non dal body.
          amount: creditedAmount.toString()
        }
      });

      // `url` permette al client il redirect diretto senza chiave pubblica
      // Stripe.js; sessionId resta per il vecchio percorso redirectToCheckout.
      res.json({ sessionId: session.id, url: session.url });
    } catch (e: any) {
      console.error('Create checkout error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- IN-MEMORY RATE LIMITER MIDDLEWARE (SECURITY HARDENING) ---
  const ipLimits = new Map<string, { count: number; resetTime: number }>();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const MAX_REQUESTS_PER_WINDOW = 100; // Aumentato per gestire la navigazione fluida sulla mappa

  function rateLimiter(req: any, res: any, next: any) {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    
    const limitData = ipLimits.get(ip);
    if (!limitData || now > limitData.resetTime) {
      ipLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      return next();
    }
    
    if (limitData.count >= MAX_REQUESTS_PER_WINDOW) {
      console.warn(`[Rate Limiter] Blocked request from IP ${ip} (Too Many Requests)`);
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    
    limitData.count++;
    next();
  }

  // --- Auth helpers (dichiarazioni hoisted: usabili anche dalle route
  //     registrate PRIMA di verifyAdminToken/const più in basso) ---
  // Verifica un Bearer utente valido SENZA richiedere is_admin.
  // Ritorna lo user id oppure null. Per route che devono solo garantire
  // che il chiamante sia autenticato.
  async function verifyUserToken(req: any): Promise<string | null> {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    try {
      const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseServiceKey, Authorization: authHeader }
      });
      return userRes.data?.id || null;
    } catch {
      return null;
    }
  }

  // Prezzario autorevole server-side per il GATE CREDITI. Prima nessuna rotta
  // costosa (tranne la chat) verificava i crediti: la sequenza consumeCredits
  // → fetch viveva solo nel client, quindi ogni servizio era gratis via cURL.
  // Allineare a src/lib/pricing.ts.
  const SERVER_PRICING: Record<string, number> = {
    premium_guide_daily: 20, audio_guide: 15, itinerary_daily: 10,
    photo_search: 5, poi_detail: 5, podcast_daily: 15,
    // Pass Museo: Vision illimitata per MUSEUM_PASS_HOURS ore (visita indoor).
    // 100 crediti (~1€): break-even col costo AI (~0,4 cent/scansione
    // gpt-4o-mini) anche nel caso peggiore del tetto scansioni.
    museum_pass: 100,
  };

  // Header service-role riusati dagli helper crediti.
  const CREDIT_SVC_HEADERS = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };

  /**
   * Addebito robusto. RPC atomica `consume_credits` (earned-first) preferita;
   * se la RPC non è applicata sul DB si ripiega su una scrittura service-key
   * (che bypassa il trigger anti-escalation su user_profiles). Il trigger
   * blocca ogni scrittura crediti dal client, quindi TUTTI i consumi devono
   * passare da qui. Ritorna 'ok' | 'insufficient' | 'error'.
   */
  async function consumeCreditsServer(userId: string, amount: number): Promise<'ok' | 'insufficient' | 'error'> {
    if (amount <= 0) return 'ok';
    try {
      const rpc = await axios.post(`${supabaseUrl}/rest/v1/rpc/consume_credits`,
        { p_user_id: userId, p_amount: amount }, { headers: CREDIT_SVC_HEADERS });
      if (rpc.data === true) return 'ok';
      if (rpc.data === false) return 'insufficient';
    } catch { /* RPC assente/errore → fallback */ }
    try {
      const { data: prof } = await axios.get(
        `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=earned_credits,purchased_credits`, { headers: CREDIT_SVC_HEADERS });
      let earned = Number(prof?.[0]?.earned_credits) || 0;
      let purchased = Number(prof?.[0]?.purchased_credits) || 0;
      if (earned + purchased < amount) return 'insufficient';
      let rem = amount;
      if (earned >= rem) { earned -= rem; rem = 0; } else { rem -= earned; earned = 0; }
      if (rem > 0) purchased -= rem;
      await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`,
        { earned_credits: earned, purchased_credits: purchased }, { headers: CREDIT_SVC_HEADERS });
      return 'ok';
    } catch { return 'error'; }
  }

  /** Rimborso robusto (RPC atomica o fallback service-key su purchased). */
  async function refundCreditsServer(userId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return true;
    try {
      await axios.post(`${supabaseUrl}/rest/v1/rpc/refund_credits_service`,
        { p_user_id: userId, p_amount: amount }, { headers: CREDIT_SVC_HEADERS });
      return true;
    } catch { /* RPC assente/errore → fallback */ }
    try {
      const { data: prof } = await axios.get(
        `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=purchased_credits`, { headers: CREDIT_SVC_HEADERS });
      const purchased = Number(prof?.[0]?.purchased_credits) || 0;
      await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`,
        { purchased_credits: purchased + amount }, { headers: CREDIT_SVC_HEADERS });
      return true;
    } catch { return false; }
  }

  /**
   * Verifica il TOKEN (mai il body) e addebita `feature × units` crediti.
   * Ritorna {userId, cost} o null avendo già inviato la risposta d'errore
   * (401 login, 402 crediti, 500). Il chiamante genera e, in caso di
   * fallimento, rimborsa con refundServer.
   */
  async function chargeOrReject(req: any, res: any, feature: string, units: number = 1): Promise<{ userId: string; cost: number } | null> {
    const userId = await verifyUserToken(req);
    if (!userId) { res.status(401).json({ error: 'login_required' }); return null; }
    const unit = SERVER_PRICING[feature];
    if (!unit) { res.status(500).json({ error: 'unknown_feature' }); return null; }
    const cost = unit * Math.max(1, Math.floor(units));
    const outcome = await consumeCreditsServer(userId, cost);
    if (outcome === 'insufficient') { res.status(402).json({ error: 'insufficient_credits', cost }); return null; }
    if (outcome === 'error') { res.status(500).json({ error: 'charge_failed' }); return null; }
    return { userId, cost };
  }

  /** Rimborso server-side (generazione fallita dopo l'addebito). Best-effort. */
  async function refundServer(userId: string, amount: number): Promise<void> {
    const ok = await refundCreditsServer(userId, amount);
    if (!ok) await logSystemError('critical', `Rimborso server-side fallito`, { source: 'chargeOrReject', userId, amount });
  }

  // Come verifyUserToken ma richiede is_admin = true sul profilo.
  async function verifyAdminBearer(req: any): Promise<string | null> {
    const uid = await verifyUserToken(req);
    if (!uid) return null;
    try {
      const profileRes = await axios.get(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${uid}&select=is_admin`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      });
      return profileRes.data?.[0]?.is_admin === true ? uid : null;
    } catch {
      return null;
    }
  }

  // Initialize Gemini with multiple keys support
  const geminiKeys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(Boolean);
  let ai: any = null;
  if (geminiKeys.length > 0) {
    try {
      const GenAIConstructor = (GoogleGenAI as any).default || GoogleGenAI;
      const clients = geminiKeys.map(k => new GenAIConstructor({ apiKey: k }));
      ai = {
        get models() {
          const client = clients[Math.floor(Math.random() * clients.length)];
          return client.models;
        },
        getGenerativeModel: (opts: any) => {
          const client = clients[Math.floor(Math.random() * clients.length)];
          if (client.getGenerativeModel) return client.getGenerativeModel(opts);
          return null;
        }
      };
    } catch (e: any) {
      console.warn("Failed to initialize Gemini:", e.message);
    }
  }

  const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || '';

// --- HELPER PER JSON TRONCATO DALL'AI ---
function parseSafeJSON(text: string) {
  let cleaned = text.trim();
  // Strip markdown fences
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  // Try extracting just the first { to the last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(extracted);
    } catch(e) {}
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    let fixed = cleaned;
    fixed = fixed.replace(/,\s*$/, '');
    
    // Tenta varie combinazioni di chiusura
    const closures = [
      "}", "]}", "}]}", "]}]}", '"}', '"]}', '"}]}', '"}]}]}',
      // Add double quotes for unclosed strings
      '"}', '"]}', '"}]}'
    ];
    
    for (const closure of closures) {
      try {
        return JSON.parse(fixed + closure);
      } catch(err) {}
    }
    
    throw new Error("JSON parse errato o troncato in modo irrecuperabile: " + (e as Error).message);
  }
}

// Configura il client Groq (chiavi deduplicate — GROQ_API_KEY e VITE_GROQ_API_KEY sono la stessa)
  const groqKeys = [...new Set([
    process.env.GROQ_API_KEY,
    process.env.VITE_GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
  ].filter(Boolean))]; // Set rimuove duplicati

  let groqClients: any[] = [];
  if (groqKeys.length > 0) {
    try {
      const GroqConstructor = (Groq as any).default || Groq;
      groqClients = groqKeys.map(k => new GroqConstructor({ apiKey: k }));
      console.log(`✅ [STARTUP] Groq configurato con ${groqClients.length} chiave/i unica/e.`);
    } catch (e: any) {
      console.warn("Failed to initialize Groq clients:", e.message);
    }
  } else {
    console.warn("⚠️ [STARTUP] Nessuna GROQ_API_KEY trovata nel .env!");
  }

  function getGroqClient() {
    if (groqClients.length === 0) return null;
    return groqClients[Math.floor(Math.random() * groqClients.length)];
  }

  const groq = getGroqClient(); // Per retrocompatibilità con rotte esistenti

  // ── Startup API Key Validation ──
  const deepseekKeyCheck = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
  if (!deepseekKeyCheck) {
    console.warn("⚠️ [STARTUP] DEEPSEEK_API_KEY non trovata nel .env! La curatela POI (foto + descrizioni) ricadrà su Groq come fallback.");
  } else {
    console.log("✅ [STARTUP] DeepSeek API Key configurata correttamente.");
  }

  const viatorKeyCheck = process.env.VIATOR_API_KEY;
  if (!viatorKeyCheck) {
    console.warn("⚠️ [STARTUP] VIATOR_API_KEY non trovata nel .env! Le esperienze e tour restituiranno dati fittizi.");
  } else {
    console.log("✅ [STARTUP] Viator API Key configurata correttamente.");
  }

  app.get("/api/wiki/pois", rateLimiter, async (req, res) => {
    try {
      const lat = req.query.lat;
      const lon = req.query.lon;
      const radius = req.query.radius || 1000;
      const limit = req.query.limit || 20;

      if (!lat || !lon) {
        return res.status(400).json({ error: "Missing lat or lon parameters" });
      }

      const url = `https://it.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${radius}&ggslimit=${limit}&prop=coordinates|extracts&exintro=1&explaintext=1&format=json`;
      
      const response = await axios.get(url, { headers: { "User-Agent": "WorldInPocket/1.0" } });
      res.json(response.data);
    } catch (e: any) {
      console.error("Wiki API Error:", e.message);
      res.status(500).json({ error: "Failed to fetch Wikipedia POIs" });
    }
  });

  
// --- PODCAST GIORNALIERO ITINERARI ---
app.post("/api/generate-daily-podcast", rateLimiter, async (req, res) => {
  try {
    const { destination, dayNum, tappe, language, isLastDay } = req.body;
    if (!destination || !dayNum || !tappe || !Array.isArray(tappe)) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    // CACHE-FIRST (prima dell'addebito): due utenti sullo stesso giorno della
    // stessa città non pagano due generazioni DeepSeek, e chi riascolta non
    // ripaga. Chiave deterministica su destinazione+giorno+lingua+tappe.
    const podcastCacheKey = `podcast_${crypto.createHash('md5')
      .update(`${destination}|${dayNum}|${String(language || 'IT').toUpperCase()}|${tappe.map((t: any) => t.name).join('|')}`)
      .digest('hex')}`;
    const cachedPodcast = await getFromCache(podcastCacheKey);
    if (cachedPodcast?.text_content) {
      return res.json({ text: cachedPodcast.text_content, cached: true });
    }

    // GATE CREDITI SERVER-SIDE: prima la rotta era anonima e gratuita (8k
    // token DeepSeek via cURL). Ora richiede token e addebita 15 crediti.
    const charge = await chargeOrReject(req, res, 'podcast_daily', 1);
    if (!charge) return; // risposta d'errore già inviata (401/402/500)

    // Tutte le lingue supportate dal client, non solo IT/EN
    const PODCAST_LANGS: Record<string, string> = { EN: 'English', FR: 'francese (français)', ES: 'spagnolo (español)', DE: 'tedesco (Deutsch)', RU: 'russo (русский)', ZH: 'cinese semplificato (简体中文)', IT: 'italiano' };
    const langStr = PODCAST_LANGS[String(language || 'IT').toUpperCase()] || 'italiano';
    const tappeList = tappe.map((t: any, i: number) => `${i + 1}. ${t.name}${t.description ? ': ' + t.description.slice(0, 120) : ''}`).join('\n');
    const numTappe = tappe.length;

    const sysPrompt = `Sei Uip (scritto WIP), la voce ufficiale dell'app di viaggio "World in Pocket". IMPORTANTE: nel testo scrivi sempre il tuo nome come "Uip" (non "WIP") perché il testo viene letto da una voce sintetizzata e deve pronunciarsi correttamente. Parli in prima persona con un tono caldo, entusiasta e professionale come un conduttore radiofonico di viaggi. Generi testo SOLO in lingua ${langStr}, senza mai mescolare altre lingue.`;

    let userPrompt = `Giorno ${dayNum} dell'itinerario a ${destination}. Crea una presentazione audio completa di circa 2-3 minuti.\n\n`;
    
    if (dayNum === 1 || dayNum === '1') {
      userPrompt += `Prima di presentare le tappe, dedica 3-4 frasi di introduzione entusiasmante alla città di ${destination}: cosa la rende speciale, l'atmosfera, un fatto curioso.\n\n`;
    }

    userPrompt += `TAPPE DI OGGI (${numTappe} in totale - DEVI presentarle TUTTE, una per una):\n${tappeList}\n\n`;
    
    userPrompt += `STRUTTURA OBBLIGATORIA del testo audio (rispetta questo ordine):\n`;
    userPrompt += `1. Saluto iniziale e presentazione come WIP\n`;
    userPrompt += `2. ${dayNum === 1 || dayNum === '1' ? 'Introduzione a ' + destination + ' (3-4 frasi)' : 'Breve introduzione alla giornata'}\n`;
    userPrompt += `3. Presentazione di OGNI SINGOLA TAPPA (tutte e ${numTappe}): per ciascuna descrivi brevemente cosa si vedrà, perché è speciale, e un consiglio pratico\n`;
    
    if (isLastDay) {
      userPrompt += `4. Saluto finale: ringrazia l'utente per aver viaggiato con WIP, augura un buon rientro, invita a tornare per il prossimo viaggio con frasi creative e calde\n`;
    } else {
      userPrompt += `4. Congedo: invita ad ascoltare il prossimo episodio per la giornata successiva\n`;
    }

    userPrompt += `\nREGOLE ASSOLUTE:\n`;
    userPrompt += `- Scrivi SOLO il testo da leggere ad alta voce. Nessun titolo, nessun markdown (no **, no #, no ---), nessuna emoji, nessuna nota di regia tra parentesi.\n`;
    userPrompt += `- Tono: caldo, entusiasta, come un amico esperto di viaggi che parla direttamente a te.\n`;
    userPrompt += `- Lingua OBBLIGATORIA: ${langStr}. Non usare mai altre lingue.\n`;
    userPrompt += `- NON troncare il testo. Presenta TUTTE le ${numTappe} tappe senza eccezioni.\n`;
    userPrompt += `- Ogni tappa deve avere almeno 2-3 frasi di presentazione.\n`;

    let podcastText = "";
    try {
      const messages = [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ];
      
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const groqInstance = getGroqClient();

      const response = await callUniversalAi(
        "deepseek",
        messages,
        // Podcast su DeepSeek e basta: niente ripiego silenzioso su un altro
        // modello. Se DeepSeek non risponde si fallisce e si rimborsa.
        { temperature: 0.72, strictEngine: true, max_tokens: 8192 },
        "podcast_generation",
        supabaseUrl,
        supabaseServiceKey,
        groqInstance
      );

      podcastText = response.data || "";
      
      if (!podcastText) throw new Error("Risposta vuota dall'AI");

    } catch (e: any) {
      console.error("[Podcast] AI Error:", e.message);
      // Generazione fallita dopo l'addebito: rimborso server-side atomico.
      await refundServer(charge.userId, charge.cost);
      return res.status(502).json({
        error: "PODCAST_GENERATION_FAILED",
        message: "Il motore AI non è riuscito a generare il podcast. Riprova."
      });
    }

    // Pulizia testo per TTS
    podcastText = podcastText
      .replace(/[#*_`~]/g, '')          // markdown
      .replace(/\[.*?\]/g, '')           // link markdown
      .replace(/\(.*?\)/g, '')           // parentesi
      .replace(/^\s*[-•]\s*/gm, '')      // bullet points
      .replace(/\n{3,}/g, '\n\n')        // triple newlines
      .replace(/([.!?])\s*\n/g, '$1 ')  // newline dopo punteggiatura â†’ spazio
      .trim();

    console.log(`[Podcast] Day ${dayNum} | ${tappe.length} stops | ${podcastText.length} chars`);
    // In cache per i prossimi ascolti / altri utenti (best-effort).
    await saveToCache(podcastCacheKey, 'podcast', podcastText).catch(() => {});
    res.json({ text: podcastText });
  } catch (err: any) {
    console.error("[Podcast] Error:", err);
    res.status(500).json({ error: "Errore generazione podcast" });
  }
});


app.post("/api/groq/candidates", rateLimiter, async (req, res) => {
  try {
    const { destination, days, categories, includeEvents, includeTours, language = "IT", lat, lon } = req.body;
    if (!destination || !days) {
      return res.status(400).json({ error: "Destination and days are required." });
    }
    // Coordinate dal geocoder del client: ancorano la destinazione a un luogo
    // preciso, così "Giza" non viene reinterpretata come una città italiana.
    const geoAnchor = (typeof lat === "number" && typeof lon === "number")
      ? ` La destinazione si trova ESATTAMENTE alle coordinate lat ${lat}, lon ${lon}: tutte le attrazioni proposte devono trovarsi in quella città/area geografica, NON in località omonime o in altri paesi.`
      : "";

    let categoriesStr = Array.isArray(categories) && categories.length > 0
      ? categories.join(", ")
      : "attrazioni, musei, monumenti, chiese, panorami, parchi, ristoranti";
      
    if (includeEvents) categoriesStr += ", eventi e concerti reali in corso";
    if (includeTours) categoriesStr += ", tour guidati ed esperienze esclusive";

    let extraInstructions = "";
    if (includeEvents) extraInstructions += " IMPORTANTE: L'utente ha richiesto eventi. Includi tra i candidati almeno 2 o 3 eventi, concerti o spettacoli reali e famosi per questa destinazione.";
    if (includeTours) extraInstructions += " IMPORTANTE: L'utente ha richiesto tour. Includi tra i candidati almeno 2 o 3 tour, degustazioni o esperienze guidate di alto livello.";

    // Candidati proporzionali alla durata: il "15 fisso" dava le stesse carte
    // per 1 o 7 giorni. 1g→10, 2g→15, 3g→20, 4g→25… con tetto a 45 (oltre il
    // JSON rischia il taglio a 8192 token di output e il mazzo diventa illeggibile).
    const safeDays = Math.min(30, Math.max(1, Math.floor(Number(days)) || 1));
    const numCandidates = Math.min(45, 10 + (safeDays - 1) * 5);

    const systemPrompt = `Sei un curatore di viaggi d'elite e lifestyle editor per World in Pocket (WIP).
Il tuo compito è selezionare ESCLUSIVAMENTE i luoghi più iconici, alla moda, prestigiosi e culturalmente rilevanti per la destinazione richiesta. Scegli attrazioni tratte da circuiti ufficiali (UNESCO, Michelin) o recensite da magazine prestigiosi (Condé Nast, Vogue, Lonely Planet). Evita trappole per turisti. DEVONO ESSERE I "MUST TO SEE" ASSOLUTI, I PIÙ FAMOSI E BELLI PER OGNI CATEGORIA.
${extraInstructions}
Proponi esattamente ${numCandidates} attrazioni o punti di interesse eccellenti e verificati, corrispondenti alle categorie: ${categoriesStr}.
ORDINE OBBLIGATORIO: l'array "candidates" deve essere ordinato per IMPORTANZA DECRESCENTE — la prima attrazione è la più iconica e imperdibile in assoluto, l'ultima la meno essenziale.
Ogni candidato deve contenere:
- id: un identificatore univoco (es. "cand_1", "cand_2", etc.)
- giorno: assegna casualmente un giorno ideale per la visita (numero da 1 a ${days})
- titolo_tappa: nome reale e preciso dell'attrazione
- tipo: la categoria dell'attrazione (usa uno dei seguenti termini: 'museo', 'chiesa', 'attrazione', 'panorama', 'mostra', 'monumento', 'ristorante', 'parco')
- attivita: una descrizione accattivante e breve (1-2 frasi) che ne spieghi il motivo per cui vale la pena visitarlo.
- coordinate: le coordinate geografiche stimate (latitudine "lat" e longitudine "lng") reali e precise dell'attrazione.
- query_immagine: una query di ricerca in inglese adatta a trovare un'immagine su Unsplash (es. "Rome Colosseum").

Formatta la risposta ESCLUSIVAMENTE come un oggetto JSON valido con la chiave "candidates" che contiene l'array dei candidati.
Non includere spiegazioni o testo prima o dopo il JSON.

RISPONDI RIGOROSAMENTE NELLA LINGUA: ${language}.
`;

    const userPrompt = `Genera l'elenco dei candidati per la città di ${destination} per un viaggio di ${days} giorni, concentrandoti su attrazioni di tipo: ${categoriesStr}.${geoAnchor}`;

    console.log(`[DeepSeek Candidates] Generating ${numCandidates} candidates (${safeDays} days) for ${destination} using DeepSeek...`);
    const response = await callUniversalAi(
      "deepseek",
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      {
        response_format: { type: "json_object" },
        temperature: 0.7
      },
      "generazione_candidati",
      supabaseUrl,
      supabaseServiceKey,
      groq
    );

    const parsed = parseSafeJSON(response.data || "{}");
    res.json(parsed);
  } catch (e: any) {
    console.error("Candidates Generation Error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/groq/itinerary", rateLimiter, async (req, res) => {
    try {
      const { destination, days, interests, pois, lockedStops, specialRequests, startTime, endTime, budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY", mese, includeEvents, includeTours, radius = 100, language: userLanguage = "IT" } = req.body;
      const tInizio = startTime || "09:00";
      const tFine = endTime || "19:00";
      
      const cacheKeyStr = `itinerary_${destination}_${days}_${(pois||[]).join('_')}_${(interests||[]).join('_')}_${tInizio}_${tFine}_${specialRequests||''}_${userLanguage}`;
      const cacheKey = crypto.createHash('md5').update(cacheKeyStr).digest('hex');
      
      const cached = await getFromCache(cacheKey);
      if (cached && cached.text_content) {
        // Cache riattivata: il "TEST BYPASS" lasciato acceso faceva
        // rigenerare (e ripagare) ogni itinerario già prodotto.
        console.log(`[Cache Hit] Itinerary for ${destination}`);
        return res.json(cached.text_content);
      }

      // Quota Circuit Breaker Check - if not allowed, we force fallback to Gemini!
      const quota = await checkAndIncrementQuota(req, 'itinerari');
      let forceGemini = !quota.allowed;
      if (forceGemini) {
        console.log("[Quota Exceeded] Bypassing daily block alert and forcing Gemini engine fallback!");
      }



      console.log(`[RAG] Fetching geographical context for ${destination}...`);
      const ragContextObj = await fetchGeographicContext(destination);
      
      let ragInstruction = "";
      if (ragContextObj && ragContextObj.context) {
        ragInstruction = `\nSei una guida turistica. Genera un itinerario per l'utente basandoti ESCLUSIVAMENTE su questi dati reali verificati da OpenStreetMap/Database:\n\n${ragContextObj.context}\n\nNon inventare attrazioni non presenti in questa lista.\n`;
      }

      let prompt = "";

      let ritmoTimingRule = agentTools.getRitmoTimingRule(ritmo);

      const hardRules = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE GOLD STANDARD (PENA FALLIMENTO TOTALE SE VIOLATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. TITOLO: Formato OBBLIGATORIO â†’ "[Tema/Interessi] a [Città]: Un Itinerario di [N] Giorni". NON usare titoli generici come "Visita a Roma".
2. LUNGHEZZA "attivita": MINIMO 80-100 parole (4-5 righe). Deve essere narrativo, coinvolgente, ricco di dettagli visivi, storici e pratici specifici. VIETATI i riassuntini.
3. CONSIGLI DOPPI OBBLIGATORI: "consiglio_guida" DEVE contenere ENTRAMBE le guide con le emoji:
   ✨ Nicky (60-80 parole: atmosfera, selfie, Instagram, colori, dove posizionarsi per la foto perfetta)
   📜 Dante (60-80 parole: storia profonda, architettura, curiosità verificate, date esatte, aneddoti reali)
   VIETATO ASSOLUTO: "Godetevi il panorama", "Un luogo imperdibile", frasi vuote.
4. TABELLA BUDGET REALISTICA: Prezzi REALI aggiornati (ticket veri dei musei, tariffe vere dei ristoranti). OBBLIGATORIO includere nome specifico del locale + piatto tipico consigliato per ogni pasto (colazione, pranzo, cena). Calcolo matematico corretto: somma delle voci = totale_giorno.
5. LINK OBBLIGATORIO OGNI TAPPA: "link_info" DEVE essere il sito ufficiale REALE e FUNZIONANTE di ogni attrazione/ristorante/museo. Per tour Viator/GetYourGuide: link profondo SPECIFICO dell'esperienza (es. https://www.viator.com/tours/Miami/Art-Deco-Tour/d763-XXXX). MAI link generici (homepage) o vuoti.
6. COORDINATE GPS ESATTE: "lat" e "lng" con MINIMO 4 decimali reali e precisi. VIETATE coordinate arrotondate (45.0, 7.0) o inventate.
7. TAPPE MINIME PER GIORNO: Ritmo standard â†’ 5-6 tappe/giorno. OBBLIGATORIO per ogni giorno: colazione, pranzo e cena con nome del locale specifico e piatto tipico.
8. INFO VIAGGIO IPER-SPECIFICHE: 4 sezioni (precauzioni, suggerimenti, raccomandazioni, zone_da_evitare) Ã— MINIMO 3 voci ciascuna. SOLO nomi propri, strade reali, orari, prezzi, tessere turistiche nominali. VIETATO ASSOLUTO: "Attenzione ai borseggiatori", "Rispettare le regole", "Godersi un caffè storico".
9. TIMING MATEMATICAMENTE COERENTE: verifica che orario_tappa + tempo_necessario + spostamento = orario_prossima_tappa. Nessuna tappa può iniziare prima che quella precedente finisca.
10. BUFFER TIME OBBLIGATORIO: Ogni tappa culturale (museo, chiesa, monumento) deve includere ALMENO 15-20 minuti di buffer extra oltre al tempo di visita stimato per gestire imprevisti, code e spostamenti minori non calcolati.
11. TOTALE VIAGGIO: Campo "totale_viaggio" OBBLIGATORIO in fondo â†’ range min-max calcolato matematicamente dai costi (es. "€ 420 - € 520 p.p.").
12. RITMO E TIMING: ${ritmoTimingRule}
${ANTI_HALLUCINATION_RULES}`;

      if (pois && pois.length > 0) {
        prompt = `Crea un itinerario ottimizzato per ${days} giorni a ${destination} (con orario riga giornaliero da ${tInizio} a ${tFine}) includendo questi luoghi: ${pois.join(", ")}.${hardRules}\n\nREGOLA SUPREMA INVALICABILE: DEVI ASSOLUTAMENTE INCLUDERE TUTTE LE TAPPE ELENCATE (${pois.join(", ")}). È severamente vietato omettere anche solo una di queste tappe. Se il tempo a disposizione è limitato, riduci la durata di ciascuna visita pur di farle entrare tutte nell'itinerario.`;
      } else {
        const fallbackInterests = interests || [];
        prompt = `Crea un itinerario ottimizzato per ${days} giorni a ${destination} (con orario riga giornaliero da ${tInizio} a ${tFine}) basato su questi interessi: ${fallbackInterests.join(", ")}.${hardRules}`;
      }

      if (specialRequests) {
        prompt += `\nL'utente ha anche queste RICHIESTE PARTICOLARI a cui devi assolutamente attenerti: "${specialRequests}". Modifica l'itinerario e i luoghi in base a queste richieste (es. ristoranti particolari, solo certe attrazioni, etc).`;
      }

      // (PredictHQ rimosso: gli eventi entrano via Ticketmaster/Viator nel prompt)

      if (includeTours) {
        console.log(`[Viator] Fetching real tours for itinerary in ${destination}...`);
        const toursRes = await agentTools.searchViatorExperiences(0, 0, radius, undefined, undefined, destination);
        try {
          const toursArray = JSON.parse(toursRes);
          if (Array.isArray(toursArray) && toursArray.length > 0 && !toursArray[0].error && toursArray[0].name !== "Tour Esclusivo e Degustazione") {
            const viatorData = toursArray.slice(0, 3).map((t: any) => `- ${t.name} (${t.price}, durata: ${t.duration}). Link: ${t.url}`).join("\n");
            if (viatorData) {
              prompt += `\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. DEVI integrare ESATTAMENTE 3 di questi tour Viator nell'itinerario (se sufficienti, circa 1 al giorno):\n${viatorData}\nAssicurati di usare i dettagli forniti (prezzi, orari, titoli). DEVI INSERIRE il link specifico esatto dell'esperienza Viator nel campo "link_info" della tappa (non usare MAI un link generico ad aviator/viator). I TOUR VIATOR HANNO ASSOLUTA PRIORITÀ SUGLI EVENTI. Se ci sono eventi, inseriscili solo se c'è ancora spazio DOPO aver inserito i tour Viator. Tutte le informazioni devono essere accuratissime e di massima qualità. Imposta la categoria di queste tappe a "Esperienze".`;
            } else {
             prompt += `\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. Genera 1 o 2 tappe per tour estremamente rinomati e REALI per la destinazione, di cui sei CERTO che esistano. VIETATO costruire URL Viator/GetYourGuide/Tiqets a memoria (risultano quasi sempre inventati): lascia "link_info" VUOTO per queste tappe. NON usare MAI link di ricerca generici. Imposta la categoria di queste tappe a "Esperienze".`;
            }
          } else {
             prompt += `\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. Genera 1 o 2 tappe per tour estremamente rinomati e REALI per la destinazione, di cui sei CERTO che esistano. VIETATO costruire URL Viator/GetYourGuide/Tiqets a memoria (risultano quasi sempre inventati): lascia "link_info" VUOTO per queste tappe. NON usare MAI link di ricerca generici. Imposta la categoria di queste tappe a "Esperienze".`;
          }
        } catch(e) {
          prompt += `\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. Genera 1 o 2 tappe per tour estremamente rinomati e REALI per la destinazione, di cui sei CERTO che esistano. VIETATO costruire URL Viator/GetYourGuide/Tiqets a memoria (risultano quasi sempre inventati): lascia "link_info" VUOTO per queste tappe. NON usare MAI link di ricerca generici. Imposta la categoria di queste tappe a "Esperienze".`;
        }
      }

      // ── BIGLIETTI D'INGRESSO REALI (Tiqets) ──────────────────────────
      // NON gated su includeTours: prezzi e link biglietto valgono per le
      // tappe normali (musei, attrazioni). Le URL arrivano dall'API già
      // affiliate (partner nel token): il modello deve copiarle INTATTE.
      try {
        const tiqetsList = await fetchTiqetsProducts({ cityName: destination, lang: String(userLanguage || 'IT').toLowerCase(), pageSize: 8 });
        if (tiqetsList.length > 0) {
          const tqData = tiqetsList.slice(0, 6).map((t: any) => `- ${t.name}${t.venue ? ` [${t.venue}]` : ''} (${t.price}${t.rating ? `, ${t.rating}` : ''}). Link: ${t.url}`).join("\n");
          prompt += `\nBIGLIETTI D'INGRESSO REALI (Tiqets) per la destinazione. Se una tappa dell'itinerario corrisponde a una di queste attrazioni: usa ESATTAMENTE l'URL indicato nel campo "link_info" della tappa (copialo INTATTO, contiene il codice partner) e riporta il prezzo reale del biglietto nella tabella budget del giorno. VIETATO costruire URL tiqets.com a memoria o modificare quelli forniti:\n${tqData}`;
        }
      } catch (tqErr: any) {
        console.warn('[Tiqets] Iniezione itinerario (non-stream) fallita:', tqErr?.message);
      }

      let lockedStopsInstruction = "";
      if (lockedStops && lockedStops.length > 0) {
        lockedStopsInstruction = `
ATTENZIONE - DEVI MANTENERE ASSOLUTAMENTE QUESTE TAPPE BLOCCATE:
Queste tappe devono essere presenti nel tuo JSON ESATTAMENTE in questi orari e giorni, rispettando l'ordine.
Tappe bloccate: 
${JSON.stringify(lockedStops, null, 2)}
`;
      }

      const systemPrompt = `Sei il motore di pianificazione viaggi di World in Pocket (WIP).
Il tuo compito è generare itinerari di viaggio personalizzati, geograficamente ottimizzati, narrativamente coerenti e verificati.
Ogni itinerario deve sembrare curato da un esperto locale, non generato da una macchina.
FONDAMENTALE: È un REQUISITO ASSOLUTO (MUST) inserire SEMPRE il link al sito web (nel campo "link_info") per OGNI SINGOLA TAPPA dell'itinerario. MAI inventarsi il sito internet - usa SOLO siti verificati e reali. Se non esiste un sito web verificato, lascia il campo vuoto invece di inventarlo. I link devono essere estremamente accurati e funzionanti. Per tour ed esperienze, DEVI usare il link profondo specifico dell'esperienza, mai la homepage generica.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PARAMETRI DI INPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESTINAZIONE          : ${destination}
DURATA                : ${days} giorni
MESE/PERIODO          : ${mese || 'Generico'}
INIZIO GIORNATA       : ${tInizio}
FINE GIORNATA         : ${tFine}
INTERESSI             : ${(interests || []).join(", ")}
BUDGET                : ${budget}
VIAGGIATORI           : ${viaggiatori}
RITMO                 : ${ritmo}
RICHIESTE PARTICOLARI : ${specialRequests || "Nessuna"}
GUIDA                 : ${guida}
${lockedStopsInstruction}
${ragInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. IDENTITÀ DELLE GUIDE E CONSIGLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ NICKY: Informale, entusiasta, focalizzata su atmosfera, selfie, caffè nascosti e dettagli visivi. (Es. "Non perdete la maestosa Aula... Catturate l'eleganza per un selfie storico!")
📜 DANTE: Autorevole, preciso, focalizzato su storia, architettura e curiosità culturali. (Es. "Approfondite la sezione dedicata alla dinastia Savoia... un'esperienza ineguagliabile.")

REGOLE PER I CONSIGLI:
✓ Se l'utente non specifica, fornisci ENTRAMBI i consigli (Nicky e Dante) uniti nella stessa stringa, preceduti dalle rispettive emoji.
✓ LUNGHEZZA: Ogni consiglio (sia Nicky che Dante) deve essere un paragrafo di ALMENO 4 o 5 RIGHE CORPOSE (circa 60-80 parole), ricchissimo di dettagli specifici della tappa.
✓ MAI generico. Nessun "Godetevi il panorama", "luogo imperdibile", "visita il centro storico". Spiega esattamente COSA guardare, storia profonda, e dove posizionarsi per la foto perfetta.
✓ ANCORAGGIO ALLA TAPPA: ogni consiglio DEVE citare almeno UN elemento concreto e verificabile di QUELLA precisa tappa (un'opera, una data, un dettaglio architettonico o geologico, un punto esatto dove posizionarsi, un aneddoto storico reale). Un consiglio trasferibile a un'altra tappa così com'è = fallimento.
✓ NO RIPETIZIONI: vietato riproporre lo stesso schema di consiglio su tappe diverse dello stesso itinerario (es. "selfie all'ingresso" ovunque). Ogni tappa ha la sua chicca unica.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ADATTAMENTO E VERIFICA DATI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Le richieste particolari hanno priorità assoluta su tutto.
Verifica che ogni attrazione sia aperta nel giorno previsto.
RISTORANTI: Usa i dati di contesto (price_level e status) se disponibili, e assegna un badge di confidenza. Mai coordinate crude nel testo.
LOGICA GEOGRAFICA: Raggruppa le tappe per quartiere. Spostamento >20min a piedi -> suggerisci mezzo pubblico.
PAUSE: Almeno 1 pausa ogni 3 tappe culturali.
COORDINATE GPS: Il campo "coordinate" (lat e lng) DEVE contenere le ESATTE coordinate geografiche reali del luogo. Cerca di inserire i valori reali con massima precisione (es. Colosseo: 41.8902, 12.4922). DIVIETO ASSOLUTO di inserire coordinate inventate, casuali, arrotondate (es. 45.0, 7.0) o fittizie. Usa i dati di contesto se presenti. Se non le sai con precisione, indaga nei tuoi dati di training per trovare il punto esatto sulla mappa. Questo è VITALE per il rendering della mappa dell'utente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. RITMO E TIMING (REGOLE TASSATIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ritmoTimingRule}
- COERENZA ORARI: Verifica matematicamente i tempi di visita e di percorrenza. L'orario deve essere logico in base alla tappa precedente + "tempo_necessario" + "spostamento_precedente".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4.1 COERENZA FILTRI E INTERESSI (PRIORITÀ ALTA)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
L'itinerario deve riflettere rigorosamente i filtri selezionati dall'utente:
- Se negli Interessi o Richieste è presente "Shopping": includi ALMENO UNA tappa in un distretto commerciale, boutique o centro commerciale.
- Se negli Interessi o Richieste è presente "Fotografia": includi ALMENO 2-3 tappe in punti panoramici (viewpoints), monumenti iconici o location con alta valenza estetica.
- Qualsiasi altro interesse/richiesta (es. arte, avventura, enogastronomia) DEVE pesare profondamente sulla scelta delle tappe, modificando il 60-70% dell'itinerario per assecondare il tema.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. STRUTTURA BUDGET — TABELLA COSTI (MASSIMO REALISMO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Per ogni giorno genera questa tabella in fondo alla giornata. 
È TASSATIVO che i prezzi siano REALI e AGGIORNATI. Ricerca nella tua memoria il VERO costo del biglietto del museo/attrazione. Ricerca il VERO costo medio del ristorante che hai scelto. Non inventare cifre tonde casuali. Se un museo costa € 18, scrivi € 18, non € 10.
In fondo all'itinerario completo:
TOTALE STIMATO VIAGGIO: € XX - € XX p.p. (range min-max per variazioni reali calcolato matematicamente sui costi inseriti).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. FORMATO JSON E REGOLE DI OUTPUT (IGNORARE QUESTA STRUTTURA È UN ERRORE FATALE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE PER INFO VIAGGIO (TASSATIVE E CRITICHE):
1. DIVIETO ASSOLUTO DI FRASI FATTE E GENERICHE: È severamente VIETATO scrivere ovvietà come "Godersi un caffè in un bar storico", "Acquistare specialità locali", "Visita al Mercato Centrale", "Attenzione ai borseggiatori", "Rispettare le regole dei monumenti", "Passeggiata sulle mura". Se usi una di queste frasi, l'itinerario è considerato un fallimento totale!
2. IPER-SPECIFICITÀ LOCALE E REALE: Forzare l'uso esclusivo di nomi propri, strade reali, locali veri e orari specifici.
3. LUNGHEZZA E DETTAGLIO: Sii conciso ma iper-dettagliato. Ogni voce deve essere di 15-30 parole, senza frasi di riempimento. VAI DRITTO AL PUNTO.
4. LE 4 SEZIONI OBBLIGATORIE E BILANCIATE (ESATTAMENTE 3-4 voci per OGNUNA delle quattro, mai una sezione lunga e una striminzita; voci di lunghezza simile tra loro, leggibili su schermo mobile):
   - "precauzioni": Regole ferree e mirate della zona (es. ZTL con orari, biglietti dei mezzi specifici della città, ordinanze locali reali).
   - "suggerimenti": 'Life-hack' locali veri e geolocalizzati (es. tessere turistiche nominali con prezzo, orari con meno folla di UN luogo preciso, biglietti salta-fila nominati).
   - "raccomandazioni": Cibi/esperienze tipiche con il NOME del locale e della via (niente "gelato artigianale" generico).
   - "zone_da_evitare": Nomi esatti di piazze, stazioni o quartieri da evitare, specificando la fascia oraria (es. la zona intorno alla stazione di notte). Anche qui 3 voci: se la città è molto sicura, indica micro-criticità reali (parcheggi selvaggi, vicoli bui specifici, tratti trafficati).
5. SOLO INFORMAZIONI RIFERITE PUNTUALMENTE ALLA ZONA DELL'ITINERARIO: ogni voce deve contenere almeno un nome proprio (via, piazza, locale, linea di trasporto, tessera) verificabile di QUELLA destinazione. Una voce riutilizzabile per qualsiasi città = fallimento.

Struttura JSON ESATTA DA REPLICARE COME FORMATO E LUNGHEZZA (DEVI SOSTITUIRE I DATI CON QUELLI DELLA CITTÀ E DEI POI REALI RICHIESTI DALL'UTENTE):
{
  "titolo": "Titolo evocativo e specifico (non generico)",
  "info_viaggio": {
    "precauzioni": ["Occhio ai borseggiatori sulla linea 64 verso Termini.", "Divieto di bivacco sui gradini di Trinità dei Monti in Piazza di Spagna.", "Sampietrini scivolosi a Trastevere durante le piogge autunnali."],
    "suggerimenti": ["Roma Pass 48h per saltare le code al Colosseo.", "Visita la Fontana di Trevi alle 6:30 del mattino per evitare la folla.", "Colazione con Maritozzo da Regoli vicino Piazza Vittorio."],
    "raccomandazioni": ["Carciofo alla Giudia da 'Nonna Betta' nel Ghetto Ebraico.", "Vista a 360 gradi dalla Terrazza delle Quadrighe al Vittoriano.", "Panino con la trippa al mercato rionale di Testaccio da Mordi e Vai."],
    "zone_da_evitare": ["Evitare Piazza Vittorio Emanuele e i portici di Termini da soli dopo le 23:00.", "Via Giolitti lato binari: scarsamente illuminata dopo la chiusura dei negozi.", "Zona Tor Bella Monaca di sera se non accompagnati da residenti."]
  },
  "giorni": [
    {
      "giorno": 1,
      "tappe": [
        {
          "id_tappa": "string",
          "ora": "09:30",
          "titolo_tappa": "Museo Nazionale del Risorgimento",
          "attivita": "Inizia la giornata immergendoti nella magnificenza di Palazzo Carignano, capolavoro del barocco e prima sede del parlamento italiano. Passeggia nelle maestose sale storiche ammirando documenti originali, armi e cimeli dell'Unità d'Italia. All'interno, ammira gli arredi originali e l'imponente Aula della Camera Subalpina intatta dal 1848. Perfetto per gli amanti della storia e della fotografia: ogni sala è un tuffo emozionante nel passato della nazione!",
          "consiglio_guida": "✨ Nicky: Porta la tua macchina fotografica! Il punto migliore per uno scatto è lo scalone monumentale all'ingresso con la luce naturale del mattino. Non perderti i velluti rossi dell'Aula: sono super scenografici! 📜 Dante: Il palazzo fu completato nel 1684 da Guarino Guarini per i Savoia-Carignano. Ogni dettaglio architettonico riflette il genio barocco. Le teche ospitano lettere originali di Cavour e Garibaldi. Prenditi 15 minuti per leggere attentamente i dispacci segreti esposti nella sala finale.",
          "tempo_necessario": "2 ore",
          "spostamento_precedente": "15 min a piedi",
          "tipo": "museo",
          "coordinate": { "lat": 45.068, "lng": 7.686 },
          "link_info": "URL UFFICIALE REALE (MUST: Inserisci SEMPRE il sito ufficiale per ristoranti, musei, shopping, spiagge, tour. Se tour Viator, metti il link specifico)"
        },
        {
          "id_tappa": "string",
          "ora": "13:00",
          "titolo_tappa": "Ristorante Del Cambio",
          "attivita": "Pausa pranzo in uno dei locali più rinomati del centro cittadino. Assapora le specialità locali preparate al momento in un ambiente storico. L'atmosfera è elegante ma informale, con affreschi originali ovunque. Perfetto per ricaricare le energie prima del pomeriggio di esplorazione culinaria e culturale.",
          "consiglio_guida": "✨ Nicky: Ordina il classico 'Vitello Tonnato' rivisitato e un calice di vino locale. Il locale è super instagrammabile: fate una foto con il grande specchio all'ingresso! 📜 Dante: Il ristorante utilizza ricette tradizionali piemontesi tramandate dal 1700. Cavour sedeva sempre al tavolo d'angolo vicino alla finestra. Un assaggio di pura autenticità nel cuore di Torino.",
          "tempo_necessario": "1.5 ore",
          "spostamento_precedente": "10 min a piedi",
          "tipo": "pranzo",
          "coordinate": { "lat": 45.068, "lng": 7.686 }
        },
        {
          "id_tappa": "string",
          "ora": "15:00",
          "titolo_tappa": "Museo Egizio",
          "attivita": "Pomeriggio dedicato all'esplorazione dell'antico Egitto in questo museo di fama mondiale. Ammira la sua impressionante architettura e una selezione di reperti faraonici unica al di fuori del Cairo. Goditi le imponenti statue e i papiri millenari perfettamente conservati.",
          "consiglio_guida": "✨ Nicky: Concentrati sulle gallerie principali al secondo piano e non perdere le installazioni luminose nella Galleria dei Re. 📜 Dante: Progettato e curato con standard museali d'eccellenza, il Museo Egizio è un punto di riferimento inaugurato nel 1824, noto per l'immensa collezione voluta dai Savoia.",
          "tempo_necessario": "2 ore",
          "spostamento_precedente": "5 min a piedi",
          "tipo": "museo",
          "coordinate": { "lat": 45.068, "lng": 7.686 }
        }
      ],
      "tabella_budget": {
        "attrazioni": { "dettaglio": "Museo Risorgimento: €10. Museo Egizio: €15.", "stima_pp": "€ 25" },
        "trasporti": { "dettaglio": "Spostamenti a piedi nel centro, zero mezzi pubblici.", "stima_pp": "€ 0" },
        "colazione": { "dettaglio": "Bicerin tradizionale e brioche in caffetteria storica.", "stima_pp": "€ 5" },
        "pranzo": { "dettaglio": "Ristorante Del Cambio: 'Vitello Tonnato' storico.", "stima_pp": "€ 70" },
        "cena": { "dettaglio": "Agnolotti del Plin in osteria tipica.", "stima_pp": "€ 40" },
        "totale_giorno": "€ 140"
      }
    }
  ],
  "totale_viaggio": "€ 220 - € 250 p.p. (stima per 2 giorni, escluse cene libere e acquisti extra. Il range tiene conto di scelte personali di menu e bevande)."
}

Non aggiungere testo prima o dopo il JSON.`;

      let result;
      let usedEngine = "none";
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[DeepSeek Itinerary] Using DeepSeek for itinerary generation... (Attempt ${attempt + 1})`);
          const response = await callUniversalAi(
            "deepseek",
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt || "" }
            ],
            {
              response_format: { type: "json_object" },
              temperature: 0.7
            },
            "generazione_itinerari",
            supabaseUrl,
            supabaseServiceKey,
            groq
          );
          const parsed = parseSafeJSON(response.data || "{}");
          
          if (parsed && parsed.giorni && Array.isArray(parsed.giorni) && parsed.giorni.length > 0) {
            result = parsed;
            usedEngine = "deepseek";
            console.log("[DeepSeek Itinerary] Generation successful.");
            break; // Success! Break out of retry loop
          } else {
            console.warn(`[DeepSeek Itinerary] Attempt ${attempt + 1} generated incomplete JSON. Retrying...`);
            result = null;
          }
        } catch (err: any) {
          console.warn(`[DeepSeek Itinerary] Attempt ${attempt + 1} failed:`, err.message);
        }
      }

      if (!result) {
         return res.status(500).json({ error: "I motori AI hanno restituito dati troncati o JSON invalido dopo multipli tentativi. Riprova con meno giorni o riducendo i dettagli." });
      }

      await saveToCache(cacheKey, 'itinerary', result);

      if (usedEngine === "gemini" && quota.userId) {
        await incrementQuotaCount(quota.userId, 'itinerari').catch(e => console.error(e));
      }

      if (usedEngine === "groq" && quota.userId) {
        await incrementQuotaCount(quota.userId, 'itinerari').catch(e => console.error(e));
        // Telemetry is now handled centrally by callGroqWithFallback
      }

      if (result) {
        if (!result.info_viaggio) result.info_viaggio = {};
        result.info_viaggio.includeTours = !!includeTours;
        result.info_viaggio.includeEvents = !!includeEvents;
      }

      res.json(result);
    } catch (e: any) {
      console.error("DeepSeek Itinerary Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── VERIFICA ANTI-ALLUCINAZIONE (tutte le modalità itinerario + guida
  // premium). Il client la chiama DOPO la generazione DeepSeek: un motore
  // DIVERSO (Agnes, fallback Groq) rilegge le tappe e marca quelle sospette
  // o non conformi ai vincoli. Fail-open con timeout: la consegna
  // dell'itinerario non viene MAI bloccata da questa verifica.
  app.post("/api/itinerary/verify", rateLimiter, async (req, res) => {
    try {
      const { itinerary, destination, lat, lon, radius, specialRequests, interests, language } = req.body || {};
      if (!itinerary || !destination) return res.status(400).json({ error: "Missing itinerary/destination" });
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 25000));
      const report = await Promise.race([
        verifyItineraryAntiHallucination(itinerary, { destination, lat, lon, radiusKm: radius, specialRequests, interests, language }),
        timeout,
      ]);
      // verifyItineraryAntiHallucination muta itinerary in place (campi
      // "verifica"/"nota_verifica" per tappa): lo restituiamo marcato.
      res.json({ itinerary, report });
    } catch (e: any) {
      console.warn("[Itinerary Verify] fallita (fail-open):", e.message);
      res.json({ itinerary: req.body?.itinerary || null, report: { error: e.message } });
    }
  });

  app.post("/api/groq/itinerary-stream", rateLimiter, async (req, res) => {
    try {
      const { destination, days, interests, pois, poisDetailed, specialRequests, startTime, endTime, budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY", mese, includeEvents, includeTours, radius = 100, lockedStops, lat, lon, language } = req.body;
      const tInizio = startTime || "09:00";
      const tFine = endTime || "19:00";
      // interests può arrivare come stringa singola: prima esplodeva con
      // "(interests || []).join is not a function"
      const interestsArr = Array.isArray(interests) ? interests : (interests ? [String(interests)] : []);

      // Lingua dell'utente: i TESTI dell'itinerario devono essere nella sua
      // lingua; chiavi e struttura del JSON restano invariate.
      const LANG_NAMES: Record<string, string> = { IT: "italiano", EN: "inglese (English)", FR: "francese (français)", ES: "spagnolo (español)", DE: "tedesco (Deutsch)", RU: "russo (русский)", ZH: "cinese semplificato (简体中文)" };
      const langName = LANG_NAMES[String(language || "IT").toUpperCase()] || "italiano";
      const langInstruction = langName === "italiano" ? "" : `\nLINGUA OBBLIGATORIA: scrivi TUTTI i testi (titolo, attivita, consiglio_guida, info_viaggio, dettagli budget) in ${langName}. Le CHIAVI del JSON e la struttura restano ESATTAMENTE come specificato (in italiano). I prefissi "✨ Nicky" e "📜 Dante" nel consiglio_guida restano invariati.`;

      // Preferenze del form: prima erano ricevute e ignorate — ora entrano
      // nel prompt, SENZA toccare la struttura del JSON di output.
      const prefParts: string[] = [];
      if (budget) prefParts.push(`Budget: ${budget} — adatta scelta di locali/attrazioni e stime della tabella_budget a questa fascia`);
      if (viaggiatori) prefParts.push(`Tipo di viaggiatori: ${viaggiatori} — calibra attività e ritmi per questo gruppo`);
      if (ritmo) prefParts.push(`Ritmo: ${ritmo} — regola di conseguenza numero di tappe e durata delle visite`);
      if (mese) prefParts.push(`Periodo del viaggio: ${mese} — considera stagionalità, clima, orari di apertura ed eventi del periodo`);
      if (includeEvents) prefParts.push(`Includi eventi locali reali (concerti, sagre, mostre) se disponibili nel periodo`);
      if (includeTours) prefParts.push(`Includi tour ed esperienze guidate quando pertinenti`);
      if (req.body.radius != null && Number(radius) > 0) prefParts.push(`Raggio massimo dalle coordinate della destinazione: ${radius} km — non proporre tappe oltre questa distanza`);
      if (guida) prefParts.push(`Guida preferita dall'utente: ${guida} (mantieni comunque nel consiglio_guida ENTRAMBE le voci ✨ Nicky e 📜 Dante)`);
      const userPrefs = prefParts.length ? `\n\nPREFERENZE UTENTE — rispettale tutte:\n- ${prefParts.join("\n- ")}` : "";
      // Ancora geografica dal geocoder del client (vedi /api/groq/candidates)
      const geoAnchor = (typeof lat === "number" && typeof lon === "number")
        ? `\nLA DESTINAZIONE "${destination}" SI TROVA ESATTAMENTE ALLE COORDINATE lat ${lat}, lon ${lon}. Tutte le tappe devono trovarsi in quella città/area, NON in località omonime o in altri paesi.`
        : "";
      
      const quota = await checkAndIncrementQuota(req, 'itinerari');
      if (!quota.allowed) {
        res.write(`data: ${JSON.stringify({ error: "QUOTA_EXCEEDED" })}\n\n`);
        return res.end();
      }

      const ragContextObj = await fetchGeographicContext(destination);
      let ragInstruction = "";
      if (ragContextObj && ragContextObj.context) {
        ragInstruction = `\nSei una guida turistica. Genera un itinerario basandoti ESCLUSIVAMENTE su questi dati reali verificati:\n\n${ragContextObj.context}\n\nNon inventare attrazioni non presenti in questa lista.\n`;
      }

      // Pasti ancorati a locali reali (TripAdvisor + Foursquare, in parallelo,
      // tetto 6s): riduce le allucinazioni sui ristoranti di pranzo/cena.
      let diningContext = "";
      if (typeof lat === "number" && typeof lon === "number") {
        diningContext = await Promise.race([
          fetchRealDiningContext(lat, lon),
          new Promise<string>((resolve) => setTimeout(() => resolve(""), 6000)),
        ]).catch(() => "");
      }

      // Tour ed esperienze REALI (Viator API + GYG scraping con Agnes):
      // prima la modalità stream generava tappe "Esperienze" INVENTATE
      // dall'AI con link fasulli. Tetto 12s (la prima città paga lo scraping,
      // poi la cache rende tutto istantaneo); fail-open su stringa vuota.
      let toursContext = "";
      if (includeTours) {
        toursContext = await Promise.race([
          (async () => {
            const [viatorRaw, gygList] = await Promise.all([
              agentTools.searchViatorExperiences(0, 0, radius, undefined, undefined, destination).catch(() => "[]"),
              fetchGygExperiencesScraped(destination, String(language || 'IT').toLowerCase()).catch(() => []),
            ]);
            const lines: string[] = [];
            try {
              const vArr = JSON.parse(viatorRaw);
              if (Array.isArray(vArr) && vArr.length > 0 && !vArr[0]?.error && vArr[0]?.name !== "Tour Esclusivo e Degustazione") {
                vArr.slice(0, 3).forEach((t: any) => lines.push(`- [Viator] ${t.name}${t.price ? ` (${t.price}${t.duration ? `, ${t.duration}` : ''})` : ''} → link_info ESATTO: ${t.url}`));
              }
            } catch (e) {}
            (gygList || []).slice(0, 3).forEach((g: any) => lines.push(`- [GetYourGuide] ${g.name}${g.price ? ` (${g.price})` : ''} → link_info ESATTO: ${g.url}`));
            if (lines.length === 0) return "";
            return `\nATTENZIONE: l'utente ha chiesto TOUR/ESPERIENZE. Integra nell'itinerario 2-3 di queste esperienze REALI (circa 1 al giorno), usando ESATTAMENTE il titolo indicato e copiando ESATTAMENTE l'URL nel campo "link_info" (VIETATO modificarlo, abbreviarlo o sostituirlo). Imposta "tipo": "Esperienze" e "fonte": "Viator" o "GetYourGuide". NON inventare MAI altri tour oltre a questi:\n${lines.join("\n")}`;
          })(),
          new Promise<string>((resolve) => setTimeout(() => resolve(""), 12000)),
        ]).catch(() => "");
      }

      // Biglietti d'ingresso reali Tiqets (URL già affiliate dal token): NON
      // gated su includeTours — prezzi e link biglietto servono anche alle
      // tappe normali (musei, attrazioni). Fail-open con tetto 8s.
      let ticketsContext = "";
      try {
        const tqList: any[] = await Promise.race([
          fetchTiqetsProducts({ cityName: destination, lang: String(language || 'IT').toLowerCase(), pageSize: 8 }),
          new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 8000)),
        ]);
        if (Array.isArray(tqList) && tqList.length > 0) {
          const tqLines = tqList.slice(0, 6).map((t: any) => `- [Tiqets] ${t.name}${t.venue ? ` [${t.venue}]` : ''} (${t.price}${t.rating ? `, ${t.rating}` : ''}) → link_info ESATTO: ${t.url}`);
          ticketsContext = `\nBIGLIETTI D'INGRESSO REALI (Tiqets): se una tappa corrisponde a una di queste attrazioni usa ESATTAMENTE questo URL in "link_info" (copiato INTATTO: contiene il codice partner) e riporta il prezzo del biglietto nel budget del giorno. VIETATO costruire URL tiqets.com a memoria:\n${tqLines.join("\n")}`;
        }
      } catch { /* fail-open: l'itinerario vive anche senza biglietti */ }

      // ── PERCORSO PIÙ BREVE CALCOLATO QUI (non dall'AI) ──────────────────
      // Il client (swipe/preferiti) invia `poisDetailed` con le coordinate,
      // che prima venivano IGNORATE: l'assegnazione ai giorni era casuale e
      // gli spostamenti a zig-zag. Ora: giro nearest-neighbour su tutti i POI
      // partendo dal più periferico, poi spezzato in segmenti contigui per
      // giorno → giornate geograficamente compatte e ordine di visita ottimo.
      let routePlanInstruction = "";
      const pdArr: any[] = (Array.isArray(poisDetailed) ? poisDetailed : [])
        .map((p: any) => ({ ...p, lat: Number(p?.lat), lon: Number(p?.lon) }))
        .filter((p: any) => p.nome && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0);
      const nDaysRoute = Math.min(30, Math.max(1, Math.floor(Number(days)) || 1));
      if (pdArr.length >= 2) {
        const distKm = (a: any, b: any) => {
          const dLat = (a.lat - b.lat) * 111.32;
          const dLon = (a.lon - b.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
          return Math.sqrt(dLat * dLat + dLon * dLon);
        };
        const cLat = pdArr.reduce((s, p) => s + p.lat, 0) / pdArr.length;
        const cLon = pdArr.reduce((s, p) => s + p.lon, 0) / pdArr.length;
        let startIdx = 0, maxD = -1;
        pdArr.forEach((p, i) => { const d = distKm(p, { lat: cLat, lon: cLon }); if (d > maxD) { maxD = d; startIdx = i; } });
        const remaining = [...pdArr];
        const ordered = [remaining.splice(startIdx, 1)[0]];
        while (remaining.length) {
          let bi = 0, bd = Infinity;
          remaining.forEach((p, i) => { const d = distKm(ordered[ordered.length - 1], p); if (d < bd) { bd = d; bi = i; } });
          ordered.push(remaining.splice(bi, 1)[0]);
        }
        // Ripartizione bilanciata (non ceil: 15 POI su 7 giorni lasciava gli
        // ultimi giorni vuoti): i primi (n % giorni) giorni prendono una tappa in più.
        const base = Math.floor(ordered.length / nDaysRoute);
        const extra = ordered.length % nDaysRoute;
        const dayLines: string[] = [];
        let cursor = 0;
        for (let d = 0; d < nDaysRoute; d++) {
          const size = base + (d < extra ? 1 : 0);
          const seg = ordered.slice(cursor, cursor + size);
          cursor += size;
          if (seg.length) dayLines.push(`Giorno ${d + 1}: ${seg.map(p => p.nome).join(" → ")}`);
        }
        routePlanInstruction = `\n\nPIANO GEOGRAFICO GIÀ OTTIMIZZATO (percorso più breve calcolato sulle coordinate reali dei luoghi scelti): assegna le tappe ai giorni ESATTAMENTE come indicato e visitale in QUEST'ORDINE, inserendo colazione/pranzo/cena e le eventuali tappe aggiuntive LUNGO il percorso, senza mai stravolgerlo né spostare una tappa in un altro giorno:\n${dayLines.join("\n")}`;
      }

      let prompt = "";
      if (pois && pois.length > 0) {
        prompt = `Crea un itinerario ottimizzato per ${days} giorni a ${destination} (con orario riga giornaliero da ${tInizio} a ${tFine}) includendo questi luoghi: ${pois.join(", ")}.\n\nREGOLA SUPREMA INVALICABILE: DEVI ASSOLUTAMENTE INCLUDERE TUTTE LE TAPPE ELENCATE (${pois.join(", ")}). È severamente vietato omettere anche solo una di queste tappe. Se il tempo a disposizione è limitato, riduci la durata di ciascuna visita pur di farle entrare tutte nell'itinerario.${routePlanInstruction} ${specialRequests ? `Richieste particolari dell'utente (rispettale): ${specialRequests}` : ""} ${ragInstruction}${geoAnchor}${userPrefs}${diningContext}${toursContext}${ticketsContext}`;
      } else {
        prompt = `Crea un itinerario ottimizzato per ${days} giorni a ${destination} (dalle ${tInizio} alle ${tFine}). Basati sui seguenti interessi/richieste: ${interestsArr.join(", ")}. ${specialRequests ? `Richieste particolari dell'utente (rispettale): ${specialRequests}` : ""} ${ragInstruction}${geoAnchor}${userPrefs}${diningContext}${toursContext}${ticketsContext}`;
      }

      if (lockedStops && Array.isArray(lockedStops) && lockedStops.length > 0) {
        prompt += `\n\nFONDAMENTALE: L'utente ha già alcune TAPPE BLOCCATE che DEVI mantenere IDENTICHE (stesso orario, titolo, attività e consiglio) nell'itinerario rigenerato:\n${JSON.stringify(lockedStops)}\nAssicurati di costruire il resto dell'itinerario attorno a queste tappe fisse.`;
      }

      const systemPrompt = `Sei il motore di pianificazione viaggi di World in Pocket (WIP).
Genera un itinerario in formato JSON. 
FONDAMENTALE: È un REQUISITO ASSOLUTO inserire SEMPRE il link al sito web (nel campo "link_info") per OGNI SINGOLA TAPPA. MAI inventarsi il sito internet - usa SOLO siti verificati. Se non esiste un sito verificato, lascia il campo vuoto invece di inventarlo.

REGOLE STRUTTURA GIORNATA (OBBLIGATORIE PER OGNI GIORNO):
1. ALMENO 3-4 tappe al MATTINO (prima di pranzo).
2. Poi la tappa PRANZO (campo "tipo": "pranzo") con nome del locale REALE specifico e piatto tipico consigliato.
3. Poi ALMENO 3-4 tappe al POMERIGGIO.
4. Infine la tappa CENA (campo "tipo": "cena") con nome del locale REALE specifico e piatto tipico consigliato.
5. Totale minimo: 8 tappe per giorno (incluse pranzo e cena). Adatta le durate delle visite per rientrare nella fascia oraria richiesta, ma NON scendere sotto questi minimi.
6. PERCORSO PIÙ BREVE OBBLIGATORIO: ogni giorno copre UNA sola zona/quartiere compatto e le tappe si susseguono in ordine di prossimità geografica (dalla più vicina alla successiva, mai a zig-zag attraverso la città). Anche pranzo e cena vanno scelti LUNGO il percorso del giorno, non dall'altra parte della città.

REGOLE LUNGHEZZA TESTI:
1. "attivita": Ogni descrizione deve essere approfondita e ricca di dettagli, lunga circa 5-6 righe (circa 60-80 parole).
2. "consiglio_guida": Il consiglio deve essere di circa 4 righe (circa 40-50 parole).

REGOLE INFO VIAGGIO:
1. DIVIETO ASSOLUTO DI FRASI FATTE E GENERICHE.
2. IPER-SPECIFICITÀ LOCALE: nomi propri, strade reali, locali veri e orari specifici.
3. LE 4 SEZIONI OBBLIGATORIE (precauzioni, suggerimenti, raccomandazioni, zone_da_evitare) con ALMENO 3 voci ciascuna.
${ANTI_HALLUCINATION_RULES}

Struttura JSON:
{
  "titolo": "Titolo",
  "info_viaggio": { "precauzioni": [], "suggerimenti": [], "raccomandazioni": [], "zone_da_evitare": [] },
  "giorni": [
    {
      "giorno": 1,
      "tappe": [
        {
          "ora": "HH:MM",
          "titolo_tappa": "Nome",
          "attivita": "Descrizione",
          "consiglio_guida": "✨ Nicky... 📜 Dante...",
          "tempo_necessario": "es. 2 ore",
          "tipo": "museo",
          "coordinate": { "lat": 0, "lng": 0 },
          "link_info": "URL",
          "fonte": "es. Guida Michelin / Gambero Rosso / classico tradizionale"
        }
      ],
      "tabella_budget": { "attrazioni": {"dettaglio":"", "stima_pp": ""}, "trasporti": {"dettaglio":"", "stima_pp": ""}, "colazione": {"dettaglio":"", "stima_pp": ""}, "pranzo": {"dettaglio":"", "stima_pp": ""}, "cena": {"dettaglio":"", "stima_pp": ""}, "totale_giorno": "" }
    }
  ],
  "totale_viaggio": "Prezzo"
}
Tassativo: restituisci SOLO l'oggetto JSON valido, nessuna formattazione markdown.${langInstruction}`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Utilizza DeepSeek in streaming per gli itinerari
      await streamUniversalAi("deepseek", [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ], { temperature: 0.7, response_format: { type: "json_object" } }, res, null);
      
      if (quota.userId) {
        await incrementQuotaCount(quota.userId, 'itinerari').catch(e => console.error(e));
      }
    } catch (e: any) {
      console.error("Itinerary Stream Top Error:", e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
      else { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); }
    }
  });

  app.post("/api/groq/radius-alternatives", async (req, res) => {
    try {
      const { baseLocation, days, interests, radius, mese, startTime, endTime, budget, viaggiatori, ritmo, lat, lon } = req.body;
      const tInizio = startTime || "09:00";
      const tFine = endTime || "19:00";
      // Ancora geografica dal geocoder del client (come /api/groq/candidates)
      const geoAnchor = (typeof lat === "number" && typeof lon === "number")
        ? `\nLA BASE "${baseLocation}" SI TROVA ESATTAMENTE ALLE COORDINATE lat ${lat}, lon ${lon}. Tutte le alternative devono trovarsi entro il raggio indicato DA QUEL PUNTO, mai in località omonime o in altri paesi.`
        : "";

      const systemPrompt = `Sei il motore di pianificazione viaggi di World in Pocket (WIP).
Devi restituire ESATTAMENTE un oggetto JSON con la chiave "alternative" che contiene un array di 3 oggetti. Ogni oggetto rappresenta un'alternativa completa. 
Il campo "dati_itinerario" DEVE avere l'identica struttura dell'itinerario standard. MAI inventarsi il sito internet - usa SOLO siti verificati. Se non esiste un sito verificato, lascia il campo "link_info" vuoto invece di inventarlo.

{
  "alternative": [
    {
      "id_alternativa": "1",
      "titolo": "Titolo",
      "descrizione_breve": "...",
      "dati_itinerario": { ... }
    }
  ]
}

Tassativo: restituisci SOLO l'oggetto JSON valido, nessuna formattazione markdown.`;

      let result;
      let usedEngine = "none";

      const ritmoTimingRule = agentTools.getRitmoTimingRule(ritmo);



      const hardRulesUserMsg = `Genera le 3 alternative JSON in base ai parametri.${geoAnchor}
Parametri dell'utente:
- Base: ${baseLocation}
- Raggio di spostamento: ${radius} km
- Giorni: ${days}
- Orario di visita: dalle ${tInizio} alle ${tFine}
- Interessi: ${(interests || []).join(", ")}
- Budget: ${budget}
- Viaggiatori: ${viaggiatori}
- Mese: ${mese}

RICORDA: È ASSOLUTAMENTE TASSATIVO RISPETTARE QUESTE REGOLE. PENA: FALLIMENTO TOTALE.
1. LUNGHEZZA E DETTAGLI: "attivita" deve essere di circa 5-6 righe, "consiglio_guida" (Nicky e Dante) deve essere di circa 4 righe.
2. CONSIGLI DOPPI ESTESI: Inserisci ENTRAMBE le guide (Nicky e Dante), con dettagli mirati e posizioni, NO banalità. Ogni consiglio deve citare almeno UN elemento concreto e verificabile di QUELLA tappa (opera, data, dettaglio architettonico, punto esatto, aneddoto reale); vietato riproporre lo stesso schema su tappe diverse.
3. TABELLA BUDGET ESTESA: Ogni voce DEVE essere DI 1 SOLA RIGA (max 15-20 parole) e includere consigli specifici.
4. INFO VIAGGIO BLINDATE E BILANCIATE: DEVI COMPILARE la sezione "info_viaggio". Le 4 sottosezioni (precauzioni, suggerimenti, raccomandazioni, zone_da_evitare) DEVONO esserci tutte con ESATTAMENTE 3-4 voci CONCISE ciascuna (15-30 parole a voce, lunghezze simili tra sezioni — mai una lunga e una striminzita). USA SOLO nomi propri, vie e riferimenti reali della zona. DIVIETO ASSOLUTO di frasi fatte o voci riutilizzabili per qualsiasi città.
5. RITMO E TIMING: ${ritmoTimingRule}`;

      try {
        console.log(`[DeepSeek Itinerary Radius] Generating 3 alternatives for ${baseLocation} (${radius}km)...`);

        const quota = await checkAndIncrementQuota(req, 'itinerari');
        if (!quota.allowed) {
          return res.status(403).json({ error: quota.error || "Quota exceeded" });
        }

        const response = await callUniversalAi(
          "deepseek",
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: hardRulesUserMsg }
          ],
          {
            response_format: { type: "json_object" },
            temperature: 0.7
          },
          "generazione_alternative_raggio",
          supabaseUrl,
          supabaseServiceKey,
          groq
        );
        result = parseSafeJSON(response.data || "{}");
        usedEngine = "deepseek";
        console.log("[DeepSeek Radius] Generation successful.");
      } catch (err: any) {
        console.error("[DeepSeek Radius] failed:", err.message);
        throw new Error("I motori AI hanno restituito dati troncati o JSON invalido dopo multipli tentativi.");
      }

      if (usedEngine === "groq" && (req.body.userId || req.body.user_id)) {
        await incrementQuotaCount(req.body.userId || req.body.user_id, 'itinerari').catch(e => console.error(e));
      }

      res.json(result);
    } catch (e: any) {
      console.error("Radius Itinerary Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/groq/replace", async (req, res) => {
    try {
      const { currentItinerary, tappaId } = req.body;

      // Biglietti reali Tiqets attorno alla tappa da sostituire: così
      // l'alternativa può uscire già con link biglietto affiliato, e il
      // modello ha il divieto esplicito di inventare URL di prenotazione.
      let replaceTicketsBlock = "";
      try {
        let stopLat = 0, stopLon = 0;
        for (const g of currentItinerary?.giorni || []) {
          for (const t of g?.tappe || []) {
            if (String(t?.id_tappa) === String(tappaId)) {
              stopLat = t?.coordinate?.lat || 0;
              stopLon = t?.coordinate?.lng || t?.coordinate?.lon || 0;
            }
          }
        }
        if (stopLat && stopLon) {
          const tq = await fetchTiqetsProducts({ lat: stopLat, lon: stopLon, radiusKm: 5, lang: 'it', pageSize: 6 });
          if (tq.length > 0) {
            replaceTicketsBlock = `\nBIGLIETTI REALI TIQETS nella zona della tappa da sostituire — se l'alternativa scelta corrisponde a una di queste attrazioni usa ESATTAMENTE questo URL in "link_info", copiato INTATTO (contiene il codice partner):\n${tq.map((t: any) => `- ${t.name}${t.venue ? ` [${t.venue}]` : ''} (${t.price}). Link: ${t.url}`).join("\n")}\nVIETATO costruire URL viator.com, getyourguide o tiqets.com a memoria.`;
          }
        }
      } catch { /* fail-open: la sostituzione vive anche senza biglietti */ }

      const systemPrompt = `Sei un esperto di routing turistico.
L'utente vuole sostituire una tappa specifica del suo itinerario.
REGOLE:
1. Sostituisci la tappa con id_tappa "${tappaId}" con un'alternativa coerente per tipologia e ottimizzazione geografica rispetto alle tappe precedenti e successive.
2. L'alternativa deve avere lo STESSO TEMPO DI VISITA (durata) della tappa originale per non scombussolare il resto dell'itinerario.
3. Mantieni lo stesso formato JSON dell'itinerario originale.
4. Rispondi SOLO con il JSON completo aggiornato.
${ANTI_HALLUCINATION_RULES}${replaceTicketsBlock}

JSON Originale:
${JSON.stringify(currentItinerary)}
`;

      let result;
      let usedEngine = "none";
      try {
        console.log("[DeepSeek Replace] Using DeepSeek for step replacement...");
        const response = await callUniversalAi(
          "deepseek",
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Sostituisci la tappa ${tappaId} con un'ottima alternativa.` }
          ],
          { response_format: { type: "json_object" }, temperature: 0.7 },
          "modifica_itinerari",
          supabaseUrl,
          supabaseServiceKey,
          groq
        );
        result = parseSafeJSON(response.data || "{}");
        usedEngine = "deepseek";
      } catch (err: any) {
        console.error("[DeepSeek Replace] failed:", err.message);
        throw new Error("I motori AI hanno restituito dati troncati o JSON invalido.");
      }

      // Telemetry is now handled by callGroqWithFallback

      res.json(result);
    } catch (e: any) {
      console.error("Groq Replace Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/groq/suggest", async (req, res) => {
    try {
      const { dayStops, gIdx, destination } = req.body;
      
      const systemPrompt = `Sei un esperto di routing turistico.
L'utente vuole aggiungere una nuova tappa a un itinerario esistente per il giorno ${gIdx + 1} a ${destination}.
Ecco le tappe attuali per questo giorno:
${JSON.stringify(dayStops, null, 2)}

Devi suggerire UNA SINGOLA NUOVA TAPPA che si inserisca in modo logicamente ineccepibile in termini di orario e vicinanza geografica con le tappe esistenti. 
Non modificare le tappe attuali, DEVI FORNIRE SOLO LA NUOVA TAPPA in questo formato JSON (che sia una vera attrazione, ristorante o punto di interesse non già presente):

{
  "nuova_tappa": {
    "id_tappa": "string",
    "ora": "HH:MM",
    "titolo_tappa": "Nome",
    "attivita": "Descrizione",
    "consiglio_guida": "Suggerimento",
    "tempo_necessario": "es. 2 ore, 45 min",
    "tipo": "monumento / museo / pausa / ristorante",
    "coordinate": { "lat": 0.0, "lng": 0.0 }
  }
}
`;

      let result;
      let usedEngine = "none";
      try {
        console.log("[DeepSeek Suggest] Using DeepSeek for step suggestion...");
        const response = await callUniversalAi(
          "deepseek",
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Genera una nuova tappa ideale da aggiungere." }
          ],
          { response_format: { type: "json_object" }, temperature: 0.7 },
          "suggerimento_tappa",
          supabaseUrl,
          supabaseServiceKey,
          groq
        );
        result = parseSafeJSON(response.data || "{}");
        usedEngine = "deepseek";
      } catch(err: any) {
        console.error("[DeepSeek Suggest] failed:", err.message);
        throw new Error("I motori AI hanno restituito dati troncati o JSON invalido.");
      }

      // Telemetry handled centrally

      res.json(result.nuova_tappa || {});
    } catch (e: any) {
      console.error("Groq Suggest Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/groq/trivia", async (req, res) => {
    try {
      const { destination, count = 5, language = "it" } = req.body;
      if (!destination) return res.status(400).json({ error: "destination is required" });

      const langStr = language === "en" ? "inglese" : language === "es" ? "spagnolo" : language === "fr" ? "francese" : "italiano";
      
      const messages = [
        {
          role: "system",
          content: `Sei un esperto creatore di quiz Trivia. L'utente sta aspettando la generazione di una guida per ${destination}. Genera esattamente ${count} domande curiose (storia, cultura, stranezze, cibo) relative a ${destination}.
Il tuo output DEVE ESSERE RIGOROSAMENTE SOLO UN OGGETTO JSON. Non usare markdown blocks. Formato richiesto:
{
  "questions": [
    {
      "question": "Testo domanda in ${langStr}...",
      "options": ["Opzione 1", "Opzione 2", "Opzione 3"],
      "correctIndex": 0,
      "explanation": "Breve spiegazione in ${langStr} della risposta corretta."
    }
  ]
}
Assicurati che correctIndex sia un numero intero tra 0 e 2.`
        },
        {
          role: "user",
          content: `Genera ${count} domande su ${destination}.`
        }
      ];

      const response = await callUniversalAi("deepseek", messages, { response_format: { type: "json_object" }, temperature: 0.8 }, "trivia", supabaseUrl, supabaseServiceKey, groq);

      // callUniversalAi ritorna un oggetto: il vecchio response.replace()
      // lanciava TypeError DOPO aver pagato la generazione, quindi il quiz
      // durante le attese non è mai partito.
      const cleaned = String(response?.data || "").replace(/```json/gi, '').replace(/```/g, '').trim();
      if (!cleaned) throw new Error("Risposta AI vuota");

      // parseSafeJSON gestisce meglio di JSON.parse nudo eventuali rimasugli di markdown o troncamenti
      res.json(parseSafeJSON(cleaned));
    } catch (e: any) {
      console.error("Trivia Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/groq/enrich_poi", async (req, res) => {
    try {
      const { poiName, lat, lon, category, language = "it" } = req.body;
      if (!poiName) return res.status(400).json({ error: "poiName is required" });

      const langNames: Record<string, string> = {
        it: "italiano", en: "inglese", fr: "francese", es: "spagnolo", ru: "russo", zh: "cinese"
      };
      const targetLang = langNames[String(language).toLowerCase()] || "italiano";

      let wikiContext = "";
      if (lat && lon) {
        try {
          const wikiRes = await axios.get(`https://it.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=500&gslimit=5&format=json&origin=*`, { timeout: 3000 });
          const pages = wikiRes.data?.query?.geosearch || [];
          let bestPage = pages.find((p: any) => p.title.toLowerCase() === poiName.toLowerCase());
          if (!bestPage && pages.length > 0) {
            bestPage = pages.find((p: any) => poiName.toLowerCase().includes(p.title.toLowerCase()) || p.title.toLowerCase().includes(poiName.toLowerCase()));
            if (!bestPage) bestPage = pages[0];
          }
          if (bestPage) {
            const summaryRes = await axios.get(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestPage.title)}`, { timeout: 3000 });
            if (summaryRes.data && summaryRes.data.extract) {
              wikiContext = summaryRes.data.extract;
            }
          }
        } catch (e) {
          console.warn("[Enrich POI] Wikipedia fetch failed", e);
        }
      }

      const systemPrompt = `Sei un ricercatore turistico e storico esperto.
Il tuo compito è arricchire i dati di un Punto di Interesse (POI) che attualmente è privo di informazioni.
Nome POI: "${poiName}"
Coordinate: Latitudine ${lat}, Longitudine ${lon}
Categoria: ${category || 'Sconosciuta'}
${wikiContext ? `\nCONTESTO STORICO ACCERTATO (WIKIPEDIA): "${wikiContext}"\nBasati rigorosamente su questi fatti reali.` : ''}

Effettua una ricerca nella tua base di conoscenza e scrivi una "long description" estremamente dettagliata, storicamente accurata e turisticamente rilevante di ALMENO 1500 caratteri in lingua ${targetLang}. 
Devi fornire dettagli architettonici, aneddoti storici, e il motivo per cui è importante visitarlo.
Restituisci SOLO un oggetto JSON con il seguente formato:
{
  "extract": "La long description generata (minimo 1500 caratteri)"
}`;

      let result;
      let usedEngine = "none";
      if (ai) {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            { role: "user", parts: [{ text: systemPrompt }] }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });
        result = JSON.parse(response.text || "{}");
      } else if (groq) {
        const response = await callGroqWithFallback(
          groq,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Genera la descrizione arricchita in JSON." }
          ],
          "llama-3.3-70b-versatile",
          "mixtral-8x7b-32768",
          { response_format: { type: "json_object" } },
          "arricchimento_poi",
          supabaseUrl,
          supabaseServiceKey
        );
        result = parseSafeJSON(response.data || "{}");
        usedEngine = "groq";
      } else {
        return res.status(500).json({ error: "Nessun motore AI configurato." });
      }

      // Telemetry handled centrally

      res.json(result);
    } catch (e: any) {
      console.error("Groq Enrich Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Raggio della Terra in metri
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isNameMatching(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n1 = clean(name1);
  const n2 = clean(name2);
  return n1.includes(n2) || n2.includes(n1);
}

  app.post("/api/foursquare", rateLimiter, async (req, res) => {
    try {
      const { lat, lon, radius = 500 } = req.body;
      // Fallback VITE_ come nel resto del file: se su Vercel c'è solo la
      // variante VITE_ la route rispondeva 500 e i "locali" sparivano.
      const fsqKey = process.env.FOURSQUARE_API_KEY || process.env.VITE_FOURSQUARE_API_KEY;
      if (!fsqKey) {
        return res.status(500).json({ error: "FOURSQUARE_API_KEY not configured on server" });
      }

      // Places API nuovo (places-api.foursquare.com): il vecchio v3 è stato
      // dismesso e risponde 401 "Invalid request token". Gli id categoria
      // sono esadecimali: Food + Nightlife — SOLO locali (prima la route
      // chiedeva anche musei/landmark e li etichettava "locali").
      const categories = "4d4b7105d754a06374d81259,4d4b7105d754a06376d81259";

      const url = `https://places-api.foursquare.com/places/search?ll=${lat},${lon}&radius=${radius}&fsq_category_ids=${categories}&limit=50`;

      const response = await axios.get(url, {
        // Senza timeout un guasto FSQ teneva la richiesta appesa ~10s
        timeout: 6000,
        headers: {
          "Authorization": `Bearer ${fsqKey}`,
          "X-Places-Api-Version": "2025-06-17",
          "Accept": "application/json"
        }
      });

      // Il vecchio /\\s+/ cercava un backslash letterale: "gluten free"
      // non diventava mai "gluten_free"
      const normalizeSubCategory = (cat: string) => cat.toLowerCase().replace(/\s+/g, "_");

      const mappedResults = (response.data.results || [])
        .map((place: any) => {
          const rawLat = place.latitude ?? place.geocodes?.main?.latitude;
          const rawLon = place.longitude ?? place.geocodes?.main?.longitude;
          const latNum = typeof rawLat === "number" ? rawLat : parseFloat(rawLat);
          const lonNum = typeof rawLon === "number" ? rawLon : parseFloat(rawLon);

          const fsqCats = place.categories || [];
          let subCategory = "Ristorante";

          const catNames = fsqCats.map((c:any) => c.name?.toLowerCase() || "");
          const nameLower = (place.name || "").toLowerCase();
          // FSQ classifica quasi tutti i locali italiani come "Italian
          // Restaurant": senza l'aiuto del NOME le sottocategorie
          // pizzeria/gelateria restavano quasi vuote.
          const catHas = (kws: string[]) => catNames.some((n: string) => kws.some(k => n.includes(k)));
          const nameHas = (kws: string[]) => kws.some(k => nameLower.includes(k));
          if (catHas(["pizz"]) || nameHas(["pizz"])) subCategory = "pizzeria";
          else if (catHas(["ice cream", "gelat"]) || nameHas(["gelater", "gelat"])) subCategory = "gelateria";
          else if (catHas(["sushi", "japanese"]) || nameHas(["sushi"])) subCategory = "sushi";
          else if (catHas(["seafood"]) || nameHas(["pescheria", "di pesce", "del pesce"])) subCategory = "pesce";
          else if (catHas(["steak", "bbq", "meat"]) || nameHas(["braceria", "griglieria", "steakhouse"])) subCategory = "carne";
          else if (catHas(["vegetarian", "vegan"])) subCategory = "vegetariano";
          else if (catHas(["gluten"]) || nameHas(["senza glutine"])) subCategory = "gluten free";
          else if (catHas(["bar", "café", "cafe", "coffee"])) subCategory = "bar";
          else if (catHas(["pub", "brewery", "beer"])) subCategory = "pub";

          const fsqId = place.fsq_place_id || place.fsq_id;
          return {
            id: fsqId ? `fsq-${fsqId}` : `fsq-${Math.random()}`,
            name: place.name,
            lat: latNum,
            lon: lonNum,
            category: "locali",
            subCategory: normalizeSubCategory(subCategory),
            rating: place.rating ? place.rating / 2 : undefined,
            user_ratings_total: place.stats?.total_ratings || undefined,
            price_level: place.price || undefined,
            source: "foursquare",
            foursquare_id: fsqId
          };
        })
        .filter(
          (poi: any) =>
            typeof poi.lat === "number" &&
            Number.isFinite(poi.lat) &&
            !isNaN(poi.lat) &&
            typeof poi.lon === "number" &&
            Number.isFinite(poi.lon) &&
            !isNaN(poi.lon)
        );

      // Async save to Supabase
      if (mappedResults.length > 0 && typeof supabaseUrl !== 'undefined' && typeof supabaseServiceKey !== 'undefined') {
        const toUpsert = mappedResults.map(p => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          category: p.category,
          sub_category: p.subCategory,
          source: p.source,
          foursquare_id: p.foursquare_id,
          rating: p.rating,
          user_ratings_total: p.user_ratings_total
        }));
        
        axios.post(`${supabaseUrl}/rest/v1/utility_pois`, toUpsert, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          }
        }).catch(err => console.error("Error saving Foursquare POIs to Supabase:", err.message));
      }

      res.json({ results: mappedResults });
    } catch (e: any) {
      console.error("Foursquare API Error:", e.response?.data || e.message);
      res.status(500).json({ error: "Failed to fetch from Foursquare" });
    }
  });

  app.post("/api/vision", rateLimiter, async (req, res) => {
    // Addebito effettuato: vive fuori dal try perché il catch deve poter
    // rimborsare se qualcosa fallisce DOPO il prelievo crediti.
    let charge: { userId: string; cost: number } | null = null;
    let refunded = false;
    try {
      // Serve ALMENO un motore vision: OpenAI (primario), Together (fallback)
      // o Gemini (ultima riserva).
      if (!process.env.OPENAI_API_KEY && !process.env.VITE_OPENAI_API_KEY
          && !process.env.TOGETHER_VISION_API_KEY && !process.env.TOGETHER_API_KEY
          && !process.env.VITE_TOGETHER_API_KEY && !ai) {
        return res.status(500).json({ error: "Nessun provider vision configurato" });
      }

      // Validazione input PRIMA di consumare quota o toccare le API: senza
      // imageBase64 il codice a valle andava in TypeError su .startsWith().
      const { imageBase64, lat, lon } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: "imageBase64 mancante o non valido" });
      }

      // Quota Circuit Breaker Check
      // checkAndIncrementQuota risolve lo userId dal Bearer opzionale (se il
      // client lo invia); altrimenti degrada a un id anonimo per IP.
      // Il limite giornaliero unificato (anti-bot) non deve strozzare un Pass
      // Museo legittimo: col pass attivo fa fede il tetto del pass
      // (MUSEUM_PASS_MAX_SCANS nella finestra), verificato qui sotto.
      const quota = await checkAndIncrementQuota(req, 'vision');
      if (!quota.allowed) {
        const quotaUid = quota.userId && !String(quota.userId).startsWith('anonymous-') ? String(quota.userId) : null;
        const passExp = quotaUid ? await getActiveMuseumPassExpiry(quotaUid) : null;
        const passHasRoom = passExp && quotaUid
          ? (await countMuseumPassScans(quotaUid, passExp)) < MUSEUM_PASS_MAX_SCANS
          : false;
        if (!passHasRoom) {
          return res.status(429).json({ error: "Quota Exceeded", message: quota.error });
        }
      }

      // quota.userId può essere il fallback anonimo per IP: per schede, XP e
      // addebito serve lo userId REALE (uuid) risolto dal Bearer.
      const realUserId = quota.userId && !String(quota.userId).startsWith('anonymous-') ? String(quota.userId) : null;
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" };

      // ── SALVATAGGIO SCHEDA ─────────────────────────────────────────────
      // La scheda si salva SEMPRE (anche se non riconosciuta): My Vision è
      // l'album personale dell'utente e la coda di revisione WIP Community
      // riceve tutte le foto. review_status: pending → approved/rejected.
      const saveVisionCard = async (data: any, recognized: boolean): Promise<{ cardId: string | null; photoUrl: string | null }> => {
        if (!realUserId) return { cardId: null, photoUrl: null };
        try {
          const cardId = `vcard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          let photoUrl: string | null = null;
          try {
            const imgBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            // Cartella per-utente nel bucket (privato dopo la migration
            // fase 2): la policy storage "vision_photos_owner_read" permette
            // il signed URL solo al proprietario. In photo_url si salva il
            // PATH, non l'URL — il client lo risolve (signed o public).
            const photoPath = `${realUserId}/${cardId}.jpg`;
            await axios.post(`${supabaseUrl}/storage/v1/object/vision-photos/${photoPath}`, imgBuffer, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "image/jpeg" },
              maxBodyLength: Infinity
            });
            photoUrl = photoPath;
          } catch (upErr: any) {
            console.warn("[Vision] Upload foto fallito (la scheda viene salvata senza foto remota):", upErr?.message);
          }

          const row: any = {
            id: cardId,
            user_id: realUserId,
            name: data?.nome || `Vision ${new Date().toLocaleDateString('it-IT')}`,
            artist: data?.autore || null,
            year: data?.anno_produzione || null,
            style: data?.stile || null,
            city: data?.citta || null,
            category: data?.categoria || null,
            curiosity: data?.curiosita || null,
            description_short: data?.descrizione_breve || null,
            description_long: data?.descrizione_dettagliata || null,
            history: data?.storia || null,
            audio_script: data?.spiegazione_audio || null,
            lat: lat ?? null,
            lon: lon ?? null,
            photo_url: photoUrl
          };
          try {
            await axios.post(`${supabaseUrl}/rest/v1/vision_cards`, { ...row, recognized, review_status: 'pending' }, { headers: svcHeaders });
          } catch (colErr: any) {
            // Colonne recognized/review_status assenti finché la migration
            // 20260809150000_wip_community_vision.sql non viene applicata:
            // retry con le sole colonne storiche (stesso pattern di MapArea).
            await axios.post(`${supabaseUrl}/rest/v1/vision_cards`, row, { headers: svcHeaders });
          }
          console.log(`[Vision] Scheda salvata in vision_cards: ${cardId} (${row.name})`);
          return { cardId, photoUrl };
        } catch (cardErr: any) {
          console.warn("[Vision] Salvataggio scheda vision fallito:", cardErr?.message);
          return { cardId: null, photoUrl: null };
        }
      };

      // Ogni Vision creata vale +10 XP (alimenta i livelli e i loro premi in
      // crediti). Server-side: i contatori non sono scrivibili dal client.
      const grantVisionXp = async () => {
        if (!realUserId) return;
        try {
          const prof = await axios.get(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${realUserId}&select=xp_points`, { headers: svcHeaders });
          const xp = (prof.data?.[0]?.xp_points || 0) + 10;
          await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${realUserId}`, { xp_points: xp }, { headers: svcHeaders });
        } catch (xpErr: any) {
          console.warn("[Vision] Assegnazione XP fallita:", xpErr?.message);
        }
      };

      // ── PASS MUSEO ─────────────────────────────────────────────────────
      // Con un pass attivo i riconoscimenti sono inclusi (niente addebito)
      // e la cache GPS è bypassata in lettura E scrittura: in un museo due
      // opere distano pochi metri, la cache per coordinate (30 m)
      // risponderebbe con la scheda dell'opera sbagliata.
      const museumPassExpiresAt = realUserId ? await getActiveMuseumPassExpiry(realUserId) : null;
      let museumPassActive = !!museumPassExpiresAt;

      // Tetto anti-spam del pass: oltre MUSEUM_PASS_MAX_SCANS scansioni nella
      // finestra il pass smette di coprire e si torna all'addebito per foto
      // (lo spam diventa costoso; un visitatore vero non ci arriva mai).
      if (museumPassActive && realUserId && museumPassExpiresAt) {
        const used = await countMuseumPassScans(realUserId, museumPassExpiresAt);
        if (used >= MUSEUM_PASS_MAX_SCANS) {
          console.warn(`[Vision] Pass Museo: tetto ${MUSEUM_PASS_MAX_SCANS} scansioni raggiunto (${used}): si torna all'addebito standard`);
          museumPassActive = false;
        }
      }

      // ── GATE CREDITI SERVER-SIDE ───────────────────────────────────────
      // Prima l'addebito photo_search viveva solo nel client (bypassabile
      // via cURL, AUDIT A6). chargeOrReject risponde da solo 401/402/500.
      // L'addebito sta PRIMA della cache GPS: il servizio reso (una scheda
      // Vision) costa 5 crediti anche quando la risposta arriva dalla cache —
      // col vecchio ordine chi riscattava vicino a una scansione precedente
      // (entro 30 m) non pagava MAI e "Vision non scala i crediti".
      if (museumPassActive) {
        console.log(`[Vision] Pass Museo attivo (scade ${new Date(museumPassExpiresAt).toISOString()}): riconoscimento incluso, cache GPS bypassata`);
      } else {
        charge = await chargeOrReject(req, res, 'photo_search');
        if (!charge) return;
      }

      // ── CACHE GPS CONDIVISA (ora SOLO server-side) ─────────────────────
      // Hit entro 30 m = si risparmia la chiamata AI, non l'addebito. Prima il
      // controllo (e la scrittura!) vivevano nel client con la anon key: la
      // cache era avvelenabile da chiunque. La tabella è ora sotto RLS senza
      // policy: legge e scrive solo la service role.
      if (!museumPassActive && lat !== undefined && lon !== undefined && lat !== null && lon !== null) {
        try {
          const m = 0.0003;
          const cacheRes = await axios.get(
            `${supabaseUrl}/rest/v1/shared_vision_cache?lat=gte.${(lat - m).toFixed(6)}&lat=lte.${(lat + m).toFixed(6)}&lon=gte.${(lon - m).toFixed(6)}&lon=lte.${(lon + m).toFixed(6)}&select=*`,
            { headers: svcHeaders }
          );
          let closest: any = null;
          let minDist = 30;
          for (const item of cacheRes.data || []) {
            const d = getHaversineDistance(lat, lon, item.lat, item.lon);
            if (d < minDist) { minDist = d; closest = item; }
          }
          if (closest?.data) {
            console.log(`[Vision] Cache GPS condivisa: hit a ${Math.round(minDist)}m (addebitati ${charge.cost} crediti)`);
            if (realUserId) await incrementQuotaCount(realUserId, 'vision').catch(() => {});
            const saved = await saveVisionCard(closest.data, true);
            await grantVisionXp();
            return res.json({ ...closest.data, card_id: saved.cardId, photo_url: saved.photoUrl, cached: true, charged: charge.cost, refunded: false });
          }
        } catch (cacheErr: any) {
          console.debug("[Vision] Lettura cache condivisa fallita/saltata:", cacheErr?.message);
        }
      }

      let nearestPoi: any = null;
      let minDistance = Infinity;
      // POI entro ~300m dall'utente: servono sia come indizio per il prompt
      // sia per la deduplicazione prima del salvataggio crowdsourcing.
      const poisNearby: any[] = [];

      if (lat !== undefined && lon !== undefined && lat !== null && lon !== null) {
        try {
          // Bbox ~500m invece di select=* su tutta la tabella
          const d500 = 0.005;
          const resPois = await axios.get(
            `${supabaseUrl}/rest/v1/shared_pois?lat=gte.${(lat - d500).toFixed(5)}&lat=lte.${(lat + d500).toFixed(5)}&lon=gte.${(lon - d500).toFixed(5)}&lon=lte.${(lon + d500).toFixed(5)}&select=id,name,lat,lon,category,description_long,description_ai,audio_script`,
            { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
          );
          const pois = resPois.data || [];
          for (const p of pois) {
            const d = getHaversineDistance(lat, lon, p.lat, p.lon);
            if (d < minDistance) {
              minDistance = d;
              nearestPoi = p;
            }
            if (d <= 300) poisNearby.push({ ...p, _dist: d });
          }
        } catch (dbErr) {
          console.error("Error querying shared_pois in vision API:", dbErr);
        }
      }

      let address = "Coordinate sconosciute";
      let city = "";
      if (lat !== undefined && lon !== undefined && lat !== null && lon !== null) {
        try {
          const nomRes = await axios.get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`, {
            headers: { "User-Agent": "WorldInPocket/1.0" }
          });
          if (nomRes.data) {
            address = nomRes.data.display_name || address;
            city = nomRes.data.address?.city || nomRes.data.address?.town || nomRes.data.address?.village || "";
          }
        } catch (nomErr) {
          console.warn("Nominatim reverse geocoding failed, continuing without it:", nomErr);
        }
      }

      let promptText = `Sei un esperto di storia dell'arte e guida turistica internazionale.
        Analizza l'immagine fornita per identificare con precisione il soggetto inquadrato: monumento, opera d'arte, chiesa, castello, borgo, panorama, paesaggio naturale o sito storico/archeologico.

        INFORMAZIONI GEOGRAFICHE DA GPS:
        L'utente si trova alle coordinate GPS [${lat || 0}, ${lon || 0}] vicino a: "${address}".
        La città o comune rilevato è "${city}".
        ${nearestPoi && minDistance <= 150 ? `Secondo il nostro database, il monumento più vicino (a ${Math.round(minDistance)}m) è: "${nearestPoi.name}". Usalo come indizio forte se l'immagine sembra corrispondere, ma non forzare il riconoscimento se l'immagine mostra chiaramente un altro soggetto.` : ""}
        
        ISTRUZIONI TASSATIVE:
        1. Identifica l'oggetto/monumento principale nella foto.
        2. Anche panorami, paesaggi naturali, castelli, borghi e scorci urbani caratteristici SONO punti d'interesse validi. Imposta "riconosciuto": false SOLO se l'immagine non mostra alcun luogo, monumento od opera (es. è un selfie, un pavimento, un'auto).
        3. Se invece è un luogo di interesse, imposta "riconosciuto": true e fornisci informazioni ESTREMAMENTE DETTAGLIATE su di esso. Vogliamo creare una pagina enciclopedica e turistica completa per l'utente.

        RISPOSTA IN FORMATO JSON:
        REGOLA ASSOLUTA: rispondi ESCLUSIVAMENTE con un oggetto JSON valido. Vietato qualsiasi testo fuori dal JSON, commenti, markdown o backtick. Inizia con '{' e termina con '}'.
        Struttura obbligatoria (tutti i campi presenti):
        {
          "riconosciuto": true/false,
          "nome": "Nome ufficiale del monumento/chiesa/opera riconosciuta",
          "categoria": "UNA sola tra: monumenti | chiese | musei | panorami | locali | utilita | famiglie",
          "citta": "${city || 'Città'}",
          "autore": "Autore o architetto o artista (se noto, altrimenti 'Ignoto')",
          "anno_produzione": "Anno, secolo o periodo di realizzazione",
          "stile": "Stile artistico o architettonico (es. Barocco, Gotico, Liberty), altrimenti 'N/D'",
          "storia": "La storia del luogo o dell'opera: origini, committenza, eventi chiave, trasformazioni nei secoli (circa 120-180 parole in italiano)",
          "curiosita": "Una curiosità storica affascinante, un segreto o una leggenda poco nota per sorprendere il visitatore (max 50 parole)",
          "descrizione_breve": "Sintesi chiara e affascinante in italiano (2-3 frasi, max 60 parole)",
          "descrizione_dettagliata": "Una spiegazione storica e artistica molto dettagliata in italiano, ideale per la lettura (circa 150-250 parole)",
          "spiegazione_audio": "Una narrazione avvincente ed emozionante di circa 200 parole in italiano perfetta per un'audioguida. Inizia con un'accoglienza calorosa ed esplora i dettagli visibili.",
          "coordinate": { "lat": ${lat || 0.0}, "lng": ${lon || 0.0} }
        }`;

      // Modalità museo: col pass attivo l'utente è quasi certamente al chiuso
      // davanti a un'opera esposta. Senza questo indizio il modello tende a
      // rispondere con l'edificio (il museo suggerito dal GPS) invece che con
      // l'opera inquadrata.
      if (museumPassActive) {
        promptText += `\n\nCONTESTO MUSEO (Pass Museo attivo): l'utente è probabilmente all'INTERNO di un museo o luogo espositivo. Se l'immagine mostra un quadro, una statua, un affresco o un reperto, identifica l'OPERA specifica (titolo, autore, datazione), non l'edificio che la ospita. Le coordinate GPS indicano il museo, non l'opera.`;
      }

      // Parse difensivo: alcuni modelli avvolgono il JSON in ```json o
      // aggiungono testo attorno. Estraiamo SEMPRE il primo oggetto JSON valido.
      const parseVisionJson = (raw: string): any => {
        let clean = String(raw || "").replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        const first = clean.indexOf("{");
        const last = clean.lastIndexOf("}");
        if (first === -1 || last <= first) throw new Error("Vision: nessun JSON nella risposta del modello");
        return JSON.parse(clean.slice(first, last + 1));
      };

      let result;
      // Provider REALE che ha risposto: serve per una telemetria corretta.
      let visionProvider: 'openai' | 'together' | 'gemini' = 'openai';
      const openAiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
      // Chiave Together DEDICATA alla vision: budget separato dagli itinerari.
      const togetherKey = process.env.TOGETHER_VISION_API_KEY || process.env.TOGETHER_API_KEY || process.env.VITE_TOGETHER_API_KEY;
      const visionImageBase64 = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

      // Timeout difensivo: senza di esso una chiamata Gemini/Together appesa
      // teneva bloccata la request fino al maxDuration serverless (300s).
      const VISION_TIMEOUT_MS = 30000;
      const withTimeout = <T,>(p: Promise<T>, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timeout dopo ${VISION_TIMEOUT_MS}ms`)), VISION_TIMEOUT_MS)
          )
        ]);

      // ── CATENA MOTORI: OpenAI → Together → Gemini ──────────────────────
      // Ogni fallimento per fondi/quota esauriti genera un avviso CRITICO
      // in Errori Sistema (tab admin) via reportVisionFundsIssue.
      let lastEngineErr: any = null;

      if (openAiKey) {
        try {
          console.log("[Vision] Motore primario: OpenAI gpt-4o-mini");
          const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: visionImageBase64 } }
              ]
            }],
            temperature: 0.2,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          }, {
            timeout: VISION_TIMEOUT_MS,
            headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' }
          });
          result = parseVisionJson(r.data.choices[0].message.content);
          visionProvider = 'openai';
        } catch (openaiErr: any) {
          lastEngineErr = openaiErr;
          console.warn("[Vision] OpenAI fallito, fallback su Together:", openaiErr.response?.data?.error?.message || openaiErr.message);
          await reportVisionFundsIssue('OpenAI (vision)', openaiErr);
        }
      }

      if (!result && togetherKey) {
        try {
          console.log("[Vision] Fallback: Together AI meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo");
          const response = await axios.post(
            'https://api.together.xyz/v1/chat/completions',
            {
              model: "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: promptText },
                    { type: "image_url", image_url: { url: visionImageBase64 } }
                  ]
                }
              ],
              temperature: 0.2,
              response_format: { type: "json_object" }
            },
            {
              timeout: VISION_TIMEOUT_MS,
              headers: {
                "Authorization": `Bearer ${togetherKey}`,
                "Content-Type": "application/json"
              }
            }
          );
          result = parseVisionJson(response.data.choices[0].message.content);
          visionProvider = 'together';
        } catch (togetherErr: any) {
          lastEngineErr = togetherErr;
          console.error("[Vision] Errore anche con Together AI:", togetherErr.response?.data || togetherErr.message);
          await reportVisionFundsIssue('Together AI (vision)', togetherErr);
        }
      }

      if (!result && ai) {
        try {
          console.log("[Vision] Ultima riserva: Gemini");
          const geminiResponse = await withTimeout(ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [
                {
                   role: "user",
                   parts: [
                      { text: promptText },
                      { inlineData: { mimeType: "image/jpeg", data: imageBase64.replace(/^data:image\/\w+;base64,/, '') } }
                   ]
                }
            ],
            config: {
              responseMimeType: "application/json"
            }
          }), 'Gemini');
          result = parseVisionJson(geminiResponse.text);
          visionProvider = 'gemini';
        } catch (geminiErr: any) {
          lastEngineErr = geminiErr;
          console.error("[Vision] Errore anche con Gemini:", geminiErr.message || geminiErr);
        }
      }

      if (!result) {
        throw new Error(`Impossibile analizzare l'immagine: tutti i provider vision hanno fallito (${lastEngineErr?.response?.data?.error?.message || lastEngineErr?.message || 'errore sconosciuto'})`);
      }

      // Riconoscimento fallito = nessun servizio erogato → rimborso
      // automatico SERVER-side (prima il rimborso viveva nel client ed era
      // bypassabile). La scheda si salva comunque: resta in My Vision come
      // ricordo e arriva alla coda di revisione WIP Community.
      if (!result?.riconosciuto && charge) {
        await refundServer(charge.userId, charge.cost);
        refunded = true;
      }

      if (result && !result.citta && city) result.citta = city;
      const saved = await saveVisionCard(result, !!result?.riconosciuto);
      if (saved.cardId) {
        result.card_id = saved.cardId;
        result.photo_url = saved.photoUrl;
      }

      // Cache condivisa: SOLO riconoscimenti riusciti, e SENZA i campi
      // personali (card_id/photo_url del primo utente non devono finire
      // nelle risposte servite ai successivi).
      if (!museumPassActive && result?.riconosciuto && lat !== undefined && lon !== undefined && lat !== null && lon !== null) {
        try {
          const { card_id: _cid, photo_url: _pu, ...shareable } = result;
          await axios.post(`${supabaseUrl}/rest/v1/shared_vision_cache`, {
            id: `vision_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            lat, lon,
            data: shareable,
            created_at: new Date().toISOString()
          }, { headers: svcHeaders });
        } catch (shareErr: any) {
          console.warn("[Vision] Scrittura cache condivisa fallita:", shareErr?.message);
        }
      }

      // XP solo per un riconoscimento REALE e NON rimborsato: prima si
      // guadagnavano 10 XP anche fotografando il pavimento (addebito + rimborso
      // = costo zero) → farm XP→crediti, e ogni scansione non riconosciuta
      // convertiva earned in purchased (il rimborso va su purchased).
      if (result?.riconosciuto && !refunded) {
        await grantVisionXp();
      }

      if (quota.userId) {
        await incrementQuotaCount(quota.userId, 'vision').catch(e => console.error(e));
      }

      // Log to api_usage_logs (insert resiliente: vedi insertApiUsageLog)
      try {
        await insertApiUsageLog({
          api_name: visionProvider === 'together' ? 'together_vision' : visionProvider === 'openai' ? 'openai_vision' : 'gemini_vision',
          feature_context: 'camera_monument_scan',
          cost_estimation: 0.001,
          tokens_used: 1000,
          success: true
        });
      } catch (err) {
        console.debug("Failed to log vision api_usage_logs");
      }

      // passExpiresAt null quando il pass non copre (assente, scaduto o oltre
      // il tetto scansioni): così il client spegne il banner.
      res.json({ ...result, refunded, charged: refunded || !charge ? 0 : charge.cost, passActive: museumPassActive, passExpiresAt: museumPassActive ? museumPassExpiresAt : null });
    } catch (e: any) {
      console.error("Vision error:", e);
      // Errore dopo l'addebito → crediti indietro (best-effort, come le
      // altre rotte col gate: podcast e premium guide).
      if (charge && !refunded) {
        await refundServer(charge.userId, charge.cost).catch(() => {});
      }
      res.status(500).json({ error: e.message });
    }
  });

  // ── BONUS DI BENVENUTO A EMAIL CONFERMATA ────────────────────────────────
  // I 100 crediti di prova NON sono più il default del profilo (erano
  // farmabili all'infinito con email inventate, mai confermate): li eroga
  // questa rotta, UNA sola volta, quando auth conferma l'email. Vale solo per
  // account creati dopo il cutover — i precedenti hanno già avuto il default
  // storico alla creazione del profilo. Richiede la migration
  // 20260812000000_welcome_credits_email_verificata.sql (default → 0).
  const WELCOME_CREDITS = 100;
  const WELCOME_GATE_SINCE = Date.parse('2026-08-12T00:00:00Z');

  app.post("/api/welcome-bonus/claim", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };

      // La verità sull'email viene dall'admin API di auth, non dal client.
      const { data: authUser } = await axios.get(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { headers: svcHeaders });
      if (!authUser?.email_confirmed_at) return res.json({ granted: 0, reason: 'email_not_confirmed' });
      if (Date.parse(authUser.created_at || '0') < WELCOME_GATE_SINCE) return res.json({ granted: 0, reason: 'legacy_account' });

      // Idempotenza: stesso registro dei premi vision/gamification.
      const { data: claimed } = await axios.get(
        `${supabaseUrl}/rest/v1/user_rewards_claimed?user_id=eq.${userId}&reward_source_type=eq.welcome&reward_source_id=eq.email-confirmed&select=id`,
        { headers: svcHeaders }
      );
      if (claimed?.length > 0) return res.json({ granted: 0, reason: 'already_claimed' });
      await axios.post(`${supabaseUrl}/rest/v1/user_rewards_claimed`,
        { user_id: userId, reward_source_type: 'welcome', reward_source_id: 'email-confirmed' },
        { headers: svcHeaders });

      const { data: prof } = await axios.get(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=earned_credits`, { headers: svcHeaders });
      if (prof?.length > 0) {
        await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`,
          { earned_credits: (prof[0].earned_credits || 0) + WELCOME_CREDITS }, { headers: svcHeaders });
      } else {
        await axios.post(`${supabaseUrl}/rest/v1/user_profiles`,
          { id: userId, earned_credits: WELCOME_CREDITS }, { headers: svcHeaders });
      }
      console.log(`[Welcome] +${WELCOME_CREDITS} crediti di benvenuto a ${userId} (email confermata)`);
      res.json({ granted: WELCOME_CREDITS });
    } catch (e: any) {
      console.error('[Welcome] Errore claim:', e?.response?.data || e?.message);
      res.status(500).json({ error: 'welcome_claim_failed' });
    }
  });

  // ── PASS MUSEO ─────────────────────────────────────────────────────────
  // Riconoscimenti Vision illimitati per una finestra di tempo (la visita a
  // un museo): niente addebito per-foto e cache GPS bypassata. NESSUNA
  // migration: il pass è una riga in user_rewards_claimed (tabella esistente,
  // scrivibile solo dalla service role) con la scadenza codificata nel
  // reward_source_id ("mpass-<expiresMs>-<rnd>").
  const MUSEUM_PASS_HOURS = 4;
  // Tetto anti-spam nella finestra del pass: un visitatore vero fa 60-150
  // scansioni in 4 ore (una ogni 20-30 s a ciclo continuo ne darebbe ~480):
  // 300 copre anche il completista con margine 2-3×, oltre è uno script.
  // Superato il tetto il pass smette di coprire e ogni scansione torna a
  // costare i crediti standard.
  const MUSEUM_PASS_MAX_SCANS = 300;

  /**
   * Scansioni fatte nella finestra del pass corrente: ogni /api/vision salva
   * una riga in vision_cards, quindi il conteggio è COUNT(vision_cards) del
   * proprietario da inizio finestra (expiry - durata). Nessuna tabella nuova.
   */
  async function countMuseumPassScans(userId: string, passExpiresAt: number): Promise<number> {
    try {
      const sinceIso = new Date(passExpiresAt - MUSEUM_PASS_HOURS * 3_600_000).toISOString();
      const r = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
      );
      return parseInt(String(r.headers['content-range'] || '0/0').split('/')[1] || '0', 10) || 0;
    } catch {
      // In dubbio non si blocca: il tetto è anti-spam, non fatturazione.
      return 0;
    }
  }

  async function getActiveMuseumPassExpiry(userId: string): Promise<number | null> {
    try {
      const { data } = await axios.get(
        `${supabaseUrl}/rest/v1/user_rewards_claimed?user_id=eq.${userId}&reward_source_type=eq.museum_pass&select=reward_source_id`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
      );
      let best = 0;
      for (const row of data || []) {
        const ms = parseInt(String(row.reward_source_id || '').split('-')[1] || '0', 10);
        if (Number.isFinite(ms) && ms > best) best = ms;
      }
      return best > Date.now() ? best : null;
    } catch {
      // In dubbio niente pass: al peggio l'utente paga i 5 crediti standard.
      return null;
    }
  }

  // Stato del pass (banner in CameraScreen).
  app.get("/api/vision/museum-pass", rateLimiter, async (req, res) => {
    const userId = await verifyUserToken(req);
    if (!userId) return res.status(401).json({ error: 'login_required' });
    const expiresAt = await getActiveMuseumPassExpiry(userId);
    const scansUsed = expiresAt ? await countMuseumPassScans(userId, expiresAt) : 0;
    res.json({
      active: !!expiresAt && scansUsed < MUSEUM_PASS_MAX_SCANS,
      expiresAt,
      scansUsed,
      scansLimit: MUSEUM_PASS_MAX_SCANS,
      hours: MUSEUM_PASS_HOURS,
      priceCredits: SERVER_PRICING.museum_pass
    });
  });

  // Acquisto: idempotente — con un pass già attivo NON riaddebita.
  app.post("/api/vision/museum-pass", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });

      const existing = await getActiveMuseumPassExpiry(userId);
      if (existing) return res.json({ active: true, expiresAt: existing, charged: 0, alreadyActive: true, hours: MUSEUM_PASS_HOURS });

      const charge = await chargeOrReject(req, res, 'museum_pass');
      if (!charge) return;

      const expiresAt = Date.now() + MUSEUM_PASS_HOURS * 3_600_000;
      try {
        await axios.post(`${supabaseUrl}/rest/v1/user_rewards_claimed`, {
          user_id: userId,
          reward_source_type: 'museum_pass',
          reward_source_id: `mpass-${expiresAt}-${Math.random().toString(36).slice(2, 7)}`
        }, { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' } });
      } catch (insErr: any) {
        // Pass non registrato = servizio non erogato: crediti indietro.
        await refundServer(userId, charge.cost);
        return res.status(500).json({ error: 'pass_activation_failed' });
      }
      res.json({ active: true, expiresAt, charged: charge.cost, hours: MUSEUM_PASS_HOURS });
    } catch (e: any) {
      console.error('[MuseumPass] Errore acquisto:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Commento dell'utente su una PROPRIA scheda Vision ("perché è speciale"):
  // arricchisce la coda di revisione WIP Community, soprattutto per le foto
  // che l'AI non ha riconosciuto. Il filtro user_id=eq.<token> garantisce
  // che si possa scrivere solo sulle proprie schede.
  app.post("/api/vision/comment", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });
      const { cardId, comment, tags } = req.body || {};
      if (!cardId || typeof cardId !== 'string') {
        return res.status(400).json({ error: 'cardId mancante' });
      }
      const patch: any = { user_comment: String(comment || '').slice(0, 2000) || null };
      if (Array.isArray(tags)) {
        patch.comment_tags = tags.map((t: any) => String(t).slice(0, 60)).slice(0, 10);
      }
      const r = await axios.patch(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&user_id=eq.${userId}`,
        patch,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json", Prefer: "return=representation" } }
      );
      if (!Array.isArray(r.data) || r.data.length === 0) {
        return res.status(404).json({ error: 'scheda non trovata' });
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Vision comment error:", e?.message);
      res.status(500).json({ error: 'comment_failed' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // WIP COMMUNITY — revisione admin delle schede Vision, pubblicazione come
  // POI community, premio crediti e feed anonimo.
  // ═══════════════════════════════════════════════════════════════════════
  const VISION_REWARD_CREDITS = 10;

  /** URL firmato (1h) per una foto del bucket privato vision-photos.
   *  Accetta un PATH ("<uid>/<file>.jpg") o un URL legacy già completo. */
  async function signVisionPhoto(path: string | null): Promise<string | null> {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    try {
      const r = await axios.post(`${supabaseUrl}/storage/v1/object/sign/vision-photos/${path}`,
        { expiresIn: 3600 },
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' } });
      return r.data?.signedURL ? `${supabaseUrl}/storage/v1${r.data.signedURL}` : null;
    } catch { return null; }
  }

  /** Un provider AI risponde "fondi/quota esauriti" → avviso CRITICO in
   *  Errori Sistema (tab admin), così il problema si vede subito senza
   *  aspettare le lamentele degli utenti. Mai bloccante per la richiesta. */
  async function reportVisionFundsIssue(provider: string, err: any): Promise<void> {
    try {
      const status = err?.response?.status;
      const detail = JSON.stringify(err?.response?.data || err?.message || '').slice(0, 400);
      const isFunds = status === 402
        || /insufficient_quota|exceeded your current quota|billing|not enough credits|credit balance|payment required|quota exceeded|account.*(fund|balance)/i.test(detail);
      if (!isFunds) return;
      await logSystemError('critical', `Fondi/quota API esauriti: ${provider}`, {
        source: 'vision', provider, http_status: status, detail
      });
    } catch { /* l'avviso non deve mai rompere la vision */ }
  }

  /** Scarica i byte di una foto Vision (path privato o URL legacy). */
  async function downloadVisionPhoto(path: string | null): Promise<Buffer | null> {
    if (!path) return null;
    try {
      if (/^https?:\/\//i.test(path)) {
        const r = await axios.get(path, { responseType: 'arraybuffer' });
        return Buffer.from(r.data);
      }
      const r = await axios.get(`${supabaseUrl}/storage/v1/object/vision-photos/${path}`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
        responseType: 'arraybuffer'
      });
      return Buffer.from(r.data);
    } catch (e: any) {
      console.warn('[Vision] Download foto fallito:', e?.message);
      return null;
    }
  }

  // Coda di revisione per il tab admin "WIP Community". ANONIMATO: la
  // risposta non contiene MAI user_id — l'admin giudica la foto, non l'utente.
  app.get("/api/admin/vision/queue", rateLimiter, async (req, res) => {
    try {
      const adminId = await verifyAdminBearer(req);
      if (!adminId) return res.status(403).json({ error: 'admin_required' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };

      const status = ['pending', 'approved', 'rejected', 'all'].includes(String(req.query.status))
        ? String(req.query.status) : 'pending';
      const statusFilter = status === 'all' ? '' : `&review_status=eq.${status}`;
      const { data } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?select=*${statusFilter}&order=created_at.desc&limit=200`,
        { headers: svcHeaders }
      );

      const countFor = async (s: string): Promise<number> => {
        try {
          const r = await axios.get(`${supabaseUrl}/rest/v1/vision_cards?review_status=eq.${s}&select=id`, {
            headers: { ...svcHeaders, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }
          });
          return parseInt(String(r.headers['content-range'] || '0/0').split('/')[1] || '0', 10);
        } catch { return 0; }
      };
      const [pending, approved, rejected] = await Promise.all(['pending', 'approved', 'rejected'].map(countFor));

      const cards = await Promise.all((data || []).map(async (c: any) => {
        // ANONIMATO: mai esporre chi ha inviato. Si tolgono user_id,
        // reviewed_by e i path grezzi (che contengono l'UUID autore, es.
        // "<uuid>/vcard-….jpg"); l'admin vede solo gli URL firmati.
        const { user_id: _u, reviewed_by: _r, photo_url: _p, clean_photo_url: _c, ...rest } = c;
        return {
          ...rest,
          photo_signed: await signVisionPhoto(c.photo_url),
          clean_signed: await signVisionPhoto(c.clean_photo_url)
        };
      }));

      res.json({ cards, counts: { pending, approved, rejected } });
    } catch (e: any) {
      console.error('[Vision Queue] Errore:', e?.message);
      res.status(500).json({ error: 'queue_failed' });
    }
  });

  // Revisione di una scheda: approva (nuovo POI community), allega a un POI
  // ufficiale (foto nella sua galleria images_json) o rifiuta (resta un
  // ricordo privato in My Vision). All'approvazione: +10 crediti REALI
  // all'autore, idempotente su user_rewards_claimed (type 'vision').
  app.post("/api/admin/vision/review", rateLimiter, async (req, res) => {
    try {
      const adminId = await verifyAdminBearer(req);
      if (!adminId) return res.status(403).json({ error: 'admin_required' });
      const { cardId, action, edits, attachPoiId } = req.body || {};
      if (!cardId || !['approve', 'reject', 'attach'].includes(action)) {
        return res.status(400).json({ error: 'Parametri non validi' });
      }
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };

      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
        { headers: svcHeaders }
      );
      const card = cards?.[0];
      if (!card) return res.status(404).json({ error: 'Scheda non trovata' });
      if (card.review_status === 'approved') {
        return res.json({ success: true, alreadyReviewed: true, published_poi_id: card.published_poi_id });
      }

      const nowIso = new Date().toISOString();

      if (action === 'reject') {
        await axios.patch(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}`,
          { review_status: 'rejected', reviewed_at: nowIso, reviewed_by: adminId },
          { headers: svcHeaders });
        return res.json({ success: true });
      }

      // VALIDAZIONE PRIMA DI QUALSIASI SCRITTURA (era dopo la copia foto):
      // shared_pois.lat/lon è NOT NULL → approvare senza GPS dava 500 con la
      // foto già pubblica e orfana. Ora si blocca prima.
      if (action === 'approve' && (card.lat === null || card.lon === null || card.lat === undefined || card.lon === undefined)) {
        return res.status(400).json({ error: 'coordinate_mancanti' });
      }
      let attachTarget: any = null;
      if (action === 'attach') {
        if (!attachPoiId) return res.status(400).json({ error: 'attachPoiId mancante' });
        const { data: pois } = await axios.get(
          `${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(attachPoiId)}&select=id,images_json,image_url`,
          { headers: svcHeaders }
        );
        attachTarget = pois?.[0];
        if (!attachTarget) return res.status(404).json({ error: 'POI ufficiale non trovato' });
      }

      // LOCK ATOMICO: si "prende" la scheda passandola a 'reviewing' solo se
      // è ancora pending/rejected. Due admin (o un doppio click) in parallelo:
      // solo uno matcha e prosegue, l'altro riceve 0 righe → esce pulito.
      const claim = await axios.patch(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}&review_status=in.(pending,rejected)`,
        { review_status: 'reviewing' },
        { headers: { ...svcHeaders, Prefer: 'return=representation' } }
      );
      if (!Array.isArray(claim.data) || claim.data.length === 0) {
        return res.json({ success: true, alreadyReviewed: true });
      }
      const prevStatus = card.review_status || 'pending';

      let publishedPoiId: string | null = null;
      let publicPhotoUrl: string | null = null;
      // Vision dello stesso posto = UN solo POI community con galleria: se
      // all'approvazione esiste già un POI community entro questo raggio, la
      // foto si accorpa nella sua images_json invece di creare un pin doppio.
      const COMMUNITY_MERGE_RADIUS_M = 150;
      let merged = false;
      try {
        // Campi eventualmente corretti dall'admin in revisione
        const e = edits || {};
        const name = e.name || card.name;
        const city = e.city ?? card.city;
        const descShort = e.description_short ?? card.description_short;
        const descLong = e.description_long ?? card.description_long;
        const history = e.history ?? card.history;
        // Audioguida: testo AI della scheda; se l'AI non aveva riconosciuto,
        // si compone dal racconto dell'utente, rifinibile poi dall'Editor POI.
        const audioScript = (e.audio_script ?? card.audio_script)
          || [descLong || descShort, card.user_comment ? `Un viaggiatore racconta: ${card.user_comment}` : '']
               .filter(Boolean).join(' ')
          || null;

        // Copia foto nel bucket PUBBLICO solo ORA, a validazione superata:
        // l'originale resta privato dell'utente.
        const safeAttachId = String(attachPoiId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const publishName = action === 'attach' ? `${safeAttachId}__${card.id}.jpg` : `vision-${card.id}.jpg`;
        const buf = await downloadVisionPhoto(card.clean_photo_url || card.photo_url);
        if (buf) {
          try {
            await axios.post(`${supabaseUrl}/storage/v1/object/vision-public/${publishName}`, buf, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
              maxBodyLength: Infinity
            });
            publicPhotoUrl = `${supabaseUrl}/storage/v1/object/public/vision-public/${publishName}`;
          } catch (upErr: any) {
            console.warn('[Vision Review] Copia foto pubblica fallita:', upErr?.message);
          }
        }

        if (action === 'approve') {
          // ── ACCORPAMENTO PER DISTANZA ────────────────────────────────
          // Cerca un POI community esistente entro COMMUNITY_MERGE_RADIUS_M:
          // bbox largo poi distanza reale, vince il più vicino.
          let mergeTarget: any = null;
          try {
            const dM = 0.004;
            const { data: nearCommunity } = await axios.get(
              `${supabaseUrl}/rest/v1/shared_pois?category=eq.community&lat=gte.${(card.lat - dM).toFixed(5)}&lat=lte.${(card.lat + dM).toFixed(5)}&lon=gte.${(card.lon - dM).toFixed(5)}&lon=lte.${(card.lon + dM).toFixed(5)}&select=id,name,lat,lon,images_json,image_url`,
              { headers: svcHeaders }
            );
            let bestD = COMMUNITY_MERGE_RADIUS_M;
            for (const p of nearCommunity || []) {
              const dist = getHaversineDistance(card.lat, card.lon, p.lat, p.lon);
              if (dist <= bestD) { bestD = dist; mergeTarget = p; }
            }
          } catch (nearErr: any) {
            console.warn('[Vision Review] Ricerca POI community vicini fallita (si crea un POI nuovo):', nearErr?.message);
          }

          if (mergeTarget) {
            // Stesso posto: la foto entra nella GALLERIA del POI esistente;
            // i testi restano quelli già pubblicati (rifinibili dall'admin).
            let images: any[] = [];
            try {
              images = Array.isArray(mergeTarget.images_json) ? mergeTarget.images_json : JSON.parse(mergeTarget.images_json || '[]');
            } catch { images = []; }
            if (publicPhotoUrl) images.push({ url: publicPhotoUrl, source: 'wip_community', added_at: nowIso, card_id: card.id });
            await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(mergeTarget.id)}`,
              {
                images_json: images,
                // Se il POI esistente era senza copertina, la eredita.
                ...(mergeTarget.image_url || !publicPhotoUrl ? {} : { image_url: publicPhotoUrl, photo_url: publicPhotoUrl })
              },
              { headers: svcHeaders });
            publishedPoiId = mergeTarget.id;
            merged = true;
            console.log(`[Vision Review] Vision ${card.id} accorpata al POI community ${mergeTarget.id} (galleria: ${images.length} foto)`);
          } else {
            publishedPoiId = `vision-${card.id}`;
            // POI community: category='community', tipo reale in poi_type,
            // MAI is_gem (bypasserebbe i filtri nativi). La galleria nasce
            // già col primo scatto: le vision successive si accodano qui.
            const poiRow: any = {
              id: publishedPoiId, name, lat: card.lat, lon: card.lon,
              category: 'community', poi_type: e.poi_type || card.category || 'attraction',
              status: 'verified', verified: true, is_hidden: false, is_gem: false,
              image_url: publicPhotoUrl, photo_url: publicPhotoUrl,
              images_json: publicPhotoUrl ? [{ url: publicPhotoUrl, source: 'wip_community', added_at: nowIso, card_id: card.id }] : [],
              description_short: descShort, description_ai: descShort, description_long: descLong,
              full_description: history, audio_script: audioScript, city,
              source: 'wip_community', alert_radius: 150, geofence_radius: 50
            };
            await axios.post(`${supabaseUrl}/rest/v1/shared_pois`, poiRow,
              { headers: { ...svcHeaders, Prefer: 'resolution=merge-duplicates' } });
          }
        } else {
          // ATTACH: la foto entra nella galleria del POI ufficiale.
          let images: any[] = [];
          try {
            images = Array.isArray(attachTarget.images_json) ? attachTarget.images_json : JSON.parse(attachTarget.images_json || '[]');
          } catch { images = []; }
          if (publicPhotoUrl) images.push({ url: publicPhotoUrl, source: 'wip_community', added_at: nowIso });
          await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(attachPoiId)}`,
            { images_json: images }, { headers: svcHeaders });
          publishedPoiId = attachPoiId;
        }

        await axios.patch(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}`, {
          review_status: 'approved', reviewed_at: nowIso, reviewed_by: adminId,
          published_poi_id: publishedPoiId, published_photo_url: publicPhotoUrl,
          name, city, description_short: descShort, description_long: descLong,
          history, audio_script: audioScript
        }, { headers: svcHeaders });
      } catch (workErr: any) {
        // Ripristina lo stato: la scheda non resta bloccata in 'reviewing'.
        await axios.patch(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}`,
          { review_status: prevStatus }, { headers: svcHeaders }).catch(() => {});
        throw workErr;
      }
      // (il PATCH di approvazione vive DENTRO il try qui sopra: una copia
      // duplicata qui fuori usava variabili di quel blocco → ReferenceError
      // a lavoro già fatto: 500 all'admin e premio mai erogato)

      // Premio: +10 crediti earned all'autore, una sola volta per scheda.
      let rewarded = 0;
      if (card.user_id) {
        const { data: claimed } = await axios.get(
          `${supabaseUrl}/rest/v1/user_rewards_claimed?user_id=eq.${card.user_id}&reward_source_type=eq.vision&reward_source_id=eq.${encodeURIComponent(card.id)}&select=id`,
          { headers: svcHeaders }
        );
        if (!claimed?.length) {
          await axios.post(`${supabaseUrl}/rest/v1/user_rewards_claimed`,
            { user_id: card.user_id, reward_source_type: 'vision', reward_source_id: card.id },
            { headers: svcHeaders });
          const { data: prof } = await axios.get(
            `${supabaseUrl}/rest/v1/user_profiles?id=eq.${card.user_id}&select=earned_credits`,
            { headers: svcHeaders }
          );
          await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${card.user_id}`,
            { earned_credits: (prof?.[0]?.earned_credits || 0) + VISION_REWARD_CREDITS },
            { headers: svcHeaders });
          rewarded = VISION_REWARD_CREDITS;
        }
      }

      res.json({ success: true, published_poi_id: publishedPoiId, rewarded, public_photo_url: publicPhotoUrl, merged });
    } catch (e: any) {
      // Il messaggio Postgres vero (es. il trigger che blocca l'insert) deve
      // arrivare all'admin, non un "review_failed" muto.
      const detail = e?.response?.data?.message || e?.message || '';
      console.error('[Vision Review] Errore:', detail, e?.response?.data);
      const friendly = /Only admin users can modify/i.test(String(detail))
        ? "Trigger DB da aggiornare: esegui scratch/fix-trigger-vision-review-20260811.sql nell'SQL editor Supabase"
        : detail;
      res.status(500).json({ error: 'review_failed', detail: friendly });
    }
  });

  // Cancellazione di una PROPRIA vision dall'album (My Vision): via la riga e
  // le foto private. Se era stata pubblicata, POI community e foto pubblica
  // restano (sono contenuti della community: li gestisce l'admin).
  app.post("/api/vision/delete-card", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });
      const { cardId } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId mancante' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };
      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&select=id,user_id,photo_url,clean_photo_url`,
        { headers: svcHeaders }
      );
      const card = cards?.[0];
      if (!card) return res.status(404).json({ error: 'Scheda non trovata' });
      if (String(card.user_id) !== String(userId)) return res.status(403).json({ error: 'not_owner' });

      // Foto private nel bucket (path <uid>/<file>, mai URL): best-effort.
      for (const p of [card.photo_url, card.clean_photo_url]) {
        if (p && !String(p).startsWith('http')) {
          await axios.delete(`${supabaseUrl}/storage/v1/object/vision-photos/${p}`,
            { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }).catch(() => {});
        }
      }
      await axios.delete(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}`, { headers: svcHeaders });
      res.json({ success: true });
    } catch (e: any) {
      console.error('[Vision Delete Card] Errore:', e?.message);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // Modifica di una scheda GIÀ pubblicata: aggiorna vision_cards e, se il POI
  // è community (id 'vision-<card>'), propaga anche alla riga shared_pois.
  // Serve una route dedicata: /review sulle approvate esce con alreadyReviewed.
  app.post("/api/admin/vision/update", rateLimiter, async (req, res) => {
    try {
      const adminId = await verifyAdminBearer(req);
      if (!adminId) return res.status(403).json({ error: 'admin_required' });
      const { cardId, edits } = req.body || {};
      if (!cardId || !edits || typeof edits !== 'object') {
        return res.status(400).json({ error: 'Parametri non validi' });
      }
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };
      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
        { headers: svcHeaders }
      );
      const card = cards?.[0];
      if (!card) return res.status(404).json({ error: 'Scheda non trovata' });

      // Solo i campi editoriali: mai stato, foto o proprietario.
      const cardPatch: any = {};
      for (const k of ['name', 'city', 'description_short', 'description_long', 'history', 'audio_script']) {
        if (edits[k] !== undefined) cardPatch[k] = edits[k];
      }
      if (!Object.keys(cardPatch).length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
      await axios.patch(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}`, cardPatch, { headers: svcHeaders });

      // Propaga SOLO al POI community associato (mai a un ufficiale da attach).
      let poiUpdated = false;
      if (card.published_poi_id && card.published_poi_id === `vision-${card.id}`) {
        const poiPatch: any = {};
        if (cardPatch.name !== undefined) poiPatch.name = cardPatch.name;
        if (cardPatch.city !== undefined) poiPatch.city = cardPatch.city;
        if (cardPatch.description_short !== undefined) {
          poiPatch.description_short = cardPatch.description_short;
          poiPatch.description_ai = cardPatch.description_short;
        }
        if (cardPatch.description_long !== undefined) poiPatch.description_long = cardPatch.description_long;
        if (cardPatch.history !== undefined) poiPatch.full_description = cardPatch.history;
        if (cardPatch.audio_script !== undefined) poiPatch.audio_script = cardPatch.audio_script;
        if (Object.keys(poiPatch).length) {
          await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(card.published_poi_id)}`, poiPatch, { headers: svcHeaders });
          poiUpdated = true;
        }
      }
      res.json({ success: true, poi_updated: poiUpdated });
    } catch (e: any) {
      console.error('[Vision Update] Errore:', e?.message);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // Cancellazione del POI community nato da una vision approvata: via la riga
  // shared_pois e la foto pubblica; la scheda torna 'rejected' (resta ricordo
  // privato in My Vision). I POI UFFICIALI (attach) non si toccano.
  app.post("/api/admin/vision/delete-poi", rateLimiter, async (req, res) => {
    try {
      const adminId = await verifyAdminBearer(req);
      if (!adminId) return res.status(403).json({ error: 'admin_required' });
      const { cardId } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId mancante' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };
      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
        { headers: svcHeaders }
      );
      const card = cards?.[0];
      if (!card) return res.status(404).json({ error: 'Scheda non trovata' });
      if (!card.published_poi_id || card.published_poi_id !== `vision-${card.id}`) {
        return res.status(400).json({ error: 'non_community_poi', detail: 'La scheda è allegata a un POI ufficiale: non si cancella da qui.' });
      }

      await axios.delete(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(card.published_poi_id)}`, { headers: svcHeaders });
      // Foto pubblica: best-effort, l'oggetto potrebbe non esserci.
      await axios.delete(`${supabaseUrl}/storage/v1/object/vision-public/vision-${card.id}.jpg`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }).catch(() => {});

      await axios.patch(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}`, {
        review_status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: adminId,
        published_poi_id: null, published_photo_url: null
      }, { headers: svcHeaders });

      res.json({ success: true });
    } catch (e: any) {
      console.error('[Vision Delete POI] Errore:', e?.message);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // Pulizia foto con AI (volti, targhe, dati personali) per la revisione.
  // Usa l'editing immagini di Gemini; il risultato va accanto all'originale
  // (privato) come clean_photo_url e diventa la foto pubblicata di default.
  app.post("/api/admin/vision/clean-photo", rateLimiter, async (req, res) => {
    try {
      const adminId = await verifyAdminBearer(req);
      if (!adminId) return res.status(403).json({ error: 'admin_required' });
      // Editing immagini: OpenAI gpt-image-1 PRIMARIO (stessa chiave e stessi
      // fondi della Vision — accesso verificato dal vivo il 2026-08-11), poi
      // OpenRouter, poi Gemini diretto. Groq/DeepSeek NON editano immagini.
      const openAiEditKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openAiEditKey && !openRouterKey && !ai) {
        return res.status(500).json({ error: 'Nessun provider di editing immagini configurato (OPENAI_API_KEY, OPENROUTER_API_KEY o GEMINI_API_KEY)' });
      }
      const { cardId, instruction } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId mancante' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };

      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
        { headers: svcHeaders }
      );
      const card = cards?.[0];
      if (!card) return res.status(404).json({ error: 'Scheda non trovata' });
      const buf = await downloadVisionPhoto(card.photo_url);
      if (!buf) return res.status(404).json({ error: 'Foto non disponibile' });

      const prompt = String(instruction || '').trim() ||
        "Rimuovi o sfoca in modo naturale volti riconoscibili, targhe di veicoli e altri dati personali visibili in questa foto. Non alterare il monumento, l'opera o il paesaggio. Restituisci SOLO l'immagine modificata.";

      let outB64: string | null = null;
      // Stato degli errori per una diagnosi onesta all'admin: "clean_failed"
      // generico nascondeva che i motori erano semplicemente senza fondi.
      let openAiStatus: number | null = null;
      let orStatus: number | null = null;
      let geminiQuota = false;

      // Motore 0: OpenAI gpt-image-1 (images/edits). FormData/Blob globali
      // (Node 18+); output_format jpeg perché il file viene salvato come .jpg.
      if (openAiEditKey) {
        try {
          const form = new FormData();
          form.append('model', 'gpt-image-1');
          form.append('image', new Blob([buf], { type: 'image/jpeg' }), 'photo.jpg');
          form.append('prompt', prompt);
          form.append('size', 'auto');
          form.append('quality', 'medium');
          form.append('output_format', 'jpeg');
          const r = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${openAiEditKey}` },
            body: form,
            signal: AbortSignal.timeout(120000)
          });
          const j: any = await r.json().catch(() => ({}));
          if (r.ok) {
            outB64 = j?.data?.[0]?.b64_json || null;
            if (!outB64) console.warn('[Vision Clean] OpenAI ha risposto senza immagine');
          } else {
            openAiStatus = r.status;
            console.warn('[Vision Clean] OpenAI fallito:', r.status, String(j?.error?.message || '').slice(0, 200));
            if (r.status === 402 || r.status === 429) {
              await reportVisionFundsIssue('OpenAI (editing foto)', { response: { status: r.status, data: j } });
            }
          }
        } catch (oaErr: any) {
          console.warn('[Vision Clean] OpenAI eccezione:', oaErr?.message);
        }
      }

      // Riserva 1: OpenRouter (modello immagini Gemini via API unificata)
      if (openRouterKey && !outB64) {
        try {
          const r = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'google/gemini-2.5-flash-image',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` } }
              ]
            }],
            modalities: ['image', 'text']
          }, {
            timeout: 60000,
            headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' }
          });
          const imgUrl = r.data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
            outB64 = imgUrl.split(',')[1] || null;
          }
          if (!outB64) console.warn('[Vision Clean] OpenRouter ha risposto senza immagine');
        } catch (orErr: any) {
          orStatus = orErr?.response?.status || null;
          console.warn('[Vision Clean] OpenRouter fallito:', orStatus, orErr?.response?.data?.error?.message || orErr?.message);
          await reportVisionFundsIssue('OpenRouter (editing foto)', orErr);
        }
      }

      // Riserva: Gemini diretto (se configurato)
      const models = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];
      for (const model of models) {
        if (outB64 || !ai) break;
        try {
          const r = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } }
            ] }]
          });
          const parts = r?.candidates?.[0]?.content?.parts || [];
          const img = parts.find((p: any) => p.inlineData?.data);
          if (img) { outB64 = img.inlineData.data; break; }
        } catch (mErr: any) {
          if (/quota|429|RESOURCE_EXHAUSTED/i.test(String(mErr?.message))) geminiQuota = true;
          console.warn(`[Vision Clean] ${model} fallito:`, mErr?.message);
        }
      }
      if (!outB64) {
        // Diagnosi verificata 2026-08-11: OpenRouter 402 (crediti finiti) e
        // Gemini 429 (quota immagini esaurita su TUTTE le chiavi); OpenAI
        // gpt-image-1 è il primario funzionante. Groq NON può sostituirli:
        // genera solo testo, non modifica immagini.
        const funds = openAiStatus === 402 || openAiStatus === 429 || orStatus === 402 || geminiQuota;
        return res.status(502).json({
          error: 'clean_failed',
          detail: funds
            ? 'Crediti/quota AI esauriti per l\'editing foto su tutti i motori (OpenAI, OpenRouter, Gemini): ricarica uno dei provider. Groq non può modificare immagini.'
            : 'Editing AI non riuscito, riprova'
        });
      }

      const basePath = /^https?:/i.test(card.photo_url || '')
        ? `${card.user_id || 'legacy'}/${card.id}`
        : String(card.photo_url).replace(/\.jpg$/i, '');
      const cleanPath = `${basePath}-clean.jpg`;
      await axios.post(`${supabaseUrl}/storage/v1/object/vision-photos/${cleanPath}`, Buffer.from(outB64, 'base64'), {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        maxBodyLength: Infinity
      });
      await axios.patch(`${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(card.id)}`,
        { clean_photo_url: cleanPath }, { headers: svcHeaders });

      res.json({ success: true, clean_photo_url: cleanPath, preview: await signVisionPhoto(cleanPath) });
    } catch (e: any) {
      console.error('[Vision Clean] Errore:', e?.message);
      res.status(500).json({ error: 'clean_failed', detail: e?.message });
    }
  });

  // ── Compila da AI (Agnes su Groq): riempie i campi della scheda in coda ──
  // partendo da posizione GPS (reverse geocoding + POI reali vicini come
  // indizi) e dai racconti di viaggiatore e admin. SOLO TESTO: per questo
  // Groq va benissimo — per l'editing FOTO invece no (non genera immagini).
  app.post("/api/admin/vision/ai-fill", rateLimiter, async (req, res) => {
    try {
      const adminId = await verifyAdminBearer(req);
      if (!adminId) return res.status(403).json({ error: 'admin_required' });
      const { cardId, adminHint } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId mancante' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };

      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
        { headers: svcHeaders }
      );
      const card = cards?.[0];
      if (!card) return res.status(404).json({ error: 'Scheda non trovata' });

      // Contesto REALE della zona: indirizzo, POI del DB con distanze, luoghi
      // Wikipedia georeferenziati + estratti delle 2 voci più vicine. L'AI
      // deve ancorarsi a riferimenti verificabili, non alla fantasia.
      let address = '';
      let nearbyNames: string[] = [];
      let wikiRefs: string[] = [];
      let wikiExtracts: string[] = [];
      if (card.lat != null && card.lon != null) {
        try {
          const nom = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?lat=${card.lat}&lon=${card.lon}&format=json&accept-language=it`,
            { headers: { 'User-Agent': 'WorldInPocket/1.0' }, timeout: 6000 }
          );
          address = nom.data?.display_name || '';
        } catch { /* best-effort */ }
        try {
          const d = 0.006;
          const { data: pois } = await axios.get(
            `${supabaseUrl}/rest/v1/shared_pois?lat=gte.${(card.lat - d).toFixed(5)}&lat=lte.${(card.lat + d).toFixed(5)}&lon=gte.${(card.lon - d).toFixed(5)}&lon=lte.${(card.lon + d).toFixed(5)}&category=neq.community&select=name,poi_type,lat,lon&limit=15`,
            { headers: svcHeaders }
          );
          nearbyNames = (pois || []).map((p: any) => {
            const distM = Math.round(getHaversineDistance(card.lat, card.lon, p.lat, p.lon));
            return `${p.name}${p.poi_type ? ` (${p.poi_type})` : ''} a ${distM}m`;
          });
        } catch { /* best-effort */ }
        // Wikipedia geosearch: luoghi REALI e citabili attorno al punto.
        try {
          const geo = await axios.get(
            `https://it.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${card.lat}%7C${card.lon}&gsradius=1500&gslimit=8&format=json`,
            { headers: { 'User-Agent': 'WorldInPocket/1.0' }, timeout: 6000 }
          );
          const hits = geo.data?.query?.geosearch || [];
          wikiRefs = hits.map((h: any) => `${h.title} (${Math.round(h.dist)}m)`);
          const topTitles = hits.slice(0, 2).map((h: any) => h.title);
          if (topTitles.length > 0) {
            const ext = await axios.get(
              `https://it.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=700&titles=${encodeURIComponent(topTitles.join('|'))}&format=json`,
              { headers: { 'User-Agent': 'WorldInPocket/1.0' }, timeout: 6000 }
            );
            const pages: any = ext.data?.query?.pages || {};
            wikiExtracts = Object.values(pages)
              .map((p: any) => (p?.extract ? `${p.title}: ${String(p.extract).replace(/\s+/g, ' ')}` : ''))
              .filter(Boolean);
          }
        } catch { /* best-effort */ }
      }

      const sysPrompt = `Sei Agnes, redattrice turistica di World in Pocket. Componi la scheda di un luogo fotografato da un viaggiatore, destinata alla pubblicazione come POI community. Scrivi in ITALIANO con tono da guida turistica calda e precisa.
AGGANCIATI AI FATTI: usa SOLO dettagli riscontrabili — ciò che si VEDE nella foto (se fornita: descrivi elementi concreti dello scatto) e i riferimenti REALI del contesto (estratti Wikipedia, POI del database con distanze, indirizzo). Nomi propri, epoche e attribuzioni SOLO se presenti nel contesto fornito. VIETATO inventare date, aneddoti o citazioni. Nel dubbio resta descrittiva.
Se il "Nome attuale scheda" è un segnaposto generico (es. "Vision 11/08/2026"), IGNORALO: ricava il nome vero del luogo da foto, indirizzo e riferimenti (es. "Spiaggia di Fiascherino").
Rispondi SOLO con un oggetto JSON valido, nessun testo fuori dal JSON:
{
  "name": "nome proprio e breve del luogo (usa il nome reale dal contesto se identificabile)",
  "city": "città o località",
  "poi_type": "UNO tra: monument | church | museum | viewpoint | artwork | attraction | park | beach | castle",
  "description_short": "2 frasi, max 50 parole, con almeno un dettaglio concreto della zona o della foto",
  "description_long": "150-200 parole: cosa si vede (dalla foto), dove ci si trova (dai riferimenti reali), perché vale la sosta",
  "history": "80-120 parole di contesto storico/culturale PRESO DAI RIFERIMENTI forniti (Wikipedia in primis); se i riferimenti non bastano, contesto geografico prudente senza date",
  "audio_script": "narrazione di circa 150 parole in seconda persona, da leggere ad alta voce, che accoglie il visitatore sul posto citando dettagli reali visibili"
}`;

      const contextBlock = `DATI DISPONIBILI
Nome attuale scheda: ${card.name || 'n/d'}
Posizione GPS: ${card.lat}, ${card.lon}
Indirizzo (reverse geocoding): ${address || 'n/d'}
Città rilevata: ${card.city || 'n/d'}
Racconto del viaggiatore: ${card.user_comment || 'nessuno'}
Tag del viaggiatore: ${Array.isArray(card.comment_tags) ? card.comment_tags.join(', ') : (card.comment_tags || 'nessuno')}
Note dell'admin: ${String(adminHint || '').trim() || 'nessuna'}
POI reali nelle vicinanze (dal database WIP): ${nearbyNames.join('; ') || 'nessuno'}
Luoghi Wikipedia vicini (riferimenti REALI): ${wikiRefs.join('; ') || 'nessuno'}
Estratti Wikipedia (fatti verificati sulla zona):
${wikiExtracts.join('\n') || 'nessuno'}`;

      // Motore 1: OpenAI gpt-4o-mini VEDE la foto — i dettagli dello scatto
      // entrano nella scheda. Agnes/Groq resta la riserva solo-testo.
      let fields: any = null;
      const openAiFillKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
      if (openAiFillKey) {
        try {
          const photoBuf = await downloadVisionPhoto(card.clean_photo_url || card.photo_url);
          const userContent: any[] = [{ type: 'text', text: contextBlock }];
          if (photoBuf) {
            userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBuf.toString('base64')}` } });
          }
          const r = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: userContent }
            ],
            temperature: 0.5,
            max_tokens: 1600,
            response_format: { type: 'json_object' }
          }, { timeout: 45000, headers: { Authorization: `Bearer ${openAiFillKey}`, 'Content-Type': 'application/json' } });
          fields = parseSafeJSON(r.data?.choices?.[0]?.message?.content || '{}');
        } catch (oaErr: any) {
          console.warn('[Vision AI-Fill] OpenAI fallito, fallback Agnes/Groq:', oaErr?.response?.data?.error?.message || oaErr?.message);
        }
      }

      if (!fields || typeof fields !== 'object' || !fields.name) {
        const response = await callUniversalAi('groq', [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: contextBlock }
        ], { response_format: { type: 'json_object' }, temperature: 0.6 }, 'vision_admin_fill', supabaseUrl, supabaseServiceKey, groq);
        fields = parseSafeJSON(String(response?.data || '{}'));
      }

      if (!fields || typeof fields !== 'object' || !fields.name) {
        return res.status(502).json({ error: 'ai_fill_failed', detail: 'Risposta AI vuota o non valida, riprova' });
      }
      res.json({ success: true, fields });
    } catch (e: any) {
      console.error('[Vision AI-Fill] Errore:', e?.response?.data || e?.message);
      res.status(500).json({ error: 'ai_fill_failed', detail: e?.message });
    }
  });

  // Feed pubblico "WIP Community": le Vision approvate di tutti, in forma
  // ANONIMA per costruzione (user_id non è nemmeno nella select).
  app.get("/api/vision/community", rateLimiter, async (req, res) => {
    try {
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };
      const limit = Math.min(100, parseInt(String(req.query.limit || '60'), 10) || 60);
      const { data } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?review_status=eq.approved&select=id,name,city,category,description_short,curiosity,published_photo_url,published_poi_id,created_at&order=created_at.desc&limit=${limit}`,
        { headers: svcHeaders }
      );
      res.json({ cards: data || [] });
    } catch (e: any) {
      console.error('[Vision Community Feed] Errore:', e?.message);
      res.status(500).json({ error: 'feed_failed' });
    }
  });

  app.post("/api/poi/batch-teaser", rateLimiter, async (req, res) => {
    try {
      // Scrive su shared_pois con la service key: consentito solo ad admin
      // (bottone pannello) o al cron Vercel (CRON_SECRET). Prima era APERTA.
      const authHeader = String(req.headers.authorization || '');
      const hasCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
      if (!hasCronSecret) {
        const adminId = await verifyAdminBearer(req);
        if (!adminId) return res.status(403).json({ error: "Admin authorization required" });
      }

      const { poiIds, lang = "it" } = req.body;
      if (!Array.isArray(poiIds) || poiIds.length === 0) return res.json({ success: true });

      const langCol = `teaser_text_${lang.toLowerCase()}`;

      // 1. Recupera POI che non hanno ancora il teaser
      const { data: poisToEnrich, error: fetchErr } = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?id=in.(${poiIds.join(',')})&select=id,name,category,${langCol}`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      });

      if (fetchErr || !poisToEnrich) throw new Error("Fetch failed");

      const missing = poisToEnrich.filter((p: any) => !p[langCol]);
      if (missing.length === 0) return res.json({ success: true, message: "All teasers cached" });

      console.log(`[Teaser AI] Generazione teaser per ${missing.length} nuovi POI...`);

      // 2. Generazione in parallelo (limitata)
      // Tutte le lingue dell'app (stesse colonne teaser_text_<lang> su shared_pois)
      const TEASER_LANG_NAMES: Record<string, string> = {
        it: "italiano", en: "inglese", fr: "francese", es: "spagnolo",
        de: "tedesco", ru: "russo", zh: "cinese semplificato"
      };
      const langName = TEASER_LANG_NAMES[lang.toLowerCase()] || "inglese";

      const results = await Promise.all(missing.map(async (poi: any) => {
        try {
          const prompt = `Sei una guida turistica brillante. Scrivi un teaser di 50-70 parole per il luogo "${poi.name}" (Categoria: ${poi.category}).
Regole:
1. NON iniziare con saluti o frasi di arrivo ("Sei arrivato a..."): l'app pronuncia già l'annuncio di arrivo prima del teaser. Parti direttamente con un dettaglio storico, artistico o architettonico concreto e affascinante.
2. Includi ALMENO due dettagli specifici (una data, un personaggio, un aneddoto, una curiosità poco nota): il teaser deve far percepire quanto c'è ancora da scoprire.
3. Chiudi SEMPRE con un invito esplicito e incuriosente a sbloccare l'audioguida completa (es. "Sblocca l'audioguida per scoprire perché...", adattato alla lingua) o con una domanda che l'audioguida promette di rivelare.
4. Rispondi SOLO col testo del teaser, niente titoli o virgolette.
5. Scrivi TUTTO il testo in ${langName}.`;

          const response = await callUniversalAi(
            "agnes",
            [{ role: "user", content: prompt }],
            { temperature: 0.7 },
            "teaser_generation",
            supabaseUrl,
            supabaseServiceKey,
            groq
          );

          const teaserText = (response.data || "").trim();
          if (teaserText) {
            // Salva su Supabase
            await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi.id}`, {
              [langCol]: teaserText
            }, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
            });
            return { id: poi.id, teaser: teaserText };
          }
        } catch (e) {
          console.error(`[Teaser AI] Failed for ${poi.name}:`, e);
        }
        return null;
      }));

      res.json({ success: true, count: results.filter(Boolean).length });
    } catch (e: any) {
      console.error("[Teaser AI] Batch error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Cuore della generazione audioguida, ESTRATTO da /api/regenerate così che
  // anche l'endpoint get-or-create per-lingua (/api/poi/audioguide, usato dal
  // nativo) produca la narrazione con la STESSA logica e lo stesso prompt.
  // Riscrive `text` (base, spesso in italiano) nella lingua target.
  const LANG_NAMES: Record<string, string> = {
    it: "italiano", en: "inglese (English)", fr: "francese (French)",
    es: "spagnolo (Spanish)", de: "tedesco (German)", ru: "russo (Russian)", zh: "cinese (Chinese)"
  };
  async function regenerateAudioguideText(opts: { text: string; poiName: string; mode?: string; location?: string; previousText?: string; lang?: string; }): Promise<string> {
    const { text, poiName, mode, location, previousText, lang = "it" } = opts;
    const targetLangName = LANG_NAMES[String(lang).toLowerCase()] || "italiano";
    const locContext = location ? ` situato a ${location}` : "";
    const basePrompt = mode === 'nicky'
      ? `Sei una guida locale fashion, moderna, trendy e amichevole di nome Nicky. Crea una narrazione per una audioguida su "${poiName}"${locContext} in lingua ${targetLangName}.
           Regole tassative di aderenza al contesto e anti-allucinazione:
           1. Parla del luogo basandoti esclusivamente e rigidamente sul testo originale fornito. NON inventare assolutamente storie storiche drammatiche o fatti cronaca nera se non sono esplicitamente citati nel testo originale.
           2. Usa un tono da "local guide" amichevole ed entusiasta. Fai RIFERIMENTI SPECIFICI ma dal taglio più LIFESTYLE, FASHION o TRENDY. Usa espressioni naturali come "vibe", "top", "must-see".
           3. Restituisci SOLO ed esclusivamente la narrazione in testo piano in lingua ${targetLangName}. NON USARE ASSOLUTAMENTE simboli come asterischi (*), cancelletti (#) o altri caratteri di formattazione markdown, poiché il testo sarà letto da una voce sintetizzata e questi simboli disturbano l'ascolto. La lunghezza del testo deve essere ideale per un audio di 40-120 secondi (quindi tra 100 e 250 parole).`
      : `Sei una guida turistica esperta, professionale e autorevole di nome Dante. Crea una narrazione su "${poiName}"${locContext} in lingua ${targetLangName}.
           Regole tassative di aderenza al contesto e anti-allucinazione:
           1. Fornisci informazioni reali e storicamente provate basandoti sul testo originale fornito. NON inventare leggende o associazioni errate con monumenti famosi estranei se non sono citati nel testo.
           2. Fai RIFERIMENTI e DETTAGLI SPECIFICI storico-culturali o architettonici precisi. Scendi nel dettaglio tecnico/storico in modo affascinante.
           3. Restituisci SOLO ed esclusivamente la narrazione in testo piano in lingua ${targetLangName}. NON USARE ASSOLUTAMENTE simboli come asterischi (*), cancelletti (#) o altri caratteri di formattazione markdown. La lunghezza del testo deve essere ideale per un audio di 40-120 secondi (quindi tra 100 e 250 parole).`;
    let prompt = `${basePrompt}\n\nUsa le informazioni da questo testo originale: ${text}`;
    if (previousText) {
      prompt += `\n\nIMPORTANTE: L'utente ha chiesto ULTERIORI INFORMAZIONI e dettagli per questo luogo.
Devi generare un NUOVO testo della stessa lunghezza (circa 40-120 secondi di parlato, ovvero tra le 100 e 250 parole) focalizzandoti su DETTAGLI SPECIFICI, curiosità o aneddoti non citati prima.
Quello che hai GIA' detto in precedenza (DA NON RIPETERE o riassumere): "${previousText}"
Fornisci nuove curiosità, nuovi riferimenti specifici e un nuovo punto di vista, mantenendo lo stile richiesto e restando nei limiti di lunghezza stabiliti.`;
    }
    const sUrl = process.env.VITE_SUPABASE_URL || '';
    const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const response = await callUniversalAi(
      "groq", [{ role: "user", content: prompt }], { temperature: 0.7 },
      "rigenerazione_audio", sUrl, sKey, getGroqClient()
    );
    return (response.data || response.text || "").trim().replace(/[#*_~`]/g, '');
  }

  app.post("/api/regenerate", async (req, res) => {
    try {
      // NIENTE guardia su `ai`: questa route genera con callUniversalAi (Groq/
      // DeepSeek/Agnes), non con Gemini. Il vecchio `if (!ai) return 500`
      // faceva fallire TUTTE le audioguide quando mancava GEMINI_API_KEY,
      // anche con gli altri motori perfettamente configurati.
      const { text, poiName, mode, location, previousText, lang = "it" } = req.body;

      let cleanResult = await regenerateAudioguideText({ text, poiName, mode, location, previousText, lang });

      // Log to api_usage_logs (insert resiliente: vedi insertApiUsageLog)
      try {
        await insertApiUsageLog({
          api_name: 'deepseek_audioguide',
          feature_context: 'audio_guide_generation',
          cost_estimation: 0.001,
          tokens_used: 1500,
          success: true
        });
      } catch (err) {
        console.debug("Failed to log audioguide api_usage_logs");
      }

      res.json({ result: cleanResult });
    } catch (e: any) {
      console.error("Regeneration error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET-OR-CREATE audioguida NELLA LINGUA dell'utente (cache-first).
   *
   * Espone server-side la logica di getOrCreateAudioguideText (finora solo JS,
   * quindi invisibile al servizio nativo in background): il nativo la chiama al
   * PREFETCH (avvicinamento) invece di leggere i campi ITALIANI di shared_pois.
   * Così l'MP3 prefetchato e la guida completa del Day Pass sono nella lingua
   * dell'utente anche in auto a schermo bloccato, e la traduzione è cachata in
   * poi_audioguides (per lingua) e condivisa fra web e nativo — la paga il
   * primo utente di quella lingua, la riusano tutti.
   */
  app.post("/api/poi/audioguide", rateLimiter, async (req, res) => {
    try {
      const { poiId, lang = 'it', character = 'nicky' } = req.body;
      if (!poiId) return res.status(400).json({ error: 'missing poiId' });
      const sUrl = process.env.VITE_SUPABASE_URL || '';
      const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const H = { apikey: sKey, Authorization: `Bearer ${sKey}` };
      // FORMATO LINGUA: poi_audioguides usa il codice MAIUSCOLO (IT/EN/…), come
      // getAudioguide/upsertAudioguide del web (tipo Language). Il DB ha 56k+
      // righe in "IT" e altrettante nelle altre lingue maiuscole: cercare "it"
      // minuscolo mancherebbe la cache e rigenererebbe tutto in duplicato.
      // La mappa langNames di regenerate usa invece le chiavi minuscole.
      const languageDb = String(lang).toUpperCase();   // cache/save poi_audioguides
      const langLower = String(lang).toLowerCase();     // prompt regenerate
      const guideChar = character === 'dante' ? 'dante' : 'nicky';

      // 1. CACHE per-lingua: se esiste già la traduzione, ritornala subito.
      const cacheRes = await axios.get(
        `${sUrl}/rest/v1/poi_audioguides?poi_id=eq.${encodeURIComponent(poiId)}&language=eq.${languageDb}&guide_character=eq.${guideChar}&select=audio_text&limit=1`,
        { headers: H }
      ).catch(() => null);
      const cachedText = cacheRes?.data?.[0]?.audio_text;
      if (cachedText && String(cachedText).trim()) {
        return res.json({ text: cachedText, cached: true });
      }

      // 2. BASE INFO: prima i dettagli nella lingua (se già arricchiti),
      //    altrimenti i campi di shared_pois (spesso in italiano: è solo la
      //    materia prima, il passo 3 la traduce). poi_details può usare l'uno
      //    o l'altro formato: si tenta il maiuscolo, la fonte shared_pois copre.
      const detRes = await axios.get(
        `${sUrl}/rest/v1/poi_details?poi_id=eq.${encodeURIComponent(poiId)}&language=eq.${languageDb}&select=summary,wiki_extract&limit=1`,
        { headers: H }
      ).catch(() => null);
      let base = detRes?.data?.[0]?.summary || detRes?.data?.[0]?.wiki_extract || '';

      const spRes = await axios.get(
        `${sUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(poiId)}&select=name,audio_script,description_long,description_ai,description_short,description&limit=1`,
        { headers: H }
      ).catch(() => null);
      const sp = spRes?.data?.[0] || {};
      const poiName = sp.name || 'questo luogo';
      if (!base) {
        base = sp.audio_script || sp.description_long || sp.description_ai || sp.description_short || sp.description || poiName;
      }

      // 3. Genera/traduce nella lingua target (stessa logica di /api/regenerate).
      const text = await regenerateAudioguideText({ text: base, poiName, mode: guideChar, lang: langLower });
      if (!text || !text.trim()) {
        return res.json({ text: base }); // mai silenzio: almeno la base
      }

      // 4. Salva in poi_audioguides per lingua (formato MAIUSCOLO come il web:
      //    cache condivisa e riusabile da entrambi).
      await axios.post(
        `${sUrl}/rest/v1/poi_audioguides`,
        { poi_id: poiId, language: languageDb, guide_character: guideChar, audio_text: text, generated_at: new Date().toISOString() },
        { headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' } }
      ).catch((e: any) => console.warn('[api/poi/audioguide] save failed:', e?.message));

      res.json({ text });
    } catch (e: any) {
      console.error('[api/poi/audioguide] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * CONTATTI STRUTTURATI di un POI (telefono / sito / orari) da OpenStreetMap
   * (Overpass, gratis) e Wikidata (P856 sito, P1329 telefono). Cache-first su
   * shared_pois: se contact_enriched_at è già valorizzato ritorna quel che c'è,
   * altrimenti scarica UNA volta, salva nelle colonne dedicate e ritorna.
   * On-demand (apertura POI) o via script batch: MAI scraping globale.
   */
  app.post("/api/poi/contacts", rateLimiter, async (req, res) => {
    try {
      const { poiId, lat, lon, name, wikidata, force } = req.body || {};
      if (!poiId) return res.status(400).json({ error: 'missing poiId' });
      const sUrl = process.env.VITE_SUPABASE_URL || '';
      const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      const H = { apikey: sKey, Authorization: `Bearer ${sKey}` };

      // 1. CACHE: già arricchito? ritorna dal DB (a meno di force).
      const cur = await axios.get(
        `${sUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(poiId)}&select=contact_phone,contact_website,opening_hours_json,contact_enriched_at,lat,lon,name,wikidata,category,poi_type,is_gem&limit=1`,
        { headers: H }
      ).catch(() => null);
      const row = cur?.data?.[0] || {};
      if (!force && row.contact_enriched_at) {
        return res.json({
          phone: row.contact_phone || null,
          website: row.contact_website || null,
          opening_hours: row.opening_hours_json?.raw || null,
          cached: true,
        });
      }

      // Solo categorie turistico-culturali: bar/ristoranti/negozi/utilità NON
      // vengono arricchiti (telefono/orari lì non servono alla scoperta e
      // sprecherebbero chiamate Overpass). Blocklist del commerciale/servizio.
      const NON_TOURISTIC_CAT = new Set(['locali', 'utilita']);
      const NON_TOURISTIC_TYPE = new Set(['restaurant','cafe','bar','pub','fast_food','pharmacy','hospital','police','taxi','station','subway_entrance','toll_booth','drinking_water','marketplace','mercato','playground','information','tourism_information','office']);
      const isTouristic = (row.is_gem === true)
        || (!NON_TOURISTIC_CAT.has(String(row.category || '').toLowerCase())
            && !NON_TOURISTIC_TYPE.has(String(row.poi_type || '').toLowerCase()));
      if (!isTouristic) {
        // Marca come processato (vuoto) per non riprovare a ogni apertura.
        await axios.patch(
          `${sUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(poiId)}`,
          { contact_enriched_at: new Date().toISOString() },
          { headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' } }
        ).catch(() => {});
        return res.json({ phone: null, website: null, opening_hours: null, skipped: 'not_touristic' });
      }

      const plat = typeof lat === 'number' ? lat : row.lat;
      const plon = typeof lon === 'number' ? lon : row.lon;
      const pname = (name || row.name || '').toLowerCase().trim();
      const wd = wikidata || row.wikidata;

      let phone: string | null = null;
      let website: string | null = null;
      let openingHours: string | null = null;

      // 2. OVERPASS (OSM): elementi con contatti attorno alle coordinate.
      if (typeof plat === 'number' && typeof plon === 'number') {
        const q = `[out:json][timeout:15];(nwr(around:45,${plat},${plon})["phone"];nwr(around:45,${plat},${plon})["contact:phone"];nwr(around:45,${plat},${plon})["website"];nwr(around:45,${plat},${plon})["contact:website"];nwr(around:45,${plat},${plon})["opening_hours"];);out tags center 40;`;
        try {
          const ov = await axios.post('https://overpass-api.de/api/interpreter', `data=${encodeURIComponent(q)}`, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000,
          });
          const els = (ov.data?.elements || []) as any[];
          // Preferisci l'elemento col nome più simile; altrimenti il primo utile.
          const scored = els.map(e => {
            const t = e.tags || {};
            const nm = String(t.name || '').toLowerCase().trim();
            const nameMatch = pname && nm && (nm === pname || nm.includes(pname) || pname.includes(nm));
            const hasContact = t.phone || t['contact:phone'] || t.website || t['contact:website'] || t.opening_hours;
            return { t, score: (nameMatch ? 2 : 0) + (hasContact ? 1 : 0) };
          }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
          const best = scored[0]?.t;
          if (best) {
            phone = best.phone || best['contact:phone'] || null;
            website = best.website || best['contact:website'] || null;
            openingHours = best.opening_hours || null;
          }
        } catch (e: any) {
          console.warn('[contacts] Overpass failed:', e?.message);
        }
      }

      // 3. WIKIDATA: completa ciò che manca (sito ufficiale, telefono).
      if (wd && (!website || !phone)) {
        try {
          const wdRes = await axios.get(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wd)}.json`, { timeout: 12000 });
          const claims = wdRes.data?.entities?.[wd]?.claims || {};
          if (!website && claims.P856?.[0]?.mainsnak?.datavalue?.value) {
            website = String(claims.P856[0].mainsnak.datavalue.value);
          }
          if (!phone && claims.P1329?.[0]?.mainsnak?.datavalue?.value) {
            phone = String(claims.P1329[0].mainsnak.datavalue.value);
          }
        } catch (e: any) {
          console.warn('[contacts] Wikidata failed:', e?.message);
        }
      }

      // 4. Salva SEMPRE contact_enriched_at (anche se vuoto: non riprovare a
      //    ogni apertura un POI che semplicemente non ha contatti pubblici).
      const patch: any = { contact_enriched_at: new Date().toISOString() };
      if (phone) patch.contact_phone = phone;
      if (website) patch.contact_website = website;
      if (openingHours) patch.opening_hours_json = { raw: openingHours, source: 'osm' };
      await axios.patch(
        `${sUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(poiId)}`,
        patch,
        { headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' } }
      ).catch((e: any) => console.warn('[contacts] save failed:', e?.message));

      res.json({ phone, website, opening_hours: openingHours });
    } catch (e: any) {
      console.error('[api/poi/contacts] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * Foto di ripiego REALE per un POI.
   *
   * Il vecchio ripiego era `https://source.unsplash.com/featured/?...`, un
   * servizio DISMESSO da Unsplash: l'URL veniva comunque salvato su
   * shared_pois.image_url/photo_url, quindi ogni POI senza foto Wikipedia si
   * ritrovava un'immagine rotta persistita — e siccome i controlli a valle
   * vedono "la foto c'è", non veniva mai più ritentata. Da qui i pin senza
   * immagine che non si riparano da soli.
   *
   * Ora si usa l'API ufficiale Unsplash (chiave già presente per le guide) e,
   * se non c'è chiave o risultato, si ritorna null: meglio nessuna foto che
   * un link morto scritto per sempre nel database.
   */
  async function findFallbackPhoto(name: string, cityHint?: string): Promise<string | null> {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key || !name) return null;
    try {
      const query = [name, cityHint].filter(Boolean).join(' ');
      const r = await axios.get(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`,
        { headers: { Authorization: `Client-ID ${key}` }, timeout: 5000 }
      );
      const raw = r.data?.results?.[0]?.urls?.regular;
      if (!raw) return null;
      return `${raw.split('?')[0]}?w=800&h=600&fit=crop&q=80&auto=format`;
    } catch (e: any) {
      console.warn('[Photo] Unsplash fallback fallito:', e.message);
      return null;
    }
  }

  // --- WIKIMEDIA COMMONS IMAGE LOADER ---
  async function fetchWikimediaImages(name: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
      const searchRes = await axios.get(searchUrl);
      const searchData = searchRes.data;
      if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
        const files = searchData.query.search.slice(0, 4).filter((s: any) => s.title.startsWith("File:"));
        await Promise.all(files.map(async (file: any) => {
          try {
            // iiurlwidth: thumbnail renderizzata a 1024px — l'URL originale può
            // essere un TIFF da decine di MB che il tag <img> non mostra.
            const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(file.title)}&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json&origin=*`;
            const infoRes = await axios.get(infoUrl);
            const pages = infoRes.data.query.pages;
            const pageId = Object.keys(pages)[0];
            const imageInfo = pages[pageId].imageinfo;
            if (imageInfo && imageInfo.length > 0) {
              results.push(imageInfo[0].thumburl || imageInfo[0].url);
            }
          } catch(e) {}
        }));
      }
    } catch (err) {
      console.error("Wikimedia Commons search error:", err);
    }
    return results;
  }

  // --- smart NEURAL VOICE SYNTHESIZER ---
  async function generateNeuralAudio(text: string, voiceName: string): Promise<Buffer> {
    let voiceLocale = "it-IT";
    if (voiceName && typeof voiceName === "string" && voiceName.includes("-")) {
      const parts = voiceName.split("-");
      if (parts.length >= 2) {
        voiceLocale = `${parts[0]}-${parts[1]}`;
      }
    }

    const azureKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || "westeurope";
    
    if (azureKey) {
      try {
        const ssml = `<speak version='1.0' xml:lang='${voiceLocale}'><voice xml:lang='${voiceLocale}' name='${voiceName}'>${text}</voice></speak>`;
        const response = await axios.post(
          `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          ssml,
          {
            headers: {
              "Ocp-Apim-Subscription-Key": azureKey,
              "Content-Type": "application/ssml+xml",
              "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
              "User-Agent": "WIPWorldInPocket"
            },
            responseType: "arraybuffer",
            timeout: 5000
          }
        );
        return Buffer.from(response.data);
      } catch (e: any) {
        console.warn("Azure TTS in curate engine failed, falling back to Google Wavenet...");
      }
    }

    const googleKey = process.env.GOOGLE_TTS_API_KEY;
    if (googleKey) {
      let googleVoiceName = "it-IT-Wavenet-A";
      let googleLangCode = "it-IT";
      
      if (voiceName) {
        if (voiceName.startsWith("it-IT")) {
          googleLangCode = "it-IT";
          googleVoiceName = voiceName === "it-IT-DiegoNeural" ? "it-IT-Wavenet-C" : "it-IT-Wavenet-A";
        } else if (voiceName.startsWith("en-US")) {
          googleLangCode = "en-US";
          googleVoiceName = voiceName === "en-US-GuyNeural" ? "en-US-Wavenet-D" : "en-US-Wavenet-F";
        } else if (voiceName.startsWith("fr-FR")) {
          googleLangCode = "fr-FR";
          googleVoiceName = voiceName === "fr-FR-HenriNeural" ? "fr-FR-Wavenet-B" : "fr-FR-Wavenet-A";
        } else if (voiceName.startsWith("de-DE")) {
          googleLangCode = "de-DE";
          googleVoiceName = voiceName === "de-DE-ConradNeural" ? "de-DE-Wavenet-B" : "de-DE-Wavenet-A";
        } else if (voiceName.startsWith("es-ES")) {
          googleLangCode = "es-ES";
          googleVoiceName = voiceName === "es-ES-AlvaroNeural" ? "es-ES-Wavenet-B" : "es-ES-Wavenet-C";
        } else if (voiceName.startsWith("ru-RU")) {
          googleLangCode = "ru-RU";
          googleVoiceName = voiceName === "ru-RU-DmitryNeural" ? "ru-RU-Wavenet-B" : "ru-RU-Wavenet-A";
        } else if (voiceName.startsWith("zh-CN")) {
          googleLangCode = "zh-CN";
          googleVoiceName = voiceName === "zh-CN-YunxiNeural" ? "zh-CN-Wavenet-B" : "zh-CN-Wavenet-A";
        }
      }

      const gRes = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`,
        {
          input: { text },
          voice: { languageCode: googleLangCode, name: googleVoiceName },
          audioConfig: { audioEncoding: "MP3" }
        }
      );
      return Buffer.from(gRes.data.audioContent, 'base64');
    }

    throw new Error("No speech synthesis API keys are configured (Azure and Google are missing).");
  }

  // --- POI CURATOR GRANULAR REGENERATOR ---
  app.post("/api/poi/regenerate-content", rateLimiter, async (req, res) => {
    try {
      const { poi_id, type } = req.body;
      if (!poi_id || !type) {
        return res.status(400).json({ error: "poi_id and type are required." });
      }

      const authHeader = req.headers.authorization;
      let adminUserProfileId: string | null = null;
      let isAdmin = false;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: authHeader
            }
          });
          if (userRes.data && userRes.data.id) {
            adminUserProfileId = userRes.data.id;
            const profileRes = await axios.get(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${adminUserProfileId}&select=is_admin`, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
            });
            if (profileRes.data && profileRes.data.length > 0) {
              isAdmin = profileRes.data[0].is_admin === true;
            }
          }
        } catch (e: any) {
          console.warn("REST User verification failed:", e.message);
        }
      }

      // Niente bypass: senza token admin valido la richiesta viene rifiutata.
      // (Prima, senza header, il server "impersonava" il primo admin del DB e
      // chiunque poteva far generare contenuti AI a pagamento su qualsiasi POI.)
      if (!isAdmin) {
        console.warn("[Security] Unauthorized attempt to access POI Curation: rejected.");
        return res.status(403).json({ error: "Admin authorization required" });
      }

      if (type === 'text') {
        const { name, category, lat, lon } = req.body;
        const prompt = `Sei una guida storica e geografica esperta. Scrivi una descrizione geolocalizzata reale, accurata e storicamente provata su "${name}" (Categoria: ${category || 'monumenti'}, Coordinate: ${lat || '0'}, ${lon || '0'}) in lingua italiana.
Regole tassative di aderenza e anti-allucinazione:
1. Descrivi l'attrazione, la sua storia reale, i materiali (es. marmo di Carrara se pertinente), l'architettura.
2. NON inventare assolutamente leggende metropolitane drammatiche, associazioni errate o monumenti di altre città (come il Colosseo o il Titanic Memorial).
3. Restituisci SOLO ed esclusivamente la descrizione in testo piano in lingua italiana, senza intestazioni, introduzioni o formattazione markdown. Massimo 300 parole.`;

        let generatedText = "";
        try {
          const aiResponse = await callUniversalAi(
            "groq",
            [{ role: "user", content: prompt }],
            { model: "llama-3.3-70b-versatile", temperature: 0.7 },
            "admin_poi_regenerate",
            supabaseUrl,
            supabaseServiceKey,
            groq
          );
          generatedText = aiResponse.data?.trim() || "";
        } catch (e: any) {
          return res.status(500).json({ error: "Errore durante la generazione AI: " + e.message });
        }

        await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi_id}`, {
          description_ai: generatedText,
          status: 'needs_revision',
          last_reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserProfileId
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        await axios.post(`${supabaseUrl}/rest/v1/revision_logs`, {
          poi_id,
          admin_id: adminUserProfileId,
          action: 'regenerate_text',
          comment: 'Rigenerato testo principale in italiano con Gemini.'
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        return res.json({ description: generatedText, message: "Testo in italiano rigenerato con successo!" });
      }

      if (type === 'image') {
        // Foto REALI del luogo, mai stock generiche: prima si erano aggiunte
        // 4 foto Unsplash hardcoded per categoria — finivano proposte (e
        // salvate in image_url) per QUALSIASI POI. Ordine di preferenza:
        // 1) Wikimedia Commons, 2) immagine della pagina Wikipedia,
        // 3) SOLO come ultimo fallback Unsplash cercando "<nome poi> <città>".
        const { name, lat, lon } = req.body;
        const searchQuery = name || poi_id;

        const imageOptions: { url: string; source: string; attribution: string }[] = [];
        const seenUrls = new Set<string>();
        const pushOption = (url: string | null | undefined, source: string, attribution: string) => {
          if (!url || seenUrls.has(url)) return;
          seenUrls.add(url);
          imageOptions.push({ url, source, attribution });
        };

        // 1. Wikimedia Commons (foto reali del monumento)
        const wikiImages = await fetchWikimediaImages(searchQuery);
        wikiImages.forEach((u: string) => pushOption(u, 'wikimedia', 'Wikimedia Commons'));

        // 2. Immagine principale della pagina Wikipedia (stessa fonte di /api/wiki/summary)
        try {
          const wRes = await axios.get(
            `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(searchQuery).replace(/ /g, "_"))}`,
            { headers: { "User-Agent": "ItaliaInTascaGuide/1.0" }, timeout: 5000 }
          );
          const pageImg = wRes.data?.originalimage?.source || wRes.data?.thumbnail?.source;
          pushOption(pageImg, 'wikipedia', 'Wikipedia');
        } catch (e) {
          // Pagina Wikipedia assente: si prosegue con le altre fonti.
        }

        // 3. Unsplash SOLO se le fonti enciclopediche non hanno dato nulla,
        //    cercando "<nome poi> <città>" (mai la categoria generica).
        if (imageOptions.length === 0) {
          const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
          if (unsplashKey && name) {
            let cityHint = "";
            if (lat && lon) {
              try {
                const nomRes = await axios.get(
                  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`,
                  { headers: { "User-Agent": "WIPWorldInPocket/1.0" }, timeout: 4000 }
                );
                const addr = nomRes.data?.address || {};
                cityHint = addr.city || addr.town || addr.village || addr.municipality || "";
              } catch (e) {
                // Reverse geocoding fallito: si cerca col solo nome.
              }
            }
            try {
              const query = [name, cityHint].filter(Boolean).join(' ');
              const uRes = await axios.get(
                `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=4&orientation=landscape&content_filter=high`,
                { headers: { Authorization: `Client-ID ${unsplashKey}` }, timeout: 6000 }
              );
              (uRes.data?.results || []).forEach((r: any) => {
                const raw = r?.urls?.regular;
                if (raw) {
                  pushOption(
                    `${raw.split('?')[0]}?w=800&h=600&fit=crop&q=80&auto=format`,
                    'unsplash',
                    `Unsplash · ${r?.user?.name || 'autore sconosciuto'}`
                  );
                }
              });
            } catch (e: any) {
              console.warn('[Curator] Fallback Unsplash fallito:', e.message);
            }
          }
        }

        if (imageOptions.length === 0) {
          return res.status(404).json({ error: "Nessuna foto reale trovata (Wikimedia Commons, Wikipedia o Unsplash)." });
        }

        // Return options without saving them immediately to Supabase
        return res.json({
          image_options: imageOptions,
          message: `Trovate ${imageOptions.length} foto reali del luogo!`
        });
      }

      if (type === 'translate') {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: "text is required for translation." });
        if (!ai) return res.status(500).json({ error: "Gemini not configured" });

        const prompt = `Traduci fedelmente il seguente testo nelle seguenti lingue: Italiano, Inglese, Francese, Spagnolo, Russo, Cinese.
Restituisci il risultato strettamente in formato JSON, con le seguenti chiavi: "IT", "EN", "FR", "ES", "RU", "ZH". 
Il valore deve essere solo il testo tradotto, senza prefazioni o spiegazioni markdown.

Testo da tradurre (lingua originale: inglese):
"${text}"`;


        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const translations = JSON.parse(response.text || "{}");
        const targetLanguages = ['IT', 'EN', 'FR', 'ES', 'RU', 'ZH']; // tutte e 6 le lingue app

        
        for (const lang of targetLanguages) {
          const transText = translations[lang] || '';
          if (!transText) continue;

          for (const mode of ['nicky', 'dante']) {
            await axios.post(`${supabaseUrl}/rest/v1/shared_poi_audio_cache`, {
              poi_id,
              lang:        lang.toLowerCase(),
              guide_mode:  mode,
              description: transText,
              updated_at:  new Date().toISOString(),
              created_at:  new Date().toISOString()
            }, {
              headers: {
                apikey: supabaseServiceKey,
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates'
              }
            });
          }
        }

        // Salva anche il testo originale IT per Nicky e Dante
        for (const mode of ['nicky', 'dante']) {
          await axios.post(`${supabaseUrl}/rest/v1/shared_poi_audio_cache`, {
            poi_id,
            lang:        'it',
            guide_mode:  mode,
            description: text,
            updated_at:  new Date().toISOString(),
            created_at:  new Date().toISOString()
          }, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            }
          });
        }

        await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi_id}`, {
          status: 'needs_revision',
          last_reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserProfileId
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        await axios.post(`${supabaseUrl}/rest/v1/revision_logs`, {
          poi_id,
          admin_id: adminUserProfileId,
          action: 'translate_all',
          comment: 'Eseguita traduzione multi-lingua in EN, FR, DE, ES, ZH con Gemini salvata in cache.'
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        return res.json({ message: "Traduzione multi-lingua in 5 lingue completata e salvata in cache!" });
      }

      if (type === 'audio') {
        const { lang, guide_mode } = req.body;
        if (!lang || !guide_mode) {
          return res.status(400).json({ error: "lang and guide_mode are required for audio synthesis." });
        }
        if (!ai) return res.status(500).json({ error: "Gemini not configured" });

        let description = '';
        try {
          // ── CACHE CHECK: cerca (poi_id, lang, guide_mode) ──────────────
          const cacheRes = await axios.get(
            `${supabaseUrl}/rest/v1/shared_poi_audio_cache` +
            `?poi_id=eq.${poi_id}&lang=eq.${lang.toLowerCase()}&guide_mode=eq.${guide_mode}` +
            `&select=description,audio_base64`,
            { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
          );
          if (cacheRes.data && cacheRes.data.length > 0 && cacheRes.data[0].audio_base64) {
            // Cache HIT: audio già generato in questa lingua+guida â†’ restituisce subito
            return res.json({
              audio_base64: cacheRes.data[0].audio_base64,
              cached: true,
              message: `Audioguida ${lang.toUpperCase()} (${guide_mode}) servita dalla cache.`
            });
          }
          if (cacheRes.data && cacheRes.data.length > 0) {
            description = cacheRes.data[0].description;
          }
        } catch (e) {}

        if (!description) {
          try {
            const poiRes = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi_id}&select=description_ai`, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
            });
            if (poiRes.data && poiRes.data.length > 0) {
              description = poiRes.data[0].description_ai;
            }
          } catch(e) {}
        }

        if (!description) {
          return res.status(404).json({ error: "Nessun testo trovato per questo POI. Rigenera prima il testo." });
        }

        const langNames: Record<string, string> = {
          it: "italiano", en: "inglese (English)", fr: "francese (French)",
          de: "tedesco (German)", es: "spagnolo (Spanish)",
          ru: "russo (Russian)", zh: "cinese (Chinese)"
        };
        const targetLangName = langNames[lang.toLowerCase()] || "italiano";

        const basePrompt = guide_mode === 'nicky' 
          ? `Sei una guida locale fashion, moderna, trendy e amichevole di nome Nicky. Crea una narrazione per una audioguida in lingua ${targetLangName}.
Regole di aderenza e anti-allucinazione:
1. Parla del luogo basandoti esclusivamente e rigidamente sul testo originale fornito. NON inventare assolutamente storie drammatiche o fatti cronaca nera se non sono citati nel testo originale.
2. Usa un tono da "local guide" amichevole ed entusiasta. Fai RIFERIMENTI SPECIFICI ma dal taglio più LIFESTYLE, FASHION o TRENDY. Usa espressioni naturali come "vibe", "top", "must-see".
3. Restituisci SOLO ed esclusivamente la narrazione in testo piano in lingua ${targetLangName}. La lunghezza del testo deve essere ideale per un audio di 40-120 secondi (quindi tra 100 e 250 parole).`
          : `Sei una guida turistica esperta, professionale e autorevole di nome Dante. Crea una narrazione in lingua ${targetLangName}.
Regole di aderenza e anti-allucinazione:
1. Fornisci informazioni reali e storicamente provate basandoti sul testo originale fornito. NON inventare leggende o associazioni errate con monumenti famosi estranei.
2. Fai RIFERIMENTI e DETTAGLI SPECIFICI storico-culturali o architettonici precisi. Scendi nel dettaglio in modo affascinante.
3. Restituisci SOLO ed esclusivamente la narrazione in testo piano in lingua ${targetLangName}. La lunghezza del testo deve essere ideale per un audio di 40-120 secondi (quindi tra 100 e 250 parole).`;

        const prompt = `${basePrompt}\n\nUsa le informazioni da questo testo originale: ${description}`;

        const genRes = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        });

        const narrativeScript = genRes.text?.trim() || description;

        const voiceMappings: Record<string, Record<string, string>> = {
          it: { nicky: "it-IT-ElsaNeural", dante: "it-IT-DiegoNeural" },
          en: { nicky: "en-US-JennyNeural", dante: "en-US-GuyNeural" },
          fr: { nicky: "fr-FR-DeniseNeural", dante: "fr-FR-HenriNeural" },
          de: { nicky: "de-DE-KatjaNeural", dante: "de-DE-ConradNeural" },
          es: { nicky: "es-ES-ElviraNeural", dante: "es-ES-AlvaroNeural" },
          ru: { nicky: "ru-RU-SvetlanaNeural", dante: "ru-RU-DmitryNeural" },
          zh: { nicky: "zh-CN-XiaoxiaoNeural", dante: "zh-CN-YunxiNeural" }
        };

        const currentLangMap = voiceMappings[lang.toLowerCase()] || voiceMappings['it'];
        const selectedVoice = currentLangMap[guide_mode] || currentLangMap['nicky'];

        const audioBuffer = await generateNeuralAudio(narrativeScript, selectedVoice);
        const audioBase64 = audioBuffer.toString('base64');

        // ── SALVA in cache con chiave (poi_id, lang, guide_mode) ──────────
        await axios.post(`${supabaseUrl}/rest/v1/shared_poi_audio_cache`, {
          poi_id,
          lang:         lang.toLowerCase(),
          guide_mode,
          audio_base64: audioBase64,
          description:  description,
          updated_at:   new Date().toISOString(),
          created_at:   new Date().toISOString()
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'  // ON CONFLICT DO UPDATE
          }
        });

        await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi_id}`, {
          status: 'needs_revision',
          last_reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserProfileId
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        await axios.post(`${supabaseUrl}/rest/v1/revision_logs`, {
          poi_id,
          admin_id: adminUserProfileId,
          action: 'regenerate_audio',
          comment: `Generata audioguida neurale in ${lang.toUpperCase()} (${guide_mode}) salvata in cache.`
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        return res.json({
          audio_base64: audioBase64,
          cached: false,
          message: `Audioguida generata in ${lang.toUpperCase()} (${guide_mode}) e salvata in cache.`
        });
      }

      return res.status(400).json({ error: "Invalid type parameter. Supported: 'text', 'audio', 'image', 'translate'." });

    } catch (e: any) {
      console.error("Granular regeneration endpoint error:", e.response?.data || e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/autocomplete", async (req, res) => {
    try {
      const { input } = req.query;
      const token = process.env.VITE_MAPBOX_TOKEN;

      if (!token) {
        return res.status(500).json({ error: "Mapbox token missing" });
      }

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input as string)}.json?access_token=${token}&language=it&limit=5&types=poi,place,address`;
      const mRes = await fetch(url);
      const mData = await mRes.json();
      
      // Mappatura formato per compatibilità frontend
      const predictions = (mData.features || []).map((f: any) => ({
        description: f.place_name,
        place_id: f.id,
        lat: f.center[1],
        lon: f.center[0],
        isMapbox: true,
        structured_formatting: {
          main_text: f.text,
          secondary_text: f.context?.map((c: any) => c.text).join(", ")
        }
      }));

      res.json({ predictions });
    } catch (e: any) {
      console.error("Autocomplete error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/placetextsearch", async (req, res) => {
    try {
      const { query } = req.query;
      const token = process.env.VITE_MAPBOX_TOKEN;

      if (!token) {
        return res.status(500).json({ error: "Mapbox token missing" });
      }

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query as string)}.json?access_token=${token}&language=it&limit=1`;
      const mRes = await fetch(url);
      const mData = await mRes.json();

      // Formato compatibile Google Search Results
      const results = (mData.features || []).map((f: any) => ({
        name: f.text,
        formatted_address: f.place_name,
        geometry: { location: { lat: f.center[1], lng: f.center[0] } },
        place_id: f.id
      }));

      res.json({ results });
    } catch (e: any) {
      console.error("PlaceTextSearch error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * Geocoding parametrico per il pianificatore.
   *
   * Le rotte /api/autocomplete e /api/placetextsearch hanno lingua e tipi
   * fissi (it, poi/place/address) e non servono al planner, che deve cercare
   * SOLO località amministrative nella lingua dell'utente. Prima il client
   * chiamava api.mapbox.com direttamente, esponendo VITE_MAPBOX_TOKEN nel
   * bundle: qui il token resta sul server, come per tutte le altre API.
   */
  app.get("/api/geocode", async (req, res) => {
    try {
      const { q, lang, limit, types } = req.query;
      const token = process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;

      if (!token) return res.status(500).json({ error: "Mapbox token missing" });
      if (!q || !String(q).trim()) return res.json({ features: [] });

      const safeLimit = Math.min(10, Math.max(1, parseInt(String(limit || '5'), 10) || 5));
      const safeLang = /^[a-z]{2}$/i.test(String(lang || '')) ? String(lang).toLowerCase() : 'it';
      const safeTypes = /^[a-z,]+$/i.test(String(types || ''))
        ? String(types)
        : 'place,locality,region,country';

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(String(q))}.json`
        + `?access_token=${token}&limit=${safeLimit}&types=${encodeURIComponent(safeTypes)}&language=${safeLang}`;

      const mRes = await fetch(url);
      if (!mRes.ok) return res.status(502).json({ error: "Geocoder unavailable", features: [] });
      const mData = await mRes.json();

      // Stesso formato già atteso dal planner (description/lat/lon/isMapbox)
      const features = (mData.features || []).map((f: any) => ({
        id: f.id,
        description: f.place_name,
        display_name: f.place_name,
        lat: f.center?.[1],
        lon: f.center?.[0],
        isMapbox: true
      }));

      res.json({ features });
    } catch (e: any) {
      console.error("Geocode error:", e);
      res.status(500).json({ error: e.message, features: [] });
    }
  });

  app.get("/api/placedetails", async (req, res) => {
    try {
      const { place_id } = req.query;
      // Se è un ID Mapbox, cerchiamo i dettagli via Geocoding
      if (String(place_id).startsWith('poi.') || String(place_id).startsWith('address.')) {
        const token = process.env.VITE_MAPBOX_TOKEN;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${place_id}.json?access_token=${token}`;
        const mRes = await fetch(url);
        const mData = await mRes.json();
        const feat = mData.features?.[0];

        return res.json({
          result: {
            name: feat?.text,
            geometry: { location: { lat: feat?.center[1], lng: feat?.center[0] } },
            formatted_address: feat?.place_name
          }
        });
      }
      res.status(404).json({ error: "Place details not available for this ID" });
    } catch (e: any) {
      console.error("PlaceDetails error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/photo", async (req, res) => {
    try {
      const { ref, name } = req.query;
      // Google proxy rimosso. source.unsplash.com è dismesso: si cerca una
      // foto reale via API ufficiale, altrimenti 404 onesto (il client mostra
      // il segnaposto invece di un'immagine rotta).
      const photo = await findFallbackPhoto(String(name || "monument"), "");
      if (!photo) return res.status(404).json({ error: "No photo available" });
      return res.redirect(photo);
    } catch (e: any) {
      res.status(500).json({ error: "Photo service unavailable" });
    }
  });

  // Proxy for Foursquare Search
  app.get("/api/fsq/search", async (req, res) => {
    try {
      const { lat, lon, query } = req.query;
      const key = process.env.FOURSQUARE_API_KEY || process.env.VITE_FOURSQUARE_API_KEY;
      if (!key) return res.status(500).json({ error: "Foursquare key missing" });

      // Migrato al nuovo Places API (il v3 è dismesso e risponde 401)
      const url = `https://places-api.foursquare.com/places/search?ll=${lat},${lon}&query=${encodeURIComponent(query as string)}&limit=50`;
      const fRes = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "X-Places-Api-Version": "2025-06-17" }
      });
      const fData = await fRes.json();
      // Compat v3: i client leggono fsq_id e geocodes.main
      if (Array.isArray(fData?.results)) {
        fData.results = fData.results.map((p: any) => ({
          ...p,
          fsq_id: p.fsq_id || p.fsq_place_id,
          geocodes: p.geocodes || { main: { latitude: p.latitude, longitude: p.longitude } }
        }));
      }
      res.json(fData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Foursquare Details
  app.get("/api/fsq/details", async (req, res) => {
    try {
        const { fsq_id, fields } = req.query;
        const key = process.env.FOURSQUARE_API_KEY || process.env.VITE_FOURSQUARE_API_KEY;
        if (!key) return res.status(500).json({ error: "Foursquare key missing" });

        // Nuovo Places API. I campi premium (description/photos/rating/hours)
        // consumano crediti API: senza crediti l'INTERA richiesta risponde
        // 429, quindi filtriamo ai soli campi base sempre disponibili.
        const FREE_FIELDS = ["name", "location", "website", "tel", "categories", "latitude", "longitude", "fsq_place_id"];
        const requested = String(fields || "").split(",").map((f: string) => f.trim()).filter(Boolean);
        const safe = requested.filter((f: string) => FREE_FIELDS.includes(f));
        const finalFields = (safe.length > 0 ? safe : ["name", "location", "website", "tel", "categories"]).join(",");

        const url = `https://places-api.foursquare.com/places/${fsq_id}?fields=${encodeURIComponent(finalFields)}`;
        const fRes = await fetch(url, {
            headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "X-Places-Api-Version": "2025-06-17" }
        });
        const fData = await fRes.json();
        res.json(fData);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  // Proxy for TripAdvisor Search
  app.get("/api/trip/search", async (req, res) => {
    try {
      const { searchQuery, latLong } = req.query;
      const key = process.env.TRIPADVISOR_API_KEY || process.env.VITE_TRIPADVISOR_API_KEY;
      if (!key) return res.status(500).json({ error: "TRIPADVISOR_API_KEY not configured" });
      if (!(await tripAdvisorBudgetOk())) return res.status(429).json({ error: "TRIPADVISOR_BUDGET_EXCEEDED", data: [] });
      const url = `https://api.content.tripadvisor.com/api/v1/location/search?searchQuery=${encodeURIComponent(searchQuery as string)}&latLong=${latLong}&language=it&key=${key}`;
      // Chiamata server pulita: la chiave TripAdvisor deve essere SENZA
      // restrizioni (gli IP Vercel sono dinamici e la restrizione a dominio
      // viene rifiutata dagli IP datacenter anche con Referer corretto).
      const tRes = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 8000 });
      const tData = tRes.data;
      res.json(tData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for TripAdvisor Details
  app.get("/api/trip/details", async (req, res) => {
    try {
      const { locationId } = req.query;
      const key = process.env.TRIPADVISOR_API_KEY || process.env.VITE_TRIPADVISOR_API_KEY;
      if (!key) return res.status(500).json({ error: "TRIPADVISOR_API_KEY not configured" });
      if (!(await tripAdvisorBudgetOk())) return res.status(429).json({ error: "TRIPADVISOR_BUDGET_EXCEEDED" });
      const url = `https://api.content.tripadvisor.com/api/v1/location/${locationId}/details?language=it&key=${key}`;
      // Chiamata server pulita: la chiave TripAdvisor deve essere SENZA
      // restrizioni (gli IP Vercel sono dinamici e la restrizione a dominio
      // viene rifiutata dagli IP datacenter anche con Referer corretto).
      const tRes = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 8000 });
      const tData = tRes.data;
      res.json(tData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for TripAdvisor Photos
  app.get("/api/trip/photos", async (req, res) => {
    try {
      const { locationId } = req.query;
      const key = process.env.TRIPADVISOR_API_KEY || process.env.VITE_TRIPADVISOR_API_KEY;
      if (!key) return res.status(500).json({ error: "TRIPADVISOR_API_KEY not configured" });
      if (!(await tripAdvisorBudgetOk())) return res.status(429).json({ error: "TRIPADVISOR_BUDGET_EXCEEDED" });
      const url = `https://api.content.tripadvisor.com/api/v1/location/${locationId}/photos?language=it&key=${key}`;
      // Chiamata server pulita: la chiave TripAdvisor deve essere SENZA
      // restrizioni (gli IP Vercel sono dinamici e la restrizione a dominio
      // viene rifiutata dagli IP datacenter anche con Referer corretto).
      const tRes = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 8000 });
      const tData = tRes.data;
      res.json(tData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for TripAdvisor Reviews
  app.get("/api/trip/reviews", async (req, res) => {
    try {
      const { locationId } = req.query;
      const key = process.env.TRIPADVISOR_API_KEY || process.env.VITE_TRIPADVISOR_API_KEY;
      if (!key) return res.status(500).json({ error: "TRIPADVISOR_API_KEY not configured" });
      if (!(await tripAdvisorBudgetOk())) return res.status(429).json({ error: "TRIPADVISOR_BUDGET_EXCEEDED" });
      const url = `https://api.content.tripadvisor.com/api/v1/location/${locationId}/reviews?language=it&key=${key}`;
      // Chiamata server pulita: la chiave TripAdvisor deve essere SENZA
      // restrizioni (gli IP Vercel sono dinamici e la restrizione a dominio
      // viene rifiutata dagli IP datacenter anche con Referer corretto).
      const tRes = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 8000 });
      const tData = tRes.data;
      res.json(tData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Nominatim Reverse
  app.get("/api/nominatim/reverse", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`;
      const nRes = await fetch(url, {
        headers: { "User-Agent": "AIAudioGuideApp/1.0" }
      });
      const nData = await nRes.json();
      res.json(nData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Nominatim Search
  app.get("/api/nominatim/search", async (req, res) => {
    try {
      const { q, countrycodes } = req.query;
      // Ricerca MONDIALE di default: il filtro countrycodes=it,sm,va rendeva
      // impossibile scaricare mappe/cercare città fuori dall'Italia. Il filtro
      // resta disponibile come parametro opzionale per i chiamanti che lo vogliono.
      const cc = countrycodes ? `&countrycodes=${encodeURIComponent(String(countrycodes))}` : "";
      const url = `https://nominatim.openstreetmap.org/search?format=json${cc}&q=${encodeURIComponent(q as string)}&accept-language=it&limit=5`;
      const nRes = await fetch(url, {
         headers: { "User-Agent": "AIAudioGuideApp/1.0" }
      });
      const nData = await nRes.json();
      res.json(nData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Wikipedia Summary (REST API - much better for summaries and images)
  app.get("/api/wiki/summary", async (req, res) => {
    try {
      const { title } = req.query;
      if (!title) return res.status(400).json({ error: "Title required" });
      
      // We try IT first, then EN as fallback if needed (though usually we stick to the language)
      const url = `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, "_"))}`;
      const wRes = await fetch(url, { headers: { "User-Agent": "ItaliaInTascaGuide/1.0" } });
      
      if (!wRes.ok) {
        // If not found in IT, maybe try EN? Or just return error
        return res.status(wRes.status).json({ error: "Wikipedia page not found" });
      }
      
      const wData = await wRes.json();
      res.json(wData);
    } catch (e: any) {
      console.error("Wiki summary error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Wikipedia Nearby POIs
  app.get("/api/wiki/pois", async (req, res) => {
    try {
      const { lat, lon, radius = "2000", limit = "50" } = req.query;
      const url = `https://it.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${radius}&ggslimit=${limit}&prop=coordinates|pageimages|description&piprop=thumbnail&pithumbsize=600&format=json`;
      const wRes = await fetch(url, { headers: { "User-Agent": "ItaliaInTascaGuide/1.0" } });
      const text = await wRes.text();
      try {
        const wData = JSON.parse(text);
        res.json(wData);
      } catch (e) {
        console.error("Wikipedia API returned invalid JSON:", text.substring(0, 500));
        res.status(502).json({ error: "Invalid JSON from Wikipedia" });
      }
    } catch (e: any) {
      console.error("Wiki POIs route error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Wikidata Search
  app.get("/api/wikidata/search", async (req, res) => {
    try {
      const { search } = req.query;
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(search as string)}&language=it&format=json&origin=*`;
      const wRes = await fetch(url);
      const wData = await wRes.json();
      res.json(wData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Wikidata Entities
  app.get("/api/wikidata/entities", async (req, res) => {
    try {
      const { ids } = req.query;
      const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&languages=it&format=json&origin=*`;
      const wRes = await fetch(url);
      const wData = await wRes.json();
      res.json(wData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Raggio terrestre in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distanza in km
  }

  async function fetchOsmTags(osmType: string, osmId: string): Promise<any> {
    const overpassUrls = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ];
    
    const query = `[out:json];${osmType}(${osmId});out;`;
    for (const baseUrl of overpassUrls) {
      try {
        const response = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`
        });
        if (response.ok) {
          const data = await response.json();
          const element = data.elements?.[0];
          return element || null;
        }
      } catch (err) {
        console.warn(`OSM tag fetch failed on ${baseUrl}:`, err);
      }
    }
    return null;
  }

  // ── GET /api/poi/details — legge i dati arricchiti dal DB (generati dal trigger) ──
  app.get("/api/poi/details", async (req, res) => {
    try {
      const { id, lat: qLat, lon: qLon } = req.query as { id?: string; lat?: string; lon?: string };
      if (!id) return res.status(400).json({ error: "Missing id" });

      const selectFields = "id,name,category,lat,lon,description_ai,description_short,description_long,full_description,audio_script,practical_info,technical_data,image_url,photo_url,is_gem,status,alert_radius,geofence_radius";
      const reqHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" };
      let foundData: any[] | null = null;

      // 1. Cerca per id esatto
      const r1 = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(id)}&select=${selectFields}&limit=1`, { headers: reqHeaders }).catch(() => null);
      if (r1?.data?.length > 0) foundData = r1.data;

      // 2. Fallback: rimuovi prefisso osm-/fsq_/geo_
      if (!foundData) {
        const cleanId = String(id).replace(/^(osm-|fsq_|geo_)/, "");
        if (cleanId !== id) {
          const r2 = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(cleanId)}&select=${selectFields}&limit=1`, { headers: reqHeaders }).catch(() => null);
          if (r2?.data?.length > 0) foundData = r2.data;
        }
      }

      // 3. Fallback: osm_id match
      if (!foundData) {
        const r3 = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?osm_id=eq.${encodeURIComponent(id)}&select=${selectFields}&limit=1`, { headers: reqHeaders }).catch(() => null);
        if (r3?.data?.length > 0) foundData = r3.data;
      }

      // 4. Fallback: ricerca per coordinate ±0.001° (~100m)
      if (!foundData) {
        const latN = parseFloat(qLat || "");
        const lonN = parseFloat(qLon || "");
        if (!isNaN(latN) && !isNaN(lonN)) {
          const d = 0.001;
          const r4 = await axios.get(
            `${supabaseUrl}/rest/v1/shared_pois?lat=gte.${(latN - d).toFixed(5)}&lat=lte.${(latN + d).toFixed(5)}&lon=gte.${(lonN - d).toFixed(5)}&lon=lte.${(lonN + d).toFixed(5)}&select=${selectFields}&order=lat.asc&limit=1`,
            { headers: reqHeaders }
          ).catch(() => null);
          if (r4?.data?.length > 0) foundData = r4.data;
        }
      }

      const data = foundData;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "POI not found" });
      }

      const poi = data[0];
      // Prova a parsare technical_data se è stringa JSON
      let techData = poi.technical_data;
      if (typeof techData === "string") {
        try { techData = JSON.parse(techData); } catch {}
      }

      // Fix per description_ai salvata come JSON
      if (typeof poi.description_ai === 'string' && poi.description_ai.startsWith('{')) {
        try {
          const parsed = JSON.parse(poi.description_ai);
          poi.description_short = poi.description_short || parsed.descrizione_breve_it;
          poi.description_long = poi.description_long || parsed.descrizione_dettagliata_it;
          poi.audio_script = poi.audio_script || parsed.testo_nicky_it || parsed.testo_dante_it || parsed.testo_audio_it;
          poi.description_ai = parsed.descrizione_dettagliata_it || parsed.descrizione_breve_it;
        } catch (e) {}
      }

      return res.json({
        ...poi,
        technical_data: techData,
      });
    } catch (e: any) {
      console.error("[/api/poi/details] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // Verifica che il Bearer token appartenga a un utente con is_admin=true nel DB.
  // Ritorna l'id dell'admin, oppure null. Usato dal middleware requireAdmin.
  const verifyAdminToken = async (req: any): Promise<string | null> => {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    try {
      const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseServiceKey, Authorization: authHeader }
      });
      const uid = userRes.data?.id;
      if (!uid) return null;
      const profileRes = await axios.get(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${uid}&select=is_admin`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      });
      return profileRes.data?.[0]?.is_admin === true ? uid : null;
    } catch {
      return null;
    }
  };

  const requireAdmin = async (req: any, res: any, next: any) => {
    const adminId = await verifyAdminToken(req);
    if (!adminId) return res.status(403).json({ error: "Admin authorization required" });
    req.adminId = adminId;
    next();
  };

  // --- COUPON: riscatto voucher CREDITI (B2B/hotel) ---
  // I voucher regalano crediti (earned_credits). Il client non può scrivere
  // quella colonna (policy di sicurezza), quindi validazione, consumo del
  // coupon e accredito avvengono qui con la service key.
  app.post("/api/coupon/redeem", rateLimiter, async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Accedi per riscattare un voucher.' });
      const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseServiceKey, Authorization: authHeader }
      }).catch(() => null);
      const userId = userRes?.data?.id;
      if (!userId) return res.status(401).json({ error: 'Sessione non valida.' });

      const code = String(req.body?.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'Codice mancante.' });
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };

      const { data: coupons } = await axios.get(
        `${supabaseUrl}/rest/v1/coupons?code=eq.${encodeURIComponent(code)}&select=*`,
        { headers: svcHeaders }
      );
      const coupon = coupons?.[0];
      if (!coupon) return res.status(404).json({ error: 'Codice voucher non valido.' });
      if (!coupon.is_active) return res.status(410).json({ error: 'Questo voucher è stato disattivato.' });
      if ((coupon.uses_count || 0) >= (coupon.max_uses || 1)) {
        return res.status(410).json({ error: 'Questo voucher è esaurito.' });
      }

      // Consumo con guardia ottimistica sul contatore: se un riscatto
      // concorrente ha già incrementato, la PATCH non matcha alcuna riga.
      const patchRes = await axios.patch(
        `${supabaseUrl}/rest/v1/coupons?id=eq.${coupon.id}&uses_count=eq.${coupon.uses_count || 0}`,
        { uses_count: (coupon.uses_count || 0) + 1 },
        { headers: { ...svcHeaders, Prefer: 'return=representation' } }
      );
      if (!Array.isArray(patchRes.data) || patchRes.data.length === 0) {
        return res.status(409).json({ error: 'Voucher appena esaurito, riprova.' });
      }

      // Voucher = CREDITI (i pacchetti B2B sono solo pacchetti di crediti)
      const credits = coupon.reward_credits || (coupon.duration_days * 10) || 500;
      const { data: prof } = await axios.get(
        `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=earned_credits`,
        { headers: svcHeaders }
      );
      await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`, {
        earned_credits: (prof?.[0]?.earned_credits || 0) + credits
      }, { headers: svcHeaders });

      res.json({ success: true, credits, structureName: coupon.structure_name || null });
    } catch (e: any) {
      console.error('[Coupon Redeem] Errore:', e.message);
      res.status(500).json({ error: 'Riscatto non riuscito, riprova.' });
    }
  });

  // --- COUPON: elenco voucher di UNA struttura (pannello B2B) ---
  // Sostituisce la SELECT client diretta su `coupons` (leggibile da CHIUNQUE
  // con la vecchia policy RLS `using(true)` = furto crediti). Richiede un
  // Bearer utente valido (NON serve admin) e ritorna SOLO i coupon della
  // struttura richiesta, letti server-side con la service key.
  app.post("/api/coupon/list-for-structure", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'Autenticazione richiesta.' });

      const structureName = String(req.body?.structureName || '').trim();
      if (!structureName) return res.status(400).json({ error: 'Nome struttura mancante.' });
      // SICUREZZA: prima usava `ilike` con l'asterisco non escapato →
      // {"structureName":"*"} scaricava TUTTI i coupon di tutte le strutture.
      // Ora match ESATTO (eq) e rifiuto dei wildcard PostgREST: serve il nome
      // esatto della propria struttura, niente dump di massa.
      if (/[*%,]/.test(structureName)) {
        return res.status(400).json({ error: 'Nome struttura non valido.' });
      }

      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };
      const { data } = await axios.get(
        `${supabaseUrl}/rest/v1/coupons?structure_name=eq.${encodeURIComponent(structureName)}&order=created_at.desc&select=*`,
        { headers: svcHeaders }
      );
      res.json({ coupons: Array.isArray(data) ? data : [] });
    } catch (e: any) {
      console.error('[Coupon List] Errore:', e.message);
      res.status(500).json({ error: 'Ricerca non riuscita, riprova.' });
    }
  });

  // --- GAMIFICATION: riscatto premi (livelli/sfide) ---
  // Il client NON può scrivere earned_credits (bloccato dalle policy di
  // security hardening): la validazione e l'accredito avvengono qui con la
  // service key. Idempotente su user_rewards_claimed.
  // Premio quiz trivia: prima gamification.ts scriveva earned_credits/xp_points
  // DIRETTAMENTE dal browser con la anon key. Con il trigger anti-escalation su
  // user_profiles quella scrittura viene bloccata (o, senza trigger, chiunque
  // può farsi crediti da console). L'accredito passa ora dal server (service
  // key). Cap difensivo sul numero di risposte per chiamata.
  app.post("/api/gamification/trivia-reward", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });
      const correct = Math.max(0, Math.min(20, Math.floor(Number(req.body?.correctAnswers) || 0)));
      if (correct <= 0) return res.json({ success: true, credits: 0, xp: 0 });

      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };
      const { data: prof } = await axios.get(
        `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=xp_points,earned_credits`,
        { headers: svcHeaders }
      );
      const p = prof?.[0] || {};
      const newXp = (p.xp_points || 0) + correct * 20;
      const newEarned = (p.earned_credits || 0) + correct; // 1 credito per risposta
      await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`,
        { xp_points: newXp, earned_credits: newEarned }, { headers: svcHeaders });
      res.json({ success: true, credits: correct, xp: correct * 20 });
    } catch (e: any) {
      console.error('[trivia-reward] Errore:', e?.message);
      res.status(500).json({ error: 'reward_failed' });
    }
  });

  // Rimborso crediti server-mediato. La RPC self-service `refund_credits` va
  // revocata dal client (chiunque poteva chiamarla e farsi rimborsare senza
  // fallimento reale): i rimborsi legittimi dei flussi che pagano lato client
  // (PlanScreen, PoiDetail, bundle) passano ora da qui, con service key e cap
  // sul singolo importo. NB: la verifica del fallimento reale resta un TODO
  // (pending_refund) — questa rotta chiude solo l'accesso diretto alla RPC.
  app.post("/api/credits/refund", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });
      const amount = Math.floor(Number(req.body?.amount) || 0);
      if (amount <= 0 || amount > 2000) return res.status(400).json({ error: 'invalid_amount' });
      const ok = await refundCreditsServer(userId, amount);
      if (!ok) return res.status(500).json({ error: 'refund_failed' });
      res.json({ success: true, amount });
    } catch (e: any) {
      console.error('[credits/refund] Errore:', e?.message);
      res.status(500).json({ error: 'refund_failed' });
    }
  });

  // Consumo crediti server-side. Il trigger anti-escalation blocca la scrittura
  // client dei crediti, quindi il vecchio fallback client-side di consumeCredits
  // non funziona più: senza questa rotta nessuno potrebbe spendere crediti.
  // RPC consume_credits (atomica, earned-first) preferita; fallback diretto con
  // service key se la RPC non è applicata sul DB.
  app.post("/api/credits/consume", rateLimiter, async (req, res) => {
    try {
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: 'login_required' });
      const amount = Math.floor(Number(req.body?.amount) || 0);
      const outcome = await consumeCreditsServer(userId, amount);
      if (outcome === 'insufficient') return res.status(402).json({ error: 'insufficient_credits' });
      if (outcome === 'error') return res.status(500).json({ error: 'consume_failed' });
      res.json({ success: true });
    } catch (e: any) {
      console.error('[credits/consume] Errore:', e?.message);
      res.status(500).json({ error: 'consume_failed' });
    }
  });

  app.post("/api/gamification/claim", rateLimiter, async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Login richiesto' });
      const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseServiceKey, Authorization: authHeader }
      }).catch(() => null);
      const userId = userRes?.data?.id;
      if (!userId) return res.status(401).json({ error: 'Sessione non valida' });

      const { type, id } = req.body || {};
      if ((type !== 'level' && type !== 'challenge') || !id) {
        return res.status(400).json({ error: 'Parametri non validi' });
      }
      const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };

      // Già riscattato? (idempotenza)
      const { data: claimed } = await axios.get(
        `${supabaseUrl}/rest/v1/user_rewards_claimed?user_id=eq.${userId}&reward_source_type=eq.${type}&reward_source_id=eq.${encodeURIComponent(id)}&select=id`,
        { headers: svcHeaders }
      );
      if (claimed?.length > 0) return res.json({ success: true, credits: 0, alreadyClaimed: true });

      // Premio e requisiti dalla fonte di verità
      const table = type === 'level' ? 'gamification_levels' : 'gamification_challenges';
      const { data: rows } = await axios.get(
        `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`,
        { headers: svcHeaders }
      );
      const reward = rows?.[0];
      if (!reward) return res.status(404).json({ error: 'Premio inesistente' });

      // Validazione requisito
      if (type === 'level') {
        const { data: prof } = await axios.get(
          `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=xp_points`,
          { headers: svcHeaders }
        );
        if ((prof?.[0]?.xp_points || 0) < (reward.xp_required || 0)) {
          return res.status(403).json({ error: 'Requisito XP non raggiunto' });
        }
      } else if (reward.category_trigger === 'vision') {
        // Sfide WIP Community: il progresso è il numero di schede My Vision
        // create (vision_cards), non gli ascolti.
        const cntRes = await axios.get(
          `${supabaseUrl}/rest/v1/vision_cards?user_id=eq.${userId}&select=id`,
          { headers: { ...svcHeaders, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
        );
        const total = parseInt(String(cntRes.headers['content-range'] || '0/0').split('/')[1] || '0', 10);
        if (total < (reward.threshold || 0)) {
          return res.status(403).json({ error: 'Missione non ancora completata' });
        }
      } else {
        const catFilter = reward.category_trigger && reward.category_trigger !== 'all'
          ? `&category=eq.${encodeURIComponent(reward.category_trigger)}` : '';
        const cntRes = await axios.get(
          `${supabaseUrl}/rest/v1/user_listening_history?user_id=eq.${userId}${catFilter}&select=id`,
          { headers: { ...svcHeaders, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
        );
        const total = parseInt(String(cntRes.headers['content-range'] || '0/0').split('/')[1] || '0', 10);
        if (total < (reward.threshold || 0)) {
          return res.status(403).json({ error: 'Missione non ancora completata' });
        }
      }

      // Marca il riscatto PRIMA dell'accredito (doppio submit → un solo premio)
      await axios.post(`${supabaseUrl}/rest/v1/user_rewards_claimed`, {
        user_id: userId, reward_source_type: type, reward_source_id: id
      }, { headers: svcHeaders });

      const credits = reward.reward_credits || 0;
      if (credits > 0) {
        const { data: prof } = await axios.get(
          `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=earned_credits`,
          { headers: svcHeaders }
        );
        await axios.patch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`, {
          earned_credits: (prof?.[0]?.earned_credits || 0) + credits
        }, { headers: svcHeaders });
      }

      res.json({ success: true, credits });
    } catch (e: any) {
      console.error('[Gamification Claim] Errore:', e.message);
      res.status(500).json({ error: 'Riscatto non riuscito, riprova.' });
    }
  });

  // --- ADMIN DIAGNOSTICS ---
  // Stato di configurazione dei provider per il tab "Salute Sistema".
  // Riporta solo presenza/assenza delle chiavi (mai i valori): prima il tab
  // chiamava questo endpoint che NON ESISTEVA (14 check sempre falliti) e due
  // check usavano chiavi VITE_ direttamente dal browser.
  app.get("/api/admin/diagnostics", rateLimiter, requireAdmin, async (req, res) => {
    const has = (...names: string[]) => names.some(n => !!process.env[n]);
    const st = (ok: boolean) => ({ status: ok ? 'passed' : 'warning' });
    res.json({
      groq: st(has('GROQ_API_KEY', 'VITE_GROQ_API_KEY')),
      together: st(has('TOGETHER_API_KEY', 'VITE_TOGETHER_API_KEY')),
      deepseek: st(has('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY')),
      gemini: st(has('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY')),
      elevenlabs: st(has('ELEVENLABS_API_KEY', 'VITE_ELEVENLABS_API_KEY')),
      foursquare: st(has('FOURSQUARE_API_KEY', 'VITE_FOURSQUARE_API_KEY')),
      tripadvisor: st(has('TRIPADVISOR_API_KEY', 'VITE_TRIPADVISOR_API_KEY')),
      ticketmaster: st(has('TICKETMASTER_API_KEY', 'VITE_TICKETMASTER_API_KEY')),
      viator: st(has('VIATOR_API_KEY', 'VITE_VIATOR_API_KEY')),
      getyourguide: st(has('GYG_API_KEY', 'VITE_GYG_API_KEY')),
      tiqets: st(has('TIQETS_API_KEY', 'VITE_TIQETS_API_KEY')),
      google_places: st(has('VITE_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_API_KEY')),
      azure_tts: st(has('AZURE_SPEECH_KEY')),
      stripe: st(has('STRIPE_SECRET_KEY')),
      // Servizi senza chiave: la logica lato server è sempre disponibile
      virgilio: { status: 'passed' },
      overpass: { status: 'passed' },
      wikipedia: { status: 'passed' }
    });
  });

  // --- ADMIN HEALTH CHECKS: ping REALI ai servizi esterni ---
  // A differenza di /api/admin/diagnostics (solo presenza chiavi), qui si
  // eseguono chiamate vere in parallelo, ciascuna con timeout di 5s.
  // Risposta: { checks: [{ name, ok, ms, note }] } per il tab Diagnostica.
  app.get("/api/admin/health-checks", rateLimiter, requireAdmin, async (req, res) => {
    const TIMEOUT_MS = 5000;
    const runCheck = async (name: string, fn: () => Promise<string | void>): Promise<{ name: string; ok: boolean; ms: number; note: string }> => {
      const t0 = Date.now();
      try {
        const note = await Promise.race([
          fn(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout dopo 5s')), TIMEOUT_MS))
        ]);
        return { name, ok: true, ms: Date.now() - t0, note: (note as string) || 'OK' };
      } catch (e: any) {
        const note = e?.response?.status ? `HTTP ${e.response.status}` : (e?.message || 'errore sconosciuto');
        return { name, ok: false, ms: Date.now() - t0, note };
      }
    };

    const mapboxToken = process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;
    const geoapifyKey = process.env.GEOAPIFY_API_KEY || process.env.VITE_GEOAPIFY_API_KEY;
    const azureKey = process.env.AZURE_SPEECH_KEY;
    const azureRegion = process.env.AZURE_SPEECH_REGION || 'westeurope';

    const checks = await Promise.all([
      runCheck('Supabase (select di prova)', async () => {
        const r = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?select=id&limit=1`, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }, timeout: TIMEOUT_MS
        });
        return `risposta ${Array.isArray(r.data) ? 'valida' : 'anomala'}`;
      }),
      runCheck('Mapbox (geocoding di prova)', async () => {
        if (!mapboxToken) throw new Error('VITE_MAPBOX_TOKEN mancante');
        await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/Roma.json?limit=1&access_token=${mapboxToken}`, { timeout: TIMEOUT_MS });
      }),
      runCheck('Geoapify (routing di prova)', async () => {
        if (!geoapifyKey) throw new Error('GEOAPIFY_API_KEY mancante');
        await axios.get(`https://api.geoapify.com/v1/routing?waypoints=41.8902,12.4922|41.9028,12.4964&mode=walk&apiKey=${geoapifyKey}`, { timeout: TIMEOUT_MS });
      }),
      runCheck('Nominatim (OpenStreetMap)', async () => {
        await axios.get('https://nominatim.openstreetmap.org/search?q=Roma&format=json&limit=1', {
          headers: { 'User-Agent': 'WorldInPocket/1.0' }, timeout: TIMEOUT_MS
        });
      }),
      runCheck('OSRM (router.project-osrm.org)', async () => {
        await axios.get('https://router.project-osrm.org/route/v1/driving/12.4922,41.8902;12.4964,41.9028?overview=false', { timeout: TIMEOUT_MS });
      }),
      runCheck('Azure TTS (elenco voci)', async () => {
        if (!azureKey) throw new Error('AZURE_SPEECH_KEY mancante');
        const r = await axios.get(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
          headers: { 'Ocp-Apim-Subscription-Key': azureKey }, timeout: TIMEOUT_MS
        });
        return `${Array.isArray(r.data) ? r.data.length : 0} voci, regione ${azureRegion}`;
      }),
      runCheck('RevenueCat (webhook secret)', async () => {
        if (!process.env.REVENUECAT_WEBHOOK_SECRET) throw new Error('REVENUECAT_WEBHOOK_SECRET mancante: il webhook rifiuta gli acquisti Android');
        return 'secret configurato';
      })
    ]);

    res.json({ checks });
  });

  // --- GET /api/poi/batch-enrich - Manual or Cron endpoint ---
  app.get("/api/poi/batch-enrich", async (req, res) => {
    // Il header x-vercel-cron è spoofabile da chiunque: l'unica auth valida è
    // il CRON_SECRET (che Vercel invia come Bearer per i cron configurati)
    // oppure un token di un utente admin (per il bottone del pannello).
    const authHeader = String(req.headers.authorization || '');
    const hasCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
    if (!hasCronSecret) {
      const adminId = await verifyAdminToken(req);
      if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      
      if (!ai) return res.status(500).json({ error: "Gemini not configured" });

      // Fetch up to 50 unenriched POIs SOLO per le categorie culturali.
      // status=in.(auto,verified): NON toccare draft/needs_revision/rejected —
      // prima il cron li leggeva e li scriveva 'verified', promuovendo le
      // bozze (incluse le allucinazioni Vision) e annullando il denylist di
      // nearby_pois.
      const { data } = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?description_short=is.null&category=in.(monumenti,chiese,musei,gemme)&status=in.(auto,verified)&limit=50&order=created_at.asc`, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`
        }
      });
      
      const pois = data;

      if (!pois || pois.length === 0) {
        return res.json({ success: true, message: "Nessun POI culturale da arricchire." });
      }

      let enrichedCount = 0;
      const errors = [];

      // Process sequentially to respect Gemini API limits
      for (const poi of pois) {
        try {
          const prompt = `Sei un curatore turistico e storico d'eccellenza. Il tuo compito è arricchire il seguente luogo culturale.
Nome: "${poi.name}"
Categoria: "${poi.category}"
Coordinate: Lat: ${poi.lat}, Lon: ${poi.lon}

Regola fondamentale: basa la tua descrizione SOLO su fatti storici assolutamente reali e accertati. NON INVENTARE. Evita frasi generiche o vuote (es. "questo posto è fantastico/cool"). Sii estremamente preciso e dettagliato.
Se il luogo sembra palesemente finto, generico o privo di alcun interesse turistico/culturale, imposta la variabile "error" a true nel JSON.

ISTRUZIONI PER L'AUDIOGUIDA ('audio_script'):
- Se valuti che il luogo sia di particolare interesse o raro, impostalo come GEMMA ('is_gem': true). L'audioguida deve durare almeno 45 secondi (circa 800-1000 caratteri), con testo approfondito, moderno e accattivante, pieno di riferimenti reali e storici (senza banalità).
- Se NON è una gemma ('is_gem': false), scrivi un'audioguida breve di circa 15/20 secondi (circa 250-350 caratteri), mantenendo dettagli reali e precisione storica.

Rispondi ESATTAMENTE E SOLO con un JSON valido con questa struttura (nessun carattere in più):
{
  "description_short": "Testo di 2 frasi riassuntive.",
  "description_long": "Descrizione accademica, immersiva e storicamente dettagliata (max 1000 char).",
  "audio_script": "Il copione finale dell'audioguida calcolato secondo le regole sopra indicate (corto o lungo a seconda se è gemma).",
  "is_gem": true,
  "error": false
}`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
          });

          const result = JSON.parse(response.text);
          
          if (result.error) {
             // Mark as error by setting description_short to avoid reprocessing
             await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi.id}`, {
               description_short: "N/A - Ignored",
               status: "rejected",
               enriched_at: new Date().toISOString()
             }, { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" } });
             continue;
          }

          // Update POI
          await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi.id}`, {
            description_short: result.description_short,
            description_long: result.description_long,
            description_ai: result.description_long,
            audio_script: result.audio_script,
            is_gem: !!result.is_gem,
            status: "verified",
            enriched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            enrichment_source: "gemini-cron"
          }, { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" } });
          
          enrichedCount++;
          // Small delay to prevent rate limiting
          await new Promise(r => setTimeout(r, 2000));
        } catch (poiErr: any) {
           errors.push({ id: poi.id, err: poiErr.message });
           await new Promise(r => setTimeout(r, 1000));
        }
      }

      res.json({ success: true, processed: pois.length, enriched: enrichedCount, errors });
    } catch (e: any) {
      console.error("[/api/poi/batch-enrich] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  
  
  // --- BATCH ENSURE POIS (From Itinerary) ---
  app.post("/api/poi/batch-ensure", rateLimiter, async (req, res) => {
    try {
      // Richiede almeno un utente autenticato (o il cron): scrive su
      // shared_pois con la service key, prima bastava passare il rateLimiter.
      const authHeader = String(req.headers.authorization || '');
      const hasCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
      if (!hasCronSecret) {
        const userId = await verifyUserToken(req);
        if (!userId) return res.status(401).json({ error: "Autenticazione richiesta" });
      }

      const { pois, lang = "it" } = req.body;
      if (!pois || !Array.isArray(pois)) {
        return res.status(400).json({ error: "Invalid POIs array" });
      }

      const results = [];
      const errors = [];

      for (const p of pois) {
        if (!p.name || !p.coordinate || !p.coordinate.lat || !p.coordinate.lng) continue;

        const targetLat = parseFloat(p.coordinate.lat);
        const targetLon = parseFloat(p.coordinate.lng);
        const name = p.titolo_tappa || p.name;
        
        // Precision ID
        const precisionId = `${targetLat.toFixed(4).replace('.', '_')}_${targetLon.toFixed(4).replace('.', '_')}`;

        // Check if exists
        try {
          const { data: existing } = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${precisionId}`, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
          });
          
          if (existing && existing.length > 0) {
            results.push({ id: precisionId, status: "exists" });
            continue;
          }
        } catch (e) {
          // ignore error and try to create
        }

        // Fetch wiki & photo
        let extract = "";
        let thumbnail = "";
        
        const wikiLangs = [lang, 'en', 'it'];
        for (const wikiLang of wikiLangs) {
          try {
            const wikiRes = await fetch(`https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${targetLat}|${targetLon}&gsradius=1000&gslimit=5&format=json&origin=*`);
            if (wikiRes.ok) {
              const wikiData = await wikiRes.json();
              const pages = wikiData.query?.geosearch || [];
              let bestPage = pages.find((page: any) => page.title.toLowerCase() === name.toLowerCase()) || pages[0];
              if (bestPage) {
                const summaryRes = await fetch(`https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestPage.title)}`);
                if (summaryRes.ok) {
                  const summary = await summaryRes.json();
                  extract = summary.extract || "";
                  thumbnail = summary.thumbnail?.source || summary.originalimage?.source || "";
                  if (extract) break;
                }
              }
            }
          } catch(e) {}
        }

        if (!thumbnail) {
          try {
            const wikiCommonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
            const cRes = await fetch(wikiCommonsUrl);
            if (cRes.ok) {
              const cData = await cRes.json();
              const fileName = cData.query?.search?.[0]?.title;
              if (fileName && fileName.startsWith("File:")) {
                thumbnail = `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(fileName.substring(5).replace(/ /g, "_"))}&width=800`;
              }
            }
          } catch(e) {}
        }

        // Foto reale o nessuna foto: mai un URL source.unsplash.com (dismesso)
        if (!thumbnail) {
           thumbnail = await findFallbackPhoto(name, "") || "";
        }

        // Groq Enrich
        let jsonResponse = { description_short: extract || "", description_long: "", audio_script: "", is_gem: false };
        try {
          const curatorPrompt = `Sei un curatore turistico d'eccellenza. Ricevi Nome e Coordinate (Lat: ${targetLat}, Lon: ${targetLon}).
Lingua: ${lang}.
Restituisci JSON con: 'description_short' (2 frasi), 'description_long' (min 1500 char), 'audio_script' (90 sec), 'is_gem' (boolean).
Nome: "${name}"
Wikipedia: "${extract || "Nessuna fonte trovata"}"`;
          
          const aiResponse = await callUniversalAi("groq", [{ role: "user", content: curatorPrompt }], { response_format: { type: "json_object" } }, `poi_batch_enrich | Target: ${name}`, supabaseUrl, supabaseServiceKey, groq);
          const parsed = parseSafeJSON(aiResponse.data || "{}");
          
          jsonResponse.description_short = parsed.description_short || extract;
          jsonResponse.description_long = parsed.description_long || extract;
          jsonResponse.audio_script = parsed.audio_script || "";
          jsonResponse.is_gem = !!parsed.is_gem;
        } catch (aiErr) {
          console.warn("[batch-ensure] AI Failed:", aiErr);
        }

        // Save to Supabase
        const category = p.tipo || p.category || "attrazione";
        try {
          const updatePayload: any = {
            id: precisionId,
            lat: targetLat,
            lon: targetLon,
            name,
            category,
            image_url: thumbnail,
            photo_url: thumbnail,
            status: 'verified',
            is_gem: !!jsonResponse.is_gem,
            description_short: jsonResponse.description_short,
            description_ai: jsonResponse.description_long || jsonResponse.description_short,
            description_long: jsonResponse.description_long,
            updated_at: new Date().toISOString()
          };

          await axios.post(`${supabaseUrl}/rest/v1/shared_pois`, updatePayload, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              Prefer: 'resolution=merge-duplicates'
            }
          });
          
          if (jsonResponse.audio_script) {
             const { upsertAudioguide } = await import('./src/services/poiRepository');
             await upsertAudioguide(precisionId, "it", "nicky", jsonResponse.audio_script);
             await upsertAudioguide(precisionId, "it", "dante", jsonResponse.audio_script);
          }
          
          results.push({ id: precisionId, status: "created" });
        } catch (dbErr: any) {
          console.warn("[batch-ensure] DB save failed:", dbErr.message);
          errors.push({ id: precisionId, error: dbErr.message });
          // Log to system_errors
          try {
            await axios.post(`${supabaseUrl}/rest/v1/system_errors`, {
              source: "batch-ensure",
              error_message: dbErr.message,
              details: JSON.stringify({ name, lat: targetLat, lon: targetLon })
            }, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
            });
          } catch (e) {}
        }
      }

      res.json({ success: true, results, errors });
    } catch (e: any) {
      console.error("[/api/poi/batch-ensure] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

app.post("/api/poi/enrich", rateLimiter, async (req, res) => {
    try {
      const { id, name, lat, lon, category, subCategory, wikidata: clientWikidata, wikipedia: clientWikipedia, lang = "it", fast = false, mode = "full", userId } = req.body;
      
      const targetLat = parseFloat(lat);
      const targetLon = parseFloat(lon);

      if (isNaN(targetLat) || isNaN(targetLon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      // Reject generic or unnamed parks and parkings
      if (isGenericUtilityName(name)) {
        return res.status(403).json({ error: true, message: "Parcheggi e parchi generici non sono ammessi alla curatela." });
      }

      // 1. Wikipedia Summary (Universal & Multilingual)
      let extract = "";
      let pageUrl = "";
      let thumbnail = "";
      let distanceKm = null;

      // Wikipedia: cerca in parallelo su tutte le lingue → prende la prima risposta valida
      const wikiLangs = [...new Set([lang, 'it', 'en'].filter(Boolean))];

      async function tryWikiLang(wikiLang: string): Promise<{extract: string; pageUrl: string; thumbnail: string; dist: number} | null> {
        try {
          const wikiRes = await fetch(
            `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${targetLat}|${targetLon}&gsradius=1000&gslimit=10&format=json&origin=*`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!wikiRes.ok) return null;
          const wikiData = await wikiRes.json();
          const pages = wikiData.query?.geosearch || [];
          let bestPage = pages.find((p: any) => p.title.toLowerCase() === name?.toLowerCase());
          if (!bestPage) bestPage = pages.find((p: any) =>
            name?.toLowerCase().includes(p.title.toLowerCase()) || p.title.toLowerCase().includes(name?.toLowerCase())
          );
          if (!bestPage) return null;

          const summaryRes = await fetch(
            `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestPage.title)}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!summaryRes.ok) return null;
          const summary = await summaryRes.json();
          const ex = summary.extract || "";
          if (ex.length < 50) return null;
          return {
            extract: ex,
            pageUrl: summary.content_urls?.mobile?.page || "",
            thumbnail: summary.thumbnail?.source || summary.originalimage?.source || "",
            dist: bestPage.dist,
          };
        } catch { return null; }
      }

      // Esegui in parallelo, prendi il primo risultato valido
      const wikiResults = await Promise.allSettled(wikiLangs.map(l => tryWikiLang(l)));
      for (const r of wikiResults) {
        if (r.status === "fulfilled" && r.value) {
          extract = r.value.extract;
          pageUrl = r.value.pageUrl;
          thumbnail = r.value.thumbnail;
          distanceKm = r.value.dist / 1000;
          break;
        }
      }


      // 2. Wikipedia Client Fallback (Improved)
      if (!extract && clientWikipedia) {
        const titleMatch = clientWikipedia.match(/wiki\/([^#?]+)/);
        if (titleMatch) {
          const wikiCode = clientWikipedia.match(/:\/\/([a-z]+)\.wikipedia/)?.[1] || "en";
          const summaryRes = await fetch(`https://${wikiCode}.wikipedia.org/api/rest_v1/page/summary/${titleMatch[1]}`);
          if (summaryRes.ok) {
            const summary = await summaryRes.json();
            extract = summary.extract || "";
            pageUrl = summary.content_urls?.mobile?.page || clientWikipedia;
            if (!thumbnail) thumbnail = summary.thumbnail?.source || summary.originalimage?.source || "";
          }
        }
      }

      // 3. Wikimedia Commons Photo + Wikivoyage in parallelo (se ancora non abbiamo thumbnail)
      if (!thumbnail || !extract) {
        const [commonsResult, wvResult] = await Promise.allSettled([
          // Commons
          (async () => {
            if (thumbnail) return null;
            const cRes = await fetch(
              `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name || "")}&format=json&origin=*`,
              { signal: AbortSignal.timeout(4000) }
            ).catch(() => null);
            if (!cRes?.ok) return null;
            const cData = await cRes.json();
            const fileName = cData.query?.search?.[0]?.title;
            if (fileName?.startsWith("File:")) {
              return `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(fileName.substring(5).replace(/ /g, "_"))}&width=800`;
            }
            return null;
          })(),
          // Wikivoyage
          (async () => {
            if (extract) return null;
            const wvRes = await fetch(
              `https://it.wikivoyage.org/w/api.php?action=query&list=geosearch&gscoord=${targetLat}|${targetLon}&gsradius=1000&gslimit=2&format=json&origin=*`,
              { signal: AbortSignal.timeout(4000) }
            ).catch(() => null);
            if (!wvRes?.ok) return null;
            const wvData = await wvRes.json();
            const pages = wvData.query?.geosearch || [];
            const best = pages[0];
            if (!best) return null;
            const sumRes = await fetch(
              `https://it.wikivoyage.org/api/rest_v1/page/summary/${encodeURIComponent(best.title)}`,
              { signal: AbortSignal.timeout(4000) }
            ).catch(() => null);
            if (!sumRes?.ok) return null;
            const s = await sumRes.json();
            return s.extract || null;
          })(),
        ]);

        if (commonsResult.status === "fulfilled" && commonsResult.value) thumbnail = commonsResult.value;
        if (!extract && wvResult.status === "fulfilled" && wvResult.value) extract = wvResult.value;
      }


      // Fallback foto finale: immagine REALE via API Unsplash, oppure niente.
      // (prima si scriveva un URL source.unsplash.com ormai dismesso, che
      // restava salvato come foto valida e bloccava ogni tentativo futuro)
      if (!thumbnail) {
        thumbnail = await findFallbackPhoto(name || "", "") || "";
      }

      let jsonResponse = { description_short: extract || "", description_long: "", is_gem: false, error: false };

      
      // AI Synthesis (Deep Mode)
      if (!fast) {
        try {
          let curatorPrompt = "";
          if (mode === "short") {
              curatorPrompt = `Sei un curatore turistico e storico d'eccellenza per World in Pocket. Ricevi Nome, Categoria ("${category}"), e Coordinate (Lat: ${targetLat}, Lon: ${targetLon}).
Basa la tua descrizione SOLO su fatti storici reali e accertati tratti dal web.
La lingua deve essere: ${lang}.

Restituisci un JSON valido con:
- 'description_short': Testo di 2 frasi riassuntive, coinvolgente e accattivante.
- 'is_gem': (true/false) in base all'importanza.

INFORMAZIONI SUL LUOGO:
Nome: "${name}"
Coordinate: ${targetLat}, ${targetLon}
Wikipedia: "${extract || "Nessuna fonte trovata"}"`;
          } else {
              curatorPrompt = `Sei un curatore turistico e storico d'eccellenza per World in Pocket. Ricevi Nome, Categoria ("${category}"), e Coordinate (Lat: ${targetLat}, Lon: ${targetLon}).
Basa la tua descrizione SOLO su fatti storici reali e accertati.
La lingua deve essere: ${lang}.

Restituisci un JSON valido con:
- 'description_short': Testo di 2 frasi riassuntive.
- 'description_long': Descrizione accademica, immersiva e STORICAMENTE SUPER DETTAGLIATA (minimo 1500 caratteri).
- 'audio_script': Il copione finale dell'audioguida emozionante.
- 'is_gem': (true/false) in base all'importanza.

INFORMAZIONI SUL LUOGO:
Nome: "${name}"
Coordinate: ${targetLat}, ${targetLon}
Wikipedia: "${extract || "Nessuna fonte trovata"}"`;
          }

          const aiResponse = await callUniversalAi("groq", [{ role: "user", content: curatorPrompt }], { response_format: { type: "json_object" } }, `poi_enrichment | Target: ${name}`, supabaseUrl, supabaseServiceKey, groq, userId);
          const parsed = parseSafeJSON(aiResponse.data || "{}");

          jsonResponse.description_short = parsed.description_short || extract;
          jsonResponse.description_long = parsed.description_long || extract;
          (jsonResponse as any).audio_script = parsed.audio_script;
          jsonResponse.is_gem = !!parsed.is_gem;
        } catch (aiErr) {
          console.warn("[Enrich] AI Failed, falling back.", aiErr);
        }
      }
      if (jsonResponse.error === true) {
        return res.status(403).json({ error: true, message: "Luogo rifiutato o finto." });
      }

      // 5. CACHE FIRST - Save to Database immediately
      const precisionId = id || `${targetLat.toFixed(4).replace('.', '_')}_${targetLon.toFixed(4).replace('.', '_')}`;
      if (!thumbnail) thumbnail = "";

      try {
        const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };

        // SCRITTURA SICURA. La rotta è pubblica (il client non manda token) e
        // scrive con la service key: prima accettava id/name/status dal body e
        // sovrascriveva QUALSIASI POI con status:'verified' → defacement di
        // massa del catalogo (e delle audioguide lette agli utenti). Ora un POI
        // esistente non viene mai sovrascritto nell'identità né promosso: al più
        // si riempiono i campi di contenuto ancora vuoti; i POI nuovi nascono
        // 'auto' (soggetti a moderazione), mai 'verified', mai is_gem.
        const existRes = await axios.get(
          `${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(precisionId)}&select=id,description_short,image_url`,
          { headers: svcHeaders }
        ).catch(() => null);
        const existing = existRes?.data?.[0];

        const content: any = { updated_at: new Date().toISOString() };
        if (jsonResponse.description_short) {
          content.description_short = jsonResponse.description_short;
          content.description_ai = jsonResponse.description_short;
        }
        if (jsonResponse.description_long) {
          content.description_long = jsonResponse.description_long;
          content.description_ai = jsonResponse.description_long;
        }
        if (thumbnail && !existing?.image_url) { content.image_url = thumbnail; content.photo_url = thumbnail; }

        let didWrite = false;
        if (existing) {
          if (!existing.description_short && (content.description_short || content.description_long)) {
            await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(precisionId)}`, content, { headers: svcHeaders });
            didWrite = true;
          } else if (content.image_url) {
            await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(precisionId)}`, { image_url: content.image_url, photo_url: content.photo_url }, { headers: svcHeaders });
          }
        } else {
          await axios.post(`${supabaseUrl}/rest/v1/shared_pois`, {
            id: precisionId, lat: targetLat, lon: targetLon, name, category,
            status: 'auto', is_gem: false, ...content
          }, { headers: { ...svcHeaders, Prefer: 'resolution=merge-duplicates' } });
          didWrite = true;
        }

        // Audio solo su contenuto nuovo: mai sovrascrivere l'audioguida di un
        // POI già arricchito.
        if (didWrite && (jsonResponse as any).audio_script) {
           const { upsertAudioguide } = await import('./src/services/poiRepository');
           await upsertAudioguide(precisionId, "it", "nicky", (jsonResponse as any).audio_script);
           await upsertAudioguide(precisionId, "it", "dante", (jsonResponse as any).audio_script);
        }

      } catch (dbErr) {
        console.warn("[/api/poi/enrich] Database save failed:", dbErr);
      }

      res.json({
        extract: jsonResponse.description_short,
        description_short: jsonResponse.description_short,
        description_long: jsonResponse.description_long,
        audio_script: (jsonResponse as any).audio_script,
        audio_script_extended: (jsonResponse as any).audio_script_extended,
        thumbnail,
        pageUrl,
        is_gem: !!jsonResponse.is_gem,
        source: fast ? "wikipedia/google" : "groq-curator",
        distanceKm: distanceKm !== null ? parseFloat(distanceKm.toFixed(3)) : null,
        address: undefined,
        tags: [category],
        rating: null,
        numReviews: 0,
        reviews: []
      });
    } catch (e) {
      console.error("[/api/poi/enrich] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/poi/enrich-stream", rateLimiter, async (req, res) => {
    try {
      const { id, name, lat, lon, category, subCategory, lang = "it", extract = "", userId } = req.body;
      const targetLat = parseFloat(lat);
      const targetLon = parseFloat(lon);

      if (isNaN(targetLat) || isNaN(targetLon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      const reqHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" };
      const idStr = String(id || "");
      const cleanId = idStr.replace(/^(osm-|fsq_|geo_)/, "");

      // ── STEP 0: SUPABASE-FIRST ────────────────────────────────────────
      // Se shared_pois ha già il contenuto completo, lo restituiamo subito
      // come singolo evento SSE (stesso formato {text} dei chunk LLM, così i
      // client esistenti lo parsano senza modifiche) senza toccare l'LLM.
      let dbPoiId: string | null = null;
      let existingImage: string | null = null;
      try {
        const selectFields = "id,description_short,description_long,description_ai,audio_script,is_gem,image_url,photo_url";
        for (const candidate of [idStr, cleanId]) {
          if (!candidate) continue;
          const r = await axios.get(
            `${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(candidate)}&select=${selectFields}&limit=1`,
            { headers: reqHeaders }
          ).catch(() => null);
          if (r?.data?.length > 0) { dbPoiId = r.data[0].id;
            const row = r.data[0];
            // Foto già presente: non la ricerchiamo di nuovo nel salvataggio.
            // Gli URL source.unsplash.com (servizio dismesso) contano come
            // assenti, così i POI marcati in passato si riparano da soli.
            const storedImg = row.image_url || row.photo_url || null;
            existingImage = storedImg && !String(storedImg).includes('source.unsplash.com') ? storedImg : null;
            const cachedLong = row.description_long || row.description_ai;
            if (cachedLong && String(cachedLong).length > 80) {
              console.log(`[enrich-stream] Cache HIT su shared_pois per ${candidate} — nessuna chiamata LLM`);
              res.setHeader("Content-Type", "text/event-stream");
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("Connection", "keep-alive");
              const payload = {
                description_short: row.description_short || String(cachedLong).substring(0, 200),
                description_long: cachedLong,
                audio_script: row.audio_script || null,
                is_gem: row.is_gem ?? false,
                image_url: existingImage,
                cached: true
              };
              res.write(`data: ${JSON.stringify({ text: JSON.stringify(payload) })}\n\n`);
              res.write(`data: [DONE]\n\n`);
              return res.end();
            }
            break;
          }
        }
      } catch (cacheErr: any) {
        console.warn("[enrich-stream] Lookup shared_pois fallito, procedo con LLM:", cacheErr?.message);
      }

      let roleInstruction = "";
      if (['locali', 'utilita', 'famiglie'].includes(category)) {
        roleInstruction = `Sei un assistente informativo locale di World in Pocket. Ricevi Nome, Categoria ("${category}") e Coordinate.
Regola fondamentale: usa i dati reali forniti da Wikipedia, Wikimedia, Wikivoyage e dai tuoi dati interni (simulando una ricerca Google aggiornata).
Restituisci IMMEDIATAMENTE un JSON valido con questa struttura:
{
  "description_short": "Sintesi di 2 frasi.",
  "description_long": "Descrizione ricca di curiosità e dettagli pratici (minimo 1000 caratteri).",
  "audio_script": "Copione coinvolgente per un'audioguida di 60 secondi.",
  "is_gem": false
}`;
      } else {
        roleInstruction = `Sei un curatore turistico e storico d'eccellenza per World in Pocket. Ricevi Nome, Categoria ("${category}") e Coordinate.
Regola fondamentale: basa la narrazione su fatti storici certi tratti da Wikipedia, Wikivoyage, Wikimedia e simulando una ricerca Google per aneddoti recenti.
Sii narrativo, colto e appassionante.
Restituisci IMMEDIATAMENTE un JSON valido con questa struttura:
{
  "description_short": "Sintesi di 2 frasi.",
  "description_long": "Descrizione accademica e STORICAMENTE SUPER DETTAGLIATA (minimo 1500 caratteri). Includi anno, stile, segreti e riferimenti artistici.",
  "audio_script": "Copione professionale ed emozionante per un'audioguida di 90 secondi.",
  "is_gem": true
}`;
      }

      const curatorPrompt = `${roleInstruction}

INFORMAZIONI SUL LUOGO DA CURARE:
Nome: "${name}"
Coordinate: Latitudine ${targetLat}, Longitudine ${targetLon}
Contesto Wikipedia/Background: "${extract || "Nessuna fonte trovata"}"

IMPORTANTE: Inizia subito con il simbolo '{' e scrivi SOLO il JSON. Non aggiungere commenti o introduzioni.`;

      const messages = [
          { role: "user", content: curatorPrompt }
      ];

      // Salvataggio server-side (service role): il client con anon key viene
      // bloccato dalle RLS, quindi il persist DEVE avvenire qui. Eseguito da
      // streamUniversalAi prima di [DONE] così Vercel non congela la function.
      const saveToSharedPois = async (fullText: string) => {
        let clean = fullText.replace(/^```json\s*/, "").replace(/```\s*$/, "");
        const first = clean.indexOf("{");
        const last = clean.lastIndexOf("}");
        if (first === -1 || last <= first) return;
        clean = clean.slice(first, last + 1);
        const parsed = JSON.parse(clean);
        if (!parsed.description_long && !parsed.description_short) return;

        const patch: any = {
          description_long: parsed.description_long || parsed.description_short,
          description_ai: parsed.description_long || parsed.description_short,
          description_short: parsed.description_short || String(parsed.description_long).substring(0, 200),
          audio_script: parsed.audio_script || null,
        };
        if (typeof parsed.is_gem === "boolean") patch.is_gem = parsed.is_gem;

        // FOTO: questa route generava solo testo. L'unica immagine arrivava da
        // una ricerca fatta nel browser, che poi tentava di salvarla con la
        // anon key — bloccata dalle RLS. Risultato: il pin restava senza foto
        // e ogni visita ripeteva la stessa ricerca a vuoto. Ora la cerca (e la
        // salva) il server, che ha i permessi giusti.
        if (!existingImage) {
          try {
            const wikiImgs = await fetchWikimediaImages(name);
            const photo = wikiImgs?.[0] || await findFallbackPhoto(name, "");
            if (photo) {
              patch.image_url = photo;
              patch.photo_url = photo;
            }
          } catch (photoErr: any) {
            console.warn('[enrich-stream] Ricerca foto fallita:', photoErr?.message);
          }
        }

        for (const candidate of [dbPoiId, idStr, cleanId]) {
          if (!candidate) continue;
          const patchRes = await axios.patch(
            `${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(candidate)}`,
            patch,
            { headers: { ...reqHeaders, Prefer: "return=representation" } }
          ).catch(() => null);
          if (patchRes?.data?.length > 0) {
            console.log(`✅ [enrich-stream] Arricchimento salvato in shared_pois (id=${candidate})`);
            return;
          }
        }

        // CROWDSOURCING: il POI viene da una fonte terza (OSM/Foursquare/
        // Google) e non esiste ancora in shared_pois → lo creiamo ORA con
        // tutto il JSON generato. Il prossimo visitatore lo troverà istantaneo
        // (cache-hit dello STEP 0) senza consumare chiamate AI.
        if (idStr && name && !isNaN(targetLat) && !isNaN(targetLon)) {
          try {
            await axios.post(`${supabaseUrl}/rest/v1/shared_pois`, {
              id: idStr,
              name,
              lat: targetLat,
              lon: targetLon,
              category: category || "monumenti",
              ...patch,
              status: "auto",
              alert_radius: 150,
              geofence_radius: 50
            }, { headers: { ...reqHeaders, Prefer: "resolution=merge-duplicates" } });
            console.log(`✅ [enrich-stream] Nuovo POI terze parti salvato in shared_pois (id=${idStr})`);
            return;
          } catch (insErr: any) {
            console.warn(`[enrich-stream] Insert nuovo POI fallito:`, insErr?.message);
          }
        }
        console.warn(`[enrich-stream] Nessuna riga shared_pois aggiornata per id=${idStr}`);
      };

      // Groq come motore primario (velocità), DeepSeek come fallback
      await streamUniversalAi("groq", messages, { response_format: { type: "json_object" } }, res, groq, `poi_enrichment | Target: ${name}`, userId, saveToSharedPois);

    } catch (e: any) {
      console.error("[/api/poi/enrich-stream] Error:", e.message);
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  });

  // --- ADMIN QUALITY REVIEW QUEUE ---
  app.get("/api/admin/review-queue", rateLimiter, requireAdmin, async (req, res) => {
    try {
      console.log("[Admin API] Fetching POIs flagged for manual review...");
      const resData = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?flag_review=eq.true&select=*`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      });
      res.json(resData.data || []);
    } catch (e: any) {
      console.error("[Admin API] Failed to fetch review queue:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // --- ADMIN LOCK/UNLOCK POI ---
  app.post("/api/admin/lock-poi", rateLimiter, requireAdmin, async (req, res) => {
    try {
      const { poi_id, is_locked } = req.body;
      if (!poi_id || is_locked === undefined) {
        return res.status(400).json({ error: "Missing required fields: poi_id, is_locked" });
      }

      console.log(`[Admin API] Setting is_locked = ${is_locked} for POI: "${poi_id}"`);
      await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${poi_id}`, { is_locked }, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`
        }
      });
      res.json({ success: true, message: `POI ${poi_id} lock state successfully updated to ${is_locked}` });
    } catch (e: any) {
      console.error("[Admin API] Failed to toggle POI lock:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Strict POI Cache validation and upsert endpoint
  const APPROVED_CATEGORIES = new Set([
    'gemme',
    'monumenti',
    'chiese',
    'musei',
    'panorami',
    'locali',
    'utilita',
    'famiglie',
    'eventi'
  ]);

  const APPROVED_SUBCATEGORIES = new Set([
    'monumenti',
    'castelli',
    'archeo',
    'chiese',
    'panorami',
    'cave',
    'ristoranti',
    'bar',
    'hotel',
    'ricarica',
    'farmacie',
    'giochi',
    // Client-side subcategories
    'pizzeria',
    'gelateria',
    'sushi',
    'pesce',
    'carne',
    'vegetariano',
    'glutenfree',
    'ristorante',
    'taxi',
    'stazione_ferroviaria',
    'casello_autostradale',
    'ospedale',
    'farmacia',
    'metropolitana',
    'polizia',
    'parco_giochi',
    'parco_divertimenti',
    'acquario',
    'zoo'
  ]);

  app.post("/api/cache/upsert", rateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const { name, category, subCategory, poi_id, guide_mode } = payload;

      if (!poi_id || !guide_mode) {
        return res.status(400).json({ error: "Missing identity tags (poi_id, guide_mode)" });
      }

      // Perform strict validation
      const nameStr = name || "";
      const catStr = category || "";
      const subCatStr = subCategory || "";

      // 1. Strict null/empty check
      if (!nameStr.trim()) {
        console.warn(`[Validation Block] POI registration rejected: Empty name.`);
        return res.status(400).json({ error: "Nome del POI vuoto o non valido" });
      }
      if (!catStr.trim()) {
        console.warn(`[Validation Block] POI '${nameStr}' rejected: Empty category.`);
        return res.status(400).json({ error: "Categoria principale mancante o vuota" });
      }

      const catLower = catStr.trim().toLowerCase();
      const subCatLower = subCatStr.trim().toLowerCase();

      // 2. Category tree validation
      if (!APPROVED_CATEGORIES.has(catLower)) {
        console.warn(`[Validation Block] POI '${nameStr}' rejected: Category '${catLower}' is not in approved list.`);
        return res.status(400).json({ error: `Categoria principale '${catLower}' non approvata nell'albero delle categorie.` });
      }
      if (subCatLower && !APPROVED_SUBCATEGORIES.has(subCatLower)) {
        console.warn(`[Validation Block] POI '${nameStr}' rejected: Sub-category '${subCatLower}' is not in approved list.`);
        return res.status(400).json({ error: `Sotto-categoria '${subCatLower}' non approvata nell'albero delle categorie.` });
      }

      // 3. Omonymy and mis-categorization protection
      const nameLower = nameStr.toLowerCase();
      if (catLower === 'monumenti') {
        if (
          nameLower.includes("parking") || 
          nameLower.includes("parcheggi") || 
          nameLower.includes("pizzeria") || 
          nameLower.includes("restaurant") || 
          nameLower.includes("ristorante") || 
          nameLower.includes("trattoria") || 
          nameLower.includes("bar ") || 
          nameLower.includes("caffè")
        ) {
          console.warn(`[Validation Block] POI '${nameStr}' rejected: Incoherent mapping as 'monumenti'.`);
          return res.status(400).json({ error: `Incoerenza di categorizzazione: il luogo commerciale/servizio '${nameStr}' non può essere salvato come 'monumenti'.` });
        }
      }

      // Upsert into Supabase using existing direct REST helper pattern
      await axios.post(`${supabaseUrl}/rest/v1/shared_poi_audio_cache`, payload, {
         headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            Prefer: 'resolution=merge-duplicates'
         }
      });

      console.log(`[Validation Approved] POI '${nameStr}' successfully validated & saved in category '${catLower}'.`);
      res.json({ status: "success", message: "POI salvato e validato correttamente" });
    } catch (e: any) {
      console.error("Strict cache upsert endpoint error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Virgilio
  app.get("/api/virgilio", async (req, res) => {
    try {
      const { city } = req.query;
      if (!city) return res.status(400).json({ error: "City required" });
      const virgilioUrl = `https://www.virgilio.it/italia/${encodeURIComponent(String(city).toLowerCase().replace(/ /g, "-"))}/eventi/`;
      const vRes = await fetch(virgilioUrl, {
         headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
         }
      });
      if (!vRes.ok) throw new Error(`Virgilio returned status ${vRes.status}`);
      const text = await vRes.text();
      res.send(text);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Dice.fm search (We just return a dummy that the client redirects to, or a basic search)
  app.get("/api/dice", async (req, res) => {
    try {
      const { city } = req.query;
      if (!city) return res.status(400).json({ error: "City required" });
      // Dice is highly JS rendered, let's just create a generic link output or attempt a basic fetch
      const url = `https://dice.fm/browse/${encodeURIComponent(String(city).toLowerCase())}`;
      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Vivaticket
  app.get("/api/vivaticket", async (req, res) => {
    try {
      const { city } = req.query;
      if (!city) return res.status(400).json({ error: "City required" });
      const vivaUrl = `https://www.vivaticket.com/it/ricerca?q=${encodeURIComponent(String(city).toLowerCase())}`;
      res.json({ url: vivaUrl });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Italia.it
  app.get("/api/italia", async (req, res) => {
    try {
      const { city } = req.query;
      if (!city) return res.status(400).json({ error: "City required" });
      const itUrl = `https://www.italia.it/it/ricerca?q=${encodeURIComponent(String(city).toLowerCase())}`;
      res.json({ url: itUrl });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy for Overpass Cultural
  app.get("/api/overpass/cultural", async (req, res) => {
    try {
      const { lat, lon, radius = 2000 } = req.query;
      const nLat = parseFloat(String(lat));
      const nLon = parseFloat(String(lon));

      if (isNaN(nLat) || isNaN(nLon)) return res.status(400).json({ error: "Invalid coords" });

      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["historic"="monument"](around:${radius},${nLat},${nLon});
          node["historic"="castle"](around:${radius},${nLat},${nLon});
          node["tourism"="museum"](around:${radius},${nLat},${nLon});
          node["amenity"="place_of_worship"](around:${radius},${nLat},${nLon});
        );
        out body;
      `;

      const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
        "https://z.overpass-api.de/api/interpreter"
      ];

      let overpassData = null;
      for (const endpoint of endpoints) {
        try {
          const ores = await axios.post(endpoint, `data=${encodeURIComponent(overpassQuery)}`, { timeout: 15000 });
          overpassData = ores.data;
          break;
        } catch (e) {
          console.warn("Overpass endpoint failed:", endpoint);
        }
      }

      if (!overpassData || !overpassData.elements) {
        return res.json({ results: [] });
      }

      const results = overpassData.elements
        .filter((el: any) => el.tags && el.tags.name && el.lat && el.lon)
        .map((el: any) => {
          const tags = el.tags;
          let category = "monumenti";
          if (tags.amenity === "place_of_worship" || tags.religion) category = "chiese";
          else if (tags.tourism === "museum") category = "musei";

          return {
            id: `osm-${el.id}`,
            name: tags.name,
            lat: el.lat,
            lon: el.lon,
            category: category,
            subCategory: tags.historic || tags.amenity || tags.tourism,
            source: "overpass"
          };
        });

      // Save to Supabase
      if (results.length > 0 && typeof supabaseUrl !== 'undefined' && typeof supabaseServiceKey !== 'undefined') {
        const toUpsert = results.map((p: any) => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          category: p.category,
          sub_category: p.subCategory,
          source: p.source
        }));
        
        axios.post(`${supabaseUrl}/rest/v1/shared_pois`, toUpsert, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          }
        }).catch(err => console.error("Error saving Overpass POIs to Supabase:", err.message));
      }

      res.json({ results });
    } catch (e: any) {
      console.error("Overpass error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // --- SMART POI DISCOVERY (Overpass + Geoapify + Foursquare Fallback) ---
  app.post("/api/poi/discover", rateLimiter, async (req, res) => {
    try {
      const { lat, lon, radius = 800 } = req.body;
      const nLat = parseFloat(lat);
      const nLon = parseFloat(lon);

      if (isNaN(nLat) || isNaN(nLon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      let allPois: any[] = [];
      const seenNames = new Set<string>();

      const addPoi = (p: any) => {
        const cleanName = p.name.toLowerCase().trim();
        if (seenNames.has(cleanName)) return;

        // Simple deduplication by distance too
        const isDuplicate = allPois.some(ap =>
           isNameMatching(ap.name, p.name) &&
           getHaversineDistance(ap.lat, ap.lon, p.lat, p.lon) < 50
        );

        if (!isDuplicate) {
          allPois.push(p);
          seenNames.add(cleanName);
        }
      };

      // 1. Try Overpass (Primary for Monuments and Landmarks)
      try {
        const overpassQuery = `[out:json][timeout:25];
(
  nwr["tourism"~"^(museum|gallery|viewpoint|artwork|attraction|theme_park|zoo|winery)$"]["place"!~".*"]["boundary"!~".*"](around:${radius},${nLat},${nLon});
  nwr["historic"]["place"!~".*"]["boundary"!~".*"](around:${radius},${nLat},${nLon});
  nwr["amenity"="place_of_worship"](around:${radius},${nLat},${nLon});
  nwr["leisure"~"^(park|playground)$"](around:${radius},${nLat},${nLon});
  nwr["heritage"]["place"!~".*"]["boundary"!~".*"](around:${radius},${nLat},${nLon});
  nwr["building"~"^(church|cathedral|chapel|temple|castle|tower|monument)$"](around:${radius},${nLat},${nLon});
  nwr["place"="square"](around:${radius},${nLat},${nLon});
  nwr["highway"="pedestrian"]["area"="yes"](around:${radius},${nLat},${nLon});
);
out center tags;`;

        const endpoints = [
          'https://overpass-api.de/api/interpreter',
          'https://overpass.kumi.systems/api/interpreter'
        ];

        for (const endpoint of endpoints) {
          try {
            const oRes = await axios.post(endpoint, `data=${encodeURIComponent(overpassQuery)}`, {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'WorldInPocketDiscovery/1.2'
              },
              timeout: 15000
            });
            if (oRes.data?.elements) {
              oRes.data.elements.forEach((e: any) => {
                // Escludi esplicitamente località e confini amministrativi
                if (e.tags?.place || e.tags?.boundary) return;
                
                if (e.tags?.name) {
                  addPoi({
                    id: e.id,
                    name: e.tags.name,
                    lat: e.lat || e.center?.lat,
                    lon: e.lon || e.center?.lon,
                    tags: e.tags,
                    source: 'overpass'
                  });
                }
              });
              break;
            }
          } catch (e) {
            console.warn(`[Discovery] Overpass endpoint ${endpoint} failed`);
          }
        }
      } catch (e) {}

      // 2. Always fetch from Foursquare for Locali (Quality improvement)
      try {
        const fsqKey = process.env.FOURSQUARE_API_KEY || process.env.VITE_FOURSQUARE_API_KEY;
        if (fsqKey) {
          // Nuovo Places API (v3 dismesso): Food + Arts&Entertainment +
          // Historic Site + Monument/Landmark, id esadecimali
          const fsqCats = "4d4b7105d754a06374d81259,4d4b7104d754a06370d81259,4deefb944765f83613cdba6e,4bf58dd8d48988d12d941735";
          const fsqUrl = `https://places-api.foursquare.com/places/search?ll=${nLat},${nLon}&radius=${radius}&fsq_category_ids=${fsqCats}&limit=50`;
          const fsqRes = await axios.get(fsqUrl, {
            timeout: 6000,
            headers: { Authorization: `Bearer ${fsqKey}`, Accept: "application/json", "X-Places-Api-Version": "2025-06-17" }
          });
          const fsqPlaces = fsqRes.data?.results || [];
          fsqPlaces.forEach((p: any) => {
            const tags: any = { name: p.name };
            // Gli id numerici (13xxx) non esistono più: si classifica per nome categoria
            const catName = String(p.categories?.[0]?.name || "").toLowerCase();
            if (/restaurant|caf|bar|pizz|food|bakery|gelat|ice cream|pub|diner/.test(catName)) tags.amenity = 'restaurant';
            else if (/museum|gallery/.test(catName)) tags.tourism = 'museum';
            else if (/monument|landmark|historic|castle|ruin|palace|church/.test(catName)) tags.historic = 'yes';
            else tags.tourism = 'attraction';

            addPoi({
              id: "fsq_" + (p.fsq_place_id || p.fsq_id),
              name: p.name,
              lat: p.latitude ?? p.geocodes?.main?.latitude,
              lon: p.longitude ?? p.geocodes?.main?.longitude,
              tags: tags,
              source: 'foursquare'
            });
          });
        }
      } catch (fsqErr: any) {
        console.warn("[Discovery] Foursquare failed:", fsqErr.message);
      }

      // 3. Fallback to Geoapify if still few results
      if (allPois.length < 10) {
        console.log(`[Discovery] Low results (${allPois.length}). Trying Geoapify fallback...`);
        try {
          const apiKey = process.env.GEOAPIFY_API_KEY || '2960f4b9c51f49a888a7c81d89753907';
          const geoUrl = `https://api.geoapify.com/v2/places?categories=tourism,heritage,entertainment,culture,catering.restaurant,leisure.park&filter=circle:${nLon},${nLat},${radius}&limit=50&apiKey=${apiKey}`;
          const geoRes = await axios.get(geoUrl);
          const features = geoRes.data?.features || [];
          
          features.forEach((f: any) => {
            const props = f.properties;
            const tags: any = { name: props.name };
            if (props.categories.includes('tourism')) tags.tourism = 'attraction';
            if (props.categories.includes('heritage')) tags.historic = 'yes';
            if (props.categories.includes('entertainment.culture.museum')) tags.tourism = 'museum';
            if (props.categories.includes('catering.restaurant')) tags.amenity = 'restaurant';

            addPoi({
              id: "geo_" + props.place_id,
              name: props.name,
              lat: props.lat,
              lon: props.lon,
              tags: tags,
              source: 'geoapify'
            });
          });
        } catch (geoErr: any) {
          console.error("[Discovery] Geoapify fallback failed:", geoErr.message);
        }
      }

      console.log(`[Discovery] Houston/Global Discovery: Returning ${allPois.length} total POIs`);
      res.json({ elements: allPois.map(p => ({ ...p, id: p.id, tags: p.tags, lat: p.lat, lon: p.lon })) });
    } catch (e: any) {
      console.error("[Discovery] Root Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // --- SMART TTS ROUTING & USAGE TRACKING ---
  const USAGE_FILE = path.join(process.cwd(), "tts_usage.json");
  const AZURE_LIMIT = 500000;

  async function getTtsUsage() {
    try {
      if (fs.existsSync(USAGE_FILE)) {
        const data = fs.readFileSync(USAGE_FILE, "utf-8");
        return JSON.parse(data).azure_chars || 0;
      }
    } catch (e) { console.error("Error reading usage file", e); }
    return 0;
  }

  async function updateTtsUsage(chars: number) {
    try {
      const current = await getTtsUsage();
      fs.writeFileSync(USAGE_FILE, JSON.stringify({ azure_chars: current + chars }));
    } catch (e) { console.error("Error updating usage file", e); }
  }

  app.post("/api/tts/smart", rateLimiter, async (req, res) => {
    // preloadOnly: il client chiede solo di scaldare la cache (warm-up del POI
    // in avvicinamento). Il flag veniva ignorato, quindi il server sintetizzava
    // e rispediva l'MP3 completo consumando quota per un audio mai riprodotto.
    const { text, voice, preloadOnly } = req.body;

    // Check cache first
    const voiceName = voice || "it-IT-ElsaNeural";
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    const cacheKey = `audioguide_${voiceName}_${textHash}`;
    
    const cached = await getFromCache(cacheKey);
    if (cached && cached.audio_url) {
      // Verifica che il file in storage esista e non sia vuoto: le vecchie
      // entry potevano puntare a MP3 da 0 byte (il client riproduceva 0:00).
      try {
        const head = await axios.head(cached.audio_url, { timeout: 4000 });
        const len = parseInt(head.headers['content-length'] || '0', 10);
        if (len > 500) {
          console.log(`[Cache Hit] Audio Guide TTS for ${voiceName} (${len} bytes)`);
          // Warm-up: la cache è già calda, non serve rispedire l'MP3
          if (preloadOnly) return res.status(204).end();
          return res.redirect(cached.audio_url);
        }
        console.warn(`[Cache] Audio cache entry ${cacheKey} vuoto/corrotto (${len} bytes), rigenero`);
      } catch (headErr: any) {
        console.warn(`[Cache] Audio cache entry ${cacheKey} irraggiungibile, rigenero:`, headErr.message);
      }
      // Elimina la entry marcia così la prossima richiesta non ripassa di qui
      axios.delete(`${supabaseUrl}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      }).catch(() => {});
    }

    // Quota Circuit Breaker Check
    const quota = await checkAndIncrementQuota(req, 'audioguide');
    if (!quota.allowed) {
      return res.status(429).json({ error: "Quota Exceeded", message: quota.error });
    }
    
    const charCount = text.length;
    const currentUsage = await getTtsUsage();

    let voiceLocale = "it-IT";
    if (voiceName && typeof voiceName === "string" && voiceName.includes("-")) {
      const parts = voiceName.split("-");
      if (parts.length >= 2) {
        voiceLocale = `${parts[0]}-${parts[1]}`; // e.g. en-US, zh-CN
      }
    }

    // Regola: Usa Azure se sotto il limite di 500k
    if (currentUsage < AZURE_LIMIT) {
      try {
        const key = process.env.AZURE_SPEECH_KEY;
        const region = process.env.AZURE_SPEECH_REGION || "westeurope";

        if (!key) throw new Error("Azure Key Missing");

        // Escape XML: un "&" o "<" nel testo (comunissimo nelle audioguide)
        // rendeva l'SSML invalido e Azure rispondeva 400 → niente MP3.
        const safeText = String(text)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const ssml = `<speak version='1.0' xml:lang='${voiceLocale}'><voice xml:lang='${voiceLocale}' name='${voiceName}'>${safeText}</voice></speak>`;
        const response = await axios.post(
          `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          ssml,
          {
            headers: {
              "Ocp-Apim-Subscription-Key": key,
              "Content-Type": "application/ssml+xml",
              "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
              "User-Agent": "WIPWorldInPocket"
            },
            responseType: "arraybuffer",
            // La sintesi di un'audioguida completa (2-4 min di parlato) può
            // richiedere ben oltre i 5s del vecchio timeout: con 5000ms i
            // testi lunghi fallivano SEMPRE e si finiva sul fallback Google,
            // che sopra i 5000 byte rifiuta l'input → durata 0:00 lato app.
            timeout: 60000
          }
        );

        await updateTtsUsage(charCount);

        const audioBuffer = Buffer.from(response.data);
        // Un MP3 "vuoto" (risposta 200 anomala) non va né in cache né al client
        if (audioBuffer.length < 500) throw new Error(`Azure returned ${audioBuffer.length} bytes`);
        // Warm-up: si aspetta il salvataggio in cache e si risponde a vuoto,
        // così il POI in avvicinamento è pronto senza scaricare l'MP3 ora.
        if (preloadOnly) {
          await saveAudioToStorageAndCache(cacheKey, audioBuffer).catch(e => console.error(e));
          if (quota.userId) await incrementQuotaCount(quota.userId, 'audioguide').catch(e => console.error(e));
          return res.status(204).end();
        }
        // Save async without waiting to not block response
        saveAudioToStorageAndCache(cacheKey, audioBuffer).catch(e => console.error(e));

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Provider", "Azure");

        if (quota.userId) {
          await incrementQuotaCount(quota.userId, 'audioguide').catch(e => console.error(e));
        }

        try {
          await insertApiUsageLog({
            api_name: 'azure',
            feature_context: 'sintesi_vocale_tts',
            cost_estimation: 0.001,
            tokens_used: 0,
            success: true
          });
        } catch (logErr) {}

        return res.send(audioBuffer);
      } catch (e: any) {
        console.warn("Azure TTS Failed or Limit Reached, falling back to Google... Error message:", e.message, "Status:", e.response?.status, "Data:", e.response?.data ? Buffer.from(e.response.data).toString() : "");
        // Se Azure fallisce o dà errore di quota, procediamo al blocco Google qui sotto
      }
    }

    // Fallback su Google TTS
    try {
      const key = process.env.GOOGLE_TTS_API_KEY;
      if (!key) throw new Error("Google TTS Key missing");

      let googleVoiceName = "it-IT-Wavenet-A"; // Default female
      let googleLangCode = "it-IT";

      if (voiceName) {
        if (voiceName.startsWith("it-IT")) {
          googleLangCode = "it-IT";
          googleVoiceName = voiceName === "it-IT-DiegoNeural" ? "it-IT-Wavenet-C" : "it-IT-Wavenet-A";
        } else if (voiceName.startsWith("en-US")) {
          googleLangCode = "en-US";
          googleVoiceName = voiceName === "en-US-GuyNeural" ? "en-US-Wavenet-D" : "en-US-Wavenet-F";
        } else if (voiceName.startsWith("fr-FR")) {
          googleLangCode = "fr-FR";
          googleVoiceName = voiceName === "fr-FR-HenriNeural" ? "fr-FR-Wavenet-B" : "fr-FR-Wavenet-A";
        } else if (voiceName.startsWith("es-ES")) {
          googleLangCode = "es-ES";
          googleVoiceName = voiceName === "es-ES-AlvaroNeural" ? "es-ES-Wavenet-B" : "es-ES-Wavenet-C";
        } else if (voiceName.startsWith("ru-RU")) {
          googleLangCode = "ru-RU";
          googleVoiceName = voiceName === "ru-RU-DmitryNeural" ? "ru-RU-Wavenet-B" : "ru-RU-Wavenet-A";
        } else if (voiceName.startsWith("zh-CN")) {
          googleLangCode = "zh-CN";
          googleVoiceName = voiceName === "zh-CN-YunxiNeural" ? "zh-CN-Wavenet-B" : "zh-CN-Wavenet-A";
        }
      }

      // Google TTS rifiuta input oltre ~5000 byte: le audioguide complete li
      // superano quasi sempre. Spezziamo il testo per frasi in blocchi sicuri
      // e concateniamo gli MP3 (i frame MP3 concatenati sono riproducibili).
      const MAX_CHUNK_BYTES = 4500;
      const chunks: string[] = [];
      let current = "";
      for (const sentence of String(text).split(/(?<=[.!?…])\s+/)) {
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (Buffer.byteLength(candidate, 'utf8') > MAX_CHUNK_BYTES && current) {
          chunks.push(current);
          current = sentence;
        } else {
          current = candidate;
        }
      }
      if (current) chunks.push(current);

      const buffers: Buffer[] = [];
      for (const chunk of chunks) {
        const gRes = await axios.post(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
          {
            input: { text: chunk },
            voice: { languageCode: googleLangCode, name: googleVoiceName },
            audioConfig: { audioEncoding: "MP3" }
          },
          { timeout: 60000 }
        );
        buffers.push(Buffer.from(gRes.data.audioContent, 'base64'));
      }

      const audioBuffer = Buffer.concat(buffers);
      if (audioBuffer.length < 500) throw new Error(`Google TTS returned ${audioBuffer.length} bytes`);
      if (preloadOnly) {
        await saveAudioToStorageAndCache(cacheKey, audioBuffer).catch(e => console.error(e));
        if (quota.userId) await incrementQuotaCount(quota.userId, 'audioguide').catch(e => console.error(e));
        return res.status(204).end();
      }
      saveAudioToStorageAndCache(cacheKey, audioBuffer).catch(e => console.error(e));

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Provider", "Google");

      if (quota.userId) {
        await incrementQuotaCount(quota.userId, 'audioguide').catch(e => console.error(e));
      }

      res.send(audioBuffer);
    } catch (e: any) {
      console.error("Smart TTS final fail:", e);
      res.status(500).json({ error: "All TTS providers failed" });
    }
  });

  app.post("/api/tts/azure", rateLimiter, async (req, res) => {
    try {
      const { text, voice = "it-IT-ElsaNeural" } = req.body;
      const key = process.env.AZURE_SPEECH_KEY;
      const region = process.env.AZURE_SPEECH_REGION || "westeurope";
      
      if (!key) return res.status(500).json({ error: "Azure Speech Key missing" });

      let voiceLocale = "it-IT";
      if (voice && typeof voice === "string" && voice.includes("-")) {
        const parts = voice.split("-");
        if (parts.length >= 2) {
          voiceLocale = `${parts[0]}-${parts[1]}`;
        }
      }

      const ssml = `<speak version='1.0' xml:lang='${voiceLocale}'><voice xml:lang='${voiceLocale}' name='${voice}'>${text}</voice></speak>`;

      const response = await axios.post(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        ssml,
        {
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
            "User-Agent": "WIPWorldInPocket"
          },
          responseType: "arraybuffer"
        }
      );

      const audioBuffer = Buffer.from(response.data);
      // Azure può rispondere 200 con corpo VUOTO (quota esaurita a metà
      // richiesta, SSML rifiutato in silenzio): un MP3 vero non è mai sotto
      // i 500 byte. Senza questo guard il client riceveva "audio non valido
      // (0 byte)" su tutte le voci senza nessuna diagnosi.
      if (audioBuffer.length < 500) {
        throw new Error(`Azure ha risposto ${audioBuffer.length} byte (HTTP ${response.status})`);
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (e: any) {
      const azureMsg = e?.response?.status ? `HTTP ${e.response.status}` : (e?.message || 'errore sconosciuto');
      console.error("Azure TTS error:", azureMsg);
      // Fallback Google (voce di default della lingua): la guida parla
      // comunque; il provider usato resta visibile nell'header.
      try {
        const gKey = process.env.GOOGLE_TTS_API_KEY;
        if (!gKey) throw new Error("Google TTS Key missing");
        const { text, voice = "it-IT-ElsaNeural" } = req.body || {};
        const parts = typeof voice === 'string' ? voice.split('-') : [];
        const locale = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'it-IT';
        const gRes = await axios.post(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${gKey}`, {
          input: { text }, voice: { languageCode: locale }, audioConfig: { audioEncoding: 'MP3' }
        });
        const gBuf = Buffer.from(gRes.data?.audioContent || '', 'base64');
        if (gBuf.length < 500) throw new Error(`Google ha risposto ${gBuf.length} byte`);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Provider", "Google-Fallback");
        return res.send(gBuf);
      } catch (g: any) {
        const gMsg = g?.response?.status ? `HTTP ${g.response.status}` : (g?.message || 'errore sconosciuto');
        return res.status(502).json({ error: `Azure: ${azureMsg} · Google fallback: ${gMsg}` });
      }
    }
  });

  app.post("/api/tts/google", rateLimiter, async (req, res) => {
    try {
      const { text, voice = "it-IT-Wavenet-A" } = req.body;
      const key = process.env.GOOGLE_TTS_API_KEY;
      if (!key) return res.status(500).json({ error: "Google TTS Key missing" });

      let voiceLocale = "it-IT";
      if (voice && typeof voice === "string" && voice.includes("-")) {
        const parts = voice.split("-");
        if (parts.length >= 2) {
          voiceLocale = `${parts[0]}-${parts[1]}`;
        }
      }

      const gRes = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
        {
          input: { text },
          voice: { languageCode: voiceLocale, name: voice },
          audioConfig: { audioEncoding: "MP3" }
        }
      );

      const audioContent = gRes.data.audioContent;
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(Buffer.from(audioContent, 'base64'));
    } catch (e: any) {
      console.error("Google TTS error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceId } = req.body;
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) {
         return res.status(500).json({ error: "ElevenLabs API key missing" });
      }
      const eRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
         method: "POST",
         headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": key
         },
         body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
               stability: 0.5,
               similarity_boost: 0.75
            }
         })
      });
      if (!eRes.ok) throw new Error("ElevenLabs API error: " + eRes.statusText);
      const audioBuffer = await eRes.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(Buffer.from(audioBuffer));
    } catch (e: any) {
      console.error("TTS error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guide-intro", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Gemini not configured" });
      const { poiName, distance, type, relativeAngle } = req.body;
      
      let directionStr = "";
      if (relativeAngle !== undefined) {
          if (relativeAngle > 10) directionStr = "leggermente a destra";
          if (relativeAngle > 30) directionStr = "a destra";
          if (relativeAngle < -10) directionStr = "leggermente a sinistra";
          if (relativeAngle < -30) directionStr = "a sinistra";
      }

      const prompt = type === 'anticipation'
        ? `Sei Nicky, una guida turistica AI amichevole. L'utente si sta avvicinando a "${poiName}" (mancano circa ${distance} metri). 
           Il monumento si trova ${directionStr || "davanti a te"}.
           Genera una brevissima frase d'effetto (MAX 15 PAROLE) per annunciare il luogo includendo la direzione se utile. 
           Esempio: "Ehi, tra poco vedremo ${poiName} ${directionStr}, un vero gioiello!" oppure "Guarda ${directionStr}, tra poco appare ${poiName}!".
           Rispondi SOLO con la frase in italiano.`
        : `Sei Nicky, una guida turistica AI amichevole. L'utente è arrivato davanti a "${poiName}". 
           Genera una brevissima frase di benvenuto (MAX 20 PAROLE) che introduca l'audioguida completa.
           Esempio: "Eccoci qui! Sei davanti a ${poiName}. Vuoi scoprire i segreti di questo luogo pazzesco?".
           Rispondi SOLO con la frase in italiano.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      res.json({ result: response.text });
    } catch (e: any) {
      console.error("Guide intro error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- STRIPE CHECKOUT & WEBHOOKS ---
  
  app.post("/api/b2b-checkout", async (req, res) => {
    try {
      const { packageType, structureName, userEmail, userId } = req.body;
      let amount = 0;
      let codeCount = 0;
      if(packageType === 'bronze') { amount = 9900; codeCount = 50; }
      else if(packageType === 'silver') { amount = 24900; codeCount = 150; }
      else if(packageType === 'gold') { amount = 59900; codeCount = 500; }
      else { return res.status(400).json({ error: "Invalid packageType" }); }
      
      if (!stripeClient) {
        return res.json({ url: `/admin` });
      }

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Pacchetto ${packageType.toUpperCase()} - ${codeCount} Coupon B2B - ${structureName}`,
            },
            unit_amount: amount,
          },
          quantity: 1
        }],
        mode: 'payment',
        customer_email: userEmail,
        client_reference_id: userId,
        metadata: {
           b2b: "true",
           structureName,
           codeCount: codeCount.toString(),
           durationDays: "7",
           creditsPerVoucher: "500"
        },
        success_url: `${req.protocol}://${req.get("host")}/admin?b2bsuccess=true`,
        cancel_url: `${req.protocol}://${req.get("host")}/admin?b2bcanceled=true`,
      });
      return res.json({ url: session.url });
    } catch (e: any) {
      console.error("Stripe B2B Checkout error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const { priceId, userId, userEmail } = req.body;
      
      if (!stripeClient) {
        // Fallback locale mock
        console.warn("Stripe non configurato. Abilitazione mock locale.");
        return res.json({ url: `/admin` }); // Placeholder
      }

      let activePriceId = priceId;

      // Map mock price IDs to the user-provided Stripe Product IDs as fallback
      if (priceId === 'price_weekly_mock') {
        activePriceId = 'prod_UYKUEb0DZvNwvF';
      } else if (priceId === 'price_monthly_mock') {
        activePriceId = 'prod_UYXZlxXee6cLXB';
      } else if (priceId === 'price_yearly_mock') {
        activePriceId = 'prod_UYXkMc0TmPpWYY';
      }

      // If the resolved ID is a Product ID (starts with 'prod_'), dynamically resolve its active Price ID from Stripe
      if (activePriceId.startsWith('prod_')) {
        try {
          const pricesList = await stripeClient.prices.list({ product: activePriceId, active: true });
          if (pricesList.data.length > 0) {
            // Prefer a recurring subscription price if available, otherwise fallback to the first active price
            const recurringPrice = pricesList.data.find(p => p.type === 'recurring');
            const matchPrice = recurringPrice || pricesList.data[0];
            const resolvedPriceId = matchPrice.id;
            console.log(`[Stripe] Resolved Product ID ${activePriceId} to Price ID: ${resolvedPriceId} (type: ${matchPrice.type})`);
            activePriceId = resolvedPriceId;
          } else {
            throw new Error(`Nessun prezzo attivo configurato su Stripe per il prodotto: ${activePriceId}`);
          }
        } catch (err: any) {
          console.error(`[Stripe] Error resolving Product ID ${activePriceId} to Price ID:`, err);
          throw new Error(err.message || `Errore nella risoluzione del prodotto Stripe: ${activePriceId}`);
        }
      }

      // If not mapped by environment variables, dynamically query Stripe active prices as a final fallback
      if (!activePriceId || activePriceId.includes('mock')) {
        try {
          const prices = await stripeClient.prices.list({ active: true });
          let intervalSearch = 'week';
          if (priceId.includes('monthly')) intervalSearch = 'month';
          if (priceId.includes('yearly')) intervalSearch = 'year';

          const match = prices.data.find(p => p.recurring?.interval === intervalSearch);
          if (match) {
            activePriceId = match.id;
            console.log(`[Stripe] Dynamically mapped ${priceId} to active price: ${activePriceId}`);
          } else if (prices.data.length > 0) {
            activePriceId = prices.data[0].id;
            console.log(`[Stripe] Fallback mapped ${priceId} to first active price: ${activePriceId}`);
          }
        } catch (err: any) {
          console.error("Stripe Prices List Error:", err);
        }
      }

      // If we still don't have a valid price ID, throw a friendly error
      if (!activePriceId || activePriceId.includes('mock')) {
        throw new Error(`Nessun prezzo valido configurato su Stripe per il piano: ${priceId}`);
      }

      // Inspect Stripe Price details to dynamically decide the Checkout Session mode ('subscription' or 'payment')
      let checkoutMode = 'subscription';
      try {
        const priceDetails = await stripeClient.prices.retrieve(activePriceId);
        if (priceDetails.type === 'one_time') {
          checkoutMode = 'payment';
          console.log(`[Stripe] Price ${activePriceId} is one-time (non-recurring). Setting session mode to 'payment'.`);
        } else {
          checkoutMode = 'subscription';
          console.log(`[Stripe] Price ${activePriceId} is recurring. Setting session mode to 'subscription'.`);
        }
      } catch (err: any) {
        console.warn(`[Stripe] Could not retrieve price details for ${activePriceId}:`, err.message);
      }

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: activePriceId, quantity: 1 }],
        mode: checkoutMode as any,
        customer_email: userEmail,
        client_reference_id: userId,
        success_url: `${req.protocol}://${req.get('host')}/?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${req.protocol}://${req.get('host')}/?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Stripe Checkout error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // DISMESSO: questo endpoint accettava eventi Stripe SENZA verifica di firma —
  // chiunque poteva autoassegnarsi premium o generare coupon con un POST.
  // Tutta la logica (b2b coupon, attivazione/cancellazione/rinnovo abbonamento)
  // è stata spostata dentro /api/stripe/webhook, che verifica la firma.
  // Aggiornare l'URL del webhook nella dashboard Stripe a /api/stripe/webhook.
  app.post("/api/webhook", (req, res) => {
    console.warn('[Webhook] Chiamata al vecchio /api/webhook non firmato: rifiutata. Usare /api/stripe/webhook.');
    res.status(410).json({ error: 'Endpoint dismesso: configurare /api/stripe/webhook (firma verificata)' });
  });


  // DISATTIVATA: nessun client la chiama e permetteva a chiunque di
  // sovrascrivere il pdf_url di qualsiasi guida (PATCH con service-role key
  // guidato dal body, senza alcuna autenticazione).
  app.post("/api/premium-guide/pdf-url", (req, res) => {
    res.status(410).json({ error: "Endpoint dismesso" });
  });

  // Dynamic Itinerary Optimization & WIP Chat
  app.post("/api/optimize-itinerary", async (req, res) => {
    try {
      const { itineraryId, eventMessage, chatHistory = [], safeUserId, currentLocation } = req.body;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

      if (!itineraryId) return res.status(400).json({ error: "Missing itineraryId" });

      // Chat generica "Chiedi a WIP" (dalla scheda POI): nessun itinerario da
      // caricare né da aggiornare. Prima questo id fittizio finiva nella query
      // sugli itineraries e la chat globale rispondeva sempre 404.
      const isGeneralChat = itineraryId === 'general';

      // Utente autenticato dal token: serve per la proprietà dell'itinerario,
      // per il contatore messaggi e per l'addebito crediti SERVER-SIDE.
      let authUserId: string | null = null;
      const authHeader = String(req.headers.authorization || '');
      if (authHeader.startsWith('Bearer ')) {
        try {
          const userRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
            headers: { apikey: supabaseServiceKey, Authorization: authHeader }
          });
          authUserId = userRes.data?.id || null;
        } catch { /* token non valido → authUserId resta null */ }
      }

      // 1. Fetch current plan
      let dbItinerary: any = null;
      if (!isGeneralChat) {
        const itineraryRes = await axios.get(`${supabaseUrl}/rest/v1/itineraries?id=eq.${itineraryId}`, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
        });
        dbItinerary = itineraryRes.data?.[0];
        if (!dbItinerary) return res.status(404).json({ error: "Itinerario non trovato" });
        // IDOR fix: la proprietà si verifica con l'utente AUTENTICATO dal
        // token, non con lo userId dichiarato nel body (falsificabile).
        // Itinerari anonimi (senza user_id) restano accessibili.
        if (dbItinerary.user_id) {
          if (!authUserId || authUserId !== dbItinerary.user_id) {
            return res.status(403).json({ error: "Accesso negato" });
          }
        }
      }

      // --- BLINDATURA CHAT (contatore e addebito SERVER-SIDE) ---
      // Prima il limite dei 10 messaggi e l'addebito dei 3 crediti vivevano
      // solo nel client (localStorage): bastava svuotare la cache per chattare
      // gratis all'infinito. Ora il server è l'unica autorità:
      // - itinerari: 10 messaggi INCLUSI (metadata.chat_messages_left);
      // - chat generale/POI: contatore in user_chat_sessions, 0 inclusi;
      // - esauriti: 402; con confirmPurchase=true addebita 3 crediti via RPC
      //   atomica consume_credits e ricarica 10 messaggi.
      const CHAT_PACK_SIZE = 10;
      const CHAT_PACK_COST = 3; // = PRICING_LIST.chat_session
      const confirmPurchase = req.body?.confirmPurchase === true;
      if (!authUserId) {
        return res.status(401).json({ error: "login_required" });
      }
      let chatMessagesLeft = 0;
      if (isGeneralChat) {
        try {
          const rowRes = await axios.get(
            `${supabaseUrl}/rest/v1/user_chat_sessions?user_id=eq.${authUserId}&select=messages_left`,
            { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
          );
          chatMessagesLeft = Number(rowRes.data?.[0]?.messages_left) || 0;
        } catch { chatMessagesLeft = 0; }
      } else {
        const metaLeft = dbItinerary?.metadata?.chat_messages_left;
        // Campo assente = itinerario mai chattato: grant dei 10 inclusi
        chatMessagesLeft = typeof metaLeft === 'number' ? metaLeft : CHAT_PACK_SIZE;
      }
      if (chatMessagesLeft <= 0) {
        if (!confirmPurchase) {
          return res.status(402).json({ error: "no_messages_left", needsPurchase: true, cost: CHAT_PACK_COST, packSize: CHAT_PACK_SIZE });
        }
        const rpcRes = await axios.post(
          `${supabaseUrl}/rest/v1/rpc/consume_credits`,
          { p_user_id: authUserId, p_amount: CHAT_PACK_COST },
          { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" } }
        );
        if (rpcRes.data !== true) {
          return res.status(402).json({ error: "insufficient_credits", cost: CHAT_PACK_COST });
        }
        chatMessagesLeft = CHAT_PACK_SIZE;
      }

      // Update status (solo ora che il messaggio è autorizzato: un 402 non
      // deve lasciare l'itinerario bloccato su 'optimizing')
      if (!isGeneralChat) {
        await axios.patch(`${supabaseUrl}/rest/v1/itineraries?id=eq.${itineraryId}`, { status: 'optimizing' }, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" }
        });
      }

      // 2. Setup Groq with Tools
      const GroqConstructor = (Groq as any).default || Groq;
      const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
      if (!groqKey && !ai) throw new Error("API Keys missing");
      const groqClient = groqKey ? new GroqConstructor({ apiKey: groqKey }) : null;

      let systemPrompt = `Sei WIP, l'Assistente di Viaggio AI tuttofare per 'World in Pocket'. Il tuo compito è interagire con l'utente in modo VELOCISSIMO, ACCURATO e MULTILINGUA (rispondi sempre nella lingua usata dall'utente).
Puoi usare i tools a disposizione per trovare eventi, meteo, percorsi, tour (Viator) e biglietti d'ingresso reali (Tiqets). Quando inserisci un link di prenotazione in una tappa usa SOLO gli URL restituiti dai tools, copiati INTATTI: contengono i codici partner, ed è VIETATO costruire URL viator.com/getyourguide/tiqets.com a memoria.
Se l'utente ti fa una domanda, rispondi in modo conciso e utile nel campo "message" e imposta il "type" su "chat_only".
Se l'utente ti chiede esplicitamente di MODIFICARE o AGGIORNARE l'itinerario (es. "Ho un ritardo", "Meteo cambiato", "Voglio visitare un museo"), modifica l'itinerario JSON esistente mantenendo inalterata la struttura, imposta "type" su "itinerary_update" e inserisci l'itinerario modificato nel campo "updatedPlan".

IMPORTANTE: L'output finale DEVE essere ESCLUSIVAMENTE JSON, senza saluti esterni e senza formattazione testuale markdown.
Usa SEMPRE E SOLO questo schema JSON:
{
  "type": "chat_only" oppure "itinerary_update",
  "message": "Il tuo messaggio di risposta discorsiva (es. 'Ho aggiornato l'itinerario per la pioggia!' oppure 'Lo stadio si trova in via...').",
  "updatedPlan": { ... } // (Se type è "itinerary_update", DEVI OBBLIGATORIAMENTE includere TUTTO l'itinerario, specialmente l'array "giorni" con tutte le sue tappe. Non omettere mai "giorni", altrimenti distruggerai l'itinerario!)
}`;

      // (PredictHQ rimosso: per gli eventi il chatbot usa il tool Ticketmaster)

      const tools: any = [
        {
          type: "function",
          function: {
            name: "getWeatherOpenMeteo",
            description: "Ottiene il meteo per una località.",
            parameters: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] }
          }
        },
        {
          type: "function",
          function: {
            name: "getRouteOsrm",
            description: "Calcola la distanza e il tempo di percorrenza.",
            parameters: { type: "object", properties: { fromLat: { type: "number" }, fromLng: { type: "number" }, toLat: { type: "number" }, toLng: { type: "number" } }, required: ["fromLat", "fromLng", "toLat", "toLng"] }
          }
        },
        {
          type: "function",
          function: {
            name: "searchTicketmasterEvents",
            description: "Cerca eventi Ticketmaster.",
            parameters: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, keyword: { type: "string" } }, required: ["lat", "lng", "keyword"] }
          }
        },
        {
          type: "function",
          function: {
            name: "searchViatorExperiences",
            description: "Cerca esperienze, tour, degustazioni e biglietti su Viator (usa questo quando l'utente chiede alternative a tour o attività specifiche). Inserisci SEMPRE il link restituito per permettere la prenotazione.",
            parameters: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, radiusKm: { type: "number" } }, required: ["lat", "lng"] }
          }
        },
        {
          type: "function",
          function: {
            name: "searchTiqetsTickets",
            description: "Cerca biglietti d'ingresso reali (musei, attrazioni, salta-fila) su Tiqets vicino a una posizione. Gli URL restituiti contengono già il codice partner: inseriscili INTATTI in link_info, mai modificarli o inventarne altri.",
            parameters: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, radiusKm: { type: "number" } }, required: ["lat", "lng"] }
          }
        },
        {
          type: "function",
          function: {
            name: "searchEuropeana",
            description: "Cerca mostre e cultura su Europeana.",
            parameters: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] }
          }
        }
      ];

      const messages: any[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `(Contesto Nascosto) ${isGeneralChat
          ? "Nessun itinerario attivo: è una chat generica di consigli di viaggio. Rispondi sempre con type \"chat_only\"."
          : `Itinerario attuale: ${JSON.stringify(dbItinerary.plan)}`}\nPosizione attuale utente: ${currentLocation ? `${currentLocation.lat}, ${currentLocation.lng}` : 'N/A'}` }
      ];

      if (chatHistory && Array.isArray(chatHistory)) {
         messages.push(...chatHistory.map((m: any) => ({
             role: m.role === 'assistant' ? 'assistant' : 'user',
             content: m.content
         })));
      }

      if (eventMessage) {
         messages.push({ role: "user", content: eventMessage });
      }

      // 3. Agent Loop (max 5 iterations)
      let finalPlanStr = null;
      for (let i = 0; i < 5; i++) {
        let responseMessage: any;
        const deepseekKey = process.env.DEEPSEEK_API_KEY;
        
        if (deepseekKey) {
          try {
            const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
              model: "deepseek-chat",
              messages,
              tools,
              response_format: { type: "json_object" },
              max_tokens: 8000
            }, {
              headers: {
                "Authorization": `Bearer ${deepseekKey}`,
                "Content-Type": "application/json"
              },
              timeout: 60000
            });
            responseMessage = dsResponse.data.choices[0].message;
          } catch (e: any) {
            console.error("Deepseek Chatbot Error:", e.response?.data || e.message);
            throw e;
          }
        } else if (groqClient) {
          const response = await callGroqWithFallback(
            groqClient,
            messages,
            "llama-3.3-70b-versatile",
            "mixtral-8x7b-32768",
            { tools, tool_choice: "auto", max_tokens: 8000 },
            "optimize_itinerary",
            supabaseUrl,
            supabaseServiceKey
          );
          responseMessage = response.choices[0].message;
        } else {
           // Fallback base to gemini
           const aiRes = await ai.models.generateContent({
             model: "gemini-2.5-flash",
             contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content || JSON.stringify(m) }] })),
             config: { responseMimeType: "application/json" }
           });
           responseMessage = { content: aiRes.text };
        }
        
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          messages.push(responseMessage);
          for (const toolCall of responseMessage.tool_calls) {
            let args;
            try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch(e) { args = {}; }
            let toolResult = "";
            try {
              if (toolCall.function.name === "getWeatherOpenMeteo") toolResult = await agentTools.getWeatherOpenMeteo(args.lat, args.lng);
              else if (toolCall.function.name === "getRouteOsrm") toolResult = await agentTools.getRouteOsrm(args.fromLat, args.fromLng, args.toLat, args.toLng);
              else if (toolCall.function.name === "searchTicketmasterEvents") toolResult = await agentTools.searchTicketmasterEvents(args.lat, args.lng, args.keyword);
              else if (toolCall.function.name === "searchViatorExperiences") toolResult = await agentTools.searchViatorExperiences(args.lat, args.lng, args.radiusKm || 100);
              else if (toolCall.function.name === "searchTiqetsTickets") toolResult = JSON.stringify(await fetchTiqetsProducts({ lat: args.lat, lon: args.lng, radiusKm: args.radiusKm || 20, lang: 'it', pageSize: 8 }));
              else if (toolCall.function.name === "searchEuropeana") toolResult = await agentTools.searchEuropeana(args.keyword);
              else toolResult = JSON.stringify({ error: "Tool not found" });
            } catch (e: any) {
              toolResult = JSON.stringify({ error: e.message });
            }
            messages.push({ tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: toolResult });
          }
        } else {
          finalPlanStr = responseMessage.content;
          break;
        }
      }

      if (!finalPlanStr) throw new Error("Agent failed to respond.");

      let cleanJsonStr = finalPlanStr.trim();
      if (cleanJsonStr.startsWith('```json')) cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      if (cleanJsonStr.startsWith('```')) cleanJsonStr = cleanJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');

      let parsedResult;
      try {
        parsedResult = parseSafeJSON(cleanJsonStr);
      } catch (e) {
        throw new Error("Agent did not return valid JSON");
      }

      // Chat generica: si scala il contatore server-side e si risponde
      if (isGeneralChat) {
        const newLeft = Math.max(0, chatMessagesLeft - 1);
        try {
          await axios.post(
            `${supabaseUrl}/rest/v1/user_chat_sessions`,
            { user_id: authUserId, messages_left: newLeft, updated_at: new Date().toISOString() },
            { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" } }
          );
        } catch (e: any) {
          console.warn("Chat counter save failed:", e.message);
        }
        return res.json({ success: true, type: parsedResult.type || 'chat_only', message: parsedResult.message, messagesLeft: newLeft });
      }

      // 4. Update DB and append chat history
      const currentMetadata = dbItinerary.metadata || {};
      const currentChatHistory = Array.isArray(currentMetadata.chat_history) ? currentMetadata.chat_history : [
        { 
          role: 'assistant', 
          content: "Ciao! L'itinerario è pronto, ma se vuoi modificarlo (es. aggiungere un museo, scambiare orari, trovare alternative se piove) o farmi domande sui luoghi... sono a tua disposizione!" 
        }
      ];
      
      if (eventMessage) {
        currentChatHistory.push({ role: 'user', content: eventMessage });
      }
      if (parsedResult.message) {
        currentChatHistory.push({ role: 'assistant', content: parsedResult.message });
      } else if (parsedResult.type === "itinerary_update") {
        currentChatHistory.push({ role: 'assistant', content: "Ho aggiornato l'itinerario come richiesto!" });
      }
      
      // Contatore persistito nei metadata: il client lo riceve nella risposta
      const chatMessagesLeftAfter = Math.max(0, chatMessagesLeft - 1);
      const newMetadata = { ...currentMetadata, chat_history: currentChatHistory, chat_messages_left: chatMessagesLeftAfter };

      if (parsedResult.type === "itinerary_update" && parsedResult.updatedPlan) {
        // SAFEGUARD: Assicuriamoci che l'AI non abbia rimosso le tappe per pigrizia
        if (!parsedResult.updatedPlan.giorni || !Array.isArray(parsedResult.updatedPlan.giorni) || parsedResult.updatedPlan.giorni.length === 0) {
           console.warn("LLM returned itinerary_update but missing 'giorni' array. Preventing data wipe.");
           parsedResult.type = "chat_only";
           parsedResult.message = parsedResult.message || "Ho elaborato la tua richiesta, ma c'è stato un problema nel riscrivere l'itinerario. Potresti essere più specifico?";
           
           await axios.patch(`${supabaseUrl}/rest/v1/itineraries?id=eq.${itineraryId}`, { 
             metadata: newMetadata,
             status: 'active' 
           }, {
             headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" }
           });
        } else {
           await axios.patch(`${supabaseUrl}/rest/v1/itineraries?id=eq.${itineraryId}`, { 
             plan: parsedResult.updatedPlan, 
             metadata: newMetadata,
             status: 'active' 
           }, {
             headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" }
           });
        }
      } else {
        await axios.patch(`${supabaseUrl}/rest/v1/itineraries?id=eq.${itineraryId}`, { 
          metadata: newMetadata,
          status: 'active' 
        }, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" }
        });
      }

      res.json({ success: true, type: parsedResult.type, message: parsedResult.message, plan: parsedResult.updatedPlan, messagesLeft: chatMessagesLeftAfter });

    } catch (err: any) {
      console.error("Optimize Itinerary Error:", err.message);
      try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
        if (supabaseUrl && req.body?.itineraryId && req.body.itineraryId !== 'general') {
          await axios.patch(`${supabaseUrl}/rest/v1/itineraries?id=eq.${req.body.itineraryId}`, { status: 'active' }, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" }
          });
        }
      } catch (e) {}
      res.status(500).json({ error: err.message });
    }
  });


  // ── PREMIUM GUIDE GENERATION ENDPOINT ────────────────────────────────────────
  // Multi-source: Wikipedia + Wikivoyage + Foursquare + TripAdvisor + Unsplash
  
  app.post("/api/premium-guide/generate-stream", async (req, res) => {
    let pgsChargeRef: { userId: string; cost: number } | null = null;
    try {
      const { itinerary, style, userId, hash, language = "IT" } = req.body;
      if (!itinerary || !userId) return res.status(400).json({ error: "Missing required fields" });

      // Limite unico anti-frode (giornaliero, uguale per tutti): questa route
      // era l'unica senza alcun controllo — un bot poteva generare guide
      // all'infinito bruciando l'API. Il pagamento resta gestito a crediti.
      const guideQuota = await checkAndIncrementQuota(req, 'premium_guide');
      if (!guideQuota.allowed) {
        return res.status(403).json({ error: "QUOTA_EXCEEDED" });
      }

      // GATE CREDITI SERVER-SIDE: questa rotta generava guide GRATIS (solo
      // quota). Ora addebita come la /generate non-stream. chargeOrReject
      // risponde da solo 401/402/500. (Il rimborso su errore è best-effort:
      // lo stream può fallire a metà.)
      const pgsDays = Math.max(1, Array.isArray(itinerary?.giorni) ? itinerary.giorni.length : 1);
      const pgsCharge = await chargeOrReject(req, res, 'premium_guide_daily', pgsDays);
      if (!pgsCharge) return;
      pgsChargeRef = pgsCharge;
      if (guideQuota.userId) incrementQuotaCount(guideQuota.userId, 'premium_guide').catch(() => {});

      const destination = itinerary?.titolo || itinerary?.destinazione || "Italia";
      console.log(`[Premium Guide Stream] Generating for ${destination}, style: ${style}`);

      const enrichedItinerary = JSON.parse(JSON.stringify(itinerary));

      const PERSONA: Record<string, string> = {
        art: "Sei un rinomato critico d'arte e storico dell'architettura. La tua prosa è colta, elegante e ricca di riferimenti a movimenti artistici.",
        family: "Sei un genitore esperto di viaggi family. Bilanci dettagli pratici, attività adatte ai bambini e consigli salvavita.",
        shopping: "Sei un trendsetter e esperto di design, moda e artigianato locale. Conosci ogni bottega e mercato autentico.",
        food: "Sei un buongustaio e critico gastronomico di fama nazionale. Conosci ogni ricetta storica e trattoria nascosta.",
        essential: "Sei un logista esperto che ottimizza itinerari. Preciso, pragmatico, forni tutti i dati pratici con accuratezza assoluta."
      };

      // Stessa regola lingua della rotta non-stream: prima `language` era ignorato.
      const PGS_LANGS: Record<string, string> = { IT: "italiano", EN: "inglese (English)", FR: "francese (français)", ES: "spagnolo (español)", DE: "tedesco (Deutsch)", RU: "russo (русский)", ZH: "cinese semplificato (简体中文)" };
      const pgsLangName = PGS_LANGS[String(language || "IT").toUpperCase()] || "italiano";
      const pgsLangRule = pgsLangName === "italiano" ? "" : `
LINGUA OBBLIGATORIA: scrivi TUTTI i testi della guida in ${pgsLangName}. Le CHIAVI del JSON restano ESATTAMENTE in italiano come da schema.`;

      const baseSystemPrompt = `Sei l'autore principale della prestigiosa collana "WIP Premium Smart Guide" di World in Pocket. ${PERSONA[style] || PERSONA.essential}

Devi creare una GUIDA TURISTICA PROFESSIONALE COMPLETA in formato JSON.${pgsLangRule}
REGOLE ASSOLUTE:
1. "descrizione_lunga": MINIMO 4 paragrafi corposi.
2. "curiosita": Array OBBLIGATORIO di 3-4 curiosità sorprendenti.
3. "dettaglio_storico_tecnico": MINIMO 150 parole.
4. "consiglio_insider": MINIMO 100 parole.
5. DIVIETO ASSOLUTO: frasi generiche. Tutti i dati reali e verificati.
${ANTI_HALLUCINATION_RULES}

Restituisci SOLO JSON valido con questa struttura:
{
  "guida_titolo": "titolo",
  "sottotitolo": "sottotitolo",
  "introduzione": "intro...",
  "citta_intro": { "titolo": "...", "storia": "...", "cultura_tradizioni": "...", "consigli_pratici": "..." },
  "giorni": [
    {
      "giorno": 1,
      "titolo_giorno": "...",
      "tema_giorno": "...",
      "pois": [ { "poi_id": "...", "titolo": "...", "categoria_pdf": "...", "valutazione": 4.5, "indirizzo": "...", "trasporti": "...", "orario_visita": "...", "descrizione_lunga": "...", "curiosita": [], "dettaglio_storico_tecnico": "...", "consiglio_insider": "...", "migliori_piatti": [], "info_utili": {} } ]
    }
  ]
}
Non aggiungere testo prima o dopo il JSON.`;

      const prompt = `Genera l'intera guida per ${destination}. Ecco l'itinerario di base:\n${JSON.stringify(enrichedItinerary.giorni || [], null, 2)}`;
      const messages = [{ role: "system", content: baseSystemPrompt }, { role: "user", content: prompt }];
      
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

      await streamUniversalAi("deepseek", messages, { response_format: { type: "json_object" }, temperature: 0.72 }, res, groq);

    } catch (e: any) {
      console.error("[Premium Guide Stream Error]:", e.message);
      // Rimborso best-effort se avevamo già addebitato.
      if (pgsChargeRef) await refundServer(pgsChargeRef.userId, pgsChargeRef.cost).catch(() => {});
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  });

  app.post("/api/premium-guide/generate", rateLimiter, async (req, res) => {
    let pmCharge: { userId: string; cost: number } | null = null;
    try {
      const { itinerary, style, userId, hash, language = "IT" } = req.body;
      if (!itinerary) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

      // ── QUOTA CHECK ──────────────────────────────────────────────────────────
      const quotaRes = await axios.get(
        `${supabaseUrl}/rest/v1/user_quotas?user_id=eq.${userId}&select=premium_guide_used,premium_guide_limit`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
      ).catch(() => null);

      // Limite unico anti-frode con reset giornaliero: stessa logica di tutte
      // le altre feature (checkAndIncrementQuota), nessun tier free/premium.
      // I vecchi limiti per-riga (0 free / 10 premium) sono ignorati: chi paga
      // in crediti non va mai bloccato per tier.
      const guideQuota = await checkAndIncrementQuota(req, 'premium_guide');
      if (!guideQuota.allowed) {
        return res.status(403).json({ error: "QUOTA_EXCEEDED" });
      }

      // ── CACHE CHECK ──────────────────────────────────────────────────────────
      if (hash) {
        const cacheCheck = await axios.get(
          `${supabaseUrl}/rest/v1/itinerary_guides?itinerary_hash=eq.${hash}&status=eq.completed&limit=1`,
          { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
        ).catch(() => null);
        if (cacheCheck?.data?.length > 0) {
          const cached = cacheCheck.data[0];
          console.log("[Premium Guide] Cache hit! Returning cached guide.");
          // Cache hit PRIMA dell'addebito: la guida già in libreria non ripaga.
          return res.json({ content: cached.content_data, media_manifest: cached.media_manifest || {}, cached: true });
        }
      }

      // ── GATE CREDITI SERVER-SIDE (20 × giorni) ───────────────────────────────
      // Prima l'addebito viveva solo nel client (PremiumGuideModal): la rotta
      // era gratuita e anonima (userId dal body). Ora il token è obbligatorio
      // e l'addebito è atomico; il rimborso su fallimento è nel catch finale.
      const numDaysGuide = Math.max(1, (itinerary?.giorni?.length) || 1);
      pmCharge = await chargeOrReject(req, res, 'premium_guide_daily', numDaysGuide);
      if (!pmCharge) return; // 401/402/500 già inviato

      // ── FASE 1: EXTRACT DESTINATION FROM ITINERARY ──────────────────────────
      const destination: string = itinerary?.titolo || itinerary?.destinazione || "Italia";
      console.log(`[Premium Guide] Generating for destination: "${destination}", style: "${style}"`);

      // ── FASE 2: ENRICHMENT DA FONTI REALI ───────────────────────────────────
      console.log("[Premium Guide] Fetching multi-source context...");
      const enrichedItinerary = JSON.parse(JSON.stringify(itinerary));
      // Chiavi solo da env: le hardcoded in chiaro nel sorgente sono state rimosse
      const foursquareKey = process.env.FOURSQUARE_API_KEY || process.env.VITE_FOURSQUARE_API_KEY || '';
      const tripadvisorKey = process.env.TRIPADVISOR_API_KEY || process.env.VITE_TRIPADVISOR_API_KEY || '';

      if (enrichedItinerary.giorni) {
        // Concurrency Limit (Issue 24): limitiamo le chiamate parallele per
        // evitare timeout e rate-limiting selvaggio sulle API esterne.
        const CHUNK_SIZE = 5;
        const allTappe = enrichedItinerary.giorni.flatMap((g: any) => g.tappe || []);

        for (let i = 0; i < allTappe.length; i += CHUNK_SIZE) {
          const chunk = allTappe.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (tappa: any) => {
            try {
              const tappaName = tappa.titolo_tappa || tappa.titolo || '';
              if (!tappaName) return;
              const query = encodeURIComponent(tappaName);
              const lat = tappa.coordinate?.lat;
              const lng = tappa.coordinate?.lng || tappa.coordinate?.lon;
              const ll = (lat && lng) ? `${lat},${lng}` : null;

              const [wpRes, wvRes, fsRes, taRes] = await Promise.allSettled([
                axios.get(`https://it.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=false&explaintext=1&format=json&titles=${query}`, { timeout: 3500 }),
                axios.get(`https://it.wikivoyage.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&titles=${query}`, { timeout: 3500 }),
                ll ? axios.get(`https://places-api.foursquare.com/places/search?ll=${ll}&fsq_category_ids=4d4b7105d754a06374d81259,4d4b7104d754a06370d81259&limit=5`, { headers: { Authorization: `Bearer ${foursquareKey}`, Accept: "application/json", "X-Places-Api-Version": "2025-06-17" }, timeout: 3500 }) : Promise.resolve(null),
                ll ? axios.get(`https://api.content.tripadvisor.com/api/v1/location/search?searchQuery=${encodeURIComponent(tappaName + ' ' + destination)}&latLong=${ll}&language=it&key=${tripadvisorKey}`, { timeout: 3500 }) : Promise.resolve(null)
              ]);

              if (wpRes.status === 'fulfilled' && wpRes.value?.data?.query?.pages) {
                const pages = wpRes.value.data.query.pages;
                const pid = Object.keys(pages)[0];
                if (pid && pid !== "-1" && pages[pid]?.extract) tappa.wikipedia_context = pages[pid].extract.substring(0, 2500);
              }
              if (wvRes.status === 'fulfilled' && wvRes.value?.data?.query?.pages) {
                const pages = wvRes.value.data.query.pages;
                const pid = Object.keys(pages)[0];
                if (pid && pid !== "-1" && pages[pid]?.extract) tappa.wikivoyage_context = pages[pid].extract.substring(0, 1200);
              }
              if (fsRes.status === 'fulfilled' && fsRes.value?.data?.results?.length > 0) {
                tappa.foursquare_nearby = fsRes.value.data.results.map((r: any) => `${r.name} (${r.categories?.[0]?.name || 'luogo'})`).join(', ');
              }
              if (taRes.status === 'fulfilled' && taRes.value?.data?.data?.[0]) {
                const loc = taRes.value.data.data[0];
                tappa.tripadvisor_rating = loc.rating;
                tappa.tripadvisor_address = loc.address_obj?.address_string;
                tappa.tripadvisor_reviews_count = loc.num_reviews;
              }
            } catch { /* skip silently */ }
          }));
        }
      }
            console.log("[Premium Guide] Enrichment done. Calling Groq AI...");

      // ── FASE 3: GENERAZIONE AI PARALLELIZZATA (CHUNKED) ──────────────────────
      const PERSONA: Record<string, string> = {
        art:      "Sei un rinomato critico d'arte e storico dell'architettura. La tua prosa è colta, elegante e ricca di riferimenti a movimenti artistici, tecniche costruttive e protagonisti della storia dell'arte.",
        family:   "Sei un genitore esperto di viaggi family. Bilanci dettagli pratici, attività adatte ai bambini di varie età, orari ottimali e consigli salvavita per le famiglie.",
        shopping: "Sei un trendsetter e esperto di design, moda e artigianato locale. Conosci ogni bottega artigianale, ogni mercato autentico, ogni indirizzo esclusivo.",
        food:     "Sei un buongustaio e critico gastronomico di fama nazionale. Conosci ogni ricetta storica, ogni trattoria nascosta, ogni prodotto tipico con le sue origini e varianti regionali.",
        essential:"Sei un logista esperto che ottimizza itinerari. Preciso, pragmatico, forni tutti i dati pratici con accuratezza assoluta."
      };

      // Lingua dell'utente: prima il parametro `language` arrivava dal client
      // ma non entrava MAI nel prompt → guide sempre in italiano per tutti.
      const GUIDE_LANG_NAMES: Record<string, string> = { IT: "italiano", EN: "inglese (English)", FR: "francese (français)", ES: "spagnolo (español)", DE: "tedesco (Deutsch)", RU: "russo (русский)", ZH: "cinese semplificato (简体中文)" };
      const guideLangName = GUIDE_LANG_NAMES[String(language || "IT").toUpperCase()] || "italiano";
      const guideLangRule = guideLangName === "italiano" ? "" : `
LINGUA OBBLIGATORIA: scrivi TUTTI i testi della guida (titoli, descrizioni, curiosità, consigli, info utili) in ${guideLangName}. Le CHIAVI del JSON restano ESATTAMENTE in italiano come da schema.`;

      const baseSystemPrompt = `Sei l'autore principale della prestigiosa collana "WIP Premium Smart Guide" di World in Pocket. ${PERSONA[style] || PERSONA.essential}

Devi creare una GUIDA TURISTICA PROFESSIONALE di altissima qualità sulla destinazione "${destination}", identica nelle caratteristiche editoriali alle migliori guide cartacee (Lonely Planet, National Geographic Traveler).${guideLangRule}

REGOLE ASSOLUTE – VIOLAZIONE = FALLIMENTO TOTALE:
1. "descrizione_lunga": MINIMO 5 paragrafi corposi (450-600 parole totali). Usa narrazione immersiva, cinematografica, sensoriale. Includi storia del luogo, architettura, contesto culturale, atmosfera, aneddoti verificati.
2. "curiosita": Array OBBLIGATORIO di 4-5 curiosità sorprendenti e verificate. Inizia ogni voce con "Sapevi che..." oppure "Un fatto poco noto:". Fatti storici, record, misteri, aneddoti reali.
3. "dettaglio_storico_tecnico": MINIMO 180 parole. Analisi approfondita: date esatte, architetti, materiali, stile architettonico, eventi storici chiave, restauri importanti.
4. "consiglio_insider": MINIMO 120 parole. Consiglio ULTRA-SPECIFICO noto solo ai residenti. Include: orario esatto, percorso alternativo, nome della persona o del locale, dettaglio che fa la differenza.
5. "migliori_piatti": Per ristoranti/bar, array di 3 piatti/drink con nome, descrizione e prezzo indicativo.
6. "tema_giorno": Frase poetica che sintetizza il filo narrativo della giornata.
7. DIVIETO ASSOLUTO: "goditi il panorama", "immergiti nell'atmosfera", "non dimenticare di", "ti consigliamo", frasi generiche.
8. Tutti i dati (indirizzi, orari, prezzi) devono essere REALI e SPECIFICI per "${destination}".
9. Usa il contesto Wikipedia/Wikivoyage/Foursquare/TripAdvisor fornito per dati fattuali verificati.
${ANTI_HALLUCINATION_RULES}

Restituisci SOLO JSON valido, senza markdown, senza testo esterno.`;

      let generatedContent: any = {
         guida_titolo: `${destination} - La Guida Definitiva`,
         sottotitolo: `Un viaggio straordinario a ${destination}`,
         introduzione: "",
         citta_intro: {},
         stile: style,
         giorni: []
      };

      try {
        console.log("[Premium Guide] Starting parallel chunked generation...");
        
        // --- PROMISE 1: Intro e Struttura Generale ---
        const introPrompt = `Genera SOLO l'introduzione e la sezione citta_intro per "${destination}" in stile "${style}".
Restituisci ESATTAMENTE questo schema JSON:
{
  "guida_titolo": "string - titolo poetico",
  "sottotitolo": "string - tagline",
  "introduzione": "string - 3 paragrafi narrativi",
  "citta_intro": {
    "titolo": "string",
    "storia": "string - 3-4 paragrafi sulla storia",
    "cultura_tradizioni": "string - 2-3 paragrafi su costumi e atmosfera",
    "consigli_pratici": "string - 2 paragrafi su clima e trasporti"
  }
}`;

        const introPromise = callUniversalAi(
          "deepseek",
          [
            { role: "system", content: baseSystemPrompt },
            { role: "user", content: introPrompt }
          ],
          {
            response_format: { type: "json_object" },
            temperature: 0.72
          },
          "guida_premium_intro",
          supabaseUrl,
          supabaseServiceKey,
          groq
        ).then(r => {
           try { return JSON.parse(r.data || "{}"); } 
           catch { return {}; }
        }).catch(err => {
           console.error("[Premium Guide] Intro generation failed:", err.message);
           return {};
        });

        // --- PROMISES: Giorni in sotto-blocchi da 2 POI ---
        // deepseek-chat ha un tetto FISICO di 8192 token di output: un giorno
        // intero con 4-5 POI "premium" (450-600 parole l'uno) lo sforava
        // sempre → JSON troncato → parse fallito → "guida incompleta" e
        // rimborso. Ogni chiamata ora genera al massimo 2 POI (~4k token) e i
        // blocchi vengono ricuciti qui, mantenendo il tutto-o-niente per giorno.
        const POI_CHUNK = 2;
        const poiSchema = `{
      "poi_id": "string",
      "titolo": "string - nome ufficiale",
      "categoria_pdf": "string - CATEGORIA MAIUSCOLO",
      "valutazione": 4.5,
      "indirizzo": "string",
      "trasporti": "string",
      "orario_visita": "string",
      "descrizione_lunga": "string - MINIMO 450 parole narrative",
      "curiosita": ["string", "string", "string", "string"],
      "dettaglio_storico_tecnico": "string - MINIMO 180 parole",
      "consiglio_insider": "string - MINIMO 120 parole",
      "migliori_piatti": [],
      "info_utili": { "orari": "string", "best_time": "string", "prezzo": "string", "telefono": "string", "sito_web": "string" }
    }`;

        const dayPromises = (enrichedItinerary.giorni || []).map(async (giorno: any) => {
          const tappe: any[] = giorno.tappe || [];
          const chunks: any[][] = [];
          for (let i = 0; i < tappe.length; i += POI_CHUNK) chunks.push(tappe.slice(i, i + POI_CHUNK));
          if (chunks.length === 0) chunks.push([]);

          const chunkResults = await Promise.all(chunks.map((chunkTappe, ci) => {
            const dayPrompt = `Stai scrivendo il Giorno ${giorno.giorno} ("${giorno.titolo_giorno || ''}") della guida. Questo blocco copre SOLO le tappe ${ci * POI_CHUNK + 1}-${ci * POI_CHUNK + chunkTappe.length} di ${tappe.length} del giorno (le altre sono generate a parte, NON aggiungerle).
Tappe di QUESTO blocco con contesto reale (Wikipedia/Foursquare):
${JSON.stringify(chunkTappe, null, 2)}

RICORDA LE REGOLE: OGNI POI deve avere "descrizione_lunga" di ALMENO 450 parole, 4 curiosità, e "consiglio_insider" specifico.

Restituisci ESATTAMENTE questo schema JSON, con un elemento in "pois" per OGNI tappa del blocco:
{
  "giorno": ${giorno.giorno},
  "titolo_giorno": "string - titolo evocativo dell'INTERA giornata",
  "tema_giorno": "string - frase poetica",
  "pois": [
    ${poiSchema}
  ]
}`;
            return callUniversalAi(
              "deepseek",
              [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: dayPrompt }
              ],
              {
                response_format: { type: "json_object" },
                temperature: 0.72
              },
              "guida_premium_giorno",
              supabaseUrl,
              supabaseServiceKey,
              groq
            ).then(r => {
               try { return JSON.parse(r.data || "{}"); }
               catch { return null; }
            }).catch(err => {
               console.error(`[Premium Guide] Generation failed for Day ${giorno.giorno} block ${ci + 1}:`, err.message);
               return null;
            });
          }));

          // Ricucitura: se anche un solo blocco è nullo o vuoto, il giorno è
          // fallito (il controllo tutto-o-niente a valle rimborsa).
          const mergedPois: any[] = [];
          for (const cr of chunkResults) {
            if (!cr || !Array.isArray(cr.pois) || cr.pois.length === 0) return null;
            mergedPois.push(...cr.pois);
          }
          const firstMeta = chunkResults[0] || {};
          return {
            giorno: giorno.giorno,
            titolo_giorno: firstMeta.titolo_giorno || giorno.titolo_giorno || `Giorno ${giorno.giorno}`,
            tema_giorno: firstMeta.tema_giorno || "",
            pois: mergedPois
          };
        });

        // ESEGUI TUTTO IN PARALLELO
        const [introRes, ...daysRes] = await Promise.all([introPromise, ...dayPromises]);

        // Merge intro
        if (introRes.guida_titolo) generatedContent.guida_titolo = introRes.guida_titolo;
        if (introRes.sottotitolo) generatedContent.sottotitolo = introRes.sottotitolo;
        if (introRes.introduzione) generatedContent.introduzione = introRes.introduzione;
        if (introRes.citta_intro) generatedContent.citta_intro = introRes.citta_intro;

        // Merge giorni
        const requestedDays = (enrichedItinerary.giorni || []).length;
        const validDays = daysRes.filter(d => d && d.pois && Array.isArray(d.pois) && d.pois.length > 0);
        validDays.sort((a, b) => a.giorno - b.giorno);
        generatedContent.giorni = validDays;

        // Tutto-o-niente: prima un giorno fallito veniva semplicemente omesso
        // e l'utente pagava una guida incompleta senza alcun avviso. Ora il
        // fallimento è esplicito e il client rimborsa i crediti.
        if (validDays.length < requestedDays) {
           throw new Error(`Guida incompleta: generati ${validDays.length}/${requestedDays} giorni.`);
        }
        if (generatedContent.giorni.length === 0) {
           throw new Error("Nessun giorno valido generato dall'IA.");
        }

      } catch (err: any) {
        console.error("[Premium Guide] Parallel chunk generation failed:", err);
        throw new Error("Il motore AI ha fallito la generazione a blocchi. Riprova.");
      }

      // ── FASE 5: MEDIA MANIFEST (Wikimedia Commons + Unsplash) ────────────────
      console.log("[Premium Guide] Fetching images...");
      const mediaManifest: Record<string, string> = {};
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

      // Fetch city intro images
      if (generatedContent.citta_intro) {
        try {
          if (unsplashKey) {
            const uRes = await axios.get(
              `https://api.unsplash.com/search/photos?query=${encodeURIComponent(destination + ' city landmark')}&per_page=3&orientation=landscape`,
              { headers: { Authorization: `Client-ID ${unsplashKey}` }, timeout: 4000 }
            ).catch(() => null);
            if (uRes?.data?.results) {
              uRes.data.results.forEach((r: any, i: number) => {
                if (r.urls?.regular) {
                  mediaManifest[`citta_intro_${i + 1}`] = r.urls.regular.split('?')[0] + '?w=1200&h=600&fit=crop&q=90&auto=format';
                }
              });
            }
          }
        } catch { /* skip */ }
      }

      if (generatedContent.giorni) {
        for (const giorno of generatedContent.giorni) {
          for (const poi of (giorno.pois || [])) {
            try {
              let imgUrl: string | null = null;
              const searchTerm = `${poi.titolo} ${destination}`;

              const wmRes = await axios.get(
                `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(poi.titolo)}&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&gsrlimit=5`,
                { timeout: 3500 }
              ).catch(() => null);
              if (wmRes?.data?.query?.pages) {
                for (const page of Object.values(wmRes.data.query.pages) as any[]) {
                  const url = page?.imageinfo?.[0]?.url;
                  if (url && !url.toLowerCase().includes('.svg') && !url.toLowerCase().includes('.ogg') && !url.toLowerCase().includes('.wav')) {
                    imgUrl = url;
                    break;
                  }
                }
              }

              if (!imgUrl && unsplashKey) {
                const uRes = await axios.get(
                  `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchTerm)}&per_page=1&orientation=landscape`,
                  { headers: { Authorization: `Client-ID ${unsplashKey}` }, timeout: 3500 }
                ).catch(() => null);
                const rawUrl = uRes?.data?.results?.[0]?.urls?.regular;
                if (rawUrl) {
                  imgUrl = rawUrl.split('?')[0] + '?w=1200&h=600&fit=crop&q=90&auto=format';
                }
              }

              if (imgUrl && poi.poi_id) mediaManifest[poi.poi_id] = imgUrl;
            } catch { /* skip */ }
          }
        }
      }
      console.log(`[Premium Guide] Images fetched: ${Object.keys(mediaManifest).length}`);

      // ── FASE 6: SALVATAGGIO CACHE SUPABASE ──────────────────────────────────
      const safeHash = hash || `pg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      await axios.post(`${supabaseUrl}/rest/v1/itinerary_guides`, {
        itinerary_hash: safeHash,
        user_id: pmCharge.userId,
        content_data: generatedContent,
        media_manifest: mediaManifest,
        source_itinerary: itinerary,
        stile_guida: style,
        status: 'completed'
      }, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "resolution=merge-duplicates" }
      }).catch(e => console.warn("[Premium Guide] Cache save failed:", e?.message));

      if (quotaRes?.data?.[0]) {
        await axios.patch(`${supabaseUrl}/rest/v1/user_quotas?user_id=eq.${userId}`, {
          premium_guide_used: quotaRes.data[0].premium_guide_used + 1
        }, {
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, Prefer: "return=minimal" }
        }).catch(() => null);
      }

      console.log("[Premium Guide] ✅ Generation complete!");
      res.json({ content: generatedContent, media_manifest: mediaManifest });

    } catch (error: any) {
      console.error("Premium Guide Error:", error);
      // Generazione fallita dopo l'addebito: rimborso server-side.
      if (pmCharge) await refundServer(pmCharge.userId, pmCharge.cost);
      res.status(500).json({ error: error.message || "GENERATION_ERROR" });
    }
  });

  // ── Ticketmaster Events Proxy ──
  app.get("/api/ticketmaster", async (req, res) => {
    try {
      const { lat, lon, radius, startDateTime, endDateTime } = req.query as Record<string, string>;
      const apiKey = process.env.TICKETMASTER_API_KEY || process.env.VITE_TICKETMASTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "TICKETMASTER_API_KEY not configured" });

      const parsedLat = parseFloat(lat) || 0;
      const parsedLon = parseFloat(lon) || 0;
      // Il cap a 100 km troncava in silenzio i chip da 300 e 500 km: l'utente
      // sceglieva un raggio e ne otteneva un altro. Ticketmaster accetta valori
      // ben più ampi, teniamo 500 km come tetto ragionevole.
      const parsedRadius = Math.min(parseFloat(radius) || 50, 500);
      const latlong = `${parsedLat},${parsedLon}`;

      const url = `https://app.ticketmaster.com/discovery/v2/events.json` +
        `?apikey=${apiKey}` +
        `&latlong=${latlong}` +
        `&radius=${parsedRadius}` +
        `&unit=km` +
        `&sort=date,asc` +
        `&size=20` +
        `&locale=it` +
        (startDateTime ? `&startDateTime=${startDateTime}` : '') +
        (endDateTime ? `&endDateTime=${endDateTime}` : '');

      console.log(`[Ticketmaster] Calling: ${url.replace(apiKey, 'REDACTED')}`);
      const tmRes = await axios.get(url, { timeout: 8000 });
      res.json(tmRes.data || {});
    } catch (err: any) {
      console.error(`[Ticketmaster] Proxy Error:`, err.message);
      res.status(500).json({ error: `Ticketmaster service error`, message: err.message });
    }
  });

  // (rotta /api/predicthq rimossa ago 2026: servizio dismesso, chiave revocata)

  // ── TIQETS (biglietti musei e attrazioni) ──────────────────────────────
  // Complementare a Viator/GYG che coprono tour e attività. AFFILIAZIONE: a
  // differenza di GYG (partner_id appeso da noi) il token Tiqets identifica
  // il partner e le product_url restituite dall'API arrivano GIÀ con
  // ?partner=<brand> (verificato: wip-189103) — quelle URL vanno propagate
  // INTATTE ovunque (Eventi, itinerari, schede POI), mai riscritte.
  //
  // Helper unico per tutte le superfici: tab Eventi (/api/tiqets), iniezione
  // negli itinerari e biglietti della scheda POI (/api/poi/tickets).
  async function fetchTiqetsProducts(opts: { lat?: number; lon?: number; cityName?: string; radiusKm?: number; lang?: string; pageSize?: number }): Promise<any[]> {
    const tiqetsKey = process.env.TIQETS_API_KEY || process.env.VITE_TIQETS_API_KEY;
    if (!tiqetsKey) return [];

    // lang=it/en/fr/...: titoli e tagline nella lingua dell'utente
    // (verificato: senza lang l'API risponde in inglese).
    const params: any = {
      page_size: opts.pageSize || 20,
      currency: "EUR",
      lang: String(opts.lang || 'it').slice(0, 2).toLowerCase()
    };
    if (opts.lat !== undefined && opts.lon !== undefined && opts.lat !== null && opts.lon !== null) {
      params.lat = opts.lat;
      params.lng = opts.lon;
      // Tiqets è forte su musei/attrazioni cittadine: raggio contenuto.
      params.max_distance = Math.min(opts.radiusKm || 30, 50);
    } else if (opts.cityName) {
      params.city_name = opts.cityName;
    } else {
      return [];
    }

    const r = await axios.get("https://api.tiqets.com/v2/products", {
      params,
      headers: { Authorization: `Token ${tiqetsKey}`, Accept: "application/json" },
      timeout: 8000
    });

    // Parsing difensivo: la shape esatta dipende dalla versione API.
    const products = r.data?.products || r.data?.data?.products || (Array.isArray(r.data) ? r.data : []);
    return (products || []).map((p: any) => {
      const priceRaw = p.price;
      const price = typeof priceRaw === "number" ? `da €${priceRaw}`
        : priceRaw?.formatted || (priceRaw?.value ? `da €${priceRaw.value}` : "Vedi prezzo");
      const ratingAvg = p.ratings?.average ?? p.rating?.average ?? (typeof p.rating === "number" ? p.rating : null);
      return {
        id: String(p.id || p.product_id || `tiqets-${Math.random().toString(36).slice(2, 8)}`),
        name: p.title || p.name || "Biglietto Tiqets",
        description: p.tagline || p.summary || p.description || "Biglietto d'ingresso per questa attrazione.",
        price,
        duration: p.duration || "",
        rating: ratingAvg ? `${parseFloat(ratingAvg).toFixed(1)} ⭐` : "",
        imageUrl: p.images?.[0]?.large || p.images?.[0]?.medium || p.images?.[0]?.url || p.image_url || "",
        // product_url arriva già col partner: è il link commissionabile.
        url: p.product_url || p.product_checkout_url || "",
        source: "tiqets",
        lat: p.geolocation?.lat || p.venue?.lat || opts.lat || 0,
        lon: p.geolocation?.lng || p.venue?.lon || opts.lon || 0,
        city: p.city_name || p.city || "",
        venue: p.venue?.name || "",
        distanceKm: typeof p.distance === "number" ? p.distance : null
      };
    }).filter((x: any) => x.url);
  }

  /**
   * Ranking dei prodotti Tiqets per un singolo POI: somiglianza del nome
   * (token in comune) + distanza reale. Un biglietto è pertinente se il nome
   * combacia OPPURE se il prodotto è ancorato al POI stesso (≤250 m: la
   * biglietteria non coincide mai col centroide del monumento).
   */
  function rankTiqetsForPoi(products: any[], poiName: string, lat: number, lon: number): any[] {
    const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
    const STOP = new Set(['di', 'del', 'della', 'dei', 'delle', 'the', 'of', 'la', 'il', 'le', 'lo', 'los', 'las', 'el', 'e', 'and', 'de', 'des', 'der', 'die', 'das']);
    const tokens = norm(poiName).split(/\s+/).filter((t: string) => t.length > 2 && !STOP.has(t));
    return (products || [])
      .map((p: any) => {
        const hay = norm(`${p.name} ${p.venue} ${p.description}`);
        const score = tokens.filter((t: string) => hay.includes(t)).length;
        const distM = Math.round(getHaversineDistance(lat, lon, p.lat, p.lon));
        return { ...p, _score: score, _distM: distM };
      })
      .filter((p: any) => p._score > 0 || p._distM <= 250)
      .sort((a: any, b: any) => (b._score - a._score) || (a._distM - b._distM))
      .slice(0, 3)
      .map(({ _score, _distM, ...rest }: any) => ({ ...rest, distanceM: _distM }));
  }

  // Proxy per la tab Eventi (quinta sorgente).
  app.post("/api/tiqets", async (req, res) => {
    try {
      const { lat, lon, radius, lang, cityName } = req.body;
      const parsedLat = parseFloat(lat) || 0;
      const parsedLon = parseFloat(lon) || 0;
      // Coordinate se valide, altrimenti fallback per città (PlanScreen può
      // avere giorni con tappe senza coordinate risolte).
      if ((!parsedLat || !parsedLon) && !cityName) return res.status(400).json({ error: "lat/lon o cityName obbligatori" });
      if (!process.env.TIQETS_API_KEY && !process.env.VITE_TIQETS_API_KEY) {
        return res.status(500).json({ error: "TIQETS_API_KEY non configurata" });
      }

      const results = (await fetchTiqetsProducts(
        parsedLat && parsedLon
          ? { lat: parsedLat, lon: parsedLon, radiusKm: parseFloat(radius) || 30, lang, pageSize: 20 }
          : { cityName: String(cityName), lang, pageSize: 20 }
      )).slice(0, 12);

      console.log(`[Tiqets Proxy] ${results.length} prodotti per (${parsedLat}, ${parsedLon})`);
      res.json(results);
    } catch (err: any) {
      console.error("[Tiqets Proxy] Error:", err.response?.status, err.response?.data?.message || err.message);
      res.status(500).json({ error: "Failed to fetch from Tiqets", message: err.message });
    }
  });

  // ── Biglietti per singolo POI (scheda) ─────────────────────────────────
  // Cache-first su api_cache con chiave per CELLA (~110 m) + lingua + giorno:
  // la chiave giornaliera evita sia i prezzi stantii sia il problema del
  // refresh (saveToCache non fa upsert). Il paniere in cache è GREZZO e
  // riusabile dai POI vicini; il ranking per nome si fa a ogni richiesta.
  app.post("/api/poi/tickets", rateLimiter, async (req, res) => {
    try {
      const { lat, lon, name, lang } = req.body || {};
      const pLat = parseFloat(lat);
      const pLon = parseFloat(lon);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return res.status(400).json({ error: 'lat/lon obbligatori' });
      const langCode = String(lang || 'it').slice(0, 2).toLowerCase();

      const dayBucket = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const cacheKey = `tiqets_poi_${pLat.toFixed(3)}_${pLon.toFixed(3)}_${langCode}_${dayBucket}`;
      const cached = await getFromCache(cacheKey);
      if (cached?.text_content) {
        try {
          const all = JSON.parse(cached.text_content);
          return res.json({ tickets: rankTiqetsForPoi(all, name, pLat, pLon), cached: true });
        } catch { /* cache corrotta: rigenera sotto */ }
      }

      const products = await fetchTiqetsProducts({ lat: pLat, lon: pLon, radiusKm: 2, lang: langCode, pageSize: 20 });
      saveToCache(cacheKey, 'tiqets_poi', JSON.stringify(products));
      res.json({ tickets: rankTiqetsForPoi(products, name, pLat, pLon) });
    } catch (e: any) {
      console.error('[PoiTickets] Errore:', e.message);
      // Best-effort: la scheda POI vive anche senza biglietti.
      res.json({ tickets: [] });
    }
  });

  app.post("/api/viator", async (req, res) => {
    try {
      const { lat, lon, radius, startDate, endDate, cityName } = req.body;
      const parsedLat = parseFloat(lat) || 0;
      const parsedLon = parseFloat(lon) || 0;
      // Viator ragiona per destinazione, non per raggio: il tetto di 50 km
      // serve a non proporre tour di un'altra provincia rispetto al punto
      // che l'utente sta guardando sulla mappa.
      const parsedRadius = Math.min(parseFloat(radius) || 50, 50);

      // La destinazione deve seguire il CENTRO DELLA MAPPA. Se il client non è
      // riuscito a risolverne il nome (rete lenta, reverse fallito) lo
      // ricaviamo qui dalle coordinate, invece di ripiegare su "Italia" e
      // restituire tour a caso.
      let activeCity = cityName && cityName !== "Italia" ? cityName : "";
      if (!activeCity && parsedLat && parsedLon) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${parsedLat}&lon=${parsedLon}&format=json&accept-language=it`,
            { headers: { "User-Agent": "AIAudioGuideApp/1.0" } }
          );
          const geo: any = await geoRes.json();
          activeCity = geo?.address?.city || geo?.address?.town || geo?.address?.village || geo?.address?.county || "";
        } catch (geoErr: any) {
          console.warn("[Viator Proxy] Reverse geocoding fallito:", geoErr?.message);
        }
      }
      if (!activeCity) activeCity = "Italia";

      console.log(`[Viator Proxy] Searching for ${activeCity} (${parsedLat}, ${parsedLon})`);
      const resultsString = await agentTools.searchViatorExperiences(parsedLat, parsedLon, parsedRadius, startDate, endDate, activeCity);

      let results = [];
      try {
        results = JSON.parse(resultsString);
      } catch (e) {
        console.error("[Viator Proxy] Parse error:", e);
        return res.status(500).json({ error: "Invalid Viator response format" });
      }
      res.json(results);
    } catch (err: any) {
      console.error("[Viator Proxy] Error:", err.message);
      res.status(500).json({ error: "Failed to fetch from Viator", message: err.message });
    }
  });


  // ── GetYourGuide Experiences Proxy ──
  app.post("/api/getyourguide", async (req, res) => {
    const GYG_PARTNER_ID = "KYSFZYF";
    try {
      const { lat, lon, radius, cityName } = req.body;
      const parsedLat = parseFloat(lat) || 0;
      const parsedLon = parseFloat(lon) || 0;
      const searchCity = (cityName || "").trim() || "Italia";
      const parsedRadius = Math.min(parseFloat(radius) || 50, 100);

      let activities: any[] = [];
      const gygApiKey = process.env.GYG_API_KEY;

      if (gygApiKey) {
        try {
          const gygUrl = `https://api.getyourguide.com/1/tours?q=${encodeURIComponent(searchCity)}&lat=${parsedLat}&lng=${parsedLon}&radius=${parsedRadius}&limit=20&language=it&currency=EUR`;
          const gygRes = await axios.get(gygUrl, {
            headers: {
              "Accept": "application/json",
              "X-API-KEY": gygApiKey
            },
            timeout: 7000
          });
          activities = gygRes.data?.data?.tours || gygRes.data?.tours || [];
        } catch (e: any) {
          console.warn(`[GYG] API Error:`, e.message);
        }
      }

      if (activities.length > 0) {
        const results = activities.slice(0, 12).map((t: any) => {
          const tourId = t.tour_id || t.id || "";
          let deepUrl = tourId
            ? `https://www.getyourguide.it/tours/${tourId}?partner_id=${GYG_PARTNER_ID}&utm_medium=online_publisher&utm_source=itaintasca`
            : `https://www.getyourguide.it/s/?q=${encodeURIComponent(searchCity)}&partner_id=${GYG_PARTNER_ID}&utm_medium=online_publisher&utm_source=itaintasca`;

          const distKm = (parsedLat && t.latitude && parsedLon && t.longitude)
            ? Math.round(Math.sqrt(Math.pow((t.latitude - parsedLat) * 111, 2) + Math.pow((t.longitude - parsedLon) * 111 * Math.cos(parsedLat * Math.PI / 180), 2)))
            : null;

          return {
            id: tourId || `gyg-${Math.random().toString(36).substr(2,6)}`,
            name: t.title || t.name || "Esperienza GetYourGuide",
            description: t.abstract || t.description || "Scopri questa fantastica attività guidata.",
            price: t.retail_price?.formatted_value ? `${t.retail_price.formatted_value}` : (t.price ? `${t.price}` : "Vedi prezzo"),
            duration: t.duration_formatted || t.duration || "Durata variabile",
            rating: t.reviews_avg ? `${parseFloat(t.reviews_avg).toFixed(1)} ⭐` : "Nuovo",
            imageUrl: t.pictures?.[0]?.url || t.cover_image_url || "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&q=80&w=400",
            url: deepUrl,
            source: "getyourguide",
            distanceKm: distKm,
            lat: t.latitude || parsedLat,
            lon: t.longitude || parsedLon
          };
        });
        return res.json(results);
      }

      // API ufficiale assente o vuota → SCRAPING stile Virgilio + Agnes:
      // esperienze REALI con link profondi già affiliati (cache per città).
      if (activities.length === 0) {
        const scraped = await fetchGygExperiencesScraped(searchCity, 'it');
        if (scraped.length > 0) {
          return res.json(scraped.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: 'Esperienza reale su GetYourGuide.',
            price: s.price || 'Vedi prezzo',
            duration: '',
            rating: '',
            imageUrl: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&q=80&w=400",
            url: s.url,
            source: 'getyourguide',
            distanceKm: null,
            lat: parsedLat,
            lon: parsedLon
          })));
        }
      }

      // Nessun tour reale disponibile (API key assente o risposta vuota).
      // Prima si restituivano TRE ESPERIENZE INVENTATE con prezzi e voti
      // fittizi ("Da 25 EUR", "4.8") che il client mostrava come prenotabili,
      // tutte puntate alla stessa pagina di ricerca: pubblicità ingannevole
      // verso l'utente e dato inutile per il partner. Ora si risponde con una
      // singola voce dichiaratamente di ricerca, che il client può mostrare
      // come link ("Cerca esperienze su GetYourGuide") o ignorare.
      const searchUrl = `https://www.getyourguide.it/s/?q=${encodeURIComponent(searchCity)}&partner_id=${GYG_PARTNER_ID}&utm_medium=online_publisher&utm_source=itaintasca`;
      res.json([{
        id: 'gyg-search',
        name: `Esperienze a ${searchCity} su GetYourGuide`,
        description: 'Sfoglia i tour disponibili direttamente su GetYourGuide.',
        price: '',
        duration: '',
        rating: '',
        imageUrl: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&q=80&w=400",
        url: searchUrl,
        source: "getyourguide",
        distanceKm: null,
        isSearchLink: true,
        isFallback: true
      }]);
    } catch (err: any) {
      console.error("GetYourGuide API proxy error:", err.message);
      res.status(500).json({ error: "Failed to fetch from GetYourGuide" });
    }
  });
  // --- CANCELLAZIONE ACCOUNT (Apple 5.1.1(v) + Google Play Data Safety) ---
  // La sola auth.admin.deleteUser lasciava orfani: vision_cards e
  // api_usage_logs non hanno FK su auth.users, gli oggetti nei bucket storage
  // non si cancellano mai da soli e il cliente Stripe (con eventuale
  // abbonamento attivo) restava vivo. Qui si pulisce tutto PRIMA di eliminare
  // l'utente auth; ogni passo non critico è best-effort.
  async function deleteUserAccountCascade(userId: string): Promise<void> {
    const svcHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };

    // 1) Stripe: il customer va letto PRIMA che user_profiles sparisca col
    //    CASCADE; cancellarlo chiude anche gli abbonamenti attivi.
    try {
      const { data: prof } = await axios.get(
        `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=stripe_customer_id`,
        { headers: svcHeaders }
      );
      const customerId = prof?.[0]?.stripe_customer_id;
      if (customerId && stripeClient) {
        await stripeClient.customers.del(String(customerId));
      }
    } catch (e: any) {
      console.warn('[Delete Account] Pulizia Stripe fallita:', e?.message);
    }

    // 2) RevenueCat: l'app_user_id è lo stesso UUID Supabase (ShopScreen fa
    //    Purchases.logIn(userId)). Best-effort, solo se la chiave è configurata.
    if (process.env.REVENUECAT_API_KEY) {
      try {
        await axios.delete(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
          { headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` } });
      } catch (e: any) {
        console.warn('[Delete Account] Pulizia RevenueCat fallita:', e?.message);
      }
    }

    // 3) Vision pubblicate: foto pubblica via e POI community nascosto.
    //    Il DELETE su shared_pois è bloccato dal trigger di protezione delle
    //    colonne di revisione: si usa is_hidden come per la moderazione.
    try {
      const { data: cards } = await axios.get(
        `${supabaseUrl}/rest/v1/vision_cards?user_id=eq.${userId}&select=id,published_poi_id`,
        { headers: svcHeaders }
      );
      for (const card of cards || []) {
        if (card.published_poi_id && card.published_poi_id === `vision-${card.id}`) {
          await axios.patch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(card.published_poi_id)}`,
            { is_hidden: true }, { headers: svcHeaders }).catch(() => {});
          await axios.delete(`${supabaseUrl}/storage/v1/object/vision-public/vision-${card.id}.jpg`,
            { headers: svcHeaders }).catch(() => {});
        }
      }
    } catch (e: any) {
      console.warn('[Delete Account] Pulizia vision pubbliche fallita:', e?.message);
    }

    // 4) Storage privato: tutto il prefisso vision-photos/<uid>/ (copre anche
    //    upload rimasti senza scheda).
    try {
      const { data: objects } = await axios.post(
        `${supabaseUrl}/storage/v1/object/list/vision-photos`,
        { prefix: `${userId}/`, limit: 1000 },
        { headers: svcHeaders }
      );
      const names = (objects || []).map((o: any) => `${userId}/${o.name}`);
      if (names.length) {
        await axios.delete(`${supabaseUrl}/storage/v1/object/vision-photos`,
          { headers: svcHeaders, data: { prefixes: names } });
      }
    } catch (e: any) {
      console.warn('[Delete Account] Pulizia storage vision-photos fallita:', e?.message);
    }

    // 5) Tabelle senza FK su auth.users (o con cascade non verificata):
    //    delete esplicito, innocuo dove il CASCADE esiste già.
    for (const t of ['vision_cards', 'api_usage_logs', 'saved_pois', 'user_itineraries', 'itinerary_guides', 'user_listening_history']) {
      await axios.delete(`${supabaseUrl}/rest/v1/${t}?user_id=eq.${userId}`, { headers: svcHeaders }).catch(() => {});
    }

    // 6) Utente auth: da qui partono i CASCADE (user_profiles, quote,
    //    crediti…). Unico passo che DEVE riuscire.
    await axios.delete(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { headers: svcHeaders });
  }

  app.post("/api/delete-account", rateLimiter, async (req, res) => {
    try {
      // L'identità viene ricavata SOLO dal token della sessione, mai dal body:
      // prima chiunque poteva cancellare l'account di qualunque utente passando
      // uno userId arbitrario.
      const userId = await verifyUserToken(req);
      if (!userId) return res.status(401).json({ error: "Invalid token" });

      await deleteUserAccountCascade(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete Account error:", err.message);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Cancellazione dal web (wip.guide/delete-account): Google Play impone un
  // percorso utilizzabile senza reinstallare l'app. Verifica email+password
  // (unico metodo di login dell'app) lato server: nessuna chiave Supabase
  // esposta nella pagina statica.
  const webDeleteAttempts = new Map<string, { count: number; resetTime: number }>();
  app.post("/api/account/delete-web", rateLimiter, async (req, res) => {
    try {
      const { email, password, confirm } = req.body || {};
      if (!email || !password || confirm !== true) {
        return res.status(400).json({ error: "missing_fields" });
      }
      // Anti credential-stuffing: 5 tentativi per IP ogni 15 minuti. Come
      // rateLimiter è in-memory (si azzera ai cold start): limite di cortesia.
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown");
      const now = Date.now();
      const att = webDeleteAttempts.get(ip);
      if (!att || now > att.resetTime) {
        webDeleteAttempts.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 });
      } else if (att.count >= 5) {
        return res.status(429).json({ error: "too_many_attempts" });
      } else {
        att.count++;
      }

      let userId: string | null = null;
      try {
        const tokenRes = await axios.post(
          `${supabaseUrl}/auth/v1/token?grant_type=password`,
          { email: String(email).trim(), password: String(password) },
          { headers: { apikey: supabaseServiceKey, 'Content-Type': 'application/json' } }
        );
        userId = tokenRes.data?.user?.id || null;
      } catch {
        userId = null;
      }
      // Risposta identica per "utente inesistente" e "password sbagliata":
      // la pagina non deve fare da oracolo sulle email registrate.
      if (!userId) return res.status(401).json({ error: "invalid_credentials" });

      await deleteUserAccountCascade(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete Account (web) error:", err.message);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // --- SMART ROUTE PLANNER ENDPOINT ---
  app.post("/api/route-pois", async (req, res) => {
    try {
      const { startLat, startLon, endLat, endLon, radius_m = 300 } = req.body;
      if (!startLat || !startLon || !endLat || !endLon) {
        return res.status(400).json({ error: "Missing start or end coordinates" });
      }

      // 1. Get Route from Geoapify
      const apiKey = process.env.GEOAPIFY_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Missing Geoapify key" });
      
      // mode=walk: il corridoio POI deve seguire il percorso PEDONALE, lo
      // stesso su cui naviga WIP Nav (con drive i due tracciati divergevano e
      // i POI selezionati potevano non trovarsi mai sul cammino reale).
      const routeUrl = `https://api.geoapify.com/v1/routing?waypoints=${startLat},${startLon}|${endLat},${endLon}&mode=walk&apiKey=${apiKey}`;
      const routeRes = await axios.get(routeUrl);
      const geometry = routeRes.data?.features?.[0]?.geometry;
      // Geoapify restituisce i percorsi come MultiLineString (una LineString
      // per gamba): il vecchio check solo-LineString falliva SEMPRE — bug
      // latente mai emerso perché il modal non passava mai le coordinate di
      // partenza e questo endpoint non veniva mai davvero chiamato.
      let lineCoords: any[] | null = null;
      if (geometry?.type === 'LineString') {
        lineCoords = geometry.coordinates;
      } else if (geometry?.type === 'MultiLineString') {
        lineCoords = geometry.coordinates.flat();
      }
      if (!lineCoords || lineCoords.length < 2) {
        return res.status(500).json({ error: "Could not calculate route" });
      }

      // 2. Query POIs around midpoint
      const midLat = (startLat + endLat) / 2;
      const midLon = (startLon + endLon) / 2;
      // Math.round: la RPC nearby_pois vuole un INTERO — il prodotto dei
      // gradi dava un raggio frazionario e Postgres rifiutava la chiamata
      // ("invalid input syntax for type").
      const maxDist = Math.round(Math.max(
        Math.abs(startLat - endLat),
        Math.abs(startLon - endLon)
      ) * 111000 + 5000); // rough meters + 5km padding

      const { createClient } = await import('@supabase/supabase-js');
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      const { data: pois, error } = await serviceClient.rpc('nearby_pois', {
        p_lat: midLat,
        p_lon: midLon,
        radius_m: maxDist,
        limit_num: 500
      });
      if (error) throw error;

      // 3. Filter POIs within radius_m of the Polyline using Turf
      const turf = await import('@turf/turf');
      const line = turf.lineString(lineCoords); // [lon, lat]

      const routePois = (pois || []).filter((poi: any) => {
        const point = turf.point([poi.lon, poi.lat]);
        const distance = turf.pointToLineDistance(point, line, { units: 'meters' });
        return distance <= radius_m;
      });

      res.json(routePois);
    } catch (err: any) {
      console.error("Route POIs error:", err.message);
      res.status(500).json({ error: "Failed to fetch route POIs" });
    }
  });

  // --- NATIVE ANDROID BACKGROUND SERVICE ENDPOINT (Overpass Fallback) ---
  app.post("/api/poi/nearby", async (req, res) => {
    try {
      const { lat, lon, radius_m = 2000 } = req.body;
      if (!lat || !lon) return res.status(400).json({ error: "Missing lat/lon" });

      const { createClient } = await import('@supabase/supabase-js');
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      // 1. Query the database using the updated nearby_pois RPC
      const { data: pois, error } = await serviceClient.rpc('nearby_pois', {
        p_lat: lat,
        p_lon: lon,
        radius_m: radius_m,
        limit_num: 60
      });

      if (error) throw error;

      // 2. Overpass Fallback if empty
      if (!pois || pois.length === 0) {
        console.log(`[Nearby] No official POIs found at ${lat}, ${lon} (radius ${radius_m}). Falling back to Overpass...`);
        const overpassQuery = `
[out:json][timeout:25];
(
  node["tourism"~"attraction|museum|viewpoint|monument"](around:${radius_m}, ${lat}, ${lon});
  node["historic"~"monument|castle|ruins|archaeological_site"](around:${radius_m}, ${lat}, ${lon});
);
out body;`;

        const overpassUrl = "https://overpass-api.de/api/interpreter";
        const opRes = await axios.post(overpassUrl, overpassQuery, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const nodes = opRes.data?.elements || [];
        if (nodes.length > 0) {
          console.log(`[Nearby] Found ${nodes.length} Overpass nodes. Saving to DB...`);
          const toInsert = nodes.map((node: any) => ({
            id: `osm-${node.id}`,
            name: node.tags?.name || "Punto di interesse",
            lat: node.lat,
            lon: node.lon,
            category: "gemme",
            originalCategory: "openstreetmap",
            status: "auto",
            enrichment_source: "openstreetmap"
          }));

          // Seeding into the DB
          await serviceClient.from('shared_pois').upsert(toInsert, { onConflict: 'id' });
          
          // Format response
          const result = toInsert.map((item: any) => ({
             id: item.id,
             nome: item.name,
             lat: item.lat,
             lon: item.lon,
             distanza_m: 0, // Approx
             source: "openstreetmap"
          }));
          return res.json(result);
        }
      }

      res.json(pois || []);
    } catch (err: any) {
      console.error("Nearby POI error:", err.message);
      res.status(500).json({ error: "Failed to fetch nearby POIs" });
    }
  });

  // --- OFFLINE AREA BUNDLE ---
  // Manifest paginato del "pacchetto area" per la modalità offline: POI nel
  // raggio (con buffer 10%) + testi completi per il TTS nativo. Nessun binario:
  // il payload resta sotto il limite di 4,5 MB per risposta della lambda Vercel
  // grazie alla paginazione keyset (cursorUpdated/cursorId). Con `since` ritorna
  // solo i POI modificati dopo quella data (delta sync) + le tombstone dei
  // POI cancellati. `meta.generatedAt` va salvato dal client come lastSync.
  app.post("/api/area/bundle", async (req, res) => {
    try {
      const {
        lat, lon,
        radiusKm = 50,
        lang = "it",
        since = null,
        cursorUpdated = null,
        cursorId = null,
        pageSize = 500,
      } = req.body || {};

      if (typeof lat !== "number" || typeof lon !== "number") {
        return res.status(400).json({ error: "Missing lat/lon" });
      }

      const clampedKm = Math.min(Math.max(Number(radiusKm) || 50, 10), 120);
      // Buffer del 10% oltre il raggio scelto: cattura i POI a cavallo del bordo
      const radiusM = Math.round(clampedKm * 1000 * 1.1);
      const pageLimit = Math.min(Math.max(Number(pageSize) || 500, 50), 1000);

      // Timestamp PRIMA della query: se un POI cambia durante il download, il
      // prossimo delta con since=generatedAt lo riprende invece di perderlo.
      const generatedAt = new Date().toISOString();

      const { createClient } = await import('@supabase/supabase-js');
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      const { data: pois, error } = await serviceClient.rpc('area_bundle_pois', {
        p_lat: lat,
        p_lon: lon,
        p_radius_m: radiusM,
        p_lang: lang,
        p_since: since,
        p_cursor_updated: cursorUpdated,
        p_cursor_id: cursorId,
        p_limit: pageLimit,
      });
      if (error) throw error;

      const rows = pois || [];
      const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
      const items = rows.map(({ total_count, ...poi }: any) => poi);
      const last = items[items.length - 1];
      const hasMore = rows.length === pageLimit;

      // Tombstone solo sulla prima pagina di un delta: id dei POI cancellati
      let tombstones: string[] = [];
      if (!cursorUpdated && since) {
        const { data: dead } = await serviceClient
          .from('shared_pois_tombstones')
          .select('id')
          .gt('deleted_at', since)
          .limit(5000);
        tombstones = (dead || []).map((d: any) => d.id);
      }

      res.json({
        meta: {
          center: { lat, lon },
          radiusKm: clampedKm,
          radiusWithBufferM: radiusM,
          lang,
          generatedAt,
          totalCount,
          pageCount: items.length,
          hasMore,
        },
        pois: items,
        tombstones,
        nextCursor: hasMore && last
          ? { cursorUpdated: last.updated_at, cursorId: last.id }
          : null,
      });
    } catch (err: any) {
      console.error("Area bundle error:", err.message);
      res.status(500).json({ error: "Failed to build area bundle" });
    }
  });

  // API Catch-all (to prevent Vite from returning HTML for unmatched /api routes)
  app.post("/api/poi/audioguide/stream", async (req, res) => {
    try {
      const { poiId, poiName, lang = "it", mode = "nicky" } = req.body;
      if (!poiId || !poiName) {
        return res.status(400).json({ error: "poiId and poiName are required." });
      }

      // Check DB per lingua. FIX: la colonna è `guide_character` (non
      // `character`) e `language` è in MAIUSCOLO (IT/EN…) — prima non trovava
      // mai la cache e ricadeva su un "Benvenuto a X" banale.
      const languageDb = String(lang).toUpperCase();
      const guideChar = mode === 'dante' ? 'dante' : 'nicky';
      const url = `${supabaseUrl}/rest/v1/poi_audioguides?poi_id=eq.${encodeURIComponent(poiId)}&language=eq.${languageDb}&guide_character=eq.${guideChar}&select=audio_text&limit=1`;
      const dbRes = await axios.get(url, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
      }).catch(() => null);

      let text = dbRes?.data?.[0]?.audio_text || null;

      // Non in cache: genera/traduce nella lingua (stessa logica del web) dai
      // campi di shared_pois, invece del placeholder, e salva per i prossimi.
      if (!text) {
        const spRes = await axios.get(
          `${supabaseUrl}/rest/v1/shared_pois?id=eq.${encodeURIComponent(poiId)}&select=audio_script,description_long,description_ai,description_short,description&limit=1`,
          { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
        ).catch(() => null);
        const sp = spRes?.data?.[0] || {};
        const base = sp.audio_script || sp.description_long || sp.description_ai || sp.description_short || sp.description || poiName;
        text = await regenerateAudioguideText({ text: base, poiName, mode: guideChar, lang: String(lang).toLowerCase() });
        if (text && text.trim()) {
          await axios.post(
            `${supabaseUrl}/rest/v1/poi_audioguides`,
            { poi_id: poiId, language: languageDb, guide_character: guideChar, audio_text: text, generated_at: new Date().toISOString() },
            { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' } }
          ).catch(() => {});
        } else {
          text = `Benvenuto a ${poiName}!`;
        }
      }

      // Voce nella lingua giusta (prima tutto ciò che non era 'it' → inglese).
      const VOICES: Record<string, { nicky: string; dante: string }> = {
        it: { nicky: "it-IT-ElsaNeural", dante: "it-IT-DiegoNeural" },
        en: { nicky: "en-US-JennyNeural", dante: "en-US-GuyNeural" },
        fr: { nicky: "fr-FR-DeniseNeural", dante: "fr-FR-HenriNeural" },
        es: { nicky: "es-ES-ElviraNeural", dante: "es-ES-AlvaroNeural" },
        de: { nicky: "de-DE-KatjaNeural", dante: "de-DE-ConradNeural" },
        ru: { nicky: "ru-RU-SvetlanaNeural", dante: "ru-RU-DmitryNeural" },
        zh: { nicky: "zh-CN-XiaoxiaoNeural", dante: "zh-CN-YunxiNeural" },
      };
      const voiceName = (VOICES[String(lang).toLowerCase()] || VOICES.it)[guideChar];
      
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.protocol || 'http';
      
      const ttsRes = await axios.post(`${protocol}://${host}/api/tts/smart`, 
        { text, voice: voiceName }, 
        { maxRedirects: 0, validateStatus: (s) => s >= 200 && s < 400 }
      );
      
      if (ttsRes.status === 302 && ttsRes.headers.location) {
          return res.json({ audioUrl: ttsRes.headers.location });
      } else if (ttsRes.data && ttsRes.data.audio_url) {
          return res.json({ audioUrl: ttsRes.data.audio_url });
      } else {
          return res.status(500).json({ error: "No audio URL returned from TTS" });
      }
    } catch (e: any) {
      console.error("[/api/poi/audioguide/stream] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development or local production serving
  const isLocalRun = process.argv.some(arg => arg.includes('server.ts') || arg.includes('server.cjs'));

  if (isLocalRun) {
    if (process.env.NODE_ENV !== "production") {
      (async () => {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        app.listen(PORT, "0.0.0.0", () => {
          console.log(`Server running on http://localhost:${PORT}`);
        });
      })();
    } else {
      // Only serve dist locally
      const distPath = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

