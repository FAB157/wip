const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Replace callGroqWithFallback with callUniversalAi
const oldGroqHelper = `// --- CENTRAL AI HELPER WITH FALLBACK & TOKEN TRACKING ---
async function callGroqWithFallback(
  groqInstance: any,
  messages: any[],
  baseModel: string = "llama-3.3-70b-versatile",
  fallbackModel: string = "mixtral-8x7b-32768",
  options: any = {},
  featureContext: string = "general",
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  let finalModel = baseModel;
  let responseData: any;
  let tokensUsed = 0;
  let textContent = "";

  try {
    const r = await groqInstance.chat.completions.create({
      messages,
      model: baseModel,
      ...options
    });
    responseData = r;
    textContent = r.choices?.[0]?.message?.content || "";
    tokensUsed = r.usage?.total_tokens || 0;
  } catch (err: any) {
    console.warn(\`[Groq AI] \${baseModel} failed: \${err.message}. Trying Together AI fallback...\`);
    const togetherKey = process.env.TOGETHER_API_KEY || process.env.VITE_TOGETHER_API_KEY;
    
    if (togetherKey) {
      try {
        finalModel = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";
        console.log(\`[Together AI] Calling \${finalModel}...\`);
        
        const togetherOptions: any = {
          model: finalModel,
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 8000
        };
        
        if (options.response_format && options.response_format.type === "json_object") {
          togetherOptions.response_format = { type: "json_object" };
        }

        const togetherRes = await axios.post("https://api.together.xyz/v1/chat/completions", togetherOptions, {
          headers: {
            "Authorization": \`Bearer \${togetherKey}\`,
            "Content-Type": "application/json"
          }
        });
        
        textContent = togetherRes.data.choices?.[0]?.message?.content || "";
        responseData = togetherRes.data;
        tokensUsed = togetherRes.data.usage?.total_tokens || 0;
      } catch (togetherErr: any) {
        console.warn(\`[Together AI] Fallback failed: \${togetherErr.message}. Let Gemini handle it.\`);
        throw togetherErr;
      }
    } else {
      console.warn("[Together AI] Key not found, throwing error to trigger Gemini fallback.");
      throw err;
    }
  }

  // Log token usage to Supabase
  try {
    const modelApiName = finalModel.includes('llama') ? 'groq_llama' : 'groq_mixtral';
    await axios.post(\`\${supabaseUrl}/rest/v1/api_usage_logs\`, {
      api_name: modelApiName,
      feature_context: featureContext,
      cost_estimation: 0.005,
      tokens_used: tokensUsed,
      success: true
    }, {
      headers: { apikey: supabaseServiceKey, Authorization: \`Bearer \${supabaseServiceKey}\` }
    });
  } catch (e: any) {
    console.debug(\`[Telemetry] Token logging skipped:\`, e.message);
  }

  // Ensure the caller gets 'data' property because the callers in server.ts expect response.data
  return {
    ...responseData,
    data: textContent
  };
}`;

const newUniversalHelper = `// --- CENTRAL AI HELPER WITH FALLBACK & TOKEN TRACKING ---
async function callUniversalAi(
  primaryEngine: "deepseek" | "groq" | "together",
  messages: any[],
  options: any = {},
  featureContext: string = "general",
  supabaseUrl: string,
  supabaseServiceKey: string,
  groqInstance: any = null
) {
  let finalModel = "";
  let responseData: any;
  let tokensUsed = 0;
  let textContent = "";

  const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY || process.env.VITE_TOGETHER_API_KEY;

  if (primaryEngine === "deepseek" || primaryEngine === "groq") {
     let tryFirst = primaryEngine === "deepseek" ? "deepseek" : "groq";
     let trySecond = primaryEngine === "deepseek" ? "groq" : "deepseek";

     // Attempt 1
     try {
       if (tryFirst === "deepseek" && deepseekKey) {
          finalModel = "deepseek-chat";
          const res = await axios.post("https://api.deepseek.com/chat/completions", {
            model: "deepseek-chat",
            messages,
            response_format: options.response_format,
            temperature: options.temperature || 0.7
          }, { headers: { "Authorization": \`Bearer \${deepseekKey}\` } });
          textContent = res.data.choices?.[0]?.message?.content || "";
          responseData = res.data;
          tokensUsed = res.data.usage?.total_tokens || 0;
       } else if (tryFirst === "groq" && groqInstance) {
          finalModel = options.model || "llama-3.3-70b-versatile";
          const r = await groqInstance.chat.completions.create({
            messages,
            model: finalModel,
            ...options
          });
          textContent = r.choices?.[0]?.message?.content || "";
          responseData = r;
          tokensUsed = r.usage?.total_tokens || 0;
       } else {
          throw new Error(\`\${tryFirst} key missing\`);
       }
     } catch (e1: any) {
       console.warn(\`[Universal AI] \${tryFirst} failed: \${e1.message}. Trying \${trySecond}...\`);
       
       // Attempt 2
       try {
         if (trySecond === "deepseek" && deepseekKey) {
            finalModel = "deepseek-chat";
            const res = await axios.post("https://api.deepseek.com/chat/completions", {
              model: "deepseek-chat",
              messages,
              response_format: options.response_format,
              temperature: options.temperature || 0.7
            }, { headers: { "Authorization": \`Bearer \${deepseekKey}\` } });
            textContent = res.data.choices?.[0]?.message?.content || "";
            responseData = res.data;
            tokensUsed = res.data.usage?.total_tokens || 0;
         } else if (trySecond === "groq" && groqInstance) {
            finalModel = options.model || "llama-3.3-70b-versatile";
            const r = await groqInstance.chat.completions.create({
              messages,
              model: finalModel,
              ...options
            });
            textContent = r.choices?.[0]?.message?.content || "";
            responseData = r;
            tokensUsed = r.usage?.total_tokens || 0;
         } else {
            throw new Error(\`\${trySecond} key missing\`);
         }
       } catch (e2: any) {
         console.warn(\`[Universal AI] \${trySecond} failed too: \${e2.message}. Bubble to Gemini...\`);
         throw e2; 
       }
     }
  } else if (primaryEngine === "together") {
     if (togetherKey) {
       try {
         finalModel = options.model || "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";
         const togetherOptions: any = {
           model: finalModel,
           messages: messages,
           temperature: options.temperature || 0.7,
           max_tokens: options.max_tokens || 8000
         };
         if (options.response_format?.type === "json_object") {
           togetherOptions.response_format = { type: "json_object" };
         }
         const res = await axios.post("https://api.together.xyz/v1/chat/completions", togetherOptions, {
           headers: { "Authorization": \`Bearer \${togetherKey}\` }
         });
         textContent = res.data.choices?.[0]?.message?.content || "";
         responseData = res.data;
         tokensUsed = res.data.usage?.total_tokens || 0;
       } catch (e: any) {
         console.warn(\`[Universal AI] Together failed: \${e.message}. Bubble to Gemini...\`);
         throw e;
       }
     } else {
       throw new Error("Together AI key missing");
     }
  }

  // Telemetry
  try {
    await axios.post(\`\${supabaseUrl}/rest/v1/api_usage_logs\`, {
      api_name: finalModel.includes('deepseek') ? 'deepseek_chat' : (finalModel.includes('llama') ? 'groq_llama' : 'together_ai'),
      feature_context: featureContext,
      cost_estimation: 0.005,
      tokens_used: tokensUsed,
      success: true
    }, {
      headers: { apikey: supabaseServiceKey, Authorization: \`Bearer \${supabaseServiceKey}\` }
    });
  } catch (e: any) {}

  return { ...responseData, data: textContent };
}`;

content = content.replace(oldGroqHelper, newUniversalHelper);

// 2. Replace usages of callGroqWithFallback
content = content.replace(
  /callGroqWithFallback\(\s*groq,\s*messages,\s*"(.*?)",\s*".*?",\s*(.*?),\s*"(.*?)",\s*supabaseUrl,\s*supabaseServiceKey\s*\)/g,
  (match, baseModel, options, context) => {
    return `callUniversalAi("groq", messages, ${options}, "${context}", supabaseUrl, supabaseServiceKey, groq)`;
  }
);
content = content.replace(
  /callGroqWithFallback\(\s*groq,\s*messages,\s*(.*?),\s*"(.*?)",\s*supabaseUrl,\s*supabaseServiceKey\s*\)/g,
  (match, options, context) => {
    return `callUniversalAi("groq", messages, ${options}, "${context}", supabaseUrl, supabaseServiceKey, groq)`;
  }
);

fs.writeFileSync('server.ts', content, 'utf8');
console.log('Patch complete.');
