import { Router } from "express";
import Groq from "groq-sdk";
import rateLimit from "express-rate-limit";

const router = Router();

const claudeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
const MODEL = "llama-3.3-70b-versatile";

function safeParse(text: string) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

async function generateText(prompt: string, system?: string): Promise<string> {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const res = await groq.chat.completions.create({ model: MODEL, messages });
  return res.choices[0]?.message?.content || "";
}

router.post("/claude", claudeRateLimit, async (req, res) => {
  try {
    const { messages, system, message, image, mediaType } = req.body;

    // Multi-turn chat (pregnancy flow and general messages array)
    if (messages && Array.isArray(messages) && messages.length > 0) {
      const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [];
      if (system) chatMessages.push({ role: "system", content: system });
      for (const m of messages as Array<{ role: string; content: string }>) {
        chatMessages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        });
      }
      const result = await groq.chat.completions.create({ model: MODEL, messages: chatMessages });
      const text = result.choices[0]?.message?.content || "";
      return res.status(200).json({ content: [{ type: "text", text }] });
    }

    if (!message && !image) {
      return res.status(400).json({ error: "No message or image provided" });
    }

    // Image analysis — use vision model
    if (image) {
      const mimeType = mediaType || "image/jpeg";
      const result = await groq.chat.completions.create({
        model: "llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${image}` },
              },
              {
                type: "text",
                text: `You are a medical image analysis assistant for rural India ASHA workers.
Analyse this skin/medical image and respond with ONLY valid JSON (no markdown, no extra text):
{
  "triage": "EMERGENCY" or "PHC" or "HOME_CARE",
  "diagnosis": ["primary finding in plain language"],
  "steps": ["step 1", "step 2", "step 3"],
  "red_flags": ["any danger signs present"],
  "confidence": <number 0-100>,
  "explanation": "1-2 sentence plain language explanation for ASHA worker"
}`,
              },
            ],
          },
        ],
      });
      const rawText = result.choices[0]?.message?.content || "";
      const parsed = safeParse(rawText);
      return res.status(200).json({
        triage:      parsed?.triage      || "PHC",
        diagnosis:   parsed?.diagnosis   || ["Unable to analyse image"],
        steps:       parsed?.steps       || ["Consult PHC doctor"],
        red_flags:   parsed?.red_flags   || [],
        confidence:  parsed?.confidence  || 0,
        explanation: parsed?.explanation || rawText || "Analysis inconclusive",
      });
    }

    // Symptom triage
    const isTriageCall = message.includes("Age:") && message.includes("Symptoms:");
    if (isTriageCall) {
      const rawText = await generateText(
        message,
        `You are a medical triage assistant for rural India ASHA workers.
Respond with ONLY valid JSON (no markdown, no extra text):
{
  "level": "RED" or "YELLOW" or "GREEN",
  "condition": "most likely condition in 3-5 words",
  "confidence": <number 0-100>,
  "first_aid": ["step 1", "step 2", "step 3"],
  "call_108": true or false,
  "extra_symptom": "one symptom that would increase confidence"
}
RED = life-threatening emergency. YELLOW = needs PHC visit. GREEN = home care.`
      );
      const parsed = safeParse(rawText);
      return res.status(200).json({
        level:         parsed?.level         || "YELLOW",
        condition:     parsed?.condition     || "Unable to determine",
        confidence:    parsed?.confidence    || 0,
        first_aid:     parsed?.first_aid     || ["Check vitals", "Contact PHC doctor", "Monitor closely"],
        call_108:      parsed?.call_108      || false,
        extra_symptom: parsed?.extra_symptom || "",
      });
    }

    // General chat / copilot / doctor chat
    const rawText = await generateText(
      message,
      `You are Dr. Meena Singh, PHC doctor at Barmer, Rajasthan, and an expert ASHA worker assistant.
Reply in simple conversational Hindi (or English if the question is in English).
Be warm, practical, and direct. Keep responses under 120 words.
For emergencies always mention calling 108. No markdown formatting.`
    );

    return res.status(200).json({
      explanation: rawText || "Maafi, abhi jawab dene mein mushkil aa rahi hai. Dobara try karein.",
    });

  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    req.log.error({ err }, "[/api/claude] error");

    const msg = e?.message || "Server error";
    const isAuth = msg.includes("quota") || msg.includes("billing") || msg.includes("API key") || msg.includes("invalid_api_key");
    const explanation = isAuth
      ? "Groq API key issue. Check that GROQ_API_KEY is valid."
      : msg;

    return res.status(200).json({
      level: "YELLOW", condition: "Unable to analyse", confidence: 0,
      first_aid: ["Check vitals", "Contact PHC doctor", "Monitor closely"],
      call_108: false, extra_symptom: "",
      triage: "PHC", diagnosis: ["Analysis failed"], steps: ["Retry", "Contact PHC"],
      red_flags: [], explanation,
    });
  }
});

export default router;
