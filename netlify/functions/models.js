// GET /api/models
// Purpose: list available Gemini models (AI Studio) so the UI can choose valid IDs.

const { requireAdmin } = require("./_auth");

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return apiKey;
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const apiKey = getGeminiApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, { method: "GET" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json ? JSON.stringify(json) : `${res.status} ${res.statusText}`;
      throw new Error(`Gemini ListModels error: ${msg}`);
    }

    // Return only useful fields.
    const models = (json?.models || []).map((m) => ({
      name: m.name, // typically "models/<id>"
      displayName: m.displayName || null,
      supportedGenerationMethods: m.supportedGenerationMethods || [],
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ models }),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
};



