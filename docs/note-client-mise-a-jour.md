# Templyo — ce qui change à la prochaine mise à jour

*Note à envoyer avant le déploiement. Rédigée pour être lue par le patron, pas par un
développeur. Version du 2026-08-23.*

> Les notes des mises à jour précédentes restent consultables dans l'historique du dépôt
> (`git log docs/note-client-mise-a-jour.md`).

---

Bonjour,

Cette mise à jour **corrige le problème que vous nous avez signalé** (« certains staff ne
voient plus leur planning ») et simplifie au passage la page planning de votre équipe.

Elle ne touche **que la vue de vos employés**. Votre écran de planning, la page
Performance, les disponibilités et le pointage fonctionnent exactement comme avant.

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

---

## Ce qui ne change pas

- L'envoi et la validation des **disponibilités**, la deadline et les rappels.
- Le **pointage** et ses réglages (seul l'effet de l'heure de fin s'élargit, cf. §3).
- Vos **plannings, historiques et heures pointées** sont intégralement conservés.
- **Aucune action de votre part n'est requise.** Vos employés n'ont rien à réinstaller :
  l'application se met à jour d'elle-même à la prochaine ouverture.

Nous restons disponibles pour toute question, avant comme après.
