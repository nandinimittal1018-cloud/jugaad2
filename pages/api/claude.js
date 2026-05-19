// pages/api/claude.js
// Secure proxy — receives requests from the frontend, adds the secret API key,
// and forwards to Anthropic. The key is NEVER sent to the browser.

import Anthropic from "@anthropic-ai/sdk";

// Increase body size limit to handle base64 skin-photo uploads (~5-8 MB)
export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

const anthropic = new Anthropic();
// ↑ Reads ANTHROPIC_API_KEY from .env.local automatically

export default async function handler(req, res) {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, system, max_tokens, model } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const response = await anthropic.messages.create({
      model:      model      || "claude-sonnet-4-20250514",
      max_tokens: max_tokens || 1024,
      messages,
      ...(system ? { system } : {}),
    });

    // Return the full Anthropic response — the frontend reads response.content[0].text
    return res.status(200).json(response);

  } catch (err) {
    console.error("[/api/claude] error:", err?.status, err?.message);

    const status = err?.status || 500;
    const message =
      status === 401 ? "Invalid API key. Check ANTHROPIC_API_KEY in .env.local."
      : status === 429 ? "Rate limit hit. Wait a moment and try again."
      : status === 529 ? "Anthropic is overloaded right now. Try again shortly."
      : err?.message || "Anthropic API error";

    return res.status(status).json({ error: message });
  }
}
