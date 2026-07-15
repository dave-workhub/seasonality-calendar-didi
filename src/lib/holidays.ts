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

export function getHolidays(country: CountryCode, y: number): HolidayEntry[] {
  const out: HolidayEntry[] = [];
  const push = (dt: Date, name: string) => out.push({ month: dt.getMonth(), day: dt.getDate(), name });
  const E = easter(y);

  switch (country) {
    case 'CO':
      push(D(y, 0, 1), 'Año Nuevo');
      push(nextMonday(D(y, 0, 6)), 'Reyes Magos');
      push(nextMonday(D(y, 2, 19)), 'San José');
      push(addDays(E, -3), 'Jueves Santo');
      push(addDays(E, -2), 'Viernes Santo');
      push(D(y, 4, 1), 'Día del Trabajo');
      push(nextMonday(addDays(E, 39)), 'Ascensión del Señor');
      push(nextMonday(addDays(E, 60)), 'Corpus Christi');
      push(nextMonday(addDays(E, 68)), 'Sagrado Corazón');
      push(nextMonday(D(y, 5, 29)), 'San Pedro y San Pablo');
      push(D(y, 6, 20), 'Independencia Nacional');
      push(D(y, 7, 7), 'Batalla de Boyacá');
      push(nextMonday(D(y, 7, 15)), 'Asunción de la Virgen');
      push(nextMonday(D(y, 9, 12)), 'Día de la Raza');
      push(nextMonday(D(y, 10, 1)), 'Todos los Santos');
      push(nextMonday(D(y, 10, 11)), 'Independencia de Cartagena');
      push(D(y, 11, 8), 'Inmaculada Concepción');
      push(D(y, 11, 25), 'Navidad');
      break;

    case 'CL': {
      push(D(y, 0, 1), 'Año Nuevo');
      if (D(y, 0, 1).getDay() === 6) push(D(y, 0, 2), 'Feriado adicional Año Nuevo');
      push(addDays(E, -2), 'Viernes Santo');
      push(addDays(E, -1), 'Sábado Santo');
      push(D(y, 4, 1), 'Día del Trabajo');
      push(D(y, 4, 21), 'Glorias Navales');
      const j21 = D(y, 5, 21);
      const jw = j21.getDay();
      push(jw === 0 ? D(y, 5, 22) : jw === 1 ? j21 : addDays(j21, 1 - jw), 'Día Nacional de los Pueblos Indígenas');
      push(nearestMonday(D(y, 5, 29)), 'San Pedro y San Pablo');
      push(D(y, 6, 16), 'Virgen del Carmen');
      push(D(y, 7, 15), 'Asunción de la Virgen');
      push(D(y, 8, 18), 'Día de la Independencia');
      push(D(y, 8, 19), 'Glorias del Ejército');
      push(nearestMonday(D(y, 9, 12)), 'Encuentro de Dos Mundos');
      push(D(y, 9, 31), 'Iglesias Evangélicas');
      push(D(y, 10, 1), 'Todos los Santos');
      push(D(y, 11, 8), 'Inmaculada Concepción');
      push(D(y, 11, 25), 'Navidad');
      break;
    }

    case 'PE':
      push(D(y, 0, 1), 'Año Nuevo');
      push(addDays(E, -3), 'Jueves Santo');
      push(addDays(E, -2), 'Viernes Santo');
      push(D(y, 4, 1), 'Día del Trabajo');
      push(D(y, 5, 7), 'Batalla de Arica');
      push(D(y, 5, 24), 'Día del Campesino');
      push(D(y, 5, 29), 'San Pedro y San Pablo');
      push(D(y, 6, 23), 'Día de la Fuerza Aérea');
      push(D(y, 6, 28), 'Fiestas Patrias – Día 1');
      push(D(y, 6, 29), 'Fiestas Patrias – Día 2');
      push(D(y, 7, 6), 'Batalla de Junín');
      push(D(y, 7, 30), 'Santa Rosa de Lima');
      push(D(y, 9, 8), 'Combate de Angamos');
      push(D(y, 10, 1), 'Todos los Santos');
      push(D(y, 11, 8), 'Inmaculada Concepción');
      push(D(y, 11, 9), 'Batalla de Ayacucho');
      push(D(y, 11, 25), 'Navidad');
      break;

    case 'MX':
      push(D(y, 0, 1), 'Año Nuevo');
      push(nthWeekday(y, 1, 1, 1), 'Día de la Constitución');
      push(nthWeekday(y, 2, 1, 3), 'Natalicio de Benito Juárez');
      push(addDays(E, -3), 'Jueves Santo');
      push(addDays(E, -2), 'Viernes Santo');
      push(D(y, 4, 1), 'Día del Trabajo');
      push(D(y, 4, 5), 'Batalla de Puebla');
      push(D(y, 8, 15), 'Independencia (víspera)');
      push(D(y, 8, 16), 'Día de la Independencia');
      push(nthWeekday(y, 10, 1, 3), 'Día de la Revolución');
      push(D(y, 11, 24), 'Nochebuena');
      push(D(y, 11, 25), 'Navidad');
      push(D(y, 11, 31), 'Fin de Año');
      break;

    case 'CR':
      push(D(y, 0, 1), 'Año Nuevo');
      push(addDays(E, -3), 'Jueves Santo');
      push(addDays(E, -2), 'Viernes Santo');
      push(D(y, 3, 11), 'Día de Juan Santamaría');
      push(D(y, 4, 1), 'Día del Trabajo');
      push(D(y, 6, 25), 'Anexión del Partido de Nicoya');
      push(D(y, 7, 2), 'Virgen de los Ángeles');
      push(D(y, 7, 15), 'Día de la Madre');
      push(D(y, 8, 15), 'Día de la Independencia');
      push(D(y, 11, 25), 'Navidad');
      break;

    case 'EC': {
      push(D(y, 0, 1), 'Año Nuevo');
      push(addDays(E, -48), 'Carnaval (Lunes)');
      push(addDays(E, -47), 'Carnaval (Martes)');
      push(addDays(E, -2), 'Viernes Santo');
      push(D(y, 4, 1), 'Día del Trabajo');
      push(D(y, 4, 24), 'Batalla de Pichincha');
      push(D(y, 7, 10), 'Primer Grito de Independencia de Quito');
      push(D(y, 9, 9), 'Independencia de Guayaquil');
      push(D(y, 10, 2), 'Día de los Difuntos');
      push(D(y, 10, 3), 'Independencia de Cuenca');
      push(D(y, 11, 25), 'Navidad');
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
      [D(y, 5, 30), 'Prima de servicios'],
      [D(y, 11, 20), 'Prima de servicios'],
    ],
    PE: [
      [D(y, 6, 15), 'Gratificación'],
      [D(y, 11, 15), 'Gratificación'],
    ],
    CL: [
      [D(y, 8, 15), 'Gratificación'],
      [D(y, 11, 15), 'Gratificación'],
    ],
    MX: [[D(y, 11, 20), 'Aguinaldo']],
    CR: [[D(y, 11, 1), 'Aguinaldo']],
    EC: [
      [D(y, 2, 15), 'Décimo Cuarto Sueldo'],
      [D(y, 11, 24), 'Décimo Tercer Sueldo'],
    ],
  };

  return defs[country].map(([dt, name]) => {
    const r = resolve(dt);
    return { month: r.getMonth(), day: r.getDate(), name };
  });
}
