# Templyo — ce qui change à la prochaine mise à jour

*Note à envoyer avant le déploiement. Rédigée pour être lue par le patron, pas par un
développeur. Version du 2026-08-28.*

> Les notes des mises à jour précédentes restent consultables dans l'historique du dépôt
> (`git log docs/note-client-mise-a-jour.md`).

---

Bonjour,

Cette mise à jour tourne autour d'une chose que vous nous aviez demandée : **empêcher qu'un
planning déjà envoyé à votre équipe soit modifié d'un geste involontaire sur téléphone**
(§1). Le reste suit — un en-tête qui ne perd plus ses boutons (§2), la semaine-type ouverte
à toute l'équipe (§3), le calendrier des congés enfin lisible (§4) — et l'application vous
dira désormais elle-même ce qui change à chaque mise à jour (§5).

**Une seule chose demande votre attention** : le §1 modifie un geste quotidien.

## 1. Un planning publié ne se modifie plus d'un doigt qui glisse

Jusqu'ici, sur téléphone et tablette, rien ne distinguait un planning en cours de
construction d'un planning **déjà reçu par votre équipe**. Un doigt qui glisse sur une carte
déplaçait un créneau ; une croix effleurée effaçait toute la journée d'une personne, sans
confirmation. Sur une semaine que vos employés consultent déjà, l'erreur est invisible pour
vous et bien réelle pour eux.

Désormais, sur une semaine publiée, **tous les gestes qui modifient le planning sont
verrouillés** : déplacer, redimensionner, créer, supprimer un créneau, et vider la journée
de quelqu'un. Un cadenas apparaît en haut de la journée.

**Rien n'est interdit — tout est rendu délibéré.** Pour corriger, vous touchez le cadenas :
vous passez en mode éditeur, et vous retrouvez la main sur tout. Le verrou se remet seul
quand vous changez de journée.

À savoir : le verrou ne concerne **que** les semaines publiées. Une semaine que vous êtes en
train de construire se manipule exactement comme avant.

## 2. L'en-tête d'une journée ne perd plus ses boutons sur téléphone

En posant le cadenas du §1, nous avons découvert un défaut qui existait déjà : sur un écran
de téléphone, l'en-tête d'une journée **rognait silencieusement ce qui dépassait** — dont la
croix de fermeture, et maintenant le cadenas. Des commandes disparaissaient sans que rien ne
l'indique.

Deux libellés ont été raccourcis : « Copier la semaine → » devient « Copier → », et le
rappel de semaine (« — Semaine en cours ») est retiré du bouton de publication, où il faisait
doublon avec la semaine déjà affichée juste au-dessus. Tout tient de nouveau à l'écran.

## 3. La semaine-type s'ouvre à toute votre équipe

Jusqu'ici, seuls vos directeurs pouvaient enregistrer leurs horaires habituels comme modèle.
**C'est désormais possible pour tout le monde.**

Le principe est inchangé : si une personne n'a **rien envoyé** au moment de la deadline, son
modèle part à sa place. Elle n'a rien à faire, vous n'avez personne à relancer.

Ce que ça change pour vous : **vous recevez plus de disponibilités à valider**, et moins de
semaines vides. Ces disponibilités passent par votre file habituelle, exactement comme si la
personne les avait saisies elle-même.

⚠️ **Rien ne contourne vos décisions.** Un modèle n'est **pas** envoyé si vous avez fermé la
saisie des disponibilités, ni si vous avez retiré à quelqu'un le droit d'en envoyer, ni si
son profil n'existe plus. Et un modèle ne crée jamais de créneau au planning : ce sont des
disponibilités, que vous validez ou non.

## 4. Le calendrier des congés se lit en liste

Le calendrier du mois affichait cinq cases orange qu'il fallait relier du regard pour
comprendre qu'une personne était absente du 3 au 7. Pire : sur les journées chargées, à
partir de la troisième personne, **les noms suivants disparaissaient sans rien indiquer** —
c'est-à-dire précisément les jours où l'on ouvre ce calendrier.

Il affiche maintenant, sous la grille, la **liste des périodes** : « Marie, lun. 3 → ven. 7
août, 5 j ». Sur téléphone, seule la liste s'affiche — la grille du mois y demandait de
faire défiler l'écran de côté pour atteindre la fin du mois.

La grille reste sur ordinateur : elle répond à « quelqu'un est-il absent le 14 ? » sans avoir
à lire.

## 5. « Du neuf » — l'application vous dit ce qui change

C'est la dernière fois que vous découvrez une mise à jour uniquement par cette note.

Un bouton **« Du neuf »** apparaît : dans votre menu de profil, et dans le bandeau du haut
pour votre équipe. Il ouvre la liste des évolutions, **regroupées par semaine**, avec pour
chacune ce qui change et **où le trouver**. Une pastille signale ce que vous n'avez pas
encore lu, et tout reste consultable ensuite — y compris après lecture.

**Chacun ne voit que ce qui le concerne.** Vos employés n'y liront pas les évolutions de
votre écran de planning, et vous n'y lirez pas les leurs.

Les deux dernières semaines s'affichent d'emblée ; un bouton en bas déplie les précédentes.

## 6. Petits ajustements

- Les pictogrammes ont été retirés des libellés de boutons (« Import taux », « Invitations en
  attente », « Sans dispo », « Congé »), qui restent identiques par ailleurs.

## Ce qui ne change pas

- **Vos données.** Aucune migration, aucun réglage à refaire, rien à ressaisir.
- **La page Performance** et le pointage ne bougent pas.
- **Le planning sur ordinateur** se manipule exactement comme avant : le verrou du §1 ne
  concerne que le tactile.
- **Les règles de disponibilités et de congés** sont inchangées ; seule la semaine-type
  s'ouvre à plus de monde (§3).

Bonne mise à jour,
