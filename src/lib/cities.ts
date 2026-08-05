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
  PE: 'Perú',
  MX: 'México',
  CR: 'Costa Rica',
  EC: 'Ecuador',
};

export const ALL_CITIES: City[] = [
  { slug: 'bogota', name: 'Bogotá', country: 'CO', lat: 4.7110, lon: -74.0721 },
  { slug: 'barranquilla', name: 'Barranquilla', country: 'CO', lat: 10.9639, lon: -74.7964 },
  { slug: 'cali', name: 'Cali', country: 'CO', lat: 3.4516, lon: -76.5320 },
  { slug: 'pereira', name: 'Pereira', country: 'CO', lat: 4.8087, lon: -75.6906 },
  { slug: 'bucaramanga', name: 'Bucaramanga', country: 'CO', lat: 7.1193, lon: -73.1227 },
  { slug: 'medellin', name: 'Medellín', country: 'CO', lat: 6.2442, lon: -75.5812 },
  { slug: 'cartagena', name: 'Cartagena', country: 'CO', lat: 10.3910, lon: -75.4794 },
  { slug: 'valparaiso', name: 'Valparaíso', country: 'CL', lat: -33.0472, lon: -71.6127 },
  { slug: 'region-metropolitana', name: 'Región Metropolitana (Santiago)', country: 'CL', lat: -33.4489, lon: -70.6693 },
  { slug: 'concepcion', name: 'Concepción', country: 'CL', lat: -36.8201, lon: -73.0444 },
  { slug: 'lima', name: 'Lima', country: 'PE', lat: -12.0464, lon: -77.0428 },
  { slug: 'saltillo', name: 'Saltillo', country: 'MX', lat: 25.4260, lon: -101.0053 },
  { slug: 'hermosillo', name: 'Hermosillo', country: 'MX', lat: 29.0729, lon: -110.9559 },
  { slug: 'merida', name: 'Mérida', country: 'MX', lat: 20.9674, lon: -89.5926 },
  { slug: 'san-jose', name: 'San José', country: 'CR', lat: 9.9281, lon: -84.0907 },
  { slug: 'quito', name: 'Quito', country: 'EC', lat: -0.1807, lon: -78.4678 },
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
