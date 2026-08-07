const { execSync } = require('child_process');

try {
  console.log('Avvio deploy Vercel in corso...');
  execSync('vercel.cmd --prod --yes', { stdio: 'inherit' });
  console.log('Deploy completato con successo!');
} catch (error) {
  console.error('Errore durante il deploy:', error.message);
  process.exit(1);
}
