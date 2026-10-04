// Profil altimétrique dessiné sur <canvas>, coloré selon la pente.
import { slopeColor } from './analyze.js';

const PAD = { l: 46, r: 14, t: 38, b: 20 };
const nf = new Intl.NumberFormat('fr-FR');

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
    this.w = Math.max(100, box.width);
    this.h = Math.max(60, box.height);
    this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.drawBase();
    this.render();
  }

  setTrack(track) {
    this.track = track;
    this.cursor = null;
    const { minEle, maxEle, distance } = track.stats;
    const margin = Math.max(20, (maxEle - minEle) * 0.08);
    this.yStep = niceStep(maxEle - minEle + 2 * margin, 4, [25, 50, 100, 200, 250, 500, 1000]);
    this.yMin = Math.floor((minEle - margin) / this.yStep) * this.yStep;
    this.yMax = Math.ceil((maxEle + margin) / this.yStep) * this.yStep;
    this.dMax = distance;
    this.drawBase();
    this.render();
  }

  setCursor(d) {
    this.cursor = d;
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

    // Grille et axes
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#7b8781';
    ctx.strokeStyle = '#e4e9e6';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let e = this.yMin; e <= this.yMax; e += this.yStep) {
      const y = Math.round(this.eToY(e)) + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(this.w - PAD.r, y); ctx.stroke();
      ctx.fillText(`${nf.format(e)} m`, PAD.l - 6, y);
    }
    const km = this.dMax / 1000;
    const plotW = this.w - PAD.l - PAD.r;
    const xStep = niceStep(km, Math.max(2, plotW / 60), [0.5, 1, 2, 5, 10, 20, 50]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let k = 0; k <= km + 1e-6; k += xStep) {
      ctx.fillText(`${nf.format(k)} km`, this.dToX(k * 1000), bottom + 5);
    }

    // Remplissage coloré par la pente
    ctx.globalAlpha = 0.9;
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
    ctx.globalAlpha = 1;

    // Ligne du profil
    ctx.beginPath();
    s.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, this.dToX(p.d), this.eToY(p.ele)));
    ctx.strokeStyle = '#1d2a24';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Points d'intérêt : étiquettes placées par ordre d'importance sur deux lignes,
    // en version complète si la place le permet, sinon l'icône seule, sinon rien.
    const PRIORITY = { refuge: 0, cabane: 0, hut: 0, sommet: 1, summit: 1, peak: 1, col: 1, parking: 2, lac: 3, lake: 3 };
    const prio = (p) => PRIORITY[p.type] ?? 4;
    const pois = this.track.pois.filter((p) => p.onTrack).sort((a, b) => prio(a) - prio(b) || a.d - b.d);
    const rows = [[], []];
    const fits = (row, a, b) => rows[row].every(([c, d]) => b + 4 < c || a > d + 4);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    for (const p of pois) {
      const x = this.dToX(p.d);
      const y = this.eToY(p.ele);
      const candidates = [`${p.icon} ${p.name}`, p.icon];
      let placed = null;
      for (const label of candidates) {
        const width = ctx.measureText(label).width + 2;
        const lx = Math.max(2, Math.min(x - 8, this.w - PAD.r - width));
        const row = [0, 1].find((r) => fits(r, lx, lx + width));
        if (row !== undefined) {
          rows[row].push([lx, lx + width]);
          placed = { label, lx, ly: 9 + row * 15 };
          break;
        }
      }
      if (placed) {
        ctx.strokeStyle = 'rgba(29,42,36,.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x + 0.5, placed.ly + 7); ctx.lineTo(x + 0.5, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#1d2a24';
        ctx.fillText(placed.label, placed.lx, placed.ly);
      }
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#1d2a24';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  render() {
    if (!this.w) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    if (!this.track || this.cursor === null) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const s = this.track.samples;
    const i = Math.min(s.length - 1, Math.round(this.cursor / (s[1].d - s[0].d)));
    const x = this.dToX(this.cursor);
    const y = this.eToY(s[i].ele);
    ctx.strokeStyle = '#1f6f4a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, PAD.t - 4); ctx.lineTo(x, this.h - PAD.b); ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1f6f4a';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
}
