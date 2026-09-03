'use client';

import { useEffect, useState } from 'react';
import type { NewsItem } from './api/news/route';

interface Props {
  citySlug: string;
  cityName: string;
  authHeaders: Record<string, string> | undefined;
}

function timeAgo(pubDate: string): string {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

export default function NewsFeed({ citySlug, cityName, authHeaders }: Props) {
  const monday = isMonday();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setItems([]);

    if (monday) {
      fetch(`/api/weekly-summary?city=${citySlug}`, { headers: authHeaders })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setError(data.error);
          else setSummary(data.summary ?? null);
        })
        .catch(() => setError('Failed to load summary'))
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/news?city=${citySlug}`, { headers: authHeaders })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setError(data.error);
          else setItems(data.items ?? []);
        })
        .catch(() => setError('Failed to load news'))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citySlug, monday]);

  return (
    <div className="border border-neutral-200 rounded-md bg-neutral-50/60 px-4 py-2.5 mt-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-medium text-neutral-500">
          {monday ? `${cityName} — weekend summary` : `${cityName} — latest news`}
        </span>
        <span className="text-[10px] text-neutral-400">
          {monday ? '· generated every Monday' : '· Google News · refreshes every 12h'}
        </span>
      </div>

      {loading && <span className="text-[11px] text-neutral-400">Loading…</span>}
      {error && <span className="text-[11px] text-red-400">{error}</span>}

      {/* Monday: summary */}
      {!loading && !error && monday && (
        summary
          ? <p className="text-[11px] text-neutral-700 leading-relaxed whitespace-pre-line">{summary}</p>
          : <span className="text-[11px] text-neutral-400">No summary yet — will be generated next Monday morning.</span>
      )}

      {/* Other days: news list */}
      {!loading && !error && !monday && (
        <>
          {items.length === 0 && <span className="text-[11px] text-neutral-400">No news found</span>}
          <ul className="space-y-1">
            {items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[11px]">
                <span className="text-neutral-300 shrink-0">·</span>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-700 hover:text-[#FD9153] transition-colors flex-1 leading-snug"
                >
                  {item.title}
                </a>
                {item.source && <span className="text-neutral-400 shrink-0 text-[10px]">{item.source}</span>}
                {item.pubDate && <span className="text-neutral-400 shrink-0 text-[10px]">{timeAgo(item.pubDate)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
