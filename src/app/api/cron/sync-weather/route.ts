import { NextRequest, NextResponse } from 'next/server';
import { ALL_CITIES } from '@/lib/cities';
import { supabaseAdmin, supabaseAdminConfigured } from '@/lib/supabaseAdmin';

/**
 * Daily rain sync — Open-Meteo (open-meteo.com), free and keyless.
 *
 * Two calls per city:
 *  1. Forecast API — precipitation_sum (mm) + precipitation_probability_max (%)
 *     for the next ~14 days. Upserts forecast_* columns for those dates.
 *  2. Archive (historical) API — actual precipitation_sum for yesterday.
 *     Upserts actual_precip_mm on the row for that date, so a forecast made
 *     a few days ago gets "graded" against what really happened.
 *
 * Triggered by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when
 * CRON_SECRET is set as an env var — we check that so this endpoint can't be
 * hit by anyone else to spam Open-Meteo / write bogus rows.
 */

const FORECAST_DAYS = 14;

interface OpenMeteoDaily {
  time: string[];
  precipitation_sum: number[];
  precipitation_probability_max?: number[];
}

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (!supabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const y = yesterday();

  for (const city of ALL_CITIES) {
    try {
      // 1. Forecast (next FORECAST_DAYS days).
      const fRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
          `&daily=precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=${FORECAST_DAYS}`
      );
      if (fRes.ok) {
        const data: { daily: OpenMeteoDaily } = await fRes.json();
        const rows = data.daily.time.map((date, i) => ({
          city_slug: city.slug,
          date,
          forecast_precip_mm: data.daily.precipitation_sum[i] ?? null,
          forecast_pop: data.daily.precipitation_probability_max?.[i] ?? null,
        }));
        await supabaseAdmin.from('rain_daily').upsert(rows, { onConflict: 'city_slug,date' });
      }

      // 2. Actuals for yesterday, to grade the forecast made a few days ago.
      const aRes = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}` +
          `&start_date=${y}&end_date=${y}&daily=precipitation_sum&timezone=auto`
      );
      if (aRes.ok) {
        const data: { daily: OpenMeteoDaily } = await aRes.json();
        const mm = data.daily.precipitation_sum?.[0];
        if (mm !== undefined && mm !== null) {
          await supabaseAdmin
            .from('rain_daily')
            .upsert({ city_slug: city.slug, date: y, actual_precip_mm: mm }, { onConflict: 'city_slug,date' });
        }
      }

      results[city.slug] = 'ok';
    } catch (err) {
      results[city.slug] = err instanceof Error ? err.message : 'failed';
    }
  }

  return NextResponse.json({ synced: results });
}
