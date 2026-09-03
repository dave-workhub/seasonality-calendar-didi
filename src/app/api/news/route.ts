import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';

const NEWS_FEEDS: Record<string, string> = {
  cartagena:  'https://news.google.com/rss/search?q=Cartagena+Colombia&hl=es-CO&gl=CO&ceid=CO:es',
  medellin:   'https://news.google.com/rss/search?q=Medellin+Colombia&hl=es-CO&gl=CO&ceid=CO:es',
  saltillo:   'https://news.google.com/rss/search?q=Saltillo+Coahuila&hl=es-MX&gl=MX&ceid=MX:es',
  hermosillo: 'https://news.google.com/rss/search?q=Hermosillo+Sonora&hl=es-MX&gl=MX&ceid=MX:es',
  merida:     'https://news.google.com/rss/search?q=Merida+Yucatan&hl=es-MX&gl=MX&ceid=MX:es',
};

// Demand/mobility relevance filter applied server-side
const DEMAND_KEYWORDS = [
  'movilidad','tráfico','trafico','protesta','manifestación','manifestacion',
  'paro','huelga','bloqueo','concierto','festival','feria','clima','lluvia',
  'inundación','inundacion','accidente','cierre','tormenta','evento',
  'desvío','desvio','transporte','vialidad','carretera',
];

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

function isRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return DEMAND_KEYWORDS.some(kw => lower.includes(kw));
}

function parseItems(xml: string): NewsItem[] {
  const all: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && all.length < 20) {
    const block = match[1];
    const rawTitle =
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>(.*?)<\/title>/)?.[1] ||
      '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || '';
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || '';
    const dashIdx = rawTitle.lastIndexOf(' - ');
    const title = (dashIdx > 0 ? rawTitle.slice(0, dashIdx) : rawTitle).trim();
    if (title && link) all.push({ title, link, source, pubDate });
  }
  // Prefer keyword-relevant items; fall back to showing all if none match
  const relevant = all.filter(item => isRelevant(item.title));
  return (relevant.length > 0 ? relevant : all).slice(0, 5);
}

export async function GET(req: NextRequest) {
  const citySlug = req.nextUrl.searchParams.get('city') ?? '';
  const feedUrl = NEWS_FEEDS[citySlug];
  if (!feedUrl) return NextResponse.json({ error: 'unknown city' }, { status: 400 });

  const authorizedEmail = await getAuthorizedDidilabsEmail(req);
  if (!authorizedEmail) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

  try {
    const res = await fetch(feedUrl, {
      next: { revalidate: 43200 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-419,es;q=0.9,en;q=0.7',
      },
    });
    if (!res.ok) return NextResponse.json({ error: `RSS fetch failed: ${res.status}` }, { status: 502 });
    const xml = await res.text();
    return NextResponse.json({ items: parseItems(xml) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fetch failed' }, { status: 502 });
  }
}
