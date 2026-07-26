Textures du sol (occupation du sol), au format jpg ou png.

1) TEXTURE PAR DÉFAUT PAR CODE — dépose ici un fichier au nom attendu pour
   chaque code que tu veux illustrer par une vraie photo/texture plutôt
   qu'une couleur unie (le nom est fixé dans OS_STYLE, js/os.js) :

     foret.jpg          → code "foret" / ESA WorldCover 10 (Tree cover)
     foret_claire.jpg    → code "foret_claire" / ESA 20 (Shrubland)
     prairie.jpg         → code "prairie" / ESA 30 (Grassland)
     culture.jpg         → code "culture" / ESA 40 (Cropland)
     urbain.jpg          → code "urbain" / ESA 50 (Built-up)
     sable.jpg           → code "sable" / ESA 100 (Moss/lichen)
     roche.jpg           → code "roche" / ESA 60,70 (Bare/sparse, Snow/ice)

   Si le fichier n'existe pas, ce code garde simplement sa couleur unie
   (aucune erreur, repli automatique) — tu peux donc n'en fournir que
   certains, progressivement.

2) REDÉFINIR UN POLYGONE PRÉCIS — dans os.geojson, ajoute la propriété
   "texture" à la feature concernée pour lui donner un aspect différent
   du défaut de son code :

     "type": "culture",
     "texture": "vigne_terrasse.jpg"

   Cette texture, propre au polygone, est prioritaire sur la texture par
   défaut du code ET sur la couleur unie.

Les images sont carrelées (tuilées) sur l'emprise du polygone — une image
carrée assez neutre sur les bords (~256-512px) donne le meilleur résultat.
