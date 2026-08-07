async function getFreeModels() {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  const data = await response.json();
  const freeModels = data.data.filter((m: any) => parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0);
  console.log("Free models on OpenRouter:");
  freeModels.forEach((m: any) => console.log(`- ${m.id}`));
}
getFreeModels();
