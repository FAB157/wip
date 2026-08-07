const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

// 1. In generate-daily-podcast, change the order
content = content.replace(
  `if (process.env.DEEPSEEK_API_KEY) {
        const { data } = await axios.post("https://api.deepseek.com/chat/completions", {`,
  `if (process.env.TOGETHER_API_KEY) {
        const { data } = await axios.post("https://api.together.xyz/v1/chat/completions", {
          model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.7
        }, { headers: { Authorization: \`Bearer \${process.env.TOGETHER_API_KEY}\` } });
        podcastText = data.choices[0].message.content;
      } else if (process.env.DEEPSEEK_API_KEY) {
        const { data } = await axios.post("https://api.deepseek.com/chat/completions", {`
);

// We must also remove the old `else if (process.env.TOGETHER_API_KEY)` block down there to prevent duplication.
content = content.replace(
  `} else if (process.env.TOGETHER_API_KEY) {
        const { data } = await axios.post("https://api.together.xyz/v1/chat/completions", {
          model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.7
        }, { headers: { Authorization: \`Bearer \${process.env.TOGETHER_API_KEY}\` } });
        podcastText = data.choices[0].message.content;
      }`,
  `}`
);

// 2. We can also change the default engine in `callLLM` to "together" if it's currently something else, but it might be safer to replace the default argument.
// Let's find: `async function callLLM(\n  messages: any[],\n  options: any = {},\n  primaryEngine: string = "deepseek",`
content = content.replace(
  `primaryEngine: string = "deepseek",`,
  `primaryEngine: string = "together",`
);

fs.writeFileSync(serverFile, content, 'utf8');
console.log("Together AI set as default.");
