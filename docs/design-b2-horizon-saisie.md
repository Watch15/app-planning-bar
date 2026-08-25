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
| 🟠 **La semaine-type** | Elle matérialise **une** semaine, au déclenchement de la deadline (décision du 2026-08-10, à ne pas défaire). Si l'horizon s'allonge, elle reste sur N+1 — cohérent avec la règle A, mais à écrire noir sur blanc, sinon quelqu'un « corrigera » l'écart. | `materializeAllDispoTemplates` |
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

---

## 9. Suites du 2026-08-13 (même session)

### 9.1 Une action du staff n'altère plus un planning publié

Demandé en cours de session : « quand un planning est publié on ne peut plus modifier les
semaines publiées ». **Vérifié avant d'implémenter, et la formulation littérale ne tenait
pas** : `isDatePublished` couvre l'**auto-publication** (`lib/utils.js:83` — la semaine en
cours et toutes les passées sont publiées sans aucun flag), et dépublier n'existe que pour
les semaines **futures**. Un verrou global aurait donc gelé la semaine en cours et tout
l'historique **sans porte de sortie** : plus de remplacement de dernière minute, plus de
correction de pointage.

**Périmètre retenu (arbitrage du user) : le staff seulement, le patron garde la main.**
C'est le seul périmètre qui n'exige pas de mécanisme de déverrouillage.

**Audit des portes staff vers `shifts`** — une seule était concernée :

| Route | Écrit dans `shifts` ? | Verdict |
|---|---|---|
| `POST /api/shifts/:id/joker-candidature` | non — empile une *candidature*, le patron tranche | déjà conforme |
| `POST /api/shifts/extra` | oui, mais réservé responsable/patron (`isResponsablePourSoiree`) et écrit des heures RÉELLES | hors sujet (pointage) |
| `PATCH`/`DELETE /api/shifts/:id/pointage` | heures réelles | hors sujet |
| `POST /api/shift-swaps` | F-05, désactivé | — |
| **`POST /api/dispos`** | **oui — la conversion Joker du §8.3** | **corrigé** |

Sur une semaine publiée, le créneau **reste au titulaire** et `notifyPatrons` envoie un
message distinct de celui du Joker : un Joker est un trou à combler, un créneau publié est
une décision à prendre. La **dispo**, elle, est bien enregistrée — le verrou porte sur le
planning, pas sur la disponibilité, sinon le staff n'aurait aucun moyen de signaler qu'il
ne peut plus venir.

### 9.2 La réouverture nominative porte sa semaine

Le point laissé ouvert au §8.4. En creusant, l'ambiguïté avait une **conséquence
concrète** : `POST /api/dispos` purgeait `force_open_staff` après **tout** envoi réussi.
Rouvert pour la semaine figée, un staff qui enregistrait d'abord une semaine lointaine
brûlait sa réouverture **sans avoir touché à la semaine qu'il devait corriger** — puis se
retrouvait bloqué sans qu'aucun message ne l'explique. Chemin inexistant tant que
l'horizon valait 1.

Forme stockée : `{ staff_id, week_start }`. Les entrées **legacy** (chaînes nues) restent
honorées pour la semaine en cours de collecte et disparaissent à la première utilisation.
La purge n'a lieu que si la semaine visée a effectivement été soumise. `reopen-for-correction`
**connaissait déjà** la semaine (`from`) et la jetait : elle la porte maintenant. La
pastille « 🔒 Rouvert » de `with-dispo` se lit désormais par semaine affichée.

### 9.3 La 8e lacune de `fake-db` — et pourquoi elle explique le défaut

`$addToSet` n'était **pas implémenté du tout**, alors que les deux routes de réouverture en
dépendent. Elles étaient donc **intestables**, et c'est exactement pour ça que personne
n'avait vu que la réouverture ne portait pas de semaine. Ajouté, avec le `$pull` par
**critère** (comparaison partielle sur les éléments) que la forme objet réclame, et le cas
`$addToSet` en **upsert** — sans lui, la toute première réouverture, quand le document
`settings` n'existe pas encore, se perdait en silence.

**Leçon** : une lacune de l'outil de test ne fait pas que gêner les tests — elle **cache
des défauts**. Les six premières lacunes coûtaient du temps ; celle-ci coûtait un bug.

### 9.4 Smoke : 8 vérifications B2, et un contrôle vacant démasqué

8 contrôles B2 ajoutés (`scripts/smoke.js`), verts contre un vrai Mongo : borne d'horizon,
règle A, écrêtage Y ≤ X, alignement pastille/file, la pastille qui suit Y, réouverture
portant sa semaine, refus hors horizon. Ils méritent d'exister **au-delà** de `npm test` :
les horizons viennent d'un vrai document `settings`, l'index composé n'existe que là, et la
règle A dépend de `computeEffectiveDeadline` évaluée à l'heure du serveur.

**Trouvaille en route** : `§9.1 directeur accepté après deadline` passait **sans rien
prouver**. Ces deux contrôles supposaient la deadline franchie à l'heure du lancement —
condition que rien ne garantissait. Un jeudi, avec la deadline de recette au samedi, le
directeur passait parce que **personne** n'était bloqué (vacuité) et le staff passait
aussi (faux négatif accusant le code). Le bloc impose maintenant une deadline franchie
(lundi 00:00, même ancre que les tests unitaires) et la restaure. Même traitement pour la
vérification de la règle A, qui mesure ses **deux moitiés** dans la même fenêtre : prouver
que N+2 passe ne vaut rien si l'on n'a pas prouvé au même instant que N+1 est refusée.

**42 vérifications, 0 échec, sur deux lancements consécutifs depuis un état propre.** La
base client `gestion_bar` n'a jamais été touchée : elle ne porte aucun compte `@templyo.test`,
et le garde-fou du script s'arrête avant d'écrire.

---

## 10. B2-b (2026-08-13) — et pourquoi le §2.4 était faux

### 10.1 Rectification : ce n'était PAS que de l'ergonomie

Le §2.4 concluait « B2-b n'est pas un moteur à écrire, c'est de l'ergonomie et de la
visibilité ». **Vérifié avant de coder : faux, et sur deux points opposés.**

**Une semaine lointaine publiée était inatteignable.** `planning.js` ne créait qu'un seul
onglet, « Semaine prochaine ✨ », câblé en dur sur N+1 et conditionné à sa publication.
Publier N+3 envoyait le push (« la semaine du … est publiée — consulte ton planning »)
vers une page que personne ne pouvait ouvrir. Publier loin était donc **sans effet**.

**Une semaine NON publiée était lisible.** `GET /api/my-shifts` ne filtrait sur aucune
publication : shifts, Jokers et collègues de n'importe quelle plage demandée. Le seul
rempart était que le client ne demandait pas ces dates — **la règle était affichée, pas
tenue**, exactement le trou §2.1 refermé par B2-a sur l'axe de la saisie.

Ce qui rendait ce second point net plutôt qu'opinable : **le flux iCal, sur la même
donnée, filtrait déjà** par `isDatePublished`. L'intention produit était écrite dans le
code ; c'est la route utilisée tous les jours qui l'oubliait.

### 10.2 Livré

- `my-shifts` borné par `isDatePublished` (shifts, Jokers, collègues). Sans effet sur
  l'usage courant : semaine en cours et passées sont auto-publiées.
- `GET /api/my-published-weeks?weeks=N` — même sémantique que
  `GET /api/publish/:weekStart` pour un staff (publiée POUR MOI = au moins un de mes
  shifts dans un établissement publié), mais sur une plage, en deux requêtes au lieu
  d'un aller-retour par semaine. Une semaine publiée où le staff n'a rien n'est pas
  listée : l'y envoyer afficherait une page blanche présentée comme un planning.
- Front staff : la vue « à venir » navigue sur les semaines publiées et s'arrête à la
  dernière. Libellé « Semaine prochaine ✨ » conservé quand il n'y en a qu'une.

> **⚠️ Superseded le 2026-08-17 — l'onglet « À venir » n'existe plus.**
>
> Tenir DEUX listes de semaines (la vue principale d'un côté, l'onglet de l'autre) s'est
> retourné contre nous : elles se calculaient différemment — cutoff 6h pour l'une,
> horizon de saisie pour l'autre — et le lundi de 00h à 06h la semaine qui commençait
> tombait dans le trou entre les deux, invisible pour le staff. Signalé par le client.
>
> Les semaines à venir sont désormais **empilées dans « Mon planning »** en liste
> continue (`loadUpcomingWeeks`, `planning.js`), avec un séparateur par semaine. Il n'y a
> plus qu'un seul axe de lecture, donc plus rien à garder d'accord.
>
> `GET /api/my-published-weeks` **reste en place et reste juste** (son calcul de semaine
> a été corrigé au passage), mais la vue staff ne s'en sert plus : `my-shifts` filtrant
> déjà la publication shift par shift, une seule requête sur tout l'horizon suffit et une
> semaine non publiée ne produit simplement aucun bloc. La porte reste tenue par le
> serveur — c'est l'acquis du §10.2 qui rend la simplification possible, pas l'inverse.

### 10.3 Ce qui n'avait PAS besoin d'être fait

Les deux autres items du §5 étaient **déjà corrects**, vérification faite :

- **Repères visuels du patron** : `renderPublishControl` / `updatePublishBtnLabel`
  (`script.js:1207`) affichent « ✓ Publié / Publié n/total / Publier — *semaine* » et
  suivent déjà la semaine affichée, lointaine comprise.
- **KPI de complétion du responsable** : il annonce déjà sa semaine (« Dispos envoyées —
  semaine prochaine »), et le tableau de bord responsable n'a **aucune** navigation
  (`refreshResp` prend toujours `currentWeekStart`). Le faire « suivre la semaine
  affichée » le pointerait sur la semaine EN COURS, dont la deadline est passée — donc
  strictement pire. Non fait, volontairement.

### 10.4 Vérifications

**10 tests** (`tests/planning-publication.test.js`) et **3 mutations non vacantes** :
retirer le filtre de publication des shifts fait tomber 3 tests, retirer le contrôle de
publication de `my-published-weeks` en fait tomber 1, et rendre « ouvrable » une semaine
où le staff n'a rien en fait tomber 3.

**4 vérifications de smoke** contre un vrai Mongo, **autoportantes** : le bloc crée son
propre shift sur N+2, vérifie qu'il est invisible, publie, vérifie qu'il apparaît,
dépublie, vérifie qu'il sort de la navigation — puis efface le shift et restaure la
publication. Se contenter de demander une semaine future et de constater « 0 shift »
serait passé au vert **même sans la garde**, le jeu de recette n'y plaçant rien : c'est le
piège du §9.4 en version « faux positif », et le troisième de la journée.

⚠️ Le smoke peut annoncer des vérifications **sautées** (⊘) sur S-04 : le préflight exige
des dispos en attente d'autres personnes que la directrice sur N+1. C'est une dérive du
**jeu de recette**, pas du code — remède : `npm run dev:seed`.

### 10.5 Deux filtres redondants, assumés et étiquetés

Les `.filter(isVisible)` posés sur les **Jokers** et les **collègues** sont
**inatteignables** : leurs requêtes sont bornées par `myDates`/`myEstablishments`, eux-mêmes
dérivés des shifts déjà filtrés. Vérifié par mutation — les retirer ne fait tomber aucun
test. Conservés (ils redeviennent porteurs si quelqu'un dérive ces plages autrement), mais
**étiquetés comme tels dans le code ET dans le nom des tests** : un intitulé qui promet plus
que le test ne prouve fabrique une confiance fausse, et c'est le mécanisme exact des trois
tests vacants de F-14.
