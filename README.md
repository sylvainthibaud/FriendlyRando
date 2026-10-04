# FriendlyRando ⛰️

Découvre une rando en 3D avant d'y aller : on charge une trace GPX, on voit sa difficulté, son terrain et ses points de passage, puis on suit un petit bouquetin qui parcourt le sentier sur le relief.

Première rando : **Tour des lacs d'Ayous** (vallée d'Ossau, Pyrénées).

## Fonctionnalités

- Fiche de présentation : difficulté façon pistes de ski (verte, bleue, rouge, noire), distance, montée, altitude, durée, répartition du terrain (« Tranquille », « Ça grimpe », « Ça pique ! »…), passage le plus dur, points de passage avec kilomètre, altitude et heure de passage estimée
- Parcours animé : un bouquetin suit le tracé à une vitesse qui dépend de la pente, la caméra le suit (Drone, Épaule, Aigle), vitesse x1/x2/x4, traînée dorée sur le chemin parcouru
- Pendant le parcours : énergie demandée à chaque instant (quasi aucune en descente, peu sur le plat, beaucoup dans les fortes montées), vitesse, terrain, altitude, heure, prochain point de passage
- Noms des lieux affichés seulement à l'approche et juste après le passage, pour ne pas surcharger la vue
- Deux rendus de carte : satellite (IGN + Esri) ou « rendu jeu vidéo » (teintes par altitude, lacs et forêts en aplats, ombrage stylisé) ; Plan IGN et OpenTopoMap dans les réglages
- Relief 3D réglable, vue carte 2D, profil du parcours interactif synchronisé avec la carte
- Import de n'importe quel fichier GPX (bouton ou glisser-déposer) ; altitudes complétées depuis le modèle de terrain si besoin
- Utilisable sur mobile

## Structure

Site 100 % statique, sans étape de build (MapLibre GL JS chargé depuis un CDN).

```
public/
  index.html
  css/style.css
  js/
    app.js          # orchestration de l'interface
    gpx.js          # lecture des fichiers GPX
    analyze.js      # distances, pentes, dénivelés, temps de marche
    dem.js          # altitudes depuis les tuiles de relief (terrarium)
    map.js          # carte 3D MapLibre
    profile.js      # profil altimétrique (canvas)
    flythrough.js   # parcours animé (bouquetin + caméra)
    ride.js         # difficulté, terrain, énergie demandée, points de passage
    ibex.js         # le bouquetin (SVG animé)
  tracks/
    index.json      # catalogue des randos
    *.gpx
render.yaml         # déploiement Render (site statique)
```

## Ajouter une rando

1. Déposer le fichier dans `public/tracks/ma-rando.gpx`. Les `<wpt>` du GPX deviennent des points d'intérêt ; le champ `<type>` choisit l'icône (`lac`, `refuge`, `sommet`, `col`, `parking`, `pont`, `source`, `vue`, `cascade`).
2. Ajouter une entrée dans `public/tracks/index.json` :

```json
{
  "id": "ma-rando",
  "name": "Ma rando",
  "region": "Massif · Département",
  "file": "tracks/ma-rando.gpx",
  "description": "Quelques lignes de présentation.",
  "view": { "bearing": 180, "pitch": 60 },
  "startTime": "08:30"
}
```

`view.bearing` oriente la vue d'ensemble (0 = regard vers le nord, 180 = vers le sud). `startTime` règle l'heure de départ utilisée pour les heures de passage.

## Lancer en local

N'importe quel serveur statique sur le dossier `public/`, par exemple :

```bash
npx serve public
```

## Déploiement

Render, en site statique (`render.yaml`) : chaque push sur `main` redéploie automatiquement.

## Données et crédits

- Fonds de carte : © IGN (Géoplateforme), © Esri World Imagery, © OpenFreeMap / OpenStreetMap (rendu jeu), © OpenTopoMap (CC-BY-SA)
- Relief : Mapzen / AWS Terrain Tiles (EU-DEM en Europe)
- Tracé du tour des lacs d'Ayous : calculé sur les sentiers © contributeurs OpenStreetMap avec BRouter
