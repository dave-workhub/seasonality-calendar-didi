export type CountryCode = 'CO' | 'CL' | 'PE' | 'MX' | 'CR' | 'EC';

export interface City {
  slug: string;
  name: string;
  country: CountryCode;
}

export interface Cluster {
  slug: 'casa' | 'indigo';
  name: string;
  cities: City[];
}

export const CLUSTERS: Cluster[] = [
  {
    slug: 'casa',
    name: 'CASA',
    cities: [
      { slug: 'lima', name: 'Lima', country: 'PE' },
      { slug: 'valparaiso', name: 'Valparaíso', country: 'CL' },
      { slug: 'region-metropolitana', name: 'Región Metropolitana (Santiago)', country: 'CL' },
      { slug: 'concepcion', name: 'Concepción', country: 'CL' },
      { slug: 'bogota', name: 'Bogotá', country: 'CO' },
      { slug: 'barranquilla', name: 'Barranquilla', country: 'CO' },
      { slug: 'cali', name: 'Cali', country: 'CO' },
      { slug: 'pereira', name: 'Pereira', country: 'CO' },
      { slug: 'bucaramanga', name: 'Bucaramanga', country: 'CO' },
      { slug: 'san-jose', name: 'San José', country: 'CR' },
      { slug: 'quito', name: 'Quito', country: 'EC' },
    ],
  },
  {
    slug: 'indigo',
    name: 'Indigo',
    cities: [
      { slug: 'saltillo', name: 'Saltillo', country: 'MX' },
      { slug: 'hermosillo', name: 'Hermosillo', country: 'MX' },
      { slug: 'merida', name: 'Mérida', country: 'MX' },
      { slug: 'medellin', name: 'Medellín', country: 'CO' },
      { slug: 'cartagena', name: 'Cartagena', country: 'CO' },
    ],
  },
];

export const ALL_CITIES: City[] = CLUSTERS.flatMap((c) => c.cities);

export function findCity(citySlug: string): { cluster: Cluster; city: City } | null {
  for (const cluster of CLUSTERS) {
    const city = cluster.cities.find((c) => c.slug === citySlug);
    if (city) return { cluster, city };
  }
  return null;
}
