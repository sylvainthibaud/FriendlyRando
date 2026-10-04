import { parseGPX } from './gpx.js';
import { fillMissingElevations } from './dem.js';
import { analyzeTrack, pointAt, nearestSample, fmtKm, fmtM, fmtDuration } from './analyze.js';
import { buildRide, terrain, energyWord } from './ride.js';
import { Profile } from './profile.js';
import { TrailMap } from './map.js';
import { Flythrough, CAMERAS } from './flythrough.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const km1 = (m) => (m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const isMobile = () => window.innerWidth <= 720;

const TONE_COLORS = { red2: '#c2185b', cyan: '#38d9ff', green: '#4be37a', yellow: '#ffd23f', orange: '#ff9a3c', red: '#ff4d5e' };

let track = null;
let ride = null;
let meta = {};
let catalogue = [];
let state = 'lobby';

// Suivi de la visite en cours (pour détecter les passages entre deux images)
const run = { lastD: 0, lastDoneUpdate: 0 };

function setState(s) {
  state = s;
  document.body.className = `state-${s}`;
  trailMap.setWalking(s === 'playing');
}

// ---------- Carte, profil, visite ----------
const trailMap = new TrailMap('map', {
  onHover: (lngLat) => state === 'lobby' && showCursor(nearestSample(track, lngLat).d),
  onLeave: () => state === 'lobby' && clearCursor(),
  onClick: (lngLat) => state === 'lobby' && showCursor(nearestSample(track, lngLat).d),
  onUserInteract: () => state === 'playing' && fly.pause(),
});
trailMap.paddingFn = () =>
  isMobile()
    ? { top: 70, bottom: Math.round(window.innerHeight * 0.6), left: 20, right: 20 }
    : { top: 80, bottom: 200, left: 430, right: 70 };

const profile = new Profile($('#profile'), {
  onHover: (d) => state === 'lobby' && showCursor(d),
  onLeave: () => state === 'lobby' && clearCursor(),
  onClick: (d) => {
    if (state === 'lobby') trailMap.flyToPoint(showCursor(d));
    else if (state === 'playing' || state === 'paused') jumpTo(d);
  },
});

const fly = new Flythrough(trailMap, {
  onFrame: (p) => onFrame(p),
  onStateChange: (playing) => {
    if (state === 'finished' || state === 'lobby') return;
    setState(playing ? 'playing' : 'paused');
    $('#btn-pause').textContent = playing ? '⏸' : '▶';
  },
  onEnd: () => finish(),
});

// ---------- Présentation : curseur de prévisualisation ----------
function showCursor(d) {
  const p = pointAt(track, d);
  trailMap.setCursor(p);
  trailMap.setNear(p);
  profile.setCursor(p.d);
  const t = terrain(p.slope);
  $('#profile-info').innerHTML = `<b>${km1(p.d)} km</b> · ${fmtM(p.ele)} · ${t.emoji} ${t.text}`;
  return p;
}

function clearCursor() {
  trailMap.setCursor(null);
  trailMap.setNear(null);
  profile.setCursor(null);
  $('#profile-info').textContent = 'Survole le parcours pour explorer';
}

function clock(hours) {
  const [h0, m0] = (meta.startTime || '08:30').split(':').map(Number);
  const total = Math.round(h0 * 60 + m0 + hours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const timeAt = (d) => pointAt(track, d).t;

// ---------- Fiche de présentation ----------
function segbar(ratio) {
  const n = Math.max(1, Math.min(10, Math.round(ratio * 10)));
  return `<div class="segbar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
}

function renderBriefing() {
  const s = track.stats;
  const name = meta.name || track.name;
  $('#item-card').className = `item-card ${ride.level.key}`;
  $('#level-label').textContent = `Difficulté ${ride.level.label.toLowerCase()}`;
  $('#rando-title').textContent = name;
  $('#rando-name').textContent = name;
  $('#rando-region').textContent = meta.region || '';
  $('#rando-desc').textContent = meta.description || track.desc || '';
  $('#rando-desc').classList.remove('open');
  const rows = [
    ['🥾', 'Distance', fmtKm(s.distance), s.distance / 20000],
    ['⛰️', 'Montée', fmtM(s.up), s.up / 1500],
    ['🏔️', 'Altitude max', fmtM(s.maxEle), s.maxEle / 3000],
    ['⏱️', 'Durée de marche', fmtDuration(s.hours), s.hours / 8],
  ];
  $('#card-stats').innerHTML = rows
    .map(([ico, n, v, r]) => `<div class="stat-row"><span class="ico">${ico}</span><span class="name">${n}</span><span class="val">${v}</span>${segbar(r)}</div>`)
    .join('');

  // Terrain : barre de répartition + légende
  const parts = ride.breakdown.filter((b) => b.meters > 50);
  $('#terrain-bar').innerHTML = parts
    .map((b) => `<i style="flex:${b.meters};background:${TONE_COLORS[b.tone]}" title="${b.text}"></i>`)
    .join('');
  $('#terrain-legend').innerHTML = parts
    .map((b) => `<li><span class="sw" style="background:${TONE_COLORS[b.tone]}"></span>${b.emoji} ${b.text}<small>${km1(b.meters)} km</small></li>`)
    .join('');
  const h = ride.hardest;
  $('#hardest').innerHTML = h
    ? `🔥 Passage le plus dur : <b>du km ${km1(h.from)} au km ${km1(h.to)}</b>, ${Math.round(h.slope)} % de pente en moyenne.`
    : '';

  // Points de passage
  const steps = [{ icon: '🚩', name: 'Départ', d: 0 }, ...ride.checkpoints, { icon: '🏁', name: track.loop ? 'Retour au départ' : 'Arrivée', d: s.distance }];
  $('#steps').innerHTML = '';
  for (const st of steps) {
    const p = pointAt(track, st.d);
    const li = document.createElement('li');
    li.innerHTML = `<span class="ico">${st.icon}</span><span class="name"></span>
      <span class="meta"><b>km ${km1(st.d)}</b> · ${fmtM(p.ele)}<br>vers ${clock(p.t)}</span>`;
    li.querySelector('.name').textContent = st.name;
    li.addEventListener('mouseenter', () => showCursor(st.d));
    li.addEventListener('mouseleave', clearCursor);
    li.addEventListener('click', () => trailMap.flyToPoint(showCursor(st.d)));
    $('#steps').appendChild(li);
  }

  $('#hud-total').textContent = `/ ${km1(s.distance)} km`;
}

// ---------- Affichage pendant la visite ----------
function updateHUD(p) {
  const energy = track.samples[p.i].energy;
  const t = terrain(p.slope);

  $('#hud-km').textContent = km1(p.d);
  $('#hud-clock').textContent = clock(p.t);
  $('#hud-alt').textContent = Math.round(p.ele).toLocaleString('fr-FR');
  $('#hud-energy').textContent = energyWord(energy);
  $('#hud-energybar').style.width = `${Math.max(4, energy)}%`;
  $('#energy').className = `energy ${energy < 35 ? 'low' : energy < 60 ? 'mid' : energy < 85 ? 'high' : 'max'}`;
  $('#hud-speed').textContent = p.kmh.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  $('#hud-speedarc').setAttribute('stroke-dasharray', `${Math.min(100, (p.kmh / 6) * 100)} 100`);
  $('#hud-terrain-emoji').textContent = t.emoji;
  $('#hud-terrain').textContent = t.text;
  $('#hud-terrain').className = `tone-${t.tone}`;

  // Prochain point de passage
  const next = ride.checkpoints.find((c) => c.d > p.d + 5) || { icon: '🏁', name: track.loop ? 'Retour au départ' : 'Arrivée', d: track.stats.distance };
  const nextEle = pointAt(track, next.d).ele;
  $('#next-stop').innerHTML = `<span class="ns-ico">${next.icon}</span><div><small>Prochain passage</small><b></b>
    <span class="ns-meta">dans ${km1(next.d - p.d)} km · ${fmtM(nextEle)} · vers ${clock(timeAt(next.d))}</span></div>`;
  $('#next-stop b').textContent = next.name;
}

function onFrame(p) {
  if (state === 'lobby') return;
  trailMap.setCursor(p);
  trailMap.setNear(p);
  profile.setProgress(p.d);
  updateHUD(p);

  const now = performance.now();
  if (now - run.lastDoneUpdate > 150) {
    trailMap.setDone(p.d);
    run.lastDoneUpdate = now;
  }

  // Points de passage franchis depuis la dernière image
  const passed = ride.checkpoints.filter((c) => c.d > run.lastD && c.d <= p.d);
  for (const c of passed) {
    const at = pointAt(track, c.d);
    toast({ icon: c.icon, title: c.name, sub: `${fmtM(at.ele)} · ${clock(at.t)}` });
  }
  if (passed.length) trailMap.setPassed(p.d);
  run.lastD = p.d;
}

function resetRun(d) {
  run.lastD = d;
  trailMap.setPassed(d);
  trailMap.setDone(d);
  return pointAt(track, d);
}

// Clic sur le profil pendant la visite : on reprend à cet endroit
function jumpTo(d) {
  const wasPlaying = fly.playing;
  fly.pause();
  fly.d = d;
  const p = resetRun(d);
  trailMap.setCursor(p);
  trailMap.setNear(p);
  profile.setProgress(d);
  updateHUD(p);
  if (wasPlaying) fly.play();
  else trailMap.flyToPoint(p);
}

// ---------- Déroulé ----------
function countdown() {
  const box = $('#countdown');
  box.hidden = false;
  ['3', '2', '1', "C'est parti !"].forEach((txt, i) =>
    setTimeout(() => {
      box.innerHTML = `<span class="${i === 3 ? 'go' : ''}">${txt}</span>`;
      if (i === 3) setTimeout(() => (box.hidden = true), 800);
    }, i * 800)
  );
}

function start() {
  $('#endscreen').hidden = true;
  clearCursor();
  setState('playing');
  fly.stop();
  const p = resetRun(0);
  profile.setProgress(0);
  updateHUD(p);
  $('#btn-pause').textContent = '⏸';
  countdown();
  fly.play({ intro: true, introMs: 3200 });
}

function finish() {
  setState('finished');
  const s = track.stats;
  trailMap.setDone(s.distance);
  trailMap.setPassed(s.distance);
  trailMap.setNear(null);
  updateHUD(pointAt(track, s.distance));
  $('#end-title').textContent = track.loop ? 'Boucle terminée !' : 'Arrivée !';
  $('#end-sub').textContent = `${meta.name || track.name} · difficulté ${ride.level.label.toLowerCase()} · arrivée vers ${clock(s.hours)}`;
  $('#end-stats').innerHTML = [
    ['🥾', km1(s.distance), 'km'],
    ['⛰️', Math.round(s.up).toLocaleString('fr-FR'), 'm de montée'],
    ['⏱️', fmtDuration(s.hours), 'de marche'],
    ['🏔️', Math.round(s.maxEle).toLocaleString('fr-FR'), 'm au plus haut'],
  ]
    .map(([i, v, l]) => `<div class="end-stat"><div class="ico">${i}</div><b>${v}</b><small>${l}</small></div>`)
    .join('');
  setTimeout(() => ($('#endscreen').hidden = false), 600);
  setTimeout(() => trailMap.overview(), 300);
}

function backToLobby(recenter = true) {
  fly.stop();
  $('#endscreen').hidden = true;
  setState('lobby');
  trailMap.setPassed(null);
  trailMap.setDone(0);
  profile.setProgress(null);
  clearCursor();
  if (recenter) trailMap.overview();
}

// ---------- Notifications ----------
function toast({ icon = '', title, sub = '', kind = '', duration = 2600 }) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.style.setProperty('--out', `${duration}ms`);
  el.innerHTML = `<span class="t-ico">${icon}</span><div><div class="t-title"></div><div class="t-sub"></div></div>`;
  el.querySelector('.t-title').textContent = title;
  el.querySelector('.t-sub').textContent = sub;
  box.appendChild(el);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => el.remove(), duration + 450);
}

// ---------- Chargement des randos ----------
async function showGPX(text, entry = {}) {
  const gpx = parseGPX(text);
  await fillMissingElevations(gpx.points);
  await fillMissingElevations(gpx.waypoints.filter((w) => w.lat !== null));
  track = analyzeTrack(gpx.points, gpx.waypoints);
  track.name = gpx.name;
  track.desc = gpx.desc;
  ride = buildRide(track);
  meta = entry;

  fly.setTrack(track);
  backToLobby(false);
  renderBriefing();
  profile.setTrack(track, ride.checkpoints);
  await trailMap.setTrack(track, entry.view);
  document.title = `${meta.name || track.name} — FriendlyRando`;
  renderRandoMenu();
}

async function loadRando(id) {
  const entry = catalogue.find((r) => r.id === id) || catalogue[0];
  if (!entry) return;
  history.replaceState(null, '', `#${entry.id}`);
  const res = await fetch(entry.file);
  if (!res.ok) throw new Error(`Impossible de charger ${entry.file}`);
  await showGPX(await res.text(), entry);
}

async function loadFile(file) {
  if (!file) return;
  try {
    await showGPX(await file.text(), { id: '__upload' });
    history.replaceState(null, '', location.pathname);
    toast({ icon: '📍', title: 'Rando chargée', sub: `« ${track.name} »`, kind: 'info' });
  } catch (err) {
    toast({ icon: '⚠️', title: 'Oups', sub: err.message, kind: 'warn', duration: 4000 });
  }
}

function renderRandoMenu() {
  const list = $('#rando-list');
  list.innerHTML = '';
  const items = [...catalogue];
  if (meta.id === '__upload') items.push({ id: '__upload', name: `📍 ${track.name}` });
  for (const r of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu-item${r.id === meta.id ? ' active' : ''}`;
    b.textContent = r.name;
    b.addEventListener('click', () => {
      closeMenus();
      if (r.id !== '__upload' && r.id !== meta.id) loadRando(r.id).catch((e) => toast({ icon: '⚠️', title: 'Oups', sub: e.message, kind: 'warn' }));
    });
    list.appendChild(b);
  }
}

// ---------- Contrôles ----------
function closeMenus() {
  $('#rando-menu').hidden = true;
  $('#settings').hidden = true;
}
function toggleMenu(sel) {
  const m = $(sel);
  const open = m.hidden;
  closeMenus();
  m.hidden = !open;
}
$('#btn-rando').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#rando-menu'); });
$('#btn-settings').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#settings'); });
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });

$('#btn-play').addEventListener('click', start);
$('#btn-overview').addEventListener('click', () => trailMap.overview());
$('#rando-desc').addEventListener('click', (e) => e.currentTarget.classList.add('open'));
$('#btn-pause').addEventListener('click', () => fly.toggle());
$('#btn-quit').addEventListener('click', () => backToLobby());
$('#btn-replay').addEventListener('click', start);
$('#btn-lobby').addEventListener('click', () => backToLobby());

const cameraKeys = Object.keys(CAMERAS);
let camIndex = 0;
$('#btn-camera').addEventListener('click', () => {
  camIndex = (camIndex + 1) % cameraKeys.length;
  const cam = CAMERAS[cameraKeys[camIndex]];
  fly.setCamera(cameraKeys[camIndex]);
  $('#btn-camera').innerHTML = `${cam.icon} <span>${cam.label}</span>`;
});

// Fond de carte : satellite / rendu jeu (+ Plan IGN et Topo dans les réglages)
function setBasemap(base) {
  trailMap.setBasemap(base);
  $$('[data-basemap-switch] button').forEach((b) => b.classList.toggle('active', b.dataset.base === base));
  $('#btn-mapmode').textContent = base === 'game' ? '🛰️' : '🎮';
  $('#btn-mapmode').title = base === 'game' ? 'Passer en satellite' : 'Passer en rendu jeu';
}
$$('[data-basemap-switch]').forEach((group) =>
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) setBasemap(btn.dataset.base);
  })
);
$('#btn-mapmode').addEventListener('click', () => setBasemap(trailMap.basemap === 'game' ? 'satellite' : 'game'));

$('#speed').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  $$('#speed button').forEach((b) => b.classList.toggle('active', b === btn));
  fly.setSpeed(parseFloat(btn.dataset.speed));
});

$('#exaggeration').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  $('#exag-value').textContent = `×${v.toLocaleString('fr-FR')}`;
  trailMap.setExaggeration(v);
});
$('#btn-3d').addEventListener('click', () => {
  const is3D = trailMap.toggle3D();
  $('#btn-3d').textContent = is3D ? '🗺️ Passer en vue carte (2D)' : '⛰️ Revenir en 3D';
});

// Import de fichier : bouton ou glisser-déposer
$('#btn-upload').addEventListener('click', () => { closeMenus(); $('#file-input').click(); });
$('#file-input').addEventListener('change', (e) => {
  loadFile(e.target.files[0]);
  e.target.value = '';
});
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#dropzone').hidden = false; });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) $('#dropzone').hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropzone').hidden = true;
  if (state !== 'lobby') backToLobby();
  loadFile(e.dataTransfer.files[0]);
});

// Raccourcis clavier : espace = pause, Échap = retour à la présentation
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space' && (state === 'playing' || state === 'paused')) { e.preventDefault(); fly.toggle(); }
  if (e.code === 'Escape' && state !== 'lobby') backToLobby();
});

// ---------- Démarrage ----------
(async () => {
  try {
    catalogue = await (await fetch('tracks/index.json')).json();
    await loadRando(location.hash.slice(1));
  } catch (err) {
    console.error(err);
    toast({ icon: '⚠️', title: 'Oups', sub: err.message, kind: 'warn', duration: 5000 });
  }
})();
