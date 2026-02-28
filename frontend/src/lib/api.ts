const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_URL environment variable is not set");
}

export interface UploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  s3Key: string;
  message: string;
}

export interface Document {
  documentId: string;
  fileName: string;
  s3Key: string;
  size: number;
  lastModified: string;
}

export interface AskResponse {
  answer: string;
  sources: {
    documentName: string;
    documentId: string;
    chunkIndex: number;
    score: number;
  }[];
  question: string;
}

export interface IngestUrlResponse {
  message: string;
  documentId: string;
  documentName: string;
  videoId: string;
  chunksCreated: number;
  transcriptLength: number;
}

/**
 * Get a pre-signed URL for uploading a file (PDF or image)
 */
export async function getUploadUrl(
  fileName: string,
  contentType: string
): Promise<UploadUrlResponse> {
  const response = await fetch(`${API_BASE_URL}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get upload URL");
  }

  return response.json();
}

/**
 * Upload a file directly to S3 using the pre-signed URL
 */
export async function uploadFileToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = Math.round((e.loaded / e.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed"));
    });

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

/**
 * List all uploaded documents
 */
export async function listDocuments(): Promise<{
  documents: Document[];
  count: number;
}> {
  const response = await fetch(`${API_BASE_URL}/documents`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to list documents");
  }

  return response.json();
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete document");
  }
}

/**
 * Ask a question to the AI
 */
export async function askQuestion(
  question: string,
  documentId?: string
): Promise<AskResponse> {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, documentId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get answer");
  }

  return response.json();
}

/**
 * Ingest a YouTube video by URL
 */
export async function ingestYouTubeUrl(
  url: string
): Promise<IngestUrlResponse> {
  const response = await fetch(`${API_BASE_URL}/ingest-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to process YouTube video");
  }

  return response.json();
}
