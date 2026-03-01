import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

/**
 * Generate embeddings using Gemini REST API v1beta directly
 * The embedContent endpoint requires v1beta for gemini-embedding-001
 */
async function callEmbeddingAPI(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.embeddingModel}:embedContent?key=${config.geminiApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${config.embeddingModel}`,
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as { embedding: { values: number[] } };
  return data.embedding.values;
}

/**
 * Generate embeddings for a text string using Gemini Embedding API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return callEmbeddingAPI(text);
}

/**
 * Generate embeddings for multiple text chunks in batch
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const embedding = await callEmbeddingAPI(texts[i]);
    embeddings.push(embedding);

    // Small delay between requests to respect rate limits
    if (i < texts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
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
