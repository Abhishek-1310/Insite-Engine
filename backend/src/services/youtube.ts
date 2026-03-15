/**
 * YouTube service — URL utilities + transcript fetching
 *
 * Strategy (in order of preference):
 *   1. YouTube Data API v3 captions.download
 *      - Lists tracks via googleapis.com/youtube/v3/captions
 *      - Downloads via googleapis.com/youtube/v3/captions/{id}
 *      - Both calls go to googleapis.com — NOT blocked by AWS IP filtering
 *   2. Supadata API (free third-party proxy)
 *   3. youtube-transcript npm package (last resort)
 *
 * Required env vars:
 *   YOUTUBE_API_KEY  — https://console.cloud.google.com
 *                      → Enable "YouTube Data API v3" → Credentials → API Key
 *
 * Optional env vars:
 *   SUPADATA_API_KEY — https://supadata.ai (free: 200 req/day)
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
 * Step 1: List caption tracks via googleapis.com/youtube/v3/captions
 * Step 2: Download via googleapis.com/youtube/v3/captions/{trackId}
 *
 * KEY INSIGHT: Both requests go to googleapis.com — completely different
 * from youtube.com/api/timedtext which AWS IPs cannot reach.
 * googleapis.com is a Google API endpoint that accepts authenticated API key
 * requests from any IP including AWS Lambda.
 *
 * Quota cost: captions.list=50 units, captions.download=200 units
 * Free quota: 10,000 units/day → ~25 videos/day on free tier
 *
 * NOTE: captions.download requires the video owner to allow it OR OAuth.
 * For most public videos this returns 403. In that case we fall back to
 * the XML timedtext with all lang/kind combinations.
 */
async function fetchTranscriptViaDataApi(videoId: string): Promise<string> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY environment variable not set");
  }

  // Step 1: List caption tracks
  const listUrl =
    `https://www.googleapis.com/youtube/v3/captions` +
    `?part=snippet&videoId=${videoId}&key=${apiKey}`;

  console.log(`Listing captions for ${videoId}...`);
  const listResp = await fetch(listUrl);

  if (!listResp.ok) {
    const errBody = await listResp.text();
    throw new Error(`Captions list API ${listResp.status}: ${errBody}`);
  }

  const listData = await listResp.json() as any;
  const items: any[] = listData.items ?? [];

  if (!items.length) {
    throw new Error("No caption tracks returned by Data API — video may have no captions");
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

  const trackId: string = track.id;
  const lang: string = track.snippet?.language ?? "en";
  const trackKind: string = track.snippet?.trackKind ?? "";

  console.log(`Selected track: id=${trackId} lang=${lang} kind=${trackKind}`);

  // Step 2a: Try captions.download via googleapis.com
  // This works for some videos without OAuth (especially auto-generated captions)
  const downloadUrl =
    `https://www.googleapis.com/youtube/v3/captions/${trackId}` +
    `?key=${apiKey}&tfmt=srt`;

  console.log(`Attempting captions.download for track ${trackId}...`);
  const dlResp = await fetch(downloadUrl, {
    headers: { Accept: "text/plain, */*" },
  });

  if (dlResp.ok) {
    const srt = await dlResp.text();
    if (srt && srt.trim().length > 50) {
      console.log(`✅ captions.download succeeded (${srt.length} bytes)`);
      const parsed = parseSrt(srt);
      if (parsed && parsed.length > 50) return parsed;
    }
  } else {
    console.warn(
      `captions.download returned ${dlResp.status} — ` +
      `OAuth required for this video, trying XML timedtext fallback...`
    );
  }

  // Step 2b: Fallback — try all lang/kind/fmt combos via timedtext
  // We already know the exact lang and kind from the API list call,
  // so we're not guessing blindly like before.
  return fetchTimedTextXmlFallback(videoId, lang, trackKind);
}

/**
 * Targeted timedtext fetch using exact lang+kind from the Data API list.
 * Tries xml formats since we know the track exists — this is more targeted
 * than the old strategy 2 which guessed blindly.
 */
async function fetchTimedTextXmlFallback(
  videoId: string,
  lang: string,
  trackKind: string
): Promise<string> {
  console.log(`Trying timedtext XML fallback: lang=${lang} kind=${trackKind}`);

  const kindParam = trackKind === "asr" ? "&kind=asr" : "";
  const formats = ["srv3", "srv1", "ttml"];

  for (const fmt of formats) {
    try {
      const url =
        `https://www.youtube.com/api/timedtext` +
        `?v=${videoId}&lang=${lang}&fmt=${fmt}${kindParam}`;

      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+; SOCS=CAESEwgDEgk0OTI1MzkxMjkaAmVuIAEaBgiA_LyaBg==",
        },
      });

      if (!resp.ok) continue;

      const body = await resp.text();
      if (!body || body.trim().length === 0) {
        console.warn(`timedtext fmt=${fmt} returned empty body`);
        continue;
      }

      const text = parseTimedTextXml(body);
      if (text && text.length > 50) {
        console.log(`✅ timedtext fmt=${fmt} succeeded`);
        return text;
      }
    } catch (err) {
      console.warn(`timedtext fmt=${fmt} failed:`, err);
    }
  }

  throw new Error(
    `timedtext XML fallback failed for lang=${lang} kind=${trackKind} — ` +
    `AWS IP likely blocked. Set up SUPADATA_API_KEY as a reliable fallback.`
  );
}

// ─── Strategy 2: Supadata API ─────────────────────────────────────────────────

/**
 * Free third-party service: https://supadata.ai
 * Their servers are NOT on AWS IP ranges so YouTube doesn't block them.
 * Free tier: 200 requests/day, no credit card required.
 *
 * Sign up → get API key → add SUPADATA_API_KEY to Lambda env vars.
 * This is the most reliable fallback if Data API captions.download fails.
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
  const text: string = data?.content ?? data?.transcript ?? "";

  if (!text || text.length < 50) {
    throw new Error("Supadata returned empty transcript");
  }

  return text.replace(/\s+/g, " ").trim();
}

// ─── Strategy 3: youtube-transcript package ───────────────────────────────────

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

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse SRT subtitle format into plain text.
 *   1
 *   00:00:00,000 --> 00:00:01,000
 *   Hello world
 */
function parseSrt(srt: string): string {
  return srt
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.trim().split("\n");
      return lines
        .filter((line) => !/^\d+$/.test(line) && !line.includes("-->"))
        .join(" ");
    })
    .join(" ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
      // fall through
    }
  }

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