# E-22 — Dispos des directeurs · note de design

> Statut : **décidé (2026-07-30) → Modèle A**. Implémentation par phases (cf. §6bis).
> Rédigé le 2026-07-30. Le backend isolé prototypé (`manager_availability`) est **abandonné** ; les helpers purs `resolveManagerAvailability`/`mondayFirstDow` l'ont suivi (2026-08-04, plus aucun appelant).
>
> ⚠️ **Correction de trajectoire (2026-08-04)** — cf. §8.
> ⚠️ **Décisions complémentaires (2026-08-05)** — cf. §9.
> ⏱️ **La semaine-type part À la deadline (2026-08-10)** — cf. §10.
>
> 🧭 **Comment lire ce document.** Il est écrit par couches successives, la plus récente
> en premier. **§8, §9 et §10 font autorité** ; tout ce qui suit date du 2026-07-30 et décrit
> l'intention initiale, pas le code actuel. Les passages annulés sont marqués
> ~~barrés~~ + « SUPERSÉDÉ » **à l'endroit où ils sont**, volontairement : les effacer
> ferait disparaître la trace qu'une décision a été prise puis annulée — c'est justement
> ce qu'on veut pouvoir relire dans six mois.


## 10. La semaine-type part À la deadline, jamais avant (2026-08-10)

**Demande** : « la semaine-type doit être envoyée juste au déclenchement de la deadline de
la semaine, pas avant ».

**Ce qui se passait.** `materializeAllManagerTemplates` tournait dans le cron **quotidien de
10h**, et `PUT /api/me/manager-dispo-template` matérialisait en plus **immédiatement**. Avec
une deadline vendredi 13h, les dispos de la directrice tombaient donc dans la file de
validation dès le **lundi 10h** — quatre jours d'avance — et instantanément si elle
enregistrait son modèle. Elles occupaient la file du patron avant que le staff ait fini
d'envoyer les siennes.

**Ce que ça change au modèle, et c'est le vrai sujet.** La semaine-type cesse d'être un
*pré-remplissage* pour devenir **« ce qui est envoyé à ma place si je n'ai rien envoyé
moi-même »** — un filet, pas un brouillon. La règle **création seule** de
`buildTemplateDispos` portait déjà exactement cette sémantique : une saisie manuelle faite
dans la semaine gagne, le modèle ne comble que les jours restés vides. Seul le **moment**
était faux.

**Décidé.**

| | Avant | Après |
|---|---|---|
| `PUT` semaine-type | enregistre **et** matérialise | enregistre **seulement** |
| Déclencheur | cron quotidien 10h | vérificateur **/15 min**, agit au franchissement de la deadline |
| Portée | tous les jours, en avance | **une fois** par semaine cible (`last_materialized_week`) |
| Vue directrice | jours déjà en `pending` | jours **« 🕓 prévu »**, non partis |

**Pourquoi 15 minutes et pas le cron de 10h.** Une passe quotidienne aurait déclenché une
deadline vendredi 13h le **samedi 10h** — 21 heures trop tard, après que le patron a
construit son planning. Le vérificateur ne fait rien 99 % du temps :
`shouldMaterializeTemplate` sort immédiatement tant que la deadline n'est pas franchie, et
le marqueur l'empêche de repasser ensuite.

**La contrepartie, explicitement demandée** : la directrice doit continuer de **voir ses
jours prêts**, « comme pour les staff classiques ». `public/script.js` pré-remplit donc sa
semaine suivante depuis le modèle, en **prévisionnel** (`🕓 prévu — envoi à la deadline`),
sans qu'aucun document n'existe en base. Cliquer « Enregistrer » les envoie tout de suite :
c'est une action explicite, exactement comme un staff qui envoie avant l'heure. La règle ne
porte que sur l'envoi **automatique**.

**Couverture.** 6 tests unitaires sur dates gelées (`shouldMaterializeTemplate`) + 6
d'intégration qui pilotent le cron via `app.locals.runManagerTemplateCron` (poignée exposée
sous la double garde du harnais — sans elle, tester la matérialisation demanderait
d'attendre un vendredi 13h). Mutations vérifiées : retirer la garde de deadline, ne plus
poser le marqueur, ou rematérialiser dans le `PUT` fait tomber un test chacun.

⚠️ **Limite connue** : le cas « avant la deadline » n'est PAS retestable au niveau
intégration — la deadline effective tombe toujours dans la semaine courante, donc aucune
valeur ne la garantit dans le futur quel que soit le jour d'exécution. Il est couvert à
l'unité, sur dates gelées.

## 9. Décisions complémentaires (2026-08-05)

Trois questions que §8 ouvrait sans les trancher, arrivées en conséquence directe de
« le directeur est un staff comme les autres ».

**9.1 — Le directeur est EXEMPTÉ de la deadline.** §8 le fait tomber sous les « mêmes
règles » que le staff, deadline comprise. Conséquence non voulue : s'il rate l'heure, il ne
peut plus déclarer **ses propres heures**, et il n'y a personne au-dessus de lui pour
rouvrir la saisie (`force_open_staff` est une action du patron). Décidé : exemption, via le
helper pur `dispoDeadlineWaived(settings, role, staffForceOpen)` — trois portes, dans
l'ordre : `force_open` global → réouverture nominative → rôle `directeur`.
**Portée volontairement étroite** : l'exemption ne lève **que** la deadline.
`staffDispoOpen` (ouverture par établissement) continue de s'appliquer au directeur comme à
tout le monde. Si le patron ferme la saisie sur **tous** les bars d'un directeur, celui-ci
est bloqué comme les autres — cas non rencontré, à trancher s'il se présente.

**9.2 — `staff.venues` est resynchronisé (R-06).** §8 fait passer le directeur par
`staffDispoOpen(settings, staffDoc.venues)`, or `venues` n'était jamais recalé sur
`users.assigned_establishments` : un directeur réaffecté ne pouvait **plus saisir aucune
dispo**, sans message qui l'explique. Helper `syncManagerStaffVenues(userId)`, appelé après
toute écriture de `assigned_establishments` ; il crée aussi le profil staff manquant.
⚠️ L'invariant n'est pas verrouillé — `PATCH /api/staff/:id` écrit `venues` dans l'autre
sens sans recaler `users` (cf. R-15 au backlog).

**9.3 — Périmètre de la file de validation (S-04).** Une dispo en attente n'a pas
d'établissement — c'est le modèle rétabli par §8, le bar est choisi **à la validation**. Le
seul rattachement disponible passe donc par les `venues` du **staff** qui l'envoie. Décidé :
un directeur ne voit par défaut que les dispos des staff de ses bars, avec une bascule
« Voir tout le staff » (`scope=all`) ouverte à tout directeur. **Ce n'est pas un
cloisonnement** : c'est le défaut d'affichage qui change, pas le droit d'accès.
Corollaire pour la **validation en masse** : le *lot* peut varier (mon staff / tout le
monde), mais la *cible* reste **un seul établissement** — « valider pour tous les bars »
n'existe pas et ne peut pas exister dans ce modèle.

## 8. Correction de trajectoire (2026-08-04) — la dispo n'est pas un shift

L'implémentation avait dérivé de la Phase 1 : au lieu d'écrire dans `availabilities`, elle
**créait directement des shifts** (`source:'manager_dispo'`, `from_template`) et les
auto-validait. Deux conséquences, remontées en revue :

- **Un objet à deux propriétaires.** Le cron quotidien réécrivait la semaine (`deleteMany`
  + réinsertion), donc toute correction, suppression ou « copier la semaine » faite par le
  patron sur un créneau du directeur était **annulée le lendemain matin**, sans trace. Une
  semaine vidée par le directeur revenait aussi, le garde-fou « override manuel » étant
  déduit d'un `countDocuments` qui vaut 0 quand il ne reste rien.
- **Un modèle faux.** Une semaine-type est une **indication de disponibilité**, pas un
  planning : se déclarer dispo toute la journée n'engage pas le patron à planifier la
  journée entière.

**Décidé** : le directeur repasse par le pipeline `availabilities` **standard** —
`POST /api/dispos`, mêmes règles (deadline, congés), et **validation par le patron** dans
la même file que le staff (`/api/dispos/pending` → `PATCH /api/dispos/:id/confirm`, qui
choisit l'établissement et crée le shift). Conséquences :

- plus aucun marqueur `source:'manager_dispo'` / `from_template` ni chemin parallèle ;
- la semaine-type devient une **commodité de saisie** : elle pré-remplit en `pending` les
  jours **encore vides** de la semaine suivante (création seule), sans jamais écraser une
  saisie manuelle ni une dispo déjà validée. ⏱️ **Précisé le 2026-08-10 (cf. §10)** : ce
  pré-remplissage a lieu **au déclenchement de la deadline**, plus jamais avant ;
- l'**établissement** n'est plus choisi par le directeur : c'est le patron qui le pose en
  validant, comme pour un staff ;
- **E-19 inchangé** (`manager_time_off` conservé, cf. §5.5) — les absences sont simplement
  jointes au filtre congés de `POST /api/dispos` et au pré-remplissage, et déclarer une
  absence retire les dispos déjà posées sur la période (jamais les shifts du patron).

Aucune migration : la version « shifts » n'a jamais tourné en prod.

## Décisions arrêtées (2026-07-30)

1. **Modèle A** — tous les directeurs deviennent de vrais staff (planifiables), population mixte normalisée.
2. **Paie : COMPTÉ** — les shifts du directeur comptent dans la masse salariale / coefficient, comme un staff (taux réglable dans la gestion staff). ⇒ **pas** d'exclusion `is_manager` du wage bill.
3. **Semaine-type récurrente : v2** — v1 = saisie semaine par semaine, ~~auto-validée~~.
   ⛔ **SUPERSÉDÉ par §8** : les dispos du directeur partent en `pending` et passent par la
   **validation du patron**, dans la même file que le staff. Rien n'est auto-validé.
4. **E-19** (`manager_time_off`) : **inchangé** en v1 (les absences directeur restent gérées via « Mes absences »). Migration éventuelle vers les congés staff = plus tard.
5. **Périmètre** : directeurs uniquement (le patron reste hors scope pour l'instant, même si « idem patron » a été évoqué).

## 1. Besoin exprimé

- Le directeur **note ses dispos lui-même**, façon « Mes absences » (côté son interface).
- ~~**Auto-validées** : pas de passage par la file « En attente » du patron.~~
  ⛔ **SUPERSÉDÉ par §8** : passage par la file « En attente », comme le staff.
- Affichées **comme celles d'un staff** et le directeur doit être **planifiable** (assignable à des shifts).
- **Dispos prédéfinies** : une **semaine-type récurrente**, modifiable pour une semaine atypique.
- Paie / coefficient : **à définir plus tard**.

## 2. La contrainte qui bloque (fait vérifié dans le code)

La population des directeurs est **mixte** selon le parcours de création :

| Parcours | `staff_id` |
|---|---|
| Compte créé **directement** en directeur (`POST /api/users`, `server.js:1124/1162` → `staff_id: null` pour tout rôle ≠ `staff`) | **null** — aucun profil staff |
| Staff **promu** directeur (`PATCH /api/users/:id/role`, `server.js:1223-1231` → ne touche PAS `staff_id`, le doc `staff` n'est pas supprimé) | **conservé** — profil staff intact |

Donc « le directeur a déjà un profil staff » est vrai **pour les directeurs promus depuis un staff**, faux pour ceux créés directement.

C'est une **incohérence du modèle** : E-19 (isolation via `manager_time_off`, `server.js:291` « comptes de gestion, pas de staff_id ») suppose « directeur ⇒ pas de `staff_id` » — ce qui n'est vrai que pour la 1ʳᵉ ligne. Un directeur promu est **déjà** un staff dans le pipeline (il a un doc `staff` et un `staff_id`), et pourrait donc déjà apparaître/être traité comme staff par endroits.

Or tout le pipeline **dispos → shifts → paie → recap → coefficient** est keyé sur `staff_id`.

**Conséquence : pour « planifiable comme un staff » de façon fiable, il faut GARANTIR que TOUS les directeurs ont un profil staff** — normaliser la population mixte (créer le profil manquant pour les directeurs créés directement, garder celui des promus).

## 3. Deux modèles possibles

### Modèle A — Profil staff pour le directeur *(seule voie pour « planifiable »)*
- À la création d'un compte directeur : créer aussi un doc `staff` et lier `users.staff_id`. **Migration** des directeurs existants (script).
- Le directeur devient un staff « normal » : barre staff, assignable, dispos via le pipeline `availabilities` standard.
- **Auto-validation** = ses dispos passent en `confirmed` directement (flag/traitement à la soumission).
- **Impacts** : il apparaît partout où le staff apparaît. Dès qu'il a des shifts pointés → recap mensuel + masse salariale + coefficient (⚠️ interagit avec E-23/E-24 qu'on vient de faire).
- **Redondance** : E-19 (`manager_time_off`) ferait doublon avec le flux congés staff — à décider si on migre/retire.
- **Risque** : reversal de E-19, effets de bord paie/recap, migration de données.

### Modèle B — Isolé + informatif *(mon backend actuel, déjà codé + testé)*
- Collection `manager_availability` : semaine-type + overrides (helper pur `resolveManagerAvailability`, 7 tests verts).
- Les dispos **s'affichent** sur le planning (overlay), auto-validées, mais le directeur **n'est PAS assignable ni compté**.
- Cohérent E-19, **zéro risque paie**. Mais **ne répond pas** à « planifiable ».

## 4. Points durs transverses

- **Semaine-type récurrente** : le pipeline staff `availabilities` est par `(staff_id, date)` — **pas** de notion de récurrence. Le Modèle A devrait l'**ajouter** (nouveau) ou se limiter à une saisie semaine par semaine. Le Modèle B l'a déjà.
- **Saisie « comme les absences »** : les absences directeur se saisissent via une modale sur **index.html** (`openManagerOffModal`), pas planning.html — et tu as confirmé « il n'a pas accès à la page planning ». Donc, quel que soit le modèle, la **saisie des dispos doit vivre sur index.html** (pas via l'écran staff).

## 5. Décisions à prendre

1. **Modèle A (planifiable) ou B (informatif)** ? — tu as dit « planifiable » → pointe **A**.
2. Si A — **paie** : les heures du directeur comptent dans la masse salariale / coefficient ? (« à définir plus tard » → défaut proposé : **non comptées** au départ, directeur exclu du wage bill).
3. Si A — **normaliser la population mixte** (cf. §2) : créer le profil staff **manquant** pour les directeurs créés directement (les promus l'ont déjà), + faire en sorte que `POST /api/users` crée aussi un profil staff pour tout nouveau directeur. Migration : auto au démarrage, ou script `npm run` manuel ?
4. **Semaine-type récurrente** : indispensable en v1 (le Modèle A doit l'ajouter au pipeline), ou v2 ?
5. **E-19** : on garde `manager_time_off` (absences) tel quel, ou on bascule aussi les absences vers le flux staff une fois le directeur devenu staff ?

## 6. Recommandation

Compte tenu de « planifiable » + « comme les autres staff », la cible est le **Modèle A** — d'autant plus que les directeurs **promus depuis un staff sont déjà des staff** (cf. §2), il ne reste qu'à normaliser les directeurs créés directement. Démarrée prudemment :
- directeur **exclu de la paie/coefficient** au départ (tant que §5.2 n'est pas tranché) ;
- **saisie des dispos via une section/modale sur index.html** (cohérent avec « comme les absences », pas d'accès planning) ;
- **semaine-type** portée dans le pipeline (sinon on perd la partie « prédéfinies ») ;
- le backend isolé E-22 (`manager_availability`, non committé) serait **abandonné**.

**Alternative pragmatique** : livrer d'abord le **Modèle B** (visible-only, déjà codé) pour de la valeur immédiate, puis basculer vers A si le besoin « planifiable » se confirme sur le terrain.

## 7. Impact sur le travail déjà fait

- Modèle A choisi → le backend `manager_availability` + ses 7 tests + les routes `/api/me/manager-availability*` et `/api/managers-availability` sont **jetés** (non committés, facile).
- Modèle B choisi → on garde le backend et on ajoute l'UI (saisie index.html + overlay planning).

## 6bis. Plan d'implémentation (Modèle A, retenu)

**Phase 0 — Normalisation (fondation).**
- `POST /api/users` : créer un directeur crée aussi un doc `staff` lié (`users.staff_id` renseigné), marqué `is_manager: true` (traçabilité, pas d'exclusion paie), `venues` = ses `assigned_establishments`.
- ~~Script `scripts/backfill-director-staff.js` : créer le profil staff manquant.~~
  ⛔ **SUPERSÉDÉ le 2026-08-08.** Sur une base existante, ce script **DUPLIQUE** : il ne
  regarde que `users.staff_id` et crée un profil neuf sinon, alors que la personne en a
  souvent déjà un (elle travaille en salle). Résultat : historique scindé et paie comptée
  deux fois. Utiliser **`npm run link-directors`**, qui rapproche du profil existant et ne
  crée rien. Depuis 2026-08-05, `ensureDirectorStaffProfile` couvre en plus le cas courant
  automatiquement, à la création ou à la modification du compte.

**Phase 1 — Saisie dispos directeur (index.html).**
- Section « Mes disponibilités » sur index.html (le directeur n'a pas accès à planning.html), écrit dans `availabilities` avec son `staff_id`, ~~statut `confirmed` d'office (auto-validé)~~ → overlay planning standard.
  ⛔ **SUPERSÉDÉ par §8** : statut **`pending`**, validé par le patron, qui choisit
  l'établissement et crée le shift.

**Phase 2 (v2) — Semaine-type récurrente** (helper `buildTemplateDispos`, collection `manager_dispo_templates`). Livrée, puis recadrée en pré-remplissage — cf. §8.

