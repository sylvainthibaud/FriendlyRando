import { parseGPX } from './gpx.js';
import { fillMissingElevations } from './dem.js';
import { analyzeTrack, pointAt, nearestSample, fmtKm, fmtM, fmtDuration } from './analyze.js';
import { buildGame, terrain, levelOf, XP_PER_LEVEL } from './game.js';
import { Profile } from './profile.js';
import { TrailMap } from './map.js';
import { Flythrough, CAMERAS } from './flythrough.js';
import { sfx, isMuted, setMuted } from './sound.js';

const $ = (sel) => document.querySelector(sel);
const nf = new Intl.NumberFormat('fr-FR');
const km1 = (m) => (m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const isMobile = () => window.innerWidth <= 720;

let track = null;
let game = null;
let meta = {};
let catalogue = [];
let state = 'lobby';

// État de la partie en cours (pour détecter les événements entre deux images)
const run = { lastD: 0, lastLevel: 1, lowEnergy: false, lastDoneUpdate: 0 };

function setState(s) {
  state = s;
  document.body.className = `state-${s}`;
}

// ---------- Carte, profil, partie ----------
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
    if (state === 'lobby') {
      trailMap.flyToPoint(showCursor(d));
    } else if (state === 'playing' || state === 'paused') {
      // Téléportation : on reprend la partie à cet endroit, sans rejouer les événements
      jumpTo(d);
    }
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

// ---------- Lobby : curseur de prévisualisation ----------
function showCursor(d) {
  const p = pointAt(track, d);
  trailMap.setCursor(p);
  profile.setCursor(p.d);
  const t = terrain(p.slope);
  $('#profile-info').innerHTML = `<b>${km1(p.d)} km</b> · ${fmtM(p.ele)} · ${t.emoji} ${t.text}`;
  return p;
}

function clearCursor() {
  trailMap.setCursor(null);
  profile.setCursor(null);
  $('#profile-info').textContent = 'Survole le parcours pour explorer';
}

// ---------- Rendu de l'écran de mission ----------
function segbar(ratio) {
  const n = Math.max(1, Math.min(10, Math.round(ratio * 10)));
  return `<div class="segbar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
}

function renderBriefing() {
  const s = track.stats;
  const name = meta.name || track.name;
  $('#item-card').className = `item-card ${game.rarity.key}`;
  $('#rarity').textContent = game.rarity.label;
  $('#rarity-level').textContent = game.rarity.level;
  $('#rando-title').textContent = name;
  $('#mission-name').textContent = name;
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
  renderQuests($('#quests'), 0);
  $('#hud-total').textContent = `/ ${km1(s.distance)} km`;
}

function renderQuests(container, d) {
  container.innerHTML = '';
  for (const q of game.quests) {
    const pr = Math.max(0, Math.min(1, q.progress(d)));
    const done = pr >= 0.999;
    const li = document.createElement('li');
    li.className = `quest${done ? ' done' : ''}`;
    li.innerHTML = `<span class="q-ico">${done ? '✅' : q.icon}</span><span class="q-label"></span>
      <span class="q-detail">${q.detail ? q.detail(d) : `${Math.round(pr * 100)} %`}</span>
      <div class="q-bar"><i style="width:${pr * 100}%"></i></div>`;
    li.querySelector('.q-label').textContent = q.label;
    container.appendChild(li);
  }
}

// ---------- HUD ----------
function clock(hours) {
  const [h0, m0] = (meta.startTime || '08:30').split(':').map(Number);
  const total = Math.round(h0 * 60 + m0 + hours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

let lastQuestRender = 0;
function updateHUD(p, force = false) {
  const s = track.samples[p.i];
  const xp = game.xpAt(p.d);
  const energy = Math.max(0, Math.round(s.energy));
  const t = terrain(p.slope);

  $('#hud-km').textContent = km1(p.d);
  $('#hud-clock').textContent = clock(p.t);
  $('#hud-xp').textContent = nf.format(xp);
  $('#hud-level').textContent = levelOf(xp);
  $('#hud-xpbar').style.width = `${((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%`;
  $('#hud-energy').textContent = energy;
  $('#hud-energybar').style.width = `${energy}%`;
  $('#energy').className = `energy ${energy < 25 ? 'low' : energy < 55 ? 'mid' : ''}`;
  $('#hud-speed').textContent = p.kmh.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  $('#hud-speedarc').setAttribute('stroke-dasharray', `${Math.min(100, (p.kmh / 6) * 100)} 100`);
  $('#hud-terrain-emoji').textContent = t.emoji;
  $('#hud-terrain').textContent = t.text;
  $('#terrain').className = `terrain tone-${t.tone}`;
  $('#hud-alt').textContent = `⛰️ ${fmtM(p.ele)}`;

  const now = performance.now();
  if (force || now - lastQuestRender > 400) {
    renderQuests($('#hud-quests'), p.d);
    lastQuestRender = now;
  }
}

function onFrame(p) {
  if (state === 'lobby') return;
  trailMap.setCursor(p);
  profile.setProgress(p.d);
  updateHUD(p);

  const now = performance.now();
  if (now - run.lastDoneUpdate > 150) {
    trailMap.setDone(p.d);
    run.lastDoneUpdate = now;
  }

  // Points de passage franchis depuis la dernière image
  const passed = game.checkpoints.filter((c) => c.d > run.lastD && c.d <= p.d);
  for (const c of passed) {
    toast({ icon: c.icon, title: c.name, sub: `+${c.xp} XP · +${c.energy} ⚡ ${c.bonusText}` });
    sfx.checkpoint();
  }
  if (passed.length) trailMap.setFound(p.d);

  // Passage de niveau
  const level = levelOf(game.xpAt(p.d));
  if (level > run.lastLevel) {
    toast({ icon: '⭐', title: `Niveau ${level} !`, sub: 'Continue comme ça', kind: 'level' });
    sfx.levelUp();
  }
  run.lastLevel = level;

  // Coup de fatigue
  const energy = track.samples[p.i].energy;
  if (energy < 25 && !run.lowEnergy) {
    const next = game.checkpoints.find((c) => c.d > p.d);
    toast({ icon: '🥵', title: 'Coup de fatigue !', sub: next ? `Pause au ${next.name} dans ${km1(next.d - p.d)} km` : 'Courage, la fin approche', kind: 'warn' });
    sfx.tired();
  }
  run.lowEnergy = energy < 25;
  run.lastD = p.d;
}

function resetRun(d) {
  const p = pointAt(track, d);
  run.lastD = d;
  run.lastLevel = levelOf(game.xpAt(d));
  run.lowEnergy = track.samples[p.i].energy < 25;
  trailMap.setFound(d);
  trailMap.setDone(d);
  return p;
}

function jumpTo(d) {
  const wasPlaying = fly.playing;
  fly.pause();
  fly.d = d;
  const p = resetRun(d);
  trailMap.setCursor(p);
  profile.setProgress(d);
  updateHUD(p, true);
  if (wasPlaying) fly.play();
  else trailMap.flyToPoint(p);
}

// ---------- Déroulé d'une partie ----------
function countdown() {
  const box = $('#countdown');
  box.hidden = false;
  const steps = ['3', '2', '1', 'GO !'];
  steps.forEach((txt, i) =>
    setTimeout(() => {
      box.innerHTML = `<span class="${i === 3 ? 'go' : ''}">${txt}</span>`;
      i === 3 ? sfx.go() : sfx.tick();
      if (i === 3) setTimeout(() => (box.hidden = true), 800);
    }, i * 800)
  );
}

function startGame() {
  $('#endscreen').hidden = true;
  clearCursor();
  setState('playing');
  fly.stop();
  const p = resetRun(0);
  profile.setProgress(0);
  updateHUD(p, true);
  $('#btn-pause').textContent = '⏸';
  countdown();
  fly.play({ intro: true, introMs: 3200 });
}

function finish() {
  setState('finished');
  trailMap.setDone(track.stats.distance);
  trailMap.setFound(track.stats.distance);
  const p = pointAt(track, track.stats.distance);
  updateHUD(p, true);
  const s = track.stats;
  const xp = game.xpAt(s.distance);
  $('#end-title').textContent = track.loop ? 'Rando bouclée !' : 'Arrivée !';
  $('#end-sub').textContent = `${meta.name || track.name} · ${game.rarity.label} · arrivée à ${clock(s.hours)}`;
  $('#end-stats').innerHTML = [
    ['🥾', km1(s.distance), 'km'],
    ['⛰️', nf.format(Math.round(s.up)), 'm de montée'],
    ['⏱️', fmtDuration(s.hours), 'de marche'],
    ['⭐', nf.format(xp), `XP · niv. ${levelOf(xp)}`],
  ]
    .map(([i, v, l]) => `<div class="end-stat"><div class="ico">${i}</div><b>${v}</b><small>${l}</small></div>`)
    .join('');
  $('#end-badges').innerHTML = game.badges.length
    ? game.badges
        .map((b, i) => `<div class="badge" style="animation-delay:${0.3 + i * 0.15}s"><span class="b-ico">${b.icon}</span><div><b>${b.name}</b><small>${b.text}</small></div></div>`)
        .join('')
    : '<p class="end-sub">Pas de badge cette fois… essaie une rando plus corsée !</p>';
  confetti();
  sfx.victory();
  setTimeout(() => ($('#endscreen').hidden = false), 700);
  setTimeout(() => trailMap.overview(), 300);
}

function confetti() {
  const box = $('#confetti');
  const colors = ['#ffd23f', '#38d9ff', '#ff4fa3', '#4be37a', '#7445ff', '#ffffff'];
  box.innerHTML = Array.from({ length: 70 }, () => {
    const style = [
      `left:${Math.random() * 100}%`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-duration:${2.5 + Math.random() * 2.5}s`,
      `animation-delay:${Math.random() * 1.2}s`,
      `transform:rotate(${Math.random() * 360}deg)`,
    ].join(';');
    return `<i style="${style}"></i>`;
  }).join('');
}

function backToLobby(recenter = true) {
  fly.stop();
  $('#endscreen').hidden = true;
  setState('lobby');
  trailMap.setFound(null);
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
  while (box.children.length > 3) box.firstChild.remove();
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
  game = buildGame(track);
  meta = entry;

  fly.setTrack(track);
  backToLobby(false);
  renderBriefing();
  profile.setTrack(track, game.checkpoints);
  await trailMap.setTrack(track, entry.view);
  document.title = `${meta.name || track.name} — FriendlyRando`;
  renderMissionMenu();
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
    toast({ icon: '📍', title: 'Nouvelle mission', sub: `« ${track.name} » est prête`, kind: 'info' });
  } catch (err) {
    toast({ icon: '⚠️', title: 'Oups', sub: err.message, kind: 'warn', duration: 4000 });
  }
}

function renderMissionMenu() {
  const list = $('#mission-list');
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
  $('#mission-menu').hidden = true;
  $('#settings').hidden = true;
}
function toggleMenu(sel) {
  const m = $(sel);
  const open = m.hidden;
  closeMenus();
  m.hidden = !open;
}
$('#btn-mission').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#mission-menu'); });
$('#btn-settings').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#settings'); });
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });

$('#btn-play').addEventListener('click', () => { sfx.click(); startGame(); });
$('#btn-overview').addEventListener('click', () => trailMap.overview());
$('#rando-desc').addEventListener('click', (e) => e.currentTarget.classList.add('open'));
$('#btn-pause').addEventListener('click', () => fly.toggle());
$('#btn-quit').addEventListener('click', backToLobby);
$('#btn-replay').addEventListener('click', startGame);
$('#btn-lobby').addEventListener('click', backToLobby);

const cameraKeys = Object.keys(CAMERAS);
let camIndex = 0;
$('#btn-camera').addEventListener('click', () => {
  camIndex = (camIndex + 1) % cameraKeys.length;
  const cam = CAMERAS[cameraKeys[camIndex]];
  fly.setCamera(cameraKeys[camIndex]);
  $('#btn-camera').innerHTML = `${cam.icon} <span>${cam.label}</span>`;
  toast({ icon: cam.icon, title: `Caméra ${cam.label}`, kind: 'info', duration: 1200 });
});

function refreshSound() {
  for (const b of [$('#btn-sound'), $('#btn-sound-2')]) b.textContent = isMuted() ? '🔇' : '🔊';
}
for (const b of [$('#btn-sound'), $('#btn-sound-2')]) {
  b.addEventListener('click', () => {
    setMuted(!isMuted());
    refreshSound();
    sfx.click();
  });
}
refreshSound();

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

// Raccourcis clavier : espace = pause, Échap = quitter
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
