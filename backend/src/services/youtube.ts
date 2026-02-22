/**
 * YouTube transcript extraction service
 * Fetches captions/transcript from a YouTube video for RAG ingestion
 */

const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

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
 * Fetch the transcript/captions from a YouTube video.
 * Uses the YouTube page's embedded captions data (no API key needed).
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
    // Fetch the YouTube video page
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch YouTube page: ${response.status}`);
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title>(.+?)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(" - YouTube", "").trim()
      : `YouTube Video ${videoId}`;

    // Extract captions/transcript from the page data
    const transcript = await extractCaptionsFromPage(html, videoId);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    return {
      text: transcript,
      title,
      videoId,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch YouTube transcript: ${String(error)}`);
  }
}

/**
 * Extract captions from the YouTube page HTML
 */
async function extractCaptionsFromPage(
  html: string,
  videoId: string
): Promise<string> {
  // Look for captions track URL in the page data
  const captionTrackPattern =
    /"captionTracks":\s*\[(.*?)\]/s;
  const match = html.match(captionTrackPattern);

  if (!match) {
    // Fallback: try to extract from timedtext API
    return await fetchTimedText(videoId);
  }

  try {
    // Parse the caption tracks to find English or auto-generated captions
    const tracksJson = `[${match[1]}]`;
    const tracks = JSON.parse(tracksJson);

    // Prefer manual English captions, then auto-generated
    let captionUrl = "";
    const englishTrack = tracks.find(
      (t: { languageCode: string; kind?: string }) =>
        t.languageCode === "en" && t.kind !== "asr"
    );
    const autoTrack = tracks.find(
      (t: { languageCode: string; kind?: string }) =>
        t.languageCode === "en" && t.kind === "asr"
    );
    const anyTrack = tracks[0];

    const selectedTrack = englishTrack || autoTrack || anyTrack;

    if (selectedTrack && selectedTrack.baseUrl) {
      captionUrl = selectedTrack.baseUrl;
    }

    if (!captionUrl) {
      return await fetchTimedText(videoId);
    }

    // Fetch the captions XML
    const captionResponse = await fetch(captionUrl);
    if (!captionResponse.ok) {
      return await fetchTimedText(videoId);
    }

    const captionXml = await captionResponse.text();
    return parseCaptionXml(captionXml);
  } catch {
    return await fetchTimedText(videoId);
  }
}

/**
 * Fallback: Fetch transcript from YouTube's timedtext API
 */
async function fetchTimedText(videoId: string): Promise<string> {
  const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`;

  const response = await fetch(timedTextUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    // Try auto-generated captions
    const autoUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=srv3`;
    const autoResponse = await fetch(autoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!autoResponse.ok) {
      return "";
    }

    const autoXml = await autoResponse.text();
    return parseCaptionXml(autoXml);
  }

  const xml = await response.text();
  return parseCaptionXml(xml);
}

/**
 * Parse YouTube caption XML into plain text
 */
function parseCaptionXml(xml: string): string {
  // Extract text content from <text> elements
  const textPattern = /<text[^>]*>(.*?)<\/text>/gs;
  const segments: string[] = [];
  let textMatch;

  while ((textMatch = textPattern.exec(xml)) !== null) {
    let text = textMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, "") // Remove any inner HTML tags
      .trim();

    if (text.length > 0) {
      segments.push(text);
    }
  }

  // Join segments into natural paragraphs
  // Group every ~5 sentences into a paragraph for better chunking
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

  // Group into paragraphs
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 5) {
    paragraphs.push(sentences.slice(i, i + 5).join(" "));
  }

  return paragraphs.join("\n\n");
}
