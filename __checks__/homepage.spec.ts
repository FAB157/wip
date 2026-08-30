// Ogni ora: la home si carica DAVVERO nel browser (non solo un 200 HTTP).
// Prende un problema che l'API check non vede: un bundle JS rotto dopo un
// deploy, uno schermo bianco, un errore che impedisce a React di montare.
import { test, expect } from '@playwright/test';

test('WIP · la schermata di accesso si apre', async ({ page }) => {
  const response = await page.goto('https://www.wip.guide');
  expect(response?.status(), 'la home deve rispondere senza errore server').toBeLessThan(400);
  // (30/08/2026) Un browser sintetico è sempre un visitatore anonimo, e da
  // "Accesso obbligatorio: niente modalità ospite" (App.tsx) un utente senza
  // sessione vede SEMPRE LoginScreen, mai la mappa — .leaflet-container non
  // compare mai qui, non è un bug del check. input[type=email] è stabile
  // (indipendente dalla lingua, a differenza del placeholder tradotto).
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
});
