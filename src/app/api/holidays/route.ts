import { NextRequest, NextResponse } from 'next/server';
import { CountryCode } from '@/lib/cities';
import { getHolidays as getFallbackHolidays, HolidayEntry } from '@/lib/holidays';
import { supabaseAdmin, supabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';

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
  name: string; // English name — used instead of localName to keep the whole app in English
}

export const revalidate = 3600; // cache each country/year for 1 hour

/** City-specific corrections: hide a wrong live holiday, rename one, or add a local one Nager.Date doesn't know about. */
async function applyOverrides(city: string, year: string, holidays: HolidayEntry[]): Promise<HolidayEntry[]> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return holidays;

  const { data, error } = await supabaseAdmin
    .from('holiday_overrides')
    .select('override_date, hidden, custom_name')
    .eq('city_slug', city)
    .gte('override_date', `${year}-01-01`)
    .lte('override_date', `${year}-12-31`);

  if (error || !data || data.length === 0) return holidays;

  const overrideMap = new Map<string, { hidden: boolean; custom_name: string | null }>();
  for (const o of data) {
    const [, m, d] = o.override_date.split('-').map(Number);
    overrideMap.set(`${m - 1}-${d}`, { hidden: o.hidden, custom_name: o.custom_name });
  }

  const matchedKeys = new Set<string>();
  const merged: HolidayEntry[] = [];
  for (const h of holidays) {
    const key = `${h.month}-${h.day}`;
    const override = overrideMap.get(key);
    if (override) {
      matchedKeys.add(key);
      if (override.hidden) continue;
      merged.push({ ...h, name: override.custom_name || h.name });
    } else {
      merged.push(h);
    }
  }
  // Local additions: an override on a date with no matching live holiday.
  for (const [key, override] of overrideMap) {
    if (matchedKeys.has(key) || override.hidden || !override.custom_name) continue;
    const [month, day] = key.split('-').map(Number);
    merged.push({ month, day, name: override.custom_name });
  }

  return merged.sort((a, b) => a.month - b.month || a.day - b.day);
}

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country') as CountryCode | null;
  const year = req.nextUrl.searchParams.get('year');
  const city = req.nextUrl.searchParams.get('city');

  if (!country || !year) {
    return NextResponse.json({ error: 'country and year are required' }, { status: 400 });
  }

  const authorizedEmail = await getAuthorizedDidilabsEmail(req);
  if (!authorizedEmail) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  let holidays: HolidayEntry[];
  let source: string;
  let live: boolean;

  try {
    const res = await fetch(`${NAGER_SOURCE}/api/v3/PublicHolidays/${year}/${country}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Nager.Date responded ${res.status}`);

    const data: NagerHoliday[] = await res.json();
    holidays = data.map((h) => {
      const [, m, d] = h.date.split('-').map(Number);
      return { month: m - 1, day: d, name: h.name };
    });
    source = 'nager.date';
    live = true;
  } catch {
    // Live source unreachable — fall back to the algorithmic estimate so the
    // calendar still renders, but flag it so the UI can tell the user.
    holidays = getFallbackHolidays(country, Number(year));
    source = 'algorithmic-fallback';
    live = false;
  }

  if (city) holidays = await applyOverrides(city, year, holidays);

  return NextResponse.json({ holidays, source, live });
}
