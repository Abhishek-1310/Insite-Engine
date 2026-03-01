/**
 * YouTube transcript extraction service
 *
 * Strategy (in order of reliability from AWS Lambda):
 *  1. Fetch the watch page with CONSENT cookie to bypass EU consent gate,
 *     then extract captionTracks from the embedded JSON.
 *  2. Fallback to YouTube's timedtext API (works for some videos).
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
    // ---------- Step 1: Get the watch page ---------
    // Setting CONSENT=YES cookie avoids the EU consent wall that blocks Lambda.
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+634",
      },
      redirect: "follow",
    });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch YouTube page: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();

    // ---------- Extract title ----------
    const titleMatch = html.match(/"title"\s*:\s*"([^"]+)"/);
    const title = titleMatch
      ? decodeJsonUnicode(titleMatch[1])
      : `YouTube Video ${videoId}`;

    // ---------- Step 2: Extract captionTracks ----------
    const captionTrackPattern = /"captionTracks"\s*:\s*(\[.*?\])/s;
    const ctMatch = html.match(captionTrackPattern);

    let transcript = "";

    if (ctMatch) {
      try {
        const tracks = JSON.parse(ctMatch[1]) as {
          baseUrl: string;
          languageCode: string;
          kind?: string;
        }[];

        // Prefer manual English > auto-generated English > first available
        const pick =
          tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
          tracks.find((t) => t.languageCode === "en") ||
          tracks[0];

        if (pick?.baseUrl) {
          const capResp = await fetch(pick.baseUrl);
          if (capResp.ok) {
            transcript = parseCaptionXml(await capResp.text());
          }
        }
      } catch {
        // JSON parse failed — fall through to timedtext fallback
      }
    }

    // ---------- Step 3: Fallback to timedtext API ----------
    if (!transcript) {
      transcript = await fetchTimedText(videoId);
    }

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    return { text: transcript, title, videoId };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Failed to fetch YouTube transcript: ${String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode \\uXXXX escapes that appear inside JSON-embedded strings */
function decodeJsonUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Fallback: Fetch transcript from YouTube's timedtext API
 */
async function fetchTimedText(videoId: string): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  // Try manual English captions first, then auto-generated
  for (const kind of ["", "asr"]) {
    const qs = kind ? `&kind=${kind}` : "";
    const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en${qs}&fmt=srv3`;
    const resp = await fetch(url, { headers });
    if (resp.ok) {
      const xml = await resp.text();
      const text = parseCaptionXml(xml);
      if (text.length > 0) return text;
    }
  }

  return "";
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
