/**
 * YouTube service — URL utilities + transcript fetching
 *
 * Strategy (in order of preference):
 *   1. YouTube Data API v3 (official Google API — authenticated, not IP-blocked)
 *   2. Supadata API (free third-party proxy — bypasses AWS IP blocks)
 *   3. youtube-transcript npm package (last resort)
 *
 * Why the original approaches failed:
 *   AWS Lambda IPs are well-known cloud ranges. YouTube blocks ALL unauthenticated
 *   scraping from them — returning empty bodies or stripped HTML with no captions.
 *   Authenticated API calls (Strategy 1) bypass this completely.
 *
 * Required env vars:
 *   YOUTUBE_API_KEY  — https://console.cloud.google.com
 *                      → Enable "YouTube Data API v3" → Create API Key
 *
 * Optional env vars (fallback):
 *   SUPADATA_API_KEY — https://supadata.ai (free: 200 req/day, no credit card)
 */

import { YoutubeTranscript } from "youtube-transcript";
import { XMLParser } from "fast-xml-parser";

// ─── URL helpers ──────────────────────────────────────────────────────────────

const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];

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

// ─── Main transcript entry point ──────────────────────────────────────────────

export async function fetchTranscript(videoId: string): Promise<string> {
  console.log(`📝 Fetching transcript for video: ${videoId}`);

  const strategies: Array<{ name: string; fn: () => Promise<string> }> = [
    { name: "YouTube Data API v3", fn: () => fetchTranscriptViaDataApi(videoId) },
    { name: "Supadata API", fn: () => fetchTranscriptViaSupadata(videoId) },
    { name: "youtube-transcript", fn: () => fetchTranscriptViaPackage(videoId) },
  ];

  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      console.log(`🔍 Trying: ${strategy.name}...`);
      const transcript = await strategy.fn();
      if (transcript && transcript.trim().length > 50) {
        console.log(`✅ ${strategy.name} succeeded: ${transcript.length} chars`);
        return transcript;
      }
      console.warn(`⚠️ ${strategy.name} returned empty transcript, trying next...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ ${strategy.name} failed: ${msg}`);
      errors.push(`${strategy.name}: ${msg}`);
    }
  }

  console.error("❌ All transcript strategies failed:", errors);
  throw new Error(
    "No transcript available for this video. " +
    "Please ensure captions/subtitles are enabled, or try a different video.\n" +
    `Details: ${errors.join(" | ")}`
  );
}

// ─── Strategy 1: YouTube Data API v3 ─────────────────────────────────────────

/**
 * Uses the official YouTube Data API v3 to list caption tracks,
 * then fetches the caption content via the timedtext endpoint (authenticated).
 *
 * Free quota: 10,000 units/day
 *   - captions.list  = 50 units
 *   - timedtext fetch = 0 units (not a quota API call)
 *
 * Get your key: https://console.cloud.google.com
 *   1. Create a project
 *   2. Enable "YouTube Data API v3"
 *   3. Create credentials → API Key
 *   4. Add as YOUTUBE_API_KEY in Lambda env vars
 */
async function fetchTranscriptViaDataApi(videoId: string): Promise<string> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY environment variable not set");
  }

  // Step 1: List available caption tracks
  const listUrl =
    `https://www.googleapis.com/youtube/v3/captions` +
    `?part=snippet&videoId=${videoId}&key=${apiKey}`;

  const listResp = await fetch(listUrl);
  if (!listResp.ok) {
    const errBody = await listResp.text();
    throw new Error(`Captions list API ${listResp.status}: ${errBody}`);
  }

  const listData = await listResp.json() as any;
  const items: any[] = listData.items ?? [];

  if (!items.length) {
    throw new Error("No caption tracks returned by Data API");
  }

  console.log(
    `Found ${items.length} caption track(s):`,
    items.map((i: any) => `${i.snippet?.language}(${i.snippet?.trackKind})`)
  );

  // Priority: manual en → asr en → any en → first track
  const track =
    items.find((i: any) => i.snippet?.language === "en" && i.snippet?.trackKind === "standard") ??
    items.find((i: any) => i.snippet?.language === "en" && i.snippet?.trackKind === "asr") ??
    items.find((i: any) => i.snippet?.language?.startsWith("en")) ??
    items[0];

  const lang: string = track.snippet?.language ?? "en";
  const trackKind: string = track.snippet?.trackKind ?? "";

  console.log(`Selected track: lang=${lang} kind=${trackKind}`);

  // Step 2: Fetch caption content via timedtext (authenticated with API key)
  const timedTextUrl =
    `https://www.youtube.com/api/timedtext` +
    `?v=${videoId}&lang=${lang}&fmt=json3` +
    (trackKind === "asr" ? `&kind=asr` : "");

  const captionResp = await fetch(timedTextUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+; SOCS=CAESEwgDEgk0OTI1MzkxMjkaAmVuIAEaBgiA_LyaBg==",
    },
  });

  if (!captionResp.ok) {
    throw new Error(`timedtext fetch failed: HTTP ${captionResp.status}`);
  }

  const rawText = await captionResp.text();

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("timedtext returned empty body");
  }

  // Parse JSON3 format: { events: [{ segs: [{ utf8: "text" }] }] }
  if (rawText.trim().startsWith("{")) {
    const data = JSON.parse(rawText) as any;
    const text = (data.events ?? [])
      .flatMap((e: any) => (e.segs ?? []).map((s: any) => s.utf8 ?? ""))
      .join(" ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text && text.length > 50) return text;
  }

  // Fallback: parse as XML (srv3 format)
  if (rawText.includes("<text")) {
    const text = parseTimedTextXml(rawText);
    if (text && text.length > 50) return text;
  }

  throw new Error("Caption content empty after parsing");
}

// ─── Strategy 2: Supadata API ─────────────────────────────────────────────────

/**
 * Supadata is a free third-party service that fetches YouTube transcripts.
 * Their servers are NOT on AWS IP ranges so YouTube doesn't block them.
 *
 * Free tier: 200 requests/day, no credit card required.
 * Sign up: https://supadata.ai → get API key → add as SUPADATA_API_KEY in Lambda
 */
async function fetchTranscriptViaSupadata(videoId: string): Promise<string> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    throw new Error("SUPADATA_API_KEY not set — skipping Supadata");
  }

  const url =
    `https://api.supadata.ai/v1/youtube/transcript` +
    `?videoId=${videoId}&lang=en&text=true`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Supadata API ${resp.status}: ${body}`);
  }

  const data = await resp.json() as any;

  // Supadata returns { content: "full transcript" } when text=true
  const text: string = data?.content ?? data?.transcript ?? "";

  if (!text || text.length < 50) {
    throw new Error("Supadata returned empty transcript");
  }

  return text.replace(/\s+/g, " ").trim();
}

// ─── Strategy 3: youtube-transcript package ───────────────────────────────────

/**
 * Last resort. Unlikely to work from Lambda IPs but included as final fallback.
 */
async function fetchTranscriptViaPackage(videoId: string): Promise<string> {
  const langOptions = [{ lang: "en" }, { lang: "en-US" }, { lang: "en-GB" }, {}];

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
      // try next lang
    }
  }

  throw new Error("youtube-transcript package returned no segments");
}

// ─── Shared XML parser ────────────────────────────────────────────────────────

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
    return (xml.match(/<text[^>]*>([^<]*)<\/text>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join(" ")
      .trim();
  }
}

// ─── Video title ──────────────────────────────────────────────────────────────

export async function fetchVideoTitle(videoId: string): Promise<string> {
  // Try YouTube Data API first (reliable, not IP-blocked)
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const url =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=snippet&id=${videoId}&key=${apiKey}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json() as any;
        const title: string = data?.items?.[0]?.snippet?.title ?? "";
        if (title) return title;
      }
    } catch {
      // fall through to scrape
    }
  }

  // Fallback: scrape watch page
  try {
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+;",
      },
    });
    if (resp.ok) {
      const html = await resp.text();
      const match = html.match(/<title>(.+?)<\/title>/);
      if (match) return match[1].replace(" - YouTube", "").trim();
    }
  } catch {
    // fall through
  }

  return `YouTube Video ${videoId}`;
}