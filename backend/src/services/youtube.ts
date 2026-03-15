/**
 * YouTube service — URL utilities + transcript fetching
 *
 * Strategy (in order of preference):
 *   1. Fetch watch page → parse ytInitialPlayerResponse (works when YT doesn't block)
 *   2. Direct timedtext API with multiple lang variants
 *   3. youtube-transcript npm package (last resort)
 *
 * Why not just use youtube-transcript package?
 *   AWS Lambda IPs are well-known cloud IPs. YouTube aggressively rate-limits
 *   and blocks transcript requests from them. We need a more resilient approach.
 */

import { YoutubeTranscript } from "youtube-transcript";
import { XMLParser } from "fast-xml-parser";

// ─── Constants ────────────────────────────────────────────────────────────────

const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

/**
 * Rotate through several real browser User-Agent strings so that repeated
 * Lambda invocations don't always present the same fingerprint.
 */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function extractVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function isYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

// ─── Transcript fetching ──────────────────────────────────────────────────────

/**
 * Main entry point.  Tries three strategies in sequence and returns the
 * first one that succeeds.  Throws only when all three fail.
 */
export async function fetchTranscript(videoId: string): Promise<string> {
  console.log(`📝 Fetching transcript for video: ${videoId}`);

  const strategies: Array<() => Promise<string>> = [
    () => fetchTranscriptViaWatchPage(videoId),
    () => fetchTranscriptViaTimedTextApi(videoId),
    () => fetchTranscriptViaPackage(videoId),
  ];

  const errors: string[] = [];

  for (let i = 0; i < strategies.length; i++) {
    try {
      const transcript = await strategies[i]();
      if (transcript && transcript.trim().length > 50) {
        console.log(
          `✅ Strategy ${i + 1} succeeded: ${transcript.length} chars`
        );
        return transcript;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Strategy ${i + 1} failed: ${msg}`);
      errors.push(`Strategy ${i + 1}: ${msg}`);
    }
  }

  console.error("❌ All transcript strategies failed:", errors);
  throw new Error(
    "No transcript available for this video. " +
    "Please ensure captions/subtitles are enabled, or try a different video."
  );
}

// ─── Strategy 1: Parse ytInitialPlayerResponse from the watch page ────────────

/**
 * Loads the YouTube watch page, pulls the embedded JSON blob
 * (ytInitialPlayerResponse), extracts the captionTracks list, then fetches
 * the best matching caption URL directly.
 *
 * This is the most reliable approach because:
 *  - It mimics what a real browser does
 *  - It handles both manual and auto-generated (asr) captions
 *  - No dependency on third-party packages
 */
async function fetchTranscriptViaWatchPage(videoId: string): Promise<string> {
  console.log("🔍 Strategy 1: Fetching via watch page HTML parse...");

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const resp = await fetch(watchUrl, {
    headers: {
      "User-Agent": randomUA(),
      // Accepting English first, then anything — reduces chance of consent wall
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      // Bypass GDPR/cookie consent in EU/India by pre-accepting
      Cookie: "CONSENT=YES+; SOCS=CAESEwgDEgk0OTI1MzkxMjkaAmVuIAEaBgiA_LyaBg==",
    },
  });

  if (!resp.ok) {
    throw new Error(`Watch page responded with HTTP ${resp.status}`);
  }

  const html = await resp.text();

  // Pull ytInitialPlayerResponse JSON blob from the page
  const playerRespMatch = html.match(
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s
  );
  if (!playerRespMatch) {
    throw new Error("ytInitialPlayerResponse not found in page HTML");
  }

  let playerResp: any;
  try {
    playerResp = JSON.parse(playerRespMatch[1]);
  } catch {
    throw new Error("Failed to parse ytInitialPlayerResponse JSON");
  }

  // Navigate to captionTracks
  const captionTracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> =
    playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  if (!captionTracks.length) {
    throw new Error("No caption tracks found in player response");
  }

  console.log(
    `Found ${captionTracks.length} caption track(s):`,
    captionTracks.map((t) => `${t.languageCode}${t.kind ? `(${t.kind})` : ""}`)
  );

  // Priority order: manual en → manual en-* → asr en → any track
  const track =
    captionTracks.find((t) => t.languageCode === "en" && !t.kind) ??
    captionTracks.find((t) => t.languageCode.startsWith("en") && !t.kind) ??
    captionTracks.find((t) => t.languageCode === "en") ??
    captionTracks.find((t) => t.languageCode.startsWith("en")) ??
    captionTracks[0];

  if (!track?.baseUrl) {
    throw new Error("Selected caption track has no baseUrl");
  }

  // Fetch the caption XML — append &fmt=json3 to get JSON instead of XML
  const captionUrl = `${track.baseUrl}&fmt=json3`;
  const captionResp = await fetch(captionUrl, {
    headers: { "User-Agent": randomUA() },
  });

  if (!captionResp.ok) {
    throw new Error(`Caption URL responded with HTTP ${captionResp.status}`);
  }

  const captionData = await captionResp.json() as any;

  // json3 format: { events: [{ segs: [{ utf8: "text" }] }] }
  const text = (captionData.events ?? [])
    .flatMap((e: any) => (e.segs ?? []).map((s: any) => s.utf8 ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length < 50) {
    throw new Error("Caption track produced empty or very short text");
  }

  return text;
}

// ─── Strategy 2: Direct timedtext API ────────────────────────────────────────

/**
 * Calls the public /api/timedtext endpoint directly with several language
 * variants.  Falls back to XML parsing when JSON is unavailable.
 *
 * This sometimes works even when the watch-page approach fails because it
 * hits a different YouTube endpoint.
 */
async function fetchTranscriptViaTimedTextApi(
  videoId: string
): Promise<string> {
  console.log("🔍 Strategy 2: Fetching via timedtext API...");

  const langVariants = ["en", "en-US", "en-GB", "a.en"];

  for (const lang of langVariants) {
    try {
      // Try JSON format first (fmt=json3)
      const jsonUrl =
        `https://www.youtube.com/api/timedtext` +
        `?v=${videoId}&lang=${lang}&fmt=json3`;

      const resp = await fetch(jsonUrl, {
        headers: {
          "User-Agent": randomUA(),
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+;",
        },
      });

      if (resp.ok) {
        const data = await resp.json() as any;
        const text = (data.events ?? [])
          .flatMap((e: any) => (e.segs ?? []).map((s: any) => s.utf8 ?? ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (text && text.length > 50) {
          console.log(`✅ timedtext JSON worked for lang=${lang}`);
          return text;
        }
      }

      // Fallback: XML format (srv3)
      const xmlUrl =
        `https://www.youtube.com/api/timedtext` +
        `?v=${videoId}&lang=${lang}&fmt=srv3`;

      const xmlResp = await fetch(xmlUrl, {
        headers: { "User-Agent": randomUA(), Cookie: "CONSENT=YES+;" },
      });

      if (xmlResp.ok) {
        const xml = await xmlResp.text();
        if (xml && xml.includes("<text")) {
          const text = parseTimedTextXml(xml);
          if (text && text.length > 50) {
            console.log(`✅ timedtext XML worked for lang=${lang}`);
            return text;
          }
        }
      }
    } catch (err) {
      console.warn(`timedtext attempt for lang=${lang} failed:`, err);
    }
  }

  throw new Error("All timedtext language variants failed");
}

/**
 * Parse the legacy srv3 XML format:
 * <transcript><text start="0.5" dur="1.0">Hello world</text></transcript>
 */
function parseTimedTextXml(xml: string): string {
  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    const doc = parser.parse(xml);
    const textNodes: any[] = doc?.transcript?.text ?? [];
    return textNodes
      .map((node: any) =>
        typeof node === "string" ? node : node?.["#text"] ?? ""
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    // Last-ditch regex approach
    return (xml.match(/<text[^>]*>([^<]*)<\/text>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join(" ")
      .trim();
  }
}

// ─── Strategy 3: youtube-transcript package ───────────────────────────────────

/**
 * Last resort — uses the npm package which does its own watch-page parsing.
 * Sometimes works if YT hasn't blocked the Lambda IP yet, but is not reliable
 * for AWS IPs in the long run.
 */
async function fetchTranscriptViaPackage(videoId: string): Promise<string> {
  console.log("🔍 Strategy 3: Fetching via youtube-transcript package...");

  // Try multiple languages including auto-generated captions
  const langOptions = [
    { lang: "en" },
    { lang: "en-US" },
    { lang: "en-GB" },
    {}, // no lang specified — package picks the default
  ];

  for (const opts of langOptions) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId, opts);
      if (segments?.length) {
        return segments
          .map((s) => s.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch {
      // try next
    }
  }

  throw new Error("youtube-transcript package returned no segments");
}

// ─── Video title ──────────────────────────────────────────────────────────────

export async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": randomUA(),
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+;",
      },
    });
    if (resp.ok) {
      const html = await resp.text();
      const match = html.match(/<title>(.+?)<\/title>/);
      if (match) {
        return match[1].replace(" - YouTube", "").trim();
      }
    }
  } catch {
    // fall through
  }
  return `YouTube Video ${videoId}`;
}