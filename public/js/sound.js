// Petits effets sonores synthétisés (aucun fichier audio à charger).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('fr-muted') === '1'; } catch { /* stockage indisponible */ }

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, at = 0, dur = 0.15, type = 'square', vol = 0.05) {
  if (muted) return;
  const a = audio();
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0, 0.06, 'triangle', 0.04),
  tick: () => tone(523, 0, 0.18, 'square', 0.05),
  go: () => { tone(784, 0, 0.12); tone(1047, 0.1, 0.35); },
  checkpoint: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.18, 'triangle', 0.06)),
  levelUp: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.06, 0.22, 'square', 0.04)),
  tired: () => { tone(220, 0, 0.2, 'sawtooth', 0.03); tone(196, 0.2, 0.3, 'sawtooth', 0.03); },
  victory: () =>
    [[523, 0], [523, 0.15], [523, 0.3], [659, 0.45], [784, 0.75], [659, 1.0], [784, 1.15], [1047, 1.3]].forEach(([f, at]) =>
      tone(f, at, at >= 1.3 ? 0.9 : 0.2, 'square', 0.05)
    ),
};

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('fr-muted', v ? '1' : '0'); } catch { /* stockage indisponible */ }
}
