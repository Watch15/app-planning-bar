# B2 — Horizon de saisie · note de design

> **Statut : B2-a LIVRÉ le 2026-08-13.** B2-b (ergonomie patron) reste ouvert.
> Les décisions prises et ce qui a changé par rapport à cette note sont consignés au **§8**,
> qui fait autorité sur les sections antérieures.
> Ouverte le 2026-08-12 à la demande du user (« la deuxième feature, qu'on peut préparer
> sans la lancer »).
> Tout ce qui est affirmé ici sur le code existant a été **vérifié dans les fichiers**, pas
> supposé — les références (`fichier:ligne`) sont là pour être recontrôlées.

**Comment lire ce document** : §1 le besoin et l'arbitrage, §2 ce que le modèle permet
déjà (c'est la partie surprenante), §3 la seule vraie décision de modèle, §4 ce qui
casserait en silence, §5 le découpage en lots, §6 les questions à trancher **avant** le code.

---

## 1. Besoin et arbitrage

« Horizon de saisie » recouvrait trois features différentes. Arbitrage du user, 2026-08-12 :
**les deux, mais le staff d'abord.**

1. **Le staff déclare ses dispos plusieurs semaines à l'avance** — lot B2-a, prioritaire.
2. **Le patron planifie confortablement des semaines lointaines** — lot B2-b, ensuite.
3. *(Le troisième sens — déclarer une absence lointaine — n'est pas à faire : il existe
   déjà, cf. §2.5.)*

---

## 2. Ce que le modèle dit déjà — cinq constats vérifiés

### 2.1 L'horizon d'une semaine n'existe pas dans le modèle. C'est une convention du navigateur.

`POST /api/dispos` (`server.js:3283`) ne vérifie **à aucun moment** que les dates reçues
appartiennent à la semaine cible. Ses gardes sont : profil staff lié, `can_submit_dispos`,
`staffDispoOpen`, deadline. L'upsert (`server.js:3344`) écrit ce qu'on lui donne, pour
n'importe quelle date. La limite « semaine prochaine » vit **uniquement** dans
`planning.js`, qui ne construit le formulaire que pour `disposWeekStart(now)`
(`lib/utils.js:74` — « toujours la semaine suivante »).

**Deux conséquences, en sens opposés.** Élargir l'horizon ne demande **aucun changement de
schéma** : `availabilities` est keyé par `(staff_id, date)`, une date lointaine y entre sans
rien casser. Mais aujourd'hui, rien n'**empêche** non plus un client de poster une dispo pour
décembre — la règle actuelle n'est pas tenue, elle est seulement affichée.

### 2.2 Le vrai obstacle est la deadline, et elle est à valeur unique.

`computeEffectiveDeadline(custom, now)` (`server.js:3013`) rend **une seule** date : le
vendredi 13 h par défaut, ou la valeur choisie par le patron. `POST /api/dispos` refuse tout
ce qui arrive après (`server.js:3298`).

Sur un horizon multi-semaines, un staff qui veut déclarer sa dispo de la semaine N+4 un
samedi se prendrait **« La deadline est passée »**. C'est absurde : cette deadline garde la
semaine *en cours de collecte*, pas la saisie en général. C'est **la** décision de modèle du
sujet, traitée en §3.

### 2.3 La purge ne gêne pas.

`cleanupPastDispos` (`server.js:734`) supprime sur `date < lundi courant` (et `week_start <`
pour les notes). Une dispo lointaine est future : elle survit. Rien à changer.

### 2.4 Le patron peut déjà planifier loin — le moteur existe.

Les semaines futures ne sont **pas** auto-publiées (`isAutoPublished` → false au-delà de la
semaine courante), la copie de semaine vise déjà plusieurs semaines d'un coup, et la
publication est par semaine (`publish_<weekStart>`). Un patron peut donc construire N+3
aujourd'hui, invisible du staff jusqu'à publication. **B2-b n'est pas un moteur à écrire,
c'est de l'ergonomie et de la visibilité.**

### 2.5 Le long terme existe déjà — mais seulement en négatif.

F-10 (congés) stocke des **plages de dates** dans `time_off` : non purgées, valables sur tous
les établissements du staff, avec validation patron. « Je suis absent en octobre » se
déclare aujourd'hui. Ce qui manque, c'est le **positif** — « je suis disponible », « je veux
travailler ». B2-a est exactement le pendant positif d'une brique déjà livrée, et devrait
lui ressembler autant que possible plutôt qu'inventer un troisième vocabulaire.

---

## 3. La seule vraie décision de modèle : que garde la deadline ?

Trois lectures possibles. Elles ne coûtent pas la même chose et ne disent pas la même chose
au staff.

| # | Règle | Ce que ça donne | Coût |
|---|---|---|---|
| **A** | **La deadline ne garde que la semaine en cours de collecte** (N+1). Au-delà, la saisie est libre. | Le samedi, je ne peux plus toucher à N+1 — figée, le patron construit dessus — mais je peux saisir N+2…N+n quand je veux. | Faible : un test de date au lieu d'un test d'instant, au même endroit (`server.js:3298`). |
| **B** | **Une deadline glissante par semaine** : chaque semaine cible a la sienne (vendredi 13 h de la semaine précédente). | Cohérent, mais fabrique n deadlines à afficher, et rend la question « suis-je en retard ? » plus dure à formuler qu'à coder. | Moyen : `computeEffectiveDeadline` prend une semaine cible en argument ; le front affiche par semaine. |
| **C** | Statu quo : une deadline pour tout. | Bloque la feature. Éliminé. | — |

**Recommandation : A.** Elle correspond à ce que la deadline *fait déjà* (protéger la semaine
que le patron est en train de monter), elle ne multiplie pas les dates affichées, et elle
laisse B ouverte plus tard sans rien jeter — B est un raffinement de A, pas son contraire.

⚠️ **Point à ne pas perdre** : l'exemption `dispoDeadlineWaived` (directeur, `force_open`
global, réouverture nominative) doit rester **au-dessus** de cette règle, et la réouverture
nominative devra dire **pour quelle semaine** elle rouvre — aujourd'hui `force_open_staff[]`
ne porte pas de semaine (`server.js:3368`, purge à la soumission). Avec un horizon long,
rouvrir « pour Kevin » deviendrait ambigu.

---

## 4. Ce qui casserait en silence si on élargit sans y toucher

C'est la partie utile de cette note : **rien de tout ça ne lèverait d'erreur.**

| Point | Ce qui se passe | Où |
|---|---|---|
| 🔴 **La pastille de la file** | `GET /api/dispos/count` n'a **aucune borne de date** — il compte tous les `pending`. La file, elle, est bornée par `from`/`to`. Avec 6 semaines saisies : la pastille annonce 40, la file en montre 7. **C'est l'asymétrie exacte que S-04 a déjà corrigée une fois sur l'axe du périmètre**, qui revient sur l'axe du temps. | `server.js:3423` vs `:3402` |
| 🟠 **Le cron de rappels** | `checkDispoRappels` sollicite `disposWeekStart(now)` et ne part que si la semaine cible **et** la semaine en cours sont publiées. Avec un horizon long, il faut décider ce qu'il rappelle : la semaine en collecte uniquement (recommandé — sinon on harcèle pour des semaines qu'on a le droit de laisser vides), ou l'horizon entier. | `server.js:584-620` |
| 🟠 **La semaine-type directeur** | Elle matérialise **une** semaine, au déclenchement de la deadline (décision du 2026-08-10, à ne pas défaire). Si l'horizon s'allonge, elle reste sur N+1 — cohérent avec la règle A, mais à écrire noir sur blanc, sinon quelqu'un « corrigera » l'écart. | `materializeAllManagerTemplates` |
| 🟠 **La note de semaine** | `week_note` est keyée par `week_start` : elle suit déjà. Mais le formulaire n'en affiche qu'une — sur n semaines, il en faut n, ou aucune. | `planning.js:1594` |
| 🟢 **KPI de complétion (F-11)** | `GET /api/dispos/kpi?from&to` est déjà paramétré par plage et suit la semaine affichée. Rien à faire. | — |
| 🟢 **Préremplissage** | `/api/dispos/previous?week_start=` calcule la semaine précédente **relativement à la semaine demandée** : il marche déjà pour n'importe quelle semaine. | `server.js:3158` |
| 🟢 **Purge** | cf. §2.3. | — |

---

## 5. Découpage proposé

**Lot B2-a — le staff saisit loin** (la feature)
1. Trancher §3 (règle de deadline) et §6.
2. Serveur : la deadline ne garde que la semaine en collecte ; **borner l'horizon** côté
   serveur (`POST /api/dispos` refuse au-delà de N+n) — c'est le moment de fermer le trou
   §2.1, pas plus tard.
3. Serveur : borner `GET /api/dispos/count` sur la même plage que la file.
4. Front `planning.js` : le formulaire devient multi-semaines (navigation, pas n formulaires
   empilés), une note de semaine par semaine.
5. Tests : deadline par semaine, borne d'horizon, alignement pastille/file.

**Lot B2-b — le patron pilote loin** (l'ergonomie)
6. Navigation et repères visuels sur les semaines lointaines ; KPI de complétion sur une
   semaine non adjacente ; ce que voit le staff d'une semaine future non publiée.
7. Rien de neuf côté moteur (cf. §2.4).

---

## 6. Questions à trancher avant d'écrire du code

1. **Quel `n` ?** 4 semaines, 8, « jusqu'à la fin du mois suivant » ? Un horizon infini est
   plus simple à coder et plus dur à vivre : il fait entrer des dispos qu'on n'utilisera
   jamais dans une file que quelqu'un doit vider à la main.
2. **Une dispo lointaine arrive-t-elle dans la file de validation tout de suite, ou
   seulement quand sa semaine entre en collecte ?** À mon sens **seulement à ce moment-là** —
   sinon le patron valide en août des dispos d'octobre qui auront changé. Mais alors
   `status: 'pending'` ne suffit plus à décrire l'état : il faut distinguer « déposée » de
   « à valider maintenant ». **C'est le seul endroit où B2 pourrait toucher au modèle** — et
   la raison de poser la question avant, pas pendant.
3. **Le staff peut-il modifier une dispo lointaine déjà déposée ?** Oui a priori (l'upsert le
   permet déjà), mais si elle a été validée entre-temps, la re-soumission la repasse en
   `pending` — comportement actuel, à confirmer comme voulu sur un horizon long.
4. **Faut-il tracer ces dépôts ?** F-12 (journal d'audit des dispos) devient plus utile avec
   un horizon long : plus le dépôt est ancien, plus « j'avais mis dispo » est difficile à
   arbitrer. Les deux features se renforcent ; à séquencer, pas à fusionner.

---

## 7. Rappels de méthode pour l'implémentation

- **`fake-db` est un sous-ensemble de Mongo** : une lacune par session de code depuis six
  sessions (la dernière, `$options`, le 2026-08-12). Prévoir d'en trouver une.
- **Non-vacuité par mutation, systématiquement.** Sur F-14, **3 tests sur 15 étaient vacants**
  à la première écriture : verts, lisibles, et ne prouvant rien — dont un rendu inobservable
  par une **seconde garde en amont**. Les gardes de deadline sont exactement ce profil
  (plusieurs conditions en série sur le même chemin) : les casser **une par une**.
- **Rien ne teste le front.** `planning.js` n'a aucune couverture ; tout ce qui peut sortir en
  helper pur va dans `public/lib/` (UMD), testable le jour même — c'est le chemin ouvert par
  A-14 (cf. T-03).

---

## 8. Décisions et livraison de B2-a (2026-08-13)

**Ce §8 fait autorité** sur les sections antérieures quand elles divergent.

### 8.1 Réponses aux questions du §6

| # | Question | Réponse du user |
|---|---|---|
| 1 | Quel `n` ? | **Réglable par le patron**, pas de constante. Écrêté à 12 semaines côté serveur (`DISPO_HORIZON_MAX`) — un horizon infini fait entrer dans la file des dispos qui auront changé avant d'être utilisées. |
| 2 | Une dispo lointaine entre-t-elle dans la file tout de suite ? | **Selon le choix du patron**, via un **second** réglage : `X` = jusqu'où le staff saisit, `Y` = jusqu'où la file de validation remonte, avec **Y ≤ X**. |
| 3 | Modifier une dispo lointaine déjà validée ? | Comportement actuel (retour en `pending`) **+ le shift déjà créé est libéré** (cf. 8.3). |
| 4 | Tracer ces dépôts ? | **Séquencé, pas fusionné** : F-12 reste un lot à part. |

### 8.2 Rectification du §6 question 2 — B2 ne touche PAS au modèle

Le §6 affirmait que distinguer « déposée » de « à valider maintenant » exigerait un
nouveau statut, et que **c'était le seul endroit où B2 pouvait toucher au modèle**.
**C'est faux, et vérifié dans le code** : la file est bornée par `from`/`to` depuis
toujours (`server.js:3402`). « À valider maintenant » = `pending` **et** date dans la
fenêtre de validation — entièrement **dérivable de la date**. Aucun champ, aucun statut,
aucune migration. Le seul vrai travail était d'aligner `count`, qui était déjà au
programme comme le 🔴 du §4.

### 8.3 Ce qu'un shift devient quand sa dispo validée change

Question posée parce que la réponse initiale (« supprime les shifts ») aurait fait
**disparaître un poste en silence** d'une semaine peut-être déjà publiée. Décision
retenue, identique à celle prise en **F-14** pour le même problème (un shift dont le
titulaire s'en va) : le créneau **repasse en Joker** — le poste était tenu, il reste à
pourvoir — et `notifyPatrons` l'annonce.

Trois conditions cumulées pour libérer, et la troisième est celle qui compte :
la dispo était `confirmed`, elle porte un `establishment_id`, et la re-soumission
**diffère matériellement** (`dispoMateriallyDiffers` — type/horaires, **pas** la note).
Sans ce dernier test, un staff qui rouvre son formulaire et renvoie sans rien changer se
dé-planifierait tout seul.

Deux garde-fous : un shift **pointé** (`real_start`/`real_end`) n'est jamais touché — ce
sont des heures travaillées, donc de la paie ; un Joker l'est déjà.

⚠️ **Limite assumée, à ne pas perdre** : rien ne relie un shift à la dispo qui l'a fait
naître. On le retrouve par le triplet `(staff_id, date, establishment_id)`, celui-là même
dont `PATCH /api/dispos/:id/confirm` se sert pour son idempotence. Un shift créé **à la
main** par le patron sur ce triplet est donc indiscernable et sera libéré lui aussi. Poser
un `dispo_id` sur les shifts lèverait l'ambiguïté, mais ne vaudrait que pour les shifts
créés APRÈS la migration : la déduction resterait nécessaire de toute façon.

### 8.4 Deadline : règle A retenue

Conforme à la recommandation du §3. La deadline ne garde plus que la semaine **en cours de
collecte** (N+1). Un lot **partiellement** figé n'est plus refusé en bloc : les jours de
N+1 sont retirés, le reste est enregistré, et le compte rendu annonce ce qui n'est pas
passé — même choix qu'en F-14, où refuser 40 shifts pour un seul archivé aurait été
hostile. Un lot **entièrement** dans la semaine figée rend toujours 403 avec le message
d'avant B2. `dispoDeadlineWaived` reste au-dessus de tout.

**Non fait, et toujours ouvert** : la réouverture nominative (`force_open_staff[]`) ne
porte **pas** de semaine. Rouvrir « pour Kevin » sur un horizon long reste ambigu — le §3
le signalait, B2-a ne l'a pas traité.

### 8.5 Ce qui a été livré

- `public/lib/week.js` — `disposHorizonRange`, `disposHorizonMondays`, `clampHorizonWeeks`,
  `DISPO_HORIZON_MAX`. `toDateStr` et `disposWeekStart` y ont **migré** depuis
  `lib/utils.js` : B2 en a besoin côté navigateur, et `script.js` en portait déjà une copie
  manuelle dont le commentaire disait qu'elle rejouait le serveur.
- **La garantie structurelle** : la borne de saisie (serveur), la pastille (serveur) et la
  file (navigateur) sortent toutes du **même** `disposHorizonRange`. L'asymétrie de S-04,
  revenue sur l'axe du temps, ne peut plus revenir par recalcul divergent.
- Le **trou du §2.1 est fermé** : `POST /api/dispos` refuse désormais hors horizon, y
  compris les dates passées.
- Index `availabilities` étendu à `{status, staff_id, date}` (ordre ESR). ⚠️ L'ancien
  `status_1_staff_id_1` en devient un préfixe redondant : à dropper à la main en prod.
- 27 tests (`tests/dispos-horizon.test.js`), **non-vacuité vérifiée par mutation sur les
  7 gardes, une par une** — chacune fait tomber au moins un test.

### 8.6 La lacune de `fake-db` de cette session — la 7e

Annoncée par le §7, trouvée : `find().toArray()` et `findOne()` rendaient les **objets
stockés**, pas des copies. Un vrai driver Mongo désérialise le BSON à chaque lecture, donc
rend toujours un document détaché. Invisible tant qu'on ne fait que lire ; **mensonger dès
qu'une route relit un état AVANT de le réécrire** — exactement ce que fait B2 pour savoir
si une dispo a changé. L'upsert mutait l'instantané en place, et **trois tests échouaient
sur du code pourtant correct en prod**.

Comblée (copie superficielle des deux méthodes). Le code de production a été corrigé
**aussi**, indépendamment : il ne retient plus le document mais un instantané des seuls
champs comparés — dépendre de l'identité d'objet était fragile quel que soit le driver.

**À noter pour les prochaines sessions** : cette lacune-là ment dans le sens *bénin*
(test rouge sur code juste). Les six précédentes mentaient dans le sens inverse.
