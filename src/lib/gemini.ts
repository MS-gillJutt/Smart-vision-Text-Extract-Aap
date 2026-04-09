import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface OCRResult {
  rawText: string;
  meaningfulText: string;
  urduSummary: string;
}

export async function processFileWithAI(data: string | { text: string }, mimeType: string): Promise<OCRResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analyze the provided content (image or document) and provide a structured summary in both English and Urdu.

Guidelines for rawText:
1. If this is an image, extract all text accurately.
2. If this is a document, provide the full extracted text or a comprehensive transcription.
3. Analyze the spatial arrangement or logical flow.
4. Use double newlines (\\n\\n) to separate distinct paragraphs or sections.

Guidelines for meaningfulText (English Summary):
1. Provide a detailed, structured summary of the content in English using Markdown.
2. Use headings (###), bullet points, and bold text to organize information like chapters or key sections.
3. Explain the context and main points clearly.

Guidelines for urduSummary (Urdu Summary):
1. Provide a clear, detailed, and structured summary of the content in Urdu (اردو) using Markdown.
2. Use headings (###), bullet points, and bold text.
3. Ensure it helps Urdu-speaking users understand the context and key information in a structured way.`;

  try {
    const parts: any[] = [];
    
    if (typeof data === 'string') {
      // Base64 data (Image or PDF)
      parts.push({
        inlineData: {
          data: data.split(",")[1],
          mimeType,
        },
      });
    } else {
      // Extracted text (Word or PPTX)
      parts.push({ text: `Extracted Document Content:\n\n${data.text}` });
    }
    
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts,
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rawText: {
              type: Type.STRING,
              description: "The accurately extracted text or transcription.",
            },
            meaningfulText: {
              type: Type.STRING,
              description: "A structured Markdown summary in English with headings and bullet points.",
            },
            urduSummary: {
              type: Type.STRING,
              description: "A structured Markdown summary in Urdu with headings and bullet points.",
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
    
    const errorMessage = e?.message || "An unexpected error occurred during processing.";
    
    if (errorMessage.includes("quota")) {
      throw new Error("API quota exceeded. Please try again later.");
    }
    
    if (errorMessage.includes("safety")) {
      throw new Error("The content was flagged by safety filters. Please try different content.");
    }

    throw new Error(errorMessage);
  }
}

export async function askQuestionAboutContent(content: string | { text: string }, question: string, mimeType: string): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `The user has a question about the provided content. 
  
Question: "${question}"

Guidelines for your response:
1. Answer the question accurately based ONLY on the provided content.
2. Provide a structured, clear, and concise answer.
3. Use Markdown (headings, bullet points) if the answer is long or complex.
4. If the answer is not in the content, politely say so.
5. Provide the answer in English, and if the user's original query was in Urdu or if the content is primarily Urdu, provide a translation in Urdu as well.`;

  try {
    const parts: any[] = [];
    
    if (typeof content === 'string') {
      parts.push({
        inlineData: {
          data: content.split(",")[1],
          mimeType,
        },
      });
    } else {
      parts.push({ text: `Document Content:\n\n${content.text}` });
    }
    
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts,
      },
    });

    return response.text || "I couldn't generate an answer. Please try again.";
  } catch (e: any) {
    console.error("Gemini Q&A Error:", e);
    throw new Error(e?.message || "Failed to get an answer from the AI.");
  }
}
