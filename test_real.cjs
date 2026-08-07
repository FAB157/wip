const { searchViatorExperiences } = require('./dist/server.cjs').agentTools || {};
async function run() {
  const result = await searchViatorExperiences(41.9028, 12.4964, 100, '2026-06-23', '2026-07-23', 'Roma');
  console.log(result);
}
run();
