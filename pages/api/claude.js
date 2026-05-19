// pages/api/claude.js — FIXED

import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

const anthropic = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, system, max_tokens, model, message, image } = req.body;

    // ── BUG 1 FIX ─────────────────────────────────────────────────────────────
    // The old claude.js expected { message, image } (its own custom format)
    // BUT the frontend sends { messages: [...], system, max_tokens } — the full
    // Anthropic messages array. The backend was completely ignoring `messages`
    // and building its own content array from `message` (a string), which meant
    // triage / chat / help / pregnancy all got the wrong data or nothing at all.
    //
    // FIX: if `messages` array is present (all calls except image), use it
    // directly. Only fall back to the { message, image } format if needed.
    // ──────────────────────────────────────────────────────────────────────────

    let finalMessages;
    let finalSystem = system || undefined;

    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Standard path: frontend sent a full messages array (triage, chat, help, pregnancy)
      finalMessages = messages;
    } else if (message || image) {
      // Legacy / image path: build messages from { message, image }
      const content = [];
      if (message) content.push({ type: "text", text: message });
      if (image) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: req.body.mediaType || "image/jpeg",
            data: image,
          },
        });
      }
      finalMessages = [{ role: "user", content }];
    } else {
      return res.status(400).json({ error: "No messages or message provided" });
    }

    // ── BUG 2 FIX ─────────────────────────────────────────────────────────────
    // The old code had a hardcoded SYSTEM_PROMPT that forced JSON output in a
    // specific shape { triage, diagnosis, steps, red_flags, confidence, explanation }
    // BUT the frontend renders result.level / result.condition / result.first_aid
    // / result.call_108 — completely different field names. This caused the result
    // screen to render blank/undefined for every field.
    //
    // FIX: pass through the system prompt from the frontend if provided,
    // otherwise use no system prompt. The prompts in the component already ask
    // for the correct JSON schema with the right field names.
    // ──────────────────────────────────────────────────────────────────────────

    const response = await anthropic.messages.create({
      model:      model      || "claude-sonnet-4-20250514",
      max_tokens: max_tokens || 1024,
      messages:   finalMessages,
      ...(finalSystem ? { system: finalSystem } : {}),
    });

    // ── BUG 3 FIX ─────────────────────────────────────────────────────────────
    // The old code called safeParse() and normalizeResponse() which transformed
    // the raw Anthropic response into a different shape, then returned THAT.
    // But the frontend reads data.content[0].text (for most calls) or reads
    // data.triage / data.diagnosis etc. (for triage). This mismatch meant the
    // frontend never got parseable data.
    //
    // FIX: return the full raw Anthropic response. The frontend already knows
    // how to read response.content[0].text and parse the JSON from it.
    // ──────────────────────────────────────────────────────────────────────────

    return res.status(200).json(response);

  } catch (err) {
    console.error("[/api/claude] error:", err?.status, err?.message);

    const status = err?.status || 500;
    const message =
      status === 401 ? "Invalid API key. Check ANTHROPIC_API_KEY in .env.local."
      : status === 429 ? "Rate limit hit. Wait a moment and try again."
      : status === 529 ? "Anthropic is overloaded. Try again shortly."
      : err?.message || "Anthropic API error";

    return res.status(status).json({ error: message });
  }
}
