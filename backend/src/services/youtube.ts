/**
 * YouTube transcript extraction service
 * Works reliably in AWS Lambda
 */
import { YoutubeTranscript } from "youtube-transcript";

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

  try {
    console.log("Fetching transcript using youtube-transcript library...");

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcript || transcript.length === 0) {
      throw new Error("No transcript available for this video.");
    }

    const text = transcript.map(t => t.text).join(" ");

    console.log("Transcript length:", text.length);

    return {
      text,
      title: `YouTube Video ${videoId}`,
      videoId
    };

  } catch (error) {
    console.error("Transcript fetch error:", error);

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