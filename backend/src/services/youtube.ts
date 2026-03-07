/**
 * YouTube URL utilities
 *
 * Transcript fetching is intentionally NOT done here.
 * AWS Lambda IPs are blocked by YouTube — transcripts are fetched
 * client-side in the browser and sent to Lambda as plain text.
 */

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
