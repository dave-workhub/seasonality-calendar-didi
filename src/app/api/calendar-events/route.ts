import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city');
  const year = req.nextUrl.searchParams.get('year');

  if (!city || !year) {
    return NextResponse.json({ error: 'city and year are required' }, { status: 400 });
  }

  if (!supabaseConfigured || !supabase) {
    // Supabase not configured yet (e.g. local dev before Phase 1 setup is finished).
    return NextResponse.json({ events: [], configured: false });
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .select('start_date, end_date, category, title, source_url')
    .eq('city_slug', city)
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)
    .order('start_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data, configured: true });
}
