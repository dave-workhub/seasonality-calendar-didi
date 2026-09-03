import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';
import { supabaseAdmin, supabaseAdminConfigured } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const citySlug = req.nextUrl.searchParams.get('city') ?? '';
  if (!citySlug) return NextResponse.json({ error: 'missing city' }, { status: 400 });

  const authorizedEmail = await getAuthorizedDidilabsEmail(req);
  if (!authorizedEmail) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

  if (!supabaseAdminConfigured || !supabaseAdmin) return NextResponse.json({ summary: null });

  const { data, error } = await supabaseAdmin
    .from('weekly_news_summaries')
    .select('summary, week_start, created_at')
    .eq('city_slug', citySlug)
    .order('week_start', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return NextResponse.json({ summary: null });
  return NextResponse.json({ summary: data.summary, weekStart: data.week_start });
}
