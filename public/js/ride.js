// Lecture « grand public » de la rando : difficulté, terrain, passage le plus dur, énergie demandée, points de passage.

// Énergie demandée à chaque instant selon la pente (0 à 100) :
// quasi rien en descente, peu sur le plat, beaucoup dans les fortes montées (100 à partir de 25 %).
export function energyDemand(slope) {
  if (slope <= -5) return 8;
  if (slope < 0) return 8 + ((slope + 5) / 5) * 12;
  return Math.min(100, 20 + (slope / 25) * 80);
}

export function energyWord(e) {
  if (e < 12) return 'Quasi aucune';
  if (e < 35) return 'Peu';
  if (e < 60) return 'Moyenne';
  if (e < 85) return 'Beaucoup';
  return 'Énorme';
}

// Difficulté selon l'effort (km + D+/100), avec le code couleur des pistes
const LEVELS = [
  { max: 12, key: 'verte', label: 'Facile' },
  { max: 22, key: 'bleue', label: 'Modérée' },
  { max: 32, key: 'rouge', label: 'Sportive' },
  { max: Infinity, key: 'noire', label: 'Difficile' },
];

// Le terrain en mots plutôt qu'en pourcentages
const TERRAINS = [
  { test: (s) => s <= -15, text: 'Descente raide', emoji: '⚠️', tone: 'red2' },
  { test: (s) => s <= -5, text: 'Ça descend', emoji: '😎', tone: 'cyan' },
  { test: (s) => s < 5, text: 'Tranquille', emoji: '🙂', tone: 'green' },
  { test: (s) => s < 12, text: 'Ça grimpe', emoji: '😤', tone: 'yellow' },
  { test: (s) => s < 20, text: 'Ça pique !', emoji: '🔥', tone: 'orange' },
  { test: () => true, text: 'Mur !', emoji: '🥵', tone: 'red' },
];
export const terrain = (slope) => TERRAINS.find((t) => t.test(slope));

export function buildRide(track) {
  const { samples, stats, pois, loop } = track;
  const total = stats.distance;

  const checkpoints = pois
    .filter((p) => p.onTrack && p.d > 150 && !(loop && p.d > total - 150))
    .sort((a, b) => a.d - b.d);

  samples.forEach((s) => (s.energy = energyDemand(s.slope)));

  // Répartition du terrain (en mètres)
  const breakdown = TERRAINS.map((t) => ({ ...t, meters: 0 }));
  for (let i = 1; i < samples.length; i++) {
    breakdown[TERRAINS.indexOf(terrain(samples[i].slope))].meters += samples[i].d - samples[i - 1].d;
  }

  // Passage le plus dur : la montée de 500 m la plus raide
  const span = Math.min(50, samples.length - 1);
  let hardest = null;
  for (let i = 0; i + span < samples.length; i++) {
    const a = samples[i];
    const b = samples[i + span];
    const slope = ((b.ele - a.ele) / (b.d - a.d)) * 100;
    if (!hardest || slope > hardest.slope) hardest = { from: a.d, to: b.d, slope };
  }
  if (hardest && hardest.slope < 5) hardest = null;

  const effortScore = total / 1000 + stats.up / 100;
  const level = LEVELS.find((l) => effortScore < l.max);

  return { checkpoints, breakdown, hardest, level };
}
