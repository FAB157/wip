import fs from 'fs';

function replaceSafe(original, target, replacement) {
  let modified = original.split(target).join(replacement);
  const targetCRLF = target.replace(/\n/g, '\r\n');
  modified = modified.split(targetCRLF).join(replacement.replace(/\n/g, '\r\n'));
  return modified;
}

// 1. AgentControls.tsx
let agentContent = fs.readFileSync('src/components/AgentControls.tsx', 'utf8');

const targetProps = `interface AgentControlsProps {
  itineraryId: string;
  userId?: string;
  status: string; // 'active', 'optimizing'
  chatHistory?: { role: 'user' | 'assistant', content: string }[];
}`;
const replacementProps = `interface AgentControlsProps {
  itineraryId: string;
  userId?: string;
  status: string; // 'active', 'optimizing'
  chatHistory?: { role: 'user' | 'assistant', content: string }[];
  language?: string;
}`;

const targetComponent = `export default function AgentControls({ itineraryId, userId, status, chatHistory }: AgentControlsProps) {`;
const replacementComponent = `export default function AgentControls({ itineraryId, userId, status, chatHistory, language = 'IT' }: AgentControlsProps) {`;

const targetFetch = `body: JSON.stringify({
          itineraryId,
          eventMessage,
          chatHistory: messages,
          safeUserId: userId,
          currentLocation
        })`;
const replacementFetch = `body: JSON.stringify({
          itineraryId,
          eventMessage,
          chatHistory: messages,
          safeUserId: userId,
          currentLocation,
          language
        })`;

agentContent = replaceSafe(agentContent, targetProps, replacementProps);
agentContent = replaceSafe(agentContent, targetComponent, replacementComponent);
agentContent = replaceSafe(agentContent, targetFetch, replacementFetch);

fs.writeFileSync('src/components/AgentControls.tsx', agentContent, 'utf8');

// 2. PlanScreen.tsx
let planContent = fs.readFileSync('src/components/PlanScreen.tsx', 'utf8');

const targetAgentCall = `<AgentControls 
          itineraryId={dbItineraryId} 
          userId={currentUserId} 
          status={dynamicItinerary?.status || 'active'} 
          chatHistory={dynamicItinerary?.metadata?.chat_history || []}
        />`;
const replacementAgentCall = `<AgentControls 
          itineraryId={dbItineraryId} 
          userId={currentUserId} 
          status={dynamicItinerary?.status || 'active'} 
          chatHistory={dynamicItinerary?.metadata?.chat_history || []}
          language={language}
        />`;

planContent = replaceSafe(planContent, targetAgentCall, replacementAgentCall);
fs.writeFileSync('src/components/PlanScreen.tsx', planContent, 'utf8');

// 3. premiumGuideService.ts
let premiumContent = fs.readFileSync('src/services/premiumGuideService.ts', 'utf8');

const targetPremiumFunc = `export async function generatePremiumGuide(
  itinerary: any,
  style: GuideStyle,
  userId: string
): Promise<GenerateGuideResult> {`;
const replacementPremiumFunc = `export async function generatePremiumGuide(
  itinerary: any,
  style: GuideStyle,
  userId: string,
  language: string = 'IT'
): Promise<GenerateGuideResult> {`;

const targetPremiumCompute = `const hash = await computeItineraryHash(itinerary, style);`;
const replacementPremiumCompute = `const hash = await computeItineraryHash(itinerary, style + "_" + language);`;

const targetPremiumBody = `body: JSON.stringify({ itinerary, style, userId, hash }),`;
const replacementPremiumBody = `body: JSON.stringify({ itinerary, style, userId, hash, language }),`;

premiumContent = replaceSafe(premiumContent, targetPremiumFunc, replacementPremiumFunc);
premiumContent = replaceSafe(premiumContent, targetPremiumCompute, replacementPremiumCompute);
premiumContent = replaceSafe(premiumContent, targetPremiumBody, replacementPremiumBody);

fs.writeFileSync('src/services/premiumGuideService.ts', premiumContent, 'utf8');

console.log("PlanScreen, AgentControls, and premiumGuideService patched!");
