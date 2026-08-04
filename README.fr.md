# Add-ons Minecraft Bedrock

*[English version](README.md)*

Deux add-ons Minecraft **Bedrock** construits sur une base de code commune,
entièrement bilingues (français / anglais, choisi pour chaque joueur).

| Add-on | Ce que tu obtiens | Téléchargement |
|---|---|---|
| **Pack Survie Essentiel** — v1.0.0 | Quatre systèmes, rien d'autre : abattage, filons, regroupement des drops avec étiquettes flottantes, lumière dynamique. **Aucun module de main gauche, aucun objet personnalisé.** | [`dist/Survival_Core_v1.0.0.mcaddon`](dist/Survival_Core_v1.0.0.mcaddon) |
| **Pack Survie Ultime** — v4.1.0 | Tout ce qui précède plus treize modules de confort : vraie main gauche, coffre-tombe, tri, replantage, anti-griefing, pioche en émeraude… | [`dist/Pack_Survie_Ultime_v4.1.0.mcaddon`](dist/Pack_Survie_Ultime_v4.1.0.mcaddon) |

Choisis-en **un**. Ils se recouvrent largement : les faire tourner ensemble,
c'est deux abattages qui se disputent le même arbre.

| | |
|---|---|
| **Minecraft minimum** | Bedrock 1.21.0 |
| **API de script** | `@minecraft/server` 1.11.0 |
| **Langues** | Français (`fr_FR`), anglais (`en_US`) |

---

## Installation

1. Télécharge un `.mcaddon` depuis `dist/`.
2. Ouvre-le : Minecraft importe les deux packs tout seul.
3. Dans les paramètres du monde, active le pack de comportement. Le pack de
   ressources suit automatiquement, il est déclaré comme dépendance.
4. Active **les API bêta** dans les expérimentations du monde. L'API de script
   en a besoin.

> Les deux packs doivent être actifs. Le pack de comportement définit les
> entités et les objets, le pack de ressources les dessine et contient les
> traductions. Avec un seul des deux, les étiquettes de butin sont invisibles et
> les noms d'objets s'affichent sous forme de clés brutes.

---

# Pack Survie Essentiel

Quatre systèmes, chacun désactivable dans `packs/PSC_BP/scripts/config.js`.

### 1. Abattage — il distingue un arbre d'une maison

Casse une bûche avec une hache et l'arbre entier tombe. Casse une bûche de ta
**cabane en rondins** et il ne se passe rien : c'est tout l'intérêt du module.

Les abattages naïfs remplissent de proche en proche toutes les bûches
connectées, et c'est pour ça qu'ils dévorent les constructions. Celui-ci
fonctionne en deux temps :

1. **Analyse** (lecture seule, rien n'est cassé). Le groupe de bûches connectées
   est parcouru une fois et évalué sur six signaux indépendants.
2. **Abattage** — seulement si le verdict est `ok`, et uniquement sur les blocs
   listés à l'étape 1. La destruction ne peut pas déborder dans un mur.

| Signal | Un arbre | Une construction |
|---|---|---|
| **Type de tronc** | `oak_log`, `crimson_stem`… | `oak_wood` (écorce sur six faces) et tous les `stripped_*` sont forcément posés par un joueur : refusés d'office |
| **Hauteur** | ≥ 4 blocs | un plancher de bûches en fait 1 |
| **Emprise au sol** | 1 colonne, ou 4 pour un géant 2×2 | un mur ou un plancher en couvre beaucoup |
| **Feuilles** | beaucoup, en valeur absolue **et** par bûche | une cabane qui frôle une canopée reste très en dessous |
| **Contact construction** | rien de fabriqué au contact des bûches | planches, escaliers, verre, porte, torche… |
| **Sol** | terre, herbe, podzol, boue, nylium… | planches, briques de pierre |

Les voisins naturels sont exclus en premier : tapis de mousse, nids d'abeilles,
cacao, racines de palétuvier, lianes et neige ne comptent jamais comme
« quelqu'un a construit ici ».

Tout ce qui est refusé se comporte comme en vanilla : tu casses une bûche.

**Réglage :** `/scriptevent psc:arbre` affiche le verdict complet du bloc que tu
regardes, sans rien casser :

```
ok | logs=7 leaves=44(44 same species) height=5 base=1 build=0 ground=natural
base_too_wide | logs=72 leaves=0 height=5 base=24 build=61 ground=artificial
```

Tous les seuils sont dans `config.js` sous `tree.validate`. Passe
`tree.explainRefusal: true` pour afficher la raison dans la barre d'action à
chaque refus.

### 2. Filons

Casse un minerai avec une pioche et le filon connecté part avec — **Toucher de
Soie, Fortune et l'expérience du minerai compris**, ce que la plupart des
mineurs de filons perdent parce que `/setblock destroy` fait tomber le butin
sans connaître l'outil.

Les blocs décoratifs ne sont volontairement pas des minerais : `quartz_block` et
`coal_block` sont des matériaux de construction, et miner tout un mur de quartz
n'est pas une fonctionnalité. Les identifiants supplémentaires se mettent dans
`vein.extraBlocks`.

Accroupi = un seul bloc.

### 3. Regroupement + affichage dynamique

Après un arbre abattu ou un filon miné, les drops éparpillés sont réunis en
piles pleines au lieu de laisser 300 entités ramer sur place (`clump`), et
chaque objet au sol porte une étiquette flottante `12x Bûche de chêne` qui suit
la taille réelle de la pile quand elle change (`labels`).

Les objets dont l'API ne sait pas lire le contenu — potions, shulkers pleines,
équipement enchanté, livres écrits, seaux de poisson — ne sont jamais fusionnés.
Les reconstruire à partir de leur seul identifiant les détruirait.

### 4. Lumière dynamique

Tiens une torche, une lanterne, un seau de lave, des baies lumineuses… et ça
éclaire autour de toi.

**Il n'y a aucun module de main gauche et aucun objet lumineux personnalisé.**
La liste de ce qui éclaire est explicite dans
`packs/PSC_BP/scripts/lightsources.js` : une comparaison par sous-chaîne
attraperait aussi la fleur-torche, la crème de magma et une bougie éteinte, qui
n'émettent aucune lumière.

### Commandes

Les triches doivent être activées. Les noms français et anglais fonctionnent.

| Commande | Alias | Effet |
|---|---|---|
| `/scriptevent psc:aide` | `psc:help` | Rappel de ce que fait quoi |
| `/scriptevent psc:diag` | — | État des quatre modules |
| `/scriptevent psc:arbre` | `psc:tree` | Analyse la bûche que tu regardes |
| `/scriptevent psc:lumiere` | `psc:light` | Force un test de pose de lumière |
| `/scriptevent psc:cleanlight` | — | Retire les blocs de lumière orphelins |

---

# Pack Survie Ultime

Tout ce que fait le Pack Survie Essentiel — validation d'arbre comprise — plus
treize modules. Chacun a son drapeau `enabled` dans
`packs/PSU_BP/scripts/config.js` ; en désactiver un ne coûte rien à l'exécution,
ses gestionnaires ne sont jamais enregistrés.

| Module | Ce qu'il fait | Clé de config |
|---|---|---|
| **Abattage** | Comme ci-dessus : abat les arbres, épargne les constructions. | `tree` |
| **Filons** | Comme ci-dessus : Toucher de Soie, Fortune, expérience. | `vein` |
| **Regroupement** | Réunit les drops d'un arbre ou d'un filon en piles pleines. | `clump` |
| **Étiquettes** | `12x Bûche de chêne` flottant au-dessus de chaque objet au sol. | `labels` |
| **Lumière dynamique** | Tenir une source de lumière éclaire, dans n'importe quelle main. | `light` |
| **Jumeaux lumineux** | Chaque source de lumière vanilla a un jumeau `psu:` accepté en main gauche, qui pose le vrai bloc vanilla. | `lightItems` |
| **Main gauche** | Accroupi + saut, ou accroupi + clic dans le vide, pour échanger tes mains. | `offhand` |
| **Marqueur de mort** | Coordonnées et dimension dans le chat ; le stuff au sol est rassemblé dans un coffre posé sur place. | `death` |
| **Replantage auto** | Cliquer sur une culture mûre la récolte et la replante. | `replant` |
| **Double portes** | Ouvrir une porte ouvre la porte accolée. | `doors` |
| **Réparation d'enclume** | Un lingot de fer remonte une enclume abîmée d'un palier. | `anvil` |
| **Anti-griefing** | Les creepers font toujours mal mais ne cassent plus de blocs. | `nogrief` |
| **Flèches lumineuses** | Une flèche plantée éclaire la zone 30 s. | `arrows` |
| **Générateurs** | Une pioche Toucher de Soie récupère un générateur. | `spawner` |
| **Tri** | Accroupi + clic sur un conteneur pour le trier et regrouper les piles. | `sorter` |
| **Outil auto** | Sélectionne l'outil adapté au bloc visé, puis remet ton emplacement. | `autotool` |
| **Poubelle** | Détruit la pile tenue ; liste facultative qui se vide toute seule. | `trash` |
| **Pioche en émeraude** | 3 émeraudes + 2 bâtons. Palier diamant, réparable à l'émeraude, mine un plan 3×3. | `emeraldPick` |

Des recettes de recyclage sont incluses : l'équipement en diamant se fond en un
diamant, le cuir en un cuir, la pioche en émeraude en une émeraude. Le rendement
est volontairement bas : au-delà, la durabilité devient une source infinie de
minerai.

### Commandes

| Commande | Alias | Effet |
|---|---|---|
| `/scriptevent psu:aide` | `psu:help` | Rappel des commandes et des raccourcis |
| `/scriptevent psu:diag` | — | État complet des dix-sept modules |
| `/scriptevent psu:arbre` | `psu:tree` | Analyse la bûche que tu regardes |
| `/scriptevent psu:mort` | `psu:death` | Coordonnées de ta dernière mort |
| `/scriptevent psu:trier` | `psu:sort` | Trie ton propre inventaire |
| `/scriptevent psu:poubelle` | `psu:trash` | Détruit la pile tenue en main |
| `/scriptevent psu:lumiere` | `psu:light` | Force un test de pose de lumière |
| `/scriptevent psu:cleanlight` | — | Retire les blocs de lumière orphelins |
| `/scriptevent psu:swap` | — | Force l'échange des mains |
| `/scriptevent psu:vanilla` | — | Reconvertit en vanilla tous les jumeaux `psu:` |

### `lightItems.replaceVanilla`

`false` (recommandé) garde les jumeaux `psu:` uniquement dans la main gauche :
tout le reste reste vanilla, donc rien n'est perdu si tu retires le pack.
`true` convertit toutes les sources de lumière de l'inventaire. Dans ce mode le
pack fournit des recettes de compatibilité pour la lanterne, la lanterne des
âmes, la torche des âmes, la citrouille-lanterne, le répéteur, le comparateur et
la lampe de redstone ; toute *autre* recette vanilla consommant une torche ou de
la pierre lumineuse n'acceptera pas un jumeau.

### À propos de l'icône animée

Minecraft Bedrock ne lit pas les GIF, et **`pack_icon.png` ne peut pas être
animée** : le jeu n'y affiche qu'une seule image fixe, aucun fichier JSON n'y
change quoi que ce soit. Ce qui *peut* être animé, c'est toute texture qui passe
par l'atlas des objets, via la technique officielle du **flipbook** :

* toutes les images empilées **verticalement** dans un seul PNG de 16 px de
  large,
* une entrée dans `textures/flipbook_textures.json` qui donne la vitesse.

Le pack fournit `psu_axe_anim.png` : une bande 16×112 des sept paliers de hache
(bois → pierre → cuivre → fer → or → diamant → netherite), reconstruite à partir
des rendus source rangés dans `assets/frames/`. L'objet de démonstration
`psu:icone_animee` la porte.

Pour animer n'importe quel autre objet, une ligne dans son fichier de
`packs/PSU_BP/items/` :

```json
"minecraft:icon": { "texture": "psu_axe_anim" }
```

La vitesse se règle avec `ticks_per_frame` dans `flipbook_textures.json`
(20 ticks = 1 seconde). Pour tes propres images, dépose des PNG 16×16 dans
`assets/frames/` (elles défilent dans l'ordre des noms) et lance
`python3 tools/make_assets.py`.

---

## Développement

```
addons.json        quels add-ons existent et quels contrôles s'appliquent
assets/            images source + table des sources de lumière
shared/scripts/    modules communs aux deux add-ons, copiés dans chaque pack
packs/PSC_BP,PSC_RP   Pack Survie Essentiel
packs/PSU_BP,PSU_RP   Pack Survie Ultime
tools/             générateurs, validateur et tests
dist/              les .mcaddon construits
```

```bash
python3 tools/sync_shared.py      # copie shared/scripts dans chaque pack
python3 tools/generate_items.py   # régénère objets / attachables / textures
python3 tools/make_assets.py      # reconstruit la planche flipbook et les icônes
python3 tools/validate.py         # 920+ contrôles sur les deux add-ons
node    tools/test_scripts.mjs    # 59 tests unitaires, d'intégration et de non-régression
python3 tools/build.py            # sync + validation + tests + empaquetage
```

Les modules communs vivent une seule fois dans `shared/scripts/` et sont copiés
dans chaque pack de comportement. `validate.py` fait échouer la construction si
une copie a divergé, donc un doublon périmé ne peut pas être livré. Chaque pack
garde son `config.js`, son `main.js` et son `lightsources.js` : c'est là que les
deux add-ons diffèrent réellement.

`tools/validate.py` attrape tout ce que Minecraft laisse passer en silence : un
alias de texture sans entrée dans l'atlas, une clé `display_name` absente d'un
`.lang`, une recette qui pointe vers un objet inexistant, une collision d'UUID
entre les deux add-ons, une version de manifeste désynchronisée, une clé de
traduction présente en anglais mais pas en français.

`tools/test_scripts.mjs` copie les scripts de chaque add-on à côté d'un bouchon
de `@minecraft/server` et les **exécute** vraiment. Au-delà du chargement de
chaque module, il construit des mondes synthétiques (`tools/worlds.mjs`) — un
chêne, une épinette géante, un champignon du Nether, une cabane en rondins, une
cabane **en pleine forêt**, un pilier décoratif dans une pièce, un arbre collé à
une maison — et vérifie le verdict de chacun, de bout en bout à travers le vrai
événement de cassage.

---

## Limites connues

Ce sont des limites du moteur, pas des bugs.

* **Un générateur récupéré perd son type de mob.** L'API stable de Bedrock ne
  permet pas de lire l'identifiant du mob. Repose-le et utilise un œuf dessus.
* **`pack_icon.png` ne peut pas être animée.** Voir ci-dessus.
* **Le contenu d'une shulker ne peut pas être affiché dans l'infobulle.** L'API
  n'y donne aucun accès tant que c'est un *objet*.
* **La détection d'arbre est heuristique.** Un pilier de bûches 1×1 posé sur de
  l'herbe, sous des feuilles, sans rien de fabriqué au contact, est
  indiscernable d'un tronc. Tous les seuils sont configurables et
  `/scriptevent <ns>:arbre` indique exactement quel test a tranché.
* **La pioche en émeraude 3×3 n'applique ni Toucher de Soie ni Fortune aux blocs
  supplémentaires.** Conteneurs, générateurs, obsidienne et bedrock sont ignorés.
* **La Fortune sur un filon est reproduite depuis la formule vanilla**, pas lue
  dans le moteur. Si Mojang réajuste un minerai, `shared/scripts/drops.js` suit.

## Journal des modifications

Voir [CHANGELOG.md](CHANGELOG.md).
