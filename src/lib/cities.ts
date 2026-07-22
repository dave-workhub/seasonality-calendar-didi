export type CountryCode = 'CO' | 'CL' | 'PE' | 'MX' | 'CR' | 'EC';

export interface City {
  slug: string;
  name: string;
  country: CountryCode;
}

export interface CountryGroup {
  code: CountryCode;
  name: string;
  cities: City[];
}

const COUNTRY_NAMES: Record<CountryCode, string> = {
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Perú',
  MX: 'México',
  CR: 'Costa Rica',
  EC: 'Ecuador',
};

export const ALL_CITIES: City[] = [
  { slug: 'bogota', name: 'Bogotá', country: 'CO' },
  { slug: 'barranquilla', name: 'Barranquilla', country: 'CO' },
  { slug: 'cali', name: 'Cali', country: 'CO' },
  { slug: 'pereira', name: 'Pereira', country: 'CO' },
  { slug: 'bucaramanga', name: 'Bucaramanga', country: 'CO' },
  { slug: 'medellin', name: 'Medellín', country: 'CO' },
  { slug: 'cartagena', name: 'Cartagena', country: 'CO' },
  { slug: 'valparaiso', name: 'Valparaíso', country: 'CL' },
  { slug: 'region-metropolitana', name: 'Región Metropolitana (Santiago)', country: 'CL' },
  { slug: 'concepcion', name: 'Concepción', country: 'CL' },
  { slug: 'lima', name: 'Lima', country: 'PE' },
  { slug: 'saltillo', name: 'Saltillo', country: 'MX' },
  { slug: 'hermosillo', name: 'Hermosillo', country: 'MX' },
  { slug: 'merida', name: 'Mérida', country: 'MX' },
  { slug: 'san-jose', name: 'San José', country: 'CR' },
  { slug: 'quito', name: 'Quito', country: 'EC' },
];

const COUNTRY_ORDER: CountryCode[] = ['CO', 'CL', 'PE', 'MX', 'CR', 'EC'];

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
