// Calculs sur la trace : rééchantillonnage, lissage, pente, dénivelés, temps de marche.

const R = 6371008.8;
const STEP = 10; // mètres entre deux points rééchantillonnés
const toRad = (d) => (d * Math.PI) / 180;

export function distance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Couleurs de pente (identiques à la légende CSS)
const SLOPE_STOPS = [
  [0, [46, 158, 91]],
  [7, [155, 197, 61]],
  [12, [242, 193, 78]],
  [19, [240, 138, 36]],
  [30, [215, 38, 61]],
];

export function slopeColor(slope) {
  const s = Math.min(Math.abs(slope), 30);
  for (let i = 1; i < SLOPE_STOPS.length; i++) {
    const [s1, c1] = SLOPE_STOPS[i];
    if (s <= s1) {
      const [s0, c0] = SLOPE_STOPS[i - 1];
      const t = (s - s0) / (s1 - s0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  const c = SLOPE_STOPS[SLOPE_STOPS.length - 1][1];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const POI_ICONS = {
  parking: '🅿️', lac: '💧', lake: '💧', refuge: '🛖', cabane: '🛖', hut: '🛖',
  col: '⛰️', sommet: '🏔️', summit: '🏔️', peak: '🏔️', pont: '🌉', bridge: '🌉',
  source: '🚰', eau: '🚰', water: '🚰', vue: '📷', viewpoint: '📷', cascade: '🌊',
};
export const poiIcon = (type) => POI_ICONS[type] || '📍';

function resample(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distance(points[i - 1], points[i]));
  const total = cum[cum.length - 1];

  const out = [];
  let j = 0;
  for (let d = 0; d < total; d += STEP) {
    while (j < points.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j]) / seg));
    const a = points[j];
    const b = points[j + 1];
    out.push({
      d,
      lon: a.lon + (b.lon - a.lon) * t,
      lat: a.lat + (b.lat - a.lat) * t,
      ele: a.ele + (b.ele - a.ele) * t,
    });
  }
  const last = points[points.length - 1];
  out.push({ d: total, lon: last.lon, lat: last.lat, ele: last.ele });
  return { samples: out, total, cum };
}

function smooth(values, radius) {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      sum += values[k];
      n++;
    }
    return sum / n;
  });
}

// Temps de marche (norme DIN 33466) : 4 km/h à plat, 300 m/h en montée, 500 m/h en descente.
function dinHours(meters, up, down) {
  const h = meters / 4000;
  const v = up / 300 + down / 500;
  return Math.max(h, v) + Math.min(h, v) / 2;
}

// Fonction de Tobler : ~5 km/h à plat, plus lent en montée comme en forte descente
export function walkingSpeed(slopePct) {
  return 6 * Math.exp(-3.5 * Math.abs(slopePct / 100 + 0.05));
}

export function analyzeTrack(points, waypoints = []) {
  const { samples, total, cum } = resample(points);
  const eles = smooth(samples.map((s) => s.ele), 4);
  samples.forEach((s, i) => (s.ele = eles[i]));

  // Pente sur ±50 m
  const W = 5;
  samples.forEach((s, i) => {
    const a = samples[Math.max(0, i - W)];
    const b = samples[Math.min(samples.length - 1, i + W)];
    s.slope = b.d > a.d ? ((b.ele - a.ele) / (b.d - a.d)) * 100 : 0;
  });

  // Dénivelés avec seuil d'hystérésis pour ignorer le bruit
  let up = 0;
  let down = 0;
  let ref = eles[0];
  samples.forEach((s) => {
    const e = s.ele;
    if (e - ref > 2) { up += e - ref; ref = e; }
    else if (ref - e > 2) { down += ref - e; ref = e; }
    s.up = up; // dénivelé positif cumulé depuis le départ
  });

  // Vitesse de marche selon la pente (fonction de Tobler, ramenée à un rythme de randonneur)
  samples.forEach((s) => (s.kmh = walkingSpeed(s.slope)));

  // Temps cumulé : réparti segment par segment selon la vitesse, recalé sur le total DIN
  let raw = 0;
  samples[0].t = 0;
  for (let i = 1; i < samples.length; i++) {
    const kmh = (samples[i].kmh + samples[i - 1].kmh) / 2;
    raw += (samples[i].d - samples[i - 1].d) / 1000 / kmh;
    samples[i].t = raw;
  }
  const hours = dinHours(total, up, down);
  const pace = raw && hours ? raw / hours : 1;
  samples.forEach((s) => {
    s.t = s.t / pace;
    s.kmh *= pace; // vitesse cohérente avec le temps affiché
  });

  const maxEle = Math.max(...eles);
  const minEle = Math.min(...eles);

  // Points d'intérêt : projetés sur la trace s'ils en sont proches
  const pois = waypoints.map((w) => {
    // Plus proche passage ; en cas de passages multiples (boucle, aller-retour), on garde le premier
    const dists = samples.map((s) => distance(w, s));
    const bestDist = Math.min(...dists);
    const best = samples[dists.findIndex((dd) => dd <= bestDist + 30)];
    const onTrack = bestDist < 400;
    return {
      ...w,
      icon: poiIcon(w.type),
      onTrack,
      d: onTrack ? best.d : null,
      ele: onTrack ? best.ele : w.ele,
    };
  });

  const start = points[0];
  const end = points[points.length - 1];

  return {
    points,
    cum,
    samples,
    pois,
    loop: distance(start, end) < 250,
    stats: {
      distance: total,
      up,
      down,
      maxEle,
      minEle,
      hours,
    },
  };
}

// Point interpolé à une distance donnée (en mètres) depuis le départ
export function pointAt(track, d) {
  const s = track.samples;
  const clamped = Math.max(0, Math.min(track.stats.distance, d));
  const i = Math.min(s.length - 2, Math.floor(clamped / STEP));
  const a = s[i];
  const b = s[i + 1];
  const t = b.d > a.d ? Math.max(0, Math.min(1, (clamped - a.d) / (b.d - a.d))) : 0;
  return {
    d: clamped,
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    ele: a.ele + (b.ele - a.ele) * t,
    slope: a.slope + (b.slope - a.slope) * t,
    t: a.t + (b.t - a.t) * t,
    kmh: a.kmh + (b.kmh - a.kmh) * t,
    up: a.up + (b.up - a.up) * t,
    i,
  };
}

// Point de la trace le plus proche d'une position (lon/lat)
export function nearestSample(track, lngLat) {
  const p = { lon: lngLat.lng, lat: lngLat.lat };
  let best = track.samples[0];
  let bestDist = Infinity;
  for (const s of track.samples) {
    const dd = distance(p, s);
    if (dd < bestDist) { bestDist = dd; best = s; }
  }
  return best;
}

// Formatage
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const fmtKm = (m) => `${nf1.format(m / 1000)} km`;
export const fmtM = (m) => `${nf0.format(Math.round(m))} m`;
export function fmtDuration(hours) {
  const total = Math.round((hours * 60) / 5) * 5;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}
