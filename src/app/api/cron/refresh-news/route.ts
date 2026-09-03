import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// Runs daily at noon UTC (7 AM Bogotá, UTC-5) — invalidates the news feed cache
// so all cities serve fresh headlines on the first request after 7 AM.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  revalidateTag('news');
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
