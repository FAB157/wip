const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf-8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('app = express()') || l.includes('export { app }') || l.includes('export default app') || l.includes('export const app')) {
    console.log(`${i}: ${l.trim()}`);
  }
});
