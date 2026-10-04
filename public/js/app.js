import { parseGPX } from './gpx.js';
import { fillMissingElevations } from './dem.js';
import { analyzeTrack, pointAt, nearestSample, fmtKm, fmtM, fmtDuration } from './analyze.js';
import { Profile } from './profile.js';
import { TrailMap } from './map.js';
import { Flythrough } from './flythrough.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  select: $('#rando-select'),
  title: $('#rando-title'),
  region: $('#rando-region'),
  desc: $('#rando-desc'),
  stats: $('#stats'),
  steps: $('#steps'),
  info: $('#profile-info'),
  fly: $('#btn-fly'),
  toggle3D: $('#btn-3d'),
  fileInput: $('#file-input'),
  dropzone: $('#dropzone'),
  toast: $('#toast'),
};
const DEFAULT_INFO = 'Survolez le profil ou le tracé';

let track = null;
let catalogue = [];

// ---------- Synchronisation carte ⇄ profil ----------
function showAt(d) {
  if (!track) return;
  const p = pointAt(track, d);
  trailMap.setCursor(p);
  profile.setCursor(p.d);
  const arrow = p.slope > 2 ? '↗' : p.slope < -2 ? '↘' : '→';
  el.info.innerHTML =
    `<b>km ${(p.d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</b>` +
    ` · <b>${fmtM(p.ele)}</b> · pente ${arrow} ${Math.round(Math.abs(p.slope))} %` +
    ` · ≈ ${fmtDuration(p.t)} de marche`;
  return p;
}

function clearCursor() {
  if (fly.playing) return;
  trailMap.setCursor(null);
  profile.setCursor(null);
  el.info.textContent = DEFAULT_INFO;
}

const profile = new Profile($('#profile'), {
  onHover: (d) => !fly.playing && showAt(d),
  onLeave: clearCursor,
  onClick: (d) => {
    if (fly.playing) {
      fly.pause();
      fly.play(d);
      return;
    }
    trailMap.flyToPoint(showAt(d));
  },
});

const trailMap = new TrailMap('map', {
  onHover: (lngLat) => !fly.playing && showAt(nearestSample(track, lngLat).d),
  onLeave: clearCursor,
  onClick: (lngLat) => showAt(nearestSample(track, lngLat).d),
  onUserInteract: () => fly.pause(),
});

const fly = new Flythrough(trailMap, {
  onFrame: (p) => showAt(p.d),
  onStateChange: (playing) => {
    el.fly.textContent = playing ? '⏸ Pause' : fly.d > 0 && fly.d < track.stats.distance ? '▶ Reprendre le survol' : '▶ Survoler la rando';
  },
});

// ---------- Affichage d'une rando ----------
function renderStats(s) {
  const d = s.difficulty;
  el.stats.innerHTML = `
    <div class="stat"><span class="label">Distance</span><span class="value">${fmtKm(s.distance)}</span></div>
    <div class="stat"><span class="label">Temps de marche*</span><span class="value">${fmtDuration(s.hours)}</span></div>
    <div class="stat"><span class="label">Dénivelé positif</span><span class="value">↗ ${fmtM(s.up)}</span></div>
    <div class="stat"><span class="label">Dénivelé négatif</span><span class="value">↘ ${fmtM(s.down)}</span></div>
    <div class="stat"><span class="label">Point le plus haut</span><span class="value">${fmtM(s.maxEle)}</span></div>
    <div class="stat"><span class="label">Point le plus bas</span><span class="value">${fmtM(s.minEle)}</span></div>
    <div class="stat wide"><span class="label">Difficulté estimée</span>
      <span class="badge" style="color:${d.color};background:${d.bg}">${d.label}</span></div>
    <p class="label" style="grid-column:span 2;margin:0;font-size:11px;color:#95a19b">
      * hors pauses, base 4 km/h à plat, 300 m/h en montée, 500 m/h en descente.</p>`;
}

function renderSteps(t) {
  const total = t.stats.distance;
  const steps = t.pois.filter((p) => p.onTrack).sort((a, b) => a.d - b.d);
  if (!steps.length || steps[0].d > 150) steps.unshift({ icon: '🚩', name: 'Départ', d: 0, ele: t.samples[0].ele });
  steps.push({
    icon: '🏁',
    name: t.loop ? 'Retour au départ' : 'Arrivée',
    d: total,
    ele: t.samples[t.samples.length - 1].ele,
  });
  el.steps.innerHTML = '';
  for (const s of steps) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ico">${s.icon}</span><span class="name"></span>
      <span class="meta">km ${(s.d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}<br>${fmtM(s.ele)}</span>`;
    li.querySelector('.name').textContent = s.name;
    li.addEventListener('mouseenter', () => !fly.playing && showAt(s.d));
    li.addEventListener('mouseleave', clearCursor);
    li.addEventListener('click', () => {
      fly.pause();
      trailMap.flyToPoint(showAt(s.d));
    });
    el.steps.appendChild(li);
  }
}

async function showGPX(text, meta = {}) {
  const gpx = parseGPX(text);
  await fillMissingElevations(gpx.points);
  await fillMissingElevations(gpx.waypoints.filter((w) => w.lat !== null));
  track = analyzeTrack(gpx.points, gpx.waypoints);

  const name = meta.name || gpx.name;
  document.title = `${name} — FriendlyRando`;
  el.title.textContent = name;
  el.region.textContent = meta.region || '';
  el.desc.textContent = meta.description || gpx.desc || '';
  renderStats(track.stats);
  renderSteps(track);
  el.info.textContent = DEFAULT_INFO;

  fly.setTrack(track);
  profile.setTrack(track);
  await trailMap.setTrack(track, meta.view);
}

async function loadRando(id) {
  const entry = catalogue.find((r) => r.id === id) || catalogue[0];
  if (!entry) return;
  el.select.value = entry.id;
  history.replaceState(null, '', `#${entry.id}`);
  const res = await fetch(entry.file);
  if (!res.ok) throw new Error(`Impossible de charger ${entry.file}`);
  await showGPX(await res.text(), entry);
}

async function loadFile(file) {
  if (!file) return;
  try {
    await showGPX(await file.text(), {});
    let opt = el.select.querySelector('option[value="__upload"]');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = '__upload';
      el.select.appendChild(opt);
    }
    opt.textContent = `📍 ${el.title.textContent} (votre fichier)`;
    el.select.value = '__upload';
    history.replaceState(null, '', location.pathname);
    toast(`« ${el.title.textContent} » chargée`);
  } catch (err) {
    toast(err.message);
  }
}

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 3500);
}

// ---------- Contrôles ----------
el.fly.addEventListener('click', () => fly.toggle());
$('#btn-overview').addEventListener('click', () => {
  fly.pause();
  trailMap.overview();
});
el.toggle3D.addEventListener('click', () => {
  fly.pause();
  const is3D = trailMap.toggle3D();
  el.toggle3D.textContent = is3D ? '🗺️ Vue carte' : '⛰️ Vue 3D';
});

function segmented(container, onChange) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    container.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    onChange(btn.dataset);
  });
}
segmented($('#basemap'), ({ base }) => trailMap.setBasemap(base));
segmented($('#speed'), ({ speed }) => fly.setSpeed(parseFloat(speed)));

$('#exaggeration').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  $('#exag-value').textContent = `×${v.toLocaleString('fr-FR')}`;
  trailMap.setExaggeration(v);
});

el.select.addEventListener('change', () => {
  if (el.select.value !== '__upload') loadRando(el.select.value).catch((e) => toast(e.message));
});

$('#btn-upload').addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => {
  loadFile(el.fileInput.files[0]);
  el.fileInput.value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  el.dropzone.hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) el.dropzone.hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropzone.hidden = true;
  loadFile(e.dataTransfer.files[0]);
});

// ---------- Démarrage ----------
(async () => {
  try {
    catalogue = await (await fetch('tracks/index.json')).json();
    el.select.innerHTML = catalogue.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
    await loadRando(location.hash.slice(1));
  } catch (err) {
    console.error(err);
    toast(err.message);
  }
})();
