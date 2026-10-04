// Survol animé : la caméra suit le randonneur le long du tracé.
import { pointAt, bearing } from './analyze.js';

const DURATION_S = 75; // durée d'un survol complet à vitesse "Normal"
const PITCH = 62;
const ZOOM = 14.7;
const LOOK_AHEAD = 350; // m

function lerpAngle(a, b, t) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return a + diff * t;
}

export class Flythrough {
  constructor(trailMap, { onFrame, onStateChange } = {}) {
    this.tm = trailMap;
    this.onFrame = onFrame;
    this.onStateChange = onStateChange;
    this.playing = false;
    this.speed = 1;
    this.d = 0;
    this.raf = null;
  }

  setTrack(track) {
    this.stop();
    this.track = track;
    this.d = 0;
  }

  setSpeed(s) { this.speed = s; }

  toggle() { this.playing ? this.pause() : this.play(); }

  play(fromD) {
    if (!this.track) return;
    const total = this.track.stats.distance;
    if (fromD !== undefined) this.d = fromD;
    if (this.d >= total - 1) this.d = 0;

    const p = pointAt(this.track, this.d);
    this.bearing = bearing(p, pointAt(this.track, this.d + LOOK_AHEAD));
    this.playing = true;
    this.onStateChange?.(true);

    const { map } = this.tm;
    map.easeTo({ center: [p.lon, p.lat], elevation: this.tm.elevation(p.ele), bearing: this.bearing, pitch: PITCH, zoom: ZOOM, duration: 1500 });
    this.onFrame?.(p);
    this.startTimer = setTimeout(() => {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }, 1550);
  }

  frame(now) {
    if (!this.playing) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const total = this.track.stats.distance;
    this.d = Math.min(total, this.d + dt * (total / DURATION_S) * this.speed);

    const p = pointAt(this.track, this.d);
    const target = bearing(p, pointAt(this.track, this.d + LOOK_AHEAD));
    this.bearing = lerpAngle(this.bearing, target, 1 - Math.exp(-dt * 1.1));
    this.tm.map.jumpTo({ center: [p.lon, p.lat], elevation: this.tm.elevation(p.ele), bearing: this.bearing, pitch: PITCH, zoom: ZOOM });
    this.onFrame?.(p);

    if (this.d >= total) {
      this.pause();
      setTimeout(() => this.tm.overview(), 600);
      return;
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

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
