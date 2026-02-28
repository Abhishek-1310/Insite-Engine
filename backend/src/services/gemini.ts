import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

/**
 * Generate embeddings for a text string using Gemini Embedding API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: config.embeddingModel });
  const result = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: 768,
  } as any);
  return result.embedding.values;
}

/**
 * Generate embeddings for multiple text chunks in batch
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: config.embeddingModel });

  const embeddings: number[][] = [];

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((text) => model.embedContent(text))
    );
    embeddings.push(...results.map((r) => r.embedding.values));

    // Small delay between batches to respect rate limits
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return embeddings;
}

/**
 * Generate a chat response using Gemini 1.5 Flash with RAG context
 */
export async function generateChatResponse(
  question: string,
  contextChunks: string[]
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: config.chatModel,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  });

  const context = contextChunks
    .map((chunk, i) => `[Source ${i + 1}]:\n${chunk}`)
    .join("\n\n---\n\n");

  const prompt = `You are an AI assistant called "Insight Engine" that answers questions based ONLY on the provided context from uploaded documents. You are knowledgeable, precise, and helpful.

RULES:
1. ONLY use information from the provided context to answer.
2. If the context doesn't contain enough information to fully answer, say so clearly.
3. Quote or reference specific parts of the context when possible.
4. Be concise but thorough.
5. Format your response with markdown for readability.

CONTEXT FROM DOCUMENTS:
${context}

USER QUESTION:
${question}

ANSWER:`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

/**
 * Generate a streaming chat response using Gemini 1.5 Flash
 */
export async function generateChatResponseStream(
  question: string,
  contextChunks: string[]
): Promise<AsyncGenerator<string>> {
  const model = genAI.getGenerativeModel({
    model: config.chatModel,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  });

  const context = contextChunks
    .map((chunk, i) => `[Source ${i + 1}]:\n${chunk}`)
    .join("\n\n---\n\n");

  const prompt = `You are an AI assistant called "Insight Engine" that answers questions based ONLY on the provided context from uploaded documents. You are knowledgeable, precise, and helpful.

RULES:
1. ONLY use information from the provided context to answer.
2. If the context doesn't contain enough information to fully answer, say so clearly.
3. Quote or reference specific parts of the context when possible.
4. Be concise but thorough.
5. Format your response with markdown for readability.

CONTEXT FROM DOCUMENTS:
${context}

USER QUESTION:
${question}

ANSWER:`;

  const result = await model.generateContentStream(prompt);

  async function* streamGenerator(): AsyncGenerator<string> {
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }

  return streamGenerator();
}
