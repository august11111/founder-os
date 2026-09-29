# Founder OS

Un tableau de bord local pour piloter un projet entrepreneurial : objectifs, tâches, CRM,
interviews, finances et pitch deck, réunis dans une seule page.

Pas de compte, pas de serveur, pas d'abonnement. **Toutes vos données restent dans votre
navigateur (localStorage), rien n'est envoyé nulle part.**

## Essayer tout de suite

### → **[august11111.github.io/founder-os](https://august11111.github.io/founder-os/)**

Rien à installer. **Ouvrez ce lien dans Chrome ou Edge.** Toutes vos données restent dans
votre navigateur, rien n'est envoyé nulle part. Pour ne rien perdre, liez un fichier de
sauvegarde dans les **Réglages**.

> **À savoir** : vos données sont rattachées à ce navigateur, sur cet ordinateur. Vider le
> cache du site les efface. La sauvegarde automatique dans un fichier est là pour ça — c'est
> la première chose à faire.

Vous préférez que tout tourne chez vous, sans dépendre de GitHub ? Suivez l'installation
ci-dessous : c'est la même application, servie depuis votre machine.

## Installation locale

### Prérequis

**Python 3** — c'est tout. Aucune dépendance à installer, aucun compte à créer.

Vérifiez que vous l'avez :

```bash
python --version
```

Vous devez voir `Python 3.x`. Si la commande n'est pas reconnue, essayez `py --version`
(Windows) ou `python3 --version` (macOS / Linux), et utilisez ce nom-là dans la suite.
Sinon, installez Python depuis [python.org](https://www.python.org/downloads/).

### 1. Récupérer le projet

```bash
git clone https://github.com/august11111/founder-os.git
cd founder-os
```

Pas de git ? Téléchargez le ZIP depuis GitHub (bouton vert **Code → Download ZIP**),
décompressez-le, et ouvrez un terminal dans le dossier obtenu.

### 2. Démarrer le serveur

```bash
python server.py
```

**Laissez cette fenêtre ouverte** : elle fait tourner l'application. Pour l'arrêter,
fermez-la ou faites `Ctrl+C`.

### 3. Ouvrir l'application

Dans votre navigateur : **http://localhost:8080**

C'est prêt. Au premier lancement, une roadmap de démonstration et quelques contacts fictifs
sont chargés pour que rien ne soit vide — supprimez-les et remplacez-les par les vôtres.

> **Pourquoi un serveur ?** L'application charge ses fichiers par `fetch`, que les
> navigateurs bloquent sur les fichiers ouverts en direct. Ouvrir `index.html` d'un
> double-clic **ne fonctionne pas** : il faut passer par `http://localhost`.

### Raccourci Windows (optionnel)

`launch-founder-os.ps1` démarre le serveur et ouvre le navigateur d'un coup.
**Clic droit sur le fichier → « Exécuter avec PowerShell ».**

Deux pièges classiques :

- **Un double-clic ouvre le fichier dans le Bloc-notes** au lieu de l'exécuter. C'est le
  comportement normal de Windows pour les `.ps1` : passez par le clic droit.
- **« L'exécution de scripts est désactivée sur ce système »** : Windows bloque les scripts
  non signés. Ouvrez PowerShell et lancez une fois :
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```
  Ce réglage autorise les scripts locaux tout en continuant de bloquer ceux téléchargés
  non signés.

Le script installe aussi un raccourci sur le Bureau si vous lancez `install-shortcut.ps1`.

### Ça ne marche pas ?

| Symptôme | Cause probable |
|---|---|
| `python` n'est pas reconnu | Essayez `py server.py` (Windows) ou `python3 server.py` |
| `Address already in use` | Le port 8080 est déjà pris. Fermez l'autre serveur, ou lancez `python -m http.server 8000` et ouvrez `localhost:8000` |
| Page blanche, erreurs dans la console | Vous avez ouvert `index.html` en direct. Passez par `http://localhost:8080` |
| `localhost:8080` ne répond pas | La fenêtre du serveur a été fermée. Relancez `python server.py` |
| Le bouton « Quitter » ne fait rien | Vous utilisez `python -m http.server` : ce bouton a besoin de `server.py` |
| Pas de bouton « Quitter » | Normal en version en ligne : il n'y a aucun serveur local à arrêter |

Tout serveur statique fonctionne (`npx serve`, l'extension Live Server de VS Code…), mais
`server.py` est celui pour lequel l'application est prévue.

## Ce que ça fait

**Pilotage sur 8 dimensions** — Stratégie, Marketing, Vente, Finance, RSE, Produit, Équipe,
Juridique. Un radar montre où vous en êtes sur chacune : le score d'un axe est le nombre
d'objectifs validés qui le portent. L'idée est de voir d'un coup d'œil ses angles morts.

**Roadmap** — des objectifs rangés par dimension, décomposables en sous-objectifs, avec XP et
niveaux. Import et export en masse (JSON ou texte ligne à ligne), pratique pour se faire
générer une liste d'objectifs et la coller d'un bloc.

**Tâches** — matrice d'Eisenhower pour le ponctuel, et des tâches récurrentes avec séries et
frise des 7 derniers jours pour les rituels quotidiens. Un bloc « J'ai 15 minutes » pioche une
tâche courte quand vous avez un temps mort.

**CRM** — contacts, entreprises, historique d'interactions et relances. Un entonnoir de
prospection agrège tout ça en volumes et taux de conversion : demandes → acceptations → RDV.

**Prospection** — votre base marché dans l'outil, et un pilote quotidien. Vous importez votre
liste d'entreprises (CSV ou JSON), vous piochez une boîte, vous ajoutez une personne : la
demande de connexion est loguée au passage et l'entonnoir se met à jour seul. Voir
[Importer sa base marché](#importer-sa-base-marché).

**Interviews** — un kanban pour suivre les entretiens utilisateurs, de « à contacter » à
« analysé », avec les verbatims.

**Livrables et pitch deck** — de petits jeux de slides en markdown qui documentent le résultat
d'un objectif, avec mode présentation plein écran et export PDF. Le pitch deck se compose en
piochant des slides dans les livrables.

**Finance** — prévisionnel, scénarios, plan de recrutement, comparaison réel / prévu.

## Importer sa base marché

Onglet **Prospection → Importer une base**. Un fichier **CSV** (séparateur `;`, `,` ou
tabulation) ou **JSON**, collé ou chargé. Un gabarit prêt à remplir est fourni :
[`data/base-marche.exemple.csv`](data/base-marche.exemple.csv), également téléchargeable depuis
l'app.

Les colonnes sont reconnues automatiquement, en français comme en anglais, sans tenir compte
de la casse ni des accents. **Seule la colonne de nom est obligatoire.**

| Champ | Libellés acceptés (entre autres) |
|---|---|
| nom **(requis)** | `nom`, `société`, `entreprise`, `company`, `raison sociale` |
| groupe | `groupe`, `réseau`, `holding`, `group` |
| rattaché à | `rattaché à`, `maison mère`, `parent` |
| site web | `site web`, `site`, `url`, `website` |
| ville / région | `ville`, `implantation`, `région`, `city`, `region` |
| secteur | `secteur`, `segment`, `industrie`, `sector` |
| activités | `activités`, `métiers`, `activities` |
| priorité / score | `priorité`, `prio`, `score`, `note`, `scoring` |
| statut | `statut`, `étape`, `status` |
| rôle cible | `rôle cible`, `contact cible`, `target role` |
| email / téléphone | `email`, `mail`, `téléphone`, `tel`, `phone` |
| taille | `taille`, `effectif`, `multi-sites`, `size` |
| sources | `source`, `source 1`, `source 2` (fusionnées en liste) |
| contact | `contact nominatif`, `rôle`, `email`, `téléphone`, `linkedin` |

**Toute colonne non reconnue est conservée** dans les *champs personnalisés* de la fiche, sous
son libellé d'origine — surface, chiffre d'affaires, effectif, technologie, vos propres
scores… Quel que soit votre secteur, rien n'est perdu et rien n'est à coder.

Les priorités, statuts et tailles sont des **libellés libres** : écrivez `A+`, `Haute`, `P1`,
peu importe. Dans Réglages, vous associez vos libellés à un quota de contacts suggéré par
entreprise.

Un récapitulatif s'affiche avant écriture (créations, mises à jour, colonnes inconnues,
rattachements non résolus, lignes en erreur) et reste annulable. Réimporter une base mise à
jour **complète les fiches sans écraser** votre suivi : le statut et l'historique des
interactions sont conservés.

## Vos données

Tout vit dans le `localStorage` de votre navigateur. Rien ne transite par le réseau, il n'y a
aucun backend.

Cela veut aussi dire qu'un vidage du cache efface tout. Deux garde-fous :

- **Export / import JSON** dans Réglages, pour une sauvegarde manuelle à tout moment.
- **Sauvegarde automatique** (Chrome et Edge) : liez un fichier de votre disque, l'app y écrit
  en continu et restaure vos données depuis ce fichier si le navigateur a été nettoyé.

## Sous le capot

JavaScript natif, modules ES, aucune étape de build et aucune dépendance à installer. Seuls
[Chart.js](https://www.chartjs.org/) et [marked](https://marked.js.org/) sont chargés depuis un
CDN. Thème clair et sombre automatique.

```
index.html          routeur de vues + barre latérale + réglages
css/app.css         design system
js/core.js          store localStorage, migrations, helpers partagés
js/backup.js        sauvegarde automatique dans un fichier (File System Access)
js/radar.js         radar des 8 dimensions
js/roadmap.js       objectifs et sous-objectifs
js/roadmap-io.js    import / export des objectifs
js/deliverables.js  livrables, présentation, pitch deck
js/dashboard.js     tableau de bord
js/tasks.js         tâches ponctuelles et récurrentes
js/crm.js           contacts et interactions
js/prospection.js   base marché, pilote de prospection
js/prospection-io.js  import CSV / JSON de la base marché
js/interviews.js    kanban interviews
js/calendar.js      calendrier
js/finance.js       module finance
js/ideas.js         espace idées (archivé)
data/db.example.json  jeu de démonstration chargé au premier lancement
```

Le schéma de données est versionné (`meta.schema_version`) et migré automatiquement au
démarrage, donc une mise à jour ne casse pas une base existante.

## Licence

MIT — voir [LICENSE](LICENSE). Faites-en ce que vous voulez.
