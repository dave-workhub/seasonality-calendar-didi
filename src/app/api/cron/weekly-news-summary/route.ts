import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ALL_CITIES } from '@/lib/cities';
import { supabaseAdmin, supabaseAdminConfigured } from '@/lib/supabaseAdmin';

const NEWS_FEEDS: Record<string, string[]> = {
  cartagena:  ['https://news.google.com/rss/search?q=Cartagena+Colombia&hl=es-CO&gl=CO&ceid=CO:es'],
  medellin:   [
    'https://news.google.com/rss/search?q=Medellin+Colombia&hl=es-CO&gl=CO&ceid=CO:es',
    'https://h13n.com/feed/',
  ],
  saltillo:   [
    'https://elheraldodesaltillo.mx/feed/',
    'https://www.zocalo.com.mx/category/saltillo/feed/',
  ],
  hermosillo: [
    'https://www.elimparcial.com/arc/outboundfeeds/rss/',
  ],
  merida: [
    'https://enfoquenoticias.com.mx/feed/',
    'https://www.yucatan.com.mx/feed/',
  ],
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-419,es;q=0.9,en;q=0.7',
};

function parseHeadlines(xml: string): string[] {
  const headlines: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && headlines.length < 15) {
    const block = match[1];
    const rawTitle =
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>(.*?)<\/title>/)?.[1] ||
      '';
    const dashIdx = rawTitle.lastIndexOf(' - ');
    const title = (dashIdx > 0 ? rawTitle.slice(0, dashIdx) : rawTitle).trim();
    if (title) headlines.push(title);
  }
  return headlines;
}

async function fetchHeadlinesForCity(feedUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    feedUrls.map(url => fetch(url, { headers: HEADERS }).then(r => r.ok ? r.text() : Promise.reject()))
  );
  const seen = new Set<string>();
  const all: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const h of parseHeadlines(result.value)) {
        if (!seen.has(h)) { seen.add(h); all.push(h); }
      }
    }
  }
  return all.slice(0, 10);
}

function mondayOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const weekStart = mondayOfCurrentWeek();
  const results: Record<string, string> = {};

  for (const city of ALL_CITIES) {
    const feedUrls = NEWS_FEEDS[city.slug];
    if (!feedUrls) continue;

    try {
      const headlines = await fetchHeadlinesForCity(feedUrls);
      if (headlines.length === 0) { results[city.slug] = 'no headlines'; continue; }

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `These are recent local news headlines for ${city.name} related to mobility, weather, and events. Write a brief 3-bullet weekend summary in Spanish (since this is a Latin American city) focused on anything that could affect demand or mobility — protests, road closures, weather events, major concerts/festivals. Be concise, one line per bullet. If there is nothing relevant, say so in one line.\n\nHeadlines:\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`,
        }],
      });

      const summaryText = response.content.find(b => b.type === 'text')?.text ?? '';

      await supabaseAdmin
        .from('weekly_news_summaries')
        .upsert({ city_slug: city.slug, week_start: weekStart, summary: summaryText }, { onConflict: 'city_slug,week_start' });

      results[city.slug] = 'ok';
    } catch (err) {
      results[city.slug] = err instanceof Error ? err.message : 'error';
    }
  }

  return NextResponse.json({ weekStart, results });
}
