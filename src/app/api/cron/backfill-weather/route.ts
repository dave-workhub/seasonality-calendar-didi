import { NextRequest, NextResponse } from 'next/server';
import { ALL_CITIES } from '@/lib/cities';
import { supabaseAdmin, supabaseAdminConfigured } from '@/lib/supabaseAdmin';

/**
 * One-time historical backfill — NOT wired into vercel.json crons, so it
 * never runs on a schedule. Visit it once by hand (with ?secret=<CRON_SECRET>
 * in the URL, since a plain browser visit can't set an Authorization header)
 * to fill in actual_precip_mm for every day since Jan 1 of the current year
 * up to yesterday, across all cities, in one shot via Open-Meteo's archive
 * API (which accepts a date range, not just a single day).
 *
 * After this runs once, the regular daily cron (/api/cron/sync-weather)
 * keeps extending the record one day at a time — nothing here needs to run
 * again unless you want to backfill further into the past.
 */

interface OpenMeteoDaily {
  time: string[];
  precipitation_sum: number[];
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!supabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const now = new Date();
  const from = req.nextUrl.searchParams.get('from') ?? `${now.getUTCFullYear()}-01-01`;
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const to = yesterday.toISOString().slice(0, 10);

  const results: Record<string, string> = {};

  for (const city of ALL_CITIES) {
    try {
      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}` +
          `&start_date=${from}&end_date=${to}&daily=precipitation_sum&timezone=auto`
      );
      if (!res.ok) {
        results[city.slug] = `archive api ${res.status}`;
        continue;
      }
      const data: { daily: OpenMeteoDaily } = await res.json();
      const rows = data.daily.time.map((date, i) => ({
        city_slug: city.slug,
        date,
        actual_precip_mm: data.daily.precipitation_sum[i] ?? null,
      }));
      const { error } = await supabaseAdmin.from('rain_daily').upsert(rows, { onConflict: 'city_slug,date' });
      results[city.slug] = error ? error.message : `ok (${rows.length} days)`;
    } catch (err) {
      results[city.slug] = err instanceof Error ? err.message : 'failed';
    }
  }

  return NextResponse.json({ from, to, backfilled: results });
}
