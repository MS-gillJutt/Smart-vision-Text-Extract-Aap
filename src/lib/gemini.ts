import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface OCRResult {
  rawText: string;
  meaningfulText: string;
  urduSummary: string;
}

export async function extractTextFromImage(base64Data: string, mimeType: string): Promise<OCRResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Extract all text from this image and provide a meaningful interpretation in both English and Urdu. 
  
Guidelines for rawText:
1. Analyze the spatial arrangement of text elements in the image.
2. If the text appears as a contiguous block (e.g., a single block of text like a book page, letter, or article), output it as a single paragraph.
3. If the text elements are scattered (e.g., multiple distinct text boxes, headlines, captions, menu items, or labels), output them as separate paragraphs. 
4. Use double newlines (\\n\\n) to separate these distinct paragraphs.

Guidelines for meaningfulText:
1. Provide a concise, meaningful summary or interpretation of the extracted text in English.
2. Explain the context (e.g., "This is a business card for...", "This is a restaurant receipt showing...", "This is a warning sign about...").

Guidelines for urduSummary:
1. Provide a clear and concise summary or explanation of the extracted text in Urdu (اردو).
2. Ensure it helps Urdu-speaking users understand the context and key information of the data.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data.split(",")[1],
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rawText: {
              type: Type.STRING,
              description: "The accurately extracted text from the image, formatted with paragraphs.",
            },
            meaningfulText: {
              type: Type.STRING,
              description: "A meaningful interpretation or summary of the extracted text in English.",
            },
            urduSummary: {
              type: Type.STRING,
              description: "A meaningful interpretation or summary of the extracted text in Urdu.",
            },
          },
          required: ["rawText", "meaningfulText", "urduSummary"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      rawText: result.rawText || "No text found.",
      meaningfulText: result.meaningfulText || "No interpretation available.",
      urduSummary: result.urduSummary || "اردو خلاصہ دستیاب نہیں ہے۔",
    };
  } catch (e: any) {
    console.error("Gemini API Error:", e);
    
    // Check for specific error types if possible
    const errorMessage = e?.message || "An unexpected error occurred during processing.";
    
    if (errorMessage.includes("quota")) {
      throw new Error("API quota exceeded. Please try again later.");
    }
    
    if (errorMessage.includes("safety")) {
      throw new Error("The image was flagged by safety filters. Please try a different image.");
    }

    throw new Error(errorMessage);
  }
}
