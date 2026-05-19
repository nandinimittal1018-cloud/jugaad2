// Visit http://localhost:3000/api/health to verify the server is running
// and the API key is configured correctly.
export default function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY || "";
  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    apiKey: !key
      ? "❌ MISSING — add ANTHROPIC_API_KEY to .env.local"
      : key.startsWith("sk-ant-")
      ? "✅ present and looks valid"
      : "⚠️  present but wrong format (should start with sk-ant-)",
  });
}
