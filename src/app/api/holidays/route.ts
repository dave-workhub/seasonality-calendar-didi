import { NextRequest, NextResponse } from 'next/server';
import { CountryCode } from '@/lib/cities';
import { getHolidays as getFallbackHolidays } from '@/lib/holidays';

/**
 * Live public holidays from Nager.Date (date.nager.at) — a free, open-source,
 * no-API-key public holiday API (github.com/nager/Nager.Date) covering all
 * six countries we need, including Ecuador (which DiDi's internal holiday
 * page doesn't list). This is the source of truth; the algorithmic engine
 * in lib/holidays.ts is only used as a fallback if the live call fails.
 */
const NAGER_SOURCE = 'https://date.nager.at';

interface NagerHoliday {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
}

export const revalidate = 3600; // cache each country/year for 1 hour

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country') as CountryCode | null;
  const year = req.nextUrl.searchParams.get('year');

  if (!country || !year) {
    return NextResponse.json({ error: 'country and year are required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${NAGER_SOURCE}/api/v3/PublicHolidays/${year}/${country}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Nager.Date responded ${res.status}`);

    const data: NagerHoliday[] = await res.json();
    const holidays = data.map((h) => {
      const [, m, d] = h.date.split('-').map(Number);
      return { month: m - 1, day: d, name: h.localName };
    });

    return NextResponse.json({ holidays, source: 'nager.date', live: true });
  } catch {
    // Live source unreachable — fall back to the algorithmic estimate so the
    // calendar still renders, but flag it so the UI can tell the user.
    const holidays = getFallbackHolidays(country, Number(year));
    return NextResponse.json({ holidays, source: 'algorithmic-fallback', live: false });
  }
}
