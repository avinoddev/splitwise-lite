// /api/ocr.js
import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Read raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyStr = Buffer.concat(chunks).toString("utf8");
    const { imageBase64 } = JSON.parse(bodyStr || "{}");

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: "OPENAI_API_KEY not set on server" });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Ask model to return clean JSON
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an OCR and receipt parser. Return strict JSON only.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extract all purchasable line items from this receipt. " +
                "Ignore subtotal, tax, tip, payment and store info. " +
                "Return JSON of the form: {\"items\":[{\"name\":\"string\",\"price\":number}]} " +
                "Use a number for price (no currency sign).",
            },
            { type: "image_url", image_url: imageBase64 },
          ],
        },
      ],
      temperature: 0,
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { items: [] };
    }

    // Basic normalization guard
    if (!Array.isArray(parsed.items)) parsed.items = [];
    parsed.items = parsed.items
      .map((it) => ({
        name: String(it.name || "").trim(),
        price: Number(it.price || 0),
      }))
      .filter((it) => it.name && isFinite(it.price) && it.price > 0);

    res.status(200).json(parsed);
  } catch (e) {
    console.error("OCR API error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
