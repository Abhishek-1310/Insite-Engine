import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { generateEmbedding } from "../services/gemini";
import { generateChatResponse } from "../services/gemini";
import { queryVectors } from "../services/pinecone";
import { jsonResponse, errorResponse, parseBody } from "../utils/response";

interface AskRequest {
  question: string;
  documentId?: string; // Optional: filter to specific document
}

/**
 * Handler: Answer questions using RAG
 * POST /ask
 *
 * Flow:
 * 1. Convert question to embedding vector
 * 2. Query Pinecone for top-K most relevant chunks
 * 3. Send question + context to Gemini 1.5 Flash
 * 4. Return the generated answer
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const { question, documentId } = parseBody<AskRequest>(event);

    // Validate input
    if (!question || question.trim().length === 0) {
      return errorResponse(400, "Question is required");
    }

    if (question.length > 2000) {
      return errorResponse(400, "Question must be under 2000 characters");
    }

    console.log(`📝 Question received: "${question}"`);
    if (documentId) {
      console.log(`🔍 Filtering to document: ${documentId}`);
    }

    // Step 1: Convert question to embedding
    console.log("Step 1: Generating question embedding...");
    const questionEmbedding = await generateEmbedding(question);

    // Step 2: Query Pinecone for relevant chunks
    console.log("Step 2: Querying Pinecone for relevant chunks...");
    const filter = documentId
      ? { documentId: { $eq: documentId } }
      : undefined;

    const results = await queryVectors(
      questionEmbedding,
      3,
      filter as Record<string, string> | undefined
    );

    if (results.length === 0) {
      return jsonResponse(200, {
        answer:
          "I don't have any relevant documents to answer your question. Please upload some documents first.",
        sources: [],
        question,
      });
    }

    console.log(
      `Found ${results.length} relevant chunks (scores: ${results.map((r) => r.score.toFixed(3)).join(", ")})`
    );

    // Step 3: Extract context from results
    const contextChunks = results.map((r) => r.metadata.text);
    const sources = results.map((r) => ({
      documentName: r.metadata.documentName,
      documentId: r.metadata.documentId,
      chunkIndex: r.metadata.chunkIndex,
      score: r.score,
    }));

    // Step 4: Generate answer using Gemini
    console.log("Step 3: Generating answer with Gemini 1.5 Flash...");
    const answer = await generateChatResponse(question, contextChunks);

    console.log("✅ Answer generated successfully");

    return jsonResponse(200, {
      answer,
      sources,
      question,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("❌ Error in /ask handler:", message);
    return errorResponse(500, "Failed to generate answer", message);
  }
}
