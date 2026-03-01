import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { isYouTubeUrl, fetchYouTubeTranscript } from "../services/youtube";
import { chunkText } from "../services/pdf";
import { generateEmbeddings } from "../services/gemini";
import { upsertVectors, VectorMetadata } from "../services/pinecone";
import { jsonResponse, errorResponse, parseBody } from "../utils/response";

interface IngestUrlRequest {
  url: string;
}

/**
 * Handler: Ingest content from a YouTube URL
 * POST /ingest-url
 *
 * Flow:
 * 1. Validate the YouTube URL
 * 2. Fetch transcript/captions
 * 3. Chunk the transcript text
 * 4. Generate embeddings via Gemini
 * 5. Upsert vectors into Pinecone
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const { url } = parseBody<IngestUrlRequest>(event);

    // Validate input
    if (!url || url.trim().length === 0) {
      return errorResponse(400, "URL is required");
    }

    // Validate YouTube URL
    if (!isYouTubeUrl(url)) {
      return errorResponse(
        400,
        "Invalid URL. Only YouTube links are supported (youtube.com/watch?v=..., youtu.be/...)"
      );
    }

    console.log(`🎬 Processing YouTube URL: ${url}`);

    // Step 1: Fetch transcript
    console.log("Step 1: Fetching YouTube transcript...");
    const { text, title, videoId } = await fetchYouTubeTranscript(url);
    console.log(
      `Fetched transcript for "${title}" (${text.length} characters)`
    );

    if (text.trim().length === 0) {
      return errorResponse(
        422,
        "No transcript available for this video. It may not have captions enabled."
      );
    }

    // Step 2: Chunk text
    console.log("Step 2: Chunking transcript...");
    const chunks = chunkText(text);
    console.log(`Created ${chunks.length} chunks`);

    // Step 3: Generate embeddings
    console.log("Step 3: Generating embeddings via Gemini...");
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);
    console.log(`Generated ${embeddings.length} embeddings`);

    // Step 4: Upsert into Pinecone
    const documentId = uuidv4();
    const documentName = `🎬 ${title}`;

    console.log("Step 4: Upserting vectors into Pinecone...");
    const vectors = chunks.map((chunk, i) => ({
      id: `${documentId}_chunk_${chunk.index}`,
      values: embeddings[i],
      metadata: {
        text: chunk.text,
        documentId,
        documentName,
        chunkIndex: chunk.index,
        totalChunks: chunks.length,
        uploadedAt: new Date().toISOString(),
      } as VectorMetadata,
    }));

    await upsertVectors(vectors);

    console.log(
      `✅ Successfully processed YouTube video "${title}": ${chunks.length} chunks ingested`
    );

    return jsonResponse(200, {
      message: "YouTube video processed successfully",
      documentId,
      documentName,
      videoId,
      chunksCreated: chunks.length,
      transcriptLength: text.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("❌ Error processing YouTube URL:", message);
    if (
      message.includes("No captions") ||
      message.includes("transcript") ||
      message.includes("subtitles")
    ) {
      return errorResponse(
        422,
        "No transcript available for this video. Please try a video with captions/subtitles enabled."
      );
    }
    return errorResponse(500, "Failed to process YouTube video", message);
  }
}
