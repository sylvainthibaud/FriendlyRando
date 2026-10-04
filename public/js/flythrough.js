// Partie en cours : le randonneur avance le long du tracé à une vitesse qui dépend de la pente,
// et la caméra le suit.
import { pointAt, bearing } from './analyze.js';

const DURATION_S = 90; // durée d'une partie complète à vitesse x1

export const CAMERAS = {
  drone: { label: 'Drone', icon: '🚁', pitch: 62, zoom: 14.7, ahead: 350 },
  epaule: { label: 'Épaule', icon: '🎮', pitch: 72, zoom: 15.6, ahead: 180 },
  aigle: { label: 'Aigle', icon: '🦅', pitch: 45, zoom: 13.7, ahead: 600 },
};

function lerpAngle(a, b, t) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return a + diff * t;
}

export class Flythrough {
  constructor(trailMap, { onFrame, onStateChange, onEnd } = {}) {
    this.tm = trailMap;
    this.onFrame = onFrame;
    this.onStateChange = onStateChange;
    this.onEnd = onEnd;
    this.playing = false;
    this.speed = 1;
    this.camera = CAMERAS.drone;
    this.d = 0;
    this.raf = null;
  }

  setTrack(track) {
    this.stop();
    this.track = track;
    // secondes de rando simulées par seconde réelle
    this.timeScale = (track.stats.hours * 3600) / DURATION_S;
  }

  setSpeed(s) { this.speed = s; }
  setCamera(key) { this.camera = CAMERAS[key]; }

  cameraAt(p) {
    const c = this.camera;
    return {
      center: [p.lon, p.lat],
      elevation: this.tm.elevation(p.ele),
      bearing: this.bearing,
      pitch: this.tm.is3D ? c.pitch : 0,
      zoom: c.zoom,
    };
  }

  smoothedView(d) {
    const pts = [-120, -90, -60, -30, 0, 30, 60, 90, 120].map((k) => pointAt(this.track, d + k));
    const avg = (key) => pts.reduce((sum, q) => sum + q[key], 0) / pts.length;
    return { lon: avg('lon'), lat: avg('lat'), ele: avg('ele') };
  }

  // Lance (ou reprend) le parcours. intro : plongée de la caméra vers le départ.
  play({ intro = false, introMs = 3200 } = {}) {
    if (!this.track) return;
    if (this.d >= this.track.stats.distance - 1) this.d = 0;
    const p = pointAt(this.track, this.d);
    const view = this.smoothedView(this.d);
    this.bearing = bearing(view, pointAt(this.track, this.d + this.camera.ahead));
    this.kmh = p.kmh;
    this.playing = true;
    this.onStateChange?.(true);
    this.onFrame?.(p);

    const ms = intro ? introMs : 1200;
    const cam = this.cameraAt(view);
    intro ? this.tm.map.flyTo({ ...cam, duration: ms, curve: 1.8, essential: true }) : this.tm.map.easeTo({ ...cam, duration: ms });
    clearTimeout(this.startTimer);
    this.startTimer = setTimeout(() => {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }, ms + 50);
  }

  frame(now) {
    if (!this.playing) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const total = this.track.stats.distance;
    // Vitesse lissée : pas d'à-coups quand la pente change
    const here = pointAt(this.track, this.d);
    this.kmh += (here.kmh - this.kmh) * (1 - Math.exp(-dt * 3));
    this.d = Math.min(total, this.d + (this.kmh / 3.6) * dt * this.timeScale * this.speed);

    // La caméra vise une position moyennée sur ±120 m : elle ne suit pas chaque lacet du sentier
    const p = pointAt(this.track, this.d);
    const view = this.smoothedView(this.d);
    const target = bearing(view, pointAt(this.track, this.d + this.camera.ahead));
    this.bearing = lerpAngle(this.bearing, target, 1 - Math.exp(-dt * 1.5));
    this.tm.map.jumpTo(this.cameraAt(view));
    p.kmh = this.kmh;
    this.onFrame?.(p);

    if (this.d >= total) {
      this.pause();
      this.onEnd?.();
      return;
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this.startTimer);
    cancelAnimationFrame(this.raf);
    this.onStateChange?.(false);
  }

  stop() {
    this.pause();
    this.d = 0;
  }
}
