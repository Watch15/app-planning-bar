# Backlog — Templyo

Registre des bugs identifiés, améliorations en attente et fonctionnalités futures.
Ajouter les nouveaux éléments avec une description courte, un contexte et une priorité. Retirer ou déplacer vers `done` une fois résolus.

---

## P1 — Bugs bloquants (à faire en premier)

| ID | Description | Domaine | Statut |
|---|---|---|---|
| B-04 | **Barre staff verticale mobile** — sur téléphone vertical la barre est difficilement utilisable : scroll horizontal, cartes trop petites, recherche/filtres peu accessibles | Mobile / Staff bar | ✅ Done |
| B-05 | **Touch OPEN_TIME bypass** — comportement voulu : le snap bloque avant l'ouverture pour la planification, les heures réelles peuvent dépasser librement | Timeline / Touch | ✅ By design |
| B-06 | **Validation / erreurs inaccessibles mobile** — modales de confirmation et toasts d'erreur passent sous le clavier ou hors écran en mode portrait | Mobile / UX | ✅ Done |

---

## P2 — Améliorations (après les P1)

| ID | Description | Domaine | Statut |
|---|---|---|---|
| E-03 | **Pointage : onglet responsable** — remplacer le compte `etablissement` par un onglet dédié dans la vue staff pour le `responsable` de soirée, qui peut valider les horaires sans compte séparé | Pointage / Auth | ✅ Done |
| E-04 | **Heures côté staff** — affichage amélioré sur `planning.html` : total semaine, heures par établissement, comparaison semaines | Staff view | ✅ Done |
| B-02 | Responsivité petits écrans — certaines modales ou panneaux débordent ou perdent leur padding | CSS / Mobile | ✅ Done |
| B-03 | Audit `pointerdown` vs `click` sur boutons mobiles — certains boutons de validation modale peuvent manquer les taps sur iOS/Android | Mobile / Events | ✅ Done |

---

## P3 — Nouvelles fonctionnalités (roadmap)

| ID | Description | Domaine | Notes |
|---|---|---|---|
| ~~F-03~~ | ~~**Note sur Joker**~~ | Joker / UX | ✅ Done — champ `note` sur shifts Joker, saisie modale patron, affichage staff si Joker attribué |
| ~~F-04~~ | ~~**Récap mensuel heures (export CSV)**~~ | Dashboard / Export | ✅ Done — CSV livré en D-17, **migré vers Excel `.xlsx`** + ventilation par établissement en D-52 |
| F-09 | **Abonnement agenda iCal (Google/Apple/Outlook)** | Staff / Agenda | ⏸️ Livré (D-72) puis **DÉSACTIVÉ (D-83)** — flag `CALENDAR_ENABLED=false`, pas assez fiable (synchro non temps réel). Code conservé, à roder sur `dev` avant réactivation |
| F-05 | **Échange de shifts avec validation patron** | Shifts / Notifications | ⏸️ Code livré (D-18) mais **désactivé en attente validation client** — collection `shift_swaps` conservée, 7 routes commentées via `/* */` dans `server.js` lignes 2186→2422 et 2488→2550. Modales front/back fonctionnelles, à réactiver d'un seul retrait de commentaires |
| F-11 | **KPI de complétion des dispos (par bar)** | Dispos / Pilotage | ✅ Done — carte sur la vue planning : barre globale « X/Y dispos envoyées » + déclinaison par établissement. Suit la **semaine affichée** (navigation) et **cliquable** → déroule la liste des staff sans dispo (nom + bar). Scopé par rôle : patron (tous bars), directeur (`assigned_establishments`), responsable (ses établissements, dans « 👥 Mon équipe »). Endpoint `GET /api/dispos/kpi?from&to` (`overall`/`by_establishment`/`missing`). Staff comptés = compte actif + `can_submit_dispos !== false`. |
| F-10 | **Congés / vacances déclarés à l'avance par le staff** | Staff / Planning | ✅ Done — collection `time_off` dédiée (long terme, non purgée, valable sur tous les établissements du staff). Le staff pose une **demande** (validation patron) ou une **déclaration informative** par **plage de dates** depuis l'onglet **« Dispos & congés »** de `planning.html` (sous-toggle Dispos/Congés). Côté patron : **onglet 🌴 Congés de la modale Dispos** (recherche par nom + filtres statut + regroupement par mois repliable, valider/refuser en un clic ; la pastille « Dispos » agrège dispos + congés en attente). Dans le planning, le staff en congé est **grisé + badge 🌴**, avec **confirmation requise** avant assignation. **Récap mensuel** : colonne 🌴 Congés (jours validés) + export Excel, staff en congé sans shift inclus. Endpoints `/api/conges*`, helpers purs `datesOverlap`/`congeCoversDate`/`congeDaysInRange` (testés). |
| F-12 | **Journal d'audit des dispos (historique des versions)** | Dispos / Traçabilité | 🆕 Demandé le 2026-08-05. **Besoin** : en cas de litige patron ↔ employé (« j'avais mis dispo », « non »), pouvoir prouver qui a saisi quoi et quand — y compris les versions **avant** modification. **Le trou aujourd'hui** : `POST /api/dispos` fait un `bulkWrite` en **upsert** sur `(staff_id, date)` → l'ancienne version est **écrasée sans trace**, et le statut repasse en `pending`. Idem `PATCH /confirm` et `/reject` (statut écrasé sur place), la purge congés (`deleteMany` silencieux) et la purge d'absence directeur. **Rien n'est conservé.** **Piste** : collection **append-only** `dispo_events`, un doc par changement — `{ staff_id, date, at, by:{user_id, role}, action: 'submit'\|'update'\|'confirm'\|'reject'\|'ignore'\|'reopen'\|'purge_conge', before:{…}, after:{…} }`. **Contrainte « ne prend pas de place »** : ne stocker que le **delta** (champs réellement modifiés), pas le doc complet ; **index TTL** (durée à fixer, cf. RGPD) ; ~150–250 octets par événement. **Points d'accrochage** : `POST /api/dispos` (⚠️ le `bulkWrite` actuel ne lit pas l'avant → un `find` préalable est nécessaire), `PATCH /api/dispos/:id/confirm` `/reject` `/ignore`, `POST /api/dispos/reopen-for-correction`, la purge congés, `POST /api/me/manager-off`, et la matérialisation semaine-type. **UI** : lecture seule côté patron, historique par staff/semaine, « qui · quoi · quand ». **RGPD** : donnée salarié conservée à titre de preuve → durée de conservation à arrêter et à ajouter à `politique-confidentialite.html`. |
| F-13 | **Comptes staff « fantômes » (archivés)** | Staff / Comptes | 🆕 Demandé le 2026-08-05. **Besoin** : sortir un staff de la vie courante de l'app **sans perdre son historique**. ⚠️ *À confirmer* : « en gardant leur erreur » lu comme **leur historique / leurs heures** — à valider avant de coder. **Le trou aujourd'hui** : la seule sortie est destructive et incohérente — `DELETE /api/users/:id` supprime le compte mais **laisse le profil `staff` derrière** (cf. R-12), et rien ne distingue « parti » de « actif ». **Piste** : flag `archived: true` + `archived_at` sur le doc `staff`, **jamais de suppression** (sinon les récaps passés perdent le nom). **Exclu de** : barre staff, population dispos (`can_submit_dispos`), rappels J-2/J-1, KPI de complétion, liste « sans dispo », assignation de nouveaux shifts. **Conservé dans** : shifts passés, pointage, récap mensuel des mois écoulés, masse salariale historique. **Réversible** (désarchiver). **Attention** : désactiver aussi le compte `users` lié, sinon la personne peut encore se connecter. **Endroits à toucher** : les requêtes `can_submit_dispos: true` (`server.js:446`, `:462`, `:477`, `:2994`, `:4065`), `/api/staff`, la barre staff, le récap, le KPI. |

---

## Tests & sécurité — ouvert (revue du 2026-08-04/05)

Contexte : revue complète du code (`/code-review`) puis correction de trajectoire E-22
(cf. `docs/design-e22-dispos-directeur.md` §8). Ce qui suit est ce qui **reste**.

### Livré pendant la session du 2026-08-04/05

1. **Revue complète** (`/code-review`) : 12 findings. La moitié n'étaient pas indépendants —
   ils remontaient tous à un même objet mal modélisé (cf. point 2).
2. **Correction E-22 — la dispo n'est pas un shift.** Le directeur repasse par le pipeline
   `availabilities` standard : `POST /api/dispos`, mêmes règles (deadline, congés), **même
   file de validation que le staff**, le patron choisit l'établissement et crée le shift.
   Supprimés : `PUT /api/me/manager-dispos/week`, `GET /api/me/manager-dispos`,
   `buildManagerShift`, `managerStaffMeta`, `requireEstablishment`, les marqueurs
   `source:'manager_dispo'` / `from_template`, et le sélecteur d'établissement côté directeur.
   La semaine-type ne fait plus que **pré-remplir les jours vides** (création seule).
   Résout les findings 1, 2, 3, 11 et le doublon de « copier la semaine ». Aucune migration
   (la version « shifts » n'a jamais tourné en prod).
3. **Absences (E-19 conservé)** : `manager_time_off` joint au filtre congés
   (`managerOffPeriods` + helper pur `datesCoveredByPeriods`) ; déclarer une absence purge
   les dispos de la période, **jamais les shifts du patron**.
4. **Tests** : 142 → **149**. Nouveau `tests/manager-dispos.test.js` (7 tests d'intégration
   HTTP). `insertMany` ajouté à `fake-db`. Helpers morts `resolveManagerAvailability` /
   `mondayFirstDow` supprimés avec leurs 7 tests (couverture qui portait sur du code sans
   appelant). **Non-vacuité vérifiée par mutation** : casser la garde « création seule » fait
   tomber 3 tests, retirer la jointure congés en fait tomber 1.
5. **Emojis** : retirés des onglets, sous-onglets, barre de nav principale, drawer mobile,
   menu utilisateur, chips de filtre Congés, boutons d'action et titres de modale concernés.
   **Conservés** : 🔔 (notifications) et les boutons sans libellé (⚙, ☰).
   ⚠️ Piège rencontré : `index-init.js` réécrivait le libellé du drawer au premier rendu —
   corriger le HTML seul ne suffisait pas.

### Livré pendant la session du 2026-08-05 (palier 1 — refermer E-22)

Décidé en début de session : **palier 1 d'abord**, parce que R-06 était le seul endroit où
du code **déjà poussé sur `origin/dev`** cassait un usage réel.

1. **R-06 corrigé** — `syncManagerStaffVenues()` recale `staff.venues` sur
   `users.assigned_establishments`, sur les **deux** routes qui touchaient l'un sans l'autre
   (`/establishments` **et** `/role`, ce second point n'était pas dans le constat initial).
   Crée aussi le profil staff manquant à la promotion. Un directeur réaffecté ou promu peut
   de nouveau saisir ses dispos.
2. **Exemption de deadline pour le directeur** (question 4 tranchée) — helper pur
   `dispoDeadlineWaived`, appliqué serveur **et** client.
3. **R-13** corrigé (une moitié du constat était fausse, cf. tableau), **R-14** documenté.
4. **Tests : 149 → 160.** 5 unitaires (`dispoDeadlineWaived`) + 6 d'intégration (2 deadline,
   1 cohérence client/serveur, 3 R-06). `fake-db.insertOne` génère désormais un `_id`
   (24 hex) quand le doc n'en porte pas — sans ça une route qui réutilise son `insertedId`
   n'était pas testable. **Non-vacuité vérifiée par mutation** : annuler l'exemption de rôle
   + le resync `venues` fait tomber **4 tests**.
5. `npm test` 160/160, `eslint` 0 erreur.
6. **Revue `/simplify` passée sur le diff** (4 angles : réutilisation, simplification,
   efficacité, altitude). Appliqué : signature du helper réduite à `(userId)` — il relit
   le user, donc `role`/`assigned` étaient redérivables, ce qui supprime un `users.findOne`
   entier par réaffectation ; `$pull` symétrique manquant sur `DELETE /api/establishments/:id` ;
   R-13 refait sans test de rôle (cf. tableau) ; `deadline_waived` → `deadlineWaived`
   (la réponse de cette route est snake_case pour les champs **stockés**, camelCase pour les
   **calculés**) ; emoji 🔓 restauré — je l'avais retiré au passage alors que rien ne le
   demandait. **Non fait, remonté en R-15** : la règle « venues = assigned_establishments »
   vit en 4 copies et un site de mutation fuit encore.

**Ce qui reste du palier 1 : T-05** — le smoke test contre la vraie base. Aucune des
corrections ci-dessus n'a tourné contre un Mongo réel. À faire **avant** de considérer E-22
comme refermé.

### État actuel des tests (pour mémoire)

160 tests (149 avant cette session), deux niveaux : **~137 unitaires** (helpers purs de `lib/utils.js` — aucun Express,
aucun `db`) et **~23 d'intégration HTTP** (`routes`, `manager-dispos`, moitié de `dispos`) qui
démarrent la vraie app Express sur un port éphémère et ne remplacent que Mongo, par
`tests/helpers/fake-db.js`. Session simulée par l'en-tête `x-test-user`.
**Rien ne couvre le front ni un vrai Mongo.**

### À écrire

| ID | Ce qui n'est pas couvert | Faisable avec l'infra actuelle ? |
|---|---|---|
| T-01 | Boucle du cron `materializeAllManagerTemplates` (lecture des templates, résolution du nom). Seule la fonction par semaine est testée, via la route. | **Oui** — même harnais que `manager-dispos.test.js` |
| T-02 | Branche **ObjectId** de `managerOffPeriods` (`server.js`) : le filtre tolère `user_id` en chaîne **ou** en ObjectId, mais `fake-db` n'utilise que des chaînes → la branche ObjectId n'est **jamais exercée**. Si `manager_time_off.user_id` est stocké en ObjectId en prod, rien ne le prouve. | Non — exige un vrai Mongo |
| T-03 | **Tout le front** : `script.js`, `planning.js`, `performance.js`. Zéro test. Concerne notamment la modale dispos directeur, les statuts, le badge « Directeur ». | Non — aucune infra front |
| T-04 | Aucun test E2E navigateur. | Non |
| T-05 | **Premier lancement d'E-22 contre la vraie base.** Le chemin corrigé n'a jamais tourné en conditions réelles (l'ancien non plus : jamais matérialisé en prod). | — validation manuelle |

Limite assumée : les tests d'intégration sont **boîte blanche** (ils lisent `_docs` du faux
Mongo), donc couplés au nom des collections et des champs.

### Sécurité — à traiter

| ID | Point | Fichier |
|---|---|---|
| S-01 | **`NODE_ENV` est le seul rempart du harnais de test.** Le middleware `x-test-user` fabrique une session (rôle compris) à partir d'un simple en-tête. Il est bien enfermé dans `if (NODE_ENV === 'test')` — **vérifié, non monté en prod**. Mais si `NODE_ENV` valait `test` en prod (var oubliée, image reconstruite), c'est un **contournement total de l'authentification**. Durcir : double garde, ou refus de démarrer dans cette combinaison. | `server.js:685-694`, `:5007-5009` |
| S-02 | `PATCH /api/performance-settings` : le contrôle d'accès ne tourne que si `establishment_id` est fourni. Sans le champ → écriture du doc **global**, dont `charge_rate` alimente tous les établissements par fallback. Un directeur limité à un bar déplace les chiffres des autres. **Et** `requirePatron` laisse passer l'`observateur` : cette route n'a pas de `denyObservateurEdit`, donc un rôle lecture seule peut écrire. | `server.js:4591`, `:745` |
| S-03 | `GET /api/performance-settings` : `requireAuth` seul, `establishment_id` transmis tel quel. N'importe quel staff lit objectifs et taux de charges de n'importe quel bar en devinant l'id (slug `Nom_bar`). | `server.js:4583` |
| S-04 | **`GET /api/dispos/pending` n'est scopé par aucun établissement** — la requête ne filtre que sur date + statut, et `requirePatron` laisse passer **directeur** et **observateur**. Un directeur limité à un bar voit donc les dispos en attente de **tout le staff, tous bars confondus**. Difficilement évitable en l'état (une dispo n'a pas d'établissement avant validation — c'est le modèle rétabli par la correction E-22), mais devient une vraie question maintenant que les directeurs alimentent cette file. Décider : scoper via les `venues` du staff, ou assumer. | `server.js:2772`, `:745` |

### Findings de revue restants (hors sécurité)

| ID | Point | Priorité |
|---|---|---|
| R-06 | **`staff.venues` ↔ `assigned_establishments`** — 🟡 **Partiellement résolu (2026-08-05).** Helper `syncManagerStaffVenues(userId)` (relit le user, la base fait foi) appelé par `PATCH /api/users/:id/establishments` **et** `PATCH /api/users/:id/role` ; recale `staff.venues` et **crée le profil staff manquant** en posant `users.staff_id` → plus de 400 permanent, plus besoin de `npm run backfill-directors`. Rétrograder ne détruit jamais le profil. `DELETE /api/establishments/:id` fait désormais le `$pull` **symétrique** sur `staff.venues`. 4 tests. ⚠️ **Reste ouvert, cf. R-15** : `PATCH /api/staff/:id` écrit `staff.venues` sans recaler `users` (sens inverse), et la règle « venues = assigned_establishments » existe en 4 copies littérales. | **Moyenne** (le blocage dispos est levé ; l'invariant n'est pas verrouillé) |
| R-15 | **L'invariant R-06 n'est pas verrouillé — il repose sur un commentaire.** Relevé par la revue `/simplify` du 2026-08-05, angle altitude. 3 des 4 sites de mutation passent par le helper, mais **`PATCH /api/staff/:id` (`server.js:~1740`) écrit `staff.venues` sans recaler `users.assigned_establishments`** : le patron coche des bars dans « Gestion staff » sur une ligne de directeur (`GET /api/staff` ne les filtre pas, `public/script.js` PATCHe `venues` pour n'importe quelle ligne) → la saisie de dispos suit, l'accès aux écrans reste sur les anciens bars. Divergence atteignable en 2 clics. **Deux paliers possibles** : (1) mutateur unique `setUserEstablishments(userId, venues)` qui écrit les deux collections, plus aucun `$set: { assigned_establishments }` en direct — couvre 4/4 pour le même coût ; (2) **vraie** source unique : supprimer `users.assigned_establishments` pour le rôle directeur et le dériver de `staff.venues` (touche la session `server.js:~895`, 6 lectures serveur et 5 côté front — bien plus lourd). Alternative honnête au palier 1 : rendre `venues` non éditable sur un profil de directeur. | Moyenne |
| R-04 | Les push de rappel dispo pointent vers `/planning.html`, page que le directeur ne peut pas ouvrir. | Moyenne |
| R-05 | Invitation directeur : nom générique `'Directeur'` si aucun staff choisi (N directeurs = N lignes homonymes) ; inviter un staff **existant** comme directeur crée un **second** profil staff (taux, rôles, historique restent sur l'ancien). | Moyenne |
| R-09 | `sw.js` : `caches.match(...) || caches.match('/login.html')` — `caches.match()` retourne une Promise, toujours truthy → branche login morte, et si `/index.html` manque du cache la chaîne résout `undefined` → erreur réseau au lieu du shell. | Moyenne |
| R-10 | `performance.js` : `loadTargets()` non-awaité dans le handler `change` d'établissement → le premier rendu colore les pastilles contre l'objectif du bar **précédent**, ce qui vide E-24 de son sens. | Moyenne |
| R-12 | Orphelins : profil staff créé **avant** `users.insertOne` (échec = staff fantôme) ; `DELETE /api/users/:id` ne supprime pas le profil lié ni son `manager_dispo_templates`. | Basse |
| ~~R-13~~ | ~~Requête `users.findOne` de trop sur `POST /api/dispos`~~ | ✅ **Résolu (2026-08-05)** — `managerOffPeriods(…, knownUserId)` : la session porte déjà l'`_id`, la recherche du user disparaît. **Première tentative rejetée par la revue** : court-circuiter l'appel sur `req.session.user.role === 'directeur'` économisait la requête mais introduisait un trou — le rôle en session est figé au login, un compte promu directeur aurait perdu la jointure `manager_time_off` jusqu'à sa reconnexion et aurait pu poser une dispo un jour d'absence déclarée. La version retenue ne teste aucun rôle. Les 2 lectures restantes (`time_off` + `manager_time_off`) sont passées en `Promise.all`. ⚠️ **La 2e moitié du constat était fausse** : le `users.find` de `/api/dispos/pending` est porteur (repère `is_directeur`) — conservé délibérément. |
| ~~R-14~~ | ~~Résidus inertes~~ | ✅ **Traité (2026-08-05)**, partiellement. `is_manager` : commentaire explicite ajouté aux **2** sites d'écriture (`server.js` `createManagerStaffProfile`, `scripts/backfill-director-staff.js`) — « informatif, aucun code ne le lit, ne filtre NI la paie NI rien ». Le constat disait 3 sites : le 3e (`public/script.js:5287`) est un **autre objet** (marqueur de période de congé) et il **est lu** (`:5343`) — rien à faire. **Reste ouvert** : le champ `establishment_id` résiduel sur les docs `manager_dispo_templates` déjà en base — donnée, pas code : exige un script de migration, non fait. | Basse |
| ~~R-11~~ | ~~`PUT /api/me/manager-dispos/week` sans borne temporelle~~ | ✅ Résolu — route supprimée par la correction E-22 |

### Questions en attente de réponse

1. ~~Emojis de la barre de navigation principale et du drawer mobile~~ — ✅ **Tranché (2026-08-05) : retirés.** Onglets, sous-onglets, `.header-nav` et drawer sont nettoyés. **Conservés** : 🔔 (notifications, exception demandée), et les boutons **sans libellé** dont l'icône EST le bouton (⚙ paramètres dispos, ☰ menu mobile) — les vider laisserait un bouton blanc. Les 3 zones voisines (menu utilisateur, chips de filtre Congés, boutons d'action + titres de modale concernés) ont été nettoyées dans la foulée. **Restent, hors périmètre demandé** : les icônes de statut injectées par le JS (`script.js` — ⏳ badges de congés), les placeholders de recherche (🔎/🔍/⏰), quelques libellés internes de modale (🔁 Ma semaine-type, 💶 Import taux, ⬆ Import CSV, 👥 Garder les staffs, 🔒 mention RGPD) et le hint ★ de la barre staff. Non touché aussi : `⇄ Échanges`, dans le bloc F-05 commenté — reviendra avec le symbole si F-05 est réactivé.
2. **Décocher un jour puis enregistrer ne supprime pas la dispo** côté serveur (`POST /api/dispos` ne fait qu'upsert). Limite **partagée avec le flux staff** — la corriger pour tout le monde, ou laisser ?
3. **T-01** (test de la boucle cron) : à écrire maintenant ou plus tard ?
4. ~~Le directeur tombe désormais sous la deadline des dispos~~ — ✅ **Tranché (2026-08-05) : exempté.** Helper pur `dispoDeadlineWaived(settings, role, staffForceOpen)` dans `lib/utils.js`, trois portes dans l'ordre : `force_open` global → réouverture nominative → rôle `directeur`. Utilisé aux **deux** endroits (`POST /api/dispos` et `GET /api/dispo-settings`) pour que le client n'affiche jamais un formulaire que le serveur refusera, ni l'inverse. Nouveau champ `deadline_waived` dans la réponse ; `planning.js` affiche « Deadline dépassée le … — saisie encore ouverte pour toi » au lieu d'une deadline périmée présentée comme courante. **Portée volontairement étroite** : l'exemption ne lève QUE la deadline. `staffDispoOpen` (ouverture par établissement) continue de s'appliquer au directeur — la vraie cause du blocage sur ce front était R-06, désormais corrigé. 5 tests unitaires dont un qui vérifie que l'exemption ne fuit vers **aucun** autre rôle, + 3 tests d'intégration. **Reste à décider si le cas se présente** : que faire si le patron ferme la saisie sur TOUS les bars du directeur — aujourd'hui il est bloqué comme les autres.
5. **F-13** : « en gardant leur **erreur** » — lu comme *leur historique / leurs heures*. À confirmer avant tout code.

### Documentation — contradictions relevées (audit du 2026-08-05)

Vérifiées **contre le code actuel**, pas supposées. Non corrigées : à traiter plus tard.

| ID | Où | Ce qui est faux / contradictoire |
|---|---|---|
| DOC-01 | `docs/prd.md:187-190` (§3.9.ter) | **Faux sur deux points.** « Un directeur n'a pas de profil `staff` (`staff_id` null **par design**) » et « un directeur n'est **jamais planifiable ni compté** comme un employé ». E-22 Modèle A a inversé les deux : tout directeur a un profil staff (`createManagerStaffProfile`), il est planifiable, et la décision arrêtée est **paie = COMPTÉ**. Un lecteur qui commence par le PRD conclut l'inverse de ce que fait le code. |
| DOC-02 | `docs/onboarding.md:148` | **Faux.** « keyé sur `user_id` (un directeur n'a **pas** de `staff_id`) ». Même inversion que DOC-01. Le fait que `manager_time_off` reste keyé sur `user_id` est vrai ; la justification donnée ne l'est plus. |
| DOC-03 | `docs/design-e22-dispos-directeur.md` | **Se contredit lui-même.** §Décisions (l. 44) « v1 = saisie semaine par semaine, **auto-validée** » et §6bis Phase 1 (l. 123) « statut **`confirmed` d'office (auto-validé)** » — alors que §8 (2026-08-04) impose `pending` + **validation patron**. Les sections antérieures n'ont pas été marquées comme supersédées. ⚠️ Omission de la session du 2026-08-04 : c'est le doc qui fait autorité sur E-22, à corriger en premier. |
| DOC-04 | `README.md:222` | **Ambigu, devenu trompeur.** « `manager_time_off` — keyé sur `user_id`, **isolé du pipeline staff** ». La collection l'est toujours ; le **directeur**, lui, ne l'est plus. Formulation à préciser. |
| DOC-05 | `README.md:290/292/295`, `docs/prd.md:125-129, 139, 161, 165, 176, 193, 279` | **Périmé depuis le nettoyage des emojis** (2026-08-05). La doc décrit l'UI actuelle avec des libellés qui n'existent plus : « 📋 En attente », « 🔄 À réaffecter », « 📝 Notes », « 🔓 Modifier », « 🌴 Congés », « 👥 Mon équipe », « 👥 Staff », « 📊 Excel »… Cosmétique, mais nombreux. **N'inclut pas** les entrées historiques `D-xx` de ce backlog, qui décrivent l'état au moment de la livraison et n'ont pas à être réécrites. |
| DOC-06 | `graphify-out/` | **Périmé par construction.** `GRAPH_REPORT.md` date du 2026-07-31 : antérieur à E-22 v2 **et** à sa correction. Il décrit donc des routes supprimées (`PUT /api/me/manager-dispos/week`…) comme existantes. Aggravé par le fait que `CLAUDE.md` **impose** de l'interroger en premier pour toute question d'architecture (cf. Divers). |

**Non audités** (hors périmètre de cette passe, aucune vérification faite) : `docs/architecture.md` (2026-06-12), `docs/methodologie-et-cicd.md`, `docs/ux-design.md`, `task.md`, `ui_kits/*.md` — tous antérieurs de 2 à 4 mois, donc **présumés dérivés**.

### Divers — outillage & process

- **`graphify` est en panne, et le `CLAUDE.md` l'impose.** `graphify update .` **refuse** de s'exécuter (994 nœuds contre 997 en base → soupçon de chunks manquants d'une session précédente). Non forcé : `--force` écrase le graphe. Or les instructions projet demandent de lancer `graphify update .` après toute modification de code **et** de s'appuyer sur le graphe pour les questions d'architecture. Conséquence : **chaque session future recevra la consigne d'interroger un graphe périmé, sans le savoir.** Ce n'est pas une corvée en attente, c'est un outil cassé qui dégradera silencieusement le travail. À réparer (rebuild propre) ou à retirer temporairement du `CLAUDE.md`.
- **Commit + push automatiques.** L'environnement committe et pousse sans demande explicite : 4 commits sont partis sur `origin/dev` pendant la session du 2026-08-04/05 (`469efee`, `bb5b479`, `36b65f2`, `83028ff`). Deux conséquences : (a) **la correction E-22 est sur le remote alors qu'elle n'a jamais tourné contre une vraie base** (cf. T-05) ; (b) **les messages ne décrivent pas ce qui s'est passé** — `feat: update manager availability process for directors` livre en réalité un **revirement** d'un design déjà en place. Qui relira l'historique dans six mois ne verra pas qu'une décision a été annulée : seul `docs/design-e22-dispos-directeur.md` §8 le dit. Si `dev` est déployé automatiquement quelque part, le point (a) devient urgent.

---

## Déjà livré / non prioritaire

| ID | Description | Décision |
|---|---|---|
| — | Push notifications | Déjà en place (VAPID + SW) |
| — | Template semaine | Déjà couvert par "copier un jour" (feature existante) |
| — | Alerte heures sup | Reporté — pas de demande terrain |

---

## Fait

| ID | Description | Commit |
|---|---|---|
| D-01 | Contraste tabs Jour/Semaine fond clair | bb6cab3 |
| D-02 | Contraste total heures par ligne timeline | 3a310d0 |
| D-03 | Styles copy-week-section/label/grid manquants | 2ba4fe5 |
| D-04 | Copie vers semaine suivante — modale deux sections | 9396d05 |
| D-05 | Snap mobile — flag `_touchActive` bloque mousedown Android | 5f44ae8 |
| D-06 | Heures timeline dynamiques — `applyVenueHours()` | 5f44ae8 |
| D-07 | `PX_PER_HOUR` 60 universel — SNAP entier, fin des minutes irrégulières | 1c40ffe |
| D-08 | Placement jusqu'à heure fermeture — clamp `END_HOUR-0.25` | 1c40ffe |
| D-09 | `OPEN_TIME`/`CLOSE_TIME` — borne visuelle ≠ borne métier (mouse/drag) | e4b032e |
| D-10 | Lien SMS cliquable — restaure `https://` dans les 3 envois Twilio | 66a7869 |
| D-11 | Barre staff mobile — bottom sheet 2 colonnes 60vh scroll vertical | — |
| D-12 | Modales bottom sheet mobile — `align-items:flex-end`, `border-radius:20px 20px 0 0`, `font-size:16px` | — |
| D-13 | Toast mobile — repositionné en haut de l'écran (ne passe plus sous la barre staff) | — |
| D-14 | E-04 — stats staff : delta heures vs sem. prec. + répartition par établissement | — |
| D-15 | E-03 — onglet Pointage pour directeur dans planning.html + sélecteur établissement dans pointage.html | — |
| D-16 | B-03 — `touch-action: manipulation` global sur boutons/liens | — |
| D-17 | F-04 — Export CSV du récap mensuel (UTF-8 BOM, séparateur `;`, compatible Excel FR) | — |
| D-18 | F-05 — Échange de shifts : collection `shift_swaps`, 7 routes backend, modale patron (✓/✗ + raison), modale staff (4 semaines glissantes, cross-établissement). **Routes désactivées depuis mai 2026 en attente validation client** — code conservé, à réactiver par retrait des `/* */` blocs (lignes 2186→2422 et 2488→2550 server.js) | — |
| D-19 | F-03 — Note sur Joker : champ `note` sur shifts Joker, saisie patron dans modale Joker, affichage staff si Joker attribué | — |
| D-20 | UX — refonte header patron (I-01/02/03) : brand mobile + ⏱ Pointage ambre + drawer restructuré | — |
| D-21 | UX — pointage (PT-01/02/03/04/05/06) : validated-card, édition heures réelles, total-footer, gap coloré, session-banner, mobile layout | — |
| D-22 | UX — planning staff (P-03/04) : cutoff_hour sur onglet Pointage + spacer safe-area-inset-bottom | — |
| D-23 | UX — auth (L-02/L-04, S-01/S-03) : login scroll, année dynamique, toggle œil, guard token absent | — |
| **Sprint court — sécurité / infra** ||
| D-24 | `SESSION_SECRET` hard-crash en prod + `sameSite:'lax'` sur cookie session | — |
| D-25 | `app.set('trust proxy', 1)` en prod (Railway reverse proxy) | — |
| D-26 | `.gitignore` nettoyé — renommé depuis `gitignore`, retrait `docs/`, ajout `.env.*`, `.idea/`, `.vscode/` | — |
| D-27 | `toISOString()` remplacé par formatage local dans `script.js:3779` (bug off-by-one timezone potentiel) | — |
| **Sprint moyen — sécurité / observabilité** ||
| D-28 | `helmet()` + CSP adaptée au stack (Google Fonts, `'unsafe-inline'` toléré) | — |
| D-29 | `morgan` access logs (`combined` prod, `dev` local) | — |
| D-30 | `GET /health` — ping MongoDB + uptime, pour Railway + monitoring | — |
| D-31 | Indexes MongoDB manquants — push_subscriptions.user_id, notifications(user_id,read,created_at), shift_swaps(status,created_at), settings.key unique, users.phone/invite_token/reset_token sparse | — |
| D-32 | `escapeHtml()` étendu (quotes) + appliqué aux `innerHTML` user-data : venues, staff rows, users, roles, agenda pills, swap cards, conflict toast | — |
| D-33 | Sentry intégration conditionnelle — init uniquement si `SENTRY_DSN` présent, `setupExpressErrorHandler` + fallback `app.use((err,req,res,next))` | — |
| **Phase 3 — fondations** ||
| D-34 | `lib/utils.js` — extraction helpers purs (`isValidObjectId`, `hashToken`, `normalizePhone`, `computeActiveDate`, `toDateStr`) | — |
| D-35 | `tests/utils.test.js` — 20 tests `node --test` natif (cutoff 0/pile/bascule mois-année, padding date, téléphones internationaux) | — |
| D-36 | GitHub Actions CI — `.github/workflows/ci.yml`, matrice Node 20/22, `npm ci` → syntax check → `npm test` | — |
| **Bugs hotfix** ||
| D-37 | Double bouton ⏱ Pointage dans header patron — retrait insertion JS dupliquée dans `script.js:init()` | — |
| D-38 | Modale approbation échange patron — heures ≥ 24h wrap sur 00-23 (`_fmtSwapTime` aligné sur `fmtHour`) | — |
| D-39 | Stats « Moy. par personne » (vue jour + vue semaine) — jokers exclus du numérateur ET dénominateur | — |
| D-40 | Rebranding Planning Bar → Templyo | — |      
| D-41 | La normalisation des numero de telephone, pour que +33612345678 et 0612345678 matchent en base | — |
| **Sprint mai 2026 — nouvelles features** ||
| D-42 | **F-06 — Joker ouvert au staff** : toggle patron « 📢 Proposer au staff », push Web à tout le staff de l'établissement, candidatures horodatées dans `joker_candidates[]`, assignation 1 clic depuis la modale, bloc « 📢 Créneau disponible » dans `planning.html` | 0b47394 |
| D-43 | **F-07 — Transfert de shift cross-établissement** : route `PATCH /api/shifts/:id/transfer`, notif push staff « 🔄 Shift transféré » | e416616 |
| D-44 | **F-08 — Recherche insensible aux accents (NFD)** : helper `normalizeStr()` appliqué à la barre staff + modale notes (« emilie » matche « Émilie ») | 7cd9c22 |
| D-45 | Hotfix — route `PATCH /api/shifts/:id/joker-open` déplacée avant `/api/shifts/:id` (la route générique l'aurait capturée, 404) + gestion d'erreur côté client robuste si réponse non-JSON | 17f1e5f |
| D-46 | Hotfix — query `GET /api/shifts/joker-ouverts` utilise `$or` (`is_joker: true` OR `staff_id: '__joker__'`) pour matcher les Jokers historiques sans champ `is_joker` | 783464c |
| D-47 | Hotfix critique — routes Joker accidentellement à l'intérieur du bloc `/* F-05 DÉSACTIVÉ */` lignes 2186→2550 → invisibles à Express, 404 silencieux. Bloc scindé en deux (2186→2422 et 2488→2550) pour libérer la section Joker | (à commit) |
| D-48 | Création compte staff lie automatiquement le téléphone à un staff existant + greeting SMS/email trimé proprement | 0de5f7b ce7c0c2 2923718 |
| D-49 | **Audit ergonomie tactile/mobile (7 pages)** — Bloquants levés sur l'ensemble du parcours : tailles tactiles ≥ 44 px (`.modal-close` 32→44, `.view-tab`, `.cal-nav` 30→44, `.dispo-time-input` 36→44, boutons login/set-password, onglets `.week-sub-tab`, `.staff-modal-tab`, 4 boutons inline du modal Dispos), anti-zoom iOS via règle globale `font-size:16px` sur inputs mobile (`style.css` + exceptions `.copy-time-input`, `.staff-search-input`), scrolls horizontaux ajoutés (`.table-wrap` perf, calendrier perf <480 px en `repeat(7, 64px)` scroll-snap, `.tabs-bar` planning, container onglets Staff & Dispos), `.modal-header` rendu `position:sticky` → close toujours accessible pendant scroll modal | (à commit) |
| D-50 | **Audit code — 7 bloquants levés (sécurité + DB + cohérence)** : (B7) index `daily_revenue(establishment_id, date)` unique + `staff_notifications(staff_id, created_at)` ajoutés au startup serveur ET dans `init-db.js` ; (B4) filter `is_joker \|\| staff_id==='__joker__'` dans `/api/performance` (KPI heures, table, détail, calendrier) ; (B1) `toISOString()` → format local sur `deadline` `/api/dispo-settings` (conforme §3.1) ; (B8) `escapeHtml(String(...))` sur `shift._id` et `shift.staff_id` dans attribut `onclick` (script.js:1421) ; (B5) `findOneAndUpdate` atomique avec filter `'joker_candidates.staff_id': { $ne }` sur candidature Joker (anti double-tap) ; (B3) replace_all × 86 — `{ error: e.message }` → log serveur + `{ error: 'Erreur interne' }` (conforme §12, plus de fuite stack) ; (B2) fallback `findOne({ invite_token: token })` / `reset_token: token` en clair supprimés (tokens pré-migration de toute façon expirés via TTL 24h/1h) | (à commit) |
| **Sprint mai 2026 — exports & récaps** ||
| D-51 | **Export PDF du tableau de bord hebdomadaire** (`index.html`, sous-onglet Semaine → Tableau de bord) — bouton « 🖨 Imprimer » remplacé par « 📄 PDF » qui télécharge directement `planning-YYYY-MM-DD.pdf` (A4 portrait). Fit-to-page via `min(scaleX,scaleY)` + centrage : **toujours 1 page** quel que soit le nombre de staff (densité adaptative ≤15 / 16-25 / 26+ : police 12/11/10 px, paddings et pills ajustés ; conteneur 840/980 px pour matcher le ratio portrait). En-tête style Gantt : logo Templyo + **nom de l'établissement** + libellé de semaine + badge « Semaine ». **Colonne « Total heures » par personne retirée à la demande utilisateur**. Pile : `jspdf` 2.5.1 + `html2canvas` 1.4.1 **auto-hébergés** dans `/public/vendor/` (téléchargés depuis cdnjs, **pas de CDN runtime**, précachés par le SW). Bouton Gantt et bouton du récap mensuel inchangés. **Juin 2026** : passé de paysage à portrait pour réduire l'espace blanc (`orientation: 'landscape'` → `'portrait'`), avec `containerWidth` tuné par palier — 840 (non-dense ≤15) / 980 (dense 16-25) / **650 (xDense 26+)** pour que la hauteur source remplisse la page portrait. | (à commit) |
| D-52 | **Récap mensuel patron — ventilation par établissement + export Excel** (`index.html` modale Récap) — `GET /api/recap-mensuel` retourne désormais `by_establishment[]` par staff (`{ establishment_id, establishment_name, planned_hours }`, trié alphabétiquement). ⚠️ Lookup établissement par champ custom `id` (pas `_id`) — les shifts référencent `establishments.id`. Modale : colonnes par établissement insérées entre **Nom** et `Jours/Planifiées/Réelles/Écart` (affichées uniquement si « Tous les établissements » sélectionné), cellule **vide** si pas d'heures (auparavant « — »), ligne de total agrégée par estab, `overflow-x:auto` pour mobile, `escapeHtml(staff_name)` ajouté. **Export CSV remplacé par export Excel `.xlsx`** : `📊 Excel` (titre « Enregistrer en Excel (.xlsx) »), nouvelle fonction `exportRecapXlsx` via **SheetJS** (`xlsx.full.min.js` 0.18.5 auto-hébergé `/public/vendor/`, précaché SW), feuille « Récap YYYY-MM », largeurs auto, mêmes colonnes que la modale. Ancienne fonction `exportRecapCsv` supprimée. | (à commit) |
| D-53 | **Vue staff — toggle Semaine/Mois + stats Historique** (`planning.html`) — segmented control « Semaine / Mois » au-dessus de `#week-stats`, défaut Semaine. Mode **Mois** : `loadMonthRecap()` + `renderMonthStats()` (3 cartes Jours/Shifts/Heures + delta « vs mois préc. »), via la route existante `/api/my-shifts`. État `_lastWeekData`/`_lastMonthData` pour switch instantané. **Onglet Historique** : bloc stats (3 cartes) au-dessus des cartes journées + répartition par établissement si > 1. *(Note : les deltas hebdo « vs sem. préc. » de ce sprint ont été retirés ensuite — voir D-61)* | (à commit) |
| **Sprint mai 2026 — dispos individuelles & pointage** ||
| D-54 | **Suppression d'un shift non pointé depuis le pointage** — `DELETE /api/shifts/:id/pointage` (refus 409 si `real_start`/`real_end` déjà saisi), bouton « Supprimer » à 2 clics (Supprimer → Confirmer, reset 4s) sur les cartes non validées de `pointage.html`. Accessible établissement / patron / directeur / responsable de soirée | c8c0ecf |
| D-55 | **Convention de nommage dans le sélecteur « service non planifié »** (`pointage.html`) — helper `staffDisplayName()` (surnom sinon prénom), aligné avec le reste de l'app | c5fd6e4 |
| D-56 | **Plusieurs responsables de soirée par jour** — `isResponsablePourSoiree()` passe de `.find()` à `.filter()/.some()`, retrait du `$unset` qui dé-désignait les autres responsables. Permet ex. 1 responsable matin + 1 soir | 4a18137 |
| D-57 | **B-10 — Aucun push pour un shift passé** — garde `shift.date >= toDateStr(new Date())` (comparaison lexicographique `YYYY-MM-DD`) sur les 6 sites push shift : `POST /api/shifts`, `PATCH /api/shifts/:id` (callback debounce, in-app patron conservé), `/transfer`, `/joker-open`, `DELETE /api/shifts/:id`, `PATCH /api/publish/:weekStart` (filtre `distinct` sur `date >= max(weekStart, today)`). Rappels dispos & notifs in-app non touchés | 3c863c6 |
| D-58 | **E-15 — Réouverture dispo individuelle par staff** — champ `settings.dispo.force_open_staff[]`, route `PATCH /api/dispo-settings/force-open-staff` (add/remove, placée avant `/api/dispo-settings`), bypass deadline dans `POST /api/dispos` + cleanup auto à la soumission, `GET /api/dispo-settings` expose `force_open_staff` + recalcul `canSubmit`, bouton « 🔓 Rouvrir » par ligne dans l'onglet « Sans dispo » | 9974900 |
| D-59 | **Onglet « 🔓 Modifier » dans la modale Dispos** — pour les staff ayant déjà envoyé. `GET /api/dispos/with-dispo` (liste + compteur + flag `reopened`), `POST /api/dispos/reopen-for-correction` (supprime les dispos de la semaine + `$addToSet force_open_staff`). Bouton « Rouvrir » à 2 clics avec confirmation destructive | d7408ad |
| D-60 | **Barre d'onglets Dispos — `flex-wrap`** (`index.html`) — les 5 onglets ne tenaient plus sur une ligne (overflow-x masqué → onglet « Notes » inaccessible). Passage en `flex-wrap:wrap`, padding/hauteur compactés (44→40), « Modifier dispo » raccourci en « Modifier » | c35c960 |
| D-61 | **Retrait du delta « vs semaine précédente » côté staff** (`planning.html`) — suppression du calcul + affichage sur les stats semaine courante (`renderStats`/`renderStatsInto`) et historique (`buildHistStatsHtml`/`renderHistoriqueWeek`/`loadHistoriqueWeek`). 2 fetch `/api/my-shifts` N-1 en moins par chargement. **Le delta mensuel est conservé.** Annule partiellement D-14 et la partie hebdo de D-53 | 3404c2a |
| **Sprint mai 2026 — dispos indispo & priorisation directeur** ||
| D-62 | **Retrait du delta mensuel côté staff** (`planning.html`) — suppression du calcul + affichage « vs mois préc. » dans le récap mensuel (`loadMonthRecap`/`renderMonthStats`). Le 2ᵉ fetch `/api/my-shifts` du mois N-1 est supprimé, `_lastMonthData` ne stocke plus que `{ shifts }`, CSS `.stat-delta` retiré. Achève D-61 : **plus aucun delta** (hebdo ni mensuel) côté staff | (à commit) |
| D-63 | **Dispos staff — soumission possible en indispo totale** (`planning.html` + `server.js`) — les jours « Indisponible » (`off`) ne sont plus ignorés à l'envoi : enregistrés comme dispos `type:'off'` sans horaires (`start_time`/`end_time` = `null`). Un staff indispo toute la semaine peut donc valider (avant : blocage « au moins un jour disponible » ; seuls les jours non renseignés restent ignorés). Serveur : `POST /api/dispos` stocke `null` pour les off ; `/api/dispos/confirmed` (overlay planning) et `/api/dispos/non-affectees` (à recréer) **excluent** `type:'off'` ; `PATCH /api/dispos/:id/confirm` ne crée pas de shift et n'exige pas d'`establishment_id` pour un off. Patron (`script.js`, « En attente ») : pastille rouge « Indispo » sans horaire, acquittable d'un clic (`acknowledgeOffDispo`), sous-titre « X dispos · Y indispo » | (à commit) |
| D-64 | **Récap mensuel patron — ventilation heures réelles par établissement** (`server.js` + `script.js`) — `GET /api/recap-mensuel` ajoute `real_hours` à chaque entrée `by_establishment[]` (somme des shifts pointés, `null` si aucun). Modale : deux blocs de colonnes par établissement avec en-tête groupé **« Détail planifié »** (existant) + **« Détail réel »** (bleu). Export Excel : colonnes dédoublées et différenciées par préfixe `Plan. <estab>` / `Réel <estab>`. Complète D-52 | (à commit) |
| D-65 | **Dispos patron — priorisation directeur** (`script.js`, onglet « En attente ») — un directeur voit en tête de liste les staff rattachés à ses établissements (`staff.venues` ∩ `assigned_establishments`), triés avant les autres. Encadré orange **« ★ Staff de mon établissement »** + séparateur « Autres » ; étoile et fond orange (`--warning`) sur les cartes concernées (même idée que le ★ de la barre staff du planning). Purement client (l'endpoint renvoie toujours tout). Sans effet pour le patron / un directeur sans établissement assigné | (à commit) |
| D-66 | **E-16 — Tableau de bord du responsable dans `planning.html`** (`server.js` + `planning.html`) — onglet dynamique **« 📋 Tableau de bord »** ajouté avant l'onglet Dispos pour tout staff porteur d'un rôle de type `responsable` ayant au moins un shift sur la semaine en cours. Endpoint `GET /api/me/responsable-week?from=…&to=…` : (1) valide le rôle responsable, (2) collecte les couples (date, établissement) où le staff travaille, (3) renvoie tous les shifts de l'équipe sur ces couples groupés par date, augmentés du `phone` de chaque coéquipier. **Refonte UX mai 2026** : périmètre élargi (retrait du filtre `isResponsablePourSoiree()` — l'équipe est visible sur **toutes** les soirées de travail, plus seulement celles où le staff est désigné `pointage_resp`) ; rendu en **cartes par jour** mobile-first à la place de la table 7-colonnes (plus de scroll horizontal, plus de colonne Total) ; **Jokers ouverts au staff** (`joker_open:true`) extraits dans un bloc « 📢 Créneau à pourvoir » — les Jokers fermés (placeholders patron « au cas où ») sont masqués (avant ils polluaient la liste équipe) ; **badge 👑** sur les responsables désignés du soir (`pointage_resp:true`) ; **tap-to-contact** — taper un coéquipier ouvre une bottom-sheet Appeler/SMS (numéros joints à la réponse, gate rôle responsable) ; jours passés atténués (`opacity:0.62`) pour distinguer ce qui n'est plus actionnable ; nom d'établissement en **pill** (bg violet pâle + bordure 1px) pour renforcer l'identifiant visuel ; tab renommé **« 👥 Mon équipe »** (était « 📋 Tableau de bord ») ; **fusion des shifts coupés** — un coéquipier qui fait 2 shifts dans le même bar la même soirée (ex. coupure 18-22h + 23-3h) apparaît sur un seul row avec horaires joints au lieu de 2 rows distincts ; le 👑 reste affiché si l'un des shifts fusionnés a `pointage_resp:true` ; **auto-refresh** — re-fetch sur clic du tab + sur `visibilitychange` quand le tab est actif (sessions longues, modifs patron pendant absence) ; le badge **« Aujourd hui »** est recalculé à chaque rendu (plus de bug minuit sur l'onglet resté ouvert) ; **système de noms aligné sur le tableau de bord patron** — port de `buildStaffDisplayNames`/`displayName` (script.js:47) dans `planning.html` : nickname si défini, sinon prénom seul, avec désambiguïsation par initiale du nom de famille en cas de collision de prénoms (« Sébastien G. » vs « Sébastien M. »). Endpoint augmenté avec `nickname` (projection `{phone:1, nickname:1}`). *(Note : E-17 tentait la même idée pour les directeurs dans `index.html` — reverté `994b2ff`, mauvaise cible.)* | (à commit) |
| **Sprint juin 2026 — pointage, agenda & dette technique** ||
| D-67 | **Pointage prérempli + saisie au quart d'heure** (`pointage.html`) — champs « Début/Fin réel » préremplis avec les **heures planifiées** (arrondies au quart) quand aucun pointage n'existe (services hors planning exclus) ; saisie restreinte à 15 min via `step="900"` + recalage sur `change` + arrondi `roundQuarter()` à l'enregistrement (cartes shift **et** formulaire hors planning). Filets multiples car Android n'applique pas toujours `step` sur le picker horloge | e25e5c4 |
| D-68 | **Purge auto des dispos des semaines passées** (`server.js` `cleanupPastDispos`) — au passage d'une semaine, **toutes** les dispos d'une semaine écoulée sont supprimées (`date < lundi courant` + notes `week_note` via `week_start`), confirmées comprises (le shift reste la source de vérité). Lancé quotidiennement à 10h avec `cleanupOldJokers`. Choix produit assumé : l'historique dispos n'a pas de valeur une fois la soirée travaillée. ⚠️ effet de bord mineur sur le pré-remplissage `/api/dispos/previous` en cas de saisie tardive (semaine source purgée) | e35d0ad |
| D-69 | **Purge des notifs dispos périmées** (`server.js`) — `cleanupPastDispos` supprime aussi `notifications` `type:'rappel_dispo'` (`week_start < lundi`) et `staff_notifications` `type:'rappel-dispo'` (`created_at < lundi`). Périmètre restreint aux seuls types dispos (planning/échanges non touchés). Les 2 collections ont déjà un TTL 30 j — on synchronise juste avec la purge hebdo | 10735a1 |
| D-70 | **Sessions 30 jours glissantes** (`server.js`) — durée 7 → 30 j via constante unique `SESSION_TTL_MS` (cookie + expiration store), `rolling:true` + nouvelle méthode `touch()` sur `CustomMongoStore` qui fait glisser `expires` à chaque visite. Déconnexion seulement après 30 j d'**inactivité** (utile staff mobile). Sessions déjà ouvertes : bascule à leur prochaine requête | 3740a13 |
| D-71 | **Fix calcul heures réelles/planifiées** (`planning.html`) — bug : `real_start`/`real_end` testés **séparément** → mélange réel+planifié si pointage partiel → durées fausses. Règle corrigée **par paire** (réel seulement si début ET fin pointés) via helper `shiftEffectiveHours()`, appliqué aux 5 sites (`renderStatsInto`, `renderMonthStats`, `buildHistStatsHtml` + cartes histo + shifts supplémentaires + regroupement slots), aligné sur la logique déjà correcte du shift principal. Cartes d'historique affichent désormais le réel (sinon planifié), cohérent avec le résumé | 10ed8da |
| D-72 | **F-09 — Abonnement agenda iCal staff** (`server.js` + `planning.html`) — flux `.ics` pour Google/Apple/Outlook, synchro auto sans login après un réglage unique. `GET /api/calendar-url` (auth) génère un `calendar_token` sur `users` et renvoie l'URL (`https://` + `webcal://`) ; `GET /api/calendar/:token.ics` (**public**, token = auth, lecture seule) sert les shifts de la **semaine en cours + semaines futures publiées** (filtrage groupes, Jokers exclus, `VTIMEZONE` Europe/Paris avec DST, passage minuit géré). Carte « 📅 Ajouter à mon agenda » sous le planning (boutons Apple/Google + URL copiable + instructions Outlook) | c33d494 |
| D-73 | **Extraction testée `shift-hours.js`** (modèle de refacto incrémentale) — logique heures de shift sortie dans `public/lib/shift-hours.js` (**module UMD** : `window.ShiftHours` navigateur + `require()` Node), couverte par `tests/shift-hours.test.js` (6 cas dont pointage partiel sans mélange et `real_start=0`). `planning.html` la charge via `<script src>` et délègue (même nom, hoisting préservé). `npm test` étendu (**49 tests, 2 suites**). Gabarit pour les futures extractions sans réécriture | (working tree) |
| D-74 | **R-01 — Unification du lundi de semaine** — `getMondayOf` était dupliqué à l'identique dans `planning.html`, `performance.html`, `script.js` (+ `weekStart` dans `lib/utils.js`) = **4 implémentations**. Extrait dans le module UMD `public/lib/week.js` (`window.Week.weekStart`) ; `lib/utils.js` le **ré-exporte** (zéro churn serveur : `disposWeekStart`/`isAutoPublished`/routes inchangés), les 3 fronts **délèguent** leur `getMondayOf`. `performance.html` normalise désormais à minuit (sans effet — sorties via `toDateStr`, et plus robuste anti-DST). Couvert par `tests/week.test.js` (8 cas : lundi/dimanche/mercredi, bascule mois & année, idempotence, copie défensive, chaîne ISO). **57 tests, 3 suites** | (working tree) |
| D-75 | **Bascule « semaine en cours » à 6h (cutoff fermeture)** — la plupart des shifts ferment ~2h ; `weekStart(new Date())` basculait à **lundi 00:00 pile** → le shift de fermeture (daté la veille, `end_time=26`) sortait de « cette semaine ». Ajout de `currentWeekStart(now, cutoff=6)` dans `public/lib/week.js` (constante `WEEK_CUTOFF_HOUR=6`, centralisée → ajustable simplement plus tard, indépendante du `cutoff_hour` pointage 9h) : **avant 6h le lundi, on reste sur la semaine précédente**. `weekStart` **inchangé** (mapping date→semaine, sinon un shift daté un lundi basculerait à tort). Appliqué aux surfaces « maintenant » : planning staff (vue + base historique + équipe responsable), vue patron (`script.js`), calendrier `performance.html`, flux iCal (`server.js`). **Laissé tel quel** : « semaine prochaine »/dispos et crons 10h (post-cutoff → sans effet). `tests/week.test.js` +7 cas (lundi 03h→sem. préc., 06h→courante, mardi 03h, cutoff custom). **64 tests, 3 suites** | (working tree) |
| D-76 | **C-01 + C-03 — finitions agenda & dispos** — **C-01** : la carte « 📅 Ajouter à mon agenda » (`planning.html`) est masquée si `!currentUser.staff_id` (ex. directeur) au lieu d'afficher une erreur au clic (l'API `/api/calendar-url` renverrait 400). Garde ajoutée en tête de `initCalSync()`. **C-03** : vérifié que `/api/dispos/non-affectees` exclut **déjà** les indispos `type:'off'` (`$nin: ['week_note','off']`) — la mention « à recréer » de D-63 était périmée, aucun code nécessaire | (working tree) |
| D-77 | **Cohérence du nom staff partout (compte, dispos, shifts)** — corriger un nom dans l'onglet Staff ne se reflétait pas dans l'onglet **Comptes** (`users.name` dénormalisé, jamais propagé). Fix double : (1) `GET /api/users` enrichit le `name` depuis `staff` (source de vérité, comme déjà fait pour le téléphone) → l'onglet Comptes est toujours à jour et **soigne les comptes déjà créés** sans re-saisie ; (2) `PATCH /api/staff/:id` propage la correction de nom à `users.name` + `availabilities.staff_name` (en plus de `shifts.staff_name` déjà fait). ⚠️ `session.user.name` d'un staff **déjà connecté** ne se rafraîchit qu'à sa prochaine connexion (session en cache) | (working tree) |
| D-78 | **R-02 — Logique de publication unifiée + fix heuristique** — le test « ce shift est-il sur une semaine publiée ? » était dupliqué à **4 endroits serveur** (3 gates de notif shift création/modif/suppression + flux iCal) avec une heuristique **boguée** `Math.abs(shiftDate - lundiPublié) < 8 j` : elle matchait à tort une semaine **adjacente** (un lundi est à 7 j du lundi précédent → 7 < 8). Extrait en helper **pur testé** `isDatePublished(dateStr, publishedWeeks, now)` (`lib/utils.js`, match **exact** du lundi) + helper DB `fetchPublishedWeeks()` (`server.js`, Set des lundis publiés, lecture `publish_*` en un seul endroit). Les 4 sites délèguent. Le **front ne contenait pas** la logique (il appelle déjà `/api/publish/:weekStart` → `{published, auto}`). `GET /api/publish` et `checkDispoRappels` laissés tels quels (corrects, requêtes ciblées). `tests/utils.test.js` +5 cas dont le **non-match d'une semaine adjacente publiée**. **69 tests, 3 suites** | (working tree) |
| D-79 | **C-02 — Domaine des URLs agenda unifié** — `GET /api/calendar-url` retombe désormais sur `APP_URL` (déjà configurée pour email/SMS) en plus de `PUBLIC_BASE_URL`, avant l'hôte de la requête : précédence **`PUBLIC_BASE_URL > APP_URL > req-host`**, avec préfixe `https://` garanti (la conversion `webcal://` en dépend) et slashs finaux retirés. Plus besoin de 2 variables : `APP_URL` suffit pour tout, `PUBLIC_BASE_URL` ne sert qu'à forcer un domaine `.ics` différent. Documenté (README env + architecture §14). Pas de test (câblage env, dépend de `req`) | (working tree) |
| D-80 | **R-03 — Scripts inline externalisés** — les gros blocs `<script>` de `planning.html` (~2130 l) et `pointage.html` (~811 l) sortis dans `public/planning.js` et `public/pointage.js` (servis statiquement → **lintables, cachables**, prêts pour un découpage ultérieur). Extraction **byte-perfect** (programmatique, pas de re-frappe). Ordre de chargement préservé : `/lib/shift-hours.js` + `/lib/week.js` avant `/planning.js`. Le mini-bloc d'enregistrement du Service Worker (3 l) reste inline. Nouveaux fichiers ajoutés au **précache SW** (`/planning.js`, `/pointage.js`, `/lib/shift-hours.js`, `/lib/week.js`). Zéro changement de comportement | (working tree) |
| D-81 | **Correctifs PWA (icônes, favicon, meta)** — repérés au smoke test R-03, **pré-existants**. (1) Le dossier `public/icons/` était **absent** → `icon-192/512/72.png` en 404 (manifest, apple-touch-icon, badge push SW) : icônes PNG **générées** (fond `#6C63FF` + « T » blanc, encodeur PNG maison, zéro dépendance). (2) `public/favicon.ico` créé → fin du 404 `/favicon.ico` sur toutes les pages. (3) `<meta name="mobile-web-app-capable">` ajoutée à côté de l'`apple-` dépréciée (index, login, planning, pointage). Aucun rapport avec R-03 (qui est validé : pas d'erreur `Week/ShiftHours`) | (working tree) |
| D-82 | **Premier test d'intégration de routes** — `server.js` rendu *importable* : il **exporte `app`** et n'écoute/ne se connecte à Mongo que si lancé directement (`if (require.main === module)`) ; l'`setInterval` de nettoyage du rate-limiter passe en `.unref()` (n'empêche plus l'arrêt du process en test). Nouveau `tests/routes.test.js` (sans dépendance, `fetch` natif) : démarre l'app sur un port éphémère et vérifie `GET /auth/me` → **401** (sans session) et `GET /api/establishments` → **503** (middleware `checkDB`, base absente). Couvre le boot + les middlewares auth/DB **sans Mongo ni dépendance ajoutée**. Env de test forcé avant le require (pas de connexion à la vraie base). **Filet de départ** qui de-risque un futur R-04. **71 tests, 4 suites** | (working tree) |
| D-83 | **Agenda iCal désactivé (mis de côté)** — jugé pas assez fiable pour la prod (synchro iCal non temps réel, jusqu'à ~1 h de délai) → **désactivé derrière un flag** `CALENDAR_ENABLED` (défaut **false**, surchargeable via env `CALENDAR_ENABLED=true`). Serveur : `/api/calendar-url` et `/api/calendar/:token.ics` renvoient **404** si désactivé. Client : carte « 📅 Ajouter à mon agenda » **masquée** (flag `CALENDAR_ENABLED=false` dans `public/planning.js`, à garder aligné avec le serveur). **Code conservé** (routes, helpers ICS, carte, `REFRESH-INTERVAL` passé à 1 h) — réactivation = flipper les 2 flags. Permet de **merger `dev`→`main` sans chirurgie git** : le code calendrier part sur main mais **inerte** | (working tree) |
| **Sprint juillet 2026 — vue équipe, absences directeurs (E-19) & recherche** ||
| D-84 | **Vue « équipe » patron** (`index.html` + `script.js`) — onglet + `renderTeamDashboard` affichant les shifts du staff (lecture) | a4c53a9 |
| D-85 | **Recherche + filtres gestion staff** (`index.html` + `script.js`) — champ de recherche + filtres (établissement / groupe) sur l'onglet gestion du personnel (`renderStaffManageList`) | 6276481 |
| D-86 | **E-19 — Absences des directeurs** (`server.js` + `lib/utils.js` + `public/script.js` + tests) — un directeur n'ayant **pas** de `staff_id`, ses absences vivent dans une collection dédiée **`manager_time_off`** keyée sur `user_id`, **isolée du pipeline staff** (Option B : jamais planifiable comme un employé). Routes `requireDirecteur` : `POST` / `GET /api/me/manager-off`, `DELETE /api/me/manager-off/:id` (période `start/end_date`, helper pur `validateOffPeriod`, anti-chevauchement). Lecture patron/directeur/observateur : `GET /api/managers-off?from&to` **scopé par établissement** via helper pur `scopeManagerOff` (patron/observateur voient tout ; un directeur ne voit que les collègues partageant un établissement). UI patron : modale de déclaration (`openManagerOffModal`, `addManagerOff`, `removeManagerOff`) + fusion dans le **calendrier congés** récap (`loadCongesCalendar`, pastille rouge « DIR »). Couvert par `tests/manager-off.test.js` (`validateOffPeriod` + `scopeManagerOff`) | 5b056cf, 345a0b8, 6edca6d |
| D-87 | **Absences directeurs dans le sous-onglet Congés patron** (`public/script.js`) — le sous-onglet Congés (`loadCongesList`) n'interrogeait que `time_off` → un directeur en congé n'apparaissait **nulle part** dans cette liste. Fusion des absences `manager_time_off` (`GET /api/managers-off`) mappées en lignes **lecture seule** `status:'manager'` (badge « Directeur » bleu, sans validation), visibles sous « Tous » et « Validés », jamais « En attente » | ec8816f, a1ad283 |
| D-88 | **Recherche par début de mot** (`public/script.js` + `public/pointage.js`) — helper `matchesWordPrefix(text, query)` : « S » ne matche que les mots **commençant** par S (« Sophie », « Marie **S**anchez »), plus jamais ceux qui *contiennent* un s (« Lisa »). Remplace les 5 `normalizeStr(x).includes(...)` (recherche staff planning, congés, notes staff, gestion staff, suggestions pointage). Découpe sur tout caractère non-alphanumérique (espaces, tirets, apostrophes), insensible aux accents. ⚠️ helper dupliqué dans les 2 bundles (suivi reuse : à extraire dans `public/lib/` façon `ShiftHours`) | eff4fe3 |
| D-89 | **Header — navigation responsive** (`index.html`) — hauteur de header dynamique + sticky, simplification de la barre (masquage des boutons superflus sur mobile), visibilité de l'item menu utilisateur (hover + couleur) | bc5b04c, 22cca53, cec9b9f, 883f508 |

---

## P2 — Audit ergonomie restant (mai 2026)

Items 🟠 Importants / 🟡 Cosmétiques relevés par l'audit D-49 mais non corrigés (UX dégradée mais page utilisable). À planifier si demande terrain.

| ID | Description | Domaine | Statut |
|---|---|---|---|
| ~~U-01~~ | ~~`pointage.html` `.btn-save` utilise `var(--dark-surface)` au lieu de `var(--accent)`~~ | pointage / cohérence | ✅ Done — `.btn-save` bg `var(--accent)` + hover `var(--accent-soft)` (pointage.html ligne 191/197) |
| ~~U-02~~ | ~~`pointage.html` `.validated-badge` : couleurs en dur (`#6EE7B7`, `#d1fae5`, `#065f46`)~~ | pointage / tokens | ✅ Done — `.validated-badge` + `.shift-card.validated-card` + `.ecart-badge.pos/zero` migrés vers `--success-*` / `--validated-*` / `--gap-under-bg` ; tokens manquants ajoutés au `:root` de pointage.html |
| U-03 | `performance.html` `.targets-form` (3 inputs + bouton) sans `min-width` par groupe → wrap instable 360-400 px | performance / mobile | 🟠 |
| U-04 | `performance.html` `.kpi-sub` 11 px font-weight 400 sur fond clair → contraste / hiérarchie faible | performance / typo | 🟠 |
| U-05 | `planning.html` `.dispo-type-btn.selected-off` sur `--light-bg` (#f4f5f8) → état sélectionné peu distinctif | planning / contraste | 🟠 |
| U-06 | `index.html` ~74 styles inline avec couleurs en dur (`#fff8e1`, `#fde8e8`, `rgba(108,99,255,0.1)`) → maintenance fragmentée (refactor lourd, à reporter sauf bug visuel) | index / dette | 🟡 |
| U-07 | `politique-confidentialite.html` logo 34×34 vs standard 28×28, pas de breakpoint tablette (768-1024 px, saute desktop → mobile à 600 px) | politique / cohérence | 🟡 |
| U-08 | `performance.html` `.day-card.empty` utilise `#fffbf0` / `#b45309` au lieu de `--warning-*` | performance / tokens | 🟡 |
| U-09 | `index.html` `.resizer` timeline 16 px de large → difficile au doigt, mais élargir = risque de régression sur le drag/snap | index / timeline | 🟡 |

---

## Reste à faire — dette technique & refacto (incrémental)

**Décision juin 2026 : pas de réécriture big-bang.** Code en prod, ~17 000 lignes, quasi aucun test hors `lib/`. On avance par **petites extractions testées** sur le modèle de **D-73** (module UMD partagé navigateur/Node + tests `node --test` + délégué côté front, zéro changement de comportement). Refactor opportuniste, jamais « on arrête tout ».

| ID | Description | Priorité |
|---|---|---|
| ~~R-01~~ | ~~Unifier le calcul du lundi de semaine : `getMondayOf()` (front) ré-implémente `weekStart()`~~ | ✅ Done (D-74) — module UMD `public/lib/week.js`, 4 implémentations → 1, `tests/week.test.js` |
| ~~R-02~~ | ~~Extraire la logique de publication (`isAutoPublished` + flags `publish_<week>`) en source unique~~ | ✅ Done (D-78) — helper pur `isDatePublished` + `fetchPublishedWeeks`, 4 sites dédupliqués, heuristique 8j boguée corrigée |
| ~~R-03~~ | ~~Externaliser les `<script>` inline des HTML (`planning.html`, `pointage.html`) vers des `.js`~~ | ✅ Done (D-80) — `public/planning.js` + `public/pointage.js`, ordre de chargement préservé, ajoutés au précache SW |
| R-04 | Découper `server.js` (~4250 l, 101 routes) en routers par domaine (auth, shifts, dispos, pointage, calendrier, établissements). | ⏸️ **Reporté** (juin 2026) — zéro bénéfice utilisateur, **risque élevé** (101 routes, ~0 test de route, non testable en réel ici), et la dette qui coûtait est déjà traitée (R-01/02/03). **Déclencheurs** : (1) tests d'intégration de routes — **harnais en place (D-82)**, étendre la couverture du domaine **avant** de le découper, (2) onboarding d'un autre dev, (3) opportuniste — extraire un domaine quand on le retravaille déjà. Couplage à dénouer : `db` (variable module assignée après connexion → getter), 6 middlewares + ~10 helpers partagés, ordre des routes, 2 blocs `/* F-05 DÉSACTIVÉ */` |
| ~~C-01~~ | ~~Agenda : la carte « Ajouter à mon agenda » renvoie une erreur pour un directeur sans `staff_id`~~ | ✅ Done (D-76) — carte masquée si `!currentUser.staff_id` dans `initCalSync` |
| ~~C-02~~ | ~~Agenda : `PUBLIC_BASE_URL` pour figer le domaine des URLs `.ics`~~ | ✅ Done (D-79) — précédence `PUBLIC_BASE_URL > APP_URL > req-host`, `APP_URL` suffit |
| ~~C-03~~ | ~~`/api/dispos/non-affectees` à recréer en excluant `type:'off'`~~ | ✅ Done (D-76) — l'endpoint excluait **déjà** `off` (`$nin: ['week_note','off']`, server.js) ; note « à recréer » périmée |

---

## Notes pour les agents

- **Nom staff dénormalisé (D-77)** : `staff.name` est la **source de vérité**. Copies dénormalisées : `shifts.staff_name`, `availabilities.staff_name`, `users.name`. `PATCH /api/staff/:id` les propage toutes quand le nom change, et `GET /api/users` réenrichit le nom depuis staff. Si tu ajoutes une nouvelle copie dénormalisée du nom, branche-la sur cette propagation.
- **Timezone** : ne jamais utiliser `toISOString()` — toujours `getFullYear()/getMonth()/getDate()`. Voir `docs/architecture.md` §3.1. Helper pur : `toDateStr()` dans `lib/utils.js`.
- **Logique front** : `script.js` (patron, ~7300 l), `planning.js` (staff, ~2130 l, externalisé de planning.html en D-80) et `pointage.js` (~811 l, ex-pointage.html). Monolithiques — modifications additives et ciblées uniquement, pas de refactoring sans décision explicite. ⚠️ Charger les `<script src="/lib/…">` (dépendances `Week`, `ShiftHours`) **avant** le script qui les consomme.
- **server.js** : monolithique (~4250 lignes). Helpers purs dans `lib/utils.js` (testés). Split en routers = chantier futur (#10 backlog, voir R-04). ⚠️ **Deux blocs `/* F-05 DÉSACTIVÉ */`** : ne JAMAIS y ajouter de nouvelles routes — elles seraient invisibles à Express (cf. D-47). Les n° de ligne ont bougé depuis (server.js a grossi) — repérer les blocs par le marqueur de commentaire, pas par le n° de ligne.
- **Push & shift passé** : aucun push lié à un shift si `shift.date < toDateStr(new Date())` (B-10 / D-57). Ne touche pas les rappels dispos ni les notifs in-app patron.
- **Réouverture dispo** : `settings.dispo.force_open_staff[]` autorise un staff précis à soumettre malgré la deadline (E-15 / D-58), purgé à la soumission. Onglets « Sans dispo » (rouvrir simple) et « Modifier » (supprime les dispos existantes puis rouvre).
- **Dispos `type:'off'` (indispo, D-63)** : une indispo est purement informative — `start_time`/`end_time` = `null`. **Toujours l'exclure** des vues qui supposent un créneau horaire : `/api/dispos/confirmed` (overlay planning) et `/api/dispos/non-affectees` la filtrent déjà (`$nin: ['week_note','off']`, cf. C-03/D-76) ; ne jamais créer de shift à partir d'un off. Côté affichage, tester `dispo.type === 'off'` avant de formater des heures (sinon `NaN`).
- **Publication « semaine publiée ? » (D-78)** : utiliser `isDatePublished(dateStr, publishedWeeks, now)` (`lib/utils.js`, pur, testé) + `fetchPublishedWeeks()` (`server.js`, Set des lundis publiés). NE PAS réintroduire l'ancienne heuristique `|date - lundi| < 8 j` (boguée sur les semaines adjacentes). Le front passe par `/api/publish/:weekStart` (`{published, auto}`).
- **Tests** : `npm test` (zéro dépendance, `node --test`) — **71 tests, 4 suites** (`utils` + `shift-hours` + `week` + `routes`). Les tests d'intégration (`tests/routes.test.js`) requièrent `server.js` (qui exporte `app` et ne démarre/se connecte que si `require.main === module`), démarrent l'app sur un port éphémère et tapent des routes **sans base** (401 sans session, 503 via `checkDB`). Pour tester une route avec données, il faudra un faux `db` injectable (pas encore en place). ⚠️ le mode répertoire `node --test tests/` **n'est pas fiable** (échoue selon la version Node) : lister les fichiers explicitement dans `package.json`. Ajouter un test quand on extrait un helper pur, change une règle de date/heure, ou fixe un bug qui pourrait régresser.
- **Logique partagée navigateur/Node (D-73)** : pour qu'un helper soit à la fois consommé par le front (`<script src>`) ET testable sous Node, le mettre dans un **module UMD** sous `public/lib/` (ex. `shift-hours.js` → `window.ShiftHours` ; `week.js` → `window.Week`, + `require()` Node). Côté HTML, déléguer depuis une fonction de même nom pour préserver le hoisting et ne pas toucher les call sites ; charger le `<script src="/lib/…">` avant le script qui l'utilise. Quand un helper existait déjà côté Node (ex. `weekStart` dans `lib/utils.js`), faire **ré-exporter** `lib/utils.js` depuis le module UMD pour garder une source unique sans toucher les call sites serveur (R-01/D-74). Gabarit des prochaines extractions (R-02…).
- **`weekStart` vs `currentWeekStart` (D-75)** : `weekStart(date)` = lundi de la semaine d'une **date calendaire** (publication, mapping shift→semaine) — ne JAMAIS y mettre de cutoff. `currentWeekStart(now, cutoff=6)` = lundi de la **semaine opérationnelle à l'instant présent** (avant 6h le lundi → semaine précédente, car les fermetures ~2h appartiennent à la veille). Utiliser `currentWeekStart(new Date())` pour « quelle semaine est-on maintenant », `weekStart(X)` pour « semaine de la date X ». Seuil `WEEK_CUTOFF_HOUR=6` dans `public/lib/week.js` (≠ `cutoff_hour` pointage 9h).
- **Heures effectives d'un shift** : toujours passer par `shiftEffectiveHours(s)` (réel SI début ET fin pointés, sinon planifié). **Ne jamais** tester `real_start`/`real_end` séparément (mélange réel+planifié → durée fausse, bug D-71). Tester `!= null`, pas un falsy (`real_start = 0` = minuit, valeur valide).
- **Pointage (D-67)** : saisie restreinte au quart d'heure (`step="900"` + recalage `change` + `roundQuarter()` à l'enregistrement, car Android n'applique pas toujours `step`). Champs préremplis aux **heures planifiées** arrondies si pas encore pointé (hors services « extra »).
- **Purge dispos & notifs (D-68/69)** : `cleanupPastDispos()` (server.js, quotidien 10h) supprime **toutes** les dispos d'une semaine écoulée (`date < lundi` + `week_note` via `week_start`) ET les notifs dispos périmées (`rappel_dispo`/`rappel-dispo`). Ne purge **que** les types dispos. Effet de bord assumé : `/api/dispos/previous` (pré-remplissage) peut être vide en cas de saisie tardive sur une semaine déjà purgée.
- **Sessions (D-70)** : durée pilotée par la constante `SESSION_TTL_MS` (30 j), `rolling:true` + `touch()` sur `CustomMongoStore` → expiration **glissante** (déconnexion après 30 j d'inactivité, pas depuis le login). Toujours modifier la durée via la constante (cookie + store synchronisés).
- **Agenda iCal (D-72)** : `users.calendar_token` (raw, capability lecture seule). `GET /api/calendar/:token.ics` est **public** (pas de `requireAuth`, le token authentifie) — n'expose que les shifts du staff des semaines **publiées**. Datetimes en heure locale + `VTIMEZONE` Europe/Paris (DST gérée), passage minuit via arithmétique entière (jamais l'heure serveur). Ne jamais ajouter de route sous `/api/calendar/:token.ics` qui ferait fuiter d'autres données via ce token.
- **Joker** : `staff_id === '__joker__'` et `is_joker: true`. F-03 ajoute un champ `note`, F-06 (D-42) ajoute `joker_open: bool` + `joker_candidates[]` pour le système de candidatures staff. **Les jokers sont exclus des stats « Moy. par personne »** (D-39). Toujours tester l'identité Joker avec `is_joker || staff_id === '__joker__'` (anciens documents sans flag).
- **Timeline** : tester drag, resize et snap sur desktop ET mobile 390px portrait après chaque modification.
- **OPEN_TIME / CLOSE_TIME** : bornes métier décimales (ex. 9.5 = 09:30). `START_HOUR`/`END_HOUR` sont des entiers pour l'affichage uniquement.
- **Heures ≥ 24h** : convention interne pour les shifts de nuit (25.5 = 01h30 du lendemain). Toujours wrap avec `((h % 24) + 24) % 24` avant affichage.
- **CSP (helmet)** : `'unsafe-inline'` toléré sur `script-src`/`style-src` tant que les HTML contiennent des `<script>`/`<style>` inline. À retirer si on extrait tout.
- **Sentry** : désactivé par défaut, s'active seulement si `SENTRY_DSN` présent côté Railway.
