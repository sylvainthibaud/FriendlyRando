# FriendlyRando ⛰️

Visualiser une randonnée en 3D, simplement : on charge une trace GPX et on voit le tracé posé sur le relief, le profil altimétrique, le dénivelé et le temps de marche estimé.

Première rando : **Tour des lacs d'Ayous** (vallée d'Ossau, Pyrénées).

## Fonctionnalités

- Carte 3D avec relief (exagération réglable) et fonds Satellite (IGN + Esri), Plan IGN ou OpenTopoMap
- Tracé coloré selon la pente, bornes kilométriques, points d'intérêt (lacs, refuge, sommets…)
- Profil altimétrique interactif, synchronisé avec la carte (survol / clic dans les deux sens)
- Chiffres clés : distance, D+ / D−, altitudes min/max, temps de marche (DIN 33466), difficulté estimée
- Survol animé de la rando façon « drone »
- Import de n'importe quel fichier GPX (bouton ou glisser-déposer) ; altitudes complétées depuis le modèle de terrain si le GPX n'en contient pas
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
    flythrough.js   # survol animé
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
  "view": { "bearing": 180, "pitch": 60 }
}
```

`view.bearing` oriente la vue d'ensemble (0 = regard vers le nord, 180 = vers le sud).

## Lancer en local

N'importe quel serveur statique sur le dossier `public/`, par exemple :

```bash
npx serve public
```

## Déploiement

Render, en site statique (`render.yaml`) : chaque push sur `main` redéploie automatiquement.

## Données et crédits

- Fonds de carte : © IGN (Géoplateforme), © Esri World Imagery, © OpenTopoMap (CC-BY-SA)
- Relief : Mapzen / AWS Terrain Tiles (EU-DEM en Europe)
- Tracé du tour des lacs d'Ayous : calculé sur les sentiers © contributeurs OpenStreetMap avec BRouter
