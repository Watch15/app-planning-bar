# Dossier projet — Templyo

> **À quoi sert ce document.** Les autres fichiers de `docs/` décrivent le *code*.
> Celui-ci décrit le **projet** : le produit, le client, les environnements, la façon dont
> une livraison atteint la production, ce qui est en cours et ce qui est volontairement
> gelé. C'est le document à lire — ou à donner à un assistant — pour répondre à une
> question qui n'est pas une question de code.
>
> **État au 2026-08-14.** Les faits chiffrés ci-dessous ont été vérifiés contre le dépôt à
> cette date (`git log`, `npm test`, `wc -l`). Tout ce qui est daté plus anciennement est
> signalé comme tel.

---

## 1. Le produit en une page

**Templyo** est une application web de gestion de plannings pour bars et restaurants
**multi-établissements**. Elle s'adresse à un patron qui gère plusieurs adresses avec une
équipe partagée entre elles.

Le cycle métier qu'elle outille, dans l'ordre :

1. **Le patron ouvre la saisie des disponibilités** pour une ou plusieurs semaines à venir.
2. **Chaque employé déclare ses disponibilités** depuis son téléphone (PWA installable).
3. **Le patron valide** les disponibilités et **construit le planning** en glissant les
   personnes sur une timeline horaire, établissement par établissement.
4. **Il publie la semaine.** Tant qu'elle n'est pas publiée, l'équipe ne la voit pas.
5. **Le soir même, les heures réelles sont pointées** — soit par un compte dédié à
   l'établissement, soit par le responsable de la soirée depuis son propre téléphone.
6. **Le patron pilote l'économie** : chiffre d'affaires quotidien, masse salariale,
   coefficient brut et chargé, récapitulatif mensuel exportable.

Deux notions produit reviennent partout et méritent d'être connues avant tout le reste :

- **Le Joker** — un créneau à pourvoir sans titulaire. Le patron le pose sur le planning
  comme un shift normal, sauf qu'il n'est affecté à personne. S'il l'ouvre au staff, les
  employés peuvent se porter candidats et le patron tranche. C'est le mécanisme qui absorbe
  les trous de dernière minute.
- **La publication** — une semaine est soit publiée (l'équipe la voit), soit un brouillon
  (l'équipe ne la voit pas). **La semaine en cours et toutes les semaines passées sont
  publiées d'office**, sans aucune action ni aucun réglage : seules les semaines **futures**
  se publient à la main. Cette asymétrie explique la quasi-totalité des questions
  « pourquoi mon équipe ne voit pas ça ».

---

## 2. Qui utilise l'application

| Rôle | Écran principal | Ce qu'il fait |
|---|---|---|
| **patron** | `index.html` | Tout. Plannings, staff, réglages, paie, tous les établissements |
| **directeur** | `index.html` | Comme le patron, **mais borné aux établissements qui lui sont assignés** |
| **staff** | `planning.html` | Consulte son planning, envoie ses dispos, pose des congés, se porte candidat aux Jokers |
| **etablissement** | `pointage.html` | Compte par lieu, sans identité personnelle — saisie des heures réelles et du CA du soir |
| **observateur** | `index.html` | Administre staff, comptes, établissements et pointage — mais **ne touche pas au planning** |

**Trois subtilités qui piègent régulièrement :**

- **« Observateur » ne veut pas dire lecture seule.** Le nom le laisse croire, le code dit
  autre chose : il a les droits d'administration (staff, comptes, établissements, pointage)
  et il en est écarté sur deux points précis — les écritures de planning (shifts,
  publication, validation des disponibilités) et le changement de rôle d'un autre compte,
  réservé au patron pour éviter une escalade de privilèges. À vérifier avant d'attribuer ce
  rôle à quelqu'un à qui on ne veut vraiment rien laisser modifier.

- **Un directeur est aussi un employé** (décision E-22, juillet 2026). Il a un vrai profil
  `staff`, il pose ses disponibilités **dans le même circuit que l'équipe**, et le patron
  les valide comme les autres. Ce n'était pas vrai avant : le modèle précédent (E-19)
  posait qu'un directeur n'était jamais planifiable. **La documentation antérieure au
  2026-08-05 affirme le contraire de ce que fait le code** — c'est corrigé dans
  `docs/design-e22-dispos-directeur.md`, qui fait autorité sur ce point.
- **Le responsable de soirée n'est pas un rôle de compte**, c'est un attribut de shift. Un
  employé désigné responsable sur une soirée obtient, ce soir-là, un onglet supplémentaire
  qui lui montre son équipe et lui permet de pointer les heures — sans qu'on lui donne un
  compte de niveau supérieur.

---

## 3. Où le produit tourne — et qui a quelle version

C'est le point le plus souvent mal compris du projet, donc il vaut la peine d'être posé en
entier.

### La topologie réelle

| Environnement | Service Railway | Dépôt / branche | Cluster Mongo | Base | `NODE_ENV` |
|---|---|---|---|---|---|
| Recette | `Dev` (env. Dev) | `app-planning-bar` / **dev** | `vab3u2w` | `templyo_dev` | development |
| Pré-production | `Dev` (env. Prod) | `app-planning-bar` / **main** | `vab3u2w` | `templyo_main` | production |
| **Production client** | `Castaniu Family` | **`app-planning-bar-castaniu-family`** / main | `gqfynu8` | `gestion_bar` | production |
| **Démonstration** | *(service dédié, créé le 2026-08-31)* | `app-planning-bar` / **main** | `vab3u2w` | `templyo_demo` | production |

> ⚠️ **Le service de pré-production s'appelle aussi « Dev ».** Deux services portent ce nom
> dans deux environnements différents. Se fier au nom seul mène à l'erreur ; se fier au
> couple (environnement, service).

### Le service de DÉMONSTRATION (2026-08-31)

Quatrième service Railway, dédié aux rendez-vous prospects. Il sert le jeu de
`scripts/seed-demo.js` (cf. backlog) : 1 bar + 1 restaurant, 26 personnes, ~2 mois
d'historique pointé.

**⚠️ Le piège numéro un : les deux garde-fous valent `true` par DÉFAUT.**

```js
const OUTBOUND_ENABLED = process.env.OUTBOUND_ENABLED !== 'false';   // server.js:117
const CRON_ENABLED     = process.env.CRON_ENABLED     !== 'false';   // server.js:132
```

Un service fraîchement créé qui ne les pose pas **peut joindre de vraies personnes** :
les clés Twilio / Resend / VAPID sont partagées entre les environnements (A-02), elles
sont donc actives dès le premier démarrage. Une invitation envoyée devant un prospect,
ou un rappel de dispos déclenché par le cron, part **pour de vrai**. C'est la même
classe de problème qu'A-03 sur `dev`, mais sur une instance dont on va justement
cliquer partout en direct.

**Variables à poser sur le service de démo**

| Variable | Valeur | Pourquoi celle-là |
|---|---|---|
| `MONGO_URI` | cluster `vab3u2w` | même cluster que dev/main, base séparée |
| `MONGO_DB` | `templyo_demo` | **LA ligne qui protège les données.** Absente, le défaut est `gestion_bar` — la base client |
| `NODE_ENV` | `production` | Railway sert en HTTPS : il faut `cookie.secure` + `trust proxy`. C'est la seule différence avec `.env.demo`, qui vise `development` parce que localhost est en http |
| `OUTBOUND_ENABLED` | `false` | **obligatoire** — cf. ci-dessus |
| `CRON_ENABLED` | `false` | `cleanupPastDispos` supprime, et `materializeAllDispoTemplates` créerait des dispos au passage de la deadline : le jeu de démo se déformerait tout seul entre deux rendez-vous |
| `SESSION_SECRET` | **propre au service** | ne pas recopier celui de `dev` (A-02) : une instance à comptes publics ne doit pas partager sa clé de signature |
| `SEED_PASSWORD` | **pas `Demo2026!`** | le défaut du script. Sur une instance publique, 27 comptes derrière un mot de passe deviné = accès libre. À changer, et à repasser au seed |
| `APP_URL` | domaine Railway de la démo | liens d'invitation et URL de calendrier |
| `TZ` | `Europe/Paris` | comme les autres services |

**Ne PAS poser** : `ALLOW_TEST_AUTH` (le serveur refuse de démarrer hors `NODE_ENV=test`,
`server.js:161` — c'est voulu), et `PATRON_EMAIL` / `PATRON_PASSWORD` (code mort, A-04).

**Trois points de câblage à ne pas rater**

1. **Commande de démarrage : `npm start`, pas `node server.js`.** `npm start` substitue
   `%%BUILD_TIME%%` dans `public/sw.js` ; sans lui le service worker garde un marqueur
   littéral et la mise à jour automatique de la PWA ne se déclenche jamais.
2. **Laisser le déploiement auto Railway ACTIF sur ce service.** CD-01
   (`.github/workflows/ci.yml`) ne déploie qu'**un seul** service, celui nommé dans
   `vars.RAILWAY_SERVICE` ; il ne connaît pas la démo. Corollaire assumé : la démo se
   déploie sans attendre que la CI soit verte — c'est acceptable ici, ça ne le serait
   pas en prod.
3. **Le seed se lance depuis le poste**, pas depuis Railway : `npm run demo:seed` écrit
   dans `templyo_demo` sur Atlas, la même base que lit le service. Rien à installer
   côté Railway. À relancer avant chaque rendez-vous — le jeu est calculé relativement
   à *aujourd'hui*, il se décale d'un jour par jour.

**Ce qui reste à arbitrer** : le service de démo partage le cluster `vab3u2w` avec la
recette ET la pré-production. Si l'utilisateur Mongo est le même, compromettre
l'instance publique donne accès à `templyo_main`. Un utilisateur Atlas dédié, restreint
à la seule base `templyo_demo`, fermerait la question — 5 minutes, et c'est le seul
service des quatre qui soit à la fois public et peuplé de comptes à mot de passe connu.

### Le fait structurant : le client est sur un dépôt séparé

Le client tourne sur un **fork** (`app-planning-bar-castaniu-family`), pas sur une branche
du dépôt principal. Cela a deux conséquences opposées, et les deux comptent :

- **Rassurante** — merger `dev` → `main` sur le dépôt principal **n'atteint pas le client**.
  Il n'y a pas de déploiement client accidentel possible par un merge de routine.
- **Inquiétante** — **aucun correctif ne lui parvient automatiquement**. Chaque livraison
  client est un `git push castanui main:main` explicite, décidé. Un correctif de sécurité
  qui n'est pas poussé à la main ne l'atteint jamais.

### Qui a quoi, au 2026-08-14

| Cible | Commit | Contenu |
|---|---|---|
| `dev` | `c8b5d8f` | + ergonomie mobile de « Gestion du staff » en portrait |
| `main` | `d68d238` | tout le lot B2 / F-12 / F-15 |
| **client** | `d68d238` | **à jour avec `main`** |

Le client a été mis à niveau le 2026-08-14 après une longue période de retard (il tournait
auparavant sur `29bc8822`, sans les correctifs de sécurité S-01→S-04). Le seul écart actuel
est le correctif d'ergonomie mobile, resté sur `dev`.

### Les bases de données — la distinction à ne jamais perdre

- `templyo_dev` et `templyo_main` sont des **bases de recette**. Elles portent 6 comptes de
  test en `@templyo.test`, tous avec le même mot de passe (`SEED_PASSWORD`,
  `Templyo2026!` par défaut). On peut y écrire, les vider, les resemer.
- **`gestion_bar` est la base du client.** Vraies personnes, vrais salaires, vrai
  historique. Aucun compte `@templyo.test` n'y existe.

> 🔴 **Le piège numéro un du projet.** `gestion_bar` est la valeur **par défaut** du serveur
> quand la variable `MONGO_DB` est absente. Un `node server.js` lancé sans préciser la base
> se branche donc sur la base client — et crée même ses index au passage. Toujours viser la
> base explicitement.

Ce piège a une contrepartie utile : `scripts/smoke.js` se connecte avec les comptes
`@templyo.test`. Visant une base client par erreur, il s'arrête à la première étape sans
rien écrire. **Corollaire à connaître : il n'existe aucune vérification automatisée
possible après une livraison client.** La validation chez le client est manuelle, par
construction.

---

## 4. Comment une livraison atteint la production

Décidé le 2026-08-05, sur une phrase du patron : *« Il faut attendre que les corrections
soient validées dans l'environnement dev pour atteindre le client. »*

**Trois étages, chacun avec sa porte de sortie :**

| Étage | Cible | Ce qu'on y prouve | Porte |
|---|---|---|---|
| 1 · `dev` | `dev.templyo.fr` | la fonctionnalité marche | `npm test` + `npm run smoke:dev` |
| 2 · `main` | `…-production.up.railway.app` | elle marche **en conditions de production** (`NODE_ENV=production`, cookies `secure`, CORS strict) | `npm run smoke:main` |
| 3 · client | `castaniu-family.templyo.fr` | — | **accord explicite et daté du patron** |

L'étage 2 n'est pas décoratif : c'est le seul endroit où l'on éprouve `NODE_ENV=production`
avant le client — et c'est précisément la variable qui avait été mal réglée chez lui.

### La règle de l'étage 3

**Aucun déploiement client sans accord explicite pour ce déploiement-là.** Consigne donnée
le 2026-08-05 et toujours en vigueur. Un accord passé ne vaut pas pour le suivant. La
raison n'est pas la prudence de principe : c'est que le CLI Railway **n'expose pas** la
branche source d'un service, donc on ne peut pas vérifier depuis le code ce qu'un push
déclenche. Dans le doute, on ne pousse pas.

### Une livraison client n'est pas toujours un push

Certains lots exigent une **migration de données**. Le cas déjà rencontré : E-22 exige que
tout compte `directeur` porte un profil `staff` lié, sinon le directeur ne peut plus saisir
de disponibilité (erreur 400 permanente). L'outil est `npm run link-directors`
(`scripts/link-director-staff.js`) : rapprochement par e-mail puis par nom normalisé,
**simulation par défaut**, `--apply` pour écrire, et abstention pure quand le résultat est
ambigu.

> **Ce que cet épisode a appris, et qui vaut au-delà de lui.** Un premier script
> (`backfill-directors`) créait le profil *puis* vérifiait. Il a fabriqué un **second**
> profil à des directeurs qui travaillaient déjà en salle : barre staff dédoublée,
> historique de shifts scindé, personnes **comptées deux fois en masse salariale** — sur 2
> directeurs sur 3 chez le client. Le remplaçant trie **avant** d'écrire : le doublon n'est
> pas interdit, il est *inexprimable*. Le script fautif a été supprimé du dépôt, avec son
> entrée `package.json` — une interdiction qui ne vit que dans un document finit par être
> contournée par quelqu'un de pressé.

---

## 5. Les garde-fous d'exploitation

Ce que quelqu'un qui touche à l'exploitation doit savoir avant d'agir.

| Sujet | La règle |
|---|---|
| **Base par défaut** | `MONGO_DB` absent ⇒ `gestion_bar`, la base client. Toujours viser explicitement |
| **Scripts destructifs** | Ils refusent `gestion_bar` sans `--force`. Ne pas contourner |
| **Smoke** | Ne peut pas tourner chez le client (comptes de recette absents). C'est voulu |
| **Cache navigateur** | Le token `%%BUILD_TIME%%` de `sw.js` n'est substitué que par `npm start`. Lancé par `node server.js`, le Service Worker sert indéfiniment l'ancien JS — on croit le code faux alors qu'il ne tourne pas |
| **Clés VAPID (push)** | Partagées entre environnements. Les faire tourner **casse toutes les souscriptions push** de l'autre environnement : réabonnement obligatoire de chaque employé |
| **Twilio / Resend** | Comptes **volontairement partagés** — Templyo est l'émetteur pour tous ses clients. Ce n'est pas une fuite, c'est le modèle. *(Précisé par le client le 2026-08-05.)* |
| **`dev` peut joindre de vraies personnes** | Constat A-03. Un envoi déclenché en recette part réellement si les numéros/adresses de test n'en sont pas |
| **Limiteur de connexion** | En mémoire, 10 tentatives / 15 min / IP. Un redémarrage vide le compteur — plus rapide qu'attendre |

---

## 6. Ce qui a été livré récemment

Chronologie courte des trois derniers lots. Le détail exhaustif — y compris les décisions
écartées et les erreurs corrigées — vit dans `docs/backlog.md`.

### Août 2026 — l'horizon de planification (lot « B2 »)

Le changement le plus visible pour le client depuis longtemps. Avant, l'équipe ne pouvait
déclarer ses disponibilités **que pour la semaine suivante**.

- **Deux réglages patron** : `X` = jusqu'où l'équipe peut saisir, `Y` = jusqu'où le patron
  valide, avec `Y ≤ X`, plafonnés à 12 semaines. **Tous deux valent 1 par défaut**, ce qui
  reproduit exactement le comportement d'avant — c'est ce qui a permis de livrer chez le
  client **sans aucune migration**.
- **Une semaine publiée ne bouge plus dans le dos du patron** : l'équipe ne peut plus y
  modifier ses disponibilités. Le patron, lui, garde la main partout, et peut **rouvrir la
  saisie pour une personne et une semaine précises**.
- **Un changement de disponibilité ne casse plus un planning en silence** : le shift déjà
  attribué **repasse en Joker** au lieu d'être supprimé, et le patron est prévenu. Jamais si
  le shift est déjà pointé — la paie prime.
- **« Tout confirmer »** valide les disponibilités en attente de la semaine affichée.

### Août 2026 — le journal d'audit des disponibilités (F-12)

Demandé pour un besoin très concret : trancher un litige *« j'avais dit que j'étais dispo »
/ « non »*. Collection **append-only** `dispo_events`, une ligne par changement, avec
l'auteur et l'horodatage, consultable dans un onglet **Historique** en lecture seule —
l'absence de tout bouton d'action est précisément ce qui lui donne sa valeur de preuve.

**Conservation : 3 ans**, calée sur la prescription des créances de salaire, c'est-à-dire la
fenêtre pendant laquelle le litige devient chiffré. Durée, finalité et accès sont consignés
dans `politique-confidentialite.html`.

### Août 2026 — l'archivage d'un membre du staff (F-13 / F-14)

Un départ n'efface plus les heures travaillées : elles restent dans les récapitulatifs
mensuels. En contrepartie, une personne archivée **ne réapparaît par aucune des six portes**
qui la réintroduisaient auparavant dans les écrans de planification.

---

## 7. Ce qui est en cours ou en attente

| Sujet | État |
|---|---|
| **Ergonomie mobile « Gestion du staff »** | Livré sur `dev` (`c8b5d8f`), **pas chez le client**. Cibles tactiles portées à 44 px et grille des jours de repos restructurée en portrait. Non vérifiable par les tests (aucune couverture DOM/CSS) — demande un vrai téléphone |
| **Maquettes Stitch** | 32 écrans à générer dans le projet Stitch « Templyo ». La génération par l'outil automatisé échoue ; les prompts sont prêts à coller à la main |
| **E-21 — environnement de démonstration** | Réflexion faite, **aucun code**. Recommandation : démo pilotée en visio d'abord, bac à sable qui se réinitialise seul, et un drapeau `DEMO_MODE` qui coupe **tout** envoi sortant (SMS, push, e-mail). Le vrai travail est le jeu de données, pas l'infrastructure |
| **E-08 — multi-tenant** | Non commencé. Aujourd'hui, un client = une instance + une base. Conditionné à un volume de 20-25 clients |

**Une fonctionnalité est livrée mais volontairement éteinte** — la rencontrer dans le code
ne signifie pas qu'elle existe pour l'utilisateur :

- **F-09 — abonnement agenda iCal.** Livré puis désactivé (`CALENDAR_ENABLED=false`) : la
  synchronisation n'est pas temps réel, ce qui la rendait trompeuse. À roder sur `dev` avant
  toute réactivation.

**F-05 — échange de shifts entre employés** a quitté cette liste le **2026-09-03** : elle est
**active sur `dev` et sur l'instance de démonstration**, pour être montrée au client. Elle
n'est **pas** livrée en production client — c'est justement la démonstration qui doit décider
si elle l'est.

---

## 8. Données personnelles

L'application traite des données de salariés. Les points à connaître pour répondre à une
question RGPD sans ouvrir le code :

- **Journal des disponibilités** — conservation **3 ans** (index TTL de 1095 jours, vérifié
  en base), finalité probatoire en cas de litige employeur ↔ salarié. Déclaré dans la
  politique de confidentialité.
- **Numéros de téléphone** — visibles par le responsable de soirée pour son équipe du soir
  uniquement, et par le patron/directeur dans son périmètre.
- **Flux agenda iCal** — la route publique authentifiée par jeton n'expose **que** les shifts
  du salarié concerné, et uniquement sur des semaines publiées. Fonctionnalité actuellement
  désactivée.
- **Page légale** — `public/politique-confidentialite.html`.

---

## 9. Identité visuelle et design

- **Design system existant** — tokens de couleur et typographie dans `public/style.css`,
  audit page par page dans `docs/ux-design.md`.
- **Maquettes** — projet **Stitch** nommé « Templyo » (`projects/1566056371727753320`),
  design system `assets/8afbad9c2db04a5a9965ed6a0864be67`. Contenu au 2026-08-14 : 20
  écrans, dont **14 explorations de logo** (mascotte éléphant) et seulement 2 écrans d'app
  réels. L'essentiel de l'inventaire reste à produire.
- **Contrainte technique qui déborde sur le design** : la politique de sécurité du contenu
  (CSP) interdit tout `<script>` inline dans une page. Tout JavaScript vit dans un fichier
  `.js` servi en statique, sinon il est **silencieusement** bloqué.
- **Ergonomie mobile** : cible tactile minimale de 44 px, et taille de police de 16 px sur
  les champs de saisie — en dessous, iOS zoome automatiquement à la mise au point.

---

## 10. Comment lire les identifiants du backlog

Le backlog nomme tout par un préfixe. Sans cette table, il est illisible.

| Préfixe | Signifie | Exemple |
|---|---|---|
| **B-** | Bug bloquant (priorité 1) | B-04 barre staff mobile |
| **E-** | Amélioration (priorité 2) | E-22 directeurs planifiables |
| **F-** | Nouvelle fonctionnalité (roadmap) | F-12 journal d'audit |
| **B2-a…d** | Sous-lots de l'horizon de saisie | B2-d une seule porte de lecture |
| **D-** | Journal des livraisons — ce qui *a été* fait | D-72 agenda iCal |
| **S-** | Faille de sécurité | S-04 périmètre de la file de dispos |
| **R-** | Constat de revue de code (dette, risque) | R-04 découper `server.js` |
| **A-** | Constat d'audit (infrastructure, code, recette) | A-01 le client est sur un fork |
| **T-** | Trou de couverture de test | T-03 zéro test sur le front |
| **DOC-** | Contradiction relevée dans la documentation | DOC-01 le PRD contredisait le code |

---

## 11. Où trouver le détail

| Question | Fichier |
|---|---|
| Que fait le produit, écran par écran ? | `docs/prd.md` |
| Comment c'est construit, quelles contraintes techniques ? | `docs/architecture.md` |
| Je reprends le code, par où je commence ? | `docs/onboarding.md` |
| Pourquoi telle décision a été prise ? Qu'est-ce qui reste ? | `docs/backlog.md` *(volumineux, mais c'est la mémoire du projet)* |
| Comment on travaille, quelle CI/CD ? | `docs/methodologie-et-cicd.md` |
| L'horizon de saisie, en détail | `docs/design-b2-horizon-saisie.md` — **§8 fait autorité** |
| Les disponibilités des directeurs, en détail | `docs/design-e22-dispos-directeur.md` — **§8 et §9 font autorité**, les sections antérieures sont marquées supersédées |
| Quoi annoncer au client | `docs/note-client-mise-a-jour.md` |
| Audit ergonomique page par page | `docs/ux-design.md` |
| Installation, variables d'environnement, routes API | `README.md` |

> **Un avertissement sur la lecture des documents de design.** `design-b2-horizon-saisie.md`
> et `design-e22-dispos-directeur.md` sont écrits **en couches** : une note de préparation,
> puis ce que la réalisation a démenti. Les passages annulés sont **conservés et barrés**
> plutôt qu'effacés — les supprimer supprimerait la trace qu'une décision a été prise puis
> abandonnée. Toujours lire la section la plus récente en premier.

---

## 12. Chiffres du dépôt au 2026-08-14

Pour situer les ordres de grandeur, pas pour être appris par cœur.

| Élément | Valeur |
|---|---|
| `server.js` | 6 281 lignes, 118 routes — monolithique, découpage volontairement reporté |
| `public/script.js` | 9 533 lignes — console patron, monolithique par décision |
| `public/planning.js` | 2 635 lignes — espace staff |
| Tests | **366**, 16 fichiers, `node --test`, zéro dépendance de framework |
| Dépendances de production | 10 |
| Couverture du front | **zéro** (constat T-03) — aucun test DOM, aucun test navigateur |

**Ce que les tests ne prouvent pas**, et qu'il faut avoir en tête avant de dire « c'est
vert » : le faux MongoDB des tests d'intégration (`tests/helpers/fake-db.js`) est un
sous-ensemble de la vraie API. **Dix lacunes** y ont déjà été découvertes à l'usage, dont
certaines rendaient des routes entières intestables sans que personne ne s'en aperçoive. Le
seul niveau qui exerce un vrai MongoDB est `npm run smoke`, et il ne peut pas tourner chez
le client.
