// Carte 3D MapLibre : fond satellite (IGN / Esri), rendu « jeu vidéo », Plan IGN ou OpenTopoMap,
// relief, tracé coloré par la pente, bouquetin et points de passage.
import { TERRAIN_TILES } from './dem.js';
import { slopeColor, fmtM, pointAt, distance } from './analyze.js';
import { createIbex } from './ibex.js';

const IGN = (layer, format) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
  `&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`;

// Distances (m) autour d'un point de passage où son nom s'affiche : en approche et juste après
const NAME_BEFORE = 600;
const NAME_AFTER = 300;
const NAME_OFF_TRACK = 1500; // pour les lieux hors du tracé (sommet visible au loin…)

// Rendu « jeu vidéo » : teintes par altitude, forêts et lacs en aplats vifs, ombrage violet
const GAME_LAYERS = [
  {
    id: 'game-relief',
    type: 'color-relief',
    source: 'hillshadeSource',
    paint: {
      'color-relief-color': [
        'interpolate', ['linear'], ['elevation'],
        0, '#6fcf5b', 900, '#8fd95a', 1400, '#b4dc5c', 1750, '#d6d27a',
        2000, '#c9b18c', 2300, '#a99f9a', 2600, '#dcdce8', 2900, '#ffffff',
      ],
    },
  },
  {
    id: 'game-wood',
    type: 'fill',
    source: 'omt',
    'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], 'wood'],
    paint: { 'fill-color': '#2f9e44', 'fill-opacity': 0.6 },
  },
  {
    id: 'game-rock',
    type: 'fill',
    source: 'omt',
    'source-layer': 'landcover',
    filter: ['in', ['get', 'class'], ['literal', ['rock', 'sand']]],
    paint: { 'fill-color': '#c2b8a8', 'fill-opacity': 0.45 },
  },
  {
    id: 'game-ice',
    type: 'fill',
    source: 'omt',
    'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], 'ice'],
    paint: { 'fill-color': '#f2fbff', 'fill-opacity': 0.9 },
  },
  {
    id: 'game-water',
    type: 'fill',
    source: 'omt',
    'source-layer': 'water',
    paint: { 'fill-color': '#25c4ff', 'fill-outline-color': '#d9f7ff' },
  },
  {
    id: 'game-waterway',
    type: 'line',
    source: 'omt',
    'source-layer': 'waterway',
    paint: { 'line-color': '#25c4ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2.5] },
  },
  {
    id: 'game-paths',
    type: 'line',
    source: 'omt',
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
    paint: { 'line-color': '#fff3c4', 'line-opacity': 0.55, 'line-width': 1.2, 'line-dasharray': [2, 2] },
  },
  {
    id: 'game-hillshade',
    type: 'hillshade',
    source: 'hillshadeSource',
    paint: {
      'hillshade-exaggeration': 0.5,
      'hillshade-shadow-color': '#5240b8',
      'hillshade-highlight-color': '#fff7cf',
      'hillshade-accent-color': '#6a58c4',
    },
  },
].map((l) => ({ ...l, layout: { ...l.layout, visibility: 'none' } }));

const BASEMAPS = {
  satellite: ['base-esri', 'base-ortho', 'hillshade'],
  game: GAME_LAYERS.map((l) => l.id),
  plan: ['base-plan', 'hillshade'],
  topo: ['base-topo', 'hillshade'],
};

const SKIES = {
  default: {
    'sky-color': '#7fb4e2',
    'horizon-color': '#e6eff6',
    'fog-color': '#eef3f6',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
  },
  game: {
    'sky-color': '#3fa9ff',
    'horizon-color': '#c9f0ff',
    'fog-color': '#d9f3ff',
    'sky-horizon-blend': 0.55,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.8,
  },
};

const style = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: '© Esri',
    },
    ortho: {
      type: 'raster',
      tiles: [IGN('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')],
      tileSize: 256,
      maxzoom: 19,
      bounds: [-5.5, 41.2, 10, 51.5],
      attribution: '© IGN',
    },
    plan: {
      type: 'raster',
      tiles: [IGN('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© IGN',
    },
    topo: {
      type: 'raster',
      tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      tileSize: 256,
      maxzoom: 17,
      attribution: '© OpenTopoMap (CC-BY-SA), © contributeurs OpenStreetMap',
    },
    omt: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenFreeMap, © contributeurs OpenStreetMap',
    },
    terrain: {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Relief : Mapzen / AWS Terrain Tiles',
    },
    hillshadeSource: {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#dfe6e0' } },
    { id: 'base-esri', type: 'raster', source: 'esri' },
    { id: 'base-ortho', type: 'raster', source: 'ortho' },
    { id: 'base-plan', type: 'raster', source: 'plan', layout: { visibility: 'none' } },
    { id: 'base-topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
    ...GAME_LAYERS,
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshadeSource',
      paint: { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#1f2a24' },
    },
  ],
  terrain: { source: 'terrain', exaggeration: 1.3 },
  sky: SKIES.default,
};

export class TrailMap {
  constructor(container, { onHover, onLeave, onClick, onUserInteract } = {}) {
    this.map = new maplibregl.Map({
      container,
      style,
      center: [-0.47, 42.85],
      zoom: 12,
      pitch: 60,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    this.markers = [];
    this.poiMarkers = [];
    this.exaggeration = 1.3;
    this.is3D = true;
    this.basemap = 'satellite';

    this.cursorEl = createIbex();
    this.cursor = new maplibregl.Marker({ element: this.cursorEl, anchor: 'bottom' });

    this.ready = new Promise((resolve) => this.map.on('load', resolve)).then(() => this.addTrackLayers());

    this.map.on('mousemove', 'track-hit', (e) => onHover?.(e.lngLat));
    this.map.on('mouseenter', 'track-hit', () => (this.map.getCanvas().style.cursor = 'crosshair'));
    this.map.on('mouseleave', 'track-hit', () => {
      this.map.getCanvas().style.cursor = '';
      onLeave?.();
    });
    this.map.on('click', 'track-hit', (e) => onClick?.(e.lngLat));
    for (const evt of ['mousedown', 'touchstart', 'wheel']) {
      this.map.getCanvasContainer().addEventListener(evt, () => onUserInteract?.(), { passive: true });
    }

    // Vue éloignée : bornes kilométriques masquées pour ne pas surcharger
    const box = this.map.getContainer();
    const updateDensity = () => box.classList.toggle('map-far', this.map.getZoom() < 14);
    this.map.on('zoomend', updateDensity);
    this.map.on('load', updateDensity);
  }

  addTrackLayers() {
    const empty = { type: 'FeatureCollection', features: [] };
    this.map.addSource('track', { type: 'geojson', data: empty, lineMetrics: true });
    this.map.addSource('done', { type: 'geojson', data: empty });
    const round = { 'line-join': 'round', 'line-cap': 'round' };
    this.map.addLayer({
      id: 'track-glow',
      type: 'line',
      source: 'track',
      layout: round,
      paint: {
        'line-color': '#8af3ff',
        'line-opacity': 0.55,
        'line-blur': 6,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 12, 16, 26],
      },
    });
    this.map.addLayer({
      id: 'track-casing',
      type: 'line',
      source: 'track',
      layout: round,
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 13] },
    });
    this.map.addLayer({
      id: 'track-line',
      type: 'line',
      source: 'track',
      layout: round,
      paint: { 'line-color': '#1f6f4a', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 8] },
    });
    // Chemin déjà parcouru pendant la visite : traînée dorée
    this.map.addLayer({
      id: 'done-line',
      type: 'line',
      source: 'done',
      layout: round,
      paint: { 'line-color': '#ffd23f', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 10] },
    });
    this.map.addLayer({
      id: 'track-hit',
      type: 'line',
      source: 'track',
      paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 22 },
    });
  }

  async setTrack(track, view = {}) {
    await this.ready;
    this.track = track;
    this.view = view;

    this.map.getSource('track').setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: track.points.map((p) => [p.lon, p.lat]) },
    });

    // Dégradé de couleur par la pente, échantillonné tous les ~50 m le long du tracé
    const total = track.stats.distance;
    const stops = [];
    let last = -1;
    for (const s of track.samples) {
      const f = s.d / total;
      if (f - last < 0.002 && f < 1) continue;
      stops.push(f, slopeColor(s.slope));
      last = f;
    }
    this.map.setPaintProperty('track-line', 'line-gradient', ['interpolate', ['linear'], ['line-progress'], ...stops]);

    this.renderMarkers();
    this.setDone(0);
    this.overview(false);
  }

  // Trace dorée du départ jusqu'à la distance d
  setDone(d) {
    const src = this.map.getSource('done');
    if (!src || !this.track) return;
    const coords = this.track.samples.filter((s) => s.d <= d).map((s) => [s.lon, s.lat]);
    src.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [] },
    });
  }

  // Noms des lieux : affichés seulement à l'approche du point p (et juste après l'avoir passé)
  setNear(p) {
    for (const { el, poi } of this.poiMarkers) {
      let near = false;
      if (p) {
        near = poi.onTrack ? p.d >= poi.d - NAME_BEFORE && p.d <= poi.d + NAME_AFTER : distance(p, poi) < NAME_OFF_TRACK;
      }
      el.classList.toggle('near', near);
    }
  }

  // Points déjà passés pendant la visite (null = aucun)
  setPassed(d) {
    for (const { el, poi } of this.poiMarkers) {
      el.classList.toggle('passed', d !== null && poi.onTrack && poi.d <= d);
    }
  }

  renderMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    this.poiMarkers = [];
    const { track } = this;
    const add = (el, lngLat, anchor = 'bottom') => {
      const m = new maplibregl.Marker({ element: el, anchor }).setLngLat(lngLat).addTo(this.map);
      this.markers.push(m);
      return m;
    };

    // Bornes kilométriques
    const step = track.stats.distance > 25000 ? 5000 : 1000;
    for (let d = step; d < track.stats.distance - step / 3; d += step) {
      const s = track.samples[Math.round(d / 10)];
      if (!s) continue;
      const el = document.createElement('div');
      el.className = 'km';
      el.textContent = `${d / 1000} km`;
      add(el, [s.lon, s.lat], 'center');
    }

    // Départ / arrivée
    const first = track.points[0];
    const last = track.points[track.points.length - 1];
    const flag = (label) => {
      const el = document.createElement('div');
      el.className = 'poi start';
      el.innerHTML = `<span class="ico">🚩</span><span class="label">${label}</span>`;
      return el;
    };
    if (track.loop) {
      add(flag('Départ · Arrivée'), [first.lon, first.lat]);
    } else {
      add(flag('Départ'), [first.lon, first.lat]);
      add(flag('Arrivée'), [last.lon, last.lat]);
    }

    // Points d'intérêt (sauf ceux confondus avec le départ) : icône seule, nom à l'approche
    for (const p of track.pois) {
      if (p.onTrack && (p.d < 150 || (track.loop && p.d > track.stats.distance - 150))) continue;
      const el = document.createElement('div');
      el.className = 'poi';
      el.title = p.ele ? `${p.name} · ${fmtM(p.ele)}` : p.name;
      el.innerHTML = `<span class="ico">${p.icon}</span>`;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = p.name;
      el.appendChild(label);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.flyToPoint(p);
      });
      add(el, [p.lon, p.lat]);
      this.poiMarkers.push({ el, poi: p });
    }
  }

  bounds() {
    const b = new maplibregl.LngLatBounds();
    this.track.points.forEach((p) => b.extend([p.lon, p.lat]));
    return b;
  }

  // Marges laissées libres par l'interface posée sur la carte (fiche de présentation, profil…)
  padding() {
    if (this.paddingFn) return this.paddingFn();
    return { top: 70, bottom: 250, left: 70, right: 70 };
  }

  overview(animate = true) {
    if (!this.track) return;
    const bearing = this.is3D ? this.view?.bearing ?? 0 : 0;
    const pitch = this.is3D ? this.view?.pitch ?? 60 : 0;
    const cam = this.map.cameraForBounds(this.bounds(), { padding: this.padding(), bearing });
    if (!cam) return;
    const { minEle, maxEle } = this.track.stats;
    const opts = {
      ...cam,
      bearing,
      pitch,
      // cameraForBounds ignore l'inclinaison : on rapproche un peu la vue en 3D (moins sur mobile)
      zoom: cam.zoom + (this.is3D ? (window.innerWidth <= 900 ? 0.1 : 0.45) : 0),
      elevation: this.elevation((minEle + maxEle) / 2),
    };
    animate ? this.map.flyTo({ ...opts, duration: 1800, essential: true }) : this.map.jumpTo(opts);
  }

  // Altitude du centre de la caméra (le relief est exagéré en 3D, absent en vue carte)
  elevation(ele) {
    return this.is3D ? ele * this.exaggeration : 0;
  }

  flyToPoint(p) {
    this.map.flyTo({
      center: [p.lon, p.lat],
      elevation: this.elevation(p.ele),
      zoom: 15.2,
      pitch: this.is3D ? 62 : 0,
      duration: 1600,
      essential: true,
    });
  }

  // Bouquetin : position, et orientation gauche/droite selon le sens de marche à l'écran
  setCursor(p) {
    if (!p) {
      this.cursor.remove();
      this.cursorShown = false;
      return;
    }
    this.cursor.setLngLat([p.lon, p.lat]);
    if (!this.cursorShown) {
      this.cursor.addTo(this.map);
      this.cursorShown = true;
    }
    if (this.track) {
      const q = pointAt(this.track, Math.min(p.d + 25, this.track.stats.distance));
      const a = this.map.project([p.lon, p.lat]);
      const b = this.map.project([q.lon, q.lat]);
      if (Math.abs(b.x - a.x) > 1.5) this.cursorEl.classList.toggle('flip', b.x < a.x);
    }
  }

  setWalking(walking) {
    this.cursorEl.classList.toggle('walking', walking);
  }

  setBasemap(name) {
    this.basemap = name;
    const visible = new Set(BASEMAPS[name]);
    const all = new Set(Object.values(BASEMAPS).flat());
    for (const id of all) this.map.setLayoutProperty(id, 'visibility', visible.has(id) ? 'visible' : 'none');
    this.map.setSky(name === 'game' ? SKIES.game : SKIES.default);
  }

  setExaggeration(v) {
    this.exaggeration = v;
    if (this.is3D) this.map.setTerrain({ source: 'terrain', exaggeration: v });
  }

  toggle3D() {
    this.is3D = !this.is3D;
    this.map.setTerrain(this.is3D ? { source: 'terrain', exaggeration: this.exaggeration } : null);
    this.overview();
    return this.is3D;
  }
}
