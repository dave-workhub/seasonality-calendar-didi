import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';

export interface RainDay {
  date: string;
  forecast_precip_mm: number | null;
  forecast_pop: number | null;
  actual_precip_mm: number | null;
  forecast_temp_max: number | null;
  actual_temp_max: number | null;
}

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city');
  const year = req.nextUrl.searchParams.get('year');

  if (!city || !year) {
    return NextResponse.json({ error: 'city and year are required' }, { status: 400 });
  }

  if (!supabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ days: [], configured: false });
  }

  const authorizedEmail = await getAuthorizedDidilabsEmail(req);
  if (!authorizedEmail) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('rain_daily')
    .select('date, forecast_precip_mm, forecast_pop, actual_precip_mm, forecast_temp_max, actual_temp_max')
    .eq('city_slug', city)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ days: (data ?? []) as RainDay[], configured: true });
}
