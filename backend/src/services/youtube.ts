/**
 * YouTube service — URL utilities + transcript fetching
 *
 * Uses the `youtube-transcript` npm package (same approach as
 * Python's youtube_transcript_api used in Krish Naik's tutorial).
 * The package fetches the YouTube watch page, extracts captionTracks,
 * and returns the transcript text.
 */
import { YoutubeTranscript } from "youtube-transcript";

const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
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
 * Fetch transcript for a YouTube video using the youtube-transcript package.
 * Returns the full transcript as a single string.
 */
export async function fetchTranscript(videoId: string): Promise<string> {
  console.log(`📝 Fetching transcript for video: ${videoId}`);

  const segments = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: "en",
  });

  if (!segments || segments.length === 0) {
    throw new Error(
      "No transcript available for this video. Please ensure captions/subtitles are enabled."
    );
  }

  const transcript = segments.map((s) => s.text).join(" ");
  console.log(
    `✅ Transcript fetched: ${segments.length} segments, ${transcript.length} chars`
  );
  return transcript;
}

/**
 * Fetch the video title from the YouTube watch page
 */
export async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36",
        },
      }
    );
    const html = await resp.text();
    const match = html.match(/<title>(.+?)<\/title>/);
    if (match) {
      return match[1].replace(" - YouTube", "").trim();
    }
  } catch {
    // fall through
  }
  return `YouTube Video ${videoId}`;
}
