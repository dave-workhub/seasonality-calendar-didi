import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';

const NEWS_FEEDS: Record<string, string[]> = {
  // CO cities: Google News works reliably for these
  cartagena: ['https://news.google.com/rss/search?q=Cartagena+Colombia&hl=es-CO&gl=CO&ceid=CO:es'],
  medellin:  ['https://news.google.com/rss/search?q=Medellin+Colombia&hl=es-CO&gl=CO&ceid=CO:es'],
  // MX cities: local newspaper RSS feeds (Google News returns empty for these from Vercel IPs)
  saltillo: [
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

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
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
    if (title && link) items.push({ title, link, source, pubDate });
  }
  return items;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-419,es;q=0.9,en;q=0.7',
};

export async function GET(req: NextRequest) {
  const citySlug = req.nextUrl.searchParams.get('city') ?? '';
  const feedUrls = NEWS_FEEDS[citySlug];
  if (!feedUrls) return NextResponse.json({ error: 'unknown city' }, { status: 400 });

  const authorizedEmail = await getAuthorizedDidilabsEmail(req);
  if (!authorizedEmail) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

  try {
    const results = await Promise.allSettled(
      feedUrls.map(url =>
        fetch(url, { next: { revalidate: 43200 }, headers: HEADERS })
          .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
          .then(xml => parseRSS(xml))
      )
    );

    const seen = new Set<string>();
    const all: NewsItem[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          if (!seen.has(item.title)) {
            seen.add(item.title);
            all.push(item);
          }
        }
      }
    }

    if (all.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const relevant = all.filter(item => isRelevant(item.title));
    return NextResponse.json({ items: (relevant.length > 0 ? relevant : all).slice(0, 5) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fetch failed' }, { status: 502 });
  }
}
