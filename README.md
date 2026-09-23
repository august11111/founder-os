# Founder OS

Un tableau de bord local pour piloter un projet entrepreneurial : objectifs, tâches, CRM,
interviews, finances et pitch deck, réunis dans une seule page.

Pas de compte, pas de serveur, pas d'abonnement. **Toutes vos données restent dans votre
navigateur (localStorage), rien n'est envoyé nulle part.**

## Lancer l'application

L'app charge ses fichiers par `fetch`, il lui faut donc un petit serveur local —
ouvrir `index.html` directement en `file://` ne fonctionne pas.

```bash
git clone https://github.com/august11111/founder_os.git
cd founder_os
python -m http.server 8000
```

Puis ouvrez **http://localhost:8000** dans votre navigateur.

N'importe quel serveur statique fait l'affaire (`npx serve`, l'extension Live Server de
VS Code…). Le dépôt inclut aussi `server.py`, et sous Windows `launch-founder-os.ps1` qui
démarre le serveur et ouvre le navigateur d'un coup.

Au premier lancement, une roadmap de démonstration et quelques contacts fictifs sont chargés
pour que rien ne soit vide. Supprimez-les et remplacez-les par les vôtres.

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

**Interviews** — un kanban pour suivre les entretiens utilisateurs, de « à contacter » à
« analysé », avec les verbatims.

**Livrables et pitch deck** — de petits jeux de slides en markdown qui documentent le résultat
d'un objectif, avec mode présentation plein écran et export PDF. Le pitch deck se compose en
piochant des slides dans les livrables.

**Finance** — prévisionnel, scénarios, plan de recrutement, comparaison réel / prévu.

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
