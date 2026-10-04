// Profil du parcours dessiné sur <canvas>, coloré selon la pente, façon barre de progression de niveau.
import { slopeColor } from './analyze.js';

const PAD = { l: 14, r: 14, t: 30, b: 20 }; // t réduit sur les petits écrans (voir resize)
const nf = new Intl.NumberFormat('fr-FR');
const FONT = 'Nunito, system-ui, sans-serif';

function niceStep(range, maxTicks, steps) {
  return steps.find((s) => range / s <= maxTicks) || steps[steps.length - 1];
}

export class Profile {
  constructor(canvas, { onHover, onLeave, onClick } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.track = null;
    this.cursor = null;
    this.progress = null;
    this.checkpoints = [];

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);

    const toDistance = (e) => {
      const r = canvas.getBoundingClientRect();
      return this.xToD(e.clientX - r.left);
    };
    canvas.addEventListener('pointermove', (e) => this.track && onHover?.(toDistance(e)));
    canvas.addEventListener('pointerdown', (e) => this.track && onHover?.(toDistance(e)));
    canvas.addEventListener('pointerleave', () => onLeave?.());
    canvas.addEventListener('click', (e) => this.track && onClick?.(toDistance(e)));
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.w = box.width;
    this.h = box.height;
    PAD.t = this.h < 100 ? 24 : 30;
    this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.drawBase();
    this.render();
  }

  setTrack(track, checkpoints = []) {
    this.track = track;
    this.checkpoints = checkpoints;
    this.cursor = null;
    this.progress = null;
    const { minEle, maxEle, distance } = track.stats;
    const margin = Math.max(20, (maxEle - minEle) * 0.1);
    this.yMin = minEle - margin;
    this.yMax = maxEle + margin * 0.6;
    this.dMax = distance;
    this.drawBase();
    this.render();
  }

  setCursor(d) {
    this.cursor = d;
    this.render();
  }

  // Distance parcourue pendant la partie (null hors partie)
  setProgress(d) {
    this.progress = d;
    this.render();
  }

  dToX(d) { return PAD.l + (d / this.dMax) * (this.w - PAD.l - PAD.r); }
  xToD(x) { return Math.max(0, Math.min(this.dMax, ((x - PAD.l) / (this.w - PAD.l - PAD.r)) * this.dMax)); }
  eToY(e) { return PAD.t + (1 - (e - this.yMin) / (this.yMax - this.yMin)) * (this.h - PAD.t - PAD.b); }

  drawBase() {
    if (!this.track || !this.w) return;
    const ctx = this.base.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const s = this.track.samples;
    const bottom = this.h - PAD.b;

    // Bornes kilométriques
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const km = this.dMax / 1000;
    const xStep = niceStep(km, Math.max(2, (this.w - PAD.l - PAD.r) / 55), [0.5, 1, 2, 5, 10, 20, 50]);
    for (let k = 0; k <= km + 1e-6; k += xStep) {
      ctx.textAlign = k ? 'center' : 'left';
      ctx.fillText(k ? `${nf.format(k)} km` : 'Départ', this.dToX(k * 1000), bottom + 5);
    }

    // Remplissage coloré par la pente
    for (let i = 1; i < s.length; i++) {
      const x0 = this.dToX(s[i - 1].d);
      const x1 = this.dToX(s[i].d) + 0.6;
      ctx.fillStyle = slopeColor(s[i].slope);
      ctx.beginPath();
      ctx.moveTo(x0, bottom);
      ctx.lineTo(x0, this.eToY(s[i - 1].ele));
      ctx.lineTo(x1, this.eToY(s[i].ele));
      ctx.lineTo(x1, bottom);
      ctx.fill();
    }
    // Léger dégradé sombre vers le bas pour donner du volume
    const grad = ctx.createLinearGradient(0, PAD.t, 0, bottom);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(20,10,60,.45)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.dToX(0), bottom);
    s.forEach((p) => ctx.lineTo(this.dToX(p.d), this.eToY(p.ele)));
    ctx.lineTo(this.dToX(this.dMax), bottom);
    ctx.fill();

    // Crête du profil
    ctx.beginPath();
    s.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, this.dToX(p.d), this.eToY(p.ele)));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Sommet de la rando
    const top = s.reduce((a, b) => (b.ele > a.ele ? b : a));
    const tx = this.dToX(top.d);
    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = tx > this.w - 80 ? 'right' : 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`▲ ${nf.format(Math.round(top.ele))} m`, tx, this.eToY(top.ele) - 6);

    // Points de passage : icônes sur une ligne, sans chevauchement
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let lastX = -Infinity;
    for (const c of this.checkpoints) {
      const x = this.dToX(c.d);
      const y = this.eToY(c.ele);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x + 0.5, 20); ctx.lineTo(x + 0.5, y); ctx.stroke();
      ctx.setLineDash([]);
      if (x - lastX > 20) {
        ctx.fillText(c.icon, x, 11);
        lastX = x;
      }
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  render() {
    if (!this.w) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    if (!this.track) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Pendant la partie : ce qui reste à parcourir est assombri
    if (this.progress !== null) {
      const x = this.dToX(this.progress);
      ctx.fillStyle = 'rgba(14, 8, 40, .62)';
      ctx.fillRect(x, 0, this.w - x, this.h - PAD.b + 2);
    }

    const d = this.cursor ?? this.progress;
    if (d === null) return;
    const s = this.track.samples;
    const i = Math.min(s.length - 1, Math.round(d / (s[1].d - s[0].d)));
    const x = this.dToX(d);
    const y = this.eToY(s[i].ele);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, this.h - PAD.b); ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1b1240';
    ctx.stroke();
  }
}
