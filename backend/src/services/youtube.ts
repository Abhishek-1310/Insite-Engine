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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  try {
    console.log("Fetching YouTube page...");

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const pageResponse = await fetch(watchUrl, { headers });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch YouTube page: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();

    console.log("HTML length:", html.length);

    /**
     * Extract title
     */
    const titleMatch = html.match(/<title>(.*?)<\/title>/);

    const title = titleMatch
      ? titleMatch[1].replace(" - YouTube", "")
      : `YouTube Video ${videoId}`;

    console.log("Fetching caption list...");

    /**
     * Step 2: Get caption list
     */
    const captionListUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;

    const capListResp = await fetch(captionListUrl, { headers });

    if (!capListResp.ok) {
      throw new Error("Failed to fetch caption list");
    }

    const capXml = await capListResp.text();

    if (!capXml || capXml.trim().length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    /**
     * Extract language
     */
    const langMatch = capXml.match(/lang_code="([^"]+)"/);

    const lang = langMatch ? langMatch[1] : "en";

    console.log("Caption language:", lang);

    /**
     * Step 3: Fetch transcript
     */
    const transcriptUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=srv3`;

    const transcriptResp = await fetch(transcriptUrl, { headers });

    if (!transcriptResp.ok) {
      throw new Error("Failed to fetch transcript");
    }

    const xml = await transcriptResp.text();

    const transcript = parseCaptionXml(xml);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(
        "No captions/transcript available for this video. The video may not have subtitles enabled."
      );
    }

    console.log("Transcript length:", transcript.length);

    return {
      text: transcript,
      title,
      videoId,
    };
  } catch (error) {
    console.error("Transcript fetch error:", error);

    if (error instanceof Error) {
      throw new Error(error.message);
    }

    throw new Error("Failed to fetch YouTube transcript");
  }
}

/**
 * Fallback transcript API
 */
// async function fetchTimedText(videoId: string): Promise<string> {
//   const headers = {
//     "User-Agent":
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
//   };

//   for (const kind of ["", "asr"]) {
//     const qs = kind ? `&kind=${kind}` : "";

//     const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en${qs}&fmt=srv3`;

//     const resp = await fetch(url, { headers });

//     if (resp.ok) {
//       const xml = await resp.text();

//       const text = parseCaptionXml(xml);

//       if (text.length > 0) {
//         return text;
//       }
//     }
//   }

//   return "";
// }

/**
 * Decode unicode characters
 */
// function decodeJsonUnicode(s: string): string {
//   return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
//     String.fromCharCode(parseInt(hex, 16))
//   );
// }

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