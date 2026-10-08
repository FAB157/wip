// Ogni ora: la home si carica DAVVERO nel browser (non solo un 200 HTTP).
// Prende un problema che l'API check non vede: un bundle JS rotto dopo un
// deploy, uno schermo bianco, un errore che impedisce a React di montare.
import { test, expect } from '@playwright/test';

test('WIP · la prima schermata renderizza', async ({ page }) => {
  const response = await page.goto('https://www.wip.guide');
  expect(response?.status(), 'la home deve rispondere senza errore server').toBeLessThan(400);
  // (30/08/2026) Deliberatamente NON si naviga oltre la primissima
  // schermata (onboarding o login, a seconda del localStorage - Checkly e'
  // sempre vuoto, quindi e' sempre l'onboarding). Due tentativi scartati,
  // verificati dal vivo con Chrome DevTools:
  //  1. Cliccare "Salta" e aspettare l'input email di LoginScreen: il form
  //     e' avvolto in <motion.form initial={{opacity:0}}> (Framer Motion,
  //     requestAnimationFrame) - la scheda del browser sintetico non ha mai
  //     il focus, Chrome rallenta i rAF in background, e l'animazione non
  //     arriva mai a opacity:1. Risultato incoerente run dopo run (a volte
  //     "hidden", a volte "detached"): non un guasto dell'app - un browser
  //     reale la mostra subito - ma dell'ambiente del check.
  //  2. toBeAttached() invece di toBeVisible(): stessa incoerenza, perche'
  //     il problema non era la CSS-visibility ma il timing del click.
  // "World in Pocket" (OnboardingCarousel.tsx) e' testo semplice, non
  // animato, presente al primissimo paint: basta a dimostrare che il bundle
  // ha caricato e React ha montato, che e' tutto quello che questo check
  // deve provare - non l'intero flusso onboarding→login.
  await expect(page.getByText(/world in pocket/i).first()).toBeAttached({ timeout: 20000 });
});
