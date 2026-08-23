# Templyo — ce qui change à la prochaine mise à jour

*Note à envoyer avant le déploiement. Rédigée pour être lue par le patron, pas par un
développeur. Version du 2026-08-23.*

> Les notes des mises à jour précédentes restent consultables dans l'historique du dépôt
> (`git log docs/note-client-mise-a-jour.md`).

---

Bonjour,

Cette mise à jour **corrige le problème que vous nous avez signalé** (« certains staff ne
voient plus leur planning ») et simplifie au passage la page planning de votre équipe.

L'essentiel concerne **la vue de vos employés** (§1 à §3). Trois points vous concernent
directement, vous : l'**ouverture d'urgence** des disponibilités, qui se désactive
désormais seule chaque semaine (§5), le **journal des disponibilités**, qui devient
filtrable (§6), et les **congés validés**, qui retirent enfin les disponibilités de la
période (§7). Votre écran de planning et la page Performance ne bougent pas.

## 1. Corrigé : le planning invisible la nuit du dimanche au lundi

Le symptôme que vous nous aviez remonté : **entre minuit et 6 h du matin le lundi**, un
employé qui ouvrait son planning ne trouvait plus la semaine qui venait de commencer — ni
dans « Mon planning », ni dans l'onglet « À venir ». Elle réapparaissait toute seule à 6 h.
La panne tombait précisément à l'heure où l'équipe sort de service et consulte son
téléphone.

Ce **n'était pas** le changement d'heure été/hiver. C'étaient deux calculs de semaine qui,
pendant ces six heures, ne tombaient pas d'accord : la semaine neuve n'était dans aucune
des deux listes. C'est corrigé, et verrouillé par des tests qui balayent les 168 heures
d'une semaine, heure par heure.

## 2. L'onglet « À venir » disparaît — tout est dans « Mon planning »

Vos employés ne changent plus d'onglet pour voir la suite. La semaine en cours s'affiche en
haut, **les semaines suivantes s'empilent dessous**, séparées par un titre de semaine : il
suffit de faire défiler.

Seules les semaines **que vous avez publiées** apparaissent — inchangé. Un planning encore
en brouillon reste invisible, créneau par créneau.

L'onglet qui apparaissait était jusqu'ici le signal « il y a du nouveau ». Il est remplacé
par :

- une pastille **✨ Nouveau** sur le titre de la semaine fraîchement publiée, qui ne
  s'efface que lorsque l'employé l'a réellement fait défiler sous ses yeux ;
- la **notification de publication ouvre directement sur la bonne semaine**, y compris
  quand l'application était déjà ouverte sur le téléphone.

L'onglet **« Historique » ne bouge pas**.

## 3. La semaine de vos employés suit maintenant votre heure de pointage

⚠️ **C'est le seul changement qui peut vous surprendre.**

Dans les réglages des disponibilités, la ligne **« Fenêtre de saisie pointage — de X
jusqu'à Y le lendemain »**. L'heure de fin (**Y, 9 h par défaut**) ne servait jusqu'ici
qu'à une chose : jusqu'à quelle heure un responsable peut encore pointer le service de la
veille. Elle définit **désormais aussi le moment où le planning de vos employés bascule sur
la semaine suivante**.

Concrètement, avec le réglage par défaut : **le lundi matin jusqu'à 9 h**, vos employés
voient encore la semaine qui s'achève comme « semaine en cours » — auparavant elle
basculait à 6 h. La semaine neuve est juste en dessous, à portée de défilement. **Rien
n'est caché : seul l'ordre d'affichage change**, pendant trois heures par semaine.

Pourquoi ce raccordement : un responsable qui pointait le service du dimanche à 7 h du
matin ne voyait plus, dans son planning, la journée qu'il était en train de pointer — elle
était déjà passée dans l'Historique. Les deux notions de « quand la journée bascule » sont
maintenant une seule.

À savoir : ce réglage est **commun à tous vos établissements**. Et **votre écran à vous**
(le planning patron) n'est pas concerné — il reste calé sur la semaine calendaire.

## 4. Fiches du personnel plus lisibles sur téléphone

Les fenêtres d'ajout et de modification d'un membre du personnel s'affichent correctement
en mode portrait ; elles débordaient de l'écran sur certains téléphones.

## 5. L'ouverture d'urgence se désactive seule chaque semaine

⚠️ **Point à lire même si vous ne lisez rien d'autre.**

Dans les réglages des disponibilités, la case **« Ignorer deadline (urgence) »** permet de
laisser un retardataire envoyer ses disponibilités après l'heure limite. Jusqu'ici, elle
restait cochée jusqu'à ce que vous pensiez à la décocher. Une urgence ouverte un vendredi
soir levait donc la deadline **des semaines suivantes**, sans que rien ne le signale.

Elle vaut désormais **pour la semaine en cours de collecte, et pour elle seule** : au
changement de semaine, elle se décoche d'elle-même. La mention « Se décoche seule au
changement de semaine » apparaît sous la case.

⚠️ **Effet immédiat au moment de la mise à jour** : si cette case est cochée aujourd'hui,
elle sera **décochée** après le déploiement. Si vous aviez ouvert une urgence en cours,
recochez-la — elle repartira alors pour la semaine en cours.

Bénéfice de bord que vous ne verrez pas mais qui compte : les **rappels automatiques** de
disponibilités étaient eux aussi éteints tant qu'une urgence traînait. Ils ne le sont plus
que le temps de l'urgence réelle.

## 6. Le journal des disponibilités devient filtrable

Dans la fenêtre Disponibilités, l'onglet **Historique** listait tous les mouvements en
vrac. Il gagne :

- **trois filtres** — Saisies, Validations, Suppressions — avec le nombre de mouvements de
  chaque type. Utile pour la question qu'on se pose vraiment devant ce journal : « qu'est-ce
  qui a disparu, et pourquoi ? », sans avoir à deviner d'avance si c'est un congé, une
  absence ou une réouverture qui l'a retiré ;
- **un regroupement par journée**, pour que la lecture suive le fil des jours au lieu
  d'une liste plate.

Le filtre par nom que vous connaissez reste là, et se combine avec les trois autres.

## 7. Un congé validé retire enfin les disponibilités de la période

Jusqu'ici, valider un congé ne touchait **rien d'autre**. La personne restait affichée
comme disponible sur des jours où vous veniez pourtant de l'autoriser à ne pas venir, et
ses disponibilités continuaient de remonter dans votre file de validation. Il fallait
qu'elle renvoie ses disponibilités pour que le ménage se fasse.

Désormais, dès qu'un congé devient **validé** — que vous l'approuviez, ou qu'un employé le
**déclare** lui-même si c'est le mode que vous lui avez donné — ses disponibilités sur la
période sont retirées automatiquement. Elles disparaissent de votre file, et la
suppression est tracée dans l'onglet Historique (§6), sous « Suppressions ».

⚠️ **Ses créneaux déjà placés au planning ne sont PAS retirés.** C'est délibéré, et c'est
la même règle que pour l'archivage : l'application ne troue jamais un planning que votre
équipe a déjà reçu. À la place, elle vous le **dit** au moment où vous validez :
« ⚠️ 2 créneaux déjà planifiés laissés en place, à réattribuer ». À vous de décider qui
remplace — ce n'est pas une décision que le logiciel doit prendre seul.

---

## Ce qui ne change pas

- L'envoi et la validation des **disponibilités** au quotidien, et la deadline elle-même —
  seule l'**ouverture d'urgence** change de durée de vie (cf. §5).
- Le **pointage** et ses réglages (seul l'effet de l'heure de fin s'élargit, cf. §3).
- Vos **plannings, historiques et heures pointées** sont intégralement conservés.
- **Aucune action de votre part n'est requise.** Vos employés n'ont rien à réinstaller :
  l'application se met à jour d'elle-même à la prochaine ouverture.

Nous restons disponibles pour toute question, avant comme après.
