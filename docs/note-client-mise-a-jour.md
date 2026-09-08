# Templyo — ce qui change à la prochaine mise à jour

*Note à envoyer avant le déploiement. Rédigée pour être lue par le patron, pas par un
développeur. Version du 2026-09-08.*

> Les notes des mises à jour précédentes restent consultables dans l'historique du dépôt
> (`git log docs/note-client-mise-a-jour.md`).

---

Bonjour,

Cette mise à jour porte sur **la clôture de service** : vos équipes pointent désormais
début et fin avec un **code à 4 chiffres**, et ces heures alimentent automatiquement le
planning, le récap et la paie — comme avant, mais avec une preuve claire de ce qui a été
saisi.

## 1. Un code pour pointer le début et la fin de service

Sur la page **Pointage**, vous (ou le directeur) voyez un **code de clôture** qui change
toutes les 15 minutes et ne sert **qu'une fois**.

Le salarié ouvre son planning, tape sur son créneau du jour, et saisit le code que vous
lui dictez — **une fois à l'arrivée**, **une fois au départ**.

Ce qui est enregistré à ce moment-là (l'« origine ») **ne bouge plus**. Si vous devez
corriger ensuite (retard toléré, sortie anticipée…), vous ajustez l'heure **retenue** :
l'origine reste visible pour les litiges.

## 2. Les heures réelles suivent automatiquement

Dès que début **et** fin sont validés, les heures « réelles » du planning / récap / masse
salariale se mettent à jour (arrondies au quart d'heure, comme avant).

Tant que seul le début est pointé, rien ne mélange réel et planifié : on attend la fin.

## 3. Votre écran Pointage, simplifié pour le soir

Pour le patron et le directeur, Pointage montre surtout :

- le **code** du moment,
- la **clôture du jour** (navigation jour par jour, date en français),
- le bouton pour **ajouter quelqu'un qui n'était pas prévu**,
- le **CA** de la soirée.

L'ancienne grille de saisie manuelle heure par heure reste disponible pour le **compte
établissement** (tablette sur place).

## 4. Vous pouvez toujours corriger — même après le récap

Quand vous validez le récap de la semaine, les heures sont marquées comme validées.
**Vous (patron, directeur ou observateur) pouvez quand même ajuster** en cas de problème :
l'origine du code reste intacte, seule l'heure retenue (et donc le réel) change.
Le **responsable de soirée** ne peut plus ajuster une fois le récap validé.
L'**observateur** a les mêmes actions de clôture (manuel, ajuster, récap, CA, extra)
mais **sans accès au code OTP**. Sur le planning, il **ne voit pas** les boutons
**Dispos** ni **Échanges** (validation réservée au patron / directeur).

Depuis la page **Pointage**, dans **Clôture du jour**, l'onglet **Journal** montre
les mouvements du jour (qui a saisi, quand, par **code OTP** ou **saisie manuelle**).
Vous pouvez aussi **rechercher par nom** dans la liste des shifts ou du journal.

## 5. Personne non prévue

Le bouton **« Ajouter un service non planifié »** reste là : vous choisissez la personne
et ses heures ; le créneau apparaît dans la clôture du jour, déjà clôturé.

---

En résumé : **vous dictez un code, l'équipe pointe début et fin, les heures suivent pour
la paie**, et vous gardez la main pour corriger ou ajouter quelqu'un.

Bonne soirée,
L'équipe Templyo
