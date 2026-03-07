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

// ─── YouTube Helpers (browser-side) ────────────────────────────────────────

/**
 * Extract the YouTube video ID from a URL
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

/**
 * Parse YouTube caption XML (srv3 format) into plain readable text
 */
function parseCaptionXml(xml: string): string {
  const segments: string[] = [];
  const pattern = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = pattern.exec(xml)) !== null) {
    const t = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#10;/g, " ")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (t) segments.push(t);
  }
  return segments.join(" ");
}

/**
 * Fetch a YouTube transcript entirely in the browser.
 *
 * Strategy:
 *  1. Fetch the YouTube watch page to extract captionTracks URLs (most reliable)
 *  2. Fallback to timedtext API with multiple lang/kind combos
 *
 * Works from a browser; blocked from Lambda/server IPs.
 */
export async function fetchYouTubeTranscriptInBrowser(
  url: string
): Promise<{ transcript: string; title: string; videoId: string }> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  // ── Strategy 1: scrape captionTracks from the watch page via CORS proxy ────
  // Direct fetch to youtube.com is blocked by CORS from the browser.
  // corsproxy.io forwards the request and adds the missing CORS headers.
  const CORS_PROXY = "https://corsproxy.io/?url=";
  try {
    const pageResp = await fetch(
      `${CORS_PROXY}${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
    );
    if (pageResp.ok) {
      const html = await pageResp.text();

      // Extract page title
      const titleMatch = html.match(/<title>(.+?)<\/title>/);
      const rawTitle = titleMatch
        ? titleMatch[1].replace(" - YouTube", "").trim()
        : `YouTube Video ${videoId}`;

      // Extract captionTracks JSON array
      const ctMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/s);
      if (ctMatch) {
        type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };
        const tracks: CaptionTrack[] = JSON.parse(ctMatch[1]);

        // Prefer manual English > auto English > first available
        const pick =
          tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
          tracks.find((t) => t.languageCode === "en") ||
          tracks[0];

        if (pick?.baseUrl) {
          // The captionTrack baseUrl also needs the CORS proxy
          const capResp = await fetch(
            `${CORS_PROXY}${encodeURIComponent(pick.baseUrl)}`
          );
          if (capResp.ok) {
            const xml = await capResp.text();
            const transcript = parseCaptionXml(xml);
            if (transcript.length > 50) {
              return { transcript, title: rawTitle, videoId };
            }
          }
        }
      }
    }
  } catch {
    // fall through to strategy 2
  }

  // ── Strategy 2: timedtext API fallback ────────────────────────────────────
  const langCombos = [
    { lang: "en", kind: "" },
    { lang: "en", kind: "asr" },
    { lang: "en-US", kind: "" },
    { lang: "en-GB", kind: "" },
  ];

  for (const { lang, kind } of langCombos) {
    const qs = kind ? `&kind=${kind}` : "";
    const ytUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${qs}&fmt=srv3`;
    const apiUrl = `${CORS_PROXY}${encodeURIComponent(ytUrl)}`;
    try {
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const xml = await resp.text();
        const transcript = parseCaptionXml(xml);
        if (transcript.length > 50) {
          return { transcript, title: `YouTube Video ${videoId}`, videoId };
        }
      }
    } catch {
      // try next combo
    }
  }

  throw new Error(
    "No captions found for this video. Please try a video with captions/subtitles enabled."
  );
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
 * Ingest a YouTube video:
 *  1. Fetch transcript in the browser (avoids Lambda IP blocks)
 *  2. POST transcript + URL to Lambda for chunking, embedding & Pinecone storage
 */
export async function ingestYouTubeUrl(
  url: string,
  onStatus?: (msg: string) => void
): Promise<IngestUrlResponse> {
  // Step 1: fetch transcript in the browser
  console.log("🎬 Step 1: Fetching transcript in browser for:", url);
  onStatus?.("Fetching transcript...");

  let transcript: string, title: string, videoId: string;
  try {
    ({ transcript, title, videoId } = await fetchYouTubeTranscriptInBrowser(url));
    console.log(`✅ Transcript fetched for ${videoId} — ${transcript.length} chars`);
  } catch (err) {
    console.error("❌ Transcript fetch failed:", err);
    throw err;
  }

  // Step 2: send to Lambda
  console.log("📤 Step 2: Sending transcript to Lambda...");
  onStatus?.("Indexing transcript...");

  const response = await fetch(`${API_BASE_URL}/ingest-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, transcript, title }),
  });

  console.log("📥 Lambda response status:", response.status);

  if (!response.ok) {
    const error = await response.json();
    console.error("❌ Lambda error:", error);
    throw new Error(error.error || "Failed to process YouTube video");
  }

  const result = await response.json();
  console.log("✅ Lambda success:", result);
  return result;
}
