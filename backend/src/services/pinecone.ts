import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config";

let pineconeClient: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey: config.pineconeApiKey,
    });
  }
  return pineconeClient;
}

function getIndex() {
  return getPinecone().index(config.pineconeIndex);
}

export interface VectorMetadata {
  [key: string]: string | number;
  text: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  totalChunks: number;
  uploadedAt: string;
}

/**
 * Upsert vectors into Pinecone
 */
export async function upsertVectors(
  vectors: {
    id: string;
    values: number[];
    metadata: VectorMetadata;
  }[]
): Promise<void> {
  const index = getIndex();

  // Pinecone recommends batches of 100
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await index.upsert(batch);
  }
}

/**
 * Query Pinecone for similar vectors
 */
export async function queryVectors(
  queryVector: number[],
  topK: number = config.topK,
  filter?: Record<string, string>
): Promise<
  {
    id: string;
    score: number;
    metadata: VectorMetadata;
  }[]
> {
  const index = getIndex();

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter,
  });

  return (results.matches || []).map((match) => ({
    id: match.id,
    score: match.score || 0,
    metadata: match.metadata as unknown as VectorMetadata,
  }));
}

/**
 * Delete all vectors for a specific document
 */
export async function deleteVectorsByDocument(
  documentId: string
): Promise<void> {
  const index = getIndex();

  // Delete by metadata filter
  await index.deleteMany({
    filter: { documentId: { $eq: documentId } },
  });
}

/**
 * List unique documents stored in Pinecone
 */
export async function listDocuments(): Promise<
  {
    documentId: string;
    documentName: string;
    uploadedAt: string;
    totalChunks: number;
  }[]
> {
  const index = getIndex();

  // Query with a dummy vector to get metadata
  // We'll use the list endpoint with metadata filtering
  const stats = await index.describeIndexStats();

  // Return basic stats - full document listing requires
  // querying with metadata which we handle at the handler level
  return [];
}
