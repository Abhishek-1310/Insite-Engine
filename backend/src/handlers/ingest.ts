import { S3Event, Context } from "aws-lambda";
import { config } from "../config";
import { getFileFromS3 } from "../services/s3";
import { extractTextFromPDF, chunkText } from "../services/pdf";
import { extractTextFromImage, isSupportedImage } from "../services/image";
import { generateEmbeddings } from "../services/gemini";
import { upsertVectors, VectorMetadata } from "../services/pinecone";
import { v4 as uuidv4 } from "uuid";

/**
 * Detect file type from the S3 key extension
 */
function getContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Handler: Process uploaded files (PDFs and Images)
 * Triggered by S3 ObjectCreated event
 *
 * Flow:
 * 1. Download file from S3
 * 2. Extract text (pdf-parse for PDFs, Gemini Vision for images)
 * 3. Chunk text into smaller pieces
 * 4. Generate embeddings via Gemini
 * 5. Upsert vectors into Pinecone
 */
export async function handler(
  event: S3Event,
  context: Context
): Promise<void> {
  console.log(
    "Ingestion triggered:",
    JSON.stringify(event.Records.length, null, 2)
  );

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(
      record.s3.object.key.replace(/\+/g, " ")
    );

    console.log(`Processing file: s3://${bucket}/${key}`);

    try {
      // Step 1: Download file from S3
      console.log("Step 1: Downloading file from S3...");
      const fileBuffer = await getFileFromS3(bucket, key);
      console.log(`Downloaded ${fileBuffer.length} bytes`);

      // Step 2: Extract text based on file type
      const contentType = getContentType(key);
      let rawText: string;

      if (contentType === "application/pdf") {
        console.log("Step 2: Extracting text from PDF...");
        rawText = await extractTextFromPDF(fileBuffer);
      } else if (isSupportedImage(contentType)) {
        console.log(`Step 2: Extracting text from image (${contentType})...`);
        rawText = await extractTextFromImage(fileBuffer, contentType);
      } else {
        console.warn(`Unsupported file type: ${contentType}. Skipping.`);
        continue;
      }

      console.log(`Extracted ${rawText.length} characters of text`);

      if (rawText.trim().length === 0) {
        console.warn("No text extracted from PDF. Skipping.");
        continue;
      }

      // Step 3: Chunk text
      console.log("Step 3: Chunking text...");
      const chunks = chunkText(rawText);
      console.log(`Created ${chunks.length} chunks`);

      // Step 4: Generate embeddings
      console.log("Step 4: Generating embeddings via Gemini...");
      const chunkTexts = chunks.map((c) => c.text);
      const embeddings = await generateEmbeddings(chunkTexts);
      console.log(`Generated ${embeddings.length} embeddings`);

      // Extract document info from S3 key
      const keyParts = key.split("/");
      const documentId =
        keyParts.length >= 2 ? keyParts[1] : uuidv4();
      const documentName =
        keyParts[keyParts.length - 1] || "unknown.pdf";

      // Step 5: Upsert into Pinecone
      console.log("Step 5: Upserting vectors into Pinecone...");
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
        `✅ Successfully processed "${documentName}": ${chunks.length} chunks ingested into Pinecone`
      );
    } catch (error) {
      console.error(`❌ Failed to process file: ${key}`, error);
      throw error; // Re-throw to mark Lambda as failed
    }
  }
}
