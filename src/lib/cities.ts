export type CountryCode = 'CO' | 'CL' | 'PE' | 'MX' | 'CR' | 'EC';

export interface City {
  slug: string;
  name: string;
  country: CountryCode;
  lat: number;
  lon: number;
}

export interface CountryGroup {
  code: CountryCode;
  name: string;
  cities: City[];
}

const COUNTRY_NAMES: Record<CountryCode, string> = {
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Peru',
  MX: 'Mexico',
  CR: 'Costa Rica',
  EC: 'Ecuador',
};

export const ALL_CITIES: City[] = [
  { slug: 'cartagena', name: 'Cartagena', country: 'CO', lat: 10.3910, lon: -75.4794 },
  { slug: 'medellin', name: 'Medellín', country: 'CO', lat: 6.2442, lon: -75.5812 },
  { slug: 'saltillo', name: 'Saltillo', country: 'MX', lat: 25.4260, lon: -101.0053 },
  { slug: 'hermosillo', name: 'Hermosillo', country: 'MX', lat: 29.0729, lon: -110.9559 },
  { slug: 'merida', name: 'Mérida', country: 'MX', lat: 20.9674, lon: -89.5926 },
];

const COUNTRY_ORDER: CountryCode[] = ['CO', 'MX'];

export const COUNTRIES: CountryGroup[] = COUNTRY_ORDER.map((code) => ({
  code,
  name: COUNTRY_NAMES[code],
  cities: ALL_CITIES.filter((c) => c.country === code),
}));

export function findCity(citySlug: string): { country: CountryGroup; city: City } | null {
  for (const country of COUNTRIES) {
    const city = country.cities.find((c) => c.slug === citySlug);
    if (city) return { country, city };
  }
  return null;
}
