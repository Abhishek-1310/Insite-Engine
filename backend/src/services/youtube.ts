/**
 * YouTube transcript extraction service
 * Uses YouTube's Innertube API to fetch captions reliably from server environments.
 * The old HTML-scraping approach fails from AWS Lambda because YouTube
 * returns consent/bot-check pages to datacenter IPs.
 */

const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_BASE = "https://www.youtube.com/youtubei/v1";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20240101.00.00",
    hl: "en",
    gl: "US",
  },
};

/**
 * Extract the video ID from a YouTube URL
 */
export function extractVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Check if a URL is a valid YouTube link
 */
export function isYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

/**
 * Fetch the transcript/captions from a YouTube video using Innertube API.
 * This works reliably from AWS Lambda (no HTML scraping needed).
 */
export async function fetchYouTubeTranscript(url: string): Promise<{
  text: string;
  title: string;
  videoId: string;
}> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  try {
    // Step 1: Get video info (title + caption tracks) via Innertube player endpoint
    const playerResponse = await fetch(
      `${INNERTUBE_BASE}/player?key=${INNERTUBE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: INNERTUBE_CONTEXT,
          videoId,
        }),
      }
    );

    if (!playerResponse.ok) {
      throw new Error(`Innertube player API error: ${playerResponse.status}`);
    }

    const playerData = (await playerResponse.json()) as Record<string, any>;

    const title =
      playerData?.videoDetails?.title || `YouTube Video ${videoId}`;

    // Get caption tracks from player response
    const captionTracks =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    // Prefer manual English > auto-generated English > first available
    const englishManual = captionTracks.find(
      (t: { languageCode: string; kind?: string }) =>
        t.languageCode === "en" && t.kind !== "asr"
    );
    const englishAuto = captionTracks.find(
      (t: { languageCode: string; kind?: string }) =>
        t.languageCode === "en" && t.kind === "asr"
    );
    const selectedTrack = englishManual || englishAuto || captionTracks[0];

    if (!selectedTrack?.baseUrl) {
      throw new Error("No usable caption track found for this video.");
    }

    // Step 2: Fetch the captions XML from the baseUrl
    const captionResponse = await fetch(selectedTrack.baseUrl);
    if (!captionResponse.ok) {
      throw new Error(`Failed to fetch captions XML: ${captionResponse.status}`);
    }

    const captionXml = await captionResponse.text();
    const transcript = parseCaptionXml(captionXml);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    return { text: transcript, title, videoId };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch YouTube transcript: ${String(error)}`);
  }
}

/**
 * Parse YouTube caption XML into plain text
 */
function parseCaptionXml(xml: string): string {
  const textPattern = /<text[^>]*>(.*?)<\/text>/gs;
  const segments: string[] = [];
  let textMatch;

  while ((textMatch = textPattern.exec(xml)) !== null) {
    const text = textMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#10;/g, " ")
      .replace(/<[^>]*>/g, "")
      .trim();

    if (text.length > 0) {
      segments.push(text);
    }
  }

  // Join segments into natural paragraphs
  const sentences: string[] = [];
  let current = "";

  for (const segment of segments) {
    current += (current ? " " : "") + segment;

    if (
      current.endsWith(".") ||
      current.endsWith("?") ||
      current.endsWith("!") ||
      current.length > 300
    ) {
      sentences.push(current);
      current = "";
    }
  }

  if (current.trim()) {
    sentences.push(current);
  }

  // Group into paragraphs (every ~5 sentences)
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 5) {
    paragraphs.push(sentences.slice(i, i + 5).join(" "));
  }

  return paragraphs.join("\n\n");
}
