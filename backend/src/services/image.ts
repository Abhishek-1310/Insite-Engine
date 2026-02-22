import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

/**
 * Supported image MIME types
 */
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * Check if a content type is a supported image type
 */
export function isSupportedImage(contentType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(contentType as SupportedImageType);
}

/**
 * Extract text/description from an image using Gemini Vision
 * Uses Gemini 1.5 Flash which has native multimodal support
 */
export async function extractTextFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: config.chatModel });

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType,
    },
  };

  const prompt = `Analyze this image thoroughly and extract ALL information from it. Follow these rules:

1. If the image contains text (document, screenshot, receipt, resume, etc.), perform OCR and extract ALL the text exactly as it appears, preserving structure and formatting.
2. If the image is a diagram, chart, or infographic, describe it in detail including all labels, values, and relationships.
3. If the image is a photo or illustration, provide a comprehensive description covering:
   - Main subject and context
   - Any visible text, signs, or labels
   - Key details, colors, and composition
   - Any data or information that can be derived

4. Combine all extracted text and descriptions into a clear, well-structured output.
5. Do NOT add opinions or interpretations — only factual content from the image.

Output the extracted content:`;

  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error("No text could be extracted from the image");
    }

    return text;
  } catch (error) {
    console.error("Error extracting text from image:", error);
    throw new Error(
      `Failed to extract text from image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
