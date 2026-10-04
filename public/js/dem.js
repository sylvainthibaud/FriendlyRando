// Complète les altitudes manquantes d'une trace à partir des tuiles de relief
// "terrarium" (AWS Terrain Tiles) : altitude = R*256 + G + B/256 - 32768.

export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const ZOOM = 13;
const SIZE = 256;

function project(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

async function loadTile(x, y) {
  const url = TERRAIN_TILES.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tuile de relief introuvable (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

export async function fillMissingElevations(points) {
  const missing = points.filter((p) => p.ele === null);
  if (!missing.length) return points;

  const tiles = new Map();
  const getTile = (x, y) => {
    const key = `${x}/${y}`;
    if (!tiles.has(key)) tiles.set(key, loadTile(x, y));
    return tiles.get(key);
  };

  await Promise.all(
    missing.map(async (p) => {
      const { x, y } = project(p.lon, p.lat, ZOOM);
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      const data = await getTile(tx, ty);
      const px = Math.min(SIZE - 1, Math.floor((x - tx) * SIZE));
      const py = Math.min(SIZE - 1, Math.floor((y - ty) * SIZE));
      const i = (py * SIZE + px) * 4;
      p.ele = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
    })
  );
  return points;
}
