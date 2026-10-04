// Carte 3D MapLibre : fonds IGN / Esri / OpenTopoMap, relief, tracé coloré par la pente.
import { TERRAIN_TILES } from './dem.js';
import { slopeColor, fmtM } from './analyze.js';

const IGN = (layer, format) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
  `&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`;

// Points dont le nom reste affiché même en vue éloignée
const MAJOR_POI = ['refuge', 'cabane', 'hut', 'sommet', 'summit', 'peak', 'col'];

const BASEMAPS = {
  satellite: ['base-esri', 'base-ortho'],
  plan: ['base-plan'],
  topo: ['base-topo'],
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
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshadeSource',
      paint: { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#1f2a24' },
    },
  ],
  terrain: { source: 'terrain', exaggeration: 1.3 },
  sky: {
    'sky-color': '#7fb4e2',
    'horizon-color': '#e6eff6',
    'fog-color': '#eef3f6',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
  },
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
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.markers = [];
    this.exaggeration = 1.3;
    this.is3D = true;

    const el = document.createElement('div');
    el.className = 'hiker';
    this.cursor = new maplibregl.Marker({ element: el });

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

    // Vue éloignée : on n'affiche que les noms des points principaux pour éviter l'encombrement
    const box = this.map.getContainer();
    const updateDensity = () => box.classList.toggle('map-far', this.map.getZoom() < 14);
    this.map.on('zoomend', updateDensity);
    this.map.on('load', updateDensity);
  }

  addTrackLayers() {
    const empty = { type: 'FeatureCollection', features: [] };
    this.map.addSource('track', { type: 'geojson', data: empty, lineMetrics: true });
    this.map.addLayer({
      id: 'track-casing',
      type: 'line',
      source: 'track',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 13] },
    });
    this.map.addLayer({
      id: 'track-line',
      type: 'line',
      source: 'track',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1f6f4a', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 8] },
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
    this.overview(false);
  }

  renderMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
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
      el.innerHTML = `<span class="ico">🚩</span>${label}`;
      return el;
    };
    if (track.loop) {
      add(flag('Départ · Arrivée'), [first.lon, first.lat]);
    } else {
      add(flag('Départ'), [first.lon, first.lat]);
      add(flag('Arrivée'), [last.lon, last.lat]);
    }

    // Points d'intérêt (sauf ceux confondus avec le départ)
    for (const p of track.pois) {
      if (p.onTrack && (p.d < 150 || (track.loop && p.d > track.stats.distance - 150))) continue;
      const el = document.createElement('div');
      el.className = MAJOR_POI.includes(p.type) ? 'poi' : 'poi minor';
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
    }
  }

  bounds() {
    const b = new maplibregl.LngLatBounds();
    this.track.points.forEach((p) => b.extend([p.lon, p.lat]));
    return b;
  }

  padding() {
    const mobile = window.innerWidth <= 900;
    return mobile ? { top: 40, bottom: 40, left: 30, right: 30 } : { top: 70, bottom: 250, left: 70, right: 70 };
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
  }

  setBasemap(name) {
    for (const [key, layers] of Object.entries(BASEMAPS)) {
      for (const id of layers) this.map.setLayoutProperty(id, 'visibility', key === name ? 'visible' : 'none');
    }
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
