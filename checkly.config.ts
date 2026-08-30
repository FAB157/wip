// =====================================================================
// ITAINTA · Checkly — controlli sintetici esterni su www.wip.guide
// (30/08/2026, richiesta utente: "un tool che verifica giornalmente il
// corretto funzionamento dell'app").
//
// Diverso dal canarino interno (server.ts, /api/canary/run, cron 5:00):
// quello testa DAL DI DENTRO 17 API a pagamento (Groq, Stripe, Azure...).
// Questo testa DA FUORI, come farebbe un utente vero — se www.wip.guide non
// risponde per un problema di DNS, certificato, Vercel giù, o un deploy
// rotto, il canarino interno non se ne accorgerebbe mai (gira sullo stesso
// server che è giù). Due reti di sicurezza indipendenti, non doppioni.
//
// Tetto piano gratuito Hobby (verificato 29/08/2026): 10.000 run API/mese,
// 1.000 run browser/mese, frequenza minima 2 minuti. Il check API ogni 5
// minuti consuma ~8.640 run/mese (sotto 10.000); il check browser ogni ora
// ~720 run/mese (sotto 1.000). Margine voluto, non al limite.
//
// Setup (va fatto UNA VOLTA dal titolare dell'account, non da qui):
//   npx checkly login        (apre il browser, crea/collega l'account)
//   npx checkly test         (esegue i check in locale, senza pubblicarli)
//   npx checkly deploy       (pubblica i check — da lì partono gli alert email)
import { defineConfig } from 'checkly';
import { Frequency, EmailAlertChannel } from 'checkly/constructs';

// (30/08/2026) Un check che fallisce senza un canale di alert collegato non
// avvisa NESSUNO — resta solo nella dashboard finché qualcuno non la apre.
// Il commento sopra diceva "da lì partono gli alert email" ma non c'era
// nessun EmailAlertChannel: bug trovato e corretto lo stesso giorno.
const email = new EmailAlertChannel('wip-email-alert', {
  address: 'marmidicarrara@gmail.com',
  sendRecovery: true,   // avvisa anche quando torna verde, non solo quando si rompe
  sendFailure: true,
  sendDegraded: false,  // "degradato" (più lento del solito) non è un guasto
});

export default defineConfig({
  projectName: 'WIP - World in Pocket',
  logicalId: 'wip-guide-monitoring',
  repoUrl: 'https://github.com/',
  checks: {
    frequency: Frequency.EVERY_5M,
    locations: ['eu-west-1', 'eu-central-1'],
    tags: ['wip', 'produzione'],
    runtimeId: '2024.02',
    checkMatch: '__checks__/**/*.check.ts',
    alertChannels: [email],
    browserChecks: {
      frequency: Frequency.EVERY_1H,
      testMatch: '__checks__/**/*.spec.ts',
      alertChannels: [email],
    },
  },
  cli: {
    runLocation: 'eu-west-1',
  },
});
