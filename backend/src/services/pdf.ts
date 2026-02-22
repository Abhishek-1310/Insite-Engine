import { config } from "../config";

export interface TextChunk {
  text: string;
  index: number;
}

/**
 * Extract text from a PDF buffer using pdf-parse
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid issues with pdf-parse in Lambda
  const pdfParse = require("pdf-parse");

  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error(
      `Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Split text into overlapping chunks for embedding
 */
export function chunkText(
  text: string,
  chunkSize: number = config.chunkSize,
  overlap: number = config.chunkOverlap
): TextChunk[] {
  // Clean the text
  const cleanedText = text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  if (cleanedText.length === 0) {
    return [];
  }

  if (cleanedText.length <= chunkSize) {
    return [{ text: cleanedText, index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleanedText.length) {
    let end = start + chunkSize;

    // Try to break at a sentence boundary
    if (end < cleanedText.length) {
      const lastPeriod = cleanedText.lastIndexOf(".", end);
      const lastNewline = cleanedText.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize * 0.5) {
        end = breakPoint + 1;
      }
    }

    const chunkText = cleanedText.slice(start, end).trim();

    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        index: index++,
      });
    }

    start = end - overlap;

    // Prevent infinite loop
    if (start >= cleanedText.length || end >= cleanedText.length) {
      break;
    }
  }

  return chunks;
}
