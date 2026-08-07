const { execSync } = require('child_process');
try {
  const out = execSync('npx vite build', { encoding: 'utf-8', stdio: 'pipe' });
  console.log("OUT:", out);
} catch (e) {
  console.log("ERR:", e.stderr);
  console.log("OUT2:", e.stdout);
}
