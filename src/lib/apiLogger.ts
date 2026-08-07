import { supabase } from './supabase';

/**
 * Helper function to track and log external API consumption with context.
 * Writes records to the api_usage_logs table.
 * 
 * @param apiName The name of the API (e.g., 'overpass', 'google_places', 'ticketmaster', 'gemini_vision')
 * @param featureContext The specific function/screen scatering the usage (e.g., 'mappa_ricerca', 'dettaglio_poi', 'eventi_scraping')
 */
export async function logApiCall(apiName: string, featureContext: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || 'anonymous';
    
    // Ensure the feature context has the proper format for AdminApiStats parser
    let finalContext = featureContext;
    if (!finalContext.includes('| Target:')) {
      // Try to extract a target from featureContext if possible, otherwise use a generic name
      const targetName = finalContext.split('_').pop() || 'Generale';
      finalContext = `${finalContext} | Target: ${targetName}`;
    }
    if (!finalContext.includes('| User:')) {
      finalContext = `${finalContext} | User: ${userId}`;
    }

    // user_id in colonna dedicata quando l'utente è reale: il pannello admin
    // aggrega e cerca per email da qui (il "| User:" nel testo resta solo per
    // compatibilità con i log storici).
    const realUserId = userId && userId !== 'anonymous' && userId !== 'mock-user-id' ? userId : null;
    const { error } = await supabase
      .from('api_usage_logs')
      .insert([
        {
          api_name: apiName,
          feature_context: finalContext,
          user_id: realUserId,
          created_at: new Date().toISOString()
        }
      ]);
    if (error) {
      console.warn(`[Telemetry] Failed to log API usage for ${apiName}:`, error.message);
    } else {
      console.log(`[Telemetry] Successfully logged API: ${apiName} (${finalContext})`);
    }
  } catch (err: any) {
    console.debug(`[Telemetry] logApiCall skipped:`, err.message);
  }
}
