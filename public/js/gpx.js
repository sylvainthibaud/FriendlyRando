// Lecture d'un fichier GPX (traces <trk>, à défaut itinéraires <rte>) + points d'intérêt <wpt>.

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function childText(el, name) {
  const c = el.getElementsByTagName(name)[0];
  return c ? c.textContent.trim() : '';
}

function readPoint(el) {
  return {
    lat: num(el.getAttribute('lat')),
    lon: num(el.getAttribute('lon')),
    ele: num(childText(el, 'ele')),
  };
}

export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error("Le fichier n'est pas un GPX valide.");
  }

  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
  const points = nodes.map(readPoint).filter((p) => p.lat !== null && p.lon !== null);
  if (points.length < 2) throw new Error('Aucune trace trouvée dans ce GPX.');

  const waypoints = [...doc.getElementsByTagName('wpt')].map((el) => ({
    ...readPoint(el),
    name: childText(el, 'name') || 'Point',
    type: (childText(el, 'type') || childText(el, 'sym')).toLowerCase(),
  }));

  const metadata = doc.getElementsByTagName('metadata')[0];
  const trk = doc.getElementsByTagName('trk')[0] || doc.getElementsByTagName('rte')[0];
  const name = (metadata && childText(metadata, 'name')) || (trk && childText(trk, 'name')) || 'Ma rando';
  const desc = (metadata && childText(metadata, 'desc')) || (trk && childText(trk, 'desc')) || '';

  return { name, desc, points, waypoints };
}
