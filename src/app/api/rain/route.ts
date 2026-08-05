import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';

export interface RainDay {
  date: string; // YYYY-MM-DD
  forecast_precip_mm: number | null;
  forecast_pop: number | null;
  actual_precip_mm: number | null;
}

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city');
  const year = req.nextUrl.searchParams.get('year');

  if (!city || !year) {
    return NextResponse.json({ error: 'city and year are required' }, { status: 400 });
  }

  if (!supabaseConfigured || !supabase) {
    return NextResponse.json({ days: [], configured: false });
  }

  const { data, error } = await supabase
    .from('rain_daily')
    .select('date, forecast_precip_mm, forecast_pop, actual_precip_mm')
    .eq('city_slug', city)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ days: (data ?? []) as RainDay[], configured: true });
}
