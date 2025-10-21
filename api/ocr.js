// api/ocr.js
import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";

// Disable bodyParser (important for file upload)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: "Form parse failed" });
      return;
    }

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const imagePath = files.image[0].filepath;

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an OCR assistant that reads receipts and returns JSON with item names and prices.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all line items and prices as JSON { items:[{name, price}] }" },
              { type: "image_url", image_url: "data:image/jpeg;base64," + fs.readFileSync(imagePath, "base64") },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content);
      res.status(200).json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}
