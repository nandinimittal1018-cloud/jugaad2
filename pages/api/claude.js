// pages/api/claude.js
// Secure proxy for Anthropic Claude (PHC AI Triage System)

import Anthropic from "@anthropic-ai/sdk";

// Allow large image uploads (base64)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `
You are a medical triage assistant for rural healthcare workers.

You MUST return ONLY valid JSON in this format:

{
  "triage": "EMERGENCY | PHC | HOME_CARE",
  "diagnosis": ["string"],
  "steps": ["string"],
  "red_flags": ["string"],
  "confidence": number,
  "explanation": "string"
}

STRICT RULES:
- Output ONLY JSON (no markdown, no text outside JSON)
- Always include diagnosis, steps, triage
- If life-threatening symptoms exist, choose EMERGENCY
- Be concise, practical, and medically safe
`;

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, message, image, max_tokens, model, system } = req.body;

    // Support both old + new frontend formats
    const userText =
      message ||
      messages?.[0]?.content ||
      "Analyze this medical case";

    const content = [
      {
        type: "text",
        text: userText,
      },
    ];

    // Attach image if present (base64 only)
    if (image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: image,
        },
      });
    }

    const response = await anthropic.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: max_tokens || 1024,
      system: system || SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    });

    const rawText = response.content?.[0]?.text || "";

    // Try JSON parse
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      parsed = null;
    }

    // Helper: extract fallback lists
    const extractList = (text, keyword) => {
      const regex = new RegExp(
        `${keyword}[:\\-]\\s*([\\s\\S]*?)(\\n\\n|$)`,
        "i"
      );
      const match = text.match(regex);

      if (!match) return [];

      return match[1]
        .split("\n")
        .map((s) => s.replace(/[-•]/g, "").trim())
        .filter(Boolean);
    };

    // Final normalized response (CRITICAL FIX)
    const normalized = parsed || {
      triage: "PHC",
      diagnosis: extractList(rawText, "diagnosis"),
      steps: extractList(rawText, "steps"),
      red_flags: [],
      confidence: 0.5,
      explanation: rawText,
    };

    return res.status(200).json(normalized);
  } catch (err) {
    console.error("[claude.js error]", err);

    const status = err?.status || 500;

    return res.status(status).json({
      error: "AI processing failed",
      triage: "PHC",
      diagnosis: [],
      steps: ["Retry analysis"],
      red_flags: [],
      confidence: 0.2,
      explanation: "System error occurred",
    });
  }
}
