const fs = require('fs');
try {
  fs.copyFileSync('server.ts.fixed', 'server.ts');
  console.log("Success");
} catch (e) {
  console.error("Failed", e);
}
