export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    method: req.method,
    nodeVersion: process.version,
    hasNotionToken: !!process.env.NOTION_TOKEN,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
}
