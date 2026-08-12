# B2 — Horizon de saisie · note de design

> **Statut : préparation. Aucune ligne de code écrite.** Ouverte le 2026-08-12 à la demande
> du user (« la deuxième feature, qu'on peut préparer sans la lancer »).
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
