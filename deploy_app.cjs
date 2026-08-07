const { execSync } = require('child_process');

console.log("🛠️ Inizio Build del Frontend...");
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log("✅ Build completata con successo!");
  
  console.log("📱 Sincronizzazione Android (Capacitor)...");
  execSync('npx cap sync android', { stdio: 'inherit', shell: true });
  console.log("✅ Capacitor Sync completato!");
  
  console.log("🚀 Deploy su Vercel (Production)...");
  execSync('npx vercel --prod --yes', { stdio: 'inherit', shell: true });
  console.log("✅ Deploy completato con successo!");
  
} catch (error) {
  console.error("❌ Errore durante l'esecuzione:", error.message);
  process.exit(1);
}
