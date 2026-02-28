// Environment configuration with validation
interface Config {
  geminiApiKey: string;
  pineconeApiKey: string;
  uploadBucket: string;
  stage: string;
  pineconeIndex: string;
  embeddingModel: string;
  chatModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
}

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  geminiApiKey: getEnvVar("GEMINI_API_KEY"),
  pineconeApiKey: getEnvVar("PINECONE_API_KEY"),
  uploadBucket: getEnvVar("UPLOAD_BUCKET"),
  stage: process.env.STAGE || "dev",
  pineconeIndex: process.env.PINECONE_INDEX || "my-index-engine",
  embeddingModel: "text-embedding-001",
  chatModel: "gemini-2.5-flash",
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 3,
};
