/**
 * api/keep-alive.ts
 *
 * Vercel Serverless Function (cron endpoint).
 *
 * Purpose: Ping the Supabase REST API every 3 days so the free-tier project
 * never gets paused for inactivity (Supabase pauses after 7 days of zero queries).
 *
 * Cron schedule: 0 0 */3 * *  (midnight UTC every 3 days)
 *   → Configured in vercel.json under "crons".
 *
 * Security:
 *   - Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from environment.
 *   - Rejects any non-GET request.
 *   - Returns a plain JSON body — no sensitive data.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET (Vercel cron always sends GET)
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[keep-alive] Missing Supabase URL or Anon Key environment variables");
    return res.status(500).json({ ok: false, error: "Server misconfiguration — env vars missing" });
  }

  // Ping the Supabase REST health endpoint — a lightweight, read-only call
  // that counts as activity and prevents the project from being paused.
  // We query the built-in PostgREST /rest/v1/ root which always returns 200
  // without touching any user tables.
  const pingUrl = `${supabaseUrl}/rest/v1/`;
  const start = Date.now();

  try {
    const response = await fetch(pingUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      // Abort if Supabase doesn't respond in 10 seconds
      signal: AbortSignal.timeout(10_000),
    });

    const elapsed = Date.now() - start;

    if (response.ok || response.status === 200) {
      console.info(`[keep-alive] Supabase ping OK — ${response.status} in ${elapsed}ms`);
      return res.status(200).json({
        ok: true,
        status: response.status,
        latencyMs: elapsed,
        pingedAt: new Date().toISOString(),
      });
    } else {
      console.warn(`[keep-alive] Supabase ping returned ${response.status} in ${elapsed}ms`);
      return res.status(200).json({
        ok: false,
        status: response.status,
        latencyMs: elapsed,
        pingedAt: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    const elapsed = Date.now() - start;
    console.error(`[keep-alive] Supabase ping failed after ${elapsed}ms:`, err?.message);
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unknown error",
      latencyMs: elapsed,
      pingedAt: new Date().toISOString(),
    });
  }
}
