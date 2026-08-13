// Supabase Deno Edge Function: generate-poi-audio
// Integrates with Azure Cognitive Services Speech Services REST API for advanced Neural TTS in 6 languages.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const azureSpeechKey = Deno.env.get("AZURE_SPEECH_KEY") || "";
const azureSpeechRegion = Deno.env.get("AZURE_SPEECH_REGION") || "westeurope";

serve(async (req) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // SICUREZZA: prima QUALSIASI chiamante con la anon key pubblica poteva far
    // scrivere audio/URL arbitrari in shared_pois e caricare file nello storage
    // (backdoor service-role). Ora serve la service role key (server/cron) o un
    // JWT di un utente ADMIN; la sola anon key pubblica viene rifiutata.
    {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY") || "";
      const authClient = createClient(supabaseUrl, supabaseServiceKey);
      let authorized = !!token && !!supabaseServiceKey && token === supabaseServiceKey;
      if (!authorized && token && token !== anonKey) {
        try {
          const { data: { user } } = await authClient.auth.getUser(token);
          if (user) {
            const { data: prof } = await authClient.from("user_profiles").select("is_admin").eq("id", user.id).single();
            authorized = prof?.is_admin === true;
          }
        } catch (_e) { /* non autorizzato */ }
      }
      if (!authorized) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    const { poi_id, text, voice_mode = "nicky", lang = "it", audio_type = "short" } = await req.json();

    if (!poi_id || !text) {
      return new Response(JSON.stringify({ error: "Missing required parameters: poi_id, text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Voice mapping for Nicky/Dante across all 6 languages
    const voiceMapping: Record<string, { nicky: string; dante: string }> = {
      it: { nicky: "it-IT-ElsaNeural", dante: "it-IT-DiegoNeural" },
      en: { nicky: "en-US-JennyNeural", dante: "en-US-GuyNeural" },
      fr: { nicky: "fr-FR-DeniseNeural", dante: "fr-FR-HenriNeural" },
      es: { nicky: "es-ES-ElviraNeural", dante: "es-ES-AlvaroNeural" },
      ru: { nicky: "ru-RU-SvetlanaNeural", dante: "ru-RU-DmitryNeural" },
      zh: { nicky: "zh-CN-XiaoxiaoNeural", dante: "zh-CN-YunxiNeural" },
      de: { nicky: "de-DE-KatjaNeural", dante: "de-DE-ConradNeural" },
    };

    const targetLang = lang.toLowerCase();
    const voiceConfig = voiceMapping[targetLang] || voiceMapping["it"];
    const voiceName = voice_mode === "dante" ? voiceConfig.dante : voiceConfig.nicky;
    const voiceLocale = voiceName.substring(0, 5); // e.g. "it-IT"

    // 1. Synthesize Speech using Azure Neural TTS REST API
    const azureUrl = `https://${azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = `<speak version='1.0' xml:lang='${voiceLocale}'><voice xml:lang='${voiceLocale}' name='${voiceName}'><break time="200ms"/>${text}<break time="200ms"/></voice></speak>`;

    const azureRes = await fetch(azureUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": azureSpeechKey,
        "Content-Type": "application/ssml+xml",
        "X-Search-AppId": "07D3224E30D24E3A900A7D40CC567F4F",
        "X-Search-ClientID": "1E2EE58E5E7E4EDFA6D7F605A707AA5F",
        "User-Agent": "WorldInPocketEdgeFunction/1.0",
      },
      body: ssml,
    });

    if (!azureRes.ok) {
      const errText = await azureRes.text();
      throw new Error(`Azure Neural TTS request failed: ${azureRes.statusText} - ${errText}`);
    }

    const audioBuffer = await azureRes.arrayBuffer();

    // 2. Generate detailed Speech Marks JSON dynamically for seamless visual Karaoke sync
    const speechMarks = generateSpeechMarks(text);
    const speechMarksText = JSON.stringify(speechMarks);

    // Ensure storage bucket public policy
    const filenameAudio = `audio_${poi_id}_${targetLang}_${voice_mode}.mp3`;
    const filenameMarks = `marks_${poi_id}_${targetLang}_${voice_mode}.json`;

    // 3. Upload files to public Supabase Storage Bucket 'poi_audio'
    const audioUpload = await supabase.storage
      .from("poi_audio")
      .upload(filenameAudio, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (audioUpload.error) {
      throw new Error(`Supabase Audio Upload failed: ${audioUpload.error.message}`);
    }

    const marksUpload = await supabase.storage
      .from("poi_audio")
      .upload(filenameMarks, new TextEncoder().encode(speechMarksText), {
        contentType: "application/json",
        upsert: true,
      });

    if (marksUpload.error) {
      throw new Error(`Supabase Speech Marks Upload failed: ${marksUpload.error.message}`);
    }

    // Get public URL of the uploaded audio file
    const { data: publicUrlData } = supabase.storage
      .from("poi_audio")
      .getPublicUrl(filenameAudio);

    const publicAudioUrl = publicUrlData?.publicUrl;

    // 4. Update the shared_pois table with the newly generated audio URL
    const updateFields: Record<string, any> = {
      audio_url: publicAudioUrl
    };
    if (audio_type === "long") {
      updateFields.audio_url_long = publicAudioUrl;
    } else {
      updateFields.audio_url_short = publicAudioUrl;
    }

    const { error: dbError } = await supabase
      .from("shared_pois")
      .update(updateFields)
      .eq("id", poi_id);

    if (dbError) {
      throw new Error(`Database Update failed: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Audio generated and cached successfully!",
        audio_url: publicAudioUrl,
        speech_marks: speechMarks,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    // Dettaglio solo nei log; al client un messaggio generico.
    console.error("[generate-poi-audio] Edge Function Error:", err);
    return new Response(JSON.stringify({ error: "audio_generation_failed" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

// Dynamic Speech Marks generator based on standard reading speed and punctuation pauses
function generateSpeechMarks(text: string): any[] {
  const words = text.split(/\s+/);
  let currentTime = 0;
  const marks = [];
  let charOffset = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;

    // Clean word from punctuation for the matching value
    const cleanWord = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    const hasPause = w.includes(".") || w.includes("?") || w.includes("!");
    const hasComma = w.includes(",") || w.includes(";");

    // Standard word reading time is estimated as ~300ms + character length weight
    const duration = cleanWord.length * 40 + 120;
    const start = text.indexOf(w, charOffset);
    const end = start + w.length;
    
    if (start !== -1) {
      charOffset = end;
    }

    marks.push({
      time: currentTime,
      type: "Word",
      start: start !== -1 ? start : charOffset,
      end: end !== -1 ? end : charOffset + w.length,
      value: cleanWord,
    });

    currentTime += duration;
    
    // Add realistic pause spacing
    if (hasPause) {
      currentTime += 450; // Pause at end of sentence
    } else if (hasComma) {
      currentTime += 250; // Pause at commas
    } else {
      currentTime += 60; // Standard inter-word delay
    }
  }

  return marks;
}
