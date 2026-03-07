/**
 * Vercel Serverless API Route: /api/youtube-proxy
 *
 * Fetches a YouTube URL server-side with proper browser-like headers.
 * Vercel's IPs are NOT blocked by YouTube (unlike AWS Lambda IPs).
 * This avoids CORS issues in the browser without relying on third-party proxies.
 *
 * Usage: GET /api/youtube-proxy?url=<encoded-youtube-url>
 */
module.exports = async function handler(req, res) {
    // CORS headers so the browser frontend can call this
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: "Missing url query parameter" });
    }

    // Only allow YouTube URLs for security
    let targetUrl;
    try {
        targetUrl = decodeURIComponent(url);
    } catch {
        return res.status(400).json({ error: "Invalid URL encoding" });
    }

    if (
        !targetUrl.includes("youtube.com") &&
        !targetUrl.includes("youtu.be")
    ) {
        return res.status(403).json({ error: "Only YouTube URLs are allowed" });
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                // Mimic a real browser request — YouTube checks these
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            },
        });

        if (!response.ok) {
            return res
                .status(response.status)
                .json({ error: `YouTube returned ${response.status}` });
        }

        const contentType = response.headers.get("content-type") || "text/plain";
        const body = await response.text();

        res.setHeader("Content-Type", contentType);
        return res.status(200).send(body);
    } catch (err) {
        console.error("YouTube proxy error:", err);
        return res.status(500).json({ error: "Failed to fetch from YouTube" });
    }
}
