const fs = require('fs');
const content = fs.readFileSync('src/components/PlanScreen.tsx', 'utf8');
const lines = content.split('\n');

// Find where to insert (right after AgentControls block)
let insertIndex = lines.findIndex(l => l.includes('chatHistory={dynamicItinerary?.metadata?.chat_history || []}'));
if (insertIndex > -1) {
  insertIndex += 4; // Skip the closing tags of AgentControls
} else {
  // Alternatively search for navModal or premiumGuideModal
  insertIndex = lines.findIndex(l => l.includes('{showPremiumGuideModal && generatedPlan && ('));
  if (insertIndex > -1) {
    insertIndex -= 1; // Insert before Premium Guide Modal
  }
}

const loadingBlock = `
      {loading && (
        <div className="fixed inset-0 z-[100] bg-[#fdfbf7] flex flex-col items-center justify-center p-8 text-[#1e3a8a] overflow-hidden">
          <div className="w-full max-w-2xl h-full flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-6 shrink-0">
              <Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" />
              <span className="font-bold text-sm tracking-widest text-[#d4af37] uppercase">{planLoadingPhrases[planLoadingIndex]}</span>
            </div>
            <div className="flex-1 overflow-y-auto pb-12 w-full text-left font-serif pr-4 relative mask-image-bottom">
              <p className="text-lg md:text-xl text-[#1e3a8a] leading-relaxed whitespace-pre-wrap">
                {streamingText ? (
                  streamingText
                    .replace(/"[A-Za-z0-9_]+":\\s*/g, '')
                    .replace(/[\\[\\]{}]/g, '')
                    .replace(/\\\\n/g, '\\n')
                    .replace(/\\\\"/g, '"')
                    .replace(/",/g, '\\n')
                    .replace(/^"/gm, '')
                    .replace(/"$/gm, '')
                    .replace(/,/g, '')
                    .trim()
                ) : (
                  <TypewriterFallbackText language={language} />
                )}
              </p>
              {/* Il cursore lampeggiante */}
              <span className="inline-block w-2.5 h-5 bg-[#d4af37] animate-pulse ml-1 align-middle"></span>
            </div>
          </div>
        </div>
      )}
`;

lines.splice(insertIndex, 0, loadingBlock);
fs.writeFileSync('src/components/PlanScreen.tsx', lines.join('\n'));
console.log('Restored loading block!');
