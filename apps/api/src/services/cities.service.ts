import { AppDataSource } from "../data-source";

const GEO_API = "https://geo.api.gouv.fr";

export interface CitySuggest {
  insee: string;
  name: string;
  label: string;
}

interface GeoApiCommune {
  code: string;
  nom: string;
  centre?: { coordinates?: [number, number] };
  departement?: { code: string; nom: string };
}

/** Distance haversine en km, pure (testable). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function upsertCity(c: GeoApiCommune): Promise<void> {
  const coords = c.centre?.coordinates;
  if (!coords || !c.departement) return;
  const [lng, lat] = coords;
  await AppDataSource.query(
    `INSERT INTO cities (insee, name, dept_code, dept_name, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (insee) DO UPDATE SET name=EXCLUDED.name, dept_code=EXCLUDED.dept_code,
       dept_name=EXCLUDED.dept_name, lat=EXCLUDED.lat, lng=EXCLUDED.lng`,
    [c.code, c.nom, c.departement.code, c.departement.nom, lat, lng],
  );
}

/** Autocomplétion : top 10 des communes ; met en cache le centroïde de chacune. */
export async function searchCities(q: string): Promise<CitySuggest[]> {
  const url = `${GEO_API}/communes?nom=${encodeURIComponent(q)}&fields=nom,code,centre,departement&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geo.api ${res.status}`);
  const list = (await res.json()) as GeoApiCommune[];
  await Promise.all(list.slice(0, 10).map((c) => upsertCity(c)));
  return list.slice(0, 10).map((c) => ({
    insee: c.code,
    name: c.nom,
    label: `${c.nom} (${c.departement?.nom ?? "?"})`,
  }));
}

export interface CityCentroid {
  lat: number;
  lng: number;
}

/** Centroïde depuis le cache local ; fetch geo.api à la première demande. */
export async function getCentroid(insee: string): Promise<CityCentroid | null> {
  const rows = (await AppDataSource.query(`SELECT lat, lng FROM cities WHERE insee = $1`, [insee])) as unknown as Array<{ lat: number | string; lng: number | string }>;
  if (rows.length > 0) return { lat: Number(rows[0]!.lat), lng: Number(rows[0]!.lng) };
  const url = `${GEO_API}/communes?code=${encodeURIComponent(insee)}&fields=nom,code,centre,departement&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const list = (await res.json()) as GeoApiCommune[];
  if (list.length === 0) return null;
  await upsertCity(list[0]!);
  const c = list[0]!.centre?.coordinates;
  return c ? { lat: c[1], lng: c[0] } : null;
}

/** Résout un nom vers l'entrée exacte (fixtures seed) — null si ambigu/inconnu. */
export async function resolveExactName(name: string): Promise<CitySuggest | null> {
  const all = await searchCities(name);
  return all.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
}
