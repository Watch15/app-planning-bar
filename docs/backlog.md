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
| ~~F-12~~ | **Journal d'audit des dispos (historique des versions)** | Dispos / Traçabilité | ✅ **Fait le 2026-08-13.** Demandé le 2026-08-05. **Décisions du user** : conservation **3 ans** (calée sur la prescription des créances de salaire — la fenêtre où le litige devient chiffré) et **écran inclus dans le lot** (un journal qu'on ne lit qu'en base ne règle aucun litige le jour où il éclate). **Livré** : collection **append-only** `dispo_events`, keyée `(staff_id, date)` et **non** sur l'`_id` de la dispo — deux chemins la suppriment puis la recréent, donc l'`_id` ne survit pas à ce qu'on veut justement tracer ; `staff_name` dénormalisé pour rester lisible après suppression du profil. **Une porte d'écriture unique** `recordDispoEvents` (même raison qu'en F-14 : 8 sites qui construiraient chacun leur document divergeraient), qui **ne remonte JAMAIS d'erreur à l'appelant** — auditer est second par rapport à enregistrer, et une fonctionnalité de traçabilité ne doit pas devenir une panne de production. Helper pur `dispoEventDelta` : ne garde que les champs modifiés et **rend `null` si rien n'a changé** — sans ça, `POST /api/dispos` renvoyant la semaine ENTIÈRE à chaque enregistrement, chaque clic ajouterait 7 lignes « rien n'a changé » et le journal deviendrait illisible, donc inutile comme preuve. **8 points d'accrochage** : submit, update, confirm, reject, ignore, purge congé, réouverture pour correction, purge d'absence directeur, + matérialisation semaine-type (acteur = `system`, c'est LE cas où « je n'ai jamais saisi ça » est vrai). Les **trois suppressions silencieuses** lisent désormais avant d'effacer. Hors périmètre assumé : purge des dispos passées (expiration de routine) et renommage staff (ne change aucune déclaration). **Route** `GET /api/dispos/events` en lecture seule — ⚠️ **piège évité** : fusionner le `staff_id` demandé avec celui du périmètre aurait laissé l'un écraser l'autre, donc **S-04 contourné par l'audit** ; on teste l'appartenance au lieu de fusionner deux contraintes homonymes. **Écran** : onglet Historique de la modale Dispos, lecture seule (aucun bouton d'action — c'est ce qui lui donne sa valeur de preuve), navigation par semaine, filtre par nom, chaque ligne lisible sans décodage (« Diane · lun. 17 · a modifié sa dispo · horaires 19h→01h devenus 17h→00h · par Diane (directeur) · jeu. 13 août 14:11 »). **RGPD** : durée + finalité + accès consignés dans `politique-confidentialite.html`. **Vérifié en réel** : TTL de **1095 jours** présent sur la base, événement pesant **322 octets** (au-dessus de l'estimation 150-250 du constat d'origine, à cause du nom dénormalisé et de l'acteur complet). **22 tests, 10 mutations, 5 vérifications de smoke, écran contrôlé dans un navigateur.** ⚠️ **Compté après coup, à la demande du user, et le compte était faux** : 9 actions instrumentées mais **7 seulement sous test** — `purge_absence` et `template` étaient branchées sans que rien ne le prouve. Comblé le jour même. C'est le profil des tests vacants de F-14, en pire : il n'y avait même pas de test à rendre non vacant. **À refaire systématiquement** : comparer la liste des actions instrumentées (`grep -o "recordDispoEvents('[a-z_]*'"`) à celle des actions réellement assertées, plutôt que de se fier au sentiment d'avoir tout couvert. **9e et 10e lacunes de `fake-db`** : l'upsert de `bulkWrite` ne posait pas d'`_id` (alors qu'`insertOne` le fait depuis une session précédente pour la même raison) — **`confirm`/`reject`/`ignore` n'étaient donc pas testables sur un document réellement créé par la route** ; et `sort()` était un **no-op**, si bien que tout test d'ordre passait ou échouait par accident — or pour un journal, l'ordre EST le comportement. ~~Constat d'origine :~~ 🆕 Demandé le 2026-08-05. **Besoin** : en cas de litige patron ↔ employé (« j'avais mis dispo », « non »), pouvoir prouver qui a saisi quoi et quand — y compris les versions **avant** modification. **Le trou aujourd'hui** : `POST /api/dispos` fait un `bulkWrite` en **upsert** sur `(staff_id, date)` → l'ancienne version est **écrasée sans trace**, et le statut repasse en `pending`. Idem `PATCH /confirm` et `/reject` (statut écrasé sur place), la purge congés (`deleteMany` silencieux) et la purge d'absence directeur. **Rien n'est conservé.** **Piste** : collection **append-only** `dispo_events`, un doc par changement — `{ staff_id, date, at, by:{user_id, role}, action: 'submit'\|'update'\|'confirm'\|'reject'\|'ignore'\|'reopen'\|'purge_conge', before:{…}, after:{…} }`. **Contrainte « ne prend pas de place »** : ne stocker que le **delta** (champs réellement modifiés), pas le doc complet ; **index TTL** (durée à fixer, cf. RGPD) ; ~150–250 octets par événement. **Points d'accrochage** : `POST /api/dispos` (⚠️ le `bulkWrite` actuel ne lit pas l'avant → un `find` préalable est nécessaire), `PATCH /api/dispos/:id/confirm` `/reject` `/ignore`, `POST /api/dispos/reopen-for-correction`, la purge congés, `POST /api/me/manager-off`, et la matérialisation semaine-type. **UI** : lecture seule côté patron, historique par staff/semaine, « qui · quoi · quand ». **RGPD** : donnée salarié conservée à titre de preuve → durée de conservation à arrêter et à ajouter à `politique-confidentialite.html`. |
| ~~F-13~~ | **Comptes staff « fantômes » (archivés)** | Staff / Comptes | ✅ **Fait le 2026-08-11.** Demandé le 2026-08-05. **Sens confirmé** : « en gardant leur **erreur** » était bien « en gardant leurs **heures** » — la personne sort de la vie courante, tout son passé reste. **Livré** : champ `staff.archived` + `archived_at`, `PATCH /api/staff/:id/archive` (réversible), filtre unique `NOT_ARCHIVED` étalé dans les 6 requêtes concernées, refus de planifier un archivé (409), bouton Archiver/Réactiver et barre du personnel filtrée. **Décision du 2026-08-11** : les shifts FUTURS déjà placés sont **laissés en place** (archiver ne troue pas un planning annoncé) ; la réponse renvoie `upcoming_shifts` pour que le patron sache ce qui reste. **Trouvaille en route** : le login ne vérifiait **aucun** drapeau — `users.active` signifie « invitation en attente », pas « désactivé » ; avant F-13, couper un accès imposait de supprimer le compte. La coupure passe donc par le profil `staff`, source unique, plutôt que par un second booléen. 13 tests, 6 mutations attrapées. ~~⚠️ *À confirmer* : « en gardant leur erreur » lu comme leur historique / leurs heures.~~ *(constat d'origine, conservé pour mémoire : la seule sortie était `DELETE`, destructif ; rien ne distinguait « parti » d'« actif ».)* |
| ~~F-14~~ | **F-13 n'est appliqué qu'à une porte sur six** | Staff / Planning | ✅ **Fait le 2026-08-12**, le jour de son ouverture. **Livré** : (1) helper unique `resolveStaffForPlanning({staff_id, staff_name, is_joker})` — refus 409 sur les gestes UNITAIRES (`POST /api/shifts`, `PATCH /api/shifts/:id`, `PATCH /api/dispos/:id/confirm` avec `create_shift`, `POST /api/shifts/extra` y compris sa résolution PAR NOM) ; il rend le profil, ce qui supprime au passage un `findOne` en double sur `confirm` et sur `extra`. (2) **Copie de semaine et de jour : décision produit prise avec le user** — l'archivé n'est ni recopié ni supprimé, son créneau **passe en Joker** (le poste était tenu, il reste à pourvoir), et le compte rendu l'annonce (« 3 créneau(x) passé(s) en Joker »). Refuser les 40 shifts pour un seul archivé aurait été hostile, les supprimer aurait fait disparaître un poste en silence. (3) **Push : filtré dans `sendPushToStaff`**, pas chez les appelants — c'est la porte unique de TOUS les push staff **et** des notifs in-app, donc les 8 appelants sont couverts d'un coup au lieu des 2 relevés. La notif in-app tombe avec le push, volontairement : elle s'accumulerait dans une boîte que personne ne peut plus ouvrir. (4) `materializeAllManagerTemplates` **saute** le modèle d'un directeur archivé sans le supprimer (l'archivage est réversible — c'est la différence avec `DELETE /api/users/:id`, qui purge parce que le compte, lui, ne revient pas), et sans marquer `last_materialized_week` pour que la réactivation reprenne. (5) `DELETE /api/users/:id` **archive** désormais le profil staff au lieu de le laisser actif — le commentaire renvoyait la décision à F-13, qui est livré ; `archived_at` n'est posé que s'il manquait, pour ne pas écraser la date d'un départ plus ancien. (6) **Front** : `activeStaff` exposé à côté d'`allStaff` dans `loadAllStaff()` (`script.js` **et** `pointage.js`) — « qui je peux choisir » vs « quel nom porte ce shift passé ». 15 tests, `tests/staff-archive-portes.test.js`. **Ce que la mutation a rattrapé, et qui est la vraie leçon de ce lot** : trois tests sur quinze étaient **vacants** en première écriture. (a) Le test du cron passait au vert sans rien prouver — à la date d'exécution la deadline n'était pas franchie, donc `shouldMaterializeTemplate` sortait **avant** d'atteindre le contrôle d'archivage ; corrigé par `custom_deadline` sur un lundi **et** par un directeur actif servant de témoin. (b) Le test « Joker ouvert » ne prouvait **pas** le filtre de `sendPushToStaff` : la requête de `joker-open` filtre déjà en amont, donc deux gardes redondantes et aucune tenue — il a fallu ajouter la **publication de planning**, qui part d'un `shifts.distinct('staff_id')` non filtré, pour que le filtre soit réellement sous test. ⚠️ Le `...NOT_ARCHIVED` de `joker-open` reste donc **redondant et non couvert** : il est conservé pour que le prédicat « qui solliciter » se lise juste localement, mais c'est `sendPushToStaff` qui garantit. (c) 6 mutations vérifiées au total. **6e lacune de `fake-db`** trouvée en route : `$options` (modificateur de `$regex`) levait « opérateur non supporté », ce qui rendait la résolution par nom d'`extra` intestable — comblée. ~~Constat d'origine :~~ 🔴 **Ouvert le 2026-08-12**, trouvé par la revue d'altitude, PAS corrigé (c'est une extension de F-13, pas du nettoyage). L'archivage tient sur les chemins testés et **fuit sur les autres**. **1) Planification** — le refus 409 ne vit que dans `POST /api/shifts`. Cinq autres chemins écrivent un `staff_id` sur une date future sans le contrôle : `PATCH /api/shifts/:id` (remplacement — et le front PROPOSE les archivés, `openReplaceStaffModal`), `POST /api/copy-week` et `/api/copy-day` (le geste hebdomadaire le plus courant : l'archivé revient en masse dans un planning publié, avec push à la clé), `PATCH /api/dispos/:id/confirm` avec `create_shift`, `POST /api/shifts/extra` (résout même par NOM). **Remède** : un `resolveStaffForPlanning(staffId)` unique, obligatoire pour toute route qui écrit un `staff_id` dans `shifts`. **2) Push** — `PATCH /api/shifts/:id/joker-open` sollicite `find({ venues })` sans filtre, et la publication de planning notifie via `shifts.distinct('staff_id')` : une personne partie reçoit des sollicitations sur son téléphone **sans pouvoir s'en défaire**, puisqu'elle ne peut plus se connecter. **3) Semaine-type directeur** — `materializeAllManagerTemplates` ne lit pas le profil : un directeur archivé se matérialise des dispos `pending` **chaque semaine, indéfiniment**. Le pendant existe déjà pour `DELETE /api/users/:id`, qui purge les templates. **4) Front** — ~15 sites itèrent `allStaff`, 2 filtrent. Montrent encore un archivé : remplacement de staff, invitation de compte, onglet jours de repos, import des taux horaires, autocomplete du pointage. **Remède** : exposer `activeStaff` à côté d'`allStaff` dans `loadAllStaff()` — « qui je peux choisir » vs « quel nom porte ce shift passé ». **5) `DELETE /api/users/:id`** conserve le profil staff avec un commentaire qui dit « c'est F-13 qui doit régler ça » : F-13 est livré, ce chemin laisse toujours un fantôme actif dans la barre. | **Haute** — le point 1 (copie de semaine) et le point 3 sont visibles par le client |
| ~~B2-a~~ | **Horizon de saisie — le staff saisit plusieurs semaines à l'avance** | Dispos / Planning | ✅ **Fait le 2026-08-13.** Détail des décisions : `docs/design-b2-horizon-saisie.md` **§8**, qui fait autorité. **Deux réglages patron** (arbitrage du user) : `horizon_weeks` X = jusqu'où le staff saisit, `validation_horizon_weeks` Y = jusqu'où la file remonte, **Y ≤ X**, tous deux à 1 par défaut ⇒ **comportement d'avant B2 à l'identique, aucune migration**. Écrêtés à 12 semaines. **Ce que la préparation avait faux, et qui change le lot** : le §6 annonçait que distinguer « déposée » de « à valider maintenant » toucherait au modèle — **c'est faux**, la file est bornée `from`/`to` depuis toujours, donc l'état est **dérivable de la date** ; B2-a n'a touché à aucun schéma. **Livré** : (1) **le trou du §2.1 est fermé** — `POST /api/dispos` ne vérifiait AUCUNE date, la limite « semaine prochaine » vivait dans `planning.js` seul, donc elle était affichée et pas tenue ; elle refuse désormais hors horizon, dates passées comprises. (2) **Deadline règle A** — elle ne garde plus que la semaine en cours de collecte ; un lot partiellement figé n'est plus refusé en bloc (les jours de N+1 sont retirés, le reste passe, le compte rendu l'annonce — même choix qu'en F-14), un lot entièrement figé rend toujours 403 avec le message d'avant. (3) 🔴 **`GET /api/dispos/count` borné** : il comptait tous les `pending` sans borne de date alors que la file en avait une — avec 6 semaines saisies la pastille annonçait 40 et la file en montrait 7, **l'asymétrie de S-04 revenue sur l'axe du temps**. (4) **La garantie est structurelle, pas rattrapée à la main** : borne de saisie, pastille et file sortent toutes du **même** `disposHorizonRange` (`public/lib/week.js`, UMD) — `toDateStr` et `disposWeekStart` y ont migré depuis `lib/utils.js`, le front en portait déjà une copie manuelle. (5) **Remodif d'une dispo validée** : le shift déjà créé **passe en Joker** au lieu d'être supprimé (décision reprise de F-14 — supprimer ferait disparaître un poste en silence d'une semaine publiée), `notifyPatrons` l'annonce ; jamais si le shift est **pointé** (paie), jamais si la re-soumission est **identique** (`dispoMateriallyDiffers`, la note exclue). ⚠️ **Limite assumée** : rien ne relie un shift à sa dispo — on le retrouve par le triplet `(staff_id, date, establishment_id)`, donc un shift créé à la main par le patron sur ce même triplet est indiscernable et sera libéré aussi. (6) **Front, les deux côtés en navigation par semaine** — repris du système maison (`.week-nav` / `.week-arrow` / `.week-label` du planning, `index.html:862`) plutôt qu'un troisième style : **une semaine à l'écran, nettement séparée**, jamais empilée (6 semaines empilées feraient défiler 42 cartes pour en corriger une). Côté staff : navigation dans l'horizon, une note de semaine par semaine, semaine figée affichée comme telle au lieu d'un formulaire que le serveur refuserait. Côté patron : **« Tout confirmer » recadré sur la seule semaine affichée** — il portait sur tout le lot chargé, donc il aurait validé des dispos hors écran ; et comme la pastille compte tout l'horizon alors que la file n'en montre qu'une semaine, **les deux nombres sont affichés côte à côte** (« 8 en attente ici · 9 sur 2 semaines ») : sans ça la navigation réintroduisait elle-même l'asymétrie que ce lot venait de supprimer. Vérifié dans un vrai navigateur sur l'instance de recette (le front n'a aucun test, cf. T-03). (7) Index `availabilities` étendu à `{status, staff_id, date}` (ESR) — ⚠️ l'ancien `status_1_staff_id_1` en devient un **préfixe redondant, à dropper à la main en prod**. **27 tests**, non-vacuité vérifiée par mutation **sur les 7 gardes une par une** (la note de méthode le réclamait : elles sont en série sur le même chemin, profil exact des 3 tests vacants de F-14) — aucune vacante. **7e lacune de `fake-db`** trouvée, comme prévu par le §7 : `find()`/`findOne()` rendaient les **objets stockés** et non des copies, donc l'upsert mutait l'instantané « avant » et **3 tests échouaient sur du code correct en prod** ; comblée, et le code de prod corrigé indépendamment pour ne plus dépendre de l'identité d'objet. **Reste ouvert** : `force_open_staff[]` ne porte pas de semaine — rouvrir « pour Kevin » reste ambigu sur un horizon long (signalé au §3, non traité). |
| ~~F-15~~ | **Une action du staff ne doit pas altérer un planning publié** | Planning / Publication | ✅ **Fait le 2026-08-13**, demandé en cours de session. **La formulation littérale ne tenait pas, et l'avoir vérifié a évité de casser l'usage quotidien** : `isDatePublished` couvre l'**auto-publication** (`lib/utils.js:83` — semaine en cours et toutes les passées, sans aucun flag) et dépublier n'existe que pour les semaines **futures** ; verrouiller « toute semaine publiée » aurait gelé la semaine en cours et tout l'historique **sans porte de sortie** (plus de remplacement de dernière minute, plus de correction de pointage). **Périmètre arbitré avec le user : le staff seulement, le patron garde la main** — le seul périmètre qui n'exige aucun mécanisme de déverrouillage. **Audit des portes staff vers `shifts` : une seule était concernée** — `joker-candidature` n'empile qu'une candidature (le patron tranche), `shifts/extra` et le pointage écrivent des heures RÉELLES et sont réservés responsable/patron, `shift-swaps` est désactivé (F-05). Reste `POST /api/dispos`, c.-à-d. la conversion Joker livrée le matin même : sur une semaine publiée le créneau **reste au titulaire** et `notifyPatrons` envoie un message distinct (un Joker est un trou à combler, un créneau publié une décision à prendre). La **dispo** est enregistrée normalement — le verrou porte sur le planning, pas sur la disponibilité, sinon le staff n'aurait plus aucun moyen de dire qu'il ne peut pas venir. 3 tests, mutation vérifiée. |
| ~~B2-a bis~~ | **Réouverture nominative de la deadline, par semaine** | Dispos / Deadline | ✅ **Fait le 2026-08-13.** Point laissé ouvert le matin. **L'ambiguïté avait une conséquence concrète, pas seulement théorique** : `POST /api/dispos` purgeait `force_open_staff` après **tout** envoi réussi — rouvert pour la semaine figée, un staff qui enregistrait d'abord une semaine lointaine brûlait sa réouverture **sans avoir touché à la semaine à corriger**, puis restait bloqué sans aucun message. Chemin inexistant tant que l'horizon valait 1. **Livré** : forme `{ staff_id, week_start }` ; entrées **legacy** (chaînes nues) toujours honorées pour la semaine en cours de collecte, et purgées à la première utilisation ; purge conditionnée à la soumission effective de la semaine visée ; `reopen-for-correction` **portait déjà** la semaine (`from`) et la jetait ; pastille « 🔒 Rouvert » de `with-dispo` lue par semaine affichée. 11 tests, 6 mutations. **8e lacune de `fake-db`, et c'est la première qui coûte un bug et pas seulement du temps** : `$addToSet` n'était **pas implémenté du tout** alors que les deux routes de réouverture en dépendent — elles étaient donc **intestables**, ce qui est précisément pourquoi le défaut n'avait jamais été vu. Ajouté, avec le `$pull` par **critère** qu'exige la forme objet et le cas `$addToSet` en **upsert** (sans lui, la toute première réouverture se perdait en silence). |
| ~~B2-d~~ | **La lecture d'un planning passe par UNE porte** | Planning / Publication | ✅ **Fait le 2026-08-13**, trouvé par la revue d'altitude de `/simplify`. B2-b n'avait posé le filtre de publication que sur `GET /api/my-shifts` — **le défaut de F-13 (un refus sur une porte sur six) reproduit en LECTURE**. Deux autres routes rendaient des shifts à un compte staff sans aucun filtre : `GET /api/me/responsable-week`, qui rend le roster **nominatif ET les téléphones** sur une plage fournie par le client (donc plus que `my-shifts`), et `GET /api/shifts/joker-ouverts`, qui n'avait ni borne de date ni filtre — c'est `planning.js` qui bornait, dans le navigateur, et `joker-candidature` laissait ensuite postuler sur le Joker d'un brouillon. **Livré** : helper unique `publishedShiftFilter()`, pendant en lecture de `resolveStaffForPlanning`, par lequel passent désormais les trois routes. Et **`POST /api/dispos/week-note`**, l'autre écriture staff sur `availabilities`, reçoit les mêmes gardes que `POST /api/dispos` (horizon + règle A) : elle acceptait n'importe quelle semaine, sans deadline. 6 tests, 5 mutations. ⚠️ Le `.filter` du roster équipe est **inatteignable** (`pairs` dérive de shifts déjà filtrés) — conservé et étiqueté comme tel ; un commentaire antérieur prétendait le contraire, corrigé. |
| ~~B2-c~~ | **KPI dispos du responsable : navigable sur l'horizon** | Dispos / Pilotage | ✅ **Fait le 2026-08-13**, demandé par le user en fin de session. Le KPI « Dispos envoyées » du tableau de bord responsable était **figé sur la semaine prochaine**, libellé compris. Depuis que le patron règle un horizon de saisie, le staff peut envoyer plusieurs semaines à l'avance : un responsable bloqué sur N+1 ne voyait pas qui manquait au-delà — or c'est justement là qu'il reste du temps pour relancer. **Borné sur l'horizon de SAISIE (X), pas sur celui de validation (Y)** : au-delà de X personne n'a le droit d'envoyer quoi que ce soit, le KPI afficherait 0/N pour des semaines que nul ne pouvait remplir — un rouge qui n'accuse personne. Flèches placées **hors** de la ligne repliable, sinon un clic sur « semaine suivante » ouvrirait aussi la liste des manquants. Libellé dynamique (« semaine prochaine » puis les dates réelles) — l'ancien texte en dur aurait menti dès le premier clic. ⚠️ **Rectification de ma part** : j'avais dit à tort à ce sujet qu'il n'y avait rien à corriger, en raisonnant sur le tableau de bord (qui n'a pas de navigation) au lieu de raisonner sur l'horizon de saisie. |
| ~~B2-b~~ | **Horizon — semaines lointaines côté patron et staff** | Planning / UX | ✅ **Fait le 2026-08-13.** Détail : `docs/design-b2-horizon-saisie.md` **§10**. **La note se trompait, et il valait mieux le vérifier que le croire** : le §2.4 annonçait « pas un moteur, de l'ergonomie » — **faux sur deux points opposés**. (1) 🔴 **`GET /api/my-shifts` ne filtrait sur AUCUNE publication** : shifts, Jokers et collègues d'une semaine non publiée étaient lisibles par qui demandait la plage, le seul rempart étant que le client ne demandait pas ces dates. Règle **affichée, pas tenue** — le trou §2.1 de B2-a, sur l'axe de la publication. Ce qui tranche : **le flux iCal, sur la même donnée, filtrait déjà** ; l'intention produit était écrite dans le code, c'est la route quotidienne qui l'oubliait. (2) Une semaine lointaine **publiée** était **inatteignable** pour le staff (`planning.js` ne créait qu'un onglet, câblé sur N+1) : publier N+3 envoyait un push vers une page vide, donc publier loin était sans effet. **Livré** : `my-shifts` borné par `isDatePublished` (sans effet sur l'usage courant — semaine en cours et passées auto-publiées) ; `GET /api/my-published-weeks?weeks=N`, version par plage de la sémantique déjà présente dans `GET /api/publish/:weekStart` pour un staff, en 2 requêtes au lieu d'une par semaine, et qui **ne liste pas** une semaine publiée où le staff n'a rien (page blanche présentée comme un planning) ; vue staff « à venir » navigable, s'arrêtant à la dernière semaine publiée. **Non fait, volontairement, après vérification** : les repères du patron existaient déjà et suivaient la semaine affichée (`updatePublishBtnLabel`), et le KPI du responsable annonce déjà sa semaine — le tableau de bord n'ayant aucune navigation, le faire « suivre la semaine affichée » le pointerait sur la semaine EN COURS, deadline passée, donc pire. **10 tests** (`tests/planning-publication.test.js`), **3 mutations** non vacantes, **4 vérifications de smoke autoportantes** (le bloc crée son propre shift, le rend invisible/visible par la seule publication, puis efface et restaure — se contenter de constater « 0 shift » sur une semaine future serait passé au vert **sans la garde**, le jeu de recette n'y plaçant rien). ⚠️ **Deux `.filter(isVisible)` (Jokers, collègues) sont INATTEIGNABLES** — leurs requêtes sont bornées par des plages dérivées des shifts déjà filtrés ; les retirer ne fait tomber aucun test. Conservés comme garde-fou pour le jour où ces plages seront dérivées autrement, mais **étiquetés dans le code ET dans le nom des tests** : un intitulé qui promet plus que le test ne prouve fabrique une confiance fausse — mécanisme exact des tests vacants de F-14. | ✅ |
| ~~B2~~ | ~~**Horizon de saisie — planification à long terme**~~ | Dispos / Planning | 📐 *(constat d'origine, conservé pour mémoire)* **Préparé le 2026-08-12, pas commencé** — note de design : `docs/design-b2-horizon-saisie.md`. **Arbitrage du user** : les deux volets, **staff d'abord** (il saisit ses dispos sur plusieurs semaines), patron ensuite (ergonomie des semaines lointaines). **Ce que la vérification du modèle a montré, et qui change le périmètre** : (1) l'horizon d'une semaine **n'existe pas dans le modèle** — `POST /api/dispos` n'a aucun contrôle de semaine, la limite vit dans `planning.js` seul ; aucun changement de schéma n'est nécessaire, mais rien n'empêche non plus aujourd'hui de poster une dispo pour décembre ; (2) **le vrai obstacle est la deadline**, à valeur unique (`computeEffectiveDeadline`) — elle refuserait une saisie pour N+4 ; recommandation : elle ne garde plus que la semaine **en cours de collecte** ; (3) 🔴 **`GET /api/dispos/count` n'est borné par aucune date** alors que la file l'est (`from`/`to`) — avec 6 semaines saisies, la pastille annonce 40 et la file en montre 7 : **l'asymétrie de S-04, revenue sur l'axe du temps** ; (4) le patron peut **déjà** planifier loin (semaines futures non auto-publiées, copie multi-semaines) — B2-b est de l'ergonomie, pas un moteur ; (5) le long terme existe déjà **en négatif** (congés F-10, plages de dates non purgées) : B2-a en est le pendant positif. **4 questions ouvertes avant tout code** (dont : une dispo lointaine entre-t-elle dans la file tout de suite ? c'est le seul point qui pourrait toucher au modèle). | **Moyenne** — personne n'est bloqué aujourd'hui |

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

1. **R-06 corrigé** — `ensureDirectorStaffProfile()` recale `staff.venues` sur
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

### Palier 2 — sécurité (2026-08-05)

**S-01, S-02 et S-03 corrigés** (détail dans le tableau Sécurité ci-dessous). Nouveau
fichier `tests/perf-settings.test.js` (11 tests d'intégration), ajouté au script `npm test`.
**Tests : 160 → 171.** Non-vacuité vérifiée par mutation, guards testés **séparément** :
neutraliser `perfScopeDenial` fait tomber 4 tests, retirer `denyObservateurEdit` en fait
tomber 1, désarmer la 2e garde du harnais en fait tomber 20.

**S-04 tranché et livré** (cf. tableau) — périmètre par défaut + bascule, fermé comme
choix d'UX et non comme correctif de sécurité.

**Validation en masse** (demandée avec S-04). Le « Tout confirmer » qui existait était
**par carte staff** ; il est généralisé en `confirmDisposBatch(dispos, …)`, réutilisé par
la carte staff **et** par un bouton global « ✓ Tout confirmer (N) » qui agit sur toute la
file affichée. ⚠️ **Précision de modèle, à ne pas perdre** : une dispo en attente n'a pas
d'établissement — confirmer, c'est justement l'**affecter** à un bar (et créer le shift si
la case est cochée). Il n'existe donc pas de « valider pour tous les établissements » : le
**lot** varie (bascule S-04 : mon staff / tout le monde), la **cible reste un seul bar**,
choisie dans la modale. Garde-fou ajouté : si le lot contient des staff non rattachés au
bar choisi, le nombre exact est annoncé avant d'affecter. Boucle **séquentielle** assumée —
la route `confirm` vérifie l'absence de shift avant d'en créer un, deux requêtes parallèles
sur le même (staff, date, bar) pourraient franchir la garde ensemble.
**Suite possible** : une vraie route serveur de confirmation en lot (aujourd'hui N appels
HTTP depuis le client, hérité du bouton par carte) — non fait, pas demandé.

> **Mise à jour du 2026-08-13 — la cible n'est plus un bar unique pour tout le lot.**
> Demande du user : confirmer chaque dispo sur l'établissement de la personne. `patchEachDispo`
> accepte désormais un corps **par dispo** (fonction), et `confirmDisposBatch` vise le bar de
> chacun **quand il est certain**, c.-à-d. quand elle est rattachée à **un seul**. Aucun bar ou
> plusieurs ⇒ repli sur celui choisi dans la modale, dont le nombre exact est annoncé avant
> d'affecter. ⚠️ **Fait déterminant, mesuré sur la base client avant de coder** : sur 13 staff
> actifs, **11 ne sont rattachés à AUCUN établissement** et aucun n'en a plusieurs — la règle
> ne mordra donc réellement qu'à mesure que les profils seront rattachés dans « Gestion staff ».
> Et `venues` vide ne signifie pas « partout » : `staffDispoOpen` ne matche rien (`server.js:654`).

### Revue `/simplify` du palier 2/3 (2026-08-05)

**Corrigé.** Le plus important d'abord : **le garde-fou S-01 « harnais armé en prod » était
du code mort** — `TEST_HARNESS` exigeait déjà `NODE_ENV=test`, donc le croiser avec
`production` donnait une condition insatisfiable. Le commentaire promettait une protection
qui ne s'exécutait jamais, ce qui est pire que pas de protection. Remplacé par (a) une garde
**structurelle** `require.main !== module` — le harnais n'existe que si `server.js` est
*requis* (test), jamais s'il est *lancé* (`npm start`), donc **aucune variable d'env ne peut
l'armer** — et (b) un refus de démarrer testé sur la **variable brute**.
Ensuite : `perfScopeDenial` rend `{status, error}` au lieu d'une chaîne dont les 2 appelants
redérivaient le code HTTP par comparaison de littéral ; `pendingStaffScope` → `pendingScopeFilter`
qui rend un fragment de filtre (fini le tri-état `null`/`[]`/ids où le `[]` truthy piège) ;
**la pastille transmet enfin `scope`** — sans ça elle affichait 3 pendant que la file en
montrait 12, exactement l'asymétrie que mon commentaire prétendait corriger ; sections
« mon staff / Autres » du front conditionnées à `scope=all` (**code mort** depuis S-04 : le
serveur ne renvoyait plus que mon staff, le bandeau s'affichait toujours et la branche
« Autres » était inatteignable) ; `patchEachDispo` remplace les 2 boucles séquentielles par
des vagues parallèles **groupées par (staff_id, date)** — la course sur la création de shift
est préservée exactement là où elle existe, au lieu de faire payer 40 allers-retours en série
à tout le monde — et rapporte enfin les échecs au lieu de les avaler ; helper `askConfirm`,
`Map` d'index staff, handlers de modale libérés (ils retenaient le lot + tout le scope de
rendu sur des boutons permanents du DOM).

**Deux index manquants, ajoutés** (`server.js` au boot + `init-db.js`) : S-04 avait fait
passer `/api/dispos/count` d'un count **index-only** à un count avec fetch de tous les
`pending`, et introduit un **collscan de `staff`** à chaque rafraîchissement de pastille.
`{ venues: 1 }` sur `staff` et `{ status: 1, staff_id: 1 }` sur `availabilities`.

**Harnais de tests extrait** dans `tests/helpers/harness.js`. S-01 avait rendu le coût
visible : ajouter *une* variable d'env avait demandé la même édition dans 4 fichiers, et un
oubli aurait échoué en 401 opaque. Les 4 fichiers d'intégration s'y branchent ; la config
d'env vit désormais à **un seul endroit** (vérifié : `grep ALLOW_TEST_AUTH` ne la trouve plus
que dans `harness.js`), et la désarmer fait tomber **36 tests**.

**Écarté, remonté en backlog plutôt que corrigé ici** : S-05 et S-06 (trous de contrôle
d'accès **hors diff**, dont S-05 qui rend S-04 partiellement décoratif) ; un middleware
`requireEstablishmentAccess` qui remplacerait les **14 contrôles `canAccessEstablishment`
copiés à la main** et couvrirait les 5 routes qui les oublient (→ R-16) ; une route serveur
`POST /api/dispos/confirm-batch` ; la **péremption du périmètre en session** — `role` et
`assigned_establishments` sont figés au login et les routes qui les modifient n'invalident
pas les sessions (TTL 30 j), ce qui affaiblit S-02/S-03/S-04 à la fois (→ R-17).

### Palier 3 — outillage & documentation (2026-08-05)

**`graphify` réparé** (cf. Divers) et **DOC-01 → DOC-06 tous traités** (cf. tableau
Documentation). Deux choses à retenir plutôt que le détail :

1. **DOC-03 d'abord**, comme prévu : c'est le doc qui fait autorité sur E-22 et il se
   contredisait. Les passages annulés sont **marqués sur place** (~~barrés~~ + « SUPERSÉDÉ »)
   plutôt que réécrits — effacer ferait disparaître la trace qu'une décision a été prise
   puis annulée, ce qui est justement l'information utile. Un **§9** consigne les décisions
   du 2026-08-05 pour que la prochaine session ne les redécouvre pas dans le code.
2. **Le constat DOC-05 était partiellement faux** et il a fallu vérifier label par label
   contre le code : « 🔔 Sans dispo », « 👥 Mon équipe » et « 🔓 Rouvrir » existent
   toujours — la doc avait raison sur ces trois-là. 11 libellés réellement périmés corrigés.

**Leçon de méthode** : un audit de doc écrit dans une session précédente est lui aussi de
la doc — il vieillit et il se trompe. Le revérifier contre le code coûte peu et a évité
d'introduire 3 erreurs neuves ici.

### État actuel des tests (pour mémoire)

> ⚠️ Ce paragraphe décrivait l'état au 2026-08-05 (160 tests). **Chiffres à jour au
> 2026-08-13 : 366 tests, 16 fichiers**, `npm test` vert, `eslint` 0 erreur / 13 warnings.
> (243 au 2026-08-10, puis +25 F-13 et divers, +15 F-14, +3 revue `/simplify` de F-14,
> +42 B2 dans `tests/dispos-horizon.test.js` — horizon, règle A, Joker, semaine publiée,
> réouverture par semaine — +22 F-12 dans `tests/dispo-audit.test.js`, +16 B2-b/B2-d dans `tests/planning-publication.test.js`.)
>
> **`npm run smoke` : 51 vérifications** (28 au 2026-08-05), dont 8 pour B2-a, 5 pour F-12 et 4 pour B2-b.
>
> ⚠️ **Deux pièges de smoke rencontrés le même jour, et c'est le même piège.** Les deux
> contrôles `§9.1` supposaient la deadline franchie à l'heure du lancement : un jeudi, le
> premier passait **sans rien prouver** (personne n'était bloqué) et le second tombait en
> accusant le code. Puis la 1re version du bloc F-12 s'appuyait sur l'effet de bord du
> bloc précédent, et tombait au premier lancement pour se réparer toute seule au second.
> **Règle** : un bloc de smoke doit provoquer lui-même ce qu'il observe, et restaurer tout
> réglage qu'il pose. Une vérification qui dépend de l'état ambiant ne prouve rien de
> reproductible — dans un sens comme dans l'autre.
>
> ⚠️ **Piège de fixtures introduit par B2-a** : `POST /api/dispos` étant désormais borné
> par un horizon calculé à partir de MAINTENANT, les dates en dur (`2099-01-05`…) tombent
> hors plage. Le harnais expose `horizonWeekDates(n)` — l'utiliser dans tout nouveau test
> qui traverse cette route, plutôt que de recalculer « lundi prochain » à la main.

Deux niveaux : **128 unitaires purs** (`utils` 80, `shift-hours` 12, `week` 15,
`auth-guard` 21 — helpers de
`lib/utils.js` et des modules UMD, aucun Express, aucun `db`) et **115 d'intégration HTTP**
(`routes` 4, `dispos` 15, `conges` 12, `manager-off` 14, `manager-dispos` 25,
`perf-settings` 11, `estab-access` 33) qui démarrent la vraie app Express sur un port
éphémère et ne remplacent que Mongo, par `tests/helpers/fake-db.js`. Session simulée par
l'en-tête `x-test-user`, env centralisée dans `tests/helpers/harness.js`.
**Rien ne couvre le front ni un vrai Mongo** (pour le vrai Mongo : `npm run smoke`, 28 checks).

### À écrire

| ID | Ce qui n'est pas couvert | Faisable avec l'infra actuelle ? |
|---|---|---|
| ~~T-01~~ | ~~Boucle du cron `materializeAllManagerTemplates`~~ | ✅ **Fait le 2026-08-10**, en conséquence du changement de déclencheur : la matérialisation n'étant plus atteignable par une route, la tester est devenu **obligatoire** et non optionnel. Poignée `app.locals.runManagerTemplateCron` (même double garde que `setTestDb`), 6 tests d'intégration qui pilotent la boucle réelle — lecture des modèles, résolution du nom, jointure absences, marqueur. ⚠️ **Une branche reste non couverte** : « la deadline n'est pas encore franchie ». Elle est intestable ici (la deadline effective tombe toujours dans la semaine courante, donc aucun réglage ne la garantit future quel que soit le jour d'exécution) — couverte à l'unité sur dates gelées. |
| T-02 | Branche **ObjectId** de `managerOffPeriods` (`server.js`) : le filtre tolère `user_id` en chaîne **ou** en ObjectId, mais `fake-db` n'utilise que des chaînes → la branche ObjectId n'est **jamais exercée**. Si `manager_time_off.user_id` est stocké en ObjectId en prod, rien ne le prouve. | Non — exige un vrai Mongo |
| T-03 | **Tout le front** : `script.js`, `planning.js`, `performance.js`. Zéro test. Concerne notamment la modale dispos directeur, les statuts, le badge « Directeur ». | Non — aucune infra front |
| T-04 | Aucun test E2E navigateur. | Non |
| ~~T-05~~ | ~~Premier lancement d'E-22 contre la vraie base~~ | ✅ **Fait le 2026-08-05**, sur la base de recette `gestion_bar_dev` (cf. « Base de recette » ci-dessous). Vérifiés contre un **vrai Mongo**, pas `fake-db` : connexion réelle (les 3 rôles), **S-04** (patron 7 dispos / directeur 4 / `scope=all` 7, **pastille alignée** 4 et 7), **S-03** (200 sur son bar, 403 sur un autre, 403 en global, 403 pour un staff), **S-02** (patron→global 200, directeur→global **403**, directeur→autre bar 403, directeur→son bar 200, observateur 403 ; le `charge_rate:99` n'a atterri nulle part), **§9.1** (directeur accepté après deadline, staff refusé), **R-06** (réaffecter le directeur propage bien sur `staff.venues` et sa file suit). |

Limite assumée : les tests d'intégration sont **boîte blanche** (ils lisent `_docs` du faux
Mongo), donc couplés au nom des collections et des champs.

### Sécurité — à traiter

| ID | Point | Fichier |
|---|---|---|
| ~~S-01~~ | ~~`NODE_ENV` est le seul rempart du harnais de test~~ | ✅ **Résolu (2026-08-05)** — **double garde** : le harnais exige désormais `NODE_ENV === 'test'` **ET** `ALLOW_TEST_AUTH === '1'`, condensées en une constante `TEST_HARNESS` qui commande à la fois le middleware `x-test-user` et `app.locals.setTestDb`. Une seule variable oubliée dans une config de déploiement ne suffit plus. `ALLOW_TEST_AUTH` n'est utilisée nulle part ailleurs et aucune plateforme ne la pose. Refus de démarrer si la combinaison contredit `NODE_ENV=production` ; avertissement au boot dans les deux sens (harnais actif / `NODE_ENV=test` sans la 2e garde). Les fichiers de tests l'arment eux-mêmes → `node --test` marche sans passer par npm. **Non-vacuité vérifiée** : neutraliser la 2e garde fait tomber **20 tests** d'intégration. |
| ~~S-02~~ | ~~`PATCH /api/performance-settings` : contrôle d'accès seulement si `establishment_id` fourni + observateur non bloqué~~ | ✅ **Résolu (2026-08-05)** — helper `perfScopeDenial(user, establishmentId)` : **absence** d'`establishment_id` = doc global (dont `charge_rate` alimente tous les bars par fallback) → **patron/observateur uniquement** ; présence = `canAccessEstablishment`. Plus de chemin sans contrôle. `denyObservateurEdit` ajouté sur le PATCH. Son message a été généralisé (« Accès en lecture seule pour ce rôle », il disait « sur le planning ») et son commentaire d'invariant élargi : il ne garde plus seulement le planning. 6 tests. |
| ~~S-03~~ | ~~`GET /api/performance-settings` en `requireAuth` seul~~ | ✅ **Résolu (2026-08-05)** — passé en `requirePatron` + `perfScopeDenial`, exactement le contrôle que la route voisine `GET /api/performance` faisait déjà. Le seul appelant front (`performance.js`, chargé par `performance.html` seule) envoie toujours `establishment_id` → aucun client cassé. 5 tests. ℹ️ **Précision issue de la mutation** : l'exclusion du **staff** vient de `requirePatron`, pas de `perfScopeDenial` — c'est `requirePatron` qui porte cette moitié-là. |
| ~~S-05~~ | ✅ **Résolu (2026-08-06)** — `canAccessEstablishment` sur l'établissement cible : un directeur ne peut plus créer de shift dans un bar qu'il ne gère pas. **Volontairement PAS de restriction sur la dispo elle-même** : affecter un staff d'un autre bar au sien est légitime (dépannage), et cohérent avec S-04 qui n'est pas un cloisonnement. ~~Constat initial :~~ **`PATCH /api/dispos/:id/confirm` ne contrôlait RIEN sur l'établissement cible.** Relevé par la revue `/simplify` du 2026-08-05. Un directeur `assigned_establishments: ['bar1']` peut envoyer `{establishment_id:'bar2', create_shift:true}` sur n'importe quelle dispo dont il a l'`_id` : la dispo est affectée à bar2 et **un vrai shift y est créé**. Aucune vérification non plus que la dispo est dans son périmètre. **Conséquence directe : S-04 filtre l'AFFICHAGE d'une file dont l'ACTION reste globale** — et la bascule `scope=all`, ouverte à tout directeur, fournit les `_id`. C'est aussi ce qui rend le garde-fou « membres non rattachés » de `confirmDisposBatch` purement cosmétique : il vit dans le navigateur. **À faire** : `canAccessEstablishment` sur la route + refus si `staff.venues` ne contient pas le bar, avec opt-in explicite `{force:true}` envoyé par le client après confirmation. | `server.js` (route confirm) |
| ~~S-06~~ | ✅ **Résolu (2026-08-06)** — les 5 routes passent par le nouveau middleware. `recap-mensuel` scope désormais sur `userEstablishmentIds` quand le paramètre est absent (vérifié en réel : directeur `[Josy]`, patron `[Josy, Poni, FanFan]`). ⚠️ **Vérifié avant de brancher** : aucune de ces routes n'est appelée par les vues staff/pointage — elles ne servent que l'interface patron, donc restreindre ne casse rien. ~~Constat :~~ **même classe que S-03, ouverte sur 5 routes.** `GET /api/pointage/:date`, `GET /api/shifts/:establishmentId/:date`, `GET /api/week/:establishmentId`, `GET /api/week-full/:establishmentId` : `requireAuth` seul, sans `canAccessEstablishment` → n'importe quel compte staff connecté lit les shifts nominatifs (noms, horaires, pointages) d'un bar où il n'a jamais travaillé, l'id se devinant (slug `Nom_bar`). Et `GET /api/recap-mensuel` reproduit la forme exacte de S-02 : `establishment_id` **optionnel**, omis ⇒ **tous les bars**. | `server.js` (5 routes) |
| ~~S-04~~ | ~~`GET /api/dispos/pending` n'est scopé par aucun établissement~~ | ✅ **Tranché et livré (2026-08-05)** — helper `pendingScopeFilter(user, scope)` : un directeur ne reçoit par défaut que les dispos des staff dont les `venues` croisent ses `assigned_establishments` (même critère que `staffDispoOpen` et que le tri en sections déjà présent côté front). `GET /api/dispos/count` suit le même périmètre, sinon la pastille annonce 12 et la file en montre 3. ⚠️ **À enregistrer clairement : ce n'est PAS un cloisonnement.** `scope=all` est ouvert à tout directeur (bascule « Voir tout le staff ») — décision produit assumée. C'est le **défaut d'affichage** qui change, pas le droit d'accès ; un directeur curieux voit toujours tout s'il le demande. S-04 est donc fermé comme **choix d'UX**, pas comme correctif de sécurité. 5 tests. |

### Findings de revue restants (hors sécurité)

| ID | Point | Priorité |
|---|---|---|
| R-06 | **`staff.venues` ↔ `assigned_establishments`** — 🟡 **Partiellement résolu (2026-08-05).** Helper `ensureDirectorStaffProfile(userId)` (relit le user, la base fait foi) appelé par `PATCH /api/users/:id/establishments` **et** `PATCH /api/users/:id/role` ; recale `staff.venues` et **crée le profil staff manquant** en posant `users.staff_id` → plus de 400 permanent, plus besoin de `npm run backfill-directors`. Rétrograder ne détruit jamais le profil. `DELETE /api/establishments/:id` fait désormais le `$pull` **symétrique** sur `staff.venues`. 4 tests. ⚠️ **Reste ouvert, cf. R-15** : `PATCH /api/staff/:id` écrit `staff.venues` sans recaler `users` (sens inverse), et la règle « venues = assigned_establishments » existe en 4 copies littérales. | **Moyenne** (le blocage dispos est levé ; l'invariant n'est pas verrouillé) |
| ~~R-15~~ | ✅ **Résolu (2026-08-06)** — `syncDirectorAssignedEstablishments(staffId, venues)`, pendant symétrique de `ensureDirectorStaffProfile` : éditer les venues d'un directeur depuis « Gestion staff » recale son `assigned_establishments`. Les deux sens sont désormais câblés. Ne touche QUE les comptes `directeur` (ce champ n'a pas de sens ailleurs). 2 tests, mutation vérifiée dans les deux cas. ~~Constat :~~ **l'invariant R-06 n'est pas verrouillé — il repose sur un commentaire.** Relevé par la revue `/simplify` du 2026-08-05, angle altitude. 3 des 4 sites de mutation passent par le helper, mais **`PATCH /api/staff/:id` (`server.js:~1740`) écrit `staff.venues` sans recaler `users.assigned_establishments`** : le patron coche des bars dans « Gestion staff » sur une ligne de directeur (`GET /api/staff` ne les filtre pas, `public/script.js` PATCHe `venues` pour n'importe quelle ligne) → la saisie de dispos suit, l'accès aux écrans reste sur les anciens bars. Divergence atteignable en 2 clics. **Deux paliers possibles** : (1) mutateur unique `setUserEstablishments(userId, venues)` qui écrit les deux collections, plus aucun `$set: { assigned_establishments }` en direct — couvre 4/4 pour le même coût ; (2) **vraie** source unique : supprimer `users.assigned_establishments` pour le rôle directeur et le dériver de `staff.venues` (touche la session `server.js:~895`, 6 lectures serveur et 5 côté front — bien plus lourd). Alternative honnête au palier 1 : rendre `venues` non éditable sur un profil de directeur. | Moyenne |
| ~~R-04~~ | ✅ **Résolu (2026-08-06)** — corrigé **à la redirection** et non à l'émission, ce qui répare aussi les notifications DÉJÀ envoyées : `planning.js` renvoie le directeur vers `/#mes-dispos` (au lieu de `/` sec) quand il arrivait sur `#dispos`, et `script.js` ouvre alors sa modale de saisie. Devenu réel avec E-22 : le directeur a un profil staff, donc il reçoit ces rappels. ~~Constat :~~ les push de rappel dispo pointent vers `/planning.html`, page que le directeur ne peut pas ouvrir. | Moyenne |
| ~~R-05~~ | ✅ **Résolu (2026-08-06)** — un staff **existant** promu directeur GARDE son profil (taux, rôles, historique) : le `staff_id` fourni n'est plus ignoré. Et sans nom saisi, le profil prend l'identifiant de connexion (partie locale de l'e-mail, ou téléphone) au lieu de « Directeur » — N directeurs ne produisent plus N lignes homonymes. ~~Constat :~~ invitation directeur : nom générique `'Directeur'` si aucun staff choisi (N directeurs = N lignes homonymes) ; inviter un staff **existant** comme directeur crée un **second** profil staff (taux, rôles, historique restent sur l'ancien). | Moyenne |
| ~~R-09~~ | ✅ **Résolu (2026-08-06)** — chaque repli est désormais `await`é, et la chaîne se termine par une **réponse explicite** (page « Hors ligne », 503) pour ne jamais rendre `undefined` à `respondWith`. Même précaution sur le repli des assets statiques. ~~Constat :~~ `sw.js` : `caches.match(...) || caches.match('/login.html')` — `caches.match()` retourne une Promise, toujours truthy → branche login morte, et si `/index.html` manque du cache la chaîne résout `undefined` → erreur réseau au lieu du shell. | Moyenne |
| ~~R-10~~ | ✅ **Résolu (2026-08-06)** — handler `change` passé en `async` + `await loadTargets()` avant `loadData()`. `targets` est module-level et colore les pastilles (ok/bad) : sans l'attente, le premier rendu d'un bar utilisait l'objectif du PRÉCÉDENT — des couleurs fausses présentées comme justes. ~~Constat :~~ `performance.js` : `loadTargets()` non-awaité dans le handler `change` d'établissement → le premier rendu colore les pastilles contre l'objectif du bar **précédent**, ce qui vide E-24 de son sens. | Moyenne |
| ~~R-12~~ | ✅ **Résolu (2026-08-06)** — le profil staff du directeur est créé **APRÈS** `users.insertOne`, via `ensureDirectorStaffProfile` (même helper que R-06) : plus d'orphelin si l'insert échoue. `DELETE /api/users/:id` purge désormais `manager_dispo_templates` (config pure — sinon le cron matérialiserait la semaine-type d'un compte supprimé). ⚠️ **Le profil `staff` est CONSERVÉ volontairement** : shifts passés, pointage et masse salariale le référencent, le supprimer ferait perdre son nom dans les récaps déjà édités. Il reste donc sans compte associé — c'est **F-13** qui doit trancher, pas un nettoyage. ~~Constat :~~ orphelins : profil staff créé **avant** `users.insertOne` (échec = staff fantôme) ; `DELETE /api/users/:id` ne supprime pas le profil lié ni son `manager_dispo_templates`. | Basse |
| ~~R-13~~ | ~~Requête `users.findOne` de trop sur `POST /api/dispos`~~ | ✅ **Résolu (2026-08-05)** — `managerOffPeriods(…, knownUserId)` : la session porte déjà l'`_id`, la recherche du user disparaît. **Première tentative rejetée par la revue** : court-circuiter l'appel sur `req.session.user.role === 'directeur'` économisait la requête mais introduisait un trou — le rôle en session est figé au login, un compte promu directeur aurait perdu la jointure `manager_time_off` jusqu'à sa reconnexion et aurait pu poser une dispo un jour d'absence déclarée. La version retenue ne teste aucun rôle. Les 2 lectures restantes (`time_off` + `manager_time_off`) sont passées en `Promise.all`. ⚠️ **La 2e moitié du constat était fausse** : le `users.find` de `/api/dispos/pending` est porteur (repère `is_directeur`) — conservé délibérément. |
| ~~R-14~~ | ~~Résidus inertes~~ | ✅ **Traité (2026-08-05)**, partiellement. `is_manager` : commentaire explicite ajouté aux **2** sites d'écriture (`server.js` `createManagerStaffProfile`, `scripts/link-director-staff.js` — le 2e était `backfill-director-staff.js`, supprimé par A-09, le commentaire a suivi) — « informatif, aucun code ne le lit, ne filtre NI la paie NI rien ». Le constat disait 3 sites : le 3e (`public/script.js:5287`) est un **autre objet** (marqueur de période de congé) et il **est lu** (`:5343`) — rien à faire. **Reste ouvert** : le champ `establishment_id` résiduel sur les docs `manager_dispo_templates` déjà en base — donnée, pas code : exige un script de migration, non fait. | Basse |
| R-16 | 🟡 **Partiellement résolu (2026-08-06)** — le middleware `requireEstablishmentAccess(pick, { whenAbsent })` existe (3 modes : `deny` / `patronOnly` / `allow`) et couvre **6 routes**. `userEstablishmentIds(user)` devient la **source unique** du périmètre, et `canAccessEstablishment` en dérive. Le cas particulier `role !== 'etablissement' && …` est supprimé des 5 sites qui le portaient. ⚠️ **Rectification** : j'ai d'abord annoncé que ça fermait un trou — **c'est faux**, ces 5 routes avaient chacune leur propre garde ; c'est une simplification, pas un correctif. **Inventaire fait le 2026-08-06 — et il change la conclusion** : sur 20 sites de contrôle, **~10 seulement sont migrables**. Les autres lisent l'établissement dans un DOCUMENT chargé par le handler (`existing.establishment_id` d'un shift, `swap.from_establishment_id`, la cible d'une dispo…) : un middleware ne voit que la requête, il ne PEUT PAS les couvrir. Pour ceux-là, l'appel inline juste après le chargement **est la forme correcte, pas une dette**. La distinction est documentée sur le middleware. `GET /api/performance` migré en exemple. **Reste** : ~9 routes migrables, valeur = cohérence, pas sécurité (elles sont déjà correctes). ~~Constat :~~ **il manque un middleware `requireEstablishmentAccess`.** Relevé par la revue `/simplify` du 2026-08-05 : `server.js` contient **14 copies inline** de `if (!canAccessEstablishment(...)) return res.status(403)`, et **5 routes qui l'oublient** (cf. S-06). `perfScopeDenial` en a ajouté une 15e forme. 14 contrôles manuels contre 5 oublis, c'est la définition d'un middleware manquant. **Piste** : `requireEstablishmentAccess(pick, { whenAbsent })` avec 3 modes (`patronOnly`, `deny`, `scopeAll`) monté déclarativement, ce qui rend les oublis greppables. La partie vraiment spécifique à la perf (le doc global dont `charge_rate` retombe partout) reste près de la route. | Moyenne |
| ~~R-17~~ ✅ | **Le périmètre d'un utilisateur est figé au login.** **Corrigé le 2026-08-08 — par invalidation des sessions, PAS par `session_epoch`.** L'epoch aurait coûté une lecture Mongo sur *chaque* appel authentifié, pour un événement qui survient quelques fois par an ; on paie plutôt une fois, au moment du changement. Helper `invalidateUserSessions(userId)` → `sessions.deleteMany({ 'session.user._id': … })`. Le store étant Mongo, l'effet est immédiat sur toutes les instances. **Cinq portes fermées** : `PATCH /users/:id/role`, `/establishments`, `DELETE /users/:id` (un compte supprimé restait utilisable 30 j), reset de mot de passe, et surtout **`PATCH /staff/:id` via `syncDirectorAssignedEstablishments`** — la porte la plus empruntée, puisque le patron change les bars depuis l'écran staff. `DELETE /staff/:id` invalide aussi : sinon la session garde un `staff_id` mort (mécanisme de l'incident « Antoine Bozo »). Forme du document de session vérifiée sur la base client réelle. | ✅ |
| ~~R-11~~ | ~~`PUT /api/me/manager-dispos/week` sans borne temporelle~~ | ✅ Résolu — route supprimée par la correction E-22 |

### Questions en attente de réponse

1. ~~Emojis de la barre de navigation principale et du drawer mobile~~ — ✅ **Tranché (2026-08-05) : retirés.** Onglets, sous-onglets, `.header-nav` et drawer sont nettoyés. **Conservés** : 🔔 (notifications, exception demandée), et les boutons **sans libellé** dont l'icône EST le bouton (⚙ paramètres dispos, ☰ menu mobile) — les vider laisserait un bouton blanc. Les 3 zones voisines (menu utilisateur, chips de filtre Congés, boutons d'action + titres de modale concernés) ont été nettoyées dans la foulée. **Restent, hors périmètre demandé** : les icônes de statut injectées par le JS (`script.js` — ⏳ badges de congés), les placeholders de recherche (🔎/🔍/⏰), quelques libellés internes de modale (🔁 Ma semaine-type, 💶 Import taux, ⬆ Import CSV, 👥 Garder les staffs, 🔒 mention RGPD) et le hint ★ de la barre staff. Non touché aussi : `⇄ Échanges`, dans le bloc F-05 commenté — reviendra avec le symbole si F-05 est réactivé.
2. **Décocher un jour puis enregistrer ne supprime pas la dispo** côté serveur (`POST /api/dispos` ne fait qu'upsert). Limite **partagée avec le flux staff** — la corriger pour tout le monde, ou laisser ?
3. **T-01** (test de la boucle cron) : à écrire maintenant ou plus tard ?
4. ~~Le directeur tombe désormais sous la deadline des dispos~~ — ✅ **Tranché (2026-08-05) : exempté.** Helper pur `dispoDeadlineWaived(settings, role, staffForceOpen)` dans `lib/utils.js`, trois portes dans l'ordre : `force_open` global → réouverture nominative → rôle `directeur`. Utilisé aux **deux** endroits (`POST /api/dispos` et `GET /api/dispo-settings`) pour que le client n'affiche jamais un formulaire que le serveur refusera, ni l'inverse. Nouveau champ `deadline_waived` dans la réponse ; `planning.js` affiche « Deadline dépassée le … — saisie encore ouverte pour toi » au lieu d'une deadline périmée présentée comme courante. **Portée volontairement étroite** : l'exemption ne lève QUE la deadline. `staffDispoOpen` (ouverture par établissement) continue de s'appliquer au directeur — la vraie cause du blocage sur ce front était R-06, désormais corrigé. 5 tests unitaires dont un qui vérifie que l'exemption ne fuit vers **aucun** autre rôle, + 3 tests d'intégration. **Reste à décider si le cas se présente** : que faire si le patron ferme la saisie sur TOUS les bars du directeur — aujourd'hui il est bloqué comme les autres.
5. ~~**F-13** : « en gardant leur **erreur** » — lu comme *leur historique / leurs heures*. À confirmer avant tout code.~~ ✅ **Répondu le 2026-08-11 : c'était bien « leurs heures ».** À l'oral les deux se confondent. La lecture était la bonne, mais elle a attendu six jours d'être confirmée parce que personne ne l'avait posée — poser la question a coûté une minute.

### Documentation — contradictions relevées (audit du 2026-08-05)

Vérifiées **contre le code actuel**, pas supposées. **✅ Toutes traitées le 2026-08-05**
(palier 3) — le détail de ce qui a été fait est dans chaque ligne.

| ID | Où | Ce qui est faux / contradictoire |
|---|---|---|
| DOC-01 | `docs/prd.md:187-190` (§3.9.ter) | **Faux sur deux points.** « Un directeur n'a pas de profil `staff` (`staff_id` null **par design**) » et « un directeur n'est **jamais planifiable ni compté** comme un employé ». E-22 Modèle A a inversé les deux : tout directeur a un profil staff (`createManagerStaffProfile`), il est planifiable, et la décision arrêtée est **paie = COMPTÉ**. Un lecteur qui commence par le PRD conclut l'inverse de ce que fait le code. ✅ **Corrigé (2026-08-05)** — le paragraphe est remplacé par un rectificatif daté qui dit explicitement que les deux affirmations étaient fausses et renvoie à `design-e22-dispos-directeur.md`, qui fait autorité. La partie vraie (collection `manager_time_off` distincte) est conservée, avec sa vraie raison : historique (E-19), pas « le directeur n'a pas de staff_id ». |
| DOC-02 | `docs/onboarding.md:148` | **Faux.** « keyé sur `user_id` (un directeur n'a **pas** de `staff_id`) ». Même inversion que DOC-01. Le fait que `manager_time_off` reste keyé sur `user_id` est vrai ; la justification donnée ne l'est plus. ✅ **Corrigé (2026-08-05)** — la justification fausse est remplacée : le keyage sur `user_id` est une raison **historique**, et la collection est désormais **jointe** au filtre congés de `POST /api/dispos` via `managerOffPeriods`. |
| DOC-03 | `docs/design-e22-dispos-directeur.md` | **Se contredit lui-même.** §Décisions (l. 44) « v1 = saisie semaine par semaine, **auto-validée** » et §6bis Phase 1 (l. 123) « statut **`confirmed` d'office (auto-validé)** » — alors que §8 (2026-08-04) impose `pending` + **validation patron**. Les sections antérieures n'ont pas été marquées comme supersédées. ⚠️ Omission de la session du 2026-08-04 : c'est le doc qui fait autorité sur E-22, à corriger en premier. ✅ **Corrigé (2026-08-05), en premier comme prévu.** Les 3 passages annulés (§Décisions l.44, §1 Besoin, §6bis Phase 1) sont marqués ~~barrés~~ + « ⛔ SUPERSÉDÉ par §8 » **là où ils sont** — les effacer supprimerait la trace qu'une décision a été prise puis annulée. Ajout d'un encadré « comment lire ce document » (couches, la plus récente en premier) et d'un **§9** qui consigne les décisions du 2026-08-05 : exemption de deadline (9.1), resync `staff.venues` (9.2), périmètre de la file + corollaire sur la validation en masse (9.3). |
| DOC-04 | `README.md:222` | **Ambigu, devenu trompeur.** « `manager_time_off` — keyé sur `user_id`, **isolé du pipeline staff** ». La collection l'est toujours ; le **directeur**, lui, ne l'est plus. Formulation à préciser. ✅ **Corrigé (2026-08-05)** — formulation précisée : la **collection** reste distincte, le **directeur** ne l'est plus. |
| DOC-05 | `README.md:290/292/295`, `docs/prd.md:125-129, 139, 161, 165, 176, 193, 279` | **Périmé depuis le nettoyage des emojis** (2026-08-05). La doc décrit l'UI actuelle avec des libellés qui n'existent plus : « 📋 En attente », « 🔄 À réaffecter », « 📝 Notes », « 🔓 Modifier », « 🌴 Congés », « 👥 Mon équipe », « 👥 Staff », « 📊 Excel »… Cosmétique, mais nombreux. **N'inclut pas** les entrées historiques `D-xx` de ce backlog, qui décrivent l'état au moment de la livraison et n'ont pas à être réécrites. 🟡 **Corrigé (2026-08-05), et le constat était partiellement faux.** 11 libellés remis à jour (3 dans `README.md`, 8 dans `docs/prd.md`) : « 📋 En attente », « 🔄 À réaffecter », « 📝 Notes », « 🔓 Modifier », « 📊 Excel », « 👥 Staff », « 🌴 Congés » (l'onglet). **Mais** « 🔔 Sans dispo », « 👥 Mon équipe » et « 🔓 Rouvrir » existent **toujours** dans le code (`index.html:1198`, `planning.js:240`, `script.js:6369+`) — la doc avait raison, le constat avait tort de les lister. Vérifié label par label contre le code, pas au jugé. |
| DOC-06 | `graphify-out/` | **Périmé par construction.** `GRAPH_REPORT.md` date du 2026-07-31 : antérieur à E-22 v2 **et** à sa correction. Il décrit donc des routes supprimées (`PUT /api/me/manager-dispos/week`…) comme existantes. Aggravé par le fait que `CLAUDE.md` **impose** de l'interroger en premier pour toute question d'architecture (cf. Divers). ✅ **Résolu (2026-08-05)** — `graphify update .` **passe de nouveau** (il refusait depuis une session précédente) : 1045 nœuds, 1699 arêtes, 72 communautés ; l'ancien graphe est sauvegardé dans `graphify-out/2026-08-05/`. **Fraîcheur vérifiée, pas supposée** : les routes supprimées par E-22 (`manager-dispos/week`) sont à **0 occurrence**, et les 5 helpers créés cette session (`dispoDeadlineWaived`, `ensureDirectorStaffProfile`, `perfScopeDenial`, `pendingStaffScope`, `confirmDisposBatch`) sont bien présents. |

**Non audités** (hors périmètre de cette passe, aucune vérification faite) : `docs/architecture.md` (2026-06-12), `docs/methodologie-et-cicd.md`, `docs/ux-design.md`, `task.md`, `ui_kits/*.md` — tous antérieurs de 2 à 4 mois, donc **présumés dérivés**.

### Base de recette (2026-08-05)

**Ce qu'on a évité.** `npm run init` visait une base écrite **en dur** (`gestion_bar`) et
faisait `deleteMany({})` sur `users`, `staff`, `shifts`, `sessions`. Avec le `.env` de prod
dans le dossier — c'était le cas — la commande **effaçait les comptes réels**, sans
confirmation ni message. Trois autres scripts avaient le même défaut.

**Mise en place.** `MONGO_DB` choisit la base (défaut : `gestion_bar`, comportement
inchangé) ; `ENV_FILE` choisit le fichier d'env. `scripts/_db.js` centralise la connexion
et **refuse tout script destructif visant `gestion_bar`** sauf `--force` explicite (vérifié :
le refus se déclenche). `.env.dev` → même cluster, base `gestion_bar_dev`,
`NODE_ENV=development` — indispensable, car `production` met le cookie de session en
`secure:true` et **la connexion échoue en silence sur http://localhost**.
`scripts/dev-run.js` pose `ENV_FILE` par **spawn** et non `require`, pour que l'enfant garde
`require.main === module` : sinon le `app.listen` ne part pas *et* la garde structurelle du
harnais de test (S-01) basculerait du mauvais côté.

    npm run dev:seed      # (re)construit gestion_bar_dev — idempotent
    npm run dev:server    # serveur sur cette base, http://localhost:3000

**Jeu de données** (`scripts/seed-dev.js`, dates **relatives** donc il ne périme pas) : 3
bars, 6 comptes couvrant les 4 rôles, staff réparti pour rendre le périmètre S-04
**observable** (Alice/Bruno sur Josy = bar du directeur, Chloé/David ailleurs), un directeur
avec profil staff + `venues` (E-22/R-06), semaine passée avec heures réelles + CA (récap,
pointage, coefficient), semaine courante publiée, Joker ouvert, 7 dispos en attente dont
celle du directeur, congés posés, absence directeur, deadline volontairement dépassée pour
tester l'exemption sans attendre.

**Cluster partagé, dossier partagé.** `gestion_bar` (1,9 Mo, 253 shifts) et
`gestion_bar_dev` (88 Ko) cohabitent sur le même cluster Atlas, avec les **mêmes
identifiants** dans les deux fichiers d'env. La séparation tient donc à `MONGO_DB` + le
garde-fou. Un vrai cloisonnement demanderait un second cluster ou un utilisateur Atlas
restreint à `gestion_bar_dev` — à envisager si la recette devient une habitude.

### Environnements & déploiements (2026-08-05)

**Le problème constaté.** Le Railway `main` (env prod), dont le rôle déclaré est
« vérifier que la CI/CD fonctionne », est **branché sur la MongoDB de Castanui**, le premier
client. Deux conséquences, la seconde bien plus grave que la première :
1. Deux instances sur la même base ⇒ **deux crons**. Tous les jours à 10h, le staff de
   Castanui reçoit ses rappels de dispos **en double**. ⚠️ *Rectification* : ce sont des
   **push uniquement** (`sendPushToStaff` ×3 dans `checkDispoRappels`), **pas** des SMS —
   Twilio ne sert qu'aux invitations et aux resets. Pas de surcoût, mais visible côté client.
2. **Une cible de test est câblée sur des données client.** Le cron n'y fait pas que lire :
   `cleanupPastDispos` et `cleanupOldJokers` **suppriment**. Et le jour où une release se
   valide en lançant un script depuis ce contexte, on écrit chez le client.

**Livré (code).** Deux garde-fous, `true` PAR DÉFAUT — un déploiement client dont les
variables ne changent pas garde exactement le comportement actuel :
- `OUTBOUND_ENABLED=false` ⇒ l'instance ne peut joindre personne : ni Resend, ni Twilio, ni
  Web Push. Les notifications **in-app** restent écrites (elles ne sortent pas du système).
  `sendEmail`/`sendSMS` **lèvent** au lieu de faire semblant : les 11 appels sont dans un
  `try/catch` qui bascule sur le repli « lien manuel » — donc en dev le lien d'activation
  s'affiche à l'écran, ce qui est plus pratique qu'un mail non parti.
- `CRON_ENABLED=false` ⇒ aucune tâche planifiée. Nécessaire même après découplage : deux
  **replicas Railway** du même service rejouent le doublon.
- Log de démarrage récapitulatif (base · envois · tâches) — la ligne qu'on relira le jour
  où un client reçoit un rappel en double.
- Posés à `false` dans `.env.dev`.

**Reste à faire, côté Railway (non fait — accès dashboard requis)** : repointer `main` sur
une base à lui (`MONGO_DB=templyo_main`, même cluster que dev, gratuit) et y poser les deux
flags à `false`. Sur `dev` : `OUTBOUND_ENABLED=false` et `CRON_ENABLED=true` (le cron devient
observable sans danger puisqu'il ne peut plus rien envoyer — utile pour T-01).
Sur **Castanui** : ne rien changer, les défauts préservent le comportement.

**Trajectoire décidée** : un déploiement + une base par client d'abord, app multi-clients
ensuite. Deux conséquences à garder en tête :
- Le modèle par client ne tient que si le déploiement reste **automatique**. `npm run init`
  est destructif, ce n'est pas un outil de migration : toute évolution de schéma doit être
  **idempotente et appliquée au boot** (c'est déjà le cas des index ajoutés aujourd'hui).
- Pour le multi-clients, le travail utile commence maintenant et ne demande aucun code
  spécifique : **R-16**. Le cloisonnement est aujourd'hui dispersé en 14 copies de
  `canAccessEstablishment` + 5 routes qui l'oublient. Le jour où il faudra un `tenant_id`
  sur chaque requête, on voudra **un seul endroit** où ce filtre vit. R-16 n'est pas du
  nettoyage, c'est la préparation du multi-clients.

### `npm run smoke` — tests de bout en bout sur une instance réelle (2026-08-05)

**Le trou qu'il comble.** `npm test` (176 tests) tape un **faux Mongo** : il prouve la
logique, pas le câblage. Rien ne vérifiait qu'une instance déployée fonctionne vraiment —
c'était T-05, refait à la main à chaque fois. `scripts/smoke.js` parle HTTP à un serveur qui
tourne, sur une vraie base, et rejoue les parcours anciens **et** nouveaux.

    npm run smoke                                   # → http://localhost:3000
    SMOKE_URL=https://dev.templyo.fr npm run smoke

**20 vérifications** : socle (session, établissements, staff, planning patron, planning
staff, rejet anonyme), S-04 (périmètre, bascule, pastille), S-02/S-03 (lecture et écriture
des réglages perf par rôle, + contrôle que la valeur interdite n'a pas atterri), §9.1
(directeur accepté / staff refusé après deadline), F-10, R-06 (réaffectation puis remise en
état). Sortie `0` / `1` → **exploitable en CI ou après déploiement**, vérifié dans les deux sens.

⚠️ **Garde-fou** : il se connecte avec les comptes `@templyo.test` de `seed-dev.js`. Sur une
base client ils n'existent pas → arrêt à la première étape, **sans rien écrire**. C'est
délibéré : ce script ÉCRIT (dispos, validations, réaffectation), il ne doit jamais viser un
client. Vérifié : mauvais identifiants ⇒ arrêt immédiat, code 1.

### Environnement `main` — cluster dédié (2026-08-05)

`main` a désormais **son propre cluster Atlas**, vierge et distinct de celui de dev (choix
du client, meilleur que la base séparée sur cluster partagé que je proposais : l'isolation
est réelle, pas conventionnelle). Config locale dans `.env.main` (gitignoré), base
`templyo_main`.

ℹ️ `MONGO_DB=Cluster0` — nom retenu par le client bien que ce soit aussi le nom du cluster.
Fonctionne (vérifié par un `ping` sur cette base) ; simple ambiguïté de lecture.

⚠️ **Erreur `SSL alert number 80` au déploiement — ce n'est PAS un problème de code.**
`tlsv1 alert internal error` sur Atlas est le symptôme d'une **IP non autorisée** : le proxy
Atlas coupe la poignée de main TLS au lieu de rejeter proprement, d'où une erreur OpenSSL
illisible. Diagnostic par élimination : la même URI, les mêmes identifiants et la même base
se connectent **sans erreur depuis le poste** → réseau, pas configuration. Un cluster neuf
n'autorise que l'IP présente à sa création. **Correctif : Atlas → Network Access →
`0.0.0.0/0`** (Railway n'a pas d'IP de sortie stable sur les offres standard). La sécurité
repose alors sur l'utilisateur/mot de passe — d'où l'intérêt d'un **utilisateur distinct par
cluster**, ce qui est le cas ici.

⚠️ **Bug latent corrigé au passage** : `allowedOrigin` (CORS) lisait `process.env.APP_URL`
**brut**. Le navigateur envoie un `Origin` **sans** slash final et `cors` compare par égalité
de chaîne : un `APP_URL` copié depuis une barre d'adresse (donc terminé par « / ») ne
matcherait jamais. Invisible tant que le front est servi par le même Express, mais réel dès
qu'un domaine personnalisé coexiste avec l'URL `.up.railway.app` — c'est le cas de `dev`.
Corrigé en passant par `appUrl()`, qui normalise déjà (préfixe https + retrait du slash).

**Ordre à respecter — c'est le point important.** `dev` est **20 commits devant `main`**.
Il faut poser les variables Railway sur `main` (nouveau cluster + `MONGO_DB=templyo_main` +
`OUTBOUND_ENABLED=false` + `CRON_ENABLED=false`) **AVANT** de merger `dev` → `main`. Merger
d'abord, c'est déployer 20 commits qui bootent contre la base de Castanui : création
d'index, cron, tout. Le merge sera un fast-forward (`main` est un ancêtre direct de `dev`).

### Processus de livraison — décidé le 2026-08-05

> « Il faut attendre que les corrections soient validées dans l'environnement dev pour
> atteindre le client. »

**Trois étages, chacun avec sa porte de sortie :**

| Étage | Cible | Ce qu'on y prouve | Porte |
|---|---|---|---|
| 1 · `dev` | `dev.templyo.fr` (`app-planning-bar`/dev) | la feature marche | `npm test` + `SMOKE_URL=https://dev.templyo.fr npm run smoke` |
| 2 · `main` | `…-production.up.railway.app` (`app-planning-bar`/main) | elle marche **en conditions de prod** (`NODE_ENV=production`, cookies `secure`, CORS strict) | smoke sur l'URL de main |
| 3 · client | `castaniu-family.templyo.fr` (**dépôt `app-planning-bar-castaniu-family`**/main) | — | accord explicite du user, cf. mémoire `no-merge-to-client` |

**La propagation est techniquement triviale** : le remote `castanui` est déjà configuré et
`castanui/main` est un **ancêtre strict** de `origin/dev` (`0 20` — aucun commit propre côté
client). Donc `git push castanui origin/dev:main` est un fast-forward, sans conflit.
L'étage 2 n'est pas décoratif : c'est le seul endroit où l'on teste `NODE_ENV=production`
avant le client — et c'est précisément la variable qui était mal réglée chez lui.

⚠️ **« Validé sur dev » ne suffira pas pour CE lot-ci.** Les 20 commits en attente
contiennent E-22 (Modèle A), qui exige que **tout compte `directeur` ait un profil `staff`
lié**. `ensureDirectorStaffProfile` ne le crée qu'à la prochaine modification du compte : les
directeurs existants chez le client resteraient sans `staff_id` et **ne pourraient plus
saisir de dispo** (400 permanent). La livraison client devra donc inclure une **migration
de données**, pas un simple push.

✅ **Un seul outil : `npm run link-directors`** (`scripts/link-director-staff.js`).
Rapproche par e-mail puis nom normalisé, ne pose que `users.staff_id`, s'abstient si le
résultat n'est pas unique, **simulation par défaut** (`--apply` pour écrire).
Ajoute `--create-missing` pour créer le profil des directeurs qui n'en ont **aucun**.

⚠️ **L'ordre des opérations est la sécurité.** `--create-missing` n'agit que sur le bucket
« aucun homonyme, ni par e-mail ni par nom » : le tri précède l'écriture, donc le doublon
n'est pas *interdit*, il est **inexprimable**. L'ancien `backfill-directors` faisait
l'inverse — créer puis vérifier — et fabriquait un **second** profil à un directeur qui
travaillait déjà en salle : barre staff dédoublée, historique de shifts scindé, personne
**comptée deux fois en masse salariale**. Constaté chez Castanui : 2 directeurs sur 3.
Il a été **supprimé** le 2026-08-11 (A-09), avec son entrée `package.json` : une
interdiction qui ne vit que dans un doc finit par être contournée par quelqu'un de pressé.

Le cas « plusieurs homonymes » (`ambiguous`) reste **non automatisé, même avec
`--create-missing`** : se tromper attribuerait à quelqu'un l'historique de paie d'un autre.

Le script supprime aussi les sessions des directeurs qu'il touche : il écrit directement
dans Mongo, donc **R-17 ne se déclenche pas** — sans ça, un directeur connecté garderait une
session sans `staff_id` et resterait bloqué sur le 400 sans comprendre pourquoi.

Autres changements visibles par les utilisateurs finaux dans ce lot : suppression des emojis
d'interface, nouveau périmètre de la file de dispos (S-04), exemption de deadline directeur
(§9.1). À annoncer, pas seulement à déployer.

### Audit Railway complet (2026-08-05) — origine, variables, secrets

Fait via `railway api` (GraphQL) après avoir constaté que `railway status` n'expose pas la
branche source. Requête : `serviceInstances { source { repo } latestDeployment { meta } }`.

| Env / Service | Dépôt / branche | Cluster | `MONGO_DB` | `NODE_ENV` |
|---|---|---|---|---|
| Dev / `Dev` | `app-planning-bar` / **dev** | vab3u2w | `templyo_dev` | development |
| Prod / `Dev` (« main ») | `app-planning-bar` / **main** | vab3u2w | `templyo_main` | production |
| Prod / `Castaniu Family` | **`app-planning-bar-castaniu-family`** / main | gqfynu8 | *(absent)* | production |

**A-01 — Le client est sur un DÉPÔT FORK séparé.** Conséquence rassurante : merger
`dev` → `main` ne l'atteint pas. Conséquence inquiétante, **plus importante** : aucun
correctif ne lui parvient automatiquement. Il tourne au commit `29bc8822`, sans S-01→S-04,
sans R-06, sans les index. Chaque correctif de sécurité devra être **porté à la main** sur
ce fork — ou les deux dépôts refusionnés. À décider avant que l'écart ne grandisse.

**A-02 — Secrets identiques entre `dev` et le client** (vérifié par empreinte SHA-256) :
`SESSION_SECRET`, `TWILIO_*`, `RESEND_API_KEY`, `VAPID_*`.

✅ **Twilio / Resend : NORMAL et voulu** — précisé par le client le 2026-08-05 : *« c'est moi
qui gère le système d'envoi de mail »*. Templyo est l'émetteur pour tous ses clients, il n'y
a qu'un compte fournisseur. Mon analyse initiale (« fuite entre environnements ») était
fausse : il n'y a pas de compte client à protéger. **Ne pas séparer les comptes.**

Ce qui reste, beaucoup plus mineur, et à traiter seulement si ça devient gênant :
- **Resend** : une clé API distincte *par environnement* (même compte, même domaine, même
  facturation) isolerait la réputation d'envoi — un test qui rebondit n'affecterait pas la
  délivrabilité des mails clients. Gratuit, 2 minutes. Idem sous-comptes Twilio pour
  attribuer la dépense. **Confort, pas sécurité.**
- **VAPID** : le vrai couplage. Ce n'est pas un compte d'envoi mais une paire de clés
  identifiant le serveur applicatif. Les faire tourner pour un environnement **casse toutes
  les souscriptions push de l'autre** (réabonnement obligatoire des employés). À savoir avant
  toute rotation, pas à corriger aujourd'hui.
- **`SESSION_SECRET`** : sans rapport avec l'envoi, donc non couvert par la remarque
  ci-dessus. Impact limité (sessions dans des bases Mongo distinctes ⇒ un cookie de dev ne
  résout rien chez le client), mais un secret de signature partagé entre un bac à sable aux
  comptes publics et une prod reste à séparer. `main` a déjà le sien.

**A-03 — `dev` peut joindre de vraies personnes.** `OUTBOUND_ENABLED` n'y est pas posé et
les clés Twilio/Resend/VAPID sont actives. Inviter quelqu'un depuis dev envoie un vrai SMS.
Correctif : une variable (`OUTBOUND_ENABLED=false`). **Non posé — en attente d'arbitrage**,
car cela empêcherait aussi de tester le parcours d'invitation en conditions réelles.

**A-04 — `PATRON_EMAIL` / `PATRON_PASSWORD` sont du code mort.** Présents sur les **trois**
services, **lus nulle part** (vérifié sur `dev` ET sur `origin/main`). Un mot de passe traîne
donc dans l'environnement d'un déploiement client sans aucun usage. À supprimer.

**A-05 — Aucun `healthcheckPath` configuré**, alors que `/health` existe et teste la base.
Railway ne sait donc pas distinguer un démarrage réussi d'un serveur qui répond mais n'a pas
de base. `numReplicas` est `null` (= 1) sur les trois → pas de risque de double cron par
réplication, ce qui reste vrai tant que personne ne monte ce nombre.

**Divergences mineures** : `TWILIO_FROM` vaut `PlanningBar` sur main contre `Templyo`
ailleurs ; `SESSION_SECRET` fait 30 caractères sur dev et chez le client (le README en
demande 32).

### Lot bugs front (2026-08-06) — R-10, R-09, R-04

Trois bugs sans lien entre eux, traités ensemble parce qu'ils partagent un défaut : **ils ne
provoquent aucune erreur visible**. Détail dans le tableau des findings.

⚠️ **Limite de vérification à assumer** : ces trois correctifs sont dans `performance.js`,
`sw.js`, `planning.js` et `script.js` — donc **couverts par aucun test** (c'est T-03, zéro
test front). Ils sont validés par lecture du code, contrôle syntaxique et `eslint` ; les 200
tests et le smoke ne prouvent que l'absence de régression **serveur**. Un test de non-régression
sur `sw.js` demanderait d'extraire la logique de repli hors du handler `fetch`.

**Le smoke test tombait en 429 et l'annonçait mal.** 4 connexions par passage contre une
limite de 10 / 15 min / IP : au 3e lancement rapproché, il échouait avec le message
« Base non alimentée par seed-dev.js, ou instance CLIENT » — un diagnostic **faux** qui
envoie chercher le problème au mauvais endroit (constaté en direct). Le script distingue
désormais 429 et dit quoi faire (attendre, ou redémarrer le serveur — le compteur est en
mémoire). Le rate limiter, lui, fonctionne : c'est la seule bonne nouvelle de l'épisode.

### Lot profils staff (2026-08-06) — R-05, R-12

Deux findings de la même zone : `POST /api/users` et `DELETE /api/users/:id`. Détail dans
le tableau. Le geste commun est de **réutiliser `ensureDirectorStaffProfile`** (créé pour R-06)
au lieu d'appeler `createManagerStaffProfile` en direct : le compte est inséré d'abord, le
profil ensuite, et un `staff_id` déjà fourni est respecté.

**Deux trous du harnais découverts au passage** — `fake-db` n'avait pas `deleteOne`, donc
`DELETE /api/users/:id` n'était **pas testable du tout**. Et le harnais n'imposait pas
`OUTBOUND_ENABLED=false` : tester une route d'invitation lançait un vrai appel Resend/Twilio.
Les deux sont corrigés.

**Note de méthode** : mes deux premières mutations de vérification étaient fautives (l'une ne
touchait qu'une branche sur deux, l'autre laissait le code muté s'exécuter) et concluaient à
tort que les tests étaient vides. Vérifier la mutation elle-même avant d'accuser le test.

### Revue `/simplify` (2026-08-07) — et deux constats hors périmètre

**Le finding principal était mon propre doublon.** Les 4 angles ont convergé : j'avais créé
`requireEstablishmentAccess(..., { whenAbsent: 'patronOnly' })` **et** gardé `perfScopeDenial`
— deux implémentations de la même règle, dans le même diff, dont le mode générique n'avait
**aucun appelant**. Les 2 routes `performance-settings` passent maintenant par le middleware,
`perfScopeDenial` est supprimé, et `patronOnly` sert enfin à quelque chose.

Corrigé aussi : `pendingScopeFilter` refaisait le test de rôle à la main au lieu de passer par
`userEstablishmentIds` (fail-**open** pour un futur rôle scopé) ; `disposScopeQS` ne partageait
rien — la liste refabriquait sa propre chaîne et **le commentaire affirmait le contraire** ;
3 gardes `etablissement` devenues redondantes ; `db-uri.js` recopiait `'gestion_bar'` au lieu
d'importer `PROD_DB_NAME` ; `seed-all.js` refaisait le spawn sans le relai de signaux de
`dev-run.js` (un Ctrl-C laissait un seed **destructif** finir en arrière-plan) ; `ctx.users`
keyé par rôle écrasait silencieusement 2 comptes sur 3 ; `$nor` mort dans `fake-db`.

Perf : `distinct('color')` au lieu de rapatrier un document par staff ; purge du seed en
`Promise.all` et groupes en `bulkWrite` (21 allers-retours Atlas → 4).

**Renommage** : `syncManagerStaffVenues` → `ensureDirectorStaffProfile`. L'ancien nom ne
parlait que de venues alors que la fonction **crée** le profil et pose `users.staff_id` —
personne n'aurait pensé à l'appeler depuis un futur chemin de création.

**Une affirmation fausse corrigée** : l'en-tête de `seed-dev.js` disait « les index sont
recréés au boot ». `connectDB()` n'en pose que **6** sur ~25 ; les autres viennent de
`npm run init`. Sans effet à cette volumétrie, mais il ne faut pas y mesurer de perfs.

**Trou du harnais, encore un** : `fake-db` n'avait pas `distinct()` — introduire l'appel a
fait tomber 2 tests, ce qui est la bonne nouvelle : ils n'étaient pas vides.

**Deux constats HORS périmètre `/simplify`, non corrigés :**
- **A-06** — R-04 ne répare que le **push**. La copie **in-app** est écrite dans
  `staff_notifications` avec `url: '/planning.html#dispos'`, collection lue seulement par
  `planning.js` — page qu'un directeur ne charge jamais. Son rappel de dispos in-app n'est
  donc affiché **nulle part**. Le correctif de fond est à l'ÉMISSION (`sendPushToStaff` fait
  déjà un `users.find`, ajouter `role` à la projection suffit), ce qui couvrirait les 4 sites
  d'émission et les 2 canaux. La redirection actuelle resterait utile en rétro-compat.
- **A-07** — divergence des catalogues d'index : `connectDB()` en crée 6, `init-db.js` ~25.
  À unifier dans un module partagé appelé par les deux.

### Préparation de la propagation Castanui (2026-08-07)

Inspection **en lecture seule** de la base client (autorisée). Elle a révélé **deux
bloquants** — propager en l'état aurait cassé une fonctionnalité et dupliqué des données.

**Bloquant 1 — régression du pointage, CORRIGÉE.** `GET /api/pointage/:date` était passé
sous `requireEstablishmentAccess` (S-06). Or `public/pointage.js` sert aussi le rôle
`staff` : le **responsable de soirée** (E-03), lignes 187/216/233. Un staff n'a pas
d'`assigned_establishments` ⇒ 403 ⇒ **plus aucun shift à pointer**. ⚠️ Mon affirmation
« aucune de ces routes n'est appelée par les vues staff/pointage » (S-06) était **fausse**
pour ce fichier. Correctif : repli `isResponsablePourSoiree` inline, comme les routes
d'écriture voisines l'ont toujours fait — le contrôle est asynchrone, il ne peut pas être un
middleware. 4 tests ; la mutation « état d'avant » en fait tomber 1.
Les 3 autres routes restreintes ont été **revérifiées sur tous les fichiers front** :
`planning.js` et `pointage.js` n'utilisent que les sous-routes joker/pointage/extra → sûres.

**Bloquant 2 — `backfill-directors` aurait DUPLIQUÉ deux profils.** Les 3 directeurs du
client ont **déjà** un profil staff homonyme, avec des `venues` identiques à leurs
`assigned_establishments` ; seul le lien `users.staff_id` manque (2 sur 3). Le backfill ne
rapproche que sur `staff_id` et crée sinon → un **second** profil pour Romain MAYAT et
Alexandre Housset : barre staff dédoublée, historique scindé, **comptés deux fois en masse
salariale**. Nouveau `scripts/link-director-staff.js` (`npm run link-directors`) : rapproche
par e-mail puis nom normalisé, **ne crée jamais rien**, ne pose que `users.staff_id`, refuse
d'agir si zéro ou plusieurs correspondances, **simulation par défaut** (`--apply` pour
écrire), et contrôle que le nombre de profils staff n'a pas bougé. Simulation client :
**2 liaisons, 1 déjà liée, 0 création, venues identiques**.

**État vérifié de la base client** : 3 patron / 3 directeur / 78 staff / 1 observateur ·
101 profils staff · 3359 shifts · 508 dispos · 4 établissements. Tous les
`assigned_establishments` sont des **slugs valides** → le piège « ObjectId au lieu du slug »
n'existe pas sur cette base. Les 2 nouveaux index sont **non-uniques** → créés au boot, sans
risque d'échec sur doublons.

**Note client rédigée** : `docs/note-client-mise-a-jour.md`. Les 3 points qui surprendront :
emojis retirés, colonnes « brut » disparues de Performance (et calendrier recoloré sur le
chargé — des jours verts peuvent devenir rouges à données égales), et les directeurs qui
entrent dans la barre staff **et la masse salariale**.

**Deux défauts du jeu de recette découverts en validant sur `dev` (2026-08-07)** :
- **Le seed stockait les NOMS de rôles dans `staff.roles`**, alors que le front y pose des
  `_id` (`btn.dataset.role = String(r._id)`) et que le serveur compare des `_id`
  (`isResponsablePourSoiree`). Conséquence : **personne n'était reconnu responsable de
  soirée**, et toute la recette était aveugle à E-03 — c'est précisément pour ça que la
  régression du pointage a pu passer. Corrigé : le bloc `roles` expose ses `_id` via
  `ctx.roles`, le bloc `staff` les référence.
- **Le smoke ne couvrait pas E-03.** 3 vérifications ajoutées (responsable accède à sa
  soirée · staff non désigné refusé · responsable refusé sur un autre bar), soit 25 → 28.
  Le correctif le plus important du lot est désormais vérifié sur l'instance réelle, pas
  seulement en test unitaire.

**Séquence restante** (plan approuvé) : pousser `dev` → `smoke:dev` → merger `main` →
`smoke:main` → `git push castanui origin/main:main` → `link-directors --apply` → faire
reconnecter les 2 directeurs → vérifications. Retour arrière : re-push de `29bc882` ; le
lien `staff_id` est compatible avec l'ancien code, donc rien à défaire côté données.

### Colonne « Masse sal. brute » dans le tableau Performance (2026-08-07)

Demandé par le client : revoir le salaire **avant charges**, **uniquement dans le tableau**.
E-23 l'avait retiré de toute la page. Réintroduit à ce seul endroit — les KPI, le
calendrier et les objectifs restent sur le **chargé**, qui reflète le coût réel.
Aucun changement serveur : `wage_bill_gross` (par jour) et `wage_gross` (par personne)
n'ont jamais cessé d'être renvoyés par `GET /api/performance`.

**Un 2e défaut de modèle du seed découvert en vérifiant que la colonne se remplit** :
`daily_revenue` était semé avec un champ **`amount`**, alors que l'app écrit et lit
**`revenue`** (`POST /api/revenue` / `GET /api/performance`). Le CA ressortait `undefined`,
le coefficient à **0 %** — **E-24 était intestable sur toute la base de recette**.
C'est la même erreur que les rôles semés par nom au lieu d'`_id` : un jeu de données écrit
d'après des suppositions plutôt que d'après le code. Corrigé et rechargé ; le coefficient
se calcule (10,8 % sur la journée pointée).
⚠️ **À faire** : passer en revue les autres champs du seed contre les écritures réelles du
serveur — deux erreurs de ce type en une journée suggèrent qu'il peut en rester.

### Audit complet du jeu de recette (2026-08-07)

Demandé après deux erreurs de modèle trouvées coup sur coup. Chaque collection semée a été
comparée à ce que `server.js` écrit RÉELLEMENT. **4 écarts**, dont un seul fonctionnel :

| Collection | Écart | Effet |
|---|---|---|
| `daily_revenue` | `amount` au lieu de **`revenue`** | ❌ CA `undefined`, coefficient 0 % — E-24 intestable *(corrigé précédemment)* |
| `staff.roles` | noms au lieu d'**`_id`** | ❌ personne responsable de soirée — E-03 intestable *(corrigé précédemment)* |
| `time_off` | `note` au lieu de **`reason`** | motif de congé vide à l'affichage |
| `manager_time_off` | champ **`name`** absent | nom manquant sur l'absence directeur |
| `settings.publish_*` | `published: true` | fonctionne, mais c'est la branche **legacy** de `normalizePublishDoc` ; forme courante = `establishments: 'ALL'` |

**Conformes, vérifiés** : `availabilities`, `shifts`, `establishments`, `users`,
`manager_dispo_templates`, `roles`, `settings.dispo`, `settings.performance*`.

**Règle posée : ne jamais rechercher par NOM, seulement par `_id`.** Le bloc `groupes`
filtrait le staff par `{ name }` ; il passe par `{ _id: ObjectId(ctx.staff[name]) }`. Un nom
n'est pas un identifiant — deux homonymes ou un renommage, et la mise à jour touche la
mauvaise personne ou aucune, **en silence**. Les établissements gardent leur filtre `{ id }` :
c'est leur clé métier (`establishment_id` partout dans le code), pas un nom.

**Ce que cet épisode dit du jeu de recette** : il avait été écrit d'après des suppositions
sur les noms de champs plutôt qu'en lisant le code. Deux features entières (E-03, E-24)
étaient invérifiables sans que rien ne le signale — et c'est ce qui a laissé passer la
régression du pointage jusqu'à l'inspection de la base client.

### Revue `/simplify` du 2026-08-07 — constats NON appliqués

Les 4 angles ont tourné, **aucun correctif n'a été appliqué** (revue arrêtée en cours).
Consigné ici pour ne pas reperdre le travail. Par valeur décroissante.

**⚠️ A-08 — Le runbook contredit le correctif, et c'est un risque réel.**
Plus haut dans ce fichier, la section de préparation client dit encore : « la livraison
devra inclure `npm run backfill-directors` ». C'est **le script qui duplique les profils**,
écarté le 2026-08-06 après l'inspection de la base Castanui. La contre-indication existe,
mais 150 lignes plus bas. Au prochain client, c'est la première ligne qu'on relira.
Même problème dans `docs/design-e22-dispos-directeur.md`, qui présente encore le backfill
comme LE remède E-22. **Correction : une ligne à chaque endroit.**

**A-09 — Deux scripts pour une seule décision, et un trou fonctionnel.** ✅ **Fait le 2026-08-11.**
`backfill` (créer) et `link` (lier) sont les deux branches de « directeur sans profil →
lier si un profil correspond, créer sinon ». `link` calcule déjà les 3 buckets
(`todo`/`none`/`ambiguous`) : ajouter `--create-missing` sur le bucket `none`, supprimer
l'ancien script. ⚠️ **Aujourd'hui le cas `none` n'a AUCUN outil sûr** — un client sans
homonymie verrait ses directeurs bloqués (400 permanent) sans procédure valide.

**A-10 — Règle métier dupliquée serveur/client, visible à l'écran.** ✅ **Fait le 2026-08-11.**
`public/performance.js` recalcule `1 + rate/100` alors que `lib/utils.js` a
`chargeMultiplier()` et que les DEUX montants viennent déjà du serveur. Seul le « × 1,45 »
est calculé côté client : une désynchronisation ne produit pas un chiffre un peu faux, mais
une **phrase arithmétiquement fausse** (« 3 200 € × 1,45 = 4 800 € »), vérifiable de tête.
R-10 a déjà montré que `targets` peut venir du mauvais bar. **Correctif d'une ligne** :
`chargeMult = totalWageBrut > 0 ? totalWageCh / totalWageBrut : null` — vrai par
construction. Au passage, le défaut `45` est écrit à **5 endroits**.

**A-11 — Mon commentaire sur `GET /api/pointage/:date` est trompeur.**
Il dit « le contrôle est async donc pas de middleware ». C'est faux (un middleware Express
peut être async) et ça **contredit** le commentaire de `requireEstablishmentAccess`, qui
donne la vraie raison : la règle dépend d'un DOCUMENT, pas de la requête. Un futur lecteur
en tirerait la mauvaise règle. Pour ce GET précis, un middleware async marcherait — le
choix réel est l'uniformité avec les 3 routes voisines, qu'il faut assumer comme tel.

**A-12 — `isResponsablePourSoiree` : 3 requêtes et toute l'équipe chargée pour une personne.**
Elle charge les shifts de la soirée + les profils staff de tous les présents, puis ne
regarde que l'appelant. Et la route `GET /api/pointage/:date` **refait derrière la requête
`shifts` qu'elle vient de faire**. Bon point : l'ordre des conditions est correct — patron,
observateur et compte établissement paient **0** requête. Mais un responsable qui pointe
8 personnes déclenche 8 × 3 requêtes de contrôle. Alternative : 2 `findOne` ciblés
(`shifts` sur staff_id+pointage_resp, `staff` sur roles), indépendants de la taille de
l'équipe ; et faire remonter les shifts déjà chargés au handler.

**A-13 — La cause racine des bugs du seed n'est pas traitée.**
Les 5 écarts de champs ont été corrigés par des **commentaires**, qui ne tombent jamais.
Le 6e s'écrira pareil. Le mode d'échec est silencieux : `amount` au lieu de `revenue` n'a
produit aucune erreur, juste un coefficient à 0 % présenté comme un résultat — une recette
**menteuse**, pas cassée. **Les 5 étaient tous détectables par une assertion de LECTURE**
dans `smoke.js`. Le `howToTest` de chaque bloc du seed est déjà une assertion écrite en
français que personne n'exécute : la faire exécuter ferme la boucle. Complément gratuit :
un `$jsonSchema` sur `daily_revenue` (collection qui a déjà un index unique, donc déjà
traitée comme ayant un contrat) aurait fait ÉCHOUER l'insert au lieu d'afficher 0 %.

**~~A-14~~ — Le 401 en cours de session n'est traité qu'au chargement de page.**
✅ **Résolu le 2026-08-10.** Nouveau module `public/lib/auth-guard.js` : il enveloppe
`window.fetch` **une fois**, et redirige vers `/login.html?expired=1` quand un 401 tombe en
cours de session. Chargé par les 4 pages applicatives **avant** leur propre script, ajouté au
précache SW. Aucun des centaines d'appels `fetch` des bundles n'a été touché.
**Quatre exclusions, chacune testée** — c'est là qu'est le vrai travail, pas dans la
redirection : (1) **403 ≠ 401** — un périmètre refusé (S-02…S-06, qui rendent 403 en
fonctionnement normal) ne doit surtout pas déconnecter un utilisateur authentifié ;
(2) `/auth/login` et les routes d'entrée — un **mauvais mot de passe** rend 401, rediriger
effacerait le message d'erreur et ferait clignoter la page à chaque faute de frappe ;
(3) `login.html` / `set-password.html` — `login.js` appelle `/auth/me` au chargement et le
401 y est le cas **normal** : rediriger ferait une **boucle** ; (4) cross-origin — le 401
d'un tiers ne dit rien de notre session. Une seule redirection même si 10 appels échouent
ensemble. Le repli hors-ligne du SW rend **503**, pas 401 : une coupure réseau ne déconnecte
personne. `login.js` affiche « Ta session a expiré ou tes accès ont changé » — sans ça,
depuis R-17, on est éjecté de son écran sans la moindre explication.
**21 tests** (`tests/auth-guard.test.js`) — le prédicat de décision est une fonction pure
exportée par le module UMD, donc testable sous Node : c'est **le premier code front du
projet à être couvert**. Un test a d'ailleurs attrapé un vrai défaut à l'écriture :
`String(undefined)` que `new URL` résolvait en `/undefined`, un pathname inventé du même
origin au lieu d'un `null` honnête.
**Non-vacuité vérifiée par mutation, 5 sur 5** : traiter le 403 comme un 401 → 1 test tombe ;
retirer l'exclusion des pages publiques → 2 ; retirer celle des routes de login → 1 ;
retirer la restriction `/api/`+`/auth/` → 1 ; retirer le verrou de redirection unique → 1.
⚠️ **Ce dernier ne tombait PAS au premier essai** : le faux `location` stockait la valeur
brute, donc après la 1re redirection `href` valait « /login.html?expired=1 » — une base
relative que `new URL` refuse, si bien que les 9 appels suivants tombaient dans le `catch`
et que le test passait **sans** le verrou qu'il prétendait vérifier. Corrigé en fidélisant
le faux (le navigateur résout toute affectation de `href` en URL absolue). Sans la passe de
mutation, ce test serait parti vert et vide.
⚠️ **Non couvert** : la redirection réelle du navigateur n'est vérifiée que contre un faux
`window`. À confirmer au smoke.

~~Constat initial :~~
Chaque page redirige vers `/login.html` quand `/auth/me` échoue **au démarrage**
(`planning.js:54`, `script.js:496`, `pointage.js:166`). Mais un 401 qui survient *pendant*
l'utilisation fait juste échouer l'appel en silence : l'écran reste affiché avec des données
périmées. Antérieur à R-17 — l'expiration à 30 jours produisait déjà ce cas — mais R-17 le
rend nettement plus fréquent, puisqu'un changement de périmètre coupe désormais la session
immédiatement. Correctif : un `fetch` centralisé qui redirige sur 401, `pointage.js` en
premier (page ouverte toute la soirée sur la tablette du bar).
🔺 **Requalifié le 2026-08-10 : A-14 doit être livré AVEC R-17, pas après.** R-17 n'est pas
encore déployé ; l'envoyer seul remplacerait un trou de sécurité par un écran mort (écran
ouvert, données périmées, appels qui échouent en silence). Cf. « Revue d'ensemble du
2026-08-10 ».

**Divers, moindre valeur** : `norm()` est la 3e copie de `normalizeStr` (`script.js`,
`pointage.js`) ; `fmtRate` duplique `fmtPct` avec un format différent **dans la même ligne
d'en-tête** (« charges 45 % » à côté de « cible 43,0 % ») ; `renderDetail` prend 4
paramètres positionnels tirés du même objet (passer la ligne entière) ; le garde-fou
`before`/`after` de `link-director-staff.js` ne peut jamais se déclencher (le script ne
touche pas `staff`) ; `seedSoiree()` dans les tests reconstruit une base et jette celle du
`beforeEach` ; 3 annuaires nom→id construits par la même ligne dans le seed.

### 🔴 INCIDENT PROD — compte branché sur un profil staff supprimé (2026-08-07)

**Signalé par le client** : « un staff a des shifts qui ne sont pas attribués à son profil ».

**Diagnostic.** Le compte `antoine.bozo@gmail.com` (créé le 24/04) pointait sur
`staff_id: 69eb3b0b…d5`, un profil **supprimé**. Son vrai profil « Antoine BOZO »
(`6a076208…`, créé le 15/05) portait ses 12 shifts, sans aucun compte rattaché. L'écart
d'un caractère entre l'`_id` du compte (`…d6`) et le staff_id mort (`…d5`) montre qu'ils
avaient été créés ensemble, puis que le profil seul a été supprimé.

**Ce qui était réellement en jeu** : sur le profil mort s'étaient accumulés **15 dispos**
et **3 congés**, dont des vacances du **23/08 au 06/09 déjà approuvées**. Ces congés
n'apparaissaient nulle part — ni onglet Congés, ni planning, ni garde-fou d'assignation.
Le patron construisait son planning d'août sans les voir. Un seul compte touché sur toute
la base (3371 shifts sains).

**Cause racine.** `DELETE /api/staff/:id` supprimait le profil et ses shifts, mais ne
touchait NI `users.staff_id`, NI `availabilities`, NI `time_off`. Le compte restait branché
sur un id mort, et tout ce que la personne saisissait ENSUITE s'y accumulait, invisible.
C'est le symétrique de R-12, traité hier dans l'autre sens (suppression du compte).

**Corrigé — données** : `scripts/fix-orphan-staff-link.js` (simulation par défaut, rapproche
par e-mail puis nom normalisé, s'abstient si non unique, imprime le `staff_id` de retour
arrière). Appliqué : compte rebranché, 15 dispos + 3 congés rapatriés. Vérifié après coup :
**plus aucun document orphelin sur toute la base**.

**Corrigé — code** : la route délie désormais les comptes (`staff_id: null`, le compte
survit — la personne garde son accès et l'anomalie devient visible dans « Comptes ») et
purge dispos, congés et semaine-type. 1 test, mutation vérifiée sur 2 branches.

**4e lacune de `fake-db` trouvée par ce chemin** : `updateMany` n'existait pas — **11 usages
dans `server.js` étaient donc intestables**, dont la propagation d'un renommage staff.
Ajouté. (Précédentes : `deleteOne`, `distinct`, `$and`/`$or`/`$exists`.)

⚠️ **Antoine Bozo doit se reconnecter** — `staff_id` est figé dans la session au login.

### Priorisation — revue de l'ensemble (2026-08-08)

Demandée avant de lancer les features A (désactivation) et B (horizon de saisie). Verdict :
**elles sont bien prioritaires, mais trois choses passent devant, et deux ne sont pas du
travail — juste des livraisons en attente.**

#### Devant les features

| # | Quoi | Pourquoi devant | Coût |
|---|---|---|---|
| 1 | ~~**Pousser `2d723f9`** (correctif `DELETE /api/staff/:id`)~~ ✅ | **Fait.** Le correctif est sur `main` **et** chez le client (`castanui/main` = `aed2d17`, vérifié le 2026-08-10). Le trou de l'incident Antoine Bozo est refermé en prod. | fait |
| 2 | ~~**A-08** — le runbook recommande encore `backfill-directors`~~ ✅ | **Fait (`aed2d17`).** ~~⚠️ Mais le script reste exécutable en une commande : l'interdiction vit dans un doc, pas dans le code.~~ **Refermé pour de bon le 2026-08-11 par A-09** : le script n'existe plus, il n'y a donc plus d'interdiction à faire respecter. | fait |
| 3 | ~~**R-17** — périmètre figé au login~~ ✅ | **Fait le 2026-08-08.** Invalidation des sessions aux 5 points de changement de périmètre. Coût nul sur le chemin chaud. | fait |

#### Reclassement de la Feature A — c'est un correctif, pas un confort

Aujourd'hui, **la seule façon de sortir quelqu'un est `DELETE /api/staff/:id`**, qui supprime
ses shifts — donc son historique de paie. C'est destructif et irréversible. La désactivation
n'est pas une commodité : c'est **l'alternative sûre à une opération dangereuse** qui est
actuellement le seul chemin offert au patron. Sa priorité monte d'autant.

#### Le risque structurel le plus lourd, qui n'est pas une feature

**A-01 — le client est sur un dépôt fork.** Aucun correctif ne l'atteint automatiquement ;
chaque livraison est un `git push castanui` manuel. À un client c'est tenable. À trois, on
oubliera. C'est le risque numéro un pour un produit qui veut grandir, et il ne se voit pas
tant qu'il ne coûte rien.

**T-03 — zéro test front.** Trois correctifs d'interface livrés le 2026-08-06, validés par
lecture seule. Et sur deux jours, **4 lacunes de `fake-db`** (`deleteOne`, `distinct`,
`$and`/`$or`/`$exists`, `updateMany` — 11 usages intestables) : la couverture réelle est plus
faible que ne le suggèrent 215 tests. Les deux vrais bugs de la semaine — régression du
pointage, incident Antoine Bozo — ont été trouvés par une inspection manuelle et un
signalement client, **pas par la suite de tests**.

#### Les autres features, par nécessité décroissante

- **F-12 (journal d'audit des dispos)** — utile le jour d'un litige patron ↔ employé, et on
  vient de voir que des données peuvent disparaître sans trace. Vraie valeur, pas urgente.
- **F-05 (échange de shifts)** — le code est écrit et testé, **désactivé en attente de ta
  validation**. Coût de mise en service ≈ retirer des commentaires. Le blocage est une
  décision, pas du travail.
- **B2 (horizon de saisie)** — confort réel, mais personne n'est bloqué aujourd'hui.
- **F-09 (agenda iCal)** — livré puis désactivé pour manque de fiabilité. À laisser dormir
  tant que le reste n'est pas solide.
- **R-04 (découper `server.js`, ~5380 lignes)** — ⚠️ **collision d'ID** : ce « R-04 » est celui de la section dette technique. Le « R-04 » de la table *Findings de revue* est un autre sujet (redirection des push de rappel dispo, résolu le 2026-08-06). — vraie dette, mais un refactoring de cette
  taille sans tests front est plus risqué que la dette elle-même. **Après** T-03, pas avant.

### Revue d'ensemble — état du projet au 2026-08-10

Passe de vérification demandée avant de préparer les prochaines mises à jour. **Tout ce qui
suit est mesuré, pas supposé.**

#### État vérifié

| Contrôle | Résultat |
|---|---|
| `npm test` | **243/243 vert** (128 unitaires purs + 115 d'intégration HTTP, 11 fichiers) — 215 au moment de la revue, puis +21 (A-14) et +7 (semaine-type) |
| `npx eslint .` | **0 erreur**, 13 warnings (escapes inutiles, variables inutilisées — cosmétique) |
| Arbre de travail | **propre**, rien en attente de commit |
| `graphify` | **rafraîchi ce jour** — 1180 nœuds, 1897 arêtes, 68 communautés (il datait de `c72affe`, soit 7 commits de retard) |
| `smoke` | **non rejoué** — exige une instance déployée ; c'est la porte de sortie du lot ci-dessous, pas un acquis |

#### Le seul vrai « reste à faire » avant tout le monde : livrer les 2 commits en attente

`dev` est **en avance de 2 commits** sur `origin/dev` (et donc sur `main` et sur le client) :
`e579636` (fix R-17) et `1e5d06b` (doc A-14). Rien n'est parti. Les étages 1 et 2 du
processus de livraison n'ont **pas** été franchis pour ce lot.

⚠️ **Constat de cette revue — R-17 et A-14 doivent partir ENSEMBLE, pas l'un après l'autre.**
R-17 coupe la session à la seconde où le patron change le périmètre d'un utilisateur. Or
A-14 dit qu'un 401 *en cours de session* n'est rattrapé **nulle part** : chaque page ne teste
`/auth/me` qu'au chargement. Conséquence concrète du seul R-17 en prod : le patron déplace un
directeur d'un bar → l'écran du directeur reste ouvert, affiche des données périmées, et
**tous ses appels échouent en silence** sans jamais le renvoyer vers la connexion. On
remplace un trou de sécurité par un écran mort. A-14 était une dette antérieure tolérable
(expiration à 30 jours) ; R-17 la rend **quotidienne**. Elle change donc de statut : ce n'est
plus un item de la liste `/simplify`, c'est le **corollaire obligatoire de R-17**.

#### Prochaine MAJ — lot proposé

| Ordre | Quoi | Pourquoi ici | Coût |
|---|---|---|---|
| 1 | ~~**A-14** — `fetch` centralisé qui redirige sur 401~~ ✅ | **Fait le 2026-08-10** (`public/lib/auth-guard.js`, 21 tests). Corollaire de R-17. Couvre les 4 pages d'un coup plutôt que `pointage.js` seul : le garde est un module unique, le livrer partout ne coûtait pas plus cher que de le livrer une fois. | fait |
| 2 | **Livrer le lot** : push `dev` → `smoke:dev` → merge `main` → `smoke:main` | Les corrections R-17 + A-14 n'ont **jamais tourné contre un vrai Mongo**. Le smoke est la seule chose qui l'établit. | ~0, mais bloquant |
| 3 | ~~**Feature A — désactivation d'un staff (F-13)**~~ ✅ | **Fait le 2026-08-11.** Reclassée correctif le 2026-08-08 parce que la seule sortie offerte au patron, `DELETE /api/staff/:id`, **supprime les shifts, donc l'historique de paie**. Elle existe toujours, mais sa confirmation renvoie maintenant vers « Archiver ». Question 5 répondue le même jour. | fait |
| 4 | ~~**A-09** — fusionner `backfill-directors` dans `link-directors --create-missing`~~ ✅ | **Fait (2026-08-11).** `--create-missing` ajouté ; `scripts/backfill-director-staff.js` et son entrée `package.json` **supprimés**. Ce que la fusion a apporté en plus du ménage : le bucket `none` de `link` signifie déjà « aucun homonyme, ni e-mail ni nom » — c'est-à-dire **exactement** la condition que le garde-fou A-08 vérifiait après coup. Le tri précédant l'écriture, le doublon devient inexprimable au lieu d'être interdit. Le script supprime aussi les sessions qu'il touche (R-17 ne se déclenche pas sur une écriture Mongo directe). | fait |
| 5 | ~~**A-10** — `1 + rate/100` recalculé côté client dans `performance.js`~~ ✅ | **Fait (2026-08-11).** `chargeMult` est désormais **déduit** des deux montants (`totalWageCh / totalWageBrut`) : le serveur applique un multiplicateur unique par établissement (`server.js:4947`), donc le rapport des totaux **est** ce multiplicateur, et la phrase est vraie par construction quelle que soit la provenance de `targets`. Le taux affiché entre parenthèses en découle aussi — sinon on réintroduisait l'incohérence dans la même phrase. Supprime au passage un des 5 `?? 45` en dur. | fait |

**Ensuite seulement**, par nécessité décroissante : B2 (horizon de saisie), F-12 (journal
d'audit des dispos), F-05 (échange de shifts — décision client, pas du travail), A-06/A-07,
A-12, A-13, T-01. **R-04 (découper `server.js`) reste après T-03**, et T-03 n'a pas bougé.

#### Ce qui n'a pas bougé et pèse toujours

- **A-01 — le client est sur un dépôt fork.** Toujours vrai, toujours le risque structurel
  n°1. `castanui/main` est à `aed2d17`, à jour à ce jour **parce qu'on y a pensé**, pas parce
  qu'un mécanisme l'assure.
- **T-03 — zéro test front.** 🟡 **Première brèche le 2026-08-10** : A-14 a été livré avec
  21 tests, parce que sa logique a été mise dans un module `public/lib/` (UMD,
  `require()`-able) au lieu d'un bundle. **La leçon générale** : ce n'est pas « le front est
  intestable », c'est « les 4 gros bundles ne sont pas chargeables sous Node ». Tout ce qu'on
  en sort vers `public/lib/` devient testable le jour même, sans infra ni dépendance. C'est
  le chemin praticable vers T-03 — et accessoirement le même geste que R-04 demande côté
  serveur. Restent non couverts : `script.js`, `planning.js`, `pointage.js`, `performance.js`.
- **`fake-db` — 5e lacune trouvée** (les chemins pointés `session.user._id`, dans le commit
  R-17) après `deleteOne`, `distinct`, `$and`/`$or`/`$exists`, `updateMany`. Le rythme ne
  ralentit pas : une lacune par session de code environ. Les 215 tests couvrent moins que
  leur nombre ne le suggère.
  🔄 **6e lacune, le 2026-08-12 (F-14) : `$options`.** Ce n'est pas un opérateur mais le
  modificateur de `$regex`, et il arrive comme clé frère dans le même objet — il tombait
  donc dans le `default: throw`. Conséquence : toute recherche insensible à la casse lançait,
  et `POST /api/shifts/extra` (résolution PAR NOM) rendait un 500 opaque au lieu de son
  résultat — le chemin le plus surprenant de F-14 serait resté intestable. **Le rythme tient
  toujours : une par session.**

#### Documentation remise à jour dans cette passe

Écarts **mesurés contre le code**, pas relevés au jugé :

| Ce qui était écrit | Réalité | Où c'était |
|---|---|---|
| « 71 tests, 4 suites » | **215 tests, 10 fichiers** | `README.md`, `docs/architecture.md` §13, `docs/onboarding.md` §12, Notes agents de ce fichier |
| « Pour tester une route avec données, il faudra un faux `db` injectable (**pas encore en place**) » | En place depuis le 2026-08-05 (`tests/helpers/fake-db.js` + `harness.js`) | `docs/architecture.md` |
| `server.js` ~3500 / ~4250 l, 101 routes | **5379 l, 115 routes** | `README.md`, backlog ×3 |
| `script.js` ~7300 / ~8000 / 8074 l | **9124 l** | `docs/architecture.md`, `docs/onboarding.md` ×2, backlog |
| CSP : « `'unsafe-inline'` toléré sur `script-src` » | **Faux depuis D-85** — retiré de `script-src`, aucun `<script>` inline ne s'exécute. `onboarding.md` avait raison, la note aux agents non. | Notes agents de ce fichier |
| CI : « push/PR vers `main` », sans lint ni déploiement | Tourne aussi sur **`dev`**, inclut **`npm run lint`**, et un job **deploy CD-01** | `docs/architecture.md`, `docs/onboarding.md` |
| `ALLOW_TEST_AUTH` absente du tableau des variables | Ajoutée, avec l'avertissement « jamais sur un environnement déployé » | `docs/onboarding.md` |
| Collision d'ID **R-04** (redirection push ✅ / découpe `server.js` ⏸️) | Signalée sur place — deux sujets sans rapport sous le même identifiant | ce fichier |

**Non audités**, inchangé depuis le 2026-08-05 : `docs/methodologie-et-cicd.md`,
`docs/ux-design.md`, `task.md`, `ui_kits/*.md`. `docs/prd.md` et
`docs/design-e22-dispos-directeur.md` l'ont été le 2026-08-05 (DOC-01→06) et le 2026-08-08
(A-08) ; pas revérifiés ligne à ligne ici.

### 5 échecs au smoke `dev` — aucun n'était un bug du produit (2026-08-10)

Premier `smoke:dev` après la mise en ligne de R-17 + A-14. **5 échecs**, tous dans le
harnais, aucun dans l'application. Le signalement était juste : « quand je teste de mon
côté, ça fonctionne ». C'était vrai.

**Cause 1 — le smoke se tirait une balle dans le pied avec R-17 (3 échecs).**
`✗ directeur : planning de SON bar · attendu 200, obtenu 401` et deux voisines.
Le script ouvre 5 sessions au démarrage et les garde dans un `jar` pour toute la durée.
Or la vérification **R-06**, placée au milieu, réaffecte le directeur via
`PATCH /api/users/:id/establishments` — route qui, **depuis R-17**, supprime ses sessions.
Tout ce qui suivait et parlait en `dir` partait donc en 401. R-17 fonctionnait exactement
comme prévu ; c'est l'ordre des vérifications qui datait d'avant.
**Corrigé** : le bloc R-06 passe **en dernier**, après tout ce qui utilise `dir`. Zéro
reconnexion ajoutée — ce qui compte, le limiteur autorisant 10 tentatives / 15 min / IP
pour 5 déjà consommées. Et le dégât collatéral devient un **test** : nouvelle vérification
`R-17 · changer le périmètre coupe la session du directeur` (401 attendu). R-17 n'avait
aucune couverture bout en bout ; il en a une, gratuitement, en assumant ce qu'il provoque.

**Cause 2 — le jeu de recette avait une semaine de retard (2 échecs).**
`✗ responsable de soirée · attendu 200, obtenu 403` et `✗ directeur limité à son périmètre ·
pas de filtrage`. Vérifié en lecture seule sur `templyo_dev` : les shifts « responsable »
d'Alice sont aux **2026-07-28 / 08-05 / 08-10**, quand le smoke interroge le **2026-08-12**.
`seed-dev.js` place TOUT relativement au jour où il tourne (`thisMon`/`nextMon`/`lastMon`)
et `smoke.js` recalcule les mêmes expressions à SA date : semé une semaine, lancé la
suivante, **plus rien ne coïncide**.
⚠️ **Le mode d'échec est le vrai problème, pas le décalage.** Un jeu de données périmé se
manifestait par un **403** et un « pas de filtrage » — soit exactement la signature d'une
régression de contrôle d'accès. On cherche le bug dans `isResponsablePourSoiree` et dans
`pendingScopeFilter`, où il n'y a rien. C'est la même famille que A-13 : *une recette
menteuse, pas cassée.*
**Corrigé** : un **préflight** vérifie les deux ancres du seed (le shift « responsable » du
mercredi courant, des dispos en attente hors directrice dans la fenêtre) et, en cas de
décalage, **saute** les 7 vérifications concernées avec la mention `⊘ non testé — seed d'une
autre semaine` + le remède (`npm run dev:seed`). Sauter, pas échouer : un ✗ enverrait
chercher le bug au mauvais endroit, ce qui vient précisément d'arriver.

**Résultat après correctifs** : `22 OK · 0 échec · 7 sautés`, puis **`29 OK · 0 échec · 0 sauté`**
après `npm run dev:seed` (base réalignée). ✅ **L'étage 1 du processus de livraison est donc
franchi pour ce lot** (R-17 + A-14 + correctifs de doc) : `dev` déployé et smoke vert sur
l'instance réelle. E-03 — « le correctif le plus important du lot » — est vérifié contre un
vrai Mongo, et R-17 aussi. Reste l'étage 2 (`main` + `smoke:main`), puis le client, qui exige
un accord explicite.
ℹ️ Au passage, la vérification S-05 a **réellement testé** cette fois (file `dir` non vide,
donc vrai `PATCH` → 403 attendu) — son trompe-l'œil ne se déclenche que quand la file est
vide ou la session morte. Le défaut reste à corriger : il est silencieux.

**Effet de bord à connaître** : la vérification §9.1 **crée** une dispo directeur à chaque
passage. Elles s'accumulent dans la fenêtre interrogée (5 dispos « Diane » constatées) —
c'est ce qui a fini de vider S-04 de son sens, la file ne contenant plus qu'elle. Un smoke
qui écrit doit nettoyer derrière lui, ou viser une fenêtre qu'il ne pollue pas. **Non fait.**

**Deux constats non corrigés, notés ici :**
- **La vérification S-05 passait en trompe-l'œil.** Session `dir` morte → la file rend un
  objet d'erreur → `pending.length` vaut `undefined` → la garde `if (!pending.length)` renvoie
  « aucune dispo en attente — non testé » et **compte un ✓**. Elle est verte parce qu'elle
  n'a rien testé. Même famille que le test de mutation vide trouvé sur A-14 le même jour.
- **Le smoke laisse la base dans un état modifié s'il meurt au mauvais moment** : R-06
  réaffecte le directeur puis le remet ; une interruption entre les deux le laisse sur
  `Poni_restaurant`.

### Semaine-type : envoyée AU déclenchement de la deadline, jamais avant (2026-08-10)

**Demandé** : « la semaine-type doit être envoyée juste au déclenchement de la deadline de
la semaine, pas avant ». Détail complet dans `docs/design-e22-dispos-directeur.md` §10.

**Ce qui se passait** : `materializeAllManagerTemplates` tournait dans le **cron quotidien
de 10h**, et `PUT /api/me/manager-dispo-template` matérialisait **en plus** immédiatement.
Avec une deadline vendredi 13h, les dispos de la directrice tombaient dans la file du patron
dès le **lundi 10h** — 4 jours d'avance — et instantanément si elle enregistrait son modèle.

**Le vrai changement est un changement de modèle**, pas d'horaire. La semaine-type cesse
d'être un *pré-remplissage* pour devenir **« ce qui est envoyé à ma place si je n'ai rien
envoyé moi-même »**. La règle **création seule** de `buildTemplateDispos` portait déjà
exactement cette sémantique — une saisie de la semaine gagne, le modèle comble les trous.
Seul le **moment** était faux.

| | Avant | Après |
|---|---|---|
| `PUT` semaine-type | enregistre **et** matérialise | enregistre **seulement** |
| Déclencheur | cron quotidien 10h | vérificateur **/15 min**, agit au franchissement |
| Portée | tous les jours, en avance | **une fois** par semaine cible (`last_materialized_week`) |
| Vue directrice | jours déjà en `pending` | jours **« 🕓 prévu »**, non partis |

**Pourquoi pas le cron de 10h.** Une passe quotidienne aurait déclenché une deadline
vendredi 13h le **samedi 10h** : 21 h trop tard, après construction du planning. Le
vérificateur ne fait rien 99 % du temps (`shouldMaterializeTemplate` sort avant toute
écriture, le marqueur l'empêche de repasser).

**La contrepartie demandée** — « il voit quand même ses jours prêts enregistrés comme pour
les staff classiques » : `public/script.js` pré-remplit la semaine suivante depuis le modèle,
en **prévisionnel**, sans qu'aucun document existe en base. Cliquer « Enregistrer » les
envoie tout de suite : action explicite, comme un staff qui envoie avant l'heure. La règle ne
porte que sur l'envoi **automatique**.

✅ **Validé sur `dev` le 2026-08-10** — déployé (`01210d6`), smoke passé par le user, et
comportement confirmé de son côté. Étage 1 franchi. Reste l'étage 2 (`main` + `smoke:main`),
puis le client, qui exige un accord explicite.

**Couverture** : 6 unitaires sur dates gelées + 6 d'intégration (T-01 refermé au passage).
Mutations : retirer la garde de deadline / ne plus poser le marqueur / rematérialiser dans
le `PUT` fait tomber un test chacun.

**⚠️ 6e lacune de `fake-db`, et c'est un piège, pas un manque.** `_docs` était lié par
référence à la création (`_docs: docs`) alors que toutes les méthodes capturent le tableau
par fermeture : un test qui préparait un état par `col._docs = [...]` remplaçait la
**propriété** sans toucher au tableau réellement lu — donc testait l'état d'avant. Trouvé
parce qu'une mutation censée casser un test ne l'a pas cassé. Corrigé en accesseur
(`get`/`set` écrivant **en place**). Précédentes : `deleteOne`, `distinct`,
`$and`/`$or`/`$exists`, `updateMany`, chemins pointés.
⚠️ **Deuxième test vide attrapé par mutation en une journée** (après celui d'A-14). Dans les
deux cas la cause est la même : **un faux infidèle**, pas une assertion fausse. La passe de
mutation n'est pas une formalité sur ce projet.

### 🔴 CI rouge depuis 3 jours, `main` non déployé — les logs HTTP cassaient le runner (2026-08-10)

**Découvert en enquêtant sur un 429 au `smoke:main`.** Le 429 a masqué bien pire : le smoke
visait une instance qui tournait encore sur `aed2d179` **du 8 août** (`uptime` 46 h,
`/lib/auth-guard.js` en 404). Le merge était sur GitHub, le déploiement n'avait jamais eu lieu.

**Chaîne complète, chaque maillon vérifié :**

1. Railway : `skippedReason: "CI check suite failed"` — il refuse de déployer sur CI rouge.
2. CI rouge à l'étape `Run tests`, sur Node 20 **et** 22, **depuis le 2026-08-07**.
3. Le log CI (obtenu par le user, les droits admin étant requis) : **aucune assertion
   n'échoue**. `tests/estab-access.test.js` tombe en
   `uncaughtException: Unable to deserialize cloned data due to invalid or unsupported
   version`, dans `#processRawBuffer` / `FileTest.parseMessage` du runner Node.

**Cause racine.** `node --test` lance **un process par fichier** et **parse leur stdout**
pour en recevoir les résultats (trames v8 sérialisées). `morgan` y écrivait **une ligne par
requête HTTP**. Sur le fichier le plus bavard (`estab-access`, 33 requêtes), une frontière de
chunk finit par tomber au milieu d'une trame : le runner abandonne le fichier entier.
**Aucun test ne tombe — le fichier disparaît du décompte.**

**Ce qui rendait le diagnostic difficile**, et mérite d'être retenu :
- **Le mode d'échec ne ressemble pas à sa cause.** « Un test échoue » aurait envoyé chercher
  une régression métier. Il n'y en avait aucune.
- **C'est probabiliste** : dépend du découpage des chunks, donc de l'OS, du nombre de cœurs,
  de la charge. Le **même commit `0933a8a5` a réussi sur `dev` et échoué sur `main`**.
  Non reproductible ici : Node 24 ✅, Node 22 ✅, `TZ=UTC` ✅, `--test-concurrency` 1 et 2 ✅ —
  une vingtaine de passages verts sous Windows.
- **J'avais vu le symptôme et je l'ai sous-estimé.** Un `234 tests / 1 échec` observé une fois
  le 2026-08-10, noté comme « réserve non reproduite ». Les **2 tests manquants** étaient
  précisément la signature : un fichier avorté ne compte pas ses tests restants. Un décompte
  de tests qui varie d'un passage à l'autre n'est pas un détail — c'est un fichier qui meurt.

**Corrigé** : `morgan` **muet sous `NODE_ENV=test`**, et les 3 `console.log` d'exploitation
qui partent en boucle passent par un helper `logInfo`, no-op en test. Les `console.error`
restent : rares, et on veut les voir. **Mesuré : 109 → 5 lignes** de sortie applicative sur
le flux du runner (−95 %).

⚠️ **La preuve dépend d'un passage de CI** — le défaut n'étant pas reproductible ici, on ne
peut pas montrer localement qu'il a disparu ; on montre que sa cause a été retirée à 95 %.
À confirmer sur les prochains passages, et à rouvrir si un `Unable to deserialize` revient.

**Conséquences de process, plus importantes que le correctif :**
- **Le pipeline était cassé en silence pendant 3 jours.** Personne n'a été prévenu : la CI
  rouge ne notifie pas, et Railway skippe sans alerte. Un déploiement qui n'a pas lieu est
  invisible — c'est l'inverse d'une panne, ça ne se manifeste par rien.
- **Le 08/08, `main` a été déployé MALGRÉ une CI rouge** (SKIPPED à 10:59:06, SUCCESS à
  10:59:07). Le garde-fou est donc incohérent : il bloque parfois, pas toujours. À
  comprendre avant de s'y fier.
- **Rien ne vérifie que l'instance déployée porte bien le commit attendu.** `npm run smoke`
  aurait tourné en vert sur un build vieux de 2 jours sans que rien ne le signale — cf. la
  piste ci-dessous.

✅ **Fait le 2026-08-11 — côté code.** `/health` renvoie `commit`, et `smoke.js --expect <ref>`
compare au `git rev-parse` local : si l'instance ne porte pas le code attendu, il **s'arrête
avant la première vérification** plutôt que de rendre 29 ✓ portant sur autre chose.
`smoke:dev` et `smoke:main` passent la référence correspondante. Trois branches éprouvées
contre un faux `/health` : commit inattendu → arrêt (code 1) ; commit attendu → poursuite ;
instance antérieure au 2026-08-11 (pas de champ) → poursuite avec un message.

✅ **La moitié production est confirmée branchée, le 2026-08-11 après déploiement.**
`dev` répond `{"commit":"6d29a05fc4a8…"}`, identique à `origin/dev` au caractère près.

⚠️ **Leçon de méthode, pas seulement de résultat.** Deux outils avaient dit le contraire :
`railway variables` (23 clés, aucune git) puis `railway run` (11 `RAILWAY_*`, aucune git).
Les deux avaient raison **et ne répondaient pas à la question** : les variables git sont
attachées à un DÉPLOIEMENT — un commit, une branche, un auteur — et n'existent donc ni
dans la config du service, ni dans une exécution locale. Le seul juge est le conteneur
déployé. Conclure « ce n'est pas branché » à partir de ces deux commandes aurait mené à
écrire un plan B (estampiller au build) parfaitement inutile.

Éprouvé contre l'instance réelle, sans consommer de tentative de connexion — le contrôle
tourne avant les logins : `smoke.js https://dev.templyo.fr --expect origin/main` s'arrête
en code 1 et affiche les deux sujets de commit, déployé et attendu.

**Piste non faite** : publier les échecs de tests en annotations GitHub, lisibles sans
droits admin.

✅ **Dénouement le 2026-08-10.** CI verte sur `dev` puis `main` en `48bd333` — **premier vert
depuis le 7 août**, et la seule preuve possible, le défaut n'étant pas reproductible en local.
Railway a déployé dans la foulée (`SUCCESS 48bd3335`), instance vérifiée : `uptime` 9 s,
`/lib/auth-guard.js` en 200, textes de la semaine-type et `?expired` présents.
`smoke:main` : **22 OK · 0 échec · 7 sautés** — les 7 sont le préflight qui signale que la
base `templyo_main` a été semée une autre semaine (seul `templyo_dev` avait été réaligné).
**Étage 2 franchi.** Le lot complet — R-17, A-14, correctifs du harnais smoke, semaine-type
à la deadline, et ce correctif CI — est en production. Reste l'étage 3 (client), qui exige
un accord explicite.

### F-14 — refermer les cinq portes que F-13 avait laissées (2026-08-12)

Détail complet dans la ligne F-14 du tableau P3. **Trois choses à retenir plutôt que le
détail**, parce que ce sont elles qui se reperdront :

1. **Le bon niveau n'était pas celui du constat.** Le backlog relevait deux fuites de push
   (sollicitation Joker, publication de planning) et proposait implicitement de corriger les
   deux appelants. Le filtre est parti dans **`sendPushToStaff`**, la porte unique : les 8
   appelants sont couverts, et les prochains le seront sans y penser. Même logique pour la
   planification, où `resolveStaffForPlanning` remplace le refus recopié route par route.
   Corriger là où le constat pointe aurait laissé six trous à rouvrir au prochain ajout.

2. **La copie de semaine n'était pas un choix technique.** Refuser / supprimer / convertir
   en Joker donnent trois produits différents, et le code ne tranchait pas tout seul — la
   question a été posée avant d'écrire. Réponse retenue : **conversion en Joker**, parce que
   le poste était réellement tenu et qu'il doit rester visible comme à pourvoir. Supprimer
   aurait fait disparaître de la couverture en silence.

3. **⚠️ Trois tests sur quinze étaient VACANTS à la première écriture — la mutation seule
   l'a montré.** Ils étaient verts, lisibles, et ne prouvaient rien :
   - le test du cron ne franchissait pas la deadline, donc `shouldMaterializeTemplate`
     sortait **avant** le contrôle qu'on croyait tester (corrigé par un `custom_deadline`
     sur un lundi + un directeur actif en **témoin**, sans lequel « 0 dispo » reste vrai même
     quand le cron ne fait rien) ;
   - le test « Joker ouvert » ne prouvait pas le filtre de `sendPushToStaff`, parce qu'une
     **seconde garde en amont** rendait la première inobservable — il a fallu passer par la
     publication de planning, dont la liste n'est filtrée nulle part, pour la mettre sous
     test.

   **La leçon** : un test vert sur du code correct ne dit rien de la garde qu'il prétend
   tenir. Deux gardes redondantes en tiennent zéro tant qu'on ne les casse pas séparément.
   C'est le même geste que « non-vacuité vérifiée par mutation » des sessions précédentes,
   sauf qu'ici il a **corrigé les tests**, pas seulement rassuré sur eux.

### Revue `/simplify` de F-14 (2026-08-12) — deux régressions que j'avais introduites

Passée juste après le commit F-14. **Les deux trouvailles qui comptent sont des dégâts du
lot lui-même**, pas de la dette ancienne :

1. **🔴 `activeStaff` était un INSTANTANÉ, donc périmé.** Je l'avais écrit
   `activeStaff = allStaff.filter(…)` dans `loadAllStaff()`. Or **quatre** endroits mutent
   `allStaff` sans repasser par là (bascule archiver/réactiver — qui mute `staff.archived`
   *en place*, suppression, ajout, import en masse). Conséquence : archiver quelqu'un puis
   ouvrir « Remplacer par » **sans recharger la page** le proposait encore. C'est exactement
   la fuite que F-14 ferme côté serveur, réintroduite côté client. Corrigé en **dérivation** :
   `const activeStaff = () => allStaff.filter(s => !s.archived)`. La leçon est générale :
   un état dérivé recopié dans une variable a besoin d'un contrat de rafraîchissement que
   personne ne tient ; une fonction n'en a pas besoin.
2. **🔴 Appariement par index cassé dans l'onglet « jours de repos ».** J'avais changé le
   *rendu* pour `activeStaff` en laissant l'*enregistrement* sur `allStaff.map((s, i) => …)`.
   Dès qu'un archivé précède un actif, les jours cochés partaient **sur la mauvaise
   personne**, et les derniers actifs étaient ignorés en silence. Corrigé : la liste est
   fixée une fois (`restDaysStaff`) et sert aux deux moitiés. ⚠️ Deux tableaux parallèles
   appariés par index produisent mécaniquement ce défaut — c'est le vrai enseignement,
   au-delà de ce site.

**Trouvaille d'altitude, réelle et corrigée** : le filtre archivé n'existait que dans le
**front** pour l'invitation de compte. `POST /api/users` et surtout `POST /api/users/bulk`
(qui résout **par nom**) envoyaient une vraie invitation SMS/e-mail à une personne partie,
qui choisissait son mot de passe et se prenait un 403 au login. C'est le raisonnement que
F-14 rejette partout ailleurs, laissé en place ici. 3 tests, 2 mutations. L'import passe par
son canal `skipped` existant (le patron voit la ligne **et** la raison) plutôt que
d'interrompre tout le fichier.

**Aussi appliqué** : `Promise.all` rétabli dans `PATCH /api/shifts/:id` (la route sœur
`POST /api/shifts` l'avait, celle-ci l'avait perdu — 1 aller-retour par affectation, 2 par
échange de shifts) ; constante `JOKER_SHIFT` pour le littéral « créneau sans titulaire »
écrit **3 fois** (1 préexistant + 2 ajoutés par F-14) ; `resolveStaffForPlanning` ramené de
**trois** formes de retour à **deux** — le `{ joker: true }` n'était lu par aucun appelant ;
double garde et test `if (archived.size)` inutiles retirés de `sendPushToStaff`.

**Écarté, avec la raison** :
- *« le compteur `jokerised` est multiplié par le nombre de cibles »* — **faux positif**.
  `created` compte déjà le total tous jours/semaines confondus ; copier 1 shift archivé vers
  3 semaines crée bien 3 créneaux Joker. Les deux nombres sont dans la même unité.
- *« le cron devrait utiliser `archivedIdsAmong` groupé »* — les deux revues se
  contredisaient ; celle qui refuse a raison. La boucle tourne **96 fois par jour** et
  n'a presque jamais de modèle éligible : une requête groupée en tête paierait 96 allers-
  retours pour en économiser ~1 par semaine. Le `findOne` placé **après** les tests purs
  est le bon choix.
- *`escapeRegex` à extraire dans `lib/utils.js`* (2 copies inline) et *`realStaffIds`*
  (3 copies de `id && id !== '__joker__' && isValidObjectId(id)`) — vrais constats, mais
  les copies vivent hors du diff. **À faire au prochain passage dans ces fonctions.**
- *`createNotifForPatrons` échappe au filtre* — cible `users` par rôle, pas `staff`. Effet
  réel mais nul en pratique (le compte ne peut plus se connecter, TTL fait le reste).

### Planning staff — trou du lundi 00h–06h, liste continue, cutoff branché (2026-08-17)

**Signalé par le client** : « certains staff ne voient plus le planning », vers 1h/2h du
matin, au moment d'envoyer la semaine suivante. **Ce n'était pas le changement d'heure
été/hiver** — vérifié aux deux bascules 2026, l'arithmétique de dates est saine et
`TZ=Europe/Paris` est bien posé.

**Cause** : deux calculs de semaine désaccordés côté staff. La vue principale suivait
`currentWeekStart` (cutoff 6h), la liste « À venir » suivait `disposHorizonMondays`
(l'horizon de SAISIE, sans cutoff). Le lundi de 00h à 06h ils divergent d'une semaine :
la semaine qui venait de commencer n'était dans **aucune des deux** et devenait
inatteignable pendant six heures — l'onglet ne naviguait que dans sa liste, l'historique
ne va que vers le passé. Fenêtre nocturne = précisément l'heure où le staff sort de
service et consulte.

**Livré en trois temps** :
1. `upcomingWeekStart|Range|Mondays` (horizon de CONSULTATION, calé sur le cutoff),
   utilisé par `GET /api/my-published-weeks`. Correctif minimal, déployé sur `dev`.
2. **Onglet « À venir » supprimé** : les semaines à venir sont empilées sous la semaine
   en cours dans `view-planning` (`loadUpcomingWeeks`). Une seule liste, donc plus rien
   à garder d'accord — la classe de bug disparaît au lieu d'être corrigée. Possible
   parce que `/api/my-shifts` filtre déjà la publication **shift par shift** : une
   semaine non publiée ne rend rien et ne produit aucun bloc.
3. **Cutoff branché sur `settings.pointage.cutoff_hour`** (cf. entrée D-75 corrigée
   plus bas) — il y avait une SECONDE paire de notions désaccordées.

**Découvrabilité** : l'onglet qui apparaissait était le signal « nouveau ». Remplacé par
une pastille sur le séparateur (consommée à l'entrée réelle dans le champ de vision), le
push ancré sur `#semaine-<lundi>`, et `sw.js` qui **navigue** au lieu de `focus()` —
`focus()` seul jetait le fragment, or une PWA déjà ouverte est le cas courant d'un push.

**Perf au passage** : `/api/my-shifts` faisait **une requête Mongo par jour travaillé**
pour les collègues (boucle séquentielle) ; ~32 allers-retours sur huit semaines, réduits
à un, plus une projection. `fetchOpenJokers` mémoïsé 3 s (2 appels par chargement → 1).

#### 🔮 À faire plus tard — le cutoff n'est branché que côté CLIENT

Le réglage `cutoff_hour` pilote maintenant la semaine affichée dans `planning.js`, mais
**deux routes serveur calculent encore leur semaine avec le cutoff par défaut (6h)**.
Elles divergeront de la vue staff dès qu'un patron met `cutoff_hour` au-delà de 6 :

| Route | Ligne | Effet de la dérive |
|---|---|---|
| `GET /api/calendar/:token.ics` | `server.js:2663` | le flux agenda démarre une semaine après ce que l'app affiche. **Sans impact aujourd'hui** : fonctionnalité désactivée (`CALENDAR_ENABLED=false`, F-09/D-83) |
| `GET /api/dispos/kpi` | `server.js:4087` | le périmètre « établissements du responsable » est déduit de ses shifts de la semaine en cours ; pendant la fenêtre de bascule il peut porter sur une autre semaine que celle affichée |
| `GET /api/my-published-weeks` | `server.js:5139` | appelle `upcomingWeekMondays(now, weeks)` **sans** le cutoff. La vue staff ne s'en sert plus, donc dormant — mais c'est *la route où vivait le bug d'origine*, re-divergée un commit après avoir été corrigée. À traiter avec les deux autres, ou à supprimer si rien ne la consomme |

`isAutoPublished` : ⚠️ **nuance, mon premier jugement était trop large.** Il est bien plus
permissif que la vue client, donc **aucun créneau ne peut disparaître** — ça, c'est
vérifié. Mais l'inverse est vrai : il déclare la semaine N auto-publiée dès **lundi
00:00** (calcul calendaire, aucun cutoff), alors que la journée de service ne bascule
qu'à `cutoff_hour`. Un planning que le patron retouche encore est donc visible en avance
— jusqu'à 9h d'avance avec le défaut, 14h s'il monte le réglage. **Pré-existant** (c'était
déjà 6h avant), pas une régression du branchement, mais le branchement élargit la
fenêtre. À trancher si ça gêne : soit `isAutoPublished` prend le cutoff, soit on assume
que « auto-publiée » est une notion calendaire et on le dit.

**Correctif propre le jour où on y touche** : un helper serveur `serviceCutoffHour()`
qui lit `settings.pointage` (mis en cache), passé à `currentWeekStart` sur ces deux call
sites. Petit, mais ça implique une lecture `settings` de plus sur des routes chaudes —
d'où le report.

**Deux autres limites connues, assumées** :
- Le réglage est **global** (un seul document `settings.pointage`). Si des
  établissements ferment à des heures très différentes, la semaine bascule au même
  moment pour tous. Passer en par-établissement voudrait dire que « quelle semaine
  suis-je en train de regarder » dépend de l'établissement — question produit avant
  d'être technique.
- `public/script.js` (patron) garde le cutoff par défaut. Sa semaine relève de la
  planification, pas du service. **Vérifié** : la semaine publiée reste visible des deux
  côtés quelle que soit la valeur du réglage.

**Piège d'environnement à connaître** : en dev, `sw.js` garde le token
`%%BUILD_TIME%%` littéral (seul `npm start` le substitue), donc **le cache du Service
Worker ne s'invalide jamais** et resert un `planning.js` périmé. M'a fait mesurer deux
fois des chiffres faux avant que je m'en aperçoive. Purger le SW à chaque modif front en
local (`getRegistrations().unregister()` + `caches.delete()`), ou tester sur `dev`.

### Divers — outillage & process

- ~~**`graphify` est en panne, et le `CLAUDE.md` l'impose.**~~ ✅ **Réglé le 2026-08-05.** `graphify update .` repasse sans `--force` (il refusait avec 994 nœuds contre 997) et a reconstruit proprement : **1045 nœuds, 1699 arêtes, 72 communautés**, ancien graphe sauvegardé dans `graphify-out/2026-08-05/`. Fraîcheur **vérifiée** contre des faits connus (routes supprimées absentes, helpers de la session présents) — cf. DOC-06. Le `CLAUDE.md` peut rester en l'état. **À refaire après chaque session de code**, sinon le problème revient à l'identique. 🔄 **Rafraîchi le 2026-08-10** (1180 nœuds, 1897 arêtes, 68 communautés) — il datait de `c72affe`, 7 commits de retard : la consigne « après chaque session » n'a **pas** été tenue sur les sessions des 06→08/08. Ancien graphe dans `graphify-out/2026-08-10/`.
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
| R-04 | Découper `server.js` (**~5380 l, 115 routes** au 2026-08-10 ; ~4250 l / 101 routes à la décision de juin) en routers par domaine (auth, shifts, dispos, pointage, calendrier, établissements). | ⏸️ **Reporté** (juin 2026, confirmé le 2026-08-10) — zéro bénéfice utilisateur, **risque élevé** (115 routes, ~0 test front, non testable en réel ici), et la dette qui coûtait est déjà traitée (R-01/02/03). **Déclencheurs** : (1) tests d'intégration de routes — **harnais en place (D-82)**, étendre la couverture du domaine **avant** de le découper, (2) onboarding d'un autre dev, (3) opportuniste — extraire un domaine quand on le retravaille déjà. Couplage à dénouer : `db` (variable module assignée après connexion → getter), 6 middlewares + ~10 helpers partagés, ordre des routes, 2 blocs `/* F-05 DÉSACTIVÉ */` |
| ~~C-01~~ | ~~Agenda : la carte « Ajouter à mon agenda » renvoie une erreur pour un directeur sans `staff_id`~~ | ✅ Done (D-76) — carte masquée si `!currentUser.staff_id` dans `initCalSync` |
| ~~C-02~~ | ~~Agenda : `PUBLIC_BASE_URL` pour figer le domaine des URLs `.ics`~~ | ✅ Done (D-79) — précédence `PUBLIC_BASE_URL > APP_URL > req-host`, `APP_URL` suffit |
| ~~C-03~~ | ~~`/api/dispos/non-affectees` à recréer en excluant `type:'off'`~~ | ✅ Done (D-76) — l'endpoint excluait **déjà** `off` (`$nin: ['week_note','off']`, server.js) ; note « à recréer » périmée |

---

## Notes pour les agents

- **Nom staff dénormalisé (D-77)** : `staff.name` est la **source de vérité**. Copies dénormalisées : `shifts.staff_name`, `availabilities.staff_name`, `users.name`. `PATCH /api/staff/:id` les propage toutes quand le nom change, et `GET /api/users` réenrichit le nom depuis staff. Si tu ajoutes une nouvelle copie dénormalisée du nom, branche-la sur cette propagation.
- **Timezone** : ne jamais utiliser `toISOString()` — toujours `getFullYear()/getMonth()/getDate()`. Voir `docs/architecture.md` §3.1. Helper pur : `toDateStr()` dans `lib/utils.js`.
- **Logique front** (tailles au 2026-08-14) : `script.js` (patron, **9533 l**), `planning.js` (staff, **2635 l**, externalisé de planning.html en D-80), `pointage.js` (**830 l**, ex-pointage.html) et `performance.js` (**594 l**). Monolithiques — modifications additives et ciblées uniquement, pas de refactoring sans décision explicite. ⚠️ Charger les `<script src="/lib/…">` (dépendances `Week`, `ShiftHours`) **avant** le script qui les consomme.
- **server.js** : monolithique (**6281 lignes, 118 routes** au 2026-08-14 — il a pris ~2000 lignes et 17 routes depuis juin). Helpers purs dans `lib/utils.js` (testés). Split en routers = chantier futur (#10 backlog, voir R-04). ⚠️ **Deux blocs `/* F-05 DÉSACTIVÉ */`** : ne JAMAIS y ajouter de nouvelles routes — elles seraient invisibles à Express (cf. D-47). Les n° de ligne ont bougé depuis (server.js a grossi) — repérer les blocs par le marqueur de commentaire, pas par le n° de ligne.
- **Push & shift passé** : aucun push lié à un shift si `shift.date < toDateStr(new Date())` (B-10 / D-57). Ne touche pas les rappels dispos ni les notifs in-app patron.
- **Réouverture dispo** : `settings.dispo.force_open_staff[]` autorise un staff précis à soumettre malgré la deadline (E-15 / D-58), purgé à la soumission. Onglets « Sans dispo » (rouvrir simple) et « Modifier » (supprime les dispos existantes puis rouvre).
- **Dispos `type:'off'` (indispo, D-63)** : une indispo est purement informative — `start_time`/`end_time` = `null`. **Toujours l'exclure** des vues qui supposent un créneau horaire : `/api/dispos/confirmed` (overlay planning) et `/api/dispos/non-affectees` la filtrent déjà (`$nin: ['week_note','off']`, cf. C-03/D-76) ; ne jamais créer de shift à partir d'un off. Côté affichage, tester `dispo.type === 'off'` avant de formater des heures (sinon `NaN`).
- **Publication « semaine publiée ? » (D-78)** : utiliser `isDatePublished(dateStr, publishedWeeks, now)` (`lib/utils.js`, pur, testé) + `fetchPublishedWeeks()` (`server.js`, Set des lundis publiés). NE PAS réintroduire l'ancienne heuristique `|date - lundi| < 8 j` (boguée sur les semaines adjacentes). Le front passe par `/api/publish/:weekStart` (`{published, auto}`).
- **Tests** : `npm test` (zéro dépendance, `node --test`) — **366 tests, 16 fichiers** au 2026-08-14 (cf. « État actuel des tests »). Les tests d'intégration requièrent `server.js` (qui exporte `app` et ne démarre/se connecte que si `require.main === module`), démarrent l'app sur un port éphémère et injectent un faux Mongo via `tests/helpers/fake-db.js` + `app.locals.setTestDb` ; la session vient de l'en-tête `x-test-user`. **Toute la config d'env est dans `tests/helpers/harness.js`** — ne jamais la redupliquer dans un fichier de test. ⚠️ **`fake-db` est un sous-ensemble de l'API Mongo** : **10 lacunes** ont déjà été trouvées à l'usage (`deleteOne`, `distinct`, `$and`/`$or`/`$exists`, `updateMany`, copies défensives de `find`/`findOne`, `$addToSet` + `$pull` par critère, `_id` posé par l'upsert de `bulkWrite`, `sort()` no-op). Un test vert ne prouve pas que la vraie requête tourne ; le seul niveau qui exerce Mongo est `npm run smoke`. ⚠️ le mode répertoire `node --test tests/` **n'est pas fiable** (échoue selon la version Node) : lister les fichiers explicitement dans `package.json`. Ajouter un test quand on extrait un helper pur, change une règle de date/heure, ou fixe un bug qui pourrait régresser.
- **`window.fetch` est enveloppé (A-14)** : `public/lib/auth-guard.js`, chargé **avant** le script de chaque page applicative, remplace `window.fetch` pour rediriger vers `/login.html?expired=1` sur un **401** de `/api/*` ou `/auth/*`. À savoir avant de débugger un appel réseau côté front : le `fetch` que tu appelles n'est pas le natif. ⚠️ **Ne jamais élargir au 403** — un périmètre refusé (S-02…S-06) est une réponse normale pour un utilisateur bien authentifié, le déconnecter serait un bug. Les exclusions (routes de login, pages publiques, cross-origin) vivent dans le prédicat pur `shouldRedirectOn401`, testé — les modifier sans passer par lui, c'est les perdre. Le garde est **auto-installé** au chargement du script : rien à appeler depuis les pages.
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
- **CSP (helmet)** : ⚠️ note corrigée le 2026-08-10 — `script-src` n'autorise **plus** `'unsafe-inline'` (retiré en D-85, vérifié dans `server.js`). Conséquence : **aucun `<script>` inline dans un `.html`**, tout JS va dans un `.js` servi en statique, sinon il est silencieusement bloqué. Restent tolérés : `script-src-attr 'unsafe-inline'` (handlers `onclick=` du HTML généré — chantier distinct) et `style-src 'unsafe-inline'` (styles inline).
- **Sentry** : désactivé par défaut, s'active seulement si `SENTRY_DSN` présent côté Railway.
