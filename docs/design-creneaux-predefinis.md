# Créneaux prédéfinis — brouillon produit (rdv client)

*Ouvert le 2026-09-10 après rdv. **Pas encore cadré pour le code.** Objectif : atelier /
vrai plan le **2026-09-11**, en coexistence avec le système de dispos actuel.*

## Intention client

Remplacer progressivement le flux « le staff envoie sa disponibilité totale » par :

1. Le **patron** compose à l’avance (~**1 semaine**) une **grille de créneaux**
   (jour / horaires / groupe / établissement).
2. Le **staff** candidature **sur chaque créneau** (« je suis dispo sur ce poste »),
   sur le même modèle que les **Jokers ouverts** aujourd’hui.
3. Le **patron** assigne parmi les candidats.

## Contrainte non négociable (rdv)

**Garder le système de dispos actuel** tant que le nouveau n’est pas adopté.
Pas de big-bang : les deux coexistent (réglage / activation progressive à trancher).

## Ancrage technique actuel (piste)

| Élément | Où |
|--------|-----|
| Joker ouvert + candidatures | `joker_open`, `joker_candidates`, routes `joker-ouverts` / `joker-candidature` |
| UI staff « Je suis dispo » | `public/planning.js` (`renderOpenJokers*`) |
| Joker par groupe + couleurs | `joker_group`, `public/lib/joker-group-color.js` |
| Horizon / deadline dispos | `horizon_weeks`, `validation_horizon_weeks`, B2-a |

Piste par défaut à challenger en atelier : **réutiliser le pattern Joker ouvert en masse**
sur N+1 (éventuellement flag / type dédié) plutôt que réinventer une collection dès le
premier jet — à valider.

## Questions à trancher demain (atelier)

1. Créneaux N+1 = **Jokers ouverts en masse** ou **entité « offre »** dédiée ?
2. Composition de la grille : copie de semaine, templates, saisie manuelle ?
3. Coexistence Dispos libres + candidatures : les deux visibles ? mode par semaine /
   établissement ?
4. Deadline / rappels : calés sur dispos, ou fenêtre propre ?
5. Premier périmètre : **Castaniu only** vs option globale **off** par défaut ?

## Hors scope immédiat

- Pas d’annonce « Du neuf » tant que non déployé.
- Pas de code avant le plan d’implémentation issu de l’atelier.

## Lien backlog

Voir entrée **D-101** dans `docs/backlog.md`.

## Agenda demain (complément)

1. **Atelier** : trancher les 5 questions ci-dessus → vrai plan d’implémentation D-101.
2. **Lots Perf** (si capacité après atelier) : D-96 → D-99 (Tous établissements, filtre groupe, panel mean/median, sim rémunération par groupe).
3. **D-100** Validation hebdo Castaniu : rester en brouillon sauf cadrage explicite.
4. **Déploiement** de la maj déjà prête (Simulation, jokers couleurs, échanges date, observateur) : note client + Du neuf datés `2026-09-11` ; smoke Simulation / swaps si besoin ; **pas** de merge Castaniu sans accord.
