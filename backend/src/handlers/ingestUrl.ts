import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import {
  isYouTubeUrl,
  extractVideoId,
  fetchTranscript,
  fetchVideoTitle,
} from "../services/youtube";
import { chunkText } from "../services/pdf";
import { generateEmbeddings } from "../services/gemini";
import { upsertVectors, VectorMetadata } from "../services/pinecone";
import { jsonResponse, errorResponse, parseBody } from "../utils/response";

interface IngestUrlRequest {
  url: string;
  transcript?: string; // optional — if not provided, Lambda fetches it
  title?: string;
}

/**
 * Handler: Ingest a YouTube video
 * POST /ingest-url
 *
 * The transcript is fetched server-side using the youtube-transcript package
 * (same approach as Python's youtube_transcript_api).
 * If the frontend already provides a transcript, it will be used instead.
 *
 * Steps:
 *   1. Validate URL
 *   2. Fetch transcript (server-side via youtube-transcript package)
 *   3. Chunk the transcript text
 *   4. Generate embeddings via Gemini
 *   5. Upsert vectors into Pinecone
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const { url, transcript: providedTranscript, title: providedTitle } =
      parseBody<IngestUrlRequest>(event);

    // Validate URL
    if (!url || url.trim().length === 0) {
      return errorResponse(400, "URL is required");
    }

    if (!isYouTubeUrl(url)) {
      return errorResponse(
        400,
        "Invalid URL. Only YouTube links are supported (youtube.com/watch?v=..., youtu.be/...)"
      );
    }

    const videoId = extractVideoId(url)!;

    // Step 1: Get transcript — use provided or fetch server-side
    let transcript: string;
    if (providedTranscript && providedTranscript.trim().length > 50) {
      console.log("📄 Using transcript provided by frontend");
      transcript = providedTranscript.trim();
    } else {
      console.log("📝 Fetching transcript server-side...");
      transcript = await fetchTranscript(videoId);
    }

    // Step 2: Get title
    let videoTitle: string;
    if (providedTitle && providedTitle.trim().length > 0) {
      videoTitle = providedTitle.trim();
    } else {
      videoTitle = await fetchVideoTitle(videoId);
    }

    console.log(`🎬 Processing YouTube video "${videoTitle}" (${videoId})`);
    console.log(`Received transcript: ${transcript.length} characters`);

    // Step 1: Chunk text
    console.log("Step 1: Chunking transcript...");
    const chunks = chunkText(transcript);
    console.log(`Created ${chunks.length} chunks`);

    // Step 2: Generate embeddings
    console.log("Step 2: Generating embeddings via Gemini...");
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);
    console.log(`Generated ${embeddings.length} embeddings`);

    // Step 3: Upsert into Pinecone
    const documentId = uuidv4();
    const documentName = `🎬 ${videoTitle}`;

    console.log("Step 3: Upserting vectors into Pinecone...");
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
      `✅ Successfully ingested "${videoTitle}": ${chunks.length} chunks stored`
    );

    return jsonResponse(200, {
      message: "YouTube video processed successfully",
      documentId,
      documentName,
      videoId,
      chunksCreated: chunks.length,
      transcriptLength: transcript.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("❌ Error processing YouTube URL:", message);
    return errorResponse(500, "Failed to process YouTube video", message);
  }
}
