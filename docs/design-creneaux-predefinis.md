# Créneaux prédéfinis — design (D-101)

*Cadré 2026-09-10. Flag : `predefined_slots` (`CLIENT_PROFILE=castaniu` + `FEATURE_PREDEFINED_SLOTS=true`).*

## Intention

Le patron compose à l’avance (~N+1) une grille de créneaux ; le staff candidature comme sur les Jokers ouverts ; le patron assigne. **Coexistence** avec le flux Dispos actuel (pas de big-bang).

## Décisions figées v1

1. **Modèle** = Jokers ouverts en masse (`joker_open` / `joker_candidates` / assignation), marqueur `slot_offer: true` pour les distinguer des renforts ponctuels.
2. **Composition grille** : copie de semaine (outil existant) + action **« Proposer les créneaux de la semaine »** (ouvre tous les Jokers non pourvus de la semaine ciblée avec `slot_offer: true`).
3. **Coexistence** : dispos inchangées ; le flux n’apparaît / n’est activable que si `ClientFeatures.enabled('predefined_slots')`.
4. **Deadline** : même horizon publication / semaine cible ; pas de moteur de deadline autonome en v1.
5. **Périmètre** : Castaniu only.

## Hors v1

- Entité « offre » séparée, templates dédiés, deadline autonome, remplacement des dispos.
- Du neuf tant que non déployé chez le client.

## Lien backlog

Entrée **D-101** dans `docs/backlog.md`.
