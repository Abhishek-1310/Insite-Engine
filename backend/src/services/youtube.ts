/**
 * YouTube transcript extraction service
 * Works reliably in AWS Lambda
 */

const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

/**
 * Extract video ID
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
 * Validate YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

/**
 * Fetch transcript
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

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html",
    Cookie: "CONSENT=YES+1",
  };

  try {
    console.log("Fetching YouTube page...");

    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const pageResponse = await fetch(pageUrl, {
      headers,
      redirect: "follow",
    });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch YouTube page: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();

    console.log("HTML length:", html.length);

    /**
     * Extract title
     */
    const titleMatch = html.match(/"title":"(.*?)"/);
    const title = titleMatch
      ? decodeJsonUnicode(titleMatch[1])
      : `YouTube Video ${videoId}`;

    /**
     * Extract captions from ytInitialPlayerResponse
     */
    let transcript = "";

    const playerResponseMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{.+?\});/
    );

    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]);

        const tracks =
          playerResponse?.captions?.playerCaptionsTracklistRenderer
            ?.captionTracks;

        if (tracks && tracks.length > 0) {
          console.log(`Found ${tracks.length} caption tracks`);

          const pick =
            tracks.find((t: any) => t.languageCode === "en" && t.kind !== "asr") ||
            tracks.find((t: any) => t.languageCode === "en") ||
            tracks[0];

          if (pick?.baseUrl) {
            const capResp = await fetch(pick.baseUrl, { headers });

            if (capResp.ok) {
              const xml = await capResp.text();
              transcript = parseCaptionXml(xml);
            }
          }
        }
      } catch (err) {
        console.log("Caption JSON parse failed");
      }
    }

    /**
     * Fallback to timedtext API
     */
    if (!transcript) {
      console.log("Trying fallback timedtext API...");
      transcript = await fetchTimedText(videoId);
    }

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    console.log(`Transcript length: ${transcript.length}`);

    return {
      text: transcript,
      title,
      videoId,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Failed to fetch YouTube transcript: ${String(error)}`);
  }
}

/**
 * Fallback transcript API
 */
async function fetchTimedText(videoId: string): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  for (const kind of ["", "asr"]) {
    const qs = kind ? `&kind=${kind}` : "";

    const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en${qs}&fmt=srv3`;

    const resp = await fetch(url, { headers });

    if (resp.ok) {
      const xml = await resp.text();

      const text = parseCaptionXml(xml);

      if (text.length > 0) {
        return text;
      }
    }
  }

  return "";
}

/**
 * Decode unicode characters
 */
function decodeJsonUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Convert caption XML to text
 */
function parseCaptionXml(xml: string): string {
  const textPattern = /<text[^>]*>(.*?)<\/text>/gs;

  const segments: string[] = [];

  let match;

  while ((match = textPattern.exec(xml)) !== null) {
    const text = match[1]
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

  const paragraphs: string[] = [];

  for (let i = 0; i < sentences.length; i += 5) {
    paragraphs.push(sentences.slice(i, i + 5).join(" "));
  }

  return paragraphs.join("\n\n");
}