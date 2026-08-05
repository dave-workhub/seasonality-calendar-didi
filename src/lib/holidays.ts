import { CountryCode } from './cities';

export interface HolidayEntry {
  month: number; // 0-based
  day: number;
  name: string;
}

const D = (y: number, m: number, d: number) => new Date(y, m, d);
const addDays = (dt: Date, n: number) => {
  const x = new Date(dt);
  x.setDate(x.getDate() + n);
  return x;
};

export function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo, da);
}

/** Next Monday on/after date — Colombia's "Ley Emiliani" transfer rule. */
function nextMonday(dt: Date): Date {
  const x = new Date(dt);
  const w = x.getDay();
  if (w === 1) return x;
  x.setDate(x.getDate() + (w === 0 ? 1 : 8 - w));
  return x;
}

/** Nearest Monday (forward or back) — used by some Chilean "long weekend" holidays. */
function nearestMonday(dt: Date): Date {
  const x = new Date(dt);
  const w = x.getDay();
  if (w === 1) return x;
  const fwd = w === 0 ? 1 : 8 - w;
  const bwd = w === 0 ? 6 : w - 1;
  x.setDate(x.getDate() + (fwd <= bwd ? fwd : -bwd));
  return x;
}

/** n-th weekday (0=Sun..6=Sat) of a given month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): Date {
  const first = D(y, m, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return D(y, m, 1 + offset + (n - 1) * 7);
}

/**
 * Official 2026 holiday calendar as published by DiDi's internal IBG D-Hub
 * (sites.google.com/didi-labs.com/dihubssl/orange-zone/holidays-2026).
 * Takes precedence over the algorithmic estimate below for 2026. Not
 * available for Ecuador (Quito) — that source has no EC entry, so EC
 * still falls back to the algorithmic estimate and should be verified
 * manually.
 *
 * Two Peru dates ("Day of Peruvian Air Force" and "Santa Rosa de Lima")
 * were rendered without a day number on the source page (a formatting
 * glitch there, not on our end) — filled in with their well-known
 * historical dates (Jul 23 and Aug 30) pending confirmation.
 *
 * Mexico's "11-Jun World Cup" entry on that page isn't an actual paid
 * holiday, so it's modeled as a curated `other_event` in Supabase
 * instead of a national holiday here.
 */
const OFFICIAL_2026: Partial<Record<CountryCode, [number, number, string][]>> = {
  CO: [
    [0, 1, "New Year's Day"], [0, 12, 'Epiphany'], [2, 23, "St. Joseph's Day"],
    [3, 2, 'Maundy Thursday'], [3, 3, 'Good Friday'], [4, 1, 'Labor Day'],
    [4, 18, 'Ascension Day'], [5, 8, 'Corpus Christi'], [5, 15, 'Sacred Heart'],
    [5, 29, 'St. Peter and St. Paul'], [6, 13, 'Our Lady of Chiquinquirá'],
    [6, 20, 'Independence Day'], [7, 7, 'Battle of Boyacá'], [7, 17, 'Assumption of Mary'],
    [9, 12, 'Columbus Day'], [10, 2, "All Saints' Day"], [10, 16, 'Independence of Cartagena'],
    [11, 8, 'Immaculate Conception'], [11, 25, 'Christmas'],
  ],
  CL: [
    [0, 1, "New Year's Day"], [3, 2, 'Maundy Thursday'], [3, 3, 'Good Friday'], [4, 1, 'Labor Day'],
    [4, 21, 'Navy Day'], [5, 29, 'St. Peter and St. Paul'], [6, 16, 'Our Lady of Mount Carmel'],
    [7, 15, 'Assumption of Mary'], [8, 18, 'Independence Day'], [8, 19, "Army Day"],
    [9, 12, 'Meeting of Two Worlds'], [9, 31, 'Evangelical and Protestant Churches Day'],
    [10, 1, "All Saints' Day"], [11, 8, 'Immaculate Conception'], [11, 24, 'Christmas Eve'],
    [11, 25, 'Christmas'], [11, 31, "New Year's Eve"],
  ],
  PE: [
    [0, 1, "New Year's Day"], [0, 6, 'Epiphany'], [3, 2, 'Maundy Thursday'], [3, 3, 'Good Friday'],
    [4, 1, 'Labor Day'], [5, 8, 'Battle of Arica'], [5, 29, 'St. Peter and St. Paul'],
    [6, 23, 'Peruvian Air Force Day'], [6, 28, 'Independence Day 1'],
    [6, 29, 'Independence Day 2'], [7, 6, 'Battle of Junín'], [7, 30, 'St. Rose of Lima'],
    [9, 8, 'Battle of Angamos'], [10, 2, "All Saints' Day"], [11, 8, 'Immaculate Conception'],
    [11, 9, 'Battle of Ayacucho'], [11, 25, 'Christmas'],
  ],
  MX: [
    [0, 1, "New Year's Day"], [1, 2, 'Constitution Day'], [2, 16, "Benito Juárez's Birthday"],
    [3, 2, 'Maundy Thursday'], [3, 3, 'Good Friday'], [4, 1, 'Labor Day'],
    [8, 15, 'Independence Day (eve)'], [8, 16, 'Independence Day'],
    [10, 2, 'Day of the Dead'], [10, 16, 'Revolution Day'],
    [11, 24, 'Christmas Eve'], [11, 25, 'Christmas'], [11, 31, "New Year's Eve"],
  ],
  CR: [
    [0, 1, "New Year's Day"], [3, 2, 'Maundy Thursday'], [3, 3, 'Good Friday'], [3, 13, 'Juan Santamaría Day'],
    [4, 1, 'Labor Day'], [6, 27, 'Guanacaste Day'],
    [7, 31, 'Afro-Costa Rican Culture Day'],
    [8, 14, 'Independence Day (eve)'], [8, 15, 'Independence Day'],
    [11, 1, 'Army Abolition Day'], [11, 24, 'Christmas Eve'], [11, 25, 'Christmas'], [11, 31, "New Year's Eve"],
  ],
};

export function getHolidays(country: CountryCode, y: number): HolidayEntry[] {
  const official = OFFICIAL_2026[country];
  if (y === 2026 && official) {
    return official
      .map(([month, day, name]) => ({ month, day, name }))
      .sort((a, b) => a.month - b.month || a.day - b.day);
  }

  const out: HolidayEntry[] = [];
  const push = (dt: Date, name: string) => out.push({ month: dt.getMonth(), day: dt.getDate(), name });
  const E = easter(y);

  switch (country) {
    case 'CO':
      push(D(y, 0, 1), "New Year's Day");
      push(nextMonday(D(y, 0, 6)), 'Epiphany');
      push(nextMonday(D(y, 2, 19)), "St. Joseph's Day");
      push(addDays(E, -3), 'Maundy Thursday');
      push(addDays(E, -2), 'Good Friday');
      push(D(y, 4, 1), 'Labor Day');
      push(nextMonday(addDays(E, 39)), 'Ascension Day');
      push(nextMonday(addDays(E, 60)), 'Corpus Christi');
      push(nextMonday(addDays(E, 68)), 'Sacred Heart');
      push(nextMonday(D(y, 5, 29)), 'St. Peter and St. Paul');
      push(D(y, 6, 20), 'Independence Day');
      push(D(y, 7, 7), 'Battle of Boyacá');
      push(nextMonday(D(y, 7, 15)), 'Assumption of Mary');
      push(nextMonday(D(y, 9, 12)), 'Columbus Day');
      push(nextMonday(D(y, 10, 1)), "All Saints' Day");
      push(nextMonday(D(y, 10, 11)), 'Independence of Cartagena');
      push(D(y, 11, 8), 'Immaculate Conception');
      push(D(y, 11, 25), 'Christmas');
      break;

    case 'CL': {
      push(D(y, 0, 1), "New Year's Day");
      if (D(y, 0, 1).getDay() === 6) push(D(y, 0, 2), "New Year's Day (observed)");
      push(addDays(E, -2), 'Good Friday');
      push(addDays(E, -1), 'Holy Saturday');
      push(D(y, 4, 1), 'Labor Day');
      push(D(y, 4, 21), 'Navy Day');
      const j21 = D(y, 5, 21);
      const jw = j21.getDay();
      push(jw === 0 ? D(y, 5, 22) : jw === 1 ? j21 : addDays(j21, 1 - jw), 'National Day of Indigenous Peoples');
      push(nearestMonday(D(y, 5, 29)), 'St. Peter and St. Paul');
      push(D(y, 6, 16), 'Our Lady of Mount Carmel');
      push(D(y, 7, 15), 'Assumption of Mary');
      push(D(y, 8, 18), 'Independence Day');
      push(D(y, 8, 19), 'Army Day');
      push(nearestMonday(D(y, 9, 12)), 'Meeting of Two Worlds');
      push(D(y, 9, 31), 'Evangelical and Protestant Churches Day');
      push(D(y, 10, 1), "All Saints' Day");
      push(D(y, 11, 8), 'Immaculate Conception');
      push(D(y, 11, 25), 'Christmas');
      break;
    }

    case 'PE':
      push(D(y, 0, 1), "New Year's Day");
      push(addDays(E, -3), 'Maundy Thursday');
      push(addDays(E, -2), 'Good Friday');
      push(D(y, 4, 1), 'Labor Day');
      push(D(y, 5, 7), 'Battle of Arica');
      push(D(y, 5, 24), 'Farmer\'s Day');
      push(D(y, 5, 29), 'St. Peter and St. Paul');
      push(D(y, 6, 23), 'Peruvian Air Force Day');
      push(D(y, 6, 28), 'Independence Day 1');
      push(D(y, 6, 29), 'Independence Day 2');
      push(D(y, 7, 6), 'Battle of Junín');
      push(D(y, 7, 30), 'St. Rose of Lima');
      push(D(y, 9, 8), 'Battle of Angamos');
      push(D(y, 10, 1), "All Saints' Day");
      push(D(y, 11, 8), 'Immaculate Conception');
      push(D(y, 11, 9), 'Battle of Ayacucho');
      push(D(y, 11, 25), 'Christmas');
      break;

    case 'MX':
      push(D(y, 0, 1), "New Year's Day");
      push(nthWeekday(y, 1, 1, 1), 'Constitution Day');
      push(nthWeekday(y, 2, 1, 3), "Benito Juárez's Birthday");
      push(addDays(E, -3), 'Maundy Thursday');
      push(addDays(E, -2), 'Good Friday');
      push(D(y, 4, 1), 'Labor Day');
      push(D(y, 8, 15), 'Independence Day (eve)');
      push(D(y, 8, 16), 'Independence Day');
      push(nthWeekday(y, 10, 1, 3), 'Revolution Day');
      push(D(y, 11, 24), 'Christmas Eve');
      push(D(y, 11, 25), 'Christmas');
      push(D(y, 11, 31), "New Year's Eve");
      break;

    case 'CR':
      push(D(y, 0, 1), "New Year's Day");
      push(addDays(E, -3), 'Maundy Thursday');
      push(addDays(E, -2), 'Good Friday');
      push(D(y, 3, 11), 'Juan Santamaría Day');
      push(D(y, 4, 1), 'Labor Day');
      push(D(y, 6, 25), 'Annexation of Nicoya');
      push(D(y, 7, 2), 'Our Lady of the Angels');
      push(D(y, 7, 15), "Mother's Day");
      push(D(y, 8, 15), 'Independence Day');
      push(D(y, 11, 25), 'Christmas');
      break;

    case 'EC': {
      push(D(y, 0, 1), "New Year's Day");
      push(addDays(E, -48), 'Carnival (Monday)');
      push(addDays(E, -47), 'Carnival (Tuesday)');
      push(addDays(E, -2), 'Good Friday');
      push(D(y, 4, 1), 'Labor Day');
      push(D(y, 4, 24), 'Battle of Pichincha');
      push(D(y, 7, 10), "Quito's First Cry of Independence");
      push(D(y, 9, 9), 'Independence of Guayaquil');
      push(D(y, 10, 2), "All Souls' Day");
      push(D(y, 10, 3), 'Independence of Cuenca');
      push(D(y, 11, 25), 'Christmas');
      break;
    }
  }

  return out.sort((a, b) => a.month - b.month || a.day - b.day);
}

/* ── ISO week number ── */
export function isoWeek(dt: Date): number {
  const d = new Date(dt);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - y1.getTime()) / 86400000 + 1) / 7);
}

/* ── Payroll: last working day of month = paycheck ── */
export function getPaycheckDates(y: number, holidaySet: Set<string>): Set<string> {
  const out = new Set<string>();
  const key = (dt: Date) => `${dt.getMonth()}-${dt.getDate()}`;
  const isWorkday = (dt: Date) => dt.getDay() !== 0 && dt.getDay() !== 6 && !holidaySet.has(key(dt));
  for (let m = 0; m < 12; m++) {
    const d = new Date(y, m + 1, 0);
    while (!isWorkday(d)) d.setDate(d.getDate() - 1);
    out.add(key(d));
  }
  return out;
}

export interface BonusDate {
  month: number;
  day: number;
  name: string;
}

/** Statutory bonus ("prima" / "gratificación" / "aguinaldo") payout windows, moved to the nearest prior workday. */
export function getBonusDates(country: CountryCode, y: number, holidaySet: Set<string>): BonusDate[] {
  const key = (dt: Date) => `${dt.getMonth()}-${dt.getDate()}`;
  const isWorkday = (dt: Date) => dt.getDay() !== 0 && dt.getDay() !== 6 && !holidaySet.has(key(dt));
  const prevWorkday = (dt: Date) => {
    const d = new Date(dt);
    do {
      d.setDate(d.getDate() - 1);
    } while (!isWorkday(d));
    return d;
  };
  const resolve = (dt: Date) => (isWorkday(dt) ? dt : prevWorkday(dt));

  const defs: Record<CountryCode, [Date, string][]> = {
    CO: [
      [D(y, 5, 30), 'Service Bonus'],
      [D(y, 11, 20), 'Service Bonus'],
    ],
    PE: [
      [D(y, 6, 15), 'Bonus'],
      [D(y, 11, 15), 'Bonus'],
    ],
    CL: [
      [D(y, 8, 15), 'Bonus'],
      [D(y, 11, 15), 'Bonus'],
    ],
    MX: [[D(y, 11, 20), 'Christmas Bonus']],
    CR: [[D(y, 11, 1), 'Christmas Bonus']],
    EC: [
      [D(y, 2, 15), '14th Salary'],
      [D(y, 11, 24), '13th Salary'],
    ],
  };

  return defs[country].map(([dt, name]) => {
    const r = resolve(dt);
    return { month: r.getMonth(), day: r.getDate(), name };
  });
}
