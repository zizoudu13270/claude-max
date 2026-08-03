# Pack Survie Ultime — v4.1.0

*[English version](README.md)*

Un add-on Minecraft **Bedrock** qui réunit dix-sept modules de confort derrière
un seul fichier de configuration. Abattage d'arbres, minage de filons, vraie
main gauche, lumière dynamique, étiquettes de butin flottantes, coffre-tombe —
le tout en français et en anglais, choisi automatiquement pour chaque joueur.

| | |
|---|---|
| **Créateur** | LBR |
| **Version** | 4.1.0 |
| **Minecraft minimum** | Bedrock 1.21.50 |
| **API de script** | `@minecraft/server` 1.11.0 |
| **Langues** | Français (`fr_FR`), anglais (`en_US`) |
| **Téléchargement** | [`dist/Pack_Survie_Ultime_v4.1.0.mcaddon`](dist/Pack_Survie_Ultime_v4.1.0.mcaddon) |

---

## Installation

1. Télécharge le `.mcaddon` depuis `dist/`.
2. Ouvre-le : Minecraft importe les deux packs tout seul.
3. Dans les paramètres du monde, active **Pack Survie Ultime** dans les packs de
   comportement. Le pack de ressources suit automatiquement, il est déclaré
   comme dépendance.
4. Active **les API bêta** dans les expérimentations du monde. L'API de script
   en a besoin.

> Les deux packs doivent être actifs. Le pack de comportement définit les
> entités et les objets, le pack de ressources les dessine et contient les
> traductions. Avec un seul des deux, les étiquettes de butin sont invisibles et
> les noms d'objets s'affichent sous forme de clés brutes.

---

## Modules

Chaque module a son drapeau `enabled` dans
`packs/PSU_BP/scripts/config.js`. En désactiver un ne coûte rien à l'exécution :
ses gestionnaires ne sont jamais enregistrés.

| Module | Ce qu'il fait | Clé de config |
|---|---|---|
| **Abattage** | Casser un tronc à la hache abat l'arbre entier. Accroupi = une seule bûche. | `tree` |
| **Filon** | Casser un minerai à la pioche mine tout le filon, **avec Toucher de Soie, Fortune et l'expérience du minerai**. Accroupi = un seul bloc. | `vein` |
| **Étiquettes** | Une étiquette flottante `12x Bûche de chêne` suit chaque objet au sol et affiche la taille réelle de la pile. | `labels` |
| **Lumière dynamique** | Tenir une source de lumière éclaire autour de toi, dans n'importe quelle main. | `light` |
| **Jumeaux lumineux** | Chaque source de lumière vanilla a un jumeau `psu:` que Bedrock accepte en main gauche et qui pose le vrai bloc vanilla. | `lightItems` |
| **Main gauche** | Accroupi + saut, ou accroupi + clic dans le vide, pour échanger tes mains. | `offhand` |
| **Marqueur de mort** | Coordonnées exactes et dimension dans le chat ; le stuff au sol est rassemblé dans un coffre posé sur place. | `death` |
| **Replantage auto** | Cliquer sur une culture mûre la récolte et la replante ; une graine est prélevée sur la récolte pour payer le semis. | `replant` |
| **Double portes** | Ouvrir une porte ouvre la porte accolée. | `doors` |
| **Réparation d'enclume** | Cliquer avec un lingot de fer sur une enclume abîmée la remonte d'un palier. | `anvil` |
| **Anti-griefing** | Les creepers font toujours mal mais ne cassent plus de blocs. Configurable par source. | `nogrief` |
| **Flèches lumineuses** | Une flèche plantée éclaire la zone 30 secondes. | `arrows` |
| **Générateurs** | Une pioche Toucher de Soie récupère un générateur sous forme d'objet. | `spawner` |
| **Tri** | Accroupi + clic sur un conteneur pour le trier et regrouper les piles ; `/scriptevent psu:trier` s'occupe de ton inventaire. | `sorter` |
| **Outil auto** | Sélectionne l'outil adapté au bloc visé dans la barre rapide, puis remet ton emplacement précédent. | `autotool` |
| **Poubelle** | `/scriptevent psu:poubelle` détruit la pile tenue ; une liste facultative se vide automatiquement. | `trash` |
| **Pioche en émeraude** | 3 émeraudes + 2 bâtons. Palier et durabilité du diamant, réparable à l'émeraude, mine un plan 3×3. | `emeraldPick` |

Des recettes de recyclage sont incluses : l'équipement en diamant se fond en un
diamant, le cuir en un cuir, la pioche en émeraude en une émeraude. Le rendement
est volontairement bas : au-delà, la durabilité devient une source infinie de
minerai.

---

## Commandes

Les triches doivent être activées. Les noms français et anglais fonctionnent
tous les deux.

| Commande | Alias | Effet |
|---|---|---|
| `/scriptevent psu:aide` | `psu:help` | Rappel des commandes et des raccourcis |
| `/scriptevent psu:diag` | — | État complet des dix-sept modules |
| `/scriptevent psu:mort` | `psu:death` | Coordonnées de ta dernière mort |
| `/scriptevent psu:trier` | `psu:sort` | Trie ton propre inventaire |
| `/scriptevent psu:poubelle` | `psu:trash` | Détruit la pile tenue en main |
| `/scriptevent psu:lumiere` | `psu:light` | Force un test de pose de lumière et dit ce qui a échoué |
| `/scriptevent psu:cleanlight` | — | Retire les blocs de lumière orphelins laissés par un plantage |
| `/scriptevent psu:swap` | — | Force l'échange des mains |
| `/scriptevent psu:vanilla` | — | Reconvertit en vanilla tous les jumeaux `psu:` de ton inventaire |

---

## Configuration

Tout se trouve dans **`packs/PSU_BP/scripts/config.js`**, commenté dans les deux
langues. Quelques réglages à connaître :

```js
lightItems.replaceVanilla: false
```
`false` (recommandé) garde les jumeaux `psu:` uniquement dans la main gauche :
tout le reste de l'inventaire reste vanilla, donc rien n'est perdu si tu retires
le pack. `true` convertit toutes les sources de lumière de l'inventaire. Dans ce
mode le pack fournit des recettes de compatibilité pour la lanterne, la lanterne
des âmes, la torche des âmes, la citrouille-lanterne, le répéteur, le
comparateur et la lampe de redstone ; toute *autre* recette vanilla qui consomme
une torche ou de la pierre lumineuse n'acceptera pas un jumeau.

```js
vein.silkTouch / vein.fortune / vein.giveXp: true
```
Reproduit le butin vanilla du minerai sur tout le filon. Passe-les à `false`
pour revenir aux drops de `/setblock destroy`.

```js
autotool.keepHeld / autotool.keepHeldSuffix
```
Les objets que le changement d'outil ne doit jamais retirer de ta main : épées,
arcs, seaux, œufs d'apparition. Ajoute tes propres identifiants ici.

```js
nogrief.sources: ["minecraft:creeper"]
```
Une liste **vide** signifie toutes les explosions, TNT et lits compris.

---

## À propos de l'icône animée

Minecraft Bedrock ne lit pas les GIF, et **`pack_icon.png` ne peut pas être
animée** : le jeu n'y affiche qu'une seule image fixe, aucun fichier JSON n'y
change quoi que ce soit. Ce qui *peut* être animé, c'est toute texture qui passe
par l'atlas des objets, via la technique officielle du **flipbook** :

* toutes les images empilées **verticalement** dans un seul PNG de 16 px de
  large,
* une entrée dans `textures/flipbook_textures.json` qui donne la vitesse de
  défilement.

Ce pack fournit `psu_axe_anim.png` : une bande 16×112 des sept paliers de hache
(bois → pierre → cuivre → fer → or → diamant → netherite), reconstruite à partir
des rendus source rangés dans `assets/frames/`. L'objet de démonstration
`psu:icone_animee` la porte.

Pour animer n'importe quel autre objet, une seule ligne dans son fichier de
`packs/PSU_BP/items/` :

```json
"minecraft:icon": { "texture": "psu_axe_anim" }
```

La vitesse se règle avec `ticks_per_frame` dans `flipbook_textures.json`
(20 ticks = 1 seconde). Pour utiliser tes propres images, dépose des PNG 16×16
dans `assets/frames/` (elles défilent dans l'ordre des noms de fichiers) et
lance `python3 tools/make_assets.py`.

### S'il te faut une icône animée pour une page de vente

`tools/make_assets.py` écrit aussi **`dist/pack_icon_animated.gif`** : les mêmes
sept images en GIF bouclé. Le jeu ne le lira pas, mais une fiche Marketplace,
une miniature ou une bande-annonce si — et c'est le seul endroit où une icône
animée peut réellement s'afficher. `packs/*/pack_icon.png` reste un rendu fixe
en 256×256, parce que c'est tout ce que la liste des packs sait dessiner.

---

## Développement

```
assets/            images source + table des sources de lumière
packs/PSU_BP/      pack de comportement : objets, recettes, entités, scripts
packs/PSU_RP/      pack de ressources : textures, traductions, entité étiquette de butin
tools/             générateurs, validateur et tests
dist/              le .mcaddon construit
```

```bash
python3 tools/generate_items.py   # régénère objets + atlas de textures
python3 tools/make_assets.py      # reconstruit la planche flipbook et les icônes
python3 tools/validate.py         # 753 contrôles structurels
node    tools/test_scripts.mjs    # 45 tests unitaires et de non-régression
python3 tools/build.py            # valide + teste + empaquette le .mcaddon
```

`tools/validate.py` attrape tout ce que Minecraft laisse passer en silence :
un alias de texture sans entrée dans l'atlas, une clé `display_name` absente
d'un `.lang`, une recette qui pointe vers un objet inexistant, une collision
d'UUID, une version de manifeste désynchronisée de sa dépendance, une clé de
traduction présente en anglais mais pas en français.

`tools/test_scripts.mjs` copie les scripts à côté d'un bouchon de
`@minecraft/server` et les **exécute** vraiment : chaque module doit se charger,
chaque `/scriptevent` doit répondre, et chaque bug de perte de données listé
dans le changelog a son test de non-régression qui échoue si le correctif est
annulé.

---

## Limites connues

Ce sont des limites du moteur, pas des bugs. Elles sont listées ici pour que
personne n'y passe une soirée.

* **Un générateur récupéré perd son type de mob.** L'API stable de Bedrock ne
  permet pas de lire l'identifiant du mob d'un générateur. Repose-le et utilise
  un œuf d'apparition dessus.
* **`pack_icon.png` ne peut pas être animée.** Voir la section ci-dessus.
* **Le contenu d'une shulker ne peut pas être affiché dans l'infobulle.** L'API
  ne donne aucun accès au contenu d'une shulker sous forme d'*objet*, et le
  texte des infobulles vanilla n'est pas modifiable par un add-on.
* **La pioche en émeraude 3×3 n'applique ni Toucher de Soie ni Fortune aux blocs
  supplémentaires.** Ils tombent avec les drops vanilla à la main. Les
  conteneurs, générateurs, l'obsidienne et la bedrock sont entièrement ignorés.
* **La Fortune sur un filon est reproduite depuis la formule vanilla**, pas lue
  dans le moteur. Si Mojang réajuste un minerai,
  `packs/PSU_BP/scripts/drops.js` doit suivre.

## Journal des modifications

Voir [CHANGELOG.md](CHANGELOG.md) pour la liste complète des correctifs de la
4.1.0.
