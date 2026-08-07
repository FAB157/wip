const fs = require('fs');
const content = fs.readFileSync('src/components/PlanScreen.tsx', 'utf8');
const lines = content.split('\n');

const blockToInsert = `        )}
      </AnimatePresence>

      {dbItineraryId && generatedPlan && plannerMode === 'view' && (
        <AgentControls 
          itineraryId={dbItineraryId} 
          userId={currentUserId} 
          status={dynamicItinerary?.status || 'active'} 
          chatHistory={dynamicItinerary?.metadata?.chat_history || []}
          language={language}
        />
      )}`;

const replacementLines = blockToInsert.split('\n');
lines.splice(3477, 3, ...replacementLines);

fs.writeFileSync('src/components/PlanScreen.tsx', lines.join('\n'));
console.log('Fixed missing closing tags');
