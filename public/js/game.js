// Règles du jeu : énergie, XP, niveaux, défis et badges, calculés à partir de la trace.
import { fmtM, fmtKm } from './analyze.js';

export const XP_PER_LEVEL = 500;
const CHECKPOINT_XP = 100;
const FINISH_XP = 250;
const MIN_ENERGY = 18; // l'énergie descend jusque-là au pire moment de la rando

const MAJOR = ['refuge', 'cabane', 'hut', 'sommet', 'summit', 'peak', 'col'];
const LAKES = ['lac', 'lake'];
const ENERGY_BONUS = { refuge: 45, cabane: 45, hut: 45, lac: 20, lake: 20, source: 25, eau: 25, water: 25, cascade: 15 };
const BONUS_TEXT = {
  refuge: 'Pause casse-croûte', cabane: 'Pause casse-croûte', hut: 'Pause casse-croûte',
  lac: 'Pause fraîcheur', lake: 'Pause fraîcheur', source: 'Gourde remplie', eau: 'Gourde remplie', water: 'Gourde remplie',
  cascade: 'Pause fraîcheur', sommet: 'Vue imprenable', summit: 'Vue imprenable', peak: 'Vue imprenable', col: 'Col franchi',
};

// Rareté façon « carte d'objet », selon l'effort (km + D+/100)
const RARITIES = [
  { max: 12, key: 'uncommon', label: 'Peu commune', level: 'Balade' },
  { max: 22, key: 'rare', label: 'Rare', level: 'Rando modérée' },
  { max: 32, key: 'epic', label: 'Épique', level: 'Rando sportive' },
  { max: Infinity, key: 'legendary', label: 'Légendaire', level: 'Grosse journée' },
];

// Le terrain en mots plutôt qu'en pourcentages
export function terrain(slope) {
  if (slope <= -15) return { text: 'Descente raide', emoji: '⚠️', tone: 'red' };
  if (slope <= -5) return { text: 'Ça descend', emoji: '😎', tone: 'cyan' };
  if (slope < 5) return { text: 'Tranquille', emoji: '🙂', tone: 'green' };
  if (slope < 12) return { text: 'Ça grimpe', emoji: '😤', tone: 'yellow' };
  if (slope < 20) return { text: 'Ça pique !', emoji: '🔥', tone: 'orange' };
  return { text: 'Mur !', emoji: '🥵', tone: 'red' };
}

export function buildGame(track) {
  const { samples, stats, pois, loop } = track;
  const total = stats.distance;

  const checkpoints = pois
    .filter((p) => p.onTrack && p.d > 150 && !(loop && p.d > total - 150))
    .sort((a, b) => a.d - b.d)
    .map((p) => ({
      ...p,
      xp: CHECKPOINT_XP,
      energy: ENERGY_BONUS[p.type] ?? 10,
      bonusText: BONUS_TEXT[p.type] || 'Point découvert',
    }));

  // Énergie : baisse avec l'effort (distance + montée), remonte aux pauses.
  // On cale l'échelle pour que le moment le plus dur descende à MIN_ENERGY.
  const effort = samples.map((s, i) => {
    if (!i) return 0;
    const prev = samples[i - 1];
    const dz = s.ele - prev.ele;
    return (s.d - prev.d) / 1000 + Math.max(0, dz) / 100 + Math.max(0, -dz) / 400;
  });
  const simulate = (k) => {
    let e = 100;
    let c = 0;
    let min = 100;
    const out = samples.map((s, i) => {
      e -= k * effort[i];
      while (c < checkpoints.length && checkpoints[c].d <= s.d) e = Math.min(100, e + checkpoints[c++].energy);
      min = Math.min(min, e);
      return e;
    });
    return { out, min };
  };
  let lo = 0;
  let hi = 200;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    simulate(mid).min > MIN_ENERGY ? (lo = mid) : (hi = mid);
  }
  simulate(lo).out.forEach((e, i) => (samples[i].energy = e));

  // XP : 1 point tous les 10 m, 1 point par mètre de montée, bonus aux points de passage
  samples.forEach((s) => (s.xp = s.d / 10 + s.up));
  const xpAt = (d) => {
    const s = samples[Math.min(samples.length - 1, Math.round(d / 10))];
    const bonus = checkpoints.filter((c) => c.d <= d).length * CHECKPOINT_XP;
    return Math.round(s.xp + bonus + (d >= total - 1 ? FINISH_XP : 0));
  };
  const maxXP = xpAt(total);

  // Défis
  const quests = [];
  for (const c of checkpoints.filter((c) => MAJOR.includes(c.type))) {
    quests.push({ icon: c.icon, label: `Atteindre ${c.name}`, progress: (d) => Math.min(1, d / c.d) });
  }
  const lakes = checkpoints.filter((c) => LAKES.includes(c.type));
  if (lakes.length >= 2) {
    quests.push({
      icon: '💧',
      label: `Découvrir les ${lakes.length} lacs`,
      progress: (d) => lakes.filter((l) => l.d <= d).length / lakes.length,
      detail: (d) => `${lakes.filter((l) => l.d <= d).length}/${lakes.length}`,
    });
  }
  const top = samples.reduce((a, b) => (b.ele > a.ele ? b : a));
  quests.push({ icon: '🏔️', label: `Toucher le point culminant (${fmtM(stats.maxEle)})`, progress: (d) => Math.min(1, d / top.d) });
  if (stats.up > 50) {
    quests.push({
      icon: '⛰️',
      label: `Grimper ${fmtM(stats.up)}`,
      progress: (d) => samples[Math.min(samples.length - 1, Math.round(d / 10))].up / stats.up,
      detail: (d) => fmtM(samples[Math.min(samples.length - 1, Math.round(d / 10))].up),
    });
  }
  quests.push({ icon: '🏁', label: loop ? 'Boucler la boucle' : "Atteindre l'arrivée", progress: (d) => d / total });

  // Badges de fin de partie
  const maxSlope = Math.max(...samples.map((s) => Math.abs(s.slope)));
  const badges = [
    lakes.length >= 3 && { icon: '💧', name: 'Collectionneur de lacs', text: `${lakes.length} lacs découverts` },
    stats.up >= 500 && { icon: '🐐', name: 'Chamois', text: `${fmtM(stats.up)} grimpés` },
    stats.maxEle >= 2000 && { icon: '☁️', name: 'Tête dans les nuages', text: `Plus de 2 000 m d'altitude` },
    total >= 10000 && { icon: '🥾', name: 'Grand marcheur', text: `${fmtKm(total)} au compteur` },
    maxSlope >= 25 && { icon: '🔥', name: 'Mollets d’acier', text: 'Passages à plus de 25 %' },
    checkpoints.some((c) => MAJOR.slice(0, 3).includes(c.type)) && { icon: '🛖', name: 'Habitué des refuges', text: 'Refuge atteint' },
  ].filter(Boolean);

  const effortScore = total / 1000 + stats.up / 100;
  const rarity = RARITIES.find((r) => effortScore < r.max);

  return { checkpoints, quests, badges, rarity, maxXP, xpAt };
}

export const levelOf = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;
