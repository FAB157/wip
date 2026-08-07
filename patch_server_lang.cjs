const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// 1. Fix /api/groq/itinerary
const targetGroqItinerary = `const { destination, days, interests, pois, lockedStops, specialRequests, startTime, endTime, budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY", mese, includeEvents, includeTours } = req.body;`;
const replacementGroqItinerary = `const { destination, days, interests, pois, lockedStops, specialRequests, startTime, endTime, budget = "standard", viaggiatori = "solo", ritmo = "standard", guida = "NICKY", mese, includeEvents, includeTours, userLanguage = "IT" } = req.body;`;

const targetCacheKey = "const cacheKeyStr = `itinerary_${destination}_${days}_${(pois||[]).join('_')}_${(interests||[]).join('_')}_${tInizio}_${tFine}_${specialRequests||''}`;";
const replacementCacheKey = "const cacheKeyStr = `itinerary_${destination}_${days}_${(pois||[]).join('_')}_${(interests||[]).join('_')}_${tInizio}_${tFine}_${specialRequests||''}_${userLanguage}`;";

const targetPrompt = `let prompt = "";
      if (guida === "DANTE") {`;
const replacementPrompt = `let prompt = "";
      ragInstruction += \`\\nATTENZIONE: Genera l'intero itinerario (titoli, descrizioni, note) ESCLUSIVAMENTE NELLA LINGUA: \${userLanguage}.\\n\`;
      
      if (guida === "DANTE") {`;

content = content.replace(targetGroqItinerary, replacementGroqItinerary);
content = content.replace(targetCacheKey, replacementCacheKey);
content = content.replace(targetPrompt, replacementPrompt);


// 2. Fix Chatbot /api/optimize-itinerary language parameter
const targetChatbotDestruct = `const { itineraryId, eventMessage, chatHistory, safeUserId, currentLocation } = req.body;`;
const replacementChatbotDestruct = `const { itineraryId, eventMessage, chatHistory, safeUserId, currentLocation, language = "IT" } = req.body;`;

const targetChatbotPrompt = `Rispondi SEMPRE nella lingua dell'utente.`;
const replacementChatbotPrompt = `Rispondi SEMPRE rigorosamente in lingua: \${language}.`;

content = content.replace(targetChatbotDestruct, replacementChatbotDestruct);
content = content.replace(targetChatbotPrompt, replacementChatbotPrompt);

// 3. Fix Premium Guide
const targetPremiumGenerate = `const { itinerary, style, userId, hash } = req.body;`;
const replacementPremiumGenerate = `const { itinerary, style, userId, hash, language = "IT" } = req.body;`;

const targetPremiumPrompt = `DEVE ESSERE FORMATTATO IN MARKDOWN VALIDO. NON USARE HTML.`;
const replacementPremiumPrompt = `DEVE ESSERE FORMATTATO IN MARKDOWN VALIDO. NON USARE HTML.
4. LINGUA OBBLIGATORIA: Scrivi l'intera guida (introduzione, descrizioni, curiosità) RIGOROSAMENTE IN LINGUA: \${language}.`;

content = content.replace(targetPremiumGenerate, replacementPremiumGenerate);
content = content.replace(targetPremiumPrompt, replacementPremiumPrompt);


fs.writeFileSync('server.ts', content, 'utf8');
console.log("server.ts patched successfully for multilingual support!");
