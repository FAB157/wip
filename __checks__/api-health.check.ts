// Ogni 5 minuti: la rotta /api/health (server.ts) risponde 200 e {ok:true}?
// È il check economico (nessuna API esterna a pagamento coinvolta, un solo
// select su Supabase) pensato apposta per girare spesso — il canarino
// interno che testa Groq/Stripe/Azure/ecc. resta sul cron giornaliero.
import { ApiCheck, AssertionBuilder } from 'checkly/constructs';

new ApiCheck('wip-api-health', {
  name: 'WIP · /api/health raggiungibile',
  activated: true,
  request: {
    method: 'GET',
    url: 'https://www.wip.guide/api/health',
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.ok').equals(true),
      AssertionBuilder.jsonBody('$.checks.db').equals(true),
    ],
  },
});
