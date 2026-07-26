Dépose ici tes fichiers .glb (modèles 3D : arbres, mobilier urbain, objets…).

Pour qu'un modèle soit planté automatiquement dans une zone du fichier os.geojson,
ajoute ces propriétés à la feature concernée (polygone) :

  "model3d": "chene.glb"

Le nombre d'instances est calculé automatiquement (budget de triangles réparti
selon la surface réelle de la zone et sa catégorie), sauf si tu fixes toi-même :

  "model3d_density": 0.004   (optionnel — densité voulue, en objets par m²)
  "model3d_count": 25        (optionnel — nombre exact voulu, prioritaire sur la densité)
  "model_category": "vegetation"  (optionnel — force la catégorie budgétaire)

Le fichier doit se trouver ici : models/chene.glb
Plusieurs zones peuvent référencer le même modèle (il n'est chargé qu'une seule fois,
puis instancié — 1 à quelques draw calls au total quel que soit le nombre d'instances).

Voir README_OS.md (à la racine du projet) pour le détail complet du format attendu
et du fonctionnement du budget de triangles.

Modèles fournis en exemple : cedar_tree.glb, stone_house.glb.
